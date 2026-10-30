import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, Clock3, FileText, FolderKanban, ListChecks, Radio, ShieldCheck, Users, Wrench } from 'lucide-react'
import { Card, PanelHeader } from './ui'
import { workOrderViewQuery, type WorkOrderView } from '../lib/workOrderViews'
import type { AuditEvent, Dashboard, DispatchSchedule, PmTask, Team, Technician, WorkOrder } from '../types'

type Props = {
  dashboard: Dashboard | null; workOrders: WorkOrder[]; teams: Team[]; technicians: Technician[]; pmTasks: PmTask[]
  schedule: DispatchSchedule | null; auditEvents: AuditEvent[]; canEdit: boolean; working: boolean
  loading?: boolean; loadError?: string; onRetry?: () => void
  onGoToSection: (section: 'work-orders' | 'pa-projects' | 'teams' | 'dispatch' | 'pm-tasks' | 'whatsapp' | 'activity') => void
  onDateChange?: (date: string) => void
  onOpenWorkOrders: (query: string) => void
}
type Tone = 'blue' | 'red' | 'amber' | 'steel'
function Metric({ label, value, detail, icon, tone = 'steel', onClick }: { label: string; value?: number | string; detail?: string; icon: ReactNode; tone?: Tone; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`dashboard-metric metric-${tone} flex min-h-24 w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-left`}>
    <span aria-hidden="true" className="mt-1 text-[var(--ink-soft)]">{icon}</span>
    <span className="min-w-0"><span className="tabular block text-2xl font-bold text-[var(--ink)]">{value ?? '—'}</span><span className="block text-sm font-semibold text-[var(--ink-soft)]">{label}</span>{detail && <span className="mt-1 block text-xs text-[var(--ink-soft)]">{detail}</span>}</span>
  </button>
}

export function DashboardMetrics({ dashboard, teams, technicians, schedule, auditEvents, canEdit, working, loading = false, loadError = '', onRetry, onDateChange, onGoToSection, onOpenWorkOrders }: Props) {
  // Dashboard totals come from its complete server scope, never the current queue page.
  if (loading || !dashboard) return <section aria-label="Operations overview" className="space-y-3">
    {loadError ? <div role="alert" className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning-ink-strong)]"><p>Operations data is unavailable. {loadError}</p><button type="button" onClick={onRetry} className="mt-2 min-h-11 rounded-xl border border-[var(--warning-border-strong)] bg-[var(--paper)] px-3 font-bold">Retry dashboard</button></div> : <><p role="status" className="text-sm text-[var(--ink-soft)]">Loading operations overview...</p><div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{['Open', 'Overdue', 'Waiting parts', 'PA projects'].map((label) => <div key={label} className="min-h-24 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3"><span className="block text-2xl">—</span><span className="text-sm text-[var(--ink-soft)]">{label}</span></div>)}</div></>}
  </section>
  const c = dashboard.counts
  const openView = (view: WorkOrderView) => () => onOpenWorkOrders(workOrderViewQuery(view, dashboard.date))
  const driverIssues = teams.filter((team) => !team.has_driver).length
  const callOuts = technicians.filter((tech) => tech.active && tech.availability === 'unavailable')
  const queueMetrics: Array<{ label: string; value?: number; view: WorkOrderView; detail?: string; icon: ReactNode; urgent?: boolean }> = [
    { label: 'Open work orders', value: c.open_work_orders, detail: `${c.high_priority_open_work_orders ?? '—'} high priority`, view: 'open', icon: <Wrench size={18} /> },
    { label: 'Overdue', value: c.sla_overdue, view: 'overdue', icon: <AlertTriangle size={18} />, urgent: true },
    { label: 'Waiting parts', value: c.waiting_for_parts, view: 'waiting', icon: <Clock3 size={18} /> },
    { label: 'PA projects', value: c.pa_projects, view: 'pa', icon: <FolderKanban size={18} /> },
    { label: 'Waiting approval', value: c.waiting_for_approval, view: 'approval', icon: <ShieldCheck size={18} /> },
    { label: 'Needs assessment', value: c.needs_assessment, detail: `${c.unscheduled_approved ?? '—'} approved without date`, view: 'assessment', icon: <Clock3 size={18} /> },
    { label: 'Due soon', value: c.sla_due_soon, view: 'dueSoon', icon: <Clock3 size={18} /> },
    { label: 'KPI missing', value: c.sla_missing, view: 'missing', icon: <ShieldCheck size={18} /> },
    { label: 'Follow-up due', value: c.follow_up_due_today, view: 'followUp', icon: <Clock3 size={18} /> },
    { label: 'Corrective maintenance', value: c.corrective_maintenance, view: 'cm', icon: <Wrench size={18} /> },
    { label: 'Estimates', value: c.estimate_required, view: 'estimates', icon: <FileText size={18} /> },
    { label: 'Parts ETA', value: c.parts_eta_due_soon, view: 'partsEta', icon: <Clock3 size={18} /> },
  ]
  return <section className="space-y-4">
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold text-[var(--ink)]">Queue health</h2>{onDateChange ? <label className="inline-flex items-center gap-2 text-sm">As of<input aria-label="As of date" type="date" value={dashboard.date} onChange={(event) => { if (event.target.value) onDateChange(event.target.value) }} className="field-control rounded-xl px-2 py-1" /></label> : <p className="text-sm text-[var(--ink-soft)]">As of {dashboard.date}</p>}</div>
      {loadError && <p role="alert" className="mb-3 text-sm text-[var(--warning-ink-strong)]">Refresh failed. Showing the last loaded overview. <button type="button" onClick={onRetry} className="min-h-11 underline">Retry dashboard</button></p>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">{queueMetrics.map((metric) => <Metric key={metric.view} {...metric} tone={metric.urgent && (metric.value ?? 0) > 0 ? 'red' : 'steel'} onClick={openView(metric.view)} />)}</div>
    </div>
    <Card className="overflow-hidden">
      <PanelHeader title="Dispatch and crews" description="Plan the selected day after reviewing incoming work." action={<button type="button" disabled={working} onClick={() => onGoToSection('dispatch')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-sm font-bold text-[var(--jmi-blue)]">{canEdit ? 'Open dispatch' : 'Review dispatch'}<ArrowRight size={16} /></button>} />
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Dispatch status" value={schedule?.status || 'No draft'} detail={`${schedule?.items.length ?? 0} assigned stops`} icon={<ListChecks size={18} />} onClick={() => onGoToSection('dispatch')} />
        <Metric label="Crews ready" value={`${Math.max(teams.length - driverIssues, 0)}/${teams.length}`} detail={`${teams.filter((team) => team.daily_override).length} daily overrides`} icon={<Users size={18} />} onClick={() => onGoToSection('teams')} />
        <Metric label="Call-outs" value={callOuts.length} detail={callOuts.slice(0, 2).map((tech) => tech.name).join(', ') || 'No call-outs marked'} icon={<Radio size={18} />} onClick={() => onGoToSection('teams')} />
        <Metric label="PM month" value={`${c.pm_completed_month}/${c.pm_completed_month + c.pm_incomplete_month}`} detail={`${c.pm_due} due on selected date`} icon={<CalendarDays size={18} />} onClick={() => onGoToSection('pm-tasks')} />
      </div>
    </Card>
    <Card className="overflow-hidden">
      <PanelHeader title="Recent activity" description="Latest changes to work and dispatch." action={<button type="button" onClick={() => onGoToSection('activity')} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[var(--jmi-blue)]">View all activity</button>} />
      <div className="divide-y divide-slate-200 px-3">{auditEvents.length === 0 ? <p className="py-4 text-sm text-[var(--ink-soft)]">No activity recorded yet.</p> : auditEvents.slice(0, 5).map((event) => <article key={event.id} className="py-3 text-sm"><p className="break-words font-semibold text-[var(--ink)]">{event.action.replaceAll('_', ' ').replaceAll('.', ' ')}{event.metadata?.title ? `: ${event.metadata.title}` : ''}</p><p className="mt-1 text-xs text-[var(--ink-soft)]">{event.user_name || 'System'} · {event.occurred_at ? new Date(event.occurred_at).toLocaleString() : 'Unknown time'}</p></article>)}</div>
    </Card>
  </section>
}
