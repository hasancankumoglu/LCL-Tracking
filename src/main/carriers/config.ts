import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { CarrierName } from '../../shared/types'

interface StoredCredential {
  consumerKey: string
  /** Base64. safeStorage kullanılabiliyorsa (Windows DPAPI vb.) şifreli, değilse düz base64. */
  consumerSecretEncrypted: string
}

type CredentialsFile = Partial<Record<CarrierName, StoredCredential>>

function getConfigPath(): string {
  return join(app.getPath('userData'), 'carrier-credentials.json')
}

function readConfigFile(): CredentialsFile {
  const path = getConfigPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as CredentialsFile
  } catch {
    return {}
  }
}

function writeConfigFile(data: CredentialsFile): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf-8')
}

/** Consumer-Key/Secret'ı kalıcı olarak (mümkünse OS düzeyinde şifrelenmiş) saklar. */
export function setCarrierCredentials(
  carrier: CarrierName,
  consumerKey: string,
  consumerSecret: string
): void {
  const data = readConfigFile()
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(consumerSecret).toString('base64')
    : Buffer.from(consumerSecret, 'utf-8').toString('base64')
  data[carrier] = { consumerKey, consumerSecretEncrypted: encrypted }
  writeConfigFile(data)
}

export function getCarrierCredentials(
  carrier: CarrierName
): { consumerKey: string; consumerSecret: string } | null {
  const entry = readConfigFile()[carrier]
  if (!entry) return null
  try {
    const buf = Buffer.from(entry.consumerSecretEncrypted, 'base64')
    const consumerSecret = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf-8')
    return { consumerKey: entry.consumerKey, consumerSecret }
  } catch {
    return null
  }
}

export function hasCarrierCredentials(carrier: CarrierName): boolean {
  return getCarrierCredentials(carrier) !== null
}

export function clearCarrierCredentials(carrier: CarrierName): void {
  const data = readConfigFile()
  delete data[carrier]
  writeConfigFile(data)
}
