// Lecture de l'état d'une touche sous Windows (GetAsyncKeyState), sans intercepter la touche :
// la partie continue de recevoir Tab normalement. Ailleurs, renvoie toujours false.

import { createRequire } from 'node:module'

const VK_TAB = 0x09
let getAsyncKeyState: ((vk: number) => number) | null | undefined

function load(): ((vk: number) => number) | null {
  if (getAsyncKeyState !== undefined) return getAsyncKeyState
  getAsyncKeyState = null
  if (process.platform !== 'win32') return null
  try {
    const koffi = createRequire(import.meta.url)('koffi')
    const user32 = koffi.load('user32.dll')
    getAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)')
  } catch {
    getAsyncKeyState = null
  }
  return getAsyncKeyState ?? null
}

export function isTabDown(): boolean {
  const fn = load()
  return !!fn && (fn(VK_TAB) & 0x8000) !== 0
}
