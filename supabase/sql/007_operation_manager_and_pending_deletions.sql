-- Operation Manager rolü + booking silme onay akışı. Run once via the Supabase SQL editor,
-- AFTER 001-006 (same manual-run convention as the earlier migrations).
--
-- Adds a 3rd role (OPERATION_MANAGER) that, like ADMIN, can delete bookings directly and
-- can approve/reject pending deletion requests. Plain OPERATOR users now have their booking
-- deletions routed through a new `pending_booking_deletions` table instead of deleting
-- immediately - see src/main/ipc/handlers.ts BOOKINGS_DELETE for the branching logic.

-- 1) Widen the role CHECK constraints to allow 'OPERATION_MANAGER'. Constraint names are
--    looked up dynamically (not hardcoded) since they were auto-named by Postgres when the
--    original inline CHECK was declared in 005_auth_and_permissions.sql.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'users' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%role%ADMIN%OPERATOR%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', v_constraint_name);
  END IF;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'OPERATOR', 'OPERATION_MANAGER'));
END;
$$;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'role_permissions' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%role%ADMIN%OPERATOR%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE role_permissions DROP CONSTRAINT %I', v_constraint_name);
  END IF;
  ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN ('ADMIN', 'OPERATOR', 'OPERATION_MANAGER'));
END;
$$;

-- 2) Re-validate role lists in the user-admin RPCs (same signatures as last defined in
--    006_add_user_email.sql, now widened to accept 'OPERATION_MANAGER').
CREATE OR REPLACE FUNCTION rpc_admin_create_user(
  p_acting_user_id BIGINT, p_username TEXT, p_display_name TEXT, p_email TEXT, p_role TEXT, p_initial_password TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user users;
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF p_role NOT IN ('ADMIN', 'OPERATOR', 'OPERATION_MANAGER') THEN
    RAISE EXCEPTION 'Geçersiz rol.';
  END IF;
  IF length(p_initial_password) < 8 THEN
    RAISE EXCEPTION 'Şifre en az 8 karakter olmalıdır.';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(trim(p_username))) THEN
    RAISE EXCEPTION 'Bu kullanıcı adı zaten kullanılıyor.';
  END IF;
  INSERT INTO users (username, "passwordHash", "displayName", email, role, "mustChangePassword")
  VALUES (trim(p_username), crypt(p_initial_password, gen_salt('bf')), p_display_name, trim(p_email), p_role, true)
  RETURNING * INTO v_user;
  RETURN jsonb_build_object(
    'id', v_user.id, 'username', v_user.username, 'displayName', v_user."displayName",
    'email', v_user.email, 'role', v_user.role, 'mustChangePassword', v_user."mustChangePassword",
    'isActive', v_user."isActive", 'createdAt', v_user."createdAt"
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_admin_update_role(
  p_acting_user_id BIGINT, p_target_user_id BIGINT, p_new_role TEXT
) RETURNS VOID AS $$
DECLARE
  v_admin_count INT;
  v_current_role TEXT;
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF p_new_role NOT IN ('ADMIN', 'OPERATOR', 'OPERATION_MANAGER') THEN
    RAISE EXCEPTION 'Geçersiz rol.';
  END IF;
  SELECT role INTO v_current_role FROM users WHERE id = p_target_user_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;
  IF v_current_role = 'ADMIN' AND p_new_role <> 'ADMIN' THEN
    SELECT count(*) INTO v_admin_count FROM users WHERE role = 'ADMIN' AND "isActive" = true;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Son admin kullanıcının rolü değiştirilemez.';
    END IF;
  END IF;
  UPDATE users SET role = p_new_role, "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  WHERE id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Extend the permission-action list consulted by the permission RPCs with the 2 new
--    actions (bookings.delete_direct, pending_deletions.manage). Keep in sync with
--    src/shared/types.ts PERMISSION_ACTIONS.
CREATE OR REPLACE FUNCTION rpc_get_permissions(p_user_id BIGINT) RETURNS JSONB AS $$
DECLARE
  v_role TEXT;
  v_actions TEXT[] := ARRAY['bookings.manage','containers.manage','documents.manage',
    'excel.import','excel.export','reports.manage','dashboard.view','vessel_tracking.view',
    'archive.view','unassigned_vehicles.manage','carriers.manage','backup.manage','users.manage',
    'bookings.delete_direct','pending_deletions.manage'];
  v_action TEXT;
  v_result JSONB := '{}'::JSONB;
  v_role_default BOOLEAN;
  v_override BOOLEAN;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;

  IF v_role = 'ADMIN' THEN
    FOREACH v_action IN ARRAY v_actions LOOP
      v_result := v_result || jsonb_build_object(v_action, true);
    END LOOP;
    RETURN v_result;
  END IF;

  FOREACH v_action IN ARRAY v_actions LOOP
    v_override := NULL;
    v_role_default := NULL;
    SELECT allowed INTO v_override FROM user_permissions WHERE "userId" = p_user_id AND action = v_action;
    IF v_override IS NOT NULL THEN
      v_result := v_result || jsonb_build_object(v_action, v_override);
    ELSE
      SELECT allowed INTO v_role_default FROM role_permissions WHERE role = v_role AND action = v_action;
      v_result := v_result || jsonb_build_object(v_action, COALESCE(v_role_default, false));
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_admin_get_role_permissions(p_acting_user_id BIGINT, p_role TEXT) RETURNS JSONB AS $$
DECLARE
  v_actions TEXT[] := ARRAY['bookings.manage','containers.manage','documents.manage',
    'excel.import','excel.export','reports.manage','dashboard.view','vessel_tracking.view',
    'archive.view','unassigned_vehicles.manage','carriers.manage','backup.manage','users.manage',
    'bookings.delete_direct','pending_deletions.manage'];
  v_action TEXT;
  v_result JSONB := '{}'::JSONB;
  v_allowed BOOLEAN;
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  FOREACH v_action IN ARRAY v_actions LOOP
    v_allowed := NULL;
    SELECT allowed INTO v_allowed FROM role_permissions WHERE role = p_role AND action = v_action;
    v_result := v_result || jsonb_build_object(v_action, COALESCE(v_allowed, p_role = 'ADMIN'));
  END LOOP;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_admin_get_user_permissions(p_acting_user_id BIGINT, p_target_user_id BIGINT) RETURNS JSONB AS $$
DECLARE
  v_actions TEXT[] := ARRAY['bookings.manage','containers.manage','documents.manage',
    'excel.import','excel.export','reports.manage','dashboard.view','vessel_tracking.view',
    'archive.view','unassigned_vehicles.manage','carriers.manage','backup.manage','users.manage',
    'bookings.delete_direct','pending_deletions.manage'];
  v_action TEXT;
  v_role TEXT;
  v_result JSONB := '{}'::JSONB;
  v_role_default BOOLEAN;
  v_override BOOLEAN;
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  SELECT role INTO v_role FROM users WHERE id = p_target_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;
  FOREACH v_action IN ARRAY v_actions LOOP
    v_role_default := NULL;
    v_override := NULL;
    SELECT allowed INTO v_role_default FROM role_permissions WHERE role = v_role AND action = v_action;
    SELECT allowed INTO v_override FROM user_permissions WHERE "userId" = p_target_user_id AND action = v_action;
    v_result := v_result || jsonb_build_object(v_action, jsonb_build_object(
      'roleDefault', COALESCE(v_role_default, v_role = 'ADMIN'),
      'override', v_override
    ));
  END LOOP;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Role defaults: OPERATION_MANAGER mirrors OPERATOR plus the 2 new approver-only actions.
--    OPERATOR explicitly gets the 2 new actions = false (cannot bypass approval or approve).
INSERT INTO role_permissions (role, action, allowed) VALUES
  ('OPERATION_MANAGER', 'bookings.manage', true),
  ('OPERATION_MANAGER', 'containers.manage', true),
  ('OPERATION_MANAGER', 'documents.manage', true),
  ('OPERATION_MANAGER', 'excel.import', true),
  ('OPERATION_MANAGER', 'excel.export', true),
  ('OPERATION_MANAGER', 'reports.manage', true),
  ('OPERATION_MANAGER', 'dashboard.view', true),
  ('OPERATION_MANAGER', 'vessel_tracking.view', true),
  ('OPERATION_MANAGER', 'archive.view', true),
  ('OPERATION_MANAGER', 'unassigned_vehicles.manage', true),
  ('OPERATION_MANAGER', 'carriers.manage', true),
  ('OPERATION_MANAGER', 'backup.manage', true),
  ('OPERATION_MANAGER', 'users.manage', false),
  ('OPERATION_MANAGER', 'bookings.delete_direct', true),
  ('OPERATION_MANAGER', 'pending_deletions.manage', true),
  ('OPERATOR', 'bookings.delete_direct', false),
  ('OPERATOR', 'pending_deletions.manage', false)
ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;

-- 5) Pending booking deletions - follows the same "business table" convention as
--    bookings/containers/documents (permissive RLS, authorization enforced in the Electron
--    main process via requirePermission), NOT the deny-all/RPC-only pattern used for
--    users/role_permissions/user_permissions above. No FK to bookings(id): the request row
--    must survive the booking's eventual deletion, so booking fields are snapshotted here.
CREATE TABLE IF NOT EXISTS pending_booking_deletions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "bookingId" BIGINT NOT NULL,
  "bookingNo" TEXT NOT NULL,
  "blNumber" TEXT,
  destination TEXT,
  line TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  "requestedBy" TEXT NOT NULL,
  "requestedAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  "decidedBy" TEXT,
  "decidedAt" TEXT,
  "requestNote" TEXT,
  "decisionNote" TEXT
);

-- Only one active (PENDING) request per booking at a time - the real race-safe guard behind
-- the "aynı booking için tekrar onaya gönderilemez" rule (app also pre-checks for a friendlier
-- error message, but this index is what actually prevents a race between two operators).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_deletion_active_per_booking
  ON pending_booking_deletions ("bookingId") WHERE status = 'PENDING';

ALTER TABLE pending_booking_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_booking_deletions_allow_all ON pending_booking_deletions;
CREATE POLICY pending_booking_deletions_allow_all ON pending_booking_deletions
  FOR ALL USING (true) WITH CHECK (true);

-- 6) Approve must delete the real booking row AND mark the request APPROVED atomically - the
--    one deliberate exception to the "no RPC for business tables" rule in this migration.
--    Reject/withdraw/create remain plain single-table calls from repositories.ts (no
--    atomicity concern there).
CREATE OR REPLACE FUNCTION rpc_approve_booking_deletion(p_request_id BIGINT, p_decided_by TEXT) RETURNS VOID AS $$
DECLARE
  v_request pending_booking_deletions;
BEGIN
  SELECT * INTO v_request FROM pending_booking_deletions WHERE id = p_request_id;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Silme talebi bulunamadı.';
  END IF;
  IF v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Bu talep hakkında zaten bir karar verilmiş.';
  END IF;
  DELETE FROM bookings WHERE id = v_request."bookingId";
  UPDATE pending_booking_deletions SET
    status = 'APPROVED',
    "decidedBy" = p_decided_by,
    "decidedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
