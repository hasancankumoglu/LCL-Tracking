import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc'
import type {
  Booking,
  BookingInput,
  BookingWithStats,
  Container,
  ContainerInput,
  ContainerConflict,
  ContainerWithBooking,
  AppDocument,
  DocumentType,
  ExcelImportResult,
  ExcelPreviewResult,
  DashboardStats,
  ReportRange,
  LookupFieldType,
  BackupConfig,
  BackupResult,
  RestoreResult,
  CarrierName,
  CarrierReferenceType,
  CarrierLookupResult,
  CarrierBookingSnapshot,
  CarrierApplyResult,
  UnassignedVehicle,
  UnassignedVehicleAssignInput,
  UnassignedVehicleInput,
  BookingReportData,
  RangeReportData,
  EmailSendInput,
  EmailSendResult,
  ReportExportResult
} from '../shared/types'

// Custom APIs for renderer
const api = {
  /** Sürüklenip bırakılan bir File nesnesinin diskteki gerçek yolunu döner. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  bookings: {
    list: (): Promise<BookingWithStats[]> => ipcRenderer.invoke(IPC.BOOKINGS_LIST),
    get: (id: number): Promise<Booking | undefined> => ipcRenderer.invoke(IPC.BOOKINGS_GET, id),
    getByNo: (bookingNo: string): Promise<Booking | undefined> =>
      ipcRenderer.invoke(IPC.BOOKINGS_GET_BY_NO, bookingNo),
    create: (input: BookingInput): Promise<Booking> =>
      ipcRenderer.invoke(IPC.BOOKINGS_CREATE, input),
    update: (id: number, input: BookingInput): Promise<Booking> =>
      ipcRenderer.invoke(IPC.BOOKINGS_UPDATE, id, input),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.BOOKINGS_DELETE, id),
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
  lookups: {
    list: (fieldType: LookupFieldType): Promise<string[]> =>
      ipcRenderer.invoke(IPC.LOOKUPS_LIST, fieldType),
    add: (fieldType: LookupFieldType, value: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.LOOKUPS_ADD, fieldType, value)
  },
  unassignedVehicles: {
    list: (): Promise<UnassignedVehicle[]> => ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_LIST),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_DELETE, id),
    assign: (id: number, input: UnassignedVehicleAssignInput): Promise<Container> =>
      ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_ASSIGN, id, input),
    create: (input: UnassignedVehicleInput): Promise<UnassignedVehicle> =>
      ipcRenderer.invoke(IPC.UNASSIGNED_VEHICLES_CREATE, input)
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
    toFileUrl: (filePath: string): string => `app-doc://file?path=${encodeURIComponent(filePath)}`
  },
  excel: {
    export: (): Promise<{
      canceled: boolean
      bookingsFilePath?: string
      containersFilePath?: string
    }> => ipcRenderer.invoke(IPC.EXCEL_EXPORT),
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
      ipcRenderer.invoke(IPC.REPORTS_SEND_RANGE_EMAIL, range, input)
  }
}

export type HalilsPortalApi = typeof api

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
