-- Postgres views do NOT auto-update their column list when the underlying table gains a
-- new column (`SELECT b.*` is expanded to an explicit column list at CREATE VIEW time,
-- not re-evaluated dynamically). 008_customer_management.sql added "customerId" to
-- bookings AFTER booking_with_stats was created in 001_init.sql, so the view was still
-- missing it - causing "column booking_with_stats.customerId does not exist" at runtime.
--
-- CREATE OR REPLACE VIEW cannot fix this either: "customerId" lands in the middle of the
-- view's output column list (wherever ALTER TABLE appended it on bookings, which is
-- BEFORE the trailing containerCount/containerSizes/uploadedDocTypes aggregate columns),
-- and Postgres only allows CREATE OR REPLACE VIEW to ADD columns at the very end, not
-- reposition/rename existing ones (42P16). Same issue 004_add_unit_to_bookings.sql hit
-- for "unit" - same fix: drop and recreate the view instead.
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
