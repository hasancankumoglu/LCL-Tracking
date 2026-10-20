// Tek komutla release akışı: versiyon artışı sor/uygula -> build -> GitHub Releases'e yayınla.
// GitHub Personal Access Token önce ortam değişkeninden, yoksa (varsa) .env.local dosyasından,
// o da yoksa terminalden gizli (maskeli) olarak sorulur - hiçbir zaman koda/git'e gömülmez.
// Kullanım: npm run release          (versiyon tipi interaktif sorulur, varsayılan: patch)
//          npm run release -- minor   (veya major / 1.4.0 gibi tam bir versiyon)
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import readline from 'node:readline'

const ROOT = process.cwd()
const PACKAGE_JSON_PATH = join(ROOT, 'package.json')
const ENV_LOCAL_PATH = join(ROOT, '.env.local')
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md')
const RELEASE_NOTES_TMP_PATH = join(ROOT, '.release-notes.tmp.md')
const UNRELEASED_HEADING = '## [Yayınlanmamış]'
const COMMIT_TYPE_LABELS = {
  feat: 'Eklenenler',
  fix: 'Düzeltmeler',
  perf: 'Performans',
  refactor: 'Yeniden Düzenlemeler',
  docs: 'Dokümantasyon',
  style: 'Stil',
  test: 'Testler',
  build: 'Bakım',
  chore: 'Bakım',
  ci: 'Bakım',
  revert: 'Geri Alınanlar'
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function askHidden(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve('')
      return
    }
    process.stdout.write(question)
    const stdin = process.stdin
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const onData = (chunk) => {
      const char = chunk.toString()
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false)
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
        return
      }
      if (char === '\u0003') {
        process.stdout.write('\n')
        process.exit(1)
      }
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1)
        return
      }
      value += char
    }
    stdin.on('data', onData)
  })
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function bumpVersion(current, type) {
  if (/^\d+\.\d+\.\d+$/.test(type)) return type
  const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Ge\u00e7ersiz mevcut versiyon: ${current}`)
  let major = Number(match[1])
  let minor = Number(match[2])
  let patch = Number(match[3])
  if (type === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (type === 'minor') {
    minor += 1
    patch = 0
  } else if (type === 'patch') {
    patch += 1
  } else {
    throw new Error(
      `Ge\u00e7ersiz versiyon tipi: ${type} (patch/minor/major veya x.y.z olmal\u0131)`
    )
  }
  return `${major}.${minor}.${patch}`
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function readGithubTokenFromEnvLocal() {
  if (!existsSync(ENV_LOCAL_PATH)) return null
  const lines = readFileSync(ENV_LOCAL_PATH, 'utf-8').split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^GH_TOKEN\s*=\s*(.+)$/)
    if (match) return match[1].trim()
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function resolveGithubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN

  const fromFile = readGithubTokenFromEnvLocal()
  if (fromFile) return fromFile

  if (!process.stdin.isTTY) {
    throw new Error(
      'GH_TOKEN bulunamadı ve terminal etkileşimli değil. ' +
        'Ortam değişkeni olarak ayarlayın: $env:GH_TOKEN="<personal access token>"'
    )
  }

  const token = await askHidden(
    "GitHub Personal Access Token ('repo' yetkili, https://github.com/settings/tokens): "
  )
  if (!token) throw new Error('GH_TOKEN girilmedi, işlem iptal edildi.')

  const remember = await ask(
    "Bu token sonraki release'lerde tekrar sorulmaması için .env.local dosyasına kaydedilsin mi (git'e eklenmez)? (y/N): "
  )
  if (remember.toLowerCase() === 'y') {
    appendFileSync(ENV_LOCAL_PATH, `GH_TOKEN=${token}\n`, 'utf-8')
    console.log(`✓ .env.local dosyasına kaydedildi: ${ENV_LOCAL_PATH}`)
  }

  return token
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getLatestReleaseTag() {
  try {
    execSync('git fetch --tags --quiet', { cwd: ROOT, stdio: 'ignore' })
  } catch {
    // Çevrimdışı olabilir veya remote yapılandırılmamış olabilir - sorun değil, yerel etiketlerle devam et.
  }
  try {
    const tags = execSync('git tag --list "v*" --sort=-v:refname', {
      cwd: ROOT,
      encoding: 'utf-8'
    })
      .split(/\r?\n/)
      .filter(Boolean)
    return tags[0] ?? null
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getCommitSubjectsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  try {
    return execSync(`git log ${range} --no-merges --pretty=format:%s`, {
      cwd: ROOT,
      encoding: 'utf-8'
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildAutoReleaseNotes() {
  const latestTag = getLatestReleaseTag()
  const subjects = getCommitSubjectsSince(latestTag)
  if (subjects.length === 0) {
    return '- (Bu sürüm için otomatik tespit edilen bir değişiklik bulunamadı.)'
  }

  const groups = new Map()
  const other = []
  for (const subject of subjects) {
    const match = subject.match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/)
    const type = match ? match[1].toLowerCase() : null
    const label = (type && COMMIT_TYPE_LABELS[type]) || null
    const text = match ? match[2] : subject
    if (label) {
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(text)
    } else {
      other.push(text)
    }
  }

  const lines = []
  for (const [label, items] of groups) {
    lines.push(`### ${label}`, '')
    for (const item of items) lines.push(`- ${item}`)
    lines.push('')
  }
  if (other.length > 0) {
    lines.push('### Diğer', '')
    for (const item of other) lines.push(`- ${item}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function extractUnreleasedBody(changelog) {
  const headingIndex = changelog.indexOf(UNRELEASED_HEADING)
  if (headingIndex === -1) return { before: changelog, body: '', after: '' }
  const afterHeading = changelog.slice(headingIndex + UNRELEASED_HEADING.length)
  const nextHeadingMatch = afterHeading.match(/\r?\n##\s/)
  const bodyEnd = nextHeadingMatch ? nextHeadingMatch.index : afterHeading.length
  return {
    before: changelog.slice(0, headingIndex + UNRELEASED_HEADING.length),
    body: afterHeading.slice(0, bodyEnd),
    after: afterHeading.slice(bodyEnd)
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function isCommentLine(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('<!--') || trimmed.startsWith('-->')
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function hasUnreleasedContent(body) {
  return body.split(/\r?\n/).some((line) => line.trim() && !isCommentLine(line))
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function stripCommentLines(body) {
  return body
    .split(/\r?\n/)
    .filter((line) => !isCommentLine(line))
    .join('\n')
    .trim()
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function updateChangelog(version) {
  const changelog = existsSync(CHANGELOG_PATH) ? readFileSync(CHANGELOG_PATH, 'utf-8') : ''
  const { before, body, after } = extractUnreleasedBody(changelog)
  const manualContent = stripCommentLines(body)

  const useManual = hasUnreleasedContent(body)
  const releaseNotes = useManual ? manualContent : buildAutoReleaseNotes()
  const source = useManual ? 'CHANGELOG.md > [Yayınlanmamış]' : 'git commit geçmişi (otomatik)'
  console.log(`\u2713 Sürüm notları kaynağı: ${source}`)

  const today = new Date().toISOString().slice(0, 10)
  const newSection = `\n\n<!-- Yeni değişiklikleri buraya madde madde ekleyin, örn: "- Yeni X özelliği eklendi" -->\n\n## [${version}] - ${today}\n\n${releaseNotes}\n`

  const updatedChangelog = `${before}${newSection}${after}`
  writeFileSync(CHANGELOG_PATH, updatedChangelog, 'utf-8')
  writeFileSync(RELEASE_NOTES_TMP_PATH, releaseNotes, 'utf-8')
  console.log(`\u2713 CHANGELOG.md güncellendi (v${version} bölümü eklendi).`)

  return releaseNotes
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  let bumpArg = process.argv[2]
  if (!bumpArg) {
    const answer = await ask('Versiyon art\u0131\u015f tipi? (patch/minor/major) [patch]: ')
    bumpArg = answer || 'patch'
  }

  const packageRaw = readFileSync(PACKAGE_JSON_PATH, 'utf-8')
  const currentVersion = JSON.parse(packageRaw).version
  const nextVersion = bumpVersion(currentVersion, bumpArg)

  console.log(`Mevcut versiyon: ${currentVersion}  ->  Yeni versiyon: ${nextVersion}`)
  const confirm = await ask(
    "Devam edilsin mi? Build + GitHub Releases'e yayınlama başlatılacak. (y/N): "
  )
  if (confirm.toLowerCase() !== 'y') {
    console.log('İptal edildi, hiçbir dosya değiştirilmedi.')
    return
  }

  const updatedPackageRaw = packageRaw.replace(
    /"version":\s*"[^"]+"/,
    `"version": "${nextVersion}"`
  )
  writeFileSync(PACKAGE_JSON_PATH, updatedPackageRaw, 'utf-8')
  console.log(`\u2713 package.json versiyonu ${nextVersion} olarak g\u00fcncellendi.`)

  updateChangelog(nextVersion)

  const githubToken = await resolveGithubToken()

  console.log("\n--- Build + GitHub Releases'e yayınlama başlıyor (npm run release:win) ---")
  execSync('npm run release:win', {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, GH_TOKEN: githubToken }
  })

  console.log(`\n✓ Release v${nextVersion} tamamlandı ve GitHub Releases'e yayınlandı.`)
  console.log(
    "Son adım (manuel - git işlemleri otomatik yapılmadı, tag/release zaten GitHub'da otomatik oluştu):\n" +
      '  git add package.json package-lock.json CHANGELOG.md\n' +
      `  git commit -m "chore: release v${nextVersion}"\n` +
      '  git push'
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
