const { app, BrowserWindow, Menu, Notification, dialog, shell } = require('electron')
const path = require('node:path')
const { checkForUpdates, prepareUpdate, runUpdate, readSettings, writeSettings } = require('./updater.cjs')

app.setName('REduQuest')

let pendingUpdate = null
let checkTimer = null

function createWindow() {
  const window = new BrowserWindow({
    title: 'REduQuest — практические профессии',
    width: 1480,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#050b14',
    icon: path.join(__dirname, '..', 'assets', 'request.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  window.once('ready-to-show', () => {
    window.maximize()
    window.show()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  return window
}

function updateMessage(update) {
  return update.kind === 'installer'
    ? {
        message: `Доступна REduQuest ${update.version} (установлена ${app.getVersion()}).`,
        detail: update.notes || 'Новая версия будет скачана с GitHub Releases и установлена после закрытия приложения.',
      }
    : {
        message: `REduQuest отстаёт от репозитория на ${update.behind} ${update.behind === 1 ? 'коммит' : 'коммитов'}.`,
        detail: `${update.log}\n\nИсходники будут обновлены и приложение пересоберётся.`,
      }
}

async function prepareOrExplain(window, update) {
  try {
    return await prepareUpdate(update)
  } catch {
    await dialog.showMessageBox(window, {
      type: 'error',
      title: 'Не удалось скачать обновление',
      message: 'Обновление найдено, но подготовить его не получилось.',
      detail: 'Проверьте подключение к интернету и попробуйте ещё раз.',
      buttons: ['Хорошо'],
      noLink: true,
    })
    return null
  }
}

async function askUpdate(window, update) {
  const copy = updateMessage(update)
  const { response, checkboxChecked } = await dialog.showMessageBox(window, {
    type: 'info',
    title: 'Доступно обновление',
    ...copy,
    buttons: ['Обновить сейчас', 'Обновить при выходе', 'Пропустить'],
    defaultId: 1,
    cancelId: 2,
    checkboxLabel: 'Обновлять автоматически при выходе, не спрашивая',
    checkboxChecked: readSettings().autoUpdate,
    noLink: true,
  })

  writeSettings({ ...readSettings(), autoUpdate: checkboxChecked })
  if (response === 2) {
    pendingUpdate = null
    return
  }

  const prepared = await prepareOrExplain(window, update)
  if (!prepared) return
  pendingUpdate = { ...prepared, restartAfterInstall: response === 0 }
  if (response === 0) app.quit()
}

async function pollUpdates(window) {
  let update = null
  try { update = await checkForUpdates() } catch { return }
  if (!update || window.isDestroyed()) return

  const identity = update.kind === 'installer' ? update.version : `${update.branch}:${update.behind}`
  if (pendingUpdate?.identity === identity) return
  update.identity = identity

  const { autoUpdate } = readSettings()
  if (!autoUpdate) {
    await askUpdate(window, update)
    return
  }

  const prepared = await prepareOrExplain(window, update)
  if (!prepared) return
  pendingUpdate = { ...prepared, restartAfterInstall: false }

  if (Notification.isSupported()) {
    const note = new Notification({
      title: 'REduQuest обновится при выходе',
      body: update.kind === 'installer'
        ? `Версия ${update.version} уже скачана. Нажмите, чтобы установить сейчас.`
        : `Готово изменений: ${update.behind}. Нажмите, чтобы обновиться сейчас.`,
      silent: true,
    })
    note.on('click', () => { void askUpdate(window, prepared) })
    note.show()
  }
}

function buildMenu(window) {
  const template = [{
    label: 'REduQuest',
    submenu: [
      {
        label: 'Проверить обновления',
        click: async () => {
          const update = await checkForUpdates().catch(() => null)
          if (!update) {
            await dialog.showMessageBox(window, {
              type: 'info',
              title: 'Обновлений нет',
              message: 'Установлена последняя опубликованная версия.',
              buttons: ['Хорошо'],
              noLink: true,
            })
            return
          }
          await askUpdate(window, update)
        },
      },
      { type: 'separator' },
      { role: 'reload', label: 'Перезагрузить' },
      { role: 'toggleDevTools', label: 'Инструменты разработчика' },
      { type: 'separator' },
      { role: 'quit', label: 'Выход' },
    ],
  }]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  const window = createWindow()
  buildMenu(window)
  setTimeout(() => { void pollUpdates(window) }, 4000)
  checkTimer = setInterval(() => { void pollUpdates(window) }, 6 * 60 * 60 * 1000)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  if (checkTimer) clearInterval(checkTimer)
  if (!pendingUpdate) return
  const update = pendingUpdate
  pendingUpdate = null
  runUpdate(update, { restart: update.restartAfterInstall })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
