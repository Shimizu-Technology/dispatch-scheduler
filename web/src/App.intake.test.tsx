// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import App from './App'
import type { WorkOrder } from './types'

const api = vi.hoisted(() => ({ getJson: vi.fn(), postJson: vi.fn(), patchJson: vi.fn() }))
vi.mock('./contexts/useAuthContext', () => ({ useAuthContext: () => ({
  user: { id: 1, name: 'Synthetic dispatcher', role: 'dispatcher', permissions: { can_admin: false } },
  isSignedIn: true, isLoading: false, isVerifyingApi: false, authError: null, canEditDispatch: true,
}) }))
vi.mock('@clerk/react', () => ({ UserButton: () => <span>Account</span>, SignInButton: ({ children }: { children: ReactNode }) => children }))
vi.mock('./lib/api', async (original) => ({ ...await original<typeof import('./lib/api')>(), ...api }))
vi.mock('./components/ReportsPanel', () => ({ ReportsPanel: () => <p>Reports workspace</p> }))
vi.mock('./components/DashboardMetrics', () => ({ DashboardMetrics: () => <p>Dashboard workspace</p> }))

const order = {
  id: 1, lock_version: 0, external_id: 'SYNTHETIC-1', client: 'Synthetic Facilities', location: 'Synthetic Site',
  region: 'North', description: 'Synthetic repair', title: 'Synthetic repair', priority: 'P3', normalized_priority: 'P3',
  status: 'new', trade_category: 'General', source: 'whatsapp', reported_at: '2026-10-10T08:00:00Z', sla_status: 'missing', required_technician_count: 1,
} as WorkOrder
const queueCalls = () => api.getJson.mock.calls.map(([path]) => String(path)).filter((path) => path.startsWith('/work_orders?'))
const lastQuery = () => new URLSearchParams(queueCalls().at(-1)?.split('?')[1])

function response(path: string) {
  if (path.startsWith('/dashboard')) return { counts: {} }
  if (path.startsWith('/dispatch_schedules?')) return { schedule: null }
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
    expect(screen.getByText('Dashboard workspace')).toBeTruthy()
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
    await screen.findByText('Dashboard workspace')
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
