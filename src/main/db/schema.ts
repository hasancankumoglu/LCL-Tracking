import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database | null = null

export function getDbPath(): string {
  return join(app.getPath('userData'), 'halils-portal.db')
}

export function getDb(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = getDbPath()

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate(db)

  return db
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookingNo TEXT NOT NULL UNIQUE,
      vesselDeparture TEXT,
      declarationCutOff TEXT,
      siCutOff TEXT,
      category TEXT,
      destination TEXT,
      line TEXT,
      pol TEXT,
      status TEXT NOT NULL DEFAULT 'YUKLENMEDI',
      archived INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookingId INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      containerNo TEXT,
      type TEXT NOT NULL CHECK (type IN ('40RF', '40HC', '20DC')),
      sealNo TEXT,
      truckPlate TEXT,
      trailerPlate TEXT,
      driverPhone TEXT,
      vesselName TEXT,
      imoNumber TEXT,
      mmsiNumber TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookingId INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('BEYANNAME', 'VGM', 'TALIMAT', 'BOOKING_CONFIRMATION', 'DRAFT_BL')),
      filePath TEXT NOT NULL,
      originalFileName TEXT,
      uploadedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lookup_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fieldType TEXT NOT NULL CHECK (fieldType IN ('category', 'destination', 'line', 'pol')),
      value TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_lookup_values_type_value
      ON lookup_values(fieldType, value COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS unassigned_vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      truckPlate TEXT,
      driverPhone TEXT,
      location TEXT,
      type TEXT,
      containerNo TEXT,
      agent TEXT,
      sealNo TEXT,
      notes TEXT,
      sourceBookingRef TEXT,
      sourceSheet TEXT,
      sourceRow INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_containers_bookingId ON containers(bookingId);
    CREATE INDEX IF NOT EXISTS idx_documents_bookingId ON documents(bookingId);
  `)

  const bookingColumns = database.prepare('PRAGMA table_info(bookings)').all() as Array<{
    name: string
  }>
  if (!bookingColumns.some((c) => c.name === 'category')) {
    database.exec('ALTER TABLE bookings ADD COLUMN category TEXT')
  }
  if (!bookingColumns.some((c) => c.name === 'status')) {
    database.exec("ALTER TABLE bookings ADD COLUMN status TEXT NOT NULL DEFAULT 'YUKLENMEDI'")
  }
  if (!bookingColumns.some((c) => c.name === 'archived')) {
    database.exec('ALTER TABLE bookings ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
  }
  // vesselName/imoNumber/mmsiNumber used to live on bookings; they now live on
  // containers (a booking can have multiple containers, each with its own
  // vessel). The old bookings columns are left vestigial on existing DBs (never
  // dropped) but are no longer read/written by the app.
  if (!bookingColumns.some((c) => c.name === 'blNumber')) {
    database.exec('ALTER TABLE bookings ADD COLUMN blNumber TEXT')
  }
  if (!bookingColumns.some((c) => c.name === 'eta')) {
    database.exec('ALTER TABLE bookings ADD COLUMN eta TEXT')
  }
  if (!bookingColumns.some((c) => c.name === 'etd')) {
    database.exec('ALTER TABLE bookings ADD COLUMN etd TEXT')
  }
  if (!bookingColumns.some((c) => c.name === 'blStatus')) {
    database.exec('ALTER TABLE bookings ADD COLUMN blStatus TEXT')
  }
  if (!bookingColumns.some((c) => c.name === 'freeTimeEnd')) {
    database.exec('ALTER TABLE bookings ADD COLUMN freeTimeEnd TEXT')
  }
  if (!bookingColumns.some((c) => c.name === 'lastCarrierSyncAt')) {
    database.exec('ALTER TABLE bookings ADD COLUMN lastCarrierSyncAt TEXT')
  }

  const containerColumns = database.prepare('PRAGMA table_info(containers)').all() as Array<{
    name: string
  }>
  if (!containerColumns.some((c) => c.name === 'vesselName')) {
    database.exec('ALTER TABLE containers ADD COLUMN vesselName TEXT')
  }
  if (!containerColumns.some((c) => c.name === 'imoNumber')) {
    database.exec('ALTER TABLE containers ADD COLUMN imoNumber TEXT')
  }
  if (!containerColumns.some((c) => c.name === 'mmsiNumber')) {
    database.exec('ALTER TABLE containers ADD COLUMN mmsiNumber TEXT')
  }

  // Mevcut bookinglerde kullanılmış kategori/destinasyon/hat/POL değerlerini
  // lookup_values tablosuna aktarır (idempotent - UNIQUE index sayesinde
  // tekrar çalıştırılması güvenli). Böylece dropdown listeleri, uygulama
  // güncellendiğinde geçmiş verilerle otomatik dolar.
  for (const [fieldType, column] of [
    ['category', 'category'],
    ['destination', 'destination'],
    ['line', 'line'],
    ['pol', 'pol']
  ] as const) {
    database
      .prepare(
        `INSERT OR IGNORE INTO lookup_values (fieldType, value)
         SELECT DISTINCT ?, TRIM(${column}) FROM bookings
         WHERE ${column} IS NOT NULL AND TRIM(${column}) != ''`
      )
      .run(fieldType)
  }
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
