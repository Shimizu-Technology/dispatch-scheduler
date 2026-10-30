import type { ReactNode } from 'react'

function badgeClass(kind: string) {
  const value = kind.toLowerCase()
  if (value.includes('p1') || value.includes('level 1')) return 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-ink)]'
  if (value.includes('p2')) return 'border-[var(--urgent-border)] bg-[var(--urgent-soft)] text-[var(--urgent-ink)]'
  if (value.includes('p3')) return 'border-[var(--routine-border)] bg-[var(--routine-soft)] text-[var(--routine-ink)]'
  if (value.includes('approved')) return 'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)]'
  if (value.includes('waiting')) return 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-text)]'
  if (value.includes('progress') || value.includes('scheduled')) return 'border-[var(--scheduled-border)] bg-[var(--scheduled-soft)] text-[var(--scheduled-ink)]'
  if (value.includes('carry')) return 'border-[var(--carry-border)] bg-[var(--carry-soft)] text-[var(--carry-ink)]'
  if (value.includes('completed')) return 'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)]'
  if (value.includes('cancelled') || value.includes('closed')) return 'border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--neutral-ink)]'
  if (value.includes('assessment')) return 'border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info-ink)]'
  if (value.includes('pm')) return 'border-[var(--scheduled-border)] bg-[var(--scheduled-soft)] text-[var(--scheduled-ink-strong)]'
  if (value.includes('admin') || value.includes('dispatcher') || value.includes('viewer')) return 'border-[var(--info-border)] bg-[var(--jmi-blue-soft)] text-[var(--jmi-blue)]'
  return 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--neutral-ink)]'
}

export function Badge({ children, kind = '' }: { children: ReactNode; kind?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold  tracking-normal ${badgeClass(kind || String(children))}`}>{children}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[var(--line)] bg-[var(--paper)] ${className}`}>{children}</section>
}

export function PanelHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-[var(--line)] bg-[var(--paper)] p-3 sm:p-4 2xl:flex-row 2xl:items-start 2xl:justify-between 2xl:gap-5">
    <div className="min-w-0 2xl:max-w-2xl">
      {eyebrow && eyebrow.toLowerCase() !== title.toLowerCase() && <p className="font-display text-xs font-extrabold  tracking-normal text-[var(--jmi-blue)] sm:text-xs tracking-normal">{eyebrow}</p>}
      <h2 className="font-display mt-1 text-lg font-extrabold tracking-tight text-[var(--ink)] sm:text-xl">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--ink-soft)] sm:leading-6">{description}</p>
    </div>
    {action && <div className="min-w-0 w-full 2xl:w-auto 2xl:flex-1">{action}</div>}
  </div>
}
