import { useEffect, useState } from 'react'
import type { MatchSummary, Profile } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon } from '../components/Icons'
import { Button, Empty, Notice, PageHeader, Spinner } from '../components/ui'
import { kda, pct, queueLabel, tierLabel, wrColor } from '../lib/format'

export function ProfilePage() {
  const account = useApp((s) => s.account)!
  const setPage = useApp((s) => s.setPage)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [recent, setRecent] = useState<MatchSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [p, m] = await Promise.all([window.api.getProfile(account), window.api.getMatches(account, true)])
      setProfile(p)
      setRecent(m.matches.filter((x) => !x.remake).slice(0, 20))
      if (m.errors.length) setError(m.errors.join(' — '))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.gameName, account.tagLine, account.region])

  return (
    <>
      <PageHeader title={`${account.gameName}#${account.tagLine}`}>
        <Button onClick={() => void load()} disabled={loading}>
          Actualiser
        </Button>
      </PageHeader>
      {error && <Notice tone="error">{error}</Notice>}
      {loading && !profile ? (
        <Spinner label="Récupération du profil sur OP.GG…" />
      ) : !profile ? (
        <Empty title="Profil introuvable">Vérifie le Riot ID et la région dans les réglages.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <section className="flex flex-col gap-4">
            {profile.ranked
              .filter((r) => r.queue === 'SOLORANKED' || r.queue === 'FLEXRANKED')
              .map((r) => {
                const games = r.wins + r.losses
                return (
                  <div key={r.queue} className="rounded-lg border border-line bg-panel px-5 py-4">
                    <p className="text-sm text-mute">{queueLabel(r.queue)}</p>
                    <p className="num mt-1 text-3xl font-semibold">{tierLabel(r.tier, r.division, r.lp)}</p>
                    {games > 0 && (
                      <p className="mt-1 text-sm text-mute">
                        <span className={wrColor(r.wins / games)}>{pct(r.wins / games)}</span> sur {games} games ·{' '}
                        {r.wins}V {r.losses}D{r.hotStreak && ' · en série de victoires'}
                      </p>
                    )}
                  </div>
                )
              })}
            <RecentForm matches={recent} onOpen={() => setPage('matches')} />
          </section>

          <section className="rounded-lg border border-line bg-panel">
            <h2 className="border-b border-line px-5 py-3 font-display text-xl font-semibold">Champions de la saison</h2>
            {profile.champions.length === 0 ? (
              <p className="px-5 py-6 text-sm text-mute">Aucune game classée cette saison.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-mute">
                  <tr>
                    <th className="px-5 py-2 font-medium">Champion</th>
                    <th className="px-2 py-2 text-right font-medium">Games</th>
                    <th className="px-2 py-2 text-right font-medium">Winrate</th>
                    <th className="px-5 py-2 text-right font-medium">KDA</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.champions.map((c) => (
                    <tr key={c.champion} className="border-t border-line/60">
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-3">
                          <ChampIcon name={c.champion} size={32} />
                          <span className="font-semibold">{c.champion}</span>
                        </div>
                      </td>
                      <td className="num px-2 text-right text-base">{c.games}</td>
                      <td className={`num px-2 text-right text-base ${wrColor(c.wins / Math.max(1, c.games))}`}>
                        {pct(c.wins / Math.max(1, c.games))}
                      </td>
                      <td className="num px-5 text-right text-base">{kda(c.kills, c.deaths, c.assists)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </>
  )
}

function RecentForm({ matches, onOpen }: { matches: MatchSummary[]; onOpen: () => void }) {
  if (!matches.length) return null
  const wins = matches.filter((m) => m.win).length
  return (
    <div className="rounded-lg border border-line bg-panel px-5 py-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-mute">{matches.length} dernières games</p>
        <button onClick={onOpen} className="text-sm text-mute underline-offset-2 hover:text-ink hover:underline">
          Voir l'historique
        </button>
      </div>
      <p className="num mt-1 text-3xl font-semibold">
        {wins}V {matches.length - wins}D
      </p>
      <div className="mt-3 flex gap-1" aria-label="Résultats récents, du plus récent au plus ancien">
        {matches.map((m) => (
          <span
            key={m.id}
            title={`${m.champion} — ${m.win ? 'Victoire' : 'Défaite'}`}
            className={`h-6 flex-1 rounded-sm ${m.win ? 'bg-win' : 'bg-loss'}`}
          />
        ))}
      </div>
    </div>
  )
}
