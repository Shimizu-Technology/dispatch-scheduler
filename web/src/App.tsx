import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Activity, BarChart3, CalendarDays, ClipboardList, FolderKanban, LayoutDashboard, LockKeyhole, Menu, MessageSquareText, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings2, UserCog, Users, Wrench, X } from 'lucide-react'
import { SignInButton, UserButton } from '@clerk/react'
import { ActivityPanel } from './components/ActivityPanel'
import { DashboardMetrics } from './components/DashboardMetrics'
import { DispatchBuilder } from './components/DispatchBuilder'
import { PaProjectsPanel } from './components/PaProjectsPanel'
import { PmTasksPanel } from './components/PmTasksPanel'
import { ReportsPanel } from './components/ReportsPanel'
import { ServiceLinesPanel } from './components/ServiceLinesPanel'
import { TeamsPanel } from './components/TeamsPanel'
import { UserManagementPanel } from './components/UserManagementPanel'
import { WhatsAppExport } from './components/WhatsAppExport'
import { WorkOrdersPanel, type WorkOrderEditorState } from './components/WorkOrdersPanel'
import { useAuthContext } from './contexts/useAuthContext'
import { RequestGuard } from './lib/requestGuard'
import { ApiError, deleteJson, getBlob, getJson, patchJson, postJson } from './lib/api'
import type { AuditEvent, Dashboard, DispatchOutcomeStatus, DispatchSchedule, ManagedUser, MonthlyReport, PaginationMeta, PmTask, PmTaskBulkCreatePayload, PmTaskInput, PmTemplate, PmTemplateGenerationPayload, PmTemplateInput, ServiceLine, ServiceLineInput, Team, TeamInput, Technician, TechnicianInput, WhatsAppCrewExport, WhatsAppExportPayload, WorkOrder, WorkOrderInput, WorkOrderListPayload, WorkOrderStatus } from './types'
import './index.css'

type ActiveSection = 'overview' | 'work-orders' | 'pm-tasks' | 'pa-projects' | 'dispatch' | 'teams' | 'reports' | 'whatsapp' | 'activity' | 'service-lines' | 'users'
type PendingWorkOrderLeave = { url: string; replace?: boolean; historyDelta?: number }
type AppRoute = { section: ActiveSection; path: string; search: string; date?: string; month?: string; workOrderId?: number }

type SectionLink = {
  id: ActiveSection
  label: string
  mobileLabel?: string
  description: string
  icon: ReactNode
  count?: number
  group: 'operate' | 'manage' | 'admin'
}

const SECTION_IDS: ActiveSection[] = ['overview', 'work-orders', 'pm-tasks', 'pa-projects', 'dispatch', 'teams', 'reports', 'whatsapp', 'activity', 'service-lines', 'users']
const SELECTED_DATE_STORAGE_KEY = 'dispatch-scheduler:selected-date'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'dispatch-scheduler:sidebar-collapsed'
const DEFAULT_WORK_ORDER_QUERY = 'archived=active&page=1&per_page=50&sort=created_at&direction=desc'
function queueQueryKey(query: string) {
  const params = new URLSearchParams(query.replace(/^\?/, ''))
  // The filter accepts this deep-link alias; the API's archive scope is only.
  if (params.get('archived') === 'archived') params.set('archived', 'only')
  new URLSearchParams(DEFAULT_WORK_ORDER_QUERY).forEach((value, key) => {
    if (!params.get(key)) params.set(key, value)
  })
  params.sort()
  return params.toString()
}
const ROUTE_PATHS: Record<ActiveSection, string> = {
  overview: '/dashboard',
  'work-orders': '/work-orders',
  'pm-tasks': '/pm',
  'pa-projects': '/pa-projects',
  dispatch: '/dispatch/today',
  teams: '/crews',
  reports: '/reports',
  whatsapp: '/whatsapp',
  activity: '/activity',
  'service-lines': '/admin/service-lines',
  users: '/admin/users',
}

function localDateString(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 10)
}

function initialSelectedDate() {
  return window.localStorage.getItem(SELECTED_DATE_STORAGE_KEY) || localDateString()
}

function initialSidebarCollapsed() {
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
}

function routeFromLegacyHash(hash: string): ActiveSection | null {
  const value = hash.replace('#', '')
  return SECTION_IDS.includes(value as ActiveSection) ? value as ActiveSection : null
}

function routeForLocation(location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): AppRoute {
  const legacySection = routeFromLegacyHash(location.hash)
  if (legacySection) return { section: legacySection, path: ROUTE_PATHS[legacySection], search: '' }

  const path = location.pathname.replace(/\/$/, '') || '/'
  const search = location.search
  const dispatchDateMatch = path.match(/^\/dispatch\/(\d{4}-\d{2}-\d{2})$/)
  if (dispatchDateMatch) return { section: 'dispatch', path, search, date: dispatchDateMatch[1] }
  if (path === '/dispatch' || path === '/dispatch/today') return { section: 'dispatch', path, search }

  const pmMonthMatch = path.match(/^\/pm\/month\/(\d{4}-\d{2})$/)
  if (pmMonthMatch) return { section: 'pm-tasks', path, search, month: pmMonthMatch[1] }
  if (path === '/pm' || path === '/pm/templates') return { section: 'pm-tasks', path, search }

  const reportMonthMatch = path.match(/^\/reports\/monthly\/(\d{4}-\d{2})$/)
  if (reportMonthMatch) return { section: 'reports', path, search, month: reportMonthMatch[1] }
  if (path === '/reports') return { section: 'reports', path, search }

  if (path === '/') return { section: 'work-orders', path: '/work-orders', search }
  if (path === '/dashboard') return { section: 'overview', path, search }
  const workOrderMatch = path.match(/^\/work-orders\/(\d+)$/)
  if (workOrderMatch) return { section: 'work-orders', path, search, workOrderId: Number(workOrderMatch[1]) }
  if (path === '/work-orders') return { section: 'work-orders', path, search }
  if (path === '/pa-projects' || path.startsWith('/pa-projects/')) return { section: 'pa-projects', path, search }
  if (path === '/crews' || path === '/teams') return { section: 'teams', path, search }
  if (path === '/whatsapp' || path === '/dispatch/whatsapp') return { section: 'whatsapp', path, search }
  if (path === '/activity') return { section: 'activity', path, search }
  if (path === '/admin/service-lines' || path === '/service-lines') return { section: 'service-lines', path, search }
  if (path === '/admin/users' || path === '/users') return { section: 'users', path, search }

  return { section: 'overview', path: '/dashboard', search: '' }
}

function dateFromMonth(month: string, fallbackDay: string) {
  const day = Number(fallbackDay.slice(8, 10) || '1')
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return `${month}-${String(Math.min(day || 1, lastDay)).padStart(2, '0')}`
}

function FloatingTooltip({ anchorRef, label, visible }: { anchorRef: RefObject<HTMLElement | null>; label: string; visible: boolean }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!visible) return

    const updatePosition = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      setPosition({ top: rect.top + rect.height / 2, left: rect.right + 14 })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, visible])

  if (!visible || !position || typeof document === 'undefined') return null

  return createPortal(
    <div className="pointer-events-none fixed z-[120] hidden -translate-y-1/2 items-center xl:flex" style={{ top: position.top, left: position.left }}>
      <span className="h-3 w-3 translate-x-[7px] rotate-45 rounded-[3px] bg-[#111827] shadow-lg" />
      <span className="whitespace-nowrap rounded-xl bg-[#111827] px-3.5 py-2 text-xs font-semibold text-white shadow-2xl">{label}</span>
    </div>,
    document.body
  )
}

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return <div className={`flex items-center rounded-2xl transition-colors ${collapsed ? 'gap-3 px-3 py-2 xl:justify-center xl:p-1.5' : 'gap-3 px-3 py-2'}`}>
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#244393]/12">
      <span className="absolute left-2.5 h-8 w-1.5 -skew-x-[28deg] bg-[#244393]" />
      <span className="absolute left-5 h-8 w-1.5 -skew-x-[28deg] bg-[#d84332]" />
      <span className="absolute left-[1.875rem] h-8 w-1.5 -skew-x-[28deg] bg-[#244393]" />
    </span>
    <span className={collapsed ? 'min-w-0 xl:sr-only' : 'min-w-0'}>
      <span className="font-display block truncate text-sm font-black tracking-tight text-[#172033]">JMI Guam</span>
      <span className="block truncate text-[0.64rem] font-extrabold uppercase tracking-[0.18em] text-[#64748b]">Management System</span>
    </span>
  </div>
}

function SidebarNavLink({ section, href, active, collapsed, onNavigate }: { section: SectionLink; href: string; active: boolean; collapsed: boolean; onNavigate: (section: ActiveSection) => void }) {
  const anchorRef = useRef<HTMLAnchorElement | null>(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTooltipVisible(false)
  }, [collapsed])

  return <>
    <a
      ref={anchorRef}
      href={href}
      onClick={(event) => { event.preventDefault(); setTooltipVisible(false); onNavigate(section.id) }}
      onMouseEnter={() => collapsed && setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onFocus={() => collapsed && setTooltipVisible(true)}
      onBlur={() => setTooltipVisible(false)}
      aria-label={collapsed ? section.label : undefined}
      title={collapsed ? section.label : undefined}
      className={`group relative flex min-h-11 items-center rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#244393]/30 ${collapsed ? 'gap-3 px-3 py-2.5 xl:justify-center xl:gap-0 xl:px-2' : 'gap-3 px-3 py-2.5'} ${active ? 'bg-[#172b63] text-white shadow-[0_12px_26px_-18px_rgba(23,43,99,0.9)] ring-1 ring-[#172b63]/15' : 'text-[#526071] hover:bg-[#eef3ff] hover:text-[#172033]'}`}
    >
      <span className={`inline-flex shrink-0 rounded-xl p-2 ${active ? 'bg-white/12 text-white' : 'bg-[#eef3ff] text-[#244393] group-hover:bg-white'}`}>{section.icon}</span>
      <span className={collapsed ? 'min-w-0 flex-1 xl:sr-only' : 'min-w-0 flex-1'}>
        <span className="block truncate font-display text-sm font-extrabold">{section.label}</span>
        <span className={`block truncate text-xs font-semibold ${active ? 'text-blue-100/78' : 'text-[#7b8798]'}`}>{section.description}</span>
      </span>
      {typeof section.count === 'number' && <span className={`${collapsed ? 'ml-auto min-w-7 px-2 text-xs xl:absolute xl:right-1 xl:top-1 xl:min-w-5 xl:px-1 xl:text-[0.62rem]' : 'ml-auto min-w-7 px-2 text-xs'} tabular inline-flex justify-center rounded-full py-0.5 font-extrabold ${active ? 'bg-white/14 text-white' : 'bg-[#eef2ff] text-[#244393]'}`}>{section.count}</span>}
    </a>
    {collapsed && <FloatingTooltip anchorRef={anchorRef} label={section.label} visible={tooltipVisible} />}
  </>
}

function AppSidebar({ sections, currentSection, collapsed, mobileOpen, userName, userRole, hrefForSection, onToggleCollapsed, onCloseMobile, onNavigate }: { sections: SectionLink[]; currentSection: ActiveSection; collapsed: boolean; mobileOpen: boolean; userName?: string; userRole?: string; hrefForSection: (section: ActiveSection) => string; onToggleCollapsed: () => void; onCloseMobile: () => void; onNavigate: (section: ActiveSection) => void }) {
  const collapseButtonRef = useRef<HTMLButtonElement | null>(null)
  const [collapseTooltipVisible, setCollapseTooltipVisible] = useState(false)
  const groupedSections = (['operate', 'manage', 'admin'] as const).map((group) => ({
    group,
    label: group === 'operate' ? 'Track' : group === 'manage' ? 'Dispatch' : 'Admin',
    items: sections.filter((section) => section.group === group),
  })).filter((group) => group.items.length > 0)

  return <aside className={`fixed inset-y-0 left-0 z-50 flex w-[18rem] flex-col border-r border-[rgba(23,32,51,0.1)] bg-white/98 shadow-2xl shadow-slate-900/18 transition-all duration-200 xl:sticky xl:top-5 xl:z-auto xl:h-[calc(100vh-2.5rem)] xl:translate-x-0 xl:rounded-[1.15rem] xl:border xl:shadow-[0_14px_36px_rgba(23,32,51,0.08)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'xl:w-[5.25rem]' : 'xl:w-[15.5rem]'}`}>
    <nav className="flex h-full flex-col" aria-label="JMI management navigation">
      <div className={`border-b border-[rgba(23,32,51,0.09)] ${collapsed ? 'px-3 pb-3 pt-4' : 'px-3 pb-4 pt-4'}`}>
        <div className="flex items-center justify-between gap-2">
          <a href="/dashboard" onClick={(event) => { event.preventDefault(); onNavigate('overview') }} className="min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#244393]/30">
            <SidebarLogo collapsed={collapsed} />
          </a>
          <button type="button" onClick={onCloseMobile} className="rounded-xl p-2 text-[#64748b] transition hover:bg-slate-100 xl:hidden" aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button
          ref={collapseButtonRef}
          type="button"
          onClick={() => { setCollapseTooltipVisible(false); onToggleCollapsed() }}
          onMouseEnter={() => collapsed && setCollapseTooltipVisible(true)}
          onMouseLeave={() => setCollapseTooltipVisible(false)}
          onFocus={() => collapsed && setCollapseTooltipVisible(true)}
          onBlur={() => setCollapseTooltipVisible(false)}
          className={`mt-3 hidden min-h-10 w-full items-center rounded-xl border border-[rgba(23,32,51,0.1)] bg-[#f8faff] px-3 py-2 text-xs font-extrabold text-[#526071] transition hover:border-[#244393]/18 hover:bg-[#eef3ff] hover:text-[#244393] xl:flex ${collapsed ? 'justify-center' : 'justify-between'}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : undefined}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <><span>Collapse</span><PanelLeftClose size={16} /></>}
        </button>
        {collapsed && <FloatingTooltip anchorRef={collapseButtonRef} label="Expand sidebar" visible={collapseTooltipVisible} />}
      </div>

      <div className={`flex-1 overflow-y-auto py-3 ${collapsed ? 'space-y-3 px-2' : 'space-y-4 px-3'}`}>
        {groupedSections.map((group, groupIndex) => <div key={group.group}>
          <div className={collapsed ? (groupIndex === 0 ? 'mb-1.5 px-3 font-display text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#94a0b5] xl:sr-only' : 'mb-1.5 px-3 font-display text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#94a0b5] xl:mx-3 xl:my-2 xl:border-t xl:border-[rgba(23,32,51,0.1)] xl:px-0 xl:text-transparent') : 'mb-1.5 px-3 font-display text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#94a0b5]'}>{group.label}</div>
          <div className="space-y-1">
            {group.items.map((section) => <SidebarNavLink key={section.id} section={section} href={hrefForSection(section.id)} active={currentSection === section.id} collapsed={collapsed} onNavigate={(target) => { onNavigate(target); onCloseMobile() }} />)}
          </div>
        </div>)}
      </div>

      <div className={`border-t border-[rgba(23,32,51,0.09)] p-3 ${collapsed ? 'text-center' : ''}`}>
        <div className={`flex items-center rounded-2xl border border-[rgba(23,32,51,0.1)] bg-[#f8faff] ${collapsed ? 'gap-3 px-3 py-2.5 xl:justify-center xl:gap-0 xl:px-2 xl:py-2' : 'gap-3 px-3 py-2.5'}`}>
          <UserButton />
          <div className={collapsed ? 'min-w-0 flex-1 xl:sr-only' : 'min-w-0 flex-1'}>
            <p className="font-display truncate text-sm font-extrabold text-[#172033]">{userName || 'User'}</p>
            <p className="truncate text-xs capitalize text-[#64748b]">{userRole || 'viewer'}</p>
          </div>
        </div>
      </div>
    </nav>
  </aside>
}

function DispatchApp() {
  const { isSignedIn, isLoading: authLoading, isVerifyingApi, user, authError, canEditDispatch, refreshUser } = useAuthContext()
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => routeForLocation())
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(initialSidebarCollapsed)
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
  const [pmTemplates, setPmTemplates] = useState<PmTemplate[]>([])
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([])
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [schedule, setSchedule] = useState<DispatchSchedule | null>(null)
  const [whatsApp, setWhatsApp] = useState('')
  const [whatsAppCrews, setWhatsAppCrews] = useState<WhatsAppCrewExport[]>([])
  const [loading, setLoading] = useState(false)
  const [overviewReady, setOverviewReady] = useState(false)
  const [working, setWorking] = useState(false)
  const [availabilitySavingId, setAvailabilitySavingId] = useState<number | null>(null)
  const [teamSavingId, setTeamSavingId] = useState<number | null>(null)
  const [workOrderSaving, setWorkOrderSaving] = useState(false)
  const [serviceLineSaving, setServiceLineSaving] = useState(false)
  const [pmTaskSavingId, setPmTaskSavingId] = useState<number | null>(null)
  const [savingUserId, setSavingUserId] = useState<number | null>(null)
  const [invitationNotice, setInvitationNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const [queueLoading, setQueueLoading] = useState(false)
  const [queueError, setQueueError] = useState('')
  const requests = useRef(new RequestGuard())
  const context = useRef({ date: selectedDate, route: currentRoute })
  const workOrderEditor = useRef<WorkOrderEditorState>({ open: false, dirty: false, saving: false, unconfirmed: false })
  const [pendingWorkOrderLeave, setPendingWorkOrderLeave] = useState<PendingWorkOrderLeave | null>(null)
  const [workOrderLeaveBlocked, setWorkOrderLeaveBlocked] = useState(false)
  const acceptedUrl = useRef(window.location.pathname + window.location.search + window.location.hash)
  const acceptedHistoryIndex = useRef(0)
  const restoringHistory = useRef(false)
  const confirmedAfterRestore = useRef<PendingWorkOrderLeave | null>(null)
  useLayoutEffect(() => {
    const index = window.history.state?.jmiNavigationIndex
    acceptedHistoryIndex.current = Number.isInteger(index) ? index : 0
    window.history.replaceState({ ...window.history.state, jmiNavigationIndex: acceptedHistoryIndex.current }, '', acceptedUrl.current)
  }, [])
  const reportWorkOrderEditor = useCallback((state: WorkOrderEditorState) => {
    workOrderEditor.current = state
    if (!state.open || (!state.dirty && !state.unconfirmed && !state.saving)) setPendingWorkOrderLeave(null)
    if (!state.saving) setWorkOrderLeaveBlocked(false)
  }, [])
  const acceptRoute = useCallback(() => {
    const route = routeForLocation()
    acceptedUrl.current = window.location.pathname + window.location.search + window.location.hash
    if (route.section !== 'work-orders' || route.workOrderId !== context.current.route.workOrderId) setWorkOrderToEdit(null)
    setCurrentRoute(route)
  }, [])
  const performNavigation = useCallback((url: string, options: { replace?: boolean } = {}) => {
    const index = acceptedHistoryIndex.current + (options.replace ? 0 : 1)
    const state = { ...(options.replace ? window.history.state : {}), jmiNavigationIndex: index }
    if (options.replace) window.history.replaceState(state, '', url)
    else window.history.pushState(state, '', url)
    acceptedHistoryIndex.current = index
    acceptRoute()
    const destination = routeForLocation(new URL(url, window.location.origin))
    const current = context.current.route
    if (!(current.section === 'work-orders' && destination.section === 'work-orders' && queueQueryKey(current.search) === queueQueryKey(destination.search))) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [acceptRoute])
  const mayNavigate = useCallback((target: PendingWorkOrderLeave) => {
    const url = new URL(target.url, window.location.origin)
    const destination = routeForLocation(url)
    const current = context.current.route
    const editor = workOrderEditor.current
    const leavingEditor = current.section === 'work-orders' && editor.open &&
      (destination.section !== 'work-orders' || destination.workOrderId !== current.workOrderId)
    if (!leavingEditor) return true
    if (editor.saving) {
      setWorkOrderLeaveBlocked(true)
      return false
    }
    if (editor.dirty || editor.unconfirmed) {
      setPendingWorkOrderLeave(target)
      return false
    }
    return true
  }, [])
  const navigateTo = useCallback((url: string, options: { replace?: boolean } = {}) => {
    const target = { url, replace: options.replace }
    if (mayNavigate(target)) {
      if (restoringHistory.current) confirmedAfterRestore.current = target
      else performNavigation(url, options)
    }
  }, [mayNavigate, performNavigation])
  const finishWorkOrderLeave = useCallback((target: PendingWorkOrderLeave) => {
    if (target.historyDelta) window.history.go(target.historyDelta)
    else performNavigation(target.url, { replace: target.replace })
  }, [performNavigation])
  function discardAndLeaveWorkOrders() {
    if (!pendingWorkOrderLeave || workOrderEditor.current.saving) return
    const target = pendingWorkOrderLeave
    workOrderEditor.current = { open: false, dirty: false, saving: false, unconfirmed: false }
    setPendingWorkOrderLeave(null)
    setWorkOrderToEdit(null)
    if (restoringHistory.current) confirmedAfterRestore.current = target
    else finishWorkOrderLeave(target)
  }
  useLayoutEffect(() => { context.current = { date: selectedDate, route: currentRoute } }, [selectedDate, currentRoute])
  useEffect(() => {
    requests.current.activate()
    const guard = requests.current
    return () => guard.dispose()
  }, [])

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
    if (context.current.route.section !== 'work-orders') void fetchWorkOrders(DEFAULT_WORK_ORDER_QUERY)
    const [dash, teamData, technicianData, pms, templates, lines, schedulePayload] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${date}`),
      getJson<Team[]>(`/teams?date=${date}`),
      getJson<Technician[]>(`/technicians?date=${date}&include_inactive=true`),
      getJson<PmTask[]>(`/pm_tasks?month=${date.slice(0, 7)}`),
      getJson<{ pm_templates: PmTemplate[] }>('/pm_templates'),
      getJson<{ service_lines: ServiceLine[] }>('/service_lines?include_inactive=true'),
      getJson<{ schedule: DispatchSchedule | null }>(`/dispatch_schedules?date=${date}`),
    ])
    setDashboard(dash)
    setTeams(teamData)
    setTechnicians(technicianData)
    setPmTasks(pms)
    setPmTemplates(templates.pm_templates)
    setServiceLines(lines.service_lines)
    setSchedule(schedulePayload.schedule)
    setOverviewReady(true)
    void refreshAuditEvents()
    if (schedulePayload.schedule) {
      await refreshWhatsApp(schedulePayload.schedule.id)
    } else {
      setWhatsApp('')
      setWhatsAppCrews([])
    }
    setLoading(false)
  // Queue reads use the current route ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshAuditEvents, refreshWhatsApp])

  useEffect(() => {
    window.localStorage.setItem(SELECTED_DATE_STORAGE_KEY, selectedDate)
  }, [selectedDate])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(desktopSidebarCollapsed))
  }, [desktopSidebarCollapsed])

  useEffect(() => {
    if (!mobileNavOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileNavOpen])

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
    if (!user?.id || currentRoute.section !== 'pa-projects') return

    void fetchPaProjects(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoute.section, user?.id])

  useEffect(() => {
    if (!user?.id || currentRoute.section !== 'reports') return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReportLoading(true)
    void getJson<MonthlyReport>(`/reports/monthly?month=${selectedDate.slice(0, 7)}`)
      .then(setMonthlyReport)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load report'))
      .finally(() => setReportLoading(false))
  }, [currentRoute.section, selectedDate, user?.id])

  useEffect(() => {
    if (!user?.permissions.can_admin) return

    void getJson<{ users: ManagedUser[] }>('/users')
      .then((payload) => setManagedUsers(payload.users))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load users')
      })
  }, [user?.permissions.can_admin])

  useEffect(() => {
    if (!user?.id || currentRoute.section !== 'work-orders' || !currentRoute.workOrderId) return

    const id = currentRoute.workOrderId
    const current = requests.current.begin('work-order-detail', () => context.current.route.section === 'work-orders' && context.current.route.workOrderId === id)
    void getJson<WorkOrder>(`/work_orders/${currentRoute.workOrderId}`)
      .then((order) => {
        const editor = workOrderEditor.current
        if (current() && (!editor.open || (!editor.dirty && !editor.unconfirmed && !editor.saving))) setWorkOrderToEdit(order)
      })
      .catch((err) => { if (current()) setError(err instanceof Error ? err.message : 'Unable to load work order') })
    const guard = requests.current
    return () => { guard.begin('work-order-detail') }
  }, [currentRoute.section, currentRoute.workOrderId, user?.id])

  useEffect(() => {
    if (currentRoute.section === 'work-orders' && !currentRoute.workOrderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkOrderToEdit(null)
    }
  }, [currentRoute.section, currentRoute.workOrderId])

  useEffect(() => {
    const handleRouteChange = () => {
      if (restoringHistory.current) {
        const currentUrl = window.location.pathname + window.location.search + window.location.hash
        if (currentUrl !== acceptedUrl.current) {
          const index = window.history.state?.jmiNavigationIndex
          if (Number.isInteger(index) && index !== acceptedHistoryIndex.current) {
            window.history.go(acceptedHistoryIndex.current - index)
            return
          }
          window.history.replaceState({ jmiNavigationIndex: acceptedHistoryIndex.current }, '', acceptedUrl.current)
        }
        restoringHistory.current = false
        const confirmed = confirmedAfterRestore.current
        confirmedAfterRestore.current = null
        if (confirmed) finishWorkOrderLeave(confirmed)
        return
      }
      const targetUrl = window.location.pathname + window.location.search + window.location.hash
      const index = window.history.state?.jmiNavigationIndex
      const delta = Number.isInteger(index) ? index - acceptedHistoryIndex.current : undefined
      if (!mayNavigate({ url: targetUrl, replace: true, historyDelta: delta })) {
        // Keep the rendered editor and restore its URL while the inline prompt
        // waits. Indexed app entries preserve the original Back/Forward stack.
        if (delta) {
          restoringHistory.current = true
          window.history.go(-delta)
        } else {
          window.history.pushState({ jmiNavigationIndex: acceptedHistoryIndex.current }, '', acceptedUrl.current)
        }
        return
      }
      acceptedHistoryIndex.current = Number.isInteger(index) ? index : acceptedHistoryIndex.current + 1
      window.history.replaceState({ ...window.history.state, jmiNavigationIndex: acceptedHistoryIndex.current }, '', targetUrl)
      acceptRoute()
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const editor = workOrderEditor.current
      if (editor.open && (editor.dirty || editor.unconfirmed || editor.saving)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener('hashchange', handleRouteChange)
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
      window.removeEventListener('hashchange', handleRouteChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [acceptRoute, mayNavigate, finishWorkOrderLeave])

  useEffect(() => {
    if (window.location.hash && routeFromLegacyHash(window.location.hash)) {
      navigateTo(ROUTE_PATHS[routeFromLegacyHash(window.location.hash) || 'overview'], { replace: true })
    }
  }, [navigateTo])

  useEffect(() => {
    const routeDate = currentRoute.date || (currentRoute.month ? dateFromMonth(currentRoute.month, selectedDate) : null)
    if (routeDate && routeDate !== selectedDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDate(routeDate)
    }
  }, [currentRoute.date, currentRoute.month, selectedDate])

  function pathForSection(section: ActiveSection) {
    if (section === 'dispatch') return selectedDate === todayDate ? '/dispatch/today' : `/dispatch/${selectedDate}`
    if (section === 'pm-tasks') return `/pm/month/${selectedDate.slice(0, 7)}`
    if (section === 'reports') return `/reports/monthly/${selectedDate.slice(0, 7)}`
    return ROUTE_PATHS[section]
  }

  function goToSection(section: ActiveSection) {
    if (section !== 'work-orders') setWorkOrderToEdit(null)
    navigateTo(pathForSection(section))
  }

  function handleSelectedDateChange(date: string) {
    setSelectedDate(date)
    if (currentRoute.section === 'dispatch') navigateTo(date === todayDate ? '/dispatch/today' : `/dispatch/${date}`, { replace: true })
    if (currentRoute.section === 'pm-tasks') navigateTo(`/pm/month/${date.slice(0, 7)}`, { replace: true })
    if (currentRoute.section === 'reports') navigateTo(`/reports/monthly/${date.slice(0, 7)}`, { replace: true })
  }

  function updateWorkOrderRouteQuery(query: string) {
    navigateTo(`/work-orders?${query}`)
  }

  function openWorkOrderFromPaProject(workOrder: WorkOrder) {
    setWorkOrderToEdit(workOrder)
    navigateTo(`/work-orders/${workOrder.id}`)
  }

  function clearWorkOrderToEdit() {
    setWorkOrderToEdit(null)
    if (currentRoute.workOrderId) navigateTo(`/work-orders${currentRoute.search || ''}`, { replace: true })
  }

  async function afterAuditedChange() {
    try {
      await refreshAuditEvents()
    } catch {
      // Activity refresh failures should never block the main dispatch workflow.
    }
  }

  async function createManagedUser(values: { email: string; name?: string; role: ManagedUser['role'] }) {
    setInvitationNotice('')
    setSavingUserId(0)
    setError('')
    try {
      const payload = await postJson<{ user: ManagedUser; invitation_sent: boolean; invitation_error?: string | null }>('/users', values)
      setManagedUsers((currentUsers) => [...currentUsers, payload.user].sort((a, b) => a.email.localeCompare(b.email)))
      if (payload.invitation_error) setInvitationNotice('Access was saved, but the invitation email was not sent. Check delivery settings and use Resend invitation.')
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
    setInvitationNotice('')
    setSavingUserId(userId)
    setError('')
    try {
      const payload = await postJson<{ user: ManagedUser; invitation_sent: boolean; invitation_error?: string | null }>(`/users/${userId}/resend_invitation`, {})
      setManagedUsers((currentUsers) => currentUsers.map((candidate) => candidate.id === userId ? payload.user : candidate))
      if (payload.invitation_error) setInvitationNotice('The invitation email was not sent. Access is still pending. Check delivery settings and try again.')
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

  async function refreshWorkOrderContext(nextQuery = currentRoute.section === 'work-orders' ? currentRoute.search.replace(/^\?/, '') || DEFAULT_WORK_ORDER_QUERY : DEFAULT_WORK_ORDER_QUERY) {
    const date = selectedDate
    // Partial/deep-link queries still need the paginated envelope. Use the same
    // normalized query for both the actual request and stale-context checks.
    const requestQuery = queueQueryKey(nextQuery)
    const matchesContext = () => context.current.route.section !== 'work-orders' || queueQueryKey(context.current.route.search) === requestQuery
    if (!matchesContext()) return
    const queueCurrent = requests.current.begin('queue', matchesContext)
    const dashboardCurrent = requests.current.begin('dashboard', () => context.current.date === date)
    setQueueLoading(true)
    setQueueError('')
    const [dash, orders] = await Promise.allSettled([
      getJson<Dashboard>(`/dashboard?date=${date}`),
      getJson<WorkOrderListPayload>(`/work_orders?${requestQuery}`),
    ])
    if (dashboardCurrent() && dash.status === 'fulfilled') setDashboard(dash.value)
    if (!queueCurrent()) return
    setQueueLoading(false)
    if (orders.status === 'rejected') {
      const message = orders.reason instanceof ApiError && orders.reason.status === null ? 'Work orders could not load. Check your connection and retry.' : orders.reason instanceof Error ? orders.reason.message : 'Unable to load work orders'
      setQueueError(message)
      throw orders.reason
    }
    const payload = orders.value
    if (!payload || !Array.isArray(payload.work_orders) || payload.work_orders.some((row) => !row || typeof row !== 'object' || Array.isArray(row)) ||
      (payload.meta !== null && (typeof payload.meta !== 'object' || Array.isArray(payload.meta)))) {
      const error = new Error('The work-order list response could not be read. Retry work orders.')
      setQueueError(error.message)
      throw error
    }
    setWorkOrders(payload.work_orders)
    setWorkOrderMeta(payload.meta)
    if (dash.status === 'rejected' && dashboardCurrent()) setError('Work orders loaded, but dashboard totals could not refresh.')
  }

  async function fetchWorkOrders(query: string) {
    try { await refreshWorkOrderContext(query) }
    catch { /* The queue owns its recovery message; keep applied filters and editor. */ }
  }

  async function fetchPaProjects(page: number) {
    const payload = await getJson<WorkOrderListPayload>(`/work_orders?archived=active&page=${page}&per_page=${paProjectMeta?.per_page || 50}&sort=scheduled_date&direction=asc&pa_project=true`)
    setPaProjectWorkOrders(payload.work_orders)
    setPaProjectMeta(payload.meta)
  }

  async function createWorkOrder(values: WorkOrderInput): Promise<WorkOrder> {
    if (!canEditDispatch) {
      throw new Error('Viewer access cannot add work orders.')
    }

    const queueQuery = currentRoute.section === 'work-orders' ? currentRoute.search.replace(/^\?/, '') || DEFAULT_WORK_ORDER_QUERY : DEFAULT_WORK_ORDER_QUERY
    setWorkOrderSaving(true)
    setError('')
    try {
      const created = await postJson<WorkOrder>('/work_orders', values)
      try {
        await Promise.all([afterAuditedChange(), refreshWorkOrderContext(queueQuery)])
      } catch (refreshError) {
        setError(refreshError instanceof Error ? `Work order saved, but the dashboard did not refresh: ${refreshError.message}` : 'Work order saved, but the dashboard did not refresh.')
      }
      return created
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create work order')
      throw err
    } finally {
      setWorkOrderSaving(false)
    }
  }

  async function updateWorkOrder(workOrderId: number, values: WorkOrderInput): Promise<WorkOrder> {
    if (!canEditDispatch) {
      throw new Error('Viewer access cannot update work orders.')
    }

    const queueQuery = currentRoute.section === 'work-orders' ? currentRoute.search.replace(/^\?/, '') || DEFAULT_WORK_ORDER_QUERY : DEFAULT_WORK_ORDER_QUERY
    setWorkOrderSaving(true)
    setError('')
    try {
      const updated = await patchJson<WorkOrder>(`/work_orders/${workOrderId}`, values)
      try {
        await Promise.all([afterAuditedChange(), refreshWorkOrderContext(queueQuery)])
      } catch (refreshError) {
        setError(refreshError instanceof Error ? `Work order updated, but the dashboard did not refresh: ${refreshError.message}` : 'Work order updated, but the dashboard did not refresh.')
      }
      return updated
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

  async function refreshPmTemplates() {
    const payload = await getJson<{ pm_templates: PmTemplate[] }>('/pm_templates')
    setPmTemplates(payload.pm_templates)
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

  async function completePmStation(pmTaskIds: number[], changes: Record<string, unknown> = {}) {
    if (!canEditDispatch) {
      setError('Viewer access cannot complete PM stations.')
      return
    }
    setPmTaskSavingId(0)
    setError('')
    try {
      const payload = await postJson<{ pm_tasks: PmTask[] }>('/pm_tasks/bulk_complete', { pm_task_ids: pmTaskIds, ...changes })
      setPmTasks((current) => current.map((pm) => payload.pm_tasks.find((updated) => updated.id === pm.id) || pm))
      await Promise.allSettled([refreshPmContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete station PMs')
    } finally {
      setPmTaskSavingId(null)
    }
  }

  async function archivePmTask(pmTaskId: number, reason?: string) {
    if (!canEditDispatch) {
      setError('Viewer access cannot void PM tasks.')
      return
    }
    setPmTaskSavingId(pmTaskId)
    setError('')
    try {
      await patchJson<PmTask>(`/pm_tasks/${pmTaskId}/archive`, { archive_reason: reason })
      setPmTasks((current) => current.filter((pm) => pm.id !== pmTaskId))
      await Promise.allSettled([refreshPmContext(), afterAuditedChange()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to void PM task')
      throw err
    } finally {
      setPmTaskSavingId(null)
    }
  }

  async function createPmTemplate(values: PmTemplateInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot create PM templates.')
      return
    }
    setError('')
    try {
      const payload = await postJson<{ pm_template: PmTemplate }>('/pm_templates', values)
      setPmTemplates((current) => [...current.filter((template) => template.id !== payload.pm_template.id), payload.pm_template].sort((a, b) => a.name.localeCompare(b.name)))
      await afterAuditedChange()
      return payload.pm_template
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create PM template')
      throw err
    }
  }

  async function updatePmTemplate(templateId: number, values: PmTemplateInput) {
    if (!canEditDispatch) {
      setError('Viewer access cannot edit PM templates.')
      return
    }
    setError('')
    try {
      const payload = await patchJson<{ pm_template: PmTemplate }>(`/pm_templates/${templateId}`, values)
      setPmTemplates((current) => [...current.filter((template) => template.id !== payload.pm_template.id), payload.pm_template].sort((a, b) => a.name.localeCompare(b.name)))
      await afterAuditedChange()
      return payload.pm_template
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to edit PM template')
      throw err
    }
  }

  async function archivePmTemplate(templateId: number) {
    if (!canEditDispatch) {
      setError('Viewer access cannot archive PM templates.')
      return
    }
    setError('')
    try {
      await patchJson<{ pm_template: PmTemplate }>(`/pm_templates/${templateId}/archive`, {})
      setPmTemplates((current) => current.filter((template) => template.id !== templateId))
      await afterAuditedChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to archive PM template')
      throw err
    }
  }

  async function previewPmTemplate(templateId: number, values: { month: string; frequencies: string[]; location_ids?: number[]; item_ids?: number[] }) {
    setError('')
    try {
      return await postJson<PmTemplateGenerationPayload>(`/pm_templates/${templateId}/preview`, values)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to preview PM template')
      throw err
    }
  }

  async function generatePmTemplate(templateId: number, values: { month: string; frequencies: string[]; location_ids?: number[]; item_ids?: number[] }) {
    if (!canEditDispatch) {
      setError('Viewer access cannot generate PM tasks.')
      return
    }
    setError('')
    try {
      const payload = await postJson<PmTemplateGenerationPayload>(`/pm_templates/${templateId}/generate`, values)
      await Promise.allSettled([refreshPmContext(), refreshPmTemplates(), afterAuditedChange()])
      return payload
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate PM tasks')
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
      await patchJson<WorkOrder>(`/work_orders/${workOrderId}/${archived ? 'archive' : 'unarchive'}`, {})
      await afterAuditedChange()
      await refreshWorkOrderContext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update work order archive state')
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
    if (schedule?.status !== 'finalized') {
      setError('Finalize the dispatch schedule before marking it sent.')
      return
    }
    await updateScheduleStatus('mark_sent', 'Unable to mark schedule sent')
  }

  async function downloadMonthlyReportCsv() {
    setError('')
    try {
      const month = selectedDate.slice(0, 7)
      const blob = await getBlob(`/reports/monthly.csv?month=${month}`)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `jmi-dispatch-report-${month}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download monthly report')
    }
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

  const currentSection = currentRoute.section === 'users' && !user?.permissions.can_admin ? 'overview' : currentRoute.section
  const sections: SectionLink[] = [
    { id: 'work-orders', label: 'Work Orders', mobileLabel: 'WOs', description: 'Requests, status and follow-up', icon: <Wrench size={18} />, count: dashboard?.counts.open_work_orders ?? workOrderMeta?.total_count ?? workOrders.filter((workOrder) => !workOrder.archived).length, group: 'operate' },
    { id: 'overview', label: 'Dashboard', mobileLabel: 'Home', description: 'Operations health', icon: <LayoutDashboard size={18} />, group: 'operate' },
    { id: 'pm-tasks', label: 'PMs', description: 'Monthly station obligations', icon: <CalendarDays size={18} />, count: pmTasks.length, group: 'operate' },
    { id: 'pa-projects', label: 'PA Projects', mobileLabel: 'PA', description: 'Parts, estimates, and follow-up', icon: <FolderKanban size={18} />, count: dashboard?.counts.pa_projects ?? paProjectMeta?.total_count ?? workOrders.filter((workOrder) => !workOrder.archived && workOrder.pa_project).length, group: 'operate' },
    { id: 'dispatch', label: "Today’s Dispatch", mobileLabel: 'Dispatch', description: 'Build, finalize, and send crews', icon: <ClipboardList size={18} />, count: schedule?.items.length, group: 'manage' },
    { id: 'teams', label: 'Crews', description: 'Drivers and call-outs', icon: <Users size={18} />, count: teams.length, group: 'manage' },
    { id: 'reports', label: 'Reports', mobileLabel: 'Rpt', description: 'Monthly KPI exports', icon: <BarChart3 size={18} />, group: 'manage' },
    { id: 'whatsapp', label: 'WhatsApp', mobileLabel: 'WA', description: 'Copy send-ready text', icon: <MessageSquareText size={18} />, group: 'manage' },
    { id: 'activity', label: 'Activity', description: 'Audit history', icon: <Activity size={18} />, group: 'manage' },
    { id: 'service-lines', label: 'Service Lines', mobileLabel: 'Lines', description: 'Contracts and divisions', icon: <Settings2 size={18} />, count: serviceLines.filter((line) => line.active).length, group: 'admin' },
    ...(user?.permissions.can_admin ? [{ id: 'users' as const, label: 'Users', description: 'Roles and access', icon: <UserCog size={18} />, count: managedUsers.length, group: 'admin' as const }] : []),
  ]

  const activeSectionMeta = sections.find((section) => section.id === currentSection) || sections[0]
  const scheduleActionLabel = working ? 'Working...' : schedule?.status && schedule.status !== 'draft' ? 'Schedule Locked' : 'Generate Draft'
  const dispatchScreen = currentSection === 'dispatch' || currentSection === 'whatsapp'
  const isAuthBlocked = isSignedIn && !user && !authLoading && !isVerifyingApi

  if (authLoading) {
    return <main className="grid min-h-screen place-items-center px-6 text-[#526071]">
      <div className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/90 p-8 text-center shadow-[0_24px_70px_rgba(23,32,51,0.12)]">
        <RefreshCw className="mx-auto mb-3 animate-spin text-[#244393]" />
        <p className="font-display font-bold">Loading JMI Management System...</p>
      </div>
    </main>
  }

  return (
    <main className="min-h-screen overflow-hidden">
      {mobileNavOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-[#07111f]/38 backdrop-blur-sm xl:hidden" onClick={() => setMobileNavOpen(false)} />}
      <div className={`mx-auto grid max-w-[94rem] gap-3 px-3 py-3 sm:px-5 xl:px-6 xl:py-5 ${desktopSidebarCollapsed ? 'xl:grid-cols-[5.25rem_minmax(0,1fr)]' : 'xl:grid-cols-[15.5rem_minmax(0,1fr)]'}`}>
        <AppSidebar
          sections={sections}
          currentSection={currentSection}
          collapsed={desktopSidebarCollapsed}
          mobileOpen={mobileNavOpen}
          userName={user?.name}
          userRole={user?.role}
          hrefForSection={pathForSection}
          onToggleCollapsed={() => setDesktopSidebarCollapsed((value) => !value)}
          onCloseMobile={() => setMobileNavOpen(false)}
          onNavigate={goToSection}
        />

        <div className="flex min-w-0 flex-col gap-3">
        <header className="app-header rounded-xl border border-slate-200 bg-white">
          <div className="flex min-h-14 items-center gap-3 px-3">
            <button type="button" onClick={() => setMobileNavOpen(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[#244393] xl:hidden" aria-label="Open navigation" aria-expanded={mobileNavOpen}><Menu size={20} /></button>
            <span className="font-display font-extrabold text-[#244393]">JMI</span>
            <h1 className="min-w-0 flex-1 text-lg font-bold text-[#172033]">{activeSectionMeta?.label || 'Dispatch'}</h1>
            {user && <UserButton />}
            {!isSignedIn && <SignInButton mode="modal"><button className="min-h-11 rounded-xl bg-[#172b63] px-3 text-sm font-bold text-white">Sign in</button></SignInButton>}
          </div>
          {user && dispatchScreen && <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-3">
            <label className="min-w-0 flex-1 text-xs font-semibold text-[#526071]">Schedule date<input type="date" value={selectedDate} onChange={(event) => handleSelectedDateChange(event.target.value)} className="field-control mt-1 block w-full rounded-xl px-3 py-2" /></label>
            <button type="button" disabled={selectedDate === todayDate} onClick={() => handleSelectedDateChange(todayDate)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold">Today</button>
            {canEditDispatch && currentSection === 'whatsapp' && <button disabled={working || Boolean(schedule && schedule.status !== 'draft')} onClick={suggestSchedule} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c53c2e] px-3 text-sm font-bold text-white disabled:opacity-60"><ClipboardList size={17} />{scheduleActionLabel}</button>}
          </div>}
        </header>

        {!user && !authError && !isVerifyingApi && <SignInRequiredPanel />}

        {isVerifyingApi && !user && <section className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/90 p-6 shadow-[0_18px_50px_rgba(23,32,51,0.08)]">
          <div className="inline-flex items-center gap-3 text-sm font-bold text-[#244393]">
            <RefreshCw size={18} className="animate-spin" /> Verifying your Clerk session with the dispatch API...
          </div>
        </section>}

        {user && loading && <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-2 text-sm font-bold text-blue-900">
          <RefreshCw size={16} className="animate-spin" /> Loading live dispatch data...
        </div>}

        {isAuthBlocked && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>{authError || 'Your access could not be verified.'}</p>
          <button type="button" onClick={() => void refreshUser()} className="mt-2 min-h-11 rounded-xl border border-amber-300 bg-white px-3 font-bold">Retry access</button>
        </div>}

        {user && !canEditDispatch && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Viewer mode: you can inspect dashboard, work orders, teams, PMs, and generated schedules, but editing controls are hidden.</div>}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>}

        {currentSection === 'overview' && <DashboardMetrics dashboard={overviewReady ? dashboard : null} workOrders={workOrders.filter((workOrder) => !workOrder.archived)} teams={teams} technicians={technicians} pmTasks={pmTasks} schedule={schedule} auditEvents={auditEvents} canEdit={canEditDispatch} working={working} loading={loading} loadError={error} onRetry={() => void loadInitialData(selectedDate).catch((err) => { setError(err.message); setLoading(false) })} onDateChange={handleSelectedDateChange} onGoToSection={goToSection} onOpenWorkOrders={(query) => navigateTo(`/work-orders?${query}`)} />}

        {currentSection === 'work-orders' && (user ? <WorkOrdersPanel loading={queueLoading} loadError={queueError} onRetry={() => void fetchWorkOrders(currentRoute.search)} onEditorStateChange={reportWorkOrderEditor} pendingLeave={Boolean(pendingWorkOrderLeave)} onKeepEditing={() => setPendingWorkOrderLeave(null)} onDiscardAndLeave={discardAndLeaveWorkOrders} leaveBlocked={workOrderLeaveBlocked} workOrders={workOrders} meta={workOrderMeta} serviceLines={serviceLines} canAdmin={Boolean(user.permissions.can_admin)} canEdit={canEditDispatch} saving={workOrderSaving} routeSearch={currentRoute.search} workOrderToEdit={workOrderToEdit} onEditConsumed={clearWorkOrderToEdit} onRouteQueryChange={updateWorkOrderRouteQuery} onFetch={fetchWorkOrders} onCreate={createWorkOrder} onUpdate={updateWorkOrder} onArchive={archiveWorkOrder} /> : <SignInRequiredPanel title="Sign in to review work orders" />)}

        {currentSection === 'pa-projects' && (user ? <PaProjectsPanel workOrders={paProjectWorkOrders} meta={paProjectMeta} canEdit={canEditDispatch} onPage={fetchPaProjects} onEdit={openWorkOrderFromPaProject} /> : <SignInRequiredPanel title="Sign in to review PA Projects" />)}

        {currentSection === 'teams' && (user ? <TeamsPanel selectedDate={selectedDate} onDateChange={handleSelectedDateChange} teams={teams} technicians={technicians} serviceLines={serviceLines} schedule={schedule} canEdit={canEditDispatch} savingTechnicianId={availabilitySavingId} savingTeamId={teamSavingId} onToggleAvailability={toggleAvailability} onUpdateDailyCrew={updateDailyCrew} onUpdateDefaultCrew={updateDefaultCrew} onCreateTeam={createTeam} onArchiveTeam={archiveTeam} onCreateTechnician={createTechnician} onUpdateTechnician={updateTechnician} onArchiveTechnician={archiveTechnician} /> : <SignInRequiredPanel title="Sign in to check crews" />)}

        {currentSection === 'dispatch' && (user ? <DispatchBuilder schedule={schedule} teams={teams} technicians={technicians} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} onOutcome={updateDispatchItemOutcome} onWorkOrderStatus={updateWorkOrderStatus} onFinalize={finalizeSchedule} onReopen={reopenSchedule} /> : <SignInRequiredPanel title="Sign in to build today's dispatch" />)}

        {currentSection === 'pm-tasks' && (user ? <PmTasksPanel key={selectedDate} pmTasks={pmTasks} pmTemplates={pmTemplates} serviceLines={serviceLines} canEdit={canEditDispatch} savingPmTaskId={pmTaskSavingId} selectedDate={selectedDate} onUpdate={updatePmTask} onCreate={createPmTask} onBulkCreate={bulkCreatePmTasks} onCompleteStation={completePmStation} onArchive={archivePmTask} onCreateTemplate={createPmTemplate} onUpdateTemplate={updatePmTemplate} onArchiveTemplate={archivePmTemplate} onPreviewTemplate={previewPmTemplate} onGenerateTemplate={generatePmTemplate} onMonthChange={(month) => handleSelectedDateChange(dateFromMonth(month, selectedDate))} /> : <SignInRequiredPanel title="Sign in to review PM tasks" />)}

        {currentSection === 'service-lines' && (user ? <ServiceLinesPanel serviceLines={serviceLines} canAdmin={Boolean(user.permissions.can_admin)} saving={serviceLineSaving} onCreate={createServiceLine} onUpdate={updateServiceLine} /> : <SignInRequiredPanel title="Sign in to review service lines" />)}

        {currentSection === 'reports' && (user ? <ReportsPanel month={selectedDate.slice(0, 7)} onMonthChange={(month) => handleSelectedDateChange(dateFromMonth(month, selectedDate))} report={monthlyReport} loading={reportLoading} onDownloadCsv={downloadMonthlyReportCsv} /> : <SignInRequiredPanel title="Sign in to review monthly reports" />)}

        {currentSection === 'whatsapp' && (user ? <WhatsAppExport schedule={schedule} message={whatsApp} crews={whatsAppCrews} copied={copied} working={working} canEdit={canEditDispatch} onCopy={copyWhatsApp} onMarkSent={markScheduleSent} /> : <SignInRequiredPanel title="Sign in to copy WhatsApp output" />)}

        {currentSection === 'activity' && (user ? <ActivityPanel events={auditEvents} /> : <SignInRequiredPanel title="Sign in to review activity" />)}

        {currentSection === 'users' && user?.permissions.can_admin && <UserManagementPanel deliveryNotice={invitationNotice} users={managedUsers} currentUserId={user.id} savingUserId={savingUserId} onCreate={createManagedUser} onUpdate={updateManagedUser} onResendInvitation={resendManagedUserInvitation} onDelete={deleteManagedUser} />}
        </div>
      </div>
    </main>
  )
}

function SignInRequiredPanel({ title = 'Sign in to load live dispatch data' }: { title?: string }) {
  return <section className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/90 p-4 shadow-[0_18px_50px_rgba(23,32,51,0.08)] sm:p-6">
    <div className="max-w-2xl">
      <p className="font-display text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[#244393]">Secure JMI workspace</p>
      <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight text-[#172033] sm:text-2xl">{title}</h2>
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
