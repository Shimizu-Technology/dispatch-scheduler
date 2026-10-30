export const DEFAULT_WORK_ORDER_QUERY = 'archived=active&page=1&per_page=50&sort=created_at&direction=desc'

// Keep manager drilldowns and queue shortcuts on the same API vocabulary.
export const WORK_ORDER_VIEWS = {
  all: { label: 'Active queue', filter: '' },
  open: { label: 'Open', filter: 'open=true' },
  waiting: { label: 'Waiting parts', filter: 'status=waiting_for_parts' },
  overdue: { label: 'Overdue', filter: 'sla_status=overdue&exclude_pa=true' },
  assessment: { label: 'Needs assessment', filter: 'status=needs_assessment' },
  approved: { label: 'Ready to schedule', filter: 'status=approved' },
  approval: { label: 'Waiting approval', filter: 'status=waiting_for_approval' },
  dueSoon: { label: 'Due soon', filter: 'sla_status=due_soon&exclude_pa=true' },
  missing: { label: 'KPI missing', filter: 'sla_status=missing&exclude_pa=true' },
  pa: { label: 'PA projects', filter: 'open=true&pa_project=true' },
  followUp: { label: 'Follow-up due', filter: 'open=true&follow_up_due=true' },
  partsEta: { label: 'Parts ETA', filter: 'open=true&parts_eta_due=true' },
  cm: { label: 'Corrective maintenance', filter: 'open=true&corrective_maintenance=true' },
  estimates: { label: 'Estimates', filter: 'open=true&estimate_required=true' },
  closed: { label: 'Closed', filter: 'closed=true' },
} as const
export type WorkOrderView = keyof typeof WORK_ORDER_VIEWS

export function workOrderViewQuery(view: WorkOrderView, date?: string) {
  const params = new URLSearchParams(DEFAULT_WORK_ORDER_QUERY)
  new URLSearchParams(WORK_ORDER_VIEWS[view].filter).forEach((value, key) => params.set(key, value))
  if (view === 'closed') params.set('archived', 'all')
  if (date && (view === 'followUp' || view === 'partsEta')) params.set('as_of', date)
  return params.toString()
}

export function activeWorkOrderContext(query: string) {
  const params = new URLSearchParams(query)
  const labels: string[] = []
  if (params.get('q')) labels.push(`Search: ${params.get('q')}`)
  if (params.get('open') === 'true') labels.push('Open')
  if (params.get('closed') === 'true') labels.push('Closed')
  if (params.get('status')) labels.push(params.get('status')!.replaceAll('_', ' '))
  if (params.get('sla_status')) labels.push(`KPI ${params.get('sla_status')!.replaceAll('_', ' ')}`)
  for (const [key, label] of [['pa_project', 'PA projects'], ['follow_up_due', 'Follow-up due'], ['parts_eta_due', 'Parts ETA within 7 days'], ['corrective_maintenance', 'Corrective maintenance'], ['estimate_required', 'Estimates'], ['exclude_pa', 'Excluding PA']] as const) {
    if (params.get(key) === 'true') labels.push(label)
  }
  for (const [key, label] of [['priority', 'Priority'], ['region', 'Region'], ['service_line_id', 'Service line'], ['as_of', 'As of']] as const) {
    if (params.get(key)) labels.push(`${label}: ${params.get(key)}`)
  }
  if (params.get('archived') === 'only') labels.push('Archived')
  if (params.get('archived') === 'all') labels.push('Including archived')
  if (!labels.length) labels.push('Active queue')
  const sort = params.get('sort') || 'created_at'
  const direction = params.get('direction') || 'desc'
  labels.push(sort === 'created_at' ? direction === 'asc' ? 'Oldest first' : 'Newest first' : `Sort: ${sort.replaceAll('_', ' ')} ${direction}`)
  return labels.join(' · ')
}
