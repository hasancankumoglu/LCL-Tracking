export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('tr-TR')
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
