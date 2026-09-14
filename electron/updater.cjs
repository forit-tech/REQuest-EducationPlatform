/**
 * Обновление REduQuest.
 *
 * В git-клоне сохраняется developer-сценарий через scripts/update.ps1.
 * Установленная версия проверяет последний GitHub Release, заранее скачивает
 * новый NSIS-инсталлятор и запускает его только после закрытия приложения.
 */
const { execFile, spawn } = require('node:child_process')
const { app } = require('electron')
const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

const APP_ROOT = path.join(__dirname, '..')
const CONFIG_PATH = path.join(APP_ROOT, 'update-config.json')
const RELEASE_API = 'https://api.github.com/repos/forit-tech/REQuest-EducationPlatform/releases/latest'
const GIT_TIMEOUT = 20_000
const REQUEST_TIMEOUT = 30_000
const MAX_REDIRECTS = 5

function readSourceConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    if (config.enabled === false) return null
    if (config.projectRoot && fs.existsSync(path.join(config.projectRoot, '.git'))) return config
  } catch { /* конфигурация необязательна */ }

  if (fs.existsSync(path.join(APP_ROOT, '.git'))) {
    return { projectRoot: APP_ROOT, branch: 'main', enabled: true }
  }
  return null
}

function git(cwd, args) {
  return new Promise(resolve => {
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : String(stdout).trim())
    })
  })
}

function allowedDownloadUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      (url.hostname === 'github.com' ||
       url.hostname.endsWith('.github.com') ||
       url.hostname.endsWith('.githubusercontent.com'))
  } catch {
    return false
  }
}

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (!allowedDownloadUrl(url)) return reject(new Error('Недопустимый адрес обновления'))
    const req = https.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'REduQuest-Updater',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume()
        if (!response.headers.location || redirects >= MAX_REDIRECTS) {
          reject(new Error('Слишком много перенаправлений'))
          return
        }
        resolve(request(new URL(response.headers.location, url).toString(), redirects + 1))
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`GitHub вернул HTTP ${response.statusCode}`))
        return
      }
      resolve(response)
    })
    req.setTimeout(REQUEST_TIMEOUT, () => req.destroy(new Error('Истекло время ожидания')))
    req.on('error', reject)
  })
}

async function requestJson(url) {
  const response = await request(url)
  const chunks = []
  for await (const chunk of response) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function versionParts(version) {
  return String(version).replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0)
}

function isNewerVersion(candidate, current) {
  const next = versionParts(candidate)
  const installed = versionParts(current)
  const length = Math.max(next.length, installed.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (next[index] || 0) - (installed[index] || 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

async function checkSourceUpdate(config) {
  const root = config.projectRoot
  const branch = config.branch || (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) || 'main'
  if (await git(root, ['fetch', '--quiet', 'origin', branch]) === null) return null

  const count = await git(root, ['rev-list', '--count', `HEAD..origin/${branch}`])
  const behind = Number.parseInt(count ?? '0', 10)
  if (!Number.isFinite(behind) || behind <= 0) return null

  const log = (await git(root, ['--no-pager', 'log', '--oneline', '--no-decorate', '-5', `HEAD..origin/${branch}`])) ?? ''
  return { kind: 'source', behind, branch, projectRoot: root, log }
}

async function checkReleaseUpdate() {
  if (!app.isPackaged) return null
  const release = await requestJson(RELEASE_API)
  const version = String(release.tag_name || '').replace(/^v/i, '')
  if (!version || release.draft || release.prerelease || !isNewerVersion(version, app.getVersion())) return null

  const asset = Array.isArray(release.assets)
    ? release.assets.find(item => /^REduQuest-Setup-.*\.exe$/i.test(item.name))
    : null
  if (!asset || !allowedDownloadUrl(asset.browser_download_url)) return null

  return {
    kind: 'installer',
    version,
    name: asset.name,
    url: asset.browser_download_url,
    size: Number(asset.size) || 0,
    notes: String(release.body || '').trim(),
  }
}

async function checkForUpdates() {
  const source = readSourceConfig()
  return source ? checkSourceUpdate(source) : checkReleaseUpdate()
}

async function downloadInstaller(update) {
  const directory = path.join(app.getPath('userData'), 'updates')
  const destination = path.join(directory, update.name)
  const partial = `${destination}.part`
  fs.mkdirSync(directory, { recursive: true })

  try {
    const stat = fs.statSync(destination)
    if (!update.size || stat.size === update.size) return destination
  } catch { /* файл ещё не скачан */ }

  fs.rmSync(partial, { force: true })
  const response = await request(update.url)
  const output = fs.createWriteStream(partial, { flags: 'wx' })
  try {
    await new Promise((resolve, reject) => {
      response.pipe(output)
      response.on('error', reject)
      output.on('error', reject)
      output.on('finish', resolve)
    })
    const size = fs.statSync(partial).size
    if (update.size && size !== update.size) throw new Error('Размер скачанного файла не совпадает')
    fs.renameSync(partial, destination)
    return destination
  } catch (error) {
    output.destroy()
    fs.rmSync(partial, { force: true })
    throw error
  }
}

async function prepareUpdate(update) {
  if (update.kind === 'installer' && !update.installerPath) {
    update.installerPath = await downloadInstaller(update)
  }
  return update
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function runSourceUpdate(update, options) {
  const script = path.join(update.projectRoot, 'scripts', 'update.ps1')
  if (!fs.existsSync(script)) return false
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Force']
  if (options.restart === false) args.push('-NoRestart')
  const child = spawn('powershell.exe', args, {
    cwd: update.projectRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: options.restart === false,
  })
  child.unref()
  return true
}

function runInstallerUpdate(update, options) {
  if (!update.installerPath || !fs.existsSync(update.installerPath)) return false
  const restart = options.restart !== false
  const command = [
    `Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`,
    `Start-Process -FilePath ${quotePowerShell(update.installerPath)} -ArgumentList '/S' -Wait`,
    restart ? `Start-Process -FilePath ${quotePowerShell(app.getPath('exe'))}` : '',
  ].filter(Boolean).join('; ')

  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return true
}

function runUpdate(update, options = {}) {
  return update.kind === 'installer'
    ? runInstallerUpdate(update, options)
    : runSourceUpdate(update, options)
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'update-settings.json')
}

function readSettings() {
  try {
    return { autoUpdate: true, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }
  } catch {
    return { autoUpdate: true }
  }
}

function writeSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
  } catch { /* настройка не критична */ }
}

module.exports = {
  checkForUpdates,
  prepareUpdate,
  runUpdate,
  readSettings,
  writeSettings,
  isNewerVersion,
}
