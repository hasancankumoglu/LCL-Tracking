import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import type { BookingInput, LookupFieldType } from '@shared/types'
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS, LOOKUP_FIELD_TYPES } from '@shared/types'
import SearchableSelect from '../components/SearchableSelect'

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
  blNumber: null,
  eta: null,
  etd: null,
  blStatus: null,
  freeTimeEnd: null,
  lastCarrierSyncAt: null
}

const emptyLookupOptions: Record<LookupFieldType, string[]> = {
  category: [],
  destination: [],
  line: [],
  pol: []
}

export default function BookingFormPage(): React.JSX.Element {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form, setForm] = useState<BookingInput>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lookupOptions, setLookupOptions] =
    useState<Record<LookupFieldType, string[]>>(emptyLookupOptions)

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
    if (!id) return
    window.api.bookings.get(Number(id)).then((booking) => {
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
          blNumber: booking.blNumber,
          eta: booking.eta,
          etd: booking.etd,
          blStatus: booking.blStatus,
          freeTimeEnd: booking.freeTimeEnd,
          lastCarrierSyncAt: booking.lastCarrierSyncAt
        })
      }
    })
  }, [id])

  function update<K extends keyof BookingInput>(key: K, value: BookingInput[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)

    const bookingNo = form.bookingNo.trim()
    if (!bookingNo) {
      setError('Booking numarası zorunludur.')
      return
    }

    const missingFields: string[] = []
    if (!form.vesselDeparture) missingFields.push('Vessel Departure')
    if (!form.declarationCutOff) missingFields.push('Declaration Cut Off')
    if (!form.siCutOff) missingFields.push('SI Cut Off')
    if (!(form.destination ?? '').trim()) missingFields.push('Destination')
    if (!(form.pol ?? '').trim()) missingFields.push('POL')
    if (missingFields.length > 0) {
      setError(`Şu alanlar zorunludur: ${missingFields.join(', ')}.`)
      return
    }

    const dateIssues: string[] = []
    if (
      form.vesselDeparture &&
      form.declarationCutOff &&
      form.declarationCutOff > form.vesselDeparture
    ) {
      dateIssues.push('Declaration Cut Off tarihi, Vessel Departure tarihinden sonra.')
    }
    if (form.vesselDeparture && form.siCutOff && form.siCutOff > form.vesselDeparture) {
      dateIssues.push('SI Cut Off tarihi, Vessel Departure tarihinden sonra.')
    }
    if (dateIssues.length > 0) {
      const proceed = window.confirm(
        `Uyarı: Tarihlerde tutarsızlık tespit edildi:\n- ${dateIssues.join('\n- ')}\n\nBu, kapanış tarihinin gemi kalkışından sonraya yazıldığı anlamına gelebilir (olası veri girişi hatası). Yine de kaydetmek istiyor musunuz?`
      )
      if (!proceed) return
    }

    setSaving(true)
    try {
      const existing = await window.api.bookings.getByNo(bookingNo)
      if (existing && existing.id !== Number(id)) {
        setError('Bu booking numarası zaten kayıtlı.')
        return
      }

      if (isEdit) {
        const updated = await window.api.bookings.update(Number(id), { ...form, bookingNo })
        navigate(`/bookings/${updated.id}`)
      } else {
        const created = await window.api.bookings.create({ ...form, bookingNo })
        navigate(`/bookings/${created.id}`)
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('UNIQUE')
          ? 'Bu booking numarası zaten kayıtlı.'
          : 'Kaydedilirken bir hata oluştu.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/bookings">Bookingler</Link> / {isEdit ? 'Düzenle' : 'Yeni Booking'}
      </div>
      <div className="page-title">
        <h1>{isEdit ? 'Booking Düzenle' : 'Yeni Booking'}</h1>
      </div>

      <form className="surface" style={{ padding: 20 }} onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Booking No *</label>
            <input
              className="text-input"
              value={form.bookingNo}
              onChange={(e) => update('bookingNo', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Kategori</label>
            <SearchableSelect
              value={form.category ?? ''}
              onChange={(v) => update('category', v)}
              options={lookupOptions.category}
              onAddOption={(v) => handleAddLookupOption('category', v)}
              placeholder="ör. Mundra, Bandar Abbas"
            />
          </div>
          <div className="form-field">
            <label>Destination *</label>
            <SearchableSelect
              value={form.destination ?? ''}
              onChange={(v) => update('destination', v)}
              options={lookupOptions.destination}
              onAddOption={(v) => handleAddLookupOption('destination', v)}
              required
            />
          </div>
          <div className="form-field">
            <label>Vessel Departure *</label>
            <input
              className="date-input"
              type="date"
              value={form.vesselDeparture ?? ''}
              onChange={(e) => update('vesselDeparture', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Declaration Cut Off *</label>
            <input
              className="date-input"
              type="date"
              value={form.declarationCutOff ?? ''}
              onChange={(e) => update('declarationCutOff', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>SI Cut Off *</label>
            <input
              className="date-input"
              type="date"
              value={form.siCutOff ?? ''}
              onChange={(e) => update('siCutOff', e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Line</label>
            <SearchableSelect
              value={form.line ?? ''}
              onChange={(v) => update('line', v)}
              options={lookupOptions.line}
              onAddOption={(v) => handleAddLookupOption('line', v)}
            />
          </div>
          <div className="form-field">
            <label>POL *</label>
            <SearchableSelect
              value={form.pol ?? ''}
              onChange={(v) => update('pol', v)}
              options={lookupOptions.pol}
              onAddOption={(v) => handleAddLookupOption('pol', v)}
              required
            />
          </div>
          <div className="form-field">
            <label>Statü *</label>
            <select
              className="select-input"
              value={form.status}
              onChange={(e) => update('status', e.target.value as BookingInput['status'])}
            >
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BOOKING_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field full">
            <label>Durum / Not</label>
            <textarea
              className="textarea-input"
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => navigate(isEdit ? `/bookings/${id}` : '/bookings')}
          >
            İptal
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}
