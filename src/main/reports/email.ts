import { shell } from 'electron'
import type { EmailSendResult } from '../../shared/types'

/**
 * İşletim sisteminin varsayılan e-posta uygulamasında (ör. Yeni Outlook, Windows Mail)
 * konusu (rapor adı) ve gövdesi (rapor içeriği) önceden doldurulmuş yeni bir e-posta
 * penceresi açar. `to` verilirse alıcı da önceden doldurulur, verilmezse alıcı boş
 * bırakılır ve kullanıcı alıcıyı doğrudan mail uygulamasında girer.
 * `mailto:` protokolü yalnızca düz metin gövde destekler (gerçek HTML render edilmez);
 * satır sonlarının doğru görüntülenmesi için CRLF (`\r\n`) kullanılır.
 */
export async function openMailWithReport(
  subject: string,
  reportText: string,
  to?: string | null
): Promise<EmailSendResult> {
  try {
    const body = reportText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
    const recipient = to ? encodeURIComponent(to) : ''
    const mailto = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    await shell.openExternal(mailto)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
