import { type ReactNode, useEffect, useState } from 'react'
import type { BuildOption, BuildVariant, ChampionBuild, ImportResult, MatchupBuild, Position, ProBuilds, RunePage } from '@shared/types'
import { useApp } from '../store'
import { ItemIcon, RuneIcon, SpellIcon } from './Icons'
import { Button, Spinner } from './ui'

const pct = (x: number): string => `${Math.round(x * 100)}%`
const n = (x: number): string => x.toLocaleString('fr-FR')

function cleanError(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '\w+': (Error: )?/, '')
}

/** Construit un build importable à partir de morceaux choisis dans l'interface. */
function composeBuild(
  champion: string,
  position: Position,
  parts: { runes?: RunePage | null; spells?: number[]; items?: number[]; boots?: number | null; starter?: BuildOption | null }
): ChampionBuild {
  const opt = (ids: number[]): BuildOption => ({ ids, names: [], games: 0, winRate: 0, pickRate: 0 })
  return {
    champion,
    position,
    runes: parts.runes ?? null,
    spells: parts.spells ? opt(parts.spells) : null,
    starter: parts.starter ?? null,
    core: parts.items?.length ? opt(parts.items) : null,
    boots: parts.boots ? opt([parts.boots]) : null,
    fourth: [],
    fifth: [],
    sixth: [],
    skillOrder: [],
    skillPriority: []
  }
}

function useImport(onResult: (r: ImportResult) => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, build: ChampionBuild, parts: { runes?: boolean; spells?: boolean; items?: boolean }) => {
    setBusy(key)
    try {
      onResult(await window.api.importBuildData(build, parts))
    } catch (e) {
      onResult({ errors: [cleanError(e)] })
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

export function RunePageRow({ page }: { page: RunePage }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RuneIcon id={page.perks[0]} size={44} />
      {page.perks.slice(1, 4).map((id) => (
        <RuneIcon key={id} id={id} size={28} />
      ))}
      <span className="mx-1 h-6 w-px bg-line" />
      {page.perks.slice(4).map((id) => (
        <RuneIcon key={id} id={id} size={28} />
      ))}
    </div>
  )
}

// ---------------- Contre l'adversaire ----------------

export function MatchupTab({
  champion,
  position,
  opponent,
  onResult
}: {
  champion: string
  position: Position
  opponent: string
  onResult: (r: ImportResult) => void
}) {
  const connected = useApp((s) => s.status.connected)
  const [data, setData] = useState<MatchupBuild | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useImport(onResult)

  useEffect(() => {
    setData(null)
    setError(null)
    window.api.getMatchupBuild(champion, position, opponent).then(setData, (e) => setError(cleanError(e)))
  }, [champion, position, opponent])

  if (error) return <p className="text-sm text-loss">Données du matchup indisponibles : {error}</p>
  if (!data) return <Spinner label={`Statistiques ${champion} contre ${opponent}…`} />

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-soft">
        Ce que jouent les joueurs de {champion} contre {opponent} (OP.GG, classée). Runes, sorts et items sont comptés
        séparément : pour des builds joués ensemble, regarde l'onglet High elo.
      </p>

      <Block title="Runes">
        {data.runePages.map((p, i) => (
          <Choice key={i} rank={i + 1} games={p.games} winRate={p.winRate}>
            <RunePageRow page={p} />
            <Button
              variant={i === 0 ? 'primary' : 'default'}
              disabled={!connected || !!busy}
              onClick={() => void run(`rune${i}`, composeBuild(champion, position, { runes: p }), { runes: true })}
            >
              {busy === `rune${i}` ? 'Import…' : 'Importer cette page'}
            </Button>
          </Choice>
        ))}
      </Block>

      <Block title="Sorts">
        {data.spells.map((sp, i) => (
          <Choice key={i} rank={i + 1} games={sp.games} winRate={sp.winRate}>
            <div className="flex gap-1.5">
              {sp.ids.map((id) => (
                <SpellIcon key={id} id={id} size={34} />
              ))}
            </div>
            <Button
              disabled={!connected || !!busy}
              onClick={() => void run(`spell${i}`, composeBuild(champion, position, { spells: sp.ids }), { spells: true })}
            >
              {busy === `spell${i}` ? 'Import…' : 'Appliquer'}
            </Button>
          </Choice>
        ))}
      </Block>

      <Block title="Items">
        <div className="flex flex-col gap-2">
          {data.cores.map((c, i) => (
            <Choice key={i} rank={i + 1} games={c.games} winRate={c.winRate}>
              <ItemRow ids={c.ids} />
            </Choice>
          ))}
          <div className="mt-1 flex flex-wrap gap-6 text-sm text-soft">
            {data.starter && (
              <span className="flex items-center gap-2">
                Départ <ItemRow ids={data.starter.ids} size={30} />
              </span>
            )}
            {data.boots.length > 0 && (
              <span className="flex items-center gap-2">
                Bottes
                {data.boots.map((b) => (
                  <span key={b.ids[0]} className="flex items-center gap-1">
                    <ItemIcon id={b.ids[0]} size={30} />
                    <span className="num text-xs text-mute">{pct(b.winRate)}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      </Block>
    </div>
  )
}

// ---------------- High elo ----------------

export function ProTab({
  champion,
  position,
  opponent,
  onResult
}: {
  champion: string
  position: Position
  opponent: string | null
  onResult: (r: ImportResult) => void
}) {
  const connected = useApp((s) => s.status.connected)
  const [data, setData] = useState<ProBuilds | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { busy, run } = useImport(onResult)

  useEffect(() => {
    setData(null)
    setError(null)
    window.api.getProBuilds(champion, position, opponent).then(setData, (e) => setError(cleanError(e)))
  }, [champion, position, opponent])

  if (error) return <p className="text-sm text-loss">Builds high elo indisponibles : {error}</p>
  if (!data) return <Spinner label="Analyse des games récentes des meilleurs joueurs du champion…" />
  if (!data.variants.length)
    return <p className="text-sm text-mute">Pas de game récente de {champion} {position} chez les meilleurs joueurs.</p>

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-soft">
        {data.gamesAnalyzed} games récentes de {data.players} joueurs master+ sur {champion}. Chaque build réunit des games
        jouées avec les mêmes runes et sorts ; ses items sont les plus fréquents dans ces games.
      </p>
      {data.variants.map((v, i) => (
        <VariantCard
          key={i}
          index={i}
          variant={v}
          opponent={opponent}
          busy={busy === `v${i}`}
          disabled={!connected || !!busy}
          onImport={() =>
            void run(
              `v${i}`,
              composeBuild(champion, position, { runes: v.runes, spells: v.spells, items: v.items, boots: v.boots }),
              { runes: !!v.runes, spells: true, items: true }
            )
          }
        />
      ))}
    </div>
  )
}

function VariantCard({
  index,
  variant: v,
  opponent,
  busy,
  disabled,
  onImport
}: {
  index: number
  variant: BuildVariant
  opponent: string | null
  busy: boolean
  disabled: boolean
  onImport: () => void
}) {
  return (
    <article className="rounded-xl border border-line bg-panel-2/50 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h4 className="font-display text-xl font-bold">
          Build {index + 1}{' '}
          <span className="text-base font-semibold text-soft">
            {v.games} game{v.games > 1 ? 's' : ''} · {pct(v.wins / v.games)} WR
            {opponent && v.vsOpponent > 0 && <span className="text-accent"> · {v.vsOpponent} contre {opponent}</span>}
          </span>
        </h4>
        <Button variant={index === 0 ? 'primary' : 'default'} disabled={disabled} onClick={onImport}>
          {busy ? 'Import…' : 'Importer ce build'}
        </Button>
      </header>
      <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        {v.runes ? (
          <RunePageRow page={v.runes} />
        ) : (
          <div className="flex items-center gap-2">
            <RuneIcon id={v.keystone} size={44} />
            <RuneIcon id={v.subStyle} size={26} />
            <span className="text-xs text-mute">page complète inconnue : runes non importées</span>
          </div>
        )}
        <div className="flex gap-1.5">
          {v.spells.map((id) => (
            <SpellIcon key={id} id={id} size={32} />
          ))}
        </div>
        <ItemRow ids={[...v.items, ...(v.boots ? [v.boots] : [])]} />
      </div>
      <ul className="mt-3 flex flex-col gap-0.5 text-xs text-mute">
        {v.examples.map((g, i) => (
          <li key={i}>
            <span className={g.win ? 'text-win' : 'text-loss'}>{g.win ? 'V' : 'D'}</span> {g.player.split('#')[0]} ({g.region}
            {g.tier ? `, ${g.tier.toLowerCase()}` : ''}) · {g.kills}/{g.deaths}/{g.assists}
            {g.opponent ? ` contre ${g.opponent}` : ''}
          </li>
        ))}
      </ul>
    </article>
  )
}

// ---------------- Petits blocs ----------------

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-display text-lg font-bold">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function Choice({ rank, games, winRate, children }: { rank: number; games: number; winRate: number; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-panel-2/50 px-3 py-2">
      <span className="num w-4 text-lg text-mute">{rank}</span>
      {children}
      <span className="ml-auto text-right text-sm text-soft">
        <span className="num text-base font-semibold text-ink">{pct(winRate)}</span> WR · {n(games)} games
      </span>
    </div>
  )
}

function ItemRow({ ids, size = 36 }: { ids: number[]; size?: number }) {
  return (
    <div className="flex items-center gap-1">
      {ids.map((id, i) => (
        <ItemIcon key={`${id}-${i}`} id={id} size={size} />
      ))}
    </div>
  )
}
