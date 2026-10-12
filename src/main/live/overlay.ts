// Overlay en jeu : fenêtre transparente au premier plan, qui ne capte pas la souris,
// alimentée par l'API de jeu locale (Live Client Data, https://127.0.0.1:2999).
// Fonctionne avec LoL en mode « Sans bordure » (le plein écran exclusif masque toute fenêtre).

import { BrowserWindow, globalShortcut, screen } from 'electron'
import { request as httpRequest } from 'node:http'
import { Agent, request } from 'node:https'
import type { LiveStats, OverlaySettings, OverlayUi, Tier } from '@shared/types'
import { loadStaticData } from '../ddragon'
import { isTabDown } from './keys'
import { computeLiveStats, MILESTONES } from './liveStats'

const LIVE_URL = process.env.LIVE_CLIENT_URL ?? 'https://127.0.0.1:2999'
const localAgent = new Agent({ rejectUnauthorized: false })
const POLL_MS = 1000

function fetchLive(path: string): Promise<any> {
  const url = new URL(path, LIVE_URL)
  return new Promise((resolve, reject) => {
    const opts = { host: url.hostname, port: url.port, path: url.pathname, timeout: 1500 }
    const req = url.protocol === 'https:' ? request({ ...opts, agent: localAgent }) : httpRequest(opts)
    req.on('response', (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        if ((res.statusCode ?? 500) >= 400) return reject(new Error(`live ${res.statusCode}`))
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('live timeout')))
    req.on('error', reject)
    req.end()
  })
}

export class OverlayManager {
  private win: BrowserWindow | null = null
  private timer: NodeJS.Timeout | null = null
  private ui: OverlayUi = { visible: true, showBuild: false, tabHeld: false }
  private tabTimer: NodeJS.Timeout | null = null
  /** CS au passage de chaque repère (10/15/20 min) de la partie en cours. */
  private milestones = new Map<number, { cs: number; expected: number }>()
  private stats: LiveStats | null = null
  private misses = 0
  /** Fenêtre « second écran » fermée par l'utilisateur : on ne la rouvre pas avant la partie suivante. */
  private closedByUser = false

  constructor(
    private readonly getSettings: () => OverlaySettings,
    private readonly getTier: () => Promise<Tier>,
    private readonly load: (win: BrowserWindow) => void,
    private readonly preload: string
  ) {}

  start(): void {
    this.applySettings()
    this.timer = setInterval(() => void this.tick(), POLL_MS)
    // Tab maintenu (tableau des scores) : affiche l'écart d'or par lane. Lecture passive, 20 fois/s.
    this.tabTimer = setInterval(() => {
      if (!this.win || !this.stats || process.env.OPGG_CAPTURE_DIR) return
      const held = isTabDown()
      if (held !== this.ui.tabHeld) this.setUi({ tabHeld: held })
    }, 50)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.tabTimer) clearInterval(this.tabTimer)
    globalShortcut.unregisterAll()
    this.win?.destroy()
  }

  getStats(): LiveStats | null {
    return this.stats
  }

  getUi(): OverlayUi {
    return this.ui
  }

  private mode: OverlaySettings['mode'] | null = null
  private displayId: number | null = null

  /** À rappeler quand les réglages changent : raccourcis, visibilité, mode et écran. */
  applySettings(): string[] {
    const s = this.getSettings()
    // Changement de mode ou d'écran : la fenêtre sera recréée au prochain tick.
    if (this.win && (s.mode !== this.mode || s.displayId !== this.displayId)) {
      const w = this.win
      this.win = null
      w.destroy()
    }
    globalShortcut.unregisterAll()
    const errors: string[] = []
    const bind = (key: string, fn: () => void): void => {
      try {
        if (!globalShortcut.register(key, fn)) errors.push(`raccourci ${key} déjà utilisé par une autre application`)
      } catch {
        errors.push(`raccourci ${key} invalide`)
      }
    }
    if (s.enabled) {
      bind(s.toggleKey, () => this.setUi({ visible: !this.ui.visible }))
      bind(s.buildKey, () => this.setUi({ showBuild: !this.ui.showBuild, visible: true }))
    } else this.hide()
    this.win?.webContents.send('overlay:settings', s)
    return errors
  }

  /** Utilisé par le mode capture (pas de touche à presser). */
  getWindow(): BrowserWindow | null {
    return this.win
  }

  setUi(patch: Partial<OverlayUi>): void {
    this.ui = { ...this.ui, ...patch }
    this.win?.webContents.send('overlay:ui', this.ui)
  }

  private async tick(): Promise<void> {
    try {
      const data = await fetchLive('/liveclientdata/allgamedata')
      await loadStaticData()
      const stats = computeLiveStats(data, await this.getTier())
      if (stats) {
        for (const m of MILESTONES)
          if (stats.gameTime >= m * 60 && !this.milestones.has(m) && stats.gameTime < m * 60 + 90 && stats.bench)
            this.milestones.set(m, { cs: stats.cs, expected: Math.round(stats.csExpected) })
        stats.milestones = [...this.milestones.entries()].map(([minute, v]) => ({ minute, ...v }))
      }
      this.stats = stats
      this.misses = 0
      if (this.stats && this.getSettings().enabled && !this.closedByUser) {
        this.ensureWindow()
        this.win?.webContents.send('overlay:stats', this.stats)
      }
    } catch {
      // Pas de partie en cours (ou écran de chargement) : on ferme l'overlay après quelques échecs.
      if (++this.misses === 5) {
        this.stats = null
        this.milestones.clear()
        this.closedByUser = false
        this.hide()
      }
    }
  }

  private ensureWindow(): void {
    if (this.win) return
    const s = this.getSettings()
    this.mode = s.mode
    this.displayId = s.displayId
    const display = screen.getAllDisplays().find((d) => d.id === s.displayId) ?? screen.getPrimaryDisplay()
    const webPreferences = { preload: this.preload, contextIsolation: true, sandbox: true }
    let win: BrowserWindow
    if (s.mode === 'window') {
      // Fenêtre classique sur l'écran choisi : déplaçable, cliquable, à côté du jeu.
      const { x, y, width, height } = display.workArea
      const w = Math.min(520, width)
      win = new BrowserWindow({
        x: x + width - w,
        y,
        width: w,
        height,
        minWidth: 380,
        title: 'OPGG Companion – En jeu',
        backgroundColor: '#080c14',
        autoHideMenuBar: true,
        webPreferences
      })
    } else {
      win = new BrowserWindow({
        ...display.bounds,
        transparent: true,
        frame: false,
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        title: 'OPGG Companion Overlay',
        backgroundColor: '#00000000',
        webPreferences
      })
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setIgnoreMouseEvents(true)
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    win.on('page-title-updated', (e) => e.preventDefault()) // garde le titre de la fenêtre
    win.on('closed', () => {
      if (this.win === win) {
        this.win = null
        this.closedByUser = true
      }
    })
    this.load(win)
    if (s.mode === 'window') win.show()
    else win.showInactive()
    this.win = win
  }

  private hide(): void {
    const w = this.win
    this.win = null // avant destroy : ce n'est pas une fermeture par l'utilisateur
    w?.destroy()
    this.ui = { visible: true, showBuild: false, tabHeld: false }
  }
}
