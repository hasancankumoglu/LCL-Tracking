import { useEffect, useState } from 'react'
import type { BackupConfig } from '@shared/types'

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('tr-TR')
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

export default function BackupPage(): React.JSX.Element {
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [loading, setLoading] = useState(true)
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
        text: `Yedek alındı: ${result.filePath} (${formatSize(result.sizeBytes)})`
      })
    } else {
      setMessage({ type: 'error', text: result.error ?? 'Yedekleme başarısız oldu.' })
    }
    await refresh()
  }

  async function handleRestore(): Promise<void> {
    const zipPath = await window.api.backup.pickRestoreFile()
    if (!zipPath) return

    const confirmed = window.confirm(
      `Bu işlem mevcut tüm booking, konteyner ve döküman verilerinin üzerine yazacak.\n\nSeçilen dosya: ${zipPath}\n\nGeri yüklemeden önce mevcut durumun güvenlik kopyası otomatik alınacak. Devam etmek istiyor musunuz?`
    )
    if (!confirmed) return

    setMessage(null)
    setRestoring(true)
    const result = await window.api.backup.restore(zipPath)
    if (!result.success) {
      setRestoring(false)
      setMessage({ type: 'error', text: result.error ?? 'Geri yükleme başarısız oldu.' })
    }
    // Başarılı olursa uygulama kısa süre içinde otomatik yeniden başlayacak.
  }

  return (
    <div>
      <div className="page-title">
        <h1>Yedekleme</h1>
      </div>

      <div
        className="surface"
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {loading ? (
          <div className="empty-state">Yükleniyor...</div>
        ) : (
          <>
            <div className="form-field">
              <label>Yedek Klasörü</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{config?.backupFolder ?? 'Henüz seçilmedi'}</span>
                <button className="btn secondary small" onClick={handlePickFolder}>
                  Klasör Seç
                </button>
              </div>
            </div>

            <div>
              <div>
                Son yedek: <strong>{formatDateTime(config?.lastBackupAt ?? null)}</strong>
                {config?.lastBackupStatus === 'success' && (
                  <span className="badge badge-status-tamamlandi" style={{ marginLeft: 8 }}>
                    Başarılı
                  </span>
                )}
                {config?.lastBackupStatus === 'error' && (
                  <span
                    className="badge"
                    style={{ marginLeft: 8, background: '#fbe4e4', color: '#c0392b' }}
                  >
                    Hatalı
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
                {backingUp ? 'Yedekleniyor...' : 'Şimdi Yedekle'}
              </button>
              <button className="btn danger" onClick={handleRestore} disabled={restoring}>
                {restoring ? 'Geri Yükleniyor...' : 'Yedekten Geri Yükle'}
              </button>
              <button className="btn secondary" onClick={() => window.api.backup.openLogsFolder()}>
                Log Klasörünü Aç
              </button>
            </div>

            <p style={{ opacity: 0.7, fontSize: 13 }}>
              Yedekler, uygulama açılışında ve kapanışında seçtiğiniz klasöre otomatik olarak
              alınır. Ayrıca dilediğiniz zaman &quot;Şimdi Yedekle&quot; ile manuel yedek
              alabilirsiniz. Geri yükleme işlemi, mevcut tüm verilerin üzerine yazar; bu yüzden
              işlem öncesi mevcut durumun bir güvenlik kopyası otomatik olarak alınır. Bir sorunla
              karşılaşırsanız &quot;Log Klasörünü Aç&quot; ile açılan app.log dosyasını destek için
              paylaşabilirsiniz.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
