import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { StatsAggregate, Tier } from '@shared/types'
import { TIER_LABELS, TIERS } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon } from '../components/Icons'
import { SkillRadar } from '../components/Radar'
import { Empty, PageHeader, Spinner, WrBar } from '../components/ui'
import { pct, positionLabel, wrColor } from '../lib/format'

export function StatsPage() {
  const account = useApp((s) => s.account)!
  const queueFilter = useApp((s) => s.settings?.queueFilter)
  const compareTier = useApp((s) => s.settings?.compareTier ?? 'auto')
  const updateSettings = useApp((s) => s.updateSettings)
  const [stats, setStats] = useState<StatsAggregate | null>(null)

  useEffect(() => {
    setStats(null)
    window.api.getStats(account).then(setStats, () => setStats(null))
  }, [account, queueFilter, compareTier])
  const b = stats?.tierBench ?? undefined
  const tl = stats ? TIER_LABELS[stats.tier] : ''

  return (
    <>
      <PageHeader
        title="Stats"
        subtitle={stats ? `Calculées sur tout l'historique enregistré, comparées aux médianes ${TIER_LABELS[stats.tier]} de tes rôles.` : undefined}
      >
        <select
          aria-label="Palier de comparaison"
          value={compareTier}
          onChange={(e) => void updateSettings({ compareTier: e.target.value as Tier | 'auto' })}
          className="field px-3 py-2 text-sm"
        >
          <option value="auto">Comparer à mon elo</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              Comparer à {TIER_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          aria-label="Games prises en compte"
          value={queueFilter}
          onChange={(e) => void updateSettings({ queueFilter: e.target.value as 'ranked' | 'all' })}
          className="field px-3 py-2 text-sm"
        >
          <option value="ranked">Classées uniquement</option>
          <option value="all">Toutes les files</option>
        </select>
      </PageHeader>
      {!stats ? (
        <Spinner />
      ) : stats.games === 0 ? (
        <Empty title="Pas encore de données">
          Ouvre l'historique pour synchroniser tes games : les stats sont calculées sur l'historique enregistré.
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
            <Tile label="Games" value={String(stats.games)} />
            <Tile label="Winrate" value={pct(stats.wins / stats.games)} tone={wrColor(stats.wins / stats.games)} />
            <Tile label="KDA" value={stats.kda.toFixed(2)} you={stats.kda} median={b?.kda} tierLabel={tl} />
            <Tile label="CS par minute" value={stats.csPerMin.toFixed(1)} you={stats.csPerMin} median={b?.csPerMin} tierLabel={tl} />
            <Tile label="Dégâts par minute" value={Math.round(stats.damagePerMin).toLocaleString('fr-FR')} you={stats.damagePerMin} median={b?.damagePerMin} digits={0} tierLabel={tl} />
            <Tile label="Or par minute" value={Math.round(stats.goldPerMin).toLocaleString('fr-FR')} you={stats.goldPerMin} median={b?.goldPerMin} digits={0} tierLabel={tl} />
            <Tile label="Wards par minute" value={stats.wardsPerMin.toFixed(2)} you={stats.wardsPerMin} median={b?.wardsPerMin} digits={2} tierLabel={tl} />
          </div>

          {stats.skills.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-2xl font-bold">Profil de jeu</h2>
              <p className="mb-4 text-sm text-mute">
                50 = médiane {TIER_LABELS[stats.tier]} de ton rôle, 90 = médiane deux paliers au-dessus.
              </p>
              <SkillRadar axes={stats.skills} />
            </section>
          )}

          <section className="card p-5">
            <h2 className="font-display text-xl font-bold">Winrate cumulé</h2>
            <p className="mb-3 text-sm text-mute">De la plus ancienne à la plus récente des {stats.games} games.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trend.map((t, i) => ({ ...t, n: i + 1 }))} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke="#24324b" strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="n" stroke="#8d99b0" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    domain={[0, 1]}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                    tickFormatter={(v: number) => pct(v)}
                    stroke="#8d99b0"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <ReferenceLine y={0.5} stroke="#8d99b0" strokeDasharray="4 4" />
                  <Tooltip
                    cursor={{ stroke: '#8d99b0', strokeWidth: 1 }}
                    contentStyle={{ background: '#1c2840', border: '1px solid #24324b', borderRadius: 6, fontSize: 13 }}
                    labelFormatter={(n) => `Game ${n}`}
                    formatter={(v, _name, item) => [
                      `${pct(Number(v), 1)} (${item.payload.win ? 'victoire' : 'défaite'}, KDA ${item.payload.kda.toFixed(1)})`,
                      'Winrate cumulé'
                    ]}
                  />
                  <defs>
                    <linearGradient id="wr-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="cumulativeWr"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    fill="url(#wr-fill)"
                    dot={false}
                    activeDot={{ r: 5, fill: 'var(--color-accent)', stroke: 'var(--color-panel)', strokeWidth: 2 }}
                    style={{ filter: 'drop-shadow(0 0 6px rgb(34 227 255 / 0.6))' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="card">
              <h2 className="px-5 pt-4 pb-2 font-display text-xl font-bold">Par champion</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-sm text-mute">
                  <tr>
                    <th className="px-5 py-2 font-medium">Champion</th>
                    <th className="px-2 text-right font-medium">Games</th>
                    <th className="w-40 px-2 font-medium">Winrate</th>
                    <th className="px-2 text-right font-medium">KDA</th>
                    <th className="px-5 text-right font-medium">CS/min</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byChampion.map((c) => (
                    <tr key={c.champion} className="border-t border-line/60 hover:bg-panel-2/60">
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-3">
                          <ChampIcon name={c.champion} size={36} className="rounded-lg" />
                          <span className="font-semibold">{c.champion}</span>
                        </div>
                      </td>
                      <td className="num px-2 text-right text-base">{c.games}</td>
                      <td className="px-2">
                        <WrBar wins={c.wins} games={c.games} />
                      </td>
                      <td className="num px-2 text-right text-base">{c.kda.toFixed(2)}</td>
                      <td className="num px-5 text-right text-base">{c.csPerMin.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="self-start card">
              <h2 className="px-5 pt-4 pb-2 font-display text-xl font-bold">Par rôle</h2>
              <ul className="px-5 py-3">
                {stats.byPosition.map((p) => (
                  <li key={p.position} className="flex items-center gap-3 py-2">
                    <span className="w-16 font-semibold">{positionLabel(p.position)}</span>
                    <span className="num w-10 text-right text-mute">{p.games}</span>
                    <div className="flex-1">
                      <WrBar wins={p.wins} games={p.games} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </>
  )
}

function Tile({
  label,
  value,
  tone = '',
  you,
  median,
  digits = 1,
  tierLabel
}: {
  label: string
  value: string
  tone?: string
  you?: number
  median?: number
  digits?: number
  tierLabel?: string
}) {
  const hasMedian = you !== undefined && median !== undefined && median > 0
  // Jauge : la médiane est au milieu ; le double de la médiane remplit la jauge.
  const ratio = hasMedian ? Math.min(1, you! / (median! * 2)) : 0
  const better = hasMedian && you! >= median!
  return (
    <div className="card px-5 py-4">
      <p className="text-sm text-mute">{label}</p>
      <p className={`num glow mt-1 text-4xl leading-none font-bold ${tone || (hasMedian ? (better ? 'text-accent' : 'text-ink') : '')}`}>{value}</p>
      {hasMedian && (
        <div className="mt-3">
          <div className="relative h-1.5 rounded-full bg-white/[0.06]">
            <div className="neon-fill absolute inset-y-0 left-0 rounded-full" style={{ width: `${ratio * 100}%` }} />
            <span className="absolute -top-1 left-1/2 h-3.5 w-px bg-white/70" title="médiane" />
          </div>
          <p className="mt-1.5 text-xs text-mute">
            médiane {tierLabel} <span className="num text-sm text-soft">{median!.toFixed(digits)}</span>{' '}
            <span className={better ? 'text-ok' : 'text-loss'}>
              {better ? '+' : '−'}
              {Math.abs(((you! - median!) / median!) * 100).toFixed(0)} %
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
