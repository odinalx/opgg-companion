// Calcul des stats affichées par l'overlay à partir de /liveclientdata/allgamedata.
// L'API de jeu ne donne ni les dégâts ni l'or total gagné : l'or est estimé
// (valeur des items possédés + or en poche), les dégâts ne sont pas disponibles.

import type { LiveStats, Position } from '@shared/types'
import { championByName } from '../ddragon'
import { CS_TARGET } from '../skills'

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

export function computeLiveStats(data: any): LiveStats | null {
  const active = data?.activePlayer
  const players: any[] = data?.allPlayers ?? []
  if (!active || !players.length) return null
  const id = active.riotId ?? active.summonerName
  const me = players.find((p) => (p.riotId ?? p.summonerName) === id) ?? players.find((p) => p.riotIdGameName === active.riotIdGameName)
  if (!me) return null

  const gameTime = data.gameData?.gameTime ?? 0
  const minutes = Math.max(gameTime / 60, 1 / 60)
  const sc = me.scores ?? {}
  const teamKills = players.filter((p) => p.team === me.team).reduce((a, p) => a + (p.scores?.kills ?? 0), 0)
  const itemsValue = (me.items ?? []).reduce((a: number, it: any) => a + (it.price ?? 0) * (it.count ?? 1), 0)
  const currentGold = Math.floor(active.currentGold ?? 0)
  const goldEarned = itemsValue + currentGold
  const position = livePosition(me.position)

  return {
    champion: championName(me),
    position,
    gameTime,
    level: me.level ?? active.level ?? 1,
    cs: sc.creepScore ?? 0,
    csPerMin: (sc.creepScore ?? 0) / minutes,
    csTarget: CS_TARGET[position ?? 'mid'],
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
