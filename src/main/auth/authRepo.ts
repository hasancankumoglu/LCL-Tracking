import { randomBytes } from 'crypto'
import { getSupabase } from '../db/schema'
import { setSession, clearSession, getSession } from './session'
import { mt } from '../i18n/language'
import type {
  AppUser,
  AuthenticatedUser,
  PermissionAction,
  PermissionMap,
  UserContact,
  UserCreateInput,
  UserDirectoryEntry,
  UserPermissionsMap,
  UserRole
} from '../../shared/types'

const PASSWORD_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/** Node `crypto.randomBytes` (OWASP-safe) ile, karışabilecek karakterler (0/O/1/l/I) hariç rastgele şifre üretir. */
export function generateRandomPassword(length = 12): string {
  const bytes = randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += PASSWORD_CHARSET[bytes[i] % PASSWORD_CHARSET.length]
  }
  return result
}

export function requireActingUserId(): number {
  const session = getSession()
  if (!session) throw new Error(mt('errors.notLoggedIn'))
  return session.id
}

export async function login(username: string, password: string): Promise<AuthenticatedUser> {
  const supabase = getSupabase()
  const { data: profile, error: loginError } = await supabase.rpc('rpc_login', {
    p_username: username,
    p_password: password
  })
  if (loginError) throw new Error(loginError.message)

  const { data: permissions, error: permError } = await supabase.rpc('rpc_get_permissions', {
    p_user_id: profile.id
  })
  if (permError) throw new Error(permError.message)

  const user: AuthenticatedUser = {
    ...(profile as AppUser),
    permissions: permissions as PermissionMap
  }
  setSession(user)
  return user
}

export function logout(): void {
  clearSession()
}

export async function changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
  const session = getSession()
  if (!session) throw new Error('Oturum açılmamış.')
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_change_own_password', {
    p_user_id: session.id,
    p_old_password: oldPassword,
    p_new_password: newPassword
  })
  if (error) throw new Error(error.message)
  setSession({ ...session, mustChangePassword: false })
}

export async function listUsers(): Promise<AppUser[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('rpc_admin_list_users', {
    p_acting_user_id: requireActingUserId()
  })
  if (error) throw new Error(error.message)
  return data as AppUser[]
}

export async function createUser(input: UserCreateInput): Promise<AppUser> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('rpc_admin_create_user', {
    p_acting_user_id: requireActingUserId(),
    p_username: input.username,
    p_display_name: input.displayName,
    p_email: input.email,
    p_role: input.role,
    p_initial_password: input.initialPassword
  })
  if (error) throw new Error(error.message)
  return data as AppUser
}

export async function setUserEmail(targetUserId: number, email: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_admin_set_email', {
    p_acting_user_id: requireActingUserId(),
    p_target_user_id: targetUserId,
    p_email: email
  })
  if (error) throw new Error(error.message)
}

/** Booking listesindeki "Kullanıcı" kolonunda ad-soyad göstermek için - e-posta döndürmez, admin yetkisi gerektirmez. */
export async function listUserDirectory(): Promise<UserDirectoryEntry[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('rpc_list_user_directory')
  if (error) throw new Error(error.message)
  return data as UserDirectoryEntry[]
}

/** Booking operatörüne mail göndermek için: kullanıcı adına göre ad-soyad + e-posta. */
export async function getUserContact(username: string): Promise<UserContact | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('rpc_get_user_contact', { p_username: username })
  if (error) throw new Error(error.message)
  return (data as UserContact | null) ?? null
}

/** Rastgele yeni bir şifre üretir, sunucuda hash'ler ve bir daha gösterilmemek üzere düz metin olarak döner. */
export async function regeneratePassword(targetUserId: number): Promise<string> {
  const newPassword = generateRandomPassword()
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_admin_set_password', {
    p_acting_user_id: requireActingUserId(),
    p_target_user_id: targetUserId,
    p_new_password: newPassword
  })
  if (error) throw new Error(error.message)
  return newPassword
}

export async function updateUserRole(targetUserId: number, role: UserRole): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_admin_update_role', {
    p_acting_user_id: requireActingUserId(),
    p_target_user_id: targetUserId,
    p_new_role: role
  })
  if (error) throw new Error(error.message)
}

export async function setUserActive(targetUserId: number, isActive: boolean): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_admin_set_active', {
    p_acting_user_id: requireActingUserId(),
    p_target_user_id: targetUserId,
    p_is_active: isActive
  })
  if (error) throw new Error(error.message)
}

export async function getRolePermissions(role: UserRole): Promise<PermissionMap> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('rpc_admin_get_role_permissions', {
    p_acting_user_id: requireActingUserId(),
    p_role: role
  })
  if (error) throw new Error(error.message)
  return data as PermissionMap
}

export async function setRolePermission(
  role: UserRole,
  action: PermissionAction,
  allowed: boolean
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_admin_set_role_permission', {
    p_acting_user_id: requireActingUserId(),
    p_role: role,
    p_action: action,
    p_allowed: allowed
  })
  if (error) throw new Error(error.message)
}

export async function getUserPermissions(targetUserId: number): Promise<UserPermissionsMap> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('rpc_admin_get_user_permissions', {
    p_acting_user_id: requireActingUserId(),
    p_target_user_id: targetUserId
  })
  if (error) throw new Error(error.message)
  return data as UserPermissionsMap
}

/** `allowed=null` kişiye özel istisnayı kaldırır, kullanıcı tekrar rol varsayılanına döner. */
export async function setUserPermission(
  targetUserId: number,
  action: PermissionAction,
  allowed: boolean | null
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('rpc_admin_set_user_permission', {
    p_acting_user_id: requireActingUserId(),
    p_target_user_id: targetUserId,
    p_action: action,
    p_allowed: allowed
  })
  if (error) throw new Error(error.message)
}
