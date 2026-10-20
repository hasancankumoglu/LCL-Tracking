-- Customer rolünün booking listesini Excel'e aktarabilmesi için tek satırlık güncelleme.
-- (008_customer_management.sql'de CUSTOMER için excel.export=false seed edilmişti - bu
-- değiştirildi; zaten uygulanmış projelerde bu dosya ayrıca çalıştırılmalı.)
--
-- Güvenlik notu: exportToExcel() listBookings(true) kullanır, bu da CUSTOMER oturumları
-- için zaten sadece kendi müşterisine ait bookinglerle sınırlandırılmış durumda
-- (src/main/db/repositories.ts) - yani Customer sadece KENDİ bookinglerini dışa
-- aktarabilir, başka müşterilerin verisi sızmaz.
INSERT INTO role_permissions (role, action, allowed) VALUES
  ('CUSTOMER', 'excel.export', true)
ON CONFLICT (role, action) DO UPDATE SET allowed = EXCLUDED.allowed;
