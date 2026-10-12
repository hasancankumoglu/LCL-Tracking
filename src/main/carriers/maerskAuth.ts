import { getCarrierCredentials } from './config'

// Kaynak: https://developer.maersk.com/support/authorisation (Production Environment).
const TOKEN_URL = 'https://api.maersk.com/customer-identity/oauth/v2/access_token'

interface CachedToken {
  accessToken: string
  /** epoch ms, bu zamandan sonra token'ın süresi dolmuş sayılır. */
  expiresAt: number
}

let cachedToken: CachedToken | null = null

interface TokenResponse {
  access_token: string
  expires_in?: number
}

/**
 * Maersk OAuth 2.0 client_credentials access token'ı döner. Token bellekte
 * cache'lenir ve süresi dolmadan (2 saat, 60sn güvenlik payı ile) yeniden
 * kullanılır; süresi dolduysa/yaklaştıysa otomatik yenilenir.
 */
export async function getMaerskAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken
  }

  const credentials = getCarrierCredentials('MAERSK')
  if (!credentials) {
    throw new Error('Maersk API kimlik bilgileri (Consumer-Key/Secret) tanımlı değil.')
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.consumerKey,
    client_secret: credentials.consumerSecret
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Cache-Control': 'no-cache',
      'Consumer-Key': credentials.consumerKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })

  if (!response.ok) {
    let detail = ''
    try {
      detail = await response.text()
    } catch {
      // yoksay
    }
    console.error('[Maersk OAuth] Token isteği başarısız:', response.status, detail)
    throw new Error(
      `Maersk yetkilendirme başarısız oldu (HTTP ${response.status}).${detail ? ` Detay: ${detail}` : " Consumer-Key/Secret'ı kontrol edin."}`
    )
  }

  const data = (await response.json()) as TokenResponse
  const expiresInMs = (data.expires_in ?? 7200) * 1000
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresInMs - 60_000
  }
  return cachedToken.accessToken
}

/** Sadece test/hata ayıklama amaçlı: cache'lenmiş token'ı temizler. */
export function resetMaerskTokenCache(): void {
  cachedToken = null
}
