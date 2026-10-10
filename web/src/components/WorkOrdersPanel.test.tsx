// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkOrdersPanel } from './WorkOrdersPanel'
import type { WorkOrder } from '../types'

vi.mock('../lib/api', () => ({ postForm: vi.fn(), postJson: vi.fn() }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function order(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 1, external_id: 'DEMO-1', client: 'Demo Facilities', location: 'Demo North Site', region: 'North',
    title: 'Leaking sink', description: 'Leaking sink', created_at: '2026-10-10T00:00:00Z',
    priority: 'P3', normalized_priority: 'P3', status: 'new', original_status_text: 'new', trade_category: 'Plumbing',
    requested_at: null, reported_at: '2026-10-10T00:00:00Z', assessed_at: null, assessment_due_at: null,
    response_due_at: null, repair_due_at: null, sla_due_at: null, sla_status: 'missing', scheduled_date: null,
    estimated_hours: null, required_technician_count: 1, source: 'whatsapp', archived: false, archived_at: null,
    team_name: null, notes: null, service_line_id: null, service_line: null, pa_project: false,
    pa_project_notes: null, corrective_maintenance: false, estimate_required: false, estimate_number: null,
    parts_status: null, parts_ordered: false, parts_ordered_at: null, parts_eta: null, follow_up_due_on: null,
    follow_up_owner: null, vendor_reference: null, latest_follow_up_note: null, ...overrides,
  }
}

function setup(overrides: Partial<Parameters<typeof WorkOrdersPanel>[0]> = {}) {
  const props = {
    workOrders: [order()], meta: null, serviceLines: [], canEdit: true, saving: false,
    onFetch: vi.fn().mockResolvedValue(undefined), onCreate: vi.fn().mockResolvedValue(order({ id: 2, external_id: 'DEMO-SAVED' })),
    onUpdate: vi.fn().mockResolvedValue(order()), onArchive: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  render(<WorkOrdersPanel {...props} />)
  return { ...props, onCreate: vi.mocked(props.onCreate), onUpdate: vi.mocked(props.onUpdate), user: userEvent.setup() }
}

async function fillRequest(user: ReturnType<typeof userEvent.setup>, description = 'New request') {
  await user.clear(screen.getByLabelText('Client'))
  await user.type(screen.getByLabelText('Client'), 'Demo Facilities')
  await user.type(screen.getByLabelText('Location'), 'Demo South Site')
  await user.type(screen.getByLabelText('Description'), description)
}

describe('work-order intake and editing', () => {
  it('keeps inputs and shows a recoverable save error inside the drawer', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('Duplicate work order')).mockResolvedValue(undefined)
    const { user } = setup({ onCreate })
    await user.click(screen.getByRole('button', { name: 'New Work Order' }))
    await fillRequest(user)
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Duplicate work order')
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'New request')
    await user.type(screen.getByLabelText('WO #'), 'DEMO-2')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onCreate).toHaveBeenCalledTimes(2)
    expect(onCreate.mock.calls[1][0]).toMatchObject({ external_id: 'DEMO-2', scheduled_date: '', priority: 'P3' })
  })

  it('saves consecutive requests once each and clears request-specific fields', async () => {
    const { user, onCreate } = setup()
    const trigger = screen.getByRole('button', { name: 'New Work Order' })
    await user.click(trigger)
    await fillRequest(user, 'First request')
    await user.type(screen.getByLabelText('WO #'), 'DEMO-FIRST')
    await user.click(screen.getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(screen.getByLabelText('Description')).toHaveProperty('value', ''))
    expect(document.activeElement).toBe(screen.getByLabelText('Location'))
    expect(screen.getByLabelText('Client')).toHaveProperty('value', 'Demo Facilities')
    expect(screen.getByLabelText('Location')).toHaveProperty('value', '')
    expect(screen.getByLabelText('WO #')).toHaveProperty('value', '')
    await user.type(screen.getByLabelText('Location'), 'Demo Central Site')
    await user.type(screen.getByLabelText('Description'), 'Second request')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onCreate).toHaveBeenCalledTimes(2)
    expect(onCreate.mock.calls.map(([input]) => input.description)).toEqual(['First request', 'Second request'])
    expect(document.activeElement).toBe(trigger)
  })

  it('preserves populated advanced fields and an inactive service line while editing', async () => {
    const existing = order({ service_line_id: 2, service_line: 'Legacy line', pa_project: true,
      pa_project_notes: 'Long lead', corrective_maintenance: true, estimate_required: true,
      estimate_number: 'EST-DEMO', parts_status: 'Ordered', parts_ordered: true,
      parts_ordered_at: '2026-10-09T00:00:37.321Z', parts_eta: '2026-11-01', follow_up_due_on: '2026-10-20',
      follow_up_owner: 'Demo dispatcher', vendor_reference: 'PO-DEMO', latest_follow_up_note: 'Vendor contacted',
      assessed_at: '2026-10-10T01:00:12.123Z', reported_at: '2026-10-10T00:00:41.456Z', estimated_hours: 3, required_technician_count: 2, notes: 'Access note' })
    const { user, onUpdate } = setup({ workOrders: [existing], serviceLines: [
      { id: 1, name: 'Active line', active: true, position: 1, notes: null, work_orders_count: 0 },
      { id: 2, name: 'Legacy line', active: false, position: 2, notes: null, work_orders_count: 1 },
    ] })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByText('Parts, estimates and follow-up', { exact: true }))
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Updated description')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0]).toEqual([1, expect.objectContaining({ description: 'Updated description',
      service_line_id: 2, pa_project: true, pa_project_notes: 'Long lead', corrective_maintenance: true,
      estimate_required: true, estimate_number: 'EST-DEMO', parts_status: 'Ordered', parts_ordered: true,
      parts_ordered_at: '2026-10-09T00:00:37.321Z', parts_eta: '2026-11-01', follow_up_due_on: '2026-10-20',
      follow_up_owner: 'Demo dispatcher', vendor_reference: 'PO-DEMO', latest_follow_up_note: 'Vendor contacted',
      assessed_at: '2026-10-10T01:00:12.123Z', reported_at: '2026-10-10T00:00:41.456Z', estimated_hours: 3, required_technician_count: 2, notes: 'Access note' })])
    expect(screen.queryByRole('button', { name: 'Save and add another' })).toBeNull()
  })

  it('opens the saved record even when it is outside the current queue filters', async () => {
    const created = order({ id: 2, external_id: 'DEMO-SAVED', description: 'Saved request', status: 'needs_assessment' })
    const onCreate = vi.fn().mockResolvedValue(created)
    const { user } = setup({ routeSearch: '?status=new&q=old', onCreate })
    await user.click(screen.getByRole('button', { name: 'New Work Order' }))
    await fillRequest(user, 'Saved request')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await user.click(await screen.findByRole('button', { name: 'View saved work order' }))
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Saved request')
    expect(screen.getByRole('combobox', { name: 'Status filter' })).toHaveProperty('value', 'new')
    expect(screen.getByRole('textbox', { name: 'Search work orders' })).toHaveProperty('value', 'old')
  })

  it('keeps viewer deep links read-only', () => {
    setup({ canEdit: false, workOrderToEdit: order() })
    expect(screen.getByRole('dialog').textContent).toContain('Read-only work-order details')
    expect(screen.queryByRole('button', { name: 'Save Work Order' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New Work Order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('applies search with Enter while retaining selected filter and sort values', async () => {
    const onRouteQueryChange = vi.fn()
    const { user } = setup({ routeSearch: '?status=new&page=2&sort=priority&direction=asc', onRouteQueryChange })
    await user.type(screen.getByRole('textbox', { name: 'Search work orders' }), 'sink{Enter}')
    const query = new URLSearchParams(onRouteQueryChange.mock.calls[0][0])
    expect(query.get('q')).toBe('sink')
    expect(query.get('status')).toBe('new')
    expect(query.get('sort')).toBe('priority')
    expect(query.get('direction')).toBe('asc')
    expect(query.get('page')).toBe('1')
  })

  it('can cancel a dirty-close attempt without losing the request', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'New Work Order' }))
    await fillRequest(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alert').textContent).toContain('Discard the unsaved changes')
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'New request')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
