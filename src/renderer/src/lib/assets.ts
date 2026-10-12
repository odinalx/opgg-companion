import { useApp } from '../store'

export const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export const useStatic = () => useApp((s) => s.staticData)
