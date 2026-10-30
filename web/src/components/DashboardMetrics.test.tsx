// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DashboardMetrics } from './DashboardMetrics'
import type { Dashboard } from '../types'
import { workOrderViewQuery } from '../lib/workOrderViews'
afterEach(cleanup)
const props = { dashboard: { date: '2026-10-30', counts: { open_work_orders: 20, sla_overdue: 3, waiting_for_parts: 4, pa_projects: 2 } } as unknown as Dashboard, workOrders: [], teams: [], technicians: [], pmTasks: [], schedule: null, auditEvents: [], canEdit: true, working: false, onGoToSection: vi.fn(), onOpenWorkOrders: vi.fn() }
it('opens exact queue scopes from every manager tile', () => {
  render(<DashboardMetrics {...props} />)
  const cases = [['Open work orders', 'open'], ['Waiting parts', 'waiting'], ['Waiting approval', 'approval'], ['Overdue', 'overdue'], ['Needs assessment', 'assessment'], ['PA projects', 'pa'], ['Follow-up due', 'followUp'], ['Corrective maintenance', 'cm'], ['Estimates', 'estimates'], ['Parts ETA', 'partsEta']] as const
  for (const [label, view] of cases) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
    expect(props.onOpenWorkOrders).toHaveBeenLastCalledWith(workOrderViewQuery(view, '2026-10-30'))
  }
  expect(screen.queryByRole('button', { name: /Generate draft/i })).toBeNull()
})
it('shows unknown values while loading and offers retry after failure', () => {
  const { rerender } = render(<DashboardMetrics {...props} dashboard={null} loading />)
  expect(screen.getByRole('status').textContent).toContain('Loading')
  expect(screen.queryByText('0')).toBeNull()
  expect(screen.queryByText('No call-outs marked')).toBeNull()
  const onRetry = vi.fn()
  rerender(<DashboardMetrics {...props} dashboard={null} loadError="Check your connection." onRetry={onRetry} />)
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }))
  expect(onRetry).toHaveBeenCalledOnce()
})
