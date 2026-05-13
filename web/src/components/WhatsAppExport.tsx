import { Clipboard } from 'lucide-react'
import { Card, PanelHeader } from './ui'

export function WhatsAppExport({ message, copied, onCopy }: { message: string; copied: boolean; onCopy: () => Promise<void> }) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Send-ready copy"
      title="WhatsApp Export"
      description="Updates after each manual override."
      action={<button disabled={!message} onClick={onCopy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#19a974] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(25,169,116,0.22)] transition hover:-translate-y-0.5 hover:bg-[#12865d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
        <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy'}
      </button>}
    />
    <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap bg-[#10232a] p-5 text-sm leading-6 text-cyan-50 shadow-inner">{message || 'Generate a schedule to preview the WhatsApp message.'}</pre>
  </Card>
}
