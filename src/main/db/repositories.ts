import { getDb } from './schema'
import type {
  Booking,
  BookingInput,
  BookingWithStats,
  BookingStatus,
  Container,
  ContainerInput,
  ContainerType,
  ContainerConflict,
  ContainerWithBooking,
  AppDocument,
  DocumentType,
  DashboardStats,
  ReportRange,
  ReportBreakdownRow,
  LookupFieldType,
  CarrierBookingSnapshot,
  CarrierApplyResult,
  UnassignedVehicle,
  UnassignedVehicleInput,
  UnassignedVehicleAssignInput
} from '../../shared/types'
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  ARCHIVABLE_BOOKING_STATUSES,
  CONTAINER_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  LOOKUP_FIELD_TYPES
} from '../../shared/types'

// ---------- Bookings ----------

function mapBookingRow<T extends { archived: number | boolean }>(
  row: T
): T & { archived: boolean } {
  return { ...row, archived: Boolean(row.archived) }
}

/** Virgülle ayrılmış yüklenmiş döküman tipi listesinden, henüz yüklenmemiş ZORUNLU tipleri hesaplar. */
function computeMissingDocumentTypes(uploadedDocTypes: string): DocumentType[] {
  const uploaded = new Set(
    uploadedDocTypes
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  )
  return REQUIRED_DOCUMENT_TYPES.filter((t) => !uploaded.has(t))
}

export function listBookings(includeArchived = false): BookingWithStats[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT b.*,
              COUNT(DISTINCT c.id) AS containerCount,
              COALESCE(GROUP_CONCAT(DISTINCT c.type), '') AS containerSizes,
              COALESCE(GROUP_CONCAT(DISTINCT d.type), '') AS uploadedDocTypes
       FROM bookings b
       LEFT JOIN containers c ON c.bookingId = b.id
       LEFT JOIN documents d ON d.bookingId = b.id
       ${includeArchived ? '' : 'WHERE b.archived = 0'}
       GROUP BY b.id
       ORDER BY b.vesselDeparture IS NULL, b.vesselDeparture ASC, b.id DESC`
    )
    .all() as (BookingWithStats & { uploadedDocTypes: string })[]
  return rows.map((row) => {
    const { uploadedDocTypes, ...rest } = row
    return {
      ...mapBookingRow(rest as BookingWithStats),
      missingDocumentTypes: computeMissingDocumentTypes(uploadedDocTypes)
    }
  })
}

export function listArchivedBookings(): BookingWithStats[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT b.*,
              COUNT(DISTINCT c.id) AS containerCount,
              COALESCE(GROUP_CONCAT(DISTINCT c.type), '') AS containerSizes,
              COALESCE(GROUP_CONCAT(DISTINCT d.type), '') AS uploadedDocTypes
       FROM bookings b
       LEFT JOIN containers c ON c.bookingId = b.id
       LEFT JOIN documents d ON d.bookingId = b.id
       WHERE b.archived = 1
       GROUP BY b.id
       ORDER BY b.vesselDeparture IS NULL, b.vesselDeparture DESC, b.id DESC`
    )
    .all() as (BookingWithStats & { uploadedDocTypes: string })[]
  return rows.map((row) => {
    const { uploadedDocTypes, ...rest } = row
    return {
      ...mapBookingRow(rest as BookingWithStats),
      missingDocumentTypes: computeMissingDocumentTypes(uploadedDocTypes)
    }
  })
}

export function getBooking(id: number): Booking | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Booking | undefined
  return row ? mapBookingRow(row) : undefined
}

export function getBookingByNo(bookingNo: string): Booking | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM bookings WHERE bookingNo = ?').get(bookingNo) as
    Booking | undefined
  return row ? mapBookingRow(row) : undefined
}

export function createBooking(input: BookingInput): Booking {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO bookings (bookingNo, vesselDeparture, declarationCutOff, siCutOff, category, destination, line, pol, status, archived, notes, blNumber, eta, etd, blStatus, freeTimeEnd, lastCarrierSyncAt)
       VALUES (@bookingNo, @vesselDeparture, @declarationCutOff, @siCutOff, @category, @destination, @line, @pol, @status, @archived, @notes, @blNumber, @eta, @etd, @blStatus, @freeTimeEnd, @lastCarrierSyncAt)`
    )
    .run({ ...input, archived: input.archived ? 1 : 0 })
  ensureLookupValuesFromBooking(input)
  return getBooking(Number(result.lastInsertRowid)) as Booking
}

export function updateBooking(id: number, input: BookingInput): Booking {
  const db = getDb()
  db.prepare(
    `UPDATE bookings SET
       bookingNo = @bookingNo,
       vesselDeparture = @vesselDeparture,
       declarationCutOff = @declarationCutOff,
       siCutOff = @siCutOff,
       category = @category,
       destination = @destination,
       line = @line,
       pol = @pol,
       status = @status,
       archived = @archived,
       notes = @notes,
       blNumber = @blNumber,
       eta = @eta,
       etd = @etd,
       blStatus = @blStatus,
       freeTimeEnd = @freeTimeEnd,
       lastCarrierSyncAt = @lastCarrierSyncAt,
       updatedAt = datetime('now')
     WHERE id = @id`
  ).run({ ...input, archived: input.archived ? 1 : 0, id })
  ensureLookupValuesFromBooking(input)
  return getBooking(id) as Booking
}

export function setBookingArchived(id: number, archived: boolean): Booking {
  const db = getDb()
  if (archived) {
    const booking = getBooking(id)
    if (booking && !ARCHIVABLE_BOOKING_STATUSES.includes(booking.status)) {
      throw new Error(
        `Sadece "${ARCHIVABLE_BOOKING_STATUSES.map((s) => BOOKING_STATUS_LABELS[s]).join(' veya ')}" statüsündeki bookingler arşivlenebilir.`
      )
    }
  }
  db.prepare(`UPDATE bookings SET archived = ?, updatedAt = datetime('now') WHERE id = ?`).run(
    archived ? 1 : 0,
    id
  )
  return getBooking(id) as Booking
}

export function deleteBooking(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id)
}

// ---------- Lookup values (Kategori/Destination/Line/POL) ----------

export function listLookupValues(fieldType: LookupFieldType): string[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT value FROM lookup_values WHERE fieldType = ? ORDER BY value COLLATE NOCASE ASC'
    )
    .all(fieldType) as Array<{ value: string }>
  return rows.map((r) => r.value)
}

export function addLookupValue(fieldType: LookupFieldType, value: string): string[] {
  const trimmed = value.trim()
  if (trimmed) {
    const db = getDb()
    db.prepare(
      'INSERT OR IGNORE INTO lookup_values (fieldType, value) VALUES (@fieldType, @value)'
    ).run({ fieldType, value: trimmed })
  }
  return listLookupValues(fieldType)
}

/**
 * Booking oluşturma/güncelleme sırasında girilen kategori/destination/line/pol
 * değerlerini, formdan geçilmeden (ör. Excel içe aktarma) girilmiş olsa dahi
 * dropdown listelerine otomatik ekler.
 */
function ensureLookupValuesFromBooking(input: BookingInput): void {
  const fieldValues: Record<LookupFieldType, string | null> = {
    category: input.category,
    destination: input.destination,
    line: input.line,
    pol: input.pol
  }
  for (const fieldType of LOOKUP_FIELD_TYPES) {
    const value = fieldValues[fieldType]
    if (value && value.trim()) {
      addLookupValue(fieldType, value)
    }
  }
}

// ---------- Containers ----------

export function listContainersByBooking(bookingId: number): Container[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM containers WHERE bookingId = ? ORDER BY id ASC')
    .all(bookingId) as Container[]
}

export function getContainer(id: number): Container | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM containers WHERE id = ?').get(id) as Container | undefined
}

export function createContainer(input: ContainerInput): Container {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO containers (bookingId, containerNo, type, sealNo, truckPlate, trailerPlate, driverPhone, vesselName, imoNumber, mmsiNumber, notes)
       VALUES (@bookingId, @containerNo, @type, @sealNo, @truckPlate, @trailerPlate, @driverPhone, @vesselName, @imoNumber, @mmsiNumber, @notes)`
    )
    .run(input)
  return getContainer(Number(result.lastInsertRowid)) as Container
}

export function updateContainer(id: number, input: ContainerInput): Container {
  const db = getDb()
  db.prepare(
    `UPDATE containers SET
       bookingId = @bookingId,
       containerNo = @containerNo,
       type = @type,
       sealNo = @sealNo,
       truckPlate = @truckPlate,
       trailerPlate = @trailerPlate,
       driverPhone = @driverPhone,
       vesselName = @vesselName,
       imoNumber = @imoNumber,
       mmsiNumber = @mmsiNumber,
       notes = @notes,
       updatedAt = datetime('now')
     WHERE id = @id`
  ).run({ ...input, id })
  return getContainer(id) as Container
}

export function listAllContainers(): Container[] {
  const db = getDb()
  return db.prepare('SELECT * FROM containers').all() as Container[]
}

/**
 * Armatör API'sinden çekilen bir CarrierBookingSnapshot'ı mevcut bir booking'e uygular:
 * booking alanlarını (blNumber/eta/etd/blStatus/freeTimeEnd + boşsa pol/destination) günceller,
 * snapshot'taki konteynırları containerNo'ya göre bu booking altındaki mevcut konteynırlarla
 * eşleştirip vesselName/imoNumber alanlarını günceller. Eşleşmeyen konteynır no'ları oluşturmaz
 * (tipini güvenilir şekilde bilemeyiz), sadece raporlar.
 */
export function applyCarrierSnapshotToBooking(
  bookingId: number,
  snapshot: CarrierBookingSnapshot
): CarrierApplyResult {
  const existing = getBooking(bookingId)
  if (!existing) {
    throw new Error('Booking bulunamadı.')
  }

  const updatedBookingInput: BookingInput = {
    ...existing,
    blNumber: snapshot.blNumber ?? existing.blNumber,
    eta: snapshot.eta ?? existing.eta,
    etd: snapshot.etd ?? existing.etd,
    blStatus: snapshot.blStatus ?? existing.blStatus,
    freeTimeEnd: snapshot.freeTimeEnd ?? existing.freeTimeEnd,
    pol: existing.pol ?? snapshot.pol,
    destination: existing.destination ?? snapshot.destination,
    lastCarrierSyncAt: new Date().toISOString()
  }
  const booking = updateBooking(bookingId, updatedBookingInput)

  const containers = listContainersByBooking(bookingId)
  const updatedContainerNos: string[] = []
  const unmatchedContainerNos: string[] = []

  for (const snapshotContainer of snapshot.containers) {
    const match = containers.find(
      (c) =>
        c.containerNo?.trim().toUpperCase() === snapshotContainer.containerNo.trim().toUpperCase()
    )
    if (!match) {
      unmatchedContainerNos.push(snapshotContainer.containerNo)
      continue
    }
    updateContainer(match.id, {
      ...match,
      vesselName: snapshot.vesselName ?? match.vesselName,
      imoNumber: snapshot.imoNumber ?? match.imoNumber
    })
    updatedContainerNos.push(snapshotContainer.containerNo)
  }

  return { booking, updatedContainerNos, unmatchedContainerNos }
}

/**
 * Gemi takip ekranı için: arşivlenmemiş bookinglere ait tüm konteynerları,
 * booking numarası/statüsüyle birlikte döner (tree/harita filtrelemede kullanılır).
 */
export function listContainersForTracking(): ContainerWithBooking[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT c.*, b.bookingNo AS bookingNo, b.status AS bookingStatus,
              b.pol AS bookingPol, b.destination AS bookingDestination, b.line AS bookingLine,
              b.vesselDeparture AS bookingVesselDeparture
       FROM containers c
       JOIN bookings b ON b.id = c.bookingId
       WHERE b.archived = 0
       ORDER BY b.bookingNo ASC, c.id ASC`
    )
    .all() as ContainerWithBooking[]
}

/**
 * Aynı konteyner numarasının, arşivlenmemiş (aktif) farklı bir booking'de
 * zaten kayıtlı olup olmadığını kontrol eder. Mükerrer veri girişi/insan
 * hatası uyarısı için kullanılır.
 */
export function findActiveContainerConflicts(
  containerNo: string,
  excludeContainerId?: number
): ContainerConflict[] {
  const trimmed = containerNo.trim()
  if (!trimmed) return []
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT c.id AS containerId, c.bookingId, b.bookingNo, b.status AS bookingStatus
       FROM containers c
       JOIN bookings b ON b.id = c.bookingId
       WHERE b.archived = 0
         AND UPPER(TRIM(c.containerNo)) = UPPER(?)
         AND (? IS NULL OR c.id != ?)`
    )
    .all(trimmed, excludeContainerId ?? null, excludeContainerId ?? null) as ContainerConflict[]
  return rows
}

export function deleteContainer(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM containers WHERE id = ?').run(id)
}

// ---------- Unassigned Vehicles (Atanmayan Araçlar) ----------

export function listUnassignedVehicles(): UnassignedVehicle[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM unassigned_vehicles ORDER BY id DESC')
    .all() as UnassignedVehicle[]
}

export function getUnassignedVehicle(id: number): UnassignedVehicle | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM unassigned_vehicles WHERE id = ?').get(id) as
    UnassignedVehicle | undefined
}

export function createUnassignedVehicle(input: UnassignedVehicleInput): UnassignedVehicle {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO unassigned_vehicles (truckPlate, driverPhone, location, type, containerNo, agent, sealNo, notes, sourceBookingRef, sourceSheet, sourceRow)
       VALUES (@truckPlate, @driverPhone, @location, @type, @containerNo, @agent, @sealNo, @notes, @sourceBookingRef, @sourceSheet, @sourceRow)`
    )
    .run(input)
  return getUnassignedVehicle(Number(result.lastInsertRowid)) as UnassignedVehicle
}

export function deleteUnassignedVehicle(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM unassigned_vehicles WHERE id = ?').run(id)
}

/**
 * Bir "Atanmayan Araç" kaydını gerçek bir booking'e konteyner olarak atar: kullanıcının
 * seçtiği booking + konteyner tipi + (varsa düzenlediği) konteyner no ile yeni bir
 * `Container` oluşturur, ardından bekleme kaydını siler - böylece kayıt artık normal
 * şekilde ilgili booking'in konteyner listesinde görünür.
 */
export function assignUnassignedVehicle(
  id: number,
  input: UnassignedVehicleAssignInput
): Container {
  const vehicle = getUnassignedVehicle(id)
  if (!vehicle) {
    throw new Error('Atanmayan araç kaydı bulunamadı.')
  }
  const container = createContainer({
    bookingId: input.bookingId,
    containerNo: input.containerNo ?? vehicle.containerNo,
    type: input.type,
    sealNo: vehicle.sealNo,
    truckPlate: vehicle.truckPlate,
    trailerPlate: null,
    driverPhone: vehicle.driverPhone,
    vesselName: null,
    imoNumber: null,
    mmsiNumber: null,
    notes:
      [vehicle.notes, vehicle.agent ? `Acente: ${vehicle.agent}` : null]
        .filter((v): v is string => Boolean(v))
        .join(' | ') || null
  })
  deleteUnassignedVehicle(id)
  return container
}

// ---------- Dashboard ----------

/** Bir tarih (YYYY-MM-DD...) verilen rapor dönemine (bugün/bu hafta/bu ay/bu sene/hepsi) düşüyor mu? */
function isDateInReportRange(dateStr: string | null, range: ReportRange, today: Date): boolean {
  if (range === 'all') return true
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false

  if (range === 'today') {
    return isoDateOnly(d) === isoDateOnly(today)
  }
  if (range === 'week') {
    const dayOfWeek = today.getDay()
    const mondayOffset = (dayOfWeek + 6) % 7
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - mondayOffset)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const dOnly = isoDateOnly(d)
    return dOnly >= isoDateOnly(weekStart) && dOnly <= isoDateOnly(weekEnd)
  }
  if (range === 'month') {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
  }
  // 'year'
  return d.getFullYear() === today.getFullYear()
}

/** { değer: sayı } haritasını, en çoktan aza sıralı ilk N satıra çevirir (boş/null değerler hariç). */
function topBreakdown(values: (string | null)[], limit = 6): ReportBreakdownRow[] {
  const counts = new Map<string, number>()
  for (const v of values) {
    const label = v?.trim()
    if (!label) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function getDashboardStats(range: ReportRange = 'all'): DashboardStats {
  const bookings = listBookings()
  const containers = listAllContainers()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Raporlar bölümü (statü/konteyner/hat/liman dağılımları) seçili döneme göre filtrelenir.
  const reportBookings = bookings.filter((b) =>
    isDateInReportRange(b.vesselDeparture, range, today)
  )
  const reportBookingIds = new Set(reportBookings.map((b) => b.id))

  const statusCounts = BOOKING_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0
      return acc
    },
    {} as Record<BookingStatus, number>
  )
  for (const b of reportBookings) {
    statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1
  }

  const containerTypeCounts = CONTAINER_TYPES.reduce(
    (acc, type) => {
      acc[type] = 0
      return acc
    },
    {} as Record<ContainerType, number>
  )
  for (const c of containers) {
    if (!reportBookingIds.has(c.bookingId)) continue
    containerTypeCounts[c.type] = (containerTypeCounts[c.type] ?? 0) + 1
  }

  const lineCounts = topBreakdown(reportBookings.map((b) => b.line))
  const polCounts = topBreakdown(reportBookings.map((b) => b.pol))

  // İçinde bulunulan hafta (Pazartesi-Pazar) ve bir sonraki hafta sınırları.
  const dayOfWeek = today.getDay() // 0=Pazar..6=Cumartesi
  const mondayOffset = (dayOfWeek + 6) % 7
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekStartStr = isoDateOnly(weekStart)
  const weekEndStr = isoDateOnly(weekEnd)

  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  const nextWeekEnd = new Date(nextWeekStart)
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 6)
  const nextWeekStartStr = isoDateOnly(nextWeekStart)
  const nextWeekEndStr = isoDateOnly(nextWeekEnd)

  // Yaklaşan Bookingler: bir sonraki haftanın (Pazartesi-Pazar) Vessel Departure'a göre bookingleri
  const upcoming = bookings
    .filter((b) => {
      if (!b.vesselDeparture) return false
      const d = b.vesselDeparture.slice(0, 10)
      return d >= nextWeekStartStr && d <= nextWeekEndStr
    })
    .sort((a, b) => (a.vesselDeparture ?? '').localeCompare(b.vesselDeparture ?? ''))

  // Haftalık operasyon planlama tablosu: içinde bulunulan haftanın (Pazartesi-Pazar) SI Cutoff'a göre bookingleri
  const weeklyPlan = bookings
    .filter((b) => {
      if (!b.siCutOff) return false
      if (b.status === 'TAMAMLANDI' || b.status === 'CANCEL') return false
      const d = b.siCutOff.slice(0, 10)
      return d >= weekStartStr && d <= weekEndStr
    })
    .sort((a, b) => (a.siCutOff ?? '').localeCompare(b.siCutOff ?? ''))

  return { statusCounts, containerTypeCounts, lineCounts, polCounts, upcoming, weeklyPlan }
}

/** Raporlar bölümü: seçili döneme (bugün/bu hafta/bu ay/bu sene/hepsi) düşen bookingleri döner. */
export function getBookingsInRange(range: ReportRange): BookingWithStats[] {
  const bookings = listBookings()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return bookings.filter((b) => isDateInReportRange(b.vesselDeparture, range, today))
}

function isoDateOnly(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ---------- Documents ----------

export function listDocumentsByBooking(bookingId: number): AppDocument[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM documents WHERE bookingId = ? ORDER BY uploadedAt ASC')
    .all(bookingId) as AppDocument[]
}

/** Bir booking için henüz yüklenmemiş ZORUNLU döküman tiplerini döner (raporlarda kullanılır). */
export function getMissingDocumentTypesForBooking(bookingId: number): DocumentType[] {
  const uploaded = listDocumentsByBooking(bookingId)
  const uploadedTypes = new Set(uploaded.map((d) => d.type))
  return REQUIRED_DOCUMENT_TYPES.filter((t) => !uploadedTypes.has(t))
}

export function addDocument(
  bookingId: number,
  type: DocumentType,
  filePath: string,
  originalFileName: string | null
): AppDocument {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO documents (bookingId, type, filePath, originalFileName)
       VALUES (?, ?, ?, ?)`
    )
    .run(bookingId, type, filePath, originalFileName)
  return db
    .prepare('SELECT * FROM documents WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as AppDocument
}

export function getDocument(id: number): AppDocument | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as AppDocument | undefined
}

export function deleteDocument(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
}
