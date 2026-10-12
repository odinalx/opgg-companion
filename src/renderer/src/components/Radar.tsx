import { useState } from 'react'
import type { SkillAxis } from '@shared/types'

const SIZE = 420
const C = SIZE / 2
const R = 150 // rayon de l'anneau 100

/** Coordonnées du point `value` (0..100) sur l'axe `i` (axe 0 en haut, sens horaire). */
function point(i: number, n: number, value: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n
  const r = (value / 100) * R
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)]
}

const polygon = (values: number[]): string => values.map((v, i) => point(i, values.length, v).join(',')).join(' ')

const fmt = (axis: SkillAxis, raw: number): string =>
  axis.key === 'damage' || axis.key === 'economy' ? Math.round(raw).toLocaleString('fr-FR') : raw.toFixed(axis.key === 'vision' ? 2 : 1)

/**
 * Radar hexagonal des domaines de jeu. Deux séries : la moyenne (neutre, en retrait)
 * et la forme récente (couleur d'accent). L'anneau 50 matérialise le repère du rôle.
 */
export function SkillRadar({ axes }: { axes: SkillAxis[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = axes.length
  const hasRecent = axes.every((a) => a.recent !== null)

  return (
    <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <svg viewBox={`-60 0 ${SIZE + 120} ${SIZE}`} className="w-full max-w-[30rem]" role="img" aria-label="Radar des domaines de jeu, détaillé dans le tableau voisin">
        {/* Grille : anneaux hexagonaux 25/50/75/100 et rayons */}
        {[25, 50, 75, 100].map((ring) => (
          <polygon
            key={ring}
            points={polygon(Array(n).fill(ring))}
            fill={ring === 100 ? 'rgb(255 255 255 / 0.02)' : 'none'}
            stroke={ring === 50 ? 'rgb(143 155 179 / 0.55)' : 'rgb(143 155 179 / 0.16)'}
            strokeWidth={1}
            strokeDasharray={ring === 50 ? '4 4' : undefined}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, n, 100)
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="rgb(143 155 179 / 0.16)" />
        })}

        {/* Moyenne de toutes les games */}
        <polygon
          points={polygon(axes.map((a) => a.overall))}
          fill="rgb(195 203 218 / 0.10)"
          stroke="#c3cbda"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Forme récente */}
        {hasRecent && (
          <polygon
            points={polygon(axes.map((a) => a.recent!))}
            fill="rgb(47 212 196 / 0.18)"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* Sommets + zones de survol plus larges que la marque */}
        {axes.map((a, i) => {
          const v = hasRecent ? a.recent! : a.overall
          const [x, y] = point(i, n, v)
          return (
            <g key={a.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <circle cx={x} cy={y} r={14} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={hover === i ? 6 : 4.5}
                fill={hasRecent ? 'var(--color-accent)' : '#c3cbda'}
                stroke="var(--color-panel)"
                strokeWidth={2}
              />
            </g>
          )
        })}

        {/* Libellés d'axes avec la note */}
        {axes.map((a, i) => {
          const [x, y] = point(i, n, 122)
          const anchor = Math.abs(x - C) < 4 ? 'middle' : x > C ? 'start' : 'end'
          const score = Math.round(hasRecent ? a.recent! : a.overall)
          return (
            <g key={a.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <text x={x} y={y - 6} textAnchor={anchor} className="fill-soft text-[13px] font-semibold">
                {a.label}
              </text>
              <text x={x} y={y + 16} textAnchor={anchor} className="num fill-ink text-[22px] font-bold">
                {score}
              </text>
            </g>
          )
        })}

        {hover !== null && <RadarTooltip axis={axes[hover]} i={hover} n={n} hasRecent={hasRecent} />}
      </svg>

      <div>
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Légende">
          {hasRecent && (
            <li className="flex items-center gap-2">
              <span className="h-0.5 w-5 rounded bg-accent" /> 10 dernières games
            </li>
          )}
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-5 rounded bg-soft" /> Toutes les games
          </li>
          <li className="flex items-center gap-2 text-mute">
            <span className="w-5 border-t border-dashed border-mute" /> Médiane de ton palier (50)
          </li>
        </ul>
        <table className="w-full text-sm">
          <thead className="text-left text-mute">
            <tr>
              <th className="py-1.5 font-medium">Domaine</th>
              {hasRecent && <th className="text-right font-medium">Récent</th>}
              <th className="text-right font-medium">Global</th>
              <th className="pl-4 text-right font-medium">Valeur moyenne</th>
            </tr>
          </thead>
          <tbody>
            {axes.map((a, i) => (
              <tr
                key={a.key}
                className={`border-t border-line/60 ${hover === i ? 'bg-panel-2' : ''}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <td className="py-2 font-semibold">{a.label}</td>
                {hasRecent && (
                  <td className="num text-right text-lg">
                    {Math.round(a.recent!)}
                    <Delta value={a.recent! - a.overall} />
                  </td>
                )}
                <td className="num text-right text-lg text-soft">{Math.round(a.overall)}</td>
                <td className="pl-4 text-right text-soft">
                  {fmt(a, a.rawOverall)} <span className="text-mute">{a.unit}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-mute">Chaque game est comparée aux médianes de son rôle, puis les notes sont moyennées.</p>
      </div>
    </div>
  )
}

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 3) return null
  return (
    <span className={`ml-1.5 text-sm ${value > 0 ? 'text-ok' : 'text-loss'}`}>
      {value > 0 ? '▲' : '▼'}
      {Math.round(Math.abs(value))}
    </span>
  )
}

function RadarTooltip({ axis, i, n, hasRecent }: { axis: SkillAxis; i: number; n: number; hasRecent: boolean }) {
  const [x, y] = point(i, n, hasRecent ? axis.recent! : axis.overall)
  const w = 190
  const h = hasRecent ? 64 : 46
  const tx = Math.min(SIZE + 56 - w, Math.max(-56, x - w / 2))
  const ty = y > C ? y - h - 14 : y + 14
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={h} rx={8} fill="#172133" stroke="#1f2b40" />
      <text x={tx + 12} y={ty + 20} className="fill-ink text-[13px] font-semibold">
        {axis.label}
      </text>
      {hasRecent && (
        <text x={tx + 12} y={ty + 38} className="fill-soft text-[12px]">
          Récent : {fmt(axis, axis.rawRecent!)} {axis.unit}
        </text>
      )}
      <text x={tx + 12} y={ty + (hasRecent ? 55 : 37)} className="fill-soft text-[12px]">
        Global : {fmt(axis, axis.rawOverall)} {axis.unit}
      </text>
    </g>
  )
}
