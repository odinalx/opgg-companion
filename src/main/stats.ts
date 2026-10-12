// Agrégats de stats et fusion des historiques (OP.GG + client local).

import type { DraftQueue, MatchSummary, Position, StatsAggregate } from '@shared/types'
import { POSITIONS } from '@shared/types'
import { skillProfile } from './skills'

export const RANKED_QUEUES = new Set(['SOLORANKED', 'FLEXRANKED'])

export function filterMatches(matches: MatchSummary[], queue: 'ranked' | 'all'): MatchSummary[] {
  return matches.filter((m) => !m.remake && (queue === 'all' || RANKED_QUEUES.has(m.queue)))
}

/**
 * Games perso prises en compte pour un draft : en solo, seulement la solo ;
 * en flex, solo + flex ; dans les autres files, le réglage général.
 */
export function matchesForDraft(matches: MatchSummary[], queue: DraftQueue, fallback: 'ranked' | 'all'): MatchSummary[] {
  if (queue === 'solo') return matches.filter((m) => !m.remake && m.queue === 'SOLORANKED')
  if (queue === 'flex') return matches.filter((m) => !m.remake && RANKED_QUEUES.has(m.queue))
  return filterMatches(matches, fallback)
}

/**
 * Fusionne deux historiques sans doublons. Les ids diffèrent entre OP.GG et le client local :
 * une game est considérée identique si même champion et début à moins de 5 minutes d'écart.
 * La version OP.GG est prioritaire (elle contient l'OP score et les bans).
 */
export function mergeMatches(existing: MatchSummary[], incoming: MatchSummary[]): MatchSummary[] {
  const byId = new Map(existing.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  const all = [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const out: MatchSummary[] = []
  for (const m of all) {
    const t = Date.parse(m.createdAt)
    const dupIndex = out.findIndex(
      (o) => o.champion === m.champion && Math.abs(Date.parse(o.createdAt) - t) < 5 * 60_000 && o.id !== m.id
    )
    if (dupIndex === -1) out.push(m)
    else if (out[dupIndex].id.startsWith('lcu_') && !m.id.startsWith('lcu_')) out[dupIndex] = m
  }
  return out
}

const kda = (k: number, d: number, a: number): number => (k + a) / Math.max(1, d)

export function aggregate(matches: MatchSummary[]): StatsAggregate {
  const games = matches.length
  const wins = matches.filter((m) => m.win).length
  const sum = (f: (m: MatchSummary) => number): number => matches.reduce((a, m) => a + f(m), 0)
  const minutes = sum((m) => m.durationSec) / 60 || 1

  const champMap = new Map<string, MatchSummary[]>()
  for (const m of matches) champMap.set(m.champion, [...(champMap.get(m.champion) ?? []), m])
  const byChampion = [...champMap.entries()]
    .map(([champion, ms]) => {
      const mins = ms.reduce((a, m) => a + m.durationSec, 0) / 60 || 1
      return {
        champion,
        games: ms.length,
        wins: ms.filter((m) => m.win).length,
        kda: kda(
          ms.reduce((a, m) => a + m.kills, 0),
          ms.reduce((a, m) => a + m.deaths, 0),
          ms.reduce((a, m) => a + m.assists, 0)
        ),
        csPerMin: ms.reduce((a, m) => a + m.cs, 0) / mins
      }
    })
    .sort((a, b) => b.games - a.games)

  const byPosition = POSITIONS.map((position: Position) => {
    const ms = matches.filter((m) => m.position === position)
    return { position, games: ms.length, wins: ms.filter((m) => m.win).length }
  }).filter((p) => p.games > 0)

  // Tendance chronologique (plus ancienne -> plus récente).
  let w = 0
  const trend = [...matches]
    .reverse()
    .map((m, i) => {
      if (m.win) w++
      return {
        date: m.createdAt,
        win: m.win,
        kda: kda(m.kills, m.deaths, m.assists),
        opScore: m.opScore,
        cumulativeWr: w / (i + 1)
      }
    })

  return {
    games,
    wins,
    kda: kda(sum((m) => m.kills), sum((m) => m.deaths), sum((m) => m.assists)),
    csPerMin: sum((m) => m.cs) / minutes,
    damagePerMin: sum((m) => m.damage) / minutes,
    visionPerGame: games ? sum((m) => m.wardsPlaced) / games : 0,
    byChampion,
    byPosition,
    trend,
    skills: skillProfile(matches)
  }
}

/** Victoires/games par champion, éventuellement restreint aux games jouées avant `before`. */
export function personalRecord(
  matches: MatchSummary[],
  before?: number
): Map<string, { games: number; wins: number }> {
  const rec = new Map<string, { games: number; wins: number }>()
  for (const m of matches) {
    if (before !== undefined && Date.parse(m.createdAt) >= before) continue
    const r = rec.get(m.champion) ?? { games: 0, wins: 0 }
    r.games++
    if (m.win) r.wins++
    rec.set(m.champion, r)
  }
  return rec
}
