import { type ReactNode, useEffect, useState } from 'react'
import type { ChampionBuild, LiveStats, OverlaySettings, OverlayUi, OverlayWidget, WidgetPosition } from '@shared/types'
import { DEFAULT_POSITIONS, TIER_LABELS } from '@shared/types'
import { useApp } from './store'
import { ChampIcon, ItemIcon, RuneIcon } from './components/Icons'
import { positionLabel } from './lib/format'

const pretty = (key: string): string => key.replace('Control', 'Ctrl').replaceAll('+', ' + ')

const SHADOW = '[text-shadow:0_1px_2px_#000,0_0_6px_#000]'

export function Overlay() {
  const [live, setStats] = useState<LiveStats | null>(null)
  const [ui, setUi] = useState<OverlayUi>({ visible: true, showBuild: false, tabHeld: false, editing: false })
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

  if (settings?.mode === 'window') return <LiveWindow stats={live} settings={settings} />
  const stats = live
  if (!stats || !settings || !ui.visible) return null
  const editing = ui.editing
  const m = settings.metrics
  const pos = settings.positions

  // Enregistre une nouvelle position (le main la renvoie à l'overlay via les réglages).
  const save = (patch: Partial<OverlaySettings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void window.api.setSettings({ overlay: next })
  }
  const move = (id: OverlayWidget) => (p: WidgetPosition) => save({ positions: { ...pos, [id]: p } })

  // Écart de CS/min avec la médiane de ton elo pour ton rôle.
  const csRateDelta = stats.bench ? stats.csPerMin - stats.bench.csPerMin : null
  const visionDelta = stats.bench ? stats.visionPerMin - stats.bench.visionPerMin : null

  return (
    <div className={`fixed inset-0 select-none ${editing ? 'bg-black/30' : 'pointer-events-none'}`}>
      {editing && <EditBar settings={settings} onReset={() => save({ positions: DEFAULT_POSITIONS, scoreboard: { ...settings.scoreboard, x: 50, y: 38 } })} />}

      {m.cs && (
        <Movable label="CS/min" pos={pos.cs} editing={editing} onMove={move('cs')}>
          <p className={`text-[13px] text-white ${SHADOW}`}>
            <span className="num text-lg font-bold">{stats.csPerMin.toFixed(1)}</span> CS/min{' '}
            {csRateDelta !== null && <Delta value={csRateDelta} digits={1} />}
          </p>
        </Movable>
      )}
      {m.vision && (
        <Movable label="Vision" pos={pos.vision} editing={editing} onMove={move('vision')}>
          <p className={`text-[13px] text-white ${SHADOW}`}>
            <span className="num text-lg font-bold">{stats.visionPerMin.toFixed(1)}</span> vision/min{' '}
            {visionDelta !== null && <Delta value={visionDelta} digits={1} />}
          </p>
        </Movable>
      )}
      {m.gold && (
        <Movable label="Or/min" pos={pos.gold} editing={editing} onMove={move('gold')}>
          <p className={`text-[13px] text-white ${SHADOW}`}>
            <span className="num text-lg font-bold">{Math.round(stats.goldPerMin)}</span> or/min
          </p>
        </Movable>
      )}
      {m.kp && (
        <Movable label="KP" pos={pos.kp} editing={editing} onMove={move('kp')}>
          <p className={`text-[13px] text-white ${SHADOW}`}>
            <span className="num text-lg font-bold">{Math.round(stats.killParticipation * 100)}%</span> KP
          </p>
        </Movable>
      )}

      {settings.goldDiffOnTab && (ui.tabHeld || settings.scoreboard.calibrate || editing) && (
        <ScoreboardGold
          stats={stats}
          layout={settings.scoreboard}
          editing={editing}
          onMove={(p) => save({ scoreboard: { ...settings.scoreboard, x: p.x, y: p.y } })}
        />
      )}

      {(ui.showBuild || editing) && stats.position && (
        <Movable label="Build" pos={pos.build} editing={editing} onMove={move('build')}>
          <div className="w-[26rem] rounded-2xl border border-white/10 bg-night/90 p-5 shadow-2xl">
            <BuildSummary champion={stats.champion} position={stats.position} />
          </div>
        </Movable>
      )}
    </div>
  )
}

/** Barre du mode déplacement. */
function EditBar({ settings, onReset }: { settings: OverlaySettings; onReset: () => void }) {
  return (
    <div className="fixed top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-accent/40 bg-night/95 px-4 py-2.5 text-sm shadow-2xl">
      <span className="text-soft">Glisse chaque élément à sa place.</span>
      <button className="rounded-lg px-3 py-1.5 text-mute hover:bg-white/5 hover:text-ink" onClick={onReset}>
        Positions par défaut
      </button>
      <button className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-night" onClick={() => void window.api.setOverlayEditing(false)}>
        Terminer ({pretty(settings.editKey)})
      </button>
    </div>
  )
}

/**
 * Élément positionné en % de l'écran. En mode déplacement : contour pointillé, étiquette,
 * glisser-déposer ; la position est enregistrée au relâchement.
 */
function Movable({
  label,
  pos,
  editing,
  onMove,
  center,
  children
}: {
  label: string
  pos: WidgetPosition
  editing: boolean
  onMove: (p: WidgetPosition) => void
  center?: boolean // la position désigne le centre de l'élément (tableau des scores)
  children: ReactNode
}) {
  const [drag, setDrag] = useState<WidgetPosition | null>(null)
  const p = drag ?? pos
  const round = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10
  return (
    <div
      className={`absolute ${center ? '-translate-x-1/2' : ''} ${
        editing ? 'cursor-move rounded-lg outline-2 outline-offset-4 outline-accent/70 outline-dashed' : ''
      }`}
      style={{ left: `${p.x}%`, top: `${p.y}%` }}
      onPointerDown={(e) => {
        if (!editing) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const start = { mx: e.clientX, my: e.clientY, x: p.x, y: p.y }
        const target = e.currentTarget
        const onMoveEvt = (ev: PointerEvent) =>
          setDrag({
            x: round(start.x + ((ev.clientX - start.mx) / window.innerWidth) * 100),
            y: round(start.y + ((ev.clientY - start.my) / window.innerHeight) * 100)
          })
        const onUp = (ev: PointerEvent) => {
          target.removeEventListener('pointermove', onMoveEvt)
          target.removeEventListener('pointerup', onUp)
          const final = {
            x: round(start.x + ((ev.clientX - start.mx) / window.innerWidth) * 100),
            y: round(start.y + ((ev.clientY - start.my) / window.innerHeight) * 100)
          }
          setDrag(null)
          onMove(final)
        }
        target.addEventListener('pointermove', onMoveEvt)
        target.addEventListener('pointerup', onUp)
      }}
    >
      {editing && (
        <span className="absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-night">
          {label}
        </span>
      )}
      {children}
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
function ScoreboardGold({
  stats: s,
  layout,
  editing,
  onMove
}: {
  stats: LiveStats
  layout: OverlaySettings['scoreboard']
  editing: boolean
  onMove: (p: WidgetPosition) => void
}) {
  const enemySide = s.side === 'blue' ? 'red' : 'blue'
  // Par défaut ton équipe est à gauche du tableau.
  const allyLeft = !layout.swapSides
  const px = (pct: number) => `${(pct / 100) * window.innerHeight}px`
  // Zone du groupe : de la ligne « équipe » (au-dessus du top) jusqu'au support, centrée sur la ligne centrale.
  const top = (row: number) => px((row + 1.5) * layout.spacing)
  const label = (diff: number, row: number, key: string, small?: boolean) => {
    const style = { top: top(row) }
    if (Math.abs(diff) < 100)
      return (
        <span key={key} className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50" style={style}>
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
        className={`num absolute left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold whitespace-nowrap ${small ? 'text-sm' : 'text-base'} ${
          side === 'blue' ? 'text-[#60a5fa]' : 'text-[#f87171]'
        }`}
        style={style}
      >
        {pointsLeft ? `‹ ${text}` : `${text} ›`}
      </span>
    )
  }
  // Le groupe est ancré sur la 1re ligne (top) : la zone commence 1,5 ligne plus haut.
  return (
    <Movable label="Écarts d'or (Tab)" pos={{ x: layout.x, y: layout.y - 1.5 * layout.spacing }} editing={editing} onMove={(p) => onMove({ x: p.x, y: p.y + 1.5 * layout.spacing })} center>
      <div className={`relative w-28 ${SHADOW}`} style={{ height: px(6.5 * layout.spacing) }}>
        {label(s.teamGoldDiff, -1, 'team', true)}
        {s.lanes.map((l, i) => (l.ally && l.enemy ? label(l.diff, i, l.position) : null))}
      </div>
    </Movable>
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
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-xl font-bold text-accent">En jeu</p>
        <p className="text-sm text-mute">comparé à la médiane {TIER_LABELS[s.tier]}</p>
        <p className="num text-2xl text-soft">{clock}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {m.cs && (
          <Tile label={`CS/min (médiane ${TIER_LABELS[s.tier]} : ${s.bench?.csPerMin.toFixed(1) ?? '—'})`}>
            {s.csPerMin.toFixed(1)}
            {s.bench && <Delta value={s.csPerMin - s.bench.csPerMin} digits={1} />}
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
