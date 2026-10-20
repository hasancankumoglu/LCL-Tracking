import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import { logError, logInfo } from '../logging/logger'
import { IPC } from '../../shared/ipc'
import type { AppUpdateState } from '../../shared/types'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

let wired = false
let state: AppUpdateState = {
  status: 'idle',
  version: null,
  releaseNotes: '',
  progress: null,
  error: null
}

function publish(patch: Partial<AppUpdateState>): void {
  state = { ...state, ...patch }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC.UPDATE_STATE_CHANGED, state)
    }
    window.setProgressBar(
      state.status === 'downloading' ? (state.progress ? state.progress.percent / 100 : 2) : -1
    )
  }
}

function reportError(error: unknown): void {
  logError('autoUpdate', error)
  publish({ status: 'error', error: error instanceof Error ? error.message : String(error) })
}

async function checkForUpdates(): Promise<void> {
  publish({ status: 'checking', error: null })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    reportError(error)
  }
}

async function downloadUpdate(): Promise<void> {
  if (state.status !== 'available' && state.status !== 'error') return
  if (!state.version) {
    await checkForUpdates()
    return
  }
  publish({ status: 'downloading', progress: null, error: null })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    reportError(error)
  }
}

export function initAutoUpdate(enabled: boolean): void {
  if (wired) return
  wired = true

  ipcMain.handle(IPC.UPDATE_GET_STATE, () => state)
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    if (enabled) await downloadUpdate()
  })
  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    if (enabled && state.status === 'downloaded') autoUpdater.quitAndInstall()
  })
  if (!enabled) return

  autoUpdater.on('update-available', (info) => {
    logInfo('autoUpdate', `Güncelleme mevcut: ${info.version}`)
    const releaseNotes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map((entry) => `${entry.version}\n${entry.note || ''}`).join('\n\n')
      : info.releaseNotes || ''
    publish({
      status: 'available',
      version: info.version,
      releaseNotes,
      progress: null,
      error: null
    })
  })
  autoUpdater.on('update-not-available', () => {
    publish({ status: 'idle', version: null, releaseNotes: '', progress: null, error: null })
  })
  autoUpdater.on('download-progress', (progress) => {
    publish({
      status: 'downloading',
      progress: {
        percent: Math.max(0, Math.min(100, progress.percent)),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      }
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    logInfo('autoUpdate', `Güncelleme indirildi: ${info.version}`)
    publish({ status: 'downloaded', version: info.version, error: null })
  })
  autoUpdater.on('error', reportError)
  void checkForUpdates()
}
