export const IPC = {
  BOOKINGS_LIST: 'bookings:list',
  BOOKINGS_GET: 'bookings:get',
  BOOKINGS_GET_BY_NO: 'bookings:getByNo',
  BOOKINGS_CREATE: 'bookings:create',
  BOOKINGS_UPDATE: 'bookings:update',
  BOOKINGS_DELETE: 'bookings:delete',
  BOOKINGS_LIST_ARCHIVED: 'bookings:listArchived',
  BOOKINGS_ARCHIVE: 'bookings:archive',

  CONTAINERS_LIST_BY_BOOKING: 'containers:listByBooking',
  CONTAINERS_CREATE: 'containers:create',
  CONTAINERS_UPDATE: 'containers:update',
  CONTAINERS_DELETE: 'containers:delete',
  CONTAINERS_FIND_CONFLICTS: 'containers:findConflicts',
  CONTAINERS_LIST_FOR_TRACKING: 'containers:listForTracking',

  UNASSIGNED_VEHICLES_LIST: 'unassignedVehicles:list',
  UNASSIGNED_VEHICLES_DELETE: 'unassignedVehicles:delete',
  UNASSIGNED_VEHICLES_ASSIGN: 'unassignedVehicles:assign',
  UNASSIGNED_VEHICLES_CREATE: 'unassignedVehicles:create',

  DOCUMENTS_LIST_BY_BOOKING: 'documents:listByBooking',
  DOCUMENTS_ADD: 'documents:add',
  DOCUMENTS_DELETE: 'documents:delete',
  DOCUMENTS_PICK_FILES: 'documents:pickFiles',
  DOCUMENTS_OPEN: 'documents:open',
  DOCUMENTS_DOWNLOAD: 'documents:download',

  EXCEL_EXPORT: 'excel:export',
  EXCEL_PICK_IMPORT_FOLDER: 'excel:pickImportFolder',
  EXCEL_PREVIEW_IMPORT: 'excel:previewImport',
  EXCEL_COMMIT_IMPORT: 'excel:commitImport',

  DASHBOARD_STATS: 'dashboard:stats',

  LOOKUPS_LIST: 'lookups:list',
  LOOKUPS_ADD: 'lookups:add',

  BACKUP_GET_CONFIG: 'backup:getConfig',
  BACKUP_PICK_FOLDER: 'backup:pickFolder',
  BACKUP_RUN_NOW: 'backup:runNow',
  BACKUP_PICK_RESTORE_FILE: 'backup:pickRestoreFile',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_OPEN_LOGS_FOLDER: 'backup:openLogsFolder',

  REPORTS_GET_BOOKING_REPORT: 'reports:getBookingReport',
  REPORTS_GET_RANGE_REPORT: 'reports:getRangeReport',
  REPORTS_EXPORT_BOOKING_WORD: 'reports:exportBookingWord',
  REPORTS_EXPORT_RANGE_WORD: 'reports:exportRangeWord',
  REPORTS_SEND_BOOKING_EMAIL: 'reports:sendBookingEmail',
  REPORTS_SEND_RANGE_EMAIL: 'reports:sendRangeEmail',

  CARRIERS_LOOKUP: 'carriers:lookup',
  CARRIERS_LOOKUP_PUBLIC_FALLBACK: 'carriers:lookupPublicFallback',
  CARRIERS_APPLY: 'carriers:apply',
  CARRIERS_HAS_CREDENTIALS: 'carriers:hasCredentials',
  CARRIERS_SET_CREDENTIALS: 'carriers:setCredentials',
  CARRIERS_CLEAR_CREDENTIALS: 'carriers:clearCredentials'
} as const
