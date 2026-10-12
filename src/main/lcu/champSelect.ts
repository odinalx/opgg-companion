// Conversion de la session de champ select LCU (/lol-champ-select/v1/session) en DraftState.

import type { DraftQueue, DraftSlot, DraftState, Position } from '@shared/types'
import { championById } from '../ddragon'

export function lcuPosition(p: string | undefined | null): Position | null {
  switch ((p ?? '').toLowerCase()) {
    case 'top':
      return 'top'
    case 'jungle':
      return 'jungle'
    case 'middle':
    case 'mid':
      return 'mid'
    case 'bottom':
      return 'adc'
    case 'utility':
    case 'support':
      return 'support'
    default:
      return null
  }
}

function name(id: number | undefined | null): string | null {
  if (!id) return null
  return championById(id)?.name ?? null
}

/** 420 = classée solo/duo, 440 = classée flex. */
export function queueFromId(queueId: number | null | undefined): DraftQueue {
  if (queueId === 420) return 'solo'
  if (queueId === 440) return 'flex'
  return 'other'
}

export function sessionToDraft(session: any, queueId?: number | null): DraftState {
  const myCell = session.localPlayerCellId
  const me = (session.myTeam ?? []).find((p: any) => p.cellId === myCell)
  const slot = (p: any): DraftSlot => ({
    // Pour les alliés, on prend aussi l'intention de pick (hover) : elle oriente déjà la synergie.
    champion: name(p.championId) ?? name(p.championPickIntent),
    position: lcuPosition(p.assignedPosition)
  })

  const bans = new Set<string>()
  for (const id of [...(session.bans?.myTeamBans ?? []), ...(session.bans?.theirTeamBans ?? [])]) {
    const n = name(id)
    if (n) bans.add(n)
  }
  for (const group of session.actions ?? [])
    for (const a of group)
      if (a.type === 'ban' && a.completed) {
        const n = name(a.championId)
        if (n) bans.add(n)
      }

  return {
    queue: queueFromId(queueId),
    myPosition: lcuPosition(me?.assignedPosition),
    allies: (session.myTeam ?? []).filter((p: any) => p.cellId !== myCell).map(slot),
    enemies: (session.theirTeam ?? []).map((p: any) => ({
      champion: name(p.championId),
      position: lcuPosition(p.assignedPosition)
    })),
    bans: [...bans],
    pickedByMe: name(me?.championId),
    source: 'lcu'
  }
}
