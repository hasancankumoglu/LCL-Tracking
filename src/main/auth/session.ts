import type { AuthenticatedUser, PermissionAction } from '../../shared/types'

/** Ana süreçte tutulan, o an giriş yapmış kullanıcının tekil (in-memory) oturum durumu. */
let currentSession: AuthenticatedUser | null = null

export function setSession(user: AuthenticatedUser): void {
  currentSession = user
}

export function clearSession(): void {
  currentSession = null
}

export function getSession(): AuthenticatedUser | null {
  return currentSession
}

/** Admin rolü her zaman tüm işlemlere yetkilidir (sabit, izin tablolarından bağımsız). */
export function hasPermission(action: PermissionAction): boolean {
  if (!currentSession) return false
  if (currentSession.role === 'ADMIN') return true
  return currentSession.permissions[action] === true
}
