import { useEffect, useState } from 'react'
import { REGIONS, type Region } from '@shared/types'
import { type Page, useApp } from './store'
import { Button } from './components/ui'
import { ProfilePage } from './pages/Profile'
import { MatchesPage } from './pages/Matches'
import { StatsPage } from './pages/Stats'
import { DraftPage } from './pages/Draft'
import { SettingsPage } from './pages/Settings'

const NAV: Array<{ page: Page; label: string }> = [
  { page: 'profile', label: 'Profil' },
  { page: 'matches', label: 'Historique' },
  { page: 'stats', label: 'Stats' },
  { page: 'draft', label: 'Draft' },
  { page: 'settings', label: 'Réglages' }
]

export function App() {
  const { page, setPage, init, account, status, settings } = useApp()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void init().then(() => setReady(true))
  }, [init])

  if (!ready || !settings) return null

  return (
    <div className="flex h-full">
      <nav className="flex w-52 shrink-0 flex-col border-r border-line bg-panel/60 px-3 py-5">
        <div className="mb-8 px-3">
          <p className="font-display text-2xl leading-none font-bold">OPGG</p>
          <p className="font-display text-2xl leading-none font-bold text-gold">Companion</p>
        </div>
        <ul className="flex flex-col gap-1">
          {NAV.map((n) => (
            <li key={n.page}>
              <button
                onClick={() => setPage(n.page)}
                aria-current={page === n.page ? 'page' : undefined}
                className={`w-full rounded-md px-3 py-2 text-left font-display text-lg font-semibold ${
                  page === n.page ? 'bg-panel-2 text-ink shadow-[inset_3px_0_0_var(--color-gold)]' : 'text-mute hover:text-ink'
                }`}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ul>
        <ClientBadge connected={status.connected} phase={status.phase} />
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
        {!account && page !== 'settings' && page !== 'draft' ? (
          <Onboarding />
        ) : (
          <>
            {page === 'profile' && <ProfilePage />}
            {page === 'matches' && <MatchesPage />}
            {page === 'stats' && <StatsPage />}
            {page === 'draft' && <DraftPage />}
            {page === 'settings' && <SettingsPage />}
          </>
        )}
      </main>
    </div>
  )
}

function ClientBadge({ connected, phase }: { connected: boolean; phase?: string }) {
  const account = useApp((s) => s.account)
  return (
    <div className="mt-auto rounded-md border border-line px-3 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#3cbf9a]' : 'bg-mute/50'}`} />
        <span className="font-semibold">{connected ? 'Client LoL détecté' : 'Client LoL fermé'}</span>
      </div>
      {account && (
        <p className="mt-1 truncate text-mute" title={`${account.gameName}#${account.tagLine}`}>
          {account.gameName}
          <span className="text-mute/70">#{account.tagLine}</span> · {account.region}
        </p>
      )}
      {connected && phase && phase !== 'None' && <p className="mt-0.5 text-xs text-mute">{phaseLabel(phase)}</p>}
    </div>
  )
}

function phaseLabel(p: string): string {
  const map: Record<string, string> = {
    Lobby: 'Dans le salon',
    Matchmaking: 'Recherche de partie',
    ReadyCheck: 'Partie trouvée',
    ChampSelect: 'Sélection des champions',
    InProgress: 'En jeu',
    EndOfGame: 'Fin de partie'
  }
  return map[p] ?? p
}

function Onboarding() {
  const { settings, updateSettings } = useApp()
  const [riotId, setRiotId] = useState('')
  const [region, setRegion] = useState<Region>(settings?.region ?? 'EUW')
  const [gameName, tagLine] = riotId.split('#').map((s) => s?.trim())
  const valid = !!gameName && !!tagLine

  return (
    <div className="mx-auto mt-16 max-w-lg">
      <h1 className="font-display text-4xl font-semibold">Connecte ton compte</h1>
      <p className="mt-3 text-mute">
        Lance League of Legends et connecte-toi : ton compte est détecté automatiquement. Tu peux aussi saisir ton Riot ID
        pour consulter ton profil sans lancer le jeu.
      </p>
      <form
        className="mt-8 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void updateSettings({ region, manualAccount: { gameName, tagLine, region } })
        }}
      >
        <label className="text-sm font-semibold" htmlFor="riot-id">
          Riot ID
        </label>
        <div className="flex gap-2">
          <input
            id="riot-id"
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
            placeholder="Pseudo#TAG"
            className="flex-1 rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-gold"
          />
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
            className="rounded-md border border-line bg-panel px-3 py-2"
            aria-label="Région"
          >
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <Button variant="primary" disabled={!valid}>
            Afficher mon profil
          </Button>
        </div>
      </form>
    </div>
  )
}
