-- Renames the snake_case created_by/updated_by audit columns to camelCase, for
-- consistency with every other column in this schema (all camelCase, double-quoted).
ALTER TABLE bookings RENAME COLUMN created_by TO "createdBy";
ALTER TABLE bookings RENAME COLUMN updated_by TO "updatedBy";
ALTER TABLE containers RENAME COLUMN created_by TO "createdBy";
ALTER TABLE containers RENAME COLUMN updated_by TO "updatedBy";
ALTER TABLE documents RENAME COLUMN created_by TO "createdBy";
ALTER TABLE unassigned_vehicles RENAME COLUMN created_by TO "createdBy";

-- Re-create the two RPC functions that reference these columns, with corrected
-- quoted camelCase names (CREATE OR REPLACE from 002_rls_and_functions.sql).
CREATE OR REPLACE FUNCTION apply_carrier_snapshot(
  p_booking_id BIGINT,
  p_snapshot JSONB,
  p_acting_user TEXT
) RETURNS JSONB AS $$
DECLARE
  v_booking bookings;
  v_container RECORD;
  v_snapshot_container JSONB;
  v_updated TEXT[] := '{}';
  v_unmatched TEXT[] := '{}';
BEGIN
  UPDATE bookings SET
    "blNumber" = COALESCE(p_snapshot->>'blNumber', "blNumber"),
    eta = COALESCE(p_snapshot->>'eta', eta),
    etd = COALESCE(p_snapshot->>'etd', etd),
    "blStatus" = COALESCE(p_snapshot->>'blStatus', "blStatus"),
    "freeTimeEnd" = COALESCE(p_snapshot->>'freeTimeEnd', "freeTimeEnd"),
    pol = COALESCE(pol, p_snapshot->>'pol'),
    destination = COALESCE(destination, p_snapshot->>'destination'),
    "lastCarrierSyncAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    "updatedBy" = p_acting_user
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking bulunamadı.';
  END IF;

  FOR v_snapshot_container IN SELECT * FROM jsonb_array_elements(p_snapshot->'containers')
  LOOP
    SELECT * INTO v_container FROM containers
      WHERE "bookingId" = p_booking_id
        AND UPPER(TRIM("containerNo")) = UPPER(TRIM(v_snapshot_container->>'containerNo'))
      LIMIT 1;
    IF v_container.id IS NULL THEN
      v_unmatched := array_append(v_unmatched, v_snapshot_container->>'containerNo');
    ELSE
      UPDATE containers SET
        "vesselName" = COALESCE(p_snapshot->>'vesselName', "vesselName"),
        "imoNumber" = COALESCE(p_snapshot->>'imoNumber', "imoNumber"),
        "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        "updatedBy" = p_acting_user
      WHERE id = v_container.id;
      v_updated := array_append(v_updated, v_snapshot_container->>'containerNo');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'booking', to_jsonb(v_booking),
    'updatedContainerNos', to_jsonb(v_updated),
    'unmatchedContainerNos', to_jsonb(v_unmatched)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_unassigned_vehicle(
  p_vehicle_id BIGINT,
  p_booking_id BIGINT,
  p_container_no TEXT,
  p_type TEXT,
  p_acting_user TEXT
) RETURNS containers AS $$
DECLARE
  v_vehicle unassigned_vehicles;
  v_container containers;
  v_notes TEXT;
BEGIN
  SELECT * INTO v_vehicle FROM unassigned_vehicles WHERE id = p_vehicle_id;
  IF v_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'Atanmayan araç kaydı bulunamadı.';
  END IF;

  v_notes := NULLIF(TRIM(BOTH ' | ' FROM
    CONCAT_WS(' | ', v_vehicle.notes, CASE WHEN v_vehicle.agent IS NOT NULL THEN 'Acente: ' || v_vehicle.agent END)
  ), '');

  INSERT INTO containers (
    "bookingId", "containerNo", type, "sealNo", "truckPlate", "trailerPlate",
    "driverPhone", "vesselName", "imoNumber", "mmsiNumber", notes, "createdBy", "updatedBy"
  ) VALUES (
    p_booking_id, COALESCE(p_container_no, v_vehicle."containerNo"), p_type, v_vehicle."sealNo",
    v_vehicle."truckPlate", NULL, v_vehicle."driverPhone", NULL, NULL, NULL, v_notes,
    p_acting_user, p_acting_user
  ) RETURNING * INTO v_container;

  DELETE FROM unassigned_vehicles WHERE id = p_vehicle_id;
  RETURN v_container;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upsert_booking_lww(payload jsonb)
RETURNS bookings AS $$
DECLARE
  result bookings;
BEGIN
  INSERT INTO bookings (
    "bookingNo", "vesselDeparture", "declarationCutOff", "siCutOff", category, destination,
    line, pol, status, archived, notes, "blNumber", eta, etd, "blStatus", "freeTimeEnd",
    "lastCarrierSyncAt", "createdAt", "updatedAt", "createdBy", "updatedBy"
  )
  SELECT
    payload->>'bookingNo', payload->>'vesselDeparture', payload->>'declarationCutOff',
    payload->>'siCutOff', payload->>'category', payload->>'destination', payload->>'line',
    payload->>'pol', payload->>'status', (payload->>'archived')::boolean, payload->>'notes',
    payload->>'blNumber', payload->>'eta', payload->>'etd', payload->>'blStatus',
    payload->>'freeTimeEnd', payload->>'lastCarrierSyncAt',
    COALESCE(payload->>'createdAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    COALESCE(payload->>'updatedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    payload->>'createdBy', payload->>'updatedBy'
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
    "updatedBy" = EXCLUDED."updatedBy"
  WHERE EXCLUDED."updatedAt" > bookings."updatedAt"
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    SELECT * INTO result FROM bookings WHERE "bookingNo" = payload->>'bookingNo';
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
