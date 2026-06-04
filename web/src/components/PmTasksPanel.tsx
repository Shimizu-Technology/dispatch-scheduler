import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarPlus, ClipboardList, Plus, X } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { PmTask, PmTaskInput, PmTaskStatus } from '../types'

const statusOptions: Array<{ value: '' | PmTaskStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'deferred', label: 'Deferred' },
]

const tradeOptions = ['General', 'Electrical', 'Plumbing', 'HVAC', 'Carpentry', 'Painting', 'Landscaping', 'Masonry']
const regionOptions = ['North', 'Central', 'South', 'Islandwide', 'Unknown']

type BulkResult = { created_count: number; duplicate_count: number }

type PmTasksPanelProps = {
  pmTasks: PmTask[]
  canEdit: boolean
  savingPmTaskId: number | null
  selectedDate: string
  onUpdate: (pmTaskId: number, changes: Record<string, unknown>) => Promise<void>
  onCreate: (values: PmTaskInput) => Promise<void>
  onBulkCreate: (values: PmTaskInput[]) => Promise<BulkResult | void>
}

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

function emptyPmForm(selectedDate: string): PmTaskInput {
  return {
    client: 'Mobil',
    location: '',
    region: 'Unknown',
    task_name: '',
    trade_category: 'General',
    frequency: 'monthly',
    scheduled_date: selectedDate,
    notes: '',
  }
}

function parsePastedRows(text: string, selectedDate: string): PmTaskInput[] {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split(/\t|,/).map((part) => part.trim())
      const looksLikeDateFirst = /^\d{4}-\d{2}-\d{2}$/.test(columns[0] || '') || /^\d{1,2}\/\d{1,2}\/?\d{0,4}$/.test(columns[0] || '')
      const [date, location, task, trade, region, notes] = looksLikeDateFirst
        ? [columns[0], columns[1], columns[2], columns[3], columns[4], columns.slice(5).join(' ')]
        : [selectedDate, columns[0], columns[1], columns[2], columns[3], columns.slice(4).join(' ')]
      return {
        client: 'Mobil',
        location: location || '',
        task_name: task || '',
        trade_category: trade || 'General',
        region: region || 'Unknown',
        scheduled_date: normalizeDate(date || selectedDate, selectedDate),
        frequency: 'monthly',
        notes: notes || '',
      }
    })
    .filter((row) => row.location && row.task_name)
}

function normalizeDate(value: string, fallback: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const match = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!match) return fallback
  const fallbackYear = fallback.slice(0, 4)
  const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : fallbackYear
  const month = match[1].padStart(2, '0')
  const day = match[2].padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PmTasksPanel({ pmTasks, canEdit, savingPmTaskId, selectedDate, onUpdate, onCreate, onBulkCreate }: PmTasksPanelProps) {
  const [statusFilter, setStatusFilter] = useState<'' | PmTaskStatus>('')
  const [regionFilter, setRegionFilter] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [showMonthSetup, setShowMonthSetup] = useState(false)
  const [newPm, setNewPm] = useState<PmTaskInput>(() => emptyPmForm(selectedDate))
  const [pasteText, setPasteText] = useState('')
  const [parsedRows, setParsedRows] = useState<PmTaskInput[]>([])
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const [savingCreate, setSavingCreate] = useState(false)
  const regions = useMemo(() => Array.from(new Set(pmTasks.map((pm) => pm.region).filter(Boolean))).sort(), [pmTasks])
  const filteredPmTasks = useMemo(() => pmTasks.filter((pm) => (!statusFilter || pm.status === statusFilter) && (!regionFilter || pm.region === regionFilter)), [pmTasks, regionFilter, statusFilter])
  const incomplete = pmTasks.filter((pm) => pm.status !== 'completed')
  const completed = pmTasks.filter((pm) => pm.status === 'completed')

  function updateNewPm(field: keyof PmTaskInput, value: string) {
    setNewPm((current) => ({ ...current, [field]: value }))
  }

  async function submitNewPm(event: FormEvent) {
    event.preventDefault()
    setSavingCreate(true)
    setBulkResult(null)
    try {
      await onCreate(newPm)
      setNewPm(emptyPmForm(selectedDate))
      setShowNewForm(false)
    } finally {
      setSavingCreate(false)
    }
  }

  function handlePasteTextChange(value: string) {
    setPasteText(value)
    setParsedRows([])
    setBulkResult(null)
  }

  function previewPaste() {
    setBulkResult(null)
    setParsedRows(parsePastedRows(pasteText, selectedDate))
  }

  async function submitBulk() {
    if (parsedRows.length === 0) return
    setSavingCreate(true)
    try {
      const result = await onBulkCreate(parsedRows)
      setBulkResult(result || null)
      setParsedRows([])
      if (result?.created_count) {
        setPasteText('')
      }
    } finally {
      setSavingCreate(false)
    }
  }

  function deferUntilNextMonth(pm: PmTask) {
    const date = new Date(`${pm.scheduled_date}T00:00:00`)
    date.setMonth(date.getMonth() + 1, 1)
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
    return onUpdate(pm.id, { status: 'deferred', deferred_until: local })
  }

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Preventive maintenance"
      title={`PM Month Setup · ${monthString(selectedDate)}`}
      description="Load the month’s preventive work, track pending/completed stations, and keep same-location PMs available for while-you’re-there dispatch suggestions."
      action={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {canEdit && <>
          <button onClick={() => setShowMonthSetup((value) => !value)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-white px-4 py-2.5 text-sm font-extrabold text-[#244393] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#e8eefc] sm:w-auto"><ClipboardList size={17} /> Set Up Month</button>
          <button onClick={() => setShowNewForm((value) => !value)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#df3f32] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(223,63,50,0.24)] transition hover:-translate-y-0.5 hover:bg-[#c83328] sm:w-auto"><Plus size={17} /> New PM</button>
        </>}
        <div className="grid w-full grid-cols-3 gap-2 text-center text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[#64748b] sm:w-auto sm:text-xs sm:tracking-[0.1em]">
          <span className="rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-2 py-2 text-[#244393] sm:px-3">{pmTasks.length} total</span>
          <span className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 sm:px-3">{incomplete.length} incomplete</span>
          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-emerald-800 sm:px-3">{completed.length} done</span>
        </div>
      </div>}
    />

    {canEdit && showNewForm && <form onSubmit={(event) => void submitNewPm(event)} className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold text-[#172033]">Add one PM</p>
          <p className="text-sm font-semibold text-[#64748b]">Use this for corrections, last-minute PMs, or one station at a time.</p>
        </div>
        <button type="button" onClick={() => setShowNewForm(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-[#64748b] transition hover:bg-slate-50"><X size={18} /></button>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Client<input value={newPm.client} onChange={(event) => updateNewPm('client', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b] md:col-span-2">Location<input required value={newPm.location} onChange={(event) => updateNewPm('location', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b] md:col-span-2">Task<input required value={newPm.task_name} onChange={(event) => updateNewPm('task_name', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Date<input required type="date" value={newPm.scheduled_date} onChange={(event) => updateNewPm('scheduled_date', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Region<select value={newPm.region} onChange={(event) => updateNewPm('region', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]">{regionOptions.map((region) => <option key={region}>{region}</option>)}</select></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Trade<select value={newPm.trade_category} onChange={(event) => updateNewPm('trade_category', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]">{tradeOptions.map((trade) => <option key={trade}>{trade}</option>)}</select></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b] md:col-span-3 xl:col-span-4">Notes<input value={newPm.notes || ''} onChange={(event) => updateNewPm('notes', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <div className="flex items-end"><button disabled={savingCreate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#244393] px-4 py-2.5 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#1c3475] disabled:cursor-not-allowed disabled:opacity-50"><CalendarPlus size={17} /> Save PM</button></div>
      </div>
    </form>}

    {canEdit && showMonthSetup && <div className="border-b border-[rgba(23,32,51,0.1)] bg-white p-3 sm:p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-lg font-extrabold text-[#172033]">Set up PMs for {monthString(selectedDate)}</p>
              <p className="text-sm font-semibold text-[#64748b]">Paste rows from Excel. Supported order: Date, Location, Task, Trade, Region, Notes. If the first column is not a date, the app uses the selected schedule date.</p>
            </div>
            <button type="button" onClick={() => setShowMonthSetup(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-[#64748b] transition hover:bg-slate-50"><X size={18} /></button>
          </div>
          <textarea value={pasteText} onChange={(event) => handlePasteTextChange(event.target.value)} rows={8} placeholder={'2026-06-03\tYigo Mobil\tElectrical Inspection\tElectrical\tNorth\n2026-06-04\tAgat Mobil\tWater Systems PM\tPlumbing\tSouth'} className="field-control w-full rounded-2xl px-4 py-3 text-sm font-semibold leading-6 text-[#172033]" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={previewPaste} className="rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2 text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5">Preview rows</button>
            <button type="button" disabled={savingCreate || parsedRows.length === 0} onClick={() => void submitBulk()} className="rounded-xl bg-[#16835f] px-4 py-2 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-50">Save {parsedRows.length || ''} PMs</button>
          </div>
          {bulkResult && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Created {bulkResult.created_count} PMs. Skipped {bulkResult.duplicate_count} duplicate rows.</p>}
        </div>
        <div className="rounded-2xl border border-blue-100 bg-[#f8faff] p-3">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#244393]">Review before saving</p>
          <div className="max-h-72 overflow-auto rounded-xl border border-blue-100 bg-white">
            {parsedRows.length === 0 ? <p className="p-4 text-sm font-semibold text-[#64748b]">Preview parsed PM rows before saving the month.</p> : parsedRows.map((row, index) => <div key={`${row.location}-${row.task_name}-${index}`} className="border-b border-slate-100 p-3 last:border-b-0">
              <p className="font-display text-sm font-extrabold text-[#172033]">{row.location}</p>
              <p className="text-sm font-semibold text-[#526071]">{row.task_name}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[#7b8798]">{row.scheduled_date} · {row.trade_category} · {row.region}</p>
            </div>)}
          </div>
        </div>
      </div>
    </div>}

    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_180px_1fr]">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | PmTaskStatus)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {statusOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select>
        <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All regions</option>
          {regions.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
        <p className="rounded-xl border border-blue-100 bg-[#f8faff] px-3 py-2 text-sm font-semibold text-[#526071]">Incomplete PMs at the same location as a work order can be added automatically as while-you're-there suggestions.</p>
      </div>
    </div>
    <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
      {filteredPmTasks.length === 0 && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071] sm:col-span-2">No PM tasks match the current month filters.</p>}
      {filteredPmTasks.map((pm) => (
        <article key={pm.id} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#f8faff] to-white p-3 shadow-[0_10px_26px_rgba(36,67,147,0.08)] sm:p-4">
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
          {canEdit && <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
