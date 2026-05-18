import { Card, PanelHeader } from './ui'
import type { AuditEvent } from '../types'

function actionLabel(action: string) {
  return action.replaceAll('_', ' ').replaceAll('.', ' ')
}

function eventSummary(event: AuditEvent) {
  const metadata = event.metadata || {}
  const target = metadata.title || metadata.item || metadata.team || metadata.technician || metadata.location || metadata.date
  return target ? `${actionLabel(event.action)}: ${target}` : actionLabel(event.action)
}

function eventTime(value: string | null) {
  if (!value) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function ActivityPanel({ events }: { events: AuditEvent[] }) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Audit history"
      title="Activity"
      description="A running record of work-order, crew, dispatch, and schedule status changes."
      action={<span className="tabular rounded-full bg-[#172b63] px-3 py-1.5 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-white">{events.length} events</span>}
    />
    <div className="space-y-3 p-4">
      {events.length === 0 && <p className="rounded-2xl border border-dashed border-[rgba(23,32,51,0.18)] bg-[#f8faff] p-5 text-sm font-semibold text-[#526071]">No activity has been recorded yet.</p>}
      {events.map((event) => <article key={event.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm font-extrabold capitalize text-[#172033]">{eventSummary(event)}</p>
            <p className="mt-1 text-xs font-semibold text-[#64748b]">{event.user_name || 'System'} • {event.record_type} #{event.record_id || 'N/A'}</p>
          </div>
          <time className="tabular text-xs font-bold uppercase tracking-[0.12em] text-[#7b8798]">{eventTime(event.occurred_at)}</time>
        </div>
      </article>)}
    </div>
  </Card>
}
