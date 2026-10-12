// Connexion au client LoL local : REST + WebSocket (WAMP) sur 127.0.0.1.
// Le certificat du client est auto-signé : on ne désactive la vérification TLS
// que pour ces requêtes locales, jamais globalement.

import { EventEmitter } from 'node:events'
import { Agent, request } from 'node:https'
import { request as httpRequest } from 'node:http'
import WebSocket from 'ws'
import type { ClientStatus, MatchSummary, Region } from '@shared/types'
import { REGIONS } from '@shared/types'
import { championById } from '../ddragon'
import { discoverClient, type LcuCredentials } from './discovery'
import { lcuPosition } from './champSelect'

const localAgent = new Agent({ rejectUnauthorized: false })
const POLL_MS = 3000

const EVENTS = {
  champSelect: 'OnJsonApiEvent_lol-champ-select_v1_session',
  gameflow: 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase'
}

export interface LcuEvents {
  status: [ClientStatus]
  champSelect: [any | null]
}

export class LcuConnector extends EventEmitter<LcuEvents> {
  private creds: LcuCredentials | null = null
  private ws: WebSocket | null = null
  private timer: NodeJS.Timeout | null = null
  private status: ClientStatus = { connected: false }
  private lastSession: any | null = null
  private queueId: number | null = null

  start(): void {
    void this.tick()
    this.timer = setInterval(() => void this.tick(), POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.ws?.close()
  }

  getStatus(): ClientStatus {
    return this.status
  }

  getChampSelect(): any | null {
    return this.lastSession
  }

  /** File de la partie en cours de sélection (420 solo, 440 flex…). */
  getQueueId(): number | null {
    return this.queueId
  }

  private async tick(): Promise<void> {
    if (this.creds) {
      // Déjà connecté : on vérifie que le client répond toujours.
      try {
        await this.get('/lol-gameflow/v1/gameflow-phase')
        if (!this.ws) this.openSocket()
        return
      } catch {
        this.disconnect()
      }
    }
    const creds = await discoverClient()
    if (!creds) return
    this.creds = creds
    try {
      const [summoner, regionLocale, phase] = await Promise.all([
        this.get('/lol-summoner/v1/current-summoner'),
        this.get('/riotclient/region-locale').catch(() => null),
        this.get('/lol-gameflow/v1/gameflow-phase').catch(() => undefined)
      ])
      if (!summoner?.gameName) throw new Error('compte non connecté')
      this.setStatus({
        connected: true,
        phase,
        account: {
          gameName: summoner.gameName,
          tagLine: summoner.tagLine,
          puuid: summoner.puuid,
          region: toRegion(regionLocale?.region ?? regionLocale?.webRegion),
          summonerLevel: summoner.summonerLevel,
          profileIconId: summoner.profileIconId
        }
      })
      this.openSocket()
      if (phase === 'ChampSelect') this.setSession(await this.get('/lol-champ-select/v1/session').catch(() => null))
    } catch {
      // Le client démarre (lockfile présent mais API pas prête, ou pas encore loggé) : on réessaie au prochain tick.
      this.creds = null
    }
  }

  private disconnect(): void {
    this.creds = null
    this.ws?.close()
    this.ws = null
    this.setSession(null)
    this.setStatus({ connected: false })
  }

  private setStatus(s: ClientStatus): void {
    this.status = s
    this.emit('status', s)
  }

  private setSession(session: any | null): void {
    const starting = session && !this.lastSession
    this.lastSession = session
    if (!session) this.queueId = null
    if (starting) {
      // La session de champ select ne contient pas la file : on la lit une fois dans le gameflow.
      void this.get('/lol-gameflow/v1/session')
        .then((g) => {
          this.queueId = g?.gameData?.queue?.id ?? null
          if (this.lastSession) this.emit('champSelect', this.lastSession)
        })
        .catch(() => undefined)
    }
    this.emit('champSelect', session)
  }

  private openSocket(): void {
    if (!this.creds) return
    const { port, password, protocol } = this.creds
    const ws = new WebSocket(`${protocol === 'https' ? 'wss' : 'ws'}://127.0.0.1:${port}/`, 'wamp', {
      headers: { Authorization: basicAuth(password) },
      rejectUnauthorized: false
    })
    this.ws = ws
    ws.on('open', () => {
      for (const e of Object.values(EVENTS)) ws.send(JSON.stringify([5, e]))
    })
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        // Format WAMP : [8, "<event>", { data, eventType, uri }]
        if (msg[0] !== 8) return
        const payload = msg[2]
        if (msg[1] === EVENTS.champSelect) this.setSession(payload.eventType === 'Delete' ? null : payload.data)
        if (msg[1] === EVENTS.gameflow) {
          this.setStatus({ ...this.status, phase: payload.data })
          if (payload.data !== 'ChampSelect' && this.lastSession) this.setSession(null)
        }
      } catch {
        // message non JSON : ignoré
      }
    })
    ws.on('close', () => {
      if (this.ws === ws) this.ws = null
    })
    ws.on('error', () => ws.close())
  }

  get(path: string): Promise<any> {
    const creds = this.creds
    if (!creds) return Promise.reject(new Error('client LoL non connecté'))
    return new Promise((resolve, reject) => {
      const opts = {
        host: '127.0.0.1',
        port: creds.port,
        path,
        method: 'GET',
        headers: { Authorization: basicAuth(creds.password), Accept: 'application/json' },
        timeout: 5000
      }
      const req =
        creds.protocol === 'https' ? request({ ...opts, agent: localAgent }) : httpRequest(opts)
      req.on('response', (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          if ((res.statusCode ?? 500) >= 400) return reject(new Error(`LCU ${res.statusCode} ${path}`))
          try {
            resolve(body ? JSON.parse(body) : null)
          } catch {
            resolve(body)
          }
        })
      })
      req.on('timeout', () => req.destroy(new Error('LCU timeout')))
      req.on('error', reject)
      req.end()
    })
  }

  // ---------- Données du joueur local ----------

  /** Mastery par nom de champion. */
  async getMastery(): Promise<Record<string, { level: number; points: number }>> {
    const list: any[] = await this.get('/lol-champion-mastery/v1/local-player/champion-mastery')
    const out: Record<string, { level: number; points: number }> = {}
    for (const m of list ?? []) {
      const c = championById(m.championId)
      if (c) out[c.name] = { level: m.championLevel ?? 0, points: m.championPoints ?? 0 }
    }
    return out
  }

  async getOwnedChampions(): Promise<string[]> {
    const list: any[] = await this.get('/lol-champions/v1/owned-champions-minimal')
    return (list ?? [])
      .filter((c) => c.ownership?.owned || c.ownership?.freeToPlayReward || c.freeToPlay)
      .map((c) => championById(c.id)?.name)
      .filter((n): n is string => !!n)
  }

  /** Historique local (jusqu'à ~100 games), complète les 20 games renvoyées par OP.GG. */
  async getMatchHistory(count = 100): Promise<MatchSummary[]> {
    const res = await this.get(
      `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`
    )
    return (res?.games?.games ?? []).map(lcuGameToSummary).filter(Boolean) as MatchSummary[]
  }
}

function basicAuth(password: string): string {
  return 'Basic ' + Buffer.from(`riot:${password}`).toString('base64')
}

export function toRegion(raw: string | undefined): Region {
  const r = (raw ?? '').toUpperCase()
  const special: Record<string, Region> = { LA1: 'LAN', LA2: 'LAS', OC1: 'OCE', EUN1: 'EUNE', PBE: 'NA' }
  if (special[r]) return special[r]
  const stripped = r.replace(/\d+$/, '') as Region
  return REGIONS.includes(stripped) ? stripped : 'EUW'
}

const QUEUES: Record<number, string> = {
  420: 'SOLORANKED',
  440: 'FLEXRANKED',
  400: 'NORMAL',
  430: 'NORMAL',
  490: 'NORMAL',
  480: 'NORMAL',
  450: 'ARAM',
  1700: 'ARENA',
  1900: 'URF',
  900: 'URF'
}

export function lcuGameToSummary(g: any): MatchSummary | null {
  const p = g.participants?.[0]
  if (!p) return null
  const s = p.stats ?? {}
  const champ = championById(p.championId)
  const lane = p.timeline?.lane
  const role = p.timeline?.role
  const position =
    lane === 'BOTTOM' || lane === 'BOT'
      ? role === 'DUO_SUPPORT'
        ? 'support'
        : 'adc'
      : lcuPosition(lane)
  return {
    id: `lcu_${g.gameId}`,
    createdAt: new Date(g.gameCreation).toISOString(),
    queue: QUEUES[g.queueId] ?? 'OTHER',
    durationSec: g.gameDuration ?? 0,
    champion: champ?.name ?? `#${p.championId}`,
    position,
    win: !!s.win,
    remake: (g.gameDuration ?? 0) < 300,
    kills: s.kills ?? 0,
    deaths: s.deaths ?? 0,
    assists: s.assists ?? 0,
    cs: (s.totalMinionsKilled ?? 0) + (s.neutralMinionsKilled ?? 0),
    gold: s.goldEarned ?? 0,
    damage: s.totalDamageDealtToChampions ?? 0,
    damageTaken: s.totalDamageTaken ?? 0,
    visionWards: s.visionWardsBoughtInGame ?? 0,
    wardsPlaced: s.wardsPlaced ?? 0,
    opScore: null,
    items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6].filter((i) => i > 0),
    spells: [p.spell1Id, p.spell2Id].filter(Boolean),
    primaryRune: s.perk0 ?? null,
    secondaryPage: s.perkSubStyle ?? null,
    allyBans: [],
    enemyBans: [],
    avgTier: null
  }
}
