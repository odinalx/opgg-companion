import { useEffect, useRef, useState } from 'react'
import type { DraftResultDto } from '@shared/api'
import type { CriterionKey, DraftQueue, DraftSlot, DraftState, DraftWeights, Position, Settings, Suggestion } from '@shared/types'
import { CRITERIA, POSITIONS } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon, Splash } from '../components/Icons'
import { BuildPanel } from '../components/BuildPanel'
import { Button, Empty, Notice, PageHeader, Spinner } from '../components/ui'
import { positionLabel } from '../lib/format'

const CRITERION_LABELS: Record<CriterionKey, { name: string; help: string }> = {
  personal: { name: 'Winrate perso', help: 'Ton winrate sur le champion, lissé quand tu as peu de games.' },
  mastery: { name: 'Mastery', help: 'Tes points de maîtrise (client LoL requis).' },
  meta: { name: 'Méta', help: 'Winrate et tier du champion sur ton rôle, tous joueurs confondus.' },
  matchup: { name: 'Matchup', help: 'Winrate contre ton adversaire de lane, quand il est connu.' },
  synergy: { name: 'Synergie', help: 'Winrate en duo avec les champions de tes alliés.' }
}

const QUEUE_LABELS: Record<DraftQueue, { name: string; help: string }> = {
  solo: { name: 'Classée solo', help: 'tes games en solo uniquement' },
  flex: { name: 'Classée flex', help: 'tes games en solo et en flex' },
  other: { name: 'Autre file', help: 'selon le réglage « games prises en compte »' }
}

const COLOR_VAR: Record<CriterionKey, string> = {
  personal: 'var(--color-c-personal)',
  mastery: 'var(--color-c-mastery)',
  meta: 'var(--color-c-meta)',
  matchup: 'var(--color-c-matchup)',
  synergy: 'var(--color-c-synergy)'
}

const emptyDraft = (queue: DraftQueue = 'solo'): DraftState => ({
  queue,
  myPosition: null,
  allies: Array.from({ length: 4 }, () => ({ champion: null, position: null })),
  enemies: Array.from({ length: 5 }, () => ({ champion: null, position: null })),
  bans: [],
  pickedByMe: null,
  source: 'manual'
})

export function DraftPage() {
  const settings = useApp((s) => s.settings)!
  const updateSettings = useApp((s) => s.updateSettings)
  const [live, setLive] = useState<DraftState | null>(null)
  const [manual, setManual] = useState<DraftState>(emptyDraft)
  const [useLive, setUseLive] = useState(true)
  const [result, setResult] = useState<DraftResultDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const [viewBuild, setViewBuild] = useState<string | null>(null)

  useEffect(() => {
    void window.api.getLiveDraft().then(setLive)
    return window.api.onLiveDraft(setLive)
  }, [])

  const state = useLive && live ? live : manual

  // Recalcule les suggestions quand la composition ou les réglages changent.
  useEffect(() => {
    if (!state.myPosition) {
      setResult(null)
      return
    }
    const id = ++requestId.current
    const timer = setTimeout(() => {
      setLoading(true)
      window.api
        .suggest(state)
        .then((r) => {
          if (id !== requestId.current) return
          setResult(r)
          setError(null)
        })
        .catch((e) => id === requestId.current && setError((e as Error).message))
        .finally(() => id === requestId.current && setLoading(false))
    }, 350)
    return () => clearTimeout(timer)
  }, [JSON.stringify(state), JSON.stringify(settings.weights), settings.useModel, settings.candidatePool, settings.queueFilter])

  const isLive = useLive && !!live
  const [top, ...rest] = result?.suggestions ?? []
  // En direct, le champion sélectionné par le joueur ouvre son build ; sinon, celui demandé.
  const buildChampion = (isLive && state.pickedByMe) || viewBuild
  const showBuild = (c: string): void => {
    setViewBuild(c)
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <PageHeader
        title="Draft"
        subtitle={
          isLive
            ? `Sélection en cours : la composition se met à jour en direct. Winrate perso sur ${QUEUE_LABELS[state.queue].help}.`
            : `Simulation : renseigne ton rôle et les picks connus. Winrate perso sur ${QUEUE_LABELS[state.queue].help}.`
        }
      >
        {live && (
          <div className="flex rounded-xl border border-line bg-panel p-1 text-sm" role="group" aria-label="Source de la composition">
            <ModeButton active={useLive} onClick={() => setUseLive(true)}>
              En direct
            </ModeButton>
            <ModeButton active={!useLive} onClick={() => setUseLive(false)}>
              Simulation
            </ModeButton>
          </div>
        )}
        {isLive ? (
          <span className="rounded-xl border border-line bg-panel px-3.5 py-2 text-sm font-semibold" title={`Winrate perso calculé sur ${QUEUE_LABELS[state.queue].help}`}>
            {QUEUE_LABELS[state.queue].name}
          </span>
        ) : (
          <>
            <select
              aria-label="File de la partie"
              value={manual.queue}
              onChange={(e) => setManual({ ...manual, queue: e.target.value as DraftQueue })}
              className="field px-3 py-2 text-sm"
            >
              {(Object.keys(QUEUE_LABELS) as DraftQueue[]).map((q) => (
                <option key={q} value={q}>
                  {QUEUE_LABELS[q].name}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={() => setManual(emptyDraft(manual.queue))}>
              Vider la composition
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[18.5rem_minmax(0,1fr)_17.5rem]">
        <Composition state={state} readOnly={isLive} onChange={setManual} />

        <section aria-live="polite" className="min-w-0">
          {error && <Notice tone="error">{error}</Notice>}
          {buildChampion && state.myPosition && (
            <div className="mb-4">
              <BuildPanel
                champion={buildChampion}
                position={state.myPosition}
                opponent={result?.enemyLaner ?? null}
                locked={isLive && state.pickedByMe === buildChampion}
                onClose={isLive && state.pickedByMe ? undefined : () => setViewBuild(null)}
              />
            </div>
          )}
          {!state.myPosition ? (
            <Empty title="Choisis ton rôle">Les suggestions dépendent de la lane que tu joues.</Empty>
          ) : !result && loading ? (
            <Spinner label="Analyse du draft…" />
          ) : result && !top ? (
            <Empty title="Aucun champion à proposer">
              Élargis le pool de candidats dans le panneau de droite, ou vérifie les bans.
            </Empty>
          ) : result && top ? (
            <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              <TopPick
                s={top}
                weights={result.weightsUsed}
                enemyLaner={result.enemyLaner}
                usedModel={result.usedModel}
                onBuild={() => showBuild(top.champion)}
              />
              <SuggestionList suggestions={rest} weights={result.weightsUsed} onBuild={showBuild} />
              {result.warnings.map((w) => (
                <p key={w} className="text-sm text-mute">
                  {w}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <CriteriaPanel settings={settings} onChange={updateSettings} usedModel={result?.usedModel ?? false} />
      </div>
    </>
  )
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3.5 py-1.5 font-semibold ${active ? 'bg-panel-3 text-ink' : 'text-mute hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

// ---------------- Composition ----------------

function Composition({
  state,
  readOnly,
  onChange
}: {
  state: DraftState
  readOnly: boolean
  onChange: (s: DraftState) => void
}) {
  const champions = useApp((s) => s.staticData?.champions ?? [])
  const set = (patch: Partial<DraftState>): void => onChange({ ...state, ...patch })
  const setSlot = (side: 'allies' | 'enemies', i: number, slot: Partial<DraftSlot>): void =>
    set({ [side]: state[side].map((s, j) => (j === i ? { ...s, ...slot } : s)) })

  return (
    <section className="flex flex-col gap-4">
      <datalist id="champion-names">
        {champions.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      <div className="card overflow-hidden border-win/25">
        <div className="bg-gradient-to-b from-win/[0.12] to-transparent px-4 pt-4 pb-3">
          <h2 className="font-display text-xl font-bold text-win">Ton équipe</h2>
          <p className="mt-3 mb-1.5 text-sm text-soft">Ton rôle</p>
          <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Ton rôle">
            {POSITIONS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={state.myPosition === p}
                disabled={readOnly}
                onClick={() => set({ myPosition: p })}
                className={`rounded-lg py-1.5 text-[13px] font-semibold transition-colors ${
                  state.myPosition === p ? 'bg-accent text-night' : 'bg-panel-2 text-soft hover:text-ink'
                } disabled:cursor-default`}
              >
                {positionLabel(p)}
              </button>
            ))}
          </div>
        </div>
        <SlotList slots={state.allies} readOnly={readOnly} withPosition onChange={(i, s) => setSlot('allies', i, s)} />
      </div>

      <div className="card overflow-hidden border-loss/25">
        <div className="bg-gradient-to-b from-loss/[0.12] to-transparent px-4 pt-4 pb-1">
          <h2 className="font-display text-xl font-bold text-loss">Adversaires</h2>
        </div>
        <SlotList slots={state.enemies} readOnly={readOnly} onChange={(i, s) => setSlot('enemies', i, s)} />
      </div>

      <div className="card p-4">
        <h2 className="font-display text-lg font-bold">Bans</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {state.bans.map((b) => (
            <button
              key={b}
              disabled={readOnly}
              onClick={() => set({ bans: state.bans.filter((x) => x !== b) })}
              title={readOnly ? b : `Retirer ${b}`}
              className="relative"
            >
              <ChampIcon name={b} size={36} className="rounded-lg opacity-70 grayscale" />
              <span className="absolute inset-0 grid place-items-center" aria-hidden>
                <span className="h-0.5 w-10 rotate-45 bg-loss" />
              </span>
              <span className="sr-only">{b}</span>
            </button>
          ))}
          {state.bans.length === 0 && <p className="text-sm text-mute">Aucun ban.</p>}
        </div>
        {!readOnly && (
          <div className="mt-3 flex">
            <ChampionInput
              placeholder="Ajouter un ban"
              onPick={(c) => !state.bans.includes(c) && set({ bans: [...state.bans, c] })}
              clearOnPick
            />
          </div>
        )}
      </div>
    </section>
  )
}

function SlotList({
  slots,
  readOnly,
  withPosition,
  onChange
}: {
  slots: DraftSlot[]
  readOnly: boolean
  withPosition?: boolean
  onChange: (i: number, s: Partial<DraftSlot>) => void
}) {
  return (
    <ul className="flex flex-col gap-1 px-2 pb-3">
      {slots.map((s, i) => (
        <li key={i} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <ChampIcon name={s.champion} size={38} className="rounded-lg" />
          {readOnly ? (
            <span className={`min-w-0 flex-1 truncate ${s.champion ? 'font-semibold' : 'text-mute'}`}>
              {s.champion ?? 'En attente…'}
            </span>
          ) : (
            <ChampionInput value={s.champion} placeholder="Champion" onPick={(c) => onChange(i, { champion: c || null })} />
          )}
          {withPosition &&
            (readOnly ? (
              <span className="text-xs text-mute">{positionLabel(s.position)}</span>
            ) : (
              <select
                aria-label={`Rôle de l'allié ${i + 1}`}
                value={s.position ?? ''}
                onChange={(e) => onChange(i, { position: (e.target.value || null) as Position | null })}
                className="field w-[4.5rem] px-1.5 py-1.5 text-xs"
              >
                <option value="">Auto</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {positionLabel(p)}
                  </option>
                ))}
              </select>
            ))}
        </li>
      ))}
    </ul>
  )
}

function ChampionInput({
  value,
  placeholder,
  onPick,
  clearOnPick
}: {
  value?: string | null
  placeholder: string
  onPick: (champion: string) => void
  clearOnPick?: boolean
}) {
  const champions = useApp((s) => s.staticData?.champions ?? [])
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])

  const commit = (v: string): void => {
    const match = champions.find((c) => c.name.toLowerCase() === v.trim().toLowerCase())
    if (match) {
      onPick(match.name)
      if (clearOnPick) setText('')
    } else if (!v.trim() && !clearOnPick) onPick('')
  }

  return (
    <input
      list="champion-names"
      value={text}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => {
        setText(e.target.value)
        // Sélection dans la liste : validée immédiatement.
        if (champions.some((c) => c.name === e.target.value)) commit(e.target.value)
      }}
      onBlur={() => commit(text)}
      onKeyDown={(e) => e.key === 'Enter' && commit(text)}
      className="field min-w-0 flex-1 px-3 py-1.5 text-sm"
    />
  )
}

// ---------------- Suggestions ----------------

/** Contribution de chaque critère actif au score : la somme des segments vaut le score. */
function segments(s: Suggestion, weights: DraftWeights) {
  const counted = CRITERIA.filter((k) => weights[k].enabled && weights[k].weight > 0 && s.components[k].value !== null)
  const den = counted.reduce((a, k) => a + weights[k].weight, 0) || 1
  return counted.map((k) => ({ k, width: ((weights[k].weight * (s.components[k].value ?? 0)) / den) * 100 }))
}

function ScoreBar({ s, weights, thick }: { s: Suggestion; weights: DraftWeights; thick?: boolean }) {
  return (
    <div className={`flex gap-[2px] overflow-hidden rounded-full bg-white/[0.06] ${thick ? 'h-3' : 'h-2'}`} aria-hidden>
      {segments(s, weights).map(({ k, width }) => (
        <div key={k} style={{ width: `${width}%`, background: COLOR_VAR[k] }} title={CRITERION_LABELS[k].name} />
      ))}
    </div>
  )
}

function TopPick({
  s,
  weights,
  enemyLaner,
  usedModel,
  onBuild
}: {
  s: Suggestion
  weights: DraftWeights
  enemyLaner: string | null
  usedModel: boolean
  onBuild: () => void
}) {
  return (
    <article className="hero">
      <Splash name={s.champion} />
      <div className="flex min-h-[300px] flex-col justify-end gap-5 p-7">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="font-semibold text-accent">
              Meilleur choix{enemyLaner ? ` face à ${enemyLaner}` : ''}
              {usedModel ? ' · poids appris sur ton historique' : ''}
            </p>
            <h2 className="font-display text-7xl leading-[0.9] font-bold tracking-tight">{s.champion}</h2>
            <p className="mt-3 max-w-xl text-soft">{s.summary}</p>
            <div className="mt-4">
              <Button onClick={onBuild}>Voir le build</Button>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="num text-8xl leading-[0.8] font-bold text-accent">{Math.round(s.score)}</p>
            <p className="mt-2 text-sm text-soft">score sur 100</p>
          </div>
        </div>
        <div className="max-w-2xl">
          <ScoreBar s={s} weights={weights} thick />
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {CRITERIA.filter((k) => weights[k].enabled && s.components[k].value !== null).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_VAR[k] }} />
                <span className="text-soft">{CRITERION_LABELS[k].name}</span>
                <span className="num text-base font-semibold">{Math.round((s.components[k].value ?? 0) * 100)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}

function SuggestionList({
  suggestions,
  weights,
  onBuild
}: {
  suggestions: Suggestion[]
  weights: DraftWeights
  onBuild: (champion: string) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  if (!suggestions.length) return null
  return (
    <ol className="card divide-y divide-line/70 overflow-hidden">
      {suggestions.map((s, i) => (
        <SuggestionRow
          key={s.champion}
          s={s}
          rank={i + 2}
          weights={weights}
          open={open === s.champion}
          onToggle={() => setOpen(open === s.champion ? null : s.champion)}
          onBuild={() => onBuild(s.champion)}
        />
      ))}
    </ol>
  )
}

function SuggestionRow({
  s,
  rank,
  weights,
  open,
  onToggle,
  onBuild
}: {
  s: Suggestion
  rank: number
  weights: DraftWeights
  open: boolean
  onToggle: () => void
  onBuild: () => void
}) {
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-panel-2/60">
        <span className="num w-5 text-center text-lg text-mute">{rank}</span>
        <ChampIcon name={s.champion} size={46} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <p className="font-display text-2xl leading-none font-bold">{s.champion}</p>
            <p className="min-w-0 truncate text-sm text-mute">{s.summary}</p>
          </div>
          <div className="mt-2">
            <ScoreBar s={s} weights={weights} />
          </div>
        </div>
        <p className="num w-14 text-right text-4xl leading-none font-bold">{Math.round(s.score)}</p>
      </button>
      {open && (
        <div className="mb-3 ml-[4.75rem] w-[calc(100%-6rem)]">
        <table className="w-full text-sm">
          <caption className="sr-only">Détail du score de {s.champion}</caption>
          <tbody>
            {CRITERIA.map((k) => {
              const c = s.components[k]
              const off = !weights[k].enabled || weights[k].weight === 0
              return (
                <tr key={k} className={`border-t border-line/60 ${off ? 'opacity-45' : ''}`}>
                  <td className="w-40 py-1.5 pr-3">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_VAR[k] }} />
                    {CRITERION_LABELS[k].name}
                  </td>
                  <td className="num w-12 text-right text-base">{c.value === null ? '—' : Math.round(c.value * 100)}</td>
                  <td className="pl-4 text-soft">
                    {c.label}
                    {off && ' (désactivé)'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-2">
          <Button variant="ghost" onClick={onBuild}>
            Voir le build de {s.champion}
          </Button>
        </div>
        </div>
      )}
    </li>
  )
}

// ---------------- Critères ----------------

function CriteriaPanel({
  settings,
  onChange,
  usedModel
}: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => Promise<void>
  usedModel: boolean
}) {
  const setCriterion = (k: CriterionKey, patch: Partial<DraftWeights[CriterionKey]>): void =>
    void onChange({ weights: { ...settings.weights, [k]: { ...settings.weights[k], ...patch } } })

  return (
    <aside className="card flex flex-col gap-5 self-start p-5">
      <div>
        <h2 className="font-display text-xl font-bold">Critères</h2>
        <p className="mt-0.5 text-sm text-mute">Active ce qui compte pour toi et règle son poids.</p>
      </div>
      {CRITERIA.map((k) => {
        const c = settings.weights[k]
        return (
          <div key={k}>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={c.enabled}
                onChange={(e) => setCriterion(k, { enabled: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_VAR[k] }} aria-hidden />
              {CRITERION_LABELS[k].name}
              <span className="num ml-auto text-base text-mute">{c.enabled ? c.weight : 'off'}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={c.weight}
              disabled={!c.enabled || usedModel}
              onChange={(e) => setCriterion(k, { weight: Number(e.target.value) })}
              aria-label={`Poids : ${CRITERION_LABELS[k].name}`}
              className="mt-1 w-full accent-[var(--color-accent)] disabled:opacity-40"
            />
            <p className="text-xs text-mute">{CRITERION_LABELS[k].help}</p>
          </div>
        )
      })}
      {usedModel && (
        <p className="text-xs text-mute">
          Les poids viennent du modèle entraîné sur ton historique. Désactive-le dans les réglages pour les régler à la main.
        </p>
      )}
      <div className="border-t border-line pt-4">
        <label className="text-sm font-semibold" htmlFor="pool">
          Champions proposés
        </label>
        <select
          id="pool"
          value={settings.candidatePool}
          onChange={(e) => void onChange({ candidatePool: e.target.value as Settings['candidatePool'] })}
          className="field mt-1.5 w-full px-2.5 py-2 text-sm"
        >
          <option value="played">Ceux que je joue</option>
          <option value="owned">Tous ceux que je possède</option>
          <option value="all">Toute la méta du rôle</option>
        </select>
      </div>
    </aside>
  )
}
