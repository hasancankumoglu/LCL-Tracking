import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc'
import { toPublicUrl } from '../shared/storage'
import type {
  AppUpdateState,
  Language,
  Booking,
  BookingInput,
  BookingWithStats,
  Container,
  ContainerInput,
  ContainerConflict,
  AppDocument,
  DocumentType,
  ExcelImportResult,
  ExcelPreviewResult,
  DashboardStats,
  BackupConfig,
  BackupResult,
  RestoreResult,
  CarrierName,
  CarrierReferenceType,
  CarrierLookupResult,
  CarrierBookingSnapshot,
  CarrierApplyResult,
  AppUser,
  AuthenticatedUser,
  PermissionAction,
  PermissionMap,
  UserCreateInput,
  UserDirectoryEntry,
  UserPermissionsMap,
  UserRole,
  LookupFieldType,
  ContainerWithBooking,
  ReportRange,
  BookingReportData,
  RangeReportData,
  ReportExportResult,
  EmailSendInput,
  EmailSendResult,
  UnassignedVehicle,
  UnassignedVehicleInput,
  UnassignedVehicleAssignInput,
  UnassignedVehicleSelection,
  BookingDeleteResult,
  PendingBookingDeletion,
  Customer,
  CustomerInput,
  CustomerCreateResult,
  CustomerDirectoryEntry
} from '../shared/types'

// Custom APIs for renderer
const api = {
  /** Sürüklenip bırakılan bir File nesnesinin diskteki gerçek yolunu döner. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION)
  },
  updates: {
    getState: (): Promise<AppUpdateState> => ipcRenderer.invoke(IPC.UPDATE_GET_STATE),
    download: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    onStateChanged: (callback: (state: AppUpdateState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: AppUpdateState): void =>
        callback(state)
      ipcRenderer.on(IPC.UPDATE_STATE_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.UPDATE_STATE_CHANGED, listener)
    }
  },
  ui: {
    getLanguage: (): Promise<Language> => ipcRenderer.invoke(IPC.UI_LANGUAGE_GET),
    setLanguage: (language: Language): Promise<Language> =>
      ipcRenderer.invoke(IPC.UI_LANGUAGE_SET, language)
  },
  bookings: {
    list: (): Promise<BookingWithStats[]> => ipcRenderer.invoke(IPC.BOOKINGS_LIST),
    get: (id: number): Promise<Booking | undefined> => ipcRenderer.invoke(IPC.BOOKINGS_GET, id),
    getByNo: (bookingNo: string): Promise<Booking | undefined> =>
      ipcRenderer.invoke(IPC.BOOKINGS_GET_BY_NO, bookingNo),
    create: (input: BookingInput): Promise<Booking> =>
      ipcRenderer.invoke(IPC.BOOKINGS_CREATE, input),
    createWithVehicles: (
      input: BookingInput,
      vehicles: UnassignedVehicleSelection[]
    ): Promise<Booking> => ipcRenderer.invoke(IPC.BOOKINGS_CREATE_WITH_VEHICLES, input, vehicles),
    update: (id: number, input: BookingInput): Promise<Booking> =>
      ipcRenderer.invoke(IPC.BOOKINGS_UPDATE, id, input),
    remove: (id: number): Promise<BookingDeleteResult> =>
      ipcRenderer.invoke(IPC.BOOKINGS_DELETE, id),
    listArchived: (): Promise<BookingWithStats[]> => ipcRenderer.invoke(IPC.BOOKINGS_LIST_ARCHIVED),
    archive: (id: number, archived: boolean): Promise<Booking> =>
      ipcRenderer.invoke(IPC.BOOKINGS_ARCHIVE, id, archived)
  },
  containers: {
    listByBooking: (bookingId: number): Promise<Container[]> =>
      ipcRenderer.invoke(IPC.CONTAINERS_LIST_BY_BOOKING, bookingId),
    create: (input: ContainerInput): Promise<Container> =>
      ipcRenderer.invoke(IPC.CONTAINERS_CREATE, input),
    update: (id: number, input: ContainerInput): Promise<Container> =>
      ipcRenderer.invoke(IPC.CONTAINERS_UPDATE, id, input),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.CONTAINERS_DELETE, id),
    findConflicts: (containerNo: string, excludeId?: number): Promise<ContainerConflict[]> =>
      ipcRenderer.invoke(IPC.CONTAINERS_FIND_CONFLICTS, containerNo, excludeId),
    listForTracking: (): Promise<ContainerWithBooking[]> =>
      ipcRenderer.invoke(IPC.CONTAINERS_LIST_FOR_TRACKING)
  },
  documents: {
    listByBooking: (bookingId: number): Promise<AppDocument[]> =>
      ipcRenderer.invoke(IPC.DOCUMENTS_LIST_BY_BOOKING, bookingId),
    add: (bookingId: number, type: DocumentType, sourcePaths: string[]): Promise<AppDocument[]> =>
      ipcRenderer.invoke(IPC.DOCUMENTS_ADD, bookingId, type, sourcePaths),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.DOCUMENTS_DELETE, id),
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.DOCUMENTS_PICK_FILES),
    open: (filePath: string): Promise<string> => ipcRenderer.invoke(IPC.DOCUMENTS_OPEN, filePath),
    download: (
      filePath: string,
      suggestedName?: string
    ): Promise<{ canceled: boolean; filePath?: string }> =>
      ipcRenderer.invoke(IPC.DOCUMENTS_DOWNLOAD, filePath, suggestedName),
    toFileUrl: (filePath: string): string => toPublicUrl(filePath)
  },
  excel: {
    export: (
      bookingIds?: number[]
    ): Promise<{
      canceled: boolean
      bookingsFilePath?: string
      containersFilePath?: string
    }> => ipcRenderer.invoke(IPC.EXCEL_EXPORT, bookingIds),
    pickImportFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.EXCEL_PICK_IMPORT_FOLDER),
    previewImport: (paths: string[]): Promise<ExcelPreviewResult> =>
      ipcRenderer.invoke(IPC.EXCEL_PREVIEW_IMPORT, paths),
    commitImport: (directoryPath: string): Promise<ExcelImportResult> =>
      ipcRenderer.invoke(IPC.EXCEL_COMMIT_IMPORT, directoryPath)
  },
  dashboard: {
    stats: (range?: ReportRange): Promise<DashboardStats> =>
      ipcRenderer.invoke(IPC.DASHBOARD_STATS, range)
  },
  lookups: {
    list: (fieldType: LookupFieldType): Promise<string[]> =>
      ipcRenderer.invoke(IPC.LOOKUPS_LIST, fieldType),
    add: (fieldType: LookupFieldType, value: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.LOOKUPS_ADD, fieldType, value)
  },
  unassignedVehicles: {
    list: (): Promise<UnassignedVehicle[]> => ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_LIST),
    create: (input: UnassignedVehicleInput): Promise<UnassignedVehicle> =>
      ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_CREATE, input),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_DELETE, id),
    assign: (id: number, input: UnassignedVehicleAssignInput): Promise<Container> =>
      ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_ASSIGN, id, input)
  },
  reports: {
    getBookingReport: (bookingIds: number[]): Promise<BookingReportData> =>
      ipcRenderer.invoke(IPC.REPORTS_GET_BOOKING_REPORT, bookingIds),
    getRangeReport: (range: ReportRange): Promise<RangeReportData> =>
      ipcRenderer.invoke(IPC.REPORTS_GET_RANGE_REPORT, range),
    exportBookingWord: (bookingIds: number[]): Promise<ReportExportResult> =>
      ipcRenderer.invoke(IPC.REPORTS_EXPORT_BOOKING_WORD, bookingIds),
    exportRangeWord: (range: ReportRange): Promise<ReportExportResult> =>
      ipcRenderer.invoke(IPC.REPORTS_EXPORT_RANGE_WORD, range),
    sendBookingEmail: (bookingIds: number[], input: EmailSendInput): Promise<EmailSendResult> =>
      ipcRenderer.invoke(IPC.REPORTS_SEND_BOOKING_EMAIL, bookingIds, input),
    sendRangeEmail: (range: ReportRange, input: EmailSendInput): Promise<EmailSendResult> =>
      ipcRenderer.invoke(IPC.REPORTS_SEND_RANGE_EMAIL, range, input),
    sendOperatorEmail: (bookingId: number): Promise<EmailSendResult> =>
      ipcRenderer.invoke(IPC.REPORTS_SEND_OPERATOR_EMAIL, bookingId)
  },
  backup: {
    getConfig: (): Promise<BackupConfig> => ipcRenderer.invoke(IPC.BACKUP_GET_CONFIG),
    pickFolder: (): Promise<BackupConfig> => ipcRenderer.invoke(IPC.BACKUP_PICK_FOLDER),
    runNow: (): Promise<BackupResult> => ipcRenderer.invoke(IPC.BACKUP_RUN_NOW),
    pickRestoreFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.BACKUP_PICK_RESTORE_FILE),
    restore: (zipPath: string): Promise<RestoreResult> =>
      ipcRenderer.invoke(IPC.BACKUP_RESTORE, zipPath),
    openLogsFolder: (): Promise<void> => ipcRenderer.invoke(IPC.BACKUP_OPEN_LOGS_FOLDER)
  },
  carriers: {
    hasCredentials: (carrier: CarrierName): Promise<boolean> =>
      ipcRenderer.invoke(IPC.CARRIERS_HAS_CREDENTIALS, carrier),
    setCredentials: (
      carrier: CarrierName,
      consumerKey: string,
      consumerSecret: string
    ): Promise<void> =>
      ipcRenderer.invoke(IPC.CARRIERS_SET_CREDENTIALS, carrier, consumerKey, consumerSecret),
    clearCredentials: (carrier: CarrierName): Promise<void> =>
      ipcRenderer.invoke(IPC.CARRIERS_CLEAR_CREDENTIALS, carrier),
    lookup: (
      carrier: CarrierName,
      referenceType: CarrierReferenceType,
      value: string
    ): Promise<CarrierLookupResult> =>
      ipcRenderer.invoke(IPC.CARRIERS_LOOKUP, carrier, referenceType, value),
    lookupPublicFallback: (
      carrier: CarrierName,
      referenceType: CarrierReferenceType,
      value: string
    ): Promise<CarrierLookupResult> =>
      ipcRenderer.invoke(IPC.CARRIERS_LOOKUP_PUBLIC_FALLBACK, carrier, referenceType, value),
    apply: (bookingId: number, snapshot: CarrierBookingSnapshot): Promise<CarrierApplyResult> =>
      ipcRenderer.invoke(IPC.CARRIERS_APPLY, bookingId, snapshot)
  },
  auth: {
    login: (username: string, password: string): Promise<AuthenticatedUser> =>
      ipcRenderer.invoke(IPC.AUTH_LOGIN, username, password),
    logout: (): Promise<void> => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
    changePassword: (oldPassword: string, newPassword: string): Promise<void> =>
      ipcRenderer.invoke(IPC.AUTH_CHANGE_PASSWORD, oldPassword, newPassword),
    getRememberedUsername: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.AUTH_GET_REMEMBERED_USERNAME),
    setRememberedUsername: (username: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.AUTH_SET_REMEMBERED_USERNAME, username)
  },
  users: {
    list: (): Promise<AppUser[]> => ipcRenderer.invoke(IPC.USERS_LIST),
    listDirectory: (): Promise<UserDirectoryEntry[]> =>
      ipcRenderer.invoke(IPC.USERS_LIST_DIRECTORY),
    create: (input: UserCreateInput): Promise<AppUser> =>
      ipcRenderer.invoke(IPC.USERS_CREATE, input),
    setEmail: (targetUserId: number, email: string): Promise<void> =>
      ipcRenderer.invoke(IPC.USERS_SET_EMAIL, targetUserId, email),
    setPassword: (targetUserId: number): Promise<string> =>
      ipcRenderer.invoke(IPC.USERS_SET_PASSWORD, targetUserId),
    updateRole: (targetUserId: number, role: UserRole): Promise<void> =>
      ipcRenderer.invoke(IPC.USERS_UPDATE_ROLE, targetUserId, role),
    setActive: (targetUserId: number, isActive: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.USERS_SET_ACTIVE, targetUserId, isActive),
    getRolePermissions: (role: UserRole): Promise<PermissionMap> =>
      ipcRenderer.invoke(IPC.USERS_GET_ROLE_PERMISSIONS, role),
    setRolePermission: (
      role: UserRole,
      action: PermissionAction,
      allowed: boolean
    ): Promise<void> => ipcRenderer.invoke(IPC.USERS_SET_ROLE_PERMISSION, role, action, allowed),
    getUserPermissions: (targetUserId: number): Promise<UserPermissionsMap> =>
      ipcRenderer.invoke(IPC.USERS_GET_USER_PERMISSIONS, targetUserId),
    setUserPermission: (
      targetUserId: number,
      action: PermissionAction,
      allowed: boolean | null
    ): Promise<void> =>
      ipcRenderer.invoke(IPC.USERS_SET_USER_PERMISSION, targetUserId, action, allowed)
  },
  pendingDeletions: {
    list: (): Promise<PendingBookingDeletion[]> => ipcRenderer.invoke(IPC.PENDING_DELETIONS_LIST),
    listActiveBookingIds: (): Promise<number[]> =>
      ipcRenderer.invoke(IPC.PENDING_DELETIONS_LIST_ACTIVE_BOOKING_IDS),
    approve: (requestId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.PENDING_DELETIONS_APPROVE, requestId),
    reject: (requestId: number, note?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.PENDING_DELETIONS_REJECT, requestId, note),
    withdraw: (requestId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.PENDING_DELETIONS_WITHDRAW, requestId)
  },
  customers: {
    list: (): Promise<Customer[]> => ipcRenderer.invoke(IPC.CUSTOMERS_LIST),
    get: (id: number): Promise<Customer | undefined> => ipcRenderer.invoke(IPC.CUSTOMERS_GET, id),
    listDirectory: (): Promise<CustomerDirectoryEntry[]> =>
      ipcRenderer.invoke(IPC.CUSTOMERS_LIST_DIRECTORY),
    create: (input: CustomerInput, initialPassword: string): Promise<CustomerCreateResult> =>
      ipcRenderer.invoke(IPC.CUSTOMERS_CREATE, input, initialPassword),
    update: (id: number, input: CustomerInput): Promise<Customer> =>
      ipcRenderer.invoke(IPC.CUSTOMERS_UPDATE, id, input),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.CUSTOMERS_DELETE, id)
  }
}

export type LclTrackingApi = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
