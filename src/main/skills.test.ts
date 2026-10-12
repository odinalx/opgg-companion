import { describe, expect, it } from 'vitest'
import type { MatchSummary } from '@shared/types'
import type { Position, Tier, TierBenchmark } from '@shared/types'
import { rate, skillProfile } from './skills'

// Médianes factices : Or = référence, Émeraude (deux paliers au-dessus) = « très bon ».
const fake = (tier: Tier, position: Position): TierBenchmark => {
  const up = tier === 'EMERALD'
  const sup = position === 'support'
  return {
    samples: 100,
    csPerMin: sup ? (up ? 1.4 : 1) : up ? 7 : 6,
    goldPerMin: up ? 420 : 380,
    damagePerMin: up ? 800 : 650,
    wardsPerMin: sup ? (up ? 1.6 : 1.2) : up ? 0.5 : 0.4,
    deathsPer10: up ? 1.6 : 2,
    kda: up ? 3.2 : 2.6,
    killParticipation: 0.5,
    visionPerMin: 1
  }
}

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
    const sup = skillProfile([game({ position: 'support', cs: 30, damage: 10200, wardsPlaced: 36, visionWards: 12, gold: 7650 })], 'GOLD', fake)
    const farm = sup.find((a) => a.key === 'farm')!
    expect(farm.overall).toBe(50) // 1 CS/min = médiane Or d'un support
    expect(sup.find((a) => a.key === 'vision')!.overall).toBe(90) // 1.6 wards/min = médiane Émeraude
  })
  it('ignore les games sans rôle et les remakes, et ne calcule la forme récente qu’avec assez de games', () => {
    const res = skillProfile([game({ position: null }), game({ remake: true }), game({})], 'GOLD', fake)
    expect(res).toHaveLength(6)
    expect(res[0].recent).toBeNull()
    expect(skillProfile([game({ position: null })], 'GOLD', fake)).toEqual([])
  })
})
