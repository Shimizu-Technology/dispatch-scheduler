import { useCallback, useEffect, useRef, useState } from 'react'
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
import { WorkOrdersPanel } from './components/WorkOrdersPanel'
import { useAuthContext } from './contexts/useAuthContext'
import { deleteJson, getBlob, getJson, patchJson, postJson } from './lib/api'
import type { AuditEvent, Dashboard, DispatchOutcomeStatus, DispatchSchedule, ManagedUser, MonthlyReport, PaginationMeta, PmTask, PmTaskBulkCreatePayload, PmTaskInput, PmTemplate, PmTemplateGenerationPayload, PmTemplateInput, ServiceLine, ServiceLineInput, Team, TeamInput, Technician, TechnicianInput, WhatsAppCrewExport, WhatsAppExportPayload, WorkOrder, WorkOrderInput, WorkOrderListPayload, WorkOrderStatus } from './types'
import './index.css'

type ActiveSection = 'overview' | 'work-orders' | 'pm-tasks' | 'pa-projects' | 'dispatch' | 'teams' | 'reports' | 'whatsapp' | 'activity' | 'service-lines' | 'users'
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
const DEFAULT_WORK_ORDER_QUERY = 'archived=active&page=1&per_page=50&sort=scheduled_date&direction=asc'
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

function routeForLocation(location: Location = window.location): AppRoute {
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

  if (path === '/' || path === '/dashboard') return { section: 'overview', path, search }
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
  return `${month}-${fallbackDay.slice(8, 10) || '01'}`
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
    <div className="pointer-events-none fixed z-[120] hidden -translate-y-1/2 items-center lg:flex" style={{ top: position.top, left: position.left }}>
      <span className="h-3 w-3 translate-x-[7px] rotate-45 rounded-[3px] bg-[#111827] shadow-lg" />
      <span className="whitespace-nowrap rounded-xl bg-[#111827] px-3.5 py-2 text-xs font-semibold text-white shadow-2xl">{label}</span>
    </div>,
    document.body
  )
}

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return <div className={`flex items-center rounded-2xl transition-colors ${collapsed ? 'gap-3 px-3 py-2 lg:justify-center lg:p-1.5' : 'gap-3 px-3 py-2'}`}>
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#244393]/12">
      <span className="absolute left-2.5 h-8 w-1.5 -skew-x-[28deg] bg-[#244393]" />
      <span className="absolute left-5 h-8 w-1.5 -skew-x-[28deg] bg-[#d84332]" />
      <span className="absolute left-[1.875rem] h-8 w-1.5 -skew-x-[28deg] bg-[#244393]" />
    </span>
    <span className={collapsed ? 'min-w-0 lg:sr-only' : 'min-w-0'}>
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
      className={`group relative flex min-h-11 items-center rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#244393]/30 ${collapsed ? 'gap-3 px-3 py-2.5 lg:justify-center lg:gap-0 lg:px-2' : 'gap-3 px-3 py-2.5'} ${active ? 'bg-[#172b63] text-white shadow-[0_12px_26px_-18px_rgba(23,43,99,0.9)] ring-1 ring-[#172b63]/15' : 'text-[#526071] hover:bg-[#eef3ff] hover:text-[#172033]'}`}
    >
      <span className={`inline-flex shrink-0 rounded-xl p-2 ${active ? 'bg-white/12 text-white' : 'bg-[#eef3ff] text-[#244393] group-hover:bg-white'}`}>{section.icon}</span>
      <span className={collapsed ? 'min-w-0 flex-1 lg:sr-only' : 'min-w-0 flex-1'}>
        <span className="block truncate font-display text-sm font-extrabold">{section.label}</span>
        <span className={`block truncate text-xs font-semibold ${active ? 'text-blue-100/78' : 'text-[#7b8798]'}`}>{section.description}</span>
      </span>
      {typeof section.count === 'number' && <span className={`${collapsed ? 'ml-auto min-w-7 px-2 text-xs lg:absolute lg:right-1 lg:top-1 lg:min-w-5 lg:px-1 lg:text-[0.62rem]' : 'ml-auto min-w-7 px-2 text-xs'} tabular inline-flex justify-center rounded-full py-0.5 font-extrabold ${active ? 'bg-white/14 text-white' : 'bg-[#eef2ff] text-[#244393]'}`}>{section.count}</span>}
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

  return <aside className={`fixed inset-y-0 left-0 z-50 flex w-[18rem] flex-col border-r border-[rgba(23,32,51,0.1)] bg-white/98 shadow-2xl shadow-slate-900/18 transition-all duration-200 lg:sticky lg:top-5 lg:z-auto lg:h-[calc(100vh-2.5rem)] lg:translate-x-0 lg:rounded-[1.15rem] lg:border lg:shadow-[0_14px_36px_rgba(23,32,51,0.08)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[5.25rem]' : 'lg:w-[15.5rem]'}`}>
    <nav className="flex h-full flex-col" aria-label="JMI management navigation">
      <div className={`border-b border-[rgba(23,32,51,0.09)] ${collapsed ? 'px-3 pb-3 pt-4' : 'px-3 pb-4 pt-4'}`}>
        <div className="flex items-center justify-between gap-2">
          <a href="/dashboard" onClick={(event) => { event.preventDefault(); onNavigate('overview') }} className="min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#244393]/30">
            <SidebarLogo collapsed={collapsed} />
          </a>
          <button type="button" onClick={onCloseMobile} className="rounded-xl p-2 text-[#64748b] transition hover:bg-slate-100 lg:hidden" aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button
          ref={collapseButtonRef}
          type="button"
          onClick={() => { setCollapseTooltipVisible(false); onToggleCollapsed() }}
          onMouseEnter={() => collapsed && setCollapseTooltipVisible(true)}
          onMouseLeave={() => setCollapseTooltipVisible(false)}
          onFocus={() => collapsed && setCollapseTooltipVisible(true)}
          onBlur={() => setCollapseTooltipVisible(false)}
          className={`mt-3 hidden min-h-10 w-full items-center rounded-xl border border-[rgba(23,32,51,0.1)] bg-[#f8faff] px-3 py-2 text-xs font-extrabold text-[#526071] transition hover:border-[#244393]/18 hover:bg-[#eef3ff] hover:text-[#244393] lg:flex ${collapsed ? 'justify-center' : 'justify-between'}`}
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
          <div className={collapsed ? (groupIndex === 0 ? 'mb-1.5 px-3 font-display text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#94a0b5] lg:sr-only' : 'mb-1.5 px-3 font-display text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#94a0b5] lg:mx-3 lg:my-2 lg:border-t lg:border-[rgba(23,32,51,0.1)] lg:px-0 lg:text-transparent') : 'mb-1.5 px-3 font-display text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#94a0b5]'}>{group.label}</div>
          <div className="space-y-1">
            {group.items.map((section) => <SidebarNavLink key={section.id} section={section} href={hrefForSection(section.id)} active={currentSection === section.id} collapsed={collapsed} onNavigate={(target) => { onNavigate(target); onCloseMobile() }} />)}
          </div>
        </div>)}
      </div>

      <div className={`border-t border-[rgba(23,32,51,0.09)] p-3 ${collapsed ? 'text-center' : ''}`}>
        <div className={`flex items-center rounded-2xl border border-[rgba(23,32,51,0.1)] bg-[#f8faff] ${collapsed ? 'gap-3 px-3 py-2.5 lg:justify-center lg:gap-0 lg:px-2 lg:py-2' : 'gap-3 px-3 py-2.5'}`}>
          <UserButton />
          <div className={collapsed ? 'min-w-0 flex-1 lg:sr-only' : 'min-w-0 flex-1'}>
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
    const [dash, orders, teamData, technicianData, pms, templates, lines, schedulePayload] = await Promise.all([
      getJson<Dashboard>(`/dashboard?date=${date}`),
      getJson<WorkOrderListPayload>(`/work_orders?${DEFAULT_WORK_ORDER_QUERY}`),
      getJson<Team[]>(`/teams?date=${date}`),
      getJson<Technician[]>(`/technicians?date=${date}&include_inactive=true`),
      getJson<PmTask[]>(`/pm_tasks?month=${date.slice(0, 7)}`),
      getJson<{ pm_templates: PmTemplate[] }>('/pm_templates'),
      getJson<{ service_lines: ServiceLine[] }>('/service_lines?include_inactive=true'),
      getJson<{ schedule: DispatchSchedule | null }>(`/dispatch_schedules?date=${date}`),
    ])
    setDashboard(dash)
    setWorkOrders(orders.work_orders)
    setWorkOrderMeta(orders.meta)
    setTeams(teamData)
    setTechnicians(technicianData)
    setPmTasks(pms)
    setPmTemplates(templates.pm_templates)
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

    void getJson<WorkOrder>(`/work_orders/${currentRoute.workOrderId}`)
      .then(setWorkOrderToEdit)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load work order'))
  }, [currentRoute.section, currentRoute.workOrderId, user?.id])

  useEffect(() => {
    if (currentRoute.section === 'work-orders' && !currentRoute.workOrderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkOrderToEdit(null)
    }
  }, [currentRoute.section, currentRoute.workOrderId])

  useEffect(() => {
    const handleRouteChange = () => setCurrentRoute(routeForLocation())
    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener('hashchange', handleRouteChange)
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
      window.removeEventListener('hashchange', handleRouteChange)
    }
  }, [])

  useEffect(() => {
    if (window.location.hash && routeFromLegacyHash(window.location.hash)) {
      navigateTo(ROUTE_PATHS[routeFromLegacyHash(window.location.hash) || 'overview'], { replace: true })
    }
  }, [])

  useEffect(() => {
    const routeDate = currentRoute.date || (currentRoute.month ? dateFromMonth(currentRoute.month, selectedDate) : null)
    if (routeDate && routeDate !== selectedDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDate(routeDate)
    }
  }, [currentRoute.date, currentRoute.month, selectedDate])

  function navigateTo(url: string, options: { replace?: boolean } = {}) {
    if (options.replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    setCurrentRoute(routeForLocation())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
    { id: 'overview', label: 'Dashboard', mobileLabel: 'Home', description: 'Operations health', icon: <LayoutDashboard size={18} />, group: 'operate' },
    { id: 'work-orders', label: 'Work Orders', mobileLabel: 'WOs', description: 'Open, closed, blocked, and KPI work', icon: <Wrench size={18} />, count: dashboard?.counts.open_work_orders ?? workOrderMeta?.total_count ?? workOrders.filter((workOrder) => !workOrder.archived).length, group: 'operate' },
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
  const needsTokenClaims = authError?.toLowerCase().includes('missing clerk email')
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
      {mobileNavOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-[#07111f]/38 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      <div className={`mx-auto grid max-w-[94rem] gap-3 px-3 py-3 sm:px-5 lg:px-6 lg:py-5 ${desktopSidebarCollapsed ? 'lg:grid-cols-[5.25rem_minmax(0,1fr)]' : 'lg:grid-cols-[15.5rem_minmax(0,1fr)]'}`}>
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
        <header className="soft-reveal overflow-hidden rounded-[1.05rem] border border-[#1d336c]/12 bg-white/96 shadow-[0_12px_34px_rgba(23,32,51,0.08)] backdrop-blur sm:rounded-[1.2rem]">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
            <div className="relative border-b border-[rgba(23,32,51,0.1)] bg-[#172b63] px-3 py-3 text-white sm:px-4 xl:border-b-0 xl:border-r xl:border-white/10 xl:px-5">
              <div className="absolute inset-y-0 left-0 w-1 bg-[#d84332]" />
              <div className="flex flex-col justify-between gap-2 pl-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => setMobileNavOpen(true)} className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)] backdrop-blur transition hover:bg-white/16 lg:hidden" aria-label="Open navigation" aria-expanded={mobileNavOpen}>
                    <Menu size={17} /> Menu
                  </button>
                  {schedule && <span className={`inline-flex items-center rounded-full border px-3 py-1.5 font-display text-[0.66rem] font-extrabold uppercase tracking-[0.14em] ${schedule.status === 'sent' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : schedule.status === 'finalized' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-white/15 bg-white/10 text-blue-50'}`}>{schedule.status}</span>}
                </div>
                <div>
                  <p className="font-display text-[0.68rem] font-extrabold uppercase tracking-[0.28em] text-blue-100/80">Operations management board</p>
                  <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                    <h1 className="font-display text-xl font-black tracking-[-0.03em] sm:text-2xl md:text-3xl">{activeSectionMeta?.label || 'Daily Dispatch'}</h1>
                    <p className="pb-1 text-xs font-semibold leading-5 text-blue-50/72 sm:text-sm">{activeSectionMeta?.description || 'Daily dispatch command center'}</p>
                  </div>
                  <p className="mt-2 font-display text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-blue-100/60">JMI / {activeSectionMeta?.label || 'Dashboard'}{currentRoute.month ? ` / ${currentRoute.month}` : currentRoute.date ? ` / ${currentRoute.date}` : ''}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 bg-white px-3 py-3 sm:grid-cols-2 sm:gap-3 sm:px-4 xl:grid-cols-1 xl:px-4">
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

              {user && <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:col-span-2 xl:col-span-1">
                <label className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-[#f8faff] px-3 py-2">
                  <span className="font-display block text-[0.64rem] font-extrabold uppercase tracking-[0.16em] text-[#64748b]">Schedule date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => handleSelectedDateChange(event.target.value)}
                    className="tabular mt-1 w-full rounded-xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2 font-display text-sm font-extrabold text-[#172033] outline-none transition focus:border-[#244393] focus:ring-4 focus:ring-[#244393]/12"
                  />
                </label>
                <button
                  type="button"
                  disabled={selectedDate === todayDate}
                  onClick={() => handleSelectedDateChange(todayDate)}
                  className="min-h-11 rounded-2xl border border-[rgba(36,67,147,0.18)] bg-white px-4 py-2 font-display text-xs font-extrabold uppercase tracking-[0.14em] text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Today
                </button>
              </div>}

              <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap sm:items-center lg:col-span-1">
                {canEditDispatch && currentSection !== 'overview' && <button disabled={working || Boolean(schedule && schedule.status !== 'draft')} onClick={suggestSchedule} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d84332] px-4 py-2.5 font-display text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(216,67,50,0.18)] transition hover:-translate-y-0.5 hover:bg-[#bf3228] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:flex-none">
                  <ClipboardList size={17} /> {scheduleActionLabel}
                </button>}
                {user && <div className="inline-flex w-full items-center gap-3 rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white px-3 py-2 text-sm text-[#526071] shadow-sm sm:w-auto sm:flex-none lg:hidden">
                  <UserButton />
                  <span className="leading-tight">
                    <span className="font-display block font-extrabold text-[#172033]">{user.name}</span>
                    <span className="text-xs capitalize text-[#64748b]">{user.role}</span>
                  </span>
                </div>}
                {!isSignedIn && <SignInButton mode="modal">
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#172b63] px-5 py-3 font-display text-sm font-extrabold text-white shadow-[0_16px_34px_rgba(23,43,99,0.2)] transition hover:-translate-y-0.5 hover:bg-[#244393] sm:w-auto sm:flex-none">
                    <LockKeyhole size={18} /> Sign In
                  </button>
                </SignInButton>}
              </div>
            </div>
          </div>
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

        {isAuthBlocked && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
          {needsTokenClaims
            ? 'Your Clerk sign-in worked, but the API needs access to your email. Add CLERK_SECRET_KEY to api/.env, or configure Clerk token email claims.'
            : `Your Clerk sign-in worked, but the dispatch API could not confirm your role yet: ${authError || 'Unable to verify access'}`}
        </div>}

        {user && !canEditDispatch && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Viewer mode: you can inspect dashboard, work orders, teams, PMs, and generated schedules, but editing controls are hidden.</div>}

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div>}

        {currentSection === 'overview' && <DashboardMetrics dashboard={dashboard} workOrders={workOrders.filter((workOrder) => !workOrder.archived)} teams={teams} technicians={technicians} pmTasks={pmTasks} schedule={schedule} auditEvents={auditEvents} canEdit={canEditDispatch} working={working} onGoToSection={goToSection} onSuggest={suggestSchedule} />}

        {currentSection === 'work-orders' && (user ? <WorkOrdersPanel workOrders={workOrders} meta={workOrderMeta} serviceLines={serviceLines} canEdit={canEditDispatch} saving={workOrderSaving} routeSearch={currentRoute.search} workOrderToEdit={workOrderToEdit} onEditConsumed={clearWorkOrderToEdit} onRouteQueryChange={updateWorkOrderRouteQuery} onFetch={fetchWorkOrders} onCreate={createWorkOrder} onUpdate={updateWorkOrder} onArchive={archiveWorkOrder} /> : <SignInRequiredPanel title="Sign in to review work orders" />)}

        {currentSection === 'pa-projects' && (user ? <PaProjectsPanel workOrders={paProjectWorkOrders} meta={paProjectMeta} canEdit={canEditDispatch} onPage={fetchPaProjects} onEdit={openWorkOrderFromPaProject} /> : <SignInRequiredPanel title="Sign in to review PA Projects" />)}

        {currentSection === 'teams' && (user ? <TeamsPanel teams={teams} technicians={technicians} serviceLines={serviceLines} schedule={schedule} canEdit={canEditDispatch} savingTechnicianId={availabilitySavingId} savingTeamId={teamSavingId} onToggleAvailability={toggleAvailability} onUpdateDailyCrew={updateDailyCrew} onUpdateDefaultCrew={updateDefaultCrew} onCreateTeam={createTeam} onArchiveTeam={archiveTeam} onCreateTechnician={createTechnician} onUpdateTechnician={updateTechnician} onArchiveTechnician={archiveTechnician} /> : <SignInRequiredPanel title="Sign in to check crews" />)}

        {currentSection === 'dispatch' && (user ? <DispatchBuilder schedule={schedule} teams={teams} technicians={technicians} working={working} canEdit={canEditDispatch} onSuggest={suggestSchedule} onUpdate={updateDispatchItem} onOutcome={updateDispatchItemOutcome} onWorkOrderStatus={updateWorkOrderStatus} onFinalize={finalizeSchedule} onReopen={reopenSchedule} /> : <SignInRequiredPanel title="Sign in to build today's dispatch" />)}

        {currentSection === 'pm-tasks' && (user ? <PmTasksPanel key={selectedDate} pmTasks={pmTasks} pmTemplates={pmTemplates} serviceLines={serviceLines} canEdit={canEditDispatch} savingPmTaskId={pmTaskSavingId} selectedDate={selectedDate} onUpdate={updatePmTask} onCreate={createPmTask} onBulkCreate={bulkCreatePmTasks} onCompleteStation={completePmStation} onCreateTemplate={createPmTemplate} onPreviewTemplate={previewPmTemplate} onGenerateTemplate={generatePmTemplate} /> : <SignInRequiredPanel title="Sign in to review PM tasks" />)}

        {currentSection === 'service-lines' && (user ? <ServiceLinesPanel serviceLines={serviceLines} canAdmin={Boolean(user.permissions.can_admin)} saving={serviceLineSaving} onCreate={createServiceLine} onUpdate={updateServiceLine} /> : <SignInRequiredPanel title="Sign in to review service lines" />)}

        {currentSection === 'reports' && (user ? <ReportsPanel report={monthlyReport} loading={reportLoading} onDownloadCsv={downloadMonthlyReportCsv} /> : <SignInRequiredPanel title="Sign in to review monthly reports" />)}

        {currentSection === 'whatsapp' && (user ? <WhatsAppExport schedule={schedule} message={whatsApp} crews={whatsAppCrews} copied={copied} working={working} canEdit={canEditDispatch} onCopy={copyWhatsApp} onMarkSent={markScheduleSent} /> : <SignInRequiredPanel title="Sign in to copy WhatsApp output" />)}

        {currentSection === 'activity' && (user ? <ActivityPanel events={auditEvents} /> : <SignInRequiredPanel title="Sign in to review activity" />)}

        {currentSection === 'users' && user?.permissions.can_admin && <UserManagementPanel users={managedUsers} currentUserId={user.id} savingUserId={savingUserId} onCreate={createManagedUser} onUpdate={updateManagedUser} onResendInvitation={resendManagedUserInvitation} onDelete={deleteManagedUser} />}
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
