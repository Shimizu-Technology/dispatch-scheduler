import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { WORK_ORDER_VIEWS, type WorkOrderView } from '../lib/workOrderViews'

export function MoreViews({ views, matchesView, onSelect }: { views: WorkOrderView[]; matchesView: (view: WorkOrderView) => boolean; onSelect: (view: WorkOrderView) => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const initialIndex = useRef(0)
  const id = useId()
  const close = (returnFocus = false) => { setOpen(false); if (returnFocus) trigger.current?.focus({ preventScroll: true }) }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!trigger.current || !menu.current) return
      const rect = trigger.current.getBoundingClientRect()
      const panel = menu.current
      const margin = 8
      panel.style.maxHeight = `${window.innerHeight - margin * 2}px`
      panel.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - panel.offsetWidth - margin))}px`
      const below = rect.bottom + 4
      panel.style.top = `${Math.max(margin, Math.min(below, window.innerHeight - panel.offsetHeight - margin))}px`
    }
    place()
    menu.current?.querySelectorAll<HTMLButtonElement>('button')[initialIndex.current]?.focus({ preventScroll: true })
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  return <>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { initialIndex.current = 0; setOpen((value) => !value) }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); initialIndex.current = event.key === 'ArrowUp' ? views.length - 1 : 0; setOpen(true) }
      if (event.key === 'Escape') close(true)
    }} className="flex min-h-11 items-center rounded-xl px-1 text-xs font-semibold text-[var(--jmi-blue)]">More views <span aria-hidden="true" className="ml-1">⌄</span></button>
    {open && createPortal(<section aria-label="Work order views"><div ref={menu} id={id} role="menu" aria-label="More views" className="fixed z-40 grid w-56 max-w-[calc(100vw-16px)] gap-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] p-2 shadow-[var(--shadow-float)]" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') || [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }
    }}>{views.map((view) => <button key={view} type="button" role="menuitemradio" aria-checked={matchesView(view)} onClick={() => { onSelect(view); close(true) }} className="min-h-11 rounded-lg px-3 text-left text-sm text-[var(--jmi-blue)]">{WORK_ORDER_VIEWS[view].label}</button>)}</div></section>, document.body)}
  </>
}

export function FilterDisclosure({ selected, onCancel, children }: { selected: boolean; onCancel: () => void; children: (close: () => void) => ReactNode }) {
  const [phone, setPhone] = useState(() => window.matchMedia?.('(max-width: 767px)').matches ?? false)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const cancelRef = useRef(onCancel)
  useLayoutEffect(() => { cancelRef.current = onCancel }, [onCancel])
  const id = useId()
  const close = () => setOpen(false)
  const cancel = () => { onCancel(); close() }
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 767px)')
    const change = () => { setPhone(query?.matches ?? false); setOpen(false) }
    query?.addEventListener('change', change)
    return () => query?.removeEventListener('change', change)
  }, [])
  useLayoutEffect(() => {
    if (!phone || !open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controls = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)') || [])
    controls()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelRef.current(); setOpen(false) }
      if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
      }
    }
    // Also contain focus moved by assistive technology or other programmatic callers.
    const focus = (event: FocusEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target)) controls()[0]?.focus() }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focus)
    const returnTarget = trigger.current
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focus)
      returnTarget?.focus({ preventScroll: true })
    }
  }, [phone, open])
  const label = <>Filters and sorting{selected ? ' · selected' : ''}</>
  if (!phone) return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[var(--jmi-blue)]">{label}</summary>{children(close)}</details>
  return <>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="mt-2 flex min-h-11 items-center text-sm font-semibold text-[var(--jmi-blue)]">{label}</button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-end bg-[var(--scrim-ink)]/48" onClick={(event) => { if (event.target === event.currentTarget) cancel() }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} className="filter-sheet flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--paper)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-4 py-2"><h2 id={id} className="text-lg font-bold text-[var(--ink)]">Filters and sorting</h2><button type="button" aria-label="Close filters" onClick={cancel} className="rounded-xl p-2 text-[var(--ink-soft)]"><X size={20} /></button></div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4">{children(close)}</div>
      </div>
    </div>, document.body)}
  </>
}
