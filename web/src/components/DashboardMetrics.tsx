import type { ReactNode } from 'react'
import { AlertTriangle, CalendarDays, LayoutDashboard, MapPin, Users, Wrench } from 'lucide-react'
import type { Dashboard, WorkOrder } from '../types'

function Metric({ icon, label, value, danger = false }: { icon: ReactNode; label: string; value?: number; danger?: boolean }) {
  return <article className={`group relative overflow-hidden rounded-2xl border bg-white/92 p-4 shadow-[0_14px_34px_rgba(23,32,51,0.07)] backdrop-blur transition duration-200 hover:-translate-y-0.5 ${danger ? 'border-red-200' : 'border-[rgba(23,32,51,0.1)]'}`}>
    <div className={`absolute inset-x-0 top-0 h-1 ${danger ? 'bg-[#d84332]' : 'bg-[#244393]'}`} />
    <div className={`relative mb-4 inline-flex rounded-xl p-2.5 ${danger ? 'bg-red-50 text-red-700' : 'bg-[#e8eefc] text-[#244393]'}`}>{icon}</div>
    <div className="font-display tabular relative text-3xl font-extrabold tracking-tight text-[#172033]">{value ?? 0}</div>
    <div className="relative mt-1 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">{label}</div>
  </article>
}

export function DashboardMetrics({ dashboard, workOrders }: { dashboard: Dashboard | null; workOrders: WorkOrder[] }) {
  return <section className="soft-reveal-delay grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
    <Metric icon={<LayoutDashboard />} label="Open WOs" value={dashboard?.counts.open_work_orders} />
    <Metric icon={<Wrench />} label="Needs Assessment" value={dashboard?.counts.needs_assessment} />
    <Metric icon={<CalendarDays />} label="PM Due" value={dashboard?.counts.pm_due} />
    <Metric icon={<Users />} label="Crews" value={dashboard?.counts.available_teams} />
    <Metric icon={<AlertTriangle />} label="Driver Issues" value={dashboard?.counts.driver_warnings} danger={Boolean(dashboard?.counts.driver_warnings)} />
    <Metric icon={<MapPin />} label="Regions" value={new Set(workOrders.map((w) => w.region)).size} />
  </section>
}
