import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppUpdateState } from '@shared/types'

function releaseNotesText(notes: string): string {
  if (!/<[a-z][\s\S]*>/i.test(notes)) return notes
  const html = notes.replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|ul|ol)>/gi, '\n')
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() || ''
}

export default function AppUpdateDialog(): React.JSX.Element | null {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<AppUpdateState | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [stalledTransfer, setStalledTransfer] = useState<number | null>()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let active = true
    let receivedEvent = false
    const unsubscribe = window.api.updates.onStateChanged((next) => {
      receivedEvent = true
      setState(next)
      setDismissed(false)
      setRequestError('')
    })
    window.api.updates
      .getState()
      .then((next) => {
        if (active && !receivedEvent) setState(next)
      })
      .catch((error: unknown) => {
        console.error('update:getState', error)
        if (active) setRequestError(String(error))
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (state?.status !== 'downloading') return
    const timer = window.setTimeout(
      () => setStalledTransfer(state.progress?.transferred ?? null),
      30_000
    )
    return () => window.clearTimeout(timer)
  }, [state?.status, state?.progress?.transferred])

  const visible =
    !dismissed &&
    (Boolean(requestError) ||
      (state !== null && state.status !== 'idle' && state.status !== 'checking'))
  useEffect(() => {
    const dialog = dialogRef.current
    if (visible && dialog && !dialog.open) dialog.showModal()
    if (!visible && dialog?.open) dialog.close()
  }, [visible])

  async function runAction(action: () => Promise<void>): Promise<void> {
    setRequestError('')
    setStalledTransfer(undefined)
    try {
      await action()
    } catch (error) {
      console.error('update:action', error)
      setRequestError(error instanceof Error ? error.message : String(error))
    }
  }

  const downloading = state?.status === 'downloading'
  const stalled = downloading && stalledTransfer === (state.progress?.transferred ?? null)
  const downloaded = state?.status === 'downloaded'
  const failed = state?.status === 'error' || Boolean(requestError)
  const formatNumber = (value: number): string =>
    value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })
  const megabytes = (value: number): string => formatNumber(value / (1024 * 1024))

  return (
    <dialog
      ref={dialogRef}
      className="modal-panel app-update-dialog"
      aria-labelledby="app-update-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!downloading) setDismissed(true)
      }}
    >
      <h2 id="app-update-title">
        {t(
          failed
            ? 'update.errorTitle'
            : downloaded
              ? 'update.downloadedTitle'
              : downloading
                ? 'update.downloadingTitle'
                : 'update.availableTitle'
        )}
      </h2>
      {state?.version && <p>{t('update.availableMessage', { version: state.version })}</p>}
      {state?.status === 'available' && <p>{t('update.availableDetail')}</p>}
      {downloading && (
        <section aria-label={t('update.downloadingTitle')}>
          <p role="status">
            {state.progress
              ? t('update.progress', {
                  percent: formatNumber(state.progress.percent),
                  transferred: megabytes(state.progress.transferred),
                  total: megabytes(state.progress.total),
                  speed: megabytes(state.progress.bytesPerSecond)
                })
              : t('update.preparing')}
          </p>
          <progress max={100} value={state.progress?.percent} />
          {stalled && <p role="status">{t('update.stalled')}</p>}
        </section>
      )}
      {downloaded && <p role="status">{t('update.downloadedDetail')}</p>}
      {failed && (
        <div role="alert">
          <p>{t('update.errorDetail')}</p>
          <pre className="app-update-dialog__notes">{requestError || state?.error}</pre>
        </div>
      )}
      <h3>{t('update.releaseNotesTitle')}</h3>
      <pre className="app-update-dialog__notes">
        {releaseNotesText(state?.releaseNotes || '') || t('update.noReleaseNotes')}
      </pre>
      <div className="app-update-dialog__actions">
        {!downloading && (
          <button type="button" className="btn secondary" onClick={() => setDismissed(true)}>
            {t('update.later')}
          </button>
        )}
        {!downloading && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              void runAction(downloaded ? window.api.updates.install : window.api.updates.download)
            }
          >
            {t(
              downloaded
                ? 'update.restartNowButton'
                : failed
                  ? 'update.retryButton'
                  : 'update.downloadButton'
            )}
          </button>
        )}
      </div>
    </dialog>
  )
}
