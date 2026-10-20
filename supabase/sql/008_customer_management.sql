-- Müşteri Yönetimi + CUSTOMER rolü. Run once via the Supabase SQL editor, AFTER 001-007
-- (007_operation_manager_and_pending_deletions.sql must be run first - same manual-run
-- convention as all earlier migrations).
--
-- CUSTOMER rolü, mevcut role_permissions/rpc_get_permissions sistemine ekstra kod
-- gerektirmeden oturur: dashboard.view=true, diğer tüm action'lar=false olarak seed
-- edilir - bu tek başına BOOKINGS_CREATE/UPDATE/DELETE/ARCHIVE, CONTAINERS_*,
-- DOCUMENTS_* gibi tüm yazma uçlarını zaten var olan requirePermission() kontrolleriyle
-- engeller. Booking/konteyner/döküman okuma tarafındaki "sadece kendi müşterisine ait"
-- kısıtı ise src/main/db/repositories.ts'te (listBookings/getBooking/
-- listContainersByBooking/listDocumentsByBooking) session.customerId'ye göre uygulanır.

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "taxNo" TEXT NOT NULL,
  name TEXT NOT NULL,
  "taxOffice" TEXT NOT NULL,
  address TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  "createdAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  "updatedAt" TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_taxno_lower ON customers (lower("taxNo"));

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_allow_all ON customers;
CREATE POLICY customers_allow_all ON customers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE users ADD COLUMN IF NOT EXISTS "customerId" BIGINT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "customerId" BIGINT REFERENCES customers(id) ON DELETE SET NULL;
-- booking_with_stats (001_init.sql) does "SELECT b.*" - Postgres views do NOT auto-pick-up
-- new columns added to the underlying table after the view was created, so this new
-- column won't be visible through the view until it's refreshed - see
-- 009_refresh_booking_with_stats_view.sql (must be run right after this file).

-- 1) Widen the role CHECK constraints to allow 'CUSTOMER' (same dynamic lookup pattern
--    as 007, in case the constraint name differs across environments).
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
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('ADMIN', 'OPERATOR', 'OPERATION_MANAGER', 'CUSTOMER'));
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
  ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check
    CHECK (role IN ('ADMIN', 'OPERATOR', 'OPERATION_MANAGER', 'CUSTOMER'));
END;
$$;

-- NOTE: rpc_admin_create_user / rpc_admin_update_role role-validation lists are
-- DELIBERATELY left unchanged (still only 'ADMIN'/'OPERATOR'/'OPERATION_MANAGER') - a
-- CUSTOMER-role user can ONLY be created via rpc_create_customer_with_user below, which
-- always sets "customerId" correctly. This prevents an admin from accidentally creating
-- an orphaned CUSTOMER user (no linked customer row) via the generic user-admin screens.

-- 2) rpc_login: add customerId to the response (also opportunistically fixes a
--    pre-existing gap - email was never returned here even though AppUser.email exists).
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
    'email', v_user.email,
    'role', v_user.role,
    'customerId', v_user."customerId",
    'mustChangePassword', v_user."mustChangePassword"
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) rpc_admin_list_users: add customerId for AppUser type completeness.
CREATE OR REPLACE FUNCTION rpc_admin_list_users(p_acting_user_id BIGINT) RETURNS SETOF JSONB AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  RETURN QUERY
    SELECT jsonb_build_object(
      'id', id, 'username', username, 'displayName', "displayName", 'email', email, 'role', role,
      'customerId', "customerId", 'mustChangePassword', "mustChangePassword",
      'isActive', "isActive", 'createdAt', "createdAt"
    ) FROM users ORDER BY username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) rpc_admin_set_role_permission: also lock CUSTOMER's permissions (not just ADMIN's) -
--    otherwise an admin could toggle e.g. bookings.manage=true for CUSTOMER via the Role
--    Defaults UI, which would let every customer edit/delete ANY booking globally (write
--    IPC handlers only check the permission flag, not row ownership).
CREATE OR REPLACE FUNCTION rpc_admin_set_role_permission(
  p_acting_user_id BIGINT, p_role TEXT, p_action TEXT, p_allowed BOOLEAN
) RETURNS VOID AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF p_role IN ('ADMIN', 'CUSTOMER') THEN
    RAISE EXCEPTION 'Bu rolün yetkileri sabittir, değiştirilemez.';
  END IF;
  INSERT INTO role_permissions (role, action, allowed) VALUES (p_role, p_action, p_allowed)
  ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Atomic customer+login creation - rolls back both inserts together on any failure.
CREATE OR REPLACE FUNCTION rpc_create_customer_with_user(
  p_acting_user_id BIGINT,
  p_tax_no TEXT,
  p_name TEXT,
  p_tax_office TEXT,
  p_address TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_initial_password TEXT
) RETURNS JSONB AS $$
DECLARE
  v_customer customers;
  v_user users;
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  IF length(p_initial_password) < 8 THEN
    RAISE EXCEPTION 'Şifre en az 8 karakter olmalıdır.';
  END IF;
  IF EXISTS (SELECT 1 FROM customers WHERE lower("taxNo") = lower(trim(p_tax_no))) THEN
    RAISE EXCEPTION 'Bu vergi numarası zaten kayıtlı.';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'Bu e-posta adresi zaten bir kullanıcı hesabı için kullanılıyor.';
  END IF;

  INSERT INTO customers ("taxNo", name, "taxOffice", address, email, phone)
  VALUES (
    trim(p_tax_no), trim(p_name), trim(p_tax_office),
    nullif(trim(p_address), ''), trim(p_email), nullif(trim(p_phone), '')
  )
  RETURNING * INTO v_customer;

  INSERT INTO users (username, "passwordHash", "displayName", email, role, "mustChangePassword", "customerId")
  VALUES (
    trim(p_email), crypt(p_initial_password, gen_salt('bf')), trim(p_name),
    trim(p_email), 'CUSTOMER', true, v_customer.id
  )
  RETURNING * INTO v_user;

  RETURN jsonb_build_object(
    'customer', jsonb_build_object(
      'id', v_customer.id, 'taxNo', v_customer."taxNo", 'name', v_customer.name,
      'taxOffice', v_customer."taxOffice", 'address', v_customer.address,
      'email', v_customer.email, 'phone', v_customer.phone,
      'createdAt', v_customer."createdAt", 'updatedAt', v_customer."updatedAt"
    ),
    'username', v_user.username,
    'password', p_initial_password
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) Delete a customer: deactivate the linked login (keep it, don't delete it) then
--    remove the customer row - bookings.customerId auto-unlinks via ON DELETE SET NULL.
CREATE OR REPLACE FUNCTION rpc_delete_customer(p_acting_user_id BIGINT, p_customer_id BIGINT) RETURNS VOID AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  UPDATE users SET
    "isActive" = false,
    "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  WHERE "customerId" = p_customer_id;
  DELETE FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Müşteri bulunamadı.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7) CUSTOMER role defaults: dashboard.view=true and excel.export=true (can export their
-- own, already-scoped booking list - see 010_customer_excel_export.sql for the note on
-- why this is safe), everything else explicitly false.
INSERT INTO role_permissions (role, action, allowed) VALUES
  ('CUSTOMER', 'dashboard.view', true),
  ('CUSTOMER', 'bookings.manage', false),
  ('CUSTOMER', 'containers.manage', false),
  ('CUSTOMER', 'documents.manage', false),
  ('CUSTOMER', 'excel.import', false),
  ('CUSTOMER', 'excel.export', true),
  ('CUSTOMER', 'reports.manage', false),
  ('CUSTOMER', 'vessel_tracking.view', false),
  ('CUSTOMER', 'archive.view', false),
  ('CUSTOMER', 'unassigned_vehicles.manage', false),
  ('CUSTOMER', 'carriers.manage', false),
  ('CUSTOMER', 'backup.manage', false),
  ('CUSTOMER', 'users.manage', false),
  ('CUSTOMER', 'bookings.delete_direct', false),
  ('CUSTOMER', 'pending_deletions.manage', false)
ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;
