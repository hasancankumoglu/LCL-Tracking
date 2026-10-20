-- Adds the "unit" field to bookings: the planned number of containers for a booking.
-- When set, the app prevents adding more containers to the booking than this value.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "unit" INTEGER;

-- booking_with_stats is a view built with "b.*" - adding a column to the underlying
-- table does not automatically surface it in the view's output column list, and
-- CREATE OR REPLACE VIEW can't insert a new column in the middle of an existing
-- list, so the view is dropped and recreated instead.
DROP VIEW IF EXISTS booking_with_stats;

CREATE VIEW booking_with_stats AS
SELECT
  b.*,
  COUNT(DISTINCT c.id) AS "containerCount",
  COALESCE(STRING_AGG(DISTINCT c.type, ','), '') AS "containerSizes",
  COALESCE(STRING_AGG(DISTINCT d.type, ','), '') AS "uploadedDocTypes"
FROM bookings b
LEFT JOIN containers c ON c."bookingId" = b.id
LEFT JOIN documents d ON d."bookingId" = b.id
GROUP BY b.id;
