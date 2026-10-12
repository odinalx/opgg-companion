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
      <PageHeader title="Historique">
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
          <p className="mb-3 text-sm text-mute">
            {shown.length} games enregistrées. L'historique s'allonge à chaque synchronisation : OP.GG fournit les 20
            dernières, le client LoL jusqu'à 100.
          </p>
          <ul className="flex flex-col gap-2">
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
      className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm"
    >
      {children}
    </select>
  )
}

function MatchRow({ match: m, open, onToggle }: { match: MatchSummary; open: boolean; onToggle: () => void }) {
  const mins = m.durationSec / 60 || 1
  const accent = m.remake ? 'bg-mute' : m.win ? 'bg-win' : 'bg-loss'
  return (
    <li className="overflow-hidden rounded-lg border border-line bg-panel">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 py-2.5 pr-4 text-left hover:bg-panel-2">
        <span className={`w-1 self-stretch ${accent}`} />
        <div className="w-28 shrink-0">
          <p className={`font-display text-lg font-semibold ${m.remake ? 'text-mute' : m.win ? 'text-win' : 'text-loss'}`}>
            {m.remake ? 'Remake' : m.win ? 'Victoire' : 'Défaite'}
          </p>
          <p className="text-xs text-mute">{queueLabel(m.queue)}</p>
          <p className="text-xs text-mute">
            {duration(m.durationSec)} · {timeAgo(m.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <ChampIcon name={m.champion} size={48} />
          <div className="flex flex-col gap-0.5">
            {m.spells.slice(0, 2).map((s, i) => (
              <SpellIcon key={i} id={s} size={22} />
            ))}
          </div>
          <div className="flex flex-col gap-0.5">
            <RuneIcon id={m.primaryRune} size={22} />
            <RuneIcon id={m.secondaryPage} size={22} />
          </div>
        </div>
        <div className="w-32 shrink-0">
          <p className="num text-xl font-semibold">
            {m.kills} / <span className="text-loss">{m.deaths}</span> / {m.assists}
          </p>
          <p className="text-xs text-mute">{kda(m.kills, m.deaths, m.assists)} KDA</p>
        </div>
        <div className="w-36 shrink-0 text-xs text-mute">
          <p>
            {m.cs} CS ({(m.cs / mins).toFixed(1)}/min)
          </p>
          <p>{Math.round(m.damage / 1000)}k dégâts</p>
          <p>{positionLabel(m.position)}{m.opScore !== null && ` · OP score ${m.opScore.toFixed(1)}`}</p>
        </div>
        <div className="flex flex-wrap gap-0.5">
          {m.items.map((it, i) => (
            <ItemIcon key={i} id={it} size={28} />
          ))}
        </div>
        <span className="ml-auto text-mute" aria-hidden>
          {open ? '▴' : '▾'}
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

  if (error) return <p className="border-t border-line px-5 py-4 text-sm text-loss">Détail indisponible : {error}</p>
  if (!detail) return <div className="border-t border-line px-5"><Spinner label="Chargement du détail…" /></div>
  const maxDmg = Math.max(1, ...detail.teams.flatMap((t) => t.participants.map((p) => p.damage)))
  const mins = match.durationSec / 60 || 1

  return (
    <div className="grid grid-cols-1 gap-4 border-t border-line p-4 2xl:grid-cols-2">
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
          <table className="w-full text-xs">
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
                <tr key={i} className={`border-t border-line/50 ${p.isTarget ? 'bg-gold/10' : ''}`}>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <ChampIcon name={p.champion} size={28} />
                      <div className="min-w-0">
                        <p className={`truncate font-semibold ${p.isTarget ? 'text-gold' : ''}`}>{p.gameName}</p>
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
                        <ItemIcon key={j} id={it} size={20} />
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
