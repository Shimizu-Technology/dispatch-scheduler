import { Badge, Card, PanelHeader } from './ui'
import type { PmTask } from '../types'

export function PmTasksPanel({ pmTasks }: { pmTasks: PmTask[] }) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Preventive maintenance"
      title="PMs Due Today"
      description="Preventive maintenance competes with reactive work and now uses real station names from the PM schedule."
    />
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {pmTasks.length === 0 && <p className="rounded-xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071] sm:col-span-2">No PM tasks due for this date.</p>}
      {pmTasks.slice(0, 8).map((pm) => (
        <div key={pm.id} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#f8faff] to-white p-4 shadow-[0_10px_26px_rgba(36,67,147,0.08)]">
          <Badge kind="pm">PM</Badge>
          <h3 className="font-display mt-3 font-extrabold tracking-tight text-[#172033]">{pm.location}</h3>
          <p className="mt-1 text-sm leading-6 text-[#526071]">{pm.task_name}</p>
        </div>
      ))}
    </div>
  </Card>
}
