import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AuthenticatedUser, PermissionAction } from '@shared/types'

interface AuthContextValue {
  user: AuthenticatedUser | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  hasPermission: (action: PermissionAction) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)

  async function login(username: string, password: string): Promise<void> {
    const loggedIn = await window.api.auth.login(username, password)
    setUser(loggedIn)
  }

  async function logout(): Promise<void> {
    await window.api.auth.logout()
    setUser(null)
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await window.api.auth.changePassword(oldPassword, newPassword)
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev))
  }

  function hasPermission(action: PermissionAction): boolean {
    if (!user) return false
    if (user.role === 'ADMIN') return true
    return user.permissions[action] === true
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, changePassword, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context + hook colocated by design
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth, bir AuthProvider içinde kullanılmalıdır.')
  return ctx
}
