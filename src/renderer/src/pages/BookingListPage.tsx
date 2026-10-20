import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type {
  BookingWithStats,
  BookingStatus,
  ExcelPreviewResult,
  UserDirectoryEntry,
  CustomerDirectoryEntry
} from '@shared/types'
import { ARCHIVABLE_BOOKING_STATUSES, BOOKING_STATUSES } from '@shared/types'
import { getCutoffLevel, cutoffLevelToRowClass } from '../lib/cutoff'
import { formatDate, getErrorMessage } from '../lib/format'
import ExcelImportPreviewModal from '../components/ExcelImportPreviewModal'
import MissingDocsBadge from '../components/MissingDocsBadge'
import { useGlobalLoading } from '../lib/loadingOverlay'
import { useAuth } from '../auth/AuthContext'

const CATEGORY_FALLBACK = 'Diğer'

/**
 * Excel dışa/içe aktarmadaki sekme (sheet) mantığıyla aynı: CATEGORY alanı
 * (ör. Mundra, Bandar Abbas) booking listesinin gruplanmasında kullanılır.
 * DESTINATION alanından bağımsız, ayrı bir alan.
 */
function categoryOf(category: string | null): string {
  const trimmed = (category ?? '').trim()
  return trimmed.length > 0 ? trimmed : CATEGORY_FALLBACK
}

function CutoffBadge({
  level
}: {
  level: ReturnType<typeof getCutoffLevel>
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (level === 'none') return null
  const label =
    level === 'critical'
      ? t('bookings.cutoffCritical')
      : level === 'warning'
        ? t('bookings.cutoffWarning')
        : t('bookings.cutoffNormal')
  return <span className={`badge badge-${level === 'ok' ? 'ok' : level}`}>{label}</span>
}

export default function BookingListPage(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isCustomer = user?.role === 'CUSTOMER'
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)
  const [search, setSearch] = useState('')
  const [destinationFilter, setDestinationFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [customers, setCustomers] = useState<CustomerDirectoryEntry[]>([])
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [showImportPicker, setShowImportPicker] = useState(false)
  const [preview, setPreview] = useState<ExcelPreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [userDirectory, setUserDirectory] = useState<Map<string, string>>(new Map())
  const [pendingBookingIds, setPendingBookingIds] = useState<Set<number>>(new Set())

  async function refreshPendingBookingIds(): Promise<void> {
    const ids = await window.api.pendingDeletions.listActiveBookingIds()
    setPendingBookingIds(new Set(ids))
  }

  async function refresh(): Promise<void> {
    setLoading(true)
    const data = await window.api.bookings.list()
    setBookings(data)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    refreshPendingBookingIds()
    if (!isCustomer) {
      window.api.customers.listDirectory().then(setCustomers)
    }
    window.api.users
      .listDirectory()
      .then((entries: UserDirectoryEntry[]) => {
        setUserDirectory(new Map(entries.map((e) => [e.username, e.displayName ?? e.username])))
      })
      .catch(() => {
        /** Dizin alınamazsa booking listesinde kullanıcı adı aynen gösterilir. */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const destinations = useMemo(() => {
    const set = new Set(bookings.map((b) => b.destination).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [bookings])

  const categories = useMemo(() => {
    const set = new Set(bookings.map((b) => categoryOf(b.category)))
    return Array.from(set).sort((a, b) => {
      if (a === CATEGORY_FALLBACK) return 1
      if (b === CATEGORY_FALLBACK) return -1
      return a.localeCompare(b)
    })
  }, [bookings])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return bookings.filter((b) => {
      if (destinationFilter && b.destination !== destinationFilter) return false
      if (categoryFilter && categoryOf(b.category) !== categoryFilter) return false
      if (statusFilter && b.status !== statusFilter) return false
      if (customerFilter && String(b.customerId ?? '') !== customerFilter) return false
      if (!term) return true
      return (
        b.bookingNo.toLowerCase().includes(term) ||
        (b.line ?? '').toLowerCase().includes(term) ||
        (b.pol ?? '').toLowerCase().includes(term) ||
        (b.category ?? '').toLowerCase().includes(term) ||
        (b.destination ?? '').toLowerCase().includes(term)
      )
    })
  }, [bookings, search, destinationFilter, categoryFilter, statusFilter, customerFilter])

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, BookingWithStats[]>()
    for (const b of filtered) {
      const category = categoryOf(b.category)
      if (!map.has(category)) map.set(category, [])
      map.get(category)!.push(b)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === CATEGORY_FALLBACK) return 1
      if (b === CATEGORY_FALLBACK) return -1
      return a.localeCompare(b)
    })
  }, [filtered])

  function toggleCategory(category: string): void {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])

  async function handleDelete(id: number, bookingNo: string): Promise<void> {
    const confirmed = window.confirm(t('bookings.deleteConfirm', { bookingNo }))
    if (!confirmed) return
    const result = await window.api.bookings.remove(id)
    if (result.pendingRequested) {
      window.alert(t('bookings.deletePendingSubmitted'))
      await refreshPendingBookingIds()
    }
    await refresh()
  }

  async function handleArchive(id: number): Promise<void> {
    try {
      await window.api.bookings.archive(id, true)
      await refresh()
    } catch (err) {
      window.alert(getErrorMessage(err, t('bookings.archiveErrorGeneric')))
    }
  }

  async function handleSendOperatorEmail(id: number): Promise<void> {
    try {
      const result = await window.api.reports.sendOperatorEmail(id)
      if (!result.success) {
        window.alert(result.error ?? t('bookings.emailErrorGeneric'))
      }
    } catch (err) {
      window.alert(getErrorMessage(err, t('bookings.emailErrorGeneric')))
    }
  }

  async function handleExport(): Promise<void> {
    try {
      const res = await window.api.excel.export(filtered.map((b) => b.id))
      if (!res.canceled) {
        setImportMessage(
          t('bookings.exportSavedMessage', {
            bookingsPath: res.bookingsFilePath,
            containersPath: res.containersFilePath
          })
        )
      }
    } catch (err) {
      window.alert(getErrorMessage(err, t('bookings.exportErrorGeneric')))
    }
  }

  async function previewFromPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    setPreviewLoading(true)
    setImportMessage(null)
    try {
      const result = await window.api.excel.previewImport(paths)
      setPreview(result)
    } catch (err) {
      window.alert(getErrorMessage(err, t('excelImport.previewErrorGeneric')))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handlePickImportFolder(): Promise<void> {
    const folder = await window.api.excel.pickImportFolder()
    if (!folder) return
    await previewFromPaths([folder])
  }

  function handleOpenImportPicker(): void {
    setShowImportPicker(true)
  }

  function handleCloseImportPicker(): void {
    setShowImportPicker(false)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragging(false)
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    const paths = files.map((f) => window.api.getPathForFile(f))
    await previewFromPaths(paths)
  }

  function handleCancelPreview(): void {
    setPreview(null)
    setShowImportPicker(false)
  }

  async function handleConfirmImport(): Promise<void> {
    if (!preview) return
    const r = await window.api.excel.commitImport(preview.directoryPath)
    let msg = t('excelImport.commitDoneMessage', {
      created: r.bookingsCreated,
      updated: r.bookingsUpdated,
      containers: r.containersCreated
    })
    if (r.unassignedVehiclesCreated > 0) {
      msg += ` ${t('excelImport.unassignedAddedMessage', { count: r.unassignedVehiclesCreated })}`
    }
    if (r.errors.length > 0) {
      msg += ` ${t('excelImport.warningsSuffix', { count: r.errors.length, list: r.errors.slice(0, 5).join(' | ') })}`
    }
    setImportMessage(msg)
    setPreview(null)
    setShowImportPicker(false)
    await refresh()
  }

  return (
    <div className="booking-list">
      <div className="page-title">
        <h1>{t('nav.bookings')}</h1>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder={t('bookings.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select-input"
          value={destinationFilter}
          onChange={(e) => setDestinationFilter(e.target.value)}
        >
          <option value="">{t('bookings.allDestinations')}</option>
          {destinations.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="select-input"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">{t('bookings.allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="select-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BookingStatus | '')}
        >
          <option value="">{t('bookings.allStatuses')}</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`enums.bookingStatus.${s}`)}
            </option>
          ))}
        </select>
        {!isCustomer && (
          <select
            className="select-input"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">{t('bookings.allCustomers')}</option>
            {customers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="toolbar__spacer" />
        <button className="btn secondary" onClick={handleExport}>
          {t('bookings.exportToExcel')}
        </button>
        {!isCustomer && (
          <>
            <button className="btn secondary" onClick={handleOpenImportPicker}>
              {t('excelImport.importButton')}
            </button>
            <button className="btn" onClick={() => navigate('/bookings/new')}>
              {t('bookings.newBooking')}
            </button>
          </>
        )}
      </div>

      {importMessage && (
        <div className="surface" style={{ padding: 12, marginBottom: 14, fontSize: 13 }}>
          {importMessage}
        </div>
      )}

      {showImportPicker && !preview && (
        <div className="modal-overlay" onClick={handleCloseImportPicker}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('excelImport.importButton')}</h2>
            <div
              className={`dropzone dropzone--large${isDragging ? ' dropzone--active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handlePickImportFolder}
              role="button"
              tabIndex={0}
            >
              {previewLoading ? t('excelImport.readingFiles') : t('excelImport.dropzoneHint')}
            </div>
            <div className="form-actions">
              <button className="btn secondary" onClick={handleCloseImportPicker}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <ExcelImportPreviewModal
          preview={preview}
          onCancel={handleCancelPreview}
          onConfirm={handleConfirmImport}
        />
      )}

      <div className="surface table-scroll">
        {loading ? null : filtered.length === 0 ? (
          <div className="empty-state">{t('bookings.noRecordsFound')}</div>
        ) : (
          groupedByCategory.map(([category, items]) => {
            const isCollapsed = collapsedCategories.has(category)
            return (
              <div key={category} className="booking-category">
                <button
                  type="button"
                  className="booking-category__header"
                  onClick={() => toggleCategory(category)}
                >
                  <span className="booking-category__toggle">{isCollapsed ? '▸' : '▾'}</span>
                  <strong>{category}</strong>
                  <span className="booking-category__count">
                    {t('bookings.categoryCount', { count: items.length })}
                  </span>
                </button>
                {!isCollapsed && (
                  <table className="data-table booking-list__table">
                    <thead>
                      <tr>
                        <th>{t('bookings.bookingColumn')}</th>
                        <th>{t('bookings.operatorColumn')}</th>
                        <th>{t('reports.vesselDeparture')}</th>
                        <th>{t('reports.declarationCutOff')}</th>
                        <th>{t('reports.siCutOff')}</th>
                        <th>{t('bookings.containerSizeColumn')}</th>
                        <th>{t('bookings.unitColumn')}</th>
                        <th>{t('reports.destination')}</th>
                        <th>{t('reports.line')}</th>
                        <th>{t('reports.pol')}</th>
                        {!isCustomer && (
                          <th className="booking-list__customer">{t('bookings.customerColumn')}</th>
                        )}
                        <th>{t('bookings.statusColumn')}</th>
                        <th>{t('bookings.docsColumn')}</th>
                        <th>{t('bookings.noteColumn')}</th>
                        <th
                          className={isCustomer ? undefined : 'booking-list__actions-column'}
                        ></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((b) => {
                        const isCompleted = b.status === 'TAMAMLANDI'
                        const level = isCompleted
                          ? 'ok'
                          : getCutoffLevel(b.declarationCutOff, b.siCutOff)
                        const customerName = b.customerId
                          ? (customerNameById.get(b.customerId) ?? '-')
                          : '-'
                        return (
                          <tr
                            key={b.id}
                            className={isCompleted ? 'row-completed' : cutoffLevelToRowClass(level)}
                            onClick={() => navigate(`/bookings/${b.id}`)}
                          >
                            <td title={b.bookingNo}>
                              <strong>{b.bookingNo}</strong>
                              {pendingBookingIds.has(b.id) && (
                                <span>
                                  <span className="badge badge-warning">
                                    {t('bookings.pendingDeletionBadge')}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {b.createdBy ? (
                                <button
                                  type="button"
                                  className="link-button"
                                  title={t('bookings.sendOperatorEmailTitle')}
                                  onClick={() => handleSendOperatorEmail(b.id)}
                                >
                                  {userDirectory.get(b.createdBy) ?? b.createdBy}
                                </button>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td title={formatDate(b.vesselDeparture)}>
                              {formatDate(b.vesselDeparture)}
                            </td>
                            <td title={formatDate(b.declarationCutOff)}>
                              {formatDate(b.declarationCutOff)}
                            </td>
                            <td title={formatDate(b.siCutOff)}>{formatDate(b.siCutOff)}</td>
                            <td title={b.containerSizes}>{b.containerSizes}</td>
                            <td>
                              {b.unit ?? 0}/{b.containerCount}
                            </td>
                            <td title={b.destination ?? undefined}>{b.destination}</td>
                            <td title={b.line ?? undefined}>{b.line}</td>
                            <td title={b.pol ?? undefined}>{b.pol}</td>
                            {!isCustomer && (
                              <td title={customerName}>
                                {customerName.length > 20
                                  ? `${customerName.slice(0, 20)}...`
                                  : customerName}
                              </td>
                            )}

                            <td title={t(`enums.bookingStatus.${b.status}`)}>
                              <span className={`badge badge-status-${b.status.toLowerCase()}`}>
                                {t(`enums.bookingStatus.${b.status}`)}
                              </span>
                            </td>
                            <td>
                              <MissingDocsBadge missing={b.missingDocumentTypes} />
                            </td>
                            <td title={b.notes ?? undefined}>
                              <CutoffBadge level={level} /> {b.notes}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {!isCustomer && (
                                <div className="booking-list__actions">
                                  <button
                                    className="btn secondary small"
                                    onClick={() => navigate(`/bookings/${b.id}/edit`)}
                                  >
                                    {t('bookings.editButton')}
                                  </button>
                                  {ARCHIVABLE_BOOKING_STATUSES.includes(b.status) && (
                                    <button
                                      className="btn secondary small"
                                      onClick={() => handleArchive(b.id)}
                                    >
                                      {t('bookings.archiveButton')}
                                    </button>
                                  )}
                                  <button
                                    className="btn danger small"
                                    disabled={pendingBookingIds.has(b.id)}
                                    onClick={() => handleDelete(b.id, b.bookingNo)}
                                  >
                                    {t('common.delete')}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
