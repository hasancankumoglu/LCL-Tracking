import { useEffect, useState } from 'react'
import type {
  BookingWithStats,
  UnassignedVehicle,
  UnassignedVehicleInput,
  ContainerType
} from '@shared/types'
import { CONTAINER_TYPES } from '@shared/types'

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
  const [vehicles, setVehicles] = useState<UnassignedVehicle[]>([])
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [rowState, setRowState] = useState<Record<number, RowState>>({})
  const [assigningId, setAssigningId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newVehicle, setNewVehicle] = useState<NewVehicleForm>(emptyNewVehicleForm)
  const [creating, setCreating] = useState(false)

  async function refresh(): Promise<void> {
    setLoading(true)
    const [v, b] = await Promise.all([
      window.api.unassignedVehicles.list(),
      window.api.bookings.list()
    ])
    setVehicles(v)
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

  async function handleAssign(vehicle: UnassignedVehicle): Promise<void> {
    const state = rowState[vehicle.id]
    if (!state) return
    const bookingNo = state.bookingNoInput.trim()
    const booking = bookings.find((b) => b.bookingNo.toLowerCase() === bookingNo.toLowerCase())
    if (!booking) {
      window.alert(
        `"${bookingNo}" numaralı booking bulunamadı. Lütfen listeden geçerli bir booking seçin.`
      )
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
        `"${vehicle.truckPlate ?? 'Kayıt'}" artık "${booking.bookingNo}" booking'inin konteyner listesinde görünüyor.`
      )
      await refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Atama sırasında bir hata oluştu.')
    } finally {
      setAssigningId(null)
    }
  }

  async function handleDelete(id: number): Promise<void> {
    const confirmed = window.confirm('Bu kaydı silmek istediğinize emin misiniz?')
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
      window.alert('Lütfen en az çekici plakasını girin.')
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
      setMessage('Yeni kayıt eklendi.')
      await refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Kayıt eklenirken bir hata oluştu.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="page-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Atanmayan Araçlar</h1>
        <button type="button" className="btn small" onClick={() => setShowNewForm((prev) => !prev)}>
          {showNewForm ? 'Vazgeç' : '+ Yeni Ekle'}
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 14 }}>
        Excel içe aktarımında booking veya konteyner numarası net belli olmayan araç kayıtları
        burada listelenir. Her kayıt için bir booking seçip &quot;Ata&quot; butonuna basarak ilgili
        booking&apos;e konteyner olarak ekleyebilirsiniz.
      </div>

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
              placeholder="Çekici Plakası *"
              value={newVehicle.truckPlate}
              onChange={(e) => updateNewVehicle('truckPlate', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="Telefon"
              value={newVehicle.driverPhone}
              onChange={(e) => updateNewVehicle('driverPhone', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="Konum"
              value={newVehicle.location}
              onChange={(e) => updateNewVehicle('location', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="Acente"
              value={newVehicle.agent}
              onChange={(e) => updateNewVehicle('agent', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="Mühür"
              value={newVehicle.sealNo}
              onChange={(e) => updateNewVehicle('sealNo', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="BL / Kaynak Referans"
              value={newVehicle.sourceBookingRef}
              onChange={(e) => updateNewVehicle('sourceBookingRef', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="Konteyner No"
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
            placeholder="Not"
            value={newVehicle.notes}
            onChange={(e) => updateNewVehicle('notes', e.target.value)}
          />
          <div>
            <button type="button" className="btn small" onClick={handleCreate} disabled={creating}>
              {creating ? 'Ekleniyor...' : 'Kaydet'}
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
        {loading ? (
          <div className="empty-state">Yükleniyor...</div>
        ) : vehicles.length === 0 ? (
          <div className="empty-state">Atanmamış araç kaydı yok.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Çekici</th>
                <th>Telefon</th>
                <th>Konum</th>
                <th>Acente</th>
                <th>Mühür</th>
                <th>Not</th>
                <th>BL / Kaynak Referans</th>
                <th>Booking</th>
                <th>Konteyner No</th>
                <th>Tip</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const state = rowState[v.id]
                if (!state) return null
                return (
                  <tr key={v.id}>
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
                        placeholder="Booking no"
                        value={state.bookingNoInput}
                        onChange={(e) => updateRow(v.id, 'bookingNoInput', e.target.value)}
                        style={{ minWidth: 140 }}
                      />
                    </td>
                    <td>
                      <input
                        className="text-input"
                        placeholder="Konteyner no"
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
                          {assigningId === v.id ? 'Atanıyor...' : 'Ata'}
                        </button>
                        <button className="btn secondary small" onClick={() => handleDelete(v.id)}>
                          Sil
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
    </div>
  )
}
