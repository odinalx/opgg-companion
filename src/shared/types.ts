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
  autoImport: false
}

export interface StatsAggregate {
  games: number
  wins: number
  kda: number
  csPerMin: number
  damagePerMin: number
  visionPerGame: number
  byChampion: Array<{ champion: string; games: number; wins: number; kda: number; csPerMin: number }>
  byPosition: Array<{ position: Position; games: number; wins: number }>
  trend: Array<{ date: string; win: boolean; kda: number; opScore: number | null; cumulativeWr: number }>
  skills: SkillAxis[]
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
