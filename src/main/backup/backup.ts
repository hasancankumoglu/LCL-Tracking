import { join } from 'path'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import AdmZip from 'adm-zip'
import { getSupabase } from '../db/schema'
import { getBackupConfig, updateBackupConfig } from './config'
import { describeFsError } from '../utils/fsErrors'
import { logError, logInfo } from '../logging/logger'
import { mt } from '../i18n/language'
import type { BackupResult, RestoreResult } from '../../shared/types'

// Yedekleme artık sadece Postgres (Supabase) verisinin JSON dump'ı - döküman dosyaları
// Supabase Storage'da zaten dayanıklı şekilde saklandığı için burada tekrar indirilmiyor.
const TABLES = [
  'bookings',
  'containers',
  'documents',
  'lookup_values',
  'unassigned_vehicles'
] as const
// Restore sırasında FK bağımlılıkları yüzünden silme/ekleme bu sırayla yapılmalı.
const DELETE_ORDER = [
  'containers',
  'documents',
  'bookings',
  'lookup_values',
  'unassigned_vehicles'
] as const
const INSERT_ORDER = [
  'bookings',
  'containers',
  'documents',
  'lookup_values',
  'unassigned_vehicles'
] as const

function timestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`
}

async function buildBackupZip(destZipPath: string): Promise<void> {
  const supabase = getSupabase()
  const tmpDir = join(tmpdir(), `lcl-tracking-backup-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  try {
    const zip = new AdmZip()
    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw new Error(mt('errors.tableReadFailed', { table, message: error.message }))
      const filePath = join(tmpDir, `${table}.json`)
      writeFileSync(filePath, JSON.stringify(data ?? []), 'utf-8')
      zip.addLocalFile(filePath, '', `${table}.json`)
    }
    zip.writeZip(destZipPath)
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function createBackup(targetFolder: string): Promise<BackupResult> {
  try {
    if (!targetFolder) {
      return { success: false, error: mt('errors.noBackupFolderSelected') }
    }
    if (!existsSync(targetFolder)) {
      return {
        success: false,
        error: mt('errors.backupFolderInaccessible', { folder: targetFolder })
      }
    }

    const fileName = `LCLTracking-Yedek-${timestamp()}.zip`
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
    return { success: false, error: mt('errors.backupFolderNotConfigured') }
  }

  const result = await createBackup(config.backupFolder)

  updateBackupConfig({
    lastBackupAt: new Date().toISOString(),
    lastBackupStatus: result.success ? 'success' : 'error',
    lastBackupError: result.success ? null : (result.error ?? mt('errors.unknownError'))
  })

  return result
}

export async function restoreBackup(zipPath: string): Promise<RestoreResult> {
  let tmpExtractDir: string | null = null
  try {
    if (!existsSync(zipPath)) {
      return { success: false, error: mt('errors.backupFileNotFound') }
    }

    tmpExtractDir = join(tmpdir(), `lcl-tracking-restore-${Date.now()}`)
    mkdirSync(tmpExtractDir, { recursive: true })

    const zip = new AdmZip(zipPath)
    zip.extractAllTo(tmpExtractDir, true)

    const dumps: Partial<Record<(typeof TABLES)[number], unknown[]>> = {}
    for (const table of TABLES) {
      const filePath = join(tmpExtractDir, `${table}.json`)
      if (!existsSync(filePath)) {
        return { success: false, error: mt('errors.invalidBackupFile', { table }) }
      }
      dumps[table] = JSON.parse(readFileSync(filePath, 'utf-8'))
    }

    // Geri yükleme öncesi mevcut durumun güvenlik kopyasını al (yanlış dosya seçimine karşı).
    const supabase = getSupabase()
    const preRestoreDir = join(tmpdir(), 'lcl-tracking-pre-restore-backups')
    mkdirSync(preRestoreDir, { recursive: true })
    const safetyResult = await createBackup(preRestoreDir)
    if (!safetyResult.success) {
      return {
        success: false,
        error: mt('errors.safetyBackupFailed', { error: safetyResult.error ?? '' })
      }
    }

    for (const table of DELETE_ORDER) {
      const { error } = await supabase.from(table).delete().not('id', 'is', null)
      if (error) throw new Error(mt('errors.tableClearFailed', { table, message: error.message }))
    }
    for (const table of INSERT_ORDER) {
      const rows = dumps[table] ?? []
      if (rows.length === 0) continue
      const { error } = await supabase.from(table).insert(rows)
      if (error) throw new Error(mt('errors.tableRestoreFailed', { table, message: error.message }))
    }

    logInfo('restoreBackup', `Veritabanı geri yüklendi: ${zipPath}`)
    return { success: true }
  } catch (err) {
    logError('restoreBackup', err, { zipPath })
    return { success: false, error: describeFsError(err, zipPath) }
  } finally {
    if (tmpExtractDir && existsSync(tmpExtractDir)) {
      rmSync(tmpExtractDir, { recursive: true, force: true })
    }
  }
}
