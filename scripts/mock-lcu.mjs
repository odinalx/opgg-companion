// Faux client LoL (LCU) pour développer sans Windows ni League of Legends.
// Simule un compte connecté et une sélection des champions qui progresse toute seule.
//
//   npm run mock:lcu
//   LCU_LOCKFILE=<chemin affiché> npm run dev

import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'

const PASSWORD = 'mock-token'
const ACCOUNT = {
  gameName: process.env.MOCK_NAME ?? 'Hide on bush',
  tagLine: process.env.MOCK_TAG ?? 'KR1',
  region: process.env.MOCK_REGION ?? 'KR',
  role: process.env.MOCK_ROLE ?? 'middle' // top, jungle, middle, bottom, utility
}

const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json()
const champs = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`)).json()
const idOf = (name) => Number(Object.values(champs.data).find((c) => c.name === name)?.key ?? 0)

// Déroulé de la champ select : chaque étape est appliquée toutes les 4 secondes.
const steps = [
  (s) => (s.bans.theirTeamBans = [idOf('Yasuo')]),
  (s) => (s.bans.myTeamBans = [idOf('Yone')]),
  (s) => (s.myTeam[0].championId = idOf('Lee Sin')),
  (s) => (s.theirTeam[0].championId = idOf('Zed')),
  (s) => (s.theirTeam[1].championId = idOf('Vi')),
  (s) => (s.myTeam[3].championPickIntent = idOf('Thresh')),
  (s) => (s.theirTeam[2].championId = idOf('Jinx')),
  (s) => (s.theirTeam[3].championId = idOf('Darius'))
]

// Le joueur local (cellule 2) prend le rôle MOCK_ROLE ; l'allié qui l'avait récupère le milieu.
const ROLES = ['jungle', 'top', 'middle', 'utility', 'bottom']
const freshSession = () => {
  const roles = [...ROLES]
  const swap = roles.indexOf(ACCOUNT.role)
  ;[roles[2], roles[swap]] = [roles[swap], roles[2]]
  return {
  localPlayerCellId: 2,
  myTeam: roles.map((assignedPosition, cellId) => ({ cellId, championId: 0, championPickIntent: 0, assignedPosition })),
  theirTeam: [5, 6, 7, 8, 9].map((cellId) => ({ cellId, championId: 0, assignedPosition: '' })),
  bans: { myTeamBans: [], theirTeamBans: [] },
  actions: []
  }
}

let session = freshSession()
let step = 0

const routes = {
  '/lol-gameflow/v1/gameflow-phase': () => 'ChampSelect',
  '/lol-summoner/v1/current-summoner': () => ({
    gameName: ACCOUNT.gameName,
    tagLine: ACCOUNT.tagLine,
    puuid: 'mock-puuid',
    summonerLevel: 512,
    profileIconId: 6
  }),
  '/riotclient/region-locale': () => ({ region: ACCOUNT.region, locale: 'fr_FR' }),
  '/lol-champ-select/v1/session': () => session,
  '/lol-gameflow/v1/session': () => ({ gameData: { queue: { id: Number(process.env.MOCK_QUEUE ?? 420) } } }),
  '/lol-champion-mastery/v1/local-player/champion-mastery': () => [
    { championId: idOf('Ahri'), championLevel: 12, championPoints: 182000 },
    { championId: idOf('Orianna'), championLevel: 8, championPoints: 96000 },
    { championId: idOf('Syndra'), championLevel: 5, championPoints: 31000 },
    { championId: idOf('Aurora'), championLevel: 10, championPoints: 140000 }
  ],
  '/lol-champions/v1/owned-champions-minimal': () =>
    Object.values(champs.data).map((c) => ({ id: Number(c.key), ownership: { owned: true } })),
  '/lol-match-history/v1/products/lol/current-summoner/matches': () => ({ games: { games: [] } })
}

const server = createServer((req, res) => {
  if (req.headers.authorization !== 'Basic ' + Buffer.from(`riot:${PASSWORD}`).toString('base64')) {
    res.writeHead(401).end()
    return
  }
  const route = routes[req.url.split('?')[0]]
  if (!route) {
    res.writeHead(404).end(JSON.stringify({ message: 'not found' }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(route()))
})

const wss = new WebSocketServer({ server })
const push = () => {
  const msg = JSON.stringify([
    8,
    'OnJsonApiEvent_lol-champ-select_v1_session',
    { data: session, eventType: 'Update', uri: '/lol-champ-select/v1/session' }
  ])
  for (const c of wss.clients) c.send(msg)
}

setInterval(() => {
  if (step < steps.length) steps[step++](session)
  else if (process.env.MOCK_LOOP) {
    // Fin du déroulé : on recommence une nouvelle sélection.
    session = freshSession()
    step = 0
  } else return // la composition finale reste affichée
  push()
}, 4000)

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port
  const lockfile = join(tmpdir(), 'opgg-mock-lockfile')
  writeFileSync(lockfile, `LeagueClient:${process.pid}:${port}:${PASSWORD}:http`)
  console.log(`Faux client LoL sur le port ${port} (compte ${ACCOUNT.gameName}#${ACCOUNT.tagLine}, ${ACCOUNT.region})`)
  console.log(`Lance l'app avec : LCU_LOCKFILE=${lockfile} npm run dev`)
})
