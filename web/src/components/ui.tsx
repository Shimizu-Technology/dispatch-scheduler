import type { ReactNode } from 'react'

function badgeClass(kind: string) {
  const value = kind.toLowerCase()
  if (value.includes('p1') || value.includes('level 1')) return 'border-red-200 bg-red-50 text-red-800'
  if (value.includes('p2')) return 'border-orange-200 bg-orange-50 text-orange-800'
  if (value.includes('p3')) return 'border-yellow-200 bg-yellow-50 text-yellow-800'
  if (value.includes('approved')) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (value.includes('waiting')) return 'border-amber-200 bg-amber-50 text-amber-800'
  if (value.includes('assessment')) return 'border-sky-200 bg-sky-50 text-sky-800'
  if (value.includes('pm')) return 'border-cyan-200 bg-cyan-50 text-cyan-900'
  return 'border-stone-200 bg-stone-50 text-stone-700'
}

export function Badge({ children, kind = '' }: { children: ReactNode; kind?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] ${badgeClass(kind || String(children))}`}>{children}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[1.7rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/88 shadow-[0_18px_60px_rgba(20,36,40,0.09)] backdrop-blur ${className}`}>{children}</section>
}

export function PanelHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-4 border-b border-[rgba(16,35,42,0.1)] bg-gradient-to-r from-white/70 to-transparent p-5 sm:flex-row sm:items-start sm:justify-between">
    <div>
      {eyebrow && <p className="font-display text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-cyan-700">{eyebrow}</p>}
      <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight text-[#10232a]">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5c6b70]">{description}</p>
    </div>
    {action}
  </div>
}
