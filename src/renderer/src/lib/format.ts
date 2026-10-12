export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`

export const kda = (k: number, d: number, a: number): string => (d === 0 ? 'Parfait' : ((k + a) / d).toFixed(2))

export function duration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - Date.parse(iso)) / 1000
  if (diff < 3600) return `il y a ${Math.max(1, Math.round(diff / 60))} min`
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`
  const days = Math.round(diff / 86400)
  return days === 1 ? 'hier' : `il y a ${days} jours`
}

const QUEUE_LABELS: Record<string, string> = {
  SOLORANKED: 'Classée solo',
  FLEXRANKED: 'Classée flex',
  NORMAL: 'Normale',
  ARAM: 'ARAM',
  ARENA: 'Arena',
  URF: 'URF',
  OTHER: 'Autre'
}
export const queueLabel = (q: string): string => QUEUE_LABELS[q] ?? q

const POSITION_LABELS: Record<string, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  adc: 'ADC',
  support: 'Support'
}
export const positionLabel = (p: string | null): string => (p ? (POSITION_LABELS[p] ?? p) : '—')

export const wrColor = (wr: number): string => (wr >= 0.6 ? 'text-gold' : wr >= 0.5 ? 'text-win' : 'text-loss')

export function tierLabel(tier: string | null, division: number | null, lp: number | null): string {
  if (!tier) return 'Non classé'
  const t = tier.charAt(0) + tier.slice(1).toLowerCase()
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)
  return `${t}${apex || !division ? '' : ' ' + division}${lp !== null ? ` · ${lp} LP` : ''}`
}
