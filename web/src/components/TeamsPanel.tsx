import { useState } from 'react'
import { Archive, Plus } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { ServiceLine, Team, TeamInput, Technician, TechnicianInput } from '../types'

type CrewMode = 'today' | 'defaults' | 'roster'
const tradeOptions = ['General', 'Plumbing', 'HVAC', 'Electrical', 'Carpentry', 'Painting', 'Landscaping', 'Masonry', 'Helper']

function technicianLabel(tech: Technician) {
  return `${tech.name}${tech.is_driver ? ' (driver)' : ''}`
}

function crewName(technicians: Technician[]) {
  return technicians.map((tech) => tech.name).join(' / ') || 'No technicians assigned'
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

function ServiceLineChecklist({ serviceLines, selectedIds, onToggle }: { serviceLines: ServiceLine[]; selectedIds: number[]; onToggle: (id: number) => void }) {
  return <div className="flex flex-wrap gap-2">
    {serviceLines.filter((line) => line.active).map((line) => {
      const checked = selectedIds.includes(line.id)
      return <button key={line.id} type="button" onClick={() => onToggle(line.id)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${checked ? 'border-[#244393] bg-[#244393] text-white' : 'border-[rgba(36,67,147,0.16)] bg-white text-[#244393] hover:bg-[#e8eefc]'}`}>{line.name}</button>
    })}
  </div>
}

function TodayCrewEditor({ team, technicians, saving, onCancel, onSave, onUseDefault }: { team: Team; technicians: Technician[]; saving: boolean; onCancel: () => void; onSave: (technicianIds: number[]) => Promise<void>; onUseDefault: () => Promise<void> }) {
  const [selectedIds, setSelectedIds] = useState<number[]>(team.technicians.map((tech) => tech.id))
  const toggleTechnician = (id: number) => setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id])

  return <div className="mt-4 rounded-2xl border border-[rgba(36,67,147,0.14)] bg-[#f8faff] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-display text-sm font-extrabold text-[#172033]">Edit today&apos;s crew</p>
        <p className="text-xs font-semibold text-[#64748b]">Use this for call-outs, borrowed drivers, or one-day swaps. It does not change the default crew.</p>
      </div>
      {team.daily_override && <Badge kind="approved">Daily override active</Badge>}
    </div>
    <div className="mt-3"><TechnicianChecklist technicians={technicians.filter((tech) => tech.active)} selectedIds={selectedIds} onToggle={toggleTechnician} /></div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => onSave(selectedIds)} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : 'Save Today Only'}</button>
      {team.daily_override && <button type="button" disabled={saving} onClick={onUseDefault} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-wait disabled:opacity-60">Use Default Crew</button>}
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
    </div>
  </div>
}

function CrewEditor({ team, technicians, serviceLines, saving, onCancel, onSave }: { team?: Team; technicians: Technician[]; serviceLines: ServiceLine[]; saving: boolean; onCancel: () => void; onSave: (values: TeamInput) => Promise<void> }) {
  const [name, setName] = useState(team?.name || '')
  const [region, setRegion] = useState(team?.region_preference || '')
  const [crewType, setCrewType] = useState(team?.crew_type || 'general')
  const [selectedIds, setSelectedIds] = useState<number[]>(team?.default_technicians.map((tech) => tech.id) || [])
  const [serviceLineIds, setServiceLineIds] = useState<number[]>(team?.service_line_ids || [])
  const [validation, setValidation] = useState('')
  const toggleTechnician = (id: number) => setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id])
  const toggleServiceLine = (id: number) => setServiceLineIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id])

  async function submit() {
    if (selectedIds.length === 0) return setValidation('Select at least one active technician for the default crew.')
    setValidation('')
    await onSave({ name: name.trim() || undefined, region_preference: region.trim() || undefined, crew_type: crewType.trim() || 'general', technician_ids: selectedIds, service_line_ids: serviceLineIds })
  }

  return <div className="rounded-2xl border border-[rgba(36,67,147,0.14)] bg-[#f8faff] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-display text-sm font-extrabold text-[#172033]">{team ? 'Edit default crew' : 'Create a new default crew'}</p>
        <p className="text-xs font-semibold text-[#64748b]">Set normal members, driver coverage, region, and contract-line preferences for dispatch scoring.</p>
      </div>
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-full border border-[rgba(23,32,51,0.12)] bg-white px-3 py-1 text-xs font-extrabold text-[#334155] transition hover:bg-slate-50 disabled:opacity-60">Close</button>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <label className="space-y-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Crew label<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Auto: selected technician names" className="mt-1 w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033] outline-none transition focus:border-[#244393]" /></label>
      <label className="space-y-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Preferred region<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="North, Central, South..." className="mt-1 w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033] outline-none transition focus:border-[#244393]" /></label>
      <label className="space-y-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Crew type<input value={crewType} onChange={(event) => setCrewType(event.target.value)} placeholder="General, PM, Landscaping..." className="mt-1 w-full rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#172033] outline-none transition focus:border-[#244393]" /></label>
    </div>
    <div className="mt-4"><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Preferred service lines</p><ServiceLineChecklist serviceLines={serviceLines} selectedIds={serviceLineIds} onToggle={toggleServiceLine} /></div>
    <div className="mt-4"><TechnicianChecklist technicians={technicians.filter((tech) => tech.active)} selectedIds={selectedIds} onToggle={toggleTechnician} /></div>
    {validation && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{validation}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : team ? 'Save Default Crew' : 'Create Default Crew'}</button>
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
    </div>
  </div>
}

function TechnicianForm({ technician, saving, onCancel, onSave }: { technician?: Technician; saving: boolean; onCancel: () => void; onSave: (values: TechnicianInput) => Promise<void> }) {
  const [name, setName] = useState(technician?.name || '')
  const [primaryTrade, setPrimaryTrade] = useState(technician?.primary_trade || 'General')
  const [skillsText, setSkillsText] = useState((technician?.skills?.length ? technician.skills : [technician?.primary_trade || 'General']).filter(Boolean).join(', '))
  const [isDriver, setIsDriver] = useState(Boolean(technician?.is_driver))
  const [active, setActive] = useState(technician?.active ?? true)
  const [notes, setNotes] = useState(technician?.notes || '')
  const [validation, setValidation] = useState('')

  async function submit() {
    if (!name.trim()) return setValidation('Technician name is required.')
    setValidation('')
    await onSave({ name: name.trim(), primary_trade: primaryTrade, skills: skillsText.split(',').map((skill) => skill.trim()).filter(Boolean), is_driver: isDriver, active, notes })
  }

  return <div className="rounded-2xl border border-[rgba(36,67,147,0.14)] bg-[#f8faff] p-4">
    <div className="grid gap-3 md:grid-cols-4">
      <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Name<input value={name} onChange={(event) => setName(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" /></label>
      <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Primary trade<select value={primaryTrade} onChange={(event) => setPrimaryTrade(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]">{tradeOptions.map((trade) => <option key={trade} value={trade}>{trade}</option>)}</select></label>
      <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Skills<input value={skillsText} onChange={(event) => setSkillsText(event.target.value)} placeholder="General, HVAC" className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#172033]" /></label>
      <div className="flex items-end gap-4 pb-2 text-sm font-extrabold text-[#334155]"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={isDriver} onChange={(event) => setIsDriver(event.target.checked)} className="h-4 w-4 accent-[#244393]" /> Driver</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-[#244393]" /> Active</label></div>
    </div>
    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[#334155]" /></label>
    {validation && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{validation}</p>}
    <div className="mt-4 flex gap-2"><button type="button" disabled={saving} onClick={() => void submit()} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save Technician'}</button><button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155]">Cancel</button></div>
  </div>
}

export function TeamsPanel({ teams, technicians, serviceLines, canEdit, savingTechnicianId, savingTeamId, onToggleAvailability, onUpdateDailyCrew, onUpdateDefaultCrew, onCreateTeam, onArchiveTeam, onCreateTechnician, onUpdateTechnician, onArchiveTechnician }: { teams: Team[]; technicians: Technician[]; serviceLines: ServiceLine[]; canEdit: boolean; savingTechnicianId?: number | null; savingTeamId?: number | null; onToggleAvailability: (tech: Technician) => Promise<void>; onUpdateDailyCrew: (teamId: number, technicianIds: number[] | null) => Promise<void>; onUpdateDefaultCrew: (teamId: number, values: TeamInput) => Promise<void>; onCreateTeam: (values: TeamInput) => Promise<void>; onArchiveTeam: (teamId: number) => Promise<void>; onCreateTechnician: (values: TechnicianInput) => Promise<void>; onUpdateTechnician: (technicianId: number, values: TechnicianInput) => Promise<void>; onArchiveTechnician: (technicianId: number) => Promise<void> }) {
  const [mode, setMode] = useState<CrewMode>('today')
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)
  const [creatingCrew, setCreatingCrew] = useState(false)
  const [editingTechnicianId, setEditingTechnicianId] = useState<number | 'new' | null>(null)

  return <Card className="overflow-hidden">
    <PanelHeader eyebrow="Crew readiness" title="Crews" description={mode === 'today' ? 'Morning workflow: mark call-outs and adjust actual crews for the selected date.' : mode === 'defaults' ? 'Admin setup: manage reusable crews, driver coverage, regions, and service-line preferences.' : 'Technician roster: manage people, skills, driver capability, and active status.'} action={canEdit ? <button type="button" disabled={savingTeamId != null || savingTechnicianId != null} onClick={() => { if (mode === 'roster') setEditingTechnicianId('new'); else { setMode('defaults'); setCreatingCrew((value) => !value); setEditingTeamId(null) } }} className="inline-flex items-center gap-2 rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60"><Plus size={16} /> {mode === 'roster' ? 'New Technician' : creatingCrew ? 'Close New Crew' : 'New Default Crew'}</button> : undefined} />
    <div className="border-b border-[rgba(23,32,51,0.1)] bg-white px-4 py-3"><div className="flex flex-wrap gap-2">
      {(['today', 'defaults', 'roster'] as CrewMode[]).map((tab) => <button key={tab} type="button" onClick={() => { setMode(tab); setEditingTeamId(null); setCreatingCrew(false); setEditingTechnicianId(null) }} className={`rounded-2xl px-4 py-2 font-display text-sm font-extrabold capitalize transition ${mode === tab ? 'bg-[#244393] text-white shadow-[0_10px_24px_rgba(36,67,147,0.18)]' : 'border border-[rgba(36,67,147,0.16)] bg-white text-[#244393] hover:bg-[#e8eefc]'}`}>{tab === 'today' ? "Today's Crews" : tab === 'defaults' ? 'Default Crew Setup' : 'Technician Roster'}</button>)}
    </div></div>
    <div className="space-y-4 p-4">
      {mode === 'today' && <div className="rounded-2xl border border-blue-100 bg-[#f8faff] px-4 py-3 text-sm font-semibold text-[#334155]">Click a technician name to mark them out today. Edit Today for borrowed drivers or one-day swaps.</div>}
      {creatingCrew && mode === 'defaults' && <CrewEditor technicians={technicians} serviceLines={serviceLines} saving={savingTeamId === 0} onCancel={() => setCreatingCrew(false)} onSave={async (values) => { await onCreateTeam(values); setCreatingCrew(false) }} />}
      {mode === 'today' && teams.map((team) => {
        const isEditing = editingTeamId === team.id
        const todayName = team.today_crew_name || crewName(team.technicians)
        return <div key={team.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-extrabold tracking-tight text-[#172033]">Today: {todayName}</h3>{team.daily_override && <Badge kind="approved">Daily override</Badge>}{team.archived && <Badge kind="waiting">Archived</Badge>}</div><p className="mt-1 text-xs font-semibold text-[#64748b]">Default crew: {crewName(team.default_technicians)}</p><p className="mt-1 text-xs font-semibold text-[#64748b]">Skills: {team.skills.slice(0, 4).join(', ') || 'Skills pending'}</p></div><div className="flex flex-wrap justify-end gap-2">{team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}{canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => setEditingTeamId(isEditing ? null : team.id)} className="rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393]">{isEditing ? 'Close' : 'Edit Today'}</button>}</div></div><div className="mt-3 flex flex-wrap gap-2">{team.technicians.map((tech) => <button key={tech.id} type="button" disabled={!canEdit || savingTechnicianId != null} onClick={() => onToggleAvailability(tech)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold ${tech.availability === 'unavailable' ? 'border-red-200 bg-red-50 text-red-700 line-through' : 'border-[#d8dee8] bg-[#f8faff] text-[#334155]'}`}>{savingTechnicianId === tech.id ? 'Saving...' : technicianLabel(tech)}</button>)}</div>{isEditing && <TodayCrewEditor team={team} technicians={technicians} saving={savingTeamId === team.id} onCancel={() => setEditingTeamId(null)} onSave={async (ids) => { await onUpdateDailyCrew(team.id, ids); setEditingTeamId(null) }} onUseDefault={async () => { await onUpdateDailyCrew(team.id, null); setEditingTeamId(null) }} />}</div>
      })}
      {mode === 'defaults' && teams.map((team) => {
        const isEditing = editingTeamId === team.id
        return <div key={team.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-extrabold tracking-tight text-[#172033]">Default: {crewName(team.default_technicians)}</h3>{team.daily_override && <Badge kind="assessment">Today differs</Badge>}</div><p className="mt-1 text-xs font-semibold text-[#64748b]">Label: {team.name}{team.region_preference ? ` · Region: ${team.region_preference}` : ''} · Type: {team.crew_type}</p><p className="mt-1 text-xs font-semibold text-[#64748b]">Service lines: {team.service_line_names.join(', ') || 'Any'} · Skills: {team.default_skills.slice(0, 4).join(', ') || 'Skills pending'}</p></div><div className="flex flex-wrap justify-end gap-2">{team.default_has_driver ? <Badge kind="approved">Default Driver OK</Badge> : <Badge kind="p1">Default No Driver</Badge>}{canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => setEditingTeamId(isEditing ? null : team.id)} className="rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393]">{isEditing ? 'Close' : 'Edit Default'}</button>}{canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => void onArchiveTeam(team.id)} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700"><Archive size={13} /> Archive</button>}</div></div><div className="mt-3 flex flex-wrap gap-2">{team.default_technicians.map((tech) => <span key={tech.id} className="rounded-full border border-[#d8dee8] bg-[#f8faff] px-3 py-1.5 text-xs font-extrabold text-[#334155]">{technicianLabel(tech)}</span>)}</div>{isEditing && <div className="mt-4"><CrewEditor team={team} technicians={technicians} serviceLines={serviceLines} saving={savingTeamId === team.id} onCancel={() => setEditingTeamId(null)} onSave={async (values) => { await onUpdateDefaultCrew(team.id, values); setEditingTeamId(null) }} /></div>}</div>
      })}
      {mode === 'roster' && <div className="space-y-3">
        {editingTechnicianId === 'new' && <TechnicianForm saving={savingTechnicianId === 0} onCancel={() => setEditingTechnicianId(null)} onSave={async (values) => { await onCreateTechnician(values); setEditingTechnicianId(null) }} />}
        {technicians.map((tech) => <div key={tech.id} className={`rounded-2xl border p-4 ${tech.active ? 'border-[rgba(23,32,51,0.1)] bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-extrabold text-[#172033]">{technicianLabel(tech)}</h3>{tech.active ? <Badge kind="approved">Active</Badge> : <Badge kind="closed">Inactive</Badge>}{tech.availability === 'unavailable' && <Badge kind="waiting">Out today</Badge>}</div><p className="mt-1 text-xs font-semibold text-[#64748b]">{tech.primary_trade} · {tech.skills.join(', ') || 'Skills pending'}{tech.notes ? ` · ${tech.notes}` : ''}</p></div><div className="flex gap-2">{canEdit && <button type="button" onClick={() => setEditingTechnicianId(editingTechnicianId === tech.id ? null : tech.id)} className="rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393]">{editingTechnicianId === tech.id ? 'Close' : 'Edit'}</button>}{canEdit && tech.active && <button type="button" disabled={savingTechnicianId != null} onClick={() => void onArchiveTechnician(tech.id)} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-extrabold text-red-700"><Archive size={13} /> Archive</button>}</div></div>{editingTechnicianId === tech.id && <div className="mt-4"><TechnicianForm technician={tech} saving={savingTechnicianId === tech.id} onCancel={() => setEditingTechnicianId(null)} onSave={async (values) => { await onUpdateTechnician(tech.id, values); setEditingTechnicianId(null) }} /></div>}</div>)}
      </div>}
    </div>
  </Card>
}
