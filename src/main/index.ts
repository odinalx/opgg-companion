import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Api, ApiMethod } from '@shared/api'
import { AppService } from './app'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null

const service = new AppService(join(app.getPath('userData'), 'data'), (channel, payload) =>
  win?.webContents.send(channel, payload)
)

// Chaque méthode de l'API renderer correspond à un handler IPC du même nom.
const handlers: { [K in ApiMethod]: (...args: Parameters<Api[K]>) => ReturnType<Api[K]> | Awaited<ReturnType<Api[K]>> } = {
  getStatic: () => service.getStatic(),
  getClientStatus: () => service.getClientStatus(),
  getSettings: () => service.getSettings(),
  setSettings: (patch) => service.setSettings(patch),
  currentAccount: () => service.currentAccount(),
  getProfile: (acc) => service.getProfile(acc),
  getMatches: (acc, refresh) => service.getMatches(acc, refresh),
  getMatchDetail: (acc, match) => service.getMatchDetail(acc, match),
  getStats: (acc) => service.getStats(acc),
  getLiveDraft: () => service.getLiveDraft(),
  suggest: (state) => service.suggest(state),
  getModel: () => service.getModel(),
  trainModel: () => service.trainModel((done, total) => win?.webContents.send('model:progress', { done, total })),
  openExternal: async (url) => {
    if (/^https:\/\//.test(url)) await shell.openExternal(url)
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0b0e14',
    title: 'OPGG Companion',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(here, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

app.whenReady().then(() => {
  for (const [name, fn] of Object.entries(handlers))
    ipcMain.handle(name, (_e, ...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args))
  service.start()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  service.shutdown()
  app.quit()
})
