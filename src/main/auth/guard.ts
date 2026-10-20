import type { PermissionAction } from '../../shared/types'
import { hasPermission, getSession } from './session'
import { mt } from '../i18n/language'

/** İlgili ipcMain.handle callback'inin en başında çağrılır; yetkisizse işlemi durdurur. */
export function requirePermission(action: PermissionAction): void {
  if (!hasPermission(action)) {
    throw new Error(mt('errors.notAuthorized'))
  }
}

/** Sadece Admin rolüne izin verilen uçlar için (ör. müşteri yönetimi) - renderer tarafındaki gösterimden bağımsız sunucu tarafı kontrol. */
export function requireAdmin(): void {
  if (getSession()?.role !== 'ADMIN') {
    throw new Error(mt('errors.notAuthorized'))
  }
}
