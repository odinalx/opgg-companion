import { type ReactNode, useEffect, useState } from 'react'
import type { BuildOption, ChampionBuild, ImportResult, Position } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon, ItemIcon, RuneIcon, SpellIcon } from './Icons'
import { Button, Spinner } from './ui'
import { positionLabel } from '../lib/format'

// Fragments de stats : absents de runesReforged.json, on les décrit ici.
const SHARDS: Record<number, { name: string; icon: string }> = {
  5008: { name: 'Force adaptative', icon: 'StatModsAdaptiveForceIcon' },
  5005: { name: "Vitesse d'attaque", icon: 'StatModsAttackSpeedIcon' },
  5007: { name: 'Accélération de compétence', icon: 'StatModsCDRScalingIcon' },
  5010: { name: 'Vitesse de déplacement', icon: 'StatModsMovementSpeedIcon' },
  5001: { name: 'PV croissants', icon: 'StatModsHealthPlusIcon' },
  5011: { name: 'PV', icon: 'StatModsHealthScalingIcon' },
  5013: { name: 'Ténacité et résistance aux ralentissements', icon: 'StatModsTenacityIcon' },
  5002: { name: 'Armure', icon: 'StatModsArmorIcon' },
  5003: { name: 'Résistance magique', icon: 'StatModsMagicResIcon' }
}

const pct = (x: number): string => `${Math.round(x * 100)}%`

export function BuildPanel({
  champion,
  position,
  locked,
  onClose
}: {
  champion: string
  position: Position
  locked: boolean
  onClose?: () => void
}) {
  const connected = useApp((s) => s.status.connected)
  const [build, setBuild] = useState<ChampionBuild | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    setBuild(null)
    setError(null)
    setResult(null)
    window.api.getBuild(champion, position).then(setBuild, (e) => setError(cleanError(e)))
  }, [champion, position])

  useEffect(() => window.api.onAutoImport((r) => r.champion === champion && setResult(r)), [champion])

  const runImport = async (label: string, parts: { runes?: boolean; spells?: boolean; items?: boolean }) => {
    setBusy(label)
    try {
      setResult(await window.api.importBuild(champion, position, parts))
    } catch (e) {
      setResult({ errors: [cleanError(e)] })
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="card overflow-hidden border-accent/30">
      <header className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-accent/[0.10] to-transparent px-5 py-4">
        <ChampIcon name={champion} size={52} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-accent">{locked ? 'Champion verrouillé' : 'Build recommandé'}</p>
          <h2 className="font-display text-3xl leading-none font-bold">
            {champion} <span className="text-xl text-mute">{positionLabel(position)}</span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!connected || !build || !!busy} onClick={() => void runImport('rs', { runes: true, spells: true })}>
            {busy === 'rs' ? 'Import…' : 'Importer runes et sorts'}
          </Button>
          <Button disabled={!connected || !build || !!busy} onClick={() => void runImport('items', { items: true })}>
            {busy === 'items' ? 'Création…' : "Créer le set d'items"}
          </Button>
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              Fermer
            </Button>
          )}
        </div>
      </header>

      {!connected && <p className="px-5 pt-3 text-sm text-mute">Lance le client LoL pour importer ce build en un clic.</p>}
      {result && <ImportFeedback result={result} />}

      {error ? (
        <p className="px-5 py-4 text-sm text-loss">Build indisponible : {error}</p>
      ) : !build ? (
        <div className="px-5">
          <Spinner label="Récupération du build sur OP.GG…" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 px-5 py-5 2xl:grid-cols-2">
          <Runes build={build} />
          <div className="flex flex-col gap-5">
            <Section title="Sorts">
              {build.spells ? (
                <div className="flex items-center gap-3">
                  {build.spells.ids.map((id) => (
                    <SpellIcon key={id} id={id} size={36} />
                  ))}
                  <Stat option={build.spells} />
                </div>
              ) : (
                <Missing />
              )}
            </Section>
            <Skills order={build.skillOrder} priority={build.skillPriority} />
          </div>
          <div className="2xl:col-span-2">
            <Items build={build} />
          </div>
        </div>
      )}
    </article>
  )
}

function cleanError(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '\w+': (Error: )?/, '')
}

function ImportFeedback({ result }: { result: ImportResult }) {
  const done = [
    result.runes && `page de runes « ${result.runes} »`,
    result.spells && `sorts ${result.spells}`,
    result.items && `set d'items « ${result.items} »`
  ].filter(Boolean)
  return (
    <div className="mx-5 mt-3 flex flex-col gap-1 text-sm" role="status">
      {done.length > 0 && <p className="text-ok">Importé dans le client : {done.join(', ')}.</p>}
      {result.errors.map((e) => (
        <p key={e} className="text-loss">
          {e}
        </p>
      ))}
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        {aside && <p className="text-xs text-mute">{aside}</p>}
      </div>
      {children}
    </section>
  )
}

function Stat({ option }: { option: { games: number; winRate: number } }) {
  return (
    <p className="text-sm text-soft">
      <span className="num text-base font-semibold text-ink">{pct(option.winRate)}</span> WR ·{' '}
      {option.games.toLocaleString('fr-FR')} games
    </p>
  )
}

function Missing() {
  return <p className="text-sm text-mute">Pas assez de données.</p>
}

function Runes({ build }: { build: ChampionBuild }) {
  const r = build.runes
  return (
    <Section title="Runes" aside={r ? `${pct(r.winRate)} WR · ${r.games.toLocaleString('fr-FR')} games` : undefined}>
      {!r ? (
        <Missing />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <RuneIcon id={r.primaryStyle} size={26} />
            <RuneIcon id={r.perks[0]} size={52} />
            {r.perks.slice(1, 4).map((id) => (
              <RuneIcon key={id} id={id} size={34} />
            ))}
            <span className="ml-1 text-sm text-soft">{r.perkNames[0]}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <RuneIcon id={r.subStyle} size={26} />
            {r.perks.slice(4, 6).map((id) => (
              <RuneIcon key={id} id={id} size={34} />
            ))}
            <span className="mx-2 h-6 w-px bg-line" />
            {r.shards.map((id, i) => (
              <ShardIcon key={i} id={id} />
            ))}
          </div>
          <p className="text-sm text-mute">
            {r.perkNames.join(', ')}
          </p>
        </div>
      )}
    </Section>
  )
}

function ShardIcon({ id }: { id: number }) {
  const s = SHARDS[id]
  if (!s) return <span className="grid h-6 w-6 place-items-center rounded-full bg-panel-2 text-[10px] text-mute">{id}</span>
  return (
    <img
      src={`https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/${s.icon}.png`}
      alt={s.name}
      title={s.name}
      className="h-6 w-6 rounded-full bg-night p-0.5"
    />
  )
}

function Skills({ order, priority }: { order: string[]; priority: string[] }) {
  if (!order.length && !priority.length) return null
  const keys = ['Q', 'W', 'E', 'R']
  return (
    <Section title="Compétences">
      {priority.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          {priority.map((k, i) => (
            <span key={k} className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-panel-3 font-display text-lg font-bold text-accent">{k}</span>
              {i < priority.length - 1 && <span className="text-mute">›</span>}
            </span>
          ))}
          <span className="ml-2 text-sm text-mute">ordre de montée</span>
        </div>
      )}
      {order.length > 0 && (
        <table className="border-separate border-spacing-[3px] text-center text-xs" aria-label="Compétence montée à chaque niveau">
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <th className="w-5 pr-1 text-left font-semibold text-mute">{k}</th>
                {order.map((o, lvl) => (
                  <td
                    key={lvl}
                    className={`h-6 w-6 rounded font-semibold ${o === k ? 'bg-accent text-night' : 'bg-panel-2 text-transparent'}`}
                  >
                    {lvl + 1}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function Items({ build }: { build: ChampionBuild }) {
  return (
    <Section title="Items">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <ItemGroup label="Départ" option={build.starter} />
        <ItemGroup label="Bottes" option={build.boots} />
        <ItemGroup label="Core" option={build.core} chain />
        <Choices label="4e item" options={build.fourth} />
        <Choices label="5e item" options={build.fifth} />
        <Choices label="6e item" options={build.sixth} />
      </div>
    </Section>
  )
}

function ItemGroup({ label, option, chain }: { label: string; option: BuildOption | null; chain?: boolean }) {
  if (!option) return null
  return (
    <div>
      <p className="mb-1.5 text-sm text-soft">{label}</p>
      <div className="flex items-center gap-1.5">
        {option.ids.map((id, i) => (
          <span key={i} className="flex items-center gap-1.5" title={option.names[i]}>
            <ItemIcon id={id} size={40} />
            {chain && i < option.ids.length - 1 && <span className="text-mute">›</span>}
          </span>
        ))}
      </div>
      <p className="num mt-1 text-sm text-mute">{pct(option.winRate)} WR</p>
    </div>
  )
}

function Choices({ label, options }: { label: string; options: BuildOption[] }) {
  if (!options.length) return null
  return (
    <div>
      <p className="mb-1.5 text-sm text-soft">{label}</p>
      <div className="flex gap-2">
        {options.map((o) => (
          <div key={o.ids.join()} className="text-center" title={o.names.join(', ')}>
            <ItemIcon id={o.ids[0]} size={34} />
            <p className="num mt-0.5 text-xs text-mute">{pct(o.winRate)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
