import type { ReactNode } from 'react'
import { AlertTriangle, CalendarDays, LayoutDashboard, MapPin, Users, Wrench } from 'lucide-react'
import { Card } from './ui'
import type { Dashboard, WorkOrder } from '../types'

function Metric({ icon, label, value, danger = false }: { icon: ReactNode; label: string; value?: number; danger?: boolean }) {
  return <Card className="p-4">
    <div className={`mb-3 inline-flex rounded-xl p-2 ${danger ? 'bg-red-100 text-red-700' : 'bg-cyan-100 text-cyan-700'}`}>{icon}</div>
    <div className="text-2xl font-black text-slate-950">{value ?? 0}</div>
    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
  </Card>
}

export function DashboardMetrics({ dashboard, workOrders }: { dashboard: Dashboard | null; workOrders: WorkOrder[] }) {
  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
    <Metric icon={<LayoutDashboard />} label="Open WOs" value={dashboard?.counts.open_work_orders} />
    <Metric icon={<Wrench />} label="Needs Assessment" value={dashboard?.counts.needs_assessment} />
    <Metric icon={<CalendarDays />} label="PM Due" value={dashboard?.counts.pm_due} />
    <Metric icon={<Users />} label="Teams" value={dashboard?.counts.available_teams} />
    <Metric icon={<AlertTriangle />} label="Driver Warnings" value={dashboard?.counts.driver_warnings} danger={Boolean(dashboard?.counts.driver_warnings)} />
    <Metric icon={<MapPin />} label="Regions" value={new Set(workOrders.map((w) => w.region)).size} />
  </section>
}
