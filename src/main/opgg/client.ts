// Client de l'OP.GG MCP (https://mcp-api.op.gg/mcp, Streamable HTTP, sans auth).
// Chaque méthode renvoie des données déjà normalisées et passe par le cache disque.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  MatchDetail,
  MatchParticipant,
  MatchSummary,
  Position,
  Profile,
  RiotAccount
} from '@shared/types'
import type { DiskCache } from '../store'
import { opggChampionKey } from '../ddragon'
import { parseOpggText } from './parse'

const ENDPOINT = 'https://mcp-api.op.gg/mcp'
const MIN = 60_000
const HOUR = 60 * MIN

export interface LaneMetaEntry {
  champion: string
  play: number
  winRate: number
  pickRate: number
  banRate: number
  tier: number
}

/** Victoires de `champion` contre chaque adversaire de lane. */
export type MatchupTable = Record<string, { play: number; win: number }>

/** Partenaires recommandés pour un champion, par position du partenaire. */
export type SynergyTable = Record<string, { play: number; winRate: number }>

export function fromOpggPosition(p: string | null | undefined): Position | null {
  switch ((p ?? '').toUpperCase()) {
    case 'TOP':
      return 'top'
    case 'JUNGLE':
      return 'jungle'
    case 'MID':
    case 'MIDDLE':
      return 'mid'
    case 'ADC':
    case 'BOTTOM':
      return 'adc'
    case 'SUPPORT':
    case 'UTILITY':
      return 'support'
    default:
      return null
  }
}

export class OpggClient {
  private client: Client | null = null
  private connecting: Promise<Client> | null = null

  constructor(private readonly cache: DiskCache) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client
    this.connecting ??= (async () => {
      const client = new Client({ name: 'opgg-companion', version: '0.1.0' })
      await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT)))
      this.client = client
      return client
    })().finally(() => (this.connecting = null))
    return this.connecting
  }

  /** Appel brut d'un outil MCP, avec une reconnexion et un backoff en cas d'échec. */
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const client = await this.connect()
        const res = await client.callTool({ name, arguments: args })
        const text = (res.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('')
        if (res.isError) throw new Error(`OP.GG ${name}: ${text}`)
        return parseOpggText(text)
      } catch (err) {
        lastError = err
        // Erreur de validation des paramètres : inutile de réessayer.
        if (String(err).includes('-32602') || String(err).includes('-32600')) break
        this.client = null // session expirée ou réseau coupé : on se reconnecte
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      }
    }
    throw lastError
  }

  // ---------- Invocateur ----------

  getProfile(acc: RiotAccount): Promise<Profile> {
    return this.cache.wrap(`profile:${accKey(acc)}`, 2 * MIN, async () => {
      const r = await this.call('lol_get_summoner_profile', {
        ...accArgs(acc),
        desired_output_fields: [
          'data.summoner.{game_name,tagline,level,profile_image_url}',
          'data.summoner.league_stats[].{game_type,win,lose,is_hot_streak}',
          'data.summoner.league_stats[].tier_info.{tier,division,lp,tier_image_url}',
          'data.summoner.most_champions.champion_stats[].{champion_name,play,win,kill,death,assist}'
        ]
      })
      const s = r?.data?.summoner
      if (!s) throw new Error(`Invocateur introuvable : ${acc.gameName}#${acc.tagLine} (${acc.region})`)
      return {
        gameName: s.game_name ?? acc.gameName,
        tagLine: s.tagline ?? acc.tagLine,
        level: s.level ?? null,
        iconUrl: s.profile_image_url ?? null,
        ranked: (s.league_stats ?? []).map((l: any) => ({
          queue: l.game_type,
          tier: l.tier_info?.tier ?? null,
          division: l.tier_info?.division ?? null,
          lp: l.tier_info?.lp ?? null,
          wins: l.win ?? 0,
          losses: l.lose ?? 0,
          hotStreak: !!l.is_hot_streak,
          emblemUrl: l.tier_info?.tier_image_url ?? null
        })),
        champions: (s.most_champions?.champion_stats ?? []).map((c: any) => ({
          champion: c.champion_name,
          games: c.play ?? 0,
          wins: c.win ?? 0,
          kills: c.kill ?? 0,
          deaths: c.death ?? 0,
          assists: c.assist ?? 0
        }))
      }
    })
  }

  listMatches(acc: RiotAccount, limit = 20): Promise<MatchSummary[]> {
    return this.cache.wrap(`matches:${accKey(acc)}:${limit}`, 2 * MIN, async () => {
      const r = await this.call('lol_list_summoner_matches', {
        ...accArgs(acc),
        limit,
        desired_output_fields: [
          'data.game_history[].{id,created_at,game_type,game_length_second}',
          'data.game_history[].average_tier_info.{tier,division}',
          'data.game_history[].participants[].{champion_name,position,team_key,items[],spells[]}',
          'data.game_history[].participants[].rune.{primary_rune_id,secondary_page_id}',
          'data.game_history[].participants[].stats.{kill,death,assist,minion_kill,neutral_minion_kill,gold_earned,total_damage_dealt_to_champions,total_damage_taken,vision_wards_bought_in_game,ward_place,result,op_score}',
          'data.game_history[].teams[].{key,banned_champions_names[]}'
        ]
      })
      return (r?.data?.game_history ?? []).map((g: any) => toMatchSummary(g)).filter(Boolean)
    })
  }

  getMatchDetail(acc: RiotAccount, id: string, createdAt: string): Promise<MatchDetail> {
    return this.cache.wrap(`detail:${id}`, 7 * 24 * HOUR, async () => {
      const r = await this.call('lol_get_summoner_game_detail', {
        region: acc.region,
        game_id: id,
        created_at: createdAt,
        focus_riot_id: `${acc.gameName}#${acc.tagLine}`,
        desired_output_fields: [
          'data.game_detail.teams[].game_stat.{is_win,champion_kill,gold_earned,tower_kill,dragon_kill,baron_kill,rift_herald_kill,horde_kill}',
          'data.game_detail.teams[].participants[].{champion_name,is_target,position,team_key,items[],spells[]}',
          'data.game_detail.teams[].participants[].summoner.{game_name,tagline}',
          'data.game_detail.teams[].participants[].rune.{primary_rune_id,secondary_page_id}',
          'data.game_detail.teams[].participants[].stats.{champion_level,kill,death,assist,minion_kill,neutral_minion_kill,gold_earned,total_damage_dealt_to_champions,total_damage_taken,vision_wards_bought_in_game,ward_place,op_score,op_score_rank}'
        ]
      })
      const teams = r?.data?.game_detail?.teams ?? []
      return {
        id,
        teams: teams.map((t: any) => {
          const participants: MatchParticipant[] = (t.participants ?? []).map((p: any) => ({
            gameName: p.summoner?.game_name ?? '?',
            tagLine: p.summoner?.tagline ?? '',
            isTarget: !!p.is_target,
            team: p.team_key,
            champion: p.champion_name,
            position: fromOpggPosition(p.position),
            level: p.stats?.champion_level ?? 0,
            kills: p.stats?.kill ?? 0,
            deaths: p.stats?.death ?? 0,
            assists: p.stats?.assist ?? 0,
            cs: (p.stats?.minion_kill ?? 0) + (p.stats?.neutral_minion_kill ?? 0),
            gold: p.stats?.gold_earned ?? 0,
            damage: p.stats?.total_damage_dealt_to_champions ?? 0,
            damageTaken: p.stats?.total_damage_taken ?? 0,
            visionWards: p.stats?.vision_wards_bought_in_game ?? 0,
            wardsPlaced: p.stats?.ward_place ?? 0,
            opScore: p.stats?.op_score ?? null,
            opScoreRank: p.stats?.op_score_rank ?? null,
            items: (p.items ?? []).filter((i: number) => i > 0),
            spells: p.spells ?? [],
            primaryRune: p.rune?.primary_rune_id ?? null,
            secondaryPage: p.rune?.secondary_page_id ?? null
          }))
          const gs = t.game_stat ?? {}
          return {
            key: participants[0]?.team ?? '',
            win: !!gs.is_win,
            kills: gs.champion_kill ?? 0,
            gold: gs.gold_earned ?? 0,
            towers: gs.tower_kill ?? 0,
            dragons: gs.dragon_kill ?? 0,
            barons: gs.baron_kill ?? 0,
            heralds: gs.rift_herald_kill ?? 0,
            grubs: gs.horde_kill ?? 0,
            participants
          }
        })
      }
    })
  }

  // ---------- Statistiques globales (draft helper) ----------

  getLaneMeta(position: Position): Promise<LaneMetaEntry[]> {
    return this.cache.wrap(`meta:${position}`, 6 * HOUR, async () => {
      const r = await this.call('lol_list_lane_meta_champions', {
        position,
        desired_output_fields: [`data.positions.${position}[].{champion,play,win_rate,pick_rate,ban_rate,tier}`]
      })
      return (r?.data?.positions?.[position] ?? []).map((m: any) => ({
        champion: m.champion,
        play: m.play ?? 0,
        winRate: m.win_rate ?? 0.5,
        pickRate: m.pick_rate ?? 0,
        banRate: m.ban_rate ?? 0,
        tier: m.tier ?? 5
      }))
    })
  }

  /**
   * Table de matchups de `champion` sur `position` : pour chaque adversaire, nombre de games
   * et victoires de `champion`. L'outil exige un adversaire ; la table renvoyée est complète
   * quel que soit l'adversaire passé, donc on ne l'inclut pas dans la clé de cache.
   */
  getMatchups(champion: string, position: Position, anyOpponent: string): Promise<MatchupTable> {
    return this.cache.wrap(`matchups:${opggChampionKey(champion)}:${position}`, 6 * HOUR, async () => {
      const r = await this.call('lol_get_lane_matchup_guide', {
        position,
        my_champion: opggChampionKey(champion),
        opponent_champion: opggChampionKey(anyOpponent)
      })
      const table: MatchupTable = {}
      for (const c of r?.data?.counters ?? []) table[c.champion_name] = { play: c.play ?? 0, win: c.win ?? 0 }
      return table
    })
  }

  /** Meilleurs partenaires (à `partnerPosition`) pour `champion` joué en `position`. */
  getSynergies(champion: string, position: Position, partnerPosition: Position): Promise<SynergyTable> {
    const key = `syn:${opggChampionKey(champion)}:${position}:${partnerPosition}`
    return this.cache.wrap(key, 6 * HOUR, async () => {
      const r = await this.call('lol_get_champion_synergies', {
        champion: opggChampionKey(champion),
        my_position: position,
        synergy_position: partnerPosition,
        desired_output_fields: ['data.synergies[].{synergy_champion_name,play,win_rate}']
      })
      const table: SynergyTable = {}
      for (const s of r?.data?.synergies ?? [])
        table[s.synergy_champion_name] = { play: s.play ?? 0, winRate: s.win_rate ?? 0.5 }
      return table
    })
  }
}

function accKey(acc: RiotAccount): string {
  return `${acc.region}:${acc.gameName}#${acc.tagLine}`.toLowerCase()
}

function accArgs(acc: RiotAccount): Record<string, string> {
  return { game_name: acc.gameName, tag_line: acc.tagLine, region: acc.region }
}

function toMatchSummary(g: any): MatchSummary | null {
  const p = g.participants?.[0]
  if (!p) return null
  const myTeam = (g.teams ?? []).find((t: any) => t.key === p.team_key)
  const enemyTeam = (g.teams ?? []).find((t: any) => t.key !== p.team_key)
  const s = p.stats ?? {}
  const result = String(s.result ?? '').toUpperCase()
  const tier = g.average_tier_info?.tier
  return {
    id: g.id,
    createdAt: g.created_at,
    queue: g.game_type ?? 'UNKNOWN',
    durationSec: g.game_length_second ?? 0,
    champion: p.champion_name,
    position: fromOpggPosition(p.position),
    win: result === 'WIN',
    remake: result === 'UNKNOWN' || result === 'REMAKE' || (g.game_length_second ?? 0) < 300,
    kills: s.kill ?? 0,
    deaths: s.death ?? 0,
    assists: s.assist ?? 0,
    cs: (s.minion_kill ?? 0) + (s.neutral_minion_kill ?? 0),
    gold: s.gold_earned ?? 0,
    damage: s.total_damage_dealt_to_champions ?? 0,
    damageTaken: s.total_damage_taken ?? 0,
    visionWards: s.vision_wards_bought_in_game ?? 0,
    wardsPlaced: s.ward_place ?? 0,
    opScore: s.op_score ?? null,
    items: (p.items ?? []).filter((i: number) => i > 0),
    spells: p.spells ?? [],
    primaryRune: p.rune?.primary_rune_id ?? null,
    secondaryPage: p.rune?.secondary_page_id ?? null,
    allyBans: myTeam?.banned_champions_names ?? [],
    enemyBans: enemyTeam?.banned_champions_names ?? [],
    avgTier: tier ? `${tier}${g.average_tier_info?.division ? ' ' + g.average_tier_info.division : ''}` : null
  }
}
