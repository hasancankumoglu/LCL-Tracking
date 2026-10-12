import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BookingWithStats } from '@shared/types'
import { BOOKING_STATUS_LABELS } from '@shared/types'
import { formatDate } from '../lib/format'

export default function ArchivePage(): React.JSX.Element {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh(): Promise<void> {
    setLoading(true)
    const data = await window.api.bookings.listArchived()
    setBookings(data)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  async function handleUnarchive(id: number): Promise<void> {
    await window.api.bookings.archive(id, false)
    await refresh()
  }

  return (
    <div>
      <div className="page-title">
        <h1>Arşiv</h1>
      </div>

      <div className="surface table-scroll">
        {loading ? (
          <div className="empty-state">Yükleniyor...</div>
        ) : bookings.length === 0 ? (
          <div className="empty-state">Arşivlenmiş booking bulunamadı.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Vessel Departure</th>
                <th>Destination</th>
                <th>Line</th>
                <th>POL</th>
                <th>Statü</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} onClick={() => navigate(`/bookings/${b.id}`)}>
                  <td>
                    <strong>{b.bookingNo}</strong>
                  </td>
                  <td>{formatDate(b.vesselDeparture)}</td>
                  <td>{b.destination}</td>
                  <td>{b.line}</td>
                  <td>{b.pol}</td>
                  <td>
                    <span className={`badge badge-status-${b.status.toLowerCase()}`}>
                      {BOOKING_STATUS_LABELS[b.status]}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn secondary small" onClick={() => handleUnarchive(b.id)}>
                      Arşivden Çıkar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
