import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Api, ApiMethod } from '@shared/api'
import { AppService } from './app'
import { launchRiotClient } from './lcu/launcher'

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
  launchRiotClient: async () => launchRiotClient(),
  signOut: async () => void service.setSettings({ manualAccount: null }),
  openExternal: async (url) => {
    if (/^https:\/\//.test(url)) await shell.openExternal(url)
  }
}

function createWindow(): void {
  const capture = !!process.env.OPGG_CAPTURE_DIR
  win = new BrowserWindow({
    width: capture ? 1600 : 1280,
    height: capture ? 1000 : 820,
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
  if (process.env.OPGG_CAPTURE_DIR) void captureAllPages(win, process.env.OPGG_CAPTURE_DIR)
}

/** Outil de dev : parcourt chaque page et enregistre une capture PNG, puis quitte. */
async function captureAllPages(w: BrowserWindow, dir: string): Promise<void> {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(dir, { recursive: true })
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  await new Promise<void>((r) => w.webContents.once('did-finish-load', () => r()))
  await wait(Number(process.env.OPGG_CAPTURE_DELAY ?? 8000))
  for (const page of ['profile', 'matches', 'stats', 'draft', 'settings']) {
    await w.webContents.executeJavaScript(`document.querySelector('[data-nav="${page}"]')?.click()`)
    await wait(Number(process.env.OPGG_CAPTURE_DELAY ?? 8000))
    writeFileSync(join(dir, `${page}.png`), (await w.webContents.capturePage()).toPNG())
  }
  // OPGG_CAPTURE_SIM="jungle|Ahri,Garen|Vi,Jinx,Darius" : simulation de draft (rôle|alliés|ennemis).
  const sim = process.env.OPGG_CAPTURE_SIM
  if (sim) {
    const [role, allies, enemies] = sim.split('|')
    await w.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const click = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text)?.click()
      document.querySelector('[data-nav="draft"]').click(); await wait(500)
      click('button', 'Simulation'); await wait(500)
      click('[role=radio]', ${JSON.stringify(role.charAt(0).toUpperCase() + role.slice(1))}); await wait(300)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      const inputs = [...document.querySelectorAll('input[aria-label="Champion"]')]
      const fill = (el, v) => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) };
      ${JSON.stringify(allies.split(','))}.forEach((c, i) => c && fill(inputs[i], c));
      ${JSON.stringify(enemies.split(','))}.forEach((c, i) => c && fill(inputs[4 + i], c));
    })()`)
    await wait(Number(process.env.OPGG_CAPTURE_DELAY ?? 8000) * 2)
    writeFileSync(join(dir, `draft-sim-${role}.png`), (await w.webContents.capturePage()).toPNG())
  }
  app.quit()
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
