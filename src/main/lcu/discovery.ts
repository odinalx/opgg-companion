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
    const creds = parseCommandLine(stdout)
    if (creds) return creds
    // Le dossier d'install donne accès au lockfile si les args sont tronqués.
    const dir = /--install-directory=["']?([^"']+?)["']?\s--/.exec(stdout)?.[1]
    if (dir) return fromLockfile(join(dir, 'lockfile'))
  } catch {
    // PowerShell indisponible : on tente les lockfiles.
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

export async function discoverClient(): Promise<LcuCredentials | null> {
  const override = process.env.LCU_LOCKFILE
  if (override) return fromLockfile(override)
  const proc = await fromProcess()
  if (proc) return proc
  for (const p of DEFAULT_LOCKFILES) {
    const creds = fromLockfile(p)
    if (creds) return creds
  }
  return null
}
