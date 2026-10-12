// Moteur de score du draft helper. Fonctions pures : aucune I/O ici.
//
// Chaque critère produit une valeur entre 0 et 1 (0.5 = neutre). Le score final est
// la moyenne pondérée des critères activés qui ont des données, ramenée sur 100.

import type { CriterionKey, CriterionResult, DraftWeights, Suggestion } from '@shared/types'
import { CRITERIA } from '@shared/types'

export interface CandidateInput {
  champion: string
  /** Games perso sur ce champion (file filtrée selon les réglages). */
  personal: { games: number; wins: number }
  /** null = donnée de mastery indisponible (client non lancé). */
  mastery: { level: number; points: number } | null
  /** null = le champion n'apparaît pas dans la méta de cette lane. */
  meta: { winRate: number; tier: number; play: number } | null
  /** null = adversaire de lane inconnu. */
  matchup: { opponent: string; play: number; winRate: number } | null
  /** Une entrée par allié connu ; tableau vide = aucun allié connu. */
  synergy: Array<{ ally: string; play: number; winRate: number | null }>
}

export const PERSONAL_PRIOR_GAMES = 10
const MATCHUP_PRIOR_GAMES = 200
const SYNERGY_PRIOR_GAMES = 100

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
/** Projette un winrate sur [0,1] : `lo` -> 0, `hi` -> 1. */
const scaleWr = (wr: number, lo: number, hi: number): number => clamp01((wr - lo) / (hi - lo))
const pct = (x: number): string => `${Math.round(x * 100)}%`

/** Winrate lissé (moyenne bayésienne) : tire les petits échantillons vers `prior`. */
export function smoothedWinRate(wins: number, games: number, prior: number, priorGames: number): number {
  return (wins + prior * priorGames) / (games + priorGames)
}

export function personalComponent(c: CandidateInput): CriterionResult {
  const prior = c.meta?.winRate ?? 0.5
  const { games, wins } = c.personal
  const wr = smoothedWinRate(wins, games, prior, PERSONAL_PRIOR_GAMES)
  // Petit bonus de confort : jouer souvent un champion compte même à winrate égal.
  const comfort = Math.min(1, Math.log10(games + 1) / 2) * 0.15
  const value = clamp01(scaleWr(wr, 0.35, 0.65) * 0.85 + comfort)
  const label = games === 0 ? 'jamais joué' : `${pct(wins / games)} WR perso sur ${games} game${games > 1 ? 's' : ''}`
  return { value, label }
}

export function masteryComponent(c: CandidateInput): CriterionResult {
  if (!c.mastery) return { value: null, label: 'mastery indisponible' }
  const { points, level } = c.mastery
  // 1 000 000 points ≈ maximum de l'échelle (log pour ne pas écraser les petits pools).
  const value = clamp01(Math.log10(points + 1) / 6)
  return { value, label: points > 0 ? `mastery ${level} (${formatPoints(points)} pts)` : 'pas de mastery' }
}

export function metaComponent(c: CandidateInput): CriterionResult {
  if (!c.meta) return { value: 0.1, label: 'hors méta sur ce rôle' }
  const { winRate, tier } = c.meta
  const tierScore = clamp01((5 - tier) / 4) // tier 1 (OP) -> 1, tier 5 -> 0
  return { value: 0.7 * scaleWr(winRate, 0.45, 0.55) + 0.3 * tierScore, label: `méta : ${pct(winRate)} WR, ${tier === 0 ? 'tier OP' : `tier ${tier}`}` }
}

export function matchupComponent(c: CandidateInput): CriterionResult {
  if (!c.matchup) return { value: null, label: 'adversaire de lane inconnu' }
  const { opponent, play, winRate } = c.matchup
  if (play === 0) return { value: 0.5, label: `pas de données vs ${opponent}` }
  const wr = smoothedWinRate(winRate * play, play, 0.5, MATCHUP_PRIOR_GAMES)
  return { value: scaleWr(wr, 0.42, 0.58), label: `${pct(winRate)} vs ${opponent} (${play} games)` }
}

export function synergyComponent(c: CandidateInput): CriterionResult {
  if (c.synergy.length === 0) return { value: null, label: 'aucun allié connu' }
  const known = c.synergy.filter((s) => s.winRate !== null && s.play > 0) as Array<{ ally: string; winRate: number }>
  // Les tables OP.GG ne listent que les meilleurs duos : absence = neutre.
  const values = c.synergy.map((s) =>
    s.winRate === null || s.play === 0
      ? 0.5
      : scaleWr(smoothedWinRate(s.winRate * s.play, s.play, 0.5, SYNERGY_PRIOR_GAMES), 0.45, 0.57)
  )
  const value = values.reduce((a, b) => a + b, 0) / values.length
  const best = known.sort((a, b) => b.winRate - a.winRate)[0]
  return { value, label: best ? `bon duo avec ${best.ally} (${pct(best.winRate)})` : 'synergie neutre' }
}

const COMPONENTS: Record<CriterionKey, (c: CandidateInput) => CriterionResult> = {
  personal: personalComponent,
  mastery: masteryComponent,
  meta: metaComponent,
  matchup: matchupComponent,
  synergy: synergyComponent
}

export function scoreCandidate(c: CandidateInput, weights: DraftWeights): Suggestion {
  const components = {} as Record<CriterionKey, CriterionResult>
  let num = 0
  let den = 0
  for (const k of CRITERIA) {
    const r = COMPONENTS[k](c)
    components[k] = r
    const w = weights[k]
    if (!w.enabled || w.weight <= 0 || r.value === null) continue
    num += w.weight * r.value
    den += w.weight
  }
  const score = den > 0 ? (num / den) * 100 : 0
  return { champion: c.champion, score, components, summary: summarize(components, weights) }
}

export function rankCandidates(cands: CandidateInput[], weights: DraftWeights, top = 8): Suggestion[] {
  return cands
    .map((c) => scoreCandidate(c, weights))
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
}

/** Phrase courte : les deux critères actifs les plus favorables, et le plus défavorable s'il est net. */
function summarize(components: Record<CriterionKey, CriterionResult>, weights: DraftWeights): string {
  const active = CRITERIA.filter((k) => weights[k].enabled && weights[k].weight > 0 && components[k].value !== null)
    .map((k) => ({ k, v: components[k].value as number, label: components[k].label }))
    .sort((a, b) => b.v - a.v)
  const parts = active.filter((a) => a.v >= 0.6).slice(0, 2).map((a) => a.label)
  const worst = active[active.length - 1]
  if (worst && worst.v <= 0.3) parts.push(`point faible : ${worst.label}`)
  return parts.join(' · ') || active.slice(0, 2).map((a) => a.label).join(' · ')
}

function formatPoints(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M`
  if (p >= 1000) return `${Math.round(p / 1000)}k`
  return String(p)
}

/** Vecteur de features pour le modèle ML : valeurs des critères, null -> 0.5 (neutre). */
export function featureVector(c: CandidateInput): number[] {
  return CRITERIA.map((k) => COMPONENTS[k](c).value ?? 0.5)
}
