-- Username/password auth + role & per-user permission model. Run once via the Supabase
-- SQL editor (same manual-run convention as 001-004), AFTER 001-004.
--
-- Security model (deliberately stricter than the existing 5 tables, which keep their
-- permissive "allow all for anon" policies untouched): RLS is enabled on all 3 new
-- tables below with NO policy created at all, so the anon key has ZERO direct access -
-- every read/write goes through a SECURITY DEFINER RPC function that re-verifies the
-- acting user's role server-side. This matters because the anon key is public/embedded
-- in the distributed app, so without this, any client could otherwise read password
-- hashes directly or self-promote to admin by writing to these tables directly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR')),
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  "updatedAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));

-- Default permission per role for a given action (OPERATOR only - ADMIN is hardcoded to
-- always-true in every RPC below and never consults this table).
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR')),
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (role, action)
);

-- Per-user override; presence of a row wins over the role default for that action.
CREATE TABLE IF NOT EXISTS user_permissions (
  "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  PRIMARY KEY ("userId", action)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies created above (default deny for anon) - access only via RPCs.

-- Internal helper, re-checked on every admin-only RPC below (defense-in-depth: the anon
-- key alone does not prove the caller is really the admin it claims to be).
CREATE OR REPLACE FUNCTION _assert_admin(p_acting_user_id BIGINT) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_acting_user_id AND "isActive" = true;
  IF v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Bu işlem için admin yetkisi gerekiyor.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_login(p_username TEXT, p_password TEXT) RETURNS JSONB AS $$
DECLARE
  v_user users;
BEGIN
  SELECT * INTO v_user FROM users WHERE lower(username) = lower(trim(p_username));
  IF v_user.id IS NULL OR v_user."passwordHash" <> crypt(p_password, v_user."passwordHash") THEN
    RAISE EXCEPTION 'Kullanıcı adı veya şifre hatalı.';
  END IF;
  IF NOT v_user."isActive" THEN
    RAISE EXCEPTION 'Kullanıcı hesabı pasif durumda.';
  END IF;
  RETURN jsonb_build_object(
    'id', v_user.id,
    'username', v_user.username,
    'displayName', v_user."displayName",
    'role', v_user.role,
    'mustChangePassword', v_user."mustChangePassword"
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTE: the 13-action list is duplicated here and in src/shared/types.ts
-- (PERMISSION_ACTIONS) - keep both in sync when adding/removing an action.
CREATE OR REPLACE FUNCTION rpc_get_permissions(p_user_id BIGINT) RETURNS JSONB AS $$
DECLARE
  v_role TEXT;
  v_actions TEXT[] := ARRAY['bookings.manage','containers.manage','documents.manage',
    'excel.import','excel.export','reports.manage','dashboard.view','vessel_tracking.view',
    'archive.view','unassigned_vehicles.manage','carriers.manage','backup.manage','users.manage'];
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

CREATE OR REPLACE FUNCTION rpc_change_own_password(
  p_user_id BIGINT, p_old_password TEXT, p_new_password TEXT
) RETURNS VOID AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Yeni şifre en az 8 karakter olmalıdır.';
  END IF;
  SELECT "passwordHash" INTO v_hash FROM users WHERE id = p_user_id;
  IF v_hash IS NULL OR v_hash <> crypt(p_old_password, v_hash) THEN
    RAISE EXCEPTION 'Mevcut şifre hatalı.';
  END IF;
  UPDATE users SET
    "passwordHash" = crypt(p_new_password, gen_salt('bf')),
    "mustChangePassword" = false,
    "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_admin_list_users(p_acting_user_id BIGINT) RETURNS SETOF JSONB AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  RETURN QUERY
    SELECT jsonb_build_object(
      'id', id, 'username', username, 'displayName', "displayName", 'role', role,
      'mustChangePassword', "mustChangePassword", 'isActive', "isActive", 'createdAt', "createdAt"
    ) FROM users ORDER BY username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_admin_create_user(
  p_acting_user_id BIGINT, p_username TEXT, p_display_name TEXT, p_role TEXT, p_initial_password TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user users;
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF p_role NOT IN ('ADMIN', 'OPERATOR') THEN
    RAISE EXCEPTION 'Geçersiz rol.';
  END IF;
  IF length(p_initial_password) < 8 THEN
    RAISE EXCEPTION 'Şifre en az 8 karakter olmalıdır.';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(trim(p_username))) THEN
    RAISE EXCEPTION 'Bu kullanıcı adı zaten kullanılıyor.';
  END IF;
  INSERT INTO users (username, "passwordHash", "displayName", role, "mustChangePassword")
  VALUES (trim(p_username), crypt(p_initial_password, gen_salt('bf')), p_display_name, p_role, true)
  RETURNING * INTO v_user;
  RETURN jsonb_build_object(
    'id', v_user.id, 'username', v_user.username, 'displayName', v_user."displayName",
    'role', v_user.role, 'mustChangePassword', v_user."mustChangePassword",
    'isActive', v_user."isActive", 'createdAt', v_user."createdAt"
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_admin_set_password(
  p_acting_user_id BIGINT, p_target_user_id BIGINT, p_new_password TEXT
) RETURNS VOID AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Şifre en az 8 karakter olmalıdır.';
  END IF;
  UPDATE users SET
    "passwordHash" = crypt(p_new_password, gen_salt('bf')),
    "mustChangePassword" = true,
    "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;
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
  IF p_new_role NOT IN ('ADMIN', 'OPERATOR') THEN
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

CREATE OR REPLACE FUNCTION rpc_admin_set_active(
  p_acting_user_id BIGINT, p_target_user_id BIGINT, p_is_active BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_admin_count INT;
  v_target_role TEXT;
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  SELECT role INTO v_target_role FROM users WHERE id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;
  IF NOT p_is_active AND v_target_role = 'ADMIN' THEN
    SELECT count(*) INTO v_admin_count FROM users WHERE role = 'ADMIN' AND "isActive" = true;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Son aktif admin pasifleştirilemez.';
    END IF;
  END IF;
  UPDATE users SET "isActive" = p_is_active, "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  WHERE id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_admin_set_role_permission(
  p_acting_user_id BIGINT, p_role TEXT, p_action TEXT, p_allowed BOOLEAN
) RETURNS VOID AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF p_role = 'ADMIN' THEN
    RAISE EXCEPTION 'Admin rolünün yetkileri sabittir, değiştirilemez.';
  END IF;
  INSERT INTO role_permissions (role, action, allowed) VALUES (p_role, p_action, p_allowed)
  ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- p_allowed = NULL clears the override (reverts that user back to the role default).
CREATE OR REPLACE FUNCTION rpc_admin_set_user_permission(
  p_acting_user_id BIGINT, p_target_user_id BIGINT, p_action TEXT, p_allowed BOOLEAN
) RETURNS VOID AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF p_allowed IS NULL THEN
    DELETE FROM user_permissions WHERE "userId" = p_target_user_id AND action = p_action;
  ELSE
    INSERT INTO user_permissions ("userId", action, allowed) VALUES (p_target_user_id, p_action, p_allowed)
    ON CONFLICT ("userId", action) DO UPDATE SET allowed = EXCLUDED.allowed;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Read helpers for the admin UI matrices.
CREATE OR REPLACE FUNCTION rpc_admin_get_role_permissions(p_acting_user_id BIGINT, p_role TEXT) RETURNS JSONB AS $$
DECLARE
  v_actions TEXT[] := ARRAY['bookings.manage','containers.manage','documents.manage',
    'excel.import','excel.export','reports.manage','dashboard.view','vessel_tracking.view',
    'archive.view','unassigned_vehicles.manage','carriers.manage','backup.manage','users.manage'];
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
    'archive.view','unassigned_vehicles.manage','carriers.manage','backup.manage','users.manage'];
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

-- Seed: 5 initial users, shared temporary password, forced change on first login.
INSERT INTO users (username, "passwordHash", "displayName", role, "mustChangePassword") VALUES
  ('taylan.ertas', crypt('Palm2026!', gen_salt('bf')), 'Taylan ERTAŞ', 'ADMIN', true),
  ('hasan.kumoglu', crypt('Palm2026!', gen_salt('bf')), 'Hasan Can KUMOĞLU', 'ADMIN', true),
  ('serkan.beke', crypt('Palm2026!', gen_salt('bf')), 'Serkan BEKE', 'OPERATOR', true),
  ('merve.gokce', crypt('Palm2026!', gen_salt('bf')), 'Merve Tuğçe GÖKÇE', 'OPERATOR', true),
  ('halil.koyuncu', crypt('Palm2026!', gen_salt('bf')), 'Halil İbrahim KOYUNCU', 'OPERATOR', true)
ON CONFLICT DO NOTHING;

-- OPERATOR role defaults: everything allowed except user management.
INSERT INTO role_permissions (role, action, allowed) VALUES
  ('OPERATOR', 'bookings.manage', true),
  ('OPERATOR', 'containers.manage', true),
  ('OPERATOR', 'documents.manage', true),
  ('OPERATOR', 'excel.import', true),
  ('OPERATOR', 'excel.export', true),
  ('OPERATOR', 'reports.manage', true),
  ('OPERATOR', 'dashboard.view', true),
  ('OPERATOR', 'vessel_tracking.view', true),
  ('OPERATOR', 'archive.view', true),
  ('OPERATOR', 'unassigned_vehicles.manage', true),
  ('OPERATOR', 'carriers.manage', true),
  ('OPERATOR', 'backup.manage', true),
  ('OPERATOR', 'users.manage', false)
ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;
