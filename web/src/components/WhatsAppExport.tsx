import { Clipboard } from 'lucide-react'
import { Card } from './ui'

export function WhatsAppExport({ message, copied, onCopy }: { message: string; copied: boolean; onCopy: () => Promise<void> }) {
  return <Card>
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5">
      <div>
        <h2 className="text-xl font-black">WhatsApp Export</h2>
        <p className="text-sm text-slate-500">Updates after each manual override.</p>
      </div>
      <button disabled={!message} onClick={onCopy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
        <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
    <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap p-5 text-sm leading-6 text-slate-700">{message || 'Generate a schedule to preview the WhatsApp message.'}</pre>
  </Card>
}
