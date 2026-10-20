import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        <h2>{t('excelImport.previewTitle')}</h2>

        <div className="import-preview-summary">
          <div className="import-preview-summary__item">
            <strong>{preview.bookingsToCreate}</strong>
            <span>{t('excelImport.newBookingsCount')}</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.bookingsToUpdate}</strong>
            <span>{t('excelImport.bookingsToUpdateCount')}</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.containersToCreate}</strong>
            <span>{t('excelImport.newContainersCount')}</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.unassignedVehiclesToCreate}</strong>
            <span>{t('excelImport.unassignedVehicleCount')}</span>
          </div>
          <div className="import-preview-summary__item">
            <strong>{preview.errors.length}</strong>
            <span>{t('excelImport.warningsErrorsCount')}</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          {t('excelImport.bookingFileLabel')}: {preview.bookingsFileName ?? '—'} ·{' '}
          {t('excelImport.containerFileLabel')}: {preview.containersFileName ?? '—'}
        </div>

        {preview.errors.length > 0 && (
          <div className="import-preview-errors">
            <strong>{t('excelImport.warningsErrorsHeading', { count: preview.errors.length })}</strong>
            <ul>
              {preview.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {preview.bookingRows.length > 0 && (
          <div className="import-preview-section">
            <strong>{t('excelImport.bookingsHeading', { count: preview.bookingRows.length })}</strong>
            <div className="table-scroll import-preview-table-scroll">
              <table className="data-table">
                {/* Bu başlıklar gerçek Excel kolon adlarını yansıtır - kasıtlı olarak çevrilmez. */}
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
                          {row.action === 'create' ? t('excelImport.newBadge') : t('excelImport.updateBadge')}
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
            <strong>
              {t('excelImport.containersHeading', { count: preview.containerRows.length })}
            </strong>
            <div className="table-scroll import-preview-table-scroll">
              <table className="data-table">
                {/* Bu başlıklar gerçek Excel kolon adlarını yansıtır - kasıtlı olarak çevrilmez. */}
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
            <strong>
              {t('excelImport.unassignedVehiclesHeading', {
                count: preview.unassignedVehicleRows.length
              })}
            </strong>
            <div className="table-scroll import-preview-table-scroll">
              <table className="data-table">
                {/* Bu başlıklar gerçek Excel kolon adlarını yansıtır - kasıtlı olarak çevrilmez. */}
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
          <div className="empty-state">{t('excelImport.noDataFound')}</div>
        )}

        <div className="form-actions">
          <button className="btn secondary" onClick={onCancel} disabled={importing}>
            {t('common.cancel')}
          </button>
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={importing || hasBlockingIssue || !hasRows}
          >
            {importing ? t('excelImport.importingButton') : t('excelImport.confirmImportButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
