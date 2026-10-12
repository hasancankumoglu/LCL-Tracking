import type { BookingReportData, RangeReportData } from '../../shared/types'
import { BOOKING_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '../../shared/types'

function formatDate(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('tr-TR')
}

/** Booking bazlı raporu (tek veya birden fazla booking), e-posta gövdesine (mailto body) eklenmek üzere düz metin olarak biçimlendirir. */
export function buildBookingReportText(data: BookingReportData): string {
  const lines: string[] = []
  data.bookings.forEach(({ booking: b, containers, missingDocumentTypes }, index) => {
    if (index > 0) {
      lines.push('')
      lines.push('')
    }
    lines.push(`BOOKING RAPORU - ${b.bookingNo}`)
    lines.push('================================')
    lines.push(`Vessel Departure : ${formatDate(b.vesselDeparture)}`)
    lines.push(`Destination      : ${b.destination || '-'}`)
    lines.push(`Line             : ${b.line || '-'}`)
    lines.push(`POL              : ${b.pol || '-'}`)
    lines.push(`Durum            : ${BOOKING_STATUS_LABELS[b.status]}`)
    lines.push(
      `Eksik Evrak      : ${
        missingDocumentTypes.length > 0
          ? missingDocumentTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(', ')
          : 'Yok'
      }`
    )
    lines.push('')
    lines.push(`KONTEYNERLER (${containers.length})`)
    lines.push('--------------------------------')
    if (containers.length === 0) {
      lines.push('Kayıtlı konteyner yok.')
    } else {
      containers.forEach((c, i) => {
        lines.push(
          `${i + 1}. ${c.containerNo || '-'} | ${c.type} | Mühür: ${c.sealNo || '-'} | Çekici: ${c.truckPlate || '-'} | Dorse: ${c.trailerPlate || '-'} | Şoför: ${c.driverPhone || '-'}`
        )
      })
    }
  })
  return lines.join('\n')
}

/** Dönemsel (zaman bazlı) raporu, e-posta gövdesine eklenmek üzere düz metin olarak biçimlendirir. */
export function buildRangeReportText(data: RangeReportData): string {
  const lines: string[] = []
  lines.push(`DÖNEMSEL RAPOR - ${data.rangeLabel}`)
  lines.push('================================')
  lines.push(`Toplam Booking   : ${data.bookings.length}`)
  lines.push(`Toplam Konteyner : ${data.totalContainers}`)
  lines.push('')
  lines.push('BOOKINGLER')
  lines.push('--------------------------------')
  if (data.bookings.length === 0) {
    lines.push('Seçili dönemde booking yok.')
  } else {
    data.bookings.forEach((b, i) => {
      const missingDocsText =
        b.missingDocumentTypes.length > 0
          ? b.missingDocumentTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(', ')
          : 'Yok'
      lines.push(
        `${i + 1}. ${b.bookingNo} | ${formatDate(b.vesselDeparture)} | ${b.destination || '-'} | ${b.line || '-'} | ${b.pol || '-'} | ${BOOKING_STATUS_LABELS[b.status]} | ${b.containerCount} konteyner | Eksik Evrak: ${missingDocsText}`
      )
    })
  }
  return lines.join('\n')
}
