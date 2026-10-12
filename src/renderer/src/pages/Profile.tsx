import { useEffect, useState } from 'react'
import type { MatchSummary, Profile, RankedEntry } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon, ProfileIcon, Splash } from '../components/Icons'
import { Glyph } from '../components/Glyphs'
import { Button, CardTitle, Empty, Notice, Spinner, WrBar } from '../components/ui'
import { kda, queueLabel, tierLabel } from '../lib/format'

export function ProfilePage() {
  const account = useApp((s) => s.account)!
  const status = useApp((s) => s.status)
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
      setError((e as Error).message.replace(/^Error invoking remote method '\w+': (Error: )?/, ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.gameName, account.tagLine, account.region])

  if (loading && !profile) return <Spinner label="Récupération du profil sur OP.GG…" />
  if (!profile)
    return (
      <>
        {error && <Notice tone="error">{error}</Notice>}
        <Empty title="Profil introuvable" action={<Button onClick={() => setPage('settings')}>Changer de compte</Button>}>
          Vérifie le Riot ID et la région.
        </Empty>
      </>
    )

  const solo = profile.ranked.find((r) => r.queue === 'SOLORANKED')
  const flex = profile.ranked.find((r) => r.queue === 'FLEXRANKED')
  const main = profile.champions[0]?.champion ?? null

  return (
    <div className="flex flex-col gap-6">
      {error && <Notice tone="error">{error}</Notice>}

      <section className="hero min-h-[260px]">
        <Splash name={main} />
        <div className="flex h-full min-h-[260px] flex-wrap items-end justify-between gap-6 p-8">
          <div className="flex items-end gap-5">
            <ProfileIcon id={status.account?.profileIconId} size={84} />
            <div>
              <p className="text-soft">
                {profile.level ? `Niveau ${profile.level} · ` : ''}
                {account.region}
              </p>
              <h1 className="font-display text-6xl leading-none font-bold tracking-tight">
                {profile.gameName}
                <span className="text-4xl text-mute"> #{profile.tagLine}</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void load()} disabled={loading}>
              <Glyph.refresh />
              {loading ? 'Actualisation…' : 'Actualiser'}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col gap-6">
          {solo && <RankCard entry={solo} primary />}
          <RecentForm matches={recent} onOpen={() => setPage('matches')} />
          {flex && <RankCard entry={flex} />}
        </div>

        <section className="card self-start">
          <CardTitle aside="saison en cours">Champions les plus joués</CardTitle>
          {profile.champions.length === 0 ? (
            <p className="px-5 pb-6 text-soft">Aucune game classée cette saison.</p>
          ) : (
            <ul className="px-2 pb-2">
              {profile.champions.map((c) => (
                <li key={c.champion} className="grid grid-cols-[auto_minmax(0,1fr)_9rem_4.5rem] items-center gap-4 rounded-xl px-3 py-2.5 hover:bg-panel-2">
                  <ChampIcon name={c.champion} size={42} className="rounded-xl" />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{c.champion}</p>
                    <p className="text-sm text-mute">{c.games} games</p>
                  </div>
                  <WrBar wins={c.wins} games={c.games} />
                  <div className="text-right">
                    <p className="num text-lg font-semibold">{kda(c.kills, c.deaths, c.assists)}</p>
                    <p className="text-xs text-mute">KDA</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function RankCard({ entry: r, primary }: { entry: RankedEntry; primary?: boolean }) {
  const games = r.wins + r.losses
  const wr = games ? r.wins / games : 0
  return (
    <section className="card flex items-center gap-5 p-5">
      {r.emblemUrl && (
        <img src={r.emblemUrl} alt="" className={primary ? 'h-24 w-24' : 'h-16 w-16 opacity-90'} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-mute">{queueLabel(r.queue)}</p>
        <p className={`num leading-tight font-bold ${primary ? 'text-4xl' : 'text-2xl'}`}>{tierLabel(r.tier, r.division, null)}</p>
        {r.lp !== null && r.tier && <p className="num text-xl text-accent">{r.lp} LP</p>}
      </div>
      {games > 0 && (
        <div className="text-right">
          <p className={`num text-3xl font-bold ${wr >= 0.5 ? 'text-win' : 'text-loss'}`}>{Math.round(wr * 100)}%</p>
          <p className="text-sm text-mute">
            {r.wins}V · {r.losses}D
          </p>
          {r.hotStreak && <p className="mt-1 text-xs font-semibold text-accent">Série de victoires</p>}
        </div>
      )}
    </section>
  )
}

function RecentForm({ matches, onOpen }: { matches: MatchSummary[]; onOpen: () => void }) {
  if (!matches.length) return null
  const wins = matches.filter((m) => m.win).length
  const k = matches.reduce((a, m) => a + m.kills, 0)
  const d = matches.reduce((a, m) => a + m.deaths, 0)
  const as = matches.reduce((a, m) => a + m.assists, 0)
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold">Forme récente</h2>
        <button onClick={onOpen} className="text-sm font-semibold text-soft hover:text-ink">
          Voir l'historique
        </button>
      </div>
      <div className="mt-3 flex items-end gap-8">
        <div>
          <p className="num text-4xl font-bold">
            <span className="text-win">{wins}</span>
            <span className="text-mute"> – </span>
            <span className="text-loss">{matches.length - wins}</span>
          </p>
          <p className="text-sm text-mute">sur les {matches.length} dernières games</p>
        </div>
        <div>
          <p className="num text-4xl font-bold">{kda(k, d, as)}</p>
          <p className="text-sm text-mute">KDA moyen</p>
        </div>
      </div>
      {/* Du plus ancien (gauche) au plus récent (droite), comme une timeline */}
      <div className="mt-4 flex gap-1" aria-label="Résultats récents, du plus ancien au plus récent">
        {[...matches].reverse().map((m) => (
          <span key={m.id} className="min-w-0 flex-1" title={`${m.champion} — ${m.win ? 'victoire' : 'défaite'}`}>
            <ChampIcon name={m.champion} size={0} className={`aspect-square w-full rounded-lg ring-2 ${m.win ? 'ring-win' : 'ring-loss opacity-60'}`} />
          </span>
        ))}
      </div>
    </section>
  )
}
