import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  BookingWithStats,
  BookingReportData,
  RangeReportData,
  ReportRange,
  EmailSendResult,
  ReportExportResult,
  UnassignedVehicle
} from '@shared/types'
import { REPORT_RANGES } from '@shared/types'
import { formatDate } from '../lib/format'
import { useGlobalLoading } from '../lib/loadingOverlay'
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
  const { t } = useTranslation()
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
        text: t('reportsPage.outlookOpenedMessage')
      })
    } else {
      setFeedback({ type: 'error', text: result.error ?? t('reportsPage.mailAppErrorGeneric') })
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
          {exporting ? t('reportsPage.downloading') : t('reportsPage.downloadWordButton')}
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={handleSend}
          disabled={disabled || sending}
        >
          {sending ? t('reportsPage.opening') : t('reportsPage.sendEmailButton')}
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
  const { t } = useTranslation()
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

  let summary = t('reportsPage.selectBookingsPlaceholder')
  if (selectedIds.length === 1) {
    const only = bookings.find((b) => b.id === selectedIds[0])
    summary = only ? only.bookingNo : t('reportsPage.oneBookingSelected')
  } else if (selectedIds.length > 1) {
    summary = t('reportsPage.multipleBookingsSelected', { count: selectedIds.length })
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
          {disabled ? t('reportsPage.noRecordedBookings') : summary}
        </span>
        <span className={`multiselect__chevron${open ? ' open' : ''}`}>▼</span>
      </button>

      {open && !disabled && (
        <div className="multiselect__panel">
          <input
            className="text-input"
            placeholder={t('reportsPage.searchBookingPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="multiselect__actions">
            <button type="button" onClick={() => onSelectAll(filtered.map((b) => b.id))}>
              {t('common.selectAll')}
            </button>
            <button type="button" onClick={onClear}>
              {t('common.clear')}
            </button>
          </div>
          <div className="multiselect__list">
            {filtered.length === 0 ? (
              <div className="multiselect__empty">{t('vesselTracking.noResults')}</div>
            ) : (
              filtered.map((b) => (
                <label key={b.id} className="multiselect__option">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(b.id)}
                    onChange={() => onToggle(b.id)}
                  />
                  <span>
                    {b.bookingNo} — {b.destination || t('reportsPage.noDestination')} (
                    {b.containerCount} {t('reports.containerCountSuffix')})
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
  const { t } = useTranslation()
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [report, setReport] = useState<BookingReportData | null>(null)
  const [loading, setLoading] = useState(false)
  useGlobalLoading(loading)

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
    const base = t('reportsPage.defaultSubjectBase')
    if (!report || report.bookings.length === 0) return base
    if (report.bookings.length === 1) {
      return `${base} - ${report.bookings[0].booking.bookingNo}`
    }
    return t('reportsPage.defaultSubjectMultiple', { prefix: base, count: report.bookings.length })
  }

  async function handleExportWord(): Promise<void> {
    if (selectedIds.length === 0) return
    const result: ReportExportResult = await window.api.reports.exportBookingWord(selectedIds)
    if (!result.canceled) {
      window.alert(t('reportsPage.reportSavedMessage', { path: result.filePath }))
    }
  }

  async function handleSendEmail(): Promise<EmailSendResult> {
    if (selectedIds.length === 0)
      return { success: false, error: t('reportsPage.noBookingSelectedError') }
    return window.api.reports.sendBookingEmail(selectedIds, { subject: defaultSubject() })
  }

  return (
    <div
      className="surface"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <h3 style={{ margin: 0 }}>{t('reportsPage.bookingReportSectionTitle')}</h3>

      <div className="form-field" style={{ maxWidth: 360 }}>
        <label>{t('reportsPage.selectBookingsLabel')}</label>
        <BookingMultiSelect
          bookings={bookings}
          selectedIds={selectedIds}
          onToggle={toggleBooking}
          onSelectAll={selectAllBookings}
          onClear={() => setSelectedIds([])}
        />
      </div>

      {report && !loading && (
        <>
          {report.bookings.map(({ booking, containers, missingDocumentTypes }) => (
            <div key={booking.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4 style={{ margin: 0 }}>{booking.bookingNo}</h4>
              <div className="table-scroll">
                <table className="data-table">
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{t('reports.vesselDeparture')}</td>
                      <td>{formatDate(booking.vesselDeparture)}</td>
                      <td style={{ fontWeight: 600 }}>{t('reports.destination')}</td>
                      <td>{booking.destination || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{t('reports.line')}</td>
                      <td>{booking.line || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{t('reports.pol')}</td>
                      <td>{booking.pol || '-'}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{t('reports.status')}</td>
                      <td colSpan={3}>{t(`enums.bookingStatus.${booking.status}`)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{t('reports.missingDocuments')}</td>
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
                      <th>{t('reports.containerNo')}</th>
                      <th>{t('reports.type')}</th>
                      <th>{t('reports.sealNo')}</th>
                      <th>{t('reports.truckPlate')}</th>
                      <th>{t('reports.trailerPlate')}</th>
                      <th>{t('reports.driverPhone')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">{t('reports.noContainers')}</div>
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
  const { t } = useTranslation()
  const [vehicles, setVehicles] = useState<UnassignedVehicle[]>([])
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)

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
        <h3 style={{ margin: 0 }}>{t('nav.unassignedVehicles')}</h3>
        <Link to="/unassigned-vehicles" className="btn secondary small">
          {t('reportsPage.goToPage')}
        </Link>
      </div>

      {loading ? null : (
        <div className="dashboard-kpis">
          <div className="dashboard-kpi">
            <span className="dashboard-kpi__value">{vehicles.length}</span>
            <span className="dashboard-kpi__label">{t('reportsPage.totalPendingRecords')}</span>
          </div>
          <div className="dashboard-kpi">
            <span className="dashboard-kpi__value">{missingBookingRef}</span>
            <span className="dashboard-kpi__label">{t('reportsPage.missingBookingRef')}</span>
          </div>
          <div className="dashboard-kpi">
            <span className="dashboard-kpi__value">{missingContainerNo}</span>
            <span className="dashboard-kpi__label">{t('reportsPage.missingContainerNo')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function RangeReportSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [range, setRange] = useState<ReportRange>('today')
  const [report, setReport] = useState<RangeReportData | null>(null)
  const [loading, setLoading] = useState(false)
  useGlobalLoading(loading)

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
      window.alert(t('reportsPage.reportSavedMessage', { path: result.filePath }))
    }
  }

  async function handleSendEmail(): Promise<EmailSendResult> {
    const subject = t('reportsPage.rangeEmailSubject', {
      rangeLabel: t(`enums.reportRange.${range}`)
    })
    return window.api.reports.sendRangeEmail(range, { subject })
  }

  return (
    <div
      className="surface"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <h3 style={{ margin: 0 }}>{t('reportsPage.rangeReportSectionTitle')}</h3>

      <div className="report-filter">
        {REPORT_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={`report-filter__btn${range === r ? ' active' : ''}`}
            onClick={() => setRange(r)}
          >
            {t(`enums.reportRange.${r}`)}
          </button>
        ))}
      </div>

      {report && !loading && (
        <>
          <div className="dashboard-kpis">
            <div className="dashboard-kpi">
              <span className="dashboard-kpi__value">{report.bookings.length}</span>
              <span className="dashboard-kpi__label">{t('reports.totalBookings')}</span>
            </div>
            <div className="dashboard-kpi">
              <span className="dashboard-kpi__value">{report.totalContainers}</span>
              <span className="dashboard-kpi__label">{t('reports.totalContainers')}</span>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('reports.bookingNo')}</th>
                  <th>{t('reports.vesselDeparture')}</th>
                  <th>{t('reports.destination')}</th>
                  <th>{t('reports.line')}</th>
                  <th>{t('reports.pol')}</th>
                  <th>{t('reports.status')}</th>
                  <th>{t('reports.containerCountSuffix')}</th>
                </tr>
              </thead>
              <tbody>
                {report.bookings.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">{t('reports.noBookingsInRange')}</div>
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
                      <td>{t(`enums.bookingStatus.${b.status}`)}</td>
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
  const { t } = useTranslation()
  return (
    <div>
      <div className="page-title">
        <h1>{t('nav.reports')}</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <BookingReportSection />
        <RangeReportSection />
        <UnassignedVehiclesStatsSection />
      </div>
    </div>
  )
}
