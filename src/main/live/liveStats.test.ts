import { describe, expect, it } from 'vitest'
import { setChampions } from '../ddragon'
import { computeLiveStats } from './liveStats'

describe('computeLiveStats', () => {
  it('calcule CS/min, participation et or estimé', () => {
    setChampions([{ id: 62, key: 'MonkeyKing', name: 'Wukong' }])
    const s = computeLiveStats({
      activePlayer: { riotId: 'Joueur#EUW', currentGold: 500.7, level: 9 },
      allPlayers: [
        {
          riotId: 'Joueur#EUW',
          championName: 'Wukong (localisé)',
          rawChampionName: 'game_character_displayname_MonkeyKing',
          team: 'ORDER',
          position: 'JUNGLE',
          level: 9,
          items: [{ itemID: 1, price: 1000, count: 1 }, { itemID: 2, price: 50, count: 2 }],
          scores: { creepScore: 90, kills: 3, deaths: 1, assists: 4, wardScore: 12.4 }
        },
        { riotId: 'ally#1', team: 'ORDER', position: 'TOP', items: [{ price: 3000, count: 1 }], scores: { kills: 7 } },
        { riotId: 'enemy#1', team: 'CHAOS', position: 'JUNGLE', items: [{ price: 1500, count: 1 }], scores: { kills: 20 } },
        { riotId: 'enemy#2', team: 'CHAOS', position: 'TOP', items: [{ price: 3500, count: 1 }], scores: { kills: 0 } }
      ],
      gameData: { gameTime: 900 }
    }, 'GOLD')!
    expect(s.champion).toBe('Wukong')
    expect(s.position).toBe('jungle')
    expect(s.csPerMin).toBe(6)
    expect(s.killParticipation).toBe(0.7)
    expect(s.goldEarned).toBe(1600)
    expect(s.vision).toBe(12)
    // Écart d'or par lane, vu de ton équipe : jungle 1100 - 1500, top 3000 - 3500.
    expect(s.lanes.find((l) => l.position === 'jungle')).toMatchObject({ diff: -400, mine: true, enemy: '?' })
    expect(s.lanes.find((l) => l.position === 'top')?.diff).toBe(-500)
    expect(s.teamGoldDiff).toBe(4100 - 5000)
    expect(s.bench?.csPerMin).toBeGreaterThan(0) // médiane Or du jungler
  })

  it('renvoie null hors partie', () => {
    expect(computeLiveStats({}, 'GOLD')).toBeNull()
  })
})
