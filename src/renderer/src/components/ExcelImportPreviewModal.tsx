import { useState } from 'react'
import type { ExcelPreviewResult } from '@shared/types'
import { BOOKING_STATUS_LABELS } from '@shared/types'

interface Props {
  preview: ExcelPreviewResult
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

export default function ExcelImportPreviewModal({
  preview,
  onCancel,
  onConfirm
}: Props): React.JSX.Element {
  const [importing, setImporting] = useState(false)
  const hasBlockingIssue = !preview.bookingsFileName || !preview.containersFileName
  const hasRows =
    preview.bookingRows.length > 0 ||
    preview.containerRows.length > 0 ||
    preview.unassignedVehicleRows.length > 0

  async function handleConfirm(): Promise<void> {
    setImporting(true)
    try {
      await onConfirm()
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <h2>Excel İçe Aktarma Önizlemesi</h2>

        <div className="import-preview-summary">
          <div className="import-preview-summary__item">
            <strong>{preview.bookingsToCreate}</strong>
            <span>Yeni booking</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.bookingsToUpdate}</strong>
            <span>Güncellenecek booking</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.containersToCreate}</strong>
            <span>Yeni konteyner</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.unassignedVehiclesToCreate}</strong>
            <span>Atanmayan araç</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.errors.length}</strong>
            <span>Uyarı/Hata</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          Booking dosyası: {preview.bookingsFileName ?? '—'} · Konteyner dosyası:{' '}
          {preview.containersFileName ?? '—'}
        </div>

        {preview.errors.length > 0 && (
          <div className="import-preview-errors">
            <strong>Uyarılar / Hatalar ({preview.errors.length})</strong>
            <ul>
              {preview.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {preview.bookingRows.length > 0 && (
          <div className="import-preview-section">
            <strong>Bookingler ({preview.bookingRows.length})</strong>
            <div className="table-scroll import-preview-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Durum</th>
                    <th>Sekme</th>
                    <th>Satır</th>
                    <th>Booking</th>
                    <th>Statü</th>
                    <th>Hedef</th>
                    <th>Hat</th>
                    <th>POL</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.bookingRows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <span
                          className={`badge ${row.action === 'create' ? 'badge-ok' : 'badge-warning'}`}
                        >
                          {row.action === 'create' ? 'Yeni' : 'Güncelle'}
                        </span>
                      </td>
                      <td>{row.sheetName}</td>
                      <td>{row.rowNumber}</td>
                      <td>{row.bookingNo}</td>
                      <td>{BOOKING_STATUS_LABELS[row.status]}</td>
                      <td>{row.destination}</td>
                      <td>{row.line}</td>
                      <td>{row.pol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview.containerRows.length > 0 && (
          <div className="import-preview-section">
            <strong>Konteynerlar ({preview.containerRows.length})</strong>
            <div className="table-scroll import-preview-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sekme</th>
                    <th>Satır</th>
                    <th>Booking</th>
                    <th>Konteyner No</th>
                    <th>Tip</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.containerRows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.sheetName}</td>
                      <td>{row.rowNumber}</td>
                      <td>{row.bookingNo}</td>
                      <td>{row.containerNo}</td>
                      <td>{row.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview.unassignedVehicleRows.length > 0 && (
          <div className="import-preview-section">
            <strong>Atanmayan Araçlar ({preview.unassignedVehicleRows.length})</strong>
            <div className="table-scroll import-preview-table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sekme</th>
                    <th>Satır</th>
                    <th>Çekici</th>
                    <th>Konteyner No</th>
                    <th>BL / Booking Referansı</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.unassignedVehicleRows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.sheetName}</td>
                      <td>{row.rowNumber}</td>
                      <td>{row.truckPlate ?? '-'}</td>
                      <td>{row.containerNo ?? '-'}</td>
                      <td>{row.sourceBookingRef ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!hasRows && preview.errors.length === 0 && (
          <div className="empty-state">İçe aktarılacak veri bulunamadı.</div>
        )}

        <div className="form-actions">
          <button className="btn secondary" onClick={onCancel} disabled={importing}>
            Vazgeç
          </button>
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={importing || hasBlockingIssue || !hasRows}
          >
            {importing ? 'İçe Aktarılıyor...' : 'Onayla ve İçe Aktar'}
          </button>
        </div>
      </div>
    </div>
  )
}
