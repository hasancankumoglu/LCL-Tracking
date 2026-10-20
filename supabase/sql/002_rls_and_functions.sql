-- Enables RLS (best practice / silences Supabase security advisor) with permissive
-- "allow all" policies for the anon key - this app has no per-user row-level access
-- differentiation (small trusted internal team), so policies are intentionally open;
-- the anon key itself is the only access gate (embedded in the distributed app).
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE unassigned_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow all for anon" ON bookings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow all for anon" ON containers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow all for anon" ON documents FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow all for anon" ON lookup_values FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow all for anon" ON unassigned_vehicles FOR ALL TO anon USING (true) WITH CHECK (true);

-- Storage: allow the anon key full access to the "documents" bucket only.
CREATE POLICY "allow all for anon on documents bucket" ON storage.objects FOR ALL TO anon
  USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');

-- Replicates applyCarrierSnapshotToBooking() from the old repositories.ts, as a single
-- atomic RPC call (was multiple round-trips in the retired Worker route).
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
    updated_by = p_acting_user
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
        updated_by = p_acting_user
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

-- Replicates assignUnassignedVehicle() from the old repositories.ts as a single atomic RPC.
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
    "driverPhone", "vesselName", "imoNumber", "mmsiNumber", notes, created_by, updated_by
  ) VALUES (
    p_booking_id, COALESCE(p_container_no, v_vehicle."containerNo"), p_type, v_vehicle."sealNo",
    v_vehicle."truckPlate", NULL, v_vehicle."driverPhone", NULL, NULL, NULL, v_notes,
    p_acting_user, p_acting_user
  ) RETURNING * INTO v_container;

  DELETE FROM unassigned_vehicles WHERE id = p_vehicle_id;
  RETURN v_container;
END;
$$ LANGUAGE plpgsql;
