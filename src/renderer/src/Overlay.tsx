import { type ReactNode, useEffect, useState } from 'react'
import type { ChampionBuild, LiveStats, OverlaySettings, OverlayUi } from '@shared/types'
import { useApp } from './store'
import { ChampIcon, ItemIcon, RuneIcon } from './components/Icons'

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
  const [ui, setUi] = useState<OverlayUi>({ visible: true, showBuild: false })
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
      {ui.showBuild && stats.position && (
        <div className="fixed top-1/2 right-6 w-[26rem] -translate-y-1/2 rounded-2xl border border-white/10 bg-night/85 p-5 shadow-2xl backdrop-blur-md">
          <BuildSummary champion={stats.champion} position={stats.position} />
        </div>
      )}
    </div>
  )
}

function Hud({ stats: s, settings }: { stats: LiveStats; settings: OverlaySettings }) {
  const m = settings.metrics
  const csRatio = s.csPerMin / s.csTarget
  const csTone = csRatio >= 0.9 ? 'text-ok' : csRatio >= 0.7 ? 'text-[#e3b341]' : 'text-loss'
  return (
    <div className={`fixed ${CORNER[settings.corner]} flex items-center gap-3 rounded-2xl border border-white/10 bg-night/80 py-2 pr-4 pl-2 shadow-2xl backdrop-blur-md`}>
      <ChampIcon name={s.champion} size={40} className="rounded-xl" />
      {m.cs && (
        <Metric label={`CS · objectif ${s.csTarget.toFixed(1)}`}>
          {s.cs} <span className={csTone}>{s.csPerMin.toFixed(1)}/min</span>
        </Metric>
      )}
      {m.kda && (
        <Metric label="KDA">
          {s.kills}/<span className="text-loss">{s.deaths}</span>/{s.assists}
        </Metric>
      )}
      {m.kp && <Metric label="Participation">{Math.round(s.killParticipation * 100)}%</Metric>}
      {m.gold && (
        <Metric label="Or estimé /min">
          {Math.round(s.goldPerMin)} <span className="text-mute">· {(s.goldEarned / 1000).toFixed(1)}k</span>
        </Metric>
      )}
      {m.vision && <Metric label="Vision">{s.vision}</Metric>}
      <p className="ml-1 border-l border-white/10 pl-3 text-[11px] leading-tight text-mute">
        Build
        <br />
        {pretty(settings.buildKey)}
      </p>
    </div>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="leading-tight">
      <p className="num text-xl font-bold whitespace-nowrap text-ink">{children}</p>
      <p className="text-[11px] whitespace-nowrap text-mute">{label}</p>
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

/** Mode « second écran » : fenêtre classique avec les stats en grand et le build toujours visible. */
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
  const csRatio = s.csPerMin / s.csTarget
  const csTone = csRatio >= 0.9 ? 'text-ok' : csRatio >= 0.7 ? 'text-[#e3b341]' : 'text-loss'
  const m = settings.metrics
  const clock = `${Math.floor(s.gameTime / 60)}:${String(Math.floor(s.gameTime % 60)).padStart(2, '0')}`
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-xl font-bold text-accent">En jeu</p>
        <p className="num text-2xl text-soft">{clock} · niv. {s.level}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {m.cs && (
          <Tile label={`CS/min · objectif ${s.csTarget.toFixed(1)}`}>
            <span className={csTone}>{s.csPerMin.toFixed(1)}</span>
            <span className="text-lg text-mute"> ({s.cs})</span>
          </Tile>
        )}
        {m.kda && (
          <Tile label="KDA">
            {s.kills}/<span className="text-loss">{s.deaths}</span>/{s.assists}
          </Tile>
        )}
        {m.kp && <Tile label="Participation aux kills">{Math.round(s.killParticipation * 100)}%</Tile>}
        {m.gold && (
          <Tile label="Or estimé par minute">
            {Math.round(s.goldPerMin)}
            <span className="text-lg text-mute"> · {(s.goldEarned / 1000).toFixed(1)}k</span>
          </Tile>
        )}
        {m.vision && <Tile label="Score de vision">{s.vision}</Tile>}
      </div>
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
