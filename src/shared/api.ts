// Contrat IPC entre le renderer et le main process (exposé via window.api).

import type {
  ClientStatus,
  DraftState,
  DraftWeights,
  MatchDetail,
  MatchSummary,
  ModelInfo,
  Profile,
  RiotAccount,
  Settings,
  StatsAggregate,
  Suggestion,
  ChampionInfo,
  ChampionBuild,
  ImportResult,
  Position,
  LiveStats,
  OverlaySettings,
  OverlayUi,
  DisplayInfo
} from './types'

export interface StaticDataDto {
  version: string
  champions: ChampionInfo[]
  spells: Record<number, string>
  runes: Record<number, string>
}

export interface DraftResultDto {
  suggestions: Suggestion[]
  warnings: string[]
  enemyLaner: string | null
  weightsUsed: DraftWeights
  usedModel: boolean
}

export interface Api {
  getStatic(): Promise<StaticDataDto>
  getClientStatus(): Promise<ClientStatus>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  currentAccount(): Promise<RiotAccount | null>
  getProfile(acc: RiotAccount): Promise<Profile>
  getMatches(acc: RiotAccount, refresh: boolean): Promise<{ matches: MatchSummary[]; errors: string[] }>
  getMatchDetail(acc: RiotAccount, match: Pick<MatchSummary, 'id' | 'createdAt'>): Promise<MatchDetail>
  getStats(acc: RiotAccount): Promise<StatsAggregate>
  getLiveDraft(): Promise<DraftState | null>
  suggest(state: DraftState): Promise<DraftResultDto>
  getModel(): Promise<ModelInfo | null>
  trainModel(): Promise<ModelInfo>
  openExternal(url: string): Promise<void>
  getBuild(champion: string, position: Position): Promise<ChampionBuild>
  importBuild(champion: string, position: Position, parts: { runes?: boolean; spells?: boolean; items?: boolean }): Promise<ImportResult>
  getOverlayState(): Promise<{ stats: LiveStats | null; ui: OverlayUi; settings: OverlaySettings }>
  getDisplays(): Promise<DisplayInfo[]>
  launchRiotClient(): Promise<void>
  signOut(): Promise<void>
  onClientStatus(cb: (s: ClientStatus) => void): () => void
  onLiveDraft(cb: (d: DraftState | null) => void): () => void
  onTrainProgress(cb: (p: { done: number; total: number }) => void): () => void
  onAutoImport(cb: (r: ImportResult & { champion: string }) => void): () => void
  onOverlayStats(cb: (s: LiveStats) => void): () => void
  onOverlayUi(cb: (ui: OverlayUi) => void): () => void
  onOverlaySettings(cb: (s: OverlaySettings) => void): () => void
}

export type ApiMethod = Exclude<keyof Api, `on${string}`>
