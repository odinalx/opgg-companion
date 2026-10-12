import { useEffect, useState } from 'react'
import { REGIONS, type Region } from '@shared/types'
import { type Page, useApp } from './store'
import { Button, Notice } from './components/ui'
import { Glyph } from './components/Glyphs'
import { ProfileIcon } from './components/Icons'
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
  const needsAccount = !account && page !== 'settings' && page !== 'draft'

  return (
    <div className="flex h-full">
      <nav className="flex w-60 shrink-0 flex-col border-r border-line bg-night/70 px-4 py-6 backdrop-blur" aria-label="Navigation">
        <div className="mb-9 flex items-center gap-3 px-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent font-display text-xl font-bold text-night">OC</span>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold">OPGG Companion</p>
            <p className="text-xs text-mute">League of Legends</p>
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = page === n.page
            const Icon = Glyph[n.page]
            return (
              <li key={n.page}>
                <button
                  data-nav={n.page}
                  onClick={() => setPage(n.page)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold transition-colors ${
                    active ? 'bg-panel-2 text-ink' : 'text-mute hover:bg-panel/70 hover:text-ink'
                  }`}
                >
                  <span className={active ? 'text-accent' : ''}>
                    <Icon />
                  </span>
                  {n.label}
                  {n.page === 'draft' && status.phase === 'ChampSelect' && (
                    <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">En direct</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <AccountCard />
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1560px] px-10 py-9">
          {needsAccount ? (
            <SignIn />
          ) : (
            <>
              {page === 'profile' && <ProfilePage />}
              {page === 'matches' && <MatchesPage />}
              {page === 'stats' && <StatsPage />}
              {page === 'draft' && <DraftPage />}
              {page === 'settings' && <SettingsPage />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function AccountCard() {
  const { account, status } = useApp()
  return (
    <div className="mt-auto rounded-2xl border border-line bg-panel p-3">
      {account ? (
        <div className="flex items-center gap-3">
          <ProfileIcon id={status.account?.profileIconId} size={38} />
          <div className="min-w-0">
            <p className="truncate font-semibold" title={`${account.gameName}#${account.tagLine}`}>
              {account.gameName}
            </p>
            <p className="text-xs text-mute">
              #{account.tagLine} · {account.region}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-soft">Aucun compte</p>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5 text-xs">
        <span className={`h-2 w-2 rounded-full ${status.connected ? 'bg-ok shadow-[0_0_8px_var(--color-ok)]' : 'bg-mute/40'}`} />
        <span className="text-soft">{status.connected ? phaseLabel(status.phase) : 'Client LoL fermé'}</span>
      </div>
    </div>
  )
}

function phaseLabel(p?: string): string {
  const map: Record<string, string> = {
    Lobby: 'Dans le salon',
    Matchmaking: 'Recherche de partie',
    ReadyCheck: 'Partie trouvée',
    ChampSelect: 'Sélection des champions',
    InProgress: 'En jeu',
    EndOfGame: 'Fin de partie'
  }
  return (p && map[p]) || 'Client LoL connecté'
}

export function SignIn() {
  const { settings, updateSettings } = useApp()
  const [riotId, setRiotId] = useState('')
  const [region, setRegion] = useState<Region>(settings?.region ?? 'EUW')
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gameName, tagLine] = riotId.split('#').map((s) => s?.trim())
  const valid = !!gameName && !!tagLine

  const launch = async (): Promise<void> => {
    setError(null)
    setLaunching(true)
    try {
      await window.api.launchRiotClient()
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '\w+': (Error: )?/, ''))
      setLaunching(false)
    }
  }

  return (
    <div className="mx-auto mt-[8vh] max-w-xl">
      <h1 className="font-display text-6xl leading-[0.95] font-bold tracking-tight">
        Ton compte,
        <br />
        tes stats, ton draft.
      </h1>
      <p className="mt-5 max-w-md text-lg text-soft">
        Connecte-toi avec Riot : dès que League of Legends est lancé, l'app reconnaît ton compte toute seule.
      </p>

      <div className="mt-8">
        <Button variant="primary" onClick={() => void launch()} disabled={launching}>
          {launching ? 'En attente de ta connexion dans le Riot Client…' : 'Se connecter avec Riot'}
        </Button>
        <p className="mt-2 text-sm text-mute">
          Ouvre le Riot Client officiel. Ton mot de passe reste chez Riot : l'app ne fait que lire le client une fois connecté.
        </p>
        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>

      <div className="my-9 flex items-center gap-4 text-sm text-mute">
        <span className="h-px flex-1 bg-line" />
        ou consulter un profil sans lancer le jeu
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void updateSettings({ region, manualAccount: { gameName, tagLine, region } })
        }}
      >
        <input
          value={riotId}
          onChange={(e) => setRiotId(e.target.value)}
          placeholder="Riot ID, ex. Pseudo#EUW"
          aria-label="Riot ID"
          className="field flex-1 px-4 py-2.5"
        />
        <select value={region} onChange={(e) => setRegion(e.target.value as Region)} className="field px-3" aria-label="Région">
          {REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <Button type="submit" disabled={!valid}>
          Rechercher
        </Button>
      </form>
    </div>
  )
}
