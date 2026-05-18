import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Save, Unlock } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { DispatchItem, DispatchSchedule, DispatchSummary, Team } from '../types'

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

function DispatchCard({ item, teams, disabled, canEdit, onUpdate }: { item: DispatchItem; teams: Team[]; disabled: boolean; canEdit: boolean; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void> }) {
  const wo = item.work_order
  const pm = item.pm_task
  const [teamId, setTeamId] = useState(String(item.team_id))
  const [scheduledTime, setScheduledTime] = useState(item.scheduled_time || '')
  const [notes, setNotes] = useState(item.notes || '')

  useEffect(() => {
    // Keep each editable card aligned with the last persisted schedule response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeamId(String(item.team_id))
    setScheduledTime(item.scheduled_time || '')
    setNotes(item.notes || '')
  }, [item.team_id, item.scheduled_time, item.notes])

  const title = wo ? `${wo.location} - ${wo.title}` : `${pm?.location} - ${pm?.task_name}`
  const kind = wo?.normalized_priority || 'pm'

  return <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/92 p-4 shadow-[0_12px_28px_rgba(23,32,51,0.06)]">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-display tabular text-xs font-extrabold uppercase tracking-[0.16em] text-[#244393]">{scheduledTime || 'TBD'}</p>
        <h4 className="font-display mt-1 font-extrabold tracking-tight text-[#172033]">{title}</h4>
      </div>
      <Badge kind={kind}>{wo?.normalized_priority || 'PM'}</Badge>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Crew
        <select disabled={disabled || !canEdit} value={teamId} onChange={(event) => setTeamId(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Time
        <input disabled={disabled || !canEdit} type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
    </div>

    <label className="mt-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Notes / warnings
      <textarea disabled={disabled || !canEdit} value={notes} onChange={(event) => setNotes(event.target.value)} className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    {canEdit && <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={disabled} onClick={() => onUpdate(item.id, { team_id: Number(teamId), scheduled_time: scheduledTime, notes })} className="inline-flex items-center gap-1 rounded-xl bg-[#244393] px-3 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">
        <Save size={14} /> Save override
      </button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: Math.max(0, item.order_index - 1) })} className="rounded-xl border border-[rgba(23,32,51,0.12)] bg-white/80 px-3 py-2 text-xs font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:opacity-50">Move earlier</button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: item.order_index + 1 })} className="rounded-xl border border-[rgba(23,32,51,0.12)] bg-white/80 px-3 py-2 text-xs font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:opacity-50">Move later</button>
    </div>}
  </div>
}

export function DispatchBuilder({ schedule, teams, working, canEdit, onSuggest, onUpdate, onFinalize, onReopen }: { schedule: DispatchSchedule | null; teams: Team[]; working: boolean; canEdit: boolean; onSuggest: () => Promise<void>; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void>; onFinalize: () => Promise<void>; onReopen: () => Promise<void> }) {
  const groupedSchedule = useMemo(() => {
    const groups: Record<string, DispatchItem[]> = {}
    schedule?.items.forEach((item) => {
      groups[item.team_name] ||= []
      groups[item.team_name].push(item)
    })
    Object.values(groups).forEach((items) => items.sort((a, b) => a.order_index - b.order_index))
    return groups
  }, [schedule])
  const canEditItems = canEdit && schedule?.status === 'draft'

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
              {items.map((item) => <DispatchCard key={`${item.id}-${item.team_id}-${item.scheduled_time}-${item.notes}`} item={item} teams={teams} disabled={working} canEdit={canEditItems} onUpdate={onUpdate} />)}
            </div>
          </div>
        ))}
      </div>
    )}
  </Card>
}
