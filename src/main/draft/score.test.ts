import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, type DraftWeights } from '@shared/types'
import {
  type CandidateInput,
  featureVector,
  matchupComponent,
  personalComponent,
  rankCandidates,
  scoreCandidate,
  smoothedWinRate
} from './score'

const base = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  champion: 'Ahri',
  personal: { games: 0, wins: 0 },
  mastery: { level: 0, points: 0 },
  meta: { winRate: 0.5, tier: 3, play: 10000 },
  matchup: null,
  synergy: [],
  ...over
})

const only = (k: keyof DraftWeights): DraftWeights =>
  Object.fromEntries(
    Object.entries(DEFAULT_WEIGHTS).map(([key, v]) => [key, { ...v, enabled: key === k }])
  ) as DraftWeights

describe('smoothedWinRate', () => {
  it('tire les petits échantillons vers le prior', () => {
    expect(smoothedWinRate(2, 2, 0.5, 10)).toBeCloseTo(7 / 12)
    expect(smoothedWinRate(0, 0, 0.52, 10)).toBeCloseTo(0.52)
  })
  it('converge vers le winrate observé avec beaucoup de games', () => {
    expect(smoothedWinRate(600, 1000, 0.5, 10)).toBeCloseTo(0.599, 2)
  })
})

describe('critères', () => {
  it('un 2/2 ne vaut pas plus qu’un 30/50', () => {
    const lucky = personalComponent(base({ personal: { games: 2, wins: 2 } })).value!
    const proven = personalComponent(base({ personal: { games: 50, wins: 30 } })).value!
    expect(proven).toBeGreaterThan(lucky)
  })

  it('le matchup est neutre sans données et null sans adversaire', () => {
    expect(matchupComponent(base()).value).toBeNull()
    expect(matchupComponent(base({ matchup: { opponent: 'Zed', play: 0, winRate: 0.5 } })).value).toBe(0.5)
    const good = matchupComponent(base({ matchup: { opponent: 'Zed', play: 3000, winRate: 0.56 } })).value!
    expect(good).toBeGreaterThan(0.6)
  })
})

describe('scoreCandidate', () => {
  it('ignore les critères désactivés', () => {
    const a = base({ champion: 'A', personal: { games: 100, wins: 70 }, meta: { winRate: 0.46, tier: 5, play: 1 } })
    const b = base({ champion: 'B', personal: { games: 0, wins: 0 }, meta: { winRate: 0.54, tier: 1, play: 1 } })
    expect(rankCandidates([a, b], only('personal'))[0].champion).toBe('A')
    expect(rankCandidates([a, b], only('meta'))[0].champion).toBe('B')
  })

  it('ignore un critère sans données au lieu de le compter à zéro', () => {
    const withoutMastery = scoreCandidate(base({ mastery: null }), DEFAULT_WEIGHTS)
    const weights = { ...DEFAULT_WEIGHTS, mastery: { ...DEFAULT_WEIGHTS.mastery, enabled: false } }
    expect(withoutMastery.score).toBeCloseTo(scoreCandidate(base(), weights).score)
  })

  it('renvoie un score entre 0 et 100 et une explication', () => {
    const s = scoreCandidate(
      base({
        personal: { games: 40, wins: 26 },
        mastery: { level: 7, points: 250000 },
        matchup: { opponent: 'Zed', play: 2000, winRate: 0.55 },
        synergy: [{ ally: 'Lee Sin', play: 1500, winRate: 0.54 }]
      }),
      DEFAULT_WEIGHTS
    )
    expect(s.score).toBeGreaterThan(50)
    expect(s.score).toBeLessThanOrEqual(100)
    expect(s.summary).toMatch(/WR perso|Zed|Lee Sin/)
  })

  it('produit un vecteur de features de la bonne taille', () => {
    expect(featureVector(base())).toHaveLength(5)
  })
})
