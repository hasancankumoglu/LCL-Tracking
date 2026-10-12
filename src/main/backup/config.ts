import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { BackupConfig } from '../../shared/types'

function getConfigPath(): string {
  return join(app.getPath('userData'), 'backup-config.json')
}

const DEFAULT_CONFIG: BackupConfig = {
  backupFolder: null,
  lastBackupAt: null,
  lastBackupStatus: null,
  lastBackupError: null
}

export function getBackupConfig(): BackupConfig {
  const path = getConfigPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    const raw = readFileSync(path, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveBackupConfig(config: BackupConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function updateBackupConfig(partial: Partial<BackupConfig>): BackupConfig {
  const merged = { ...getBackupConfig(), ...partial }
  saveBackupConfig(merged)
  return merged
}
