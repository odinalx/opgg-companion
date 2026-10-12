// Test de bout en bout contre l'OP.GG MCP réel. Lancer avec : npm run smoke:opgg
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'
import { loadStaticData } from '../src/main/ddragon'
import { DraftEngine } from '../src/main/draft/engine'
import { OpggClient } from '../src/main/opgg/client'
import { DiskCache } from '../src/main/store'

const ACC = { gameName: process.env.SMOKE_NAME ?? 'Hide on bush', tagLine: process.env.SMOKE_TAG ?? 'KR1', region: (process.env.SMOKE_REGION ?? 'KR') as 'KR' }

describe.runIf(process.env.SMOKE)('OP.GG MCP (réseau)', { timeout: 120_000 }, () => {
  const cache = new DiskCache(join(mkdtempSync(join(tmpdir(), 'opgg-smoke-')), 'cache.json'))
  const opgg = new OpggClient(cache)

  it('profil', async () => {
    const p = await opgg.getProfile(ACC)
    console.log(p.ranked[0], p.champions.slice(0, 3))
    expect(p.champions.length).toBeGreaterThan(0)
  })

  it('historique + détail', async () => {
    const ms = await opgg.listMatches(ACC, 10)
    console.log(ms[0])
    expect(ms.length).toBeGreaterThan(0)
    const d = await opgg.getMatchDetail(ACC, ms[0].id, ms[0].createdAt)
    expect(d.teams.flatMap((t) => t.participants)).toHaveLength(ms[0].queue === 'ARENA' ? 16 : 10)
    expect(d.teams.flatMap((t) => t.participants).some((p) => p.isTarget)).toBe(true)
  })

  it('suggestions de draft', async () => {
    await loadStaticData()
    const engine = new DraftEngine(opgg)
    const r = await engine.suggest(
      {
        myPosition: 'mid',
        allies: [{ champion: 'Lee Sin', position: 'jungle' }, { champion: 'Thresh', position: null }],
        enemies: [{ champion: 'Zed', position: null }, { champion: 'Darius', position: null }],
        bans: ['Yasuo'],
        pickedByMe: null,
        source: 'manual'
      },
      { matches: [], mastery: null, owned: null },
      { ...DEFAULT_SETTINGS, candidatePool: 'all' },
      null
    )
    for (const s of r.suggestions) console.log(Math.round(s.score), s.champion, '—', s.summary)
    console.log('warnings:', r.warnings, 'enemyLaner:', r.enemyLaner)
    expect(r.enemyLaner).toBe('Zed')
    expect(r.suggestions.length).toBeGreaterThan(3)
    expect(r.suggestions.some((s) => s.champion === 'Yasuo' || s.champion === 'Zed')).toBe(false)
    expect(r.suggestions[0].components.matchup.value).not.toBeNull()
  })
})
