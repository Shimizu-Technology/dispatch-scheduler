import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { UserButton } from '@clerk/react'
import { AuthGate } from './components/auth/AuthGate'
import { DashboardMetrics } from './components/DashboardMetrics'
import { DispatchBuilder } from './components/DispatchBuilder'
import { PmTasksPanel } from './components/PmTasksPanel'
import { TeamsPanel } from './components/TeamsPanel'
import { WhatsAppExport } from './components/WhatsAppExport'
import { WorkOrdersPanel } from './components/WorkOrdersPanel'
import { DEMO_DATE } from './constants'
import { useAuthContext } from './contexts/useAuthContext'
import { getJson, patchJson, postJson } from './lib/api'
import type { Dashboard, DispatchSchedule, PmTask, Team, Technician, WorkOrder } from './types'
import './index.css'

function DispatchApp() {
  const { isClerkEnabled, isLoading: authLoading, user, canEditDispatch } = useAuthContext()
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

  async function refreshWhatsApp(scheduleId: number) {
    const exportJson = await getJson<{ message: string }>(`/dispatch_schedules/${scheduleId}/whatsapp_export`)
    setWhatsApp(exportJson.message)
  }

  async function suggestSchedule() {
    if (!canEditDispatch) {
      setError('Viewer access cannot regenerate dispatch drafts.')
      return
    }
    if (schedule && !window.confirm('Regenerate this draft? Current manual overrides will be replaced with a fresh suggestion.')) {
      return
    }

    setWorking(true)
    setError('')
    try {
      const created = await postJson<DispatchSchedule>('/dispatch_schedules/suggest', { date: DEMO_DATE })
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
    if (!canEditDispatch) {
      setError('Viewer access cannot update dispatch items.')
      return
    }
    setWorking(true)
    setError('')
    try {
      const updated = await patchJson<DispatchSchedule>(`/dispatch_items/${itemId}`, changes)
      setSchedule(updated)
      try {
        await refreshWhatsApp(updated.id)
      } catch (err) {
        setError(err instanceof Error ? `Override saved, but WhatsApp preview did not refresh: ${err.message}` : 'Override saved, but WhatsApp preview did not refresh')
      }
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
    if (!canEditDispatch) {
      setError('Viewer access cannot update daily availability.')
      return
    }
    const next = tech.availability === 'unavailable' ? 'available' : 'unavailable'
    await patchJson<Technician>(`/technicians/${tech.id}`, { date: DEMO_DATE, availability: next, reason: next === 'unavailable' ? 'Call-out' : '' })
    await load()
  }

  if (authLoading || loading) {
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
            <div className="flex flex-wrap items-center gap-3">
              {user && <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-200">
                <span className="block font-bold text-white">{user.name}</span>
                <span className="capitalize">{user.role}{!isClerkEnabled ? ' (dev)' : ''}</span>
              </div>}
              {isClerkEnabled && <UserButton />}
              {canEditDispatch && <button disabled={working} onClick={suggestSchedule} className="rounded-2xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">
                {working ? 'Working...' : "Suggest Today's Schedule"}
              </button>}
            </div>
          </div>
        </header>

        {!canEditDispatch && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">Viewer mode: you can inspect dashboard, work orders, teams, PMs, and generated schedules, but editing controls are hidden.</div>}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

        <DashboardMetrics dashboard={dashboard} workOrders={workOrders} />

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <WorkOrdersPanel workOrders={workOrders} />
          <TeamsPanel teams={teams} canEdit={canEditDispatch} onToggleAvailability={toggleAvailability} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <DispatchBuilder schedule={schedule} teams={teams} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} />
          <WhatsAppExport message={whatsApp} copied={copied} onCopy={copyWhatsApp} />
        </div>

        <PmTasksPanel pmTasks={pmTasks} />
      </div>
    </main>
  )
}

function App() {
  return <AuthGate><DispatchApp /></AuthGate>
}

export default App
