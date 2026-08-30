const { app, BrowserWindow, Menu, Notification, dialog, shell } = require('electron')
const path = require('node:path')
const { checkForUpdates, runUpdate, readSettings, writeSettings } = require('./updater.cjs')

app.setName('REduQuest')

/** Найденное, но ещё не применённое обновление. Ставится при выходе из приложения. */
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

/** Диалог с выбором: обновиться сейчас, при выходе или отложить. */
async function askUpdate(window, update) {
  const { response, checkboxChecked } = await dialog.showMessageBox(window, {
    type: 'info',
    title: 'Доступно обновление',
    message: `REduQuest отстаёт от репозитория на ${update.behind} ${update.behind === 1 ? 'коммит' : 'коммитов'}.`,
    detail: `${update.log}\n\nОбновление пересобирает приложение — это занимает пару минут.`,
    buttons: ['Обновить сейчас', 'Обновить при выходе', 'Пропустить'],
    defaultId: 1,
    cancelId: 2,
    checkboxLabel: 'Обновлять автоматически при выходе, не спрашивая',
    checkboxChecked: true,
    noLink: true,
  })

  const settings = readSettings()
  writeSettings({ ...settings, autoUpdate: checkboxChecked })

  if (response === 0) {
    if (runUpdate(update.projectRoot, { restart: true })) app.quit()
    else dialog.showErrorBox('Обновление недоступно', 'Не найден scripts/update.ps1 в каталоге проекта.')
    return
  }
  pendingUpdate = response === 1 ? update : null
}

/**
 * Проверка не блокирует запуск и не перебивает работу.
 * При включённом автообновлении показывает уведомление и ставит апдейт в очередь на выход.
 */
async function pollUpdates(window) {
  let update = null
  try { update = await checkForUpdates() } catch { return }
  if (!update || window.isDestroyed()) return
  if (pendingUpdate && pendingUpdate.behind === update.behind) return

  const { autoUpdate } = readSettings()
  if (!autoUpdate) {
    await askUpdate(window, update)
    return
  }

  pendingUpdate = update
  if (Notification.isSupported()) {
    const note = new Notification({
      title: 'REduQuest обновится при выходе',
      body: `Готово ${update.behind} ${update.behind === 1 ? 'изменение' : 'изменений'}. Нажмите, чтобы обновиться сейчас.`,
      silent: true,
    })
    note.on('click', () => { void askUpdate(window, update) })
    note.show()
  }
}

function buildMenu(window) {
  const template = [
    {
      label: 'REduQuest',
      submenu: [
        {
          label: 'Проверить обновления',
          click: async () => {
            const update = await checkForUpdates().catch(() => null)
            if (!update) {
              await dialog.showMessageBox(window, {
                type: 'info', title: 'Обновлений нет',
                message: 'Установлена последняя версия.', buttons: ['Хорошо'], noLink: true,
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
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  const window = createWindow()
  buildMenu(window)
  // Даём приложению прогрузиться, прежде чем лезть в сеть, дальше — раз в шесть часов.
  setTimeout(() => { void pollUpdates(window) }, 4000)
  checkTimer = setInterval(() => { void pollUpdates(window) }, 6 * 60 * 60 * 1000)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Обновление применяется на выходе: пользователь не ждёт сборку посреди занятия.
app.on('will-quit', () => {
  if (checkTimer) clearInterval(checkTimer)
  if (!pendingUpdate) return
  const update = pendingUpdate
  pendingUpdate = null
  runUpdate(update.projectRoot, { restart: false })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
