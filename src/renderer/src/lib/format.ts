import i18n from '../i18n'

function dateLocale(): string {
  return i18n.language === 'en' ? 'en-GB' : 'tr-TR'
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(dateLocale())
}

/**
 * Electron'un `ipcRenderer.invoke` hatalarına eklediği "Error invoking remote method
 * '...':" ön ekini (ve varsa iç içe "Error:" tekrarını) temizleyip, ana süreçte
 * fırlatılan asıl hata mesajını döner.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback
  return (
    err.message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '') || fallback
  )
}

/**
 * Verilen telefon numarasından ("+90 555 123 45 67" gibi) doğrudan WhatsApp
 * sohbeti/araması başlatan bir wa.me linki oluşturur. Numarada rakam yoksa null döner.
 */
export function toWhatsAppLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(dateLocale())
}
