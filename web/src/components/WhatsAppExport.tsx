import { Clipboard, Send } from 'lucide-react'
import { Card, PanelHeader } from './ui'
import type { DispatchSchedule } from '../types'

export function WhatsAppExport({ schedule, message, copied, working, canEdit, onCopy, onMarkSent }: { schedule: DispatchSchedule | null; message: string; copied: boolean; working: boolean; canEdit: boolean; onCopy: () => Promise<void>; onMarkSent: () => Promise<void> }) {
  const canMarkSent = Boolean(message && schedule && schedule.status !== 'sent' && canEdit)

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Send-ready copy"
      title="WhatsApp Export"
      description={schedule?.status === 'sent' ? `Marked sent${schedule.sent_by ? ` by ${schedule.sent_by}` : ''}.` : 'Updates after each manual override. Mark sent after John sends the dispatch message.'}
      action={<div className="flex flex-wrap gap-2">
        <button disabled={!message} onClick={onCopy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#16835f] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(22,131,95,0.22)] transition hover:-translate-y-0.5 hover:bg-[#106a4c] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
          <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy'}
        </button>
        {canEdit && <button disabled={!canMarkSent || working} onClick={onMarkSent} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(36,67,147,0.18)] transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
          <Send size={16} /> {schedule?.status === 'sent' ? 'Sent' : 'Mark Sent'}
        </button>}
      </div>}
    />
    <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap bg-[#172033] p-5 text-sm leading-6 text-blue-50 shadow-inner">{message || 'Generate a schedule to preview the WhatsApp message.'}</pre>
  </Card>
}
