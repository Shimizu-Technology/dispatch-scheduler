import { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, ShieldCheck } from 'lucide-react'
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
    return <main className="grid min-h-screen place-items-center px-6 text-[#51636a]">
      <div className="rounded-[2rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/85 p-8 text-center shadow-[0_24px_80px_rgba(16,35,42,0.12)]">
        <RefreshCw className="mx-auto mb-3 animate-spin text-cyan-700" />
        <p className="font-display font-bold">Loading dispatch command board...</p>
      </div>
    </main>
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="mx-auto flex max-w-[92rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="soft-reveal relative overflow-hidden rounded-[2.2rem] bg-[#082f38] p-6 text-white shadow-[0_28px_90px_rgba(8,47,56,0.28)] sm:p-8 lg:p-10">
          <div className="absolute right-[-5rem] top-[-6rem] h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute bottom-[-7rem] left-[38%] h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="font-display text-xs font-extrabold uppercase tracking-[0.34em] text-cyan-200">Shimizu Technology POC</p>
              <h1 className="font-display mt-4 max-w-4xl text-4xl font-extrabold tracking-[-0.04em] sm:text-6xl lg:text-7xl">John Dispatch Board</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-cyan-50/82">A focused morning operations board for work orders, PMs, call-outs, drivers, skills, route regions, and WhatsApp-ready team dispatch.</p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-50/80">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Demo date {DEMO_DATE}</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Draft-first scheduling</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Manual override always</span>
              </div>
            </div>
            <div className="relative flex flex-col gap-3 lg:items-end">
              {user && <div className="w-full rounded-[1.5rem] border border-white/15 bg-white/10 p-4 text-sm text-cyan-50 shadow-2xl backdrop-blur lg:max-w-sm">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-cyan-200/15 p-2 text-cyan-100"><ShieldCheck size={20} /></span>
                  <div>
                    <span className="font-display block font-extrabold text-white">{user.name}</span>
                    <span className="capitalize text-cyan-50/75">{user.role}{!isClerkEnabled ? ' (dev)' : ''}</span>
                  </div>
                </div>
              </div>}
              <div className="flex w-full flex-wrap gap-3 lg:max-w-sm lg:justify-end">
                {isClerkEnabled && <UserButton />}
                {canEditDispatch && <button disabled={working} onClick={suggestSchedule} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f2a51f] px-5 py-3 font-display text-sm font-extrabold text-[#10232a] shadow-[0_16px_38px_rgba(242,165,31,0.28)] transition hover:-translate-y-0.5 hover:bg-[#ffc453] disabled:cursor-wait disabled:opacity-60 sm:flex-none">
                  <ClipboardList size={18} /> {working ? 'Working...' : "Suggest Today's Schedule"}
                </button>}
              </div>
            </div>
          </div>
        </header>

        <section className="soft-reveal-delay grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-[1.7rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/80 p-5 shadow-[0_18px_60px_rgba(16,35,42,0.08)] backdrop-blur">
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.24em] text-cyan-800">Today&apos;s Operating Thesis</p>
            <p className="mt-2 text-base leading-7 text-[#405157]">The system suggests a route-aware draft, but John/admin keeps the final call. Use the board to spot blocked work, driver gaps, PM commitments, and copy a clean WhatsApp dispatch once the draft feels right.</p>
          </div>
          <div className="rounded-[1.7rem] border border-amber-200/80 bg-amber-50/90 p-5 text-[#5c3c05] shadow-[0_18px_60px_rgba(120,79,6,0.08)]">
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.24em] text-amber-700">Pilot Readiness</p>
            <p className="mt-2 text-sm leading-6">Auth, dispatch edits, and exports are live. Upload intake and OCR are next-phase work, not part of this current board yet.</p>
          </div>
        </section>

        {!canEditDispatch && <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Viewer mode: you can inspect dashboard, work orders, teams, PMs, and generated schedules, but editing controls are hidden.</div>}

        {error && <div className="rounded-[1.4rem] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>}

        <DashboardMetrics dashboard={dashboard} workOrders={workOrders} />

        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <WorkOrdersPanel workOrders={workOrders} />
          <TeamsPanel teams={teams} canEdit={canEditDispatch} onToggleAvailability={toggleAvailability} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
          <DispatchBuilder schedule={schedule} teams={teams} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} />
          <div className="grid gap-6">
            <WhatsAppExport message={whatsApp} copied={copied} onCopy={copyWhatsApp} />
            <PmTasksPanel pmTasks={pmTasks} />
          </div>
        </div>
      </div>
    </main>
  )
}

function App() {
  return <AuthGate><DispatchApp /></AuthGate>
}

export default App
