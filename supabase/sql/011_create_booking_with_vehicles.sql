-- Lock single assignments too, so they cannot race with a bulk assignment.
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
  SELECT * INTO v_vehicle FROM unassigned_vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF v_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'Vehicle is no longer available.' USING ERRCODE = 'UV002';
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

-- Booking creation and every vehicle assignment commit or roll back together.
CREATE OR REPLACE FUNCTION create_booking_with_vehicles(
  p_booking JSONB,
  p_vehicles JSONB,
  p_acting_user TEXT
) RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_vehicle JSONB;
  v_count INTEGER;
  v_locked INTEGER;
BEGIN
  IF p_vehicles IS NULL OR jsonb_typeof(p_vehicles) <> 'array' THEN
    RAISE EXCEPTION 'Invalid vehicle selection.' USING ERRCODE = 'UV001';
  END IF;
  v_count := jsonb_array_length(p_vehicles);
  IF v_count = 0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_vehicles) AS item
    WHERE (item->>'id') IS NULL OR (item->>'id')::BIGINT <= 0
      OR (item->>'type') IS NULL OR (item->>'type') NOT IN ('40RF', '40HC', '20DC')
  ) OR (
    SELECT COUNT(DISTINCT (item->>'id')::BIGINT) FROM jsonb_array_elements(p_vehicles) AS item
  ) <> v_count THEN
    RAISE EXCEPTION 'Invalid vehicle selection.' USING ERRCODE = 'UV001';
  END IF;
  IF COALESCE((p_booking->>'unit')::INTEGER, 0) < v_count THEN
    RAISE EXCEPTION 'Unit is below the selected vehicle count.' USING ERRCODE = 'UV003';
  END IF;

  PERFORM id FROM unassigned_vehicles
  WHERE id IN (SELECT (item->>'id')::BIGINT FROM jsonb_array_elements(p_vehicles) AS item)
  ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> v_count THEN
    RAISE EXCEPTION 'Some selected vehicles are no longer available.' USING ERRCODE = 'UV002';
  END IF;

  INSERT INTO bookings (
    "bookingNo", "vesselDeparture", "declarationCutOff", "siCutOff", category, destination,
    line, pol, status, archived, notes, unit, "blNumber", eta, etd, "blStatus", "freeTimeEnd",
    "lastCarrierSyncAt", "customerId", "createdBy", "updatedBy"
  ) VALUES (
    TRIM(p_booking->>'bookingNo'), p_booking->>'vesselDeparture', p_booking->>'declarationCutOff',
    p_booking->>'siCutOff', p_booking->>'category', p_booking->>'destination',
    p_booking->>'line', p_booking->>'pol', p_booking->>'status',
    COALESCE((p_booking->>'archived')::BOOLEAN, false), p_booking->>'notes',
    (p_booking->>'unit')::INTEGER, p_booking->>'blNumber', p_booking->>'eta',
    p_booking->>'etd', p_booking->>'blStatus', p_booking->>'freeTimeEnd',
    p_booking->>'lastCarrierSyncAt', (p_booking->>'customerId')::BIGINT,
    p_acting_user, p_acting_user
  ) RETURNING * INTO v_booking;

  FOR v_vehicle IN SELECT value FROM jsonb_array_elements(p_vehicles)
  LOOP
    PERFORM assign_unassigned_vehicle(
      (v_vehicle->>'id')::BIGINT, v_booking.id,
      NULLIF(TRIM(v_vehicle->>'containerNo'), ''), v_vehicle->>'type', p_acting_user
    );
  END LOOP;
  RETURN v_booking;
END;
$$ LANGUAGE plpgsql;
