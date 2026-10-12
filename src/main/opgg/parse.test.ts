import { describe, expect, it } from 'vitest'
import { parseOpggText } from './parse'

describe('parseOpggText', () => {
  it('associe les arguments positionnels aux champs déclarés', () => {
    const text = `class LolGetChampionSynergies: data
class Data: synergies
class Synergie: synergy_champion_name,score,play,win_rate

LolGetChampionSynergies(Data([Synergie("Lee Sin",0,1976,0.52),Synergie("Kha'Zix",0,444,0.52)]))`
    expect(parseOpggText(text)).toEqual({
      data: {
        synergies: [
          { synergy_champion_name: 'Lee Sin', score: 0, play: 1976, win_rate: 0.52 },
          { synergy_champion_name: "Kha'Zix", score: 0, play: 444, win_rate: 0.52 }
        ]
      }
    })
  })

  it('gère null, booléens, échappements, négatifs et listes imbriquées', () => {
    const text = `class Root: a,b,c,d,e
class Item: x

Root(null,true,"https:\\/\\/x.gg\\/\\"q\\"",[-1.5,2e3],[[Item(false)],[]])`
    expect(parseOpggText(text)).toEqual({
      a: null,
      b: true,
      c: 'https://x.gg/"q"',
      d: [-1.5, 2000],
      e: [[{ x: false }], []]
    })
  })

  it('choisit la déclaration dont le nombre de champs correspond', () => {
    const text = `class Root: p,q
class Stats: kill
class Stats: kill,death

Root(Stats(1),Stats(2,3))`
    expect(parseOpggText(text)).toEqual({ p: { kill: 1 }, q: { kill: 2, death: 3 } })
  })

  it('renvoie le JSON tel quel quand la réponse est déjà du JSON', () => {
    expect(parseOpggText('{"data":{"counters":[]}}')).toEqual({ data: { counters: [] } })
  })

  it('signale une syntaxe invalide', () => {
    expect(() => parseOpggText('class A: x\n\nA(1')).toThrow(/OP.GG parse/)
  })
})
