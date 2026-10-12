import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[2.75rem] leading-none font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-soft">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  )
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'default',
  type
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'primary' | 'ghost'
  type?: 'button' | 'submit'
}) {
  const styles = {
    primary: 'bg-accent text-night hover:brightness-110 shadow-[0_0_24px_-4px_rgb(34_227_255/0.6)]',
    default: 'border border-line bg-panel-2 text-ink hover:bg-panel-3',
    ghost: 'text-soft hover:text-ink hover:bg-panel-2'
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`mb-4 flex gap-3 rounded-xl border px-4 py-3 text-sm ${
        tone === 'error' ? 'border-loss/35 bg-loss/10 text-[#ffc2c6]' : 'border-line bg-panel text-soft'
      }`}
    >
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'error' ? 'bg-loss' : 'bg-accent'}`} />
      <div>{children}</div>
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <p className="font-display text-2xl font-bold">{title}</p>
      {children && <div className="mt-2 max-w-md text-soft">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-soft" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label ?? 'Chargement…'}
    </div>
  )
}

/** Titre de section à l'intérieur d'une carte. */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
      <h2 className="font-display text-xl font-bold">{children}</h2>
      {aside && <div className="text-sm text-mute">{aside}</div>}
    </div>
  )
}

/** Barre victoires/défaites avec pourcentage. */
export function WrBar({ wins, games, className = '' }: { wins: number; games: number; className?: string }) {
  const wr = wins / Math.max(1, games)
  return (
    <div className={`flex items-center gap-2.5 ${className}`} title={`${wins} victoires sur ${games} games`}>
      <div className="flex h-1.5 flex-1 gap-[2px] overflow-hidden rounded-full">
        <div className="rounded-l-full bg-win" style={{ width: `${wr * 100}%` }} />
        <div className="flex-1 rounded-r-full bg-loss/60" />
      </div>
      <span className={`num w-10 text-right text-base font-semibold ${wr >= 0.6 ? 'text-accent' : wr >= 0.5 ? 'text-win' : 'text-loss'}`}>
        {Math.round(wr * 100)}%
      </span>
    </div>
  )
}
