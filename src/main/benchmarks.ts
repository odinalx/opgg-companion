// Repères par palier d'elo et par rôle (médianes), générés par `npm run bench:build`
// à partir de games classées récentes d'OP.GG. Voir scripts/build-benchmarks.test.ts.

import type { Position, Tier, TierBenchmark } from '@shared/types'
import { TIERS } from '@shared/types'
import data from './data/benchmarks.json'

type Raw = Omit<TierBenchmark, 'visionPerMin'>
const RAW = data as { generatedAt: string; tiers: Record<string, Partial<Record<Position, Raw>>> }

// Score de vision moyen sur une game (~30 min), tous rôles confondus, par palier.
// Le score de vision n'est pas exposé par OP.GG : ordres de grandeur publics (Boosting Market,
// « LoL Vision Score by Rank »), répartis ensuite par rôle selon la part de wards mesurée.
const VISION_PER_GAME: Record<Tier, number> = {
  IRON: 17,
  BRONZE: 21,
  SILVER: 28,
  GOLD: 36,
  PLATINUM: 43,
  EMERALD: 52,
  DIAMOND: 60,
  MASTER: 70
}

export const BENCHMARKS_DATE = RAW.generatedAt

export function tierBucket(tier: string | null | undefined): Tier | null {
  const t = (tier ?? '').toUpperCase()
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t)) return 'MASTER'
  return (TIERS as readonly string[]).includes(t) ? (t as Tier) : null
}

/** Palier `steps` crans au-dessus (borné à Master+). */
export function tierAbove(tier: Tier, steps = 2): Tier {
  return TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(tier) + steps)]
}

/** Médianes du rôle dans ce palier ; à défaut, palier voisin le plus proche qui a des données. */
export function benchmark(tier: Tier, position: Position): TierBenchmark | null {
  const idx = TIERS.indexOf(tier)
  const order = [...TIERS].map((t, i) => ({ t, d: Math.abs(i - idx) })).sort((a, b) => a.d - b.d)
  for (const { t } of order) {
    const raw = RAW.tiers[t]?.[position]
    if (raw) return { ...raw, visionPerMin: visionPerMin(t, position) }
  }
  return null
}

function visionPerMin(tier: Tier, position: Position): number {
  const roles = RAW.tiers[tier] ?? {}
  const wards = Object.values(roles).map((r) => r!.wardsPerMin)
  const mean = wards.length ? wards.reduce((a, b) => a + b, 0) / wards.length : 0
  const share = mean && roles[position] ? roles[position]!.wardsPerMin / mean : 1
  return (VISION_PER_GAME[tier] / 30) * share
}
