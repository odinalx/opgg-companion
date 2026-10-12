import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DiskCache, JsonFile } from './store'

const dir = () => mkdtempSync(join(tmpdir(), 'opgg-store-'))

describe('DiskCache', () => {
  it('sert la valeur en cache tant que le TTL court, et ne charge qu’une fois les appels simultanés', async () => {
    const cache = new DiskCache(join(dir(), 'cache.json'))
    let calls = 0
    const load = async () => ++calls
    const [a, b] = await Promise.all([cache.wrap('k', 60_000, load), cache.wrap('k', 60_000, load)])
    expect([a, b, calls]).toEqual([1, 1, 1])
    expect(await cache.wrap('k', 60_000, load)).toBe(1)
  })

  it('retire les entrées les plus anciennes au-delà du plafond', async () => {
    const path = join(dir(), 'cache.json')
    const cache = new DiskCache(path, 3)
    for (let i = 0; i < 5; i++) {
      await cache.wrap(`k${i}`, 60_000, async () => i)
      await new Promise((r) => setTimeout(r, 2))
    }
    cache.prune()
    cache.flush()
    expect(Object.keys(JSON.parse(readFileSync(path, 'utf8')))).toEqual(['k4', 'k3', 'k2'])
  })
})

describe('JsonFile', () => {
  it('garde une copie .bak d’un fichier illisible et repart des valeurs par défaut', () => {
    const path = join(dir(), 'settings.json')
    writeFileSync(path, '{ coupé')
    const f = new JsonFile(path, { ok: true })
    expect(f.get()).toEqual({ ok: true })
    expect(readFileSync(`${path}.bak`, 'utf8')).toBe('{ coupé')
  })
})
