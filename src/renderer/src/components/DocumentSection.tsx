import { useEffect, useState } from 'react'
import type { AppDocument, DocumentType } from '@shared/types'
import { DOCUMENT_ALLOWED_EXTENSIONS } from '@shared/types'
import Lightbox from './Lightbox'
import DocumentUploadPreviewModal, { type PendingDocumentFile } from './DocumentUploadPreviewModal'

interface Props {
  bookingId: number
  type: DocumentType
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

export default function DocumentSection({ bookingId, type }: Props): React.JSX.Element {
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
      setPendingFiles(null)
      setShowUploadPicker(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Döküman yüklenirken bir hata oluştu.')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(id: number): Promise<void> {
    const confirmed = window.confirm('Bu dökümanı silmek istediğinize emin misiniz?')
    if (!confirmed) return
    await window.api.documents.remove(id)
    await refresh()
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
      <div className="containers-toolbar">
        <button className="btn small" onClick={handleOpenUploadPicker} disabled={uploading}>
          {uploading ? 'Yükleniyor...' : '+ Resim/Dosya Ekle'}
        </button>
      </div>
      {documents.length === 0 ? (
        <div className="empty-state">Bu tür için henüz döküman eklenmedi.</div>
      ) : (
        <div className="doc-gallery">
          {documents.map((doc) => (
            <div className="doc-thumb" key={doc.id}>
              {isImage(doc.originalFileName) ? (
                <img
                  src={window.api.documents.toFileUrl(doc.filePath)}
                  alt={doc.originalFileName ?? 'döküman'}
                  onClick={() => handleOpen(doc)}
                />
              ) : (
                <div className="doc-thumb__file" onClick={() => handleOpen(doc)}>
                  {doc.originalFileName ?? 'Dosya'}
                </div>
              )}
              <button
                className="doc-thumb__download"
                title="İndir"
                onClick={() => handleDownload(doc)}
              >
                ⭳
              </button>
              <button
                className="doc-thumb__remove"
                title="Sil"
                onClick={() => handleRemove(doc.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}
      {showUploadPicker && !pendingFiles && (
        <div className="modal-overlay" onClick={handleCloseUploadPicker}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>Döküman Ekle</h2>
            <div
              className={`dropzone dropzone--large${isDragging ? ' dropzone--active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleAdd}
              role="button"
              tabIndex={0}
            >
              Dosyaları buraya sürükleyip bırakın ya da tıklayarak seçin
            </div>
            <div className="form-actions">
              <button className="btn secondary" onClick={handleCloseUploadPicker}>
                Vazgeç
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
