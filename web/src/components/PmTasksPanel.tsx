import { Badge, Card } from './ui'
import type { PmTask } from '../types'

export function PmTasksPanel({ pmTasks }: { pmTasks: PmTask[] }) {
  return <Card>
    <div className="border-b border-slate-200 p-5">
      <h2 className="text-xl font-black">PMs Due on Demo Date</h2>
      <p className="text-sm text-slate-500">Preventive maintenance competes with reactive work and now uses station names from John&apos;s PM schedule.</p>
    </div>
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {pmTasks.slice(0, 8).map((pm) => (
        <div key={pm.id} className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
          <Badge kind="pm">PM</Badge>
          <h3 className="mt-3 font-bold text-slate-900">{pm.location}</h3>
          <p className="mt-1 text-sm text-slate-600">{pm.task_name}</p>
        </div>
      ))}
    </div>
  </Card>
}
