import { getSession } from '../auth/session'

/** O an uygulamaya giriş yapmış kullanıcının kullanıcı adı - audit trail (createdBy/updatedBy) için. */
export function getCurrentUser(): string {
  return getSession()?.username ?? 'bilinmeyen-kullanici'
}
