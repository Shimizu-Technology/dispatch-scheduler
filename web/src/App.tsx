import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, CalendarDays, ClipboardList, FolderKanban, LayoutDashboard, LockKeyhole, MessageSquareText, RefreshCw, Settings2, UserCog, Users, Wrench } from 'lucide-react'
import { SignInButton, UserButton } from '@clerk/react'
import { ActivityPanel } from './components/ActivityPanel'
import { DashboardMetrics } from './components/DashboardMetrics'
import { DispatchBuilder } from './components/DispatchBuilder'
import { PaProjectsPanel } from './components/PaProjectsPanel'
import { PmTasksPanel } from './components/PmTasksPanel'
import { ServiceLinesPanel } from './components/ServiceLinesPanel'
import { TeamsPanel } from './components/TeamsPanel'
import { UserManagementPanel } from './components/UserManagementPanel'
import { WhatsAppExport } from './components/WhatsAppExport'
import { WorkOrdersPanel } from './components/WorkOrdersPanel'
import { useAuthContext } from './contexts/useAuthContext'
import { deleteJson, getJson, patchJson, postJson } from './lib/api'
import type { AuditEvent, Dashboard, DispatchOutcomeStatus, DispatchSchedule, ManagedUser, PaginationMeta, PmTask, PmTaskBulkCreatePayload, PmTaskInput, ServiceLine, ServiceLineInput, Team, TeamInput, Technician, TechnicianInput, WhatsAppCrewExport, WhatsAppExportPayload, WorkOrder, WorkOrderInput, WorkOrderListPayload, WorkOrderStatus } from './types'
import './index.css'

type ActiveSection = 'overview' | 'dispatch' | 'work-orders' | 'pa-projects' | 'teams' | 'pm-tasks' | 'service-lines' | 'whatsapp' | 'activity' | 'users'

const SECTION_IDS: ActiveSection[] = ['overview', 'dispatch', 'work-orders', 'pa-projects', 'teams', 'pm-tasks', 'service-lines', 'whatsapp', 'activity', 'users']
const SELECTED_DATE_STORAGE_KEY = 'dispatch-scheduler:selected-date'
const DEFAULT_WORK_ORDER_QUERY = 'archived=active&page=1&per_page=50&sort=scheduled_date&direction=asc'

function localDateString(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 10)
}

function initialSelectedDate() {
  return window.localStorage.getItem(SELECTED_DATE_STORAGE_KEY) || localDateString()
}

function sectionFromHash(): ActiveSection {
  const value = window.location.hash.replace('#', '')
  return SECTION_IDS.includes(value as ActiveSection) ? value as ActiveSection : 'overview'
}

function DispatchApp() {
  const { isSignedIn, isLoading: authLoading, isVerifyingApi, user, authError, canEditDispatch, refreshUser } = useAuthContext()
  const [activeSection, setActiveSection] = useState<ActiveSection>(sectionFromHash)
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate)
  const todayDate = localDateString()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [workOrderMeta, setWorkOrderMeta] = useState<PaginationMeta | null>(null)
  const [workOrderToEdit, setWorkOrderToEdit] = useState<WorkOrder | null>(null)
  const [paProjectWorkOrders, setPaProjectWorkOrders] = useState<WorkOrder[]>([])
  const [paProjectMeta, setPaProjectMeta] = useState<PaginationMeta | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [pmTasks, setPmTasks] = useState<PmTask[]>([])
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([])
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
  const [serviceLineSaving, setServiceLineSaving] = useState(false)
  const [pmTaskSavingId, setPmTaskSavingId] = useState<number | null>(null)
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
    const [dash, orders, teamData, technicianData, pms, lines, schedulePayload] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${date}`),
      getJson<WorkOrderListPayload>(`/work_orders?${DEFAULT_WORK_ORDER_QUERY}`),
      getJson<Team[]>(`/teams?date=${date}`),
      getJson<Technician[]>(`/technicians?date=${date}&include_inactive=true`),
      getJson<PmTask[]>(`/pm_tasks?month=${date.slice(0, 7)}`),
      getJson<{ service_lines: ServiceLine[] }>('/service_lines?include_inactive=true'),
      getJson<{ schedule: DispatchSchedule | null }>(`/dispatch_schedules?date=${date}`),
    ])
    setDashboard(dash)
    setWorkOrders(orders.work_orders)
    setWorkOrderMeta(orders.meta)
    setTeams(teamData)
    setTechnicians(technicianData)
    setPmTasks(pms)
    setServiceLines(lines.service_lines)
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
    window.localStorage.setItem(SELECTED_DATE_STORAGE_KEY, selectedDate)
  }, [selectedDate])

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
    if (!user?.id || activeSection !== 'pa-projects') return

    void fetchPaProjects(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, user?.id])

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
    if (section !== 'work-orders') setWorkOrderToEdit(null)
    setActiveSection(section)
    window.history.pushState(null, '', `#${section}`)
  }

  function openWorkOrderFromPaProject(workOrder: WorkOrder) {
    setWorkOrderToEdit(workOrder)
    goToSection('work-orders')
  }

  const clearWorkOrderToEdit = useCallback(() => {
    setWorkOrderToEdit(null)
  }, [])

  async function afterAuditedChange() {
    try {
      await refreshAuditEvents()
    } catch {
      // Activity refresh failures should never block the main dispatch workflow.
    }
  }

  async function createManagedUser(values: { email: string; name?: string; role: ManagedUser['role'] }) {
    setSavingUserId(0)
    setError('')
    try {
      const payload = await postJson<{ user: ManagedUser; invitation_sent: boolean; invitation_error?: string | null }>('/users', values)
      setManagedUsers((currentUsers) => [...currentUsers, payload.user].sort((a, b) => a.email.localeCompare(b.email)))
      if (payload.invitation_error) setError(`User invited, but email delivery needs attention: ${payload.invitation_error}`)
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to invite user')
      throw err
    } finally {
      setSavingUserId(null)
    }
  }

  async function updateManagedUser(userId: number, changes: Partial<Pick<ManagedUser, 'name' | 'role' | 'active'>>) {
    setSavingUserId(userId)
    setError('')
    try {
      const payload = await patchJson<{ user: ManagedUser }>(`/users/${userId}`, changes)
      setManagedUsers((currentUsers) => currentUsers.map((candidate) => candidate.id === userId ? payload.user : candidate))
      if (user?.id === userId) await refreshUser()
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user')
      throw err
    } finally {
      setSavingUserId(null)
    }
  }

  async function resendManagedUserInvitation(userId: number) {
    setSavingUserId(userId)
    setError('')
    try {
      const payload = await postJson<{ user: ManagedUser; invitation_sent: boolean; invitation_error?: string | null }>(`/users/${userId}/resend_invitation`, {})
      setManagedUsers((currentUsers) => currentUsers.map((candidate) => candidate.id === userId ? payload.user : candidate))
      if (payload.invitation_error) setError(`Invitation recreated, but email delivery needs attention: ${payload.invitation_error}`)
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend invitation')
      throw err
    } finally {
      setSavingUserId(null)
    }
  }

  async function deleteManagedUser(userId: number) {
    setSavingUserId(userId)
    setError('')
    try {
      await deleteJson<void>(`/users/${userId}`)
      setManagedUsers((currentUsers) => currentUsers.filter((candidate) => candidate.id !== userId))
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete user')
      throw err
    } finally {
      setSavingUserId(null)
    }
  }

  async function refreshWorkOrderContext(nextQuery = DEFAULT_WORK_ORDER_QUERY) {
    const [dash, orders] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
      getJson<WorkOrderListPayload>(`/work_orders?${nextQuery}`),
    ])
    setDashboard(dash)
    setWorkOrders(orders.work_orders)
    setWorkOrderMeta(orders.meta)
  }

  async function fetchWorkOrders(query: string) {
    await refreshWorkOrderContext(query)
  }

  async function fetchPaProjects(page: number) {
    const payload = await getJson<WorkOrderListPayload>(`/work_orders?archived=active&page=${page}&per_page=${paProjectMeta?.per_page || 50}&sort=scheduled_date&direction=asc&pa_project=true`)
    setPaProjectWorkOrders(payload.work_orders)
    setPaProjectMeta(payload.meta)
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

  async function createServiceLine(values: ServiceLineInput) {
    if (!user?.permissions.can_admin) {
      setError('Admin access is required to create service lines.')
      return
    }
    setServiceLineSaving(true)
    setError('')
    try {
      const payload = await postJson<{ service_line: ServiceLine }>('/service_lines', values)
      setServiceLines((current) => [...current, payload.service_line].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)))
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create service line')
      throw err
    } finally {
      setServiceLineSaving(false)
    }
  }

  async function updateServiceLine(serviceLineId: number, values: ServiceLineInput) {
    if (!user?.permissions.can_admin) {
      setError('Admin access is required to update service lines.')
      return
    }
    setServiceLineSaving(true)
    setError('')
    try {
      const payload = await patchJson<{ service_line: ServiceLine }>(`/service_lines/${serviceLineId}`, values)
      setServiceLines((current) => current.map((line) => line.id === payload.service_line.id ? payload.service_line : line).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)))
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update service line')
      throw err
    } finally {
      setServiceLineSaving(false)
    }
  }

  async function refreshPmContext() {
    const [dash, pms] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
      getJson<PmTask[]>(`/pm_tasks?month=${selectedDate.slice(0, 7)}`),
    ])
    setDashboard(dash)
    setPmTasks(pms)
  }

  async function updatePmTask(pmTaskId: number, changes: Record<string, unknown>) {
    if (!canEditDispatch) {
      setError('Viewer access cannot update PM tasks.')
      return
    }
    setPmTaskSavingId(pmTaskId)
    setError('')
    try {
      const updated = await patchJson<PmTask>(`/pm_tasks/${pmTaskId}`, changes)
      setPmTasks((current) => current.map((pm) => pm.id === updated.id ? updated : pm))
      await Promise.allSettled([refreshPmContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update PM task')
    } finally {
      setPmTaskSavingId(null)
    }
  }

  async function createPmTask(values: PmTaskInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot create PM tasks.')
      return
    }
    setError('')
    try {
      const created = await postJson<PmTask>('/pm_tasks', values)
      setPmTasks((current) => [created, ...current.filter((pm) => pm.id !== created.id)].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.id - b.id))
      await Promise.allSettled([refreshPmContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create PM task')
      throw err
    }
  }

  async function bulkCreatePmTasks(values: PmTaskInput[]) {
    if (!canEditDispatch) {
      setError('Viewer access cannot create PM tasks.')
      return
    }
    setError('')
    try {
      const payload = await postJson<PmTaskBulkCreatePayload>('/pm_tasks/bulk_create', { pm_tasks: values })
      setPmTasks((current) => [...payload.created, ...current.filter((pm) => !payload.created.some((created) => created.id === pm.id))].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.id - b.id))
      await Promise.allSettled([refreshPmContext(), afterAuditedChange()])
      return payload.summary
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set up PM month')
      throw err
    }
  }

  async function archiveWorkOrder(workOrderId: number, archived: boolean) {
    if (!canEditDispatch) {
      setError('Viewer access cannot archive work orders.')
      return
    }

    setWorkOrderSaving(true)
    setError('')
    try {
      const updated = await patchJson<WorkOrder>(`/work_orders/${workOrderId}/${archived ? 'archive' : 'unarchive'}`, {})
      setWorkOrders((current) => current.map((workOrder) => workOrder.id === updated.id ? updated : workOrder))
      await afterAuditedChange()
      await refreshWorkOrderContext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update work order archive state')
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
      await Promise.allSettled([refreshWorkOrderContext(), refreshPmContext(), afterAuditedChange()])
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
      await refreshPmContext()
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

  async function updateWorkOrderStatus(workOrderId: number, status: WorkOrderStatus) {
    if (!canEditDispatch) {
      setError('Viewer access cannot update work order status.')
      return
    }
    setWorking(true)
    setError('')
    try {
      const updatedWorkOrder = await patchJson<WorkOrder>(`/work_orders/${workOrderId}/status`, { status })
      setWorkOrders((current) => current.map((workOrder) => workOrder.id === updatedWorkOrder.id ? updatedWorkOrder : workOrder))
      setSchedule((currentSchedule) => currentSchedule ? {
        ...currentSchedule,
        items: currentSchedule.items.map((item) => item.work_order?.id === updatedWorkOrder.id ? { ...item, work_order: updatedWorkOrder } : item),
      } : currentSchedule)
      await Promise.allSettled([refreshWorkOrderContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update work order status')
    } finally {
      setWorking(false)
    }
  }

  async function updateDispatchItemOutcome(itemId: number, changes: { outcome_status: DispatchOutcomeStatus; outcome_notes?: string; carried_over_to_date?: string }) {
    if (!schedule) return
    if (!canEditDispatch) {
      setError('Viewer access cannot update dispatch outcomes.')
      return
    }
    setWorking(true)
    setError('')
    try {
      const updated = await patchJson<DispatchSchedule>(`/dispatch_items/${itemId}/outcome`, changes)
      setSchedule(updated)
      await Promise.allSettled([refreshWhatsApp(updated.id), refreshWorkOrderContext(), refreshPmContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update dispatch outcome')
    } finally {
      setWorking(false)
    }
  }

  async function copyWhatsApp() {
    await navigator.clipboard.writeText(whatsApp)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function refreshCrewContext() {
    const [dash, teamData, technicianData] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${selectedDate}`),
      getJson<Team[]>(`/teams?date=${selectedDate}`),
      getJson<Technician[]>(`/technicians?date=${selectedDate}&include_inactive=true`),
    ])
    setDashboard(dash)
    setTeams(teamData)
    setTechnicians(technicianData)
  }

  async function createTechnician(values: TechnicianInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot create technicians.')
      return
    }
    setAvailabilitySavingId(0)
    setError('')
    try {
      await postJson<Technician>('/technicians', values)
      await Promise.allSettled([refreshCrewContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create technician')
      throw err
    } finally {
      setAvailabilitySavingId(null)
    }
  }

  async function updateTechnician(technicianId: number, values: Partial<TechnicianInput>) {
    if (!canEditDispatch) {
      setError('Viewer access cannot update technicians.')
      return
    }
    setAvailabilitySavingId(technicianId)
    setError('')
    try {
      await patchJson<Technician>(`/technicians/${technicianId}`, values)
      await Promise.allSettled([refreshCrewContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update technician')
      throw err
    } finally {
      setAvailabilitySavingId(null)
    }
  }

  async function archiveTechnician(technicianId: number) {
    if (!canEditDispatch) {
      setError('Viewer access cannot archive technicians.')
      return
    }
    setAvailabilitySavingId(technicianId)
    setError('')
    try {
      await deleteJson<void>(`/technicians/${technicianId}`)
      await Promise.allSettled([refreshCrewContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to archive technician')
    } finally {
      setAvailabilitySavingId(null)
    }
  }

  async function archiveTeam(teamId: number) {
    if (!canEditDispatch) {
      setError('Viewer access cannot archive crews.')
      return
    }
    setTeamSavingId(teamId)
    setError('')
    try {
      await deleteJson<void>(`/teams/${teamId}`)
      await Promise.allSettled([refreshCrewContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to archive crew')
    } finally {
      setTeamSavingId(null)
    }
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
    { id: 'dispatch', label: 'Dispatch Draft', description: 'Build and edit the plan', icon: <ClipboardList size={18} />, count: schedule?.items.length },
    { id: 'work-orders', label: 'Work Queue', description: 'Review open work', icon: <Wrench size={18} />, count: dashboard?.counts.open_work_orders ?? workOrderMeta?.total_count ?? workOrders.filter((workOrder) => !workOrder.archived).length },
    { id: 'pa-projects', label: 'PA Projects', description: 'Parts and long-lead follow-up', icon: <FolderKanban size={18} />, count: dashboard?.counts.pa_projects ?? paProjectMeta?.total_count ?? workOrders.filter((workOrder) => !workOrder.archived && workOrder.pa_project).length },
    { id: 'teams', label: 'Crews', description: 'Drivers and call-outs', icon: <Users size={18} />, count: teams.length },
    { id: 'pm-tasks', label: 'PMs', description: 'Preventive work', icon: <CalendarDays size={18} />, count: pmTasks.length },
    { id: 'service-lines', label: 'Service Lines', description: 'Contracts and divisions', icon: <Settings2 size={18} />, count: serviceLines.filter((line) => line.active).length },
    { id: 'whatsapp', label: 'WhatsApp', description: 'Copy send-ready text', icon: <MessageSquareText size={18} /> },
    { id: 'activity', label: 'Activity', description: 'Audit history', icon: <Activity size={18} /> },
    ...(user?.permissions.can_admin ? [{ id: 'users' as const, label: 'Users', description: 'Roles and access', icon: <UserCog size={18} />, count: managedUsers.length }] : []),
  ]

  const activeSectionMeta = sections.find((section) => section.id === currentSection) || sections[0]
  const scheduleActionLabel = working ? 'Working...' : schedule?.status && schedule.status !== 'draft' ? 'Schedule Locked' : 'Generate Draft'
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
      <div className="mx-auto flex max-w-[96rem] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="soft-reveal overflow-hidden rounded-[1.35rem] border border-[#1d336c]/15 bg-white/95 shadow-[0_18px_48px_rgba(23,32,51,0.10)] backdrop-blur">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative border-b border-[rgba(23,32,51,0.1)] bg-[#172b63] px-4 py-4 text-white lg:border-b-0 lg:border-r lg:border-white/10 lg:px-5">
              <div className="absolute inset-y-0 left-0 w-1 bg-[#d84332]" />
              <div className="flex min-h-24 flex-col justify-between gap-4 pl-2 sm:min-h-28">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.12)] backdrop-blur">
                    <span className="relative inline-flex h-9 w-12 items-center justify-center overflow-hidden rounded-xl bg-white">
                      <span className="absolute left-2 h-7 w-1.5 -skew-x-[28deg] bg-[#244393]" />
                      <span className="absolute left-5 h-7 w-1.5 -skew-x-[28deg] bg-[#d84332]" />
                      <span className="absolute left-8 h-7 w-1.5 -skew-x-[28deg] bg-[#244393]" />
                    </span>
                    <span>
                      <span className="font-display block text-sm font-extrabold tracking-tight text-white">JMI Guam</span>
                      <span className="block text-[0.64rem] font-bold uppercase tracking-[0.22em] text-blue-100/80">Operations Command</span>
                    </span>
                  </div>
                  {schedule && <span className={`inline-flex items-center rounded-full border px-3 py-1.5 font-display text-[0.66rem] font-extrabold uppercase tracking-[0.14em] ${schedule.status === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : schedule.status === 'finalized' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-white/15 bg-white/10 text-blue-50'}`}>{schedule.status}</span>}
                </div>
                <div>
                  <p className="font-display text-[0.68rem] font-extrabold uppercase tracking-[0.28em] text-blue-100/80">Facilities dispatch board</p>
                  <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                    <h1 className="font-display text-3xl font-black tracking-[-0.035em] sm:text-4xl">{activeSectionMeta?.label || 'Daily Dispatch'}</h1>
                    <p className="pb-1 text-sm font-semibold text-blue-50/72">{activeSectionMeta?.description || 'Daily dispatch command center'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 bg-white px-4 py-4 sm:grid-cols-2 lg:min-w-[34rem] lg:grid-cols-1 lg:px-5">
              {!user && isSignedIn ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-amber-100 p-2 text-amber-800">{isVerifyingApi ? <RefreshCw className="animate-spin" size={18} /> : <LockKeyhole size={18} />}</span>
                  <div>
                    <span className="font-display block font-extrabold">{isVerifyingApi ? 'Verifying your access' : 'Signed in, access needs setup'}</span>
                    <span className="text-amber-900/80">{isVerifyingApi ? 'Checking your JMI dispatch role...' : 'Clerk worked. The API still needs profile access.'}</span>
                  </div>
                </div>
              </div> : !user ? <div className="rounded-2xl border border-[#244393]/15 bg-[#f8faff] p-3 text-sm text-[#334155]">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-[#e8eefc] p-2 text-[#244393]"><LockKeyhole size={18} /></span>
                  <div>
                    <span className="font-display block font-extrabold text-[#172033]">Sign in to work the schedule</span>
                    <span className="text-[#526071]">Live JMI data and dispatch actions require Clerk.</span>
                  </div>
                </div>
              </div> : null}

              {user && <div className="grid gap-2 sm:col-span-2 lg:col-span-1 lg:grid-cols-[1fr_auto]">
                <label className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-[#f8faff] px-3 py-2">
                  <span className="font-display block text-[0.64rem] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">Schedule date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="tabular mt-1 w-full rounded-xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 font-display text-sm font-extrabold text-[#172033] outline-none transition focus:border-[#244393] focus:ring-4 focus:ring-[#244393]/12"
                  />
                </label>
                <button
                  type="button"
                  disabled={selectedDate === todayDate}
                  onClick={() => setSelectedDate(todayDate)}
                  className="rounded-2xl border border-[rgba(36,67,147,0.18)] bg-white px-4 py-2 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Today
                </button>
              </div>}

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1">
                {canEditDispatch && <button disabled={working || Boolean(schedule && schedule.status !== 'draft')} onClick={suggestSchedule} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#d84332] px-4 py-3 font-display text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(216,67,50,0.24)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none">
                  <ClipboardList size={17} /> {scheduleActionLabel}
                </button>}
                {user && <div className="inline-flex flex-1 items-center gap-3 rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white px-3 py-2 text-sm text-[#526071] shadow-sm sm:flex-none">
                  <UserButton />
                  <span className="leading-tight">
                    <span className="font-display block font-extrabold text-[#172033]">{user.name}</span>
                    <span className="text-xs capitalize text-[#64748b]">{user.role}</span>
                  </span>
                </div>}
                {!isSignedIn && <SignInButton mode="modal">
                  <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#172b63] px-5 py-3 font-display text-sm font-extrabold text-white shadow-[0_16px_34px_rgba(23,43,99,0.2)] transition hover:-translate-y-0.5 hover:bg-[#244393] sm:flex-none">
                    <LockKeyhole size={18} /> Sign In
                  </button>
                </SignInButton>}
              </div>
            </div>
          </div>
        </header>

        <nav aria-label="JMI dispatch sections" className="soft-reveal-delay sticky top-3 z-10 flex gap-1 overflow-x-auto rounded-[1.1rem] border border-[rgba(23,32,51,0.12)] bg-white/95 p-1.5 shadow-[0_12px_30px_rgba(23,32,51,0.08)] backdrop-blur">
          {sections.map((section) => {
            const isActive = currentSection === section.id
            return <button
              key={section.id}
              type="button"
              onClick={() => goToSection(section.id)}
              title={section.description}
              className={`group flex h-11 min-w-fit shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-center transition sm:px-4 ${isActive ? 'border-[#244393] bg-[#172b63] text-white shadow-[0_10px_24px_rgba(36,67,147,0.2)]' : 'border-transparent text-[#172033] hover:border-[rgba(36,67,147,0.18)] hover:bg-[#f4f7fb]'}`}
            >
              <span className={`inline-flex shrink-0 rounded-lg p-1.5 ${isActive ? 'bg-white/12 text-blue-100' : 'bg-[#e8eefc] text-[#244393]'}`}>{section.icon}</span>
              <span className="font-display whitespace-nowrap text-sm font-extrabold">{section.label}</span>
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

        {currentSection === 'overview' && <DashboardMetrics dashboard={dashboard} workOrders={workOrders.filter((workOrder) => !workOrder.archived)} teams={teams} technicians={technicians} pmTasks={pmTasks} schedule={schedule} auditEvents={auditEvents} canEdit={canEditDispatch} working={working} onGoToSection={goToSection} onSuggest={suggestSchedule} />}

        {currentSection === 'work-orders' && (user ? <WorkOrdersPanel workOrders={workOrders} meta={workOrderMeta} serviceLines={serviceLines} canEdit={canEditDispatch} selectedDate={selectedDate} saving={workOrderSaving} workOrderToEdit={workOrderToEdit} onEditConsumed={clearWorkOrderToEdit} onFetch={fetchWorkOrders} onCreate={createWorkOrder} onUpdate={updateWorkOrder} onArchive={archiveWorkOrder} /> : <SignInRequiredPanel title="Sign in to review work orders" />)}

        {currentSection === 'pa-projects' && (user ? <PaProjectsPanel workOrders={paProjectWorkOrders} meta={paProjectMeta} canEdit={canEditDispatch} onPage={fetchPaProjects} onEdit={openWorkOrderFromPaProject} /> : <SignInRequiredPanel title="Sign in to review PA Projects" />)}

        {currentSection === 'teams' && (user ? <TeamsPanel teams={teams} technicians={technicians} serviceLines={serviceLines} canEdit={canEditDispatch} savingTechnicianId={availabilitySavingId} savingTeamId={teamSavingId} onToggleAvailability={toggleAvailability} onUpdateDailyCrew={updateDailyCrew} onUpdateDefaultCrew={updateDefaultCrew} onCreateTeam={createTeam} onArchiveTeam={archiveTeam} onCreateTechnician={createTechnician} onUpdateTechnician={updateTechnician} onArchiveTechnician={archiveTechnician} /> : <SignInRequiredPanel title="Sign in to check crews" />)}

        {currentSection === 'dispatch' && (user ? <DispatchBuilder schedule={schedule} teams={teams} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} onOutcome={updateDispatchItemOutcome} onWorkOrderStatus={updateWorkOrderStatus} onFinalize={finalizeSchedule} onReopen={reopenSchedule} /> : <SignInRequiredPanel title="Sign in to build today's dispatch" />)}

        {currentSection === 'pm-tasks' && (user ? <PmTasksPanel key={selectedDate} pmTasks={pmTasks} canEdit={canEditDispatch} savingPmTaskId={pmTaskSavingId} selectedDate={selectedDate} onUpdate={updatePmTask} onCreate={createPmTask} onBulkCreate={bulkCreatePmTasks} /> : <SignInRequiredPanel title="Sign in to review PM tasks" />)}

        {currentSection === 'service-lines' && (user ? <ServiceLinesPanel serviceLines={serviceLines} canAdmin={Boolean(user.permissions.can_admin)} saving={serviceLineSaving} onCreate={createServiceLine} onUpdate={updateServiceLine} /> : <SignInRequiredPanel title="Sign in to review service lines" />)}

        {currentSection === 'whatsapp' && (user ? <WhatsAppExport schedule={schedule} message={whatsApp} crews={whatsAppCrews} copied={copied} working={working} canEdit={canEditDispatch} onCopy={copyWhatsApp} onMarkSent={markScheduleSent} /> : <SignInRequiredPanel title="Sign in to copy WhatsApp output" />)}

        {currentSection === 'activity' && (user ? <ActivityPanel events={auditEvents} /> : <SignInRequiredPanel title="Sign in to review activity" />)}

        {currentSection === 'users' && user?.permissions.can_admin && <UserManagementPanel users={managedUsers} currentUserId={user.id} savingUserId={savingUserId} onCreate={createManagedUser} onUpdate={updateManagedUser} onResendInvitation={resendManagedUserInvitation} onDelete={deleteManagedUser} />}
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
