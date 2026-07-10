export type ActiveSection = 'overview' | 'work-orders' | 'pm-tasks' | 'pa-projects' | 'dispatch' | 'teams' | 'reports' | 'whatsapp' | 'activity' | 'service-lines' | 'users'
export type AppRoute = { section: ActiveSection; path: string; search: string; date?: string; month?: string; workOrderId?: number }
type LocationLike = Pick<Location, 'pathname' | 'search' | 'hash'>

const SECTION_IDS: ActiveSection[] = ['overview', 'work-orders', 'pm-tasks', 'pa-projects', 'dispatch', 'teams', 'reports', 'whatsapp', 'activity', 'service-lines', 'users']

export const ROUTE_PATHS: Record<ActiveSection, string> = {
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

export function routeFromLegacyHash(hash: string): ActiveSection | null {
  const value = hash.replace('#', '')
  return SECTION_IDS.includes(value as ActiveSection) ? value as ActiveSection : null
}

export function routeForLocation(location: LocationLike = window.location): AppRoute {
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

export function dateFromMonth(month: string, fallbackDay: string) {
  const day = Number(fallbackDay.slice(8, 10) || '1')
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return `${month}-${String(Math.min(day || 1, lastDay)).padStart(2, '0')}`
}
