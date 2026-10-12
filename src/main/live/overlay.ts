// Overlay en jeu : fenêtre transparente au premier plan, qui ne capte pas la souris,
// alimentée par l'API de jeu locale (Live Client Data, https://127.0.0.1:2999).
// Fonctionne avec LoL en mode « Sans bordure » (le plein écran exclusif masque toute fenêtre).

import { BrowserWindow, globalShortcut, screen } from 'electron'
import { request as httpRequest } from 'node:http'
import { Agent, request } from 'node:https'
import type { LiveStats, OverlaySettings, OverlayUi, Tier } from '@shared/types'
import { loadStaticData } from '../ddragon'
import { isTabDown } from './keys'
import { computeLiveStats } from './liveStats'

// L'API de jeu n'écoute qu'en local ; une URL de remplacement (dev, faux client) doit l'être aussi,
// puisque la vérification du certificat est désactivée pour ce certificat auto-signé.
const LIVE_URL = (() => {
  const custom = process.env.LIVE_CLIENT_URL
  if (custom && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(custom)) return custom
  return 'https://127.0.0.1:2999'
})()
const localAgent = new Agent({ rejectUnauthorized: false })
/** Cadences : en partie, sans client LoL détecté (repli), contrôle de Tab, réaffirmation au premier plan. */
const IN_GAME_MS = 2000
const FALLBACK_MS = 5000
const TAB_MS = 50
const TOPMOST_EVERY = 5 // ticks, soit 10 s
/** Phases du client où une partie peut tourner (l'API de jeu n'existe qu'à ce moment-là). */
const GAME_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect'])

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
  private ui: OverlayUi = { visible: true, showBuild: false, tabHeld: false, editing: false }
  private tabTimer: NodeJS.Timeout | null = null
  private stats: LiveStats | null = null
  private misses = 0
  /** Fenêtre « second écran » fermée par l'utilisateur : on ne la rouvre pas avant la partie suivante. */
  private closedByUser = false

  private stopped = false
  private ticks = 0
  /** Palier de comparaison, calculé une fois par partie (évite un appel OP.GG à chaque tick). */
  private tier: Tier | null = null
  private shortcutsOn = false

  constructor(
    private readonly getSettings: () => OverlaySettings,
    private readonly getTier: () => Promise<Tier>,
    /** Phase du client LoL, ou null s'il n'est pas détecté. */
    private readonly getPhase: () => string | null,
    private readonly load: (win: BrowserWindow) => void,
    private readonly preload: string
  ) {}

  start(): void {
    this.applySettings()
    const loop = async (): Promise<void> => {
      await this.tick().catch(() => undefined)
      if (this.stopped) return
      const phase = this.getPhase()
      const inGame = !!this.stats || (phase !== null && GAME_PHASES.has(phase))
      this.timer = setTimeout(() => void loop(), inGame ? IN_GAME_MS : FALLBACK_MS)
    }
    void loop()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.stopTab()
    this.unbindShortcuts()
    this.hide()
  }

  /** Tab maintenu (tableau des scores) : lecture passive, seulement tant que l'overlay existe. */
  private startTab(): void {
    if (this.tabTimer || process.env.OPGG_CAPTURE_DIR) return
    const s = this.getSettings()
    if (s.mode !== 'overlay' || !s.goldDiffOnTab) return
    this.tabTimer = setInterval(() => {
      const held = isTabDown()
      if (held !== this.ui.tabHeld) this.setUi({ tabHeld: held })
    }, TAB_MS)
  }

  private stopTab(): void {
    if (this.tabTimer) clearInterval(this.tabTimer)
    this.tabTimer = null
  }

  getStats(): LiveStats | null {
    return this.stats
  }

  getUi(): OverlayUi {
    return this.ui
  }

  inGame(): boolean {
    return !!this.stats
  }

  private mode: OverlaySettings['mode'] | null = null
  private displayId: number | null = null

  /** À rappeler quand les réglages changent : raccourcis, visibilité, mode et écran. */
  applySettings(): void {
    const s = this.getSettings()
    if (!s.enabled) {
      this.hide()
      return
    }
    // Changement de mode ou d'écran : la fenêtre sera recréée au prochain tick, hors mode déplacement.
    if (this.win && (s.mode !== this.mode || (s.mode === 'window' && s.displayId !== this.displayId))) {
      const w = this.win
      this.win = null
      this.ui = { ...this.ui, editing: false }
      w.destroy()
    }
    // Raccourcis actifs seulement pendant une partie : hors partie, ils restent libres pour les autres applis.
    if (this.win) this.bindShortcuts()
    this.stopTab()
    if (this.win) this.startTab()
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('overlay:settings', s)
  }

  private bindShortcuts(): string[] {
    this.unbindShortcuts()
    const s = this.getSettings()
    const errors: string[] = []
    const bind = (key: string, fn: () => void): void => {
      try {
        if (!globalShortcut.register(key, fn)) errors.push(`${key} est déjà utilisé par une autre application`)
      } catch {
        errors.push(`${key} n'est pas un raccourci valide`)
      }
    }
    bind(s.toggleKey, () => {
      // Masquer pendant le mode déplacement laisserait une couche invisible qui capte les clics du jeu.
      if (this.ui.editing) this.setEditing(false)
      this.setUi({ visible: !this.ui.visible })
    })
    bind(s.buildKey, () => this.setUi({ showBuild: !this.ui.showBuild, visible: true }))
    if (s.mode === 'overlay') bind(s.editKey, () => this.setEditing(!this.ui.editing))
    this.shortcutsOn = true
    return errors
  }

  private unbindShortcuts(): void {
    if (!this.shortcutsOn) return
    globalShortcut.unregisterAll()
    this.shortcutsOn = false
  }

  /**
   * Vérifie qu'un raccourci peut être enregistré (pour prévenir dans les réglages), sans le
   * garder : il ne sera réellement pris qu'en partie.
   */
  checkShortcut(key: string): string | null {
    const s = this.getSettings()
    if (this.shortcutsOn && [s.toggleKey, s.buildKey, s.editKey].includes(key)) return null
    try {
      if (!globalShortcut.register(key, () => undefined)) return `${key} est déjà utilisé par une autre application`
      globalShortcut.unregister(key)
      return null
    } catch {
      return `${key} n'est pas un raccourci valide`
    }
  }

  /**
   * Mode déplacement : l'overlay reçoit la souris le temps de glisser les éléments, puis
   * redevient transparent aux clics et non focusable. Uniquement pendant une partie.
   */
  setEditing(on: boolean): void {
    if (on && (!this.stats || !this.getSettings().enabled)) return // l'overlay n'existe qu'en partie
    if (on && this.getSettings().mode === 'overlay') {
      this.ensureWindow()
      const w = this.win
      if (!w || w.isDestroyed()) return
      w.setIgnoreMouseEvents(false)
      w.setFocusable(true)
      w.focus()
    } else if (this.win && !this.win.isDestroyed() && this.mode === 'overlay') {
      this.win.setIgnoreMouseEvents(true)
      this.win.setFocusable(false)
    }
    this.setUi({ editing: on && this.getSettings().mode === 'overlay', visible: true })
  }

  /** Utilisé par le mode capture (pas de touche à presser). */
  getWindow(): BrowserWindow | null {
    return this.win
  }

  setUi(patch: Partial<OverlayUi>): void {
    this.ui = { ...this.ui, ...patch }
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('overlay:ui', this.ui)
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    // Hors partie (salon, sélection…), l'API de jeu n'existe pas : inutile de l'interroger.
    const phase = this.getPhase()
    if (phase !== null && !GAME_PHASES.has(phase)) {
      if (this.stats) this.endGame()
      return
    }
    try {
      const data = await fetchLive('/liveclientdata/allgamedata')
      await loadStaticData()
      const tier = await this.currentTier()
      if (this.stopped) return // fermeture de l'app pendant les appels
      this.stats = computeLiveStats(data, tier)
      this.misses = 0
      if (this.stats && this.getSettings().enabled && !this.closedByUser) {
        this.ensureWindow()
        const w = this.win
        if (!w || w.isDestroyed()) return
        // Le jeu peut repasser au premier plan : on remet l'overlay au-dessus (sans l'activer), de temps en temps.
        if (this.mode === 'overlay' && ++this.ticks % TOPMOST_EVERY === 0) w.setAlwaysOnTop(true, 'screen-saver')
        w.webContents.send('overlay:stats', this.stats)
      }
    } catch {
      // Écran de chargement ou fin de partie : on ferme l'overlay après quelques échecs.
      if (++this.misses >= 3 && this.stats) this.endGame()
    }
  }

  private tierPending: Promise<Tier> | null = null

  /**
   * Palier de comparaison sans jamais bloquer le HUD : si OP.GG tarde, Or sert en attendant,
   * et le vrai palier remplace le repli dès qu'il arrive (il est ensuite gardé pour la partie).
   */
  private currentTier(): Promise<Tier> {
    if (this.tier) return Promise.resolve(this.tier)
    this.tierPending ??= this.getTier()
      .then((t) => (this.tier = t))
      .catch(() => 'GOLD' as Tier)
      .finally(() => (this.tierPending = null))
    const fallback = new Promise<Tier>((r) => setTimeout(() => r('GOLD'), 4000))
    return Promise.race([this.tierPending, fallback])
  }

  private endGame(): void {
    this.stats = null
    this.tier = null
    this.misses = 0
    this.closedByUser = false
    this.hide()
  }

  private ensureWindow(): void {
    if (this.win || this.stopped) return
    const s = this.getSettings()
    this.mode = s.mode
    this.displayId = s.displayId
    // L'écran choisi ne vaut que pour la fenêtre séparée ; l'overlay couvre l'écran principal (celui du jeu).
    const display =
      (s.mode === 'window' && screen.getAllDisplays().find((d) => d.id === s.displayId)) || screen.getPrimaryDisplay()
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
        show: false, // affichée sans activation : la partie garde le focus
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
        show: false, // jamais activée : les clics et le clavier restent au jeu
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
        this.stopTab()
        this.unbindShortcuts()
      }
    })
    this.load(win)
    // Dans les deux modes, la fenêtre apparaît sans prendre le focus du jeu.
    win.once('ready-to-show', () => win.showInactive())
    this.win = win
    this.startTab()
    this.bindShortcuts()
  }

  private hide(): void {
    this.stopTab()
    this.unbindShortcuts()
    const w = this.win
    this.win = null // avant destroy : ce n'est pas une fermeture par l'utilisateur
    if (w && !w.isDestroyed()) w.destroy()
    this.ui = { visible: true, showBuild: false, tabHeld: false, editing: false }
  }
}
