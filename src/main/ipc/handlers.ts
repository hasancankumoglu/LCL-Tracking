import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { basename } from 'path'
import { copyFileSync, writeFileSync } from 'fs'
import { IPC } from '../../shared/ipc'
import type {
  BookingInput,
  ContainerInput,
  DocumentType,
  ReportRange,
  EmailSendInput,
  CarrierName,
  CarrierReferenceType,
  CarrierBookingSnapshot,
  UnassignedVehicleAssignInput,
  UnassignedVehicleInput,
  LookupFieldType
} from '../../shared/types'
import { DOCUMENT_ALLOWED_EXTENSIONS } from '../../shared/types'
import {
  listBookings,
  getBooking,
  getBookingByNo,
  createBooking,
  updateBooking,
  deleteBooking,
  listArchivedBookings,
  setBookingArchived,
  listContainersByBooking,
  createContainer,
  updateContainer,
  deleteContainer,
  findActiveContainerConflicts,
  listUnassignedVehicles,
  deleteUnassignedVehicle,
  assignUnassignedVehicle,
  createUnassignedVehicle,
  listContainersForTracking,
  listLookupValues,
  addLookupValue,
  listDocumentsByBooking,
  addDocument,
  getDocument,
  deleteDocument,
  getDashboardStats,
  applyCarrierSnapshotToBooking
} from '../db/repositories'
import {
  copyIntoStorage,
  removeFromStorage,
  removeBookingDocumentsFolder
} from '../documents/storage'
import {
  exportToExcel,
  importFromExcel,
  previewExcelImport,
  resolveImportDirectory
} from '../excel/importExport'
import { getBackupConfig, updateBackupConfig } from '../backup/config'
import { runConfiguredBackup, restoreBackup } from '../backup/backup'
import { getLogFilePath } from '../logging/logger'
import {
  lookupCarrierBooking,
  lookupCarrierPublicFallback,
  hasCarrierCredentials,
  setCarrierCredentials,
  clearCarrierCredentials
} from '../carriers'
import { buildBookingReportData, buildRangeReportData } from '../reports/reportData'
import { buildBookingReportDocx, buildRangeReportDocx } from '../reports/wordExport'
import { buildBookingReportText, buildRangeReportText } from '../reports/textExport'
import { openMailWithReport } from '../reports/email'

export function registerIpcHandlers(): void {
  // Bookings
  ipcMain.handle(IPC.BOOKINGS_LIST, () => listBookings())
  ipcMain.handle(IPC.BOOKINGS_GET, (_e, id: number) => getBooking(id))
  ipcMain.handle(IPC.BOOKINGS_GET_BY_NO, (_e, bookingNo: string) => getBookingByNo(bookingNo))
  ipcMain.handle(IPC.BOOKINGS_CREATE, (_e, input: BookingInput) => createBooking(input))
  ipcMain.handle(IPC.BOOKINGS_UPDATE, (_e, id: number, input: BookingInput) =>
    updateBooking(id, input)
  )
  ipcMain.handle(IPC.BOOKINGS_DELETE, (_e, id: number) => {
    deleteBooking(id)
    removeBookingDocumentsFolder(id)
  })
  ipcMain.handle(IPC.BOOKINGS_LIST_ARCHIVED, () => listArchivedBookings())
  ipcMain.handle(IPC.BOOKINGS_ARCHIVE, (_e, id: number, archived: boolean) =>
    setBookingArchived(id, archived)
  )

  // Containers
  ipcMain.handle(IPC.CONTAINERS_LIST_BY_BOOKING, (_e, bookingId: number) =>
    listContainersByBooking(bookingId)
  )
  ipcMain.handle(IPC.CONTAINERS_CREATE, (_e, input: ContainerInput) => createContainer(input))
  ipcMain.handle(IPC.CONTAINERS_UPDATE, (_e, id: number, input: ContainerInput) =>
    updateContainer(id, input)
  )
  ipcMain.handle(IPC.CONTAINERS_DELETE, (_e, id: number) => deleteContainer(id))
  ipcMain.handle(IPC.CONTAINERS_FIND_CONFLICTS, (_e, containerNo: string, excludeId?: number) =>
    findActiveContainerConflicts(containerNo, excludeId)
  )
  ipcMain.handle(IPC.CONTAINERS_LIST_FOR_TRACKING, () => listContainersForTracking())

  // Lookup değerleri (Kategori/Destination/Line/POL)
  ipcMain.handle(IPC.LOOKUPS_LIST, (_e, fieldType: LookupFieldType) => listLookupValues(fieldType))
  ipcMain.handle(IPC.LOOKUPS_ADD, (_e, fieldType: LookupFieldType, value: string) =>
    addLookupValue(fieldType, value)
  )

  // Unassigned Vehicles (Atanmayan Araçlar)
  ipcMain.handle(IPC.UNASSIGNED_VEHICLES_LIST, () => listUnassignedVehicles())
  ipcMain.handle(IPC.UNASSIGNED_VEHICLES_DELETE, (_e, id: number) => deleteUnassignedVehicle(id))
  ipcMain.handle(
    IPC.UNASSIGNED_VEHICLES_ASSIGN,
    (_e, id: number, input: UnassignedVehicleAssignInput) => assignUnassignedVehicle(id, input)
  )
  ipcMain.handle(IPC.UNASSIGNED_VEHICLES_CREATE, (_e, input: UnassignedVehicleInput) =>
    createUnassignedVehicle(input)
  )

  // Documents
  ipcMain.handle(IPC.DOCUMENTS_LIST_BY_BOOKING, (_e, bookingId: number) =>
    listDocumentsByBooking(bookingId)
  )
  ipcMain.handle(
    IPC.DOCUMENTS_ADD,
    (_e, bookingId: number, type: DocumentType, sourcePaths: string[]) => {
      return sourcePaths.map((sourcePath) => {
        const { storedPath, originalFileName } = copyIntoStorage(bookingId, type, sourcePath)
        return addDocument(bookingId, type, storedPath, originalFileName)
      })
    }
  )
  ipcMain.handle(IPC.DOCUMENTS_DELETE, (_e, id: number) => {
    const doc = getDocument(id)
    if (doc) {
      removeFromStorage(doc.filePath)
      deleteDocument(id)
    }
  })
  ipcMain.handle(IPC.DOCUMENTS_PICK_FILES, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Belgeler', extensions: DOCUMENT_ALLOWED_EXTENSIONS }]
    })
    return canceled ? [] : filePaths
  })
  ipcMain.handle(IPC.DOCUMENTS_OPEN, (_e, filePath: string) => shell.openPath(filePath))
  ipcMain.handle(
    IPC.DOCUMENTS_DOWNLOAD,
    async (event, filePath: string, suggestedName?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const { canceled, filePath: destPath } = await dialog.showSaveDialog(win as BrowserWindow, {
        title: "Halil's Portal - Dökümanı Kaydet",
        defaultPath: suggestedName ?? basename(filePath)
      })
      if (canceled || !destPath) return { canceled: true }
      copyFileSync(filePath, destPath)
      return { canceled: false, filePath: destPath }
    }
  )

  // Excel
  ipcMain.handle(IPC.EXCEL_EXPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title: "Halil's Portal - Excel'e Aktarılacak Klasörü Seçin",
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    const result = exportToExcel(filePaths[0])
    return { canceled: false, ...result }
  })
  ipcMain.handle(IPC.EXCEL_PICK_IMPORT_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title:
        "Halil's Portal - Bookings.xlsx ve Containers.xlsx Dosyalarının Bulunduğu Klasörü Seçin",
      properties: ['openDirectory']
    })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
  })
  ipcMain.handle(IPC.EXCEL_PREVIEW_IMPORT, (_e, inputPaths: string[]) => {
    const directoryPath = resolveImportDirectory(inputPaths)
    return previewExcelImport(directoryPath)
  })
  ipcMain.handle(IPC.EXCEL_COMMIT_IMPORT, (_e, directoryPath: string) => {
    return importFromExcel(directoryPath)
  })

  // Dashboard
  ipcMain.handle(IPC.DASHBOARD_STATS, (_e, range?: ReportRange) => getDashboardStats(range))

  // Raporlar
  ipcMain.handle(IPC.REPORTS_GET_BOOKING_REPORT, (_e, bookingIds: number[]) =>
    buildBookingReportData(bookingIds)
  )
  ipcMain.handle(IPC.REPORTS_GET_RANGE_REPORT, (_e, range: ReportRange) =>
    buildRangeReportData(range)
  )
  ipcMain.handle(IPC.REPORTS_EXPORT_BOOKING_WORD, async (event, bookingIds: number[]) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const data = buildBookingReportData(bookingIds)
    const defaultName =
      data.bookings.length === 1
        ? `Booking-${data.bookings[0].booking.bookingNo}-Raporu.docx`
        : `Booking-Raporu-${data.bookings.length}-Adet.docx`
    const { canceled, filePath: destPath } = await dialog.showSaveDialog(win as BrowserWindow, {
      title: "Halil's Portal - Raporu Kaydet",
      defaultPath: defaultName,
      filters: [{ name: 'Word Belgesi', extensions: ['docx'] }]
    })
    if (canceled || !destPath) return { canceled: true }
    const buffer = await buildBookingReportDocx(data)
    writeFileSync(destPath, buffer)
    return { canceled: false, filePath: destPath }
  })
  ipcMain.handle(IPC.REPORTS_EXPORT_RANGE_WORD, async (event, range: ReportRange) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const data = buildRangeReportData(range)
    const { canceled, filePath: destPath } = await dialog.showSaveDialog(win as BrowserWindow, {
      title: "Halil's Portal - Raporu Kaydet",
      defaultPath: `Donemsel-Rapor-${data.rangeLabel}.docx`,
      filters: [{ name: 'Word Belgesi', extensions: ['docx'] }]
    })
    if (canceled || !destPath) return { canceled: true }
    const buffer = await buildRangeReportDocx(data)
    writeFileSync(destPath, buffer)
    return { canceled: false, filePath: destPath }
  })
  ipcMain.handle(
    IPC.REPORTS_SEND_BOOKING_EMAIL,
    (_e, bookingIds: number[], input: EmailSendInput) => {
      const data = buildBookingReportData(bookingIds)
      const text = buildBookingReportText(data)
      return openMailWithReport(input.subject, text)
    }
  )
  ipcMain.handle(IPC.REPORTS_SEND_RANGE_EMAIL, (_e, range: ReportRange, input: EmailSendInput) => {
    const data = buildRangeReportData(range)
    const text = buildRangeReportText(data)
    return openMailWithReport(input.subject, text)
  })

  // Backup
  ipcMain.handle(IPC.BACKUP_GET_CONFIG, () => getBackupConfig())
  ipcMain.handle(IPC.BACKUP_PICK_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title: "Halil's Portal - Yedek Klasörü Seçin",
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return getBackupConfig()
    return updateBackupConfig({ backupFolder: filePaths[0] })
  })
  ipcMain.handle(IPC.BACKUP_RUN_NOW, () => runConfiguredBackup())
  ipcMain.handle(IPC.BACKUP_PICK_RESTORE_FILE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title: "Halil's Portal - Geri Yüklenecek Yedek Dosyasını Seçin",
      properties: ['openFile'],
      filters: [{ name: 'Yedek Dosyası', extensions: ['zip'] }]
    })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
  })
  ipcMain.handle(IPC.BACKUP_RESTORE, async (_e, zipPath: string) => {
    const result = await restoreBackup(zipPath)
    if (result.success) {
      // Renderer'a yanıtın ulaşması için kısa bir gecikmeyle uygulamayı yeniden başlat.
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 300)
    }
    return result
  })
  ipcMain.handle(IPC.BACKUP_OPEN_LOGS_FOLDER, () => {
    shell.showItemInFolder(getLogFilePath())
  })

  // Armatör API entegrasyonu
  ipcMain.handle(IPC.CARRIERS_HAS_CREDENTIALS, (_e, carrier: CarrierName) =>
    hasCarrierCredentials(carrier)
  )
  ipcMain.handle(
    IPC.CARRIERS_SET_CREDENTIALS,
    (_e, carrier: CarrierName, consumerKey: string, consumerSecret: string) => {
      setCarrierCredentials(carrier, consumerKey, consumerSecret)
    }
  )
  ipcMain.handle(IPC.CARRIERS_CLEAR_CREDENTIALS, (_e, carrier: CarrierName) =>
    clearCarrierCredentials(carrier)
  )
  ipcMain.handle(
    IPC.CARRIERS_LOOKUP,
    (_e, carrier: CarrierName, referenceType: CarrierReferenceType, value: string) =>
      lookupCarrierBooking(carrier, referenceType, value)
  )
  ipcMain.handle(
    IPC.CARRIERS_LOOKUP_PUBLIC_FALLBACK,
    (_e, carrier: CarrierName, referenceType: CarrierReferenceType, value: string) =>
      lookupCarrierPublicFallback(carrier, referenceType, value)
  )
  ipcMain.handle(IPC.CARRIERS_APPLY, (_e, bookingId: number, snapshot: CarrierBookingSnapshot) =>
    applyCarrierSnapshotToBooking(bookingId, snapshot)
  )
}
