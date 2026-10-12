import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  BookingWithStats,
  BookingReportData,
  RangeReportData,
  ReportRange,
  EmailSendResult,
  ReportExportResult,
  UnassignedVehicle
} from '@shared/types'
import { REPORT_RANGES, REPORT_RANGE_LABELS, BOOKING_STATUS_LABELS } from '@shared/types'
import { formatDate } from '../lib/format'
import MissingDocsBadge from '../components/MissingDocsBadge'

type Feedback = { type: 'success' | 'error'; text: string } | null

function FeedbackBanner({ feedback }: { feedback: Feedback }): React.JSX.Element | null {
  if (!feedback) return null
  return (
    <div
      style={{
        color: feedback.type === 'error' ? 'var(--color-danger-text)' : 'var(--color-success-text)',
        fontSize: 13
      }}
    >
      {feedback.text}
    </div>
  )
}

/** Word/e-posta çıktısı için ortak "Word olarak indir" + "E-posta gönder" aksiyon şeridi. */
function ReportActions({
  onExportWord,
  onSendEmail,
  disabled
}: {
  onExportWord: () => Promise<void>
  onSendEmail: () => Promise<EmailSendResult>
  disabled: boolean
}): React.JSX.Element {
  const [exporting, setExporting] = useState(false)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function handleExport(): Promise<void> {
    setFeedback(null)
    setExporting(true)
    try {
      await onExportWord()
    } finally {
      setExporting(false)
    }
  }

  async function handleSend(): Promise<void> {
    setFeedback(null)
    setSending(true)
    const result = await onSendEmail()
    setSending(false)
    if (result.success) {
      setFeedback({
        type: 'success',
        text: 'Outlook açıldı. Alıcıyı seçip göndermeniz yeterli.'
      })
    } else {
      setFeedback({ type: 'error', text: result.error ?? 'Mail uygulamasi acilamadi.' })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          className="btn secondary small"
          onClick={handleExport}
          disabled={disabled || exporting}
        >
          {exporting ? 'İndiriliyor...' : 'Word Olarak İndir'}
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={handleSend}
          disabled={disabled || sending}
        >
          {sending ? 'Açılıyor...' : 'Email Gönder'}
        </button>
      </div>

      <FeedbackBanner feedback={feedback} />
    </div>
  )
}

/**
 * Booking listesi için ekranı kaplamayan, arama filtreli, kapalı/açık çalışan
 * gerçek bir çoklu seçim dropdown'ı. Tetikleyici diğer form alanlarıyla aynı
 * boyut/hizada görünmesi için `.select-input` sınıfını paylaşır.
 */
function BookingMultiSelect({
  bookings,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear
}: {
  bookings: BookingWithStats[]
  selectedIds: number[]
  onToggle: (id: number) => void
  onSelectAll: (ids: number[]) => void
  onClear: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const filtered = bookings.filter((b) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      b.bookingNo.toLowerCase().includes(q) ||
      (b.destination ?? '').toLowerCase().includes(q) ||
      (b.line ?? '').toLowerCase().includes(q)
    )
  })

  let summary = 'Booking seçin...'
  if (selectedIds.length === 1) {
    const only = bookings.find((b) => b.id === selectedIds[0])
    summary = only ? only.bookingNo : '1 booking seçildi'
  } else if (selectedIds.length > 1) {
    summary = `${selectedIds.length} booking seçildi`
  }

  const disabled = bookings.length === 0

  return (
    <div className="multiselect" ref={rootRef}>
      <button
        type="button"
        className="select-input multiselect__trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <span
          className="multiselect__trigger-label"
          style={selectedIds.length === 0 ? { color: 'var(--color-text-muted)' } : undefined}
        >
          {disabled ? 'Kayıtlı booking yok.' : summary}
        </span>
        <span className={`multiselect__chevron${open ? ' open' : ''}`}>▼</span>
      </button>

      {open && !disabled && (
        <div className="multiselect__panel">
          <input
            className="text-input"
            placeholder="Booking no, destinasyon veya hat ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="multiselect__actions">
            <button type="button" onClick={() => onSelectAll(filtered.map((b) => b.id))}>
              Tümünü Seç
            </button>
            <button type="button" onClick={onClear}>
              Temizle
            </button>
          </div>
          <div className="multiselect__list">
            {filtered.length === 0 ? (
              <div className="multiselect__empty">Sonuç bulunamadı.</div>
            ) : (
              filtered.map((b) => (
                <label key={b.id} className="multiselect__option">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(b.id)}
                    onChange={() => onToggle(b.id)}
                  />
                  <span>
                    {b.bookingNo} — {b.destination || 'Destination yok'} ({b.containerCount}{' '}
                    konteyner)
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BookingReportSection(): React.JSX.Element {
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [report, setReport] = useState<BookingReportData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.bookings.list().then(setBookings)
  }, [])

  useEffect(() => {
    if (selectedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReport(null)
      return
    }
    setLoading(true)
    window.api.reports
      .getBookingReport(selectedIds)
      .then(setReport)
      .finally(() => setLoading(false))
  }, [selectedIds])

  function toggleBooking(id: number): void {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]
    )
  }

  function selectAllBookings(ids: number[]): void {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])))
  }

  function defaultSubject(): string {
    if (!report || report.bookings.length === 0) return 'Booking Raporu'
    if (report.bookings.length === 1) {
      return `Booking Raporu - ${report.bookings[0].booking.bookingNo}`
    }
    return `Booking Raporu - ${report.bookings.length} Booking`
  }

  async function handleExportWord(): Promise<void> {
    if (selectedIds.length === 0) return
    const result: ReportExportResult = await window.api.reports.exportBookingWord(selectedIds)
    if (!result.canceled) {
      window.alert(`Rapor kaydedildi: ${result.filePath}`)
    }
  }

  async function handleSendEmail(): Promise<EmailSendResult> {
    if (selectedIds.length === 0) return { success: false, error: 'Booking seçilmedi.' }
    return window.api.reports.sendBookingEmail(selectedIds, { subject: defaultSubject() })
  }

  return (
    <div
      className="surface"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <h3 style={{ margin: 0 }}>Booking Bazlı Rapor</h3>

      <div className="form-field" style={{ maxWidth: 360 }}>
        <label>Booking(ler)i Seçin</label>
        <BookingMultiSelect
          bookings={bookings}
          selectedIds={selectedIds}
          onToggle={toggleBooking}
          onSelectAll={selectAllBookings}
          onClear={() => setSelectedIds([])}
        />
      </div>

      {loading && <div className="empty-state">Yükleniyor...</div>}

      {report && !loading && (
        <>
          {report.bookings.map(({ booking, containers, missingDocumentTypes }) => (
            <div key={booking.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4 style={{ margin: 0 }}>{booking.bookingNo}</h4>
              <div className="table-scroll">
                <table className="data-table">
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Vessel Departure</td>
                      <td>{formatDate(booking.vesselDeparture)}</td>
                      <td style={{ fontWeight: 600 }}>Destination</td>
                      <td>{booking.destination || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Line</td>
                      <td>{booking.line || '-'}</td>
                      <td style={{ fontWeight: 600 }}>POL</td>
                      <td>{booking.pol || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Durum</td>
                      <td colSpan={3}>{BOOKING_STATUS_LABELS[booking.status]}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Eksik Evrak</td>
                      <td colSpan={3}>
                        <MissingDocsBadge missing={missingDocumentTypes} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Konteyner No</th>
                      <th>Tip</th>
                      <th>Mühür No</th>
                      <th>Çekici</th>
                      <th>Dorse</th>
                      <th>Şoför Telefon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">Kayıtlı konteyner yok.</div>
                        </td>
                      </tr>
                    ) : (
                      containers.map((c) => (
                        <tr key={c.id}>
                          <td>{c.containerNo || '-'}</td>
                          <td>{c.type}</td>
                          <td>{c.sealNo || '-'}</td>
                          <td>{c.truckPlate || '-'}</td>
                          <td>{c.trailerPlate || '-'}</td>
                          <td>{c.driverPhone || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <ReportActions
            onExportWord={handleExportWord}
            onSendEmail={handleSendEmail}
            disabled={false}
          />
        </>
      )}
    </div>
  )
}

/** Raporlar sayfasında "Atanmayan Araçlar" bekleme listesinin özet istatistikleri. */
function UnassignedVehiclesStatsSection(): React.JSX.Element {
  const [vehicles, setVehicles] = useState<UnassignedVehicle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    window.api.unassignedVehicles
      .list()
      .then(setVehicles)
      .finally(() => setLoading(false))
  }, [])

  const missingBookingRef = vehicles.filter((v) => !v.sourceBookingRef).length
  const missingContainerNo = vehicles.filter((v) => !v.containerNo).length

  return (
    <div
      className="surface"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Atanmayan Araçlar</h3>
        <Link to="/unassigned-vehicles" className="btn secondary small">
          Sayfaya Git
        </Link>
      </div>

      {loading ? (
        <div className="empty-state">Yükleniyor...</div>
      ) : (
        <div className="dashboard-kpis">
          <div className="dashboard-kpi">
            <span className="dashboard-kpi__value">{vehicles.length}</span>
            <span className="dashboard-kpi__label">Toplam Bekleyen Kayıt</span>
          </div>
          <div className="dashboard-kpi">
            <span className="dashboard-kpi__value">{missingBookingRef}</span>
            <span className="dashboard-kpi__label">Booking Referansı Olmayan</span>
          </div>
          <div className="dashboard-kpi">
            <span className="dashboard-kpi__value">{missingContainerNo}</span>
            <span className="dashboard-kpi__label">Konteyner No Olmayan</span>
          </div>
        </div>
      )}
    </div>
  )
}

function RangeReportSection(): React.JSX.Element {
  const [range, setRange] = useState<ReportRange>('today')
  const [report, setReport] = useState<RangeReportData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    window.api.reports
      .getRangeReport(range)
      .then(setReport)
      .finally(() => setLoading(false))
  }, [range])

  async function handleExportWord(): Promise<void> {
    const result: ReportExportResult = await window.api.reports.exportRangeWord(range)
    if (!result.canceled) {
      window.alert(`Rapor kaydedildi: ${result.filePath}`)
    }
  }

  async function handleSendEmail(): Promise<EmailSendResult> {
    const subject = `Dönemsel Rapor - ${REPORT_RANGE_LABELS[range]}`
    return window.api.reports.sendRangeEmail(range, { subject })
  }

  return (
    <div
      className="surface"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <h3 style={{ margin: 0 }}>Zaman Bazlı Rapor</h3>

      <div className="report-filter">
        {REPORT_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={`report-filter__btn${range === r ? ' active' : ''}`}
            onClick={() => setRange(r)}
          >
            {REPORT_RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state">Yükleniyor...</div>}

      {report && !loading && (
        <>
          <div className="dashboard-kpis">
            <div className="dashboard-kpi">
              <span className="dashboard-kpi__value">{report.bookings.length}</span>
              <span className="dashboard-kpi__label">Toplam Booking</span>
            </div>
            <div className="dashboard-kpi">
              <span className="dashboard-kpi__value">{report.totalContainers}</span>
              <span className="dashboard-kpi__label">Toplam Konteyner</span>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booking No</th>
                  <th>Vessel Departure</th>
                  <th>Destination</th>
                  <th>Line</th>
                  <th>POL</th>
                  <th>Durum</th>
                  <th>Konteyner</th>
                </tr>
              </thead>
              <tbody>
                {report.bookings.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">Seçili dönemde booking yok.</div>
                    </td>
                  </tr>
                ) : (
                  report.bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.bookingNo}</td>
                      <td>{formatDate(b.vesselDeparture)}</td>
                      <td>{b.destination || '-'}</td>
                      <td>{b.line || '-'}</td>
                      <td>{b.pol || '-'}</td>
                      <td>{BOOKING_STATUS_LABELS[b.status]}</td>
                      <td>{b.containerCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <ReportActions
            onExportWord={handleExportWord}
            onSendEmail={handleSendEmail}
            disabled={false}
          />
        </>
      )}
    </div>
  )
}

export default function ReportsPage(): React.JSX.Element {
  return (
    <div>
      <div className="page-title">
        <h1>Raporlar</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <BookingReportSection />
        <RangeReportSection />
        <UnassignedVehiclesStatsSection />
      </div>
    </div>
  )
}
