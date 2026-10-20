import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { basename, join } from 'path'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { IPC } from '../../shared/ipc'
import type {
  Language,
  BookingInput,
  ContainerInput,
  DocumentType,
  CarrierName,
  CarrierReferenceType,
  CarrierBookingSnapshot,
  PermissionAction,
  UserCreateInput,
  UserRole,
  LookupFieldType,
  ReportRange,
  EmailSendInput,
  UnassignedVehicleInput,
  UnassignedVehicleAssignInput,
  UnassignedVehicleSelection,
  CustomerInput
} from '../../shared/types'
import { DOCUMENT_ALLOWED_EXTENSIONS } from '../../shared/types'
import { requirePermission, requireAdmin } from '../auth/guard'
import { hasPermission } from '../auth/session'
import * as auth from '../auth/authRepo'
import { getRememberedUsername, setRememberedUsername } from '../auth/authConfig'
import { getLogFilePath } from '../logging/logger'
import { getCurrentUser } from '../user/currentUser'
import { getLanguage, setLanguage } from '../i18n/language'
import {
  listBookings,
  getBooking,
  getBookingByNo,
  createBooking,
  createBookingWithVehicles,
  updateBooking,
  deleteBooking,
  listArchivedBookings,
  setBookingArchived,
  listLookupValues,
  addLookupValue,
  listContainersByBooking,
  createContainer,
  updateContainer,
  deleteContainer,
  findActiveContainerConflicts,
  listContainersForTracking,
  listUnassignedVehicles,
  createUnassignedVehicle,
  deleteUnassignedVehicle,
  assignUnassignedVehicle,
  listDocumentsByBooking,
  addDocument,
  getDocument,
  deleteDocument,
  getDashboardStats,
  applyCarrierSnapshotToBooking,
  createPendingDeletion,
  listPendingDeletions,
  listActivePendingDeletionBookingIds,
  approvePendingDeletion,
  rejectPendingDeletion,
  withdrawPendingDeletion,
  listCustomers,
  getCustomer,
  listCustomerDirectory,
  createCustomer,
  updateCustomer,
  deleteCustomer
} from '../db/repositories'
import { copyIntoStorage, removeFromStorage, downloadFromStorage } from '../documents/storage'
import {
  exportToExcel,
  importFromExcel,
  previewExcelImport,
  resolveImportDirectory
} from '../excel/importExport'
import { getBackupConfig, updateBackupConfig } from '../backup/config'
import { runConfiguredBackup, restoreBackup } from '../backup/backup'
import { buildBookingReportData, buildRangeReportData } from '../reports/reportData'
import { buildBookingReportDocx, buildRangeReportDocx } from '../reports/wordExport'
import {
  buildBookingReportText,
  buildRangeReportText,
  buildOperatorEmailText
} from '../reports/textExport'
import { openMailWithReport } from '../reports/email'
import {
  lookupCarrierBooking,
  lookupCarrierPublicFallback,
  hasCarrierCredentials,
  setCarrierCredentials,
  clearCarrierCredentials
} from '../carriers'

export function registerIpcHandlers(): void {
  // App
  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())

  // UI language preference
  ipcMain.handle(IPC.UI_LANGUAGE_GET, () => getLanguage())
  ipcMain.handle(IPC.UI_LANGUAGE_SET, (_e, language: Language) => {
    setLanguage(language)
    return language
  })

  // Bookings
  ipcMain.handle(IPC.BOOKINGS_LIST, () => listBookings())
  ipcMain.handle(IPC.BOOKINGS_GET, (_e, id: number) => getBooking(id))
  ipcMain.handle(IPC.BOOKINGS_GET_BY_NO, (_e, bookingNo: string) => getBookingByNo(bookingNo))
  ipcMain.handle(IPC.BOOKINGS_CREATE, (_e, input: BookingInput) => {
    requirePermission('bookings.manage')
    return createBooking(input)
  })
  ipcMain.handle(
    IPC.BOOKINGS_CREATE_WITH_VEHICLES,
    (_e, input: BookingInput, vehicles: UnassignedVehicleSelection[]) => {
      requirePermission('bookings.manage')
      requirePermission('unassigned_vehicles.manage')
      return createBookingWithVehicles(input, vehicles)
    }
  )
  ipcMain.handle(IPC.BOOKINGS_UPDATE, (_e, id: number, input: BookingInput) => {
    requirePermission('bookings.manage')
    return updateBooking(id, input)
  })
  ipcMain.handle(IPC.BOOKINGS_DELETE, async (_e, id: number) => {
    requirePermission('bookings.manage')
    if (hasPermission('bookings.delete_direct')) {
      await deleteBooking(id)
      return { deleted: true }
    }
    await createPendingDeletion(id)
    return { deleted: false, pendingRequested: true }
  })
  ipcMain.handle(IPC.BOOKINGS_LIST_ARCHIVED, () => listArchivedBookings())
  ipcMain.handle(IPC.BOOKINGS_ARCHIVE, (_e, id: number, archived: boolean) => {
    requirePermission('bookings.manage')
    return setBookingArchived(id, archived)
  })

  // Containers
  ipcMain.handle(IPC.CONTAINERS_LIST_BY_BOOKING, (_e, bookingId: number) =>
    listContainersByBooking(bookingId)
  )
  ipcMain.handle(IPC.CONTAINERS_CREATE, (_e, input: ContainerInput) => {
    requirePermission('containers.manage')
    return createContainer(input)
  })
  ipcMain.handle(IPC.CONTAINERS_UPDATE, (_e, id: number, input: ContainerInput) => {
    requirePermission('containers.manage')
    return updateContainer(id, input)
  })
  ipcMain.handle(IPC.CONTAINERS_DELETE, (_e, id: number) => {
    requirePermission('containers.manage')
    return deleteContainer(id)
  })
  ipcMain.handle(IPC.CONTAINERS_FIND_CONFLICTS, (_e, containerNo: string, excludeId?: number) =>
    findActiveContainerConflicts(containerNo, excludeId)
  )
  ipcMain.handle(IPC.CONTAINERS_LIST_FOR_TRACKING, () => listContainersForTracking())

  // Lookup değerleri (kategori/destinasyon/hat/POL dropdown'ları)
  ipcMain.handle(IPC.LOOKUPS_LIST, (_e, fieldType: LookupFieldType) => listLookupValues(fieldType))
  ipcMain.handle(IPC.LOOKUPS_ADD, (_e, fieldType: LookupFieldType, value: string) =>
    addLookupValue(fieldType, value)
  )

  // Atanmayan Araçlar
  ipcMain.handle(IPC.UNASSIGNED_VEHICLES_LIST, () => listUnassignedVehicles())
  ipcMain.handle(IPC.UNASSIGNED_VEHICLES_CREATE, (_e, input: UnassignedVehicleInput) => {
    requirePermission('unassigned_vehicles.manage')
    return createUnassignedVehicle(input)
  })
  ipcMain.handle(IPC.UNASSIGNED_VEHICLES_DELETE, (_e, id: number) => {
    requirePermission('unassigned_vehicles.manage')
    return deleteUnassignedVehicle(id)
  })
  ipcMain.handle(
    IPC.UNASSIGNED_VEHICLES_ASSIGN,
    (_e, id: number, input: UnassignedVehicleAssignInput) => {
      requirePermission('unassigned_vehicles.manage')
      return assignUnassignedVehicle(id, input)
    }
  )

  // Documents
  ipcMain.handle(IPC.DOCUMENTS_LIST_BY_BOOKING, (_e, bookingId: number) =>
    listDocumentsByBooking(bookingId)
  )
  ipcMain.handle(
    IPC.DOCUMENTS_ADD,
    async (_e, bookingId: number, type: DocumentType, sourcePaths: string[]) => {
      requirePermission('documents.manage')
      return Promise.all(
        sourcePaths.map(async (sourcePath) => {
          const { storedPath, originalFileName } = await copyIntoStorage(
            bookingId,
            type,
            sourcePath
          )
          return addDocument(bookingId, type, storedPath, originalFileName)
        })
      )
    }
  )
  ipcMain.handle(IPC.DOCUMENTS_DELETE, async (_e, id: number) => {
    requirePermission('documents.manage')
    const doc = await getDocument(id)
    if (doc) {
      await removeFromStorage(doc.filePath)
      await deleteDocument(id)
    }
  })
  ipcMain.handle(IPC.DOCUMENTS_PICK_FILES, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Görseller', extensions: DOCUMENT_ALLOWED_EXTENSIONS }]
    })
    return canceled ? [] : filePaths
  })
  // filePath burada Supabase Storage'daki göreli yoldur (ör. "128/BOOKING_CONFIRMATION/xxx.pdf"),
  // yerel diskte bir dosya değildir; önce indirip geçici bir dosyaya yazıp öyle açıyoruz.
  ipcMain.handle(IPC.DOCUMENTS_OPEN, async (_e, filePath: string) => {
    const buffer = await downloadFromStorage(filePath)
    const tempPath = join(tmpdir(), `lcltracking-${Date.now()}-${basename(filePath)}`)
    writeFileSync(tempPath, buffer)
    return shell.openPath(tempPath)
  })
  ipcMain.handle(
    IPC.DOCUMENTS_DOWNLOAD,
    async (event, filePath: string, suggestedName?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const { canceled, filePath: destPath } = await dialog.showSaveDialog(win as BrowserWindow, {
        title: 'LCL-Tracking - Dökümanı Kaydet',
        defaultPath: suggestedName ?? basename(filePath)
      })
      if (canceled || !destPath) return { canceled: true }
      const buffer = await downloadFromStorage(filePath)
      writeFileSync(destPath, buffer)
      return { canceled: false, filePath: destPath }
    }
  )

  // Excel
  ipcMain.handle(IPC.EXCEL_EXPORT, async (event, bookingIds?: number[]) => {
    requirePermission('excel.export')
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title: "LCL-Tracking - Excel'e Aktarılacak Klasörü Seçin",
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    const result = await exportToExcel(filePaths[0], bookingIds)
    return { canceled: false, ...result }
  })
  ipcMain.handle(IPC.EXCEL_PICK_IMPORT_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'LCL-Tracking - Bookings.xlsx ve Containers.xlsx Dosyalarının Bulunduğu Klasörü Seçin',
      properties: ['openDirectory']
    })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
  })
  ipcMain.handle(IPC.EXCEL_PREVIEW_IMPORT, (_e, inputPaths: string[]) => {
    const directoryPath = resolveImportDirectory(inputPaths)
    return previewExcelImport(directoryPath)
  })
  ipcMain.handle(IPC.EXCEL_COMMIT_IMPORT, (_e, directoryPath: string) => {
    requirePermission('excel.import')
    return importFromExcel(directoryPath)
  })

  // Dashboard
  ipcMain.handle(IPC.DASHBOARD_STATS, (_e, range?: ReportRange) => getDashboardStats(range))

  // Backup
  ipcMain.handle(IPC.BACKUP_GET_CONFIG, () => getBackupConfig())
  ipcMain.handle(IPC.BACKUP_PICK_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'LCL-Tracking - Yedek Klasörü Seçin',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || filePaths.length === 0) return getBackupConfig()
    return updateBackupConfig({ backupFolder: filePaths[0] })
  })
  ipcMain.handle(IPC.BACKUP_RUN_NOW, () => {
    requirePermission('backup.manage')
    return runConfiguredBackup()
  })
  ipcMain.handle(IPC.BACKUP_PICK_RESTORE_FILE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'LCL-Tracking - Geri Yüklenecek Yedek Dosyasını Seçin',
      properties: ['openFile'],
      filters: [{ name: 'Yedek Dosyası', extensions: ['zip'] }]
    })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
  })
  ipcMain.handle(IPC.BACKUP_RESTORE, async (_e, zipPath: string) => {
    requirePermission('backup.manage')
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
  ipcMain.handle(IPC.BACKUP_OPEN_LOGS_FOLDER, () => shell.showItemInFolder(getLogFilePath()))

  // Raporlar
  ipcMain.handle(IPC.REPORTS_GET_BOOKING_REPORT, (_e, bookingIds: number[]) =>
    buildBookingReportData(bookingIds)
  )
  ipcMain.handle(IPC.REPORTS_GET_RANGE_REPORT, (_e, range: ReportRange) =>
    buildRangeReportData(range)
  )
  ipcMain.handle(IPC.REPORTS_EXPORT_BOOKING_WORD, async (event, bookingIds: number[]) => {
    requirePermission('reports.manage')
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const data = await buildBookingReportData(bookingIds)
    const buffer = await buildBookingReportDocx(data)
    const { canceled, filePath } = await dialog.showSaveDialog(win as BrowserWindow, {
      title: 'LCL-Tracking - Rapor Kaydet',
      defaultPath: 'Booking_Raporu.docx',
      filters: [{ name: 'Word Belgesi', extensions: ['docx'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    writeFileSync(filePath, buffer)
    return { canceled: false, filePath }
  })
  ipcMain.handle(IPC.REPORTS_EXPORT_RANGE_WORD, async (event, range: ReportRange) => {
    requirePermission('reports.manage')
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const data = await buildRangeReportData(range)
    const buffer = await buildRangeReportDocx(data)
    const { canceled, filePath } = await dialog.showSaveDialog(win as BrowserWindow, {
      title: 'LCL-Tracking - Rapor Kaydet',
      defaultPath: 'Donemsel_Rapor.docx',
      filters: [{ name: 'Word Belgesi', extensions: ['docx'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    writeFileSync(filePath, buffer)
    return { canceled: false, filePath }
  })
  ipcMain.handle(
    IPC.REPORTS_SEND_BOOKING_EMAIL,
    async (_e, bookingIds: number[], input: EmailSendInput) => {
      requirePermission('reports.manage')
      const data = await buildBookingReportData(bookingIds)
      return openMailWithReport(input.subject, buildBookingReportText(data))
    }
  )
  ipcMain.handle(
    IPC.REPORTS_SEND_RANGE_EMAIL,
    async (_e, range: ReportRange, input: EmailSendInput) => {
      requirePermission('reports.manage')
      const data = await buildRangeReportData(range)
      return openMailWithReport(input.subject, buildRangeReportText(data))
    }
  )
  ipcMain.handle(IPC.REPORTS_SEND_OPERATOR_EMAIL, async (_e, bookingId: number) => {
    const booking = await getBooking(bookingId)
    if (!booking) return { success: false, error: 'Booking bulunamadı.' }
    const contact = booking.createdBy ? await auth.getUserContact(booking.createdBy) : null
    if (!contact?.email) {
      return {
        success: false,
        error: `"${booking.createdBy ?? 'bilinmeyen kullanıcı'}" için kayıtlı bir e-posta adresi bulunamadı.`
      }
    }
    const data = await buildBookingReportData([bookingId])
    const subject = `Booking - ${booking.bookingNo}`
    return openMailWithReport(subject, buildOperatorEmailText(data), contact.email)
  })

  // Armatör API entegrasyonu
  ipcMain.handle(IPC.CARRIERS_HAS_CREDENTIALS, (_e, carrier: CarrierName) =>
    hasCarrierCredentials(carrier)
  )
  ipcMain.handle(
    IPC.CARRIERS_SET_CREDENTIALS,
    (_e, carrier: CarrierName, consumerKey: string, consumerSecret: string) => {
      requirePermission('carriers.manage')
      setCarrierCredentials(carrier, consumerKey, consumerSecret)
    }
  )
  ipcMain.handle(IPC.CARRIERS_CLEAR_CREDENTIALS, (_e, carrier: CarrierName) => {
    requirePermission('carriers.manage')
    return clearCarrierCredentials(carrier)
  })
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
  ipcMain.handle(IPC.CARRIERS_APPLY, (_e, bookingId: number, snapshot: CarrierBookingSnapshot) => {
    requirePermission('carriers.manage')
    return applyCarrierSnapshotToBooking(bookingId, snapshot)
  })

  // Auth
  ipcMain.handle(IPC.AUTH_LOGIN, (_e, username: string, password: string) =>
    auth.login(username, password)
  )
  ipcMain.handle(IPC.AUTH_LOGOUT, () => auth.logout())
  ipcMain.handle(IPC.AUTH_CHANGE_PASSWORD, (_e, oldPassword: string, newPassword: string) =>
    auth.changeOwnPassword(oldPassword, newPassword)
  )
  ipcMain.handle(IPC.AUTH_GET_REMEMBERED_USERNAME, () => getRememberedUsername())
  ipcMain.handle(IPC.AUTH_SET_REMEMBERED_USERNAME, (_e, username: string | null) =>
    setRememberedUsername(username)
  )

  // Kullanıcı Yönetimi (admin paneli)
  ipcMain.handle(IPC.USERS_LIST, () => {
    requirePermission('users.manage')
    return auth.listUsers()
  })
  // Booking listesindeki "Kullanıcı" kolonunda ad-soyad göstermek için - yetki kontrolü yok,
  // e-posta içermez.
  ipcMain.handle(IPC.USERS_LIST_DIRECTORY, () => auth.listUserDirectory())
  ipcMain.handle(IPC.USERS_CREATE, (_e, input: UserCreateInput) => {
    requirePermission('users.manage')
    return auth.createUser(input)
  })
  ipcMain.handle(IPC.USERS_SET_EMAIL, (_e, targetUserId: number, email: string) => {
    requirePermission('users.manage')
    return auth.setUserEmail(targetUserId, email)
  })
  ipcMain.handle(IPC.USERS_SET_PASSWORD, (_e, targetUserId: number) => {
    requirePermission('users.manage')
    return auth.regeneratePassword(targetUserId)
  })
  ipcMain.handle(IPC.USERS_UPDATE_ROLE, (_e, targetUserId: number, role: UserRole) => {
    requirePermission('users.manage')
    return auth.updateUserRole(targetUserId, role)
  })
  ipcMain.handle(IPC.USERS_SET_ACTIVE, (_e, targetUserId: number, isActive: boolean) => {
    requirePermission('users.manage')
    return auth.setUserActive(targetUserId, isActive)
  })
  ipcMain.handle(IPC.USERS_GET_ROLE_PERMISSIONS, (_e, role: UserRole) => {
    requirePermission('users.manage')
    return auth.getRolePermissions(role)
  })
  ipcMain.handle(
    IPC.USERS_SET_ROLE_PERMISSION,
    (_e, role: UserRole, action: PermissionAction, allowed: boolean) => {
      requirePermission('users.manage')
      return auth.setRolePermission(role, action, allowed)
    }
  )
  ipcMain.handle(IPC.USERS_GET_USER_PERMISSIONS, (_e, targetUserId: number) => {
    requirePermission('users.manage')
    return auth.getUserPermissions(targetUserId)
  })
  ipcMain.handle(
    IPC.USERS_SET_USER_PERMISSION,
    (_e, targetUserId: number, action: PermissionAction, allowed: boolean | null) => {
      requirePermission('users.manage')
      return auth.setUserPermission(targetUserId, action, allowed)
    }
  )

  // Pending booking deletions (Operation Manager/Admin approval workflow)
  ipcMain.handle(IPC.PENDING_DELETIONS_LIST, () => {
    requirePermission('bookings.manage')
    return hasPermission('pending_deletions.manage')
      ? listPendingDeletions()
      : listPendingDeletions(getCurrentUser())
  })
  ipcMain.handle(IPC.PENDING_DELETIONS_LIST_ACTIVE_BOOKING_IDS, () =>
    listActivePendingDeletionBookingIds()
  )
  ipcMain.handle(IPC.PENDING_DELETIONS_APPROVE, (_e, requestId: number) => {
    requirePermission('pending_deletions.manage')
    return approvePendingDeletion(requestId)
  })
  ipcMain.handle(IPC.PENDING_DELETIONS_REJECT, (_e, requestId: number, note?: string) => {
    requirePermission('pending_deletions.manage')
    return rejectPendingDeletion(requestId, note)
  })
  ipcMain.handle(IPC.PENDING_DELETIONS_WITHDRAW, (_e, requestId: number) => {
    requirePermission('bookings.manage')
    return withdrawPendingDeletion(requestId)
  })

  // Müşteri Yönetimi (Customer)
  ipcMain.handle(IPC.CUSTOMERS_LIST, () => {
    requireAdmin()
    return listCustomers()
  })
  ipcMain.handle(IPC.CUSTOMERS_GET, (_e, id: number) => {
    requireAdmin()
    return getCustomer(id)
  })
  ipcMain.handle(IPC.CUSTOMERS_LIST_DIRECTORY, () => {
    requirePermission('bookings.manage')
    return listCustomerDirectory()
  })
  ipcMain.handle(IPC.CUSTOMERS_CREATE, (_e, input: CustomerInput, initialPassword: string) => {
    requireAdmin()
    return createCustomer(input, initialPassword)
  })
  ipcMain.handle(IPC.CUSTOMERS_UPDATE, (_e, id: number, input: CustomerInput) => {
    requireAdmin()
    return updateCustomer(id, input)
  })
  ipcMain.handle(IPC.CUSTOMERS_DELETE, (_e, id: number) => {
    requireAdmin()
    return deleteCustomer(id)
  })
}
