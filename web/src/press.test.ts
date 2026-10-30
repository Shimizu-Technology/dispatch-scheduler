/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('keeps primary and destructive press colors semantic and feedback within 160ms, with reduced motion', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
  expect(css).toContain('--primary-press: var(--jmi-red-deep)')
  expect(css).toMatch(/button\.button-primary:active:not\(:disabled\)\s*\{[^}]*background-color: var\(--primary-press\)/)
  expect(css).toMatch(/button\.button-destructive:active:not\(:disabled\)\s*\{[^}]*background-color: var\(--danger-press\)/)
  expect(css).toContain('button:not(.button-primary, .button-destructive, .button-action, .button-action-deep, .button-success):active')
  expect(Number(css.match(/--motion-feedback: (\d+)ms/)?.[1])).toBeLessThanOrEqual(160)
  expect(css).toContain('transition-property: background-color, border-color, color, opacity')
  expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*button, a, summary \{ transition-duration: 0ms/)
})

it('constrains native Safari date and time fields without replacing their picker', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
  const nativeRule = css.match(/input:is\(\[type="date"\][\s\S]*?\n\}/)?.[0] || ''
  for (const type of ['date', 'month', 'time', 'datetime-local']) expect(nativeRule).toContain(`[type="${type}"]`)
  for (const declaration of ['min-width: 0', 'width: 100%', 'max-width: 100%', 'height: 44px', '-webkit-appearance: none', 'text-align: left']) expect(nativeRule).toContain(declaration)
  expect(css).toContain('input::-webkit-date-and-time-value { min-width: 0; text-align: left; }')
})
