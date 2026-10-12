// Stockage local en fichiers JSON (dossier userData d'Electron).
// Le volume est faible (quelques centaines de games), un vrai SGBD n'apporte rien
// et un module natif compliquerait le build Windows.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export class JsonFile<T> {
  private value: T
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly path: string,
    fallback: T
  ) {
    try {
      this.value = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
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
    this.timer = setTimeout(() => this.flush(), 500)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(this.value))
    renameSync(tmp, this.path) // écriture atomique
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

  constructor(path: string) {
    this.file = new JsonFile(path, {})
    this.prune()
  }

  async wrap<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.file.get()[key]
    if (hit && Date.now() - hit.t < ttlMs) return hit.v as T
    const pending = this.inflight.get(key)
    if (pending) return pending as Promise<T>
    const p = load()
      .then((v) => {
        this.file.update((all) => ({ ...all, [key]: { t: Date.now(), v } }))
        return v
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }

  /** Supprime les entrées de plus de 7 jours pour borner la taille du fichier. */
  private prune(): void {
    const limit = Date.now() - 7 * 24 * 3600_000
    const all = this.file.get()
    const kept = Object.fromEntries(Object.entries(all).filter(([, e]) => e.t > limit))
    if (Object.keys(kept).length !== Object.keys(all).length) this.file.set(kept)
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
