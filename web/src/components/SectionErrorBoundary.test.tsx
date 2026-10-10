// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SectionErrorBoundary } from './SectionErrorBoundary'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function BrokenSection(): never { throw new Error('Simulated section download failure') }

it('contains a failed section and recovers when navigation changes', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const view = render(<SectionErrorBoundary resetKey="reports"><BrokenSection /></SectionErrorBoundary>)
  expect(screen.getByRole('alert').textContent).toContain('This workspace section could not load.')
  expect(screen.getByRole('button', { name: 'Reload section' })).toBeTruthy()
  view.rerender(<SectionErrorBoundary resetKey="work-orders"><p>Work orders available</p></SectionErrorBoundary>)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('Work orders available')).toBeTruthy()
})
