import { app } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'

function resolveLogFilePath(): string {
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'app.log')
}

function timestamp(): string {
  return new Date().toISOString()
}

function writeLine(line: string): void {
  console.log(line)
  try {
    appendFileSync(resolveLogFilePath(), `${timestamp()} ${line}\n`, 'utf-8')
  } catch {
    // Log dosyasına yazılamıyorsa sessizce yok say - loglama uygulamayı çökertmemeli.
  }
}

export function logInfo(context: string, message: string): void {
  writeLine(`[INFO] [${context}] ${message}`)
}

/** Hatayı, hata kodunu ve varsa ek bağlamı (path'ler vb.) log dosyasına ve konsola yazar. */
export function logError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  const code = (err as NodeJS.ErrnoException)?.code
  const message = err instanceof Error ? err.message : String(err)
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ''
  writeLine(`[ERROR] [${context}]${code ? ` code=${code}` : ''} ${message}${extraStr}`)
}

/** Kullanıcıdan destek isterken paylaşabileceği log dosyasının tam yolu (klasörün var olduğundan emin olur). */
export function getLogFilePath(): string {
  return resolveLogFilePath()
}
