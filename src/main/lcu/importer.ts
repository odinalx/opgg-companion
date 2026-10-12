// Import d'un build OP.GG dans le client LoL : page de runes, sorts d'invocateur, set d'items.
// Uniquement sur action de l'utilisateur (bouton, ou option « importer au lock » qu'il active).

import { randomUUID } from 'node:crypto'
import type { ChampionBuild, ImportResult } from '@shared/types'
import { championByName } from '../ddragon'
import type { LcuConnector } from './connector'

const PAGE_PREFIX = 'OPGG'
const FLASH = 4

export function runePageBody(build: ChampionBuild) {
  const r = build.runes!
  return {
    name: `${PAGE_PREFIX} ${build.champion} ${build.position}`,
    primaryStyleId: r.primaryStyle,
    subStyleId: r.subStyle,
    selectedPerkIds: [...r.perks, ...r.shards],
    current: true
  }
}

/**
 * Place les sorts recommandés en gardant Flash sur la touche où le joueur l'a déjà
 * (beaucoup de joueurs ont Flash sur F, d'autres sur D : on ne change pas l'habitude).
 */
export function arrangeSpells(recommended: number[], current: [number, number]): [number, number] {
  const [a, b] = recommended
  if (!recommended.includes(FLASH)) return [a, b]
  const other = a === FLASH ? b : a
  if (current[1] === FLASH) return [other, FLASH]
  if (current[0] === FLASH) return [FLASH, other]
  return [a, b]
}

/** « Core (57% WR) » quand le winrate est connu, sinon « Core ». */
const withWr = (label: string, winRate: number): string => (winRate > 0 ? `${label} (${Math.round(winRate * 100)}% WR)` : label)

export function itemSetBody(build: ChampionBuild) {
  const champ = championByName(build.champion)
  const block = (type: string, ids: number[]) => ({
    type,
    items: ids.map((id) => ({ id: String(id), count: 1 }))
  })
  const blocks = [
    build.starter && block(withWr('Départ', build.starter.winRate), build.starter.ids),
    build.boots && block('Bottes', build.boots.ids),
    build.core && block(withWr('Core', build.core.winRate), build.core.ids),
    build.fourth.length && block('4e item, au choix', build.fourth.flatMap((o) => o.ids)),
    build.fifth.length && block('5e item, au choix', build.fifth.flatMap((o) => o.ids)),
    build.sixth.length && block('6e item, au choix', build.sixth.flatMap((o) => o.ids))
  ].filter(Boolean)
  return {
    title: `${PAGE_PREFIX} ${build.champion} ${build.position}`,
    associatedChampions: champ ? [champ.id] : [],
    associatedMaps: [11],
    blocks,
    map: 'any',
    mode: 'any',
    preferredItemSlots: [],
    sortrank: 0,
    startedFrom: 'blank',
    type: 'custom',
    uid: randomUUID()
  }
}

export async function importRunes(lcu: LcuConnector, build: ChampionBuild): Promise<string> {
  if (!build.runes) throw new Error('pas de page de runes pour ce champion')
  const pages: any[] = (await lcu.get('/lol-perks/v1/pages')) ?? []
  // On remplace la page créée précédemment par l'app plutôt que d'en accumuler.
  for (const p of pages.filter((p) => p.isDeletable && String(p.name).startsWith(`${PAGE_PREFIX} `)))
    await lcu.request('DELETE', `/lol-perks/v1/pages/${p.id}`)
  const body = runePageBody(build)
  try {
    await lcu.request('POST', '/lol-perks/v1/pages', body)
  } catch {
    // Nombre maximal de pages atteint : on remplace la page active si elle est modifiable.
    const current = await lcu.get('/lol-perks/v1/currentpage')
    if (!current?.isDeletable) throw new Error('plus de place pour une page de runes, supprime-en une dans le client')
    await lcu.request('DELETE', `/lol-perks/v1/pages/${current.id}`)
    await lcu.request('POST', '/lol-perks/v1/pages', body)
  }
  return `${build.runes.perkNames[0] ?? 'Runes'} (${build.runes.primaryName} / ${build.runes.subName})`
}

export async function importSpells(lcu: LcuConnector, build: ChampionBuild): Promise<string> {
  if (!build.spells || build.spells.ids.length < 2) throw new Error('pas de sorts recommandés')
  const session = await lcu.get('/lol-champ-select/v1/session')
  const me = (session?.myTeam ?? []).find((p: any) => p.cellId === session.localPlayerCellId)
  const [spell1Id, spell2Id] = arrangeSpells(build.spells.ids, [me?.spell1Id ?? 0, me?.spell2Id ?? 0])
  await lcu.request('PATCH', '/lol-champ-select/v1/session/my-selection', { spell1Id, spell2Id })
  return build.spells.names.join(' + ')
}

export async function importItemSet(lcu: LcuConnector, build: ChampionBuild): Promise<string> {
  const summoner = await lcu.get('/lol-summoner/v1/current-summoner')
  const path = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`
  const current = (await lcu.get(path)) ?? { itemSets: [] }
  const set = itemSetBody(build)
  const itemSets = [...(current.itemSets ?? []).filter((s: any) => s.title !== set.title), set]
  await lcu.request('PUT', path, { ...current, itemSets })
  return set.title
}

export async function importBuild(
  lcu: LcuConnector,
  build: ChampionBuild,
  parts: { runes?: boolean; spells?: boolean; items?: boolean }
): Promise<ImportResult> {
  const result: ImportResult = { errors: [] }
  const run = async (key: 'runes' | 'spells' | 'items', label: string, fn: () => Promise<string>) => {
    if (!parts[key]) return
    try {
      result[key] = await fn()
    } catch (e) {
      result.errors.push(`${label} : ${(e as Error).message}`)
    }
  }
  await run('runes', 'Runes', () => importRunes(lcu, build))
  await run('spells', 'Sorts', () => importSpells(lcu, build))
  await run('items', "Set d'items", () => importItemSet(lcu, build))
  return result
}
