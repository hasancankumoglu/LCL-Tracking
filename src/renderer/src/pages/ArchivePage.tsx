import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { BookingWithStats } from '@shared/types'
import { formatDate } from '../lib/format'
import { useGlobalLoading } from '../lib/loadingOverlay'

export default function ArchivePage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)

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
        <h1>{t('nav.archive')}</h1>
      </div>

      <div className="surface table-scroll">
        {loading ? null : bookings.length === 0 ? (
          <div className="empty-state">{t('archive.empty')}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('bookings.bookingColumn')}</th>
                <th>{t('reports.vesselDeparture')}</th>
                <th>{t('reports.destination')}</th>
                <th>{t('reports.line')}</th>
                <th>{t('reports.pol')}</th>
                <th>{t('bookings.statusColumn')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} onClick={() => navigate(`/bookings/${b.id}`)}>
                  <td>
                    <strong>{b.bookingNo}</strong>
                    {b.updatedBy && <div className="text-muted">{b.updatedBy}</div>}
                  </td>
                  <td>{formatDate(b.vesselDeparture)}</td>
                  <td>{b.destination}</td>
                  <td>{b.line}</td>
                  <td>{b.pol}</td>
                  <td>
                    <span className={`badge badge-status-${b.status.toLowerCase()}`}>
                      {t(`enums.bookingStatus.${b.status}`)}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn secondary small" onClick={() => handleUnarchive(b.id)}>
                      {t('archive.unarchiveButton')}
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
