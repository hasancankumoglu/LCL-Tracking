import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs'
import AdmZip from 'adm-zip'
import { getSupabase } from '../db/schema'
import { getCurrentUser } from '../user/currentUser'
import { resolveContentType } from '../documents/storage'
import {
  hasLegacyData,
  readLegacyData,
  getLegacyDbPath,
  getLegacyDocumentsRoot
} from './legacyLocalDb'
import { logError, logInfo } from '../logging/logger'

interface MigrationState {
  migratedToCloud: boolean
  migratedAt?: string
  counts?: Record<string, number>
}

function getMarkerPath(): string {
  return join(app.getPath('userData'), 'migration-state.json')
}

function readMarker(): MigrationState {
  const markerPath = getMarkerPath()
  if (!existsSync(markerPath)) return { migratedToCloud: false }
  try {
    return JSON.parse(readFileSync(markerPath, 'utf-8'))
  } catch {
    return { migratedToCloud: false }
  }
}

function writeMarker(state: MigrationState): void {
  writeFileSync(getMarkerPath(), JSON.stringify(state, null, 2), 'utf-8')
}

/** Silmeden önce eski local db + documents klasörünün bir güvenlik zip'ini alır. */
function makeSafetyBackup(): void {
  const backupDir = join(app.getPath('userData'), 'pre-cloud-migration-backup')
  mkdirSync(backupDir, { recursive: true })
  const zipPath = join(backupDir, `pre-migration-${Date.now()}.zip`)
  const zip = new AdmZip()
  const dbPath = getLegacyDbPath()
  if (existsSync(dbPath)) zip.addLocalFile(dbPath)
  const docsRoot = getLegacyDocumentsRoot()
  if (existsSync(docsRoot)) zip.addLocalFolder(docsRoot, 'documents')
  zip.writeZip(zipPath)
  logInfo('migration', `Güvenlik yedeği alındı: ${zipPath}`)
}

/**
 * Uygulama ilk kez yeni (bulut) sürümle açıldığında, önceki SQLite döneminden kalan
 * local verileri Supabase'e taşır. Tek seferlik - başarılı tamamlandığında bir marker
 * dosyası yazılır ve local .db/documents silinir (güvenlik zip'i kalır). Başarısız
 * olursa hiçbir şey silinmez/işaretlenmez - bir sonraki açılışta otomatik tekrar denenir.
 * Birden fazla makine bağımsız olarak migrate edebileceğinden, bookingNo çakışmalarında
 * "son güncellenen kazanır" kuralı Postgres tarafında (upsert_booking_lww RPC) uygulanır.
 */
export async function runLegacyMigrationIfNeeded(): Promise<void> {
  const marker = readMarker()
  if (marker.migratedToCloud) return

  if (!hasLegacyData()) {
    writeMarker({ migratedToCloud: true, migratedAt: new Date().toISOString(), counts: {} })
    return
  }

  logInfo('migration', 'Eski local veri bulundu, bulut migrasyonu başlıyor...')
  makeSafetyBackup()

  const legacy = readLegacyData()
  const supabase = getSupabase()
  const actingUser = getCurrentUser()
  const counts: Record<string, number> = {}

  // Bookings: last-write-wins upsert (bookingNo çakışmasında updatedAt'ı daha yeni olan
  // kazanır) - eski local id -> yeni cloud id eşlemesi, diğer tablolar bunu kullanır.
  const bookingIdMap = new Map<number, number>()
  for (const b of legacy.bookings) {
    const payload = {
      bookingNo: b.bookingNo,
      vesselDeparture: b.vesselDeparture,
      declarationCutOff: b.declarationCutOff,
      siCutOff: b.siCutOff,
      category: b.category,
      destination: b.destination,
      line: b.line,
      pol: b.pol,
      status: b.status,
      archived: Boolean(b.archived),
      notes: b.notes,
      blNumber: b.blNumber,
      eta: b.eta,
      etd: b.etd,
      blStatus: b.blStatus,
      freeTimeEnd: b.freeTimeEnd,
      lastCarrierSyncAt: b.lastCarrierSyncAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      createdBy: actingUser,
      updatedBy: actingUser
    }
    const { data, error } = await supabase.rpc('upsert_booking_lww', { payload })
    if (error) throw new Error(`Booking migrate hatası (${b.bookingNo}): ${error.message}`)
    bookingIdMap.set(b.id, (data as { id: number }).id)
  }
  counts.bookings = legacy.bookings.length

  // Containers: aynı containerNo zaten o booking altında varsa (başka bir makine
  // migrate ettiyse) atlanır, mükerrer kayıt oluşmaz.
  let containerCount = 0
  for (const c of legacy.containers) {
    const newBookingId = bookingIdMap.get(c.bookingId)
    if (!newBookingId) continue
    if (c.containerNo) {
      const { data: existing } = await supabase
        .from('containers')
        .select('id')
        .eq('bookingId', newBookingId)
        .eq('containerNo', c.containerNo)
        .maybeSingle()
      if (existing) continue
    }
    const { error } = await supabase.from('containers').insert({
      bookingId: newBookingId,
      containerNo: c.containerNo,
      type: c.type,
      sealNo: c.sealNo,
      truckPlate: c.truckPlate,
      trailerPlate: c.trailerPlate,
      driverPhone: c.driverPhone,
      vesselName: c.vesselName,
      imoNumber: c.imoNumber,
      mmsiNumber: c.mmsiNumber,
      notes: c.notes,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      createdBy: actingUser,
      updatedBy: actingUser
    })
    if (error) throw new Error(`Container migrate hatası: ${error.message}`)
    containerCount++
  }
  counts.containers = containerCount

  // Documents: dosya baytları Storage'a yüklenir, sonra metadata satırı eklenir.
  let documentCount = 0
  const docsRoot = getLegacyDocumentsRoot()
  for (const d of legacy.documents) {
    const newBookingId = bookingIdMap.get(d.bookingId)
    if (!newBookingId) continue
    const localFilePath = join(docsRoot, ...String(d.filePath).split(/[\\/]+/))
    if (!existsSync(localFilePath)) continue
    const fileBuffer = readFileSync(localFilePath)
    const storedPath = `${newBookingId}/${d.type}/${Date.now()}_${documentCount}_${d.originalFileName ?? 'dosya'}`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storedPath, fileBuffer, {
        contentType: resolveContentType(d.originalFileName ?? storedPath),
        upsert: false
      })
    if (uploadError) throw new Error(`Döküman yükleme hatası: ${uploadError.message}`)
    const { error: insertError } = await supabase.from('documents').insert({
      bookingId: newBookingId,
      type: d.type,
      filePath: storedPath,
      originalFileName: d.originalFileName,
      uploadedAt: d.uploadedAt,
      createdBy: actingUser
    })
    if (insertError) throw new Error(`Döküman kaydı hatası: ${insertError.message}`)
    documentCount++
  }
  counts.documents = documentCount

  // Lookup values: case-insensitive unique-violation'ı (23505) "zaten var" say.
  for (const l of legacy.lookupValues) {
    const { error } = await supabase
      .from('lookup_values')
      .insert({ fieldType: l.fieldType, value: l.value })
    if (error && error.code !== '23505') {
      throw new Error(`Lookup migrate hatası: ${error.message}`)
    }
  }
  counts.lookup_values = legacy.lookupValues.length

  // Unassigned vehicles: doğal bir benzersiz anahtarı yok, doğrudan eklenir.
  for (const v of legacy.unassignedVehicles) {
    const { error } = await supabase.from('unassigned_vehicles').insert({
      truckPlate: v.truckPlate,
      driverPhone: v.driverPhone,
      location: v.location,
      type: v.type,
      containerNo: v.containerNo,
      agent: v.agent,
      sealNo: v.sealNo,
      notes: v.notes,
      sourceBookingRef: v.sourceBookingRef,
      sourceSheet: v.sourceSheet,
      sourceRow: v.sourceRow,
      createdBy: actingUser
    })
    if (error) throw new Error(`Atanmayan araç migrate hatası: ${error.message}`)
  }
  counts.unassigned_vehicles = legacy.unassignedVehicles.length

  // Veri taşıma buraya kadar başarıyla tamamlandı - marker şimdi yazılır (bir sonraki
  // açılışta tekrar çalışıp mükerrer kayıt oluşturmasın diye). Local dosyaların silinmesi
  // artık sadece temizlik - başarısız olsa bile (ör. Windows dosya kilidi) migrasyonun
  // kendisi başarılı sayılır, sadece bir uyarı loglanır.
  writeMarker({ migratedToCloud: true, migratedAt: new Date().toISOString(), counts })

  try {
    rmSync(getLegacyDbPath(), { force: true, maxRetries: 5, retryDelay: 200 })
    for (const ext of ['-wal', '-shm']) {
      const sidecarPath = getLegacyDbPath() + ext
      if (existsSync(sidecarPath)) {
        rmSync(sidecarPath, { force: true, maxRetries: 5, retryDelay: 200 })
      }
    }
    if (existsSync(docsRoot)) {
      rmSync(docsRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  } catch (err) {
    logError('migration:cleanup', err)
  }

  logInfo('migration', `Bulut migrasyonu tamamlandı: ${JSON.stringify(counts)}`)
}
