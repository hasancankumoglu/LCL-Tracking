import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  Booking,
  BookingInput,
  LookupFieldType,
  CustomerDirectoryEntry,
  UnassignedVehicleSelection
} from '@shared/types'
import { BOOKING_STATUSES, LOOKUP_FIELD_TYPES } from '@shared/types'
import SearchableSelect from '../components/SearchableSelect'
import { getErrorMessage } from '../lib/format'

const emptyForm: BookingInput = {
  bookingNo: '',
  vesselDeparture: '',
  declarationCutOff: '',
  siCutOff: '',
  category: '',
  destination: '',
  line: '',
  pol: '',
  status: 'YUKLENMEDI',
  archived: false,
  notes: '',
  unit: null,
  blNumber: null,
  eta: null,
  etd: null,
  blStatus: null,
  freeTimeEnd: null,
  lastCarrierSyncAt: null,
  customerId: null
}

const emptyLookupOptions: Record<LookupFieldType, string[]> = {
  category: [],
  destination: [],
  line: [],
  pol: []
}

export default function BookingFormPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  return (
    <div>
      <div className="breadcrumb">
        <Link to="/bookings">{t('nav.bookings')}</Link> /{' '}
        {isEdit ? t('bookingForm.editBreadcrumb') : t('bookingForm.newBookingTitle')}
      </div>
      <div className="page-title">
        <h1>{isEdit ? t('bookingForm.editTitle') : t('bookingForm.newBookingTitle')}</h1>
      </div>
      <BookingForm
        bookingId={id ? Number(id) : undefined}
        onSaved={(booking) => navigate(`/bookings/${booking.id}`)}
        onCancel={() => navigate(isEdit ? `/bookings/${id}` : '/bookings')}
      />
    </div>
  )
}

interface BookingFormProps {
  bookingId?: number
  vehicles?: UnassignedVehicleSelection[]
  onSaved: (booking: Booking) => void
  onCancel: () => void
}

export function BookingForm({
  bookingId,
  vehicles,
  onSaved,
  onCancel
}: BookingFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const selectedVehicleCount = vehicles?.length ?? 0
  const [form, setForm] = useState<BookingInput>(() => ({
    ...emptyForm,
    unit: selectedVehicleCount > 0 ? selectedVehicleCount : null
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lookupOptions, setLookupOptions] =
    useState<Record<LookupFieldType, string[]>>(emptyLookupOptions)
  const [existingContainerCount, setExistingContainerCount] = useState(0)
  const [customers, setCustomers] = useState<CustomerDirectoryEntry[]>([])

  useEffect(() => {
    window.api.customers.listDirectory().then(setCustomers)
  }, [])

  useEffect(() => {
    Promise.all(LOOKUP_FIELD_TYPES.map((fieldType) => window.api.lookups.list(fieldType))).then(
      (results) => {
        setLookupOptions(
          Object.fromEntries(
            LOOKUP_FIELD_TYPES.map((fieldType, index) => [fieldType, results[index]])
          ) as Record<LookupFieldType, string[]>
        )
      }
    )
  }, [])

  async function handleAddLookupOption(fieldType: LookupFieldType, value: string): Promise<void> {
    const updated = await window.api.lookups.add(fieldType, value)
    setLookupOptions((prev) => ({ ...prev, [fieldType]: updated }))
  }

  useEffect(() => {
    if (bookingId === undefined) return
    window.api.containers.listByBooking(bookingId).then((list) => {
      setExistingContainerCount(list.length)
    })
    window.api.bookings.get(bookingId).then((booking) => {
      if (booking) {
        setForm({
          bookingNo: booking.bookingNo,
          vesselDeparture: booking.vesselDeparture ?? '',
          declarationCutOff: booking.declarationCutOff ?? '',
          siCutOff: booking.siCutOff ?? '',
          category: booking.category ?? '',
          destination: booking.destination ?? '',
          line: booking.line ?? '',
          pol: booking.pol ?? '',
          status: booking.status,
          archived: booking.archived,
          notes: booking.notes ?? '',
          unit: booking.unit,
          blNumber: booking.blNumber,
          eta: booking.eta,
          etd: booking.etd,
          blStatus: booking.blStatus,
          freeTimeEnd: booking.freeTimeEnd,
          lastCarrierSyncAt: booking.lastCarrierSyncAt,
          customerId: booking.customerId
        })
      }
    })
  }, [bookingId])

  function update<K extends keyof BookingInput>(key: K, value: BookingInput[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)

    const bookingNo = form.bookingNo.trim()
    if (!bookingNo) {
      setError(t('bookingForm.bookingNoRequiredError'))
      return
    }

    const missingFields: string[] = []
    if (!form.vesselDeparture) missingFields.push(t('reports.vesselDeparture'))
    if (!form.declarationCutOff) missingFields.push(t('reports.declarationCutOff'))
    if (!form.siCutOff) missingFields.push(t('reports.siCutOff'))
    if (!(form.destination ?? '').trim()) missingFields.push(t('reports.destination'))
    if (!(form.pol ?? '').trim()) missingFields.push(t('reports.pol'))
    if (missingFields.length > 0) {
      setError(t('containers.requiredFieldsMessage', { fields: missingFields.join(', ') }))
      return
    }

    if (form.unit != null && form.unit < existingContainerCount) {
      setError(t('bookingForm.unitLessThanContainers', { count: existingContainerCount }))
      return
    }
    if (selectedVehicleCount > 0 && (form.unit ?? 0) < selectedVehicleCount) {
      setError(t('unassignedVehicles.unitTooSmall', { count: selectedVehicleCount }))
      return
    }

    const dateIssues: string[] = []
    if (
      form.vesselDeparture &&
      form.declarationCutOff &&
      form.declarationCutOff > form.vesselDeparture
    ) {
      dateIssues.push(t('bookingForm.declarationAfterDeparture'))
    }
    if (form.vesselDeparture && form.siCutOff && form.siCutOff > form.vesselDeparture) {
      dateIssues.push(t('bookingForm.siAfterDeparture'))
    }
    if (dateIssues.length > 0) {
      const proceed = window.confirm(
        t('bookingForm.dateWarningConfirm', { issues: dateIssues.join('\n- ') })
      )
      if (!proceed) return
    }

    setSaving(true)
    try {
      const existing = await window.api.bookings.getByNo(bookingNo)
      if (existing && existing.id !== bookingId) {
        setError(t('bookingForm.duplicateBookingNo'))
        return
      }

      if (bookingId !== undefined) {
        const updated = await window.api.bookings.update(bookingId, { ...form, bookingNo })
        onSaved(updated)
      } else {
        const created = vehicles
          ? await window.api.bookings.createWithVehicles({ ...form, bookingNo }, vehicles)
          : await window.api.bookings.create({ ...form, bookingNo })
        onSaved(created)
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('UNIQUE')
          ? t('bookingForm.duplicateBookingNo')
          : getErrorMessage(err, t('bookingForm.saveErrorGeneric'))
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="surface" style={{ padding: 20 }} onSubmit={handleSubmit}>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form-grid">
          <div className="form-field">
            <label>{t('bookingForm.bookingNoLabel')} *</label>
            <input
              className="text-input"
              value={form.bookingNo}
              onChange={(e) => update('bookingNo', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('bookings.category')}</label>
            <SearchableSelect
              value={form.category ?? ''}
              onChange={(v) => update('category', v)}
              options={lookupOptions.category}
              onAddOption={(v) => handleAddLookupOption('category', v)}
              placeholder={t('bookingForm.categoryPlaceholder')}
            />
          </div>
          <div className="form-field">
            <label>{t('reports.destination')} *</label>
            <SearchableSelect
              value={form.destination ?? ''}
              onChange={(v) => update('destination', v)}
              options={lookupOptions.destination}
              onAddOption={(v) => handleAddLookupOption('destination', v)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('reports.vesselDeparture')} *</label>
            <input
              className="date-input"
              type="date"
              value={form.vesselDeparture ?? ''}
              onChange={(e) => update('vesselDeparture', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('reports.declarationCutOff')} *</label>
            <input
              className="date-input"
              type="date"
              value={form.declarationCutOff ?? ''}
              onChange={(e) => update('declarationCutOff', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('reports.siCutOff')} *</label>
            <input
              className="date-input"
              type="date"
              value={form.siCutOff ?? ''}
              onChange={(e) => update('siCutOff', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('reports.line')}</label>
            <SearchableSelect
              value={form.line ?? ''}
              onChange={(v) => update('line', v)}
              options={lookupOptions.line}
              onAddOption={(v) => handleAddLookupOption('line', v)}
            />
          </div>
          <div className="form-field">
            <label>{t('reports.pol')} *</label>
            <SearchableSelect
              value={form.pol ?? ''}
              onChange={(v) => update('pol', v)}
              options={lookupOptions.pol}
              onAddOption={(v) => handleAddLookupOption('pol', v)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('bookings.unit')}</label>
            <input
              className="text-input"
              type="number"
              min={selectedVehicleCount}
              step={1}
              inputMode="numeric"
              value={form.unit ?? ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '')
                update('unit', digits === '' ? null : Number(digits))
              }}
              placeholder={t('bookingForm.unitPlaceholder')}
            />
          </div>
          <div className="form-field">
            <label>{t('bookings.statusColumn')} *</label>
            <select
              className="select-input"
              value={form.status}
              onChange={(e) => update('status', e.target.value as BookingInput['status'])}
            >
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`enums.bookingStatus.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field full">
            <label>{t('containers.statusNote')}</label>
            <textarea
              className="textarea-input"
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>{t('bookingForm.customerLabel')}</label>
            <select
              className="select-input"
              value={form.customerId ?? ''}
              onChange={(e) => update('customerId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('bookingForm.customerNone')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>
            {t('common.dismiss')}
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? t('auth.saving') : t('common.save')}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
