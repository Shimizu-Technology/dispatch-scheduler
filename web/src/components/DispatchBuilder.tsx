import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { Badge, Card } from './ui'
import type { DispatchItem, DispatchSchedule, DispatchSummary, Team } from '../types'

function ScheduleSummary({ summary }: { summary: DispatchSummary }) {
  return <div className="grid gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-950 sm:grid-cols-4">
    <strong>{summary.scheduled_items}{summary.daily_item_limit ? `/${summary.daily_item_limit}` : ''} scheduled</strong>
    <span>{summary.eligible_work_orders} work orders</span>
    <span>{summary.eligible_pm_tasks} PM tasks</span>
    <span>{summary.deferred_items + summary.blocked_work_orders} held out</span>
    <p className="sm:col-span-4">{summary.message}</p>
  </div>
}

function DispatchCard({ item, teams, disabled, onUpdate }: { item: DispatchItem; teams: Team[]; disabled: boolean; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void> }) {
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

  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-xs font-black text-cyan-700">{scheduledTime || 'TBD'}</p>
        <h4 className="font-bold text-slate-900">{title}</h4>
      </div>
      <Badge kind={kind}>{wo?.normalized_priority || 'PM'}</Badge>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
      <label className="text-xs font-bold text-slate-500">
        Crew
        <select disabled={disabled} value={teamId} onChange={(event) => setTeamId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-800">
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-500">
        Time
        <input disabled={disabled} type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-800" />
      </label>
    </div>

    <label className="mt-2 block text-xs font-bold text-slate-500">
      Notes / warnings
      <textarea disabled={disabled} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-700" />
    </label>

    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={disabled} onClick={() => onUpdate(item.id, { team_id: Number(teamId), scheduled_time: scheduledTime, notes })} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">
        <Save size={14} /> Save override
      </button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: Math.max(0, item.order_index - 1) })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Move earlier</button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: item.order_index + 1 })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Move later</button>
    </div>
  </div>
}

export function DispatchBuilder({ schedule, teams, working, onSuggest, onUpdate }: { schedule: DispatchSchedule | null; teams: Team[]; working: boolean; onSuggest: () => Promise<void>; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void> }) {
  const groupedSchedule = useMemo(() => {
    const groups: Record<string, DispatchItem[]> = {}
    schedule?.items.forEach((item) => {
      groups[item.team_name] ||= []
      groups[item.team_name].push(item)
    })
    Object.values(groups).forEach((items) => items.sort((a, b) => a.order_index - b.order_index))
    return groups
  }, [schedule])

  return <Card>
    <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-black">Dispatch Builder</h2>
        <p className="text-sm text-slate-500">Suggestions are a draft. John/admin can change crew, time, order, and notes before copying WhatsApp.</p>
      </div>
      <button disabled={working} onClick={onSuggest} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">Regenerate Draft</button>
    </div>
    {!schedule ? (
      <div className="p-8 text-center text-slate-500">Click <strong>Suggest Today's Schedule</strong> to generate a draft dispatch plan.</div>
    ) : (
      <div className="space-y-4 p-4">
        <ScheduleSummary summary={schedule.summary} />
        {Object.entries(groupedSchedule).map(([team, items]) => (
          <div key={team} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-black text-slate-900">{team}</h3>
            <div className="mt-3 space-y-3">
              {items.map((item) => <DispatchCard key={`${item.id}-${item.team_id}-${item.scheduled_time}-${item.notes}`} item={item} teams={teams} disabled={working} onUpdate={onUpdate} />)}
            </div>
          </div>
        ))}
      </div>
    )}
  </Card>
}
