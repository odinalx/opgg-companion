import { contextBridge, ipcRenderer } from 'electron'
import type { Api, ApiMethod } from '@shared/api'

const methods: ApiMethod[] = [
  'getStatic',
  'getClientStatus',
  'getSettings',
  'setSettings',
  'currentAccount',
  'getProfile',
  'getMatches',
  'getMatchDetail',
  'getStats',
  'getLiveDraft',
  'suggest',
  'getModel',
  'trainModel',
  'openExternal',
  'getBuild',
  'importBuild',
  'getOverlayState',
  'setOverlayEditing',
  'isInGame',
  'getMatchupBuild',
  'getProBuilds',
  'importBuildData',
  'getDisplays',
  'launchRiotClient',
  'signOut'
]

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = Object.fromEntries(methods.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(m, ...args)])) as Pick<
  Api,
  ApiMethod
>

contextBridge.exposeInMainWorld('api', {
  ...api,
  onClientStatus: (cb) => subscribe('client:status', cb),
  onLiveDraft: (cb) => subscribe('draft:live', cb),
  onTrainProgress: (cb) => subscribe('model:progress', cb),
  onAutoImport: (cb) => subscribe('build:auto-imported', cb),
  onOverlayStats: (cb) => subscribe('overlay:stats', cb),
  onOverlayUi: (cb) => subscribe('overlay:ui', cb),
  onOverlaySettings: (cb) => subscribe('overlay:settings', cb)
} satisfies Api)
