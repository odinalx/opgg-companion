// "Se connecter avec Riot" : ouvre le Riot Client officiel sur League of Legends.
// L'utilisateur s'identifie dans la fenêtre de Riot ; une fois le client LoL lancé,
// le connecteur LCU détecte le compte. Aucun identifiant ne transite par l'application.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const INSTALLS_JSON = 'C:\\ProgramData\\Riot Games\\RiotClientInstalls.json'
const FALLBACKS = [
  'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
  'D:\\Riot Games\\Riot Client\\RiotClientServices.exe'
]

export function findRiotClient(): string | null {
  try {
    const installs = JSON.parse(readFileSync(INSTALLS_JSON, 'utf8'))
    for (const key of ['rc_default', 'rc_live']) {
      const p = installs[key]
      if (typeof p === 'string' && existsSync(p)) return p
    }
  } catch {
    // fichier absent : on tente les emplacements par défaut
  }
  return FALLBACKS.find((p) => existsSync(p)) ?? null
}

export function launchRiotClient(): void {
  if (process.platform !== 'win32') throw new Error('Le Riot Client ne peut être lancé que sous Windows.')
  const exe = findRiotClient()
  if (!exe) throw new Error("Riot Client introuvable. Installe League of Legends ou saisis ton Riot ID.")
  spawn(exe, ['--launch-product=league_of_legends', '--launch-patchline=live'], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}
