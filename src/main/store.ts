// Stockage local en fichiers JSON (dossier userData d'Electron).
// Le volume est faible (quelques centaines de games), un vrai SGBD n'apporte rien
// et un module natif compliquerait le build Windows.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export class JsonFile<T> {
  private value: T
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly path: string,
    fallback: T,
    private readonly saveDelayMs = 500
  ) {
    try {
      this.value = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      // Fichier illisible (écriture interrompue…) : on le garde de côté plutôt que de l'écraser.
      if (existsSync(path)) {
        try {
          copyFileSync(path, `${path}.bak`)
        } catch {
          /* sauvegarde impossible : on repart quand même des valeurs par défaut */
        }
      }
      this.value = fallback
    }
  }

  get(): T {
    return this.value
  }

  set(value: T): void {
    this.value = value
    this.scheduleSave()
  }

  update(fn: (v: T) => T): T {
    this.set(fn(this.value))
    return this.value
  }

  private scheduleSave(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), this.saveDelayMs)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const tmp = `${this.path}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(this.value))
      renameSync(tmp, this.path) // écriture atomique
    } catch {
      // Fichier verrouillé un instant (antivirus, sauvegarde…) : on réessaie plus tard sans planter l'app.
      try {
        unlinkSync(tmp)
      } catch {
        /* pas de fichier temporaire */
      }
      this.scheduleSave()
    }
  }
}

interface CacheEntry {
  t: number
  v: unknown
}

/** Cache clé/valeur persistant avec TTL par appel. */
export class DiskCache {
  private readonly file: JsonFile<Record<string, CacheEntry>>
  private readonly inflight = new Map<string, Promise<unknown>>()
  private writes = 0

  /**
   * @param maxEntries plafond d'entrées : au-delà, les plus anciennes sont retirées.
   * Le fichier est réécrit en entier à chaque sauvegarde : les écritures sont regroupées (5 s).
   */
  constructor(
    path: string,
    private readonly maxEntries = 1500
  ) {
    this.file = new JsonFile(path, {}, 5000)
    this.prune()
  }

  async wrap<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.file.get()[key]
    if (hit && Date.now() - hit.t < ttlMs) return hit.v as T
    const pending = this.inflight.get(key)
    if (pending) return pending as Promise<T>
    const p = load()
      .then((v) => {
        // Mutation en place : copier tout le cache à chaque ajout coûterait cher quand il grossit.
        this.file.get()[key] = { t: Date.now(), v }
        if (++this.writes % 100 === 0) this.prune()
        this.file.set(this.file.get())
        return v
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }

  get size(): number {
    return Object.keys(this.file.get()).length
  }

  /** Retire les entrées de plus de 7 jours, puis les plus anciennes au-delà du plafond. */
  prune(): void {
    const limit = Date.now() - 7 * 24 * 3600_000
    const entries = Object.entries(this.file.get()).filter(([, e]) => e.t > limit)
    entries.sort((a, b) => b[1].t - a[1].t)
    const kept = entries.slice(0, this.maxEntries)
    if (kept.length !== Object.keys(this.file.get()).length) this.file.set(Object.fromEntries(kept))
  }

  flush(): void {
    this.file.flush()
  }
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

export function dataPath(dir: string, name: string): string {
  return join(ensureDir(dir), name)
}
