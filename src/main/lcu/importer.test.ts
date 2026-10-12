import { describe, expect, it } from 'vitest'
import type { ChampionBuild } from '@shared/types'
import { setChampions } from '../ddragon'
import { arrangeSpells, itemSetBody, runePageBody } from './importer'

const opt = (ids: number[], winRate = 0.52) => ({ ids, names: ids.map(String), games: 1000, winRate, pickRate: 0.3 })

const build: ChampionBuild = {
  champion: 'Nasus',
  position: 'top',
  runes: {
    primaryStyle: 8000,
    primaryName: 'Precision',
    subStyle: 8400,
    subName: 'Resolve',
    perks: [8021, 9111, 9105, 8299, 8242, 8444],
    perkNames: ['Fleet Footwork'],
    shards: [5007, 5001, 5001],
    games: 20000,
    winRate: 0.502
  },
  spells: opt([6, 12]),
  starter: opt([1054, 2003]),
  core: opt([3078, 3110, 3065]),
  boots: opt([3158]),
  fourth: [opt([6665]), opt([3075])],
  fifth: [],
  sixth: [],
  skillOrder: ['Q', 'W', 'E'],
  skillPriority: ['Q', 'W', 'E']
}

describe('importer', () => {
  it('construit une page de runes complète (6 runes + 3 fragments)', () => {
    const page = runePageBody(build)
    expect(page.selectedPerkIds).toHaveLength(9)
    expect(page.primaryStyleId).toBe(8000)
    expect(page.name).toBe('OPGG Nasus top')
  })

  it('garde Flash sur la touche habituelle du joueur', () => {
    expect(arrangeSpells([4, 12], [14, 4])).toEqual([12, 4]) // Flash sur F
    expect(arrangeSpells([12, 4], [4, 14])).toEqual([4, 12]) // Flash sur D
    expect(arrangeSpells([6, 12], [4, 14])).toEqual([6, 12]) // pas de Flash recommandé
  })

  it('crée un set d’items associé au champion', () => {
    setChampions([{ id: 75, key: 'Nasus', name: 'Nasus' }])
    const set = itemSetBody(build)
    expect(set.associatedChampions).toEqual([75])
    expect(set.blocks.map((b: any) => b.type)).toEqual(['Départ (52% WR)', 'Bottes', 'Core (52% WR)', '4e item, au choix'])
    expect((set.blocks[0] as any).items[0]).toEqual({ id: '1054', count: 1 })
  })
})
