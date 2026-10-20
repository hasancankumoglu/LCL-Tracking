import type { BookingReportData, RangeReportData } from '../../shared/types'
import { mt, getDateLocale } from '../i18n/language'

function formatDate(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(getDateLocale())
}

/** Booking bazlı raporu (tek veya birden fazla booking), e-posta gövdesine (mailto body) eklenmek üzere düz metin olarak biçimlendirir. */
export function buildBookingReportText(data: BookingReportData): string {
  const lines: string[] = []
  data.bookings.forEach(({ booking: b, containers, missingDocumentTypes }, index) => {
    if (index > 0) {
      lines.push('')
      lines.push('')
    }
    lines.push(mt('reports.bookingReportTitle', { bookingNo: b.bookingNo }))
    lines.push('================================')
    lines.push(`${mt('reports.vesselDeparture')} : ${formatDate(b.vesselDeparture)}`)
    lines.push(`${mt('reports.destination')}      : ${b.destination || '-'}`)
    lines.push(`${mt('reports.line')}             : ${b.line || '-'}`)
    lines.push(`${mt('reports.pol')}              : ${b.pol || '-'}`)
    lines.push(`${mt('reports.status')}            : ${mt(`enums.bookingStatus.${b.status}`)}`)
    lines.push(
      `${mt('reports.missingDocuments')}      : ${
        missingDocumentTypes.length > 0
          ? missingDocumentTypes.map((t) => mt(`enums.documentType.${t}`)).join(', ')
          : mt('common.none')
      }`
    )
    lines.push('')
    lines.push(mt('reports.containersSectionTitleText', { count: containers.length }))
    lines.push('--------------------------------')
    if (containers.length === 0) {
      lines.push(mt('reports.noContainers'))
    } else {
      containers.forEach((c, i) => {
        lines.push(
          `${i + 1}. ${c.containerNo || '-'} | ${c.type} | ${mt('reports.seal')}: ${c.sealNo || '-'} | ${mt('reports.truckPlate')}: ${c.truckPlate || '-'} | ${mt('reports.trailerPlate')}: ${c.trailerPlate || '-'} | ${mt('reports.driver')}: ${c.driverPhone || '-'}`
        )
      })
    }
  })
  return lines.join('\n')
}

/** Booking listesindeki "Kullanıcı" kolonundan operatöre mail gönderirken kullanılan, "BOOKING RAPORU"
 * başlığı, "Durum" ve "Eksik Evrak" satırları OLMADAN daha sade bir metin üretir. */
export function buildOperatorEmailText(data: BookingReportData): string {
  const lines: string[] = []
  data.bookings.forEach(({ booking: b, containers }, index) => {
    if (index > 0) {
      lines.push('')
      lines.push('')
    }
    lines.push(`${b.bookingNo}`)
    lines.push('================================')
    lines.push(`${mt('reports.vesselDeparture')} : ${formatDate(b.vesselDeparture)}`)
    lines.push(`${mt('reports.destination')}      : ${b.destination || '-'}`)
    lines.push(`${mt('reports.line')}             : ${b.line || '-'}`)
    lines.push(`${mt('reports.pol')}              : ${b.pol || '-'}`)
    lines.push('')
    lines.push(mt('reports.containersSectionTitleText', { count: containers.length }))
    lines.push('--------------------------------')
    if (containers.length === 0) {
      lines.push(mt('reports.noContainers'))
    } else {
      containers.forEach((c, i) => {
        lines.push(
          `${i + 1}. ${c.containerNo || '-'} | ${c.type} | ${mt('reports.seal')}: ${c.sealNo || '-'} | ${mt('reports.truckPlate')}: ${c.truckPlate || '-'} | ${mt('reports.trailerPlate')}: ${c.trailerPlate || '-'} | ${mt('reports.driver')}: ${c.driverPhone || '-'}`
        )
      })
    }
  })
  return lines.join('\n')
}

/** Dönemsel (zaman bazlı) raporu, e-posta gövdesine eklenmek üzere düz metin olarak biçimlendirir. */
export function buildRangeReportText(data: RangeReportData): string {
  const lines: string[] = []
  lines.push(mt('reports.rangeReportTitle', { rangeLabel: data.rangeLabel }))
  lines.push('================================')
  lines.push(`${mt('reports.totalBookings')}   : ${data.bookings.length}`)
  lines.push(`${mt('reports.totalContainers')} : ${data.totalContainers}`)
  lines.push('')
  lines.push(mt('reports.bookingsHeading'))
  lines.push('--------------------------------')
  if (data.bookings.length === 0) {
    lines.push(mt('reports.noBookingsInRange'))
  } else {
    data.bookings.forEach((b, i) => {
      const missingDocsText =
        b.missingDocumentTypes.length > 0
          ? b.missingDocumentTypes.map((t) => mt(`enums.documentType.${t}`)).join(', ')
          : mt('common.none')
      lines.push(
        `${i + 1}. ${b.bookingNo} | ${formatDate(b.vesselDeparture)} | ${b.destination || '-'} | ${b.line || '-'} | ${b.pol || '-'} | ${mt(`enums.bookingStatus.${b.status}`)} | ${b.containerCount} ${mt('reports.containerCountSuffix')} | ${mt('reports.missingDocuments')}: ${missingDocsText}`
      )
    })
  }
  return lines.join('\n')
}
