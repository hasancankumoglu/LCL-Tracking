import { app } from 'electron'
import { join, extname, basename } from 'path'
import { mkdirSync, copyFileSync, existsSync, unlinkSync, rmSync } from 'fs'
import type { DocumentType } from '../../shared/types'
import { logError, logInfo } from '../logging/logger'
import { describeFsError } from '../utils/fsErrors'

export function getDocumentsRoot(): string {
  return join(app.getPath('userData'), 'documents')
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function copyIntoStorage(
  bookingId: number,
  type: DocumentType,
  sourcePath: string
): { storedPath: string; originalFileName: string } {
  const dir = join(getDocumentsRoot(), String(bookingId), type)
  try {
    mkdirSync(dir, { recursive: true })
  } catch (err) {
    logError('copyIntoStorage:mkdir', err, { dir, bookingId, type })
    throw new Error(describeFsError(err, dir))
  }

  const originalFileName = basename(sourcePath)
  const ext = extname(originalFileName)
  const base = sanitize(originalFileName.slice(0, originalFileName.length - ext.length))
  const uniqueName = `${Date.now()}_${base}${ext}`
  const destPath = join(dir, uniqueName)

  try {
    copyFileSync(sourcePath, destPath)
  } catch (err) {
    logError('copyIntoStorage:copyFile', err, { sourcePath, destPath, bookingId, type })
    throw new Error(describeFsError(err, destPath))
  }

  logInfo('copyIntoStorage', `Döküman kopyalandı: ${destPath}`)
  return { storedPath: destPath, originalFileName }
}

export function removeFromStorage(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}

/** Bir booking silindiğinde, o booking'e ait tüm döküman dosyalarını diskten temizler. */
export function removeBookingDocumentsFolder(bookingId: number): void {
  const dir = join(getDocumentsRoot(), String(bookingId))
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}
