import { Badge, Card, PanelHeader } from './ui'
import type { PmTask } from '../types'

export function PmTasksPanel({ pmTasks }: { pmTasks: PmTask[] }) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Preventive maintenance"
      title="PMs Due on Demo Date"
      description="Preventive maintenance competes with reactive work and now uses station names from John's PM schedule."
    />
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {pmTasks.slice(0, 8).map((pm) => (
        <div key={pm.id} className="rounded-[1.3rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-[0_10px_26px_rgba(16,182,201,0.08)]">
          <Badge kind="pm">PM</Badge>
          <h3 className="font-display mt-3 font-extrabold tracking-tight text-[#10232a]">{pm.location}</h3>
          <p className="mt-1 text-sm leading-6 text-[#5c6b70]">{pm.task_name}</p>
        </div>
      ))}
    </div>
  </Card>
}
