import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { MatchDetail, MatchSummary } from '@shared/types'
import { POSITIONS } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon, ItemIcon, RuneIcon, SpellIcon } from '../components/Icons'
import { Button, Empty, Notice, PageHeader, Spinner } from '../components/ui'
import { duration, kda, positionLabel, queueLabel, timeAgo } from '../lib/format'

export function MatchesPage() {
  const account = useApp((s) => s.account)!
  const [matches, setMatches] = useState<MatchSummary[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [queue, setQueue] = useState('all')
  const [champion, setChampion] = useState('all')
  const [position, setPosition] = useState('all')
  const [open, setOpen] = useState<string | null>(null)

  const load = async (refresh: boolean): Promise<void> => {
    setLoading(true)
    try {
      const r = await window.api.getMatches(account, refresh)
      setMatches(r.matches)
      setErrors(r.errors)
    } catch (e) {
      setErrors([(e as Error).message])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Affiche d'abord l'historique local, puis synchronise.
    void load(false).then(() => load(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.gameName, account.tagLine])

  const champions = useMemo(() => [...new Set((matches ?? []).map((m) => m.champion))].sort(), [matches])
  const queues = useMemo(() => [...new Set((matches ?? []).map((m) => m.queue))], [matches])
  const shown = (matches ?? []).filter(
    (m) =>
      (queue === 'all' || m.queue === queue) &&
      (champion === 'all' || m.champion === champion) &&
      (position === 'all' || m.position === position)
  )

  return (
    <>
      <PageHeader
        title="Historique"
        subtitle={matches ? `${shown.length} games · OP.GG fournit les 20 dernières, le client LoL jusqu'à 100 : l'historique s'allonge à chaque synchro.` : undefined}
      >
        <Select value={queue} onChange={setQueue} label="File">
          <option value="all">Toutes les files</option>
          {queues.map((q) => (
            <option key={q} value={q}>
              {queueLabel(q)}
            </option>
          ))}
        </Select>
        <Select value={champion} onChange={setChampion} label="Champion">
          <option value="all">Tous les champions</option>
          {champions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select value={position} onChange={setPosition} label="Rôle">
          <option value="all">Tous les rôles</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {positionLabel(p)}
            </option>
          ))}
        </Select>
        <Button onClick={() => void load(true)} disabled={loading}>
          {loading ? 'Synchronisation…' : 'Synchroniser'}
        </Button>
      </PageHeader>
      {errors.length > 0 && <Notice tone="error">{errors.join(' — ')}</Notice>}
      {!matches ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Empty title="Aucune game">
          {matches.length ? 'Aucune game ne correspond à ces filtres.' : 'Joue une partie ou lance une synchronisation.'}
        </Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {shown.map((m) => (
              <MatchRow key={m.id} match={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Select({
  value,
  onChange,
  label,
  children
}: {
  value: string
  onChange: (v: string) => void
  label: string
  children: ReactNode
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="field px-3 py-2 text-sm"
    >
      {children}
    </select>
  )
}

function MatchRow({ match: m, open, onToggle }: { match: MatchSummary; open: boolean; onToggle: () => void }) {
  const mins = m.durationSec / 60 || 1
  const tone = m.remake ? 'mute' : m.win ? 'win' : 'loss'
  const tint = { win: 'bg-win/[0.07] border-win/25', loss: 'bg-loss/[0.07] border-loss/25', mute: 'bg-panel border-line' }[tone]
  const text = { win: 'text-win', loss: 'text-loss', mute: 'text-mute' }[tone]
  const showOpScore = m.opScore !== null && m.opScore > 0
  return (
    <li className={`overflow-hidden rounded-[14px] border ${tint}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[6.5rem_auto_8.5rem_9rem_minmax(0,1fr)_auto] items-center gap-5 px-5 py-3 text-left hover:bg-white/[0.02]"
      >
        <div>
          <p className={`font-display text-xl leading-none font-bold ${text}`}>{m.remake ? 'Remake' : m.win ? 'Victoire' : 'Défaite'}</p>
          <p className="mt-1.5 text-sm text-soft">{queueLabel(m.queue)}</p>
          <p className="text-xs text-mute">
            {duration(m.durationSec)} · {timeAgo(m.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <ChampIcon name={m.champion} size={56} className="rounded-xl" />
            {m.position && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-md bg-night px-1.5 text-[10px] font-semibold text-soft">
                {positionLabel(m.position)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {m.spells.slice(0, 2).map((sp, i) => (
              <SpellIcon key={i} id={sp} size={25} />
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <RuneIcon id={m.primaryRune} size={25} />
            <RuneIcon id={m.secondaryPage} size={25} />
          </div>
        </div>
        <div>
          <p className="num text-2xl leading-none font-bold">
            {m.kills}
            <span className="text-mute"> / </span>
            <span className="text-loss">{m.deaths}</span>
            <span className="text-mute"> / </span>
            {m.assists}
          </p>
          <p className="mt-1 text-sm text-soft">{kda(m.kills, m.deaths, m.assists)} KDA</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
          <dt className="text-mute">CS</dt>
          <dd className="num text-base">
            {m.cs} <span className="text-mute">({(m.cs / mins).toFixed(1)})</span>
          </dd>
          <dt className="text-mute">Dégâts</dt>
          <dd className="num text-base">{(m.damage / 1000).toFixed(1)}k</dd>
          {showOpScore && (
            <>
              <dt className="text-mute">OP score</dt>
              <dd className="num text-base">{m.opScore!.toFixed(1)}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap gap-1">
          {m.items.map((it, i) => (
            <ItemIcon key={i} id={it} size={32} />
          ))}
        </div>
        <span className={`text-mute transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && <MatchDetailView match={m} />}
    </li>
  )
}

function MatchDetailView({ match }: { match: MatchSummary }) {
  const account = useApp((s) => s.account)!
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getMatchDetail(account, match).then(setDetail, (e) => setError((e as Error).message))
  }, [account, match])

  if (error) return <p className="border-t border-line/70 px-5 py-4 text-sm text-loss">Détail indisponible : {error}</p>
  if (!detail) return <div className="border-t border-line/70 px-5"><Spinner label="Chargement du détail…" /></div>
  const maxDmg = Math.max(1, ...detail.teams.flatMap((t) => t.participants.map((p) => p.damage)))
  const mins = match.durationSec / 60 || 1

  return (
    <div className="grid grid-cols-1 gap-5 border-t border-line/70 bg-night/40 p-5 2xl:grid-cols-2">
      {detail.teams.map((t) => (
        <div key={t.key}>
          <div className="mb-2 flex items-baseline justify-between">
            <p className={`font-display text-lg font-semibold ${t.win ? 'text-win' : 'text-loss'}`}>
              {t.win ? 'Victoire' : 'Défaite'} <span className="text-sm text-mute">({t.key === 'BLUE' ? 'côté bleu' : 'côté rouge'})</span>
            </p>
            <p className="text-xs text-mute">
              {t.kills} kills · {Math.round(t.gold / 1000)}k or · {t.towers} tours · {t.dragons} dragons · {t.barons} barons
            </p>
          </div>
          <table className="w-full text-[13px]">
            <thead className="text-left text-mute">
              <tr>
                <th className="py-1 font-medium">Joueur</th>
                <th className="font-medium">KDA</th>
                <th className="font-medium">Dégâts</th>
                <th className="font-medium">CS</th>
                <th className="font-medium">Vision</th>
                <th className="font-medium">Items</th>
              </tr>
            </thead>
            <tbody>
              {t.participants.map((p, i) => (
                <tr key={i} className={`border-t border-line/50 ${p.isTarget ? 'bg-accent/10' : ''}`}>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <ChampIcon name={p.champion} size={32} className="rounded-lg" />
                      <div className="min-w-0">
                        <p className={`truncate font-semibold ${p.isTarget ? 'text-accent' : ''}`}>{p.gameName}</p>
                        <p className="text-mute">
                          {positionLabel(p.position)} · niv. {p.level}
                          {p.opScoreRank === 1 && ' · MVP'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="num text-sm">
                    {p.kills}/{p.deaths}/{p.assists}
                  </td>
                  <td className="w-28 pr-3">
                    <p className="num text-sm">{p.damage.toLocaleString('fr-FR')}</p>
                    <div className="mt-0.5 h-1 rounded bg-panel-2">
                      <div className="h-1 rounded bg-loss" style={{ width: `${(p.damage / maxDmg) * 100}%` }} />
                    </div>
                  </td>
                  <td className="num text-sm">
                    {p.cs} <span className="text-mute">({(p.cs / mins).toFixed(1)})</span>
                  </td>
                  <td className="num text-sm">{p.wardsPlaced}</td>
                  <td>
                    <div className="flex gap-0.5">
                      {p.items.map((it, j) => (
                        <ItemIcon key={j} id={it} size={24} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
