import type { ReactNode } from 'react'
import { ArrowRight, CalendarDays, ClipboardList, Clock3, ListChecks, MessageSquareText, Radio, ShieldCheck, Users, Wrench } from 'lucide-react'
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
  onGoToSection: (section: 'work-orders' | 'teams' | 'dispatch' | 'whatsapp' | 'activity') => void
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
  if (driverIssues > 0) return { label: 'Resolve crew coverage', detail: 'At least one crew is missing an available driver. Confirm call-outs or adjust daily crew composition first.', target: 'teams' as const, cta: 'Check crews' }
  if (!schedule) return { label: 'Generate a draft', detail: 'Crews look ready enough to start a first-pass schedule suggestion for dispatch review.', target: 'dispatch' as const, cta: 'Build schedule' }
  if (schedule.status === 'draft') return { label: 'Review and finalize', detail: 'A draft exists. Check times, crew assignments, notes, then finalize when it is ready to send.', target: 'dispatch' as const, cta: 'Review draft' }
  return { label: 'Copy WhatsApp dispatch', detail: 'The schedule is locked and ready. Copy the crew message and mark it sent after delivery.', target: 'whatsapp' as const, cta: 'Open WhatsApp' }
}

function priorityCount(workOrders: WorkOrder[]) {
  return workOrders.filter((workOrder) => ['P1', 'P2'].includes(workOrder.normalized_priority || workOrder.priority)).length
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
  const callOuts = technicians.filter((technician) => technician.availability === 'unavailable')
  const driverIssues = teams.filter((team) => !team.has_driver).length
  const dailyOverrides = teams.filter((team) => team.daily_override).length
  const highPriority = priorityCount(workOrders)
  const unscheduledApproved = workOrders.filter((workOrder) => workOrder.status === 'approved' && !workOrder.scheduled_date).length
  const next = nextAction(schedule, driverIssues, canEdit)
  const scheduleItems = schedule?.items.length || 0
  const recentEvents = auditEvents.slice(0, 4)

  return <section className="soft-reveal-delay space-y-4">
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden border-[#244393]/16 bg-[#172b63] text-white shadow-[0_24px_70px_rgba(23,43,99,0.18)]">
        <div className="relative p-5 sm:p-6">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[#d84332]" />
          <div className="absolute right-0 top-0 h-full w-2/3 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_52%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-display text-xs font-extrabold uppercase tracking-[0.24em] text-blue-100/80">Today&apos;s command decision</p>
              <h2 className="font-display mt-2 text-3xl font-black tracking-[-0.03em] sm:text-4xl">{next.label}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50/82">{next.detail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!schedule && canEdit && <button type="button" disabled={working} onClick={onSuggest} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#d84332] px-4 py-3 font-display text-sm font-extrabold text-white shadow-[0_16px_38px_rgba(216,67,50,0.28)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] disabled:cursor-not-allowed disabled:opacity-60">
                <ClipboardList size={17} /> {working ? 'Working...' : 'Suggest schedule'}
              </button>}
              <button type="button" onClick={() => onGoToSection(next.target)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-display text-sm font-extrabold text-[#172033] shadow-[0_16px_38px_rgba(255,255,255,0.16)] transition hover:-translate-y-0.5 hover:bg-blue-50">
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
          <Metric icon={<CalendarDays size={20} />} label="PM Due" value={pmTasks.length} tone="steel" />
        </div>
      </Card>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric icon={<Wrench size={20} />} label="Open WOs" value={dashboard?.counts.open_work_orders} detail={`${highPriority} high-priority`} tone={highPriority > 0 ? 'amber' : 'blue'} />
      <Metric icon={<Clock3 size={20} />} label="Needs assessment" value={dashboard?.counts.needs_assessment} detail={`${unscheduledApproved} approved without date`} tone={unscheduledApproved > 0 ? 'amber' : 'steel'} />
      <Metric icon={<Users size={20} />} label="Crews ready" value={`${Math.max(teams.length - driverIssues, 0)}/${teams.length}`} detail={`${dailyOverrides} daily override${dailyOverrides === 1 ? '' : 's'}`} tone={driverIssues > 0 ? 'red' : 'green'} />
      <Metric icon={<Radio size={20} />} label="Call-outs" value={callOuts.length} detail={callOuts.slice(0, 2).map((tech) => tech.name).join(', ') || 'No call-outs marked'} tone={callOuts.length > 0 ? 'red' : 'green'} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <Card className="overflow-hidden">
        <PanelHeader eyebrow="Workflow" title="Work the day in order" description="A practical path for the dispatch team: intake, crew check, schedule, send." />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {[
            { step: '01', title: 'Add incoming work', detail: 'Capture WhatsApp, phone, email, or work-order requests.', target: 'work-orders' as const, icon: <Wrench size={17} /> },
            { step: '02', title: 'Confirm crews', detail: 'Mark call-outs and adjust daily crew composition.', target: 'teams' as const, icon: <Users size={17} /> },
            { step: '03', title: 'Build dispatch', detail: 'Generate, reorder, assign crews, and finalize.', target: 'dispatch' as const, icon: <ClipboardList size={17} /> },
            { step: '04', title: 'Copy WhatsApp', detail: 'Send the polished crew assignment output.', target: 'whatsapp' as const, icon: <MessageSquareText size={17} /> },
          ].map((item) => <button key={item.step} type="button" onClick={() => onGoToSection(item.target)} className="group rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 text-left shadow-[0_10px_26px_rgba(23,32,51,0.05)] transition hover:-translate-y-0.5 hover:border-[#244393]/25 hover:bg-[#f8faff]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-[#d84332]">Step {item.step}</span>
              <span className="rounded-xl bg-[#e8eefc] p-2 text-[#244393] transition group-hover:bg-[#244393] group-hover:text-white">{item.icon}</span>
            </div>
            <span className="font-display mt-2 block text-lg font-extrabold text-[#172033]">{item.title}</span>
            <span className="mt-1 block text-sm leading-6 text-[#526071]">{item.detail}</span>
          </button>)}
        </div>
      </Card>

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
