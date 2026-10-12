import {
  getBooking,
  listContainersByBooking,
  getBookingsInRange,
  listAllContainers,
  getMissingDocumentTypesForBooking
} from '../db/repositories'
import type {
  BookingReportData,
  RangeReportData,
  ReportRange,
  BookingStatus,
  ContainerType
} from '../../shared/types'
import { BOOKING_STATUSES, CONTAINER_TYPES, REPORT_RANGE_LABELS } from '../../shared/types'

/** Booking bazlı rapor için: seçili booking(ler) + tüm konteynerları. */
export function buildBookingReportData(bookingIds: number[]): BookingReportData {
  const bookings = bookingIds.map((bookingId) => {
    const booking = getBooking(bookingId)
    if (!booking) throw new Error('Booking bulunamadı.')
    return {
      booking,
      containers: listContainersByBooking(bookingId),
      missingDocumentTypes: getMissingDocumentTypesForBooking(bookingId)
    }
  })
  return { bookings, generatedAt: new Date().toISOString() }
}

/** Zaman bazlı (dönemsel) rapor için: seçili aralıktaki bookingler + özet dağılımlar. */
export function buildRangeReportData(range: ReportRange): RangeReportData {
  const bookings = getBookingsInRange(range)
  const bookingIds = new Set(bookings.map((b) => b.id))
  const containers = listAllContainers().filter((c) => bookingIds.has(c.bookingId))

  const statusCounts = BOOKING_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0
      return acc
    },
    {} as Record<BookingStatus, number>
  )
  for (const b of bookings) {
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
    containerTypeCounts[c.type] = (containerTypeCounts[c.type] ?? 0) + 1
  }

  return {
    range,
    rangeLabel: REPORT_RANGE_LABELS[range],
    bookings,
    statusCounts,
    containerTypeCounts,
    totalContainers: containers.length,
    generatedAt: new Date().toISOString()
  }
}
