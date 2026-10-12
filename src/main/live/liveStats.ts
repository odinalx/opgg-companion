// Calcul des stats affichées par l'overlay à partir de /liveclientdata/allgamedata.
// L'API de jeu ne donne ni les dégâts ni l'or gagné : l'or est estimé par la valeur des
// items possédés (comme le font les overlays du marché), les dégâts ne sont pas disponibles.

import type { LaneGold, LiveStats, Position, Tier } from '@shared/types'
import { POSITIONS } from '@shared/types'
import { benchmark, expectedCs } from '../benchmarks'
import { championByName } from '../ddragon'

export const MILESTONES = [10, 15, 20]

function livePosition(p: string | undefined): Position | null {
  switch ((p ?? '').toUpperCase()) {
    case 'TOP':
      return 'top'
    case 'JUNGLE':
      return 'jungle'
    case 'MIDDLE':
      return 'mid'
    case 'BOTTOM':
      return 'adc'
    case 'UTILITY':
      return 'support'
    default:
      return null
  }
}

/** "game_character_displayname_MonkeyKing" -> nom affiché ("Wukong"), indépendant de la langue du client. */
function championName(p: any): string {
  const raw = String(p.rawChampionName ?? '')
  const key = raw.split('_').pop()
  return (key && championByName(key)?.name) || p.championName || '?'
}

const itemsValue = (p: any): number =>
  (p.items ?? []).reduce((a: number, it: any) => a + (it.price ?? 0) * (it.count ?? 1), 0)

export function computeLiveStats(data: any, tier: Tier): LiveStats | null {
  const active = data?.activePlayer
  const players: any[] = data?.allPlayers ?? []
  if (!active || !players.length) return null
  const id = active.riotId ?? active.summonerName
  const me = players.find((p) => (p.riotId ?? p.summonerName) === id) ?? players.find((p) => p.riotIdGameName === active.riotIdGameName)
  if (!me) return null

  const gameTime = data.gameData?.gameTime ?? 0
  const minutes = Math.max(gameTime / 60, 1 / 60)
  const sc = me.scores ?? {}
  const allies = players.filter((p) => p.team === me.team)
  const enemies = players.filter((p) => p.team !== me.team)
  const teamKills = allies.reduce((a, p) => a + (p.scores?.kills ?? 0), 0)
  const currentGold = Math.floor(active.currentGold ?? 0)
  const goldEarned = itemsValue(me) + currentGold
  const position = livePosition(me.position)
  const bench = benchmark(tier, position ?? 'mid')
  const rate = bench?.csPerMin ?? 0
  const next = MILESTONES.find((m) => m * 60 > gameTime)

  // Écart d'or par lane : valeur des items de chaque joueur (l'or en poche des autres est inconnu).
  const lanes: LaneGold[] = POSITIONS.map((pos) => {
    const a = allies.find((p) => livePosition(p.position) === pos)
    const e = enemies.find((p) => livePosition(p.position) === pos)
    return {
      position: pos,
      ally: a ? championName(a) : null,
      enemy: e ? championName(e) : null,
      diff: (a ? itemsValue(a) : 0) - (e ? itemsValue(e) : 0),
      mine: pos === position
    }
  }) // toujours 5 lignes, dans l'ordre du tableau des scores (top → support)

  return {
    champion: championName(me),
    position,
    gameTime,
    level: me.level ?? active.level ?? 1,
    cs: sc.creepScore ?? 0,
    csPerMin: (sc.creepScore ?? 0) / minutes,
    tier,
    bench,
    csExpected: expectedCs(rate, minutes),
    nextMilestone: next && rate ? { minute: next, expected: Math.round(expectedCs(rate, next)) } : null,
    milestones: [],
    visionPerMin: (sc.wardScore ?? 0) / minutes,
    lanes,
    side: me.team === 'CHAOS' ? 'red' : 'blue',
    teamGoldDiff: allies.reduce((a, p) => a + itemsValue(p), 0) - enemies.reduce((a, p) => a + itemsValue(p), 0),
    kills: sc.kills ?? 0,
    deaths: sc.deaths ?? 0,
    assists: sc.assists ?? 0,
    killParticipation: teamKills ? ((sc.kills ?? 0) + (sc.assists ?? 0)) / teamKills : 0,
    vision: Math.round(sc.wardScore ?? 0),
    currentGold,
    goldEarned,
    goldPerMin: goldEarned / minutes
  }
}
