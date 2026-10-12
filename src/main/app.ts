// Service applicatif : relie le client LoL, OP.GG, le stockage et le draft helper.
// Toutes les méthodes publiques sont exposées au renderer via IPC (voir index.ts).

import type {
  Tier,
  ChampionBuild,
  ProBuilds,
  Region,
  ImportResult,
  ClientStatus,
  DraftQueue,
  DraftState,
  MatchDetail,
  MatchSummary,
  ModelInfo,
  Position,
  Profile,
  RiotAccount,
  Settings,
  StatsAggregate
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { championById, loadStaticData, normalizeName, type StaticData } from './ddragon'
import { groupVariants, type SourcedGame } from './builds/variants'
import { tierBucket } from './benchmarks'
import { type DraftResult, DraftEngine, type PlayerContext } from './draft/engine'
import { featureVector } from './draft/score'
import { MIN_SAMPLES, type Sample, trainModel } from './draft/train'
import { sessionToDraft, lcuPosition } from './lcu/champSelect'
import { LcuConnector } from './lcu/connector'
import { importBuild } from './lcu/importer'
import { OpggClient } from './opgg/client'
import { aggregate, filterMatches, matchesForDraft, mergeMatches, RANKED_QUEUES } from './stats'
import { DiskCache, JsonFile, dataPath } from './store'

type Emit = (channel: string, payload: unknown) => void

const accKey = (a: RiotAccount): string => `${a.region}:${a.gameName}#${a.tagLine}`.toLowerCase()

export class AppService {
  private readonly settings: JsonFile<Settings>
  private readonly matches: JsonFile<Record<string, MatchSummary[]>>
  private readonly models: JsonFile<Record<string, ModelInfo>>
  private readonly cache: DiskCache
  readonly opgg: OpggClient
  readonly lcu = new LcuConnector()
  private readonly engine: DraftEngine
  private masteryCache: { at: number; value: Record<string, { level: number; points: number }> } | null = null
  private ownedCache: { at: number; value: string[] } | null = null

  constructor(dataDir: string, private readonly emit: Emit) {
    this.settings = new JsonFile(dataPath(dataDir, 'settings.json'), DEFAULT_SETTINGS)
    // Réglages enregistrés par une ancienne version : on complète avec les valeurs par défaut.
    this.settings.set({
      ...DEFAULT_SETTINGS,
      ...this.settings.get(),
      weights: { ...DEFAULT_SETTINGS.weights, ...this.settings.get().weights },
      overlay: {
        ...DEFAULT_SETTINGS.overlay,
        ...this.settings.get().overlay,
        metrics: { ...DEFAULT_SETTINGS.overlay.metrics, ...this.settings.get().overlay?.metrics },
        scoreboard: { ...DEFAULT_SETTINGS.overlay.scoreboard, ...this.settings.get().overlay?.scoreboard }
      }
    })
    this.matches = new JsonFile(dataPath(dataDir, 'matches.json'), {})
    this.models = new JsonFile(dataPath(dataDir, 'models.json'), {})
    this.cache = new DiskCache(dataPath(dataDir, 'cache.json'))
    this.opgg = new OpggClient(this.cache)
    this.engine = new DraftEngine(this.opgg)

    this.lcu.on('status', (s) => {
      this.emit('client:status', s)
      if (s.account) this.settings.update((cur) => ({ ...cur, region: s.account!.region }))
    })
    this.lcu.on('champSelect', (session) => {
      this.emit('draft:live', session ? sessionToDraft(session, this.lcu.getQueueId()) : null)
      void this.autoImportOnLock(session)
    })
  }

  start(): void {
    void loadStaticData().catch(() => undefined)
    // Préchauffe le cache de la méta pour que le premier draft soit rapide.
    void this.engine.loadAllMeta().catch(() => undefined)
    this.lcu.start()
  }

  shutdown(): void {
    this.lcu.stop()
    this.settings.flush()
    this.matches.flush()
    this.models.flush()
    this.cache.flush()
  }

  // ---------- Général ----------

  getStatic(): Promise<StaticData> {
    return loadStaticData()
  }

  getClientStatus(): ClientStatus {
    return this.lcu.getStatus()
  }

  getSettings(): Settings {
    return this.settings.get()
  }

  setSettings(patch: Partial<Settings>): Settings {
    return this.settings.update((cur) => ({ ...cur, ...patch }))
  }

  /** Compte actif : celui du client LoL s'il est lancé, sinon le compte saisi à la main. */
  currentAccount(): RiotAccount | null {
    const s = this.lcu.getStatus()
    if (s.connected && s.account) return s.account
    return this.settings.get().manualAccount
  }

  private isLocalAccount(acc: RiotAccount): boolean {
    const s = this.lcu.getStatus()
    return !!(s.connected && s.account && accKey(s.account) === accKey(acc))
  }

  // ---------- Profil & historique ----------

  getProfile(acc: RiotAccount): Promise<Profile> {
    return this.opgg.getProfile(acc)
  }

  /** Historique fusionné et persistant : il s'enrichit à chaque synchronisation. */
  async getMatches(acc: RiotAccount, refresh = true): Promise<{ matches: MatchSummary[]; errors: string[] }> {
    const key = accKey(acc)
    const errors: string[] = []
    if (refresh) {
      const sources: Array<Promise<MatchSummary[]>> = [this.opgg.listMatches(acc, 20)]
      if (this.isLocalAccount(acc)) sources.push(this.lcu.getMatchHistory(100))
      const results = await Promise.allSettled(sources)
      let merged = this.matches.get()[key] ?? []
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') merged = mergeMatches(merged, r.value)
        else errors.push(`${i === 0 ? 'OP.GG' : 'Client LoL'} : ${(r.reason as Error).message}`)
      })
      this.matches.update((all) => ({ ...all, [key]: merged }))
    }
    return { matches: this.matches.get()[key] ?? [], errors }
  }

  async getMatchDetail(acc: RiotAccount, match: Pick<MatchSummary, 'id' | 'createdAt'>): Promise<MatchDetail> {
    if (match.id.startsWith('lcu_')) return this.lcuMatchDetail(match.id)
    return this.opgg.getMatchDetail(acc, match.id, match.createdAt)
  }

  private async lcuMatchDetail(id: string): Promise<MatchDetail> {
    const g = await this.lcu.get(`/lol-match-history/v1/games/${id.slice(4)}`)
    const me = this.lcu.getStatus().account?.puuid
    const identities = new Map<number, any>((g.participantIdentities ?? []).map((pi: any) => [pi.participantId, pi.player]))
    const teams = (g.teams ?? []).map((t: any) => {
      const participants = (g.participants ?? [])
        .filter((p: any) => p.teamId === t.teamId)
        .map((p: any) => {
          const player = identities.get(p.participantId) ?? {}
          const s = p.stats ?? {}
          const lane = p.timeline?.lane
          return {
            gameName: player.gameName ?? player.summonerName ?? '?',
            tagLine: player.tagLine ?? '',
            isTarget: !!me && player.puuid === me,
            team: t.teamId === 100 ? 'BLUE' : 'RED',
            champion: championById(p.championId)?.name ?? `#${p.championId}`,
            position: (lane === 'BOTTOM' ? (p.timeline?.role === 'DUO_SUPPORT' ? 'support' : 'adc') : lcuPosition(lane)) as Position | null,
            level: s.champLevel ?? 0,
            kills: s.kills ?? 0,
            deaths: s.deaths ?? 0,
            assists: s.assists ?? 0,
            cs: (s.totalMinionsKilled ?? 0) + (s.neutralMinionsKilled ?? 0),
            gold: s.goldEarned ?? 0,
            damage: s.totalDamageDealtToChampions ?? 0,
            damageTaken: s.totalDamageTaken ?? 0,
            visionWards: s.visionWardsBoughtInGame ?? 0,
            wardsPlaced: s.wardsPlaced ?? 0,
            opScore: null,
            opScoreRank: null,
            items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6].filter((i: number) => i > 0),
            spells: [p.spell1Id, p.spell2Id],
            primaryRune: s.perk0 ?? null,
            secondaryPage: s.perkSubStyle ?? null
          }
        })
      return {
        key: t.teamId === 100 ? 'BLUE' : 'RED',
        win: t.win === 'Win',
        kills: participants.reduce((a: number, p: any) => a + p.kills, 0),
        gold: participants.reduce((a: number, p: any) => a + p.gold, 0),
        towers: t.towerKills ?? 0,
        dragons: t.dragonKills ?? 0,
        barons: t.baronKills ?? 0,
        heralds: t.riftHeraldKills ?? 0,
        grubs: t.hordeKills ?? 0,
        participants
      }
    })
    return { id, teams }
  }

  async getStats(acc: RiotAccount): Promise<StatsAggregate> {
    const { matches } = await this.getMatches(acc, false)
    return aggregate(filterMatches(matches, this.settings.get().queueFilter), await this.comparisonTier())
  }

  // ---------- Draft helper ----------

  private async playerContext(acc: RiotAccount | null, queue: DraftQueue | null = null): Promise<PlayerContext> {
    const settings = this.settings.get()
    const all = acc ? (await this.getMatches(acc, false)).matches : []
    const matches = queue ? matchesForDraft(all, queue, settings.queueFilter) : filterMatches(all, settings.queueFilter)
    let mastery = null
    let owned = null
    if (acc && this.isLocalAccount(acc)) {
      const fresh = (c: { at: number } | null): boolean => !!c && Date.now() - c.at < 10 * 60_000
      try {
        if (!fresh(this.masteryCache)) this.masteryCache = { at: Date.now(), value: await this.lcu.getMastery() }
        mastery = this.masteryCache!.value
      } catch {
        /* mastery indisponible */
      }
      try {
        if (!fresh(this.ownedCache)) this.ownedCache = { at: Date.now(), value: await this.lcu.getOwnedChampions() }
        owned = this.ownedCache!.value
      } catch {
        /* liste des champions possédés indisponible */
      }
    }
    return { matches, mastery, owned }
  }

  getLiveDraft(): DraftState | null {
    const session = this.lcu.getChampSelect()
    return session ? sessionToDraft(session, this.lcu.getQueueId()) : null
  }

  async suggest(state: DraftState): Promise<DraftResult> {
    await loadStaticData()
    const acc = this.currentAccount()
    const settings = this.settings.get()
    const player = await this.playerContext(acc, state.queue)
    // Les stats de saison OP.GG cumulent solo + flex : valables pour un draft flex (ou une file
    // non classée avec le réglage « classées »), jamais pour un draft solo.
    const seasonFits = state.queue === 'flex' || (state.queue === 'other' && settings.queueFilter === 'ranked')
    if (acc && seasonFits) {
      try {
        player.season = (await this.opgg.getProfile(acc)).champions
      } catch {
        /* profil indisponible : historique seul */
      }
    }
    const model = acc ? this.models.get()[accKey(acc)] : undefined
    const modelWeights = settings.useModel && model && model.samples >= MIN_SAMPLES ? model.weights : null
    return this.engine.suggest(state, player, settings, modelWeights)
  }

  /** Palier de comparaison : choisi dans les réglages, sinon rang solo du compte (Or par défaut). */
  async comparisonTier(): Promise<Tier> {
    const chosen = this.settings.get().compareTier
    if (chosen !== 'auto') return chosen
    const acc = this.currentAccount()
    if (!acc) return 'GOLD'
    try {
      const profile = await this.opgg.getProfile(acc)
      const solo = profile.ranked.find((r) => r.queue === 'SOLORANKED')
      const flex = profile.ranked.find((r) => r.queue === 'FLEXRANKED')
      return tierBucket(solo?.tier) ?? tierBucket(flex?.tier) ?? 'GOLD'
    } catch {
      return 'GOLD'
    }
  }

  // ---------- Build ----------

  async importBuild(
    champion: string,
    position: Position,
    parts: { runes?: boolean; spells?: boolean; items?: boolean }
  ): Promise<ImportResult> {
    if (!this.lcu.getStatus().connected) throw new Error("Lance le client LoL pour importer le build.")
    return importBuild(this.lcu, await this.opgg.getBuild(champion, position), parts)
  }

  private autoImported: string | null = null

  /** Option « importer au lock » : runes + sorts dès que le pick du joueur est validé. */
  private async autoImportOnLock(session: any | null): Promise<void> {
    if (!session) {
      this.autoImported = null
      return
    }
    if (!this.settings.get().autoImport) return
    await loadStaticData() // les noms de champions sont nécessaires pour lire la session
    const me = session.localPlayerCellId
    const lock = (session.actions ?? []).flat().find((a: any) => a.type === 'pick' && a.actorCellId === me && a.completed)
    const draft = sessionToDraft(session)
    if (!lock || !draft.pickedByMe || !draft.myPosition) return
    const key = `${session.gameId ?? ''}:${draft.pickedByMe}`
    if (this.autoImported === key) return
    this.autoImported = key
    try {
      const result = await this.importBuild(draft.pickedByMe, draft.myPosition, { runes: true, spells: true })
      this.emit('build:auto-imported', { champion: draft.pickedByMe, ...result })
    } catch (e) {
      this.emit('build:auto-imported', { champion: draft.pickedByMe, errors: [(e as Error).message] })
    }
  }

  /**
   * Builds réels des meilleurs joueurs du champion (classement OP.GG de ta région et de la
   * Corée), regroupés en variantes. Avec un adversaire, chaque game récente est ouverte pour
   * savoir contre qui elle a été jouée.
   */
  async getProBuilds(champion: string, position: Position, opponent: string | null): Promise<ProBuilds> {
    await loadStaticData()
    const region = this.currentAccount()?.region ?? this.settings.get().region
    const regions = [...new Set([region, 'KR'])]
    const boards = await Promise.allSettled(regions.map((r) => this.opgg.getLeaderboard(champion, r)))
    const players = boards.flatMap((b, i) =>
      b.status === 'fulfilled' ? b.value.slice(0, 5).map((p) => ({ ...p, region: regions[i] as Region })) : []
    )
    const histories = await Promise.allSettled(
      players.map((p) => this.opgg.listMatches({ gameName: p.gameName, tagLine: p.tagLine, region: p.region }, 20))
    )
    const same = (a: string, b: string) => normalizeName(a) === normalizeName(b)
    const games: SourcedGame[] = histories
      .flatMap((h, i) => (h.status === 'fulfilled' ? h.value.map((match) => ({ match, p: players[i] })) : []))
      .filter(({ match }) => same(match.champion, champion) && !match.remake && RANKED_QUEUES.has(match.queue))
      .filter(({ match }) => !match.position || match.position === position)
      .sort((a, b) => Date.parse(b.match.createdAt) - Date.parse(a.match.createdAt))
      .slice(0, 40)
      .map(({ match, p }) => ({
        match,
        game: {
          player: `${p.gameName}#${p.tagLine}`,
          tier: p.tier,
          region: p.region,
          createdAt: match.createdAt,
          win: match.win,
          kills: match.kills,
          deaths: match.deaths,
          assists: match.assists,
          opponent: null
        }
      }))

    if (opponent) {
      // On identifie l'adversaire de lane des 16 games les plus récentes (détails mis en cache).
      const queue = games.slice(0, 16)
      const worker = async (): Promise<void> => {
        for (let g = queue.shift(); g; g = queue.shift()) {
          try {
            const [gameName, tagLine] = g.game.player.split('#')
            const detail = await this.opgg.getMatchDetail({ gameName, tagLine, region: g.game.region as Region }, g.match.id, g.match.createdAt)
            const all = detail.teams.flatMap((t) => t.participants)
            const me = all.find((p) => p.isTarget)
            const opp = me && all.find((p) => p.team !== me.team && p.position === me.position)
            g.game.opponent = opp?.champion ?? null
          } catch {
            /* détail indisponible */
          }
        }
      }
      await Promise.all(Array.from({ length: 4 }, worker))
    }

    const pages = await this.opgg.getRunePages(champion, position, opponent)
    return {
      champion,
      position,
      opponent,
      gamesAnalyzed: games.length,
      players: new Set(games.map((g) => g.game.player)).size,
      variants: groupVariants(games, pages, opponent)
    }
  }

  /** Import d'un build composé dans l'interface (variante high elo, page du matchup…). */
  async importBuildData(build: ChampionBuild, parts: { runes?: boolean; spells?: boolean; items?: boolean }): Promise<ImportResult> {
    if (!this.lcu.getStatus().connected) throw new Error('Lance le client LoL pour importer le build.')
    await loadStaticData()
    return importBuild(this.lcu, build, parts)
  }

  // ---------- Modèle ML ----------

  getModel(): ModelInfo | null {
    const acc = this.currentAccount()
    return acc ? (this.models.get()[accKey(acc)] ?? null) : null
  }

  /**
   * Construit le dataset (une ligne par game classée de l'historique) puis entraîne la
   * régression logistique. Pour chaque game, le winrate perso n'utilise que les games
   * précédentes afin de ne pas "voir" le résultat qu'on cherche à prédire.
   */
  async trainModel(onProgress?: (done: number, total: number) => void): Promise<ModelInfo> {
    await loadStaticData()
    const acc = this.currentAccount()
    if (!acc) throw new Error('Aucun compte : lance le client LoL ou saisis ton Riot ID.')
    const player = await this.playerContext(acc)
    const games = player.matches.filter((m) => m.position).slice(0, 150)
    if (games.length < MIN_SAMPLES)
      throw new Error(`Seulement ${games.length} games classées en historique, il en faut au moins ${MIN_SAMPLES}.`)

    const samples: Sample[] = []
    let done = 0
    const queue = [...games]
    const worker = async (): Promise<void> => {
      for (let g = queue.shift(); g; g = queue.shift()) {
        try {
          const detail = await this.getMatchDetail(acc, g)
          const state = detailToDraft(detail, g)
          if (state) {
            const before = Date.parse(g.createdAt)
            const ctx = { ...player, matches: player.matches.filter((m) => Date.parse(m.createdAt) < before) }
            const { inputs } = await this.engine.buildInputs(state, ctx, 'all', [], [g.champion])
            if (inputs[0]) samples.push({ x: featureVector(inputs[0]), y: g.win ? 1 : 0 })
          }
        } catch {
          // game ignorée (détail indisponible)
        }
        onProgress?.(++done, games.length)
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    // Ordre chronologique pour la validation croisée.
    const model = trainModel(samples.reverse())
    this.models.update((all) => ({ ...all, [accKey(acc)]: model }))
    return model
  }
}

/** Reconstitue la composition d'une game passée du point de vue du joueur. */
function detailToDraft(detail: MatchDetail, game: MatchSummary): DraftState | null {
  const all = detail.teams.flatMap((t) => t.participants.map((p) => ({ ...p, teamKey: t.key })))
  const me = all.find((p) => p.isTarget) ?? all.find((p) => p.champion === game.champion)
  if (!me) return null
  const slot = (p: (typeof all)[number]) => ({ champion: p.champion, position: p.position })
  return {
    queue: game.queue === 'SOLORANKED' ? 'solo' : game.queue === 'FLEXRANKED' ? 'flex' : 'other',
    myPosition: me.position ?? game.position,
    allies: all.filter((p) => p.teamKey === me.teamKey && p !== me).map(slot),
    enemies: all.filter((p) => p.teamKey !== me.teamKey).map(slot),
    bans: [],
    pickedByMe: me.champion,
    source: 'manual'
  }
}
