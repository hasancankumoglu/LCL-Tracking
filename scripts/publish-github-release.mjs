// dist/ içindeki latest*.yml + referans verdiği installer/.blockmap dosyalarını GitHub
// Releases'e SIRAYLA (await ile, tek seferde bir dosya) yükler - electron-builder'ın kendi
// --publish mekanizmasının YARIŞ durumuna düşüp aynı tag için birden fazla
// draft/release oluşturmasının (ve asset'leri bunlar arasında bölüştürmesinin) önüne geçer.
// Release doğrudan PUBLISHED (draft değil) oluşturulur - manuel "Publish release" adımına gerek yok.
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const OWNER = 'hasancankumoglu'
const REPO = 'LCL-Tracking'
const ROOT = process.cwd()
const DIST_DIR = join(ROOT, 'dist')
const RELEASE_NOTES_TMP_PATH = join(ROOT, '.release-notes.tmp.md')
const CHANNEL_FILES = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']
const API = 'https://api.github.com'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function readReleaseNotes() {
  if (!existsSync(RELEASE_NOTES_TMP_PATH)) return null
  const notes = readFileSync(RELEASE_NOTES_TMP_PATH, 'utf-8').trim()
  return notes || null
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
if (!token) {
  console.error('HATA: GH_TOKEN (veya GITHUB_TOKEN) ortam değişkeni ayarlanmamış.')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function extractInstallerFileNames(ymlText) {
  const names = new Set()
  for (const match of ymlText.matchAll(/url:\s*(\S+)/g)) names.add(match[1])
  return [...names]
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function readVersion(ymlText) {
  const match = ymlText.match(/^version:\s*(\S+)/m)
  return match ? match[1] : null
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function getOrCreateRelease(tag, releaseNotes) {
  const existing = await fetch(`${API}/repos/${OWNER}/${REPO}/releases/tags/${tag}`, {
    headers: authHeaders()
  })
  if (existing.status === 200) {
    const existingRelease = await existing.json()
    if (releaseNotes && existingRelease.body !== releaseNotes) {
      const updated = await fetch(`${API}/repos/${OWNER}/${REPO}/releases/${existingRelease.id}`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ body: releaseNotes })
      })
      if (!updated.ok) {
        throw new Error(
          `Release açıklaması güncellenemedi: ${updated.status} ${await updated.text()}`
        )
      }
      console.log('✓ Mevcut release açıklaması güncellendi.')
      return updated.json()
    }
    return existingRelease
  }
  if (existing.status !== 404) {
    throw new Error(`Release sorgulanamadı: ${existing.status} ${await existing.text()}`)
  }

  const created = await fetch(`${API}/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      body: releaseNotes || '',
      draft: false,
      prerelease: false
    })
  })
  if (!created.ok) {
    throw new Error(`Release oluşturulamadı: ${created.status} ${await created.text()}`)
  }
  if (releaseNotes) console.log('✓ Release açıklaması sürüm notlarıyla oluşturuldu.')
  return created.json()
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function deleteExistingAsset(releaseId, fileName) {
  const list = await fetch(`${API}/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`, {
    headers: authHeaders()
  })
  if (!list.ok) return
  const assets = await list.json()
  const match = assets.find((a) => a.name === fileName)
  if (!match) return
  await fetch(`${API}/repos/${OWNER}/${REPO}/releases/assets/${match.id}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function uploadAsset(release, fileName) {
  await deleteExistingAsset(release.id, fileName)
  const data = readFileSync(join(DIST_DIR, fileName))
  const uploadUrl = release.upload_url.replace('{?name,label}', '')
  const res = await fetch(`${uploadUrl}?name=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
    body: data
  })
  if (!res.ok) {
    throw new Error(`${fileName} yüklenemedi: ${res.status} ${await res.text()}`)
  }
  console.log(`✓ ${fileName} yüklendi (${data.length} bayt)`)
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  const foundChannels = CHANNEL_FILES.filter((f) => existsSync(join(DIST_DIR, f)))
  if (foundChannels.length === 0) {
    throw new Error(
      "dist/ klasöründe latest*.yml bulunamadı - önce 'npm run build:win' çalıştırın."
    )
  }

  const ymlText = readFileSync(join(DIST_DIR, foundChannels[0]), 'utf-8')
  const version = readVersion(ymlText)
  if (!version) throw new Error('latest.yml içinde versiyon bulunamadı.')
  const tag = `v${version}`

  console.log(`GitHub release hazırlanıyor: ${tag}`)
  const releaseNotes = readReleaseNotes()
  const release = await getOrCreateRelease(tag, releaseNotes)

  const filesToUpload = new Set(foundChannels)
  for (const channel of foundChannels) {
    const text = readFileSync(join(DIST_DIR, channel), 'utf-8')
    for (const installerName of extractInstallerFileNames(text)) {
      filesToUpload.add(installerName)
      const blockmapName = `${installerName}.blockmap`
      if (existsSync(join(DIST_DIR, blockmapName))) filesToUpload.add(blockmapName)
    }
  }

  console.log(`Yüklenecek dosyalar (sırayla): ${[...filesToUpload].join(', ')}`)
  for (const fileName of filesToUpload) {
    await uploadAsset(release, fileName)
  }

  if (existsSync(RELEASE_NOTES_TMP_PATH)) {
    try {
      unlinkSync(RELEASE_NOTES_TMP_PATH)
    } catch {
      // Geçici dosya temizlenemedi - bir sonraki release'de üzerine yazılacağı için sorun değil.
    }
  }

  console.log(`\n✓ ${tag} GitHub Releases'e yayınlandı: ${release.html_url}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
