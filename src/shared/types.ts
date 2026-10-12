// Types partagés entre le main process, le preload et le renderer.

export type Position = 'top' | 'jungle' | 'mid' | 'adc' | 'support'
export const POSITIONS: Position[] = ['top', 'jungle', 'mid', 'adc', 'support']

export const REGIONS = [
  'EUW', 'EUNE', 'NA', 'KR', 'BR', 'LAN', 'LAS', 'OCE', 'JP', 'TR', 'RU', 'ME', 'SG', 'TW', 'VN'
] as const
export type Region = (typeof REGIONS)[number]

export interface RiotAccount {
  gameName: string
  tagLine: string
  region: Region
  puuid?: string
}

export interface ClientStatus {
  connected: boolean
  account?: RiotAccount & { summonerLevel?: number; profileIconId?: number }
  phase?: string // gameflow phase LCU (Lobby, ChampSelect, InProgress...)
}

export interface ChampionInfo {
  id: number
  key: string // clé Data Dragon, ex: "MonkeyKing"
  name: string // nom affiché, ex: "Wukong"
}

export interface RankedEntry {
  queue: string // SOLORANKED, FLEXRANKED...
  tier: string | null
  division: number | null
  lp: number | null
  wins: number
  losses: number
  hotStreak: boolean
  emblemUrl: string | null
}

export interface ChampionPoolEntry {
  champion: string
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
}

export interface Profile {
  gameName: string
  tagLine: string
  level: number | null
  iconUrl: string | null
  ranked: RankedEntry[]
  champions: ChampionPoolEntry[]
}

export interface MatchSummary {
  id: string
  createdAt: string // ISO
  queue: string
  durationSec: number
  champion: string
  position: Position | null
  win: boolean
  remake: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  gold: number
  damage: number
  damageTaken: number
  visionWards: number
  wardsPlaced: number
  opScore: number | null
  items: number[]
  spells: number[]
  primaryRune: number | null
  secondaryPage: number | null
  allyBans: string[]
  enemyBans: string[]
  avgTier: string | null
}

export interface MatchParticipant {
  gameName: string
  tagLine: string
  isTarget: boolean
  team: string
  champion: string
  position: Position | null
  level: number
  kills: number
  deaths: number
  assists: number
  cs: number
  gold: number
  damage: number
  damageTaken: number
  visionWards: number
  wardsPlaced: number
  opScore: number | null
  opScoreRank: number | null
  items: number[]
  spells: number[]
  primaryRune: number | null
  secondaryPage: number | null
}

export interface MatchTeam {
  key: string
  win: boolean
  kills: number
  gold: number
  towers: number
  dragons: number
  barons: number
  heralds: number
  grubs: number
  participants: MatchParticipant[]
}

export interface MatchDetail {
  id: string
  teams: MatchTeam[]
}

// ---------- Draft helper ----------

export type CriterionKey = 'personal' | 'mastery' | 'meta' | 'matchup' | 'synergy'
export const CRITERIA: CriterionKey[] = ['personal', 'mastery', 'meta', 'matchup', 'synergy']

export interface CriterionSetting {
  enabled: boolean
  weight: number // 0..100
}

export type DraftWeights = Record<CriterionKey, CriterionSetting>

export interface DraftSlot {
  champion: string | null // nom affiché
  position: Position | null
}

/** File de la partie : détermine quelles games perso comptent dans le draft helper. */
export type DraftQueue = 'solo' | 'flex' | 'other'

export interface DraftState {
  queue: DraftQueue
  myPosition: Position | null
  allies: DraftSlot[] // sans le joueur local
  enemies: DraftSlot[]
  bans: string[]
  pickedByMe: string | null
  source: 'lcu' | 'manual'
}

export interface CriterionResult {
  value: number | null // 0..1, null = donnée absente (critère ignoré pour ce champion)
  label: string // explication courte
}

export interface Suggestion {
  champion: string
  score: number // 0..100
  components: Record<CriterionKey, CriterionResult>
  summary: string
}

export interface ModelInfo {
  trainedAt: string
  samples: number
  accuracy: number // validation croisée
  baseline: number // taux de victoire brut (précision "toujours win")
  weights: Record<CriterionKey, number>
}

export interface Settings {
  region: Region
  manualAccount: RiotAccount | null
  weights: DraftWeights
  useModel: boolean
  queueFilter: 'ranked' | 'all'
  candidatePool: 'owned' | 'played' | 'all'
  /** Importe runes + sorts dans le client dès que le champion est locké. */
  autoImport: boolean
  /** Palier de comparaison des stats et de l'overlay ; 'auto' = rang solo du compte. */
  compareTier: Tier | 'auto'
  overlay: OverlaySettings
}

export const DEFAULT_WEIGHTS: DraftWeights = {
  personal: { enabled: true, weight: 30 },
  mastery: { enabled: true, weight: 15 },
  meta: { enabled: true, weight: 20 },
  matchup: { enabled: true, weight: 25 },
  synergy: { enabled: true, weight: 10 }
}

export const DEFAULT_SETTINGS: Settings = {
  region: 'EUW',
  manualAccount: null,
  weights: DEFAULT_WEIGHTS,
  useModel: false,
  queueFilter: 'ranked',
  candidatePool: 'played',
  autoImport: false,
  compareTier: 'auto',
  overlay: {
    enabled: true,
    mode: 'overlay',
    displayId: null,
    metrics: { cs: true, vision: true, gold: false, kp: false },
    goldDiffOnTab: true,
    scoreboard: { x: 50, y: 38, spacing: 6.2, swapSides: false, calibrate: false },
    positions: {
      cs: { x: 86, y: 6 },
      vision: { x: 86, y: 9 },
      gold: { x: 86, y: 12 },
      kp: { x: 86, y: 15 },
      build: { x: 74, y: 30 }
    },
    toggleKey: 'Control+Shift+H',
    buildKey: 'Control+Shift+B',
    editKey: 'Control+Shift+M'
  }
}

export interface StatsAggregate {
  games: number
  wins: number
  kda: number
  csPerMin: number
  damagePerMin: number
  visionPerGame: number
  wardsPerMin: number
  goldPerMin: number
  deathsPer10: number
  byChampion: Array<{ champion: string; games: number; wins: number; kda: number; csPerMin: number }>
  byPosition: Array<{ position: Position; games: number; wins: number }>
  trend: Array<{ date: string; win: boolean; kda: number; opScore: number | null; cumulativeWr: number }>
  skills: SkillAxis[]
  tier: Tier // palier de comparaison
  /** Médianes du palier, pondérées par tes rôles joués (pour comparer les tuiles). */
  tierBench: TierBenchmark | null
}

export type SkillKey = 'combat' | 'farm' | 'damage' | 'vision' | 'survival' | 'economy'

/** Un axe du radar : note 0..100 (50 = repère médian du rôle, 90 = très bon). */
export interface SkillAxis {
  key: SkillKey
  label: string
  overall: number
  recent: number | null // 10 dernières games, null si moins de 10 games au total
  rawOverall: number
  rawRecent: number | null
  unit: string
}

// ---------- Build (runes, sorts, items, compétences) ----------

export interface BuildOption {
  ids: number[]
  names: string[]
  games: number
  winRate: number
  pickRate: number
}

export interface ChampionBuild {
  champion: string
  position: Position
  runes: {
    primaryStyle: number
    primaryName: string
    subStyle: number
    subName: string
    perks: number[] // 4 runes principales + 2 secondaires
    perkNames: string[]
    shards: number[] // 3 fragments de stats
    games: number
    winRate: number
  } | null
  spells: BuildOption | null
  starter: BuildOption | null
  core: BuildOption | null
  boots: BuildOption | null
  fourth: BuildOption[]
  fifth: BuildOption[]
  sixth: BuildOption[]
  skillOrder: string[] // 15 premiers niveaux, ex. ["Q","W","E","Q",…]
  skillPriority: string[] // ordre de montée, ex. ["Q","E","W"]
}

export interface ImportResult {
  runes?: string
  spells?: string
  items?: string
  errors: string[]
}

// ---------- Overlay en jeu ----------

export type OverlayMetric = 'cs' | 'vision' | 'gold' | 'kp'
export const OVERLAY_METRICS: OverlayMetric[] = ['cs', 'vision', 'gold', 'kp']

/** Paliers utilisés pour les comparaisons (Master regroupe Master, Grandmaster et Challenger). */
export const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'] as const
export type Tier = (typeof TIERS)[number]
export const TIER_LABELS: Record<Tier, string> = {
  IRON: 'Fer',
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
  PLATINUM: 'Platine',
  EMERALD: 'Émeraude',
  DIAMOND: 'Diamant',
  MASTER: 'Master+'
}

/** Médianes d'un rôle dans un palier. */
export interface TierBenchmark {
  samples: number
  csPerMin: number
  goldPerMin: number
  damagePerMin: number
  wardsPerMin: number
  deathsPer10: number
  kda: number
  killParticipation: number
  visionPerMin: number // estimation (le score de vision n'est pas dans les données OP.GG)
}

export interface OverlaySettings {
  enabled: boolean
  /** overlay : par-dessus le jeu ; window : fenêtre classique, typiquement sur un second écran. */
  mode: 'overlay' | 'window'
  displayId: number | null // écran de la fenêtre (null = écran principal)
  metrics: Record<OverlayMetric, boolean>
  goldDiffOnTab: boolean // écart d'or par lane tant que Tab est maintenu
  scoreboard: ScoreboardLayout
  /** Position de chaque élément de l'overlay (coin haut gauche, en % de l'écran), déplaçable. */
  positions: Record<OverlayWidget, WidgetPosition>
  toggleKey: string // raccourci global (format Electron), ex. "Control+Shift+H"
  buildKey: string
  editKey: string // active le déplacement des éléments
}

export type OverlayWidget = 'cs' | 'vision' | 'gold' | 'kp' | 'build'
export interface WidgetPosition {
  x: number
  y: number
}

/** Colonne en haut à droite, sous le score du jeu ; le build au milieu à droite. */
export const DEFAULT_POSITIONS: Record<OverlayWidget, WidgetPosition> = {
  cs: { x: 86, y: 6 },
  vision: { x: 86, y: 9 },
  gold: { x: 86, y: 12 },
  kp: { x: 86, y: 15 },
  build: { x: 74, y: 30 }
}

/**
 * Position des écarts d'or sur le tableau des scores (Tab) du jeu, en % de l'écran.
 * Le tableau met les deux équipes côte à côte, une ligne par lane : les écarts se placent
 * sur la ligne centrale. Réglable car la taille du tableau dépend de la résolution.
 */
export interface ScoreboardLayout {
  x: number // centre horizontal (% de la largeur)
  y: number // centre de la 1re ligne (% de la hauteur)
  spacing: number // écart entre deux lignes (% de la hauteur)
  swapSides: boolean // ton équipe affichée à droite au lieu de gauche
  calibrate: boolean // affichage permanent pour régler la position
}

export const DEFAULT_SCOREBOARD: ScoreboardLayout = { x: 50, y: 38, spacing: 6.2, swapSides: false, calibrate: false }

export const DEFAULT_OVERLAY: OverlaySettings = {
  enabled: true,
  mode: 'overlay',
  displayId: null,
  metrics: { cs: true, vision: true, gold: false, kp: false },
  goldDiffOnTab: true,
  scoreboard: DEFAULT_SCOREBOARD,
  positions: DEFAULT_POSITIONS,
  toggleKey: 'Control+Shift+H',
  buildKey: 'Control+Shift+B',
  editKey: 'Control+Shift+M'
}

/** Écart d'or estimé (valeur des items) entre les deux joueurs d'une lane, vu de ton équipe. */
export interface LaneGold {
  position: Position
  ally: string | null
  enemy: string | null
  diff: number // > 0 : ton côté mène
  mine: boolean
}

/** Stats du joueur pendant la partie (Live Client Data API). */
export interface LiveStats {
  champion: string
  position: Position | null
  gameTime: number // secondes
  level: number
  cs: number
  csPerMin: number
  tier: Tier // palier de comparaison
  bench: TierBenchmark | null // médianes du palier pour ce rôle
  visionPerMin: number
  lanes: LaneGold[]
  side: 'blue' | 'red' // côté de ton équipe
  teamGoldDiff: number // or estimé de ton équipe moins celui de l'adversaire
  kills: number
  deaths: number
  assists: number
  killParticipation: number
  vision: number
  currentGold: number
  goldEarned: number // estimé : valeur des items + or en poche
  goldPerMin: number
}

export interface OverlayUi {
  visible: boolean
  showBuild: boolean
  tabHeld: boolean
  editing: boolean // mode déplacement : l'overlay reçoit la souris
}

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
  width: number
  height: number
}

export type RunePage = NonNullable<ChampionBuild['runes']>

/** Statistiques OP.GG du champion dans un matchup précis (agrégées séparément par catégorie). */
export interface MatchupBuild {
  champion: string
  opponent: string
  position: Position
  runePages: RunePage[] // 2 pages les plus jouées
  spells: BuildOption[]
  starter: BuildOption | null
  boots: BuildOption[]
  cores: BuildOption[]
  skillOrder: string[]
}

/** Une game réelle d'un joueur high elo, telle qu'elle a été jouée. */
export interface ProGame {
  player: string
  tier: string | null
  region: string
  createdAt: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  opponent: string | null
}

/** Ensemble cohérent runes + sorts + items, regroupé à partir de vraies games. */
export interface BuildVariant {
  games: number
  wins: number
  vsOpponent: number
  keystone: number
  subStyle: number
  runes: RunePage | null // page complète la plus jouée avec cette keystone et cet arbre secondaire
  spells: number[]
  items: number[] // items terminés les plus fréquents dans ces games, dans l'ordre de fréquence
  boots: number | null
  examples: ProGame[]
}

export interface ProBuilds {
  champion: string
  position: Position
  opponent: string | null
  gamesAnalyzed: number
  players: number
  variants: BuildVariant[]
}
