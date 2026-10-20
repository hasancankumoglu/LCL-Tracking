import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BackupConfig } from '@shared/types'
import { useGlobalLoading } from '../lib/loadingOverlay'
import { formatDateTime } from '../lib/format'

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

export default function BackupPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    const data = await window.api.backup.getConfig()
    setConfig(data)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [])

  async function handlePickFolder(): Promise<void> {
    const updated = await window.api.backup.pickFolder()
    setConfig(updated)
  }

  async function handleBackupNow(): Promise<void> {
    setMessage(null)
    setBackingUp(true)
    const result = await window.api.backup.runNow()
    setBackingUp(false)
    if (result.success) {
      setMessage({
        type: 'success',
        text: t('backup.backupTakenMessage', {
          path: result.filePath,
          size: formatSize(result.sizeBytes)
        })
      })
    } else {
      setMessage({ type: 'error', text: result.error ?? t('backup.backupFailedMessage') })
    }
    await refresh()
  }

  async function handleRestore(): Promise<void> {
    const zipPath = await window.api.backup.pickRestoreFile()
    if (!zipPath) return

    const confirmed = window.confirm(t('backup.restoreConfirm', { path: zipPath }))
    if (!confirmed) return

    setMessage(null)
    setRestoring(true)
    const result = await window.api.backup.restore(zipPath)
    if (!result.success) {
      setRestoring(false)
      setMessage({ type: 'error', text: result.error ?? t('backup.restoreFailedMessage') })
    }
    // Başarılı olursa uygulama kısa süre içinde otomatik yeniden başlayacak.
  }

  return (
    <div>
      <div className="page-title">
        <h1>{t('nav.backup')}</h1>
      </div>

      <div
        className="surface"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {loading ? null : (
          <>
            <div className="form-field">
              <label>{t('backup.folderLabel')}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{config?.backupFolder ?? t('backup.notSelected')}</span>
                <button className="btn secondary small" onClick={handlePickFolder}>
                  {t('backup.selectFolder')}
                </button>
              </div>
            </div>

            <div>
              <div>
                {t('backup.lastBackup')}{' '}
                <strong>{formatDateTime(config?.lastBackupAt ?? null)}</strong>
                {config?.lastBackupStatus === 'success' && (
                  <span className="badge badge-status-tamamlandi" style={{ marginLeft: 8 }}>
                    {t('common.success')}
                  </span>
                )}
                {config?.lastBackupStatus === 'error' && (
                  <span
                    className="badge"
                    style={{ marginLeft: 8, background: '#fbe4e4', color: '#c0392b' }}
                  >
                    {t('backup.failed')}
                  </span>
                )}
              </div>
              {config?.lastBackupStatus === 'error' && config.lastBackupError && (
                <div style={{ color: 'var(--danger, #c0392b)', marginTop: 4 }}>
                  {config.lastBackupError}
                </div>
              )}
            </div>

            {message && (
              <div style={{ color: message.type === 'error' ? '#c0392b' : '#2e7d32' }}>
                {message.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn"
                onClick={handleBackupNow}
                disabled={backingUp || !config?.backupFolder}
              >
                {backingUp ? t('backup.backingUp') : t('backup.backupNow')}
              </button>
              <button className="btn danger" onClick={handleRestore} disabled={restoring}>
                {restoring ? t('backup.restoring') : t('backup.restoreButton')}
              </button>
              <button className="btn secondary" onClick={() => window.api.backup.openLogsFolder()}>
                {t('backup.openLogsFolder')}
              </button>
            </div>

            <p style={{ opacity: 0.7, fontSize: 13 }}>{t('backup.helpText')}</p>
          </>
        )}
      </div>
    </div>
  )
}
