import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { StatsAggregate } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon } from '../components/Icons'
import { Empty, PageHeader, Spinner } from '../components/ui'
import { pct, positionLabel, wrColor } from '../lib/format'

export function StatsPage() {
  const account = useApp((s) => s.account)!
  const queueFilter = useApp((s) => s.settings?.queueFilter)
  const updateSettings = useApp((s) => s.updateSettings)
  const [stats, setStats] = useState<StatsAggregate | null>(null)

  useEffect(() => {
    setStats(null)
    window.api.getStats(account).then(setStats, () => setStats(null))
  }, [account, queueFilter])

  return (
    <>
      <PageHeader title="Stats">
        <select
          aria-label="Games prises en compte"
          value={queueFilter}
          onChange={(e) => void updateSettings({ queueFilter: e.target.value as 'ranked' | 'all' })}
          className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm"
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Games" value={String(stats.games)} />
            <Tile label="Winrate" value={pct(stats.wins / stats.games)} tone={wrColor(stats.wins / stats.games)} />
            <Tile label="KDA moyen" value={stats.kda.toFixed(2)} />
            <Tile label="CS par minute" value={stats.csPerMin.toFixed(1)} />
            <Tile label="Dégâts par minute" value={Math.round(stats.damagePerMin).toLocaleString('fr-FR')} />
            <Tile label="Wards par game" value={stats.visionPerGame.toFixed(1)} />
          </div>

          <section className="rounded-lg border border-line bg-panel p-5">
            <h2 className="font-display text-xl font-semibold">Winrate cumulé</h2>
            <p className="mb-3 text-sm text-mute">De la plus ancienne à la plus récente des {stats.games} games.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.trend.map((t, i) => ({ ...t, n: i + 1 }))} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
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
                  <Line type="monotone" dataKey="cumulativeWr" stroke="#3987e5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="rounded-lg border border-line bg-panel">
              <h2 className="border-b border-line px-5 py-3 font-display text-xl font-semibold">Par champion</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-mute">
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
                    <tr key={c.champion} className="border-t border-line/60">
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-3">
                          <ChampIcon name={c.champion} size={28} />
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

            <section className="self-start rounded-lg border border-line bg-panel">
              <h2 className="border-b border-line px-5 py-3 font-display text-xl font-semibold">Par rôle</h2>
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

function Tile({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <p className={`num text-3xl font-semibold ${tone}`}>{value}</p>
      <p className="text-sm text-mute">{label}</p>
    </div>
  )
}

function WrBar({ wins, games }: { wins: number; games: number }) {
  const wr = wins / Math.max(1, games)
  return (
    <div className="flex items-center gap-2" title={`${wins} victoires sur ${games} games`}>
      <div className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded">
        <div className="bg-win" style={{ width: `${wr * 100}%` }} />
        <div className="flex-1 bg-loss/70" />
      </div>
      <span className={`num w-11 text-right text-base ${wrColor(wr)}`}>{pct(wr)}</span>
    </div>
  )
}
