import { ClipboardList } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { WorkOrder } from '../types'

function shortDate(value?: string | null) {
  if (!value) return 'Not set'
  return value.slice(0, 10)
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

export function PaProjectsPanel({ workOrders, onEdit, canEdit }: { workOrders: WorkOrder[]; onEdit: () => void; canEdit: boolean }) {
  const paProjects = workOrders.filter((workOrder) => !workOrder.archived && workOrder.pa_project)
  const waitingParts = paProjects.filter((workOrder) => workOrder.status === 'waiting_for_parts').length
  const estimates = paProjects.filter((workOrder) => workOrder.estimate_required).length

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Follow-up workspace"
      title="PA Projects"
      description="Status-independent tracking for CBRE/Mobil work that should stay visible while parts, materials, estimates, or long-lead follow-up are pending."
      action={<div className="grid grid-cols-3 gap-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-[#64748b]">
        <span className="rounded-xl border border-[#244393]/15 bg-[#e8eefc] px-3 py-2 text-[#244393]">{paProjects.length} total</span>
        <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{waitingParts} parts</span>
        <span className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-900">{estimates} estimates</span>
      </div>}
    />
    <div className="space-y-3 p-4">
      {paProjects.map((workOrder) => <article key={workOrder.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-4 shadow-[0_12px_28px_rgba(23,32,51,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind={workOrder.normalized_priority}>{workOrder.normalized_priority}</Badge>
              <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
              {workOrder.corrective_maintenance && <Badge kind="approved">CM</Badge>}
              {workOrder.estimate_required && <Badge kind="scheduled">Estimate</Badge>}
              <span className="font-display tabular text-xs font-bold uppercase tracking-[0.12em] text-[#7b8798]">WO #{workOrder.external_id || 'N/A'}</span>
            </div>
            <h3 className="font-display mt-2 font-extrabold text-[#172033]">{workOrder.location} - {workOrder.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#526071]">{workOrder.description}</p>
          </div>
          {canEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 rounded-2xl border border-[#244393]/15 bg-[#e8eefc] px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#244393]"><ClipboardList size={14} /> Open work queue</button>}
        </div>
        <div className="mt-3 grid gap-2 text-xs font-semibold text-[#64748b] sm:grid-cols-4">
          <span>Service line: {workOrder.service_line || 'Unassigned'}</span>
          <span>Scheduled: {shortDate(workOrder.scheduled_date)}</span>
          <span>Last dispatched: {shortDate(workOrder.last_dispatched_on)}</span>
          <span>Trade: {workOrder.trade_category}</span>
        </div>
        {workOrder.pa_project_notes && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-950">{workOrder.pa_project_notes}</p>}
      </article>)}
      {paProjects.length === 0 && <p className="rounded-2xl border border-dashed border-[rgba(36,67,147,0.22)] bg-[#f8faff] p-6 text-sm font-semibold text-[#526071]">No PA Projects are marked yet. Check the PA Project box on a work order to make it appear here.</p>}
    </div>
  </Card>
}
