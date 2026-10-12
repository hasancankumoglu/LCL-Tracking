import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import type { Booking, Container, DocumentType } from '@shared/types'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  ARCHIVABLE_BOOKING_STATUSES
} from '@shared/types'
import { formatDate, toWhatsAppLink } from '../lib/format'
import ContainerFormModal from '../components/ContainerFormModal'
import DocumentSection from '../components/DocumentSection'
import VesselTrackingPanel from '../components/VesselTrackingPanel'
import CarrierLookupModal from '../components/CarrierLookupModal'
import type { ContainerWithBooking } from '@shared/types'

// GEÇİCİ: Armatörden Getir (resmi API + deneysel genel sayfa fallback'i) su an güvenilir
// çalışmıyor - kod silinmedi, sadece ekrandan gizlendi. Düzeltilince true yapılabilir.
const CARRIER_LOOKUP_ENABLED = false

export default function BookingDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const bookingId = Number(id)
  const navigate = useNavigate()

  const [booking, setBooking] = useState<Booking | null>(null)
  const [containers, setContainers] = useState<Container[]>([])
  const [editingContainer, setEditingContainer] = useState<Container | undefined>(undefined)
  const [showContainerModal, setShowContainerModal] = useState(false)
  const [showCarrierModal, setShowCarrierModal] = useState(false)
  const [activeDocType, setActiveDocType] = useState<DocumentType>('BEYANNAME')

  async function refresh(): Promise<void> {
    const [b, c] = await Promise.all([
      window.api.bookings.get(bookingId),
      window.api.containers.listByBooking(bookingId)
    ])
    setBooking(b ?? null)
    setContainers(c)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  function openNewContainer(): void {
    setEditingContainer(undefined)
    setShowContainerModal(true)
  }

  function openEditContainer(container: Container): void {
    setEditingContainer(container)
    setShowContainerModal(true)
  }

  async function handleDeleteContainer(id: number): Promise<void> {
    const confirmed = window.confirm('Bu konteyneri silmek istediğinize emin misiniz?')
    if (!confirmed) return
    await window.api.containers.remove(id)
    await refresh()
  }

  async function handleToggleArchive(): Promise<void> {
    if (!booking) return
    try {
      await window.api.bookings.archive(booking.id, !booking.archived)
      await refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Arşivlenirken bir hata oluştu.')
    }
  }

  if (!booking) {
    return <div className="empty-state">Yükleniyor...</div>
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/bookings">Bookingler</Link> / {booking.bookingNo}
      </div>
      <div className="page-title">
        <h1>{booking.bookingNo}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(booking.archived || ARCHIVABLE_BOOKING_STATUSES.includes(booking.status)) && (
            <button className="btn secondary small" onClick={handleToggleArchive}>
              {booking.archived ? 'Arşivden Çıkar' : 'Arşivle'}
            </button>
          )}
          {CARRIER_LOOKUP_ENABLED && (
            <button className="btn secondary small" onClick={() => setShowCarrierModal(true)}>
              Armatörden Getir
            </button>
          )}
          <button
            className="btn secondary small"
            onClick={() => navigate(`/bookings/${booking.id}/edit`)}
          >
            Booking&apos;i Düzenle
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="surface">
          <div className="section-title">
            <h2>Booking Bilgileri</h2>
          </div>
          <div className="section-body form-grid">
            <div className="form-field">
              <label>Vessel Departure</label>
              <div>{formatDate(booking.vesselDeparture) || '-'}</div>
            </div>
            <div className="form-field">
              <label>Declaration Cut Off</label>
              <div>{formatDate(booking.declarationCutOff) || '-'}</div>
            </div>
            <div className="form-field">
              <label>SI Cut Off</label>
              <div>{formatDate(booking.siCutOff) || '-'}</div>
            </div>
            <div className="form-field">
              <label>Kategori</label>
              <div>{booking.category || '-'}</div>
            </div>
            <div className="form-field">
              <label>Destination</label>
              <div>{booking.destination || '-'}</div>
            </div>
            <div className="form-field">
              <label>Line</label>
              <div>{booking.line || '-'}</div>
            </div>
            <div className="form-field">
              <label>POL</label>
              <div>{booking.pol || '-'}</div>
            </div>
            <div className="form-field">
              <label>Statü</label>
              <div>
                <span className={`badge badge-status-${booking.status.toLowerCase()}`}>
                  {BOOKING_STATUS_LABELS[booking.status]}
                </span>
              </div>
            </div>
            <div className="form-field full">
              <label>Durum / Not</label>
              <div>{booking.notes || '-'}</div>
            </div>
            {CARRIER_LOOKUP_ENABLED && (
              <>
                <div className="form-field">
                  <label>Konşimento (BL) No</label>
                  <div>{booking.blNumber || '-'}</div>
                </div>
                <div className="form-field">
                  <label>ETD (Armatör)</label>
                  <div>{formatDate(booking.etd) || '-'}</div>
                </div>
                <div className="form-field">
                  <label>ETA (Armatör)</label>
                  <div>{formatDate(booking.eta) || '-'}</div>
                </div>
                <div className="form-field">
                  <label>Free Time Bitiş</label>
                  <div>{formatDate(booking.freeTimeEnd) || '-'}</div>
                </div>
                <div className="form-field full">
                  <label>Konşimento Durumu</label>
                  <div>{booking.blStatus || '-'}</div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="surface">
          <div className="section-title">
            <h2>Konteynerler ({containers.length})</h2>
          </div>
          <div className="containers-toolbar">
            <button className="btn small" onClick={openNewContainer}>
              + Yeni Konteyner
            </button>
          </div>
          <div className="table-scroll">
            {containers.length === 0 ? (
              <div className="empty-state">Bu bookinge henüz konteyner eklenmedi.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Konteyner</th>
                    <th>Tip</th>
                    <th>Mühür</th>
                    <th>Çekici</th>
                    <th>Dorse</th>
                    <th>Telefon</th>
                    <th>Gemi</th>
                    <th>Durum</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c) => (
                    <tr key={c.id} onClick={() => openEditContainer(c)}>
                      <td>{c.containerNo}</td>
                      <td>
                        <span className={`badge badge-${c.type}`}>{c.type}</span>
                      </td>
                      <td>{c.sealNo}</td>
                      <td>{c.truckPlate}</td>
                      <td>{c.trailerPlate}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {toWhatsAppLink(c.driverPhone) ? (
                          <a
                            className="whatsapp-link"
                            href={toWhatsAppLink(c.driverPhone) as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp'ta aç"
                          >
                            <svg
                              className="whatsapp-link__icon"
                              viewBox="0 0 32 32"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path
                                fill="currentColor"
                                d="M16.004 3C9.377 3 4 8.373 4 15c0 2.223.61 4.363 1.766 6.235L4 29l8-1.735A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.75a9.7 9.7 0 0 1-4.94-1.354l-.354-.21-4.746 1.03 1.02-4.62-.232-.37A9.71 9.71 0 0 1 5.25 15c0-5.93 4.824-10.75 10.754-10.75S26.76 9.07 26.76 15 21.934 24.75 16.004 24.75Zm5.77-7.32c-.316-.158-1.87-.922-2.16-1.028-.29-.106-.5-.158-.712.158-.21.316-.816 1.028-1 1.238-.184.211-.368.238-.684.08-.316-.159-1.335-.492-2.542-1.567-.94-.838-1.574-1.873-1.758-2.19-.184-.316-.02-.487.138-.645.142-.141.316-.369.475-.554.158-.184.21-.316.316-.527.105-.211.052-.395-.026-.554-.079-.158-.712-1.716-.976-2.35-.257-.617-.518-.534-.712-.544l-.606-.011c-.21 0-.554.079-.844.395-.29.316-1.106 1.08-1.106 2.638s1.133 3.06 1.29 3.271c.159.211 2.23 3.404 5.4 4.774.755.326 1.343.52 1.802.665.757.24 1.446.206 1.99.125.607-.09 1.87-.764 2.134-1.503.264-.738.264-1.37.185-1.502-.079-.132-.29-.211-.606-.369Z"
                              />
                            </svg>
                            <span>{c.driverPhone}</span>
                          </a>
                        ) : (
                          c.driverPhone
                        )}
                      </td>
                      <td>{c.vesselName || '-'}</td>
                      <td>{c.notes}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {(c.imoNumber || c.mmsiNumber) && (
                          <Link
                            to={`/vessel-tracking?containerId=${c.id}`}
                            className="btn secondary small"
                            style={{ marginRight: 6 }}
                          >
                            Haritada Gör
                          </Link>
                        )}
                        <button
                          className="btn danger small"
                          onClick={() => handleDeleteContainer(c.id)}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="surface">
          <div className="section-title">
            <h2>Dökümanlar</h2>
          </div>
          <div className="doc-tabs">
            {DOCUMENT_TYPES.map((t) => (
              <div
                key={t}
                className={`doc-tab ${activeDocType === t ? 'active' : ''}`}
                onClick={() => setActiveDocType(t)}
              >
                {DOCUMENT_TYPE_LABELS[t]}
              </div>
            ))}
          </div>
          <DocumentSection bookingId={booking.id} type={activeDocType} />
        </div>

        <div className="surface">
          <div className="section-title">
            <h2>Gemi Takip</h2>
          </div>
          <div className="section-body">
            <VesselTrackingPanel
              containers={containers.map((c): ContainerWithBooking => ({
                ...c,
                bookingNo: booking.bookingNo,
                bookingStatus: booking.status,
                bookingPol: booking.pol,
                bookingDestination: booking.destination,
                bookingLine: booking.line,
                bookingVesselDeparture: booking.vesselDeparture
              }))}
              mapHeight={520}
            />
          </div>
        </div>
      </div>

      {showContainerModal && (
        <ContainerFormModal
          bookingId={booking.id}
          container={editingContainer}
          onClose={() => setShowContainerModal(false)}
          onSaved={() => {
            setShowContainerModal(false)
            refresh()
          }}
        />
      )}
      {CARRIER_LOOKUP_ENABLED && showCarrierModal && (
        <CarrierLookupModal
          booking={booking}
          onClose={() => setShowCarrierModal(false)}
          onApplied={refresh}
        />
      )}
    </div>
  )
}
