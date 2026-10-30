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
