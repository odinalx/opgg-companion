// Régression logistique entraînée sur l'historique perso.
// Features = valeurs des 5 critères (0..1) au moment de la game, cible = victoire.
// Les coefficients appris (positifs) deviennent des poids personnalisés pour le score.

import type { CriterionKey, ModelInfo } from '@shared/types'
import { CRITERIA } from '@shared/types'

export interface Sample {
  x: number[] // longueur = CRITERIA.length
  y: 0 | 1
}

export const MIN_SAMPLES = 50

interface Fit {
  w: number[]
  b: number
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z))

/** Descente de gradient batch avec régularisation L2. Features centrées sur 0.5. */
export function fitLogistic(samples: Sample[], { epochs = 2000, lr = 0.5, l2 = 0.01 } = {}): Fit {
  const d = CRITERIA.length
  const w = new Array(d).fill(0)
  let b = 0
  const n = samples.length
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0)
    let gb = 0
    for (const s of samples) {
      const z = b + s.x.reduce((acc, xi, i) => acc + w[i] * (xi - 0.5), 0)
      const err = sigmoid(z) - s.y
      for (let i = 0; i < d; i++) gw[i] += err * (s.x[i] - 0.5)
      gb += err
    }
    for (let i = 0; i < d; i++) w[i] -= lr * (gw[i] / n + l2 * w[i])
    b -= lr * (gb / n)
  }
  return { w, b }
}

export function predict(fit: Fit, x: number[]): number {
  return sigmoid(fit.b + x.reduce((acc, xi, i) => acc + fit.w[i] * (xi - 0.5), 0))
}

/** Précision en validation croisée k-fold (ordre préservé, les games sont chronologiques). */
export function crossValidate(samples: Sample[], k = 5): number {
  if (samples.length < k) return 0
  let correct = 0
  const foldSize = Math.ceil(samples.length / k)
  for (let f = 0; f < k; f++) {
    const test = samples.slice(f * foldSize, (f + 1) * foldSize)
    const train = [...samples.slice(0, f * foldSize), ...samples.slice((f + 1) * foldSize)]
    if (!test.length || !train.length) continue
    const fit = fitLogistic(train, { epochs: 800 })
    for (const s of test) if ((predict(fit, s.x) >= 0.5 ? 1 : 0) === s.y) correct++
  }
  return correct / samples.length
}

export function trainModel(samples: Sample[]): ModelInfo {
  if (samples.length < MIN_SAMPLES)
    throw new Error(`Pas assez de games pour entraîner (${samples.length}/${MIN_SAMPLES}).`)
  const fit = fitLogistic(samples)
  // Un coefficient négatif voudrait dire "ce critère fait perdre" : sur un historique
  // perso c'est presque toujours du bruit, on le ramène à 0 plutôt que d'inverser le critère.
  const pos = fit.w.map((v) => Math.max(0, v))
  const sum = pos.reduce((a, b) => a + b, 0)
  const weights = {} as Record<CriterionKey, number>
  CRITERIA.forEach((key, i) => (weights[key] = sum > 0 ? Math.round((pos[i] / sum) * 100) : 20))
  const winRate = samples.filter((s) => s.y === 1).length / samples.length
  return {
    trainedAt: new Date().toISOString(),
    samples: samples.length,
    accuracy: crossValidate(samples),
    baseline: Math.max(winRate, 1 - winRate),
    weights
  }
}
