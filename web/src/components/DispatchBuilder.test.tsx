// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DispatchBuilder } from './DispatchBuilder'
import type { DispatchItem, DispatchSchedule, WorkOrder } from '../types'

afterEach(cleanup)
const noop = vi.fn().mockResolvedValue(undefined)
const item: DispatchItem = {
  id: 1, team_id: 1, team_name: 'Synthetic crew', crew_name: 'Synthetic crew', technician_names: [], assigned_technicians: [], call_out_names: [], order_index: 0,
  scheduled_time: null, capacity_overflow: false, notes: null, outcome_status: 'pending', outcome_notes: null, completed_at: null, carried_over_to_date: null, reassignment_reason: null,
  kind: 'work_order', work_order: { location: 'Synthetic station', title: 'Repair pump', priority: 'P3', normalized_priority: null, status: 'new' } as WorkOrder,
}
const schedule: DispatchSchedule = {
  id: 1, date: '2026-10-31', status: 'finalized', finalized_at: null, finalized_by: null, sent_at: null, sent_by: null, items: [item],
  summary: { scheduled_items: 1, eligible_work_orders: 1, eligible_pm_tasks: 0, deferred_items: 0, blocked_work_orders: 0, daily_item_limit: null, unfinished_previous_items: 0, capacity_deferred_items: 0, over_capacity_items: 0, message: 'Synthetic plan' },
}

it('identifies a finalized work order with its saved priority instead of calling it PM', () => {
  render(<DispatchBuilder schedule={schedule} teams={[]} technicians={[]} working={false} canEdit={false} onSuggest={noop} onUpdate={noop} onOutcome={noop} onWorkOrderStatus={noop} onFinalize={noop} onReopen={noop} />)
  expect(screen.getByRole('heading', { name: 'Finalized dispatch' })).toBeTruthy()
  expect(screen.getByText('P3', { exact: true })).toBeTruthy()
  expect(screen.queryByText('PM', { exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull()
})
