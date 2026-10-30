import { describe, expect, it } from 'vitest'
import { RequestGuard } from './requestGuard'

describe('independent request ownership', () => {
  it('allows independent resources while superseding older reads of the same resource', () => {
    const guard = new RequestGuard()
    const oldQueue = guard.begin('queue')
    const report = guard.begin('report')
    const newQueue = guard.begin('queue')
    expect(oldQueue()).toBe(false)
    expect(newQueue()).toBe(true)
    expect(report()).toBe(true)
  })

  it('does not revive disposed requests after reactivation or matching context returns', () => {
    const guard = new RequestGuard()
    let date = '2026-09-01'
    const old = guard.begin('schedule', () => date === '2026-09-01')
    date = '2026-10-01'
    expect(old()).toBe(false)
    guard.dispose()
    guard.activate()
    date = '2026-09-01'
    const current = guard.begin('schedule')
    expect(old()).toBe(false)
    expect(current()).toBe(true)
  })
})
