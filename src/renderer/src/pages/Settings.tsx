import { useEffect, useState } from 'react'
import type { ModelInfo, Region } from '@shared/types'
import { CRITERIA, REGIONS } from '@shared/types'
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
