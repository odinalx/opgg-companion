import { describe, expect, it } from 'vitest'
import type { MatchSummary } from '@shared/types'
import { rate, skillProfile } from './skills'

const game = (over: Partial<MatchSummary>): MatchSummary =>
  ({
    id: 'x',
    createdAt: '2026-10-01T00:00:00Z',
    queue: 'SOLORANKED',
    durationSec: 1800,
    champion: 'Ahri',
    position: 'mid',
    win: true,
    remake: false,
    kills: 5,
    deaths: 3,
    assists: 7,
    cs: 210,
    gold: 11700,
    damage: 22800,
    damageTaken: 0,
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
  }) as MatchSummary

describe('rate', () => {
  it('place le repère médian à 50 et le haut repère à 90', () => {
    expect(rate(6.5, { mid: 6.5, high: 8.6 })).toBe(50)
    expect(rate(8.6, { mid: 6.5, high: 8.6 })).toBe(90)
    expect(rate(100, { mid: 6.5, high: 8.6 })).toBe(100)
  })
  it('gère les axes où moins est mieux (morts)', () => {
    expect(rate(1.3, { mid: 2.1, high: 1.3 })).toBe(90)
    expect(rate(3, { mid: 2.1, high: 1.3 })).toBeLessThan(50)
  })
})

describe('skillProfile', () => {
  it('note un support sur ses propres repères', () => {
    const sup = skillProfile([game({ position: 'support', cs: 30, damage: 10200, wardsPlaced: 45, visionWards: 12, gold: 7650 })])
    const farm = sup.find((a) => a.key === 'farm')!
    expect(farm.overall).toBe(50) // 1 CS/min = repère médian d'un support
    expect(sup.find((a) => a.key === 'vision')!.overall).toBeGreaterThan(80)
  })
  it('ignore les games sans rôle et les remakes, et ne calcule la forme récente qu’avec assez de games', () => {
    const res = skillProfile([game({ position: null }), game({ remake: true }), game({})])
    expect(res).toHaveLength(6)
    expect(res[0].recent).toBeNull()
    expect(skillProfile([game({ position: null })])).toEqual([])
  })
})
