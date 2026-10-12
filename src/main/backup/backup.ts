import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, copyFileSync, statSync, cpSync } from 'fs'
import { tmpdir } from 'os'
import AdmZip from 'adm-zip'
import { getDb, getDbPath, closeDb } from '../db/schema'
import { getDocumentsRoot } from '../documents/storage'
import { getBackupConfig, updateBackupConfig } from './config'
import { describeFsError } from '../utils/fsErrors'
import { logError, logInfo } from '../logging/logger'
import type { BackupResult, RestoreResult } from '../../shared/types'

function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`
}

async function buildBackupZip(destZipPath: string): Promise<void> {
  const tmpDbPath = join(tmpdir(), `halils-portal-backup-${Date.now()}.db`)
  try {
    const db = getDb()
    await db.backup(tmpDbPath)

    const zip = new AdmZip()
    zip.addLocalFile(tmpDbPath, '', 'halils-portal.db')

    const documentsRoot = getDocumentsRoot()
    if (existsSync(documentsRoot)) {
      zip.addLocalFolder(documentsRoot, 'documents')
    }

    zip.writeZip(destZipPath)
  } finally {
    if (existsSync(tmpDbPath)) rmSync(tmpDbPath, { force: true })
  }
}

export async function createBackup(targetFolder: string): Promise<BackupResult> {
  try {
    if (!targetFolder) {
      return { success: false, error: 'Yedek klasörü seçilmemiş.' }
    }
    if (!existsSync(targetFolder)) {
      return {
        success: false,
        error: `Yedek klasörüne erişilemiyor: ${targetFolder}. Klasörün bağlı/erişilebilir olduğundan emin olun.`
      }
    }

    const fileName = `HalilsPortal-Yedek-${timestamp()}.zip`
    const destZipPath = join(targetFolder, fileName)

    await buildBackupZip(destZipPath)

    const sizeBytes = statSync(destZipPath).size
    return { success: true, filePath: destZipPath, sizeBytes }
  } catch (err) {
    logError('createBackup', err, { targetFolder })
    return { success: false, error: describeFsError(err, targetFolder) }
  }
}

/** Ayarlarda kayıtlı klasöre yedek alır ve backup-config.json'u günceller. */
export async function runConfiguredBackup(): Promise<BackupResult> {
  const config = getBackupConfig()
  if (!config.backupFolder) {
    return { success: false, error: 'Yedek klasörü henüz ayarlanmamış.' }
  }

  const result = await createBackup(config.backupFolder)

  updateBackupConfig({
    lastBackupAt: new Date().toISOString(),
    lastBackupStatus: result.success ? 'success' : 'error',
    lastBackupError: result.success ? null : (result.error ?? 'Bilinmeyen hata')
  })

  return result
}

export async function restoreBackup(zipPath: string): Promise<RestoreResult> {
  let tmpExtractDir: string | null = null
  try {
    if (!existsSync(zipPath)) {
      return { success: false, error: 'Seçilen yedek dosyası bulunamadı.' }
    }

    tmpExtractDir = join(tmpdir(), `halils-portal-restore-${Date.now()}`)
    mkdirSync(tmpExtractDir, { recursive: true })

    const zip = new AdmZip(zipPath)
    zip.extractAllTo(tmpExtractDir, true)

    const extractedDbPath = join(tmpExtractDir, 'halils-portal.db')
    if (!existsSync(extractedDbPath)) {
      return { success: false, error: 'Geçersiz yedek dosyası: veritabanı bulunamadı.' }
    }

    // Geri yükleme öncesi mevcut durumun güvenlik kopyasını al (yanlış dosya seçimine karşı).
    const preRestoreDir = join(app.getPath('userData'), 'pre-restore-backups')
    mkdirSync(preRestoreDir, { recursive: true })
    const safetyResult = await createBackup(preRestoreDir)
    if (!safetyResult.success) {
      return {
        success: false,
        error: `Geri yükleme öncesi güvenlik kopyası alınamadı, işlem iptal edildi: ${safetyResult.error}`
      }
    }

    closeDb()

    const liveDbPath = getDbPath()
    copyFileSync(extractedDbPath, liveDbPath)
    for (const ext of ['-wal', '-shm']) {
      const sidecarPath = liveDbPath + ext
      if (existsSync(sidecarPath)) rmSync(sidecarPath, { force: true })
    }

    const extractedDocsDir = join(tmpExtractDir, 'documents')
    const liveDocsDir = getDocumentsRoot()
    try {
      if (existsSync(liveDocsDir)) {
        // maxRetries/retryDelay: Windows'ta bir klasör silindikten hemen sonra aynı yola
        // yazmaya çalışmak EPERM/EBUSY hatası verebilir (antivirüs/OneDrive/gezgin kilidi).
        rmSync(liveDocsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      }
      // Yedekte documents klasörü olmasa bile (örn. tüm dökümanlar silinmişse), geri yükleme
      // sonrasında klasörün her zaman var olduğundan emin ol - aksi halde bir sonraki döküman
      // yükleme/yedekleme işlemi "documents klasörü bulunamadı" tarzı yetki hatası verebilir.
      mkdirSync(liveDocsDir, { recursive: true })
      if (existsSync(extractedDocsDir)) {
        cpSync(extractedDocsDir, liveDocsDir, { recursive: true, force: true })
      }
      logInfo('restoreBackup', `Documents klasörü geri yüklendi: ${liveDocsDir}`)
    } catch (err) {
      logError('restoreBackup:documents', err, { liveDocsDir, extractedDocsDir })
      return { success: false, error: describeFsError(err, liveDocsDir) }
    }

    return { success: true }
  } catch (err) {
    logError('restoreBackup', err, { zipPath })
    return { success: false, error: describeFsError(err, getDocumentsRoot()) }
  } finally {
    if (tmpExtractDir && existsSync(tmpExtractDir)) {
      rmSync(tmpExtractDir, { recursive: true, force: true })
    }
  }
}
