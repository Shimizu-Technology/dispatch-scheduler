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
}

function statusCopy(schedule: DispatchSchedule | null) {
  if (!schedule) return 'Generate a schedule to preview the send-ready crew assignments.'
  if (schedule.status === 'sent') return `Marked sent${schedule.sent_by ? ` by ${schedule.sent_by}` : ''}.`
  if (schedule.status === 'finalized') return 'Finalized and ready to copy into WhatsApp. Mark sent after the message is sent.'
  return 'Draft preview. Finalize the schedule before sending the crew assignments.'
}

export function WhatsAppExport({ schedule, message, crews, copied, working, canEdit, onCopy, onMarkSent }: WhatsAppExportProps) {
  const canMarkSent = Boolean(message && schedule && schedule.status !== 'sent' && canEdit)
  const totalStops = crews.reduce((sum, crew) => sum + crew.stops_count, 0)

  return <div className="space-y-4">
    <Card className="overflow-hidden">
      <PanelHeader
        eyebrow="Send-ready copy"
        title="WhatsApp Export"
        description={statusCopy(schedule)}
        action={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <button disabled={!message} onClick={onCopy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#16835f] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(22,131,95,0.22)] transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto">
            <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy Dispatch'}
          </button>
          {canEdit && <button disabled={!canMarkSent || working} onClick={onMarkSent} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(36,67,147,0.18)] transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto">
            <Send size={16} /> {schedule?.status === 'sent' ? 'Sent' : 'Mark Sent'}
          </button>}
        </div>}
      />

      {message && <div className="grid gap-3 border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-3 sm:p-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#64748b]">Crews</p>
          <p className="font-display mt-1 text-2xl font-black text-[#172033]">{crews.length}</p>
        </div>
        <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#64748b]">Stops</p>
          <p className="font-display mt-1 text-2xl font-black text-[#172033]">{totalStops}</p>
        </div>
        <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#64748b]">Status</p>
          <p className="font-display mt-1 text-2xl font-black capitalize text-[#172033]">{schedule?.status || 'None'}</p>
        </div>
      </div>}

      {crews.length > 0 && <div className="grid gap-3 border-b border-[rgba(23,32,51,0.1)] p-3 sm:p-4 lg:grid-cols-2">
        {crews.map((crew) => <article key={crew.team_id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/90 p-3 shadow-[0_10px_26px_rgba(23,32,51,0.05)] sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-sm font-black uppercase tracking-[0.08em] text-[#172033]">{crew.active_team_name || crew.team_name}</p>
              <p className="mt-1 text-sm font-semibold text-[#526071]">{crew.stops_count} {crew.stops_count === 1 ? 'stop' : 'stops'}</p>
            </div>
            <span className="rounded-2xl bg-[#e8eefc] p-2 text-[#244393]"><UsersRound size={17} /></span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#526071]">{crew.technician_names.length ? crew.technician_names.join(', ') : 'No crew assigned'}</p>
          {crew.call_outs.length > 0 && <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            <span className="inline-flex items-center gap-2"><Radio size={14} /> Out today: {crew.call_outs.map((callOut) => `${callOut.name} - ${callOut.reason}`).join(', ')}</span>
          </div>}
        </article>)}
      </div>}

      <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap bg-[#172033] p-3 text-sm leading-6 text-blue-50 shadow-inner sm:p-5">{message || 'Generate a schedule to preview the WhatsApp message.'}</pre>
    </Card>
  </div>
}
