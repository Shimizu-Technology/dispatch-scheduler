import { useMemo, useState } from 'react'
import { Badge, Card, PanelHeader } from './ui'
import type { PmTask, PmTaskStatus } from '../types'

const statusOptions: Array<{ value: '' | PmTaskStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'deferred', label: 'Deferred' },
]

function statusLabel(status: PmTaskStatus) {
  return status.replaceAll('_', ' ')
}

function shortDate(value?: string | null) {
  if (!value) return 'Not set'
  return value.slice(0, 10)
}

function monthString(dateString: string) {
  return dateString.slice(0, 7)
}

export function PmTasksPanel({ pmTasks, canEdit, savingPmTaskId, selectedDate, onUpdate }: { pmTasks: PmTask[]; canEdit: boolean; savingPmTaskId: number | null; selectedDate: string; onUpdate: (pmTaskId: number, changes: Record<string, unknown>) => Promise<void> }) {
  const [statusFilter, setStatusFilter] = useState<'' | PmTaskStatus>('')
  const [regionFilter, setRegionFilter] = useState('')
  const regions = useMemo(() => Array.from(new Set(pmTasks.map((pm) => pm.region))).sort(), [pmTasks])
  const filteredPmTasks = useMemo(() => pmTasks.filter((pm) => (!statusFilter || pm.status === statusFilter) && (!regionFilter || pm.region === regionFilter)), [pmTasks, regionFilter, statusFilter])
  const incomplete = pmTasks.filter((pm) => pm.status !== 'completed')
  const completed = pmTasks.filter((pm) => pm.status === 'completed')

  function deferUntilNextMonth(pm: PmTask) {
    const date = new Date(`${pm.scheduled_date}T00:00:00`)
    date.setMonth(date.getMonth() + 1, 1)
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
    return onUpdate(pm.id, { status: 'deferred', deferred_until: local })
  }

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Preventive maintenance"
      title={`PM Month Workflow · ${monthString(selectedDate)}`}
      description="Track monthly PM completion and keep incomplete station work visible for opportunistic dispatch suggestions."
      action={<div className="grid grid-cols-3 gap-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-[#64748b]">
        <span className="rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-3 py-2 text-[#244393]">{pmTasks.length} total</span>
        <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{incomplete.length} incomplete</span>
        <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{completed.length} done</span>
      </div>}
    />
    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_180px_1fr]">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | PmTaskStatus)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {statusOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select>
        <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All regions</option>
          {regions.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
        <p className="rounded-xl border border-blue-100 bg-[#f8faff] px-3 py-2 text-sm font-semibold text-[#526071]">Incomplete PMs at the same location as a work order can be added automatically as “while you’re there” suggestions.</p>
      </div>
    </div>
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {filteredPmTasks.length === 0 && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071] sm:col-span-2">No PM tasks match the current month filters.</p>}
      {filteredPmTasks.map((pm) => (
        <article key={pm.id} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#f8faff] to-white p-4 shadow-[0_10px_26px_rgba(36,67,147,0.08)]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge kind="pm">PM</Badge>
            <Badge kind={pm.status}>{statusLabel(pm.status)}</Badge>
            <span className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#7b8798]">{shortDate(pm.scheduled_date)}</span>
          </div>
          <h3 className="font-display mt-3 font-extrabold tracking-tight text-[#172033]">{pm.location}</h3>
          <p className="mt-1 text-sm leading-6 text-[#526071]">{pm.task_name}</p>
          <div className="mt-3 grid gap-1 text-xs font-semibold text-[#7b8798] sm:grid-cols-2">
            <span>Region: {pm.region}</span>
            <span>Trade: {pm.trade_category}</span>
            <span>Completed: {shortDate(pm.completed_at)}</span>
            <span>Deferred until: {shortDate(pm.deferred_until)}</span>
          </div>
          {pm.notes && <p className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#526071]">{pm.notes}</p>}
          {canEdit && <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={savingPmTaskId !== null || pm.status === 'scheduled'} onClick={() => void onUpdate(pm.id, { status: 'scheduled' })} className="rounded-xl border border-[#244393]/15 bg-white px-3 py-2 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-not-allowed disabled:opacity-50">Scheduled</button>
            <button disabled={savingPmTaskId !== null || pm.status === 'completed'} onClick={() => void onUpdate(pm.id, { status: 'completed' })} className="rounded-xl bg-[#16835f] px-3 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-50">Complete</button>
            <button disabled={savingPmTaskId !== null || pm.status === 'deferred'} onClick={() => void deferUntilNextMonth(pm)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">Defer</button>
            <button disabled={savingPmTaskId !== null || pm.status === 'pending'} onClick={() => void onUpdate(pm.id, { status: 'pending' })} className="rounded-xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 text-xs font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Reset</button>
          </div>}
        </article>
      ))}
    </div>
  </Card>
}
