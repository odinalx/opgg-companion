import { useEffect, useState } from 'react'
import type { DisplayInfo, ModelInfo, OverlayMetric, OverlaySettings, Region } from '@shared/types'
import { CRITERIA, OVERLAY_METRICS, REGIONS } from '@shared/types'
import { useApp } from '../store'
import { Button, Notice, PageHeader } from '../components/ui'
import { pct } from '../lib/format'

const NAMES = { personal: 'Winrate perso', mastery: 'Mastery', meta: 'Méta', matchup: 'Matchup', synergy: 'Synergie' }

export function SettingsPage() {
  const { settings, updateSettings, status } = useApp()
  const s = settings!
  const manual = s.manualAccount
  const [riotId, setRiotId] = useState(manual ? `${manual.gameName}#${manual.tagLine}` : '')
  const [region, setRegion] = useState<Region>(manual?.region ?? s.region)
  const [gameName, tagLine] = riotId.split('#').map((x) => x?.trim())

  return (
    <>
      <PageHeader title="Réglages" subtitle="Compte, données prises en compte et modèle de draft." />
      <div className="flex max-w-2xl flex-col gap-10">
        <section>
          <h2 className="font-display text-2xl font-bold">Compte</h2>
          {status.connected && status.account ? (
            <p className="mt-1 text-sm text-mute">
              Compte détecté dans le client : {status.account.gameName}#{status.account.tagLine} ({status.account.region}). Il est
              prioritaire sur le compte saisi ci-dessous.
            </p>
          ) : (
            <p className="mt-1 text-sm text-mute">Client LoL fermé : le compte saisi ci-dessous est utilisé.</p>
          )}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void updateSettings(
                gameName && tagLine
                  ? { region, manualAccount: { gameName, tagLine, region } }
                  : { manualAccount: null }
              )
            }}
          >
            <input
              value={riotId}
              onChange={(e) => setRiotId(e.target.value)}
              placeholder="Pseudo#TAG"
              aria-label="Riot ID"
              className="field flex-1 px-3 py-2"
            />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
              aria-label="Région"
              className="field px-2.5"
            >
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <Button type="submit">Enregistrer</Button>
          </form>
          <div className="mt-3 flex gap-2">
            {!status.connected && (
              <Button variant="primary" onClick={() => void window.api.launchRiotClient().catch(() => undefined)}>
                Se connecter avec Riot
              </Button>
            )}
            {manual && (
              <Button
                variant="ghost"
                onClick={() => {
                  setRiotId('')
                  void window.api.signOut().then(() => updateSettings({}))
                }}
              >
                Oublier ce Riot ID
              </Button>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">Games prises en compte</h2>
          <p className="mt-1 text-sm text-mute">Pour les stats et le winrate perso du draft helper.</p>
          <div className="mt-3 flex gap-4 text-sm">
            {(['ranked', 'all'] as const).map((q) => (
              <label key={q} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="queue"
                  checked={s.queueFilter === q}
                  onChange={() => void updateSettings({ queueFilter: q })}
                  className="accent-[var(--color-accent)]"
                />
                {q === 'ranked' ? 'Classées (solo et flex)' : 'Toutes les files'}
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">Import du build</h2>
          <p className="mt-1 text-sm text-soft">
            Quand tu verrouilles ton champion, l'app peut créer la page de runes OP.GG et choisir les sorts recommandés dans
            le client. Flash reste sur ta touche habituelle.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.autoImport}
              onChange={(e) => void updateSettings({ autoImport: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Importer automatiquement runes et sorts au verrouillage du champion
          </label>
        </section>

        <OverlaySection />

        <ModelSection useModel={s.useModel} onToggle={(v) => void updateSettings({ useModel: v })} />

        <section className="text-sm text-mute">
          <h2 className="font-display text-2xl font-bold text-ink">Sources</h2>
          <p className="mt-1">
            Statistiques et historiques : OP.GG MCP. Compte, mastery et sélection en direct : client League of Legends local
            (lecture ; seuls les imports de runes, sorts et sets d'items que tu demandes y écrivent). Icônes : Riot Data Dragon.
          </p>
        </section>
      </div>
    </>
  )
}

function ModelSection({ useModel, onToggle }: { useModel: boolean; onToggle: (v: boolean) => void }) {
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [training, setTraining] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.getModel().then(setModel)
    return window.api.onTrainProgress(setProgress)
  }, [])

  const train = async (): Promise<void> => {
    setTraining(true)
    setError(null)
    setProgress(null)
    try {
      setModel(await window.api.trainModel())
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '\w+': (Error: )?/, ''))
    } finally {
      setTraining(false)
    }
  }

  return (
    <section>
      <h2 className="font-display text-2xl font-bold">Poids appris sur ton historique</h2>
      <p className="mt-1 text-sm text-mute">
        Une régression logistique apprend quels critères comptent le plus dans tes victoires, à partir d'au moins 50 games
        classées. Elle remplace alors les curseurs du draft helper.
      </p>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" onClick={() => void train()} disabled={training}>
          {training ? 'Entraînement…' : model ? 'Réentraîner' : 'Entraîner'}
        </Button>
        {training && progress && (
          <span className="text-sm text-mute">
            Analyse des games : {progress.done}/{progress.total}
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useModel}
            disabled={!model}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Utiliser ces poids
        </label>
      </div>
      {model && (
        <div className="card mt-4 p-5 text-sm">
          <p className="text-mute">
            Entraîné sur {model.samples} games le {new Date(model.trainedAt).toLocaleDateString('fr-FR')}. Précision en
            validation croisée : <span className="text-ink">{pct(model.accuracy)}</span> (référence sans modèle :{' '}
            {pct(model.baseline)}).
          </p>
          {model.accuracy <= model.baseline && (
            <p className="mt-1 text-mute">
              Le modèle ne prédit pas mieux que la référence : garde plutôt les poids manuels pour l'instant.
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-1.5">
            {CRITERIA.map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="w-28">{NAMES[k]}</span>
                <div className="h-2 flex-1 rounded bg-panel-2">
                  <div className="h-2 rounded bg-accent" style={{ width: `${model.weights[k]}%` }} />
                </div>
                <span className="num w-10 text-right text-base">{model.weights[k]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const METRIC_LABELS: Record<OverlayMetric, string> = {
  cs: 'CS par minute et écart avec la médiane de ton elo',
  vision: 'Score de vision par minute et écart avec la médiane de ton elo',
  gold: 'Or estimé par minute',
  kp: 'Participation aux kills'
}

function OverlaySection() {
  const { settings, updateSettings } = useApp()
  const o = settings!.overlay
  const set = (patch: Partial<OverlaySettings>): void => void updateSettings({ overlay: { ...o, ...patch } })
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [inGame, setInGame] = useState(false)
  useEffect(() => {
    void window.api.getDisplays().then(setDisplays)
    const check = () => void window.api.isInGame().then(setInGame)
    check()
    const t = setInterval(check, 3000)
    return () => clearInterval(t)
  }, [])

  return (
    <section>
      <h2 className="font-display text-2xl font-bold">Overlay en jeu</h2>
      <p className="mt-1 text-sm text-soft">
        Tes stats et le build OP.GG pendant la partie, par-dessus le jeu ou dans une fenêtre sur un autre écran. L'overlay
        demande LoL en mode d'affichage « Sans bordure » (en plein écran, Windows le masque) ; la fenêtre séparée marche
        dans tous les modes. Les dégâts par minute ne sont pas fournis par le jeu pendant la partie.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={o.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        Activer l'overlay
      </label>
      <fieldset disabled={!o.enabled} className="mt-4 grid grid-cols-1 gap-5 disabled:opacity-50 sm:grid-cols-2">
        <div>
          <legend className="mb-2 text-sm text-mute">Stats affichées</legend>
          {OVERLAY_METRICS.map((m) => (
            <label key={m} className="flex items-center gap-2 py-0.5 text-sm">
              <input
                type="checkbox"
                checked={o.metrics[m]}
                onChange={(e) => set({ metrics: { ...o.metrics, [m]: e.target.checked } })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              {METRIC_LABELS[m]}
            </label>
          ))}
          <label className="flex items-center gap-2 py-0.5 text-sm">
            <input
              type="checkbox"
              checked={o.goldDiffOnTab}
              onChange={(e) => set({ goldDiffOnTab: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Écart d'or par lane sur le tableau des scores (Tab)
          </label>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-mute">Affichage pendant la partie</span>
            <select value={o.mode} onChange={(e) => set({ mode: e.target.value as OverlaySettings['mode'] })} className="field w-full px-2.5 py-2">
              <option value="overlay">Overlay par-dessus le jeu</option>
              <option value="window">Fenêtre séparée (second écran)</option>
            </select>
          </label>
          {o.mode === 'window' && (
            <label className="text-sm">
              <span className="mb-1 block text-mute">Écran</span>
              <select
                value={o.displayId ?? ''}
                onChange={(e) => set({ displayId: e.target.value ? Number(e.target.value) : null })}
                className="field w-full px-2.5 py-2"
              >
                <option value="">Écran principal</option>
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({d.width}×{d.height}){d.primary ? ' · principal' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {o.mode === 'overlay' && (
            <div>
              <span className="mb-1 block text-sm text-mute">Position des éléments</span>
              <Button disabled={!inGame} onClick={() => void window.api.setOverlayEditing(true)}>
                Déplacer les éléments
              </Button>
              <p className="mt-1.5 text-xs text-mute">
                En partie, chaque stat se place à la souris ({o.editKey.replace('Control', 'Ctrl').replaceAll('+', ' + ')} depuis le
                jeu).
              </p>
            </div>
          )}
          <HotkeyInput label="Afficher / masquer l'overlay" value={o.toggleKey} onChange={(toggleKey) => set({ toggleKey })} />
          <HotkeyInput label="Afficher le build" value={o.buildKey} onChange={(buildKey) => set({ buildKey })} />
          {o.mode === 'overlay' && (
            <HotkeyInput label="Déplacer les éléments" value={o.editKey} onChange={(editKey) => set({ editKey })} />
          )}
        </div>
      </fieldset>

      {o.enabled && o.goldDiffOnTab && o.mode === 'overlay' && <ScoreboardCalibration o={o} set={set} />}
    </section>
  )
}

/**
 * Calage des écarts d'or sur le tableau des scores : la taille du tableau dépend de la
 * résolution. En jeu, coche « afficher en continu » puis aligne les chiffres sur la ligne
 * centrale du tableau (Tab) avec les curseurs ; l'overlay se met à jour en direct.
 */
function ScoreboardCalibration({ o, set }: { o: OverlaySettings; set: (p: Partial<OverlaySettings>) => void }) {
  const sb = o.scoreboard
  const setSb = (patch: Partial<OverlaySettings['scoreboard']>): void => set({ scoreboard: { ...sb, ...patch } })
  const slider = (label: string, key: 'x' | 'y' | 'spacing', min: number, max: number, step: number) => (
    <label className="text-sm">
      <span className="flex justify-between text-mute">
        {label} <span className="num text-base text-soft">{sb[key].toFixed(1)} %</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sb[key]}
        onChange={(e) => setSb({ [key]: Number(e.target.value) })}
        className="w-full accent-[var(--color-accent)]"
      />
    </label>
  )
  return (
    <div className="card mt-5 p-4">
      <h3 className="font-display text-lg font-bold">Position sur le tableau des scores</h3>
      <p className="mt-1 text-sm text-soft">
        À régler une fois : en partie, ouvre le tableau (Tab) avec « afficher en continu » coché, déplace le groupe de
        chiffres sur la ligne centrale (bouton « Déplacer les éléments »), puis ajuste l'écart entre les lignes.
      </p>
      <div className="mt-3 max-w-sm">{slider('Écart entre lignes', 'spacing', 3, 12, 0.1)}</div>
      <div className="mt-3 flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={sb.calibrate} onChange={(e) => setSb({ calibrate: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
          Afficher en continu (pour régler)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={sb.swapSides} onChange={(e) => setSb({ swapSides: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
          Mon équipe est à droite du tableau
        </label>
        <button className="text-mute underline-offset-2 hover:text-ink hover:underline" onClick={() => setSb({ x: 50, y: 38, spacing: 6.2 })}>
          Position par défaut
        </button>
      </div>
    </div>
  )
}

/** Champ qui enregistre la combinaison de touches pressée (format des raccourcis Electron). */
/** Nom de touche au format des raccourcis Electron, selon la disposition du clavier (AZERTY compris). */
function acceleratorKey(e: React.KeyboardEvent): string | null {
  if (/^[a-z0-9]$/i.test(e.key)) return e.key.toUpperCase()
  if (e.code.startsWith('Digit')) return e.code.slice(5) // chiffres de la rangée du haut, même en AZERTY
  if (e.key === ' ') return 'Space'
  const named: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }
  if (named[e.key]) return named[e.key]
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) return e.key
  if (/^[;,./\\'`[\]=-]$/.test(e.key)) return e.key
  return null
}

/** Champ qui enregistre la combinaison de touches pressée et prévient si elle est inutilisable. */
function HotkeyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <label className="text-sm">
      <span className="mb-1 block text-mute">{label}</span>
      <input
        readOnly
        value={recording ? 'Appuie sur la combinaison…' : value.replace('Control', 'Ctrl').replaceAll('+', ' + ')}
        onFocus={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          e.preventDefault()
          if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return
          if (e.key === 'Escape') return (e.target as HTMLInputElement).blur()
          const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean)
          if (!mods.length) return // un raccourci global sans modificateur gênerait la partie
          const key = acceleratorKey(e)
          if (!key) return setError('Touche non prise en charge, choisis-en une autre.')
          const accel = [...mods, key].join('+')
          ;(e.target as HTMLInputElement).blur()
          void window.api.checkShortcut(accel).then((problem) => {
            setError(problem)
            if (!problem) onChange(accel)
          })
        }}
        className={`field w-full cursor-pointer px-3 py-2 ${error ? 'border-loss' : ''}`}
      />
      {error && <span className="mt-1 block text-xs text-loss">{error}</span>}
    </label>
  )
}
