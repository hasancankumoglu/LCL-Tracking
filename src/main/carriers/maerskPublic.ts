import { BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mt } from '../i18n/language'
import type {
  CarrierBookingSnapshot,
  CarrierLookupResult,
  CarrierReferenceType
} from '../../shared/types'

// Kaynak: https://www.maersk.com/tracking/<referans> - Maersk'in halka açık, giriş
// gerektirmeyen genel takip sayfası.
//
// ÖNEMLİ - bu DENEYSEL bir fallback'tir, resmi Events API'nin (bkz. maersk.ts) yerini
// almaz, sadece o kullanılamadığında (kimlik bilgisi yok/hata/bulunamadı) kullanıcının
// açıkça seçtiği bir son çare seçeneğidir:
// - maersk.com/robots.txt, bu sayfanın referanslı hallerini (`/tracking/*`) crawl'a
//   KAPALI tutuyor (yalnızca `/tracking/$` arama formu açık). Bu yüzden burada
//   yalnızca kullanıcının tek tek, elle tetiklediği sorgular yapılır; hiçbir zaman
//   otomatik/toplu/zamanlanmış şekilde çağrılmamalı ve agresif olmayan bir soğuma
//   (cooldown) süresi uygulanır.
// - Bot korumasını aşmaya yönelik hiçbir girişim (sahte User-Agent, CAPTCHA çözme vb.)
//   YAPILMAZ; sayfa engellenir/farklı içerik dönerse sonuç ayrıştırılamaz ve kullanıcıya
//   açık bir hata mesajıyla resmi API'ye yönlendirilir. Düz bir HTTP fetch/isteği bot
//   korumasına (502) takıldığı için doğrulandı - bu yüzden gerçek bir Chromium
//   penceresi (gizli BrowserWindow) ile sayfa yükleniyor.
// - Ayrıştırma, kullanıcının paylaştığı GERÇEK sayfa HTML'indeki `data-test`
//   attribute'larına dayanan DOM query'leriyle yapılıyor (CSS class'larından çok daha
//   kararlı bir seçim yöntemi, bkz. DOM_EXTRACTION_SCRIPT):
//   [data-test="search-summary-ocean"]  -> booking özeti bulundu mu (başarı sinyali)
//   [data-test="transport-doc-value"]   -> Bill of Lading / booking numarası
//   [data-test="track-from-value"]      -> Yükleme limanı (From)
//   [data-test="track-to-value"]        -> Varış limanı (To)
//   .container--ocean                   -> her konteyner kartı
//   [data-test="container-details"] > span:nth-child(1) -> konteyner no
//   [data-test="container-details"] > span:nth-child(3) -> ekipman açıklaması (ör. "40' Dry High")
//     -> uygulamanın ContainerType kodlarına (40RF/40HC/20DC) çevriliyor, eşleşmezse
//        ham açıklama metni olduğu gibi bırakılıyor (bilgi amaçlı).
// - Sayfanın SUNUCUDAN GELEN İLK HALİ "No results found" metnini içerebiliyor (gerçek
//   veri sayfa yüklendikten SONRA ayrı bir istekle gelip yerini alıyor) - bu yüzden
//   booking özeti/konteyner GÖRÜLMEDİKÇE erken çıkılmıyor; "no results" görülmesi tek
//   başına yetmiyor, tüm poll süresi (~16sn) doldurulup HALA booking/konteyner yoksa
//   bulunamadı kabul ediliyor (önceden 2 ardışık pollde kırılıyordu, bu da gerçek veri
//   henüz render olmadan yanlışlıkla "bulunamadı" dönmesine yol açıyordu).
// - Vessel adı, ETA/ETD, konşimento durumu gibi alanlar gerçek örnek sayfada mevcut
//   değildi; bu alanlar bilinçli olarak null bırakılıyor (yanlış bilgi göstermektense).

const TRACKING_URL_BASE = 'https://www.maersk.com/tracking/'
const COOLDOWN_MS = 30_000
const POLL_INTERVAL_MS = 800
const MAX_POLLS = 30 // ~24sn üst sınır (gerçek sayfanın tamamen yüklenmesi ~10sn sürebiliyor, pay bırakıldı)

// GEÇİCİ HATA AYIKLAMA ANAHTARI: true iken pencere görünür açılır ve DevTools otomatik
// açılır - böylece gerçekten yüklenen sayfa, gerçek bir Chrome sekmesiyle yan yana
// gözle karşılaştırılabilir. Sorun çözülünce false'a geri alınmalı (üretimde pencere
// gizli kalmalı).
const DEBUG_VISIBLE = true

// Electron'un varsayılan User-Agent'ı "Electron/x.y.z" ifadesini içerir; bazı siteler
// tanımadıkları tarayıcılara farklı/basitleştirilmiş bir sayfa döndürebiliyor. Gerçek
// bir masaüstü Chrome'un UA'sıyla aynısını kullanarak sitenin normal sürümünü almasını
// sağlıyoruz - bu bot korumasını aşmaya yönelik bir girişim değil, tarayıcı kimliğini
// (aynı Chromium motoruna sahip olduğumuz için) doğru bildirmektir.
const DESKTOP_CHROME_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`

const lastQueryAtByKey = new Map<string, number>()

function buildKey(referenceType: CarrierReferenceType, value: string): string {
  return `${referenceType}:${value.trim().toUpperCase()}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface DomContainer {
  containerNo: string
  equipmentTypeCode: string | null
}

interface PageState {
  hasSummary: boolean
  blNumber: string | null
  pol: string | null
  destination: string | null
  containers: DomContainer[]
  hasNoResults: boolean
}

// GEÇİCİ HATA AYIKLAMA: ayrıştırılan son sayfa durumunu bir dosyaya yazıyoruz, böylece
// sayfa yapısı değişirse (ör. yeni "Try new Tracking experience" sürümüne geçilirse)
// gerçek veriyle karşılaştırıp ayrıştırma mantığını güncelleyebiliriz.
const DEBUG_DUMP_PATH = join(tmpdir(), 'maersk-public-debug.json')
// Ayrıştırma sırasında GERÇEKTEN aranan ham HTML'in kendisi - sorgu sonucu beklenenden
// farklıysa (ör. bot koruması farklı bir sayfa döndürdüyse) bu dosyayı açıp gerçek
// tarayıcıda gördüğünüzle karşılaştırabilirsiniz.
const DEBUG_HTML_DUMP_PATH = join(tmpdir(), 'maersk-public-debug.html')

function debugDumpPageState(state: PageState): void {
  try {
    writeFileSync(DEBUG_DUMP_PATH, JSON.stringify(state, null, 2), 'utf8')
    console.log(`[Maersk Public] Ayrıştırılan veri şuraya yazıldı: ${DEBUG_DUMP_PATH}`)
  } catch (err) {
    console.log('[Maersk Public] Debug dump yazılamadı:', err)
  }
}

function debugDumpHtml(html: string): void {
  try {
    writeFileSync(DEBUG_HTML_DUMP_PATH, html, 'utf8')
    console.log(`[Maersk Public] Aranan ham HTML şuraya yazıldı: ${DEBUG_HTML_DUMP_PATH}`)
  } catch (err) {
    console.log('[Maersk Public] HTML debug dump yazılamadı:', err)
  }
}

/**
 * Hedef sayfada (gizli BrowserWindow) çalıştırılan DOM ayrıştırma betiği. Kullanıcının
 * paylaştığı gerçek HTML örneğindeki `data-test` attribute'larına dayanır.
 */
const DOM_EXTRACTION_SCRIPT = `(function () {
  function cleanText(el) {
    if (!el) return null
    var t = (el.textContent || '').trim()
    return t.length ? t : null
  }

  var hasSummary = !!document.querySelector('[data-test="search-summary-ocean"]')
  var blNumber = cleanText(document.querySelector('[data-test="transport-doc-value"]'))
  var pol = cleanText(document.querySelector('[data-test="track-from-value"]'))
  var destination = cleanText(document.querySelector('[data-test="track-to-value"]'))

  var containerEls = Array.prototype.slice.call(document.querySelectorAll('.container--ocean'))
  var containers = containerEls.map(function (el) {
    var detailsEl = el.querySelector('[data-test="container-details"]')
    var spans = detailsEl
      ? Array.prototype.slice.call(detailsEl.children).filter(function (c) {
          return c.tagName === 'SPAN'
        })
      : []
    var containerNo = spans[0] ? spans[0].textContent.trim() : null
    var equipmentRaw = spans[2] ? spans[2].textContent.trim() : null
    return { containerNo: containerNo, equipmentRaw: equipmentRaw }
  }).filter(function (c) { return !!c.containerNo })

  var bodyText = document.body ? document.body.innerText : ''
  var normalized = bodyText.toLowerCase()
  var hasNoResults =
    normalized.indexOf('no results found') !== -1 || normalized.indexOf('sonuç bulunamadı') !== -1

  return {
    hasSummary: hasSummary,
    blNumber: blNumber,
    pol: pol,
    destination: destination,
    containers: containers,
    hasNoResults: hasNoResults,
    bodyHtml: document.body ? document.body.innerHTML : ''
  }
})()`

async function readPageState(win: BrowserWindow): Promise<
  Omit<PageState, 'containers'> & {
    containers: { containerNo: string; equipmentRaw: string | null }[]
    bodyHtml: string
  }
> {
  return win.webContents.executeJavaScript(DOM_EXTRACTION_SCRIPT)
}

/** Maersk'in serbest metin ekipman açıklamasını uygulamanın bildiği ContainerType kodlarına çevirir; eşleşmezse ham metni olduğu gibi döndürür. */
function mapEquipmentDescriptionToCode(raw: string | null): string | null {
  if (!raw) return null
  const normalized = raw.toLowerCase()
  const size = normalized.match(/\b(20|40|45)\b/)?.[1] ?? null
  const isReefer = normalized.includes('reefer') || normalized.includes('refrigerated')
  const isHighCube = normalized.includes('high')

  if (size === '40' && isReefer) return '40RF'
  if (size === '40' && isHighCube) return '40HC'
  if (size === '20' && !isReefer && !isHighCube) return '20DC'
  return raw
}

function buildSnapshotFromDom(state: PageState): CarrierBookingSnapshot {
  return {
    carrier: 'MAERSK',
    source: 'public-fallback',
    bookingReference: null,
    blNumber: state.blNumber,
    vesselName: null,
    imoNumber: null,
    pol: state.pol,
    destination: state.destination,
    eta: null,
    etd: null,
    freeTimeEnd: null,
    blStatus: null,
    containers: state.containers.map((c) => ({
      containerNo: c.containerNo,
      equipmentTypeCode: c.equipmentTypeCode
    })),
    rawEventCount: state.containers.length
  }
}

export async function lookupMaerskPublicTracking(
  referenceType: CarrierReferenceType,
  value: string
): Promise<CarrierLookupResult> {
  const trimmed = value.trim()
  if (!trimmed) {
    return { status: 'error', message: mt('errors.emptyReferenceNumber') }
  }

  const key = buildKey(referenceType, trimmed)
  const now = Date.now()
  const last = lastQueryAtByKey.get(key)
  if (last && now - last < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (now - last)) / 1000)
    return {
      status: 'error',
      message: mt('errors.publicTrackingCooldown', { seconds: waitSec })
    }
  }
  lastQueryAtByKey.set(key, now)

  const url = `${TRACKING_URL_BASE}${encodeURIComponent(trimmed)}`

  let win: BrowserWindow | null = null
  try {
    win = new BrowserWindow({
      show: DEBUG_VISIBLE,
      width: 1280,
      height: 900,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false
      }
    })
    win.webContents.setUserAgent(DESKTOP_CHROME_USER_AGENT)

    await win.loadURL(url)

    if (DEBUG_VISIBLE) {
      win.webContents.openDevTools({ mode: 'detach' })
    }

    let state: PageState | null = null
    let lastBodyHtml = ''
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS)
      if (win.isDestroyed()) break
      const rawState = await readPageState(win)
      lastBodyHtml = rawState.bodyHtml
      state = {
        hasSummary: rawState.hasSummary,
        blNumber: rawState.blNumber,
        pol: rawState.pol,
        destination: rawState.destination,
        hasNoResults: rawState.hasNoResults,
        containers: rawState.containers.map((c) => ({
          containerNo: c.containerNo,
          equipmentTypeCode: mapEquipmentDescriptionToCode(c.equipmentRaw)
        }))
      }
      console.log(
        `[Maersk Public] poll #${i + 1}/${MAX_POLLS} hasSummary=${state.hasSummary} containers=${state.containers.length} hasNoResults=${state.hasNoResults}`
      )

      if (state.hasSummary || state.containers.length > 0) {
        break
      }
      // Sayfanın ilk (sunucudan gelen) hali de "no results" içerebiliyor ve gerçek veri
      // birkaç saniye sonra render oluyor - bu yüzden "no results" görülmesi tek başına
      // erken çıkış için yeterli değil; booking/konteyner görülmedikçe tüm poll süresi
      // (~24sn) dolduruluyor, ancak o zaman "bulunamadı" kabul ediliyor.
    }

    if (!state) {
      return {
        status: 'error',
        message: mt('errors.publicTrackingTimeout')
      }
    }

    debugDumpPageState(state)
    debugDumpHtml(lastBodyHtml)

    if (state.hasSummary || state.containers.length > 0) {
      return { status: 'found', snapshot: buildSnapshotFromDom(state) }
    }

    if (state.hasNoResults) {
      return { status: 'not_found' }
    }

    return {
      status: 'error',
      message: mt('errors.publicTrackingParseFailed')
    }
  } catch (err) {
    return {
      status: 'error',
      message: mt('errors.publicTrackingAccessFailed', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
  }
}
