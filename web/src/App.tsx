import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, Clipboard, LayoutDashboard, MapPin, RefreshCw, Save, Users, Wrench } from 'lucide-react'
import './index.css'

type Dashboard = {
  date: string
  counts: Record<string, number>
  status_breakdown: Record<string, number>
  priority_breakdown: Record<string, number>
}

type WorkOrder = {
  id: number
  external_id: string | null
  client: string
  location: string
  region: string
  title: string
  description: string
  priority: string
  normalized_priority: string
  status: string
  original_status_text: string
  trade_category: string
  scheduled_date: string | null
  source: string
  team_name: string | null
  notes: string | null
}

type Technician = {
  id: number
  name: string
  primary_trade: string
  skills: string[]
  is_driver: boolean
  availability: string
  availability_reason?: string
}

type Team = {
  id: number
  name: string
  region_preference: string | null
  has_driver: boolean
  skills: string[]
  technicians: Technician[]
}

type PmTask = {
  id: number
  client: string
  location: string
  region: string
  task_name: string
  trade_category: string
  scheduled_date: string
}

type DispatchItem = {
  id: number
  team_id: number
  team_name: string
  order_index: number
  scheduled_time: string
  notes: string
  kind: 'work_order' | 'pm_task'
  work_order?: WorkOrder
  pm_task?: PmTask
}

type DispatchSummary = {
  scheduled_items: number
  eligible_work_orders: number
  eligible_pm_tasks: number
  blocked_work_orders: number
  message: string
}

type DispatchSchedule = {
  id: number
  date: string
  status: string
  summary: DispatchSummary
  items: DispatchItem[]
}

const API = '/api/v1'
const DEMO_DATE = '2026-05-01'

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function badgeClass(kind: string) {
  const value = kind.toLowerCase()
  if (value.includes('p1') || value.includes('level 1')) return 'bg-red-100 text-red-800 border-red-200'
  if (value.includes('p2')) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (value.includes('p3')) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  if (value.includes('approved')) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (value.includes('waiting')) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (value.includes('assessment')) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (value.includes('pm')) return 'bg-purple-100 text-purple-800 border-purple-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function Badge({ children, kind = '' }: { children: React.ReactNode; kind?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold capitalize ${badgeClass(kind || String(children))}`}>{children}</span>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function patchJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [pmTasks, setPmTasks] = useState<PmTask[]>([])
  const [schedule, setSchedule] = useState<DispatchSchedule | null>(null)
  const [whatsApp, setWhatsApp] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const [dash, orders, teamData, pms] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${DEMO_DATE}`),
      getJson<WorkOrder[]>('/work_orders'),
      getJson<Team[]>(`/teams?date=${DEMO_DATE}`),
      getJson<PmTask[]>(`/pm_tasks?date=${DEMO_DATE}`),
    ])
    setDashboard(dash)
    setWorkOrders(orders)
    setTeams(teamData)
    setPmTasks(pms)
    setLoading(false)
  }

  useEffect(() => {
    // The initial dashboard load is the app's external data subscription point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((err) => {
      setError(err.message)
      setLoading(false)
    })
  }, [])

  const groupedSchedule = useMemo(() => {
    const groups: Record<string, DispatchItem[]> = {}
    schedule?.items.forEach((item) => {
      groups[item.team_name] ||= []
      groups[item.team_name].push(item)
    })
    Object.values(groups).forEach((items) => items.sort((a, b) => a.order_index - b.order_index))
    return groups
  }, [schedule])

  async function refreshWhatsApp(scheduleId: number) {
    const exportJson = await getJson<{ message: string }>(`/dispatch_schedules/${scheduleId}/whatsapp_export`)
    setWhatsApp(exportJson.message)
  }

  async function suggestSchedule() {
    setWorking(true)
    setError('')
    try {
      const res = await fetch(`${API}/dispatch_schedules/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: DEMO_DATE }),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const created: DispatchSchedule = await res.json()
      setSchedule(created)
      await refreshWhatsApp(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to suggest schedule')
    } finally {
      setWorking(false)
    }
  }

  async function updateDispatchItem(itemId: number, changes: Record<string, unknown>) {
    if (!schedule) return
    setWorking(true)
    setError('')
    try {
      const updated = await patchJson<DispatchSchedule>(`/dispatch_items/${itemId}`, changes)
      setSchedule(updated)
      await refreshWhatsApp(updated.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update dispatch item')
    } finally {
      setWorking(false)
    }
  }

  async function copyWhatsApp() {
    await navigator.clipboard.writeText(whatsApp)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function toggleAvailability(tech: Technician) {
    const next = tech.availability === 'unavailable' ? 'available' : 'unavailable'
    await fetch(`${API}/technicians/${tech.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: DEMO_DATE, availability: next, reason: next === 'unavailable' ? 'Call-out' : '' }),
    })
    await load()
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600"><RefreshCw className="mb-3 animate-spin" />Loading dispatch POC...</main>
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Shimizu Technology POC</p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">John Dispatch Board</h1>
              <p className="mt-3 max-w-3xl text-base text-slate-300 sm:text-lg">Work orders, PMs, call-outs, drivers, skills, and region grouping in one editable dispatch plan with WhatsApp-ready output.</p>
            </div>
            <button disabled={working} onClick={suggestSchedule} className="rounded-2xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">
              {working ? 'Working...' : "Suggest Today's Schedule"}
            </button>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Metric icon={<LayoutDashboard />} label="Open WOs" value={dashboard?.counts.open_work_orders} />
          <Metric icon={<Wrench />} label="Needs Assessment" value={dashboard?.counts.needs_assessment} />
          <Metric icon={<CalendarDays />} label="PM Due" value={dashboard?.counts.pm_due} />
          <Metric icon={<Users />} label="Teams" value={dashboard?.counts.available_teams} />
          <Metric icon={<AlertTriangle />} label="Driver Warnings" value={dashboard?.counts.driver_warnings} danger={Boolean(dashboard?.counts.driver_warnings)} />
          <Metric icon={<MapPin />} label="Regions" value={new Set(workOrders.map((w) => w.region)).size} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-black">Work Orders</h2>
              <p className="text-sm text-slate-500">Mobil workbook, approved/material-prep examples, CBRE PDF sample, and Sodexo WhatsApp sample.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {workOrders.slice(0, 16).map((wo) => <WorkOrderRow key={wo.id} workOrder={wo} />)}
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-xl font-black">Teams & Daily Availability</h2>
              <p className="text-sm text-slate-500">Tap a technician to simulate call-outs. Regenerate to apply availability to a fresh draft.</p>
            </div>
            <div className="space-y-4 p-4">
              {teams.slice(0, 8).map((team) => (
                <div key={team.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">{team.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{team.skills.slice(0, 4).join(', ') || 'Skills pending'}</p>
                    </div>
                    {team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {team.technicians.map((tech) => (
                      <button key={tech.id} onClick={() => toggleAvailability(tech)} className={`rounded-full border px-3 py-1 text-xs font-bold ${tech.availability === 'unavailable' ? 'border-red-200 bg-red-50 text-red-700 line-through' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                        {tech.name}{tech.is_driver ? ' (driver)' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black">Dispatch Builder</h2>
                <p className="text-sm text-slate-500">Suggestions are a draft. John/admin can change crew, time, order, and notes before copying WhatsApp.</p>
              </div>
              <button disabled={working} onClick={suggestSchedule} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">Regenerate Draft</button>
            </div>
            {!schedule ? (
              <div className="p-8 text-center text-slate-500">Click <strong>Suggest Today's Schedule</strong> to generate a draft dispatch plan.</div>
            ) : (
              <div className="space-y-4 p-4">
                <ScheduleSummary summary={schedule.summary} />
                {Object.entries(groupedSchedule).map(([team, items]) => (
                  <div key={team} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-black text-slate-900">{team}</h3>
                    <div className="mt-3 space-y-3">
                      {items.map((item) => <DispatchCard key={`${item.id}-${item.team_id}-${item.scheduled_time}-${item.notes}`} item={item} teams={teams} disabled={working} onUpdate={updateDispatchItem} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <h2 className="text-xl font-black">WhatsApp Export</h2>
                <p className="text-sm text-slate-500">Updates after each manual override.</p>
              </div>
              <button disabled={!whatsApp} onClick={copyWhatsApp} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                <Clipboard size={16} /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap p-5 text-sm leading-6 text-slate-700">{whatsApp || 'Generate a schedule to preview the WhatsApp message.'}</pre>
          </Card>
        </div>

        <Card>
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
      </div>
    </main>
  )
}

function Metric({ icon, label, value, danger = false }: { icon: React.ReactNode; label: string; value?: number; danger?: boolean }) {
  return <Card className="p-4">
    <div className={`mb-3 inline-flex rounded-xl p-2 ${danger ? 'bg-red-100 text-red-700' : 'bg-cyan-100 text-cyan-700'}`}>{icon}</div>
    <div className="text-2xl font-black text-slate-950">{value ?? 0}</div>
    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
  </Card>
}

function ScheduleSummary({ summary }: { summary: DispatchSummary }) {
  return <div className="grid gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-950 sm:grid-cols-4">
    <strong>{summary.scheduled_items} scheduled</strong>
    <span>{summary.eligible_work_orders} work orders</span>
    <span>{summary.eligible_pm_tasks} PM tasks</span>
    <span>{summary.blocked_work_orders} held out</span>
    <p className="sm:col-span-4">{summary.message}</p>
  </div>
}

function WorkOrderRow({ workOrder }: { workOrder: WorkOrder }) {
  return <article className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge kind={workOrder.normalized_priority}>{workOrder.normalized_priority}</Badge>
        <Badge kind={workOrder.status}>{statusLabel(workOrder.status)}</Badge>
        <span className="text-xs font-bold text-slate-400">WO #{workOrder.external_id || 'N/A'}</span>
      </div>
      <h3 className="mt-2 font-black text-slate-900">{workOrder.location} - {workOrder.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{workOrder.description}</p>
      <p className="mt-1 text-xs text-slate-400">Source: {workOrder.source}</p>
    </div>
    <div className="flex flex-row gap-2 text-sm sm:flex-col sm:items-end">
      <span className="font-bold text-slate-700">{workOrder.trade_category}</span>
      <span className="text-slate-500">{workOrder.region}</span>
      {workOrder.team_name && <span className="text-xs text-slate-400">{workOrder.team_name}</span>}
    </div>
  </article>
}

function DispatchCard({ item, teams, disabled, onUpdate }: { item: DispatchItem; teams: Team[]; disabled: boolean; onUpdate: (itemId: number, changes: Record<string, unknown>) => Promise<void> }) {
  const wo = item.work_order
  const pm = item.pm_task
  const [teamId, setTeamId] = useState(String(item.team_id))
  const [scheduledTime, setScheduledTime] = useState(item.scheduled_time || '')
  const [notes, setNotes] = useState(item.notes || '')

  const title = wo ? `${wo.location} - ${wo.title}` : `${pm?.location} - ${pm?.task_name}`
  const kind = wo?.normalized_priority || 'pm'

  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-xs font-black text-cyan-700">{scheduledTime || 'TBD'}</p>
        <h4 className="font-bold text-slate-900">{title}</h4>
      </div>
      <Badge kind={kind}>{wo?.normalized_priority || 'PM'}</Badge>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
      <label className="text-xs font-bold text-slate-500">
        Crew
        <select disabled={disabled} value={teamId} onChange={(event) => setTeamId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-800">
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-500">
        Time
        <input disabled={disabled} type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-800" />
      </label>
    </div>

    <label className="mt-2 block text-xs font-bold text-slate-500">
      Notes / warnings
      <textarea disabled={disabled} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-700" />
    </label>

    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={disabled} onClick={() => onUpdate(item.id, { team_id: Number(teamId), scheduled_time: scheduledTime, notes })} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">
        <Save size={14} /> Save override
      </button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: Math.max(0, item.order_index - 1) })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Move earlier</button>
      <button disabled={disabled} onClick={() => onUpdate(item.id, { order_index: item.order_index + 1 })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Move later</button>
    </div>
  </div>
}

export default App
