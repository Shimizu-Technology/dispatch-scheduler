import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, ClipboardPaste, Edit3, FileUp, Plus, Search, Sparkles, X } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import { ApiError, postForm, postJson } from '../lib/api'
import type { OcrWorkOrderDraft, PaginationMeta, ServiceLine, WorkOrder, WorkOrderImportPreview, WorkOrderInput, WorkOrderStatus } from '../types'

const priorities = ['P1', 'P2', 'P3', 'P4']
const statuses: WorkOrderStatus[] = ['new', 'needs_assessment', 'approved', 'scheduled', 'in_progress', 'carry_over', 'waiting_for_parts', 'waiting_for_approval', 'completed', 'closed', 'cancelled']
const trades = ['General', 'Plumbing', 'HVAC', 'Electrical', 'Carpentry', 'Painting', 'Landscaping', 'Masonry']
const regions = ['North', 'Central', 'South', 'Islandwide', 'Unknown']
const sources = ['whatsapp', 'phone', 'email', 'mywork', 'sodexo', 'manual', 'upload']
const DEFAULT_WORK_ORDER_QUERY = 'archived=active&page=1&per_page=50&sort=created_at&direction=desc'

export type WorkOrderEditorState = { open: boolean; dirty: boolean; saving: boolean; unconfirmed: boolean }
type WorkOrderNavigationProps = {
  onEditorStateChange?: (state: WorkOrderEditorState) => void
  pendingLeave?: boolean
  onKeepEditing?: () => void
  onDiscardAndLeave?: () => void
  leaveBlocked?: boolean
}

type ImportDraft = OcrWorkOrderDraft & { draftId: string; originalRequestText?: string }
type ServiceLineCatalog = { loading: boolean; confirmed: boolean; error: string; notice?: string }
type ServiceLineCatalogProps = { serviceLineCatalog?: ServiceLineCatalog; onRefreshServiceLines?: () => void }
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
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc'
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
    sort: params.get('sort') || 'created_at',
    direction,
  }
}

function normalizedWorkOrderQuery(queryString?: string) {
  const params = new URLSearchParams((queryString || '').replace(/^\?/, ''))
  if (!params.get('archived')) params.set('archived', 'active')
  if (!params.get('page')) params.set('page', '1')
  if (!params.get('per_page')) params.set('per_page', '50')
  if (!params.get('sort')) params.set('sort', 'created_at')
  if (!params.get('direction')) params.set('direction', 'desc')
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
  if (!value) return null
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
  const fields: WorkOrderInput & Partial<Pick<ImportDraft, 'draftId' | 'confidence' | 'issues' | 'originalRequestText'>> = { ...draft }
  delete fields.draftId
  delete fields.confidence
  delete fields.issues
  delete fields.originalRequestText
  return {
    ...fields,
    normalized_priority: draft.priority,
    original_status_text: draft.original_status_text || draft.status,
    scheduled_date: draft.scheduled_date || '',
    reported_at: draft.reported_at || '',
    assessed_at: draft.assessed_at || '',
    estimated_hours: draft.estimated_hours ?? '',
    required_technician_count: draft.required_technician_count || 1,
    pa_project: Boolean(draft.pa_project),
    pa_project_notes: draft.pa_project_notes || '',
    corrective_maintenance: Boolean(draft.corrective_maintenance),
    estimate_required: Boolean(draft.estimate_required),
    estimate_number: draft.estimate_number || '',
    parts_status: draft.parts_status || '',
    parts_ordered: Boolean(draft.parts_ordered),
    parts_ordered_at: draft.parts_ordered_at || '',
    parts_eta: draft.parts_eta || '',
    follow_up_due_on: draft.follow_up_due_on || '',
    follow_up_owner: draft.follow_up_owner || '',
    vendor_reference: draft.vendor_reference || '',
    latest_follow_up_note: draft.latest_follow_up_note || '',
  }
}

function formFromWorkOrder(workOrder: WorkOrder): WorkOrderInput {
  return {
    expected_lock_version: workOrder.lock_version,
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
    reported_at: workOrder.reported_at || '',
    assessed_at: workOrder.assessed_at || '',
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
    parts_ordered_at: workOrder.parts_ordered_at || '',
    parts_eta: workOrder.parts_eta || '',
    follow_up_due_on: workOrder.follow_up_due_on || '',
    follow_up_owner: workOrder.follow_up_owner || '',
    vendor_reference: workOrder.vendor_reference || '',
    latest_follow_up_note: workOrder.latest_follow_up_note || '',
  }
}

function WorkOrderRow({ workOrder, canEdit, onEdit, onArchive }: { workOrder: WorkOrder; canEdit: boolean; onEdit: (workOrder: WorkOrder) => void; onArchive: (workOrderId: number, archived: boolean) => Promise<void> }) {
  const [archiveError, setArchiveError] = useState('')
  const [archiving, setArchiving] = useState(false)
  async function archive() {
    if (archiving) return
    setArchiving(true)
    setArchiveError('')
    try { await onArchive(workOrder.id, !workOrder.archived) }
    catch (error) { setArchiveError(error instanceof Error ? error.message : 'Unable to archive this work order.') }
    finally { setArchiving(false) }
  }
  const details = [
    ['Client', workOrder.client], ['Service line', workOrder.service_line || 'Unassigned'],
    ['Trade / region', `${workOrder.trade_category} / ${workOrder.region || 'Unknown'}`],
    ['Source', workOrder.source], ['Reported', shortDateTime(workOrder.reported_at)],
    ['Scheduled', shortDate(workOrder.scheduled_date)], ['KPI due', shortDateTime(workOrder.sla_due_at)],
    ['Assessed', shortDateTime(workOrder.assessed_at)], ['Estimated hours', workOrder.estimated_hours ?? 'Not set'],
    ['Required crew size', workOrder.required_technician_count], ['Parts status', workOrder.parts_status || 'Not set'],
    ['Parts ordered', workOrder.parts_ordered ? `Yes · ${workOrder.parts_ordered_at ? shortDateTime(workOrder.parts_ordered_at) : 'time not recorded'}` : 'No'],
    ['Parts ETA', shortDate(workOrder.parts_eta)], ['Follow-up owner', workOrder.follow_up_owner || 'Unassigned'],
    ['Follow-up due', shortDate(workOrder.follow_up_due_on)], ['Vendor reference', workOrder.vendor_reference || 'Not set'],
  ]
  return <article className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular text-sm font-bold text-[#172033]">WO #{workOrder.external_id || 'N/A'}</span>
          <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
          <Badge kind={workOrder.normalized_priority}>{workOrder.normalized_priority}</Badge>
          {workOrder.archived && <Badge kind="waiting">Archived</Badge>}
          {workOrder.pa_project && <Badge kind="waiting">PA Project</Badge>}
        </div>
        <h3 className="mt-2 break-words text-base font-bold text-[#172033]">{workOrder.location}</h3>
        <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-[#526071]">{workOrder.description || workOrder.title}</p>
        <p className="mt-2 text-xs text-[#64748b]">{workOrder.client} · {statusSummary(workOrder.status)}</p>
        {(workOrder.latest_follow_up_note || workOrder.parts_status || workOrder.follow_up_due_on) && <p className="mt-2 break-words text-xs leading-5 text-amber-900">
          {workOrder.latest_follow_up_note || (workOrder.parts_status ? `Parts: ${workOrder.parts_status}` : 'Follow-up required')}
          {workOrder.follow_up_due_on ? ` · Follow up ${shortDate(workOrder.follow_up_due_on)}` : ''}
        </p>}
      </div>
      {canEdit && <button type="button" onClick={() => onEdit(workOrder)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#244393]/20 px-3 py-2 text-sm font-bold text-[#244393] hover:bg-blue-50"><Edit3 size={15} /> Edit</button>}
    </div>
    <details className="mt-3 border-t border-slate-100 pt-2">
      <summary className="cursor-pointer text-sm font-semibold text-[#244393]">Details and notes</summary>
      {workOrder.title && workOrder.title !== workOrder.description && <p className="mt-3 break-words text-sm font-bold text-[#172033]">{workOrder.title}</p>}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#334155]">{workOrder.description || workOrder.title}</p>
      <div className="my-3 flex flex-wrap gap-2">
        <Badge kind={slaBadgeKind(workOrder)}>{slaLabel(workOrder)}</Badge>
        {workOrder.corrective_maintenance && <Badge kind="approved">Corrective maintenance</Badge>}
        {workOrder.estimate_required && <Badge kind="scheduled">Estimate{workOrder.estimate_number ? ` #${workOrder.estimate_number}` : ' required'}</Badge>}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">{details.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[#64748b]">{label}</dt><dd className="mt-1 break-words text-[#172033]">{value}</dd></div>)}</dl>
      {workOrder.pa_project_notes && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#334155]"><strong>PA Project: </strong>{workOrder.pa_project_notes}</p>}
      {workOrder.notes && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#334155]"><strong>Notes: </strong>{workOrder.notes}</p>}
      {archiveError && <p role="alert" className="mt-3 text-sm text-red-800">{archiveError}</p>}
      {canEdit && <button type="button" disabled={archiving} onClick={() => void archive()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-[#526071] disabled:opacity-50">{workOrder.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{archiving ? 'Saving...' : workOrder.archived ? 'Restore' : 'Archive'}</button>}
    </details>
  </article>
}

function WorkOrderForm({ initialValues, serviceLines, serviceLineCatalog, onRefreshServiceLines, currentServiceLine, canEdit, saving, notice, allowAddAnother, isNew, review, onUnconfirmed, onDirty, onCancel, onSubmit }: { initialValues: WorkOrderInput; serviceLines: ServiceLine[]; currentServiceLine?: { id: number; name: string | null }; canEdit: boolean; saving: boolean; notice: string; allowAddAnother: boolean; isNew: boolean; review?: Pick<ImportDraft, 'confidence' | 'issues' | 'originalRequestText'>; onUnconfirmed: (value: boolean) => void; onDirty: () => void; onCancel: () => void; onSubmit: (values: WorkOrderInput, addAnother: boolean) => Promise<void> } & ServiceLineCatalogProps) {
  const [values, setValues] = useState<WorkOrderInput>(initialValues)
  const [saveError, setSaveError] = useState('')
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [conflict, setConflict] = useState<WorkOrder | null>(null)
  const createAttempt = useRef<{ fingerprint: string; requestId: string; payload: WorkOrderInput; addAnother: boolean } | null>(null)
  const dateBaseline = useRef(initialValues)
  const submittingRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const assessedTimeRef = useRef<HTMLInputElement>(null)
  const orderedTimeRef = useRef<HTMLInputElement>(null)
  const dispatchDateRef = useRef<HTMLInputElement>(null)
  const partsEtaRef = useRef<HTMLInputElement>(null)
  const followUpDateRef = useRef<HTMLInputElement>(null)
  const saveErrorRef = useRef<HTMLParagraphElement>(null)
  const accessNoticeRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!canEdit) {
      accessNoticeRef.current?.scrollIntoView?.({ block: 'nearest' })
      accessNoticeRef.current?.focus()
    }
  }, [canEdit])
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [allowAddAnother])
  useEffect(() => {
    if (saveError) {
      saveErrorRef.current?.scrollIntoView?.({ block: 'nearest' })
      saveErrorRef.current?.focus()
    }
  }, [saveError])
  const selectedServiceLineId = values.service_line_id ? String(values.service_line_id) : ''
  const serviceLineOptions = useMemo(() => serviceLines.filter((line) => line.active || String(line.id) === selectedServiceLineId), [selectedServiceLineId, serviceLines])
  const currentLineMissing = Boolean(selectedServiceLineId && !serviceLineOptions.some((line) => String(line.id) === selectedServiceLineId))
  const currentLineLabel = currentServiceLine && String(currentServiceLine.id) === selectedServiceLineId && currentServiceLine.name
    ? currentServiceLine.name : `Service line #${selectedServiceLineId}`
  const serviceLinesReady = !serviceLineCatalog || (serviceLineCatalog.confirmed && !serviceLineCatalog.loading && !serviceLineCatalog.error && !serviceLineCatalog.notice)
  const serviceLineMessage = serviceLineCatalog?.loading ? 'Loading service lines. Your current assignment is kept.'
    : serviceLineCatalog?.error ? 'Service lines could not load. Your current assignment is kept.'
      : !serviceLinesReady ? 'Service lines are not confirmed. Your current assignment is kept.' : ''
  const priorityOptions = values.priority && !priorities.includes(values.priority) ? [...priorities, values.priority] : priorities
  const sourceOptions = values.source && !sources.includes(values.source) ? [...sources, values.source] : sources

  function updateField<K extends keyof WorkOrderInput>(field: K, value: WorkOrderInput[K]) {
    onDirty()
    setValues((current) => ({ ...current, [field]: value }))
  }

  function clearOptionalDateValue(field: 'assessed_at' | 'parts_ordered_at' | 'scheduled_date' | 'parts_eta' | 'follow_up_due_on', input: HTMLInputElement | null) {
    // Clear native segmented date/time input too, even if its partial editor has
    // an empty value while the browser still reports badInput.
    if (input) input.value = ''
    updateField(field, '')
    input?.focus()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canEdit || saving || submittingRef.current || conflict) return
    submittingRef.current = true
    setSaveError('')
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const addAnother = allowAddAnother && submitter instanceof HTMLButtonElement && submitter.value === 'another'
    try {
      const payload: WorkOrderInput = {
      ...values,
      normalized_priority: values.priority,
      original_status_text: values.original_status_text || values.status,
      service_line_id: values.service_line_id || null,
      reported_at: datetimeLocalToIso(values.reported_at),
      assessed_at: datetimeLocalToIso(values.assessed_at),
      parts_ordered_at: datetimeLocalToIso(values.parts_ordered_at),
      estimated_hours: values.estimated_hours === '' || values.estimated_hours === undefined ? null : values.estimated_hours,
      required_technician_count: values.required_technician_count || 1,
    }
      if (isNew) {
        const fingerprint = JSON.stringify(payload)
        if (!createAttempt.current || (!unconfirmed && createAttempt.current.fingerprint !== fingerprint)) {
          createAttempt.current = { fingerprint, requestId: crypto.randomUUID(), payload, addAnother }
        }
        await onSubmit({ ...createAttempt.current.payload, client_request_id: createAttempt.current.requestId }, createAttempt.current.addAnother)
      } else {
        for (const field of ['reported_at', 'assessed_at', 'parts_ordered_at'] as const) {
          if (values[field] === dateBaseline.current[field]) delete payload[field]
        }
        await onSubmit(payload, addAnother)
      }
      onUnconfirmed(false)
    } catch (error) {
      if (isNew && (unconfirmed || (error instanceof ApiError && (error.status === null || error.status >= 500)))) {
        setUnconfirmed(true)
        onUnconfirmed(true)
        setSaveError(error instanceof ApiError && error.status === 409 ? 'The original request still cannot be confirmed. It may already have saved; check the queue or ask an admin to reconcile it. Retry uses this same request, never a new one.' : 'We could not confirm the save. It may already be in the queue. Retry to confirm this same request before changing its details.')
        return
      }
      if (error instanceof ApiError && error.body?.code === 'stale_work_order' && error.body.latest_work_order) {
        setConflict(error.body.latest_work_order as WorkOrder)
      }
      setUnconfirmed(false)
      onUnconfirmed(false)
      // A rejected request needs a new receipt even if corrected back to identical inputs.
      createAttempt.current = null
      setSaveError(error instanceof Error ? error.message : 'Unable to save. Your entries are still here; please try again.')
    } finally {
      submittingRef.current = false
    }
  }

  return <form ref={formRef} onInvalidCapture={(event) => { if (event.target instanceof HTMLElement) event.target.closest('details')?.setAttribute('open', '') }} onSubmit={(event) => void handleSubmit(event)} className="work-order-editor flex min-h-0 flex-1 flex-col bg-[#f8faff]">
    {!canEdit && <p ref={accessNoticeRef} data-work-order-access-notice tabIndex={-1} role="alert" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Edit access is unavailable. Your entries and any pending save confirmation are kept here. You can continue if edit access is restored, or close and explicitly discard this draft.</p>}
    <fieldset disabled={!canEdit || saving || unconfirmed} className="min-h-0 min-w-0 flex-1 overflow-y-auto border-0 p-4 pb-6">
    {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{notice}</p>}
    {saveError && <p ref={saveErrorRef} tabIndex={-1} role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">{saveError}{conflict && <><span className="mt-2 block">Your entries are still here. Load the latest saved version to review the other changes before editing again.</span><button type="button" onClick={() => { const latest = formFromWorkOrder(conflict); dateBaseline.current = latest; setValues(latest); setConflict(null); setSaveError(''); onDirty(); formRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }} className="mt-2 rounded-xl border border-red-300 bg-white px-3 py-2 font-bold">Discard my edits and load latest</button></>}</p>}
    <p className="mb-4 text-sm text-[#526071]">Capture the request below. Expand the other sections when you need to schedule work or track a follow-up. Unsaved entries stay in this view only; they are not autosaved.</p>
    {review && <div role="note" aria-label="Extraction review" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-bold">Extraction confidence: {review.confidence}</p>
      {review.issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
      {!values.reported_at && <p className="mt-2 font-semibold">No reported time was extracted. Enter when this request was reported before saving.</p>}
    </div>}
    {review?.originalRequestText && <details className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer font-bold text-[#172033]">Original request text</summary>
      <p className="mt-2 text-xs text-[#64748b]">Kept in this browser review only. This text is not saved with the work order.</p>
      <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6 text-[#334155]">{review.originalRequestText}</pre>
    </details>}
    <div className="grid gap-3 lg:grid-cols-4">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Client
        <input required value={values.client} onChange={(event) => updateField('client', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Location
        <input data-autofocus={allowAddAnother ? '' : undefined} required value={values.location} onChange={(event) => updateField('location', event.target.value)} placeholder="Station, site, or building" className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
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
      <textarea data-autofocus={!allowAddAnother ? '' : undefined} required value={values.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Paste or summarize the incoming request" className="field-control mt-1 min-h-24 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    <div className="mt-3 grid gap-3 lg:grid-cols-6">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Priority
        <select value={values.priority} onChange={(event) => updateField('priority', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}{priorities.includes(priority) ? '' : ' (current priority)'}</option>)}
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
          {sourceOptions.map((source) => <option key={source} value={source}>{source}{sources.includes(source) ? '' : ' (current source)'}</option>)}
        </select>
      </label>

      <div>
        <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Service line
          <select value={values.service_line_id || ''} disabled={!serviceLinesReady} aria-describedby={serviceLineMessage ? 'work-order-service-line-status' : undefined} onChange={(event) => updateField('service_line_id', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
            <option value="">Unassigned</option>
            {currentLineMissing && <option value={selectedServiceLineId}>{currentLineLabel} (current assignment)</option>}
            {serviceLineOptions.map((line) => <option key={line.id} value={line.id}>{line.name}{line.active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
        {serviceLineMessage && <div className="mt-2 text-xs font-semibold normal-case text-[#526071]">
          <p id="work-order-service-line-status" role={serviceLineCatalog?.error ? 'alert' : 'status'}>{serviceLineMessage} {canEdit ? 'You can save other details; refresh the list to change the service line.' : 'The assignment is kept while editing access is unavailable.'}</p>
          {onRefreshServiceLines && <button type="button" disabled={serviceLineCatalog?.loading || saving || unconfirmed || !canEdit} onClick={onRefreshServiceLines} className="mt-2 min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-[#244393] disabled:opacity-60">Refresh service lines</button>}
        </div>}
      </div>
    </div>

    <div className="mt-3 max-w-sm">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Reported at
        <input required type="datetime-local" value={datetimeLocalValue(values.reported_at)} onChange={(event) => updateField('reported_at', event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Used to calculate assessment and repair KPI due times.</span>
      </label>
    </div>
    <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3" open={Boolean(initialValues.scheduled_date || initialValues.assessed_at || initialValues.estimated_hours || Number(initialValues.required_technician_count) > 1)}>
      <summary className="cursor-pointer font-bold text-[#172033]">Scheduling and assessment</summary>
    <div className="mt-3 grid gap-3 lg:grid-cols-4">
      <div>
        <label className="block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Force dispatch date
          <input ref={dispatchDateRef} type="date" value={values.scheduled_date || ''} onChange={(event) => updateField('scheduled_date', event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
          <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Leave blank so KPI timing decides when it appears in dispatch.</span>
        </label>
        <button type="button" onClick={() => clearOptionalDateValue('scheduled_date', dispatchDateRef.current)} className="mt-2 min-h-10 rounded-xl border border-[#244393]/20 px-3 py-2 text-xs font-bold text-[#244393] hover:bg-blue-50">Clear dispatch date</button>
      </div>

      <div>
        <label className="block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Assessed at
          <input ref={assessedTimeRef} type="datetime-local" value={datetimeLocalValue(values.assessed_at)} onChange={(event) => updateField('assessed_at', event.target.value)} className="field-control tabular mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
          <span className="mt-1 block text-xs font-semibold normal-case tracking-normal text-[#64748b]">Optional. Once assessed, repair due time becomes the scheduling pressure.</span>
        </label>
        <button type="button" onClick={() => clearOptionalDateValue('assessed_at', assessedTimeRef.current)} className="mt-2 min-h-10 rounded-xl border border-[#244393]/20 px-3 py-2 text-xs font-bold text-[#244393] hover:bg-blue-50">Clear assessment time</button>
      </div>
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

    </details>
    <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3" open={Boolean(initialValues.pa_project || initialValues.corrective_maintenance || initialValues.estimate_required || initialValues.parts_status || initialValues.parts_ordered || initialValues.parts_eta || initialValues.follow_up_due_on || initialValues.follow_up_owner || initialValues.latest_follow_up_note || initialValues.vendor_reference || initialValues.estimate_number)}>
      <summary className="cursor-pointer font-bold text-[#172033]">Parts, estimates and follow-up</summary>
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
      <div>
        <label className="block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Parts ETA
          <input ref={partsEtaRef} type="date" value={values.parts_eta || ''} onChange={(event) => updateField('parts_eta', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        </label>
        <button type="button" onClick={() => clearOptionalDateValue('parts_eta', partsEtaRef.current)} className="mt-2 min-h-10 rounded-xl border border-[#244393]/20 px-3 py-2 text-xs font-bold text-[#244393] hover:bg-blue-50">Clear parts ETA</button>
      </div>
      <div>
        <label className="block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Follow-up due
          <input ref={followUpDateRef} type="date" value={values.follow_up_due_on || ''} onChange={(event) => updateField('follow_up_due_on', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        </label>
        <button type="button" onClick={() => clearOptionalDateValue('follow_up_due_on', followUpDateRef.current)} className="mt-2 min-h-10 rounded-xl border border-[#244393]/20 px-3 py-2 text-xs font-bold text-[#244393] hover:bg-blue-50">Clear follow-up date</button>
      </div>
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-4">
      <label className="rounded-2xl border border-[rgba(36,67,147,0.12)] bg-white p-3 text-sm font-bold text-[#172033]">
        <input type="checkbox" checked={Boolean(values.parts_ordered)} onChange={(event) => updateField('parts_ordered', event.target.checked)} className="mr-2 accent-[#244393]" />
        Parts Ordered
        <span className="mt-1 block text-xs font-semibold leading-5 text-[#64748b]">Track whether someone actually ordered parts/materials.</span>
      </label>
      <div>
        <label className="block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
          Ordered at
          <input ref={orderedTimeRef} type="datetime-local" value={datetimeLocalValue(values.parts_ordered_at)} onChange={(event) => updateField('parts_ordered_at', event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
        </label>
        <button type="button" onClick={() => clearOptionalDateValue('parts_ordered_at', orderedTimeRef.current)} className="mt-2 min-h-10 rounded-xl border border-[#244393]/20 px-3 py-2 text-xs font-bold text-[#244393] hover:bg-blue-50">Clear order time</button>
      </div>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Follow-up owner
        <input value={values.follow_up_owner || ''} onChange={(event) => updateField('follow_up_owner', event.target.value)} placeholder="Dispatcher or vendor" className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
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

    </details>
    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Notes
      <textarea value={values.notes || ''} onChange={(event) => updateField('notes', event.target.value)} placeholder="Gate code, requester, parts note, manager instructions, etc." className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>

    </fieldset>
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-[rgba(23,32,51,0.1)] bg-white/95 p-4 shadow-[0_-14px_30px_rgba(23,32,51,0.08)] backdrop-blur sm:flex-row sm:flex-wrap sm:justify-end">
      <button disabled={saving} type="button" onClick={onCancel} className="w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
        Cancel
      </button>
      {allowAddAnother && <button disabled={!canEdit || saving || unconfirmed || Boolean(conflict)} type="submit" name="intent" value="another" className="rounded-xl border border-[#244393]/25 bg-white px-4 py-2.5 font-bold text-[#244393] disabled:opacity-50">Save and add another</button>}
      <button disabled={!canEdit || saving || Boolean(conflict)} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(36,67,147,0.18)] transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
        {saving ? 'Saving...' : unconfirmed ? 'Retry and confirm save' : 'Save Work Order'}
      </button>
    </div>
  </form>
}

function WorkOrderEditorDrawer({ open, title, subtitle, saving, onClose, onEditorFocus, children }: { open: boolean; title: string; subtitle: string; saving: boolean; onClose: () => void; onEditorFocus?: (field: HTMLElement) => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const savingRef = useRef(saving)
  useEffect(() => { closeRef.current = onClose; savingRef.current = saving }, [onClose, saving])
  useLayoutEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') || []).filter((element) => element.getClientRects().length > 0)
    const firstInput = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]') || dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled)')
    ;(firstInput || focusable()[0] || dialogRef.current)?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!savingRef.current) closeRef.current()
      }
      if (event.key === 'Tab') {
        const items = focusable()
        const first = items[0]
        const last = items[items.length - 1]
        if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus()
      else document.querySelector<HTMLElement>('[aria-label="Search work orders"]')?.focus()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-hidden="true" tabIndex={-1} aria-label="Close work order editor" disabled={saving} onClick={onClose} className="absolute inset-0 bg-[#07111f]/48 backdrop-blur-sm transition disabled:cursor-wait" />
      <aside ref={dialogRef} onFocusCapture={(event) => { if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select')) onEditorFocus?.(event.target) }} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="work-order-editor-title" className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden border-l border-white/20 bg-[#f8faff] shadow-[-28px_0_60px_rgba(7,17,31,0.26)] sm:w-[92vw] xl:w-[78vw]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[rgba(23,32,51,0.1)] bg-white px-4 py-4 sm:px-5">
          <div>
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-[#244393]">Work order editor</p>
            <h2 id="work-order-editor-title" className="font-display mt-1 text-xl font-black tracking-tight text-[#172033]">{title}</h2>
            <p className="mt-1 text-sm font-semibold leading-5 text-[#64748b]">{subtitle}</p>
          </div>
          <button type="button" aria-label="Close work order editor" disabled={saving} onClick={onClose} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white p-2 text-[#526071] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"><X size={18} /></button>
        </div>
        {children}
      </aside>
    </div>,
    document.body
  )
}

export function WorkOrdersPanel({ workOrders, meta, serviceLines, serviceLineCatalog, onRefreshServiceLines, canEdit, saving, loading = false, loadError = '', onRetry, routeSearch = '', workOrderToEdit, onEditConsumed, onRouteQueryChange, onFetch, onCreate, onUpdate, onArchive, onEditorStateChange, pendingLeave = false, onKeepEditing, onDiscardAndLeave, leaveBlocked = false }: { workOrders: WorkOrder[]; meta: PaginationMeta | null; serviceLines: ServiceLine[]; canEdit: boolean; saving: boolean; loading?: boolean; loadError?: string; onRetry?: () => void; routeSearch?: string; workOrderToEdit?: WorkOrder | null; onEditConsumed?: () => void; onRouteQueryChange?: (query: string) => void; onFetch: (query: string) => Promise<void>; onCreate: (values: WorkOrderInput) => Promise<WorkOrder>; onUpdate: (id: number, values: WorkOrderInput) => Promise<WorkOrder>; onArchive: (workOrderId: number, archived: boolean) => Promise<void> } & WorkOrderNavigationProps & ServiceLineCatalogProps) {
  const initialFilters = workOrderFiltersFromQuery(routeSearch)
  const latestCanEdit = useRef(canEdit)
  useLayoutEffect(() => { latestCanEdit.current = canEdit }, [canEdit])
  const [showForm, setShowForm] = useState(false)
  const [deepEditorId, setDeepEditorId] = useState<number | null>(null)
  const [editorInstance, setEditorInstance] = useState(0)
  const [newDefaults, setNewDefaults] = useState<Partial<WorkOrderInput>>({})
  const [saveNotice, setSaveNotice] = useState('')
  const [savedRecord, setSavedRecord] = useState<WorkOrder | null>(null)
  const [saveUnconfirmed, setSaveUnconfirmed] = useState(false)
  const editorDirty = useRef(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const keepEditingRef = useRef<HTMLButtonElement>(null)
  const lastEditorField = useRef<HTMLElement | null>(null)
  useEffect(() => { if (confirmDiscard || pendingLeave) keepEditingRef.current?.focus() }, [confirmDiscard, pendingLeave])
  const [showPasteIntake, setShowPasteIntake] = useState(false)
  const [editing, setEditing] = useState<WorkOrder | null>(null)
  const [reviewDraft, setReviewDraft] = useState<ImportDraft | null>(null)
  const [uploading, setUploading] = useState(false)
  const extractingSource = useRef(false)
  const [intakePreview, setIntakePreview] = useState<{ drafts: ImportDraft[]; warnings: string[] }>({ drafts: [], warnings: [] })
  const importDrafts = intakePreview.drafts
  const importWarnings = intakePreview.warnings
  function setImportDrafts(next: ImportDraft[] | ((current: ImportDraft[]) => ImportDraft[])) {
    setIntakePreview((current) => {
      const drafts = typeof next === 'function' ? next(current.drafts) : next
      return { drafts, warnings: current.warnings }
    })
  }
  function setImportWarnings(warnings: string[]) {
    setIntakePreview((current) => ({ ...current, warnings }))
  }
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

  const filteredWorkOrders = loading || loadError ? [] : workOrders
  const hasActiveFilters = Boolean(query || archiveFilter !== 'active' || statusFilter || priorityFilter || regionFilter || serviceLineFilter || paProjectFilter || correctiveMaintenanceFilter || estimateRequiredFilter || followUpDueFilter || openOnlyFilter || closedFilter || slaStatusFilter)
  const priorityFilterOptions = priorityFilter && !priorities.includes(priorityFilter) ? [...priorities, priorityFilter] : priorities
  const activeEditing = editing ?? workOrderToEdit ?? null
  const deepEditId = workOrderToEdit?.id ?? null
  // A permission change must disable an existing draft, not replace its state.
  // Fresh Viewer deep links continue to use the separate read-only details view.
  const isFormOpen = showForm || Boolean(reviewDraft) || Boolean(workOrderToEdit && (canEdit || deepEditorId === deepEditId))
  useLayoutEffect(() => {
    if (canEdit && deepEditId !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDeepEditorId(deepEditId)
    } else if (deepEditorId !== deepEditId) {
      setDeepEditorId(null)
    }
  }, [canEdit, deepEditId, deepEditorId])

  useLayoutEffect(() => {
    onEditorStateChange?.({ open: isFormOpen, dirty: editorDirty.current || saveUnconfirmed, saving: isFormOpen && saving, unconfirmed: saveUnconfirmed })
  }, [isFormOpen, saving, saveUnconfirmed, onEditorStateChange])
  useEffect(() => () => onEditorStateChange?.({ open: false, dirty: false, saving: false, unconfirmed: false }), [onEditorStateChange])

  function setEditorDirty(dirty: boolean) {
    editorDirty.current = dirty
    onEditorStateChange?.({ open: isFormOpen, dirty: dirty || saveUnconfirmed, saving: isFormOpen && saving, unconfirmed: saveUnconfirmed })
  }

  function keepEditing() {
    setConfirmDiscard(false)
    onKeepEditing?.()
    const dialog = keepEditingRef.current?.closest('[role="dialog"]')
    const previous = lastEditorField.current
    const field = previous?.isConnected && !previous.matches(':disabled') ? previous : dialog?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled), [data-work-order-access-notice], button[type="submit"]:not(:disabled)')
    ;(field || dialog?.querySelector<HTMLElement>('button[type="submit"]:not(:disabled)'))?.focus()
  }

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
    setSaveNotice('')
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
    setSort('created_at')
    setDirection('desc')
    goToQuery(DEFAULT_WORK_ORDER_QUERY)
  }

  const formInitialValues = activeEditing ? formFromWorkOrder(activeEditing) : reviewDraft ? formFromImportDraft(reviewDraft) : { ...emptyForm(), ...newDefaults }
  const editorTitle = activeEditing ? `Edit ${activeEditing.location}` : reviewDraft ? 'Review scanned intake' : 'New work order'
  const editorSubtitle = activeEditing
    ? `WO #${activeEditing.external_id || 'N/A'} · ${statusLabel(activeEditing.status)} · ${activeEditing.normalized_priority}`
    : reviewDraft
      ? 'Confirm the AI/OCR fields before this becomes a live dispatch record.'
      : 'Add the request now. Scheduling and follow-up details can be updated later.'

  async function submitForm(values: WorkOrderInput, addAnother: boolean) {
    if (!canEdit) throw new Error('Viewer access cannot save work orders.')
    if (activeEditing) {
      const saved = await onUpdate(activeEditing.id, values)
      setSavedRecord(saved || null)
    } else {
      const saved = await onCreate(values)
      setSavedRecord(saved || null)
      if (reviewDraft) setImportDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.draftId !== reviewDraft.draftId))
    }
    setSaveUnconfirmed(false)
    setEditorDirty(false)
    setConfirmDiscard(false)
    const savedLabel = values.external_id ? `Work order #${values.external_id}` : `Work order for ${values.location}`
    setSaveNotice(`${savedLabel} ${activeEditing ? 'updated' : 'saved'}. Your queue view has been kept.`)
    // A confirmed save remains successful if access changed while it was pending,
    // but opening another request requires the current permission.
    if (addAnother && !activeEditing && !reviewDraft && latestCanEdit.current) {
      setNewDefaults({ client: values.client, source: values.source, service_line_id: values.service_line_id })
      setEditorInstance((current) => current + 1)
      return
    }
    setEditing(null)
    setReviewDraft(null)
    setShowForm(false)
    onEditConsumed?.()
  }

  function startCreate() {
    if (!canEdit) return
    setSaveNotice('')
    setSavedRecord(null)
    setSaveUnconfirmed(false)
    setEditorDirty(false)
    setConfirmDiscard(false)
    setNewDefaults({})
    setEditorInstance((current) => current + 1)
    onEditConsumed?.()
    setEditing(null)
    setReviewDraft(null)
    setShowForm(true)
  }

  function startEdit(workOrder: WorkOrder) {
    setSaveNotice('')
    setSaveUnconfirmed(false)
    setEditorDirty(false)
    setConfirmDiscard(false)
    onEditConsumed?.()
    setEditing(workOrder)
    setReviewDraft(null)
    setShowForm(canEdit)
  }

  function closeEditor() {
    if (saving) return
    if (editorDirty.current || saveUnconfirmed || pendingLeave) { setConfirmDiscard(true); return }
    discardEditor()
  }

  function discardEditor(notifyConsumed = true) {
    if (saving) return
    setSaveUnconfirmed(false)
    setEditorDirty(false)
    setConfirmDiscard(false)
    setShowForm(false)
    setEditing(null)
    setReviewDraft(null)
    if (notifyConsumed) onEditConsumed?.()
  }

  async function previewUpload(file: File | null) {
    if (!canEdit || !file || extractingSource.current) return
    extractingSource.current = true
    setUploading(true)
    setImportError('')
    try {
      const data = new FormData()
      data.append('file', file)
      const payload = await postForm<WorkOrderImportPreview>('/work_order_imports/preview', data)
      const newDrafts = payload.work_orders.map((draft, index) => ({ ...draft, draftId: draftId(draft, index), originalRequestText: undefined }))
      setImportWarnings(payload.warnings || [])
      if (newDrafts.length) setImportDrafts((currentDrafts) => [...currentDrafts, ...newDrafts])
      else setImportError('No work orders found in this source. Add more detail or try a clearer screenshot, then preview again. Earlier proposals are still available.')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to scan uploaded work order')
    } finally {
      extractingSource.current = false
      setUploading(false)
    }
  }

  async function previewPastedText() {
    if (!canEdit || extractingSource.current) return
    if (!pasteText.trim()) return setImportError('Paste a WhatsApp, email, or work-order note first.')
    const originalRequestText = pasteText
    extractingSource.current = true
    setUploading(true)
    setImportError('')
    try {
      const payload = await postJson<WorkOrderImportPreview>('/work_order_imports/preview', { text: originalRequestText })
      const newDrafts = payload.work_orders.map((draft, index) => ({ ...draft, draftId: draftId(draft, index), originalRequestText }))
      setImportWarnings(payload.warnings || [])
      if (newDrafts.length) {
        setImportDrafts((currentDrafts) => [...currentDrafts, ...newDrafts])
        // Keep incomplete source available to split/reprocess omitted requests.
        if (!payload.warnings?.length) setPasteText('')
      } else setImportError('No work orders found in this source. Add more detail or try a clearer screenshot, then preview again. Earlier proposals are still available.')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to preview pasted intake')
    } finally {
      extractingSource.current = false
      setUploading(false)
    }
  }

  function handleClipboardPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!canEdit || extractingSource.current) { event.preventDefault(); return }
    const file = Array.from(event.clipboardData.files).find((candidate) => candidate.type.startsWith('image/') || candidate.type === 'application/pdf')
    if (file) {
      event.preventDefault()
      void previewUpload(file)
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

  return <Card className="work-order-workspace overflow-hidden">
    <PanelHeader
      eyebrow="Work orders"
      title="Work orders"
      description="Capture incoming requests, find existing work, and keep follow-ups moving."
      action={canEdit ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
        <button type="button" onClick={startCreate} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#c53c2e] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(216,67,50,0.2)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] sm:w-auto"><Plus size={16} /> New Work Order</button>
        <button type="button" onClick={() => setShowPasteIntake((current) => !current)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] sm:w-auto"><ClipboardPaste size={16} /> Paste Intake</button>
        <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#dfe8ff] sm:w-auto">
          <FileUp size={16} /> {uploading ? 'Scanning...' : 'Scan File'}
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ''; void previewUpload(file) }} className="sr-only" />
        </label>

      </div> : <span className="tabular rounded-full bg-[#172b63] px-3 py-1.5 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-white">{workOrders.length} records</span>}
    />

    {saveNotice && !isFormOpen && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
      <p role="status" className="text-sm font-semibold text-emerald-900">{saveNotice}</p>
      {savedRecord && <button type="button" onClick={() => startEdit(savedRecord)} className="min-h-10 rounded-xl border border-emerald-800 px-3 py-2 text-sm font-bold text-emerald-900">View saved work order</button>}
    </div>}
    {importError && <div role="alert" className="border-b border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800">{importError}</div>}

    {showPasteIntake && <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-[#244393]">Paste intake</p>
          <p id="work-order-paste-intake-help" className="mt-1 text-sm text-[#526071]">Paste a WhatsApp/email request, or paste a screenshot directly into this box. The app creates reviewable drafts only.</p>
        </div>
        <button type="button" onClick={() => setShowPasteIntake(false)} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#334155]">Close</button>
      </div>
      <textarea disabled={!canEdit || uploading} aria-label="Incoming request text or screenshot" aria-describedby="work-order-paste-intake-help" value={pasteText} onPaste={handleClipboardPaste} onChange={(event) => { if (!extractingSource.current) setPasteText(event.target.value) }} rows={5} placeholder="Paste text here, or click in this box and paste a screenshot from the clipboard..." className="field-control w-full rounded-2xl px-4 py-3 text-sm font-semibold leading-6 text-[#172033]" />
      {uploading && <p role="status" className="mt-2 text-sm text-[#526071]">Reading this source. Text stays locked until the preview finishes.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!canEdit || uploading || !pasteText.trim()} onClick={() => void previewPastedText()} className="rounded-xl bg-[#244393] px-4 py-2 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:opacity-50">Preview pasted text</button>
        <span className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-[#64748b]">Screenshots are scanned immediately when pasted.</span>
      </div>
    </div>}

    {importWarnings.length > 0 && <div role="status" className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-bold">Check this extraction before continuing</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{importWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
      <p className="mt-2">Review any omitted requests before acknowledging this extraction.</p>
      <button type="button" onClick={() => setImportWarnings([])} className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 font-bold">Acknowledge extraction warnings</button>
    </div>}

    {importDrafts.length > 0 && <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.16em] text-[#244393]">AI intake preview</p>
          <p className="mt-1 text-sm text-[#526071]">Open each extracted request, correct the fields, then save it as a work order. Nothing enters dispatch until reviewed.</p>
        </div>
        <button type="button" aria-label="Clear intake preview" onClick={() => setImportDrafts([])} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#334155]">Clear</button>
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
            <button type="button" disabled={!canEdit || saving} onClick={() => { if (!canEdit) return; setSaveNotice(''); setSavedRecord(null); setSaveUnconfirmed(false); setEditorDirty(false); setConfirmDiscard(false); setReviewDraft(draft); setShowForm(false); setEditing(null); onEditConsumed?.() }} className="shrink-0 rounded-2xl bg-[#16835f] px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-wait disabled:opacity-60">Review/Edit</button>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#526071]">{draft.description}</p>
          <p className="mt-2 text-xs font-semibold text-[#64748b]">{draft.client} • {draft.region} • {draft.trade_category} • WO #{draft.external_id || 'N/A'}</p>
          {draft.notes && <p className="mt-2 text-xs font-semibold text-[#526071]">Notes: {draft.notes}</p>}
          {draft.issues.length > 0 && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Review: {draft.issues.join(', ')}</p>}
        </article>)}
      </div>
    </div>}

    <WorkOrderEditorDrawer open={!canEdit && !isFormOpen && Boolean(activeEditing)} title={`Work order #${activeEditing?.external_id || activeEditing?.id || ''}`} subtitle="Read-only work-order details" saving={false} onClose={closeEditor}>
      {activeEditing && <div className="min-h-0 flex-1 overflow-y-auto p-4"><WorkOrderRow workOrder={activeEditing} canEdit={false} onEdit={() => undefined} onArchive={onArchive} /></div>}
    </WorkOrderEditorDrawer>

    <WorkOrderEditorDrawer open={isFormOpen} title={editorTitle} subtitle={editorSubtitle} saving={saving} onClose={closeEditor} onEditorFocus={(field) => { lastEditorField.current = field }}>
      {leaveBlocked && saving && <p role="status" className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">Wait for this save to finish before leaving Work Orders.</p>}
      {(confirmDiscard || pendingLeave) && <div role="alert" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-bold">{saveUnconfirmed ? 'The last save may already be in the queue. Close without confirming it?' : pendingLeave ? 'Leave Work Orders and discard the unsaved changes?' : 'Discard the unsaved changes to this work order?'}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button ref={keepEditingRef} type="button" disabled={saving} onClick={keepEditing} className="rounded-xl border border-amber-300 bg-white px-3 py-2 font-bold">Keep editing</button>
          <button type="button" disabled={saving} onClick={() => { if (pendingLeave) { discardEditor(false); onDiscardAndLeave?.() } else discardEditor() }} className="rounded-xl bg-amber-950 px-3 py-2 font-bold text-white">{saveUnconfirmed ? 'Close without confirming' : 'Discard changes'}</button>
        </div>
      </div>}
      <WorkOrderForm key={activeEditing?.id || reviewDraft?.draftId || `new-${editorInstance}`} initialValues={formInitialValues} serviceLines={serviceLines} serviceLineCatalog={serviceLineCatalog} onRefreshServiceLines={onRefreshServiceLines} currentServiceLine={activeEditing?.service_line_id ? { id: activeEditing.service_line_id, name: activeEditing.service_line } : undefined} canEdit={canEdit} saving={saving} notice={saveNotice} allowAddAnother={!activeEditing && !reviewDraft} isNew={!activeEditing} review={reviewDraft || undefined} onUnconfirmed={setSaveUnconfirmed} onDirty={() => setEditorDirty(true)} onCancel={closeEditor} onSubmit={submitForm} />
    </WorkOrderEditorDrawer>

    <div className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-[#244393]">Queue views</p>
        <span className="text-xs font-bold text-[#64748b]">Choose a view, or search for a specific request.</span>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {quickFilters.map((filter) => {
          const isActive = normalizedAppliedQuery === normalizedWorkOrderQuery(filter.query)
          return <button key={filter.label} type="button" aria-pressed={isActive} onClick={() => applyQuickFilter(filter.query)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] transition ${isActive ? 'border-[#172b63] bg-[#172b63] text-white shadow-[0_10px_24px_rgba(23,43,99,0.16)]' : 'border-[rgba(36,67,147,0.16)] bg-white text-[#244393] hover:bg-[#e8eefc]'}`}>{filter.label}</button>
        })}
      </div>
    </div>

    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white p-3 sm:p-4">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search work orders" onKeyDown={(event) => { if (event.key === 'Enter') applyFilters() }} placeholder="Search WO #, site, description or notes" className="field-control w-full rounded-xl py-2 pl-9 pr-3 text-sm font-semibold text-[#172033]" />
        </label>
        <select aria-label="Status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
        <button type="button" onClick={applyFilters} className="min-h-10 rounded-xl bg-[#244393] px-4 py-2 text-sm font-bold text-white">Search</button>
      </div>
      <details className="mt-3" open={Boolean(initialFilters.archive !== 'active' || initialFilters.priority || initialFilters.region || initialFilters.serviceLine || initialFilters.slaStatus || initialFilters.paProject || initialFilters.correctiveMaintenance || initialFilters.estimateRequired || initialFilters.followUpDue || initialFilters.openOnly || initialFilters.closed || (initialFilters.sort !== 'created_at') || (initialFilters.direction !== 'desc'))}>
        <summary className="cursor-pointer text-sm font-semibold text-[#244393]">More filters and sorting{hasActiveFilters ? ' · filters selected' : ''}</summary>

      <div className="grid gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[1fr_150px_160px_150px_150px_180px_150px]">

        <select aria-label="Archive filter" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as 'active' | 'archived' | 'all')} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="active">Active queue</option>
          <option value="archived">Archived</option>
          <option value="all">All records</option>
        </select>

        <select aria-label="Priority filter" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All priority</option>
          {priorityFilterOptions.map((priority) => <option key={priority} value={priority}>{priority}{priorities.includes(priority) ? '' : ' (current priority)'}</option>)}
        </select>
        <select aria-label="Region filter" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All regions</option>
          {regions.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
        <select aria-label="Service line filter" value={serviceLineFilter} onChange={(event) => setServiceLineFilter(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All service lines</option>
          {serviceLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
        </select>
        <select aria-label="KPI filter" value={slaStatusFilter} onChange={(event) => setSlaStatusFilter(event.target.value as SlaStatusFilter)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="">All KPI</option>
          <option value="overdue">KPI overdue</option>
          <option value="due_soon">KPI due soon</option>
          <option value="missing">KPI missing</option>
          <option value="on_track">KPI on track</option>
        </select>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[180px_150px_auto]">
        <select aria-label="Sort work orders" value={sort} onChange={(event) => setSort(event.target.value)} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="scheduled_date">Sort scheduled</option>
          <option value="created_at">Sort created</option>
          <option value="sla_due_at">Sort KPI due</option>
          <option value="priority">Sort priority</option>
          <option value="status">Sort status</option>
          <option value="location">Sort location</option>
        </select>
        <select aria-label="Sort direction" value={direction} onChange={(event) => setDirection(event.target.value as 'asc' | 'desc')} className="field-control rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={applyFilters} className="w-full rounded-xl bg-[#244393] px-4 py-2 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] sm:w-auto">Apply filters</button>
          <button type="button" onClick={clearFilters} className="w-full rounded-xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 sm:w-auto">Clear</button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" aria-pressed={paProjectFilter} onClick={() => setPaProjectFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${paProjectFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>PA Projects</button>
        <button type="button" aria-pressed={correctiveMaintenanceFilter} onClick={() => setCorrectiveMaintenanceFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${correctiveMaintenanceFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>CM</button>
        <button type="button" aria-pressed={estimateRequiredFilter} onClick={() => setEstimateRequiredFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${estimateRequiredFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Estimates</button>
        <button type="button" aria-pressed={followUpDueFilter} onClick={() => setFollowUpDueFilter((current) => !current)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${followUpDueFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Follow-up Due</button>
        <button type="button" onClick={() => { setOpenOnlyFilter((current) => !current); setClosedFilter(false) }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${openOnlyFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Open Only</button>
        <button type="button" onClick={() => { setClosedFilter((current) => !current); setOpenOnlyFilter(false) }} className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] ${closedFilter ? 'bg-[#244393] text-white' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393]'}`}>Closed</button>
      </div>
      </details>
    </div>

    <div className="space-y-2 p-2 sm:p-3">
      {loading && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm font-semibold text-[#244393]">Loading work orders...</p>}
      {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p>{loadError}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-xl border border-red-300 bg-white px-3 py-2 font-bold">Retry work orders</button>}</div>}
      {filteredWorkOrders.map((wo) => <WorkOrderRow key={wo.id} workOrder={wo} canEdit={canEdit} onEdit={startEdit} onArchive={onArchive} />)}
      {!loading && !loadError && workOrders.length === 0 && hasActiveFilters && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071]">No work orders match the current filters.</p>}
      {!loading && !loadError && workOrders.length === 0 && !hasActiveFilters && <div className="rounded-2xl border border-dashed border-[rgba(36,67,147,0.22)] bg-[#f8faff] p-6">
        <p className="font-display text-lg font-extrabold text-[#172033]">No work orders yet.</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526071]">Start by adding the first incoming request from WhatsApp, phone, email, or the work-order system. Once saved, it can be reviewed and scheduled.</p>
        {canEdit && <button onClick={startCreate} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63]"><Plus size={16} /> Add First Work Order</button>}
      </div>}
      {!loading && !loadError && workOrders.length > 0 && <div className="flex flex-col items-start justify-between gap-3 px-2 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#64748b] sm:flex-row sm:items-center sm:px-3">
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
