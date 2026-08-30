/**
 * Автообновление REduQuest из git.
 *
 * Приложение не умеет обновлять само себя на месте: оно собирается из исходников.
 * Поэтому здесь только проверка «есть ли новые коммиты в origin» и запуск
 * scripts/update.ps1, который делает всю работу и перезапускает приложение.
 *
 * Если git недоступен, каталог не репозиторий или сети нет — проверка молча
 * пропускается. Обновление никогда не должно мешать запуску.
 */
const { execFile, spawn } = require('node:child_process')
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const APP_ROOT = path.join(__dirname, '..')
const CONFIG_PATH = path.join(APP_ROOT, 'update-config.json')
const GIT_TIMEOUT = 20_000

/** Откуда обновляемся: из конфигурации сборки либо из текущего каталога. */
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const config = JSON.parse(raw)
    if (config.enabled === false) return null
    if (config.projectRoot && fs.existsSync(path.join(config.projectRoot, '.git'))) return config
  } catch { /* конфигурации нет — попробуем текущий каталог */ }
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

/**
 * Сколько коммитов мы отстаём от origin.
 * @returns {Promise<{behind: number, branch: string, projectRoot: string, log: string} | null>}
 */
async function checkForUpdates() {
  const config = readConfig()
  if (!config) return null

  const root = config.projectRoot
  const branch = config.branch || (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) || 'main'

  const fetched = await git(root, ['fetch', '--quiet', 'origin', branch])
  if (fetched === null) return null

  const count = await git(root, ['rev-list', '--count', `HEAD..origin/${branch}`])
  const behind = Number.parseInt(count ?? '0', 10)
  if (!Number.isFinite(behind) || behind <= 0) return null

  const log = (await git(root, ['--no-pager', 'log', '--oneline', '--no-decorate', '-5', `HEAD..origin/${branch}`])) ?? ''
  return { behind, branch, projectRoot: root, log }
}

/**
 * Запускает обновление отдельным процессом.
 * @param {string} projectRoot каталог с исходниками
 * @param {{restart?: boolean}} options restart=true — скрипт поднимет приложение сам
 */
function runUpdate(projectRoot, options = {}) {
  const script = path.join(projectRoot, 'scripts', 'update.ps1')
  if (!fs.existsSync(script)) return false
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Force']
  if (options.restart === false) args.push('-NoRestart')
  const child = spawn('powershell.exe', args, {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: options.restart === false,
  })
  child.unref()
  return true
}

/** Настройки обновления живут рядом с профилем пользователя, а не в каталоге сборки. */
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
  } catch { /* настройка не критична: при неудаче остаёмся на значении по умолчанию */ }
}

module.exports = { checkForUpdates, runUpdate, readSettings, writeSettings }
