import * as XLSX from 'xlsx'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  listBookings,
  listContainersByBooking,
  getBookingByNo,
  createBooking,
  updateBooking,
  createContainer,
  createUnassignedVehicle,
  findActiveContainerConflicts
} from '../db/repositories'
import type {
  BookingWithStats,
  ContainerType,
  ExcelImportResult,
  ExcelPreviewResult,
  BookingStatus
} from '../../shared/types'
import { CONTAINER_TYPES, BOOKING_STATUSES } from '../../shared/types'
import { mt, mtTr } from '../i18n/language'

const UNCATEGORIZED_SHEET = 'Diğer'
const BOOKINGS_FILE_NAME = 'Bookings.xlsx'
const CONTAINERS_FILE_NAME = 'Containers.xlsx'

// İçe aktarma her zaman Türkçe statu etiketleriyle çalışır (dil tercihinden bağımsız).
const STATUS_LABEL_TO_CODE = new Map<string, BookingStatus>(
  BOOKING_STATUSES.map((status) => [mtTr(`enums.bookingStatus.${status}`).toLowerCase(), status])
)

function statusLabelToCode(raw: unknown): BookingStatus {
  const label = String(raw ?? '')
    .trim()
    .toLowerCase()
  return STATUS_LABEL_TO_CODE.get(label) ?? 'YUKLENMEDI'
}

export interface ExcelExportResult {
  bookingsFilePath: string
  containersFilePath: string
}

/**
 * Booking'in CATEGORY alanı, gerçek Excel dosyalarındaki gibi bir "kategori"
 * (ör. Mundra, Bandar Abbas) olarak kullanılır: her kategori kendi sekmesine
 * (sheet) yazılır - klasörleme mantığıyla aynı, sadece Excel sekmesi olarak.
 * DESTINATION alanından bağımsızdır.
 */
function categoryOf(category: string | null): string {
  const trimmed = (category ?? '').trim()
  return trimmed.length > 0 ? trimmed : UNCATEGORIZED_SHEET
}

/** Excel sekme adları: max 31 karakter, \ / ? * [ ] karakterleri yasak. */
function sanitizeSheetName(name: string, used: Set<string>): string {
  let clean = name.replace(/[\\/?*[\]:]/g, ' ').trim()
  if (clean.length === 0) clean = UNCATEGORIZED_SHEET
  if (clean.length > 31) clean = clean.slice(0, 31)

  let candidate = clean
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const cut = clean.slice(0, Math.max(0, 31 - String(suffix).length - 1))
    candidate = `${cut}~${suffix}`
    suffix++
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function groupByCategory(bookings: BookingWithStats[]): Map<string, BookingWithStats[]> {
  const groups = new Map<string, BookingWithStats[]>()
  for (const booking of bookings) {
    const category = categoryOf(booking.category)
    const key = category.toLowerCase()
    const existingKey = Array.from(groups.keys()).find((k) => k.toLowerCase() === key)
    const groupKey = existingKey ?? category
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(booking)
  }
  return groups
}

/**
 * Bookinglari ve konteynerları, kaynak Excel dosyalarındaki gibi İKİ AYRI dosyaya
 * (Bookings.xlsx / Containers.xlsx) ve her biri içinde hedef/kategoriye göre
 * ayrı sekmelere (ör. Mundra, Bandar Abbas) bölerek dışa aktarır.
 *
 * `bookingIds` verildiğinde (BookingListPage'de uygulanan arama/filtre sonucu),
 * sadece bu ID'lere sahip bookingler dışa aktarılır; tüm bookinglerin
 * aktarılmaması bu parametreyle sağlanır.
 */
export async function exportToExcel(
  directoryPath: string,
  bookingIds?: number[]
): Promise<ExcelExportResult> {
  fs.mkdirSync(directoryPath, { recursive: true })

  const allBookings = await listBookings(true)
  // bookingIds verildiğinde (ör. listede uygulanan filtreler) sadece o bookingler
  // dışa aktarılır; aksi halde (ör. geriye dönük uyumluluk) tüm bookingler aktarılır.
  const bookings = bookingIds ? allBookings.filter((b) => bookingIds.includes(b.id)) : allBookings
  const groups = groupByCategory(bookings)

  const bookingsWorkbook = XLSX.utils.book_new()
  const containersWorkbook = XLSX.utils.book_new()
  const usedBookingSheetNames = new Set<string>()
  const usedContainerSheetNames = new Set<string>()

  for (const [category, groupBookings] of groups) {
    const bookingRows = groupBookings.map((b) => ({
      [mt('excel.booking')]: b.bookingNo,
      [mt('excel.vesselDeparture')]: b.vesselDeparture ?? '',
      [mt('excel.declarationCutOff')]: b.declarationCutOff ?? '',
      [mt('excel.siCutOff')]: b.siCutOff ?? '',
      [mt('excel.containerSize')]: b.containerSizes,
      [mt('excel.unit')]: b.containerCount,
      [mt('excel.destination')]: b.destination ?? '',
      [mt('excel.line')]: b.line ?? '',
      [mt('excel.pol')]: b.pol ?? '',
      [mt('excel.status')]: mt(`enums.bookingStatus.${b.status}`) ?? b.status,
      [mt('excel.notes')]: b.notes ?? ''
    }))

    const containerRows: Record<string, unknown>[] = []
    for (const b of groupBookings) {
      const containers = await listContainersByBooking(b.id)
      for (const c of containers) {
        containerRows.push({
          [mt('excel.booking')]: b.bookingNo,
          [mt('excel.truckPlate')]: c.truckPlate ?? '',
          [mt('excel.trailerPlate')]: c.trailerPlate ?? '',
          [mt('excel.driverPhone')]: c.driverPhone ?? '',
          [mt('excel.containerType')]: c.type,
          [mt('excel.containerNo')]: c.containerNo ?? '',
          [mt('excel.sealNo')]: c.sealNo ?? '',
          [mt('excel.vesselName')]: c.vesselName ?? '',
          [mt('excel.imo')]: c.imoNumber ?? '',
          [mt('excel.mmsi')]: c.mmsiNumber ?? '',
          [mt('excel.notes')]: c.notes ?? ''
        })
      }
    }

    const bookingSheetName = sanitizeSheetName(category, usedBookingSheetNames)
    const containerSheetName = sanitizeSheetName(category, usedContainerSheetNames)
    XLSX.utils.book_append_sheet(
      bookingsWorkbook,
      XLSX.utils.json_to_sheet(bookingRows),
      bookingSheetName
    )
    XLSX.utils.book_append_sheet(
      containersWorkbook,
      XLSX.utils.json_to_sheet(containerRows),
      containerSheetName
    )
  }

  if (groups.size === 0) {
    XLSX.utils.book_append_sheet(
      bookingsWorkbook,
      XLSX.utils.json_to_sheet([]),
      UNCATEGORIZED_SHEET
    )
    XLSX.utils.book_append_sheet(
      containersWorkbook,
      XLSX.utils.json_to_sheet([]),
      UNCATEGORIZED_SHEET
    )
  }

  const bookingsFilePath = path.join(directoryPath, BOOKINGS_FILE_NAME)
  const containersFilePath = path.join(directoryPath, CONTAINERS_FILE_NAME)
  XLSX.writeFile(bookingsWorkbook, bookingsFilePath)
  XLSX.writeFile(containersWorkbook, containersFilePath)

  return { bookingsFilePath, containersFilePath }
}

function normalizeContainerType(raw: unknown): ContainerType | null {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
  return (CONTAINER_TYPES as string[]).includes(value) ? (value as ContainerType) : null
}

function toStringOrNull(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  const str = String(raw).trim()
  return str.length > 0 ? str : null
}

/**
 * Bazı kaynak Excel dosyaları başlıkta Türkçe noktalı büyük "İ" (U+0130) kullanıyor
 * (ör. "BOOKING" yerine "BOOKİNG") - satır alanlarına erişirken bu farkı yok sayıyoruz.
 */
function normalizeHeader(header: string): string {
  return header.replace(/İ/g, 'I').trim().toUpperCase()
}

/** Satırda verilen aday başlık adlarından (Türkçe İ/I farkı yok sayılarak) ilk eşleşeni döner. */
function getField(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const normalizedCandidates = candidates.map(normalizeHeader)
  for (const key of Object.keys(row)) {
    if (normalizedCandidates.includes(normalizeHeader(key))) {
      return row[key]
    }
  }
  return undefined
}

/** Satırdaki ilk sütunun ham değerini döner (başlık adı ne olursa olsun) - "ilk kolondaki booking numarası" kuralı için yedek. */
function firstColumnValue(row: Record<string, unknown>): unknown {
  const keys = Object.keys(row)
  return keys.length > 0 ? row[keys[0]] : undefined
}

/**
 * Excel tarih hücrelerini (workbook `cellDates:true` ile okunduğunda Date nesnesi
 * olarak gelir) 'YYYY-MM-DD' metnine çevirir. UTC bileşenleri kullanılır; xlsx seri
 * tarihleri UTC bazında hesapladığından yerel saat dilimine çevirmek gün kaymasına
 * yol açabilir. Date olmayan değerler için düz metne düşer.
 */
function toDateOrNull(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    const y = raw.getUTCFullYear()
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0')
    const d = String(raw.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return toStringOrNull(raw)
}

function findWorkbookFile(directoryPath: string, matcher: RegExp): string | undefined {
  const files = fs.readdirSync(directoryPath).filter((f) => /\.xlsx?$/i.test(f))
  return files.find((f) => matcher.test(f))
}

/**
 * Sürükle-bırak veya dosya seçiminden gelen yolları, Bookings.xlsx/Containers.xlsx
 * dosyalarının bulunduğu klasöre çevirir: bir klasör sürüklendiyse doğrudan onu,
 * dosya(lar) sürüklendiyse ilk dosyanın bulunduğu klasörü kullanır.
 */
export function resolveImportDirectory(inputPaths: string[]): string {
  const first = inputPaths[0]
  if (!first) {
    throw new Error('İçe aktarılacak dosya veya klasör bulunamadı.')
  }
  const stat = fs.statSync(first)
  return stat.isDirectory() ? first : path.dirname(first)
}

/**
 * Bookinglari ve konteynerları, kaynak Excel dosyalarındaki gibi seçilen klasör
 * içindeki İKİ AYRI dosyadan (Bookings.xlsx / Containers.xlsx) okur. `commit`
 * false ise veritabanına HİÇBİR YAZMA yapılmaz, sadece önizleme/doğrulama için
 * satırlar ve hatalar toplanır. Her sekme (sheet) bir kategoriyi temsil eder.
 */
async function runExcelImport(
  directoryPath: string,
  commit: boolean
): Promise<{ result: ExcelImportResult; preview: ExcelPreviewResult }> {
  const result: ExcelImportResult = {
    bookingsCreated: 0,
    bookingsUpdated: 0,
    containersCreated: 0,
    unassignedVehiclesCreated: 0,
    errors: []
  }
  const preview: ExcelPreviewResult = {
    directoryPath,
    bookingsFileName: null,
    containersFileName: null,
    bookingRows: [],
    containerRows: [],
    unassignedVehicleRows: [],
    bookingsToCreate: 0,
    bookingsToUpdate: 0,
    containersToCreate: 0,
    unassignedVehiclesToCreate: 0,
    errors: []
  }

  function addError(msg: string): void {
    result.errors.push(msg)
    preview.errors.push(msg)
  }

  const bookingsFileName = findWorkbookFile(directoryPath, /book/i)
  if (!bookingsFileName) {
    addError(
      `Klasörde booking Excel dosyası bulunamadı (dosya adında "booking" geçmeli): ${directoryPath}`
    )
    return { result, preview }
  }
  preview.bookingsFileName = bookingsFileName

  const bookingsWorkbook = XLSX.readFile(path.join(directoryPath, bookingsFileName), {
    cellDates: true
  })
  const bookingIdByNo = new Map<string, number>()
  const bookingNoLocations = new Map<string, string[]>()

  for (const sheetName of bookingsWorkbook.SheetNames) {
    const sheet = bookingsWorkbook.Sheets[sheetName]
    const bookingRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

    for (const [index, row] of bookingRows.entries()) {
      const rowNumber = index + 2
      const bookingNo = toStringOrNull(getField(row, 'BOOKING') ?? firstColumnValue(row))
      if (!bookingNo) {
        addError(`[${sheetName}] satır ${rowNumber}: BOOKING numarası boş, atlandı.`)
        continue
      }

      const existing = await getBookingByNo(bookingNo)
      const status = statusLabelToCode(getField(row, 'STATUS'))
      const input = {
        bookingNo,
        vesselDeparture: toDateOrNull(getField(row, 'VESSEL DEPARTURE')),
        declarationCutOff: toDateOrNull(getField(row, 'DECLARATION CUT OFF')),
        siCutOff: toDateOrNull(getField(row, 'SI CUT OFF')),
        category: sheetName,
        destination: toStringOrNull(getField(row, 'DESTINATION')),
        line: toStringOrNull(getField(row, 'LINE')),
        pol: toStringOrNull(getField(row, 'POL')),
        status,
        archived: existing ? existing.archived : false,
        notes: toStringOrNull(getField(row, 'DURUM')),
        unit: existing?.unit ?? null,
        blNumber: existing?.blNumber ?? null,
        eta: existing?.eta ?? null,
        etd: existing?.etd ?? null,
        blStatus: existing?.blStatus ?? null,
        freeTimeEnd: existing?.freeTimeEnd ?? null,
        lastCarrierSyncAt: existing?.lastCarrierSyncAt ?? null,
        customerId: existing?.customerId ?? null
      }

      const location = `${sheetName} satır ${rowNumber}`
      bookingNoLocations.set(bookingNo, [...(bookingNoLocations.get(bookingNo) ?? []), location])

      if (
        input.vesselDeparture &&
        input.declarationCutOff &&
        input.declarationCutOff > input.vesselDeparture
      ) {
        addError(
          `[${location}] Uyarı: "${bookingNo}" için Declaration Cut Off tarihi (${input.declarationCutOff}), Vessel Departure tarihinden (${input.vesselDeparture}) sonra. Olası veri girişi hatası.`
        )
      }
      if (input.vesselDeparture && input.siCutOff && input.siCutOff > input.vesselDeparture) {
        addError(
          `[${location}] Uyarı: "${bookingNo}" için SI Cut Off tarihi (${input.siCutOff}), Vessel Departure tarihinden (${input.vesselDeparture}) sonra. Olası veri girişi hatası.`
        )
      }

      preview.bookingRows.push({
        sheetName,
        rowNumber,
        bookingNo,
        status,
        destination: input.destination,
        line: input.line,
        pol: input.pol,
        action: existing ? 'update' : 'create'
      })
      if (existing) preview.bookingsToUpdate++
      else preview.bookingsToCreate++

      if (commit) {
        if (existing) {
          await updateBooking(existing.id, input)
          bookingIdByNo.set(bookingNo, existing.id)
          result.bookingsUpdated++
        } else {
          const created = await createBooking(input)
          bookingIdByNo.set(bookingNo, created.id)
          result.bookingsCreated++
        }
      } else if (existing) {
        bookingIdByNo.set(bookingNo, existing.id)
      }
    }
  }

  for (const [bookingNo, locations] of bookingNoLocations) {
    if (locations.length > 1) {
      addError(
        `Uyarı: "${bookingNo}" booking numarası dosyada birden fazla kez (mükerrer) geçiyor: ${locations.join(', ')}.`
      )
    }
  }

  const containersFileName = findWorkbookFile(directoryPath, /contain|konteyner/i)
  if (!containersFileName) {
    addError(
      `Klasörde konteyner Excel dosyası bulunamadı (dosya adında "container"/"konteyner" geçmeli); sadece bookingler içe aktarıldı.`
    )
    return { result, preview }
  }
  preview.containersFileName = containersFileName

  const containersWorkbook = XLSX.readFile(path.join(directoryPath, containersFileName), {
    cellDates: true
  })
  const containerNoLocations = new Map<string, Set<string>>()

  for (const sheetName of containersWorkbook.SheetNames) {
    const sheet = containersWorkbook.Sheets[sheetName]
    const containerRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
    if (containerRows.length === 0) continue

    const hasBookingColumn = containerRows.some((row) => getField(row, 'BOOKING') !== undefined)
    const isAfganSheet = normalizeHeader(sheetName) === 'AFGAN'

    // Sadece "BOOKING" sütunu olan sekmeler (uygulamanın kendi dışa aktardığı
    // Containers.xlsx formatı) doğrudan konteyner olarak içe aktarılır.
    if (hasBookingColumn && !isAfganSheet) {
      for (const [index, row] of containerRows.entries()) {
        const rowNumber = index + 2
        const bookingNo = toStringOrNull(getField(row, 'BOOKING') ?? firstColumnValue(row))
        if (!bookingNo) {
          addError(`[${sheetName}] satır ${rowNumber}: BOOKING numarası boş, atlandı.`)
          continue
        }

        let bookingId = bookingIdByNo.get(bookingNo)
        if (bookingId === undefined) {
          const existing = await getBookingByNo(bookingNo)
          if (existing) {
            bookingId = existing.id
            bookingIdByNo.set(bookingNo, bookingId)
          }
        }

        const bookingWillExist =
          bookingId !== undefined || preview.bookingRows.some((r) => r.bookingNo === bookingNo)
        if (!bookingWillExist) {
          addError(
            `[${sheetName}] satır ${rowNumber}: "${bookingNo}" booking numarası bulunamadı, atlandı.`
          )
          continue
        }

        const type = normalizeContainerType(getField(row, 'KONTEYNER TYPE'))
        const containerNo = toStringOrNull(getField(row, 'KONTEYNER'))
        if (!type) {
          addError(
            `[${sheetName}] satır ${rowNumber}: geçersiz KONTEYNER TYPE ("${getField(row, 'KONTEYNER TYPE')}"), atlandı.`
          )
          continue
        }

        if (containerNo) {
          const bookingSet = containerNoLocations.get(containerNo) ?? new Set<string>()
          bookingSet.add(bookingNo)
          containerNoLocations.set(containerNo, bookingSet)

          if (bookingId !== undefined) {
            const dbConflicts = (await findActiveContainerConflicts(containerNo)).filter(
              (c) => c.bookingId !== bookingId
            )
            if (dbConflicts.length > 0) {
              const list = dbConflicts.map((c) => c.bookingNo).join(', ')
              addError(
                `[${sheetName}] satır ${rowNumber}: Uyarı: "${containerNo}" konteyner numarası zaten aktif başka booking'lerde kayıtlı: ${list}. Olası mükerrer giriş.`
              )
            }
          }
        }

        preview.containerRows.push({ sheetName, rowNumber, bookingNo, containerNo, type })
        preview.containersToCreate++

        if (commit && bookingId !== undefined) {
          await createContainer({
            bookingId,
            containerNo,
            type,
            sealNo: toStringOrNull(getField(row, 'MÜHÜR')),
            truckPlate: toStringOrNull(getField(row, 'ÇEKİCİ')),
            trailerPlate: toStringOrNull(getField(row, 'DORSE')),
            driverPhone: toStringOrNull(getField(row, 'TELEFON')),
            vesselName: toStringOrNull(getField(row, 'GEMİ ADI')),
            imoNumber: toStringOrNull(getField(row, 'IMO')),
            mmsiNumber: toStringOrNull(getField(row, 'MMSI')),
            notes: toStringOrNull(getField(row, 'DURUM'))
          })
          result.containersCreated++
        }
      }
      continue
    }

    // "AFGAN" sekmesi: BL/konteyner no her zaman net olmayan, kullanıcının elle
    // eşleştireceği araç kayıtları. Doğrudan konteyner oluşturmak yerine
    // "Atanmayan Araçlar" bekleme listesine (unassigned_vehicles) eklenir.
    if (isAfganSheet) {
      for (const [index, row] of containerRows.entries()) {
        const rowNumber = index + 2
        const truckPlate = toStringOrNull(getField(row, 'ÇEKİCİ'))
        const driverPhone = toStringOrNull(getField(row, 'TELEFON'))
        const location = toStringOrNull(getField(row, 'ÜLKE/ŞEHİR'))
        const type = toStringOrNull(getField(row, 'KONTEYNER TYPE'))
        const containerNo = toStringOrNull(getField(row, 'KONTEYNER'))
        const agent = toStringOrNull(getField(row, 'ACENTE'))
        const sealNo = toStringOrNull(getField(row, 'MÜHÜR'))
        const sourceBookingRef = toStringOrNull(getField(row, 'BL'))
        const notes =
          [toStringOrNull(getField(row, 'DURUM')), toStringOrNull(getField(row, '__EMPTY'))]
            .filter((v): v is string => Boolean(v))
            .join(' | ') || null

        if (!truckPlate && !containerNo && !sourceBookingRef) {
          // Tamamen boş/anlamsız satır, sessizce atla.
          continue
        }

        preview.unassignedVehicleRows.push({
          sheetName,
          rowNumber,
          truckPlate,
          containerNo,
          sourceBookingRef
        })
        preview.unassignedVehiclesToCreate++

        if (commit) {
          await createUnassignedVehicle({
            truckPlate,
            driverPhone,
            location,
            type,
            containerNo,
            agent,
            sealNo,
            notes,
            sourceBookingRef,
            sourceSheet: sheetName,
            sourceRow: rowNumber
          })
          result.unassignedVehiclesCreated++
        }
      }
      continue
    }

    addError(
      `[${sheetName}] sekmesi desteklenmeyen bir yapıda (BOOKING sütunu yok ve "AFGAN" sekmesi değil), atlandı.`
    )
  }

  for (const [containerNo, bookingNos] of containerNoLocations) {
    if (bookingNos.size > 1) {
      addError(
        `Uyarı: "${containerNo}" konteyner numarası dosya içinde birden fazla farklı booking'e girilmiş: ${Array.from(bookingNos).join(', ')}.`
      )
    }
  }

  return { result, preview }
}

/**
 * Seçilen klasördeki Excel dosyalarını okuyup, VERİTABANINA HİÇBİR YAZMA
 * YAPMADAN önizleme/doğrulama sonucu döner. Kullanıcı onaylarsa `importFromExcel`
 * çağrılarak gerçek içe aktarma yapılır.
 */
export async function previewExcelImport(directoryPath: string): Promise<ExcelPreviewResult> {
  return (await runExcelImport(directoryPath, false)).preview
}

/**
 * Bookinglari ve konteynerları, kaynak Excel dosyalarındaki gibi seçilen klasör
 * içindeki İKİ AYRI dosyadan (Bookings.xlsx / Containers.xlsx) içe aktarır.
 * Her dosyadaki her sekme (sheet) bir kategoriyi (ör. Mundra, Bandar Abbas)
 * temsil eder - kategori bir sütun değil, sekmenin kendisidir.
 */
export async function importFromExcel(directoryPath: string): Promise<ExcelImportResult> {
  return (await runExcelImport(directoryPath, true)).result
}
