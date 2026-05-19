import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, CalendarDays, ClipboardList, LayoutDashboard, LockKeyhole, MessageSquareText, RefreshCw, UserCog, Users, Wrench } from 'lucide-react'
import { SignInButton, UserButton } from '@clerk/react'
import { ActivityPanel } from './components/ActivityPanel'
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
import type { AuditEvent, Dashboard, DispatchSchedule, ManagedUser, PmTask, Team, TeamInput, Technician, WhatsAppCrewExport, WhatsAppExportPayload, WorkOrder, WorkOrderInput } from './types'
import './index.css'

type ActiveSection = 'overview' | 'dispatch' | 'work-orders' | 'teams' | 'pm-tasks' | 'whatsapp' | 'activity' | 'users'

const SECTION_IDS: ActiveSection[] = ['overview', 'dispatch', 'work-orders', 'teams', 'pm-tasks', 'whatsapp', 'activity', 'users']

function sectionFromHash(): ActiveSection {
  const value = window.location.hash.replace('#', '')
  return SECTION_IDS.includes(value as ActiveSection) ? value as ActiveSection : 'overview'
}

function DispatchApp() {
  const { isSignedIn, isLoading: authLoading, isVerifyingApi, user, authError, canEditDispatch, refreshUser } = useAuthContext()
  const [activeSection, setActiveSection] = useState<ActiveSection>(sectionFromHash)
  const [selectedDate, setSelectedDate] = useState(DEMO_DATE)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [pmTasks, setPmTasks] = useState<PmTask[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [schedule, setSchedule] = useState<DispatchSchedule | null>(null)
  const [whatsApp, setWhatsApp] = useState('')
  const [whatsAppCrews, setWhatsAppCrews] = useState<WhatsAppCrewExport[]>([])
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [availabilitySavingId, setAvailabilitySavingId] = useState<number | null>(null)
  const [teamSavingId, setTeamSavingId] = useState<number | null>(null)
  const [workOrderSaving, setWorkOrderSaving] = useState(false)
  const [savingUserId, setSavingUserId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const refreshWhatsApp = useCallback(async (scheduleId: number) => {
    const exportJson = await getJson<WhatsAppExportPayload>(`/dispatch_schedules/${scheduleId}/whatsapp_export`)
    setWhatsApp(exportJson.message)
    setWhatsAppCrews(exportJson.crews)
  }, [])

  const refreshAuditEvents = useCallback(async () => {
    const payload = await getJson<{ audit_events: AuditEvent[] }>('/audit_events?limit=50')
    setAuditEvents(payload.audit_events)
  }, [])

  const loadInitialData = useCallback(async (date: string) => {
    setLoading(true)
    setError('')
    const [dash, orders, teamData, technicianData, pms, schedulePayload] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${date}`),
      getJson<WorkOrder[]>('/work_orders'),
      getJson<Team[]>(`/teams?date=${date}`),
      getJson<Technician[]>(`/technicians?date=${date}`),
      getJson<PmTask[]>(`/pm_tasks?date=${date}`),
      getJson<{ schedule: DispatchSchedule | null }>(`/dispatch_schedules?date=${date}`),
    ])
    setDashboard(dash)
    setWorkOrders(orders)
    setTeams(teamData)
    setTechnicians(technicianData)
    setPmTasks(pms)
    setSchedule(schedulePayload.schedule)
    void refreshAuditEvents()
    if (schedulePayload.schedule) {
      await refreshWhatsApp(schedulePayload.schedule.id)
    } else {
      setWhatsApp('')
      setWhatsAppCrews([])
    }
    setLoading(false)
  }, [refreshAuditEvents, refreshWhatsApp])

  useEffect(() => {
    if (authLoading || !user?.id) return

    // The signed-in dashboard load is the app's external data subscription point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitialData(selectedDate).catch((err) => {
      setError(err.message)
      setLoading(false)
    })
  }, [authLoading, loadInitialData, selectedDate, user?.id])

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

  async function afterAuditedChange() {
    try {
      await refreshAuditEvents()
    } catch {
      // Activity refresh failures should never block the main dispatch workflow.
    }
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

  async function refreshWorkOrderContext() {
    const [dash, orders] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
      getJson<WorkOrder[]>('/work_orders'),
    ])
    setDashboard(dash)
    setWorkOrders(orders)
  }

  async function createWorkOrder(values: WorkOrderInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot add work orders.')
      return
    }

    setWorkOrderSaving(true)
    setError('')
    try {
      const created = await postJson<WorkOrder>('/work_orders', values)
      setWorkOrders((current) => [created, ...current.filter((workOrder) => workOrder.id !== created.id)])
      goToSection('work-orders')
      await afterAuditedChange()

      try {
        await refreshWorkOrderContext()
      } catch (refreshError) {
        setError(refreshError instanceof Error ? `Work order saved, but the dashboard did not refresh: ${refreshError.message}` : 'Work order saved, but the dashboard did not refresh.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create work order')
      throw err
    } finally {
      setWorkOrderSaving(false)
    }
  }

  async function updateWorkOrder(workOrderId: number, values: WorkOrderInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot update work orders.')
      return
    }

    setWorkOrderSaving(true)
    setError('')
    try {
      const updated = await patchJson<WorkOrder>(`/work_orders/${workOrderId}`, values)
      setWorkOrders((current) => current.map((workOrder) => workOrder.id === updated.id ? updated : workOrder))
      await afterAuditedChange()

      try {
        await refreshWorkOrderContext()
      } catch (refreshError) {
        setError(refreshError instanceof Error ? `Work order updated, but the dashboard did not refresh: ${refreshError.message}` : 'Work order updated, but the dashboard did not refresh.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update work order')
      throw err
    } finally {
      setWorkOrderSaving(false)
    }
  }

  async function updateScheduleStatus(path: string, fallbackMessage: string) {
    if (!schedule) return
    if (!canEditDispatch) {
      setError('Viewer access cannot update schedule status.')
      return
    }

    setWorking(true)
    setError('')
    try {
      const updated = await postJson<DispatchSchedule>(`/dispatch_schedules/${schedule.id}/${path}`, {})
      setSchedule(updated)
      if (updated.items.length > 0) await refreshWhatsApp(updated.id)
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage)
    } finally {
      setWorking(false)
    }
  }

  async function finalizeSchedule() {
    await updateScheduleStatus('finalize', 'Unable to finalize schedule')
  }

  async function markScheduleSent() {
    await updateScheduleStatus('mark_sent', 'Unable to mark schedule sent')
  }

  async function reopenSchedule() {
    if (schedule?.status === 'sent' && !window.confirm('Reopen this sent schedule? This will unlock editing and clear the sent marker.')) return
    await updateScheduleStatus('reopen', 'Unable to reopen schedule')
  }

  async function suggestSchedule() {
    if (!canEditDispatch) {
      setError('Viewer access cannot regenerate dispatch drafts.')
      return
    }
    if (schedule && schedule.status !== 'draft') {
      setError('This schedule is locked. Reopen it before regenerating.')
      return
    }
    if (schedule && !window.confirm('Regenerate this draft? Current manual overrides will be replaced with a fresh suggestion.')) {
      return
    }

    setWorking(true)
    setError('')
    try {
      const created = await postJson<DispatchSchedule>('/dispatch_schedules/suggest', { date: selectedDate })
      setSchedule(created)
      goToSection('dispatch')
      await refreshWhatsApp(created.id)
      await afterAuditedChange()
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
      await afterAuditedChange()
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

  async function createTeam(values: TeamInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot create crews.')
      return
    }
    if (teamSavingId !== null) return

    setTeamSavingId(0)
    setError('')
    try {
      const created = await postJson<Team>('/teams', values)
      setTeams((currentTeams) => [...currentTeams, created].sort((a, b) => a.name.localeCompare(b.name)))
      await afterAuditedChange()

      try {
        const [dash, teamData] = await Promise.all([
          getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
          getJson<Team[]>(`/teams?date=${selectedDate}`),
        ])
        setDashboard(dash)
        setTeams(teamData)
      } catch (err) {
        setError(err instanceof Error ? `Crew created, but fresh dashboard data did not load: ${err.message}` : 'Crew created, but fresh dashboard data did not load')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create crew')
      throw err
    } finally {
      setTeamSavingId(null)
    }
  }

  async function updateDefaultCrew(teamId: number, values: TeamInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot update default crews.')
      return
    }
    if (teamSavingId !== null) return

    setTeamSavingId(teamId)
    setError('')
    try {
      const updatedTeam = await patchJson<Team>(`/teams/${teamId}`, values)
      setTeams((currentTeams) => currentTeams.map((team) => team.id === updatedTeam.id ? updatedTeam : team))
      await afterAuditedChange()

      try {
        const [dash, teamData] = await Promise.all([
          getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
          getJson<Team[]>(`/teams?date=${selectedDate}`),
        ])
        setDashboard(dash)
        setTeams(teamData)
      } catch (err) {
        setError(err instanceof Error ? `Default crew saved, but fresh dashboard data did not load: ${err.message}` : 'Default crew saved, but fresh dashboard data did not load')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update default crew')
      throw err
    } finally {
      setTeamSavingId(null)
    }
  }

  async function updateDailyCrew(teamId: number, technicianIds: number[] | null) {
    if (!canEditDispatch) {
      setError('Viewer access cannot update daily crew composition.')
      return
    }
    if (teamSavingId !== null) return

    setTeamSavingId(teamId)
    setError('')
    try {
      const updatedTeam = await patchJson<Team>(`/teams/${teamId}/daily_memberships`, technicianIds === null
        ? { date: selectedDate, use_default: true }
        : { date: selectedDate, technician_ids: technicianIds })
      setTeams((currentTeams) => currentTeams.map((team) => team.id === updatedTeam.id ? updatedTeam : team))
      await afterAuditedChange()

      try {
        const [dash, teamData] = await Promise.all([
          getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
          getJson<Team[]>(`/teams?date=${selectedDate}`),
        ])
        setDashboard(dash)
        setTeams(teamData)
      } catch (err) {
        setError(err instanceof Error ? `Daily crew saved, but fresh dashboard data did not load: ${err.message}` : 'Daily crew saved, but fresh dashboard data did not load')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update daily crew')
      throw err
    } finally {
      setTeamSavingId(null)
    }
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
      const updatedTech = await patchJson<Technician>(`/technicians/${tech.id}`, { date: selectedDate, availability: next, reason: next === 'unavailable' ? 'Call-out' : '' })
      setTechnicians((currentTechnicians) => currentTechnicians.map((candidate) => candidate.id === updatedTech.id ? updatedTech : candidate))
      setTeams((currentTeams) => currentTeams.map((team) => {
        const technicians = team.technicians.map((candidate) => candidate.id === updatedTech.id ? updatedTech : candidate)
        return {
          ...team,
          technicians,
          has_driver: technicians.some((candidate) => candidate.is_driver && candidate.availability !== 'unavailable'),
        }
      }))
      await afterAuditedChange()

      try {
        const [dash, teamData] = await Promise.all([
          getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
          getJson<Team[]>(`/teams?date=${selectedDate}`),
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
    { id: 'activity', label: 'Activity', description: 'Audit history', icon: <Activity size={18} /> },
    ...(user?.permissions.can_admin ? [{ id: 'users' as const, label: 'Users', description: 'Roles and access', icon: <UserCog size={18} />, count: managedUsers.length }] : []),
  ]

  const needsTokenClaims = authError?.toLowerCase().includes('missing clerk email')
  const isAuthBlocked = isSignedIn && !user && !authLoading && !isVerifyingApi

  if (authLoading) {
    return <main className="grid min-h-screen place-items-center px-6 text-[#526071]">
      <div className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/90 p-8 text-center shadow-[0_24px_70px_rgba(23,32,51,0.12)]">
        <RefreshCw className="mx-auto mb-3 animate-spin text-[#244393]" />
        <p className="font-display font-bold">Loading JMI Dispatch...</p>
      </div>
    </main>
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="mx-auto flex max-w-[92rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="soft-reveal relative overflow-hidden rounded-3xl border border-[#223f86]/20 bg-[#172b63] p-5 text-white shadow-[0_24px_70px_rgba(23,43,99,0.24)] sm:p-7 lg:p-8">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[#d84332]" />
          <div className="relative grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.12)] backdrop-blur">
                <span className="relative inline-flex h-9 w-12 items-center justify-center overflow-hidden rounded-xl bg-white">
                  <span className="absolute left-2 h-7 w-1.5 -skew-x-[28deg] bg-[#244393]" />
                  <span className="absolute left-5 h-7 w-1.5 -skew-x-[28deg] bg-[#d84332]" />
                  <span className="absolute left-8 h-7 w-1.5 -skew-x-[28deg] bg-[#244393]" />
                </span>
                <span>
                  <span className="font-display block text-sm font-extrabold tracking-tight text-white">JMI Guam</span>
                  <span className="block text-[0.65rem] font-bold uppercase tracking-[0.22em] text-blue-100/80">Operations Command</span>
                </span>
              </div>
              <p className="font-display mt-7 text-xs font-extrabold uppercase tracking-[0.28em] text-blue-100/85">Facilities dispatch board</p>
              <h1 className="font-display mt-2 max-w-4xl text-4xl font-extrabold tracking-[-0.035em] sm:text-5xl lg:text-6xl">Daily Dispatch Command</h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-blue-50/82">Prioritize open work, confirm crew coverage, build the day&apos;s JMI schedule, and send a clean WhatsApp dispatch from one controlled workspace.</p>
            </div>
            <div className="relative flex flex-col gap-3 lg:items-end">
              {!user && isSignedIn ? <div className="w-full rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-blue-50 shadow-2xl backdrop-blur lg:max-w-sm">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-red-200/15 p-2 text-red-100">{isVerifyingApi ? <RefreshCw className="animate-spin" size={20} /> : <LockKeyhole size={20} />}</span>
                  <div>
                    <span className="font-display block font-extrabold text-white">{isVerifyingApi ? 'Verifying your access' : 'Signed in, access needs setup'}</span>
                    <span className="text-blue-50/75">{isVerifyingApi ? 'Checking your JMI dispatch role...' : 'Clerk worked. The API still needs profile access.'}</span>
                  </div>
                </div>
              </div> : !user ? <div className="w-full rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-blue-50 shadow-2xl backdrop-blur lg:max-w-sm">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-blue-200/15 p-2 text-blue-100"><LockKeyhole size={20} /></span>
                  <div>
                    <span className="font-display block font-extrabold text-white">Sign in to work the schedule</span>
                    <span className="text-blue-50/75">The overview is visible. Live data and actions require Clerk.</span>
                  </div>
                </div>
              </div> : null}
              <div className="flex w-full flex-wrap items-center gap-3 lg:justify-end">
                {user && <label className="inline-flex flex-1 items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-blue-50 shadow-[0_12px_32px_rgba(0,0,0,0.12)] backdrop-blur sm:flex-none">
                  <span className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-blue-100">Schedule date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="tabular rounded-xl border border-white/15 bg-white px-3 py-2 font-display text-sm font-extrabold text-[#172033] outline-none transition focus:border-blue-200 focus:ring-4 focus:ring-blue-200/25"
                  />
                </label>}
                {user && <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-blue-50 shadow-[0_12px_32px_rgba(0,0,0,0.12)] backdrop-blur">
                  <UserButton />
                  <span className="leading-tight">
                    <span className="font-display block font-extrabold text-white">{user.name}</span>
                    <span className="text-xs capitalize text-blue-50/70">{user.role}</span>
                  </span>
                </div>}
                {!isSignedIn && <SignInButton mode="modal">
                  <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-display text-sm font-extrabold text-[#172033] shadow-[0_16px_38px_rgba(255,255,255,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-50 sm:flex-none">
                    <LockKeyhole size={18} /> Sign In
                  </button>
                </SignInButton>}
                {schedule && <span className={`inline-flex flex-1 items-center justify-center rounded-2xl border px-4 py-3 font-display text-xs font-extrabold uppercase tracking-[0.16em] sm:flex-none ${schedule.status === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : schedule.status === 'finalized' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-white/15 bg-white/10 text-blue-50'}`}>{schedule.status}</span>}
                {canEditDispatch && <button disabled={working || Boolean(schedule && schedule.status !== 'draft')} onClick={suggestSchedule} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#d84332] px-5 py-3 font-display text-sm font-extrabold text-white shadow-[0_16px_38px_rgba(216,67,50,0.28)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none">
                  <ClipboardList size={18} /> {working ? 'Working...' : schedule?.status === 'draft' || !schedule ? "Suggest Today's Schedule" : 'Schedule Locked'}
                </button>}
              </div>
            </div>
          </div>
        </header>

        <nav aria-label="JMI dispatch sections" className="soft-reveal-delay sticky top-3 z-10 flex gap-1 overflow-x-auto rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/94 p-1.5 shadow-[0_14px_36px_rgba(23,32,51,0.09)] backdrop-blur">
          {sections.map((section) => {
            const isActive = currentSection === section.id
            return <button
              key={section.id}
              type="button"
              onClick={() => goToSection(section.id)}
              title={section.description}
              className={`group flex h-14 min-w-[8.4rem] flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-center transition ${isActive ? 'border-[#244393] bg-[#172b63] text-white shadow-[0_10px_24px_rgba(36,67,147,0.2)]' : 'border-transparent text-[#172033] hover:border-[rgba(36,67,147,0.18)] hover:bg-[#f4f7fb]'}`}
            >
              <span className={`inline-flex shrink-0 rounded-lg p-1.5 ${isActive ? 'bg-white/12 text-blue-100' : 'bg-[#e8eefc] text-[#244393]'}`}>{section.icon}</span>
              <span className="font-display truncate text-sm font-extrabold">{section.label}</span>
              {typeof section.count === 'number' && <span className={`tabular inline-flex min-w-7 shrink-0 justify-center rounded-full px-2 py-0.5 text-xs font-extrabold ${isActive ? 'bg-white/12 text-white' : 'bg-[#eef2ff] text-[#244393]'}`}>{section.count}</span>}
            </button>
          })}
        </nav>

        {!user && !authError && !isVerifyingApi && <SignInRequiredPanel />}

        {isVerifyingApi && !user && <section className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/90 p-6 shadow-[0_18px_50px_rgba(23,32,51,0.08)]">
          <div className="inline-flex items-center gap-3 text-sm font-bold text-[#244393]">
            <RefreshCw size={18} className="animate-spin" /> Verifying your Clerk session with the dispatch API...
          </div>
        </section>}

        {user && loading && <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-2 text-sm font-bold text-blue-900">
          <RefreshCw size={16} className="animate-spin" /> Loading live dispatch data...
        </div>}

        {isAuthBlocked && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
          {needsTokenClaims
            ? 'Your Clerk sign-in worked, but the API needs access to your email. Add CLERK_SECRET_KEY to api/.env, or configure Clerk token email claims.'
            : `Your Clerk sign-in worked, but the dispatch API could not confirm your role yet: ${authError || 'Unable to verify access'}`}
        </div>}

        {user && !canEditDispatch && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Viewer mode: you can inspect dashboard, work orders, teams, PMs, and generated schedules, but editing controls are hidden.</div>}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>}

        {currentSection === 'overview' && <DashboardMetrics dashboard={dashboard} workOrders={workOrders} teams={teams} technicians={technicians} pmTasks={pmTasks} schedule={schedule} auditEvents={auditEvents} canEdit={canEditDispatch} working={working} onGoToSection={goToSection} onSuggest={suggestSchedule} />}

        {currentSection === 'work-orders' && (user ? <WorkOrdersPanel workOrders={workOrders} canEdit={canEditDispatch} selectedDate={selectedDate} saving={workOrderSaving} onCreate={createWorkOrder} onUpdate={updateWorkOrder} /> : <SignInRequiredPanel title="Sign in to review work orders" />)}

        {currentSection === 'teams' && (user ? <TeamsPanel teams={teams} technicians={technicians} canEdit={canEditDispatch} savingTechnicianId={availabilitySavingId} savingTeamId={teamSavingId} onToggleAvailability={toggleAvailability} onUpdateDailyCrew={updateDailyCrew} onUpdateDefaultCrew={updateDefaultCrew} onCreateTeam={createTeam} /> : <SignInRequiredPanel title="Sign in to check crews" />)}

        {currentSection === 'dispatch' && (user ? <DispatchBuilder schedule={schedule} teams={teams} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} onFinalize={finalizeSchedule} onReopen={reopenSchedule} /> : <SignInRequiredPanel title="Sign in to build today's dispatch" />)}

        {currentSection === 'pm-tasks' && (user ? <PmTasksPanel pmTasks={pmTasks} /> : <SignInRequiredPanel title="Sign in to review PM tasks" />)}

        {currentSection === 'whatsapp' && (user ? <WhatsAppExport schedule={schedule} message={whatsApp} crews={whatsAppCrews} copied={copied} working={working} canEdit={canEditDispatch} onCopy={copyWhatsApp} onMarkSent={markScheduleSent} /> : <SignInRequiredPanel title="Sign in to copy WhatsApp output" />)}

        {currentSection === 'activity' && (user ? <ActivityPanel events={auditEvents} /> : <SignInRequiredPanel title="Sign in to review activity" />)}

        {currentSection === 'users' && user?.permissions.can_admin && <UserManagementPanel users={managedUsers} currentUserId={user.id} savingUserId={savingUserId} onRoleChange={updateUserRole} />}
      </div>
    </main>
  )
}

function SignInRequiredPanel({ title = 'Sign in to load live dispatch data' }: { title?: string }) {
  return <section className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/90 p-6 shadow-[0_18px_50px_rgba(23,32,51,0.08)]">
    <div className="max-w-2xl">
      <p className="font-display text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[#244393]">Secure JMI workspace</p>
      <h2 className="font-display mt-1 text-2xl font-extrabold tracking-tight text-[#172033]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#526071]">The app shell is available so the page does not feel broken while Clerk is loading or before sign-in. Live JMI data and editing actions load after you sign in.</p>
      <SignInButton mode="modal">
        <button className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#244393] px-5 py-3 font-display text-sm font-extrabold text-white shadow-[0_16px_38px_rgba(36,67,147,0.2)] transition hover:-translate-y-0.5 hover:bg-[#172b63]">
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
