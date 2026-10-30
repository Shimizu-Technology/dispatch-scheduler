import { Clipboard, Radio, Send, UsersRound } from 'lucide-react'
import { Card, PanelHeader } from './ui'
import type { DispatchSchedule, WhatsAppCrewExport } from '../types'

type WhatsAppExportProps = {
  schedule: DispatchSchedule | null
  message: string
  crews: WhatsAppCrewExport[]
  copied: boolean
  working: boolean
  canEdit: boolean
  onCopy: () => Promise<void>
  onMarkSent: () => Promise<void>
  onOpenDispatch: () => void
}

function statusCopy(schedule: DispatchSchedule | null) {
  if (!schedule) return 'No dispatch plan for the selected date. Open dispatch to prepare the crew message.'
  if (schedule.status === 'sent') return `Marked sent${schedule.sent_by ? ` by ${schedule.sent_by}` : ''}.`
  if (schedule.status === 'finalized') return 'Finalized and ready to copy into WhatsApp. Mark sent after the message is sent.'
  return 'Draft preview. Finalize the schedule before marking it sent.'
}

export function WhatsAppExport({ schedule, message, crews, copied, working, canEdit, onCopy, onMarkSent, onOpenDispatch }: WhatsAppExportProps) {
  const canMarkSent = Boolean(message && schedule?.status === 'finalized' && canEdit)
  const totalStops = crews.reduce((sum, crew) => sum + crew.stops_count, 0)

  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <PanelHeader
        eyebrow="Send-ready copy"
        title="WhatsApp Export"
        description={statusCopy(schedule)}
        action={!schedule ? <button type="button" onClick={onOpenDispatch} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--jmi-blue)]">Open dispatch</button> : <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <button disabled={!message} onClick={onCopy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl button-success bg-[var(--success)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] shadow-none transition-colors  hover:bg-[var(--success-deep)] disabled:cursor-not-allowed disabled:bg-[var(--border-strong)] disabled:shadow-none sm:w-auto">
            <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy Dispatch'}
          </button>
          {canEdit && <button disabled={!canMarkSent || working} onClick={onMarkSent} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl button-action bg-[var(--jmi-blue)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] shadow-none transition-colors  hover:bg-[var(--jmi-blue-deep)] disabled:cursor-not-allowed disabled:bg-[var(--border-strong)] disabled:shadow-none sm:w-auto">
            <Send size={16} /> {schedule?.status === 'sent' ? 'Sent' : 'Mark Sent'}
          </button>}
        </div>}
      />

      {message && <div className="grid gap-3 border-b border-[var(--line)] bg-[var(--surface-subtle)] p-3 sm:p-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <p className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">Crews</p>
          <p className="font-display mt-1 text-2xl font-black text-[var(--ink)]">{crews.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <p className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">Stops</p>
          <p className="font-display mt-1 text-2xl font-black text-[var(--ink)]">{totalStops}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <p className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">Status</p>
          <p className="font-display mt-1 text-2xl font-black capitalize text-[var(--ink)]">{schedule?.status || 'None'}</p>
        </div>
      </div>}

      {crews.length > 0 && <div className="grid gap-3 border-b border-[var(--line)] p-3 sm:p-4 lg:grid-cols-2">
        {crews.map((crew) => <article key={crew.team_id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/90 p-3 shadow-none sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-sm font-black  tracking-normal text-[var(--ink)]">{crew.active_team_name || crew.team_name}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">{crew.stops_count} {crew.stops_count === 1 ? 'stop' : 'stops'}</p>
            </div>
            <span className="rounded-2xl bg-[var(--jmi-blue-soft)] p-2 text-[var(--jmi-blue)]"><UsersRound size={17} /></span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{crew.technician_names.length ? crew.technician_names.join(', ') : 'No crew assigned'}</p>
          {crew.call_outs.length > 0 && <div className="mt-3 rounded-xl border border-[var(--danger-soft-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--danger-ink)]">
            <span className="inline-flex items-center gap-2"><Radio size={14} /> Out today: {crew.call_outs.map((callOut) => `${callOut.name} - ${callOut.reason}`).join(', ')}</span>
          </div>}
        </article>)}
      </div>}

      {message && <pre tabIndex={0} aria-label="WhatsApp message" className="max-h-[720px] overflow-auto whitespace-pre-wrap bg-[var(--ink)] p-3 text-sm leading-6 text-[var(--info-soft)] shadow-inner sm:p-5">{message}</pre>}
    </Card>
  </div>
}
