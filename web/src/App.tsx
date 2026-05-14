import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ClipboardList, LayoutDashboard, LockKeyhole, MessageSquareText, RefreshCw, ShieldCheck, UserCog, Users, Wrench } from 'lucide-react'
import { SignInButton, UserButton } from '@clerk/react'
import { DashboardMetrics } from './components/DashboardMetrics'
import { DispatchBuilder } from './components/DispatchBuilder'
import { PmTasksPanel } from './components/PmTasksPanel'
import { TeamsPanel } from './components/TeamsPanel'
import { UserManagementPanel } from './components/UserManagementPanel'
import { WhatsAppExport } from './components/WhatsAppExport'
import { WorkOrdersPanel } from './components/WorkOrdersPanel'
import { DEMO_DATE } from './constants'
import { useAuthContext } from './contexts/useAuthContext'
import { getJson, patchJson, postJson } from './lib/api'
import type { Dashboard, DispatchSchedule, ManagedUser, PmTask, Team, Technician, WorkOrder } from './types'
import './index.css'

type ActiveSection = 'overview' | 'dispatch' | 'work-orders' | 'teams' | 'pm-tasks' | 'whatsapp' | 'users'

const SECTION_IDS: ActiveSection[] = ['overview', 'dispatch', 'work-orders', 'teams', 'pm-tasks', 'whatsapp', 'users']

function sectionFromHash(): ActiveSection {
  const value = window.location.hash.replace('#', '')
  return SECTION_IDS.includes(value as ActiveSection) ? value as ActiveSection : 'overview'
}

function DispatchApp() {
  const { isSignedIn, isLoading: authLoading, user, authError, canEditDispatch, refreshUser } = useAuthContext()
  const [activeSection, setActiveSection] = useState<ActiveSection>(sectionFromHash)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [pmTasks, setPmTasks] = useState<PmTask[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [schedule, setSchedule] = useState<DispatchSchedule | null>(null)
  const [whatsApp, setWhatsApp] = useState('')
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [availabilitySavingId, setAvailabilitySavingId] = useState<number | null>(null)
  const [savingUserId, setSavingUserId] = useState<number | null>(null)
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
    if (authLoading) return

    if (!user) return

    // The signed-in dashboard load is the app's external data subscription point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitialData().catch((err) => {
      setError(err.message)
      setLoading(false)
    })
  }, [authLoading, user])

  useEffect(() => {
    if (!user?.permissions.can_admin) return

    void getJson<{ users: ManagedUser[] }>('/users')
      .then((payload) => setManagedUsers(payload.users))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load users')
      })
  }, [user?.permissions.can_admin])

  useEffect(() => {
    const handleHashChange = () => setActiveSection(sectionFromHash())
    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  function goToSection(section: ActiveSection) {
    setActiveSection(section)
    window.history.pushState(null, '', `#${section}`)
  }

  async function refreshWhatsApp(scheduleId: number) {
    const exportJson = await getJson<{ message: string }>(`/dispatch_schedules/${scheduleId}/whatsapp_export`)
    setWhatsApp(exportJson.message)
  }

  async function updateUserRole(userId: number, role: ManagedUser['role']) {
    setSavingUserId(userId)
    setError('')
    try {
      const payload = await patchJson<{ user: ManagedUser }>(`/users/${userId}`, { role })
      setManagedUsers((currentUsers) => currentUsers.map((candidate) => candidate.id === userId ? payload.user : candidate))
      if (user?.id === userId) await refreshUser()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user role')
    } finally {
      setSavingUserId(null)
    }
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
      goToSection('dispatch')
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
    if (availabilitySavingId !== null) return
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

      try {
        const [dash, teamData] = await Promise.all([
          getJson<Dashboard>(`/dashboard?date=${DEMO_DATE}`),
          getJson<Team[]>(`/teams?date=${DEMO_DATE}`),
        ])
        setDashboard(dash)
        setTeams(teamData)
      } catch (err) {
        setError(err instanceof Error ? `Availability saved, but fresh dashboard data did not load: ${err.message}` : 'Availability saved, but fresh dashboard data did not load')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update technician availability')
    } finally {
      setAvailabilitySavingId(null)
    }
  }

  const currentSection = activeSection === 'users' && !user?.permissions.can_admin ? 'overview' : activeSection
  const sections: Array<{ id: ActiveSection; label: string; description: string; icon: ReactNode; count?: number }> = [
    { id: 'overview', label: 'Dashboard', description: 'Start here', icon: <LayoutDashboard size={18} /> },
    { id: 'dispatch', label: 'Today\'s Dispatch', description: 'Build and edit the plan', icon: <ClipboardList size={18} />, count: schedule?.items.length },
    { id: 'work-orders', label: 'Work Orders', description: 'Review open work', icon: <Wrench size={18} />, count: workOrders.length },
    { id: 'teams', label: 'Crews', description: 'Drivers and call-outs', icon: <Users size={18} />, count: teams.length },
    { id: 'pm-tasks', label: 'PM Tasks', description: 'Preventive work', icon: <CalendarDays size={18} />, count: pmTasks.length },
    { id: 'whatsapp', label: 'WhatsApp', description: 'Copy send-ready text', icon: <MessageSquareText size={18} /> },
    ...(user?.permissions.can_admin ? [{ id: 'users' as const, label: 'Users', description: 'Roles and access', icon: <UserCog size={18} />, count: managedUsers.length }] : []),
  ]

  const needsTokenClaims = authError?.toLowerCase().includes('missing clerk email')
  const isAuthBlocked = isSignedIn && !user && !authLoading

  if (authLoading || (user && loading)) {
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
              <p className="font-display text-xs font-extrabold uppercase tracking-[0.3em] text-cyan-200">Daily facilities operations</p>
              <h1 className="font-display mt-3 max-w-4xl text-4xl font-extrabold tracking-[-0.035em] sm:text-5xl lg:text-6xl">Dispatch Scheduler</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-cyan-50/82">Review work, check crews, build today&apos;s schedule, and copy a clean WhatsApp message from one organized workspace.</p>
            </div>
            <div className="relative flex flex-col gap-3 lg:items-end">
              {user ? <div className="w-full rounded-[1.5rem] border border-white/15 bg-white/10 p-4 text-sm text-cyan-50 shadow-2xl backdrop-blur lg:max-w-sm">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-cyan-200/15 p-2 text-cyan-100"><ShieldCheck size={20} /></span>
                  <div>
                    <span className="font-display block font-extrabold text-white">{user.name}</span>
                    <span className="capitalize text-cyan-50/75">{user.role}</span>
                  </div>
                </div>
              </div> : isSignedIn ? <div className="w-full rounded-[1.5rem] border border-white/15 bg-white/10 p-4 text-sm text-cyan-50 shadow-2xl backdrop-blur lg:max-w-sm">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-amber-200/15 p-2 text-amber-100"><LockKeyhole size={20} /></span>
                  <div>
                    <span className="font-display block font-extrabold text-white">Signed in, access needs setup</span>
                    <span className="text-cyan-50/75">Clerk worked. The API still needs profile access.</span>
                  </div>
                </div>
              </div> : <div className="w-full rounded-[1.5rem] border border-white/15 bg-white/10 p-4 text-sm text-cyan-50 shadow-2xl backdrop-blur lg:max-w-sm">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-cyan-200/15 p-2 text-cyan-100"><LockKeyhole size={20} /></span>
                  <div>
                    <span className="font-display block font-extrabold text-white">Sign in to work the schedule</span>
                    <span className="text-cyan-50/75">The overview is visible. Live data and actions require Clerk.</span>
                  </div>
                </div>
              </div>}
              <div className="flex w-full flex-wrap gap-3 lg:max-w-sm lg:justify-end">
                {isSignedIn ? <UserButton /> : <SignInButton mode="modal">
                  <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-display text-sm font-extrabold text-[#10232a] shadow-[0_16px_38px_rgba(255,255,255,0.18)] transition hover:-translate-y-0.5 hover:bg-cyan-50 sm:flex-none">
                    <LockKeyhole size={18} /> Sign In
                  </button>
                </SignInButton>}
                {canEditDispatch && <button disabled={working} onClick={suggestSchedule} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f2a51f] px-5 py-3 font-display text-sm font-extrabold text-[#10232a] shadow-[0_16px_38px_rgba(242,165,31,0.28)] transition hover:-translate-y-0.5 hover:bg-[#ffc453] disabled:cursor-wait disabled:opacity-60 sm:flex-none">
                  <ClipboardList size={18} /> {working ? 'Working...' : "Suggest Today's Schedule"}
                </button>}
              </div>
            </div>
          </div>
        </header>

        <nav aria-label="Dispatch Scheduler sections" className="soft-reveal-delay sticky top-3 z-10 grid gap-2 rounded-[1.4rem] border border-[rgba(16,35,42,0.1)] bg-[#fffdf7]/92 p-2 shadow-[0_14px_40px_rgba(16,35,42,0.1)] backdrop-blur md:grid-cols-3 xl:grid-cols-6">
          {sections.map((section) => {
            const isActive = currentSection === section.id
            return <button
              key={section.id}
              type="button"
              onClick={() => goToSection(section.id)}
              className={`group grid min-h-[5.75rem] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1rem] border px-3 py-3 text-left transition ${isActive ? 'border-[#0b4c57] bg-[#10232a] text-white' : 'border-transparent text-[#10232a] hover:border-[rgba(16,35,42,0.1)] hover:bg-white'}`}
            >
              <span className={`inline-flex rounded-xl p-1.5 ${isActive ? 'bg-cyan-200/15 text-cyan-100' : 'bg-cyan-50 text-cyan-800'}`}>{section.icon}</span>
              <span className="min-w-0">
                <span className="font-display block text-sm font-extrabold">{section.label}</span>
                <span className={`block text-xs ${isActive ? 'text-cyan-50/75' : 'text-[#647277]'}`}>{section.description}</span>
              </span>
              {typeof section.count === 'number'
                ? <span className={`inline-flex min-w-8 justify-center rounded-full px-2.5 py-1 text-xs font-extrabold ${isActive ? 'bg-white/12 text-white' : 'bg-[#e7f6f5] text-[#0b4c57]'}`}>{section.count}</span>
                : <span aria-hidden="true" className="hidden min-w-8 xl:block" />}
            </button>
          })}
        </nav>

        {!user && !authError && <SignInRequiredPanel />}

        {isAuthBlocked && <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
          {needsTokenClaims
            ? 'Your Clerk sign-in worked, but the API needs access to your email. Add CLERK_SECRET_KEY to api/.env, or configure Clerk token email claims.'
            : `Your Clerk sign-in worked, but the dispatch API could not confirm your role yet: ${authError || 'Unable to verify access'}`}
        </div>}

        {user && !canEditDispatch && <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Viewer mode: you can inspect dashboard, work orders, teams, PMs, and generated schedules, but editing controls are hidden.</div>}

        {error && <div className="rounded-[1.4rem] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>}

        {currentSection === 'overview' && <>
          <DashboardMetrics dashboard={dashboard} workOrders={workOrders} />
          <div className="grid gap-4 lg:grid-cols-4">
            <button type="button" onClick={() => goToSection('work-orders')} className="rounded-[1.25rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_10px_28px_rgba(16,35,42,0.05)] transition hover:-translate-y-0.5 hover:border-cyan-200">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 1</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Review open work</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Look for urgent, blocked, waiting, and assessment items.</span>
            </button>
            <button type="button" onClick={() => goToSection('teams')} className="rounded-[1.25rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_10px_28px_rgba(16,35,42,0.05)] transition hover:-translate-y-0.5 hover:border-cyan-200">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 2</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Check crews</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Mark call-outs and confirm each crew has driver coverage.</span>
            </button>
            <button type="button" onClick={() => goToSection('dispatch')} className="rounded-[1.25rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_10px_28px_rgba(16,35,42,0.05)] transition hover:-translate-y-0.5 hover:border-cyan-200">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 3</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Build schedule</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Generate a draft and adjust crew, time, order, or notes.</span>
            </button>
            <button type="button" onClick={() => goToSection('whatsapp')} className="rounded-[1.25rem] border border-[rgba(16,35,42,0.1)] bg-white/80 p-5 text-left shadow-[0_10px_28px_rgba(16,35,42,0.05)] transition hover:-translate-y-0.5 hover:border-cyan-200">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-700">Step 4</span>
              <span className="font-display mt-2 block text-xl font-extrabold text-[#10232a]">Copy WhatsApp</span>
              <span className="mt-2 block text-sm leading-6 text-[#5c6b70]">Send the clean dispatch message after the plan is right.</span>
            </button>
          </div>
        </>}

        {currentSection === 'work-orders' && (user ? <WorkOrdersPanel workOrders={workOrders} /> : <SignInRequiredPanel title="Sign in to review work orders" />)}

        {currentSection === 'teams' && (user ? <TeamsPanel teams={teams} canEdit={canEditDispatch} savingTechnicianId={availabilitySavingId} onToggleAvailability={toggleAvailability} /> : <SignInRequiredPanel title="Sign in to check crews" />)}

        {currentSection === 'dispatch' && (user ? <DispatchBuilder schedule={schedule} teams={teams} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} /> : <SignInRequiredPanel title="Sign in to build today's dispatch" />)}

        {currentSection === 'pm-tasks' && (user ? <PmTasksPanel pmTasks={pmTasks} /> : <SignInRequiredPanel title="Sign in to review PM tasks" />)}

        {currentSection === 'whatsapp' && (user ? <WhatsAppExport message={whatsApp} copied={copied} onCopy={copyWhatsApp} /> : <SignInRequiredPanel title="Sign in to copy WhatsApp output" />)}

        {currentSection === 'users' && user?.permissions.can_admin && <UserManagementPanel users={managedUsers} currentUserId={user.id} savingUserId={savingUserId} onRoleChange={updateUserRole} />}
      </div>
    </main>
  )
}

function SignInRequiredPanel({ title = 'Sign in to load live dispatch data' }: { title?: string }) {
  return <section className="rounded-[1.7rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/88 p-6 shadow-[0_18px_60px_rgba(20,36,40,0.09)]">
    <div className="max-w-2xl">
      <p className="font-display text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-cyan-700">Secure workspace</p>
      <h2 className="font-display mt-1 text-2xl font-extrabold tracking-tight text-[#10232a]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#5c6b70]">The app shell is available so the page does not feel broken while Clerk is loading or before sign-in. Live JMI data and editing actions load after you sign in.</p>
      <SignInButton mode="modal">
        <button className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#10232a] px-5 py-3 font-display text-sm font-extrabold text-white shadow-[0_16px_38px_rgba(16,35,42,0.18)] transition hover:-translate-y-0.5 hover:bg-[#0b4c57]">
          <LockKeyhole size={18} /> Sign In With Clerk
        </button>
      </SignInButton>
    </div>
  </section>
}

function App() {
  return <DispatchApp />
}

export default App
