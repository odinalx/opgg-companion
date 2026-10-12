// Construit src/main/data/benchmarks.json : médianes par palier d'elo et par rôle, calculées
// sur des games classées solo récentes (OP.GG MCP). Lancer avec : npm run bench:build
//
// Les games sont classées selon l'elo moyen de la partie fourni par OP.GG ; chaque game
// apporte les 10 joueurs. Les comptes de départ viennent des classements OP.GG par palier.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import type { Position, Region } from '@shared/types'
import { OpggClient } from '../src/main/opgg/client'
import { DiskCache } from '../src/main/store'

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'] as const
type Tier = (typeof TIERS)[number]
const GAMES_PER_TIER = Number(process.env.BENCH_GAMES ?? 40)

const SEEDS: Record<Tier, string[]> = {
  IRON: ['Supbodor#EUW', 'sm3x#EUW', 'PeterSuchtFeta#W33D', 'BanglyRevolution#EUW', 'RamrodInfanterie#EUW', 'xxJL02xx#EUW', 'KCyphers#EUW', 'xNeelia#001', 'BabyBoy#1013', 'Mayrim11#EUW'],
  BRONZE: ['ExoSkeleton20#EUW', 'Fruk0sty#EUW', 'teomaltezos#EUW', 'Dopni#womp', 'Jonhwind#EUW', 'Nepomuk#NEP0', 'FoxBlood21#EUW', 'TerssaT#7457', 'Tuny#6961', 'Niklot#KAO'],
  SILVER: ['fernandotorres9#EUW', 'Disnasty#EUW', 'TYRANT#3507', 'Loki#GG69', 'KiTSOUNE#420', 'VexInFlex#Vex', 'Hulle#1123', 'MatteoBigD#7351', 'An0my#EUW', 'SpielNur#Spiel'],
  GOLD: ['LegolasX3#EUW', 'Roary#187', 'DaddyAdi#woof', 'Hulangangster443#EUW', 'Toki#Xzy', 'Alicion Thor#EUW', 'Yoomama op#EUW', 'Don alae#EUW', 'Why flame me#123'],
  PLATINUM: ['demon01#8249', 'DavyKun#Esp', 'Etharmethat#EUW', 'LostauBoyI#EUW', 'derty 820#EUW', 'Shadows Peak#EUW', 'Kuk0st#EUW', 'Afrika Gunnar#123', 'TheArmanFighter#EUW', 'MRumpelinho#EUW'],
  EMERALD: ['BIRDPERSON#B1RD', 'fricsone59#EUW', 'I AFK For Fun#FUN', 'Tahmas#Kench', 'issulia#EUW', 'Pumuskel#EUW', 'RedKingShaNx#EUW', 'Nutellamonsteret#EUW', 'Simon#TSG', 'Shirou Emiya#3675'],
  DIAMOND: ['michal aniol#EUW', 'Meemd#EUW', 'Lurven#000', 'Garbage Garry#000', 'Lv99 Zekrom#storm', 'Seasoned Feet#CHEF', 'FirskoB#EUW', 'Nalasaurus#EUW', 'Swain#So1', 'ODE Npunkt#111'],
  MASTER: ['Hide on bush#KR1@KR', 'AgameK Stitch#EUW', 'LETMESTACK10MIN#DOG', 'twtv RO1DUMONDE#Haine', 'l Foxy I#EUW', 'AgitatedData560#111', 'Jakez123#Dog']
}

interface Row {
  tier: Tier
  position: Position
  min: number
  cs: number
  gold: number
  damage: number
  wards: number
  kills: number
  deaths: number
  assists: number
  teamKills: number
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

function bucket(tier: string | undefined): Tier | null {
  const t = (tier ?? '').toUpperCase()
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t)) return 'MASTER'
  return (TIERS as readonly string[]).includes(t) ? (t as Tier) : null
}

describe.runIf(process.env.BENCH)('benchmarks par elo', () => {
  it('collecte et agrège', { timeout: 3_600_000 }, async () => {
    const opgg = new OpggClient(new DiskCache(join(process.env.BENCH_CACHE ?? mkdtempSync(join(tmpdir(), 'bench-')), 'cache.json')))
    const rows: Row[] = []
    const gamesPerTier = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>
    const seen = new Set<string>()

    // Comptes rencontrés dans les games de chaque palier : explorés si les comptes de départ ne suffisent pas.
    const discovered = Object.fromEntries(TIERS.map((t) => [t, [] as string[]])) as Record<Tier, string[]>
    for (const tier of TIERS) {
      const queue = [...SEEDS[tier]]
      const visited = new Set<string>()
      for (let seed = queue.shift(); seed; seed = queue.shift() ?? discovered[tier].shift()) {
        if (gamesPerTier[tier] >= GAMES_PER_TIER || visited.size > 60) break
        if (visited.has(seed)) continue
        visited.add(seed)
        const [id, region = 'EUW'] = seed.split('@')
        const [gameName, tagLine] = id.split('#')
        const acc = { gameName, tagLine, region: region as Region }
        let raw: any
        try {
          raw = await opgg.call('lol_list_summoner_matches', {
            game_name: gameName,
            tag_line: tagLine,
            region,
            limit: 20,
            desired_output_fields: ['data.game_history[].{id,created_at,game_type,game_length_second}', 'data.game_history[].average_tier_info.{tier}']
          })
        } catch (e) {
          console.log('seed KO', seed, (e as Error).message.slice(0, 80))
          continue
        }
        const games = (raw?.data?.game_history ?? []).filter(
          (g: any) => g.game_type === 'SOLORANKED' && g.game_length_second >= 900 && !seen.has(g.id)
        )
        const jobs = games
          .map((g: any) => ({ g, t: bucket(g.average_tier_info?.tier) }))
          .filter((x: any) => x.t)
        await Promise.all(
          jobs.map(async ({ g, t }: { g: any; t: Tier }) => {
            if (gamesPerTier[t] >= GAMES_PER_TIER || seen.has(g.id)) return
            seen.add(g.id)
            try {
              const d = await opgg.getMatchDetail(acc, g.id, g.created_at)
              if (gamesPerTier[t] >= GAMES_PER_TIER) return
              gamesPerTier[t]++
              const min = g.game_length_second / 60
              for (const team of d.teams)
                for (const p of team.participants) if (p.tagLine) discovered[t].push(`${p.gameName}#${p.tagLine}@${region}`)
              for (const team of d.teams)
                for (const p of team.participants)
                  if (p.position)
                    rows.push({
                      tier: t,
                      position: p.position,
                      min,
                      cs: p.cs,
                      gold: p.gold,
                      damage: p.damage,
                      wards: p.wardsPlaced + p.visionWards,
                      kills: p.kills,
                      deaths: p.deaths,
                      assists: p.assists,
                      teamKills: team.kills
                    })
            } catch {
              /* détail indisponible */
            }
          })
        )
        console.log(`${tier} ← ${seed}: ${JSON.stringify(gamesPerTier)}`)
      }
    }

    const positions: Position[] = ['top', 'jungle', 'mid', 'adc', 'support']
    const tiers: Record<string, Record<string, Record<string, number>>> = {}
    for (const t of TIERS) {
      tiers[t] = {}
      for (const pos of positions) {
        const rs = rows.filter((r) => r.tier === t && r.position === pos)
        if (rs.length < 8) continue
        tiers[t][pos] = {
          samples: rs.length,
          csPerMin: round(median(rs.map((r) => r.cs / r.min))),
          goldPerMin: round(median(rs.map((r) => r.gold / r.min)), 0),
          damagePerMin: round(median(rs.map((r) => r.damage / r.min)), 0),
          wardsPerMin: round(median(rs.map((r) => r.wards / r.min))),
          deathsPer10: round(median(rs.map((r) => (r.deaths / r.min) * 10))),
          kda: round(median(rs.map((r) => (r.kills + r.assists) / Math.max(1, r.deaths)))),
          killParticipation: round(median(rs.map((r) => (r.teamKills ? (r.kills + r.assists) / r.teamKills : 0))))
        }
      }
    }
    const out = {
      generatedAt: new Date().toISOString(),
      source: 'OP.GG MCP — games classées solo/duo récentes, classées par elo moyen de la partie (médianes)',
      gamesPerTier,
      tiers
    }
    writeFileSync(new URL('../src/main/data/benchmarks.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
    console.log(JSON.stringify(gamesPerTier))
  })
})
