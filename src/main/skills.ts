// Profil de jeu en 6 domaines (radar hexagonal).
// Chaque game est notée par rapport à des repères de son rôle, puis on fait la moyenne :
// un support n'est pas pénalisé sur le farm, un ADC n'est pas comparé à un jungler.
// Les repères sont des ordres de grandeur pour les parties classées (≈ médiane et ≈ top 10 %),
// ce ne sont pas des percentiles exacts.

import type { MatchSummary, Position, SkillAxis, SkillKey } from '@shared/types'

interface Benchmark {
  mid: number // vaut 50
  high: number // vaut 90
}

type RoleBenchmarks = Record<SkillKey, Benchmark>

const DEFAULT_ROLE: RoleBenchmarks = {
  combat: { mid: 2.6, high: 4.2 }, // KDA
  farm: { mid: 6.5, high: 8.6 }, // CS/min
  damage: { mid: 700, high: 1050 }, // dégâts aux champions/min
  vision: { mid: 0.38, high: 0.6 }, // wards posées + achetées /min
  survival: { mid: 2.1, high: 1.3 }, // morts /10 min (moins = mieux)
  economy: { mid: 390, high: 450 } // or/min
}

const BENCHMARKS: Record<Position, RoleBenchmarks> = {
  top: { ...DEFAULT_ROLE, damage: { mid: 650, high: 950 }, economy: { mid: 380, high: 440 } },
  jungle: {
    ...DEFAULT_ROLE,
    farm: { mid: 5.6, high: 7.2 },
    damage: { mid: 560, high: 850 },
    vision: { mid: 0.42, high: 0.66 },
    economy: { mid: 365, high: 425 }
  },
  mid: { ...DEFAULT_ROLE, damage: { mid: 760, high: 1120 } },
  adc: { ...DEFAULT_ROLE, farm: { mid: 7.0, high: 9.0 }, damage: { mid: 760, high: 1120 }, economy: { mid: 405, high: 465 } },
  support: {
    combat: { mid: 3.0, high: 4.6 },
    farm: { mid: 1.0, high: 1.8 },
    damage: { mid: 340, high: 600 },
    vision: { mid: 1.0, high: 1.55 },
    survival: { mid: 2.0, high: 1.3 },
    economy: { mid: 255, high: 305 }
  }
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

function profile(matches: MatchSummary[]): Record<SkillKey, { score: number; raw: number }> | null {
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
      score += rate(v, BENCHMARKS[m.position!][axis.key])
    }
    out[axis.key] = { score: score / usable.length, raw: raw / usable.length }
  }
  return out
}

/** `matches` est trié du plus récent au plus ancien. */
export function skillProfile(matches: MatchSummary[]): SkillAxis[] {
  const all = profile(matches)
  if (!all) return []
  const usable = matches.filter((m) => m.position && !m.remake && m.durationSec >= 600)
  const recent = usable.length >= 15 ? profile(usable.slice(0, 10)) : null
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
