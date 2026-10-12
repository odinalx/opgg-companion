// Validation des données reçues de l'interface par IPC. L'interface est locale, mais le main ne
// fait confiance qu'à ce qu'il vérifie : clés connues, types attendus, nombres bornés.

import type { ChampionBuild, OverlaySettings, Settings } from '@shared/types'
import { CRITERIA, POSITIONS, REGIONS, TIERS } from '@shared/types'

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const oneOf = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
/** Raccourci au format Electron (« Control+Shift+B », « Alt+Space », « Control+; »…), longueur raisonnable. */
const hotkey = (v: unknown, fallback: string): string =>
  typeof v === 'string' && /^[A-Za-z0-9+;,./\\'`[\]=-]{1,40}$/.test(v) ? v : fallback
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null)

function overlay(v: unknown, cur: OverlaySettings): OverlaySettings {
  if (!isObj(v)) return cur
  const pos = (p: unknown, c: { x: number; y: number }) => (isObj(p) ? { x: num(p.x, 0, 100, c.x), y: num(p.y, 0, 100, c.y) } : c)
  return {
    enabled: bool(v.enabled, cur.enabled),
    mode: oneOf(v.mode, ['overlay', 'window'] as const, cur.mode),
    displayId:
      v.displayId === undefined ? cur.displayId : v.displayId === null ? null : num(v.displayId, 0, Number.MAX_SAFE_INTEGER, cur.displayId ?? 0),
    metrics: {
      cs: bool(v.metrics?.cs, cur.metrics.cs),
      vision: bool(v.metrics?.vision, cur.metrics.vision),
      gold: bool(v.metrics?.gold, cur.metrics.gold),
      kp: bool(v.metrics?.kp, cur.metrics.kp)
    },
    goldDiffOnTab: bool(v.goldDiffOnTab, cur.goldDiffOnTab),
    scoreboard: {
      x: num(v.scoreboard?.x, 0, 100, cur.scoreboard.x),
      y: num(v.scoreboard?.y, 0, 100, cur.scoreboard.y),
      spacing: num(v.scoreboard?.spacing, 1, 20, cur.scoreboard.spacing),
      swapSides: bool(v.scoreboard?.swapSides, cur.scoreboard.swapSides),
      calibrate: bool(v.scoreboard?.calibrate, cur.scoreboard.calibrate)
    },
    positions: {
      cs: pos(v.positions?.cs, cur.positions.cs),
      vision: pos(v.positions?.vision, cur.positions.vision),
      gold: pos(v.positions?.gold, cur.positions.gold),
      kp: pos(v.positions?.kp, cur.positions.kp),
      build: pos(v.positions?.build, cur.positions.build)
    },
    toggleKey: hotkey(v.toggleKey, cur.toggleKey),
    buildKey: hotkey(v.buildKey, cur.buildKey),
    editKey: hotkey(v.editKey, cur.editKey)
  }
}

/** Ne garde du patch que les clés connues, avec des valeurs valides. */
export function sanitizeSettingsPatch(patch: unknown, cur: Settings): Partial<Settings> {
  if (!isObj(patch)) return {}
  const out: Partial<Settings> = {}
  if ('region' in patch) out.region = oneOf(patch.region, REGIONS, cur.region)
  if ('manualAccount' in patch) {
    const a = patch.manualAccount
    const gameName = isObj(a) ? text(a.gameName, 32)?.trim() : null
    const tagLine = isObj(a) ? text(a.tagLine, 8)?.trim() : null
    out.manualAccount =
      gameName && tagLine ? { gameName, tagLine, region: oneOf(a!.region, REGIONS, cur.region) } : null
  }
  if ('weights' in patch && isObj(patch.weights)) {
    out.weights = { ...cur.weights }
    for (const k of CRITERIA) {
      const w = patch.weights[k]
      if (isObj(w))
        out.weights[k] = { enabled: bool(w.enabled, cur.weights[k].enabled), weight: num(w.weight, 0, 100, cur.weights[k].weight) }
    }
  }
  if ('useModel' in patch) out.useModel = bool(patch.useModel, cur.useModel)
  if ('queueFilter' in patch) out.queueFilter = oneOf(patch.queueFilter, ['ranked', 'all'] as const, cur.queueFilter)
  if ('candidatePool' in patch) out.candidatePool = oneOf(patch.candidatePool, ['owned', 'played', 'all'] as const, cur.candidatePool)
  if ('autoImport' in patch) out.autoImport = bool(patch.autoImport, cur.autoImport)
  if ('compareTier' in patch) out.compareTier = oneOf(patch.compareTier, ['auto', ...TIERS] as const, cur.compareTier)
  if ('overlay' in patch) out.overlay = overlay(patch.overlay, cur.overlay)
  return out
}

const ids = (v: unknown, max: number): number[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => Number.isInteger(x) && x > 0 && x < 1e7) ? (v as number[]) : null

/**
 * Vérifie un build composé dans l'interface avant de l'écrire dans le client LoL :
 * seuls des identifiants numériques (runes, sorts, items) en nombre plausible passent.
 */
export function sanitizeBuild(v: unknown): ChampionBuild | null {
  if (!isObj(v) || !text(v.champion, 40) || !POSITIONS.includes(v.position)) return null
  const option = (o: unknown, max: number) => {
    if (o === null || o === undefined) return null
    if (!isObj(o)) return undefined
    const list = ids(o.ids, max)
    if (!list) return undefined
    const names = Array.isArray(o.names) ? o.names.filter((n: unknown) => typeof n === 'string' && n.length <= 60).slice(0, max) : []
    return { ids: list, names, games: num(o.games, 0, 1e9, 0), winRate: num(o.winRate, 0, 1, 0), pickRate: num(o.pickRate, 0, 1, 0) }
  }
  const r = v.runes
  let runes: ChampionBuild['runes'] = null
  if (r !== null && r !== undefined) {
    const perks = isObj(r) ? ids(r.perks, 6) : null
    const shards = isObj(r) ? ids(r.shards, 3) : null
    if (!perks || perks.length !== 6 || !shards || shards.length !== 3 || !Number.isInteger(r.primaryStyle) || !Number.isInteger(r.subStyle))
      return null
    runes = {
      primaryStyle: r.primaryStyle,
      subStyle: r.subStyle,
      perks,
      shards,
      primaryName: text(r.primaryName, 40) ?? '',
      subName: text(r.subName, 40) ?? '',
      perkNames: Array.isArray(r.perkNames) ? r.perkNames.filter((n: unknown) => typeof n === 'string' && n.length <= 60).slice(0, 6) : [],
      games: 0,
      winRate: 0
    }
  }
  const spells = option(v.spells, 2)
  const starter = option(v.starter, 6)
  const core = option(v.core, 6)
  const boots = option(v.boots, 1)
  if (spells === undefined || starter === undefined || core === undefined || boots === undefined) return null
  return {
    champion: v.champion,
    position: v.position,
    runes,
    spells,
    starter,
    core,
    boots,
    fourth: [],
    fifth: [],
    sixth: [],
    skillOrder: [],
    skillPriority: []
  }
}

/** Compte Riot reçu de l'interface (sert à des appels OP.GG). */
export function sanitizeAccount(v: unknown): { gameName: string; tagLine: string; region: (typeof REGIONS)[number] } {
  const gameName = isObj(v) ? text(v.gameName, 32) : null
  const tagLine = isObj(v) ? text(v.tagLine, 8) : null
  if (!gameName || !tagLine || !isObj(v) || !REGIONS.includes(v.region)) throw new Error('Compte invalide.')
  return { gameName, tagLine, region: v.region }
}

export function sanitizeChampion(v: unknown): string {
  const name = text(v, 40)
  if (!name || !/^[\p{L}0-9 .'&-]+$/u.test(name)) throw new Error('Champion invalide.')
  return name
}

export function sanitizePosition(v: unknown): (typeof POSITIONS)[number] {
  if (!POSITIONS.includes(v as never)) throw new Error('Rôle invalide.')
  return v as (typeof POSITIONS)[number]
}
