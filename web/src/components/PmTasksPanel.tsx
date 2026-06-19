import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Building2, CalendarPlus, CheckCircle2, ClipboardList, FileSpreadsheet, LayoutGrid, ListChecks, Plus, RefreshCw, X } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { PmFrequency, PmTask, PmTaskInput, PmTaskStatus, PmTemplate, PmTemplateGenerationPayload, PmTemplateInput, ServiceLine } from '../types'

const statusOptions: Array<{ value: '' | PmTaskStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'deferred', label: 'Deferred' },
]

const tradeOptions = ['General', 'Electrical', 'Plumbing', 'HVAC', 'Carpentry', 'Painting', 'Landscaping', 'Masonry']
const regionOptions = ['North', 'Central', 'South', 'Islandwide', 'Unknown']
const frequencyOptions: Array<{ value: PmFrequency; label: string; detail: string }> = [
  { value: 'monthly', label: 'Monthly', detail: 'normal Mobil checklist' },
  { value: 'quarterly', label: 'Quarterly', detail: 'optional this month' },
  { value: 'biannual', label: 'Biannual', detail: 'optional this month' },
  { value: 'annual', label: 'Annual', detail: 'optional this month' },
]

const DEFAULT_TEMPLATE_ITEMS = [
  'Electrical Inspection\tElectrical\tmonthly\t45',
  'Generator Inspection\tGeneral\tmonthly\t45',
  'Smoke Detector Inspection\tElectrical\tmonthly\t45',
  'Airconditioning, Refrigeration & Walk in Cooler\tHVAC\tmonthly\t45',
  'Water System Inspection\tPlumbing\tmonthly\t45',
  'Landscaping Inspection\tLandscaping\tmonthly\t45',
  'Gen. Bldg & T. Shutter Ins.\tGeneral\tmonthly\t45',
  'Bollards and Pay Gas N Go Touch up paint (Monthly)\tPainting\tmonthly\t45',
].join('\n')

type BulkResult = { created_count: number; duplicate_count: number }

type PmTasksPanelProps = {
  pmTasks: PmTask[]
  pmTemplates: PmTemplate[]
  serviceLines: ServiceLine[]
  canEdit: boolean
  savingPmTaskId: number | null
  selectedDate: string
  onUpdate: (pmTaskId: number, changes: Record<string, unknown>) => Promise<void>
  onCreate: (values: PmTaskInput) => Promise<void>
  onBulkCreate: (values: PmTaskInput[]) => Promise<BulkResult | void>
  onCompleteStation: (pmTaskIds: number[], changes?: Record<string, unknown>) => Promise<void>
  onCreateTemplate: (values: PmTemplateInput) => Promise<PmTemplate | void>
  onPreviewTemplate: (templateId: number, values: { month: string; frequencies: string[]; location_ids?: number[]; item_ids?: number[] }) => Promise<PmTemplateGenerationPayload>
  onGenerateTemplate: (templateId: number, values: { month: string; frequencies: string[]; location_ids?: number[]; item_ids?: number[] }) => Promise<PmTemplateGenerationPayload | void>
}

function statusLabel(status: PmTaskStatus) {
  return status.replaceAll('_', ' ')
}

function shortDate(value?: string | null) {
  if (!value) return 'Not set'
  return value.slice(0, 10)
}

function datetimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function datetimeLocalToIso(value?: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function shortDateTime(value?: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ')
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function durationLabel(minutes?: number | null) {
  if (!minutes) return 'Duration not set'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder} min`
  if (remainder === 0) return `${hours} hr${hours === 1 ? '' : 's'}`
  return `${hours} hr ${remainder} min`
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

function splitColumns(line: string) {
  return (line.includes('\t') ? line.split('\t') : line.split(',')).map((part) => part.trim())
}

function parsePastedRows(text: string, selectedDate: string): PmTaskInput[] {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = splitColumns(line)
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

function parseStations(text: string): PmTemplateInput['locations'] {
  const seen = new Set<string>()
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, region] = splitColumns(line)
      return { name: name || '', region: region || 'Unknown' }
    })
    .filter((station) => {
      const key = station.name.toLowerCase().trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function parseTemplateItems(text: string): PmTemplateInput['items'] {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [task, trade, frequency, minutes, ...notes] = splitColumns(line)
      const normalizedFrequency = (frequency || 'monthly') as PmFrequency
      return {
        task_name: task || '',
        trade_category: trade || 'General',
        frequency: frequencyOptions.some((option) => option.value === normalizedFrequency) || normalizedFrequency === 'manual' ? normalizedFrequency : 'monthly',
        estimated_minutes: minutes || 45,
        notes: notes.join(' ') || undefined,
      }
    })
    .filter((item) => item.task_name)
}

function templateStationTextFromTasks(pmTasks: PmTask[]) {
  const seen = new Map<string, string>()
  pmTasks.forEach((pm) => {
    const key = pm.location.toLowerCase().trim()
    if (!seen.has(key)) seen.set(key, `${pm.location}\t${pm.region || 'Unknown'}`)
  })
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b)).join('\n')
}

function progressLabel(done: number, total: number) {
  if (total === 0) return 'No PMs'
  return `${done}/${total} complete`
}

function completionPercent(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

type StationTiming = { time_in_at: string; time_out_at: string }

function stationKey(location: string, region: string) {
  return `${location}::${region}`
}

function timingPayload(values: StationTiming) {
  const payload: Record<string, string> = {}
  const timeIn = datetimeLocalToIso(values.time_in_at)
  const timeOut = datetimeLocalToIso(values.time_out_at)
  if (timeIn) payload.time_in_at = timeIn
  if (timeOut) payload.time_out_at = timeOut
  return payload
}

function PmTimeEditor({ pm, canEdit, saving, onUpdate }: { pm: PmTask; canEdit: boolean; saving: boolean; onUpdate: (pmTaskId: number, changes: Record<string, unknown>) => Promise<void> }) {
  const [timeIn, setTimeIn] = useState(() => datetimeLocalValue(pm.time_in_at))
  const [timeOut, setTimeOut] = useState(() => datetimeLocalValue(pm.time_out_at))
  const changed = timeIn !== datetimeLocalValue(pm.time_in_at) || timeOut !== datetimeLocalValue(pm.time_out_at)

  return <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#244393]">JCF time</p>
      <p className="text-xs font-bold text-[#64748b]">{shortDateTime(pm.time_in_at)} → {shortDateTime(pm.time_out_at)} · {durationLabel(pm.actual_duration_minutes)}</p>
    </div>
    {canEdit && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.1em] text-[#64748b]">Time in<input type="datetime-local" value={timeIn} onChange={(event) => setTimeIn(event.target.value)} className="field-control mt-1 w-full rounded-lg px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-[#172033]" /></label>
      <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.1em] text-[#64748b]">Time out<input type="datetime-local" value={timeOut} onChange={(event) => setTimeOut(event.target.value)} className="field-control mt-1 w-full rounded-lg px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-[#172033]" /></label>
      <div className="flex items-end"><button type="button" disabled={saving || !changed} onClick={() => void onUpdate(pm.id, { time_in_at: datetimeLocalToIso(timeIn) || '', time_out_at: datetimeLocalToIso(timeOut) || '' })} className="w-full rounded-lg border border-[#244393]/15 bg-[#e8eefc] px-3 py-1.5 text-xs font-extrabold text-[#244393] transition hover:bg-[#dfe8ff] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">Save time</button></div>
    </div>}
  </div>
}

export function PmTasksPanel({ pmTasks, pmTemplates, serviceLines, canEdit, savingPmTaskId, selectedDate, onUpdate, onCreate, onBulkCreate, onCompleteStation, onCreateTemplate, onPreviewTemplate, onGenerateTemplate }: PmTasksPanelProps) {
  const [statusFilter, setStatusFilter] = useState<'' | PmTaskStatus>('')
  const [regionFilter, setRegionFilter] = useState('')
  const [viewMode, setViewMode] = useState<'station' | 'list'>('station')
  const [showNewForm, setShowNewForm] = useState(false)
  const [showMonthSetup, setShowMonthSetup] = useState(false)
  const [showTemplateSetup, setShowTemplateSetup] = useState(false)
  const [showTemplateGenerator, setShowTemplateGenerator] = useState(false)
  const [newPm, setNewPm] = useState<PmTaskInput>(() => emptyPmForm(selectedDate))
  const [pasteText, setPasteText] = useState('')
  const [parsedRows, setParsedRows] = useState<PmTaskInput[]>([])
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const [savingCreate, setSavingCreate] = useState(false)
  const [templateBusy, setTemplateBusy] = useState(false)
  const [templateName, setTemplateName] = useState('Mobil Monthly PMs')
  const [templateClient, setTemplateClient] = useState('Mobil')
  const [templateServiceLineId, setTemplateServiceLineId] = useState<string>('')
  const [templateStationsText, setTemplateStationsText] = useState('')
  const [templateItemsText, setTemplateItemsText] = useState(DEFAULT_TEMPLATE_ITEMS)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>(pmTemplates[0]?.id || '')
  const [selectedFrequencies, setSelectedFrequencies] = useState<PmFrequency[]>(['monthly'])
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])
  const [templatePreview, setTemplatePreview] = useState<PmTemplateGenerationPayload | null>(null)
  const [generationResult, setGenerationResult] = useState<PmTemplateGenerationPayload | null>(null)
  const [stationTimings, setStationTimings] = useState<Record<string, StationTiming>>({})

  const selectedTemplate = useMemo(() => pmTemplates.find((template) => template.id === selectedTemplateId) || pmTemplates[0] || null, [pmTemplates, selectedTemplateId])
  const regions = useMemo(() => Array.from(new Set(pmTasks.map((pm) => pm.region).filter(Boolean))).sort(), [pmTasks])
  const filteredPmTasks = useMemo(() => pmTasks.filter((pm) => (!statusFilter || pm.status === statusFilter) && (!regionFilter || pm.region === regionFilter)), [pmTasks, regionFilter, statusFilter])
  const incomplete = pmTasks.filter((pm) => pm.status !== 'completed')
  const completed = pmTasks.filter((pm) => pm.status === 'completed')
  const stationGroups = useMemo(() => {
    const groups = new Map<string, { location: string; region: string; tasks: PmTask[] }>()
    filteredPmTasks.forEach((pm) => {
      const key = `${pm.location}::${pm.region}`
      const existing = groups.get(key) || { location: pm.location, region: pm.region, tasks: [] }
      existing.tasks.push(pm)
      groups.set(key, existing)
    })
    return Array.from(groups.values()).sort((a, b) => a.location.localeCompare(b.location))
  }, [filteredPmTasks])
  const selectedLocationIdsForRequest = selectedTemplate ? (selectedLocationIds.length > 0 ? selectedLocationIds : selectedTemplate.locations.filter((location) => location.active).map((location) => location.id)) : []
  const selectedItemIdsForRequest = selectedTemplate ? (selectedItemIds.length > 0 ? selectedItemIds : selectedTemplate.items.filter((item) => item.active && selectedFrequencies.includes(item.frequency)).map((item) => item.id)) : []

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
      if (result?.created_count) setPasteText('')
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

  function stationTimingFor(key: string) {
    return stationTimings[key] || { time_in_at: '', time_out_at: '' }
  }

  function updateStationTiming(key: string, field: keyof StationTiming, value: string) {
    setStationTimings((current) => ({ ...current, [key]: { ...stationTimingFor(key), [field]: value } }))
  }

  async function completeStation(key: string, tasks: PmTask[]) {
    const ids = tasks.filter((task) => task.status !== 'completed').map((task) => task.id)
    if (ids.length === 0) return
    await onCompleteStation(ids, timingPayload(stationTimings[key] || { time_in_at: '', time_out_at: '' }))
  }

  function resetTemplateSelection(template: PmTemplate | null) {
    setTemplatePreview(null)
    setGenerationResult(null)
    setSelectedLocationIds(template?.locations.filter((location) => location.active).map((location) => location.id) || [])
    setSelectedItemIds(template?.items.filter((item) => item.active && selectedFrequencies.includes(item.frequency)).map((item) => item.id) || [])
  }

  function toggleFrequency(frequency: PmFrequency) {
    setTemplatePreview(null)
    setGenerationResult(null)
    setSelectedFrequencies((current) => current.includes(frequency) ? current.filter((item) => item !== frequency) : [...current, frequency])
    setSelectedItemIds([])
  }

  function toggleLocation(locationId: number) {
    if (!selectedTemplate) return
    setTemplatePreview(null)
    setGenerationResult(null)
    const allIds = selectedTemplate.locations.filter((location) => location.active).map((location) => location.id)
    const currentIds = selectedLocationIds.length > 0 ? selectedLocationIds : allIds
    setSelectedLocationIds(currentIds.includes(locationId) ? currentIds.filter((id) => id !== locationId) : [...currentIds, locationId])
  }

  function toggleItem(itemId: number) {
    if (!selectedTemplate) return
    setTemplatePreview(null)
    setGenerationResult(null)
    const allIds = selectedTemplate.items.filter((item) => item.active && selectedFrequencies.includes(item.frequency)).map((item) => item.id)
    const currentIds = selectedItemIds.length > 0 ? selectedItemIds : allIds
    setSelectedItemIds(currentIds.includes(itemId) ? currentIds.filter((id) => id !== itemId) : [...currentIds, itemId])
  }

  async function submitTemplate(event: FormEvent) {
    event.preventDefault()
    const locations = parseStations(templateStationsText)
    const items = parseTemplateItems(templateItemsText)
    setTemplateBusy(true)
    try {
      const created = await onCreateTemplate({ name: templateName, client: templateClient, service_line_id: templateServiceLineId || null, locations, items })
      if (created) {
        setSelectedTemplateId(created.id)
        resetTemplateSelection(created)
        setShowTemplateSetup(false)
        setShowTemplateGenerator(true)
      }
    } finally {
      setTemplateBusy(false)
    }
  }

  async function previewTemplateGeneration() {
    if (!selectedTemplate) return
    setTemplateBusy(true)
    setGenerationResult(null)
    try {
      const payload = await onPreviewTemplate(selectedTemplate.id, { month: monthString(selectedDate), frequencies: selectedFrequencies, location_ids: selectedLocationIdsForRequest, item_ids: selectedItemIdsForRequest })
      setTemplatePreview(payload)
    } finally {
      setTemplateBusy(false)
    }
  }

  async function generateTemplatePms() {
    if (!selectedTemplate) return
    setTemplateBusy(true)
    try {
      const payload = await onGenerateTemplate(selectedTemplate.id, { month: monthString(selectedDate), frequencies: selectedFrequencies, location_ids: selectedLocationIdsForRequest, item_ids: selectedItemIdsForRequest })
      if (payload) {
        setGenerationResult(payload)
        setTemplatePreview(null)
      }
    } finally {
      setTemplateBusy(false)
    }
  }

  function hydrateStationsFromVisiblePms() {
    setTemplateStationsText(templateStationTextFromTasks(pmTasks))
  }

  const templateAction = <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
    {canEdit && <>
      <button onClick={() => { setShowTemplateGenerator((value) => !value); if (!selectedTemplateId && pmTemplates[0]) setSelectedTemplateId(pmTemplates[0].id) }} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#172b63] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(23,43,99,0.22)] transition hover:-translate-y-0.5 hover:bg-[#244393] sm:w-auto"><ListChecks size={17} /> Generate From Template</button>
      <button onClick={() => setShowTemplateSetup((value) => !value)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2.5 text-sm font-extrabold text-[#244393] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#dfe8ff] sm:w-auto"><Building2 size={17} /> PM Template</button>
      <button onClick={() => setShowMonthSetup((value) => !value)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-white px-4 py-2.5 text-sm font-extrabold text-[#244393] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#e8eefc] sm:w-auto"><ClipboardList size={17} /> Paste Rows</button>
      <button onClick={() => setShowNewForm((value) => !value)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#df3f32] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(223,63,50,0.24)] transition hover:-translate-y-0.5 hover:bg-[#c83328] sm:w-auto"><Plus size={17} /> New PM</button>
    </>}
    <div className="grid w-full grid-cols-3 gap-2 text-center text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[#64748b] sm:w-auto sm:text-xs sm:tracking-[0.1em]">
      <span className="rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-2 py-2 text-[#244393] sm:px-3">{pmTasks.length} total</span>
      <span className="rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900 sm:px-3">{incomplete.length} incomplete</span>
      <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-emerald-800 sm:px-3">{completed.length} done</span>
    </div>
  </div>

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Preventive maintenance"
      title={`PM Month Tracker · ${monthString(selectedDate)}`}
      description="Track station completion, JCF time, exceptions, and remaining monthly obligations. Template generation stays available for month setup without making PMs forced dispatch items."
      action={templateAction}
    />

    {canEdit && showTemplateGenerator && <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold text-[#172033]">Generate {monthString(selectedDate)} PMs from a template</p>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#64748b]">Use this for John's monthly Mobil workflow: choose the month, reuse the station checklist, preview duplicates, then create the full PM month in one click.</p>
        </div>
        <button type="button" onClick={() => setShowTemplateGenerator(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-[#64748b] transition hover:bg-slate-50"><X size={18} /></button>
      </div>

      {pmTemplates.length === 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">No PM templates yet. Create the Mobil Monthly PM template first, then generate the month.</div> : <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-3 rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_12px_26px_rgba(36,67,147,0.06)]">
          <label className="block text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Template<select value={selectedTemplate?.id || ''} onChange={(event) => { const next = pmTemplates.find((template) => template.id === Number(event.target.value)) || null; setSelectedTemplateId(next?.id || ''); resetTemplateSelection(next) }} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]">{pmTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          {selectedTemplate && <div className="grid gap-2 text-xs font-bold text-[#64748b] sm:grid-cols-3">
            <span className="rounded-xl bg-[#f8faff] px-3 py-2">{selectedTemplate.client}</span>
            <span className="rounded-xl bg-[#f8faff] px-3 py-2">{selectedTemplate.locations.filter((location) => location.active).length} stations</span>
            <span className="rounded-xl bg-[#f8faff] px-3 py-2">{selectedTemplate.items.filter((item) => item.active).length} PM items</span>
          </div>}
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Include frequencies</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {frequencyOptions.map((option) => <label key={option.value} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-xs transition ${selectedFrequencies.includes(option.value) ? 'border-[#244393] bg-[#e8eefc] text-[#172033]' : 'border-slate-200 bg-white text-[#64748b]'}`}>
                <input type="checkbox" checked={selectedFrequencies.includes(option.value)} onChange={() => toggleFrequency(option.value)} className="mt-0.5 accent-[#244393]" />
                <span><span className="font-display block font-extrabold">{option.label}</span><span className="font-semibold">{option.detail}</span></span>
              </label>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={templateBusy || !selectedTemplate || selectedFrequencies.length === 0} onClick={() => void previewTemplateGeneration()} className="inline-flex items-center gap-2 rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2 text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet size={16} /> Preview</button>
            <button type="button" disabled={templateBusy || !selectedTemplate || selectedFrequencies.length === 0 || (templatePreview?.summary.new_count === 0)} onClick={() => void generateTemplatePms()} className="inline-flex items-center gap-2 rounded-xl bg-[#16835f] px-4 py-2 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-50">{templateBusy ? <RefreshCw className="animate-spin" size={16} /> : <CalendarPlus size={16} />} Generate PMs</button>
          </div>
          {generationResult && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Created {generationResult.summary.created_count || 0} PMs. Skipped {generationResult.summary.duplicate_count} duplicates.</p>}
        </div>

        {selectedTemplate && <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Stations</p><button type="button" onClick={() => setSelectedLocationIds(selectedTemplate.locations.filter((location) => location.active).map((location) => location.id))} className="text-xs font-extrabold text-[#244393]">Select all</button></div>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {selectedTemplate.locations.filter((location) => location.active).map((location) => <label key={location.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 bg-[#fbfcff] px-3 py-2 text-sm font-semibold text-[#526071]"><input type="checkbox" checked={selectedLocationIdsForRequest.includes(location.id)} onChange={() => toggleLocation(location.id)} className="accent-[#244393]" /><span>{location.name}</span><span className="ml-auto text-xs text-[#7b8798]">{location.region}</span></label>)}
            </div>
          </div>
          <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">PM items</p><button type="button" onClick={() => setSelectedItemIds(selectedTemplate.items.filter((item) => item.active && selectedFrequencies.includes(item.frequency)).map((item) => item.id))} className="text-xs font-extrabold text-[#244393]">Select all</button></div>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {selectedTemplate.items.filter((item) => item.active && selectedFrequencies.includes(item.frequency)).map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-100 bg-[#fbfcff] px-3 py-2 text-sm font-semibold text-[#526071]"><input type="checkbox" checked={selectedItemIdsForRequest.includes(item.id)} onChange={() => toggleItem(item.id)} className="mt-1 accent-[#244393]" /><span><span className="block text-[#172033]">{item.task_name}</span><span className="text-xs text-[#7b8798]">{item.trade_category} · {item.frequency} · {item.estimated_minutes} min</span></span></label>)}
            </div>
          </div>
        </div>}
      </div>}

      {templatePreview && <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-3">
        <div className="mb-3 grid gap-2 sm:grid-cols-5">
          <span className="rounded-xl bg-[#e8eefc] px-3 py-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-[#244393]">{templatePreview.summary.candidate_count} candidates</span>
          <span className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-emerald-800">{templatePreview.summary.new_count || 0} new</span>
          <span className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-amber-900">{templatePreview.summary.duplicate_count} duplicates</span>
          <span className="rounded-xl bg-[#f8faff] px-3 py-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-[#64748b]">{templatePreview.summary.station_count} stations</span>
          <span className="rounded-xl bg-[#f8faff] px-3 py-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-[#64748b]">Due {templatePreview.period.due_on}</span>
        </div>
        <div className="max-h-80 overflow-auto rounded-xl border border-slate-100">
          {templatePreview.rows?.map((row, index) => <div key={`${row.location_id}-${row.item_id}-${index}`} className="grid gap-1 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <span className="font-display font-extrabold text-[#172033]">{row.location}</span>
            <span className="font-semibold text-[#526071]">{row.task_name}</span>
            <Badge kind={row.duplicate ? 'waiting' : 'closed'}>{row.duplicate ? 'Duplicate' : 'New'}</Badge>
          </div>)}
        </div>
      </div>}
    </div>}

    {canEdit && showTemplateSetup && <form onSubmit={(event) => void submitTemplate(event)} className="border-b border-[rgba(23,32,51,0.1)] bg-white p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold text-[#172033]">Build a reusable PM template</p>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#64748b]">Set up stations and PM checklist once. Next month, John or George can generate the full PM month without entering 140 records by hand.</p>
        </div>
        <button type="button" onClick={() => setShowTemplateSetup(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-[#64748b] transition hover:bg-slate-50"><X size={18} /></button>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Template name<input required value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Client<input required value={templateClient} onChange={(event) => setTemplateClient(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Service line<select value={templateServiceLineId} onChange={(event) => setTemplateServiceLineId(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]"><option value="">Optional</option>{serviceLines.filter((line) => line.active).map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
        <div className="flex items-end"><button type="button" onClick={hydrateStationsFromVisiblePms} className="w-full rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-3 py-2.5 text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5">Use visible PM stations</button></div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="block text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Stations <span className="normal-case tracking-normal text-[#7b8798]">one per line: Station, Region</span><textarea required value={templateStationsText} onChange={(event) => setTemplateStationsText(event.target.value)} rows={9} placeholder={'Yigo North\tNorth\nYigo P.A.\tNorth\nAirport\tCentral'} className="field-control mt-1 w-full rounded-2xl px-4 py-3 text-sm font-semibold leading-6 normal-case tracking-normal text-[#172033]" /></label>
        <label className="block text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">PM checklist <span className="normal-case tracking-normal text-[#7b8798]">Task, Trade, Frequency, Minutes</span><textarea required value={templateItemsText} onChange={(event) => setTemplateItemsText(event.target.value)} rows={9} className="field-control mt-1 w-full rounded-2xl px-4 py-3 text-sm font-semibold leading-6 normal-case tracking-normal text-[#172033]" /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={templateBusy} className="inline-flex items-center gap-2 rounded-xl bg-[#16835f] px-4 py-2.5 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-50">{templateBusy ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Save PM template</button>
        <span className="rounded-xl border border-blue-100 bg-[#f8faff] px-3 py-2.5 text-xs font-bold text-[#64748b]">Parsed: {parseStations(templateStationsText).length} stations · {parseTemplateItems(templateItemsText).length} PM items</span>
      </div>
    </form>}

    {canEdit && showNewForm && <form onSubmit={(event) => void submitNewPm(event)} className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><p className="font-display text-lg font-extrabold text-[#172033]">Add one PM</p><p className="text-sm font-semibold text-[#64748b]">Use this for corrections, last-minute PMs, or one station at a time.</p></div>
        <button type="button" onClick={() => setShowNewForm(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-[#64748b] transition hover:bg-slate-50"><X size={18} /></button>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Client<input value={newPm.client} onChange={(event) => updateNewPm('client', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b] md:col-span-2">Location<input required value={newPm.location} onChange={(event) => updateNewPm('location', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b] md:col-span-2">Task<input required value={newPm.task_name} onChange={(event) => updateNewPm('task_name', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
        <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Due date<input required type="date" value={newPm.scheduled_date} onChange={(event) => updateNewPm('scheduled_date', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033]" /></label>
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
            <div><p className="font-display text-lg font-extrabold text-[#172033]">Paste one-off PM rows for {monthString(selectedDate)}</p><p className="text-sm font-semibold text-[#64748b]">Use this for exceptions. For the normal 140 monthly PMs, use Generate From Template.</p></div>
            <button type="button" onClick={() => setShowMonthSetup(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-[#64748b] transition hover:bg-slate-50"><X size={18} /></button>
          </div>
          <textarea value={pasteText} onChange={(event) => handlePasteTextChange(event.target.value)} rows={8} placeholder={'2026-06-03\tYigo Mobil\tElectrical Inspection\tElectrical\tNorth\n2026-06-04\tAgat Mobil\tWater Systems PM\tPlumbing\tSouth'} className="field-control w-full rounded-2xl px-4 py-3 text-sm font-semibold leading-6 text-[#172033]" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={previewPaste} className="rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2 text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5">Preview rows</button>
            <button type="button" disabled={savingCreate || parsedRows.length === 0} onClick={() => void submitBulk()} className="rounded-xl bg-[#16835f] px-4 py-2 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-50">Save {parsedRows.length || ''} PMs</button>
          </div>
          {bulkResult && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Created {bulkResult.created_count} PMs. Skipped {bulkResult.duplicate_count} duplicate rows.</p>}
        </div>
        <div className="rounded-2xl border border-blue-100 bg-[#f8faff] p-3"><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#244393]">Review before saving</p><div className="max-h-72 overflow-auto rounded-xl border border-blue-100 bg-white">{parsedRows.length === 0 ? <p className="p-4 text-sm font-semibold text-[#64748b]">Preview parsed PM rows before saving exceptions.</p> : parsedRows.map((row, index) => <div key={`${row.location}-${row.task_name}-${index}`} className="border-b border-slate-100 p-3 last:border-b-0"><p className="font-display text-sm font-extrabold text-[#172033]">{row.location}</p><p className="text-sm font-semibold text-[#526071]">{row.task_name}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[#7b8798]">{row.scheduled_date} · {row.trade_category} · {row.region}</p></div>)}</div></div>
      </div>
    </div>}

    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[180px_180px_1fr_auto]">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | PmTaskStatus)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">{statusOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}</select>
        <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]"><option value="">All regions</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select>
        <p className="rounded-xl border border-blue-100 bg-[#f8faff] px-3 py-2 text-sm font-semibold text-[#526071]">Incomplete PMs at the same location as a work order can be added automatically as while-you're-there suggestions. Late-month pressure pulls remaining PMs forward.</p>
        <button type="button" onClick={() => setViewMode((mode) => mode === 'station' ? 'list' : 'station')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#244393]/15 bg-white px-3 py-2 text-sm font-extrabold text-[#244393] transition hover:bg-[#e8eefc]">{viewMode === 'station' ? <LayoutGrid size={16} /> : <ListChecks size={16} />}{viewMode === 'station' ? 'List view' : 'Station view'}</button>
      </div>
    </div>

    {viewMode === 'station' ? <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-2">
      {stationGroups.length === 0 && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071] xl:col-span-2">No PM tasks match the current month filters.</p>}
      {stationGroups.map((group) => {
        const done = group.tasks.filter((pm) => pm.status === 'completed').length
        const percent = completionPercent(done, group.tasks.length)
        const key = stationKey(group.location, group.region)
        const timing = stationTimingFor(key)
        return <article key={key} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#f8faff] to-white p-3 shadow-[0_10px_26px_rgba(36,67,147,0.08)] sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#244393]">{group.region}</p><h3 className="font-display mt-1 text-lg font-extrabold tracking-tight text-[#172033]">{group.location}</h3><p className="mt-1 text-sm font-semibold text-[#64748b]">{progressLabel(done, group.tasks.length)}</p></div>
            {canEdit && <button disabled={savingPmTaskId !== null || done === group.tasks.length} onClick={() => void completeStation(key, group.tasks)} className="inline-flex items-center gap-2 rounded-xl bg-[#16835f] px-3 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 size={14} /> Mark station done</button>}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-[#244393]" style={{ width: `${percent}%` }} /></div>
          <div className="mt-3 rounded-2xl border border-[#244393]/10 bg-white/85 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#244393]">Station JCF time</p><p className="text-xs font-bold text-[#64748b]">Applies to all incomplete PMs when marking this station done.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.1em] text-[#64748b]">Time in<input type="datetime-local" disabled={!canEdit || savingPmTaskId !== null || done === group.tasks.length} value={timing.time_in_at} onChange={(event) => updateStationTiming(key, 'time_in_at', event.target.value)} className="field-control mt-1 w-full rounded-lg px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-[#172033] disabled:bg-slate-50" /></label>
              <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.1em] text-[#64748b]">Time out<input type="datetime-local" disabled={!canEdit || savingPmTaskId !== null || done === group.tasks.length} value={timing.time_out_at} onChange={(event) => updateStationTiming(key, 'time_out_at', event.target.value)} className="field-control mt-1 w-full rounded-lg px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-[#172033] disabled:bg-slate-50" /></label>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {group.tasks.sort((a, b) => a.task_name.localeCompare(b.task_name)).map((pm) => <div key={pm.id} className="rounded-xl border border-white bg-white/90 px-3 py-2 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-display text-sm font-extrabold text-[#172033]">{pm.task_name}</p><p className="mt-0.5 text-xs font-semibold text-[#7b8798]">Due {shortDate(pm.due_on || pm.scheduled_date)} · {pm.trade_category}{pm.estimated_minutes ? ` · ${pm.estimated_minutes} min` : ''}</p>{(pm.time_in_at || pm.time_out_at) && <p className="mt-1 text-xs font-bold text-[#244393]">JCF {shortDateTime(pm.time_in_at)} → {shortDateTime(pm.time_out_at)} · {durationLabel(pm.actual_duration_minutes)}</p>}</div><Badge kind={pm.status}>{statusLabel(pm.status)}</Badge></div>
              {canEdit && <div className="mt-2 flex flex-wrap gap-2"><button disabled={savingPmTaskId !== null || pm.status === 'completed'} onClick={() => void onUpdate(pm.id, { status: 'completed' })} className="rounded-lg bg-[#16835f] px-2.5 py-1.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">Complete</button><button disabled={savingPmTaskId !== null || pm.status === 'scheduled'} onClick={() => void onUpdate(pm.id, { status: 'scheduled' })} className="rounded-lg border border-[#244393]/15 bg-[#e8eefc] px-2.5 py-1.5 text-xs font-extrabold text-[#244393] disabled:cursor-not-allowed disabled:opacity-50">Scheduled</button><button disabled={savingPmTaskId !== null || pm.status === 'pending'} onClick={() => void onUpdate(pm.id, { status: 'pending' })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-extrabold text-[#526071] disabled:cursor-not-allowed disabled:opacity-50">Reset</button></div>}
            </div>)}
          </div>
        </article>
      })}
    </div> : <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
      {filteredPmTasks.length === 0 && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071] sm:col-span-2">No PM tasks match the current month filters.</p>}
      {filteredPmTasks.map((pm) => (
        <article key={pm.id} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#f8faff] to-white p-3 shadow-[0_10px_26px_rgba(36,67,147,0.08)] sm:p-4">
          <div className="flex flex-wrap items-center gap-2"><Badge kind="pm">PM</Badge><Badge kind={pm.status}>{statusLabel(pm.status)}</Badge><span className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#7b8798]">Due {shortDate(pm.due_on || pm.scheduled_date)}</span>{pm.pm_template_name && <Badge kind="scheduled">Template</Badge>}</div>
          <h3 className="font-display mt-3 font-extrabold tracking-tight text-[#172033]">{pm.location}</h3>
          <p className="mt-1 text-sm leading-6 text-[#526071]">{pm.task_name}</p>
          <div className="mt-3 grid gap-1 text-xs font-semibold text-[#7b8798] sm:grid-cols-2"><span>Region: {pm.region}</span><span>Trade: {pm.trade_category}</span><span>Completed: {shortDate(pm.completed_at)}</span><span>Deferred until: {shortDate(pm.deferred_until)}</span></div>
          {pm.notes && <p className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold leading-5 text-[#526071]">{pm.notes}</p>}
          <PmTimeEditor pm={pm} canEdit={canEdit} saving={savingPmTaskId !== null} onUpdate={onUpdate} />
          {canEdit && <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><button disabled={savingPmTaskId !== null || pm.status === 'scheduled'} onClick={() => void onUpdate(pm.id, { status: 'scheduled' })} className="rounded-xl border border-[#244393]/15 bg-white px-3 py-2 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-not-allowed disabled:opacity-50">Scheduled</button><button disabled={savingPmTaskId !== null || pm.status === 'completed'} onClick={() => void onUpdate(pm.id, { status: 'completed' })} className="rounded-xl bg-[#16835f] px-3 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:opacity-50">Complete</button><button disabled={savingPmTaskId !== null || pm.status === 'deferred'} onClick={() => void deferUntilNextMonth(pm)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">Defer</button><button disabled={savingPmTaskId !== null || pm.status === 'pending'} onClick={() => void onUpdate(pm.id, { status: 'pending' })} className="rounded-xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 text-xs font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Reset</button></div>}
        </article>
      ))}
    </div>}
  </Card>
}
