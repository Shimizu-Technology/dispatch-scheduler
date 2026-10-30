import { ClipboardList } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { PaginationMeta, WorkOrder } from '../types'

function shortDate(value?: string | null) {
  if (!value) return 'Not set'
  return value.slice(0, 10)
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

export function PaProjectsPanel({ workOrders, meta, onPage, onEdit, canEdit }: { workOrders: WorkOrder[]; meta: PaginationMeta | null; onPage: (page: number) => Promise<void>; onEdit: (workOrder: WorkOrder) => void; canEdit: boolean }) {
  const paProjects = workOrders.filter((workOrder) => !workOrder.archived && workOrder.pa_project)
  const waitingParts = meta?.sub_counts?.waiting_for_parts ?? paProjects.filter((workOrder) => workOrder.status === 'waiting_for_parts').length
  const estimates = meta?.sub_counts?.estimate_required ?? paProjects.filter((workOrder) => workOrder.estimate_required).length
  const totalCount = meta?.total_count ?? paProjects.length

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Follow-up workspace"
      title="PA Projects"
      description="Status-independent tracking for CBRE/Mobil work that should stay visible while parts, materials, estimates, or long-lead follow-up are pending."
      action={<div className="grid w-full grid-cols-3 gap-2 text-center text-xs font-extrabold  tracking-normal text-[var(--muted)] sm:w-auto sm:text-xs tracking-normal">
        <span className="rounded-xl border border-[var(--jmi-blue)]/15 bg-[var(--jmi-blue-soft)] px-2 py-2 text-[var(--jmi-blue)] sm:px-3">{totalCount} total</span>
        <span className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] px-2 py-2 text-[var(--warning-ink)] sm:px-3">{waitingParts} parts</span>
        <span className="rounded-xl border border-[var(--scheduled-border)] bg-[var(--scheduled-soft)] px-2 py-2 text-[var(--scheduled-ink-strong)] sm:px-3">{estimates} estimates</span>
      </div>}
    />
    <div className="space-y-3 p-3 sm:p-4">
      {paProjects.map((workOrder) => <article key={workOrder.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3 shadow-none sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind={workOrder.normalized_priority || workOrder.priority}>{workOrder.normalized_priority || workOrder.priority || 'Priority unknown'}</Badge>
              <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
              {workOrder.corrective_maintenance && <Badge kind="approved">CM</Badge>}
              {workOrder.estimate_required && <Badge kind="scheduled">Estimate</Badge>}
              <span className="font-display tabular text-xs font-bold  tracking-normal text-[var(--muted)]">WO #{workOrder.external_id || 'N/A'}</span>
            </div>
            <h3 className="font-display mt-2 font-extrabold text-[var(--ink)]">{workOrder.location} - {workOrder.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--ink-soft)]">{workOrder.description}</p>
          </div>
          {canEdit && <button type="button" onClick={() => onEdit(workOrder)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--jmi-blue)]/15 bg-[var(--jmi-blue-soft)] px-3 py-2 font-display text-xs font-extrabold  tracking-normal text-[var(--jmi-blue)] sm:w-auto"><ClipboardList size={14} /> Open work order</button>}
        </div>
        <div className="mt-3 grid gap-2 text-xs font-semibold text-[var(--muted)] sm:grid-cols-4">
          <span>Service line: {workOrder.service_line || 'Unassigned'}</span>
          <span>Scheduled: {shortDate(workOrder.scheduled_date)}</span>
          <span>Last dispatched: {shortDate(workOrder.last_dispatched_on)}</span>
          <span>Trade: {workOrder.trade_category}</span>
        </div>
        <div className="mt-3 grid gap-2 text-xs font-semibold text-[var(--muted)] sm:grid-cols-4">
          <span>Parts: {workOrder.parts_status || 'Not set'}</span>
          <span>Ordered: {workOrder.parts_ordered ? 'Yes' : 'No'}</span>
          <span>Parts ETA: {shortDate(workOrder.parts_eta)}</span>
          <span>Follow-up due: {shortDate(workOrder.follow_up_due_on)}</span>
          <span>Owner: {workOrder.follow_up_owner || 'Unassigned'}</span>
          <span>Vendor ref: {workOrder.vendor_reference || 'None'}</span>
          <span>Estimate #: {workOrder.estimate_number || 'None'}</span>
        </div>
        {(workOrder.pa_project_notes || workOrder.latest_follow_up_note) && <p className="mt-3 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-sm font-semibold leading-6 text-[var(--warning-ink-strong)]">{workOrder.pa_project_notes || workOrder.latest_follow_up_note}{workOrder.pa_project_notes && workOrder.latest_follow_up_note ? ` · Latest: ${workOrder.latest_follow_up_note}` : ''}</p>}
      </article>)}
      {paProjects.length === 0 && <p className="rounded-2xl border border-dashed border-[var(--brand-line)] bg-[var(--surface-subtle)] p-6 text-sm font-semibold text-[var(--ink-soft)]">No PA Projects are marked yet. Check the PA Project box on a work order to make it appear here.</p>}
      {meta && meta.total_count > 0 && <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-2 text-xs font-bold  tracking-normal text-[var(--muted)]">
        <span>{paProjects.length} shown · {meta.total_count} total · page {meta.page} of {Math.max(meta.total_pages, 1)}</span>
        <div className="flex gap-2">
          <button type="button" disabled={meta.page <= 1} onClick={() => void onPage(meta.page - 1)} className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5 text-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
          <button type="button" disabled={meta.page >= meta.total_pages} onClick={() => void onPage(meta.page + 1)} className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5 text-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-50">Next</button>
        </div>
      </div>}
    </div>
  </Card>
}
