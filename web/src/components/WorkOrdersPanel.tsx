import { Badge, Card } from './ui'
import type { WorkOrder } from '../types'

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function WorkOrderRow({ workOrder }: { workOrder: WorkOrder }) {
  return <article className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge kind={workOrder.normalized_priority}>{workOrder.normalized_priority}</Badge>
        <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
        <span className="text-xs font-bold text-slate-400">WO #{workOrder.external_id || 'N/A'}</span>
      </div>
      <h3 className="mt-2 font-black text-slate-900">{workOrder.location} - {workOrder.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{workOrder.description}</p>
      <p className="mt-1 text-xs text-slate-400">Source: {workOrder.source}</p>
    </div>
    <div className="flex flex-row gap-2 text-sm sm:flex-col sm:items-end">
      <span className="font-bold text-slate-700">{workOrder.trade_category}</span>
      <span className="text-slate-500">{workOrder.region}</span>
      {workOrder.team_name && <span className="text-xs text-slate-400">{workOrder.team_name}</span>}
    </div>
  </article>
}

export function WorkOrdersPanel({ workOrders }: { workOrders: WorkOrder[] }) {
  return <Card>
    <div className="border-b border-slate-200 p-5">
      <h2 className="text-xl font-black">Work Orders</h2>
      <p className="text-sm text-slate-500">Mobil workbook, approved/material-prep examples, CBRE PDF sample, and Sodexo WhatsApp sample.</p>
    </div>
    <div className="divide-y divide-slate-100">
      {workOrders.slice(0, 16).map((wo) => <WorkOrderRow key={wo.id} workOrder={wo} />)}
    </div>
  </Card>
}
