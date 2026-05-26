import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, ArchiveRestore, Edit3, FileUp, Plus, Search, Sparkles, X } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import { postForm } from '../lib/api'
import type { OcrWorkOrderDraft, ServiceLine, WorkOrder, WorkOrderImportPreview, WorkOrderInput, WorkOrderStatus } from '../types'

const priorities = ['P1', 'P2', 'P3', 'P4']
const statuses: WorkOrderStatus[] = ['new', 'needs_assessment', 'approved', 'scheduled', 'in_progress', 'carry_over', 'waiting_for_parts', 'waiting_for_approval', 'completed', 'closed', 'cancelled']
const trades = ['General', 'Plumbing', 'HVAC', 'Electrical', 'Carpentry', 'Painting', 'Landscaping', 'Masonry']
const regions = ['North', 'Central', 'South', 'Islandwide', 'Unknown']
const sources = ['whatsapp', 'phone', 'email', 'mywork', 'sodexo', 'manual', 'upload']

type ImportDraft = OcrWorkOrderDraft & { draftId: string }

function draftId(draft: OcrWorkOrderDraft, index: number) {
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

function emptyForm(scheduledDate?: string): WorkOrderInput {
  return {
    client: 'Mobil',
    location: '',
    region: 'Unknown',
    external_id: '',
    source: 'whatsapp',
    title: '',
    description: '',
    priority: 'P3',
    status: 'approved',
    trade_category: 'General',
    scheduled_date: scheduledDate || '',
    notes: '',
    service_line_id: '',
    pa_project: false,
    pa_project_notes: '',
    corrective_maintenance: false,
    estimate_required: false,
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
    service_line_id: workOrder.service_line_id || '',
    pa_project: workOrder.pa_project,
    pa_project_notes: workOrder.pa_project_notes || '',
    corrective_maintenance: workOrder.corrective_maintenance,
    estimate_required: workOrder.estimate_required,
  }
}

function WorkOrderRow({ workOrder, canEdit, onEdit, onArchive }: { workOrder: WorkOrder; canEdit: boolean; onEdit: (workOrder: WorkOrder) => void; onArchive: (workOrderId: number, archived: boolean) => Promise<void> }) {
  return <article className="grid gap-3 rounded-xl border border-transparent p-4 transition hover:border-[rgba(36,67,147,0.16)] hover:bg-[#f8faff] sm:grid-cols-[1fr_auto]">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge kind={workOrder.normalized_priority}>{workOrder.normalized_priority}</Badge>
        <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
        {workOrder.archived && <Badge kind="waiting">Archived</Badge>}
        {workOrder.pa_project && <Badge kind="waiting">PA Project</Badge>}
        {workOrder.corrective_maintenance && <Badge kind="approved">CM</Badge>}
        {workOrder.estimate_required && <Badge kind="scheduled">Estimate</Badge>}
        <span className="font-display tabular text-xs font-bold uppercase tracking-[0.12em] text-[#7b8798]">WO #{workOrder.external_id || 'N/A'}</span>
      </div>
      <h3 className="font-display mt-2 font-extrabold tracking-tight text-[#172033]">{workOrder.location} - {workOrder.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#526071]">{workOrder.description}</p>
      <div className={`mt-3 inline-flex rounded-xl border px-3 py-2 text-xs font-extrabold ${statusTone(workOrder.status)}`}>
        {statusSummary(workOrder.status)}
      </div>
      <div className="mt-2 grid gap-1 text-xs font-semibold text-[#7b8798] sm:grid-cols-2 lg:grid-cols-4">
        <span>Created: {shortDate(workOrder.created_at)}</span>
        <span>Scheduled: {shortDate(workOrder.scheduled_date)}</span>
        <span>Source: {workOrder.source}</span>
        <span>Service line: {workOrder.service_line || 'Unassigned'}</span>
        <span>Last dispatched: {shortDate(workOrder.last_dispatched_on)}{workOrder.last_crew_name ? ` · ${workOrder.last_crew_name}` : ''}</span>
      </div>
    </div>
    <div className="flex flex-row gap-2 text-sm sm:flex-col sm:items-end">
      <span className="font-display rounded-full bg-[#e8eefc] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-[#244393]">{workOrder.trade_category}</span>
      <span className="font-semibold text-[#526071]">{workOrder.region}</span>
      {canEdit && <button type="button" onClick={() => onEdit(workOrder)} className="inline-flex items-center gap-1 rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc]"><Edit3 size={13} /> Edit</button>}
      {canEdit && <button type="button" onClick={() => void onArchive(workOrder.id, !workOrder.archived)} className="inline-flex items-center gap-1 rounded-full border border-[rgba(23,32,51,0.14)] bg-white px-3 py-1 text-xs font-extrabold text-[#526071] transition hover:-translate-y-0.5 hover:bg-slate-50">{workOrder.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {workOrder.archived ? 'Restore' : 'Archive'}</button>}
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
    })
  }

  return <form onSubmit={(event) => void handleSubmit(event)} className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-4">
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
        Schedule date
        <input type="date" value={values.scheduled_date || ''} onChange={(event) => updateField('scheduled_date', event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Service line
        <select value={values.service_line_id || ''} onChange={(event) => updateField('service_line_id', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">Unassigned</option>
          {serviceLineOptions.map((line) => <option key={line.id} value={line.id}>{line.name}{line.active ? '' : ' (inactive)'}</option>)}
        </select>
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

    {values.pa_project && <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      PA Project notes
      <textarea value={values.pa_project_notes || ''} onChange={(event) => updateField('pa_project_notes', event.target.value)} placeholder="Parts/materials status, ETA, CBRE update, follow-up context..." className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>}

    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Notes
      <textarea value={values.notes || ''} onChange={(event) => updateField('notes', event.target.value)} placeholder="Gate code, requester, parts note, manager instructions, etc." className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={saving} type="submit" className="inline-flex items-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(36,67,147,0.18)] transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">
        {saving ? 'Saving...' : 'Save Work Order'}
      </button>
      <button disabled={saving} type="button" onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50">
        Cancel
      </button>
    </div>
  </form>
}

export function WorkOrdersPanel({ workOrders, serviceLines, canEdit, selectedDate, saving, onCreate, onUpdate, onArchive }: { workOrders: WorkOrder[]; serviceLines: ServiceLine[]; canEdit: boolean; selectedDate: string; saving: boolean; onCreate: (values: WorkOrderInput) => Promise<void>; onUpdate: (id: number, values: WorkOrderInput) => Promise<void>; onArchive: (workOrderId: number, archived: boolean) => Promise<void> }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WorkOrder | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importingDraftId, setImportingDraftId] = useState<string | null>(null)
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([])
  const [importError, setImportError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [serviceLineFilter, setServiceLineFilter] = useState('')
  const [paProjectFilter, setPaProjectFilter] = useState(false)
  const [correctiveMaintenanceFilter, setCorrectiveMaintenanceFilter] = useState(false)
  const [estimateRequiredFilter, setEstimateRequiredFilter] = useState(false)

  const filteredWorkOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return workOrders.filter((workOrder) => {
      const matchesQuery = !normalizedQuery || [workOrder.external_id, workOrder.client, workOrder.location, workOrder.title, workOrder.description, workOrder.notes].some((value) => value?.toLowerCase().includes(normalizedQuery))
      const matchesArchive = archiveFilter === 'all' || (archiveFilter === 'archived' ? workOrder.archived : !workOrder.archived)
      return matchesArchive
        && matchesQuery
        && (!statusFilter || workOrder.status === statusFilter)
        && (!priorityFilter || workOrder.normalized_priority === priorityFilter)
        && (!regionFilter || workOrder.region === regionFilter)
        && (!serviceLineFilter || String(workOrder.service_line_id || '') === serviceLineFilter)
        && (!paProjectFilter || workOrder.pa_project)
        && (!correctiveMaintenanceFilter || workOrder.corrective_maintenance)
        && (!estimateRequiredFilter || workOrder.estimate_required)
    })
  }, [archiveFilter, correctiveMaintenanceFilter, estimateRequiredFilter, paProjectFilter, priorityFilter, query, regionFilter, serviceLineFilter, statusFilter, workOrders])

  const formInitialValues = editing ? formFromWorkOrder(editing) : emptyForm(selectedDate)

  async function submitForm(values: WorkOrderInput) {
    if (editing) {
      await onUpdate(editing.id, values)
    } else {
      await onCreate(values)
    }
    setEditing(null)
    setShowForm(false)
  }

  function startCreate() {
    setEditing(null)
    setShowForm(true)
  }

  function startEdit(workOrder: WorkOrder) {
    setEditing(workOrder)
    setShowForm(true)
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
      setImportDrafts((currentDrafts) => [...currentDrafts, ...newDrafts])
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to scan uploaded work order')
    } finally {
      setUploading(false)
    }
  }

  async function importDraft(draft: ImportDraft) {
    setImportingDraftId(draft.draftId)
    setImportError('')
    try {
      await onCreate({
        ...draft,
        normalized_priority: draft.priority,
        original_status_text: draft.original_status_text || draft.status,
      })
      setImportDrafts((currentDrafts) => currentDrafts.filter((candidate) => candidate.draftId !== draft.draftId))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to import extracted work order')
    } finally {
      setImportingDraftId(null)
    }
  }

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Incoming work"
      title="Work Orders"
      description="Add requests from WhatsApp, email, phone, or work-order systems. Approved and assessment work can be pulled into the dispatch draft."
      action={canEdit ? <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#dfe8ff]">
          <FileUp size={16} /> {uploading ? 'Scanning...' : 'Upload Scan'}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ''; void previewUpload(file) }} className="sr-only" />
        </label>
        <button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-2xl bg-[#d84332] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(216,67,50,0.2)] transition hover:-translate-y-0.5 hover:bg-[#bf3228]"><Plus size={16} /> New Work Order</button>
      </div> : <span className="tabular rounded-full bg-[#172b63] px-3 py-1.5 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-white">{workOrders.length} records</span>}
    />

    {importError && <div className="border-b border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800">{importError}</div>}

    {importDrafts.length > 0 && <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-[#244393]">AI upload preview</p>
          <p className="mt-1 text-sm text-[#526071]">Review each extracted request before importing it as a work order.</p>
        </div>
        <button type="button" onClick={() => setImportDrafts([])} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#334155]">Clear</button>
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
            <button type="button" disabled={importingDraftId !== null || saving} onClick={() => void importDraft(draft)} className="shrink-0 rounded-2xl bg-[#16835f] px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-wait disabled:opacity-60">{importingDraftId === draft.draftId ? 'Importing...' : 'Import'}</button>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#526071]">{draft.description}</p>
          <p className="mt-2 text-xs font-semibold text-[#7b8798]">{draft.client} • {draft.region} • {draft.trade_category} • WO #{draft.external_id || 'N/A'}</p>
          {draft.notes && <p className="mt-2 text-xs font-semibold text-[#526071]">Notes: {draft.notes}</p>}
          {draft.issues.length > 0 && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Review: {draft.issues.join(', ')}</p>}
        </article>)}
      </div>
    </div>}

    {showForm && <WorkOrderForm key={editing?.id || 'new'} initialValues={formInitialValues} serviceLines={serviceLines} saving={saving} onCancel={() => { setShowForm(false); setEditing(null) }} onSubmit={submitForm} />}

    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_150px_160px_150px_160px_180px]">
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
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setPaProjectFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${paProjectFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>PA Projects</button>
        <button type="button" onClick={() => setCorrectiveMaintenanceFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${correctiveMaintenanceFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>CM</button>
        <button type="button" onClick={() => setEstimateRequiredFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${estimateRequiredFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Estimates</button>
      </div>
    </div>

    <div className="space-y-2 p-3">
      {filteredWorkOrders.slice(0, 40).map((wo) => <WorkOrderRow key={wo.id} workOrder={wo} canEdit={canEdit} onEdit={startEdit} onArchive={onArchive} />)}
      {workOrders.length === 0 && <div className="rounded-2xl border border-dashed border-[rgba(36,67,147,0.22)] bg-[#f8faff] p-6">
        <p className="font-display text-lg font-extrabold text-[#172033]">No work orders yet.</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526071]">Start by adding the first request John receives from WhatsApp, phone, email, or the work-order system. Once saved, it can be reviewed and scheduled.</p>
        {canEdit && <button onClick={startCreate} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63]"><Plus size={16} /> Add First Work Order</button>}
      </div>}
      {workOrders.length > 0 && filteredWorkOrders.length === 0 && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071]">No work orders match the current filters.</p>}
      {filteredWorkOrders.length > 40 && <p className="px-3 pb-2 text-xs font-bold text-[#8a5b18]">Showing the first 40 matching records. Tighten search or filters to narrow the list.</p>}
      {workOrders.length > 0 && <div className="flex items-center justify-between px-3 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#7b8798]">
        <span>{filteredWorkOrders.length} shown</span>
        {(query || archiveFilter !== 'active' || statusFilter || priorityFilter || regionFilter || serviceLineFilter || paProjectFilter || correctiveMaintenanceFilter || estimateRequiredFilter) && <button className="inline-flex items-center gap-1 text-[#244393]" onClick={() => { setQuery(''); setArchiveFilter('active'); setStatusFilter(''); setPriorityFilter(''); setRegionFilter(''); setServiceLineFilter(''); setPaProjectFilter(false); setCorrectiveMaintenanceFilter(false); setEstimateRequiredFilter(false) }}><X size={13} /> Clear filters</button>}
      </div>}
    </div>
  </Card>
}
