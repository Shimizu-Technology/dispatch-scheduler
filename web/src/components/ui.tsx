import type { ReactNode } from 'react'

function badgeClass(kind: string) {
  const value = kind.toLowerCase()
  if (value.includes('p1') || value.includes('level 1')) return 'bg-red-100 text-red-800 border-red-200'
  if (value.includes('p2')) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (value.includes('p3')) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  if (value.includes('approved')) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (value.includes('waiting')) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (value.includes('assessment')) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (value.includes('pm')) return 'bg-purple-100 text-purple-800 border-purple-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export function Badge({ children, kind = '' }: { children: ReactNode; kind?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold capitalize ${badgeClass(kind || String(children))}`}>{children}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>
}
