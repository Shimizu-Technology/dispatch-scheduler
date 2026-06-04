import type { ReactNode } from 'react'

function badgeClass(kind: string) {
  const value = kind.toLowerCase()
  if (value.includes('p1') || value.includes('level 1')) return 'border-red-200 bg-red-50 text-red-800'
  if (value.includes('p2')) return 'border-orange-200 bg-orange-50 text-orange-800'
  if (value.includes('p3')) return 'border-yellow-200 bg-yellow-50 text-yellow-800'
  if (value.includes('approved')) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (value.includes('waiting')) return 'border-amber-200 bg-amber-50 text-amber-800'
  if (value.includes('progress') || value.includes('scheduled')) return 'border-indigo-200 bg-indigo-50 text-indigo-800'
  if (value.includes('carry')) return 'border-purple-200 bg-purple-50 text-purple-800'
  if (value.includes('completed')) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (value.includes('cancelled') || value.includes('closed')) return 'border-slate-300 bg-slate-100 text-slate-700'
  if (value.includes('assessment')) return 'border-blue-200 bg-blue-50 text-blue-800'
  if (value.includes('pm')) return 'border-indigo-200 bg-indigo-50 text-indigo-900'
  if (value.includes('admin') || value.includes('dispatcher') || value.includes('viewer')) return 'border-blue-200 bg-[#e8eefc] text-[#244393]'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export function Badge({ children, kind = '' }: { children: ReactNode; kind?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] ${badgeClass(kind || String(children))}`}>{children}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[1.25rem] border border-[rgba(23,32,51,0.11)] bg-white/94 shadow-[0_14px_38px_rgba(23,32,51,0.065)] backdrop-blur ${className}`}>{children}</section>
}

export function PanelHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-4 border-b border-[rgba(23,32,51,0.1)] bg-gradient-to-r from-[#f8faff] to-white p-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      {eyebrow && <p className="font-display text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[#244393]">{eyebrow}</p>}
      <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight text-[#172033]">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#526071]">{description}</p>
    </div>
    {action}
  </div>
}
