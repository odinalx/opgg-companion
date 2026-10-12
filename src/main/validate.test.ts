import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'
import { sanitizeAccount, sanitizeBuild, sanitizeChampion, sanitizeSettingsPatch } from './validate'

describe('sanitizeSettingsPatch', () => {
  it('ignore les clés inconnues et borne les nombres', () => {
    const out = sanitizeSettingsPatch(
      {
        hack: 1,
        weights: { personal: { enabled: true, weight: 500 }, mastery: { enabled: 'oui', weight: -3 } },
        overlay: { ...DEFAULT_SETTINGS.overlay, positions: { ...DEFAULT_SETTINGS.overlay.positions, cs: { x: 150, y: -10 } } }
      },
      DEFAULT_SETTINGS
    )
    expect(out).not.toHaveProperty('hack')
    expect(out.weights?.personal.weight).toBe(100)
    expect(out.weights?.mastery).toEqual({ enabled: DEFAULT_SETTINGS.weights.mastery.enabled, weight: 0 })
    expect(out.overlay?.positions.cs).toEqual({ x: 100, y: 0 })
  })

  it('refuse un raccourci farfelu et garde le précédent', () => {
    const out = sanitizeSettingsPatch({ overlay: { ...DEFAULT_SETTINGS.overlay, buildKey: 'rm -rf /' } }, DEFAULT_SETTINGS)
    expect(out.overlay?.buildKey).toBe(DEFAULT_SETTINGS.overlay.buildKey)
  })

  it('accepte un Riot ID avec espaces et caractères non latins', () => {
    const out = sanitizeSettingsPatch({ manualAccount: { gameName: '걸어다니는 대포', tagLine: 'KR1', region: 'KR' } }, DEFAULT_SETTINGS)
    expect(out.manualAccount).toEqual({ gameName: '걸어다니는 대포', tagLine: 'KR1', region: 'KR' })
    expect(sanitizeSettingsPatch({ manualAccount: null }, DEFAULT_SETTINGS).manualAccount).toBeNull()
  })
})

describe('sanitizeChampion / sanitizeAccount', () => {
  it('accepte les noms de champions réels', () => {
    for (const n of ["Kai'Sa", 'Nunu & Willump', 'Dr. Mundo', "Bel'Veth", 'Wukong']) expect(sanitizeChampion(n)).toBe(n)
    expect(() => sanitizeChampion('<script>')).toThrow()
  })
  it('refuse un compte incomplet', () => {
    expect(sanitizeAccount({ gameName: 'Hide on bush', tagLine: 'KR1', region: 'KR' }).gameName).toBe('Hide on bush')
    expect(() => sanitizeAccount({ gameName: 'x', tagLine: 'y', region: 'MARS' })).toThrow()
  })
})

describe('sanitizeBuild', () => {
  const runes = { primaryStyle: 8000, subStyle: 8400, perks: [1, 2, 3, 4, 5, 6], shards: [5008, 5008, 5001], primaryName: 'P', subName: 'S', perkNames: [] }
  it('accepte un build composé dans l’interface', () => {
    const b = sanitizeBuild({ champion: 'Nasus', position: 'top', runes, spells: { ids: [4, 12] }, core: { ids: [3078, 3110] }, boots: { ids: [3047] } })
    expect(b?.runes?.perks).toHaveLength(6)
    expect(b?.spells?.ids).toEqual([4, 12])
  })
  it('garde les noms et winrates (titres du set d’items, message d’import)', () => {
    const b = sanitizeBuild({ champion: 'Nasus', position: 'top', runes: null, spells: { ids: [4, 12], names: ['Flash', 'Teleport'], games: 500, winRate: 0.53 } })
    expect(b?.spells).toMatchObject({ names: ['Flash', 'Teleport'], games: 500, winRate: 0.53 })
  })
  it('refuse des identifiants invalides', () => {
    expect(sanitizeBuild({ champion: 'Nasus', position: 'top', runes: { ...runes, perks: [1, 2] } })).toBeNull()
    expect(sanitizeBuild({ champion: 'Nasus', position: 'top', runes: null, spells: { ids: ['4', 12] } })).toBeNull()
    expect(sanitizeBuild({ champion: 'Nasus', position: 'ailleurs' })).toBeNull()
  })
})
