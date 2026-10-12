import { create } from 'zustand'
import type { StaticDataDto } from '@shared/api'
import type { ClientStatus, RiotAccount, Settings } from '@shared/types'

export type Page = 'profile' | 'matches' | 'stats' | 'draft' | 'settings'

interface AppState {
  page: Page
  staticData: StaticDataDto | null
  status: ClientStatus
  account: RiotAccount | null
  settings: Settings | null
  setPage(p: Page): void
  init(): Promise<void>
  refreshAccount(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  page: 'profile',
  staticData: null,
  status: { connected: false },
  account: null,
  settings: null,
  setPage: (page) => set({ page }),
  async init() {
    const [status, settings, account] = await Promise.all([
      window.api.getClientStatus(),
      window.api.getSettings(),
      window.api.currentAccount()
    ])
    set({ status, settings, account })
    window.api.getStatic().then((staticData) => set({ staticData }), () => undefined)
    window.api.onSettings((settings) => set({ settings }))
    window.api.onClientStatus((s) => {
      set({ status: s })
      void get().refreshAccount()
    })
    // Le client entre en champ select : on bascule une fois sur le draft helper.
    let inChampSelect = !!(await window.api.getLiveDraft())
    window.api.onLiveDraft((d) => {
      if (d && !inChampSelect) set({ page: 'draft' })
      inChampSelect = !!d
    })
  },
  async refreshAccount() {
    const account = await window.api.currentAccount()
    const cur = get().account
    if (account?.gameName !== cur?.gameName || account?.tagLine !== cur?.tagLine || account?.region !== cur?.region)
      set({ account })
  },
  async updateSettings(patch) {
    const settings = await window.api.setSettings(patch)
    set({ settings })
    await get().refreshAccount()
  }
}))
