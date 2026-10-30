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
      description="Recent work-order, crew, dispatch, and schedule status changes."
    />
    <div className="space-y-3 p-3 sm:p-4">
      {events.length === 0 && <p className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-subtle)] p-5 text-sm font-semibold text-[var(--ink-soft)]">No activity has been recorded yet.</p>}
      {events.map((event) => <article key={event.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/88 p-3 shadow-none sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-sm font-extrabold capitalize text-[var(--ink)]">{eventSummary(event)}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{event.user_name || 'System'} • {event.record_type} #{event.record_id || 'N/A'}</p>
          </div>
          <time className="tabular text-xs font-bold  tracking-normal text-[var(--muted)]">{eventTime(event.occurred_at)}</time>
        </div>
      </article>)}
    </div>
  </Card>
}
