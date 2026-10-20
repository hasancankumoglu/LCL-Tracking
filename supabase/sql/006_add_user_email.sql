-- Kullanıcılara e-posta adresi ekler (booking listesinden operatöre doğrudan mail
-- göndermek için - artık uygulama kodunda sabit kodlanmış bir e-posta listesi yok).
-- Run once via the Supabase SQL editor, AFTER 001-005.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Mevcut operatörlerin e-posta adreslerini doldur (daha önce kodda sabit kodlanmıştı).
UPDATE users SET email = 'serkanbeke@plmmarine.com' WHERE lower(username) = 'serkan.beke' AND email IS NULL;
UPDATE users SET email = 'mervegokce@plmmarine.com' WHERE lower(username) = 'merve.gokce' AND email IS NULL;
UPDATE users SET email = 'halilibrahim@plmmarine.com' WHERE lower(username) = 'halil.koyuncu' AND email IS NULL;

-- Admin kullanıcı listesine email alanını ekler.
CREATE OR REPLACE FUNCTION rpc_admin_list_users(p_acting_user_id BIGINT) RETURNS SETOF JSONB AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  RETURN QUERY
    SELECT jsonb_build_object(
      'id', id, 'username', username, 'displayName', "displayName", 'email', email, 'role', role,
      'mustChangePassword', "mustChangePassword", 'isActive', "isActive", 'createdAt', "createdAt"
    ) FROM users ORDER BY username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Kullanıcı oluşturmada e-posta alanı zorunlu.
CREATE OR REPLACE FUNCTION rpc_admin_create_user(
  p_acting_user_id BIGINT, p_username TEXT, p_display_name TEXT, p_email TEXT, p_role TEXT, p_initial_password TEXT
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

-- Admin, bir kullanıcının e-postasını sonradan düzenleyebilir.
CREATE OR REPLACE FUNCTION rpc_admin_set_email(
  p_acting_user_id BIGINT, p_target_user_id BIGINT, p_email TEXT
) RETURNS VOID AS $$
BEGIN
  PERFORM _assert_admin(p_acting_user_id);
  UPDATE users SET email = trim(p_email), "updatedAt" = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Düşük hassasiyetli dizin: booking listesindeki "Kullanıcı" kolonunda ad-soyad göstermek
-- için herkese (admin yetkisi olmayan oturumlar dahil) açık - sadece kullanıcı adı/ad-soyad
-- döner, e-posta YOK.
CREATE OR REPLACE FUNCTION rpc_list_user_directory() RETURNS SETOF JSONB AS $$
BEGIN
  RETURN QUERY
    SELECT jsonb_build_object('username', username, 'displayName', "displayName")
    FROM users WHERE "isActive" = true ORDER BY username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Booking operatörüne mail göndermek için: kullanıcı adına göre ad-soyad + e-posta döner.
CREATE OR REPLACE FUNCTION rpc_get_user_contact(p_username TEXT) RETURNS JSONB AS $$
DECLARE
  v_user users;
BEGIN
  SELECT * INTO v_user FROM users WHERE lower(username) = lower(trim(p_username));
  IF v_user.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('displayName', v_user."displayName", 'email', v_user.email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
