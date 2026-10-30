// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import App from './App'
import type { WorkOrder } from './types'

const auth = vi.hoisted(() => ({ signedIn: true, loading: false, verifying: false, error: null as string | null }))
const api = vi.hoisted(() => ({ getJson: vi.fn(), postJson: vi.fn(), patchJson: vi.fn() }))
vi.mock('./contexts/useAuthContext', () => ({ useAuthContext: () => ({
  user: auth.signedIn && !auth.verifying && !auth.error ? { id: 1, name: 'Synthetic dispatcher', role: 'dispatcher', permissions: { can_admin: false } } : null,
  isSignedIn: auth.signedIn, isLoading: auth.loading, isVerifyingApi: auth.verifying, authError: auth.error, canEditDispatch: true, refreshUser: vi.fn(),
}) }))
vi.mock('@clerk/react', () => ({ UserButton: () => <span>Account</span>, SignInButton: ({ children, forceRedirectUrl }: { children: ReactNode; forceRedirectUrl: string }) => <span data-return-url={forceRedirectUrl}>{children}</span> }))
vi.mock('./lib/api', async (original) => ({ ...await original<typeof import('./lib/api')>(), ...api }))

const order = {
  id: 1, lock_version: 0, external_id: 'SYNTHETIC-1', client: 'Synthetic Facilities', location: 'Synthetic Site',
  region: 'North', description: 'Synthetic repair', title: 'Synthetic repair', priority: 'P3', normalized_priority: 'P3',
  status: 'new', trade_category: 'General', source: 'whatsapp', reported_at: '2026-10-10T08:00:00Z', sla_status: 'missing', required_technician_count: 1,
} as WorkOrder
const queueCalls = () => api.getJson.mock.calls.map(([path]) => String(path)).filter((path) => path.startsWith('/work_orders?'))
const lastQuery = () => new URLSearchParams(queueCalls().at(-1)?.split('?')[1])

function response(path: string) {
  if (path.startsWith('/dashboard')) return { date: new URLSearchParams(path.split('?')[1]).get('date'), counts: {} }
  if (path.startsWith('/reports/monthly?')) return { month: new URLSearchParams(path.split('?')[1]).get('month'), generated_at: '2026-10-30T00:00:00Z', work_orders: { total: 3, by_status: {}, by_priority: {}, by_service_line: {} }, pm_tasks: { by_trade_actual_minutes: {} }, follow_ups: {} }
  if (path.startsWith('/dispatch_schedules?')) return { schedule: null }
  if (path === '/work_orders/1') return order
  if (path.startsWith('/work_orders?')) {
    const page = Number(new URLSearchParams(path.split('?')[1]).get('page') || 1)
    return { work_orders: [{ ...order, external_id: `SYNTHETIC-${page}` }], meta: { page, per_page: 10, total_count: 30, total_pages: 3 } }
  }
  if (path.startsWith('/service_lines')) return { service_lines: [] }
  if (path === '/pm_templates') return { pm_templates: [] }
  if (path.startsWith('/audit_events')) return { audit_events: [] }
  return []
}
function go(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
beforeEach(() => {
  auth.signedIn = true
  auth.loading = false
  auth.verifying = false
  auth.error = null
  window.localStorage.clear()
  window.history.replaceState(null, '', '/work-orders')
  vi.stubGlobal('scrollTo', vi.fn())
  api.getJson.mockReset().mockImplementation(async (path: string) => response(path))
  api.postJson.mockReset().mockResolvedValue(order)
  api.patchJson.mockReset().mockResolvedValue({ ...order, lock_version: 1 })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('intake route and saved queue context', () => {
  it('lands on the newest-first work-order queue; dashboard stays available', async () => {
    window.history.replaceState(null, '', '/')
    render(<App />)
    await screen.findByText('WO #SYNTHETIC-1')
    expect(lastQuery().get('sort')).toBe('created_at')
    expect(lastQuery().get('direction')).toBe('desc')
    act(() => go('/dashboard'))
    expect(screen.getByText('Queue health')).toBeTruthy()
  })

  it('shows a clear signed-out dashboard without an endless operations loader', () => {
    auth.signedIn = false
    window.history.replaceState(null, '', '/dashboard')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'JMI Dispatch' })).toBeTruthy()
    expect(screen.queryByText('Loading operations overview...')).toBeNull()
    expect(screen.queryByText('Queue health')).toBeNull()
    expect(api.getJson).not.toHaveBeenCalled()
  })

  it.each(['/work-orders?q=PUMP', '/dispatch/2026-11-04', '/pm/month/2026-11', '/admin/users'])('has exactly one sign-in action and preserves %s', (path) => {
    auth.signedIn = false
    window.history.replaceState(null, '', path)
    render(<App />)
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Sign in' }).parentElement?.dataset.returnUrl).toBe(window.location.href)
    expect(window.location.pathname + window.location.search).toBe(path)
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByText('User', { exact: true })).toBeNull()
    expect(screen.queryByText('viewer', { exact: true })).toBeNull()
    expect(screen.queryByText(/Clerk/)).toBeNull()
    expect(api.getJson).not.toHaveBeenCalled()
  })

  it.each(['loading', 'verifying', 'inactive', 'uninvited', 'offline'])('keeps %s access distinct from signed-out', (state) => {
    auth.loading = state === 'loading'
    auth.verifying = state === 'verifying'
    auth.error = ({ inactive: 'Your account is inactive.', uninvited: 'Your account has not been invited.', offline: 'The dispatch service could not be reached. Check your connection and retry.' } as Record<string, string>)[state] || null
    render(<App />)
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    if (auth.error) {
      expect(screen.getByRole('alert').textContent).toBe(auth.error)
      expect(screen.getByRole('button', { name: 'Retry access' })).toBeTruthy()
      expect(screen.getByText('Check or switch your account')).toBeTruthy()
    } else expect(screen.getByRole('status').textContent).toMatch(/Loading sign-in|Checking your access/)
  })

  it('ignores old stored dates and keeps date choices only during this visit', async () => {
    window.localStorage.setItem('dispatch-scheduler:selected-date', '2026-10-10')
    window.history.replaceState(null, '', '/dispatch/today')
    const view = render(<App />)
    const now = new Date()
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
    expect(screen.getByLabelText('Schedule date')).toHaveProperty('value', today)
    fireEvent.change(screen.getByLabelText('Schedule date'), { target: { value: '2026-10-09' } })
    act(() => go('/dashboard'))
    expect(screen.getByLabelText('As of date')).toHaveProperty('value', '2026-10-09')
    view.unmount()
    window.history.replaceState(null, '', '/dispatch/today')
    render(<App />)
    expect(screen.getByLabelText('Schedule date')).toHaveProperty('value', today)
  })

  it('resets the default on a new day but respects explicit dated links', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 9, 30, 23, 59))
      window.history.replaceState(null, '', '/dispatch/today')
      render(<App />)
      expect(screen.getByLabelText('Schedule date')).toHaveProperty('value', '2026-10-30')
      vi.setSystemTime(new Date(2026, 9, 31, 0, 1))
      act(() => window.dispatchEvent(new Event('focus')))
      expect(screen.getByLabelText('Schedule date')).toHaveProperty('value', '2026-10-31')
      act(() => go('/dispatch/2026-10-15'))
      vi.setSystemTime(new Date(2026, 10, 1, 0, 1))
      act(() => window.dispatchEvent(new Event('focus')))
      expect(screen.getByLabelText('Schedule date')).toHaveProperty('value', '2026-10-15')
    } finally { vi.useRealTimers() }
  })

  it('hides the closed phone drawer while keeping the desktop sidebar visible', async () => {
    render(<App />)
    await screen.findByText('WO #SYNTHETIC-1')
    const sidebar = document.querySelector('.app-sidebar')!
    expect(sidebar.className).toContain('invisible xl:visible')
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(sidebar.className).not.toContain('invisible')
    expect(sidebar.className).toContain('translate-x-0 visible')
    fireEvent.click(screen.getAllByRole('button', { name: 'Close navigation' }).at(-1)!)
    expect(sidebar.className).toContain('invisible xl:visible')
  })

  it('keeps the page title and a separate compact brand mark in the phone header', async () => {
    render(<App />)
    await screen.findByText('WO #SYNTHETIC-1')
    const header = document.querySelector('.app-header')!
    expect(header.querySelector('h1')?.textContent).toBe('Work Orders')
    const wordmark = Array.from(header.querySelectorAll('span')).find((span) => span.textContent === 'JMI')!
    expect(wordmark.className).toContain('hidden')
    expect(wordmark.className).toContain('xl:inline')
    expect(header.querySelector('[role="img"][aria-label="JMI logo"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open navigation' }).className).toContain('min-h-11')
    act(() => go('/dispatch/2026-10-30'))
    const date = screen.getByLabelText('Schedule date')
    expect(date.parentElement?.parentElement?.className).toContain('grid-cols-[minmax(0,1fr)_auto]')
    expect(date.className).toContain('w-full')
  })

  it('keeps secondary PM actions available in a compact disclosure', async () => {
    window.history.replaceState(null, '', '/pm/month/2026-10')
    render(<App />)
    const primary = await screen.findByRole('button', { name: 'Generate Month' })
    expect(primary.closest('details')).toBeNull()
    const more = screen.getByText('More actions').closest('details')!
    expect(more.open).toBe(false)
    for (const name of ['Template Setup', 'Paste Exceptions', 'New PM']) {
      expect(screen.getByRole('button', { name }).closest('details')).toBe(more)
    }
    expect(screen.getByLabelText('PM month').getAttribute('type')).toBe('month')
    fireEvent.click(screen.getByRole('button', { name: 'New PM' }))
    expect(screen.getByLabelText('Due date')).toBeTruthy()
  })

  it('uses URL filters, sort and page on its first request and keeps them after create and edit', async () => {
    window.history.replaceState(null, '', '/work-orders?q=leak&status=new&page=2&per_page=10&sort=priority&direction=asc')
    render(<App />)
    await screen.findByText('WO #SYNTHETIC-2')
    expect(queueCalls()).toHaveLength(1)
    const original = Object.fromEntries(lastQuery())
    expect(original).toMatchObject({ q: 'leak', status: 'new', page: '2', sort: 'priority', direction: 'asc' })
    fireEvent.click(screen.getByRole('button', { name: 'New Work Order' }))
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Synthetic second site' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Synthetic second request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.postJson).toHaveBeenCalledTimes(1)
    expect(Object.fromEntries(lastQuery())).toEqual(original)
    expect(window.location.search).toContain('page=2')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Synthetic updated request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.patchJson).toHaveBeenCalledTimes(1)
    expect(api.patchJson.mock.calls[0][1].expected_lock_version).toBe(0)
    expect(Object.fromEntries(lastQuery())).toEqual(original)
  })

  it('uses the applied query for pagination and browser Back and Forward', async () => {
    window.history.replaceState(null, '', '/work-orders?q=leak&status=new&per_page=10')
    render(<App />)
    await screen.findByText('WO #SYNTHETIC-1')
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await screen.findByText('WO #SYNTHETIC-2')
    expect(lastQuery().get('q')).toBe('leak')
    expect(lastQuery().get('status')).toBe('new')
    act(() => window.history.back())
    await screen.findByText('WO #SYNTHETIC-1')
    expect(lastQuery().get('page')).toBe('1')
    act(() => window.history.forward())
    await screen.findByText('WO #SYNTHETIC-2')
    expect(lastQuery().get('page')).toBe('2')
  })

  it('ignores a late old query response and bootstrap completion', async () => {
    let resolveOld!: (value: unknown) => void
    const old = new Promise((resolve) => { resolveOld = resolve })
    api.getJson.mockImplementation((path: string) => path.startsWith('/work_orders?') && new URLSearchParams(path.split('?')[1]).get('q') === 'old' ? old : Promise.resolve(response(path)))
    window.history.replaceState(null, '', '/work-orders?q=old')
    render(<App />)
    await waitFor(() => expect(queueCalls()).toHaveLength(1))
    act(() => go('/work-orders?q=new&page=3'))
    await screen.findByText('WO #SYNTHETIC-3')
    await act(async () => resolveOld({ work_orders: [{ ...order, external_id: 'OBSOLETE' }], meta: null }))
    expect(screen.queryByText('WO #OBSOLETE')).toBeNull()
    expect(screen.getByText('WO #SYNTHETIC-3')).toBeTruthy()
  })

  it('guards dirty route changes and page unload, retaining inputs when leaving is cancelled', async () => {
    render(<App />)
    await screen.findByText('WO #SYNTHETIC-1')
    fireEvent.click(screen.getByRole('button', { name: 'New Work Order' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Keep this draft' } })
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    act(() => go('/dashboard'))
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Keep this draft')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(window.location.pathname).toBe('/work-orders')
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Keep this draft')
    act(() => go('/dashboard'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await screen.findByText('Queue health')
  })

  it('does not reopen an obsolete deep link after returning to the queue', async () => {
    let resolveDetail!: (value: WorkOrder) => void
    const detail = new Promise<WorkOrder>((resolve) => { resolveDetail = resolve })
    api.getJson.mockImplementation((path: string) => path === '/work_orders/1' ? detail : Promise.resolve(response(path)))
    window.history.replaceState(null, '', '/work-orders/1?q=kept')
    render(<App />)
    await waitFor(() => expect(api.getJson).toHaveBeenCalledWith('/work_orders/1'))
    act(() => go('/work-orders?q=kept'))
    await act(async () => resolveDetail(order))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Search work orders')).toHaveProperty('value', 'kept')
  })
})

it.each(['/work-orders', '/admin/users', '/reports', '/pm', '/activity', '/dashboard', '/whatsapp', '/dispatch/whatsapp'])('keeps dispatch generation out of %s', async (path) => {
  window.history.replaceState({}, '', path)
  render(<App />)
  await waitFor(() => expect(api.getJson).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: 'Generate Draft' })).toBeNull()
})

it('shows draft generation and the schedule date on dispatch', async () => {
  window.history.replaceState({}, '', '/dispatch/today')
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Generate Draft' })).toBeTruthy()
  expect(screen.getByLabelText('Schedule date')).toBeTruthy()
})

it('does not present unloaded navigation totals as zero', async () => {
  api.getJson.mockImplementation((path: string) => path.startsWith('/dashboard') ? new Promise(() => undefined) : Promise.resolve(response(path)))
  render(<App />)
  await waitFor(() => expect(api.getJson).toHaveBeenCalled())
  expect(screen.getByRole('navigation', { name: 'JMI management navigation' }).textContent).not.toMatch(/\b0\b/)
})

it('keeps an existing deep-linked dirty editor open across repeated sidebar leave attempts', async () => {
  window.history.replaceState(null, '', '/work-orders/1')
  render(<App />)
  await screen.findByLabelText('Description')
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Retain existing editor' } })
  fireEvent.click(screen.getByRole('link', { name: /Today’s Dispatch/ }))
  expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy()
  expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Retain existing editor')
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  fireEvent.click(screen.getByRole('link', { name: /Today’s Dispatch/ }))
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(window.location.pathname).toBe('/work-orders/1')
})

it.each(['create', 'update', 'archive'])('keeps successful %s separate from a failed queue refresh', async (mutation) => {
  render(<App />)
  await screen.findByText('WO #SYNTHETIC-1')
  api.getJson.mockImplementation(async (path: string) => {
    if (path.startsWith('/work_orders?')) throw new Error('Queue offline')
    return response(path)
  })
  if (mutation === 'archive') {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.patchJson).toHaveBeenCalledWith('/work_orders/1/archive', {}))
    await screen.findByText('Archive state saved, but the work-order list did not refresh. Retry work orders.')
    expect(screen.queryByText('Unable to update work order archive state')).toBeNull()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    vi.restoreAllMocks()
  } else {
    fireEvent.click(screen.getByRole('button', { name: mutation === 'create' ? 'New Work Order' : 'Edit' }))
    if (mutation === 'create') fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Synthetic new site' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Saved request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(new RegExp(`Work order ${mutation === 'create' ? 'saved' : 'updated'}, but the work-order list`))).toBeTruthy()
  }
  act(() => go('/dashboard'))
  expect(screen.queryByText(/Refresh failed/)).toBeNull()
  expect(screen.getByText('Queue health')).toBeTruthy()
})

it('does not classify a crew failure as a dashboard failure and locks stale crew data until retry', async () => {
  window.history.replaceState(null, '', '/crews')
  render(<App />)
  const date = await screen.findByLabelText('Crew date')
  await waitFor(() => expect((date as HTMLInputElement).disabled || date.closest('fieldset')?.disabled).toBe(false))
  api.getJson.mockImplementation(async (path: string) => {
    if (path.startsWith('/teams?date=2026-10-28')) throw new Error('Crew offline')
    return response(path)
  })
  fireEvent.change(date, { target: { value: '2026-10-28' } })
  await screen.findByRole('button', { name: 'Retry crews' })
  expect(screen.getByLabelText('Crew date').closest('fieldset')?.disabled).toBe(true)
  act(() => go('/dashboard'))
  expect(screen.queryByText(/Refresh failed/)).toBeNull()
  expect(screen.getByLabelText('As of date')).toHaveProperty('value', '2026-10-28')
})

it.each(['resolve', 'reject'])('ignores an obsolete initial-date request that later %ss', async (outcome) => {
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const pending = new Promise((res, rej) => { resolve = res; reject = rej })
  window.history.replaceState(null, '', '/dashboard')
  api.getJson.mockImplementation((path: string) => path === '/teams?date=2026-10-28' ? pending : Promise.resolve(response(path)))
  render(<App />)
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  fireEvent.change(screen.getByLabelText('As of date'), { target: { value: '2026-10-28' } })
  fireEvent.change(screen.getByLabelText('As of date'), { target: { value: '2026-10-29' } })
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  await act(async () => { if (outcome === 'resolve') resolve([]); else reject(new Error('Obsolete crew failure')) })
  expect(screen.getByLabelText('As of date')).toHaveProperty('value', '2026-10-29')
  expect(screen.queryByText('Obsolete crew failure')).toBeNull()
})

it('keeps a dashboard failure isolated and clears it after retry', async () => {
  window.history.replaceState(null, '', '/dashboard')
  api.getJson.mockImplementation(async (path: string) => {
    if (path.startsWith('/dashboard')) throw new Error('Dashboard offline')
    return response(path)
  })
  render(<App />)
  expect((await screen.findByRole('alert')).textContent).toContain('could not refresh')
  api.getJson.mockImplementation(async (path: string) => response(path))
  fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(screen.getByRole('button', { name: /Open work orders/ })).toBeTruthy()
})

it.each(['resolve', 'reject'])('retains the selected report when an older month later %ss', async (outcome) => {
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const older = new Promise((res, rej) => { resolve = res; reject = rej })
  window.localStorage.setItem('dispatch-scheduler:selected-date', '2026-10-30')
  window.history.replaceState(null, '', '/reports/monthly/2026-10')
  api.getJson.mockImplementation((path: string) => path === '/reports/monthly?month=2026-09' ? older : Promise.resolve(response(path)))
  render(<App />)
  await screen.findByText('JMI Dispatch Report · 2026-10')
  fireEvent.change(screen.getByLabelText('Report month'), { target: { value: '2026-09' } })
  fireEvent.change(screen.getByLabelText('Report month'), { target: { value: '2026-08' } })
  await screen.findByText('JMI Dispatch Report · 2026-08')
  await act(async () => { if (outcome === 'resolve') resolve(response('/reports/monthly?month=2026-09')); else reject(new Error('Obsolete report failure')) })
  expect(screen.getByText('JMI Dispatch Report · 2026-08')).toBeTruthy()
  expect(screen.queryByText('Obsolete report failure')).toBeNull()
  expect(screen.queryByText('Loading monthly report...')).toBeNull()
})

it('keeps a deep-linked editor saving across repeated sidebar leave attempts', async () => {
  let finish!: (value: WorkOrder) => void
  api.patchJson.mockImplementation(() => new Promise<WorkOrder>((resolve) => { finish = resolve }))
  window.history.replaceState(null, '', '/work-orders/1')
  render(<App />)
  await screen.findByLabelText('Description')
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Pending saved scope' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
  for (let attempt = 0; attempt < 2; attempt += 1) {
    fireEvent.click(screen.getByRole('link', { name: /Today’s Dispatch/ }))
    expect(screen.getByText('Wait for this save to finish before leaving Work Orders.')).toBeTruthy()
    expect(window.location.pathname).toBe('/work-orders/1')
  }
  await act(async () => finish({ ...order, description: 'Pending saved scope', lock_version: 1 }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('refreshes the dashboard for the newly selected date, not the first-render date', async () => {
  window.history.replaceState(null, '', '/dashboard')
  render(<App />)
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  const initialDate = (screen.getByLabelText('As of date') as HTMLInputElement).value
  const nextDate = initialDate === '2026-10-28' ? '2026-10-27' : '2026-10-28'
  const before = api.getJson.mock.calls.length
  fireEvent.change(screen.getByLabelText('As of date'), { target: { value: nextDate } })
  await waitFor(() => expect(api.getJson.mock.calls.slice(before).some(([path]) => String(path) === `/dashboard?date=${nextDate}`)).toBe(true))
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  const dashboardDates = api.getJson.mock.calls.slice(before).map(([path]) => String(path)).filter((path) => path.startsWith('/dashboard?')).map((path) => new URLSearchParams(path.split('?')[1]).get('date'))
  expect(dashboardDates.length).toBeGreaterThan(0)
  expect(dashboardDates.every((date) => date === nextDate)).toBe(true)
})
