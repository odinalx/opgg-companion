import { type ReactNode, useEffect, useState } from 'react'
import type { ChampionBuild, LiveStats, OverlaySettings, OverlayUi } from '@shared/types'
import { TIER_LABELS } from '@shared/types'
import { useApp } from './store'
import { ChampIcon, ItemIcon, RuneIcon } from './components/Icons'
import { positionLabel } from './lib/format'

const CORNER: Record<OverlaySettings['corner'], string> = {
  // Décalages choisis pour ne pas couvrir le score (haut droite) ni la minimap (bas droite).
  'top-left': 'top-3 left-3',
  'top-right': 'top-14 right-3',
  'bottom-left': 'bottom-44 left-3',
  'bottom-right': 'bottom-72 right-3'
}

const pretty = (key: string): string => key.replace('Control', 'Ctrl').replaceAll('+', ' + ')

export function Overlay() {
  const [stats, setStats] = useState<LiveStats | null>(null)
  const [ui, setUi] = useState<OverlayUi>({ visible: true, showBuild: false, tabHeld: false })
  const [settings, setSettings] = useState<OverlaySettings | null>(null)

  useEffect(() => {
    // Fond transparent seulement en mode overlay (le mode fenêtre garde le fond de l'app).
    document.documentElement.classList.toggle('overlay', settings?.mode !== 'window')
  }, [settings?.mode])

  useEffect(() => {
    window.api.getStatic().then((staticData) => useApp.setState({ staticData }), () => undefined)
    const offs = [window.api.onOverlayStats(setStats), window.api.onOverlayUi(setUi), window.api.onOverlaySettings(setSettings)]
    // État initial demandé au main : les événements envoyés avant le montage seraient perdus.
    void window.api.getOverlayState().then((st) => {
      setSettings(st.settings)
      setUi(st.ui)
      if (st.stats) setStats(st.stats)
    })
    return () => offs.forEach((off) => off())
  }, [])

  if (settings?.mode === 'window') return <LiveWindow stats={stats} settings={settings} />
  if (!stats || !settings || !ui.visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 select-none">
      <Hud stats={stats} settings={settings} />
      {settings.goldDiffOnTab && (ui.tabHeld || settings.scoreboard.calibrate) && (
        <ScoreboardGold stats={stats} layout={settings.scoreboard} />
      )}
      {ui.showBuild && stats.position && (
        <div className="fixed top-1/2 right-6 w-[26rem] -translate-y-1/2 rounded-2xl border border-white/10 bg-night/85 p-5 shadow-2xl backdrop-blur-md">
          <BuildSummary champion={stats.champion} position={stats.position} />
        </div>
      )}
    </div>
  )
}

/**
 * HUD minimal : quelques chiffres en texte ombré, sans cadre, pour ne pas gêner la lecture du jeu.
 * Couleur uniquement sur l'écart à la médiane de ton elo.
 */
function Hud({ stats: s, settings }: { stats: LiveStats; settings: OverlaySettings }) {
  const m = settings.metrics
  const csDelta = s.bench ? Math.round(s.cs - s.csExpected) : null
  const visionDelta = s.bench ? s.visionPerMin - s.bench.visionPerMin : null
  const lines = [
    m.cs && (
      <p key="cs">
        <span className="num text-lg font-bold">{s.cs}</span> CS {csDelta !== null && <Delta value={csDelta} />}
        {s.nextMilestone && <span className="text-white/60"> · {s.nextMilestone.minute}' : {s.nextMilestone.expected}</span>}
      </p>
    ),
    m.vision && (
      <p key="vision">
        <span className="num text-lg font-bold">{s.vision}</span> vision{' '}
        {visionDelta !== null && <Delta value={visionDelta * 10} digits={1} />}
      </p>
    ),
    m.gold && (
      <p key="gold">
        <span className="num text-lg font-bold">{Math.round(s.goldPerMin)}</span> or/min
      </p>
    ),
    m.kp && (
      <p key="kp">
        <span className="num text-lg font-bold">{Math.round(s.killParticipation * 100)}%</span> KP
      </p>
    )
  ].filter(Boolean)
  if (!lines.length) return null
  return (
    <div
      className={`fixed ${CORNER[settings.corner]} text-right text-[13px] leading-tight text-white [text-shadow:0_1px_2px_#000,0_0_6px_#000]`}
      title={`Comparé à la médiane ${TIER_LABELS[s.tier]}`}
    >
      {lines}
    </div>
  )
}

function Delta({ value, digits = 0 }: { value: number; digits?: number }) {
  const up = value >= 0
  return (
    <span className={`num font-semibold ${up ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
      {up ? '+' : '−'}
      {Math.abs(value).toFixed(digits)}
    </span>
  )
}

/**
 * Écarts d'or posés sur la ligne centrale du tableau des scores du jeu (Tab), une ligne par
 * lane : seulement le chiffre, dans la couleur du côté qui mène, une flèche vers le plus riche.
 */
function ScoreboardGold({ stats: s, layout }: { stats: LiveStats; layout: OverlaySettings['scoreboard'] }) {
  const enemySide = s.side === 'blue' ? 'red' : 'blue'
  // Par défaut ton équipe est à gauche du tableau.
  const allyLeft = !layout.swapSides
  const label = (diff: number, top: number, key: string, small?: boolean) => {
    if (Math.abs(diff) < 100)
      return (
        <span key={key} className="absolute -translate-x-1/2 -translate-y-1/2 text-white/50" style={{ left: `${layout.x}%`, top: `${top}%` }}>
          =
        </span>
      )
    const allyRicher = diff > 0
    const side = allyRicher ? s.side : enemySide
    const pointsLeft = allyRicher === allyLeft
    const text = Math.abs(diff).toLocaleString('fr-FR')
    return (
      <span
        key={key}
        className={`num absolute -translate-x-1/2 -translate-y-1/2 font-bold whitespace-nowrap ${small ? 'text-sm' : 'text-base'} ${
          side === 'blue' ? 'text-[#60a5fa]' : 'text-[#f87171]'
        }`}
        style={{ left: `${layout.x}%`, top: `${top}%` }}
      >
        {pointsLeft ? `‹ ${text}` : `${text} ›`}
      </span>
    )
  }
  return (
    <div className="fixed inset-0 [text-shadow:0_1px_2px_#000,0_0_4px_#000]">
      {label(s.teamGoldDiff, layout.y - layout.spacing, 'team', true)}
      {s.lanes.map((l, i) => (l.ally && l.enemy ? label(l.diff, layout.y + i * layout.spacing, l.position) : null))}
    </div>
  )
}

/** Mode fenêtre : tableau des écarts d'or par lane (valeur des items), dans la couleur du côté qui mène. */
function GoldDiff({ stats: s }: { stats: LiveStats }) {
  const enemySide = s.side === 'blue' ? 'red' : 'blue'
  const color = (side: 'blue' | 'red') => (side === 'blue' ? 'text-win' : 'text-loss')
  const row = (diff: number) => {
    if (Math.abs(diff) < 100) return <span className="num text-lg text-mute">=</span>
    const side = diff > 0 ? s.side : enemySide
    return <span className={`num text-lg font-bold ${color(side)}`}>{Math.abs(diff).toLocaleString('fr-FR')}</span>
  }
  return (
    <div
      className="card px-4 py-3"
    >
      <p className="mb-2 text-center text-xs text-mute">Écart d'or estimé (valeur des items)</p>
      <ul className="flex flex-col gap-1">
        {s.lanes.filter((l) => l.ally || l.enemy).map((l) => (
          <li key={l.position} className={`grid grid-cols-[2rem_1fr_4.5rem_1fr_2rem] items-center gap-2 rounded-lg px-1 py-0.5 ${l.mine ? 'bg-white/5' : ''}`}>
            <ChampIcon name={l.ally} size={28} className={`rounded-md ring-2 ${s.side === 'blue' ? 'ring-win/70' : 'ring-loss/70'}`} />
            <span className="text-xs text-soft">{positionLabel(l.position)}</span>
            <span className="text-center">{row(l.diff)}</span>
            <span />
            <ChampIcon name={l.enemy} size={28} className={`rounded-md ring-2 ${s.side === 'blue' ? 'ring-loss/70' : 'ring-win/70'}`} />
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-white/10 pt-1.5 text-center text-sm">
        Équipe <span className="ml-1">{row(s.teamGoldDiff)}</span>
      </p>
    </div>
  )
}

function BuildSummary({ champion, position }: { champion: string; position: LiveStats['position'] & string }) {
  const [build, setBuild] = useState<ChampionBuild | null>(null)
  useEffect(() => {
    window.api.getBuild(champion, position).then(setBuild, () => setBuild(null))
  }, [champion, position])
  if (!build) return null
  const r = build.runes
  return (
    <div>
      <div className="flex items-center gap-3">
        <ChampIcon name={champion} size={44} className="rounded-xl" />
        <div>
          <p className="font-display text-2xl leading-none font-bold">{champion}</p>
          <p className="text-sm text-mute">Build OP.GG · {position}</p>
        </div>
      </div>

      {build.skillPriority.length > 0 && (
        <Row label="Compétences">
          <div className="flex items-center gap-1.5">
            {build.skillPriority.map((k, i) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-panel-3 font-display text-base font-bold text-accent">{k}</span>
                {i < build.skillPriority.length - 1 && <span className="text-mute">›</span>}
              </span>
            ))}
          </div>
        </Row>
      )}

      {r && (
        <Row label="Runes">
          <div className="flex items-center gap-1.5">
            <RuneIcon id={r.perks[0]} size={34} />
            {r.perks.slice(1).map((id) => (
              <RuneIcon key={id} id={id} size={24} />
            ))}
          </div>
        </Row>
      )}

      {build.core && (
        <Row label="Core">
          <div className="flex items-center gap-1">
            {build.core.ids.map((id, i) => (
              <span key={i} className="flex items-center gap-1">
                <ItemIcon id={id} size={36} />
                {i < build.core!.ids.length - 1 && <span className="text-mute">›</span>}
              </span>
            ))}
            {build.boots && (
              <span className="ml-2">
                <ItemIcon id={build.boots.ids[0]} size={36} />
              </span>
            )}
          </div>
        </Row>
      )}

      {[...build.fourth, ...build.fifth].length > 0 && (
        <Row label="Ensuite, selon la game">
          <div className="flex flex-wrap gap-1">
            {[...new Map([...build.fourth, ...build.fifth, ...build.sixth].map((o) => [o.ids[0], o])).values()].slice(0, 7).map((o) => (
              <div key={o.ids[0]} className="text-center">
                <ItemIcon id={o.ids[0]} size={32} />
                <p className="num text-[11px] text-mute">{Math.round(o.winRate * 100)}%</p>
              </div>
            ))}
          </div>
        </Row>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold text-soft">{label}</p>
      {children}
    </div>
  )
}

/** Mode « second écran » : fenêtre classique, tout est visible en permanence (stats, écart d'or, build). */
function LiveWindow({ stats: s, settings }: { stats: LiveStats | null; settings: OverlaySettings }) {
  if (!s)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="font-display text-3xl font-bold">En attente de la partie</p>
          <p className="mt-2 text-soft">Les stats et le build s'affichent ici dès que la partie commence.</p>
        </div>
      </div>
    )
  const m = settings.metrics
  const clock = `${Math.floor(s.gameTime / 60)}:${String(Math.floor(s.gameTime % 60)).padStart(2, '0')}`
  const csDelta = s.bench ? Math.round(s.cs - s.csExpected) : null
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-xl font-bold text-accent">En jeu</p>
        <p className="text-sm text-mute">comparé à la médiane {TIER_LABELS[s.tier]}</p>
        <p className="num text-2xl text-soft">{clock}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {m.cs && (
          <Tile label={`CS · ${s.csPerMin.toFixed(1)}/min (médiane ${s.bench?.csPerMin.toFixed(1) ?? '—'})`}>
            {s.cs}
            {csDelta !== null && <Delta value={csDelta} />}
          </Tile>
        )}
        {m.vision && (
          <Tile label={`Vision · ${s.visionPerMin.toFixed(2)}/min (médiane ${s.bench?.visionPerMin.toFixed(2) ?? '—'})`}>
            {s.vision}
          </Tile>
        )}
        {m.gold && <Tile label="Or estimé par minute">{Math.round(s.goldPerMin)}</Tile>}
        {m.kp && <Tile label="Participation aux kills">{Math.round(s.killParticipation * 100)}%</Tile>}
      </div>
      {(s.milestones.length > 0 || s.nextMilestone) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {s.milestones.map((ms) => (
            <span key={ms.minute} className={`rounded-lg px-2 py-1 ${ms.cs >= ms.expected ? 'bg-ok/15 text-ok' : 'bg-loss/15 text-loss'}`}>
              {ms.minute} min : {ms.cs} CS / {ms.expected} attendus
            </span>
          ))}
          {s.nextMilestone && (
            <span className="rounded-lg bg-white/5 px-2 py-1 text-soft">
              Objectif {s.nextMilestone.minute} min : {s.nextMilestone.expected} CS
            </span>
          )}
        </div>
      )}
      {settings.goldDiffOnTab && (
        <GoldDiff stats={s} />
      )}
      {s.position && (
        <div className="card p-5">
          <BuildSummary champion={s.champion} position={s.position} />
        </div>
      )}
    </div>
  )
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="num text-4xl leading-none font-bold">{children}</p>
      <p className="mt-1.5 text-sm text-mute">{label}</p>
    </div>
  )
}
