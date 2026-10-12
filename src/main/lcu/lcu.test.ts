import { describe, expect, it } from 'vitest'
import { setChampions } from '../ddragon'
import { parseCommandLine, parseLockfile } from './discovery'
import { queueFromId, sessionToDraft } from './champSelect'
import { toRegion } from './connector'

describe('découverte du client', () => {
  it('lit le lockfile', () => {
    expect(parseLockfile('LeagueClient:1234:54321:s3cr3t:https')).toEqual({ port: 54321, password: 's3cr3t', protocol: 'https' })
    expect(parseLockfile('garbage')).toBeNull()
  })
  it('lit la ligne de commande de LeagueClientUx.exe', () => {
    const cmd = '"C:/Riot Games/League of Legends/LeagueClientUx.exe" "--remoting-auth-token=AbC_12-x" "--app-port=61234" --install-directory=C:/x'
    expect(parseCommandLine(cmd)).toEqual({ port: 61234, password: 'AbC_12-x', protocol: 'https' })
  })
  it('normalise la région', () => {
    expect(toRegion('EUW1')).toBe('EUW')
    expect(toRegion('EUW')).toBe('EUW')
    expect(toRegion('LA2')).toBe('LAS')
    expect(toRegion('OC1')).toBe('OCE')
    expect(toRegion(undefined)).toBe('EUW')
  })
})

describe('sessionToDraft', () => {
  it('convertit une session de champ select', () => {
    setChampions([
      { id: 103, key: 'Ahri', name: 'Ahri' },
      { id: 64, key: 'LeeSin', name: 'Lee Sin' },
      { id: 238, key: 'Zed', name: 'Zed' },
      { id: 157, key: 'Yasuo', name: 'Yasuo' }
    ])
    expect(queueFromId(420)).toBe('solo')
    expect(queueFromId(440)).toBe('flex')
    expect(queueFromId(400)).toBe('other')
    const draft = sessionToDraft({
      localPlayerCellId: 2,
      myTeam: [
        { cellId: 1, championId: 0, championPickIntent: 64, assignedPosition: 'jungle' },
        { cellId: 2, championId: 0, assignedPosition: 'middle' }
      ],
      theirTeam: [{ cellId: 6, championId: 238, assignedPosition: '' }],
      bans: { myTeamBans: [157], theirTeamBans: [] },
      actions: []
    }, 440)
    expect(draft.queue).toBe('flex')
    expect(draft.myPosition).toBe('mid')
    expect(draft.allies).toEqual([{ champion: 'Lee Sin', position: 'jungle' }])
    expect(draft.enemies).toEqual([{ champion: 'Zed', position: null }])
    expect(draft.bans).toEqual(['Yasuo'])
    expect(draft.source).toBe('lcu')
  })
})
