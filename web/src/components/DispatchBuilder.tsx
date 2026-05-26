import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Save, Unlock } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { DispatchItem, DispatchOutcomeStatus, DispatchSchedule, DispatchSummary, Team, WorkOrderStatus } from '../types'

const OUTCOME_OPTIONS: Array<{ status: DispatchOutcomeStatus; label: string; workOrderStatus: WorkOrderStatus; description: string }> = [
  { status: 'pending', label: 'Pending', workOrderStatus: 'scheduled', description: 'Keep assigned, no final result yet.' },
  { status: 'completed', label: 'Complete', workOrderStatus: 'completed', description: 'Work finished and closed.' },
  { status: 'carry_over', label: 'Carry Over', workOrderStatus: 'carry_over', description: 'Return visit needed.' },
  { status: 'waiting_parts', label: 'Waiting Parts', workOrderStatus: 'waiting_for_parts', description: 'Hold until parts are ready.' },
  { status: 'waiting_approval', label: 'Waiting Approval', workOrderStatus: 'waiting_for_approval', description: 'Hold until customer approval.' },
  { status: 'unable_to_access', label: 'Unable to Access', workOrderStatus: 'needs_assessment', description: 'Could not assess or perform work.' },
  { status: 'cancelled', label: 'Cancelled', workOrderStatus: 'cancelled', description: 'Stop future dispatch.' },
]

const WORK_ORDER_STATUS_OPTIONS: Array<{ status: WorkOrderStatus; label: string }> = [
  { status: 'new', label: 'New' },
  { status: 'needs_assessment', label: 'Needs Assessment' },
  { status: 'approved', label: 'Approved' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'carry_over', label: 'Carry Over' },
  { status: 'waiting_for_parts', label: 'Waiting For Parts' },
  { status: 'waiting_for_approval', label: 'Waiting For Approval' },
  { status: 'completed', label: 'Completed' },
  { status: 'closed', label: 'Closed' },
  { status: 'cancelled', label: 'Cancelled' },
]

function nextDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + 1)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function outcomeLabel(status: DispatchOutcomeStatus) {
  return OUTCOME_OPTIONS.find((option) => option.status === status)?.label || 'Pending'
}

function statusLabel(status: WorkOrderStatus) {
  return WORK_ORDER_STATUS_OPTIONS.find((option) => option.status === status)?.label || status.replaceAll('_', ' ')
}

function ScheduleSummary({ summary }: { summary: DispatchSummary }) {
  return <div className="grid gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-[#f8faff] to-white p-4 text-sm text-[#172033] shadow-[0_14px_34px_rgba(36,67,147,0.08)] sm:grid-cols-4">
    <strong className="font-display tabular text-lg font-extrabold">{summary.scheduled_items}{summary.daily_item_limit ? `/${summary.daily_item_limit}` : ''} scheduled</strong>
    <span className="font-semibold">{summary.eligible_work_orders} work orders</span>
    <span className="font-semibold">{summary.eligible_pm_tasks} PM tasks</span>
    <span className="font-semibold">{summary.deferred_items + summary.blocked_work_orders} held out</span>
    <p className="leading-6 text-[#526071] sm:col-span-4">{summary.message}</p>
  </div>
}

function StatusNotice({ schedule }: { schedule: DispatchSchedule }) {
  if (schedule.status === 'draft') {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Draft schedule: adjust crew, time, order, and notes before finalizing.</div>
  }

  if (schedule.status === 'finalized') {
    return <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">Finalized schedule: editing and regeneration are locked. Reopen to make changes before sending.</div>
  }

  return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Sent schedule: this dispatch has been marked as sent to the crews.</div>
}

function DispatchCard({ item, scheduleDate, teams, disabled, canEdit, canEditOutcomes, canMoveEarlier, canMoveLater, onUpdate, onOutcome, onWorkOrderStatus }: { item: DispatchItem; scheduleDate: string; teams: Team[]; disabled: boolean; canEdit: boolean; canEditOutcomes: boolean; canMoveEarlier: boolean; canMoveLater: boolean; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void>; onOutcome: (itemId: number, changes: { outcome_status: DispatchOutcomeStatus; outcome_notes?: string; carried_over_to_date?: string }) => Promise<void>; onWorkOrderStatus: (workOrderId: number, status: WorkOrderStatus) => Promise<void> }) {
  const wo = item.work_order
  const pm = item.pm_task
  const persistedTeamId = String(item.team_id)
  const persistedTime = item.scheduled_time || ''
  const persistedNotes = item.notes || ''
  const [teamId, setTeamId] = useState(persistedTeamId)
  const [scheduledTime, setScheduledTime] = useState(persistedTime)
  const [notes, setNotes] = useState(persistedNotes)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [outcomeNotes, setOutcomeNotes] = useState(item.outcome_notes || '')
  const [carryOverDate, setCarryOverDate] = useState(item.carried_over_to_date || nextDateString(scheduleDate))
  const [showDetails, setShowDetails] = useState(false)
  const [workOrderStatus, setWorkOrderStatus] = useState<WorkOrderStatus>(wo?.status || 'scheduled')

  useEffect(() => {
    // Keep each editable card aligned with the last persisted schedule response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeamId(persistedTeamId)
    setScheduledTime(persistedTime)
    setNotes(persistedNotes)
    setOutcomeNotes(item.outcome_notes || '')
    setCarryOverDate(item.carried_over_to_date || nextDateString(scheduleDate))
    setWorkOrderStatus(wo?.status || 'scheduled')
  }, [persistedTeamId, persistedTime, persistedNotes, item.outcome_notes, item.carried_over_to_date, scheduleDate, wo?.status])

  const isDirty = teamId !== persistedTeamId || scheduledTime !== persistedTime || notes !== persistedNotes
  const workOrderStatusDirty = Boolean(wo && workOrderStatus !== wo.status)
  const isSaving = disabled || saveState === 'saving'
  const title = wo ? `${wo.location} - ${wo.title}` : `${pm?.location} - ${pm?.task_name}`
  const kind = wo?.normalized_priority || 'pm'

  function markDirty() {
    if (saveState === 'saved') setSaveState('idle')
  }

  async function saveOverride() {
    if (!isDirty || isSaving) return
    setSaveState('saving')
    try {
      await onUpdate(item.id, { team_id: Number(teamId), scheduled_time: scheduledTime, notes, reassignment_reason: teamId !== persistedTeamId ? 'Manual crew reassignment' : undefined })
      setSaveState('saved')
    } catch {
      setSaveState('idle')
    }
  }

  return <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/92 p-4 shadow-[0_12px_28px_rgba(23,32,51,0.06)]">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-display tabular text-xs font-extrabold uppercase tracking-[0.16em] text-[#244393]">{scheduledTime || 'TBD'}</p>
        <h4 className="font-display mt-1 font-extrabold tracking-tight text-[#172033]">{title}</h4>
      </div>
      <Badge kind={kind}>{wo?.normalized_priority || 'PM'}</Badge>
    </div>

    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-[#64748b]">
      {wo && <><span>Client: {wo.client}</span><span>WO: {wo.external_id || 'N/A'}</span><span>Trade: {wo.trade_category}</span><span>Region: {wo.region}</span><span>Service line: {wo.service_line || 'Unassigned'}</span><span>Scheduled: {wo.scheduled_date || 'Not set'}</span><Badge kind={wo.status}>{statusLabel(wo.status)}</Badge>{wo.pa_project && <Badge kind="waiting">PA Project</Badge>}{wo.corrective_maintenance && <Badge kind="approved">CM</Badge>}{wo.estimate_required && <Badge kind="scheduled">Estimate</Badge>}</>}
      {pm && <><span>Client: {pm.client}</span><span>Trade: {pm.trade_category}</span><span>Region: {pm.region}</span><span>Scheduled: {pm.scheduled_date}</span></>}
      <button type="button" onClick={() => setShowDetails((current) => !current)} className="font-extrabold text-[#244393] underline-offset-4 hover:underline">{showDetails ? 'Hide details' : 'Details'}</button>
    </div>

    {showDetails && <div className="mt-3 rounded-2xl border border-blue-100 bg-[#f8faff] p-3 text-sm leading-6 text-[#334155]">
      <p className="font-display font-extrabold text-[#172033]">{wo ? 'Work order details' : 'PM task details'}</p>
      <p className="mt-1">{wo?.description || pm?.task_name}</p>
      {wo?.notes && <p className="mt-2 text-xs font-semibold text-[#526071]">Work order notes: {wo.notes}</p>}
      {wo?.last_dispatched_on && <p className="mt-2 text-xs font-semibold text-[#526071]">Last dispatched: {wo.last_dispatched_on}{wo.last_crew_name ? ` · ${wo.last_crew_name}` : ''}</p>}
    </div>}

    {wo && <div className="mt-3 rounded-2xl border border-[rgba(36,67,147,0.12)] bg-[#fbfcff] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Work order status
          <select disabled={disabled || !canEditOutcomes} value={workOrderStatus} onChange={(event) => setWorkOrderStatus(event.target.value as WorkOrderStatus)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
            {WORK_ORDER_STATUS_OPTIONS.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={disabled || !canEditOutcomes || !workOrderStatusDirty} onClick={() => void onWorkOrderStatus(wo.id, workOrderStatus)} className="rounded-xl bg-[#244393] px-3 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:opacity-50">Update status</button>
      </div>
      <p className="mt-2 text-xs font-semibold leading-5 text-[#64748b]">Use this for mid-day status changes. Use the outcome buttons below for the final result of this dispatch stop.</p>
    </div>}

    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Crew
        <select disabled={disabled || !canEdit} value={teamId} onChange={(event) => { markDirty(); setTeamId(event.target.value) }} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {teams.map((team) => <option key={team.id} value={team.id}>{team.today_crew_name || team.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Time
        <input disabled={disabled || !canEdit} type="time" value={scheduledTime} onChange={(event) => { markDirty(); setScheduledTime(event.target.value) }} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
    </div>

    {item.call_out_names.length > 0 && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900">Out today from default crew: {item.call_out_names.join(', ')}. The active crew shown above excludes call-outs.</p>}

    <label className="mt-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Notes / warnings
      <textarea disabled={disabled || !canEdit} value={notes} onChange={(event) => { markDirty(); setNotes(event.target.value) }} className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    {item.reassignment_reason && <p className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-900">Reassignment note: {item.reassignment_reason}</p>}

    {canEdit && <div className="mt-3 flex flex-wrap items-center gap-2">
      <button disabled={isSaving || !isDirty} onClick={() => void saveOverride()} className="inline-flex items-center gap-1 rounded-xl bg-[#244393] px-3 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:opacity-60">
        <Save size={14} /> {saveState === 'saving' ? 'Saving...' : 'Save override'}
      </button>
      {saveState === 'saved' && !isDirty && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800"><CheckCircle2 size={14} /> Saved</span>}
      <button disabled={disabled || !canMoveEarlier} title={!canMoveEarlier ? 'Only available when this crew has an earlier stop to swap with.' : undefined} onClick={() => onUpdate(item.id, { order_index: Math.max(0, item.order_index - 1) })} className="rounded-xl border border-[rgba(23,32,51,0.12)] bg-white/80 px-3 py-2 text-xs font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-not-allowed disabled:opacity-50">Move earlier</button>
      <button disabled={disabled || !canMoveLater} title={!canMoveLater ? 'Only available when this crew has a later stop to swap with.' : undefined} onClick={() => onUpdate(item.id, { order_index: item.order_index + 1 })} className="rounded-xl border border-[rgba(23,32,51,0.12)] bg-white/80 px-3 py-2 text-xs font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-not-allowed disabled:opacity-50">Move later</button>
    </div>}

    {canEditOutcomes && <div className="mt-4 rounded-2xl border border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#64748b]">End-of-day outcome</p>
          <p className="mt-1 text-sm font-extrabold text-[#172033]">{outcomeLabel(item.outcome_status)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {OUTCOME_OPTIONS.map((option) => <button key={option.status} type="button" title={`Sets work order to ${statusLabel(option.workOrderStatus)}. ${option.description}`} disabled={disabled} onClick={() => void onOutcome(item.id, { outcome_status: option.status, outcome_notes: outcomeNotes, carried_over_to_date: option.status === 'carry_over' ? carryOverDate : undefined })} className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-50 ${item.outcome_status === option.status ? 'border-[#244393] bg-[#244393] text-white' : 'border-[rgba(36,67,147,0.16)] bg-white text-[#244393] hover:bg-[#e8eefc]'}`}>{option.label}</button>)}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr]">
        <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Carry-over date
          <input disabled={disabled} type="date" value={carryOverDate} onChange={(event) => setCarryOverDate(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        </label>
        <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Outcome notes
          <input disabled={disabled} value={outcomeNotes} onChange={(event) => setOutcomeNotes(event.target.value)} placeholder="Parts needed, access issue, return notes..." className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        </label>
      </div>
    </div>}
  </div>
}

export function DispatchBuilder({ schedule, teams, working, canEdit, onSuggest, onUpdate, onOutcome, onWorkOrderStatus, onFinalize, onReopen }: { schedule: DispatchSchedule | null; teams: Team[]; working: boolean; canEdit: boolean; onSuggest: () => Promise<void>; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void>; onOutcome: (itemId: number, changes: { outcome_status: DispatchOutcomeStatus; outcome_notes?: string; carried_over_to_date?: string }) => Promise<void>; onWorkOrderStatus: (workOrderId: number, status: WorkOrderStatus) => Promise<void>; onFinalize: () => Promise<void>; onReopen: () => Promise<void> }) {
  const groupedSchedule = useMemo(() => {
    const groups: Record<string, DispatchItem[]> = {}
    schedule?.items.forEach((item) => {
      const groupName = item.crew_name || item.team_name
      groups[groupName] ||= []
      groups[groupName].push(item)
    })
    Object.values(groups).forEach((items) => items.sort((a, b) => a.order_index - b.order_index))
    return groups
  }, [schedule])
  const canEditItems = canEdit && schedule?.status === 'draft'
  const canEditOutcomes = canEdit && Boolean(schedule && schedule.status !== 'draft')

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Morning plan"
      title="Dispatch Builder"
      description={canEditItems ? 'Suggestions are a draft. Dispatchers can change crew, time, order, and notes before copying WhatsApp.' : 'Finalized and sent schedules are locked until reopened.'}
      action={canEdit && <div className="flex flex-wrap gap-2">
        {schedule?.status === 'draft' && <button disabled={working || schedule.items.length === 0} onClick={onFinalize} className="inline-flex items-center gap-2 rounded-2xl bg-[#16835f] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(22,131,95,0.16)] transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-60"><CheckCircle2 size={16} /> Finalize</button>}
        {schedule && schedule.status !== 'draft' && <button disabled={working} onClick={onReopen} className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(36,67,147,0.18)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-wait disabled:opacity-60"><Unlock size={16} /> Reopen</button>}
        <button disabled={working || Boolean(schedule && schedule.status !== 'draft')} onClick={onSuggest} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(36,67,147,0.18)] transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:opacity-60">Regenerate Draft</button>
      </div>}
    />
    {!schedule ? (
      <div className="p-8 text-center text-[#526071]">{canEdit ? <>Click <strong>Suggest Today&apos;s Schedule</strong> to generate a draft dispatch plan.</> : 'No draft schedule is loaded yet.'}</div>
    ) : (
      <div className="space-y-4 p-4">
        <StatusNotice schedule={schedule} />
        <ScheduleSummary summary={schedule.summary} />
        {Object.entries(groupedSchedule).map(([team, items]) => (
          <div key={team} className="rounded-2xl border border-[rgba(36,67,147,0.12)] bg-[#f8faff]/85 p-4">
            <h3 className="font-display font-extrabold tracking-tight text-[#172033]">{team}</h3>
            <div className="mt-3 space-y-3">
              {items.map((item, index) => <DispatchCard key={item.id} item={item} scheduleDate={schedule.date} teams={teams} disabled={working} canEdit={canEditItems} canEditOutcomes={canEditOutcomes} canMoveEarlier={index > 0} canMoveLater={index < items.length - 1} onUpdate={onUpdate} onOutcome={onOutcome} onWorkOrderStatus={onWorkOrderStatus} />)}
            </div>
          </div>
        ))}
      </div>
    )}
  </Card>
}
