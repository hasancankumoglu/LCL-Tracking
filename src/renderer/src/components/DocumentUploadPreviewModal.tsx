import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocumentType } from '@shared/types'

export interface PendingDocumentFile {
  path: string
  name: string
  valid: boolean
}

interface Props {
  type: DocumentType
  files: PendingDocumentFile[]
  onCancel: () => void
  onConfirm: (paths: string[]) => Promise<void> | void
}

export default function DocumentUploadPreviewModal({
  type,
  files,
  onCancel,
  onConfirm
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<PendingDocumentFile[]>(files)
  const [uploading, setUploading] = useState(false)

  const validItems = items.filter((f) => f.valid)
  const invalidCount = items.length - validItems.length

  function removeItem(path: string): void {
    setItems((prev) => prev.filter((f) => f.path !== path))
  }

  async function handleConfirm(): Promise<void> {
    if (validItems.length === 0) return
    setUploading(true)
    try {
      await onConfirm(validItems.map((f) => f.path))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t('documents.uploadPreviewTitle', { type: t(`enums.documentType.${type}`) })}</h2>

        {invalidCount > 0 && (
          <div className="import-preview-errors">
            {t('documents.unsupportedExtensionWarning', { count: invalidCount })}
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-state">{t('documents.noFilesLeft')}</div>
        ) : (
          <ul className="doc-upload-list">
            {items.map((f) => (
              <li
                key={f.path}
                className={`doc-upload-list__item${f.valid ? '' : ' doc-upload-list__item--invalid'}`}
              >
                <span className="doc-upload-list__name" title={f.path}>
                  {f.name}
                </span>
                {!f.valid && (
                  <span className="badge badge-critical">{t('documents.unsupported')}</span>
                )}
                <button
                  type="button"
                  className="doc-upload-list__remove"
                  title={t('documents.removeFromList')}
                  onClick={() => removeItem(f.path)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="form-actions">
          <button className="btn secondary" onClick={onCancel} disabled={uploading}>
            {t('common.cancel')}
          </button>
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={uploading || validItems.length === 0}
          >
            {uploading
              ? t('common.loading')
              : t('documents.uploadButton', { count: validItems.length })}
          </button>
        </div>
      </div>
    </div>
  )
}
