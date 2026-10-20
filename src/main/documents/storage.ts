import { basename, extname } from 'path'
import { readFileSync } from 'fs'
import { getSupabase } from '../db/schema'
import type { DocumentType } from '../../shared/types'
import { logError, logInfo } from '../logging/logger'
import { describeFsError } from '../utils/fsErrors'
import { DOCUMENTS_BUCKET as BUCKET, toPublicUrl } from '../../shared/storage'
import { mt } from '../i18n/language'

export { toPublicUrl }

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export function resolveContentType(fileName: string): string {
  return MIME_TYPES_BY_EXTENSION[extname(fileName).toLowerCase()] ?? 'application/octet-stream'
}

export async function copyIntoStorage(
  bookingId: number,
  type: DocumentType,
  sourcePath: string
): Promise<{ storedPath: string; originalFileName: string }> {
  const originalFileName = basename(sourcePath)
  const ext = extname(originalFileName)
  const base = sanitize(originalFileName.slice(0, originalFileName.length - ext.length))
  const uniqueName = `${Date.now()}_${base}${ext}`
  const storedPath = `${bookingId}/${type}/${uniqueName}`

  let fileBuffer: Buffer
  try {
    fileBuffer = readFileSync(sourcePath)
  } catch (err) {
    logError('copyIntoStorage:readFile', err, { sourcePath, bookingId, type })
    throw new Error(describeFsError(err, sourcePath))
  }

  const supabase = getSupabase()
  const { error } = await supabase.storage.from(BUCKET).upload(storedPath, fileBuffer, {
    contentType: resolveContentType(originalFileName),
    upsert: false
  })
  if (error) {
    logError('copyIntoStorage:upload', error, { storedPath, bookingId, type })
    throw new Error(mt('errors.documentUploadFailed', { message: error.message }))
  }

  logInfo('copyIntoStorage', `Döküman yüklendi: ${storedPath}`)
  return { storedPath, originalFileName }
}

export async function removeFromStorage(storedPath: string): Promise<void> {
  const supabase = getSupabase()
  await supabase.storage.from(BUCKET).remove([storedPath])
}

export async function downloadFromStorage(storedPath: string): Promise<Buffer> {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage.from(BUCKET).download(storedPath)
  if (error) throw new Error(mt('errors.documentDownloadFailed', { message: error.message }))
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/** Bir booking silindiğinde, o booking'e ait tüm döküman dosyalarını Storage'dan temizler. */
export async function removeBookingDocumentsFolder(bookingId: number): Promise<void> {
  const supabase = getSupabase()
  const docTypes = ['BEYANNAME', 'VGM', 'TALIMAT', 'BOOKING_CONFIRMATION', 'DRAFT_BL']
  for (const type of docTypes) {
    const { data, error } = await supabase.storage.from(BUCKET).list(`${bookingId}/${type}`)
    if (error || !data || data.length === 0) continue
    await supabase.storage.from(BUCKET).remove(data.map((f) => `${bookingId}/${type}/${f.name}`))
  }
}
