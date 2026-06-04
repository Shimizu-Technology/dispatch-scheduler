import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Clock3, FileText, FolderKanban, ListChecks, Radio, ShieldCheck, Users, Wrench } from 'lucide-react'
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

type Tone = 'blue' | 'red' | 'green' | 'amber' | 'steel' | 'dark'

function toneClasses(tone: Tone) {
  return {
    blue: 'border-[#244393]/18 bg-[#f8faff] text-[#244393]',
    red: 'border-red-200 bg-red-50 text-red-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    steel: 'border-slate-200 bg-slate-50 text-slate-700',
    dark: 'border-[#172b63]/20 bg-[#172b63] text-white',
  }[tone]
}

function Metric({ icon, label, value, tone = 'blue', detail, onClick }: { icon: ReactNode; label: string; value?: number | string; tone?: Tone; detail?: string; onClick?: () => void }) {
  const content = <>
    <div className={`inline-flex rounded-xl border p-1.5 sm:p-2 ${toneClasses(tone)}`}>{icon}</div>
    <div className="min-w-0">
      <div className="font-display tabular break-words text-xl font-black tracking-tight text-[#172033] sm:text-2xl">{value ?? 0}</div>
      <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-[#64748b] sm:text-[0.64rem] sm:tracking-[0.16em]">{label}</div>
      {detail && <p className="mt-1 text-xs font-semibold leading-4 text-[#526071]">{detail}</p>}
    </div>
  </>

  const baseClass = "flex min-h-[5.6rem] w-full items-start gap-2 rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/94 p-3 text-left shadow-[0_10px_26px_rgba(23,32,51,0.055)] transition sm:min-h-[6.5rem] sm:gap-3 sm:p-4"
  if (onClick) return <button type="button" onClick={onClick} className={`${baseClass} hover:border-[#244393]/20 hover:shadow-[0_16px_34px_rgba(23,32,51,0.08)]`}>{content}</button>
  return <article className={baseClass}>{content}</article>
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
  if (!canEdit) return { label: 'Review operations', detail: 'Viewer mode is read-only. Inspect schedule status, crews, work pressure, and activity.', target: 'dispatch' as const, cta: 'Open dispatch' }
  if (schedule?.status === 'sent') return { label: 'Monitor field updates', detail: 'Dispatch has been sent. Watch activity, PA Projects, and end-of-day outcomes.', target: 'activity' as const, cta: 'View activity' }
  if (schedule?.status === 'finalized') return { label: 'Copy and send dispatch', detail: 'The schedule is locked and ready. Copy the crew message, send to WhatsApp, then mark sent.', target: 'whatsapp' as const, cta: 'Open WhatsApp' }
  if (driverIssues > 0) return { label: 'Resolve crew coverage', detail: 'At least one active crew is missing an available driver. Confirm call-outs or adjust today’s crews before dispatch.', target: 'teams' as const, cta: 'Check crews' }
  if (!schedule) return { label: 'Generate dispatch draft', detail: 'Crews look ready. Generate the first-pass plan, then John or dispatch can make final calls.', target: 'dispatch' as const, cta: 'Build draft' }
  if (schedule.status === 'draft') return { label: 'Review and finalize draft', detail: 'A draft exists. Check crew assignments, timing, warnings, PMs, and notes before sending.', target: 'dispatch' as const, cta: 'Review draft' }
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

function scheduleDetail(schedule: DispatchSchedule | null, dashboard: Dashboard | null) {
  if (!schedule) return 'No dispatch draft exists for the selected date.'
  const count = schedule.items.length
  return `${count} assigned ${count === 1 ? 'stop' : 'stops'} for ${dashboard?.date || 'the selected date'}.`
}

export function DashboardMetrics({ dashboard, workOrders, teams, technicians, pmTasks, schedule, auditEvents, canEdit, working, onGoToSection, onSuggest }: DashboardMetricsProps) {
  const callOuts = technicians.filter((technician) => technician.active && technician.availability === 'unavailable')
  const driverIssues = teams.filter((team) => !team.has_driver).length
  const dailyOverrides = teams.filter((team) => team.daily_override).length
  const highPriority = dashboard?.counts.high_priority_open_work_orders ?? priorityCount(workOrders)
  const unscheduledApproved = dashboard?.counts.unscheduled_approved ?? workOrders.filter((workOrder) => workOrder.status === 'approved' && !workOrder.scheduled_date).length
  const paProjects = dashboard?.counts.pa_projects ?? workOrders.filter((workOrder) => workOrder.pa_project).length
  const correctiveMaintenance = dashboard?.counts.corrective_maintenance ?? workOrders.filter((workOrder) => workOrder.corrective_maintenance).length
  const estimateRequired = dashboard?.counts.estimate_required ?? workOrders.filter((workOrder) => workOrder.estimate_required).length
  const waitingForParts = dashboard?.counts.waiting_for_parts ?? workOrders.filter((workOrder) => workOrder.status === 'waiting_for_parts').length
  const incompletePmTasks = dashboard?.counts.pm_incomplete_month ?? pmTasks.filter((pm) => pm.status !== 'completed').length
  const completedPmTasks = dashboard?.counts.pm_completed_month ?? pmTasks.filter((pm) => pm.status === 'completed').length
  const kpiWorkOrders = workOrders.filter((workOrder) => !workOrder.pa_project)
  const slaOverdue = dashboard?.counts.sla_overdue ?? kpiWorkOrders.filter((workOrder) => workOrder.sla_status === 'overdue').length
  const slaDueSoon = dashboard?.counts.sla_due_soon ?? kpiWorkOrders.filter((workOrder) => workOrder.sla_status === 'due_soon').length
  const slaMissing = dashboard?.counts.sla_missing ?? kpiWorkOrders.filter((workOrder) => workOrder.sla_status === 'missing').length
  const next = nextAction(schedule, driverIssues, canEdit)
  const scheduleItems = schedule?.items.length || 0
  const recentEvents = auditEvents.slice(0, 5)

  return <section className="soft-reveal-delay space-y-3 sm:space-y-4">
    <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
      <Card className="overflow-hidden border-[#244393]/14 bg-white text-[#172033] shadow-[0_16px_42px_rgba(23,32,51,0.075)]">
        <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
          <div className="relative p-4 sm:p-5">
            <div className="absolute inset-y-0 left-0 w-1 sm:w-1.5 bg-[#d84332]" />
            <p className="font-display text-[0.66rem] font-extrabold uppercase tracking-[0.2em] text-[#244393] sm:text-[0.68rem] sm:tracking-[0.24em]">Today’s command decision</p>
            <h2 className="font-display mt-2 text-2xl font-black tracking-[-0.035em] text-[#172033] sm:text-3xl">{next.label}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#526071]">{next.detail}</p>
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-2 border-t border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3 sm:p-4 lg:min-w-[15rem] lg:border-l lg:border-t-0">
            {!schedule && canEdit && driverIssues === 0 && <button type="button" disabled={working} onClick={onSuggest} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d84332] px-4 py-3 font-display text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(216,67,50,0.24)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] disabled:cursor-not-allowed disabled:opacity-60">
              <ClipboardList size={17} /> {working ? 'Working...' : 'Generate draft'}
            </button>}
            <button type="button" onClick={() => onGoToSection(next.target)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-white px-4 py-3 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc]">
              {next.cta} <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <PanelHeader eyebrow="Dispatch state" title={statusLabel(schedule)} description={scheduleDetail(schedule, dashboard)} />
        <div className="grid gap-3 p-3 sm:grid-cols-3 sm:p-4">
          <Metric icon={<ShieldCheck size={18} />} label="Status" value={statusLabel(schedule)} tone={statusTone(schedule)} />
          <Metric icon={<ListChecks size={18} />} label="Stops" value={scheduleItems} tone="blue" />
          <Metric icon={<CalendarDays size={18} />} label="PM due" value={dashboard?.counts.pm_due ?? pmTasks.filter((pm) => pm.scheduled_date === dashboard?.date && pm.status !== 'completed').length} tone="steel" />
        </div>
      </Card>
    </div>

    <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
      <Card className="overflow-hidden">
        <PanelHeader eyebrow="Work pressure" title="Queue health" description="Open work, KPI pressure, blocked jobs, and follow-up counts for the selected date." />
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
          <Metric icon={<Wrench size={18} />} label="Open WOs" value={dashboard?.counts.open_work_orders} detail={`${highPriority} high-priority`} tone={highPriority > 0 ? 'amber' : 'blue'} onClick={() => onGoToSection('work-orders')} />
          <Metric icon={<Clock3 size={18} />} label="Needs assess." value={dashboard?.counts.needs_assessment} detail={`${unscheduledApproved} approved without date`} tone={unscheduledApproved > 0 ? 'amber' : 'steel'} onClick={() => onGoToSection('work-orders')} />
          <Metric icon={<AlertTriangle size={18} />} label="KPI overdue" value={slaOverdue} detail="Original due date passed" tone={slaOverdue > 0 ? 'red' : 'green'} onClick={() => onGoToSection('work-orders')} />
          <Metric icon={<Clock3 size={18} />} label="Due soon" value={slaDueSoon} detail="Within the next 24 hours" tone={slaDueSoon > 0 ? 'amber' : 'steel'} onClick={() => onGoToSection('work-orders')} />
          <Metric icon={<ShieldCheck size={18} />} label="KPI missing" value={slaMissing} detail="Needs reported time cleanup" tone={slaMissing > 0 ? 'amber' : 'green'} onClick={() => onGoToSection('work-orders')} />
          <Metric icon={<Clock3 size={18} />} label="Waiting parts" value={waitingForParts} detail="Held out of dispatch" tone={waitingForParts > 0 ? 'amber' : 'steel'} onClick={() => onGoToSection('work-orders')} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <PanelHeader eyebrow="Crew readiness" title={`${Math.max(teams.length - driverIssues, 0)}/${teams.length} crews ready`} description="Driver coverage, daily overrides, and call-outs before generating the draft." />
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-1">
          <Metric icon={<Users size={18} />} label="Crews ready" value={`${Math.max(teams.length - driverIssues, 0)}/${teams.length}`} detail={`${dailyOverrides} daily override${dailyOverrides === 1 ? '' : 's'}`} tone={driverIssues > 0 ? 'red' : 'green'} onClick={() => onGoToSection('teams')} />
          <Metric icon={<Radio size={18} />} label="Call-outs" value={callOuts.length} detail={callOuts.slice(0, 2).map((tech) => tech.name).join(', ') || 'No call-outs marked'} tone={callOuts.length > 0 ? 'red' : 'green'} onClick={() => onGoToSection('teams')} />
        </div>
      </Card>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      <Metric icon={<FolderKanban size={18} />} label="PA Projects" value={paProjects} detail="Long-lead follow-up workspace" tone={paProjects > 0 ? 'amber' : 'steel'} onClick={() => onGoToSection('pa-projects')} />
      <Metric icon={<Wrench size={18} />} label="Corrective Maint." value={correctiveMaintenance} detail="CM-flagged open work" tone="blue" onClick={() => onGoToSection('work-orders')} />
      <Metric icon={<FileText size={18} />} label="Estimates" value={estimateRequired} detail="Estimate-required open work" tone={estimateRequired > 0 ? 'amber' : 'steel'} onClick={() => onGoToSection('work-orders')} />
      <Metric icon={<CalendarDays size={18} />} label="PM month" value={`${completedPmTasks}/${completedPmTasks + incompletePmTasks}`} detail="Completed this month" tone={incompletePmTasks > 0 ? 'amber' : 'green'} onClick={() => onGoToSection('pm-tasks')} />
    </div>

    <Card className="overflow-hidden">
      <PanelHeader eyebrow="Recent changes" title="Activity snapshot" description="Latest audit entries so dispatchers can spot fresh edits before sending." action={<button type="button" onClick={() => onGoToSection('activity')} className="rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-[#244393] transition hover:bg-[#dfe8ff]">View all</button>} />
      <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2 xl:grid-cols-5">
        {recentEvents.length === 0 && <p className="rounded-2xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071] lg:col-span-2 xl:col-span-5">No activity recorded yet.</p>}
        {recentEvents.map((event) => <article key={event.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display line-clamp-2 text-sm font-extrabold capitalize text-[#172033]">{eventSummary(event)}</p>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">{event.user_name || 'System'} • {eventTime(event.occurred_at)}</p>
            </div>
            <CheckCircle2 className="shrink-0 text-[#244393]" size={16} />
          </div>
        </article>)}
      </div>
    </Card>
  </section>
}
