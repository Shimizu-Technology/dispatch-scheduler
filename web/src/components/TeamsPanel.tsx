import { useState } from 'react'
import { Badge, Card, PanelHeader } from './ui'
import type { Team, TeamInput, Technician } from '../types'

type CrewMode = 'today' | 'defaults'

function technicianLabel(tech: Technician) {
  return `${tech.name}${tech.is_driver ? ' (driver)' : ''}`
}

function crewName(technicians: Technician[]) {
  return technicians.map((tech) => tech.name).join(' / ') || 'No technicians assigned'
}

function hasUnavailable(technicians: Technician[]) {
  return technicians.some((tech) => tech.availability === 'unavailable')
}

function TechnicianChecklist({ technicians, selectedIds, onToggle }: { technicians: Technician[]; selectedIds: number[]; onToggle: (technicianId: number) => void }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {technicians.map((tech) => {
      const checked = selectedIds.includes(tech.id)
      return <label key={tech.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${checked ? 'border-[#244393] bg-white text-[#172033]' : 'border-[rgba(23,32,51,0.1)] bg-white/70 text-[#526071] hover:border-blue-200'}`}>
        <input type="checkbox" checked={checked} onChange={() => onToggle(tech.id)} className="mt-1 h-4 w-4 accent-[#244393]" />
        <span>
          <span className="font-display block font-extrabold">{technicianLabel(tech)}</span>
          <span className="block text-xs font-semibold text-[#64748b]">{tech.skills.join(', ') || tech.primary_trade || 'Skills pending'}{tech.availability === 'unavailable' ? ' • unavailable today' : ''}</span>
        </span>
      </label>
    })}
  </div>
}

function TodayCrewEditor({ team, technicians, saving, onCancel, onSave, onUseDefault }: { team: Team; technicians: Technician[]; saving: boolean; onCancel: () => void; onSave: (technicianIds: number[]) => Promise<void>; onUseDefault: () => Promise<void> }) {
  const [selectedIds, setSelectedIds] = useState<number[]>(team.technicians.map((tech) => tech.id))

  function toggleTechnician(technicianId: number) {
    setSelectedIds((current) => current.includes(technicianId) ? current.filter((id) => id !== technicianId) : [ ...current, technicianId ])
  }

  return <div className="mt-4 rounded-2xl border border-[rgba(36,67,147,0.14)] bg-[#f8faff] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-display text-sm font-extrabold text-[#172033]">Edit today&apos;s crew</p>
        <p className="text-xs font-semibold text-[#64748b]">Use this for call-outs, borrowed drivers, or one-day swaps. It does not change the default crew.</p>
      </div>
      {team.daily_override && <Badge kind="approved">Daily override active</Badge>}
    </div>

    <div className="mt-3">
      <TechnicianChecklist technicians={technicians} selectedIds={selectedIds} onToggle={toggleTechnician} />
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => onSave(selectedIds)} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : 'Save Today Only'}</button>
      {team.daily_override && <button type="button" disabled={saving} onClick={onUseDefault} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-wait disabled:opacity-60">Use Default Crew</button>}
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
    </div>
  </div>
}

function DefaultCrewEditor({ team, technicians, saving, onCancel, onSave }: { team: Team; technicians: Technician[]; saving: boolean; onCancel: () => void; onSave: (values: TeamInput) => Promise<void> }) {
  const [name, setName] = useState(team.name)
  const [region, setRegion] = useState(team.region_preference || '')
  const [selectedIds, setSelectedIds] = useState<number[]>(team.default_technicians.map((tech) => tech.id))
  const [validation, setValidation] = useState('')

  function toggleTechnician(technicianId: number) {
    setSelectedIds((current) => current.includes(technicianId) ? current.filter((id) => id !== technicianId) : [ ...current, technicianId ])
  }

  async function submit() {
    if (selectedIds.length === 0) {
      setValidation('Select at least one technician for the default crew.')
      return
    }
    setValidation('')
    await onSave({ name: name.trim() || undefined, region_preference: region.trim() || undefined, technician_ids: selectedIds })
  }

  return <div className="mt-4 rounded-2xl border border-[rgba(36,67,147,0.14)] bg-[#f8faff] p-4">
    <div>
      <p className="font-display text-sm font-extrabold text-[#172033]">Edit default crew</p>
      <p className="text-xs font-semibold text-[#64748b]">Use this for the normal reusable crew setup. Existing daily overrides stay separate.</p>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">
        Crew label
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Auto: selected technician names" className="mt-1 w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033] outline-none transition focus:border-[#244393]" />
      </label>
      <label className="space-y-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">
        Preferred region
        <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="North, Central, South..." className="mt-1 w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033] outline-none transition focus:border-[#244393]" />
      </label>
    </div>
    <div className="mt-4">
      <TechnicianChecklist technicians={technicians} selectedIds={selectedIds} onToggle={toggleTechnician} />
    </div>
    {validation && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{validation}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : 'Save Default Crew'}</button>
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
    </div>
  </div>
}

function CreateCrewForm({ technicians, saving, onCancel, onCreate }: { technicians: Technician[]; saving: boolean; onCancel: () => void; onCreate: (values: TeamInput) => Promise<void> }) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [validation, setValidation] = useState('')

  function toggleTechnician(technicianId: number) {
    setSelectedIds((current) => current.includes(technicianId) ? current.filter((id) => id !== technicianId) : [ ...current, technicianId ])
  }

  async function submit() {
    if (selectedIds.length === 0) {
      setValidation('Select at least one technician for the new crew.')
      return
    }
    setValidation('')
    await onCreate({ name: name.trim() || undefined, region_preference: region.trim() || undefined, technician_ids: selectedIds })
  }

  return <div className="rounded-2xl border border-[rgba(36,67,147,0.14)] bg-[#f8faff] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-display text-sm font-extrabold text-[#172033]">Create a new default crew</p>
        <p className="text-xs font-semibold text-[#64748b]">Use this when John needs a new reusable crew, not just a one-day swap.</p>
      </div>
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-full border border-[rgba(23,32,51,0.12)] bg-white px-3 py-1 text-xs font-extrabold text-[#334155] transition hover:bg-slate-50 disabled:opacity-60">Close</button>
    </div>

    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">
        Crew label optional
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Auto: selected technician names" className="mt-1 w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033] outline-none transition focus:border-[#244393]" />
      </label>
      <label className="space-y-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">
        Preferred region optional
        <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="North, Central, South..." className="mt-1 w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033] outline-none transition focus:border-[#244393]" />
      </label>
    </div>

    <div className="mt-4">
      <TechnicianChecklist technicians={technicians} selectedIds={selectedIds} onToggle={toggleTechnician} />
    </div>
    {validation && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{validation}</p>}

    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{saving ? 'Creating...' : 'Create Default Crew'}</button>
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
    </div>
  </div>
}

export function TeamsPanel({ teams, technicians, canEdit, savingTechnicianId, savingTeamId, onToggleAvailability, onUpdateDailyCrew, onUpdateDefaultCrew, onCreateTeam }: { teams: Team[]; technicians: Technician[]; canEdit: boolean; savingTechnicianId?: number | null; savingTeamId?: number | null; onToggleAvailability: (tech: Technician) => Promise<void>; onUpdateDailyCrew: (teamId: number, technicianIds: number[] | null) => Promise<void>; onUpdateDefaultCrew: (teamId: number, values: TeamInput) => Promise<void>; onCreateTeam: (values: TeamInput) => Promise<void> }) {
  const [mode, setMode] = useState<CrewMode>('today')
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)
  const [creatingCrew, setCreatingCrew] = useState(false)

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Crew readiness"
      title="Crews"
      description={mode === 'today' ? 'Morning workflow: mark call-outs and adjust the actual crews for the selected date.' : 'Admin setup: manage the normal reusable crews that future schedules start from.'}
      action={canEdit ? <button type="button" disabled={savingTeamId != null} onClick={() => { setMode('defaults'); setCreatingCrew((value) => !value); setEditingTeamId(null) }} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{creatingCrew ? 'Close New Crew' : 'New Default Crew'}</button> : undefined}
    />
    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setMode('today'); setEditingTeamId(null); setCreatingCrew(false) }} className={`rounded-2xl px-4 py-2 font-display text-sm font-extrabold transition ${mode === 'today' ? 'bg-[#244393] text-white shadow-[0_10px_24px_rgba(36,67,147,0.18)]' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393] hover:bg-[#e8eefc]'}`}>Today&apos;s Crews</button>
        <button type="button" onClick={() => { setMode('defaults'); setEditingTeamId(null) }} className={`rounded-2xl px-4 py-2 font-display text-sm font-extrabold transition ${mode === 'defaults' ? 'bg-[#244393] text-white shadow-[0_10px_24px_rgba(36,67,147,0.18)]' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393] hover:bg-[#e8eefc]'}`}>Default Crew Setup</button>
      </div>
    </div>

    <div className="space-y-4 p-4">
      {mode === 'today' && <div className="rounded-2xl border border-blue-100 bg-[#f8faff] px-4 py-3 text-sm font-semibold text-[#334155]">
        Click a technician name to mark them out today. Click again to mark them available.
      </div>}

      {creatingCrew && mode === 'defaults' && <CreateCrewForm
        technicians={technicians}
        saving={savingTeamId === 0}
        onCancel={() => setCreatingCrew(false)}
        onCreate={async (values) => {
          await onCreateTeam(values)
          setCreatingCrew(false)
        }}
      />}

      {mode === 'today' && teams.slice(0, 16).map((team) => {
        const isEditing = editingTeamId === team.id
        const savingThisTeam = savingTeamId === team.id
        const defaultName = crewName(team.default_technicians)
        const todayName = team.today_crew_name || crewName(team.technicians)
        return <div key={team.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-extrabold tracking-tight text-[#172033]">Today: {todayName}</h3>
                {team.daily_override && <Badge kind="approved">Daily override</Badge>}
                {hasUnavailable(team.technicians) && <Badge kind="waiting">Call-out</Badge>}
              </div>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">Default crew: {defaultName}</p>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">Today&apos;s available skills: {team.skills.slice(0, 4).join(', ') || 'Skills pending'}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}
              {canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => setEditingTeamId(isEditing ? null : team.id)} className="rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-wait disabled:opacity-60">{isEditing ? 'Close' : 'Edit Today'}</button>}
            </div>
          </div>
          <div className="mt-3">
            <p className="mb-2 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#64748b]">Click name to mark out / available</p>
            <div className="flex flex-wrap gap-2">
              {team.technicians.length === 0 && <span className="rounded-full border border-dashed border-[rgba(23,32,51,0.18)] px-3 py-1.5 text-xs font-extrabold text-[#64748b]">No technicians assigned today</span>}
              {team.technicians.map((tech) => {
                const unavailable = tech.availability === 'unavailable'
                return <button key={tech.id} type="button" disabled={!canEdit || savingTechnicianId != null} onClick={() => onToggleAvailability(tech)} title={canEdit ? (unavailable ? 'Click to mark available today' : 'Click to mark out today') : undefined} aria-label={`${unavailable ? 'Mark available today' : 'Mark out today'}: ${tech.name}`} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition disabled:cursor-not-allowed ${unavailable ? 'border-red-200 bg-red-50 text-red-700 line-through hover:-translate-y-0.5 hover:bg-red-100' : 'border-[#d8dee8] bg-[#f8faff] text-[#334155] hover:-translate-y-0.5 hover:border-blue-200 hover:bg-[#e8eefc]'}`}>
                  {savingTechnicianId === tech.id ? 'Saving...' : technicianLabel(tech)}
                </button>
              })}
            </div>
          </div>
          {isEditing && <TodayCrewEditor
            team={team}
            technicians={technicians}
            saving={savingThisTeam}
            onCancel={() => setEditingTeamId(null)}
            onSave={async (technicianIds) => {
              await onUpdateDailyCrew(team.id, technicianIds)
              setEditingTeamId(null)
            }}
            onUseDefault={async () => {
              await onUpdateDailyCrew(team.id, null)
              setEditingTeamId(null)
            }}
          />}
        </div>
      })}

      {mode === 'defaults' && teams.slice(0, 16).map((team) => {
        const isEditing = editingTeamId === team.id
        const savingThisTeam = savingTeamId === team.id
        const defaultName = crewName(team.default_technicians)
        return <div key={team.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-extrabold tracking-tight text-[#172033]">Default: {defaultName}</h3>
                {team.daily_override && <Badge kind="assessment">Today differs</Badge>}
              </div>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">Crew label: {team.name}{team.region_preference ? ` · Preferred region: ${team.region_preference}` : ''}</p>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">Default skills: {team.default_skills.slice(0, 4).join(', ') || 'Skills pending'}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {team.default_has_driver ? <Badge kind="approved">Default Driver OK</Badge> : <Badge kind="p1">Default No Driver</Badge>}
              {canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => setEditingTeamId(isEditing ? null : team.id)} className="rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-wait disabled:opacity-60">{isEditing ? 'Close' : 'Edit Default'}</button>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.default_technicians.length === 0 && <span className="rounded-full border border-dashed border-[rgba(23,32,51,0.18)] px-3 py-1.5 text-xs font-extrabold text-[#64748b]">No default technicians assigned</span>}
            {team.default_technicians.map((tech) => <span key={tech.id} className="rounded-full border border-[#d8dee8] bg-[#f8faff] px-3 py-1.5 text-xs font-extrabold text-[#334155]">{technicianLabel(tech)}</span>)}
          </div>
          {isEditing && <DefaultCrewEditor
            team={team}
            technicians={technicians}
            saving={savingThisTeam}
            onCancel={() => setEditingTeamId(null)}
            onSave={async (values) => {
              await onUpdateDefaultCrew(team.id, values)
              setEditingTeamId(null)
            }}
          />}
        </div>
      })}
    </div>
  </Card>
}
