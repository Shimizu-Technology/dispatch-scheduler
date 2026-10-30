// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DashboardMetrics } from './DashboardMetrics'
import type { Dashboard } from '../types'
import { workOrderViewQuery } from '../lib/workOrderViews'
afterEach(cleanup)
const props = { dashboard: { date: '2026-10-30', counts: { open_work_orders: 20, sla_overdue: 3, waiting_for_parts: 4, pa_projects: 2 } } as unknown as Dashboard, teams: [], technicians: [], schedule: null, auditEvents: [], canEdit: true, working: false, onGoToSection: vi.fn(), onOpenWorkOrders: vi.fn() }
it('opens exact queue scopes from every manager tile', () => {
  render(<DashboardMetrics {...props} />)
  const cases = [['Open work orders', 'open'], ['Waiting parts', 'waiting'], ['Waiting approval', 'approval'], ['Overdue', 'overdue'], ['Needs assessment', 'assessment'], ['PA projects', 'pa'], ['Follow-up due', 'followUp'], ['Corrective maintenance', 'cm'], ['Estimates', 'estimates'], ['Parts ETA', 'partsEta'], ['Due soon', 'dueSoon'], ['KPI missing', 'missing']] as const
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

it('keeps the focused date input mounted during reload and ignores empty dates', () => {
  const onDateChange = vi.fn()
  const { rerender } = render(<DashboardMetrics {...props} onDateChange={onDateChange} />)
  const date = screen.getByLabelText('As of date')
  date.focus()
  fireEvent.change(date, { target: { value: '' } })
  expect(onDateChange).not.toHaveBeenCalled()
  fireEvent.change(date, { target: { value: '2026-10-29' } })
  expect(onDateChange).toHaveBeenCalledWith('2026-10-29')
  rerender(<DashboardMetrics {...props} onDateChange={onDateChange} loading />)
  expect(screen.getByLabelText('As of date')).toBe(date)
  expect(document.activeElement).toBe(date)
})
it('retains overview data after refresh failure and offers a working retry', () => {
  const onRetry = vi.fn()
  render(<DashboardMetrics {...props} loadError="Offline" onRetry={onRetry} />)
  expect(screen.getByRole('alert').textContent).toContain('Showing the last loaded overview')
  expect(screen.getByRole('button', { name: /Open work orders/ }).textContent).toContain('20')
  fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('reserves a full date-value track after native calendar selections', () => {
  const onDateChange = vi.fn()
  render(<DashboardMetrics {...props} asOfDate="2026-11-21" onDateChange={onDateChange} />)
  const date = screen.getByLabelText('As of date') as HTMLInputElement
  expect(date.parentElement?.className).toContain('w-[10.5rem]')
  expect(date.parentElement?.className).toContain('shrink-0')
  fireEvent.change(date, { target: { value: '2026-11-22' } })
  expect(onDateChange).toHaveBeenCalledWith('2026-11-22')
})
