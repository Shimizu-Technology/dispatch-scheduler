import { Badge, Card, PanelHeader } from './ui'
import type { WorkOrder } from '../types'

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function WorkOrderRow({ workOrder }: { workOrder: WorkOrder }) {
  return <article className="grid gap-3 rounded-[1.25rem] border border-transparent p-4 transition hover:border-[rgba(16,35,42,0.1)] hover:bg-white/70 sm:grid-cols-[1fr_auto]">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge kind={workOrder.normalized_priority}>{workOrder.normalized_priority}</Badge>
        <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
        <span className="font-display text-xs font-bold uppercase tracking-[0.12em] text-[#8a9a9d]">WO #{workOrder.external_id || 'N/A'}</span>
      </div>
      <h3 className="font-display mt-2 font-extrabold tracking-tight text-[#10232a]">{workOrder.location} - {workOrder.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5c6b70]">{workOrder.description}</p>
      <p className="mt-2 text-xs font-semibold text-[#8a9a9d]">Source: {workOrder.source}</p>
    </div>
    <div className="flex flex-row gap-2 text-sm sm:flex-col sm:items-end">
      <span className="font-display rounded-full bg-[#e7f6f5] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-[#0b4c57]">{workOrder.trade_category}</span>
      <span className="font-semibold text-[#51636a]">{workOrder.region}</span>
      {workOrder.team_name && <span className="text-xs font-semibold text-[#8a9a9d]">{workOrder.team_name}</span>}
    </div>
  </article>
}

export function WorkOrdersPanel({ workOrders }: { workOrders: WorkOrder[] }) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Incoming work"
      title="Work Orders"
      description="Mobil workbook, approved/material-prep examples, CBRE PDF sample, and Sodexo WhatsApp sample."
      action={<span className="rounded-full bg-[#10232a] px-3 py-1.5 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-white">{workOrders.length} records</span>}
    />
    <div className="space-y-2 p-3">
      {workOrders.slice(0, 16).map((wo) => <WorkOrderRow key={wo.id} workOrder={wo} />)}
      {workOrders.length > 16 && <p className="px-3 pb-2 text-xs font-bold text-[#8a6a20]">Showing the first 16 records. Search and filtering are planned for the next intake phase.</p>}
    </div>
  </Card>
}
