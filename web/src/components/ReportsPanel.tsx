import { Download, FileText, FolderKanban, Wrench } from 'lucide-react'
import { Card, PanelHeader } from './ui'
import type { MonthlyReport } from '../types'

type ReportsPanelProps = {
  report: MonthlyReport | null
  loading: boolean
  onDownloadCsv: () => Promise<void>
}

type MetricProps = {
  label: string
  value: number | string
  detail?: string
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate'
}

function metricTone(tone: MetricProps['tone'] = 'blue') {
  return {
    blue: 'border-[#244393]/15 bg-[#f8faff] text-[#244393]',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone]
}

function Metric({ label, value, detail, tone = 'blue' }: MetricProps) {
  return <article className={`rounded-2xl border p-4 ${metricTone(tone)}`}>
    <p className="font-display tabular text-2xl font-black tracking-tight">{value}</p>
    <p className="mt-1 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] opacity-80">{label}</p>
    {detail && <p className="mt-2 text-xs font-semibold leading-5 opacity-80">{detail}</p>}
  </article>
}

function formatMinutes(minutes = 0) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder} min`
  if (remainder === 0) return `${hours} hr${hours === 1 ? '' : 's'}`
  return `${hours} hr ${remainder} min`
}

function Breakdown({ title, values, formatValue = (value: number) => value.toString() }: { title: string; values: Record<string, number>; formatValue?: (value: number) => string }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return <div className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-4">
    <h3 className="font-display text-sm font-extrabold text-[#172033]">{title}</h3>
    <div className="mt-3 space-y-2">
      {entries.length === 0 && <p className="text-sm font-semibold text-[#64748b]">No records for this month.</p>}
      {entries.map(([label, count]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-[#f8faff] px-3 py-2 text-sm">
        <span className="font-semibold capitalize text-[#526071]">{label.replaceAll('_', ' ')}</span>
        <span className="tabular font-display font-extrabold text-[#244393]">{formatValue(count)}</span>
      </div>)}
    </div>
  </div>
}

export function ReportsPanel({ report, loading, onDownloadCsv }: ReportsPanelProps) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Monthly reporting"
      title={report ? `JMI Dispatch Report · ${report.month}` : 'JMI Dispatch Report'}
      description="Export the numbers John needs for Mobil/CBRE conversations: KPI pressure, PM completion, CM, estimates, PA Projects, and follow-up visibility."
      action={<button type="button" disabled={!report || loading} onClick={() => void onDownloadCsv()} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(36,67,147,0.18)] transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"><Download size={16} /> Download CSV</button>}
    />

    {loading && <p className="p-5 text-sm font-bold text-[#526071]">Loading monthly report...</p>}
    {!loading && !report && <p className="p-5 text-sm font-bold text-[#526071]">No report loaded yet.</p>}

    {report && <div className="space-y-4 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Work orders" value={report.work_orders.total} detail={`${report.work_orders.open} open · ${report.work_orders.completed_or_closed} closed`} />
        <Metric label="KPI overdue" value={report.work_orders.kpi_overdue} detail={`${report.work_orders.kpi_due_soon} due soon · ${report.work_orders.kpi_missing} missing`} tone={report.work_orders.kpi_overdue > 0 ? 'red' : 'green'} />
        <Metric label="PM month" value={`${report.pm_tasks.completed}/${report.pm_tasks.total}`} detail={`${report.pm_tasks.incomplete} incomplete · ${report.pm_tasks.deferred} deferred · ${report.pm_tasks.timed || 0} timed`} tone={report.pm_tasks.incomplete > 0 ? 'amber' : 'green'} />
        <Metric label="Follow-ups due" value={report.follow_ups.due_this_month} detail={`${report.follow_ups.due_today} due today · ${report.follow_ups.parts_eta_this_month} parts ETA`} tone={report.follow_ups.due_today > 0 ? 'amber' : 'slate'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="PA Projects" value={report.work_orders.pa_projects} detail={`${report.follow_ups.pa_projects_due_this_month} PA follow-ups due`} tone={report.work_orders.pa_projects > 0 ? 'amber' : 'slate'} />
        <Metric label="Corrective Maint." value={report.work_orders.corrective_maintenance} detail="CM-flagged work orders" />
        <Metric label="Estimates" value={report.work_orders.estimate_required} detail="Estimate-required work orders" tone={report.work_orders.estimate_required > 0 ? 'amber' : 'slate'} />
        <Metric label="Waiting parts" value={report.work_orders.waiting_for_parts} detail={`${report.work_orders.waiting_for_approval} waiting approval`} tone={report.work_orders.waiting_for_parts > 0 ? 'amber' : 'slate'} />
        <Metric label="PM actual time" value={formatMinutes(report.pm_tasks.actual_minutes || 0)} detail="Captured from PM time in/out fields" tone={(report.pm_tasks.actual_minutes || 0) > 0 ? 'green' : 'slate'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <Breakdown title="Work orders by status" values={report.work_orders.by_status} />
        <Breakdown title="Work orders by priority" values={report.work_orders.by_priority} />
        <Breakdown title="Work orders by service line" values={report.work_orders.by_service_line} />
        <Breakdown title="PM time by trade" values={report.pm_tasks.by_trade_actual_minutes || {}} formatValue={formatMinutes} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-[#f8faff] p-4">
          <div className="flex items-center gap-3"><span className="rounded-xl bg-white p-2 text-[#244393]"><Wrench size={18} /></span><div><p className="font-display font-extrabold text-[#172033]">CSV includes work-order detail rows</p><p className="text-sm font-semibold text-[#64748b]">WO number, service line, KPI due, CM/estimate, PA Project, parts fields, follow-up owner/date, and notes.</p></div></div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-center gap-3"><span className="rounded-xl bg-white p-2 text-amber-800"><FolderKanban size={18} /></span><div><p className="font-display font-extrabold text-amber-950">PA Projects stay visible</p><p className="text-sm font-semibold text-amber-900/80">Monthly reporting excludes PA Projects from KPI pressure but keeps them in follow-up totals.</p></div></div>
        </div>
      </div>

      <p className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#64748b]"><FileText size={14} /> Generated {new Date(report.generated_at).toLocaleString()}</p>
    </div>}
  </Card>
}
