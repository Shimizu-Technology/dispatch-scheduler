import { useState } from 'react'
import type { FormEvent } from 'react'
import { Edit3, Plus } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { ServiceLine, ServiceLineInput } from '../types'

function emptyForm(): ServiceLineInput {
  return { name: '', position: 10, active: true, notes: '' }
}

function formFromServiceLine(serviceLine: ServiceLine): ServiceLineInput {
  return {
    name: serviceLine.name,
    position: serviceLine.position,
    active: serviceLine.active,
    notes: serviceLine.notes || '',
  }
}

function ServiceLineForm({ initialValues, saving, onCancel, onSubmit }: { initialValues: ServiceLineInput; saving: boolean; onCancel: () => void; onSubmit: (values: ServiceLineInput) => Promise<void> }) {
  const [values, setValues] = useState(initialValues)

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onSubmit(values)
  }

  return <form onSubmit={(event) => void submit(event)} className="border-b border-[var(--line)] bg-[var(--surface-subtle)] p-3 sm:p-4">
    <div className="grid gap-3 lg:grid-cols-[1fr_120px_130px]">
      <label className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">
        Name
        <input required value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink)]" />
      </label>
      <label className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">
        Order
        <input type="number" value={values.position || 0} onChange={(event) => setValues((current) => ({ ...current, position: Number(event.target.value) }))} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink)]" />
      </label>
      <label className="mt-6 inline-flex items-center rounded-xl border border-[var(--brand-line)] bg-[var(--paper)] px-3 py-2 text-sm font-bold text-[var(--ink)]">
        <input type="checkbox" checked={values.active ?? true} onChange={(event) => setValues((current) => ({ ...current, active: event.target.checked }))} className="mr-2 accent-[var(--jmi-blue)]" /> Active
      </label>
    </div>
    <label className="mt-3 block text-xs font-extrabold  tracking-normal text-[var(--muted)]">
      Notes
      <textarea value={values.notes || ''} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[var(--ink-soft)]" />
    </label>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button disabled={saving} type="submit" className="w-full rounded-2xl button-action bg-[var(--jmi-blue)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] transition-colors  hover:bg-[var(--jmi-blue-deep)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{saving ? 'Saving...' : 'Save Service Line'}</button>
      <button disabled={saving} type="button" onClick={onCancel} className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--ink-soft)] transition-colors  hover:bg-[var(--surface-hover)] sm:w-auto">Cancel</button>
    </div>
  </form>
}

export function ServiceLinesPanel({ serviceLines, canAdmin, saving, onCreate, onUpdate }: { serviceLines: ServiceLine[]; canAdmin: boolean; saving: boolean; onCreate: (values: ServiceLineInput) => Promise<void>; onUpdate: (id: number, values: ServiceLineInput) => Promise<void> }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ServiceLine | null>(null)
  const initialValues = editing ? formFromServiceLine(editing) : emptyForm()

  async function submit(values: ServiceLineInput) {
    if (editing) await onUpdate(editing.id, values)
    else await onCreate(values)
    setEditing(null)
    setShowForm(false)
  }

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Admin configuration"
      title="Service Lines"
      description="Manage contract and division labels used to organize work orders, filter the queue, and group reports."
      action={canAdmin ? <button type="button" onClick={() => { setEditing(null); setShowForm(true) }} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl button-primary bg-[var(--primary)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] transition-colors  hover:bg-[var(--jmi-red-deep)] sm:w-auto"><Plus size={16} /> New Service Line</button> : undefined}
    />
    {showForm && <ServiceLineForm key={editing?.id || 'new'} initialValues={initialValues} saving={saving} onCancel={() => { setEditing(null); setShowForm(false) }} onSubmit={submit} />}
    <div className="space-y-3 p-3 sm:p-4">
      {serviceLines.map((line) => <article key={line.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3 shadow-none sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-extrabold text-[var(--ink)]">{line.name}</h3>
              <Badge kind={line.active ? 'approved' : 'closed'}>{line.active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">Order {line.position} • {line.work_orders_count} work orders</p>
            {line.notes && <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{line.notes}</p>}
          </div>
          {canAdmin && <button type="button" onClick={() => { setEditing(line); setShowForm(true) }} className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-line)] bg-[var(--paper)] px-3 py-1 text-xs font-extrabold text-[var(--jmi-blue)] transition-colors  hover:bg-[var(--jmi-blue-soft)]"><Edit3 size={13} /> Edit</button>}
        </div>
      </article>)}
      {serviceLines.length === 0 && <p className="rounded-2xl border border-dashed border-[var(--brand-line)] bg-[var(--surface-subtle)] p-6 text-sm font-semibold text-[var(--ink-soft)]">No active service lines yet.</p>}
    </div>
  </Card>
}
