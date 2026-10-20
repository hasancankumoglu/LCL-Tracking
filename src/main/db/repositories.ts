import { getSupabase } from './schema'
import { getCurrentUser } from '../user/currentUser'
import { getSession } from '../auth/session'
import { requireActingUserId } from '../auth/authRepo'
import { mt } from '../i18n/language'
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
  UnassignedVehicleAssignInput,
  UnassignedVehicleSelection,
  PendingBookingDeletion,
  Customer,
  CustomerInput,
  CustomerCreateResult,
  CustomerDirectoryEntry
} from '../../shared/types'
import {
  BOOKING_STATUSES,
  ARCHIVABLE_BOOKING_STATUSES,
  CONTAINER_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  LOOKUP_FIELD_TYPES
} from '../../shared/types'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

// ---------- Bookings ----------

function computeMissingDocumentTypes(uploadedDocTypes: string): DocumentType[] {
  const uploaded = new Set(
    uploadedDocTypes
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  )
  return REQUIRED_DOCUMENT_TYPES.filter((t) => !uploaded.has(t))
}

function mapBookingWithStatsRows(
  rows: (BookingWithStats & { uploadedDocTypes: string })[]
): BookingWithStats[] {
  return rows.map((row) => {
    const { uploadedDocTypes, ...rest } = row
    return { ...rest, missingDocumentTypes: computeMissingDocumentTypes(uploadedDocTypes) }
  })
}

export async function listBookings(includeArchived = false): Promise<BookingWithStats[]> {
  const supabase = getSupabase()
  let query = supabase.from('booking_with_stats').select('*')
  if (!includeArchived) query = query.eq('archived', false)
  const session = getSession()
  if (session?.role === 'CUSTOMER') {
    if (!session.customerId) return []
    query = query.eq('customerId', session.customerId)
  }
  const { data, error } = await query
  throwIfError(error)
  const rows = mapBookingWithStatsRows(data ?? [])
  rows.sort((a, b) => {
    if (!a.vesselDeparture && b.vesselDeparture) return 1
    if (a.vesselDeparture && !b.vesselDeparture) return -1
    if (a.vesselDeparture && b.vesselDeparture && a.vesselDeparture !== b.vesselDeparture) {
      return a.vesselDeparture < b.vesselDeparture ? -1 : 1
    }
    return b.id - a.id
  })
  return rows
}

export async function listArchivedBookings(): Promise<BookingWithStats[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('booking_with_stats').select('*').eq('archived', true)
  throwIfError(error)
  const rows = mapBookingWithStatsRows(data ?? [])
  rows.sort((a, b) => {
    if (!a.vesselDeparture && b.vesselDeparture) return 1
    if (a.vesselDeparture && !b.vesselDeparture) return -1
    if (a.vesselDeparture && b.vesselDeparture && a.vesselDeparture !== b.vesselDeparture) {
      return a.vesselDeparture > b.vesselDeparture ? -1 : 1
    }
    return b.id - a.id
  })
  return rows
}

export async function getBooking(id: number): Promise<Booking | undefined> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  const session = getSession()
  if (session?.role === 'CUSTOMER' && data && data.customerId !== session.customerId) {
    return undefined
  }
  return data ?? undefined
}

export async function getBookingByNo(bookingNo: string): Promise<Booking | undefined> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('bookingNo', bookingNo)
    .maybeSingle()
  throwIfError(error)
  const session = getSession()
  if (session?.role === 'CUSTOMER' && data && data.customerId !== session.customerId) {
    return undefined
  }
  return data ?? undefined
}

export async function createBooking(input: BookingInput): Promise<Booking> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  await ensureLookupValuesFromBooking(input)
  const { data, error } = await supabase
    .from('bookings')
    .insert({ ...input, createdBy: actingUser, updatedBy: actingUser })
    .select('*')
    .single()
  throwIfError(error)
  return data as Booking
}

export async function createBookingWithVehicles(
  input: BookingInput,
  vehicles: UnassignedVehicleSelection[]
): Promise<Booking> {
  if (
    !Array.isArray(vehicles) ||
    vehicles.length === 0 ||
    vehicles.some(
      (vehicle) =>
        !vehicle ||
        !Number.isSafeInteger(vehicle.id) ||
        vehicle.id <= 0 ||
        !CONTAINER_TYPES.includes(vehicle.type) ||
        (vehicle.containerNo !== null && typeof vehicle.containerNo !== 'string')
    ) ||
    new Set(vehicles.map((vehicle) => vehicle.id)).size !== vehicles.length
  ) {
    throw new Error(mt('unassignedVehicles.invalidSelection'))
  }
  if (!Number.isSafeInteger(input.unit) || (input.unit ?? 0) < vehicles.length) {
    throw new Error(mt('unassignedVehicles.unitTooSmall', { count: vehicles.length }))
  }
  const supabase = getSupabase()
  await ensureLookupValuesFromBooking(input)
  const { data, error } = await supabase.rpc('create_booking_with_vehicles', {
    p_booking: input,
    p_vehicles: vehicles,
    p_acting_user: getCurrentUser()
  })
  if (error?.code === 'UV001') {
    throw new Error(mt('unassignedVehicles.invalidSelection'))
  }
  if (error?.code === 'UV002') {
    throw new Error(mt('unassignedVehicles.selectionUnavailable'))
  }
  if (error?.code === 'UV003') {
    throw new Error(mt('unassignedVehicles.unitTooSmall', { count: vehicles.length }))
  }
  if (error?.code === '23505') {
    throw new Error(mt('bookingForm.duplicateBookingNo'))
  }
  if (error?.code === 'PGRST202') {
    throw new Error(mt('unassignedVehicles.databaseUpdateRequired'))
  }
  throwIfError(error)
  return data as Booking
}

export async function updateBooking(id: number, input: BookingInput): Promise<Booking> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  await ensureLookupValuesFromBooking(input)
  const { data, error } = await supabase
    .from('bookings')
    .update({ ...input, updatedAt: new Date().toISOString(), updatedBy: actingUser })
    .eq('id', id)
    .select('*')
    .single()
  throwIfError(error)
  return data as Booking
}

export async function setBookingArchived(id: number, archived: boolean): Promise<Booking> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  if (archived) {
    const booking = await getBooking(id)
    if (booking && !ARCHIVABLE_BOOKING_STATUSES.includes(booking.status)) {
      throw new Error(
        mt('errors.archiveStatusNotAllowed', {
          statuses: ARCHIVABLE_BOOKING_STATUSES.map((s) => mt(`enums.bookingStatus.${s}`)).join(
            ` ${mt('common.or')} `
          )
        })
      )
    }
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({ archived, updatedAt: new Date().toISOString(), updatedBy: actingUser })
    .eq('id', id)
    .select('*')
    .single()
  throwIfError(error)
  return data as Booking
}

export async function deleteBooking(id: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('bookings').delete().eq('id', id)
  throwIfError(error)
}

// ---------- Booking silme onay akışı (Operation Manager/Admin onayı gerektiren roller için) ----------

const PENDING_DELETION_UNIQUE_VIOLATION = '23505'

export async function createPendingDeletion(bookingId: number): Promise<PendingBookingDeletion> {
  const supabase = getSupabase()
  const booking = await getBooking(bookingId)
  if (!booking) throw new Error(mt('errors.bookingNotFound'))
  const { data, error } = await supabase
    .from('pending_booking_deletions')
    .insert({
      bookingId,
      bookingNo: booking.bookingNo,
      blNumber: booking.blNumber,
      destination: booking.destination,
      line: booking.line,
      requestedBy: getCurrentUser()
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === PENDING_DELETION_UNIQUE_VIOLATION) {
      throw new Error(mt('errors.pendingDeletionAlreadyExists'))
    }
    throw new Error(error.message)
  }
  return data as PendingBookingDeletion
}

export async function listPendingDeletions(
  filterRequestedBy?: string
): Promise<PendingBookingDeletion[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('pending_booking_deletions')
    .select('*')
    .order('requestedAt', { ascending: false })
  if (filterRequestedBy) query = query.eq('requestedBy', filterRequestedBy)
  const { data, error } = await query
  throwIfError(error)
  return (data ?? []) as PendingBookingDeletion[]
}

export async function listActivePendingDeletionBookingIds(): Promise<number[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pending_booking_deletions')
    .select('bookingId')
    .eq('status', 'PENDING')
  throwIfError(error)
  return (data ?? []).map((row) => row.bookingId as number)
}

export async function approvePendingDeletion(requestId: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_approve_booking_deletion', {
    p_request_id: requestId,
    p_decided_by: getCurrentUser()
  })
  throwIfError(error)
}

export async function rejectPendingDeletion(requestId: number, note?: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pending_booking_deletions')
    .update({
      status: 'REJECTED',
      decidedBy: getCurrentUser(),
      decidedAt: new Date().toISOString(),
      decisionNote: note ?? null
    })
    .eq('id', requestId)
    .eq('status', 'PENDING')
    .select('id')
  throwIfError(error)
  if (!data || data.length === 0) throw new Error(mt('errors.pendingDeletionAlreadyDecided'))
}

export async function withdrawPendingDeletion(requestId: number): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pending_booking_deletions')
    .delete()
    .eq('id', requestId)
    .eq('requestedBy', getCurrentUser())
    .eq('status', 'PENDING')
    .select('id')
  throwIfError(error)
  if (!data || data.length === 0) throw new Error(mt('errors.pendingDeletionWithdrawNotAllowed'))
}

// ---------- Müşteri Yönetimi (Customer) ----------

export async function listCustomers(): Promise<Customer[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('customers').select('*').order('name')
  throwIfError(error)
  return (data ?? []) as Customer[]
}

export async function getCustomer(id: number): Promise<Customer | undefined> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  return data ?? undefined
}

export async function listCustomerDirectory(): Promise<CustomerDirectoryEntry[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('customers').select('id, name').order('name')
  throwIfError(error)
  return (data ?? []) as CustomerDirectoryEntry[]
}

export async function createCustomer(
  input: CustomerInput,
  initialPassword: string
): Promise<CustomerCreateResult> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('rpc_create_customer_with_user', {
    p_acting_user_id: requireActingUserId(),
    p_tax_no: input.taxNo,
    p_name: input.name,
    p_tax_office: input.taxOffice,
    p_address: input.address,
    p_email: input.email,
    p_phone: input.phone,
    p_initial_password: initialPassword
  })
  if (error) throw new Error(error.message)
  return data as CustomerCreateResult
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<Customer> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('customers')
    .update({ ...input, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  throwIfError(error)
  return data as Customer
}

export async function deleteCustomer(id: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_delete_customer', {
    p_acting_user_id: requireActingUserId(),
    p_customer_id: id
  })
  throwIfError(error)
}

// ---------- Lookup values (Kategori/Destination/Line/POL) ----------

export async function listLookupValues(fieldType: LookupFieldType): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('lookup_values')
    .select('value')
    .eq('fieldType', fieldType)
    .order('value', { ascending: true })
  throwIfError(error)
  return (data ?? []).map((r) => r.value)
}

export async function addLookupValue(fieldType: LookupFieldType, value: string): Promise<string[]> {
  const trimmed = value.trim()
  if (trimmed) {
    const supabase = getSupabase()
    // Unique index "lookup_values(fieldType, lower(value))" is an EXPRESSION index -
    // supabase-js upsert()'s onConflict only supports plain column lists, so a plain
    // insert + swallow-the-unique-violation (23505) is used instead of upsert.
    const { error } = await supabase.from('lookup_values').insert({ fieldType, value: trimmed })
    if (error && error.code !== '23505') throw new Error(error.message)
  }
  return listLookupValues(fieldType)
}

async function ensureLookupValuesFromBooking(input: BookingInput): Promise<void> {
  const fieldValues: Record<LookupFieldType, string | null> = {
    category: input.category,
    destination: input.destination,
    line: input.line,
    pol: input.pol
  }
  for (const fieldType of LOOKUP_FIELD_TYPES) {
    const value = fieldValues[fieldType]
    if (value && value.trim()) {
      await addLookupValue(fieldType, value)
    }
  }
}

// ---------- Containers ----------

export async function listContainersByBooking(bookingId: number): Promise<Container[]> {
  const session = getSession()
  if (session?.role === 'CUSTOMER' && !(await getBooking(bookingId))) {
    throw new Error(mt('errors.notAuthorized'))
  }
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('containers')
    .select('*')
    .eq('bookingId', bookingId)
    .order('id', { ascending: true })
  throwIfError(error)
  return (data ?? []) as Container[]
}

export async function getContainer(id: number): Promise<Container | undefined> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('containers').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  return data ?? undefined
}

/**
 * Booking'de "unit" (planlanan konteyner sayısı) belirtilmemişse kapasite 0
 * kabul edilir, yani hiç konteyner eklenemez. Belirtilmişse, mevcut konteyner
 * sayısının bunu aşmasını engeller.
 */
async function assertContainerCapacity(bookingId: number): Promise<void> {
  const supabase = getSupabase()
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('unit')
    .eq('id', bookingId)
    .maybeSingle()
  throwIfError(bookingError)
  const unit = (booking as { unit: number | null } | null)?.unit ?? 0

  const { count, error: countError } = await supabase
    .from('containers')
    .select('id', { count: 'exact', head: true })
    .eq('bookingId', bookingId)
  throwIfError(countError)
  if ((count ?? 0) >= unit) {
    throw new Error(
      unit === 0
        ? 'Bu booking için Unit sayısı girilmemiş. Konteyner eklemeden önce Unit alanını doldurun.'
        : `Bu booking için Unit sayısı (${unit}) kadar konteyner zaten eklendi. Daha fazla konteyner eklenemez.`
    )
  }
}

export async function createContainer(input: ContainerInput): Promise<Container> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  await assertContainerCapacity(input.bookingId)
  const { data, error } = await supabase
    .from('containers')
    .insert({ ...input, createdBy: actingUser, updatedBy: actingUser })
    .select('*')
    .single()
  throwIfError(error)
  return data as Container
}

export async function updateContainer(id: number, input: ContainerInput): Promise<Container> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  const { data, error } = await supabase
    .from('containers')
    .update({ ...input, updatedAt: new Date().toISOString(), updatedBy: actingUser })
    .eq('id', id)
    .select('*')
    .single()
  throwIfError(error)
  return data as Container
}

export async function listAllContainers(): Promise<Container[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('containers').select('*')
  throwIfError(error)
  return (data ?? []) as Container[]
}

/** Armatör API'sinden çekilen snapshot'ı bookinge uygular - tek atomik RPC çağrısı (bkz. worker/sql/002_rls_and_functions.sql). */
export async function applyCarrierSnapshotToBooking(
  bookingId: number,
  snapshot: CarrierBookingSnapshot
): Promise<CarrierApplyResult> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  const { data, error } = await supabase.rpc('apply_carrier_snapshot', {
    p_booking_id: bookingId,
    p_snapshot: snapshot,
    p_acting_user: actingUser
  })
  throwIfError(error)
  return data as CarrierApplyResult
}

export async function listContainersForTracking(): Promise<ContainerWithBooking[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('containers')
    .select(
      '*, bookings!inner(bookingNo, status, pol, destination, line, vesselDeparture, archived)'
    )
    .eq('bookings.archived', false)
  throwIfError(error)
  type BookingJoin = {
    bookingNo: string
    status: BookingStatus
    pol: string | null
    destination: string | null
    line: string | null
    vesselDeparture: string | null
  }
  type Row = Container & {
    bookings: BookingJoin | BookingJoin[] | null
  }
  const rows = ((data ?? []) as unknown as Row[])
    .map(({ bookings, ...container }) => {
      const b = Array.isArray(bookings) ? bookings[0] : bookings
      if (!b) return null
      return {
        ...container,
        bookingNo: b.bookingNo,
        bookingStatus: b.status,
        bookingPol: b.pol,
        bookingDestination: b.destination,
        bookingLine: b.line,
        bookingVesselDeparture: b.vesselDeparture
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  rows.sort((a, b) => a.bookingNo.localeCompare(b.bookingNo) || a.id - b.id)
  return rows
}

export async function findActiveContainerConflicts(
  containerNo: string,
  excludeContainerId?: number
): Promise<ContainerConflict[]> {
  const trimmed = containerNo.trim()
  if (!trimmed) return []
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('containers')
    .select('id, bookingId, bookings!inner(bookingNo, status, archived)')
    .eq('bookings.archived', false)
    .ilike('containerNo', trimmed)
  throwIfError(error)
  type BookingJoin = { bookingNo: string; status: BookingStatus }
  type Row = {
    id: number
    bookingId: number
    bookings: BookingJoin | BookingJoin[] | null
  }
  return ((data ?? []) as unknown as Row[])
    .filter((r) => !excludeContainerId || r.id !== excludeContainerId)
    .map((r) => {
      const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings
      return b
        ? {
            containerId: r.id,
            bookingId: r.bookingId,
            bookingNo: b.bookingNo,
            bookingStatus: b.status
          }
        : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

export async function deleteContainer(id: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('containers').delete().eq('id', id)
  throwIfError(error)
}

// ---------- Unassigned Vehicles (Atanmayan Araçlar) ----------

export async function listUnassignedVehicles(): Promise<UnassignedVehicle[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('unassigned_vehicles')
    .select('*')
    .order('id', { ascending: false })
  throwIfError(error)
  return (data ?? []) as UnassignedVehicle[]
}

export async function getUnassignedVehicle(id: number): Promise<UnassignedVehicle | undefined> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('unassigned_vehicles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  throwIfError(error)
  return data ?? undefined
}

export async function createUnassignedVehicle(
  input: UnassignedVehicleInput
): Promise<UnassignedVehicle> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  const { data, error } = await supabase
    .from('unassigned_vehicles')
    .insert({ ...input, createdBy: actingUser })
    .select('*')
    .single()
  throwIfError(error)
  return data as UnassignedVehicle
}

export async function deleteUnassignedVehicle(id: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('unassigned_vehicles').delete().eq('id', id)
  throwIfError(error)
}

/** Atanmayan araç kaydını bir booking'e konteyner olarak atar - tek atomik RPC çağrısı. */
export async function assignUnassignedVehicle(
  id: number,
  input: UnassignedVehicleAssignInput
): Promise<Container> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  const { data, error } = await supabase.rpc('assign_unassigned_vehicle', {
    p_vehicle_id: id,
    p_booking_id: input.bookingId,
    p_container_no: input.containerNo,
    p_type: input.type,
    p_acting_user: actingUser
  })
  if (error?.code === 'UV002') {
    throw new Error(mt('unassignedVehicles.vehicleUnavailable'))
  }
  throwIfError(error)
  return data as Container
}

// ---------- Dashboard ----------

function isoDateOnly(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
  return d.getFullYear() === today.getFullYear()
}

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

export async function getDashboardStats(range: ReportRange = 'all'): Promise<DashboardStats> {
  const bookings = await listBookings()
  const containers = await listAllContainers()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

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

  const customerDirectory = await listCustomerDirectory()
  const customerNameById = new Map(customerDirectory.map((c) => [c.id, c.name]))
  const noCustomerLabel = mt('dashboard.noCustomerLabel')
  function customerLabel(customerId: number | null): string {
    if (customerId == null) return noCustomerLabel
    return customerNameById.get(customerId) ?? noCustomerLabel
  }

  const bookingCountsByCustomer = new Map<string, number>()
  for (const b of reportBookings) {
    const label = customerLabel(b.customerId)
    bookingCountsByCustomer.set(label, (bookingCountsByCustomer.get(label) ?? 0) + 1)
  }
  const customerBookingCounts = Array.from(bookingCountsByCustomer.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const customerIdByBookingId = new Map(reportBookings.map((b) => [b.id, b.customerId]))
  const containerCountsByCustomer = new Map<string, number>()
  for (const c of containers) {
    if (!reportBookingIds.has(c.bookingId)) continue
    const label = customerLabel(customerIdByBookingId.get(c.bookingId) ?? null)
    containerCountsByCustomer.set(label, (containerCountsByCustomer.get(label) ?? 0) + 1)
  }
  const customerContainerCounts = Array.from(containerCountsByCustomer.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const dayOfWeek = today.getDay()
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

  const upcoming = bookings
    .filter((b) => {
      if (!b.vesselDeparture) return false
      const d = b.vesselDeparture.slice(0, 10)
      return d >= nextWeekStartStr && d <= nextWeekEndStr
    })
    .sort((a, b) => (a.vesselDeparture ?? '').localeCompare(b.vesselDeparture ?? ''))

  const weeklyPlan = bookings
    .filter((b) => {
      if (!b.siCutOff) return false
      if (b.status === 'TAMAMLANDI' || b.status === 'CANCEL') return false
      const d = b.siCutOff.slice(0, 10)
      return d >= weekStartStr && d <= weekEndStr
    })
    .sort((a, b) => (a.siCutOff ?? '').localeCompare(b.siCutOff ?? ''))

  return {
    statusCounts,
    containerTypeCounts,
    lineCounts,
    polCounts,
    customerBookingCounts,
    customerContainerCounts,
    upcoming,
    weeklyPlan
  }
}

/** Raporlar bölümü: seçili döneme (bugün/bu hafta/bu ay/bu sene/hepsi) düşen bookingleri döner. */
export async function getBookingsInRange(range: ReportRange): Promise<BookingWithStats[]> {
  const bookings = await listBookings()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return bookings.filter((b) => isDateInReportRange(b.vesselDeparture, range, today))
}

// ---------- Documents ----------

export async function listDocumentsByBooking(bookingId: number): Promise<AppDocument[]> {
  const session = getSession()
  if (session?.role === 'CUSTOMER' && !(await getBooking(bookingId))) {
    throw new Error(mt('errors.notAuthorized'))
  }
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('bookingId', bookingId)
    .order('uploadedAt', { ascending: true })
  throwIfError(error)
  return (data ?? []) as AppDocument[]
}

/** Bir booking için henüz yüklenmemiş ZORUNLU döküman tiplerini döner (raporlarda kullanılır). */
export async function getMissingDocumentTypesForBooking(
  bookingId: number
): Promise<DocumentType[]> {
  const uploaded = await listDocumentsByBooking(bookingId)
  const uploadedTypes = new Set(uploaded.map((d) => d.type))
  return REQUIRED_DOCUMENT_TYPES.filter((t) => !uploadedTypes.has(t))
}

export async function addDocument(
  bookingId: number,
  type: DocumentType,
  filePath: string,
  originalFileName: string | null
): Promise<AppDocument> {
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  const { data, error } = await supabase
    .from('documents')
    .insert({ bookingId, type, filePath, originalFileName, createdBy: actingUser })
    .select('*')
    .single()
  throwIfError(error)
  return data as AppDocument
}

export async function getDocument(id: number): Promise<AppDocument | undefined> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  return data ?? undefined
}

export async function deleteDocument(id: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('documents').delete().eq('id', id)
  throwIfError(error)
}
