import { useState } from 'react'
import type { DocumentType } from '@shared/types'
import { DOCUMENT_TYPE_LABELS } from '@shared/types'

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
        <h2>Döküman Yükleme Önizlemesi — {DOCUMENT_TYPE_LABELS[type]}</h2>

        {invalidCount > 0 && (
          <div className="import-preview-errors">
            {invalidCount} dosya desteklenmeyen bir uzantıya sahip olduğu için listeden çıkarılacak
            (izin verilenler: jpg, jpeg, png, webp, pdf).
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-state">Yüklenecek dosya kalmadı.</div>
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
                {!f.valid && <span className="badge badge-critical">Desteklenmiyor</span>}
                <button
                  type="button"
                  className="doc-upload-list__remove"
                  title="Listeden çıkar"
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
            Vazgeç
          </button>
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={uploading || validItems.length === 0}
          >
            {uploading ? 'Yükleniyor...' : `Yükle (${validItems.length} dosya)`}
          </button>
        </div>
      </div>
    </div>
  )
}
