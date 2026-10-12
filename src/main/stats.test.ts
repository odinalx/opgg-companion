import { describe, expect, it } from 'vitest'
import type { MatchSummary } from '@shared/types'
import { aggregate, matchesForDraft, mergeMatches, personalRecord } from './stats'
import { assignPositions } from './draft/engine'

const match = (over: Partial<MatchSummary>): MatchSummary => ({
  id: 'x',
  createdAt: '2026-10-01T10:00:00Z',
  queue: 'SOLORANKED',
  durationSec: 1800,
  champion: 'Ahri',
  position: 'mid',
  win: true,
  remake: false,
  kills: 5,
  deaths: 2,
  assists: 5,
  cs: 240,
  gold: 12000,
  damage: 20000,
  damageTaken: 15000,
  visionWards: 2,
  wardsPlaced: 10,
  opScore: null,
  items: [],
  spells: [],
  primaryRune: null,
  secondaryPage: null,
  allyBans: [],
  enemyBans: [],
  avgTier: null,
  ...over
})

describe('mergeMatches', () => {
  it('dédoublonne une game vue par le client et par OP.GG en gardant OP.GG', () => {
    const lcu = match({ id: 'lcu_1', createdAt: '2026-10-01T10:00:00Z' })
    const opgg = match({ id: 'm_abc', createdAt: '2026-10-01T10:02:00Z', opScore: 7 })
    const other = match({ id: 'm_def', createdAt: '2026-10-02T10:00:00Z' })
    const merged = mergeMatches([lcu], [opgg, other])
    expect(merged.map((m) => m.id)).toEqual(['m_def', 'm_abc'])
  })
})

describe('aggregate', () => {
  it('calcule winrate, KDA et CS/min', () => {
    const s = aggregate([match({ id: 'a' }), match({ id: 'b', win: false, champion: 'Zed' })])
    expect(s.games).toBe(2)
    expect(s.wins).toBe(1)
    expect(s.kda).toBe(5)
    expect(s.csPerMin).toBe(8)
    expect(s.byChampion).toHaveLength(2)
    expect(s.trend.at(-1)?.cumulativeWr).toBe(0.5)
  })
})

describe('personalRecord', () => {
  it('ne compte que les games antérieures à la date donnée', () => {
    const ms = [match({ id: 'a', createdAt: '2026-10-01T00:00:00Z' }), match({ id: 'b', createdAt: '2026-10-03T00:00:00Z' })]
    expect(personalRecord(ms, Date.parse('2026-10-02T00:00:00Z')).get('Ahri')).toEqual({ games: 1, wins: 1 })
  })
})

describe('assignPositions', () => {
  it('attribue les rôles inconnus selon la popularité sans doublon', () => {
    const entry = (champion: string, play: number) => ({ champion, play, winRate: 0.5, pickRate: 0, banRate: 0, tier: 2 })
    const meta = {
      top: [entry('Yasuo', 500)],
      jungle: [],
      mid: [entry('Yasuo', 900), entry('Zed', 800)],
      adc: [],
      support: []
    }
    const out = assignPositions(
      [
        { champion: 'Zed', position: null },
        { champion: 'Yasuo', position: null }
      ],
      meta
    )
    // Zed ne joue que mid : Yasuo, plus flexible, part top.
    expect(out).toEqual([
      { champion: 'Zed', position: 'mid' },
      { champion: 'Yasuo', position: 'top' }
    ])
  })
})

describe('matchesForDraft', () => {
  const ms = [
    match({ id: 'solo', queue: 'SOLORANKED' }),
    match({ id: 'flex', queue: 'FLEXRANKED' }),
    match({ id: 'aram', queue: 'ARAM' }),
    match({ id: 'remake', queue: 'SOLORANKED', remake: true })
  ]
  const ids = (q: 'solo' | 'flex' | 'other', f: 'ranked' | 'all' = 'ranked') => matchesForDraft(ms, q, f).map((m) => m.id)
  it('en solo, ne garde que la solo', () => expect(ids('solo')).toEqual(['solo']))
  it('en flex, garde solo et flex', () => expect(ids('flex')).toEqual(['solo', 'flex']))
  it('ailleurs, applique le réglage général', () => {
    expect(ids('other')).toEqual(['solo', 'flex'])
    expect(ids('other', 'all')).toEqual(['solo', 'flex', 'aram'])
  })
})
