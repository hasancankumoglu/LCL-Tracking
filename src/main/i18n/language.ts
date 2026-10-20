import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { translate } from '../../shared/locales/translate'
import trResources from '../../shared/locales/tr'
import enResources from '../../shared/locales/en'
import type { Language } from '../../shared/types'

function getConfigPath(): string {
  return join(app.getPath('userData'), 'ui-language.json')
}

let cachedLanguage: Language | null = null

function readPersistedLanguage(): Language {
  const path = getConfigPath()
  if (!existsSync(path)) return 'tr'
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { language?: string }
    return raw.language === 'en' ? 'en' : 'tr'
  } catch {
    return 'tr'
  }
}

/** Current UI language, cached in memory after the first read (set at app startup). */
export function getLanguage(): Language {
  if (cachedLanguage === null) cachedLanguage = readPersistedLanguage()
  return cachedLanguage
}

export function setLanguage(language: Language): void {
  cachedLanguage = language
  writeFileSync(getConfigPath(), JSON.stringify({ language }, null, 2), 'utf-8')
}

/** Main-process translation helper - reads the currently persisted/cached language. */
export function mt(key: string, params?: Record<string, string | number>): string {
  const dict = getLanguage() === 'en' ? enResources : trResources
  return translate(dict, key, params)
}

/** Locale tag for `Date#toLocaleDateString`/`toLocaleString`, matching the current UI language. */
export function getDateLocale(): string {
  return getLanguage() === 'en' ? 'en-GB' : 'tr-TR'
}

/** Always-Turkish translation - used where output must stay Turkish regardless of UI language (e.g. Excel import parsing). */
export function mtTr(key: string, params?: Record<string, string | number>): string {
  return translate(trResources, key, params)
}
