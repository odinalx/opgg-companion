// Builds de joueurs high elo regroupés en variantes cohérentes : chaque variante réunit des
// games jouées avec la même keystone, le même arbre secondaire et les mêmes sorts ; ses items
// sont les items terminés les plus fréquents dans ces mêmes games.

import type { BuildVariant, MatchSummary, ProGame, RunePage } from '@shared/types'
import { itemInfo } from '../ddragon'

export interface SourcedGame {
  match: MatchSummary
  game: ProGame
}

/** Page complète la plus jouée qui correspond à la keystone et à l'arbre secondaire observés. */
export function completeRunePage(keystone: number, subStyle: number, pages: RunePage[]): RunePage | null {
  const exact = pages.filter((p) => p.perks[0] === keystone && p.subStyle === subStyle)
  const loose = pages.filter((p) => p.perks[0] === keystone)
  const best = (list: RunePage[]) => [...list].sort((a, b) => b.games - a.games)[0] ?? null
  return best(exact) ?? best(loose)
}

export function groupVariants(games: SourcedGame[], pages: RunePage[], opponent: string | null, max = 2): BuildVariant[] {
  const groups = new Map<string, SourcedGame[]>()
  for (const g of games) {
    const m = g.match
    if (!m.primaryRune || m.spells.length < 2) continue
    const key = `${m.primaryRune}|${m.secondaryPage}|${[...m.spells].sort((a, b) => a - b).join(',')}`
    groups.set(key, [...(groups.get(key) ?? []), g])
  }

  const variants = [...groups.values()].map((list): BuildVariant => {
    const first = list[0].match
    const itemCount = new Map<number, number>()
    const bootCount = new Map<number, number>()
    for (const { match } of list)
      for (const id of new Set(match.items)) {
        const info = itemInfo(id)
        if (!info) continue
        // Les bottes de palier 2 s'améliorent encore (palier 3) : on les compte quand même.
        if (info.boots) {
          if (info.gold >= 900) bootCount.set(id, (bootCount.get(id) ?? 0) + 1)
        } else if (info.completed && info.gold >= 1000) itemCount.set(id, (itemCount.get(id) ?? 0) + 1) // hors composants et consommables
      }
    const byFreq = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    // Sorts dans l'ordre le plus joué (Flash sur D ou F selon la majorité du groupe).
    const spellOrder = new Map<string, number>()
    for (const { match } of list) spellOrder.set(match.spells.join(','), (spellOrder.get(match.spells.join(',')) ?? 0) + 1)
    const spells = [...spellOrder.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
    const vs = list.filter((g) => opponent && g.game.opponent === opponent)
    const examples = [...vs, ...list.filter((g) => !vs.includes(g))]
      .slice(0, 4)
      .map((g) => g.game)
    return {
      games: list.length,
      wins: list.filter((g) => g.match.win).length,
      vsOpponent: vs.length,
      keystone: first.primaryRune!,
      subStyle: first.secondaryPage ?? 0,
      runes: completeRunePage(first.primaryRune!, first.secondaryPage ?? 0, pages),
      spells,
      items: byFreq(itemCount).slice(0, 4),
      boots: byFreq(bootCount)[0] ?? null,
      examples
    }
  })

  // Une game contre l'adversaire compte triple : elle pèse sans écraser une variante bien plus jouée.
  const weight = (v: BuildVariant) => v.games + 2 * v.vsOpponent
  return variants.sort((a, b) => weight(b) - weight(a) || b.wins - a.wins).slice(0, max)
}
