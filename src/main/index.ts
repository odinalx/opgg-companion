import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Api, ApiMethod } from '@shared/api'
import { AppService } from './app'
import { launchRiotClient } from './lcu/launcher'
import { OverlayManager } from './live/overlay'
import { sanitizeAccount, sanitizeBuild, sanitizeChampion, sanitizePosition, sanitizeSettingsPatch } from './validate'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null

const service = new AppService(join(app.getPath('userData'), 'data'), (channel, payload) =>
  win?.webContents.send(channel, payload)
)

function loadRenderer(w: BrowserWindow, query = ''): void {
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL + query)
  else void w.loadFile(join(here, '../renderer/index.html'), query ? { search: query.slice(1) } : undefined)
}

const overlay = new OverlayManager(
  () => service.getSettings().overlay,
  () => service.comparisonTier(),
  () => {
    const st = service.lcu.getStatus()
    return st.connected ? (st.phase ?? 'None') : null
  },
  (w) => loadRenderer(w, '?overlay=1'),
  join(here, '../preload/index.cjs')
)

const importParts = (p: unknown) => {
  const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
  return { runes: o.runes === true, spells: o.spells === true, items: o.items === true }
}

// Mode capture (outil de dev : exécute du JS dans les pages) : jamais dans l'app installée.
const CAPTURE_DIR = app.isPackaged ? undefined : process.env.OPGG_CAPTURE_DIR

// Chaque méthode de l'API renderer correspond à un handler IPC du même nom.
const handlers: { [K in ApiMethod]: (...args: Parameters<Api[K]>) => ReturnType<Api[K]> | Awaited<ReturnType<Api[K]>> } = {
  getStatic: () => service.getStatic(),
  getClientStatus: () => service.getClientStatus(),
  getSettings: () => service.getSettings(),
  setSettings: (patch) => {
    const clean = sanitizeSettingsPatch(patch, service.getSettings())
    const next = service.setSettings(clean)
    if (clean.overlay) overlay.applySettings()
    // La fenêtre principale garde ainsi des réglages à jour, même modifiés depuis l'overlay.
    win?.webContents.send('settings:changed', next)
    return next
  },
  currentAccount: () => service.currentAccount(),
  getProfile: (acc) => service.getProfile(sanitizeAccount(acc)),
  getMatches: (acc, refresh) => service.getMatches(sanitizeAccount(acc), refresh === true),
  getMatchDetail: (acc, match) => {
    if (typeof match?.id !== 'string' || !/^[\w=%-]{1,120}$/.test(match.id) || typeof match.createdAt !== 'string')
      throw new Error('Game invalide.')
    return service.getMatchDetail(sanitizeAccount(acc), { id: match.id, createdAt: match.createdAt })
  },
  getStats: (acc) => service.getStats(sanitizeAccount(acc)),
  getLiveDraft: () => service.getLiveDraft(),
  suggest: (state) => service.suggest(state),
  getModel: () => service.getModel(),
  trainModel: () => service.trainModel((done, total) => win?.webContents.send('model:progress', { done, total })),
  getBuild: (champion, position) => service.opgg.getBuild(sanitizeChampion(champion), sanitizePosition(position)),
  importBuild: (champion, position, parts) =>
    service.importBuild(sanitizeChampion(champion), sanitizePosition(position), importParts(parts)),
  getMatchupBuild: (champion, position, opponent) =>
    service.opgg.getMatchupBuild(sanitizeChampion(champion), sanitizePosition(position), sanitizeChampion(opponent)),
  getProBuilds: (champion, position, opponent) =>
    service.getProBuilds(sanitizeChampion(champion), sanitizePosition(position), opponent === null ? null : sanitizeChampion(opponent)),
  importBuildData: (build, parts) => {
    const clean = sanitizeBuild(build)
    if (!clean) throw new Error('Build invalide.')
    return service.importBuildData(clean, importParts(parts))
  },
  setOverlayEditing: async (on) => overlay.setEditing(on === true),
  checkShortcut: (key) => (typeof key === 'string' && key.length <= 40 ? overlay.checkShortcut(key) : 'raccourci invalide'),
  isInGame: () => overlay.inGame(),
  getOverlayState: () => ({ stats: overlay.getStats(), ui: overlay.getUi(), settings: service.getSettings().overlay }),
  getDisplays: () => {
    const primary = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: d.label || `Écran ${i + 1}`,
      primary: d.id === primary,
      width: d.size.width,
      height: d.size.height
    }))
  },
  launchRiotClient: async () => launchRiotClient(),
  signOut: async () => void service.setSettings({ manualAccount: null }),
  openExternal: async (url) => {
    if (/^https:\/\//.test(url)) await shell.openExternal(url)
  }
}

function createWindow(): void {
  const capture = !!CAPTURE_DIR
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
      sandbox: true,
      // Mode capture : l'overlay plein écran masque la fenêtre, qui ne doit pas ralentir pour autant.
      backgroundThrottling: !capture
    }
  })
  loadRenderer(win)
  win.on('closed', () => {
    win = null
    app.quit() // l'overlay seul n'a pas de sens : fermer la fenêtre principale quitte l'app
  })
  if (CAPTURE_DIR) void captureAllPages(win, CAPTURE_DIR)
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
  // OPGG_CAPTURE_CLICK="<texte d'un bouton>" : clique ce bouton sur la page Draft puis capture.
  const clickLabel = process.env.OPGG_CAPTURE_CLICK
  if (clickLabel) {
    await w.webContents.executeJavaScript(
      `document.querySelector('[data-nav="draft"]').click(); setTimeout(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(clickLabel)})?.click(), 800)`
    )
    await wait(Number(process.env.OPGG_CAPTURE_CLICK_WAIT ?? 6000))
    writeFileSync(join(dir, 'draft-click.png'), (await w.webContents.capturePage()).toPNG())
  }
  // OPGG_CAPTURE_OVERLAY=1 : capture l'overlay (HUD puis build) pendant une partie simulée.
  if (process.env.OPGG_CAPTURE_OVERLAY) {
    const ow = overlay.getWindow()
    if (ow) {
      writeFileSync(join(dir, 'overlay-hud.png'), (await ow.webContents.capturePage()).toPNG())
      overlay.setUi({ showBuild: true })
      await wait(5000)
      writeFileSync(join(dir, 'overlay-build.png'), (await ow.webContents.capturePage()).toPNG())
      overlay.setUi({ showBuild: false, tabHeld: true })
      await wait(1500)
      writeFileSync(join(dir, 'overlay-tab.png'), (await ow.webContents.capturePage()).toPNG())
      overlay.setUi({ tabHeld: false })
      overlay.setEditing(true)
      await wait(2500)
      writeFileSync(join(dir, 'overlay-edit.png'), (await ow.webContents.capturePage()).toPNG())
      overlay.setEditing(false)
    } else writeFileSync(join(dir, 'overlay-missing.txt'), 'aucune partie détectée')
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

/** L'app ne charge que ses propres pages (fichiers locaux, ou serveur Vite en dev). */
function isAppUrl(url: string): boolean {
  const dev = process.env.ELECTRON_RENDERER_URL
  return url.startsWith('file://') || (!!dev && url.startsWith(dev))
}

// Aucune fenêtre ne peut naviguer ailleurs ni en ouvrir d'autres : une page distante hériterait
// de l'API exposée par le preload. Les liens https s'ouvrent dans le navigateur.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault()
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
})

app.whenReady().then(() => {
  for (const [name, fn] of Object.entries(handlers))
    ipcMain.handle(name, (e, ...args: unknown[]) => {
      // Les appels ne sont acceptés que depuis les pages de l'app.
      if (!isAppUrl(e.senderFrame?.url ?? '')) throw new Error('Origine refusée.')
      return (fn as (...a: unknown[]) => unknown)(...args)
    })
  service.start()
  overlay.start()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('before-quit', () => {
  overlay.stop()
  service.shutdown()
})
