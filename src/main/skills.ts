// Profil de jeu en 6 domaines (radar hexagonal).
// Chaque game est notée par rapport aux médianes de son rôle dans le palier de comparaison,
// puis on fait la moyenne : un support n'est pas pénalisé sur le farm, un ADC n'est pas
// comparé à un jungler. Médianes : src/main/data/benchmarks.json (games OP.GG récentes).

import type { MatchSummary, Position, SkillAxis, SkillKey, Tier, TierBenchmark } from '@shared/types'
import { benchmark, tierAbove } from './benchmarks'

interface Benchmark {
  mid: number // vaut 50
  high: number // vaut 90
}

export type BenchFn = (tier: Tier, position: Position) => TierBenchmark | null

/** Valeur de référence de chaque axe dans les médianes d'un palier. */
const BENCH_FIELD: Record<SkillKey, keyof TierBenchmark> = {
  combat: 'kda',
  farm: 'csPerMin',
  damage: 'damagePerMin',
  vision: 'wardsPerMin',
  survival: 'deathsPer10',
  economy: 'goldPerMin'
}

/**
 * Repères d'un axe : 50 = médiane du palier choisi, 90 = médiane deux paliers au-dessus
 * (au sommet, +20 % ; pour les morts, -20 %).
 */
function axisBenchmark(key: SkillKey, tier: Tier, position: Position, bench: BenchFn): Benchmark | null {
  const here = bench(tier, position)
  if (!here) return null
  const upTier = tierAbove(tier)
  const up = upTier !== tier ? bench(upTier, position) : null
  const mid = here[BENCH_FIELD[key]] as number
  const upValue = up ? (up[BENCH_FIELD[key]] as number) : null
  // Sur un petit échantillon, une médiane plus haute peut être moins bonne : on garde au moins
  // 10 % d'écart dans le bon sens pour que l'axe ne s'inverse jamais.
  const high =
    key === 'survival'
      ? Math.min(upValue ?? mid * 0.8, mid * 0.9)
      : Math.max(upValue ?? mid * 1.2, mid * 1.1)
  return { mid, high }
}

const AXES: Array<{ key: SkillKey; label: string; unit: string; value: (m: MatchSummary, min: number) => number }> = [
  { key: 'combat', label: 'Combat', unit: 'KDA', value: (m) => (m.kills + m.assists) / Math.max(1, m.deaths) },
  { key: 'farm', label: 'Farm', unit: 'CS/min', value: (m, min) => m.cs / min },
  { key: 'damage', label: 'Dégâts', unit: 'dégâts/min', value: (m, min) => m.damage / min },
  { key: 'vision', label: 'Vision', unit: 'wards/min', value: (m, min) => (m.wardsPlaced + m.visionWards) / min },
  { key: 'survival', label: 'Survie', unit: 'morts/10 min', value: (m, min) => (m.deaths / min) * 10 },
  { key: 'economy', label: 'Économie', unit: 'or/min', value: (m, min) => m.gold / min }
]

/** Note 0..100 : `mid` -> 50, `high` -> 90 (fonctionne aussi quand high < mid, ex. la survie). */
export function rate(value: number, b: Benchmark): number {
  const score = 50 + ((value - b.mid) / (b.high - b.mid)) * 40
  return Math.max(0, Math.min(100, score))
}

function profile(matches: MatchSummary[], tier: Tier, bench: BenchFn): Record<SkillKey, { score: number; raw: number }> | null {
  // Seules les games de Faille avec un rôle connu sont comparables aux repères.
  const usable = matches.filter((m) => m.position && !m.remake && m.durationSec >= 600)
  if (!usable.length) return null
  const out = {} as Record<SkillKey, { score: number; raw: number }>
  for (const axis of AXES) {
    let score = 0
    let raw = 0
    for (const m of usable) {
      const min = m.durationSec / 60
      const v = axis.value(m, min)
      raw += v
      const b = axisBenchmark(axis.key, tier, m.position!, bench)
      score += b ? rate(v, b) : 50
    }
    out[axis.key] = { score: score / usable.length, raw: raw / usable.length }
  }
  return out
}

/** `matches` est trié du plus récent au plus ancien. */
export function skillProfile(matches: MatchSummary[], tier: Tier = 'GOLD', bench: BenchFn = benchmark): SkillAxis[] {
  const all = profile(matches, tier, bench)
  if (!all) return []
  const usable = matches.filter((m) => m.position && !m.remake && m.durationSec >= 600)
  const recent = usable.length >= 15 ? profile(usable.slice(0, 10), tier, bench) : null
  return AXES.map((a) => ({
    key: a.key,
    label: a.label,
    unit: a.unit,
    overall: all[a.key].score,
    rawOverall: all[a.key].raw,
    recent: recent ? recent[a.key].score : null,
    rawRecent: recent ? recent[a.key].raw : null
  }))
}
