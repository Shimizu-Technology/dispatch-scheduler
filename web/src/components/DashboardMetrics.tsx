import type { ReactNode } from 'react'
import { AlertTriangle, CalendarDays, LayoutDashboard, MapPin, Users, Wrench } from 'lucide-react'
import type { Dashboard, WorkOrder } from '../types'

function Metric({ icon, label, value, danger = false }: { icon: ReactNode; label: string; value?: number; danger?: boolean }) {
  return <article className={`group relative overflow-hidden rounded-[1.35rem] border bg-[#fffdf7]/85 p-4 shadow-[0_14px_40px_rgba(16,35,42,0.07)] backdrop-blur transition duration-200 hover:-translate-y-0.5 ${danger ? 'border-red-200' : 'border-[rgba(16,35,42,0.1)]'}`}>
    <div className={`absolute right-[-1.5rem] top-[-1.5rem] h-16 w-16 rounded-full blur-2xl ${danger ? 'bg-red-300/40' : 'bg-cyan-300/40'}`} />
    <div className={`relative mb-4 inline-flex rounded-2xl p-2.5 ${danger ? 'bg-red-50 text-red-700' : 'bg-cyan-50 text-cyan-800'}`}>{icon}</div>
    <div className="font-display relative text-3xl font-extrabold tracking-tight text-[#10232a]">{value ?? 0}</div>
    <div className="relative mt-1 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-[#6b777b]">{label}</div>
  </article>
}

export function DashboardMetrics({ dashboard, workOrders }: { dashboard: Dashboard | null; workOrders: WorkOrder[] }) {
  return <section className="soft-reveal-delay grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
    <Metric icon={<LayoutDashboard />} label="Open WOs" value={dashboard?.counts.open_work_orders} />
    <Metric icon={<Wrench />} label="Needs Assessment" value={dashboard?.counts.needs_assessment} />
    <Metric icon={<CalendarDays />} label="PM Due" value={dashboard?.counts.pm_due} />
    <Metric icon={<Users />} label="Teams" value={dashboard?.counts.available_teams} />
    <Metric icon={<AlertTriangle />} label="Driver Warnings" value={dashboard?.counts.driver_warnings} danger={Boolean(dashboard?.counts.driver_warnings)} />
    <Metric icon={<MapPin />} label="Regions" value={new Set(workOrders.map((w) => w.region)).size} />
  </section>
}
