import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, ClipboardList, Clock3, FileText, FolderKanban, ListChecks, Radio, ShieldCheck, Users, Wrench } from 'lucide-react'
import { Card, PanelHeader } from './ui'
import type { AuditEvent, Dashboard, DispatchSchedule, PmTask, Team, Technician, WorkOrder } from '../types'

type DashboardMetricsProps = {
  dashboard: Dashboard | null
  workOrders: WorkOrder[]
  teams: Team[]
  technicians: Technician[]
  pmTasks: PmTask[]
  schedule: DispatchSchedule | null
  auditEvents: AuditEvent[]
  canEdit: boolean
  working: boolean
  onGoToSection: (section: 'work-orders' | 'pa-projects' | 'teams' | 'dispatch' | 'pm-tasks' | 'whatsapp' | 'activity') => void
  onSuggest: () => Promise<void>
}

function Metric({ icon, label, value, tone = 'blue', detail }: { icon: ReactNode; label: string; value?: number | string; tone?: 'blue' | 'red' | 'green' | 'amber' | 'steel'; detail?: string }) {
  const palette = {
    blue: 'border-[#244393]/18 bg-[#f8faff] text-[#244393]',
    red: 'border-red-200 bg-red-50 text-red-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    steel: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone]

  return <article className="relative overflow-hidden rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/92 p-4 shadow-[0_14px_34px_rgba(23,32,51,0.07)] backdrop-blur">
    <div className="absolute inset-x-0 top-0 h-1 bg-[#244393]" />
    <div className={`mb-4 inline-flex rounded-xl border p-2.5 ${palette}`}>{icon}</div>
    <div className="font-display tabular text-3xl font-extrabold tracking-tight text-[#172033]">{value ?? 0}</div>
    <div className="mt-1 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">{label}</div>
    {detail && <p className="mt-2 text-xs font-semibold leading-5 text-[#526071]">{detail}</p>}
  </article>
}

function statusTone(schedule: DispatchSchedule | null) {
  if (!schedule) return 'amber' as const
  if (schedule.status === 'sent') return 'green' as const
  if (schedule.status === 'finalized') return 'blue' as const
  return 'steel' as const
}

function statusLabel(schedule: DispatchSchedule | null) {
  if (!schedule) return 'No draft'
  return schedule.status
}

function nextAction(schedule: DispatchSchedule | null, driverIssues: number, canEdit: boolean) {
  if (!canEdit) return { label: 'Review today', detail: 'Viewer mode is read-only. Inspect schedule status, crews, and activity.', target: 'dispatch' as const, cta: 'Open dispatch' }
  if (schedule?.status === 'sent') return { label: 'Monitor changes', detail: 'Dispatch has been sent. Watch activity for edits or reopen only if the day changes.', target: 'activity' as const, cta: 'View activity' }
  if (schedule?.status === 'finalized') return { label: 'Copy WhatsApp dispatch', detail: 'The schedule is locked and ready. Copy the crew message and mark it sent after delivery.', target: 'whatsapp' as const, cta: 'Open WhatsApp' }
  if (driverIssues > 0) return { label: 'Resolve crew coverage', detail: 'At least one crew is missing an available driver. Confirm call-outs or adjust daily crew composition first.', target: 'teams' as const, cta: 'Check crews' }
  if (!schedule) return { label: 'Generate a draft', detail: 'Crews look ready enough to start a first-pass schedule suggestion for dispatch review.', target: 'dispatch' as const, cta: 'Build schedule' }
  if (schedule.status === 'draft') return { label: 'Review and finalize', detail: 'A draft exists. Check times, crew assignments, notes, then finalize when it is ready to send.', target: 'dispatch' as const, cta: 'Review draft' }
  return { label: 'Copy WhatsApp dispatch', detail: 'The schedule is locked and ready. Copy the crew message and mark it sent after delivery.', target: 'whatsapp' as const, cta: 'Open WhatsApp' }
}

function priorityCount(workOrders: WorkOrder[]) {
  return workOrders.filter((workOrder) => ['P1', 'P2'].includes(workOrder.normalized_priority || workOrder.priority || '')).length
}

function formatMetadataValue(value: AuditEvent['metadata'][string] | undefined) {
  if (value === undefined || value === null || value === '') return null
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function eventSummary(event: AuditEvent) {
  const metadata = event.metadata || {}
  const action = event.action.replaceAll('_', ' ').replaceAll('.', ' ')
  const target = formatMetadataValue(metadata.title) || formatMetadataValue(metadata.item) || formatMetadataValue(metadata.team) || formatMetadataValue(metadata.technician) || formatMetadataValue(metadata.date)
  return target ? `${action}: ${target}` : action
}

function eventTime(value: string | null) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function DashboardMetrics({ dashboard, workOrders, teams, technicians, pmTasks, schedule, auditEvents, canEdit, working, onGoToSection, onSuggest }: DashboardMetricsProps) {
  const callOuts = technicians.filter((technician) => technician.active && technician.availability === 'unavailable')
  const driverIssues = teams.filter((team) => !team.has_driver).length
  const dailyOverrides = teams.filter((team) => team.daily_override).length
  const highPriority = dashboard?.counts.high_priority_open_work_orders ?? priorityCount(workOrders)
  const unscheduledApproved = dashboard?.counts.unscheduled_approved ?? workOrders.filter((workOrder) => workOrder.status === 'approved' && !workOrder.scheduled_date).length
  const paProjects = workOrders.filter((workOrder) => workOrder.pa_project).length
  const correctiveMaintenance = workOrders.filter((workOrder) => workOrder.corrective_maintenance).length
  const estimateRequired = workOrders.filter((workOrder) => workOrder.estimate_required).length
  const waitingForParts = workOrders.filter((workOrder) => workOrder.status === 'waiting_for_parts').length
  const incompletePmTasks = pmTasks.filter((pm) => pm.status !== 'completed').length
  const slaOverdue = workOrders.filter((workOrder) => workOrder.sla_status === 'overdue').length
  const slaDueSoon = workOrders.filter((workOrder) => workOrder.sla_status === 'due_soon').length
  const slaMissing = workOrders.filter((workOrder) => workOrder.sla_status === 'missing').length
  const next = nextAction(schedule, driverIssues, canEdit)
  const scheduleItems = schedule?.items.length || 0
  const recentEvents = auditEvents.slice(0, 4)

  return <section className="soft-reveal-delay space-y-4">
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden border-[#244393]/14 bg-white text-[#172033] shadow-[0_18px_46px_rgba(23,32,51,0.08)]">
        <div className="relative p-5 sm:p-6">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[#d84332]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-display text-xs font-extrabold uppercase tracking-[0.24em] text-[#244393]">Today&apos;s command decision</p>
              <h2 className="font-display mt-2 text-3xl font-black tracking-[-0.03em] text-[#172033] sm:text-4xl">{next.label}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#526071]">{next.detail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!schedule && canEdit && driverIssues === 0 && <button type="button" disabled={working} onClick={onSuggest} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#d84332] px-4 py-3 font-display text-sm font-extrabold text-white shadow-[0_16px_38px_rgba(216,67,50,0.28)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] disabled:cursor-not-allowed disabled:opacity-60">
                <ClipboardList size={17} /> {working ? 'Working...' : 'Suggest schedule'}
              </button>}
              <button type="button" onClick={() => onGoToSection(next.target)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-3 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#dfe8ff]">
                {next.cta} <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <PanelHeader eyebrow="Dispatch state" title={statusLabel(schedule)} description={schedule ? `${scheduleItems} assigned ${scheduleItems === 1 ? 'stop' : 'stops'} for ${dashboard?.date || 'the selected date'}.` : 'No dispatch draft exists for the selected date.'} />
        <div className="grid grid-cols-3 gap-3 p-4">
          <Metric icon={<ShieldCheck size={20} />} label="Status" value={statusLabel(schedule)} tone={statusTone(schedule)} />
          <Metric icon={<ListChecks size={20} />} label="Stops" value={scheduleItems} tone="blue" />
          <Metric icon={<CalendarDays size={20} />} label="PM Due" value={dashboard?.counts.pm_due ?? pmTasks.filter((pm) => pm.scheduled_date === dashboard?.date && pm.status !== 'completed').length} tone="steel" />
        </div>
      </Card>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric icon={<Wrench size={20} />} label="Open WOs" value={dashboard?.counts.open_work_orders} detail={`${highPriority} high-priority`} tone={highPriority > 0 ? 'amber' : 'blue'} />
      <Metric icon={<Clock3 size={20} />} label="Needs assessment" value={dashboard?.counts.needs_assessment} detail={`${unscheduledApproved} approved without date`} tone={unscheduledApproved > 0 ? 'amber' : 'steel'} />
      <Metric icon={<Users size={20} />} label="Crews ready" value={`${Math.max(teams.length - driverIssues, 0)}/${teams.length}`} detail={`${dailyOverrides} daily override${dailyOverrides === 1 ? '' : 's'}`} tone={driverIssues > 0 ? 'red' : 'green'} />
      <Metric icon={<Radio size={20} />} label="Call-outs" value={callOuts.length} detail={callOuts.slice(0, 2).map((tech) => tech.name).join(', ') || 'No call-outs marked'} tone={callOuts.length > 0 ? 'red' : 'green'} />
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <button type="button" onClick={() => onGoToSection('pa-projects')} className="text-left transition hover:-translate-y-0.5">
        <Metric icon={<FolderKanban size={20} />} label="PA Projects" value={dashboard?.counts.pa_projects ?? paProjects} detail="Long-lead follow-up workspace" tone={(dashboard?.counts.pa_projects ?? paProjects) > 0 ? 'amber' : 'steel'} />
      </button>
      <Metric icon={<Wrench size={20} />} label="Corrective Maint." value={dashboard?.counts.corrective_maintenance ?? correctiveMaintenance} detail="CM-flagged open work" tone="blue" />
      <Metric icon={<FileText size={20} />} label="Estimates" value={dashboard?.counts.estimate_required ?? estimateRequired} detail="Estimate-required open work" tone={(dashboard?.counts.estimate_required ?? estimateRequired) > 0 ? 'amber' : 'steel'} />
      <button type="button" onClick={() => onGoToSection('work-orders')} className="text-left transition hover:-translate-y-0.5">
        <Metric icon={<Clock3 size={20} />} label="Waiting parts" value={dashboard?.counts.waiting_for_parts ?? waitingForParts} detail="Held out of dispatch suggestions" tone={(dashboard?.counts.waiting_for_parts ?? waitingForParts) > 0 ? 'amber' : 'steel'} />
      </button>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <Metric icon={<AlertTriangle size={20} />} label="SLA overdue" value={dashboard?.counts.sla_overdue ?? slaOverdue} detail="Needs dispatch/follow-up now" tone={(dashboard?.counts.sla_overdue ?? slaOverdue) > 0 ? 'red' : 'green'} />
      <Metric icon={<Clock3 size={20} />} label="SLA due soon" value={dashboard?.counts.sla_due_soon ?? slaDueSoon} detail="Within the next 24 hours" tone={(dashboard?.counts.sla_due_soon ?? slaDueSoon) > 0 ? 'amber' : 'steel'} />
      <Metric icon={<ShieldCheck size={20} />} label="SLA missing" value={dashboard?.counts.sla_missing ?? slaMissing} detail="Needs reported time/priority cleanup" tone={(dashboard?.counts.sla_missing ?? slaMissing) > 0 ? 'amber' : 'green'} />
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => onGoToSection('pm-tasks')} className="text-left transition hover:-translate-y-0.5">
        <Metric icon={<CalendarDays size={20} />} label="PM incomplete" value={dashboard?.counts.pm_incomplete_month ?? incompletePmTasks} detail="Not completed this month" tone={(dashboard?.counts.pm_incomplete_month ?? incompletePmTasks) > 0 ? 'amber' : 'green'} />
      </button>
      <Metric icon={<ListChecks size={20} />} label="PM completed" value={dashboard?.counts.pm_completed_month ?? pmTasks.filter((pm) => pm.status === 'completed').length} detail="Completed this month" tone="green" />
    </div>

    <div>
      <Card className="overflow-hidden">
        <PanelHeader eyebrow="Recent changes" title="Activity snapshot" description="Latest audit entries so dispatchers can spot fresh edits before sending." action={<button type="button" onClick={() => onGoToSection('activity')} className="rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-[#244393] transition hover:bg-[#dfe8ff]">View all</button>} />
        <div className="space-y-3 p-4">
          {recentEvents.length === 0 && <p className="rounded-2xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071]">No activity recorded yet.</p>}
          {recentEvents.map((event) => <article key={event.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-sm font-extrabold capitalize text-[#172033]">{eventSummary(event)}</p>
                <p className="mt-1 text-xs font-semibold text-[#64748b]">{event.user_name || 'System'} • {eventTime(event.occurred_at)}</p>
              </div>
              <Clock3 className="shrink-0 text-[#244393]" size={16} />
            </div>
          </article>)}
        </div>
      </Card>
    </div>
  </section>
}
