const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

app.setName('REQuest')

function createWindow() {
  const window = new BrowserWindow({
    title: 'REQuest — практические профессии',
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
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
