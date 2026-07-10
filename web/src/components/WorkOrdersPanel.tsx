import { useEffect, useMemo, useState } from 'react'
import type { ClipboardEvent, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, ClipboardPaste, Edit3, FileUp, Plus, Search, Sparkles, X } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import { getJson, postForm, postJson } from '../lib/api'
import { mergeImportDrafts } from '../lib/importDrafts'
import type { OcrWorkOrderDraft, PaginationMeta, ServiceLine, WorkOrder, WorkOrderImportPreview, WorkOrderInput, WorkOrderStatus } from '../types'

const priorities = ['P1', 'P2', 'P3', 'P4']
const statuses: WorkOrderStatus[] = ['new', 'needs_assessment', 'approved', 'scheduled', 'in_progress', 'carry_over', 'waiting_for_parts', 'waiting_for_approval', 'completed', 'closed', 'cancelled']
const trades = ['General', 'Plumbing', 'HVAC', 'Electrical', 'Carpentry', 'Painting', 'Landscaping', 'Masonry']
const regions = ['North', 'Central', 'South', 'Islandwide', 'Unknown']
const sources = ['whatsapp', 'phone', 'email', 'mywork', 'sodexo', 'manual', 'upload', 'pasted_text', 'text_upload']
const DEFAULT_WORK_ORDER_QUERY = 'archived=active&page=1&per_page=50&sort=scheduled_date&direction=asc'

type ImportDraft = OcrWorkOrderDraft & { draftId: string }
type SlaStatusFilter = '' | 'overdue' | 'due_soon' | 'missing' | 'on_track'
type WorkOrderFilterState = {
  query: string
  status: string
  priority: string
  region: string
  archive: 'active' | 'archived' | 'all'
  serviceLine: string
  paProject: boolean
  correctiveMaintenance: boolean
  estimateRequired: boolean
  followUpDue: boolean
  openOnly: boolean
  closed: boolean
  slaStatus: SlaStatusFilter
  sort: string
  direction: 'asc' | 'desc'
}

function draftId(draft: OcrWorkOrderDraft, index: number) {
  if (draft.import_item_id) return `import-item-${draft.import_item_id}`
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${draft.external_id || draft.title || draft.description}-${index}-${Date.now()}`
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function shortDate(value?: string | null) {
  if (!value) return 'Not set'
  return value.slice(0, 10)
}

function workOrderFiltersFromQuery(queryString?: string): WorkOrderFilterState {
  const params = new URLSearchParams((queryString || '').replace(/^\?/, ''))
  const archived = params.get('archived')
  const direction = params.get('direction') === 'desc' ? 'desc' : 'asc'
  const slaStatus = params.get('sla_status') || ''
  return {
    query: params.get('q') || '',
    status: params.get('status') || '',
    priority: params.get('priority') || '',
    region: params.get('region') || '',
    archive: archived === 'only' || archived === 'archived' ? 'archived' : archived === 'all' ? 'all' : 'active',
    serviceLine: params.get('service_line_id') || '',
    paProject: params.get('pa_project') === 'true',
    correctiveMaintenance: params.get('corrective_maintenance') === 'true',
    estimateRequired: params.get('estimate_required') === 'true',
    followUpDue: params.get('follow_up_due') === 'true',
    openOnly: params.get('open') === 'true',
    closed: params.get('closed') === 'true',
    slaStatus: ['overdue', 'due_soon', 'missing', 'on_track'].includes(slaStatus) ? slaStatus as SlaStatusFilter : '',
    sort: params.get('sort') || 'scheduled_date',
    direction,
  }
}

function normalizedWorkOrderQuery(queryString?: string) {
  const params = new URLSearchParams((queryString || '').replace(/^\?/, ''))
  if (!params.get('archived')) params.set('archived', 'active')
  if (!params.get('page')) params.set('page', '1')
  if (!params.get('per_page')) params.set('per_page', '50')
  if (!params.get('sort')) params.set('sort', 'scheduled_date')
  if (!params.get('direction')) params.set('direction', 'asc')
  return params.toString()
}

function datetimeLocalNow() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function datetimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function shortDateTime(value?: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ')
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function datetimeLocalToIso(value?: string | null) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function slaLabel(workOrder: WorkOrder) {
  if (workOrder.pa_project && workOrder.sla_status === 'overdue') return 'PA follow-up'
  if ((workOrder.status === 'waiting_for_parts' || workOrder.status === 'waiting_for_approval') && workOrder.sla_status === 'overdue') return 'Blocked overdue'
  if (workOrder.sla_status === 'overdue') return 'KPI overdue'
  if (workOrder.sla_status === 'due_soon') return 'KPI due soon'
  if (workOrder.sla_status === 'missing') return 'KPI missing'
  return 'KPI on track'
}

function slaBadgeKind(workOrder: WorkOrder) {
  if (workOrder.pa_project && workOrder.sla_status === 'overdue') return 'waiting'
  if (workOrder.sla_status === 'overdue') return 'p1'
  if (workOrder.sla_status === 'due_soon' || workOrder.sla_status === 'missing') return 'waiting'
  return 'closed'
}

function statusTone(status: string) {
  if (status === 'needs_assessment') return 'border-blue-200 bg-blue-50 text-blue-900'
  if (status === 'scheduled') return 'border-indigo-200 bg-indigo-50 text-indigo-900'
  if (status === 'in_progress') return 'border-[#244393]/25 bg-[#eef3ff] text-[#172b63]'
  if (status === 'carry_over') return 'border-purple-200 bg-purple-50 text-purple-900'
  if (status === 'waiting_for_parts' || status === 'waiting_for_approval') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (status === 'closed') return 'border-slate-300 bg-slate-100 text-slate-800'
  if (status === 'cancelled') return 'border-slate-200 bg-slate-100 text-slate-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function statusSummary(status: string) {
  const summaries: Record<string, string> = {
    new: 'New request awaiting review',
    needs_assessment: 'Needs crew assessment',
    approved: 'Approved and ready to dispatch',
    scheduled: 'Assigned to dispatch',
    in_progress: 'Sent to crew',
    carry_over: 'Return visit needed',
    waiting_for_parts: 'Held for parts',
    waiting_for_approval: 'Held for approval',
    completed: 'Closed out',
    closed: 'Closed out',
    cancelled: 'Cancelled',
  }
  return summaries[status] || statusLabel(status)
}

function emptyForm(): WorkOrderInput {
  return {
    client: 'Mobil',
    location: '',
    region: 'Unknown',
    external_id: '',
    source: 'whatsapp',
    title: '',
    description: '',
    priority: 'P3',
    status: 'needs_assessment',
    trade_category: 'General',
    scheduled_date: '',
    notes: '',
    reported_at: datetimeLocalNow(),
    assessed_at: '',
    estimated_hours: '',
    required_technician_count: 1,
    service_line_id: '',
    pa_project: false,
    pa_project_notes: '',
    corrective_maintenance: false,
    estimate_required: false,
    estimate_number: '',
    parts_status: '',
    parts_ordered: false,
    parts_ordered_at: '',
    parts_eta: '',
    follow_up_due_on: '',
    follow_up_owner: '',
    vendor_reference: '',
    latest_follow_up_note: '',
  }
}

function formFromImportDraft(draft: ImportDraft): WorkOrderInput {
  return {
    ...draft,
    normalized_priority: draft.priority,
    original_status_text: draft.original_status_text || draft.status,
    scheduled_date: draft.scheduled_date || '',
    reported_at: draft.reported_at ? datetimeLocalValue(draft.reported_at) : datetimeLocalNow(),
    assessed_at: draft.assessed_at ? datetimeLocalValue(draft.assessed_at) : '',
    estimated_hours: draft.estimated_hours ?? '',
    required_technician_count: draft.required_technician_count || 1,
    pa_project: Boolean(draft.pa_project),
    pa_project_notes: draft.pa_project_notes || '',
    corrective_maintenance: Boolean(draft.corrective_maintenance),
    estimate_required: Boolean(draft.estimate_required),
    estimate_number: draft.estimate_number || '',
    parts_status: draft.parts_status || '',
    parts_ordered: Boolean(draft.parts_ordered),
    parts_ordered_at: draft.parts_ordered_at ? datetimeLocalValue(draft.parts_ordered_at) : '',
    parts_eta: draft.parts_eta || '',
    follow_up_due_on: draft.follow_up_due_on || '',
    follow_up_owner: draft.follow_up_owner || '',
    vendor_reference: draft.vendor_reference || '',
    latest_follow_up_note: draft.latest_follow_up_note || '',
  }
}

function formFromWorkOrder(workOrder: WorkOrder): WorkOrderInput {
  return {
    client: workOrder.client,
    location: workOrder.location,
    region: workOrder.region,
    external_id: workOrder.external_id || '',
    source: workOrder.source || 'manual',
    title: workOrder.title || '',
    description: workOrder.description || '',
    priority: workOrder.normalized_priority || workOrder.priority || 'P4',
    normalized_priority: workOrder.normalized_priority || workOrder.priority || 'P4',
    status: workOrder.status || 'new',
    original_status_text: workOrder.original_status_text || workOrder.status || 'Manual entry',
    trade_category: workOrder.trade_category || 'General',
    scheduled_date: workOrder.scheduled_date || '',
    notes: workOrder.notes || '',
    reported_at: datetimeLocalValue(workOrder.reported_at),
    assessed_at: datetimeLocalValue(workOrder.assessed_at),
    estimated_hours: workOrder.estimated_hours ?? '',
    required_technician_count: workOrder.required_technician_count || 1,
    service_line_id: workOrder.service_line_id || '',
    pa_project: workOrder.pa_project,
    pa_project_notes: workOrder.pa_project_notes || '',
    corrective_maintenance: workOrder.corrective_maintenance,
    estimate_required: workOrder.estimate_required,
    estimate_number: workOrder.estimate_number || '',
    parts_status: workOrder.parts_status || '',
    parts_ordered: workOrder.parts_ordered,
    parts_ordered_at: datetimeLocalValue(workOrder.parts_ordered_at),
    parts_eta: workOrder.parts_eta || '',
    follow_up_due_on: workOrder.follow_up_due_on || '',
    follow_up_owner: workOrder.follow_up_owner || '',
    vendor_reference: workOrder.vendor_reference || '',
    latest_follow_up_note: workOrder.latest_follow_up_note || '',
  }
}

function WorkOrderRow({ workOrder, canEdit, onEdit, onArchive }: { workOrder: WorkOrder; canEdit: boolean; onEdit: (workOrder: WorkOrder) => void; onArchive: (workOrderId: number, archived: boolean) => Promise<void> }) {
  const isBlocked = workOrder.status === 'waiting_for_parts' || workOrder.status === 'waiting_for_approval'
  return <article className="group rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/96 shadow-[0_8px_22px_rgba(23,32,51,0.045)] transition hover:border-[#244393]/22 hover:shadow-[0_14px_32px_rgba(23,32,51,0.075)]">
    <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_13rem_8rem] xl:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge kind={workOrder.normalized_priority}>{workOrder.normalized_priority}</Badge>
          <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
          <Badge kind={slaBadgeKind(workOrder)}>{slaLabel(workOrder)}</Badge>
          {workOrder.archived && <Badge kind="waiting">Archived</Badge>}
          {workOrder.pa_project && <Badge kind="waiting">PA Project</Badge>}
          {workOrder.corrective_maintenance && <Badge kind="approved">CM</Badge>}
          {workOrder.estimate_required && <Badge kind="scheduled">Estimate{workOrder.estimate_number ? ` #${workOrder.estimate_number}` : ''}</Badge>}
          {workOrder.follow_up_due_on && <Badge kind={new Date(workOrder.follow_up_due_on) <= new Date() ? 'waiting' : 'closed'}>Follow-up {shortDate(workOrder.follow_up_due_on)}</Badge>}
          {workOrder.parts_eta && <Badge kind="waiting">Parts ETA {shortDate(workOrder.parts_eta)}</Badge>}
          {workOrder.required_technician_count > 1 && <Badge kind="approved">{workOrder.required_technician_count} techs</Badge>}
          <span className="font-display tabular text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#7b8798]">WO #{workOrder.external_id || 'N/A'}</span>
        </div>
        <h3 className="font-display mt-2 line-clamp-2 text-base font-black tracking-tight text-[#172033] sm:line-clamp-1 sm:text-lg">{workOrder.location} <span className="font-semibold text-[#64748b]">—</span> {workOrder.title}</h3>
        <p className="mt-1 line-clamp-3 max-w-5xl text-sm leading-5 text-[#526071] sm:line-clamp-2">{workOrder.description}</p>
        <div className={`mt-3 inline-flex rounded-xl border px-3 py-1.5 text-xs font-extrabold ${statusTone(workOrder.status)}`}>
          {statusSummary(workOrder.status)}{isBlocked ? ' · follow-up required' : ''}
        </div>
        {(workOrder.parts_status || workOrder.latest_follow_up_note) && <p className="mt-2 line-clamp-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950">{workOrder.parts_status ? `Parts: ${workOrder.parts_status}` : ''}{workOrder.parts_status && workOrder.latest_follow_up_note ? ' · ' : ''}{workOrder.latest_follow_up_note || ''}</p>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold text-[#64748b] sm:grid-cols-4 xl:grid-cols-1">
        <span className="min-w-0"><strong className="block text-[0.62rem] uppercase tracking-[0.12em] text-[#94a0b5]">Scheduled</strong><span className="block truncate">{shortDate(workOrder.scheduled_date)}</span></span>
        <span className="min-w-0"><strong className="block text-[0.62rem] uppercase tracking-[0.12em] text-[#94a0b5]">KPI due</strong><span className="block truncate">{shortDateTime(workOrder.sla_due_at)}</span></span>
        <span className="min-w-0"><strong className="block text-[0.62rem] uppercase tracking-[0.12em] text-[#94a0b5]">Service line</strong><span className="block truncate">{workOrder.service_line || 'Unassigned'}</span></span>
        <span className="min-w-0"><strong className="block text-[0.62rem] uppercase tracking-[0.12em] text-[#94a0b5]">Source</strong><span className="block truncate">{workOrder.source}</span></span>
      </div>

      <div className="flex flex-row flex-wrap gap-2 xl:flex-col xl:items-end">
        <span className="font-display rounded-full bg-[#e8eefc] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-[#244393]">{workOrder.trade_category}</span>
        <span className="rounded-full border border-[rgba(23,32,51,0.1)] bg-[#f8faff] px-3 py-1 text-xs font-extrabold text-[#526071]">{workOrder.region || 'Unknown'}</span>
        {canEdit && <button type="button" onClick={() => onEdit(workOrder)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] sm:flex-none"><Edit3 size={13} /> Edit</button>}
        {canEdit && <button type="button" onClick={() => void onArchive(workOrder.id, !workOrder.archived)} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-full border border-[rgba(23,32,51,0.14)] bg-white px-3 py-1 text-xs font-extrabold text-[#526071] transition hover:-translate-y-0.5 hover:bg-slate-50 sm:flex-none">{workOrder.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {workOrder.archived ? 'Restore' : 'Archive'}</button>}
      </div>
    </div>
  </article>
}

function WorkOrderForm({ initialValues, serviceLines, saving, onCancel, onSubmit }: { initialValues: WorkOrderInput; serviceLines: ServiceLine[]; saving: boolean; onCancel: () => void; onSubmit: (values: WorkOrderInput) => Promise<void> }) {
  const [values, setValues] = useState<WorkOrderInput>(initialValues)
  const selectedServiceLineId = values.service_line_id ? String(values.service_line_id) : ''
  const serviceLineOptions = useMemo(() => serviceLines.filter((line) => line.active || String(line.id) === selectedServiceLineId), [selectedServiceLineId, serviceLines])

  function updateField<K extends keyof WorkOrderInput>(field: K, value: WorkOrderInput[K]) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await onSubmit({
      ...values,
      normalized_priority: values.priority,
      original_status_text: values.original_status_text || values.status,
      service_line_id: values.service_line_id || null,
      reported_at: datetimeLocalToIso(values.reported_at),
      assessed_at: datetimeLocalToIso(values.assessed_at),
      parts_ordered_at: datetimeLocalToIso(values.parts_ordered_at),
      estimated_hours: values.estimated_hours === '' || values.estimated_hours === undefined ? null : values.estimated_hours,
      required_technician_count: values.required_technician_count || 1,
    })
  }

  return <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col bg-[#f8faff]">
    <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6">
    <div className="grid gap-3 lg:grid-cols-4">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Client
        <input required value={values.client} onChange={(event) => updateField('client', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Location
        <input required value={values.location} onChange={(event) => updateField('location', event.target.value)} placeholder="Station, site, or building" className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Region
        <select value={values.region} onChange={(event) => updateField('region', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {regions.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        WO #
        <input value={values.external_id || ''} onChange={(event) => updateField('external_id', event.target.value)} placeholder="Optional" className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
    </div>

    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Description
      <textarea required value={values.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Paste or summarize the incoming request" className="field-control mt-1 min-h-24 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    <div className="mt-3 grid gap-3 lg:grid-cols-6">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Priority
        <select value={values.priority} onChange={(event) => updateField('priority', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Status
        <select value={values.status} onChange={(event) => updateField('status', event.target.value as WorkOrderStatus)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Trade
        <select value={values.trade_category} onChange={(event) => updateField('trade_category', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {trades.map((trade) => <option key={trade} value={trade}>{trade}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Source
        <select value={values.source} onChange={(event) => updateField('source', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {sources.map((source) => <option key={source} value={source}>{source}</option>)}
        </select>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Force dispatch date
        <input type="date" value={values.scheduled_date || ''} onChange={(event) => updateField('scheduled_date', event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Leave blank so KPI timing decides when it appears in dispatch.</span>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Service line
        <select value={values.service_line_id || ''} onChange={(event) => updateField('service_line_id', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">Unassigned</option>
          {serviceLineOptions.map((line) => <option key={line.id} value={line.id}>{line.name}{line.active ? '' : ' (inactive)'}</option>)}
        </select>
      </label>
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-4">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Reported at
        <input required type="datetime-local" value={values.reported_at || ''} onChange={(event) => updateField('reported_at', event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Used to calculate assessment and repair KPI due times.</span>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Assessed at
        <input type="datetime-local" value={values.assessed_at || ''} onChange={(event) => updateField('assessed_at', event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Optional. Once assessed, repair due time becomes the scheduling pressure.</span>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Est. hours
        <input type="number" min="0.25" step="0.25" value={values.estimated_hours ?? ''} onChange={(event) => updateField('estimated_hours', event.target.value)} placeholder="2" className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Used to space suggested crew stops.</span>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Crew size
        <input type="number" min="1" step="1" value={values.required_technician_count ?? 1} onChange={(event) => updateField('required_technician_count', event.target.value)} placeholder="1" className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Scheduler prefers crews with enough assigned techs.</span>
      </label>
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-3">
      <label className="rounded-2xl border border-[rgba(36,67,147,0.12)] bg-white p-3 text-sm font-bold text-[#172033]">
        <input type="checkbox" checked={Boolean(values.pa_project)} onChange={(event) => updateField('pa_project', event.target.checked)} className="mr-2 accent-[#244393]" />
        PA Project
        <span className="mt-1 block text-xs font-semibold leading-5 text-[#64748b]">Track separately from status so long-lead work does not get lost.</span>
      </label>
      <label className="rounded-2xl border border-[rgba(36,67,147,0.12)] bg-white p-3 text-sm font-bold text-[#172033]">
        <input type="checkbox" checked={Boolean(values.corrective_maintenance)} onChange={(event) => updateField('corrective_maintenance', event.target.checked)} className="mr-2 accent-[#244393]" />
        Corrective Maintenance
        <span className="mt-1 block text-xs font-semibold leading-5 text-[#64748b]">Used for Mobil/CBRE monthly reporting and pricing conversations.</span>
      </label>
      <label className="rounded-2xl border border-[rgba(36,67,147,0.12)] bg-white p-3 text-sm font-bold text-[#172033]">
        <input type="checkbox" checked={Boolean(values.estimate_required)} onChange={(event) => updateField('estimate_required', event.target.checked)} className="mr-2 accent-[#244393]" />
        Estimate Required
        <span className="mt-1 block text-xs font-semibold leading-5 text-[#64748b]">Flag work needing estimate/approval tracking.</span>
      </label>
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-4">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Estimate #
        <input value={values.estimate_number || ''} onChange={(event) => updateField('estimate_number', event.target.value)} placeholder="Optional" className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Parts status
        <input value={values.parts_status || ''} onChange={(event) => updateField('parts_status', event.target.value)} placeholder="Needed, ordered, arrived..." className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Parts ETA
        <input type="date" value={values.parts_eta || ''} onChange={(event) => updateField('parts_eta', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Follow-up due
        <input type="date" value={values.follow_up_due_on || ''} onChange={(event) => updateField('follow_up_due_on', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-4">
      <label className="rounded-2xl border border-[rgba(36,67,147,0.12)] bg-white p-3 text-sm font-bold text-[#172033]">
        <input type="checkbox" checked={Boolean(values.parts_ordered)} onChange={(event) => updateField('parts_ordered', event.target.checked)} className="mr-2 accent-[#244393]" />
        Parts Ordered
        <span className="mt-1 block text-xs font-semibold leading-5 text-[#64748b]">Track whether someone actually ordered parts/materials.</span>
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Ordered at
        <input type="datetime-local" value={values.parts_ordered_at || ''} onChange={(event) => updateField('parts_ordered_at', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Follow-up owner
        <input value={values.follow_up_owner || ''} onChange={(event) => updateField('follow_up_owner', event.target.value)} placeholder="John, George, vendor..." className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Vendor ref
        <input value={values.vendor_reference || ''} onChange={(event) => updateField('vendor_reference', event.target.value)} placeholder="PO, quote, order #" className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
    </div>

    {values.pa_project && <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      PA Project notes
      <textarea value={values.pa_project_notes || ''} onChange={(event) => updateField('pa_project_notes', event.target.value)} placeholder="Parts/materials status, ETA, CBRE update, follow-up context..." className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>}

    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Latest follow-up note
      <textarea value={values.latest_follow_up_note || ''} onChange={(event) => updateField('latest_follow_up_note', event.target.value)} placeholder="Last call, vendor update, ordering note, CBRE update..." className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Notes
      <textarea value={values.notes || ''} onChange={(event) => updateField('notes', event.target.value)} placeholder="Gate code, requester, parts note, manager instructions, etc." className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    </div>
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-[rgba(23,32,51,0.1)] bg-white/95 p-4 shadow-[0_-14px_30px_rgba(23,32,51,0.08)] backdrop-blur sm:flex-row sm:flex-wrap sm:justify-end">
      <button disabled={saving} type="button" onClick={onCancel} className="w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
        Cancel
      </button>
      <button disabled={saving} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(36,67,147,0.18)] transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
        {saving ? 'Saving...' : 'Save Work Order'}
      </button>
    </div>
  </form>
}

function WorkOrderEditorDrawer({ open, title, subtitle, saving, onClose, children }: { open: boolean; title: string; subtitle: string; saving: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose, saving])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close work order editor" disabled={saving} onClick={onClose} className="absolute inset-0 bg-[#07111f]/48 backdrop-blur-sm transition disabled:cursor-wait" />
      <aside role="dialog" aria-modal="true" aria-labelledby="work-order-editor-title" className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden border-l border-white/20 bg-[#f8faff] shadow-[-28px_0_60px_rgba(7,17,31,0.26)] sm:w-[92vw] xl:w-[78vw]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[rgba(23,32,51,0.1)] bg-white px-4 py-4 sm:px-5">
          <div>
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-[#244393]">Work order editor</p>
            <h2 id="work-order-editor-title" className="font-display mt-1 text-xl font-black tracking-tight text-[#172033]">{title}</h2>
            <p className="mt-1 text-sm font-semibold leading-5 text-[#64748b]">{subtitle}</p>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white p-2 text-[#526071] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"><X size={18} /></button>
        </div>
        {children}
      </aside>
    </div>,
    document.body
  )
}

export function WorkOrdersPanel({ workOrders, meta, serviceLines, canEdit, saving, routeSearch = '', workOrderToEdit, onEditConsumed, onRouteQueryChange, onFetch, onCreate, onUpdate, onArchive }: { workOrders: WorkOrder[]; meta: PaginationMeta | null; serviceLines: ServiceLine[]; canEdit: boolean; saving: boolean; routeSearch?: string; workOrderToEdit?: WorkOrder | null; onEditConsumed?: () => void; onRouteQueryChange?: (query: string) => void; onFetch: (query: string) => Promise<void>; onCreate: (values: WorkOrderInput) => Promise<void>; onUpdate: (id: number, values: WorkOrderInput) => Promise<void>; onArchive: (workOrderId: number, archived: boolean) => Promise<void> }) {
  const initialFilters = workOrderFiltersFromQuery(routeSearch)
  const [showForm, setShowForm] = useState(false)
  const [showPasteIntake, setShowPasteIntake] = useState(false)
  const [editing, setEditing] = useState<WorkOrder | null>(null)
  const [reviewDraft, setReviewDraft] = useState<ImportDraft | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([])
  const [importError, setImportError] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [query, setQuery] = useState(initialFilters.query)
  const [statusFilter, setStatusFilter] = useState(initialFilters.status)
  const [priorityFilter, setPriorityFilter] = useState(initialFilters.priority)
  const [regionFilter, setRegionFilter] = useState(initialFilters.region)
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>(initialFilters.archive)
  const [serviceLineFilter, setServiceLineFilter] = useState(initialFilters.serviceLine)
  const [paProjectFilter, setPaProjectFilter] = useState(initialFilters.paProject)
  const [correctiveMaintenanceFilter, setCorrectiveMaintenanceFilter] = useState(initialFilters.correctiveMaintenance)
  const [estimateRequiredFilter, setEstimateRequiredFilter] = useState(initialFilters.estimateRequired)
  const [followUpDueFilter, setFollowUpDueFilter] = useState(initialFilters.followUpDue)
  const [openOnlyFilter, setOpenOnlyFilter] = useState(initialFilters.openOnly)
  const [closedFilter, setClosedFilter] = useState(initialFilters.closed)
  const [slaStatusFilter, setSlaStatusFilter] = useState<SlaStatusFilter>(initialFilters.slaStatus)
  const [sort, setSort] = useState(initialFilters.sort)
  const [direction, setDirection] = useState<'asc' | 'desc'>(initialFilters.direction)
  const [appliedQuery, setAppliedQuery] = useState(normalizedWorkOrderQuery(routeSearch || DEFAULT_WORK_ORDER_QUERY))

  const filteredWorkOrders = workOrders
  const hasActiveFilters = Boolean(query || archiveFilter !== 'active' || statusFilter || priorityFilter || regionFilter || serviceLineFilter || paProjectFilter || correctiveMaintenanceFilter || estimateRequiredFilter || followUpDueFilter || openOnlyFilter || closedFilter || slaStatusFilter)
  const activeEditing = editing ?? workOrderToEdit ?? null
  const isFormOpen = showForm || Boolean(workOrderToEdit) || Boolean(reviewDraft)

  useEffect(() => {
    const normalized = normalizedWorkOrderQuery(routeSearch || DEFAULT_WORK_ORDER_QUERY)
    const next = workOrderFiltersFromQuery(normalized)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(next.query)
    setStatusFilter(next.status)
    setPriorityFilter(next.priority)
    setRegionFilter(next.region)
    setArchiveFilter(next.archive)
    setServiceLineFilter(next.serviceLine)
    setPaProjectFilter(next.paProject)
    setCorrectiveMaintenanceFilter(next.correctiveMaintenance)
    setEstimateRequiredFilter(next.estimateRequired)
    setFollowUpDueFilter(next.followUpDue)
    setOpenOnlyFilter(next.openOnly)
    setClosedFilter(next.closed)
    setSlaStatusFilter(next.slaStatus)
    setSort(next.sort)
    setDirection(next.direction)
    setAppliedQuery(normalized)
    void onFetch(normalized)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch])

  useEffect(() => {
    if (!canEdit) return
    let active = true
    void getJson<WorkOrderImportPreview>('/work_order_imports')
      .then((payload) => {
        if (!active) return
        const persistedDrafts = payload.work_orders.map((draft, index) => ({ ...draft, draftId: draftId(draft, index) }))
        setImportDrafts((currentDrafts) => mergeImportDrafts(currentDrafts, persistedDrafts))
      })
      .catch((error) => {
        if (active) setImportError(error instanceof Error ? error.message : 'Unable to load pending intake drafts')
      })
    return () => { active = false }
  }, [canEdit])

  function queryFor(page = 1) {
    const params = new URLSearchParams()
    params.set('archived', archiveFilter === 'archived' ? 'only' : archiveFilter === 'all' ? 'all' : 'active')
    params.set('page', String(page))
    params.set('per_page', String(meta?.per_page || 50))
    params.set('sort', sort)
    params.set('direction', direction)
    if (query.trim()) params.set('q', query.trim())
    if (statusFilter) params.set('status', statusFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    if (regionFilter) params.set('region', regionFilter)
    if (serviceLineFilter) params.set('service_line_id', serviceLineFilter)
    if (paProjectFilter) params.set('pa_project', 'true')
    if (correctiveMaintenanceFilter) params.set('corrective_maintenance', 'true')
    if (estimateRequiredFilter) params.set('estimate_required', 'true')
    if (followUpDueFilter) params.set('follow_up_due', 'true')
    if (openOnlyFilter) params.set('open', 'true')
    if (closedFilter) params.set('closed', 'true')
    if (slaStatusFilter) params.set('sla_status', slaStatusFilter)
    return params.toString()
  }

  function queryForAppliedPage(page: number) {
    const params = new URLSearchParams(appliedQuery)
    params.set('page', String(page))
    return params.toString()
  }

  function goToQuery(nextQuery: string) {
    const normalized = normalizedWorkOrderQuery(nextQuery)
    setAppliedQuery(normalized)
    if (onRouteQueryChange) onRouteQueryChange(normalized)
    else void onFetch(normalized)
  }

  function applyFilters() {
    goToQuery(queryFor(1))
  }

  function applyQuickFilter(nextQuery: string) {
    goToQuery(nextQuery)
  }

  function clearFilters() {
    setQuery('')
    setArchiveFilter('active')
    setStatusFilter('')
    setPriorityFilter('')
    setRegionFilter('')
    setServiceLineFilter('')
    setPaProjectFilter(false)
    setCorrectiveMaintenanceFilter(false)
    setEstimateRequiredFilter(false)
    setFollowUpDueFilter(false)
    setOpenOnlyFilter(false)
    setClosedFilter(false)
    setSlaStatusFilter('')
    setSort('scheduled_date')
    setDirection('asc')
    goToQuery(DEFAULT_WORK_ORDER_QUERY)
  }

  const formInitialValues = activeEditing ? formFromWorkOrder(activeEditing) : reviewDraft ? formFromImportDraft(reviewDraft) : emptyForm()
  const editorTitle = activeEditing ? `Edit ${activeEditing.location}` : reviewDraft ? 'Review scanned intake' : 'New work order'
  const editorSubtitle = activeEditing
    ? `WO #${activeEditing.external_id || 'N/A'} · ${statusLabel(activeEditing.status)} · ${activeEditing.normalized_priority}`
    : reviewDraft
      ? 'Confirm the AI/OCR fields before this becomes a live dispatch record.'
      : 'Create an intake record without accidentally forcing it into dispatch.'

  async function submitForm(values: WorkOrderInput) {
    if (activeEditing) {
      await onUpdate(activeEditing.id, values)
    } else {
      await onCreate(reviewDraft ? { ...values, work_order_import_item_id: reviewDraft.import_item_id } : values)
      if (reviewDraft) setImportDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.draftId !== reviewDraft.draftId))
    }
    setEditing(null)
    setReviewDraft(null)
    setShowForm(false)
    onEditConsumed?.()
  }

  function startCreate() {
    onEditConsumed?.()
    setEditing(null)
    setReviewDraft(null)
    setShowForm(true)
  }

  function startEdit(workOrder: WorkOrder) {
    onEditConsumed?.()
    setEditing(workOrder)
    setReviewDraft(null)
    setShowForm(true)
  }

  function closeEditor() {
    setShowForm(false)
    setEditing(null)
    setReviewDraft(null)
    onEditConsumed?.()
  }

  async function previewUpload(file: File | null) {
    if (!file) return
    setUploading(true)
    setImportError('')
    try {
      const data = new FormData()
      data.append('file', file)
      const payload = await postForm<WorkOrderImportPreview>('/work_order_imports/preview', data)
      const newDrafts = payload.work_orders.map((draft, index) => ({ ...draft, draftId: draftId(draft, index) }))
      setImportDrafts((currentDrafts) => mergeImportDrafts(currentDrafts, newDrafts))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to scan uploaded work order')
    } finally {
      setUploading(false)
    }
  }

  async function previewPastedText() {
    if (!pasteText.trim()) return setImportError('Paste a WhatsApp, email, or work-order note first.')
    setUploading(true)
    setImportError('')
    try {
      const payload = await postJson<WorkOrderImportPreview>('/work_order_imports/preview', { text: pasteText })
      const newDrafts = payload.work_orders.map((draft, index) => ({ ...draft, draftId: draftId(draft, index) }))
      setImportDrafts((currentDrafts) => mergeImportDrafts(currentDrafts, newDrafts))
      setPasteText('')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to preview pasted intake')
    } finally {
      setUploading(false)
    }
  }

  function handleClipboardPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData.files).find((candidate) => candidate.type.startsWith('image/') || candidate.type === 'application/pdf')
    if (file) {
      event.preventDefault()
      void previewUpload(file)
    }
  }

  async function rejectImportDraft(draft: ImportDraft) {
    if (!window.confirm('Reject this intake draft? The source remains in the audit record, but this request will not become a work order.')) return
    setImportError('')
    try {
      await postJson<void>(`/work_order_import_items/${draft.import_item_id}/reject`, {})
      setImportDrafts((currentDrafts) => currentDrafts.filter((candidate) => candidate.import_item_id !== draft.import_item_id))
      if (reviewDraft?.import_item_id === draft.import_item_id) closeEditor()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to reject intake draft')
    }
  }

  const quickFilters = [
    { label: 'Active Queue', query: DEFAULT_WORK_ORDER_QUERY },
    { label: 'Open', query: `${DEFAULT_WORK_ORDER_QUERY}&open=true` },
    { label: 'Needs Assessment', query: `${DEFAULT_WORK_ORDER_QUERY}&status=needs_assessment` },
    { label: 'Ready to Schedule', query: `${DEFAULT_WORK_ORDER_QUERY}&status=approved` },
    { label: 'Waiting Parts', query: `${DEFAULT_WORK_ORDER_QUERY}&status=waiting_for_parts` },
    { label: 'Waiting Approval', query: `${DEFAULT_WORK_ORDER_QUERY}&status=waiting_for_approval` },
    { label: 'KPI Overdue', query: 'archived=active&page=1&per_page=50&sort=sla_due_at&direction=asc&sla_status=overdue' },
    { label: 'KPI Due Soon', query: 'archived=active&page=1&per_page=50&sort=sla_due_at&direction=asc&sla_status=due_soon' },
    { label: 'Follow-up Due', query: `${DEFAULT_WORK_ORDER_QUERY}&follow_up_due=true` },
    { label: 'PA Projects', query: `${DEFAULT_WORK_ORDER_QUERY}&pa_project=true` },
    { label: 'Estimates', query: `${DEFAULT_WORK_ORDER_QUERY}&estimate_required=true` },
    { label: 'Closed', query: 'archived=all&page=1&per_page=50&sort=created_at&direction=desc&closed=true' },
  ]
  const normalizedAppliedQuery = normalizedWorkOrderQuery(appliedQuery)

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Work orders"
      title="Work Order Management"
      description="Review open and closed jobs, dispatch-ready work, blocked follow-ups, PA Projects, KPI pressure, and incoming requests from WhatsApp, email, phone, or work-order systems."
      action={canEdit ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
        <button type="button" onClick={() => setShowPasteIntake((current) => !current)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] sm:w-auto"><ClipboardPaste size={16} /> Paste Intake</button>
        <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#dfe8ff] sm:w-auto">
          <FileUp size={16} /> {uploading ? 'Scanning...' : 'Scan File'}
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ''; void previewUpload(file) }} className="sr-only" />
        </label>
        <button type="button" onClick={startCreate} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d84332] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(216,67,50,0.2)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] sm:w-auto"><Plus size={16} /> New Work Order</button>
      </div> : <span className="tabular rounded-full bg-[#172b63] px-3 py-1.5 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-white">{workOrders.length} records</span>}
    />

    {importError && <div className="border-b border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800">{importError}</div>}

    {showPasteIntake && <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-[#244393]">Paste intake</p>
          <p className="mt-1 text-sm text-[#526071]">Paste a WhatsApp/email request, or paste a screenshot directly into this box. The app creates reviewable drafts only.</p>
        </div>
        <button type="button" onClick={() => setShowPasteIntake(false)} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#334155]">Close</button>
      </div>
      <textarea value={pasteText} onPaste={handleClipboardPaste} onChange={(event) => setPasteText(event.target.value)} rows={5} placeholder="Paste text here, or click in this box and paste a screenshot from the clipboard..." className="field-control w-full rounded-2xl px-4 py-3 text-sm font-semibold leading-6 text-[#172033]" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={uploading || !pasteText.trim()} onClick={() => void previewPastedText()} className="rounded-xl bg-[#244393] px-4 py-2 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:opacity-50">Preview pasted text</button>
        <span className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-[#64748b]">Screenshots are scanned immediately when pasted.</span>
      </div>
    </div>}

    {importDrafts.length > 0 && <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-[#244393]">AI intake preview</p>
          <p className="mt-1 text-sm text-[#526071]">Open each extracted request, correct the fields, then save or reject it. Pending drafts and their private source attachments survive refreshes.</p>
        </div>
        <button type="button" onClick={() => setImportDrafts([])} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#334155]">Hide for now</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {importDrafts.map((draft) => <article key={draft.draftId} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge kind={draft.priority}>{draft.priority}</Badge>
                <Badge kind={draft.status}>{statusLabel(draft.status)}</Badge>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e8eefc] px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[#244393]"><Sparkles size={12} /> {draft.confidence}</span>
              </div>
              <h3 className="font-display mt-2 font-extrabold text-[#172033]">{draft.location} - {draft.title}</h3>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button type="button" disabled={saving} onClick={() => { setReviewDraft(draft); setShowForm(false); setEditing(null); onEditConsumed?.() }} className="rounded-2xl bg-[#16835f] px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-wait disabled:opacity-60">Review/Edit</button>
              <button type="button" disabled={saving} onClick={() => void rejectImportDraft(draft)} className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-red-700 transition hover:bg-red-100 disabled:opacity-60">Reject</button>
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#526071]">{draft.description}</p>
          <p className="mt-2 text-xs font-semibold text-[#7b8798]">{draft.client} • {draft.region} • {draft.trade_category} • WO #{draft.external_id || 'N/A'}{draft.source_filename ? ` • ${draft.source_filename}` : ' • Pasted text'}</p>
          {draft.notes && <p className="mt-2 text-xs font-semibold text-[#526071]">Notes: {draft.notes}</p>}
          {draft.issues.length > 0 && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Review: {draft.issues.join(', ')}</p>}
        </article>)}
      </div>
    </div>}

    <WorkOrderEditorDrawer open={isFormOpen} title={editorTitle} subtitle={editorSubtitle} saving={saving} onClose={closeEditor}>
      <WorkOrderForm key={activeEditing?.id || reviewDraft?.draftId || 'new'} initialValues={formInitialValues} serviceLines={serviceLines} saving={saving} onCancel={closeEditor} onSubmit={submitForm} />
    </WorkOrderEditorDrawer>

    <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-[#244393]">Queue views</p>
        <span className="text-xs font-bold text-[#64748b]">These are saved in the URL for bookmarks and back-button navigation.</span>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {quickFilters.map((filter) => {
          const isActive = normalizedAppliedQuery === normalizedWorkOrderQuery(filter.query)
          return <button key={filter.label} type="button" onClick={() => applyQuickFilter(filter.query)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] transition ${isActive ? 'border-[#172b63] bg-[#172b63] text-white shadow-[0_10px_24px_rgba(23,43,99,0.16)]' : 'border-[rgba(36,67,147,0.16)] bg-white text-[#244393] hover:bg-[#e8eefc]'}`}>{filter.label}</button>
        })}
      </div>
    </div>

    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white p-3 sm:p-4">
      <div className="grid gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[1fr_150px_160px_150px_150px_180px_150px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7b8798]" size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search WO #, location, description, notes..." className="field-control w-full rounded-xl py-2 pl-9 pr-3 text-sm font-semibold text-[#172033]" />
        </label>
        <select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as 'active' | 'archived' | 'all')} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="active">Active queue</option>
          <option value="archived">Archived</option>
          <option value="all">All records</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All priority</option>
          {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
        </select>
        <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All regions</option>
          {regions.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
        <select value={serviceLineFilter} onChange={(event) => setServiceLineFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All service lines</option>
          {serviceLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
        </select>
        <select value={slaStatusFilter} onChange={(event) => setSlaStatusFilter(event.target.value as SlaStatusFilter)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All KPI</option>
          <option value="overdue">KPI overdue</option>
          <option value="due_soon">KPI due soon</option>
          <option value="missing">KPI missing</option>
          <option value="on_track">KPI on track</option>
        </select>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[180px_150px_auto]">
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="scheduled_date">Sort scheduled</option>
          <option value="created_at">Sort created</option>
          <option value="sla_due_at">Sort KPI due</option>
          <option value="priority">Sort priority</option>
          <option value="status">Sort status</option>
          <option value="location">Sort location</option>
        </select>
        <select value={direction} onChange={(event) => setDirection(event.target.value as 'asc' | 'desc')} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={applyFilters} className="w-full rounded-xl bg-[#244393] px-4 py-2 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] sm:w-auto">Apply filters</button>
          <button type="button" onClick={clearFilters} className="w-full rounded-xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 sm:w-auto">Clear</button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setPaProjectFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${paProjectFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>PA Projects</button>
        <button type="button" onClick={() => setCorrectiveMaintenanceFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${correctiveMaintenanceFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>CM</button>
        <button type="button" onClick={() => setEstimateRequiredFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${estimateRequiredFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Estimates</button>
        <button type="button" onClick={() => setFollowUpDueFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${followUpDueFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Follow-up Due</button>
        <button type="button" onClick={() => { setOpenOnlyFilter((current) => !current); setClosedFilter(false) }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${openOnlyFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Open Only</button>
        <button type="button" onClick={() => { setClosedFilter((current) => !current); setOpenOnlyFilter(false) }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${closedFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Closed</button>
      </div>
    </div>

    <div className="space-y-2 p-2 sm:p-3">
      {filteredWorkOrders.map((wo) => <WorkOrderRow key={wo.id} workOrder={wo} canEdit={canEdit} onEdit={startEdit} onArchive={onArchive} />)}
      {workOrders.length === 0 && hasActiveFilters && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071]">No work orders match the current filters.</p>}
      {workOrders.length === 0 && !hasActiveFilters && <div className="rounded-2xl border border-dashed border-[rgba(36,67,147,0.22)] bg-[#f8faff] p-6">
        <p className="font-display text-lg font-extrabold text-[#172033]">No work orders yet.</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526071]">Start by adding the first request John receives from WhatsApp, phone, email, or the work-order system. Once saved, it can be reviewed and scheduled.</p>
        {canEdit && <button onClick={startCreate} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63]"><Plus size={16} /> Add First Work Order</button>}
      </div>}
      {workOrders.length > 0 && <div className="flex flex-col items-start justify-between gap-3 px-2 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#7b8798] sm:flex-row sm:items-center sm:px-3">
        <span>{meta ? `${workOrders.length} shown · ${meta.total_count} total · page ${meta.page} of ${Math.max(meta.total_pages, 1)}` : `${workOrders.length} shown`}</span>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button type="button" disabled={!meta || meta.page <= 1} onClick={() => goToQuery(queryForAppliedPage((meta?.page || 1) - 1))} className="rounded-full border border-[rgba(23,32,51,0.12)] bg-white px-3 py-1.5 text-[#334155] disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
          <button type="button" disabled={!meta || meta.page >= meta.total_pages} onClick={() => goToQuery(queryForAppliedPage((meta?.page || 1) + 1))} className="rounded-full border border-[rgba(23,32,51,0.12)] bg-white px-3 py-1.5 text-[#334155] disabled:cursor-not-allowed disabled:opacity-50">Next</button>
          {hasActiveFilters && <button className="inline-flex items-center gap-1 text-[#244393]" onClick={clearFilters}><X size={13} /> Clear filters</button>}
        </div>
      </div>}
    </div>
  </Card>
}
