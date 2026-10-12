// Données statiques Riot (Data Dragon) : champions, sorts d'invocateur, runes.
// Sert à faire le lien entre les ids numériques du client LoL, les noms affichés
// renvoyés par OP.GG et les clés attendues par les outils MCP.

import type { ChampionInfo } from '@shared/types'

const BASE = 'https://ddragon.leagueoflegends.com'

export interface StaticData {
  version: string
  champions: ChampionInfo[]
  spells: Record<number, string> // id numérique -> clé image (ex: 4 -> "SummonerFlash")
  runes: Record<number, string> // id rune/style -> chemin icône
  items: Record<number, ItemInfo>
}

export interface ItemInfo {
  name: string
  gold: number
  completed: boolean // ne se combine plus en un autre item
  boots: boolean
}

let data: StaticData | null = null
let loading: Promise<StaticData> | null = null
const byId = new Map<number, ChampionInfo>()
const byNorm = new Map<string, ChampionInfo>()

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Data Dragon ${res.status} sur ${url}`)
  return res.json()
}

export function loadStaticData(): Promise<StaticData> {
  if (data) return Promise.resolve(data)
  loading ??= (async () => {
    const versions: string[] = await getJson(`${BASE}/api/versions.json`)
    const version = versions[0]
    const [champs, summoners, runes, itemsJson] = await Promise.all([
      getJson(`${BASE}/cdn/${version}/data/en_US/champion.json`),
      getJson(`${BASE}/cdn/${version}/data/en_US/summoner.json`),
      getJson(`${BASE}/cdn/${version}/data/en_US/runesReforged.json`),
      getJson(`${BASE}/cdn/${version}/data/en_US/item.json`)
    ])
    const items: Record<number, ItemInfo> = {}
    for (const [id, it] of Object.entries<any>(itemsJson.data))
      items[Number(id)] = {
        name: it.name,
        gold: it.gold?.total ?? 0,
        completed: !it.into?.length,
        boots: (it.tags ?? []).includes('Boots')
      }
    const champions: ChampionInfo[] = Object.values<any>(champs.data)
      .map((c) => ({ id: Number(c.key), key: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const spells: Record<number, string> = {}
    for (const s of Object.values<any>(summoners.data)) spells[Number(s.key)] = s.id
    const runeIcons: Record<number, string> = {}
    for (const style of runes) {
      runeIcons[style.id] = style.icon
      for (const slot of style.slots) for (const r of slot.runes) runeIcons[r.id] = r.icon
    }
    data = { version, champions, spells, runes: runeIcons, items }
    setChampions(champions)
    return data
  })().finally(() => (loading = null))
  return loading
}

/** Exposé pour les tests : injecte une liste de champions sans réseau. */
export function setChampions(list: ChampionInfo[]): void {
  byId.clear()
  byNorm.clear()
  for (const c of list) {
    byId.set(c.id, c)
    byNorm.set(normalizeName(c.name), c)
    byNorm.set(normalizeName(c.key), c)
  }
}

export function championById(id: number): ChampionInfo | undefined {
  return byId.get(id)
}

/** Retrouve un champion depuis un nom affiché ("Kha'Zix") ou une clé ("Khazix"). */
export function championByName(name: string): ChampionInfo | undefined {
  return byNorm.get(normalizeName(name))
}

/** Clé attendue par l'OP.GG MCP (UPPER_SNAKE_CASE ; la clé Data Dragon en majuscules est acceptée). */
export function opggChampionKey(name: string): string {
  const c = championByName(name)
  return (c?.key ?? name).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function itemInfo(id: number): ItemInfo | undefined {
  return data?.items[id]
}
