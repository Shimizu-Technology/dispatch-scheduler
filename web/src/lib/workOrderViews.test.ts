import { expect, it } from 'vitest'
import { activeWorkOrderContext, workOrderViewQuery } from './workOrderViews'
it('shows the actual active filters and sort instead of claiming every queue is newest first', () => {
  expect(activeWorkOrderContext('sort=created_at&direction=asc')).toBe('Active queue · Oldest first')
  expect(activeWorkOrderContext('sort=location&direction=asc&status=waiting_for_parts')).toContain('waiting for parts · Sort: location asc')
  const overdue = new URLSearchParams(workOrderViewQuery('overdue'))
  expect(overdue.get('sla_status')).toBe('overdue')
  expect(overdue.get('exclude_pa')).toBe('true')
})
