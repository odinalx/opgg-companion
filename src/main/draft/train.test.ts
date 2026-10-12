import { describe, expect, it } from 'vitest'
import { MIN_SAMPLES, type Sample, trainModel } from './train'

// Générateur pseudo-aléatoire déterministe.
function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
  }
}

describe('trainModel', () => {
  it('donne le plus de poids au critère qui explique réellement les victoires', () => {
    const rand = rng(42)
    const samples: Sample[] = Array.from({ length: 400 }, () => {
      const x = Array.from({ length: 5 }, () => rand())
      // Seul le critère "matchup" (index 3) influence le résultat.
      const p = 1 / (1 + Math.exp(-8 * (x[3] - 0.5)))
      return { x, y: rand() < p ? 1 : 0 }
    })
    const model = trainModel(samples)
    const best = Object.entries(model.weights).sort((a, b) => b[1] - a[1])[0][0]
    expect(best).toBe('matchup')
    expect(model.accuracy).toBeGreaterThan(model.baseline)
  })

  it('refuse un dataset trop petit', () => {
    expect(() => trainModel([{ x: [0.5, 0.5, 0.5, 0.5, 0.5], y: 1 }])).toThrow(String(MIN_SAMPLES))
  })
})
