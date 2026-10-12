import { shell } from 'electron'
import type { EmailSendResult } from '../../shared/types'

/**
 * İşletim sisteminin varsayılan e-posta uygulamasında (ör. Yeni Outlook, Windows Mail)
 * konusu (rapor adı) ve gövdesi (rapor içeriği) önceden doldurulmuş, alıcısı boş yeni
 * bir e-posta penceresi açar - kullanıcı alıcıyı doğrudan mail uygulamasında girer.
 * `mailto:` protokolü yalnızca düz metin gövde destekler (gerçek HTML render edilmez);
 * satır sonlarının doğru görüntülenmesi için CRLF (`\r\n`) kullanılır.
 */
export async function openMailWithReport(
  subject: string,
  reportText: string
): Promise<EmailSendResult> {
  try {
    const body = reportText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    await shell.openExternal(mailto)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
