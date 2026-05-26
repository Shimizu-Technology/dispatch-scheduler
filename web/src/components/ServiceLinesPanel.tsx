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

  return <form onSubmit={(event) => void submit(event)} className="border-b border-[rgba(23,32,51,0.1)] bg-[#f8faff] p-4">
    <div className="grid gap-3 lg:grid-cols-[1fr_120px_130px]">
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Name
        <input required value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
        Order
        <input type="number" value={values.position || 0} onChange={(event) => setValues((current) => ({ ...current, position: Number(event.target.value) }))} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" />
      </label>
      <label className="mt-6 inline-flex items-center rounded-xl border border-[rgba(36,67,147,0.12)] bg-white px-3 py-2 text-sm font-bold text-[#172033]">
        <input type="checkbox" checked={values.active ?? true} onChange={(event) => setValues((current) => ({ ...current, active: event.target.checked }))} className="mr-2 accent-[#244393]" /> Active
      </label>
    </div>
    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.11em] text-[#64748b]">
      Notes
      <textarea value={values.notes || ''} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" />
    </label>
    <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={saving} type="submit" className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : 'Save Service Line'}</button>
      <button disabled={saving} type="button" onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50">Cancel</button>
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
      description="Manage JMI's contract/division labels without hard-coding Mobil, HKR, or school assumptions into the app. Work orders can be filtered and reported by this list."
      action={canAdmin ? <button type="button" onClick={() => { setEditing(null); setShowForm(true) }} className="inline-flex items-center gap-2 rounded-2xl bg-[#d84332] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#bf3228]"><Plus size={16} /> New Service Line</button> : undefined}
    />
    {showForm && <ServiceLineForm key={editing?.id || 'new'} initialValues={initialValues} saving={saving} onCancel={() => { setEditing(null); setShowForm(false) }} onSubmit={submit} />}
    <div className="space-y-3 p-4">
      {serviceLines.map((line) => <article key={line.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-extrabold text-[#172033]">{line.name}</h3>
              <Badge kind={line.active ? 'approved' : 'closed'}>{line.active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="mt-1 text-sm font-semibold text-[#64748b]">Order {line.position} • {line.work_orders_count} work orders</p>
            {line.notes && <p className="mt-2 text-sm leading-6 text-[#526071]">{line.notes}</p>}
          </div>
          {canAdmin && <button type="button" onClick={() => { setEditing(line); setShowForm(true) }} className="inline-flex items-center gap-1 rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc]"><Edit3 size={13} /> Edit</button>}
        </div>
      </article>)}
      {serviceLines.length === 0 && <p className="rounded-2xl border border-dashed border-[rgba(36,67,147,0.22)] bg-[#f8faff] p-6 text-sm font-semibold text-[#526071]">No active service lines yet.</p>}
    </div>
  </Card>
}
