import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  BookingWithStats,
  UnassignedVehicle,
  UnassignedVehicleInput,
  UnassignedVehicleSelection,
  ContainerType
} from '@shared/types'
import { CONTAINER_TYPES } from '@shared/types'
import { getErrorMessage } from '../lib/format'
import { useGlobalLoading } from '../lib/loadingOverlay'
import { useAuth } from '../auth/AuthContext'
import { BookingForm } from './BookingFormPage'

function normalizeToContainerType(raw: string | null): ContainerType {
  const value = (raw ?? '').trim().toUpperCase()
  return (CONTAINER_TYPES as string[]).includes(value)
    ? (value as ContainerType)
    : CONTAINER_TYPES[0]
}

interface RowState {
  bookingNoInput: string
  containerNo: string
  type: ContainerType
}

const emptyNewVehicleForm = {
  truckPlate: '',
  driverPhone: '',
  location: '',
  agent: '',
  sealNo: '',
  notes: '',
  sourceBookingRef: '',
  containerNo: '',
  type: CONTAINER_TYPES[0] as ContainerType
}

type NewVehicleForm = typeof emptyNewVehicleForm

/**
 * Excel içe aktarımında booking veya konteyner numarası net eşleşmeyen (ör.
 * Containers.xlsx'teki "AFGAN" sekmesi) araç kayıtlarının bekleme listesi.
 * Kullanıcı her satır için bir booking seçip "Ata" ile gerçek bir konteyner
 * kaydı oluşturur - atandıktan sonra kayıt ilgili booking'in altında normal
 * bir konteyner olarak görünür ve bu listeden kalkar.
 */
export default function UnassignedVehiclesPage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [vehicles, setVehicles] = useState<UnassignedVehicle[]>([])
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)
  const [rowState, setRowState] = useState<Record<number, RowState>>({})
  const [assigningId, setAssigningId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newVehicle, setNewVehicle] = useState<NewVehicleForm>(emptyNewVehicleForm)
  const [creating, setCreating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bookingVehicles, setBookingVehicles] = useState<UnassignedVehicleSelection[] | null>(null)
  const canCreateBooking =
    hasPermission('bookings.manage') && hasPermission('unassigned_vehicles.manage')

  async function refresh(): Promise<void> {
    setLoading(true)
    const [v, b] = await Promise.all([
      window.api.unassignedVehicles.list(),
      window.api.bookings.list()
    ])
    setVehicles(v)
    setSelectedIds((prev) => prev.filter((id) => v.some((vehicle) => vehicle.id === id)))
    setBookings(b)
    setRowState((prev) => {
      const next: Record<number, RowState> = {}
      for (const item of v) {
        next[item.id] = prev[item.id] ?? {
          bookingNoInput: item.sourceBookingRef ?? '',
          containerNo: item.containerNo ?? '',
          type: normalizeToContainerType(item.type)
        }
      }
      return next
    })
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  function updateRow<K extends keyof RowState>(id: number, key: K, value: RowState[K]): void {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  function openBookingModal(): void {
    setBookingVehicles(
      vehicles
        .filter((vehicle) => selectedIds.includes(vehicle.id))
        .map((vehicle) => ({
          id: vehicle.id,
          containerNo: rowState[vehicle.id].containerNo.trim() || null,
          type: rowState[vehicle.id].type
        }))
    )
  }

  async function handleAssign(vehicle: UnassignedVehicle): Promise<void> {
    const state = rowState[vehicle.id]
    if (!state) return
    const bookingNo = state.bookingNoInput.trim()
    const booking = bookings.find((b) => b.bookingNo.toLowerCase() === bookingNo.toLowerCase())
    if (!booking) {
      window.alert(t('unassignedVehicles.bookingNotFound', { bookingNo }))
      return
    }
    setAssigningId(vehicle.id)
    try {
      await window.api.unassignedVehicles.assign(vehicle.id, {
        bookingId: booking.id,
        containerNo: state.containerNo.trim() || null,
        type: state.type
      })
      setMessage(
        t('unassignedVehicles.assignedMessage', {
          name: vehicle.truckPlate ?? t('unassignedVehicles.defaultRecordName'),
          bookingNo: booking.bookingNo
        })
      )
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('unassignedVehicles.assignErrorGeneric')))
    } finally {
      setAssigningId(null)
    }
  }

  async function handleDelete(id: number): Promise<void> {
    const confirmed = window.confirm(t('unassignedVehicles.confirmDelete'))
    if (!confirmed) return
    await window.api.unassignedVehicles.remove(id)
    await refresh()
  }

  function updateNewVehicle<K extends keyof NewVehicleForm>(
    key: K,
    value: NewVehicleForm[K]
  ): void {
    setNewVehicle((prev) => ({ ...prev, [key]: value }))
  }

  async function handleCreate(): Promise<void> {
    const truckPlate = newVehicle.truckPlate.trim()
    if (!truckPlate) {
      window.alert(t('unassignedVehicles.truckPlateRequiredAlert'))
      return
    }
    setCreating(true)
    try {
      const input: UnassignedVehicleInput = {
        truckPlate,
        driverPhone: newVehicle.driverPhone.trim() || null,
        location: newVehicle.location.trim() || null,
        agent: newVehicle.agent.trim() || null,
        sealNo: newVehicle.sealNo.trim() || null,
        notes: newVehicle.notes.trim() || null,
        sourceBookingRef: newVehicle.sourceBookingRef.trim() || null,
        containerNo: newVehicle.containerNo.trim() || null,
        type: newVehicle.type,
        sourceSheet: 'Manuel',
        sourceRow: null
      }
      await window.api.unassignedVehicles.create(input)
      setNewVehicle(emptyNewVehicleForm)
      setShowNewForm(false)
      setMessage(t('unassignedVehicles.recordAdded'))
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('unassignedVehicles.createErrorGeneric')))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="page-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>{t('nav.unassignedVehicles')}</h1>
        <button type="button" className="btn small" onClick={() => setShowNewForm((prev) => !prev)}>
          {showNewForm ? t('common.cancel') : t('unassignedVehicles.addButton')}
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>
        {t('unassignedVehicles.explainer')}
      </div>

      {canCreateBooking && selectedIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span>{t('unassignedVehicles.selectedCount', { count: selectedIds.length })}</span>
          <button
            type="button"
            className="btn"
            onClick={openBookingModal}
            disabled={loading || assigningId !== null}
          >
            {t('unassignedVehicles.linkNewBooking')}
          </button>
        </div>
      )}

      {showNewForm && (
        <div
          className="surface"
          style={{
            padding: 16,
            marginBottom: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10
            }}
          >
            <input
              className="text-input"
              placeholder={t('unassignedVehicles.truckPlateRequired')}
              value={newVehicle.truckPlate}
              onChange={(e) => updateNewVehicle('truckPlate', e.target.value)}
            />
            <input
              className="text-input"
              placeholder={t('unassignedVehicles.phone')}
              value={newVehicle.driverPhone}
              onChange={(e) => updateNewVehicle('driverPhone', e.target.value)}
            />
            <input
              className="text-input"
              placeholder={t('unassignedVehicles.location')}
              value={newVehicle.location}
              onChange={(e) => updateNewVehicle('location', e.target.value)}
            />
            <input
              className="text-input"
              placeholder={t('unassignedVehicles.agent')}
              value={newVehicle.agent}
              onChange={(e) => updateNewVehicle('agent', e.target.value)}
            />
            <input
              className="text-input"
              placeholder={t('unassignedVehicles.seal')}
              value={newVehicle.sealNo}
              onChange={(e) => updateNewVehicle('sealNo', e.target.value)}
            />
            <input
              className="text-input"
              placeholder={t('unassignedVehicles.sourceRef')}
              value={newVehicle.sourceBookingRef}
              onChange={(e) => updateNewVehicle('sourceBookingRef', e.target.value)}
            />
            <input
              className="text-input"
              placeholder={t('unassignedVehicles.containerNo')}
              value={newVehicle.containerNo}
              onChange={(e) => updateNewVehicle('containerNo', e.target.value)}
            />
            <select
              className="select-input"
              value={newVehicle.type}
              onChange={(e) => updateNewVehicle('type', e.target.value as ContainerType)}
            >
              {CONTAINER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <input
            className="text-input"
            placeholder={t('unassignedVehicles.note')}
            value={newVehicle.notes}
            onChange={(e) => updateNewVehicle('notes', e.target.value)}
          />
          <div>
            <button type="button" className="btn small" onClick={handleCreate} disabled={creating}>
              {creating ? t('unassignedVehicles.adding') : t('common.save')}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="surface" style={{ padding: 12, marginBottom: 14, fontSize: 13 }}>
          {message}
        </div>
      )}

      <datalist id="unassigned-vehicles-booking-options">
        {bookings.map((b) => (
          <option key={b.id} value={b.bookingNo} />
        ))}
      </datalist>

      <div className="surface table-scroll">
        {loading ? null : vehicles.length === 0 ? (
          <div className="empty-state">{t('unassignedVehicles.emptyList')}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {canCreateBooking && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t('common.selectAll')}
                      checked={vehicles.length > 0 && selectedIds.length === vehicles.length}
                      ref={(element) => {
                        if (element) {
                          element.indeterminate =
                            selectedIds.length > 0 && selectedIds.length < vehicles.length
                        }
                      }}
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? vehicles.map((vehicle) => vehicle.id) : []
                        )
                      }
                    />
                  </th>
                )}
                <th>{t('unassignedVehicles.truckPlateRequired').replace(' *', '')}</th>
                <th>{t('unassignedVehicles.phone')}</th>
                <th>{t('unassignedVehicles.location')}</th>
                <th>{t('unassignedVehicles.agent')}</th>
                <th>{t('unassignedVehicles.seal')}</th>
                <th>{t('unassignedVehicles.note')}</th>
                <th>{t('unassignedVehicles.sourceRef')}</th>
                <th>{t('bookings.bookingColumn')}</th>
                <th>{t('unassignedVehicles.containerNo')}</th>
                <th>{t('reports.type')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const state = rowState[v.id]
                if (!state) return null
                return (
                  <tr key={v.id}>
                    {canCreateBooking && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={t('unassignedVehicles.selectVehicle', {
                            name: v.truckPlate ?? v.id
                          })}
                          checked={selectedIds.includes(v.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id)
                            )
                          }
                        />
                      </td>
                    )}
                    <td>{v.truckPlate ?? '-'}</td>
                    <td>{v.driverPhone ?? '-'}</td>
                    <td>{v.location ?? '-'}</td>
                    <td>{v.agent ?? '-'}</td>
                    <td>{v.sealNo ?? '-'}</td>
                    <td>{v.notes ?? '-'}</td>
                    <td>{v.sourceBookingRef ?? '-'}</td>
                    <td>
                      <input
                        className="text-input"
                        list="unassigned-vehicles-booking-options"
                        placeholder={t('unassignedVehicles.bookingNoPlaceholder')}
                        value={state.bookingNoInput}
                        onChange={(e) => updateRow(v.id, 'bookingNoInput', e.target.value)}
                        style={{ minWidth: 140 }}
                      />
                    </td>
                    <td>
                      <input
                        className="text-input"
                        placeholder={t('unassignedVehicles.containerNoPlaceholder')}
                        value={state.containerNo}
                        onChange={(e) => updateRow(v.id, 'containerNo', e.target.value)}
                        style={{ minWidth: 120 }}
                      />
                    </td>
                    <td>
                      <select
                        className="select-input"
                        value={state.type}
                        onChange={(e) => updateRow(v.id, 'type', e.target.value as ContainerType)}
                      >
                        {CONTAINER_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn small"
                          onClick={() => handleAssign(v)}
                          disabled={assigningId === v.id}
                        >
                          {assigningId === v.id
                            ? t('unassignedVehicles.assigning')
                            : t('unassignedVehicles.assignButton')}
                        </button>
                        <button className="btn secondary small" onClick={() => handleDelete(v.id)}>
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {bookingVehicles && (
        <div className="modal-overlay">
          <div
            className="modal-panel modal-panel--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-booking-modal-title"
          >
            <h2 id="new-booking-modal-title">{t('bookingForm.newBookingTitle')}</h2>
            <p style={{ marginBottom: 14 }}>
              {t('unassignedVehicles.newBookingHint', { count: bookingVehicles.length })}
            </p>
            <BookingForm
              vehicles={bookingVehicles}
              onCancel={() => setBookingVehicles(null)}
              onSaved={(booking) => {
                setBookingVehicles(null)
                navigate(`/bookings/${booking.id}`)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
