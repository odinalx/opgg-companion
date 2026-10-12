// Découverte du client LoL (LCU) : port + token d'authentification.
// 1. Ligne de commande du process LeagueClientUx.exe (fiable, ne dépend pas du dossier d'install).
// 2. Fichier lockfile dans les dossiers d'installation habituels.
// LCU_LOCKFILE permet de pointer vers un lockfile arbitraire (mock de dev sous Linux).

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface LcuCredentials {
  port: number
  password: string
  protocol: 'https' | 'http'
}

/** Format : "LeagueClient:<pid>:<port>:<password>:<protocol>" */
export function parseLockfile(content: string): LcuCredentials | null {
  const parts = content.trim().split(':')
  if (parts.length < 5) return null
  const port = Number(parts[2])
  if (!Number.isInteger(port) || port <= 0) return null
  return { port, password: parts[3], protocol: parts[4] === 'http' ? 'http' : 'https' }
}

/**
 * Dossier d'installation lu dans la ligne de commande du client, dont les arguments sont
 * souvent entre guillemets : "--install-directory=C:\Riot Games\League of Legends" "--app-name=…"
 */
export function parseInstallDir(cmd: string): string | null {
  return /--install-directory=([^"]+?)"?(?=\s+"?--|\s*$)/m.exec(cmd)?.[1]?.trim() ?? null
}

export function parseCommandLine(cmd: string): LcuCredentials | null {
  const port = /--app-port=["']?(\d+)/.exec(cmd)?.[1]
  const token = /--remoting-auth-token=["']?([\w-]+)/.exec(cmd)?.[1]
  if (!port || !token) return null
  return { port: Number(port), password: token, protocol: 'https' }
}

const DEFAULT_LOCKFILES = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile'
]
const RIOT_INSTALLS = 'C:\\ProgramData\\Riot Games\\RiotClientInstalls.json'

/** Le scan des process (PowerShell) coûte cher : au plus une fois par minute. */
export const PROCESS_SCAN_INTERVAL_MS = 60_000
let lastProcessScan = 0
/** Dossiers d'installation de LoL connus (trouvés une fois, réutilisés ensuite). */
const knownDirs = new Set<string>()

/**
 * Dossiers d'installation déclarés par le Riot Client : RiotClientInstalls.json associe
 * chaque jeu installé à son dossier (clé "associated_client").
 */
export function installDirsFromRiotInstalls(json: string): string[] {
  try {
    const data = JSON.parse(json)
    return Object.keys(data?.associated_client ?? {}).filter((dir) => /league of legends/i.test(dir))
  } catch {
    return []
  }
}

let riotInstallsRead = false
function readRiotInstalls(): void {
  if (riotInstallsRead || process.platform !== 'win32') return
  riotInstallsRead = true
  try {
    for (const dir of installDirsFromRiotInstalls(readFileSync(RIOT_INSTALLS, 'utf8'))) knownDirs.add(dir)
  } catch {
    // fichier absent : lockfiles par défaut et scan des process
  }
}

async function fromProcess(): Promise<LcuCredentials | null> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine"
      ],
      { windowsHide: true, timeout: 5000 }
    )
    // Le dossier d'install est mémorisé : les détections suivantes passent par le lockfile.
    const dir = parseInstallDir(stdout)
    if (dir) knownDirs.add(dir)
    const creds = parseCommandLine(stdout)
    if (creds) return creds
    if (dir) return fromLockfile(join(dir, 'lockfile'))
  } catch {
    // PowerShell indisponible : on reste sur les lockfiles.
  }
  return null
}

function fromLockfile(path: string): LcuCredentials | null {
  try {
    if (!existsSync(path)) return null
    return parseLockfile(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Cherche le client LoL. Appelée toutes les quelques secondes : les vérifications coûteuses
 * sont espacées, les lockfiles (simple lecture de fichier) sont testés à chaque fois.
 */
export async function discoverClient(now = Date.now()): Promise<LcuCredentials | null> {
  const override = process.env.LCU_LOCKFILE
  if (override) return fromLockfile(override)
  readRiotInstalls()
  for (const p of [...[...knownDirs].map((d) => join(d, 'lockfile')), ...DEFAULT_LOCKFILES]) {
    const creds = fromLockfile(p)
    if (creds) return creds
  }
  if (now - lastProcessScan < PROCESS_SCAN_INTERVAL_MS) return null
  lastProcessScan = now
  return fromProcess()
}
