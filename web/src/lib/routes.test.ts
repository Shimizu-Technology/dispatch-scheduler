import { describe, expect, it } from 'vitest'
import { dateFromMonth, routeForLocation } from './routes'

function location(pathname: string, search = '', hash = '') {
  return { pathname, search, hash }
}

describe('routeForLocation', () => {
  it('parses dated dispatch routes', () => {
    expect(routeForLocation(location('/dispatch/2026-07-10'))).toMatchObject({ section: 'dispatch', date: '2026-07-10' })
  })

  it('parses PM and report month routes', () => {
    expect(routeForLocation(location('/pm/month/2026-06'))).toMatchObject({ section: 'pm-tasks', month: '2026-06' })
    expect(routeForLocation(location('/reports/monthly/2026-05'))).toMatchObject({ section: 'reports', month: '2026-05' })
  })

  it('preserves work-order query and deep-link state', () => {
    expect(routeForLocation(location('/work-orders/42', '?open=true'))).toEqual({
      section: 'work-orders', path: '/work-orders/42', search: '?open=true', workOrderId: 42,
    })
  })

  it('migrates a supported legacy hash and falls back safely', () => {
    expect(routeForLocation(location('/', '', '#teams'))).toEqual({ section: 'teams', path: '/crews', search: '' })
    expect(routeForLocation(location('/not-a-route'))).toEqual({ section: 'overview', path: '/dashboard', search: '' })
  })
})

describe('dateFromMonth', () => {
  it('clamps the selected day to the target month', () => {
    expect(dateFromMonth('2026-02', '2026-01-31')).toBe('2026-02-28')
    expect(dateFromMonth('2028-02', '2028-01-31')).toBe('2028-02-29')
  })
})
