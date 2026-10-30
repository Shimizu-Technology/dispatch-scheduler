// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ActivityPanel } from './ActivityPanel'
import { WhatsAppExport } from './WhatsAppExport'
import type { AuditEvent, DispatchSchedule } from '../types'
afterEach(cleanup)

it.each([['PmTask', 'PM Task'], ['WorkOrder', 'Work Order'], ['Team', 'Team']])('shows %s as a readable record type', (record_type, label) => {
  render(<ActivityPanel events={[{ id: 1, action: 'record.updated', record_type, record_id: 5, metadata: {}, occurred_at: null } as AuditEvent]} />)
  expect(screen.getByText(`System • ${label} #5`)).toBeTruthy()
})

it('names and focuses the scrollable WhatsApp message region', () => {
  render(<WhatsAppExport schedule={{ status: 'finalized' } as DispatchSchedule} message="SYNTHETIC CREW MESSAGE" crews={[]} copied={false} working={false} canEdit={false} onCopy={vi.fn()} onMarkSent={vi.fn()} onOpenDispatch={vi.fn()} />)
  const region = screen.getByRole('region', { name: 'WhatsApp message' })
  expect(region.tabIndex).toBe(0)
  region.focus()
  expect(document.activeElement).toBe(region)
})
