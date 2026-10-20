import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

interface AuthConfig {
  /** "Beni Hatırla" işaretliyse hatırlanan kullanıcı adı (şifre asla saklanmaz). */
  rememberedUsername: string | null
}

const DEFAULT_CONFIG: AuthConfig = { rememberedUsername: null }

function getConfigPath(): string {
  return join(app.getPath('userData'), 'auth-config.json')
}

function getAuthConfig(): AuthConfig {
  const path = getConfigPath()
  if (!existsSync(path)) return { ...DEFAULT_CONFIG }
  try {
    const raw = readFileSync(path, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function saveAuthConfig(config: AuthConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function getRememberedUsername(): string | null {
  return getAuthConfig().rememberedUsername
}

export function setRememberedUsername(username: string | null): void {
  saveAuthConfig({ rememberedUsername: username })
}
