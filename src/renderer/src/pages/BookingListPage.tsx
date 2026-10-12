import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BookingWithStats, BookingStatus, ExcelPreviewResult } from '@shared/types'
import { ARCHIVABLE_BOOKING_STATUSES, BOOKING_STATUSES, BOOKING_STATUS_LABELS } from '@shared/types'
import { getCutoffLevel, cutoffLevelToRowClass } from '../lib/cutoff'
import { formatDate } from '../lib/format'
import ExcelImportPreviewModal from '../components/ExcelImportPreviewModal'
import MissingDocsBadge from '../components/MissingDocsBadge'

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
  if (level === 'none') return null
  const label = level === 'critical' ? 'Kritik' : level === 'warning' ? 'Yaklaşıyor' : 'Normal'
  return <span className={`badge badge-${level === 'ok' ? 'ok' : level}`}>{label}</span>
}

export default function BookingListPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<BookingWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [destinationFilter, setDestinationFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('')
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [showImportPicker, setShowImportPicker] = useState(false)
  const [preview, setPreview] = useState<ExcelPreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function refresh(): Promise<void> {
    setLoading(true)
    const data = await window.api.bookings.list()
    setBookings(data)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
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
      if (!term) return true
      return (
        b.bookingNo.toLowerCase().includes(term) ||
        (b.line ?? '').toLowerCase().includes(term) ||
        (b.pol ?? '').toLowerCase().includes(term) ||
        (b.category ?? '').toLowerCase().includes(term) ||
        (b.destination ?? '').toLowerCase().includes(term)
      )
    })
  }, [bookings, search, destinationFilter, categoryFilter, statusFilter])

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

  async function handleDelete(id: number, bookingNo: string): Promise<void> {
    const confirmed = window.confirm(
      `"${bookingNo}" booking'ini ve bağlı tüm konteyner/dökümanlarını silmek istediğinize emin misiniz?`
    )
    if (!confirmed) return
    await window.api.bookings.remove(id)
    await refresh()
  }

  async function handleArchive(id: number): Promise<void> {
    try {
      await window.api.bookings.archive(id, true)
      await refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Arşivlenirken bir hata oluştu.')
    }
  }

  async function handleExport(): Promise<void> {
    const res = await window.api.excel.export()
    if (!res.canceled) {
      setImportMessage(
        `Excel dosyaları kaydedildi: ${res.bookingsFilePath} ve ${res.containersFilePath}`
      )
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
      window.alert(
        err instanceof Error ? err.message : 'Excel dosyaları önizlenirken bir hata oluştu.'
      )
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
    let msg = `İçe aktarma tamamlandı: ${r.bookingsCreated} yeni booking, ${r.bookingsUpdated} güncellenen booking, ${r.containersCreated} konteyner eklendi.`
    if (r.unassignedVehiclesCreated > 0) {
      msg += ` ${r.unassignedVehiclesCreated} kayıt "Atanmayan Araçlar" sayfasına eklendi.`
    }
    if (r.errors.length > 0) {
      msg += ` Uyarılar (${r.errors.length}): ${r.errors.slice(0, 5).join(' | ')}`
    }
    setImportMessage(msg)
    setPreview(null)
    setShowImportPicker(false)
    await refresh()
  }

  return (
    <div>
      <div className="page-title">
        <h1>Bookingler</h1>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Booking no, hat, liman, hedef ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select-input"
          value={destinationFilter}
          onChange={(e) => setDestinationFilter(e.target.value)}
        >
          <option value="">Tüm hedefler</option>
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
          <option value="">Tüm kategoriler</option>
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
          <option value="">Tüm stüatler</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
        <button className="btn secondary" onClick={handleOpenImportPicker}>
          Excel&apos;den İçe Aktar
        </button>
        <button className="btn secondary" onClick={handleExport}>
          Excel&apos;e Aktar
        </button>
        <button className="btn" onClick={() => navigate('/bookings/new')}>
          + Yeni Booking
        </button>
      </div>

      {importMessage && (
        <div className="surface" style={{ padding: 12, marginBottom: 14, fontSize: 13 }}>
          {importMessage}
        </div>
      )}

      {showImportPicker && !preview && (
        <div className="modal-overlay" onClick={handleCloseImportPicker}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>Excel&apos;den İçe Aktar</h2>
            <div
              className={`dropzone dropzone--large${isDragging ? ' dropzone--active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handlePickImportFolder}
              role="button"
              tabIndex={0}
            >
              {previewLoading
                ? 'Excel dosyaları okunuyor...'
                : 'Bookings.xlsx ve Containers.xlsx dosyalarını (veya klasörünü) buraya sürükleyip bırakın ya da tıklayarak seçin'}
            </div>
            <div className="form-actions">
              <button className="btn secondary" onClick={handleCloseImportPicker}>
                Vazgeç
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
        {loading ? (
          <div className="empty-state">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Kayıt bulunamadı.</div>
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
                  <span className="booking-category__count">{items.length} booking</span>
                </button>
                {!isCollapsed && (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Booking</th>
                        <th>Vessel Departure</th>
                        <th>Declaration Cut Off</th>
                        <th>SI Cut Off</th>
                        <th>Container Size</th>
                        <th>Unit</th>
                        <th>Destination</th>
                        <th>Line</th>
                        <th>POL</th>
                        <th>Statü</th>
                        <th>Evrak</th>
                        <th>Not</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((b) => {
                        const level = getCutoffLevel(b.declarationCutOff, b.siCutOff)
                        return (
                          <tr
                            key={b.id}
                            className={cutoffLevelToRowClass(level)}
                            onClick={() => navigate(`/bookings/${b.id}`)}
                          >
                            <td>
                              <strong>{b.bookingNo}</strong>
                            </td>
                            <td>{formatDate(b.vesselDeparture)}</td>
                            <td>{formatDate(b.declarationCutOff)}</td>
                            <td>{formatDate(b.siCutOff)}</td>
                            <td>{b.containerSizes}</td>
                            <td>{b.containerCount}</td>
                            <td>{b.destination}</td>
                            <td>{b.line}</td>
                            <td>{b.pol}</td>
                            <td>
                              <span className={`badge badge-status-${b.status.toLowerCase()}`}>
                                {BOOKING_STATUS_LABELS[b.status]}
                              </span>
                            </td>
                            <td>
                              <MissingDocsBadge missing={b.missingDocumentTypes} />
                            </td>
                            <td>
                              <CutoffBadge level={level} /> {b.notes}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <button
                                className="btn secondary small"
                                onClick={() => navigate(`/bookings/${b.id}/edit`)}
                              >
                                Düzenle
                              </button>{' '}
                              {ARCHIVABLE_BOOKING_STATUSES.includes(b.status) && (
                                <button
                                  className="btn secondary small"
                                  onClick={() => handleArchive(b.id)}
                                >
                                  Arşivle
                                </button>
                              )}{' '}
                              <button
                                className="btn danger small"
                                onClick={() => handleDelete(b.id, b.bookingNo)}
                              >
                                Sil
                              </button>
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
