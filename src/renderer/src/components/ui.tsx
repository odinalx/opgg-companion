import type { ReactNode } from 'react'

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  )
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'default'
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'primary'
}) {
  const styles =
    variant === 'primary'
      ? 'bg-gold text-night hover:brightness-110'
      : 'border border-line bg-panel hover:bg-panel-2 text-ink'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3.5 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <div
      className={`mb-4 rounded-md border px-4 py-3 text-sm ${
        tone === 'error' ? 'border-loss/40 bg-loss/10 text-[#f3b4b6]' : 'border-line bg-panel text-mute'
      }`}
    >
      {children}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-mute">{children}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-mute" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-gold" />
      {label ?? 'Chargement…'}
    </div>
  )
}
