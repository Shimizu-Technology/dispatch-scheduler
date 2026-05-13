import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ClipboardList, LayoutDashboard, MessageSquareText, RefreshCw, ShieldCheck, Users, Wrench } from 'lucide-react'
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

type ActiveSection = 'overview' | 'dispatch' | 'work-orders' | 'teams' | 'pm-tasks' | 'whatsapp'

function DispatchApp() {
  const { isClerkEnabled, isLoading: authLoading, user, canEditDispatch } = useAuthContext()
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [pmTasks, setPmTasks] = useState<PmTask[]>([])
  const [schedule, setSchedule] = useState<DispatchSchedule | null>(null)
  const [whatsApp, setWhatsApp] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [availabilitySavingId, setAvailabilitySavingId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function loadInitialData() {
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
    void loadInitialData().catch((err) => {
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
    setAvailabilitySavingId(tech.id)
    setError('')
    try {
      const updatedTech = await patchJson<Technician>(`/technicians/${tech.id}`, { date: DEMO_DATE, availability: next, reason: next === 'unavailable' ? 'Call-out' : '' })
      setTeams((currentTeams) => currentTeams.map((team) => {
        const technicians = team.technicians.map((candidate) => candidate.id === updatedTech.id ? updatedTech : candidate)
        return {
          ...team,
          technicians,
          has_driver: technicians.some((candidate) => candidate.is_driver && candidate.availability !== 'unavailable'),
        }
      }))
      const [dash, teamData] = await Promise.all([
        getJson<Dashboard>(`/dashboard?date=${DEMO_DATE}`),
        getJson<Team[]>(`/teams?date=${DEMO_DATE}`),
      ])
      setDashboard(dash)
      setTeams(teamData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update technician availability')
    } finally {
      setAvailabilitySavingId(null)
    }
  }

  const sections: Array<{ id: ActiveSection; label: string; description: string; icon: ReactNode; count?: number }> = [
    { id: 'overview', label: 'Dashboard', description: 'Start here', icon: <LayoutDashboard size={18} /> },
    { id: 'dispatch', label: 'Today\'s Dispatch', description: 'Build and edit the plan', icon: <ClipboardList size={18} />, count: schedule?.items.length },
    { id: 'work-orders', label: 'Work Orders', description: 'Review open work', icon: <Wrench size={18} />, count: workOrders.length },
    { id: 'teams', label: 'Crews', description: 'Drivers and call-outs', icon: <Users size={18} />, count: teams.length },
    { id: 'pm-tasks', label: 'PM Tasks', description: 'Preventive work', icon: <CalendarDays size={18} />, count: pmTasks.length },
    { id: 'whatsapp', label: 'WhatsApp', description: 'Copy send-ready text', icon: <MessageSquareText size={18} /> },
  ]

  if (authLoading || loading) {
    return <main className="grid min-h-screen place-items-center px-6 text-[#51636a]">
      <div className="rounded-[2rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/85 p-8 text-center shadow-[0_24px_80px_rgba(16,35,42,0.12)]">
        <RefreshCw className="mx-auto mb-3 animate-spin text-cyan-700" />
        <p className="font-display font-bold">Loading Dispatch Scheduler...</p>
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
              <p className="font-display text-xs font-extrabold uppercase tracking-[0.34em] text-cyan-200">Daily facilities operations</p>
              <h1 className="font-display mt-4 max-w-4xl text-4xl font-extrabold tracking-[-0.04em] sm:text-6xl lg:text-7xl">Dispatch Scheduler</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-cyan-50/82">A simple place to review work orders, check crews, build today&apos;s dispatch plan, and copy a clean WhatsApp message.</p>
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
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.24em] text-cyan-800">How to use it today</p>
            <p className="mt-2 text-base leading-7 text-[#405157]">Start on the dashboard, check work and crew availability, generate a draft schedule, then adjust the plan before copying the WhatsApp message.</p>
          </div>
          <div className="rounded-[1.7rem] border border-amber-200/80 bg-amber-50/90 p-5 text-[#5c3c05] shadow-[0_18px_60px_rgba(120,79,6,0.08)]">
            <p className="font-display text-xs font-extrabold uppercase tracking-[0.24em] text-amber-700">Plain-language workflow</p>
            <p className="mt-2 text-sm leading-6">Large sections and clear buttons keep the app usable for dispatchers who do not live in software all day.</p>
          </div>
        </section>

        <nav aria-label="Dispatch Scheduler sections" className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {sections.map((section) => {
            const isActive = activeSection === section.id
            return <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`group rounded-[1.35rem] border p-4 text-left shadow-[0_10px_28px_rgba(16,35,42,0.06)] transition hover:-translate-y-0.5 ${isActive ? 'border-[#0b4c57] bg-[#10232a] text-white' : 'border-[rgba(16,35,42,0.1)] bg-[#fffdf7]/86 text-[#10232a] hover:bg-white'}`}
            >
              <span className={`mb-3 inline-flex rounded-2xl p-2 ${isActive ? 'bg-cyan-200/15 text-cyan-100' : 'bg-cyan-50 text-cyan-800'}`}>{section.icon}</span>
              <span className="font-display block text-base font-extrabold">{section.label}</span>
              <span className={`mt-1 block text-sm ${isActive ? 'text-cyan-50/75' : 'text-[#647277]'}`}>{section.description}</span>
              {typeof section.count === 'number' && <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${isActive ? 'bg-white/12 text-white' : 'bg-[#e7f6f5] text-[#0b4c57]'}`}>{section.count}</span>}
            </button>
          })}
        </nav>

        {!canEditDispatch && <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Viewer mode: you can inspect dashboard, work orders, teams, PMs, and generated schedules, but editing controls are hidden.</div>}

        {error && <div className="rounded-[1.4rem] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>}

        {activeSection === 'overview' && <>
          <DashboardMetrics dashboard={dashboard} workOrders={workOrders} />
          <div className="grid gap-4 lg:grid-cols-4">
            <button type="button" onClick={() => setActiveSection('work-orders')} className="rounded-[1.5rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_14px_38px_rgba(16,35,42,0.07)] transition hover:-translate-y-0.5">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 1</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Review open work</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Look for urgent, blocked, waiting, and assessment items.</span>
            </button>
            <button type="button" onClick={() => setActiveSection('teams')} className="rounded-[1.5rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_14px_38px_rgba(16,35,42,0.07)] transition hover:-translate-y-0.5">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 2</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Check crews</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Mark call-outs and confirm each crew has driver coverage.</span>
            </button>
            <button type="button" onClick={() => setActiveSection('dispatch')} className="rounded-[1.5rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_14px_38px_rgba(16,35,42,0.07)] transition hover:-translate-y-0.5">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 3</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Build schedule</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Generate a draft and adjust crew, time, order, or notes.</span>
            </button>
            <button type="button" onClick={() => setActiveSection('whatsapp')} className="rounded-[1.5rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_14px_38px_rgba(16,35,42,0.07)] transition hover:-translate-y-0.5">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 4</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Copy WhatsApp</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Send the clean dispatch message after the plan is right.</span>
            </button>
          </div>
        </>}

        {activeSection === 'work-orders' && <WorkOrdersPanel workOrders={workOrders} />}

        {activeSection === 'teams' && <TeamsPanel teams={teams} canEdit={canEditDispatch} savingTechnicianId={availabilitySavingId} onToggleAvailability={toggleAvailability} />}

        {activeSection === 'dispatch' && <DispatchBuilder schedule={schedule} teams={teams} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} />}

        {activeSection === 'pm-tasks' && <PmTasksPanel pmTasks={pmTasks} />}

        {activeSection === 'whatsapp' && <WhatsAppExport message={whatsApp} copied={copied} onCopy={copyWhatsApp} />}
      </div>
    </main>
  )
}

function App() {
  return <AuthGate><DispatchApp /></AuthGate>
}

export default App
