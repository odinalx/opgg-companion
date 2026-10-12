import { describe, expect, it } from 'vitest'
import type { MatchSummary, RunePage } from '@shared/types'
import { completeRunePage, groupVariants, type SourcedGame } from './variants'

const page = (keystone: number, sub: number, games: number): RunePage => ({
  primaryStyle: 8000,
  primaryName: 'P',
  subStyle: sub,
  subName: 'S',
  perks: [keystone, 1, 2, 3, 4, 5],
  perkNames: [],
  shards: [5008, 5008, 5001],
  games,
  winRate: 0.5
})

const game = (over: Partial<MatchSummary>, opponent: string | null = null): SourcedGame => ({
  match: {
    id: Math.random().toString(),
    createdAt: '2026-10-01T00:00:00Z',
    queue: 'SOLORANKED',
    durationSec: 1800,
    champion: 'Nasus',
    position: 'top',
    win: true,
    remake: false,
    kills: 1,
    deaths: 1,
    assists: 1,
    cs: 0,
    gold: 0,
    damage: 0,
    damageTaken: 0,
    visionWards: 0,
    wardsPlaced: 0,
    opScore: null,
    items: [],
    spells: [4, 12],
    primaryRune: 8021,
    secondaryPage: 8400,
    allyBans: [],
    enemyBans: [],
    avgTier: null,
    ...over
  },
  game: { player: 'p#1', tier: 'MASTER', region: 'EUW', createdAt: '', win: true, kills: 1, deaths: 1, assists: 1, opponent }
})

describe('completeRunePage', () => {
  it('prend la page la plus jouée avec la même keystone et le même arbre secondaire', () => {
    const pages = [page(8021, 8400, 100), page(8021, 8300, 900), page(8021, 8400, 300)]
    expect(completeRunePage(8021, 8400, pages)?.games).toBe(300)
    expect(completeRunePage(8021, 8100, pages)?.games).toBe(900) // repli : keystone seule
    expect(completeRunePage(9999, 8400, pages)).toBeNull()
  })
})

describe('groupVariants', () => {
  it('regroupe par keystone + arbre + sorts et priorise les games contre l’adversaire', () => {
    const games = [
      game({ primaryRune: 8010 }),
      game({ primaryRune: 8010 }),
      game({ primaryRune: 8021 }, 'Darius'),
      game({ primaryRune: 8021, spells: [12, 4] })
    ]
    const v = groupVariants(games, [page(8021, 8400, 10)], 'Darius')
    expect(v).toHaveLength(2)
    expect(v[0].keystone).toBe(8021) // jouée contre Darius
    expect(v[0].games).toBe(2) // [4,12] et [12,4] sont la même paire de sorts
    expect(v[0].vsOpponent).toBe(1)
    expect(v[0].runes?.games).toBe(10)
    expect(v[1].keystone).toBe(8010)
    expect(v[1].runes).toBeNull()
  })
})
