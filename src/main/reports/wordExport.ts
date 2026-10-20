import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  AlignmentType,
  BorderStyle
} from 'docx'
import type { BookingReportData, RangeReportData } from '../../shared/types'
import { mt, getDateLocale } from '../i18n/language'

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(getDateLocale())
}

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 2, color: 'CBD2DB' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CBD2DB' },
  left: { style: BorderStyle.SINGLE, size: 2, color: 'CBD2DB' },
  right: { style: BorderStyle.SINGLE, size: 2, color: 'CBD2DB' }
}

function headerCell(text: string): TableCell {
  return new TableCell({
    borders: CELL_BORDER,
    shading: { fill: '0B2A5B' },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })]
      })
    ]
  })
}

function bodyCell(text: string): TableCell {
  return new TableCell({
    borders: CELL_BORDER,
    children: [new Paragraph({ children: [new TextRun({ text: text || '-', size: 18 })] })]
  })
}

function dataTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(headerCell), tableHeader: true }),
      ...rows.map((row) => new TableRow({ children: row.map(bodyCell) }))
    ]
  })
}

function infoTable(pairs: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: pairs.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              borders: CELL_BORDER,
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: 'F4F6F9' },
              children: [
                new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] })
              ]
            }),
            bodyCell(value)
          ]
        })
    )
  })
}

function title(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, color: '0B2A5B' })]
  })
}

function subtitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, italics: true, color: '5B6472', size: 18 })]
  })
}

function spacer(): Paragraph {
  return new Paragraph({ text: '' })
}

/** Booking bazlı rapor: seçili booking(ler)in bilgileri + konteyner listeleri, her booking kendi bölümünde. */
export async function buildBookingReportDocx(data: BookingReportData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []

  data.bookings.forEach(({ booking, containers, missingDocumentTypes }, index) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: index > 0,
        children: [
          new TextRun({
            text: mt('reports.bookingReportTitleDocx', { bookingNo: booking.bookingNo }),
            color: '0B2A5B'
          })
        ]
      })
    )
    if (index === 0) {
      children.push(subtitle(mt('reports.generatedAt', { date: formatDate(data.generatedAt) })))
    }
    const missingDocsText =
      missingDocumentTypes.length > 0
        ? missingDocumentTypes.map((t) => mt(`enums.documentType.${t}`)).join(', ')
        : mt('common.none')
    children.push(
      spacer(),
      infoTable([
        [mt('reports.bookingNo'), booking.bookingNo],
        [mt('reports.vesselDeparture'), formatDate(booking.vesselDeparture)],
        [mt('reports.declarationCutOff'), formatDate(booking.declarationCutOff)],
        [mt('reports.siCutOff'), formatDate(booking.siCutOff)],
        [mt('reports.category'), booking.category ?? ''],
        [mt('reports.destination'), booking.destination ?? ''],
        [mt('reports.line'), booking.line ?? ''],
        [mt('reports.pol'), booking.pol ?? ''],
        [mt('reports.status'), mt(`enums.bookingStatus.${booking.status}`)],
        [mt('reports.missingDocuments'), missingDocsText],
        [mt('common.notes'), booking.notes ?? '']
      ]),
      spacer(),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: mt('reports.containersHeadingDocx', { count: containers.length }),
            color: '0B2A5B'
          })
        ]
      }),
      spacer(),
      containers.length > 0
        ? dataTable(
            [
              mt('reports.containerNo'),
              mt('reports.type'),
              mt('reports.sealNo'),
              mt('reports.truckPlate'),
              mt('reports.trailerPlate'),
              mt('reports.driverPhone'),
              mt('reports.vessel'),
              mt('common.notes')
            ],
            containers.map((c) => [
              c.containerNo ?? '',
              c.type,
              c.sealNo ?? '',
              c.truckPlate ?? '',
              c.trailerPlate ?? '',
              c.driverPhone ?? '',
              c.vesselName ?? '',
              c.notes ?? ''
            ])
          )
        : new Paragraph({ children: [new TextRun({ text: mt('reports.noContainers') })] })
    )
  })

  const doc = new Document({ sections: [{ children }] })

  return Packer.toBuffer(doc)
}

/** Zaman bazlı (dönemsel) rapor: özet dağılımlar + bookingler listesi. */
export async function buildRangeReportDocx(data: RangeReportData): Promise<Buffer> {
  const { bookings } = data

  const statusRows = Object.entries(data.statusCounts).map(([status, count]) => [
    mt(`enums.bookingStatus.${status}`),
    String(count)
  ])
  const typeRows = Object.entries(data.containerTypeCounts).map(([type, count]) => [
    type,
    String(count)
  ])

  const doc = new Document({
    sections: [
      {
        children: [
          title(mt('reports.rangeReportTitleDocx', { rangeLabel: data.rangeLabel })),
          subtitle(mt('reports.generatedAt', { date: formatDate(data.generatedAt) })),
          spacer(),
          infoTable([
            [mt('reports.totalBookings'), String(bookings.length)],
            [mt('reports.totalContainers'), String(data.totalContainers)]
          ]),
          spacer(),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: mt('reports.statusDistribution'), color: '0B2A5B' })]
          }),
          spacer(),
          dataTable([mt('reports.statusColumn'), mt('reports.countColumn')], statusRows),
          spacer(),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({ text: mt('reports.containerTypeDistribution'), color: '0B2A5B' })
            ]
          }),
          spacer(),
          dataTable([mt('reports.typeColumn'), mt('reports.countColumn')], typeRows),
          spacer(),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: mt('reports.bookingsHeadingDocx', { count: bookings.length }),
                color: '0B2A5B'
              })
            ]
          }),
          spacer(),
          bookings.length > 0
            ? dataTable(
                [
                  mt('reports.bookingNo'),
                  mt('reports.vesselDeparture'),
                  mt('reports.destination'),
                  mt('reports.line'),
                  mt('reports.pol'),
                  mt('reports.status'),
                  mt('reports.containerCountSuffix'),
                  mt('reports.missingDocuments')
                ],
                bookings.map((b) => [
                  b.bookingNo,
                  formatDate(b.vesselDeparture),
                  b.destination ?? '',
                  b.line ?? '',
                  b.pol ?? '',
                  mt(`enums.bookingStatus.${b.status}`),
                  String(b.containerCount),
                  b.missingDocumentTypes.length > 0
                    ? b.missingDocumentTypes.map((t) => mt(`enums.documentType.${t}`)).join(', ')
                    : mt('common.none')
                ])
              )
            : new Paragraph({ children: [new TextRun({ text: mt('reports.noBookingsInRange') })] })
        ]
      }
    ]
  })

  return Packer.toBuffer(doc)
}
