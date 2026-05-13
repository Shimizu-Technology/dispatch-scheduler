import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { DispatchItem, DispatchSchedule, DispatchSummary, Team } from '../types'

function ScheduleSummary({ summary }: { summary: DispatchSummary }) {
  return <div className="grid gap-3 rounded-[1.45rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4 text-sm text-[#10232a] shadow-[0_14px_36px_rgba(16,182,201,0.08)] sm:grid-cols-4">
    <strong className="font-display text-lg font-extrabold">{summary.scheduled_items}{summary.daily_item_limit ? `/${summary.daily_item_limit}` : ''} scheduled</strong>
    <span className="font-semibold">{summary.eligible_work_orders} work orders</span>
    <span className="font-semibold">{summary.eligible_pm_tasks} PM tasks</span>
    <span className="font-semibold">{summary.deferred_items + summary.blocked_work_orders} held out</span>
    <p className="leading-6 text-[#51636a] sm:col-span-4">{summary.message}</p>
  </div>
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

  return <div className="rounded-[1.35rem] border border-[rgba(16,35,42,0.1)] bg-white/82 p-4 shadow-[0_12px_32px_rgba(16,35,42,0.06)]">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-700">{scheduledTime || 'TBD'}</p>
        <h4 className="font-display mt-1 font-extrabold tracking-tight text-[#10232a]">{title}</h4>
      </div>
      <Badge kind={kind}>{wo?.normalized_priority || 'PM'}</Badge>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#6c7c80]">
        Crew
        <select disabled={disabled || !canEdit} value={teamId} onChange={(event) => setTeamId(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#10232a]">
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#6c7c80]">
        Time
        <input disabled={disabled || !canEdit} type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#10232a]" />
      </label>
    </div>

    <label className="mt-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#6c7c80]">
      Notes / warnings
      <textarea disabled={disabled || !canEdit} value={notes} onChange={(event) => setNotes(event.target.value)} className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#405157]" />
    </label>

    {canEdit && <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={disabled} onClick={() => onUpdate(item.id, { team_id: Number(teamId), scheduled_time: scheduledTime, notes })} className="inline-flex items-center gap-1 rounded-xl bg-[#10232a] px-3 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#0b4c57] disabled:cursor-wait disabled:opacity-60">
        <Save size={14} /> Save override
      </button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: Math.max(0, item.order_index - 1) })} className="rounded-xl border border-[rgba(16,35,42,0.12)] bg-white/75 px-3 py-2 text-xs font-extrabold text-[#405157] transition hover:-translate-y-0.5 hover:bg-cyan-50 disabled:opacity-50">Move earlier</button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: item.order_index + 1 })} className="rounded-xl border border-[rgba(16,35,42,0.12)] bg-white/75 px-3 py-2 text-xs font-extrabold text-[#405157] transition hover:-translate-y-0.5 hover:bg-cyan-50 disabled:opacity-50">Move later</button>
    </div>}
  </div>
}

export function DispatchBuilder({ schedule, teams, working, canEdit, onSuggest, onUpdate }: { schedule: DispatchSchedule | null; teams: Team[]; working: boolean; canEdit: boolean; onSuggest: () => Promise<void>; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void> }) {
  const groupedSchedule = useMemo(() => {
    const groups: Record<string, DispatchItem[]> = {}
    schedule?.items.forEach((item) => {
      groups[item.team_name] ||= []
      groups[item.team_name].push(item)
    })
    Object.values(groups).forEach((items) => items.sort((a, b) => a.order_index - b.order_index))
    return groups
  }, [schedule])

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Morning plan"
      title="Dispatch Builder"
      description={canEdit ? 'Suggestions are a draft. John/admin can change crew, time, order, and notes before copying WhatsApp.' : 'Viewer access can inspect the draft, but cannot change crew, time, order, or notes.'}
      action={canEdit && <button disabled={working} onClick={onSuggest} className="rounded-2xl bg-[#10232a] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(16,35,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#0b4c57] disabled:cursor-wait disabled:opacity-60">Regenerate Draft</button>}
    />
    {!schedule ? (
      <div className="p-8 text-center text-[#5c6b70]">{canEdit ? <>Click <strong>Suggest Today&apos;s Schedule</strong> to generate a draft dispatch plan.</> : 'No draft schedule is loaded yet.'}</div>
    ) : (
      <div className="space-y-4 p-4">
        <ScheduleSummary summary={schedule.summary} />
        {Object.entries(groupedSchedule).map(([team, items]) => (
          <div key={team} className="rounded-[1.55rem] border border-[rgba(16,35,42,0.1)] bg-[#f4faf9]/75 p-4">
            <h3 className="font-display font-extrabold tracking-tight text-[#10232a]">{team}</h3>
            <div className="mt-3 space-y-3">
              {items.map((item) => <DispatchCard key={`${item.id}-${item.team_id}-${item.scheduled_time}-${item.notes}`} item={item} teams={teams} disabled={working} canEdit={canEdit} onUpdate={onUpdate} />)}
            </div>
          </div>
        ))}
      </div>
    )}
  </Card>
}
