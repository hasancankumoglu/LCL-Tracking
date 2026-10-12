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
import { BOOKING_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '../../shared/types'

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('tr-TR')
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
        children: [new TextRun({ text: `Booking Raporu - ${booking.bookingNo}`, color: '0B2A5B' })]
      })
    )
    if (index === 0) {
      children.push(subtitle(`Oluşturma tarihi: ${formatDate(data.generatedAt)}`))
    }
    const missingDocsText =
      missingDocumentTypes.length > 0
        ? missingDocumentTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(', ')
        : 'Yok'
    children.push(
      spacer(),
      infoTable([
        ['Booking No', booking.bookingNo],
        ['Vessel Departure', formatDate(booking.vesselDeparture)],
        ['Declaration Cut Off', formatDate(booking.declarationCutOff)],
        ['SI Cut Off', formatDate(booking.siCutOff)],
        ['Kategori', booking.category ?? ''],
        ['Destination', booking.destination ?? ''],
        ['Line', booking.line ?? ''],
        ['POL', booking.pol ?? ''],
        ['Durum', BOOKING_STATUS_LABELS[booking.status]],
        ['Eksik Evrak', missingDocsText],
        ['Notlar', booking.notes ?? '']
      ]),
      spacer(),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Konteynerler (${containers.length})`, color: '0B2A5B' })]
      }),
      spacer(),
      containers.length > 0
        ? dataTable(
            [
              'Konteyner No',
              'Tip',
              'Mühür No',
              'Çekici',
              'Dorse',
              'Şoför Telefon',
              'Gemi',
              'Notlar'
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
        : new Paragraph({ children: [new TextRun({ text: 'Kayıtlı konteyner yok.' })] })
    )
  })

  const doc = new Document({ sections: [{ children }] })

  return Packer.toBuffer(doc)
}

/** Zaman bazlı (dönemsel) rapor: özet dağılımlar + bookingler listesi. */
export async function buildRangeReportDocx(data: RangeReportData): Promise<Buffer> {
  const { bookings } = data

  const statusRows = Object.entries(data.statusCounts).map(([status, count]) => [
    BOOKING_STATUS_LABELS[status as keyof typeof BOOKING_STATUS_LABELS],
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
          title(`Dönemsel Rapor - ${data.rangeLabel}`),
          subtitle(`Oluşturma tarihi: ${formatDate(data.generatedAt)}`),
          spacer(),
          infoTable([
            ['Toplam Booking', String(bookings.length)],
            ['Toplam Konteyner', String(data.totalContainers)]
          ]),
          spacer(),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Statü Dağılımı', color: '0B2A5B' })]
          }),
          spacer(),
          dataTable(['Statü', 'Adet'], statusRows),
          spacer(),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Konteyner Tipi Dağılımı', color: '0B2A5B' })]
          }),
          spacer(),
          dataTable(['Tip', 'Adet'], typeRows),
          spacer(),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: `Bookingler (${bookings.length})`, color: '0B2A5B' })]
          }),
          spacer(),
          bookings.length > 0
            ? dataTable(
                [
                  'Booking No',
                  'Vessel Departure',
                  'Destination',
                  'Line',
                  'POL',
                  'Durum',
                  'Konteyner',
                  'Eksik Evrak'
                ],
                bookings.map((b) => [
                  b.bookingNo,
                  formatDate(b.vesselDeparture),
                  b.destination ?? '',
                  b.line ?? '',
                  b.pol ?? '',
                  BOOKING_STATUS_LABELS[b.status],
                  String(b.containerCount),
                  b.missingDocumentTypes.length > 0
                    ? b.missingDocumentTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(', ')
                    : 'Yok'
                ])
              )
            : new Paragraph({ children: [new TextRun({ text: 'Seçili dönemde booking yok.' })] })
        ]
      }
    ]
  })

  return Packer.toBuffer(doc)
}
