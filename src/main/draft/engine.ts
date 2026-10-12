// Assemble les données nécessaires au score (OP.GG + historique + client) pour chaque candidat.

import type { DraftState, DraftWeights, MatchSummary, Position, Settings, Suggestion } from '@shared/types'
import { POSITIONS } from '@shared/types'
import type { LaneMetaEntry, MatchupTable, OpggClient, SynergyTable } from '../opgg/client'
import { normalizeName } from '../ddragon'
import { personalRecord } from '../stats'
import { type CandidateInput, rankCandidates } from './score'

export interface PlayerContext {
  matches: MatchSummary[] // déjà filtrées selon la file choisie
  mastery: Record<string, { level: number; points: number }> | null
  owned: string[] | null
}

export interface DraftResult {
  suggestions: Suggestion[]
  warnings: string[]
  enemyLaner: string | null
  weightsUsed: DraftWeights
  usedModel: boolean
}

type MetaByPosition = Record<Position, LaneMetaEntry[]>

const same = (a: string, b: string): boolean => normalizeName(a) === normalizeName(b)

export class DraftEngine {
  constructor(private readonly opgg: OpggClient) {}

  async loadAllMeta(): Promise<MetaByPosition> {
    const lists = await Promise.all(POSITIONS.map((p) => this.opgg.getLaneMeta(p)))
    return Object.fromEntries(POSITIONS.map((p, i) => [p, lists[i]])) as MetaByPosition
  }

  /**
   * Construit les entrées de score pour chaque candidat. Exposé séparément de `suggest`
   * pour réutiliser la même logique lors de la construction du dataset d'entraînement.
   */
  async buildInputs(
    state: DraftState,
    player: PlayerContext,
    pool: Settings['candidatePool'],
    warnings: string[] = [],
    forceCandidates?: string[]
  ): Promise<{ inputs: CandidateInput[]; enemyLaner: string | null }> {
    const myPos = state.myPosition
    if (!myPos) throw new Error('Choisis ton rôle pour obtenir des suggestions.')
    const meta = await this.loadAllMeta()
    const laneMeta = meta[myPos]

    // ---- Candidats ----
    const taken = [...state.bans, ...state.allies.map((a) => a.champion), ...state.enemies.map((e) => e.champion)]
      .filter((c): c is string => !!c)
    const isTaken = (c: string): boolean => taken.some((t) => same(t, c))
    const record = personalRecord(player.matches)
    const playedOnRole = new Set(player.matches.filter((m) => m.position === myPos).map((m) => m.champion))
    const inMeta = (c: string): boolean => laneMeta.some((m) => same(m.champion, c))

    let names: string[]
    if (forceCandidates) {
      names = forceCandidates
    } else if (pool === 'all') {
      names = laneMeta.map((m) => m.champion)
    } else {
      const base = new Set<string>(playedOnRole)
      for (const [c, r] of record) if (r.games >= 3 && inMeta(c)) base.add(c)
      for (const [c, m] of Object.entries(player.mastery ?? {})) if (m.points >= 30_000 && inMeta(c)) base.add(c)
      if (pool === 'owned' && player.owned) {
        for (const c of player.owned) if (inMeta(c)) base.add(c)
      } else if (pool === 'owned') {
        warnings.push('Liste des champions possédés indisponible (client non lancé) : pool "joués" utilisé.')
      }
      // Pool trop petit : on complète avec les meilleurs champions méta du rôle.
      if (base.size < 5) for (const m of laneMeta.filter((x) => x.tier <= 2).slice(0, 10)) base.add(m.champion)
      names = [...base]
    }
    if (!forceCandidates) {
      const owned = player.owned
      if (owned) names = names.filter((n) => owned.some((o) => same(o, n)))
      names = names.filter((n) => !isTaken(n))
    }

    // ---- Matchup : adversaire de lane ----
    const enemyPositions = assignPositions(state.enemies, meta)
    const enemyLaner = enemyPositions.find((e) => e.position === myPos)?.champion ?? null
    let matchups: MatchupTable | null = null
    if (enemyLaner && names.length) {
      try {
        matchups = await this.opgg.getMatchups(enemyLaner, myPos, names[0])
      } catch (e) {
        warnings.push(`Matchups indisponibles pour ${enemyLaner} : ${(e as Error).message}`)
      }
    }

    // ---- Synergie : tables des alliés connus ----
    const allyPositions = assignPositions(state.allies, meta, [myPos])
    const allyTables: Array<{ ally: string; table: SynergyTable | null }> = await Promise.all(
      allyPositions
        .filter((a) => a.champion && a.position && a.position !== myPos)
        .map(async (a) => {
          try {
            return { ally: a.champion!, table: await this.opgg.getSynergies(a.champion!, a.position!, myPos) }
          } catch {
            return { ally: a.champion!, table: null }
          }
        })
    )

    const inputs = names.map((champion): CandidateInput => {
      const m = laneMeta.find((x) => same(x.champion, champion))
      const mu = enemyLaner ? findEntry(matchups ?? {}, champion) : undefined
      const masteryEntry = player.mastery ? findEntry(player.mastery, champion) : undefined
      return {
        champion: m?.champion ?? champion,
        personal: findEntry(Object.fromEntries(record), champion) ?? { games: 0, wins: 0 },
        mastery: player.mastery ? (masteryEntry ?? { level: 0, points: 0 }) : null,
        meta: m ? { winRate: m.winRate, tier: m.tier, play: m.play } : null,
        // La table est celle de l'adversaire : le winrate du candidat est le complément.
        matchup: enemyLaner
          ? { opponent: enemyLaner, play: mu?.play ?? 0, winRate: mu && mu.play ? 1 - mu.win / mu.play : 0.5 }
          : null,
        synergy: allyTables.map(({ ally, table }) => {
          const s = table ? findEntry(table, champion) : undefined
          return { ally, play: s?.play ?? 0, winRate: s?.winRate ?? null }
        })
      }
    })
    return { inputs, enemyLaner }
  }

  async suggest(
    state: DraftState,
    player: PlayerContext,
    settings: Settings,
    modelWeights: Record<string, number> | null
  ): Promise<DraftResult> {
    const warnings: string[] = []
    const { inputs, enemyLaner } = await this.buildInputs(state, player, settings.candidatePool, warnings)
    const weights = structuredClone(settings.weights)
    if (modelWeights) for (const k of Object.keys(weights) as Array<keyof DraftWeights>) weights[k].weight = modelWeights[k] ?? 0
    if (!player.mastery && weights.mastery.enabled) warnings.push('Mastery ignorée : lance le client LoL pour la récupérer.')
    return {
      suggestions: rankCandidates(inputs, weights),
      warnings,
      enemyLaner,
      weightsUsed: weights,
      usedModel: !!modelWeights
    }
  }
}

function findEntry<T>(table: Record<string, T>, champion: string): T | undefined {
  if (table[champion]) return table[champion]
  const key = Object.keys(table).find((k) => same(k, champion))
  return key ? table[key] : undefined
}

/**
 * Devine la position des champions dont le rôle n'est pas connu (cas des ennemis en
 * champ select) : affectation gloutonne selon la popularité du champion sur chaque lane.
 */
export function assignPositions(
  slots: Array<{ champion: string | null; position: Position | null }>,
  meta: Record<Position, LaneMetaEntry[]>,
  reserved: Position[] = []
): Array<{ champion: string | null; position: Position | null }> {
  const used = new Set<Position>([...reserved, ...slots.map((s) => s.position).filter((p): p is Position => !!p)])
  const out = slots.map((s) => ({ ...s }))
  const pending: Array<{ idx: number; pos: Position; play: number }> = []
  out.forEach((s, idx) => {
    if (s.position || !s.champion) return
    for (const pos of POSITIONS) {
      const e = meta[pos]?.find((m) => same(m.champion, s.champion!))
      if (e) pending.push({ idx, pos, play: e.play })
    }
  })
  pending.sort((a, b) => b.play - a.play)
  for (const p of pending) {
    if (out[p.idx].position || used.has(p.pos)) continue
    out[p.idx].position = p.pos
    used.add(p.pos)
  }
  return out
}
