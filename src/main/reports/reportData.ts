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
import { BOOKING_STATUSES, CONTAINER_TYPES } from '../../shared/types'
import { mt } from '../i18n/language'

/** Booking bazılı rapor için: seçili booking(ler) + tüm konteynerları. */
export async function buildBookingReportData(bookingIds: number[]): Promise<BookingReportData> {
  const bookings = await Promise.all(
    bookingIds.map(async (bookingId) => {
      const booking = await getBooking(bookingId)
      if (!booking) throw new Error(mt('errors.bookingNotFound'))
      return {
        booking,
        containers: await listContainersByBooking(bookingId),
        missingDocumentTypes: await getMissingDocumentTypesForBooking(bookingId)
      }
    })
  )
  return { bookings, generatedAt: new Date().toISOString() }
}

/** Zaman bazlı (dönemsel) rapor için: seçili aralıktaki bookingler + özet dağılımlar. */
export async function buildRangeReportData(range: ReportRange): Promise<RangeReportData> {
  const bookings = await getBookingsInRange(range)
  const bookingIds = new Set(bookings.map((b) => b.id))
  const containers = (await listAllContainers()).filter((c) => bookingIds.has(c.bookingId))

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
    rangeLabel: mt(`enums.reportRange.${range}`),
    bookings,
    statusCounts,
    containerTypeCounts,
    totalContainers: containers.length,
    generatedAt: new Date().toISOString()
  }
}
