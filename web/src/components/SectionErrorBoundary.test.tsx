import { isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SectionErrorBoundary } from './SectionErrorBoundary'

describe('SectionErrorBoundary', () => {
  it('shows its children until a section throws', () => {
    const boundary = new SectionErrorBoundary({ children: 'Loaded section', resetKey: 'overview' })

    expect(boundary.render()).toBe('Loaded section')
  })

  it('provides a recovery panel after an error', () => {
    const boundary = new SectionErrorBoundary({ children: 'Loaded section', resetKey: 'overview' })
    boundary.state = SectionErrorBoundary.getDerivedStateFromError()

    expect(isValidElement(boundary.render())).toBe(true)
    expect(renderToStaticMarkup(boundary.render())).toContain('This workspace section could not load.')
    expect(renderToStaticMarkup(boundary.render())).toContain('Reload section')
  })
})
