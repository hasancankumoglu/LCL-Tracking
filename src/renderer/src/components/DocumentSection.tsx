import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppDocument, DocumentType } from '@shared/types'
import { DOCUMENT_ALLOWED_EXTENSIONS } from '@shared/types'
import Lightbox from './Lightbox'
import DocumentUploadPreviewModal, { type PendingDocumentFile } from './DocumentUploadPreviewModal'

interface AddButtonState {
  onClick: () => void
  disabled: boolean
  label: string
}

interface Props {
  bookingId: number
  type: DocumentType
  onChange?: () => void
  onAddButtonChange?: (state: AddButtonState) => void
  /** true ise yükleme/silme kontrolleri gizlenir, sadece görüntüleme/indirme kalır (Customer rolü). */
  readOnly?: boolean
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

function isImage(fileName: string | null): boolean {
  if (!fileName) return false
  const lower = fileName.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

function hasAllowedExtension(fileName: string): boolean {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  return DOCUMENT_ALLOWED_EXTENSIONS.includes(ext)
}

export default function DocumentSection({
  bookingId,
  type,
  onChange,
  onAddButtonChange,
  readOnly
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [documents, setDocuments] = useState<AppDocument[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showUploadPicker, setShowUploadPicker] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingDocumentFile[] | null>(null)

  async function refresh(): Promise<void> {
    const all = await window.api.documents.listByBooking(bookingId)
    setDocuments(all.filter((d) => d.type === type))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, type])

  function handleOpenUploadPicker(): void {
    setShowUploadPicker(true)
  }

  function handleCloseUploadPicker(): void {
    setShowUploadPicker(false)
  }

  useEffect(() => {
    if (readOnly) return
    onAddButtonChange?.({
      onClick: handleOpenUploadPicker,
      disabled: uploading,
      label: uploading ? t('common.loading') : t('documents.addFileButton')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading, t, readOnly])

  async function handleAdd(): Promise<void> {
    const paths = await window.api.documents.pickFiles()
    if (paths.length === 0) return
    setPendingFiles(
      paths.map((p) => ({ path: p, name: baseName(p), valid: hasAllowedExtension(p) }))
    )
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    setPendingFiles(
      files.map((f) => {
        const path = window.api.getPathForFile(f)
        return { path, name: baseName(path), valid: hasAllowedExtension(path) }
      })
    )
  }

  function handleCancelUpload(): void {
    setPendingFiles(null)
    setShowUploadPicker(false)
  }

  async function handleConfirmUpload(paths: string[]): Promise<void> {
    setUploading(true)
    try {
      await window.api.documents.add(bookingId, type, paths)
      await refresh()
      onChange?.()
      setPendingFiles(null)
      setShowUploadPicker(false)
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(id: number): Promise<void> {
    const confirmed = window.confirm(t('documents.confirmDelete'))
    if (!confirmed) return
    await window.api.documents.remove(id)
    await refresh()
    onChange?.()
  }

  function handleOpen(doc: AppDocument): void {
    if (isImage(doc.originalFileName)) {
      setPreview(window.api.documents.toFileUrl(doc.filePath))
    } else {
      window.api.documents.open(doc.filePath)
    }
  }

  async function handleDownload(doc: AppDocument): Promise<void> {
    await window.api.documents.download(doc.filePath, doc.originalFileName ?? undefined)
  }

  return (
    <div>
      {documents.length === 0 ? (
        <div className="empty-state">{t('documents.noDocsYet')}</div>
      ) : (
        <div className="doc-gallery">
          {documents.map((doc) => (
            <div className="doc-thumb" key={doc.id}>
              {isImage(doc.originalFileName) ? (
                <img
                  src={window.api.documents.toFileUrl(doc.filePath)}
                  alt={doc.originalFileName ?? t('documents.documentAlt')}
                  onClick={() => handleOpen(doc)}
                />
              ) : (
                <div className="doc-thumb__file" onClick={() => handleOpen(doc)}>
                  {doc.originalFileName ?? t('documents.file')}
                </div>
              )}
              <button
                className="doc-thumb__download"
                title={t('common.download')}
                onClick={() => handleDownload(doc)}
              >
                ⭳
              </button>
              {!readOnly && (
                <button
                  className="doc-thumb__remove"
                  title={t('common.delete')}
                  onClick={() => handleRemove(doc.id)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}
      {showUploadPicker && !pendingFiles && (
        <div className="modal-overlay" onClick={handleCloseUploadPicker}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('documents.addDocumentTitle')}</h2>
            <div
              className={`dropzone dropzone--large${isDragging ? ' dropzone--active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleAdd}
              role="button"
              tabIndex={0}
            >
              {t('documents.dropzoneHint')}
            </div>
            <div className="form-actions">
              <button className="btn secondary" onClick={handleCloseUploadPicker}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingFiles && (
        <DocumentUploadPreviewModal
          type={type}
          files={pendingFiles}
          onCancel={handleCancelUpload}
          onConfirm={handleConfirmUpload}
        />
      )}
    </div>
  )
}
