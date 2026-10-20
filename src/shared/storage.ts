// Main ve preload süreçleri arasında paylaşılan Supabase Storage sabitleri/yardımcıları.
// Preload, senkron bir toFileUrl() API'si sunabilmek için bu dosyayı doğrudan kullanır
// (IPC round-trip'ine gerek kalmadan).
export const SUPABASE_URL = 'https://nkqfognrnayaiyzitrpo.supabase.co'
export const DOCUMENTS_BUCKET = 'documents'

/** Supabase Storage'daki göreli bir yolu, herkese açık (public) kalıcı bir URL'ye çevirir. */
export function toPublicUrl(storedPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${DOCUMENTS_BUCKET}/${storedPath}`
}
