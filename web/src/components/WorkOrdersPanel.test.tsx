// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkOrdersPanel } from './WorkOrdersPanel'
import { ApiError, postForm, postJson } from '../lib/api'
import type { WorkOrder } from '../types'

vi.mock('../lib/api', async (importOriginal) => ({ ...await importOriginal<typeof import('../lib/api')>(), postForm: vi.fn(), postJson: vi.fn() }))
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined) })
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
  it('shows the stored legacy priority and preserves it with exact clocks during unrelated edits', async () => {
    const reported = '2026-10-11T08:00:41.123456+10:00'
    const { user, onUpdate } = setup({ workOrders: [order({ priority: 'Level 1', normalized_priority: 'Level 1', reported_at: reported })] })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const priority = screen.getByLabelText('Priority') as HTMLSelectElement
    expect(priority.value).toBe('Level 1')
    expect(priority.selectedOptions[0].textContent).toBe('Level 1 (current priority)')
    await user.type(screen.getByLabelText('Notes'), 'Unrelated access note')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0][1]).toMatchObject({ priority: 'Level 1', normalized_priority: 'Level 1', notes: 'Unrelated access note' })
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('reported_at')
  })

  it('keeps a legacy priority query visible and submits the same filter until deliberately changed', async () => {
    const { user, onFetch } = setup({ routeSearch: '?priority=Level+1&q=legacy' })
    const priority = screen.getByRole('combobox', { name: 'Priority filter' }) as HTMLSelectElement
    expect(priority.value).toBe('Level 1')
    expect(priority.selectedOptions[0].textContent).toBe('Level 1 (current priority)')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(new URLSearchParams(vi.mocked(onFetch).mock.calls.at(-1)?.[0]).get('priority')).toBe('Level 1')
    await user.selectOptions(priority, 'P2')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(new URLSearchParams(vi.mocked(onFetch).mock.calls.at(-1)?.[0]).get('priority')).toBe('P2')
    expect(screen.queryByRole('option', { name: 'Level 1 (current priority)' })).toBeNull()
  })

  it('keeps normal new-request priority choices and permits an intentional change from a legacy value', async () => {
    const { user, onUpdate } = setup({ workOrders: [order({ priority: 'Level 1', normalized_priority: 'Level 1' })] })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Priority'), 'P4')
    expect(screen.queryByRole('option', { name: 'Level 1 (current priority)' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0][1]).toMatchObject({ priority: 'P4', normalized_priority: 'P4' })
    await user.click(screen.getByRole('button', { name: 'New Work Order' }))
    const choices = Array.from((screen.getByLabelText('Priority') as HTMLSelectElement).options).map((option) => option.value)
    expect(choices).toEqual(['P1', 'P2', 'P3', 'P4'])
  })

  it('shows the current assigned line when the catalog is empty and preserves its ID during unrelated edits', async () => {
    const { user, onUpdate } = setup({ workOrders: [order({ service_line_id: 63, service_line: 'QA AD04 Desktop Renamed' })], serviceLines: [] })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const select = screen.getByLabelText('Service line') as HTMLSelectElement
    expect(select.value).toBe('63')
    expect(select.selectedOptions[0].textContent).toBe('QA AD04 Desktop Renamed (current assignment)')
    await user.type(screen.getByLabelText('Notes'), 'Unrelated site access note')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0][1]).toMatchObject({ service_line_id: 63, notes: 'Unrelated site access note' })
  })

  it('keeps dirty inputs and the assigned ID while an unavailable catalog refreshes and then allows a deliberate change', async () => {
    const props = { workOrders: [order({ service_line_id: 63, service_line: 'QA Current Line' })], meta: null, serviceLines: [], canEdit: true, saving: false,
      onFetch: vi.fn(), onCreate: vi.fn(), onUpdate: vi.fn().mockResolvedValue(order()), onArchive: vi.fn(), onRefreshServiceLines: vi.fn(),
      serviceLineCatalog: { confirmed: false, loading: false, error: 'Synthetic catalog unavailable', notice: '' } }
    const view = render(<WorkOrdersPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const field = screen.getByLabelText('Description')
    fireEvent.change(field, { target: { value: 'Dirty retained description' } })
    const select = screen.getByLabelText('Service line') as HTMLSelectElement
    expect(select.value).toBe('63')
    expect(select.matches(':disabled')).toBe(true)
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Service lines could not load. Your current assignment is kept.')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Refresh service lines' }))
    expect(props.onRefreshServiceLines).toHaveBeenCalledTimes(1)
    expect(props.onUpdate).not.toHaveBeenCalled()
    view.rerender(<WorkOrdersPanel {...props} serviceLineCatalog={{ confirmed: false, loading: true, error: '', notice: '' }} />)
    expect(screen.getByLabelText('Description')).toBe(field)
    expect(field).toHaveProperty('value', 'Dirty retained description')
    expect(screen.getByRole('button', { name: 'Refresh service lines' })).toHaveProperty('disabled', true)
    view.rerender(<WorkOrdersPanel {...props} serviceLines={[
      { id: 63, name: 'QA Current Line', active: false, position: 0, notes: null, work_orders_count: 1 },
      { id: 64, name: 'QA Active Line', active: true, position: 1, notes: null, work_orders_count: 0 },
    ]} serviceLineCatalog={{ confirmed: true, loading: false, error: '', notice: '' }} />)
    expect(screen.getByLabelText('Service line')).toBe(select)
    expect(select.value).toBe('63')
    expect(select.selectedOptions[0].textContent).toBe('QA Current Line (inactive)')
    expect(select.matches(':disabled')).toBe(false)
    expect(field).toHaveProperty('value', 'Dirty retained description')
    fireEvent.change(select, { target: { value: '64' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(props.onUpdate).toHaveBeenCalledTimes(1))
    expect(props.onUpdate.mock.calls[0][1]).toMatchObject({ service_line_id: '64', description: 'Dirty retained description' })
    for (const metadata of ['serviceLineCatalog', 'currentServiceLine']) expect(props.onUpdate.mock.calls[0][1]).not.toHaveProperty(metadata)
  })

  it('can save other details with the retained assignment while the catalog is still pending', async () => {
    const { user, onUpdate } = setup({ workOrders: [order({ service_line_id: 63, service_line: 'QA Current Line' })], serviceLineCatalog: { confirmed: false, loading: true, error: '', notice: '' } })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Service line')).toHaveProperty('value', '63')
    expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toContain('Loading service lines.')
    await user.type(screen.getByLabelText('Notes'), 'Saved with retained line')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(onUpdate.mock.calls[0][1]).toMatchObject({ service_line_id: 63, notes: 'Saved with retained line' })
  })

  it('keeps ordinary new intake unassigned when no service-line catalog is confirmed', async () => {
    const { user, onCreate } = setup({ serviceLineCatalog: { confirmed: false, loading: true, error: '', notice: '' } })
    await user.click(screen.getByRole('button', { name: 'New Work Order' }))
    expect(screen.getByLabelText('Service line')).toHaveProperty('value', '')
    expect(screen.queryByRole('option', { name: /current assignment/ })).toBeNull()
    await fillRequest(user)
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate.mock.calls[0][0]).toHaveProperty('service_line_id', null)
  })




  it('still starts ordinary manual intake with the current reported time', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'New Work Order' }))
    const reported = screen.getByLabelText(/^Reported at/) as HTMLInputElement
    expect(reported.value).not.toBe('')
    expect(Math.abs(Date.now() - new Date(reported.value).getTime())).toBeLessThan(60_000)
    expect(screen.queryByText('Original request text')).toBeNull()
  })

  it.each([
    ['missing', undefined, 'Reported time is missing from the source.'],
    ['invalid and normalized to null', null, 'Reported at was not recognized and was cleared. Check the source before saving.'],
  ])('requires a human reported time for OCR intake when it is %s', async (_label, reportedAt, issue) => {
    vi.mocked(postJson).mockResolvedValueOnce({ work_orders: [{ client: 'QA Facilities', location: 'QA North Site', region: 'North',
      source: 'pasted_text', title: 'Inspection', description: 'Synthetic source request', priority: 'P3',
      status: 'needs_assessment', trade_category: 'General', confidence: 'low', issues: [issue],
      ...(reportedAt === undefined ? {} : { reported_at: reportedAt }) }] })
    const { user, onCreate } = setup()
    await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
    await user.type(screen.getByRole('textbox', { name: 'Incoming request text or screenshot' }), 'Synthetic source with unknown request time')
    await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
    await user.click(await screen.findByRole('button', { name: 'Review/Edit' }))
    const dialog = within(screen.getByRole('dialog'))
    const reported = dialog.getByLabelText(/^Reported at/) as HTMLInputElement
    expect(reported.value).toBe('')
    expect(reported.required).toBe(true)
    expect(reported.validity.valueMissing).toBe(true)
    expect(dialog.getByRole('note', { name: 'Extraction review' }).textContent).toContain('Extraction confidence: low')
    expect(dialog.getByText(issue)).toBeTruthy()
    expect(dialog.getByText('No reported time was extracted. Enter when this request was reported before saving.')).toBeTruthy()
    await user.click(dialog.getByText('Original request text'))
    expect(dialog.getByText('Original request text').closest('details')?.querySelector('pre')?.textContent).toBe('Synthetic source with unknown request time')
    await user.click(dialog.getByRole('button', { name: 'Save Work Order' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    const chosenTime = '2026-10-10T08:30'
    fireEvent.change(reported, { target: { value: chosenTime } })
    await user.click(dialog.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate.mock.calls[0][0]).toMatchObject({ reported_at: new Date(chosenTime).toISOString(), source: 'pasted_text' })
    expect(onCreate.mock.calls[0][0].client_request_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('preserves an extracted reported time and the create receipt when an upload save is interrupted', async () => {
    const extractedTime = '2026-10-10T00:00:41.123Z'
    vi.mocked(postForm).mockResolvedValueOnce({ work_orders: [{ client: 'QA Facilities', location: 'QA North Site', region: 'North',
      source: 'upload', title: 'Inspection', description: 'Synthetic uploaded request', priority: 'P3', status: 'needs_assessment',
      trade_category: 'General', reported_at: extractedTime, confidence: 'high', issues: [], originalRequestText: 'Untrusted upload source text' }] })
    const onCreate = vi.fn().mockRejectedValueOnce(new ApiError('Interrupted', null)).mockResolvedValue(order())
    const { user } = setup({ onCreate })
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(['synthetic-image'], 'qa.png', { type: 'image/png' }))
    await user.click(await screen.findByRole('button', { name: 'Review/Edit' }))
    const reported = screen.getByLabelText(/^Reported at/) as HTMLInputElement
    expect(reported.value).not.toBe('')
    expect(within(screen.getByRole('dialog')).getByText('Extraction confidence: high')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).queryByText('Original request text')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await user.click(await screen.findByRole('button', { name: 'Retry and confirm save' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2))
    expect(onCreate.mock.calls[0][0]).toMatchObject({ reported_at: extractedTime, source: 'upload' })
    expect(onCreate.mock.calls[1][0]).toEqual(onCreate.mock.calls[0][0])
    for (const key of ['originalRequestText', 'draftId', 'confidence', 'issues']) expect(onCreate.mock.calls[0][0]).not.toHaveProperty(key)
  })

  it('retains the captured source for each proposal across appended pasted batches without sending review metadata', async () => {
    const firstSource = 'First source: requested October 9 at 08:30.\nKeep the exact original <text>.'
    const secondSource = 'Second source: a different request sent October 10 at 09:15.'
    const proposal = (location: string) => ({ client: 'QA Facilities', location, region: 'North', source: 'pasted_text',
      title: 'Inspection', description: `Synthetic ${location}`, priority: 'P3', status: 'needs_assessment', trade_category: 'General',
      reported_at: '2026-10-10T00:00:00Z', confidence: 'low', issues: ['Check the original request.'], originalRequestText: 'Untrusted model text' })
    vi.mocked(postJson).mockResolvedValueOnce({ work_orders: [proposal('First site'), proposal('Second site')] })
      .mockResolvedValueOnce({ work_orders: [proposal('Third site')] })
    const { user, onCreate } = setup()
    await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
    const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
    for (const source of [firstSource, secondSource]) {
      fireEvent.change(input, { target: { value: source } })
      await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
      await waitFor(() => expect(input).toHaveProperty('value', ''))
    }
    expect(screen.getAllByRole('button', { name: 'Review/Edit' })).toHaveLength(3)
    for (const source of [firstSource, firstSource, secondSource]) {
      await user.click(screen.getAllByRole('button', { name: 'Review/Edit' })[0])
      const dialog = within(screen.getByRole('dialog'))
      const original = dialog.getByText('Original request text').closest('details')!
      expect(original.open).toBe(false)
      await user.click(dialog.getByText('Original request text'))
      expect(original.open).toBe(true)
      expect(original.querySelector('pre')?.textContent).toBe(source)
      expect(dialog.queryByText('Untrusted model text')).toBeNull()
      await user.click(dialog.getByRole('button', { name: 'Save Work Order' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    expect(onCreate).toHaveBeenCalledTimes(3)
    expect(onCreate.mock.calls.map(([values]) => values.location)).toEqual(['First site', 'Second site', 'Third site'])
    for (const [values] of onCreate.mock.calls) {
      for (const key of ['originalRequestText', 'draftId', 'confidence', 'issues']) expect(values).not.toHaveProperty(key)
      expect(JSON.stringify(values)).not.toContain(firstSource)
      expect(values.client_request_id).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it.each([
    [true, null, 'Yes · time not recorded'],
    [false, null, 'No'],
    [true, '2026-10-10T00:00:00Z', 'Yes ·'],
  ] as const)('shows the parts ordered flag separately from its timestamp: %s / %s', async (partsOrdered, time, expected) => {
    const { user, onUpdate } = setup({ workOrders: [order({ parts_ordered: partsOrdered, parts_ordered_at: time })] })
    await user.click(screen.getByText('Details and notes'))
    expect(screen.getByText('Parts ordered').closest('div')?.querySelector('dd')?.textContent).toContain(expected)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(within(screen.getByRole('dialog')).queryByText('Original request text')).toBeNull()
    await user.type(screen.getByLabelText('Description'), ' reviewed')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    for (const key of ['originalRequestText', 'draftId', 'confidence', 'issues']) expect(onUpdate.mock.calls[0][1]).not.toHaveProperty(key)
  })

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
    const { user, onCreate } = setup({ serviceLines: [{ id: 7, name: 'Synthetic service line', active: true, position: 1, notes: null, work_orders_count: 0 }] })
    const trigger = screen.getByRole('button', { name: 'New Work Order' })
    await user.click(trigger)
    await fillRequest(user, 'First request')
    await user.selectOptions(screen.getByLabelText('Source'), 'email')
    await user.selectOptions(screen.getByLabelText('Service line'), '7')
    await user.type(screen.getByLabelText('WO #'), 'DEMO-FIRST')
    await user.click(screen.getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(screen.getByLabelText('Description')).toHaveProperty('value', ''))
    expect(document.activeElement).toBe(screen.getByLabelText('Location'))
    expect(screen.getByLabelText('Client')).toHaveProperty('value', 'Demo Facilities')
    expect(screen.getByLabelText('Source')).toHaveProperty('value', 'email')
    expect(screen.getByLabelText('Service line')).toHaveProperty('value', '7')
    expect(screen.getByLabelText('Location')).toHaveProperty('value', '')
    expect(screen.getByLabelText('WO #')).toHaveProperty('value', '')
    await user.type(screen.getByLabelText('Location'), 'Demo Central Site')
    await user.type(screen.getByLabelText('Description'), 'Second request')
    await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onCreate).toHaveBeenCalledTimes(2)
    expect(onCreate.mock.calls.map(([input]) => input.description)).toEqual(['First request', 'Second request'])
    expect(onCreate.mock.calls[1][0]).toMatchObject({ client: 'Demo Facilities', source: 'email', service_line_id: '7' })
    expect(onCreate.mock.calls[1][0].client_request_id).not.toBe(onCreate.mock.calls[0][0].client_request_id)
    expect(document.activeElement).toBe(trigger)
  })

  it('preserves populated advanced fields and an inactive service line while editing', async () => {
    const existing = order({ service_line_id: 2, service_line: 'Legacy line', pa_project: true,
      pa_project_notes: 'Long lead', corrective_maintenance: true, estimate_required: true,
      estimate_number: 'EST-DEMO', parts_status: 'Ordered', parts_ordered: true,
      parts_eta: '2026-11-01', follow_up_due_on: '2026-10-20',
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
      parts_eta: '2026-11-01', follow_up_due_on: '2026-10-20',
      follow_up_owner: 'Demo dispatcher', vendor_reference: 'PO-DEMO', latest_follow_up_note: 'Vendor contacted',
      estimated_hours: 3, required_technician_count: 2, notes: 'Access note' })])
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('reported_at')
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('assessed_at')
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('parts_ordered_at')
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
    await user.click(screen.getByRole('button', { name: 'Close work order editor' }))
    expect(screen.getByRole('alert').textContent).toContain('Discard the unsaved changes')
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Description'))
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'New request')
    await user.click(screen.getByRole('button', { name: 'Close work order editor' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

 it('shows recoverable queue failure without stale rows or losing an open editor', async () => {
   const { user } = setup({ loadError: 'Network unavailable', onRetry: vi.fn() })
   expect(screen.getByRole('alert').textContent).toContain('Network unavailable')
   expect(screen.queryByText('WO #DEMO-1')).toBeNull()
   expect(screen.queryByText(/shown/)).toBeNull()
   expect(screen.getByRole('button', { name: 'Retry work orders' })).toBeTruthy()
   await user.click(screen.getByRole('button', { name: 'New Work Order' }))
   await fillRequest(user)
   expect(screen.getByLabelText('Description')).toHaveProperty('value', 'New request')
 })

it('retains a distinct request title in full details', async () => {
 const { user } = setup({ workOrders: [order({ title: 'Distinct request title', description: 'Detailed scope' })] })
 await user.click(screen.getByText('Details and notes'))
 expect(screen.getByText('Distinct request title')).toBeTruthy()
})


it('confirms an interrupted create with the same receipt and locked original inputs', async () => {
 const onCreate = vi.fn().mockRejectedValueOnce(new ApiError('Interrupted', null)).mockResolvedValue(order())
 const { user } = setup({ onCreate })
 await user.click(screen.getByRole('button', { name: 'New Work Order' }))
 await fillRequest(user)
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('may already be in the queue'))
 expect(screen.getByLabelText('Description').matches(':disabled')).toBe(true)
 await user.click(screen.getByRole('button', { name: 'Close work order editor' }))
 expect(screen.getByRole('button', { name: 'Close without confirming' })).toBeTruthy()
 await user.click(screen.getByRole('button', { name: 'Keep editing' }))
 await user.click(screen.getByRole('button', { name: 'Retry and confirm save' }))
 await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 expect(onCreate.mock.calls[0][0]).toEqual(onCreate.mock.calls[1][0])
 expect(onCreate.mock.calls[0][0].client_request_id).toMatch(/^[0-9a-f-]{36}$/)
})

it('requires an explicit reload after an edit conflict and then submits the latest revision', async () => {
 const latest = order({ lock_version: 4, description: 'Other dispatcher change', parts_status: 'Arrived' })
 const onUpdate = vi.fn().mockRejectedValueOnce(new ApiError('This work order changed.', 409, { code: 'stale_work_order', latest_work_order: latest })).mockResolvedValue(latest)
 const { user } = setup({ workOrders: [order({ lock_version: 3 })], onUpdate })
 await user.click(screen.getByRole('button', { name: 'Edit' }))
 await user.clear(screen.getByLabelText('Description'))
 await user.type(screen.getByLabelText('Description'), 'My edit')
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('entries are still here'))
 expect(screen.getByLabelText('Description')).toHaveProperty('value', 'My edit')
 expect(screen.getByRole('button', { name: 'Save Work Order' })).toHaveProperty('disabled', true)
 await user.click(screen.getByRole('button', { name: 'Discard my edits and load latest' }))
 expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Other dispatcher change')
 await user.type(screen.getByLabelText('Description'), ' plus reviewed edit')
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
 expect(onUpdate.mock.calls[1][1]).toMatchObject({ expected_lock_version: 4, parts_status: 'Arrived' })
})

it.each([
 new ApiError('Receipt details changed', 409),
 new ApiError('Result no longer available', 409),
 new Error('Authentication provider unavailable'),
])('keeps an uncertain create locked after a failed confirmation retry: %s', async (retryError) => {
 const onCreate = vi.fn().mockRejectedValueOnce(new ApiError('Interrupted', null)).mockRejectedValueOnce(retryError).mockResolvedValue(order())
 const { user } = setup({ onCreate })
 await user.click(screen.getByRole('button', { name: 'New Work Order' }))
 await fillRequest(user)
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await user.click(await screen.findByRole('button', { name: 'Retry and confirm save' }))
 await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2))
 expect(screen.getByLabelText('Description').matches(':disabled')).toBe(true)
 expect(screen.queryByRole('button', { name: 'Save Work Order' })).toBeNull()
 await user.click(screen.getByRole('button', { name: 'Retry and confirm save' }))
 await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(3))
 expect(onCreate.mock.calls.map(([input]) => input.client_request_id)).toEqual(Array(3).fill(onCreate.mock.calls[0][0].client_request_id))
 expect(onCreate.mock.calls[2][0]).toEqual(onCreate.mock.calls[0][0])
})


async function startPrefilledReview(user: ReturnType<typeof userEvent.setup>) {
 vi.mocked(postJson).mockResolvedValue({ work_orders: [{ client: 'Mobil', location: 'Prefilled station', region: 'North', source: 'email', description: 'Prefilled source request', reported_at: '2026-10-10T00:00:00Z', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }] })
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 await user.type(screen.getByRole('textbox', { name: 'Incoming request text or screenshot' }), 'Synthetic incoming request')
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 await user.click(await screen.findByRole('button', { name: 'Review/Edit' }))
}

it('protects an untouched prefilled review after an uncertain save', async () => {
 const onCreate = vi.fn().mockRejectedValueOnce(new ApiError('Interrupted', null)).mockResolvedValue(order())
 const { user } = setup({ onCreate })
 await startPrefilledReview(user)
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await screen.findByRole('button', { name: 'Retry and confirm save' })
 await user.click(screen.getByRole('button', { name: 'Close work order editor' }))
 expect(screen.getByRole('button', { name: 'Close without confirming' })).toBeTruthy()
 await user.click(screen.getByRole('button', { name: 'Keep editing' }))
 await user.click(screen.getByRole('button', { name: 'Retry and confirm save' }))
 await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2))
 expect(onCreate.mock.calls[0][0]).toEqual(onCreate.mock.calls[1][0])
})

it('starts scanned review without an unrelated previous save notice', async () => {
 const { user } = setup()
 await user.click(screen.getByRole('button', { name: 'New Work Order' }))
 await fillRequest(user)
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 expect(screen.getByRole('status').textContent).toContain('saved')
 await startPrefilledReview(user)
 expect(screen.queryByRole('status')).toBeNull()
 expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Prefilled source request')
 const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
 expect(input.getAttribute('aria-describedby')).toBe('work-order-paste-intake-help')
})


it('shows extraction limit warnings next to 25 drafts without creating live work', async () => {
 const originalRows = Array.from({ length: 27 }, (_, index) => ({ client: 'Mobil', location: `Synthetic station ${index + 1}`, region: 'North', source: 'email', external_id: `ROW-${index + 1}`, description: `Synthetic request ${index + 1}`, reported_at: '2026-10-10T00:00:00Z', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }))
 vi.mocked(postJson).mockResolvedValue({ work_orders: originalRows.slice(0, 25), warnings: ['2 additional requests were omitted. Split the remaining requests into a separate intake.'] })
 const { user, onCreate } = setup()
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 await user.type(screen.getByRole('textbox', { name: 'Incoming request text or screenshot' }), '27 synthetic requests')
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 expect((await screen.findByText(/2 additional requests were omitted/)).closest('[role="status"]')).toBeTruthy()
 expect(screen.getAllByRole('button', { name: 'Review/Edit' })).toHaveLength(25)
 expect(onCreate).not.toHaveBeenCalled()
 await user.click(screen.getByRole('button', { name: 'Clear intake preview' }))
 expect(screen.getByText(/2 additional requests were omitted/)).toBeTruthy()
 expect(screen.queryByRole('button', { name: 'Review/Edit' })).toBeNull()
 await user.click(screen.getByRole('button', { name: 'Acknowledge extraction warnings' }))
 expect(screen.queryByText(/2 additional requests were omitted/)).toBeNull()
})

it('keeps old extraction warnings while a new preview is pending and resets them only on success', async () => {
 vi.mocked(postJson).mockResolvedValueOnce({ work_orders: [{ client: 'Mobil', location: 'Synthetic station', region: 'North', source: 'email', description: 'Reviewable request', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }], warnings: ['Review omitted requests'] })
 const { user, onCreate } = setup()
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 await user.type(screen.getByRole('textbox', { name: 'Incoming request text or screenshot' }), 'First extraction')
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 await screen.findByText('Review omitted requests')
 let resolve!: (value: { work_orders: [] }) => void
 vi.mocked(postJson).mockReturnValueOnce(new Promise((done) => { resolve = done }))
 await user.type(screen.getByRole('textbox', { name: 'Incoming request text or screenshot' }), 'Second extraction')
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 expect(screen.getByText('Review omitted requests')).toBeTruthy()
 expect(screen.getByRole('button', { name: 'Review/Edit' })).toBeTruthy()
 await act(async () => resolve({ work_orders: [] }))
 expect(screen.queryByText('Review omitted requests')).toBeNull()
 expect(onCreate).not.toHaveBeenCalled()
})


it('keeps upload omission warnings after the final shown draft is saved until explicit acknowledgment', async () => {
 vi.mocked(postForm).mockResolvedValueOnce({ work_orders: [{ client: 'Mobil', location: 'Upload station', region: 'North', source: 'upload', description: 'Upload request', reported_at: '2026-10-10T00:00:00Z', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }], warnings: ['Some source rows need a separate review.'] })
 const { user, onCreate } = setup()
 const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
 await user.upload(input, new File(['synthetic-image-fixture'], 'qa.png', { type: 'image/png' }))
 await screen.findByText('Some source rows need a separate review.')
 expect(onCreate).not.toHaveBeenCalled()
 await user.click(screen.getByRole('button', { name: 'Review/Edit' }))
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 expect(onCreate).toHaveBeenCalledTimes(1)
 expect(screen.getByText('Some source rows need a separate review.')).toBeTruthy()
 expect(screen.queryByRole('button', { name: 'Review/Edit' })).toBeNull()
 await user.click(screen.getByRole('button', { name: 'Acknowledge extraction warnings' }))
 expect(screen.queryByText('Some source rows need a separate review.')).toBeNull()
})

it('retains the complete pasted source after the server rejects oversized intake', async () => {
 vi.mocked(postJson).mockRejectedValueOnce(new ApiError('Pasted intake is limited to 20,000 characters.', 422))
 const { user, onCreate } = setup()
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
 const source = 'x'.repeat(20001)
 fireEvent.change(input, { target: { value: source } })
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 expect((await screen.findByRole('alert')).textContent).toContain('Pasted intake is limited to 20,000 characters.')
 expect(input).toHaveProperty('value', source)
 expect(onCreate).not.toHaveBeenCalled()
})


it('preserves pasted source and earlier proposals when the next preview finds no work', async () => {
 const { user, onCreate } = setup()
 await startPrefilledReview(user)
 await user.click(screen.getByRole('button', { name: 'Close work order editor' }))
 const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
 await user.type(input, 'Latest source needs more detail')
 vi.mocked(postJson).mockResolvedValueOnce({ work_orders: [], warnings: [] })
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('No work orders found'))
 expect(input).toHaveProperty('value', 'Latest source needs more detail')
 expect(screen.getAllByRole('button', { name: 'Review/Edit' })).toHaveLength(1)
 expect(onCreate).not.toHaveBeenCalled()
})

it('shows empty upload recovery without removing earlier proposals', async () => {
 const { user, onCreate } = setup()
 await startPrefilledReview(user)
 await user.click(screen.getByRole('button', { name: 'Close work order editor' }))
 vi.mocked(postForm).mockResolvedValueOnce({ work_orders: [], warnings: [] })
 await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(['synthetic-no-work'], 'empty.png', { type: 'image/png' }))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('clearer screenshot'))
 expect(screen.getAllByRole('button', { name: 'Review/Edit' })).toHaveLength(1)
 expect(onCreate).not.toHaveBeenCalled()
})


it('locks the pending source and prevents repeated extraction or screenshot paste', async () => {
 let resolve!: (value: { work_orders: unknown[] }) => void
 vi.mocked(postJson).mockReset().mockReturnValueOnce(new Promise((done) => { resolve = done }))
 vi.mocked(postForm).mockReset()
 const { user, onCreate } = setup()
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
 await user.type(input, 'Original source')
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 expect(input).toHaveProperty('disabled', true)
 expect(screen.getByText('Reading this source. Text stays locked until the preview finishes.')).toBeTruthy()
 await user.type(input, 'Next request cannot replace the pending source')
 expect(input).toHaveProperty('value', 'Original source')
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 fireEvent.paste(input, { clipboardData: { files: [new File(['synthetic'], 'qa.png', { type: 'image/png' })] } })
 expect(postJson).toHaveBeenCalledTimes(1)
 expect(postForm).not.toHaveBeenCalled()
 await act(async () => resolve({ work_orders: [{ client: 'Mobil', location: 'First source', region: 'North', source: 'email', description: 'Original proposal', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }] }))
 expect(input).toHaveProperty('disabled', false)
 expect(screen.getByRole('button', { name: 'Review/Edit' })).toBeTruthy()
 expect(onCreate).not.toHaveBeenCalled()
})

it('guards repeated screenshot paste immediately before the disabled state paints', async () => {
 let resolve!: (value: { work_orders: [] }) => void
 vi.mocked(postForm).mockReset().mockReturnValueOnce(new Promise((done) => { resolve = done }))
 const { user } = setup()
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
 const clipboardData = { files: [new File(['synthetic'], 'qa.png', { type: 'image/png' })] }
 act(() => { fireEvent.paste(input, { clipboardData }); fireEvent.paste(input, { clipboardData }) })
 expect(postForm).toHaveBeenCalledTimes(1)
 await act(async () => resolve({ work_orders: [] }))
 expect(input).toHaveProperty('disabled', false)
 expect(screen.getByRole('alert').textContent).toContain('No work orders found')
})

it('sends explicit null when filled optional edit timestamps are cleared', async () => {
 const existing = order({ assessed_at: '2026-10-10T01:00:12.123456Z', parts_ordered_at: '2026-10-10T02:00:41.654321Z', parts_ordered: true, reported_at: '2026-10-10T00:00:55.123456Z' })
 const { user, onUpdate } = setup({ workOrders: [existing] })
 await user.click(screen.getByRole('button', { name: 'Edit' }))
 fireEvent.change(screen.getByLabelText(/Assessed at/), { target: { value: '' } })
 fireEvent.change(screen.getByLabelText(/Ordered at/), { target: { value: '' } })
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
 expect(onUpdate.mock.calls[0][1]).toMatchObject({ assessed_at: null, parts_ordered_at: null })
 expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('reported_at')
 expect(JSON.stringify(onUpdate.mock.calls[0][1])).toContain('"assessed_at":null')
})


it.each([
 ['Clear assessment time', 'assessed_at', 'parts_ordered_at', /Assessed at/],
 ['Clear order time', 'parts_ordered_at', 'assessed_at', /Ordered at/],
] as const)('uses %s to fully clear only the chosen optional time', async (button, cleared, untouched, label) => {
 const existing = order({ assessed_at: '2026-10-10T01:00:12.123456Z', parts_ordered_at: '2026-10-10T02:00:41.654321Z', parts_ordered: true, reported_at: '2026-10-10T00:00:55.123456Z' })
 const { user, onUpdate } = setup({ workOrders: [existing] })
 await user.click(screen.getByRole('button', { name: 'Edit' }))
 await user.click(screen.getByRole('button', { name: button }))
 expect(screen.getByLabelText(label)).toHaveProperty('value', '')
 expect(document.activeElement).toBe(screen.getByLabelText(label))
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
 expect(onUpdate.mock.calls[0][1]).toHaveProperty(cleared, null)
 expect(onUpdate.mock.calls[0][1]).not.toHaveProperty(untouched)
 expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('reported_at')
})

it('allows a new request with both optional times left unknown', async () => {
 const { user, onCreate } = setup()
 await user.click(screen.getByRole('button', { name: 'New Work Order' }))
 await fillRequest(user)
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
 expect(onCreate.mock.calls[0][0]).toMatchObject({ assessed_at: null, parts_ordered_at: null })
})

it('shows and preserves an existing opaque source when editing another field', async () => {
 const { user, onUpdate } = setup({ workOrders: [order({ source: 'legacy_sheet' })] })
 await user.click(screen.getByRole('button', { name: 'Edit' }))
 expect(screen.getByLabelText('Source')).toHaveProperty('value', 'legacy_sheet')
 expect(screen.getByRole('option', { name: 'legacy_sheet (current source)' })).toHaveProperty('selected', true)
 await user.type(screen.getByLabelText('Description'), ' updated')
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
 expect(onUpdate.mock.calls[0][1]).toHaveProperty('source', 'legacy_sheet')
})

it('shows and preserves a source-extracted opaque intake source', async () => {
 const { user, onCreate } = setup()
 vi.mocked(postJson).mockResolvedValueOnce({ work_orders: [{ client: 'Mobil', location: 'Text station', region: 'North', source: 'text_upload', description: 'Source request', reported_at: '2026-10-10T00:00:00Z', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }] })
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 await user.type(screen.getByRole('textbox', { name: 'Incoming request text or screenshot' }), 'Synthetic source')
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 await user.click(await screen.findByRole('button', { name: 'Review/Edit' }))
 expect(screen.getByLabelText('Source')).toHaveProperty('value', 'text_upload')
 expect(screen.getByRole('option', { name: 'text_upload (current source)' })).toHaveProperty('selected', true)
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
 expect(onCreate.mock.calls[0][0]).toHaveProperty('source', 'text_upload')
})


it('keeps the capped pasted source and omission warning after all 25 shown requests are saved', async () => {
 const rows = Array.from({ length: 25 }, (_, index) => ({ client: 'QA Facilities', location: `QA station ${index + 1}`, region: 'North', source: 'email', external_id: `QA-CAP-${index + 1}`, description: `Synthetic request ${index + 1}`, reported_at: '2026-10-10T00:00:00Z', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }))
 const warning = 'Extraction returned 26 requests. Only the first 25 are shown; 1 additional request omitted.'
 vi.mocked(postJson).mockResolvedValueOnce({ work_orders: rows, warnings: [warning] })
 const { user, onCreate } = setup()
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
 const source = Array.from({ length: 26 }, (_, index) => `QA request ${index + 1}: synthetic inspection`).join('\n')
 fireEvent.change(input, { target: { value: source } })
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 await screen.findByText(warning)
 expect(input).toHaveProperty('value', source)
 for (let index = 0; index < 25; index++) {
  await user.click(screen.getAllByRole('button', { name: 'Review/Edit' })[0])
  await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 }
 expect(onCreate).toHaveBeenCalledTimes(25)
 expect(screen.queryByRole('button', { name: 'Review/Edit' })).toBeNull()
 expect(screen.getByText(warning)).toBeTruthy()
 expect(input).toHaveProperty('value', source)
 await user.click(screen.getByRole('button', { name: 'Acknowledge extraction warnings' }))
 expect(screen.queryByText(warning)).toBeNull()
 expect(input).toHaveProperty('value', source)
})

it('keeps prior omission warning and full source when the next split preview fails', async () => {
 const warning = 'One source request was omitted; split and review it separately.'
 vi.mocked(postJson).mockResolvedValueOnce({ work_orders: [{ client: 'QA', location: 'QA station', description: 'Synthetic scope', title: 'Inspection', priority: 'P3', status: 'needs_assessment', trade_category: 'General', confidence: 'high', issues: [] }], warnings: [warning] })
 const { user } = setup()
 await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
 const input = screen.getByRole('textbox', { name: 'Incoming request text or screenshot' })
 fireEvent.change(input, { target: { value: 'Full original request including omitted work' } })
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 await screen.findByText(warning)
 vi.mocked(postJson).mockRejectedValueOnce(new Error('Synthetic preview unavailable'))
 fireEvent.change(input, { target: { value: 'Split request that still needs processing' } })
 await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
 await screen.findByText('Automatic extraction is unavailable. Your text is kept.')
 expect(screen.getByText(warning)).toBeTruthy()
 expect(input).toHaveProperty('value', 'Split request that still needs processing')
 expect(screen.getByRole('button', { name: 'Review/Edit' })).toBeTruthy()
})


it.each([
 ['Clear dispatch date', 'scheduled_date', /Force dispatch date/],
 ['Clear parts ETA', 'parts_eta', /^Parts ETA$/],
 ['Clear follow-up date', 'follow_up_due_on', /^Follow-up due$/],
] as const)('uses %s to clear native and React date values without changing other dates', async (button, cleared, label) => {
 const existing = order({ scheduled_date: '2026-10-12', parts_eta: '2026-10-13', follow_up_due_on: '2026-10-14', assessed_at: '2026-10-10T01:00:12.123456Z', parts_ordered_at: '2026-10-10T02:00:41.654321Z', reported_at: '2026-10-10T00:00:55.123456Z' })
 const { user, onUpdate } = setup({ workOrders: [existing] })
 await user.click(screen.getByRole('button', { name: 'Edit' }))
 const input = screen.getByLabelText(label) as HTMLInputElement
 // Model the native segmented control being empty without a React change event.
 input.value = ''
 await user.click(screen.getByRole('button', { name: button }))
 expect(input.value).toBe('')
 expect(document.activeElement).toBe(input)
 await user.type(screen.getByLabelText('Description'), ' Reviewed after clearing')
 expect(input.value).toBe('')
 await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
 await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
 const payload = onUpdate.mock.calls[0][1]
 expect(payload).toHaveProperty(cleared, '')
 // Date-only '' is the existing API clear-to-NULL contract; untouched dates remain literal.
 for (const field of ['scheduled_date', 'parts_eta', 'follow_up_due_on'] as const) {
  if (field !== cleared) expect(payload).toHaveProperty(field, existing[field])
 }
 for (const field of ['reported_at', 'assessed_at', 'parts_ordered_at']) expect(payload).not.toHaveProperty(field)
})

describe('same-identity work-order permissions', () => {
  function permissionPanel(extra: Partial<Parameters<typeof WorkOrdersPanel>[0]> = {}) {
    const props = { workOrders: [order({ lock_version: 3 })], meta: null, serviceLines: [], canEdit: true, saving: false,
      onFetch: vi.fn().mockResolvedValue(undefined), onCreate: vi.fn().mockResolvedValue(order({ id: 2 })), onUpdate: vi.fn().mockResolvedValue(order()), onArchive: vi.fn(), onEditorStateChange: vi.fn(), ...extra }
    return { props: { ...props, onCreate: vi.mocked(props.onCreate), onUpdate: vi.mocked(props.onUpdate) }, view: render(<WorkOrdersPanel {...props} />) }
  }

  it.each([false, true])('closes a confirmed add-another save after permission loss, including uncertain retry: %s', async (uncertainRetry) => {
    let confirmSave!: (saved: WorkOrder) => void
    const pending = new Promise<WorkOrder>((resolve) => { confirmSave = resolve })
    const onCreate = vi.fn()
    if (uncertainRetry) onCreate.mockRejectedValueOnce(new ApiError('Response lost', null))
    onCreate.mockReturnValueOnce(pending)
    const { props, view } = permissionPanel({ onCreate })
    fireEvent.click(screen.getByRole('button', { name: 'New Work Order' }))
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Confirmed site' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Confirmed original request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and add another' }))
    if (uncertainRetry) {
      fireEvent.click(await screen.findByRole('button', { name: 'Retry and confirm save' }))
    }
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(uncertainRetry ? 2 : 1))
    const original = onCreate.mock.calls[0][0]
    if (uncertainRetry) expect(onCreate.mock.calls[1][0]).toEqual(original)
    expect(original.client_request_id).toMatch(/^[0-9a-f-]{36}$/)
    view.rerender(<WorkOrdersPanel {...props} canEdit={false} saving />)
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Confirmed original request')
    await act(async () => { confirmSave(order({ id: 2, location: 'Confirmed site' })) })
    view.rerender(<WorkOrdersPanel {...props} canEdit={false} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Work order for Confirmed site saved. Your queue view has been kept.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View saved work order' })).toBeTruthy()
    expect(props.onEditorStateChange).toHaveBeenLastCalledWith({ open: false, dirty: false, saving: false, unconfirmed: false })
    view.rerender(<WorkOrdersPanel {...props} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onCreate).toHaveBeenCalledTimes(uncertainRetry ? 2 : 1)
  })

  it('opens a fresh request after a held add-another save when edit access remains available', async () => {
    let confirmSave!: (saved: WorkOrder) => void
    const onCreate = vi.fn().mockImplementationOnce(() => new Promise<WorkOrder>((resolve) => { confirmSave = resolve })).mockResolvedValueOnce(order({ id: 3 }))
    const { props, view } = permissionPanel({ onCreate })
    fireEvent.click(screen.getByRole('button', { name: 'New Work Order' }))
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'Retained client' } })
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'First site' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'First request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    view.rerender(<WorkOrdersPanel {...props} saving />)
    await act(async () => { confirmSave(order({ id: 2 })) })
    view.rerender(<WorkOrdersPanel {...props} />)
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '')
    expect(screen.getByLabelText('Location')).toHaveProperty('value', '')
    expect(screen.getByLabelText('Client')).toHaveProperty('value', 'Retained client')
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Second site' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Second request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onCreate).toHaveBeenCalledTimes(2)
    expect(onCreate.mock.calls[1][0].client_request_id).not.toBe(onCreate.mock.calls[0][0].client_request_id)
  })

  it.each(['create', 'row edit', 'deep-link edit'] as const)('retains %s values and state through permission loss, blocks submission, then recovers', async (mode) => {
    const { props, view } = permissionPanel(mode === 'deep-link edit' ? { workOrderToEdit: order({ lock_version: 3 }) } : {})
    if (mode !== 'deep-link edit') fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? 'New Work Order' : 'Edit' }))
    if (mode === 'create') fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Retained new site' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Retained permission draft' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Retained operational notes' } })
    const field = screen.getByLabelText('Description')
    const form = field.closest('form')!
    view.rerender(<WorkOrdersPanel {...props} canEdit={false} />)
    expect(screen.getByLabelText('Description')).toBe(field)
    expect(field).toHaveProperty('value', 'Retained permission draft')
    expect(field.matches(':disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Save Work Order' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Edit access is unavailable/)).toBeTruthy()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await act(async () => { fireEvent.submit(form) })
    expect(props.onCreate).not.toHaveBeenCalled()
    expect(props.onUpdate).not.toHaveBeenCalled()
    expect(props.onEditorStateChange).toHaveBeenLastCalledWith({ open: true, dirty: true, saving: false, unconfirmed: false })
    view.rerender(<WorkOrdersPanel {...props} />)
    expect(screen.getByLabelText('Description')).toBe(field)
    expect(screen.getByLabelText('Notes')).toHaveProperty('value', 'Retained operational notes')
    expect(field.matches(':disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await waitFor(() => expect(mode === 'create' ? props.onCreate : props.onUpdate).toHaveBeenCalledTimes(1))
    const submitted = mode === 'create' ? props.onCreate.mock.calls[0][0] : props.onUpdate.mock.calls[0][1]
    expect(submitted).toMatchObject({ description: 'Retained permission draft', notes: 'Retained operational notes' })
    if (mode !== 'create') expect(submitted).toMatchObject({ expected_lock_version: 3 })
  })

  it('retains an uncertain receipt and locked inputs through permission loss and confirmation retry', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new ApiError('Response lost', null)).mockResolvedValueOnce(order({ id: 2 }))
    const { props, view } = permissionPanel({ onCreate })
    fireEvent.click(screen.getByRole('button', { name: 'New Work Order' }))
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Uncertain site' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Uncertain original request' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Order' }))
    await screen.findByRole('button', { name: 'Retry and confirm save' })
    const original = onCreate.mock.calls[0][0]
    const form = screen.getByLabelText('Description').closest('form')!
    view.rerender(<WorkOrdersPanel {...props} canEdit={false} />)
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Uncertain original request')
    expect(screen.getByRole('button', { name: 'Retry and confirm save' })).toHaveProperty('disabled', true)
    await act(async () => { fireEvent.submit(form) })
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(props.onEditorStateChange).toHaveBeenLastCalledWith({ open: true, dirty: true, saving: false, unconfirmed: true })
    view.rerender(<WorkOrdersPanel {...props} />)
    expect(screen.getByLabelText('Description').matches(':disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry and confirm save' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2))
    expect(onCreate.mock.calls[1][0]).toEqual(original)
    expect(original.client_request_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('keeps OCR review state but cannot open another proposal without edit access', async () => {
    vi.mocked(postJson).mockReset().mockResolvedValueOnce({ work_orders: [{ client: 'QA', location: 'QA site', description: 'Original proposal', title: 'Original proposal', priority: 'P3', status: 'new', region: 'North', trade_category: 'General', reported_at: '2026-10-11T08:00:00+10:00', confidence: 'low', issues: ['Review source'], source: 'pasted_text' }] })
    const { props, view } = permissionPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Paste Intake' }))
    fireEvent.change(screen.getByLabelText('Incoming request text or screenshot'), { target: { value: 'Original source evidence' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview pasted text' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Review/Edit' }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Human corrected proposal' } })
    view.rerender(<WorkOrdersPanel {...props} canEdit={false} />)
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Human corrected proposal')
    expect(screen.getByText('Original request text')).toBeTruthy()
    expect(screen.getByText('Original source evidence')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close work order editor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Human corrected proposal')
    fireEvent.click(screen.getByRole('button', { name: 'Close work order editor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Review/Edit' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Review/Edit' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onCreate).not.toHaveBeenCalled()
  })
})

it('does not carry a previously authorized deep-link editor into another read-only record', () => {
  const props = { workOrders: [], meta: null, serviceLines: [], saving: false, onFetch: vi.fn(), onCreate: vi.fn(), onUpdate: vi.fn(), onArchive: vi.fn() }
  const view = render(<WorkOrdersPanel {...props} canEdit workOrderToEdit={order()} />)
  expect(screen.getByLabelText('Description')).toHaveProperty('value', 'Leaking sink')
  view.rerender(<WorkOrdersPanel {...props} canEdit={false} workOrderToEdit={order({ id: 2, external_id: 'SECOND', description: 'Second saved record' })} />)
  expect(screen.getByRole('dialog').textContent).toContain('Read-only work-order details')
  expect(screen.getByRole('dialog').textContent).toContain('Second saved record')
  expect(screen.queryByLabelText('Description')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Save Work Order' })).toBeNull()
})

it('carries unavailable pasted extraction into a manual draft without exposing provider details', async () => {
  vi.mocked(postJson).mockRejectedValueOnce(new ApiError('OpenRouter API key not configured', 422))
  const { user } = setup()
  await user.click(screen.getByRole('button', { name: 'Paste Intake' }))
  await user.type(screen.getByRole('textbox', { name: 'Incoming request text or screenshot' }), 'OFFICE AC LEAKING')
  await user.click(screen.getByRole('button', { name: 'Preview pasted text' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Automatic extraction is unavailable. Your text is kept.')
  expect(screen.queryByText(/OpenRouter/)).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Create manually' }))
  expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('OFFICE AC LEAKING')
})

it('restores the edited row anchor and focus without scrolling focus into view', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  const { user } = setup()
  const row = document.querySelector<HTMLElement>('[data-work-order-id="1"]')!
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 210 } as DOMRect)
  const edit = screen.getByRole('button', { name: 'Edit' })
  const focus = vi.spyOn(edit, 'focus')
  await user.click(edit)
  await user.type(screen.getByLabelText('Description'), ' updated')
  await user.click(screen.getByRole('button', { name: 'Save Work Order' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
})
