// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReportsPanel } from './ReportsPanel'
import { TeamsPanel } from './TeamsPanel'
afterEach(cleanup)
it('keeps report month selection in the reports workspace', () => {
  const onMonthChange = vi.fn()
  render(<ReportsPanel month="2026-10" onMonthChange={onMonthChange} report={null} loading={false} onDownloadCsv={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Report month'), { target: { value: '2026-09' } })
  expect(onMonthChange).toHaveBeenCalledWith('2026-09')
})
it('keeps crew date selection in the crews workspace', () => {
  const onDateChange = vi.fn()
  render(<TeamsPanel selectedDate="2026-10-30" onDateChange={onDateChange} teams={[]} technicians={[]} serviceLines={[]} schedule={null} canEdit onToggleAvailability={vi.fn()} onUpdateDailyCrew={vi.fn()} onUpdateDefaultCrew={vi.fn()} onCreateTeam={vi.fn()} onArchiveTeam={vi.fn()} onCreateTechnician={vi.fn()} onUpdateTechnician={vi.fn()} onArchiveTechnician={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Crew date'), { target: { value: '2026-10-29' } })
  expect(onDateChange).toHaveBeenCalledWith('2026-10-29')
})

it('retains partial report-month text without notifying the parent and announces loading', () => {
  const onMonthChange = vi.fn()
  const { rerender } = render(<ReportsPanel month="2026-10" onMonthChange={onMonthChange} report={null} loading onDownloadCsv={vi.fn()} />)
  const input = screen.getByLabelText('Report month') as HTMLInputElement
  // Exercise the text-input fallback used by browsers without month support.
  input.type = 'text'
  for (const value of ['2', '2026-', '2026-13', '']) fireEvent.change(input, { target: { value } })
  expect(onMonthChange).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '2026-09' } })
  expect(onMonthChange).toHaveBeenCalledExactlyOnceWith('2026-09')
  expect(screen.getByRole('status').textContent).toContain('Loading monthly report')
  rerender(<ReportsPanel month="2026-08" onMonthChange={onMonthChange} report={null} loading={false} onDownloadCsv={vi.fn()} />)
  expect(input.value).toBe('2026-08')
})

it('closes daily selections on date change and disables all crew edits during load or failure', () => {
  const tech = { id: 1, name: 'Synthetic driver', primary_trade: 'General', skills: ['General'], is_driver: true, active: true, availability: 'available' }
  const team = { id: 1, name: 'Synthetic crew', today_crew_name: 'Synthetic driver', region_preference: null, crew_type: 'general', active: true, archived: false, service_line_ids: [], service_line_names: [], has_driver: true, default_has_driver: true, skills: ['General'], default_skills: ['General'], daily_override: false, technicians: [tech], default_technicians: [tech] }
  const props = { selectedDate: '2026-10-30', onDateChange: vi.fn(), teams: [team], technicians: [tech], serviceLines: [], schedule: null, canEdit: true, onToggleAvailability: vi.fn(), onUpdateDailyCrew: vi.fn(), onUpdateDefaultCrew: vi.fn(), onCreateTeam: vi.fn(), onArchiveTeam: vi.fn(), onCreateTechnician: vi.fn(), onUpdateTechnician: vi.fn(), onArchiveTechnician: vi.fn() }
  const { rerender } = render(<TeamsPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Today' }))
  expect(screen.getByRole('button', { name: 'Save Today Only' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Crew date'), { target: { value: '2026-10-29' } })
  expect(screen.queryByRole('button', { name: 'Save Today Only' })).toBeNull()
  expect(props.onUpdateDailyCrew).not.toHaveBeenCalled()
  rerender(<TeamsPanel {...props} selectedDate="2026-10-29" loading />)
  expect(screen.getByRole('status').textContent).toContain('Loading crews')
  for (const control of document.querySelectorAll('button, input')) expect(control.matches(':disabled')).toBe(true)
  const onRetry = vi.fn()
  rerender(<TeamsPanel {...props} selectedDate="2026-10-29" loadError="Retry before editing crews." onRetry={onRetry} />)
  expect(screen.getByRole('button', { name: 'Edit Today' }).matches(':disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Retry crews' }))
  expect(onRetry).toHaveBeenCalledOnce()
})
