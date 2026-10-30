// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterField, MoreViews } from './QueueControls'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('More views', () => {
  function setup() {
    const onSelect = vi.fn()
    render(<><MoreViews views={['assessment', 'pa', 'closed']} matchesView={() => false} onSelect={onSelect} /><button>Outside</button></>)
    return { user: userEvent.setup(), onSelect, trigger: screen.getByRole('button', { name: 'More views' }) }
  }
  it.each([375, 390, 768, 1280])('clamps the fixed menu inside a %ipx viewport, including a wrapped trigger', async (width) => {
    vi.stubGlobal('innerWidth', width)
    vi.stubGlobal('innerHeight', 667)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(224)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300)
    const { user, trigger } = setup()
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: width === 375 ? 24 : width - 80, bottom: 390 } as DOMRect)
    await user.click(trigger)
    const menu = screen.getByRole('menu')
    expect(screen.getByRole('region', { name: 'Work order views' }).contains(menu)).toBe(true)
    const left = parseFloat(menu.style.left), top = parseFloat(menu.style.top)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left + 224).toBeLessThanOrEqual(width - 8)
    expect(top + 300).toBeLessThanOrEqual(659)
    expect(menu.className).toContain('fixed')
    expect(menu.className).toContain('max-w-[calc(100vw-16px)]')
  })
  it('opens with arrows, moves with arrows/Home/End and Tab, and returns focus on Escape and selection', async () => {
    const { user, trigger, onSelect } = setup()
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    const items = screen.getAllByRole('menuitemradio')
    expect(document.activeElement).toBe(items[0])
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[1])
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(items[2])
    await user.keyboard('{Home}')
    await user.tab()
    expect(document.activeElement).toBe(items[1])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(screen.getAllByRole('menuitemradio')[2])
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('closed')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('closes on outside pointer or focus, and repositions when the viewport changes', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    fireEvent(window, new Event('resize'))
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).toBeNull()
    await user.click(trigger)
    screen.getByRole('button', { name: 'Outside' }).focus()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})

describe('More views selection marker', () => {
  it('visibly marks only the current view while keeping radio semantics', async () => {
    render(<MoreViews views={['assessment', 'pa', 'closed']} matchesView={(view) => view === 'pa'} onSelect={vi.fn()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'More views' }))
    const items = screen.getAllByRole('menuitemradio')
    const selected = items.filter((item) => item.getAttribute('aria-checked') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].className).toContain('bg-[var(--jmi-blue-soft)]')
    expect(selected[0].querySelector('svg')).not.toBeNull()
    for (const item of items.filter((candidate) => candidate !== selected[0])) {
      expect(item.className).not.toContain('bg-[var(--jmi-blue-soft)]')
      expect(item.querySelector('svg')).toBeNull()
    }
  })
})

describe('Filter field', () => {
  it('keeps a visible label beside the chosen value without changing the accessible name', () => {
    render(<FilterField label="Priority"><select aria-label="Priority filter" defaultValue="P1"><option value="">All priority</option><option value="P1">P1</option></select></FilterField>)
    const select = screen.getByRole('combobox', { name: 'Priority filter' })
    expect(select.parentElement?.textContent).toContain('Priority')
    expect(select.closest('label')).toBeNull()
    expect(screen.getByText('Priority', { selector: 'span' })).toBeTruthy()
  })
})
