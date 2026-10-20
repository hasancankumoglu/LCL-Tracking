/** UI/report language. Persisted in the main process, synced to the renderer's i18next instance via IPC. */
export type Language = 'tr' | 'en'

export interface AppUpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version: string | null
  releaseNotes: string
  progress: { percent: number; transferred: number; total: number; bytesPerSecond: number } | null
  error: string | null
}

export type ContainerType = '40RF' | '40HC' | '20DC'

export type DocumentType = 'BEYANNAME' | 'VGM' | 'TALIMAT' | 'BOOKING_CONFIRMATION' | 'DRAFT_BL'

export type BookingStatus = 'YUKLENMEDI' | 'YUKLEMEDE' | 'EKSIK_EVRAK' | 'TAMAMLANDI' | 'CANCEL'

export const CONTAINER_TYPES: ContainerType[] = ['40RF', '40HC', '20DC']

export const BOOKING_STATUSES: BookingStatus[] = [
  'YUKLENMEDI',
  'YUKLEMEDE',
  'EKSIK_EVRAK',
  'TAMAMLANDI',
  'CANCEL'
]

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  YUKLENMEDI: 'Yüklenmedi',
  YUKLEMEDE: 'Yüklemede',
  EKSIK_EVRAK: 'Eksik Evrak',
  TAMAMLANDI: 'Tamamlandı',
  CANCEL: 'İptal'
}

/** Sadece bu statülerdeki bookingler arşivlenebilir. */
export const ARCHIVABLE_BOOKING_STATUSES: BookingStatus[] = ['TAMAMLANDI', 'CANCEL']

export const DOCUMENT_TYPES: DocumentType[] = [
  'BEYANNAME',
  'VGM',
  'TALIMAT',
  'BOOKING_CONFIRMATION',
  'DRAFT_BL'
]

/**
 * "Eksik Evrak" hesaplamalarında (booking listesi rozeti, haftalık plan, raporlar) dikkate
 * alınan zorunlu döküman tipleri. BOOKING_CONFIRMATION zorunlu değildir, bu yüzden eksik
 * olduğunda booking'i "eksik evrak" olarak işaretlemez - sadece bilgi amaçlıdır.
 */
export const REQUIRED_DOCUMENT_TYPES: DocumentType[] = DOCUMENT_TYPES.filter(
  (t) => t !== 'BOOKING_CONFIRMATION'
)

/** Döküman olarak yüklenebilen dosya uzantıları (nokta olmadan, küçük harf). */
export const DOCUMENT_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf', 'webp', 'doc', 'docx']

/** Booking formundaki, kullanıcı tarafından yeni değer eklenebilen aranabilir dropdown alanları. */
export type LookupFieldType = 'category' | 'destination' | 'line' | 'pol'

export const LOOKUP_FIELD_TYPES: LookupFieldType[] = ['category', 'destination', 'line', 'pol']

export interface Booking {
  id: number
  bookingNo: string
  vesselDeparture: string | null
  declarationCutOff: string | null
  siCutOff: string | null
  category: string | null
  destination: string | null
  line: string | null
  pol: string | null
  status: BookingStatus
  archived: boolean
  notes: string | null
  /** Bu booking için planlanan konteyner (unit) sayısı. Belirtilirse eklenen konteyner sayısı bunu geçemez. */
  unit: number | null
  /** Konşimento (Bill of Lading) numarası. Armatör API entegrasyonu için sorgu anahtarı. */
  blNumber: string | null
  /** Armatör API'sinden çekilen tahmini varış tarihi (ISO). */
  eta: string | null
  /** Armatör API'sinden çekilen tahmini kalkış tarihi (ISO). */
  etd: string | null
  /** Armatör API'sinden çekilen konşimento/shipment statüsü (serbest metin, armatöre göre değişir). */
  blStatus: string | null
  /** Armatör API'sinden çekilen free time bitiş tarihi (ISO), armatöre göre gelmeyebilir. */
  freeTimeEnd: string | null
  /** Bu booking'in armatör API'sinden en son ne zaman güncellendiği (ISO). */
  lastCarrierSyncAt: string | null
  /** Bu bookingin bağlı olduğu müşteri (Customer rolü, sadece kendi müşterisine ait bookingleri görür). */
  customerId: number | null
  createdAt: string
  updatedAt: string
  /** Bu kaydı ilk oluşturan Windows kullanıcı adı. */
  createdBy: string | null
  /** Bu kaydı son güncelleyen Windows kullanıcı adı. */
  updatedBy: string | null
}

export interface BookingWithStats extends Booking {
  containerCount: number
  containerSizes: string
  /** Bu booking için henüz yüklenmemiş döküman tipleri (DOCUMENT_TYPES'ın alt kümesi). */
  missingDocumentTypes: DocumentType[]
}

export type BookingInput = Omit<
  Booking,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>

export interface Container {
  id: number
  bookingId: number
  containerNo: string | null
  type: ContainerType
  sealNo: string | null
  truckPlate: string | null
  trailerPlate: string | null
  driverPhone: string | null
  vesselName: string | null
  imoNumber: string | null
  mmsiNumber: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  /** Bu kaydı ilk oluşturan Windows kullanıcı adı. */
  createdBy: string | null
  /** Bu kaydı son güncelleyen Windows kullanıcı adı. */
  updatedBy: string | null
}

export type ContainerInput = Omit<
  Container,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>

/** Gemi takip ekranı için: konteynerin bağlı olduğu booking bilgileriyle birlikte. */
export interface ContainerWithBooking extends Container {
  bookingNo: string
  bookingStatus: BookingStatus
  bookingPol: string | null
  bookingDestination: string | null
  bookingLine: string | null
  bookingVesselDeparture: string | null
}

/** Aynı konteyner numarasının arşivlenmemiş (aktif) başka bir booking'de bulunduğunu gösteren çakışma kaydı. */
export interface ContainerConflict {
  containerId: number
  bookingId: number
  bookingNo: string
  bookingStatus: BookingStatus
}

/**
 * Kaynak Excel'de booking ve/veya konteyner numarası net biçimde belli olmayan
 * (ör. sadece BL referansı olan, booking'i henüz bilinmeyen) araç/yük kayıtları.
 * "Atanmayan Araçlar" sayfasından kullanıcı tarafından elle bir booking'e
 * konteyner olarak atanana kadar burada bekler.
 */
export interface UnassignedVehicle {
  id: number
  truckPlate: string | null
  driverPhone: string | null
  location: string | null
  type: string | null
  containerNo: string | null
  agent: string | null
  sealNo: string | null
  notes: string | null
  /** Kaynak dosyadaki ham BL/booking referansı - sadece ipucu, otomatik eşleştirme yapılmaz. */
  sourceBookingRef: string | null
  sourceSheet: string | null
  sourceRow: number | null
  createdAt: string
}

export type UnassignedVehicleInput = Omit<UnassignedVehicle, 'id' | 'createdAt'>

/** Bir "Atanmayan Araç" kaydını gerçek bir booking'e konteyner olarak atarken kullanılan girdi. */
export interface UnassignedVehicleAssignInput {
  bookingId: number
  containerNo: string | null
  type: ContainerType
}

export interface UnassignedVehicleSelection {
  id: number
  containerNo: string | null
  type: ContainerType
}

export interface AppDocument {
  id: number
  bookingId: number
  type: DocumentType
  filePath: string
  originalFileName: string | null
  uploadedAt: string
}

export interface ExcelImportResult {
  bookingsCreated: number
  bookingsUpdated: number
  containersCreated: number
  unassignedVehiclesCreated: number
  errors: string[]
}

export interface ExcelPreviewBookingRow {
  sheetName: string
  rowNumber: number
  bookingNo: string
  status: BookingStatus
  destination: string | null
  line: string | null
  pol: string | null
  action: 'create' | 'update'
}

export interface ExcelPreviewContainerRow {
  sheetName: string
  rowNumber: number
  bookingNo: string
  containerNo: string | null
  type: ContainerType | null
}

/** Booking/konteyner numarası net belli olmayıp "Atanmayan Araçlar"a düşecek satırların önizlemesi (ör. AFGAN sekmesi). */
export interface ExcelPreviewUnassignedVehicleRow {
  sheetName: string
  rowNumber: number
  truckPlate: string | null
  containerNo: string | null
  sourceBookingRef: string | null
}

/** İçe aktarmadan önce, dosyaları veritabanına yazmadan gösterilecek önizleme/doğrulama sonucu. */
export interface ExcelPreviewResult {
  directoryPath: string
  bookingsFileName: string | null
  containersFileName: string | null
  bookingRows: ExcelPreviewBookingRow[]
  containerRows: ExcelPreviewContainerRow[]
  unassignedVehicleRows: ExcelPreviewUnassignedVehicleRow[]
  bookingsToCreate: number
  bookingsToUpdate: number
  containersToCreate: number
  unassignedVehiclesToCreate: number
  errors: string[]
}

/** Raporlar bölümündeki dönem filtresi. */
export type ReportRange = 'all' | 'today' | 'week' | 'month' | 'year'

/** "Hepsi" her zaman ilk sırada gösterilir. */
export const REPORT_RANGES: ReportRange[] = ['all', 'today', 'week', 'month', 'year']

/** Dağılım grafiklerinde (hat, liman vb.) tek bir sıralı kırılım satırı. */
export interface ReportBreakdownRow {
  label: string
  count: number
}

export interface DashboardStats {
  statusCounts: Record<BookingStatus, number>
  containerTypeCounts: Record<ContainerType, number>
  /** Seçili döneme göre en çok kullanılan hatlar (ilk 6). */
  lineCounts: ReportBreakdownRow[]
  /** Seçili döneme göre en çok kullanılan yükleme limanları (ilk 6). */
  polCounts: ReportBreakdownRow[]
  /** Seçili döneme göre müşteri bazlı booking sayısı (ilk 6) - sadece Customer dışı roller için anlamlı. */
  customerBookingCounts: ReportBreakdownRow[]
  /** Seçili döneme göre müşteri bazlı konteyner sayısı (ilk 6) - sadece Customer dışı roller için anlamlı. */
  customerContainerCounts: ReportBreakdownRow[]
  upcoming: BookingWithStats[]
  /** İçinde bulunulan haftanın (Pazartesi-Pazar) bookingleri, haftalık operasyon planlama tablosu için. */
  weeklyPlan: BookingWithStats[]
}

export interface BackupConfig {
  backupFolder: string | null
  lastBackupAt: string | null
  lastBackupStatus: 'success' | 'error' | null
  lastBackupError: string | null
}

export interface BackupResult {
  success: boolean
  filePath?: string
  sizeBytes?: number
  error?: string
}

export interface RestoreResult {
  success: boolean
  error?: string
}

/* ---------- Raporlar (Word export + varsayılan e-posta uygulamasında paylaşım) ---------- */

export interface EmailSendInput {
  subject: string
}

export interface EmailSendResult {
  success: boolean
  error?: string
}

/** Booking bazlı rapor: seçili booking(ler) + konteynerlarının tam listesi. */
export interface BookingReportData {
  bookings: Array<{
    booking: Booking
    containers: Container[]
    missingDocumentTypes: DocumentType[]
  }>
  generatedAt: string
}

/** Dönemsel (zaman bazlı) rapor: seçili aralıktaki bookingler + özet dağılımlar. */
export interface RangeReportData {
  range: ReportRange
  rangeLabel: string
  bookings: BookingWithStats[]
  statusCounts: Record<BookingStatus, number>
  containerTypeCounts: Record<ContainerType, number>
  totalContainers: number
  generatedAt: string
}

export interface ReportExportResult {
  canceled: boolean
  filePath?: string
}

/* ---------- Armatör API Entegrasyonu (Track & Trace) ---------- */

/** Şu an desteklenen armatörler. Yeni bir armatör eklendiğinde buraya ve main/carriers/ altına adaptör eklenir. */
export type CarrierName = 'MAERSK'

export const CARRIER_NAMES: CarrierName[] = ['MAERSK']

/** Armatör sorgusu hangi referans numarasıyla yapılacak. */
export type CarrierReferenceType = 'BL' | 'BOOKING' | 'CONTAINER'

export const CARRIER_REFERENCE_TYPES: CarrierReferenceType[] = ['BL', 'BOOKING', 'CONTAINER']

export interface CarrierContainerSnapshot {
  containerNo: string
  /** Armatörden gelen ekipman tipi kodu (ör. 45G1) - uygulamanın ContainerType değerleriyle birebir eşleşmeyebilir, sadece bilgi amaçlı. */
  equipmentTypeCode: string | null
}

/**
 * Snapshot'ın nereden geldiği: `official` = resmi Track & Trace Events API,
 * `public-fallback` = maersk.com'un halka açık takip sayfasından deneysel olarak
 * kazınmış veri (doğruluğu garanti edilmez, kullanıcı bilerek tetikler).
 */
export type CarrierSnapshotSource = 'official' | 'public-fallback'

/** Armatör API'sinden çekilip normalize edilmiş, önizleme/uygulama için kullanılan tekil shipment görüntüsü. */
export interface CarrierBookingSnapshot {
  carrier: CarrierName
  source: CarrierSnapshotSource
  bookingReference: string | null
  blNumber: string | null
  vesselName: string | null
  imoNumber: string | null
  pol: string | null
  destination: string | null
  eta: string | null
  etd: string | null
  freeTimeEnd: string | null
  blStatus: string | null
  containers: CarrierContainerSnapshot[]
  /** Bu snapshot'ın kaç ham event'ten türetildiği - hata ayıklama/güven göstergesi. */
  rawEventCount: number
}

export type CarrierLookupResult =
  | { status: 'found'; snapshot: CarrierBookingSnapshot }
  | { status: 'not_found' }
  | { status: 'not_configured' }
  | { status: 'error'; message: string }

export interface CarrierApplyRequest {
  bookingId: number
  snapshot: CarrierBookingSnapshot
}

export interface CarrierApplyResult {
  booking: Booking
  /** Snapshot'taki hangi konteynır no'ların bu booking altında eşleşip güncellendiği. */
  updatedContainerNos: string[]
  /** Snapshot'ta olup bu booking altında karşılığı bulunamayan (bu yüzden atlanan) konteynır no'lar. */
  unmatchedContainerNos: string[]
}

/* ---------- Kullanıcı Yönetimi & Yetkilendirme (kullanıcı adı/şifre girişi) ---------- */

export type UserRole = 'ADMIN' | 'OPERATOR' | 'OPERATION_MANAGER' | 'CUSTOMER'

export const USER_ROLES: UserRole[] = ['ADMIN', 'OPERATOR', 'OPERATION_MANAGER', 'CUSTOMER']

/**
 * Modül bazlı yetki anahtarları. Admin rolü her zaman tüm işlemlere yetkilidir (sabit,
 * bu listeden bağımsız). Operatör rolü için varsayılan izinler `role_permissions`
 * tablosunda, kişiye özel istisnalar `user_permissions` tablosunda tutulur ve kişi bazlı
 * olan rol varsayılanını ezer. Bu liste `supabase/sql/005_auth_and_permissions.sql`
 * içindeki RPC fonksiyonlarıyla birebir aynı tutulmalıdır.
 */
export type PermissionAction =
  | 'bookings.manage'
  | 'containers.manage'
  | 'documents.manage'
  | 'excel.import'
  | 'excel.export'
  | 'reports.manage'
  | 'dashboard.view'
  | 'vessel_tracking.view'
  | 'archive.view'
  | 'unassigned_vehicles.manage'
  | 'carriers.manage'
  | 'backup.manage'
  | 'users.manage'
  | 'bookings.delete_direct'
  | 'pending_deletions.manage'

export const PERMISSION_ACTIONS: PermissionAction[] = [
  'bookings.manage',
  'containers.manage',
  'documents.manage',
  'excel.import',
  'excel.export',
  'reports.manage',
  'dashboard.view',
  'vessel_tracking.view',
  'archive.view',
  'unassigned_vehicles.manage',
  'carriers.manage',
  'backup.manage',
  'users.manage',
  'bookings.delete_direct',
  'pending_deletions.manage'
]

export type PermissionMap = Record<PermissionAction, boolean>

export interface AppUser {
  id: number
  username: string
  displayName: string | null
  /** Booking operatör e-postası göndermek ve kullanıcı yönetimi için kullanılır. */
  email: string | null
  role: UserRole
  /** Role='CUSTOMER' ise bağlı olduğu müşteri kaydı; diğer roller için null. */
  customerId: number | null
  mustChangePassword: boolean
  isActive: boolean
  createdAt: string
}

/** Oturum açmış kullanıcı: profil bilgisi + o oturum için çözümlenmiş etkin yetkiler. */
export interface AuthenticatedUser extends AppUser {
  permissions: PermissionMap
}

export interface UserCreateInput {
  username: string
  displayName: string
  email: string
  role: UserRole
  initialPassword: string
}

/** Tüm kullanıcılar için düşük hassasiyetli dizin kaydı - booking listesindeki "Kullanıcı" kolonunda ad-soyad göstermek için `users.manage` yetkisi olmayan kullanıcılarca da okunabilir. */
export interface UserDirectoryEntry {
  username: string
  displayName: string | null
}

/** Booking operatörüne e-posta göndermek için gereken, e-postayı da içeren iletişim bilgisi. */
export interface UserContact {
  displayName: string | null
  email: string | null
}

/** Admin ekranındaki kişi bazlı yetki override modalındaki tek bir işlem satırı. */
export interface UserPermissionState {
  roleDefault: boolean
  /** null = override yok (rol varsayılanı geçerli), true/false = kişiye özel zorlama. */
  override: boolean | null
}

export type UserPermissionsMap = Record<PermissionAction, UserPermissionState>

export interface LoginResult {
  user: AuthenticatedUser
}

/* ---------- Müşteri Yönetimi (Customer rolü) ---------- */

export interface Customer {
  id: number
  taxNo: string
  name: string
  taxOffice: string
  address: string | null
  email: string
  phone: string | null
  createdAt: string
  updatedAt: string
}

export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>

/** Bir müşteri oluşturulduğunda otomatik oluşan giriş hesabının bilgileri - şifre sadece bu yanıtta bir kez döner. */
export interface CustomerCreateResult {
  customer: Customer
  username: string
  password: string
}

/** Booking formundaki müşteri seçici dropdown için düşük hassasiyetli dizin kaydı (sadece id+ad). */
export interface CustomerDirectoryEntry {
  id: number
  name: string
}

/* ---------- Booking Silme Onay Akışı (Operation Manager rolü) ---------- */

export type PendingDeletionStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/** Bir booking silme talebi - onay/red kararı verilene kadar booking kaydı silinmez. */
export interface PendingBookingDeletion {
  id: number
  bookingId: number
  /** Talep anında alınan anlık görüntü - booking onaylanarak silindikten sonra da listede okunabilir kalması için. */
  bookingNo: string
  blNumber: string | null
  destination: string | null
  line: string | null
  status: PendingDeletionStatus
  requestedBy: string
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  requestNote: string | null
  decisionNote: string | null
}

export interface BookingDeleteResult {
  deleted: boolean
  pendingRequested?: boolean
}
