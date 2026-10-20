-- Postgres schema for LCL-Tracking (Supabase). Run once via the Supabase SQL editor
-- (or `supabase db push` if you set up migrations) before deploying the Worker.
--
-- NOTE: all camelCase identifiers are double-quoted so Postgres preserves exact case -
-- this lets the Worker/Electron app keep using the exact same field names as the
-- existing SQLite-based `src/shared/types.ts` with zero remapping.
-- NOTE: date/time fields are kept as TEXT (ISO 8601 strings), matching the existing
-- app's SQLite-era convention, to avoid timezone/parsing behavior changes in this pass.

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "bookingNo" TEXT NOT NULL UNIQUE,
  "vesselDeparture" TEXT,
  "declarationCutOff" TEXT,
  "siCutOff" TEXT,
  category TEXT,
  destination TEXT,
  line TEXT,
  pol TEXT,
  status TEXT NOT NULL DEFAULT 'YUKLENMEDI',
  archived BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  "blNumber" TEXT,
  eta TEXT,
  etd TEXT,
  "blStatus" TEXT,
  "freeTimeEnd" TEXT,
  "lastCarrierSyncAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  "updatedAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS containers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "bookingId" BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  "containerNo" TEXT,
  type TEXT NOT NULL CHECK (type IN ('40RF', '40HC', '20DC')),
  "sealNo" TEXT,
  "truckPlate" TEXT,
  "trailerPlate" TEXT,
  "driverPhone" TEXT,
  "vesselName" TEXT,
  "imoNumber" TEXT,
  "mmsiNumber" TEXT,
  notes TEXT,
  "createdAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  "updatedAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "bookingId" BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('BEYANNAME', 'VGM', 'TALIMAT', 'BOOKING_CONFIRMATION', 'DRAFT_BL')),
  -- "filePath" now holds the Supabase Storage object path (not a local filesystem path).
  "filePath" TEXT NOT NULL,
  "originalFileName" TEXT,
  "uploadedAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS lookup_values (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "fieldType" TEXT NOT NULL CHECK ("fieldType" IN ('category', 'destination', 'line', 'pol')),
  value TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lookup_values_type_value
  ON lookup_values ("fieldType", lower(value));

CREATE TABLE IF NOT EXISTS unassigned_vehicles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "truckPlate" TEXT,
  "driverPhone" TEXT,
  location TEXT,
  type TEXT,
  "containerNo" TEXT,
  agent TEXT,
  "sealNo" TEXT,
  notes TEXT,
  "sourceBookingRef" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "createdAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_containers_bookingid ON containers ("bookingId");
CREATE INDEX IF NOT EXISTS idx_documents_bookingid ON documents ("bookingId");

-- Replicates the SQLite listBookings()/listArchivedBookings() aggregation query
-- (GROUP_CONCAT -> STRING_AGG). "uploadedDocTypes" is consumed by the Worker to
-- derive missingDocumentTypes in JS, same as the existing repositories.ts logic.
CREATE OR REPLACE VIEW booking_with_stats AS
SELECT
  b.*,
  COUNT(DISTINCT c.id) AS "containerCount",
  COALESCE(STRING_AGG(DISTINCT c.type, ','), '') AS "containerSizes",
  COALESCE(STRING_AGG(DISTINCT d.type, ','), '') AS "uploadedDocTypes"
FROM bookings b
LEFT JOIN containers c ON c."bookingId" = b.id
LEFT JOIN documents d ON d."bookingId" = b.id
GROUP BY b.id;

-- Used only by the one-time legacy-migration import endpoint: concurrency-safe
-- "last write wins by updatedAt" upsert, so multiple machines migrating independently
-- can't silently clobber a newer record with an older one.
CREATE OR REPLACE FUNCTION upsert_booking_lww(payload jsonb)
RETURNS bookings AS $$
DECLARE
  result bookings;
BEGIN
  INSERT INTO bookings (
    "bookingNo", "vesselDeparture", "declarationCutOff", "siCutOff", category, destination,
    line, pol, status, archived, notes, "blNumber", eta, etd, "blStatus", "freeTimeEnd",
    "lastCarrierSyncAt", "createdAt", "updatedAt", created_by, updated_by
  )
  SELECT
    payload->>'bookingNo', payload->>'vesselDeparture', payload->>'declarationCutOff',
    payload->>'siCutOff', payload->>'category', payload->>'destination', payload->>'line',
    payload->>'pol', payload->>'status', (payload->>'archived')::boolean, payload->>'notes',
    payload->>'blNumber', payload->>'eta', payload->>'etd', payload->>'blStatus',
    payload->>'freeTimeEnd', payload->>'lastCarrierSyncAt',
    COALESCE(payload->>'createdAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    COALESCE(payload->>'updatedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    payload->>'created_by', payload->>'updated_by'
  ON CONFLICT ("bookingNo") DO UPDATE SET
    "vesselDeparture" = EXCLUDED."vesselDeparture",
    "declarationCutOff" = EXCLUDED."declarationCutOff",
    "siCutOff" = EXCLUDED."siCutOff",
    category = EXCLUDED.category,
    destination = EXCLUDED.destination,
    line = EXCLUDED.line,
    pol = EXCLUDED.pol,
    status = EXCLUDED.status,
    archived = EXCLUDED.archived,
    notes = EXCLUDED.notes,
    "blNumber" = EXCLUDED."blNumber",
    eta = EXCLUDED.eta,
    etd = EXCLUDED.etd,
    "blStatus" = EXCLUDED."blStatus",
    "freeTimeEnd" = EXCLUDED."freeTimeEnd",
    "lastCarrierSyncAt" = EXCLUDED."lastCarrierSyncAt",
    "updatedAt" = EXCLUDED."updatedAt",
    updated_by = EXCLUDED.updated_by
  WHERE EXCLUDED."updatedAt" > bookings."updatedAt"
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    SELECT * INTO result FROM bookings WHERE "bookingNo" = payload->>'bookingNo';
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
