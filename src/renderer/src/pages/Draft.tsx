import { useEffect, useRef, useState } from 'react'
import type { DraftResultDto } from '@shared/api'
import type { CriterionKey, DraftSlot, DraftState, DraftWeights, Position, Settings, Suggestion } from '@shared/types'
import { CRITERIA, POSITIONS } from '@shared/types'
import { useApp } from '../store'
import { ChampIcon } from '../components/Icons'
import { Button, Empty, Notice, PageHeader, Spinner } from '../components/ui'
import { positionLabel } from '../lib/format'

const CRITERION_LABELS: Record<CriterionKey, { name: string; help: string }> = {
  personal: { name: 'Winrate perso', help: 'Ton winrate sur le champion, lissé quand tu as peu de games.' },
  mastery: { name: 'Mastery', help: 'Tes points de maîtrise (client LoL requis).' },
  meta: { name: 'Méta', help: 'Winrate et tier du champion sur ton rôle, tous joueurs confondus.' },
  matchup: { name: 'Matchup', help: 'Winrate contre ton adversaire de lane, quand il est connu.' },
  synergy: { name: 'Synergie', help: 'Winrate en duo avec les champions de tes alliés.' }
}

const COLOR_VAR: Record<CriterionKey, string> = {
  personal: 'var(--color-c-personal)',
  mastery: 'var(--color-c-mastery)',
  meta: 'var(--color-c-meta)',
  matchup: 'var(--color-c-matchup)',
  synergy: 'var(--color-c-synergy)'
}

const emptyDraft = (): DraftState => ({
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

  return (
    <>
      <PageHeader title="Draft">
        {live && (
          <div className="flex rounded-md border border-line p-0.5 text-sm" role="group" aria-label="Source de la composition">
            <ModeButton active={useLive} onClick={() => setUseLive(true)}>
              Champ select en direct
            </ModeButton>
            <ModeButton active={!useLive} onClick={() => setUseLive(false)}>
              Simulation
            </ModeButton>
          </div>
        )}
        {!isLive && (
          <Button onClick={() => setManual(emptyDraft())}>Vider la composition</Button>
        )}
      </PageHeader>

      {!live && (
        <Notice>
          Mode simulation : renseigne ton rôle et les champions déjà choisis. Pendant une vraie sélection, la composition se
          remplit toute seule.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[19rem_minmax(0,1fr)_17rem]">
        <Composition state={state} readOnly={isLive} onChange={setManual} />

        <section aria-live="polite">
          {error && <Notice tone="error">{error}</Notice>}
          {result?.warnings.map((w) => (
            <Notice key={w}>{w}</Notice>
          ))}
          {!state.myPosition ? (
            <Empty title="Choisis ton rôle">Les suggestions dépendent de la lane que tu joues.</Empty>
          ) : !result && loading ? (
            <Spinner label="Analyse du draft…" />
          ) : result && result.suggestions.length === 0 ? (
            <Empty title="Aucun champion à proposer">
              Élargis le pool de candidats dans le panneau de droite, ou vérifie les champions bannis.
            </Empty>
          ) : result ? (
            <SuggestionList result={result} loading={loading} />
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
      className={`rounded px-3 py-1 font-semibold ${active ? 'bg-panel-2 text-ink' : 'text-mute hover:text-ink'}`}
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
    <section className="flex flex-col gap-5">
      <datalist id="champion-names">
        {champions.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      <div>
        <h2 className="mb-2 font-display text-lg font-semibold">Ton rôle</h2>
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Ton rôle">
          {POSITIONS.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={state.myPosition === p}
              disabled={readOnly}
              onClick={() => set({ myPosition: p })}
              className={`rounded-md border py-1.5 text-sm font-semibold ${
                state.myPosition === p ? 'border-gold bg-gold/15 text-gold' : 'border-line text-mute hover:text-ink'
              } disabled:cursor-default`}
            >
              {positionLabel(p)}
            </button>
          ))}
        </div>
      </div>

      <SlotGroup
        title="Alliés"
        slots={state.allies}
        readOnly={readOnly}
        withPosition
        onChange={(i, s) => setSlot('allies', i, s)}
      />
      <SlotGroup title="Adversaires" slots={state.enemies} readOnly={readOnly} onChange={(i, s) => setSlot('enemies', i, s)} />

      <div>
        <h2 className="mb-2 font-display text-lg font-semibold">Bans</h2>
        <div className="flex flex-wrap gap-1.5">
          {state.bans.map((b) => (
            <button
              key={b}
              disabled={readOnly}
              onClick={() => set({ bans: state.bans.filter((x) => x !== b) })}
              title={readOnly ? b : `Retirer ${b}`}
              className="flex items-center gap-1.5 rounded-md border border-line bg-panel py-0.5 pr-2 pl-0.5 text-sm"
            >
              <ChampIcon name={b} size={22} className="grayscale" />
              {b}
            </button>
          ))}
          {state.bans.length === 0 && <p className="text-sm text-mute">Aucun ban.</p>}
        </div>
        {!readOnly && (
          <ChampionInput
            placeholder="Ajouter un ban"
            onPick={(c) => !state.bans.includes(c) && set({ bans: [...state.bans, c] })}
            clearOnPick
          />
        )}
      </div>
    </section>
  )
}

function SlotGroup({
  title,
  slots,
  readOnly,
  withPosition,
  onChange
}: {
  title: string
  slots: DraftSlot[]
  readOnly: boolean
  withPosition?: boolean
  onChange: (i: number, s: Partial<DraftSlot>) => void
}) {
  return (
    <div>
      <h2 className="mb-2 font-display text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1.5">
        {slots.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <ChampIcon name={s.champion} size={32} />
            {readOnly ? (
              <span className={`flex-1 text-sm ${s.champion ? 'font-semibold' : 'text-mute'}`}>
                {s.champion ?? 'En attente'}
              </span>
            ) : (
              <ChampionInput value={s.champion} placeholder="Champion" onPick={(c) => onChange(i, { champion: c || null })} />
            )}
            {withPosition && (
              <select
                aria-label={`Rôle de l'allié ${i + 1}`}
                disabled={readOnly}
                value={s.position ?? ''}
                onChange={(e) => onChange(i, { position: (e.target.value || null) as Position | null })}
                className="w-20 rounded-md border border-line bg-panel px-1.5 py-1 text-xs disabled:appearance-none"
              >
                <option value="">Auto</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {positionLabel(p)}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    </div>
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
      className="mt-0 min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 py-1 text-sm outline-none focus:border-gold"
    />
  )
}

// ---------------- Suggestions ----------------

function SuggestionList({ result, loading }: { result: DraftResultDto; loading: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const active = CRITERIA.filter((k) => result.weightsUsed[k].enabled && result.weightsUsed[k].weight > 0)
  return (
    <div className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">Suggestions</h2>
        <p className="text-sm text-mute">
          {result.enemyLaner ? `Face à ${result.enemyLaner}` : 'Adversaire de lane inconnu'}
          {result.usedModel && ' · poids appris sur ton historique'}
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {result.suggestions.map((s, i) => (
          <SuggestionRow
            key={s.champion}
            s={s}
            rank={i + 1}
            weights={result.weightsUsed}
            active={active}
            open={open === s.champion}
            onToggle={() => setOpen(open === s.champion ? null : s.champion)}
          />
        ))}
      </ol>
    </div>
  )
}

function SuggestionRow({
  s,
  rank,
  weights,
  active,
  open,
  onToggle
}: {
  s: Suggestion
  rank: number
  weights: DraftWeights
  active: CriterionKey[]
  open: boolean
  onToggle: () => void
}) {
  // Contribution de chaque critère au score final : la somme des segments = le score.
  const counted = active.filter((k) => s.components[k].value !== null)
  const den = counted.reduce((a, k) => a + weights[k].weight, 0) || 1
  const segments = counted.map((k) => ({ k, width: ((weights[k].weight * (s.components[k].value ?? 0)) / den) * 100 }))

  return (
    <li className={`rounded-lg border bg-panel ${rank === 1 ? 'border-gold/60' : 'border-line'}`}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 px-4 py-3 text-left">
        <span className="num w-5 text-lg text-mute">{rank}</span>
        <ChampIcon name={s.champion} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-2xl leading-none font-semibold">{s.champion}</p>
            <p className="num text-3xl leading-none font-bold text-gold">{Math.round(s.score)}</p>
          </div>
          <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-panel-2" aria-hidden>
            {segments.map(({ k, width }) => (
              <div key={k} style={{ width: `${width}%`, background: COLOR_VAR[k] }} title={CRITERION_LABELS[k].name} />
            ))}
          </div>
          <p className="mt-1.5 truncate text-sm text-mute">{s.summary}</p>
        </div>
      </button>
      {open && (
        <table className="mx-4 mb-3 w-[calc(100%-2rem)] text-sm">
          <caption className="sr-only">Détail du score de {s.champion}</caption>
          <tbody>
            {CRITERIA.map((k) => {
              const c = s.components[k]
              const off = !active.includes(k)
              return (
                <tr key={k} className={`border-t border-line/60 ${off ? 'opacity-45' : ''}`}>
                  <td className="py-1.5 pr-3">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_VAR[k] }} />
                    {CRITERION_LABELS[k].name}
                  </td>
                  <td className="num w-14 text-right text-base">{c.value === null ? '—' : Math.round(c.value * 100)}</td>
                  <td className="pl-4 text-mute">
                    {c.label}
                    {off && ' (désactivé)'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
    <aside className="flex flex-col gap-4 self-start rounded-lg border border-line bg-panel p-4">
      <h2 className="font-display text-lg font-semibold">Critères</h2>
      {CRITERIA.map((k) => {
        const c = settings.weights[k]
        return (
          <div key={k}>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={c.enabled}
                onChange={(e) => setCriterion(k, { enabled: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-gold)]"
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
              className="mt-1 w-full accent-[var(--color-gold)] disabled:opacity-40"
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
      <div className="border-t border-line pt-3">
        <label className="text-sm font-semibold" htmlFor="pool">
          Champions proposés
        </label>
        <select
          id="pool"
          value={settings.candidatePool}
          onChange={(e) => void onChange({ candidatePool: e.target.value as Settings['candidatePool'] })}
          className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm"
        >
          <option value="played">Ceux que je joue</option>
          <option value="owned">Tous ceux que je possède</option>
          <option value="all">Toute la méta du rôle</option>
        </select>
      </div>
    </aside>
  )
}
