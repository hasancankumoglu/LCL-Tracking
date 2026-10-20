import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/** Bulut mimarisi öncesi (SQLite dönemi) kullanılan local veritabanı/documents yolları. */
export function getLegacyDbPath(): string {
  return join(app.getPath('userData'), 'halils-portal.db')
}

export function getLegacyDocumentsRoot(): string {
  return join(app.getPath('userData'), 'documents')
}

export function hasLegacyData(): boolean {
  return existsSync(getLegacyDbPath())
}

export interface LegacyBooking {
  id: number
  bookingNo: string
  vesselDeparture: string | null
  declarationCutOff: string | null
  siCutOff: string | null
  category: string | null
  destination: string | null
  line: string | null
  pol: string | null
  status: string
  archived: number
  notes: string | null
  blNumber: string | null
  eta: string | null
  etd: string | null
  blStatus: string | null
  freeTimeEnd: string | null
  lastCarrierSyncAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LegacyContainer {
  id: number
  bookingId: number
  containerNo: string | null
  type: string
  sealNo: string | null
  truckPlate: string | null
  trailerPlate: string | null
  driverPhone: string | null
  vesselName: string | null
  imoNumber: string | null
  mmsiNumber: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface LegacyDocument {
  id: number
  bookingId: number
  type: string
  filePath: string
  originalFileName: string | null
  uploadedAt: string
}

export interface LegacyLookupValue {
  id: number
  fieldType: string
  value: string
}

export interface LegacyUnassignedVehicle {
  id: number
  truckPlate: string | null
  driverPhone: string | null
  location: string | null
  type: string | null
  containerNo: string | null
  agent: string | null
  sealNo: string | null
  notes: string | null
  sourceBookingRef: string | null
  sourceSheet: string | null
  sourceRow: number | null
}

export interface LegacyData {
  bookings: LegacyBooking[]
  containers: LegacyContainer[]
  documents: LegacyDocument[]
  lookupValues: LegacyLookupValue[]
  unassignedVehicles: LegacyUnassignedVehicle[]
}

/** Eski local SQLite dosyasını salt-okunur açıp tüm tabloları düz nesneler halinde döner. */
export function readLegacyData(): LegacyData {
  const db = new Database(getLegacyDbPath(), { readonly: true })
  try {
    return {
      bookings: db.prepare('SELECT * FROM bookings').all() as LegacyBooking[],
      containers: db.prepare('SELECT * FROM containers').all() as LegacyContainer[],
      documents: db.prepare('SELECT * FROM documents').all() as LegacyDocument[],
      lookupValues: db.prepare('SELECT * FROM lookup_values').all() as LegacyLookupValue[],
      unassignedVehicles: db
        .prepare('SELECT * FROM unassigned_vehicles')
        .all() as LegacyUnassignedVehicle[]
    }
  } finally {
    db.close()
  }
}
