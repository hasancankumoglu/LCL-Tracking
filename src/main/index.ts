import { app, shell, BrowserWindow, ipcMain, protocol } from 'electron'
import { join, normalize } from 'path'
import { readFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc/handlers'
import { getDocumentsRoot } from './documents/storage'
import { closeDb } from './db/schema'
import { getBackupConfig } from './backup/config'
import { runConfiguredBackup } from './backup/backup'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-doc',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function registerDocumentProtocol(): void {
  protocol.handle('app-doc', async (request) => {
    const url = new URL(request.url)
    const encodedPath = url.searchParams.get('path')
    if (!encodedPath) return new Response('Not found', { status: 404 })

    const requestedPath = normalize(decodeURIComponent(encodedPath))
    const root = normalize(getDocumentsRoot())

    if (!requestedPath.startsWith(root)) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const data = await readFile(requestedPath)
      return new Response(new Uint8Array(data))
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Konteyner Takip Sistemi',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.palmmarine.halilsportal')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  registerDocumentProtocol()
  registerIpcHandlers()

  createWindow()

  // Açılışta arka planda en-iyi-çaba otomatik yedek (hata verse de uygulamayı bloklamaz/etkilemez).
  if (getBackupConfig().backupFolder) {
    runConfiguredBackup().catch((err) => console.error('Otomatik yedekleme başarısız:', err))
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let quitBackupDone = false
app.on('before-quit', (event) => {
  if (quitBackupDone || !getBackupConfig().backupFolder) {
    closeDb()
    return
  }

  event.preventDefault()
  runConfiguredBackup()
    .catch((err) => console.error('Kapanış öncesi yedekleme başarısız:', err))
    .finally(() => {
      quitBackupDone = true
      closeDb()
      app.quit()
    })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
