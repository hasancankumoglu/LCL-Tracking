/** Dosya sistemi hatalarını (EIO/EACCES/EPERM/EBUSY) kullanıcıya anlaşılır Türkçe mesajlara çevirir. */
export function describeFsError(err: unknown, contextPath?: string): string {
  const code = (err as NodeJS.ErrnoException)?.code
  const location = contextPath ? ` (${contextPath})` : ''
  switch (code) {
    case 'EIO':
      return `Dosya okuma/yazma hatası (I/O)${location}. Dosya bir bulut senkronizasyon klasöründeyse (OneDrive/Google Drive vb.) önce yerel bir klasöre kopyalayıp tekrar deneyin.`
    case 'EACCES':
    case 'EPERM':
      return `Yetki hatası${location}. Bu klasöre yazma izniniz engellenmiş olabilir - antivirüs, OneDrive veya Windows Güvenliği'ndeki "Denetimli Klasör Erişimi" (Controlled Folder Access / fidye yazılımı koruması) bu uygulamanın yazmasını engelliyor olabilir. Windows Güvenliği > Virüs ve tehdit koruması > Fidye yazılımı korumasından bu uygulamaya izin vermeyi deneyin.`
    case 'EBUSY':
      return `Dosya/klasör şu anda kullanımda${location}. Lütfen ilgili dosyaları kapatıp tekrar deneyin.`
    case 'ENOENT':
      return `Dosya veya klasör bulunamadı${location}.`
    default:
      return err instanceof Error ? err.message : String(err)
  }
}
