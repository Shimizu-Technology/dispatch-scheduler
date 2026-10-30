import { useMemo, useState } from 'react'
import { Archive, Plus } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import type { DispatchItem, DispatchSchedule, ServiceLine, Team, TeamInput, Technician, TechnicianInput } from '../types'

type CrewMode = 'today' | 'people' | 'defaults' | 'roster'
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
      return <label key={tech.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${checked ? 'border-[var(--jmi-blue)] bg-[var(--paper)] text-[var(--ink)]' : 'border-[var(--line)] bg-[var(--paper)]/70 text-[var(--ink-soft)] hover:border-[var(--info-border)]'}`}>
        <input type="checkbox" checked={checked} onChange={() => onToggle(tech.id)} className="mt-1 h-4 w-4 accent-[var(--jmi-blue)]" />
        <span>
          <span className="font-display block font-extrabold">{technicianLabel(tech)}</span>
          <span className="block text-xs font-semibold text-[var(--muted)]">{tech.skills.join(', ') || tech.primary_trade || 'Skills pending'}{tech.availability === 'unavailable' ? ' • unavailable today' : ''}</span>
        </span>
      </label>
    })}
  </div>
}

function ServiceLineChecklist({ serviceLines, selectedIds, onToggle }: { serviceLines: ServiceLine[]; selectedIds: number[]; onToggle: (id: number) => void }) {
  return <div className="flex flex-wrap gap-2">
    {serviceLines.filter((line) => line.active).map((line) => {
      const checked = selectedIds.includes(line.id)
      return <button key={line.id} type="button" onClick={() => onToggle(line.id)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors ${checked ? 'border-[var(--jmi-blue)] button-action bg-[var(--jmi-blue)] text-[var(--paper)]' : 'border-[var(--brand-line)] bg-[var(--paper)] text-[var(--jmi-blue)] hover:bg-[var(--jmi-blue-soft)]'}`}>{line.name}</button>
    })}
  </div>
}

function TodayCrewEditor({ team, technicians, saving, onCancel, onSave, onUseDefault }: { team: Team; technicians: Technician[]; saving: boolean; onCancel: () => void; onSave: (technicianIds: number[]) => Promise<void>; onUseDefault: () => Promise<void> }) {
  const [selectedIds, setSelectedIds] = useState<number[]>(team.technicians.map((tech) => tech.id))
  const toggleTechnician = (id: number) => setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id])

  return <div className="mt-4 rounded-2xl border border-[var(--brand-line)] bg-[var(--surface-subtle)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-display text-sm font-extrabold text-[var(--ink)]">Edit today&apos;s crew</p>
        <p className="text-xs font-semibold text-[var(--muted)]">Use this for call-outs, borrowed drivers, or one-day swaps. It does not change the default crew.</p>
      </div>
      {team.daily_override && <Badge kind="approved">Daily override active</Badge>}
    </div>
    <div className="mt-3"><TechnicianChecklist technicians={technicians.filter((tech) => tech.active)} selectedIds={selectedIds} onToggle={toggleTechnician} /></div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => onSave(selectedIds)} className="rounded-2xl button-action bg-[var(--jmi-blue)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] transition-colors  hover:bg-[var(--jmi-blue-deep)] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : 'Save Today Only'}</button>
      {team.daily_override && <button type="button" disabled={saving} onClick={onUseDefault} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--jmi-blue)] transition-colors  hover:bg-[var(--jmi-blue-soft)] disabled:cursor-wait disabled:opacity-60">Use Default Crew</button>}
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--ink-soft)] transition-colors  hover:bg-[var(--surface-hover)] disabled:opacity-60">Cancel</button>
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

  return <div className="rounded-2xl border border-[var(--brand-line)] bg-[var(--surface-subtle)] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-display text-sm font-extrabold text-[var(--ink)]">{team ? 'Edit default crew' : 'Create a new default crew'}</p>
        <p className="text-xs font-semibold text-[var(--muted)]">Set normal members, driver coverage, region, and contract-line preferences for dispatch scoring.</p>
      </div>
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 text-xs font-extrabold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-60">Close</button>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <label className="space-y-1 text-xs font-extrabold  tracking-normal text-[var(--muted)]">Crew label<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Auto: selected technician names" className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--ink)] outline-none transition-colors focus:border-[var(--jmi-blue)]" /></label>
      <label className="space-y-1 text-xs font-extrabold  tracking-normal text-[var(--muted)]">Preferred region<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="North, Central, South..." className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--ink)] outline-none transition-colors focus:border-[var(--jmi-blue)]" /></label>
      <label className="space-y-1 text-xs font-extrabold  tracking-normal text-[var(--muted)]">Crew type<input value={crewType} onChange={(event) => setCrewType(event.target.value)} placeholder="General, PM, Landscaping..." className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--ink)] outline-none transition-colors focus:border-[var(--jmi-blue)]" /></label>
    </div>
    <div className="mt-4"><p className="mb-2 text-xs font-extrabold  tracking-normal text-[var(--muted)]">Preferred service lines</p><ServiceLineChecklist serviceLines={serviceLines} selectedIds={serviceLineIds} onToggle={toggleServiceLine} /></div>
    <div className="mt-4"><TechnicianChecklist technicians={technicians.filter((tech) => tech.active)} selectedIds={selectedIds} onToggle={toggleTechnician} /></div>
    {validation && <p className="mt-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold button-destructive text-[var(--danger-text)]">{validation}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-2xl button-action bg-[var(--jmi-blue)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] transition-colors  hover:bg-[var(--jmi-blue-deep)] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : team ? 'Save Default Crew' : 'Create Default Crew'}</button>
      <button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--ink-soft)] transition-colors  hover:bg-[var(--surface-hover)] disabled:opacity-60">Cancel</button>
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

  return <div className="rounded-2xl border border-[var(--brand-line)] bg-[var(--surface-subtle)] p-4">
    <div className="grid gap-3 md:grid-cols-4">
      <label className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">Name<input value={name} onChange={(event) => setName(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink)]" /></label>
      <label className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">Primary trade<select value={primaryTrade} onChange={(event) => setPrimaryTrade(event.target.value)} className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink)]">{tradeOptions.map((trade) => <option key={trade} value={trade}>{trade}</option>)}</select></label>
      <label className="text-xs font-extrabold  tracking-normal text-[var(--muted)]">Skills<input value={skillsText} onChange={(event) => setSkillsText(event.target.value)} placeholder="General, HVAC" className="field-control mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ink)]" /></label>
      <div className="flex items-end gap-4 pb-2 text-sm font-extrabold text-[var(--ink-soft)]"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={isDriver} onChange={(event) => setIsDriver(event.target.checked)} className="h-4 w-4 accent-[var(--jmi-blue)]" /> Driver</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-[var(--jmi-blue)]" /> Active</label></div>
    </div>
    <label className="mt-3 block text-xs font-extrabold  tracking-normal text-[var(--muted)]">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="field-control mt-1 min-h-16 w-full rounded-xl px-3 py-2 text-sm text-[var(--ink-soft)]" /></label>
    {validation && <p className="mt-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold button-destructive text-[var(--danger-text)]">{validation}</p>}
    <div className="mt-4 flex gap-2"><button type="button" disabled={saving} onClick={() => void submit()} className="rounded-2xl button-action bg-[var(--jmi-blue)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] disabled:opacity-60">{saving ? 'Saving...' : 'Save Technician'}</button><button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--ink-soft)]">Cancel</button></div>
  </div>
}

function assignmentTitle(item: DispatchItem) {
  if (item.kind === 'work_order' && item.work_order) return `${item.work_order.location} - ${item.work_order.title}`
  if (item.pm_task) return `${item.pm_task.location} - ${item.pm_task.task_name}`
  return 'Assigned stop'
}

function TechnicianDayView({ technicians, schedule }: { technicians: Technician[]; schedule: DispatchSchedule | null }) {
  const assignmentsByTechnician = useMemo(() => {
    const assignments: Record<number, DispatchItem[]> = {}
    schedule?.items.forEach((item) => {
      item.assigned_technicians.forEach((snapshot) => {
        assignments[snapshot.technician_id] ||= []
        assignments[snapshot.technician_id].push(item)
      })
    })
    Object.values(assignments).forEach((items) => items.sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || '') || a.order_index - b.order_index))
    return assignments
  }, [schedule])

  const visibleTechnicians = technicians
    .filter((tech) => tech.active || assignmentsByTechnician[tech.id]?.length)
    .sort((a, b) => a.name.localeCompare(b.name))

  return <div className="space-y-3">
    <div className="rounded-2xl border border-[var(--info-soft-strong)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-semibold text-[var(--ink-soft)]">Person day view uses the immutable dispatch snapshots for the loaded schedule, so later crew edits do not rewrite what was assigned for this date.</div>
    {!schedule && <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 text-sm font-semibold text-[var(--muted)]">No dispatch schedule is loaded for this date yet.</div>}
    {visibleTechnicians.map((tech) => {
      const assignments = assignmentsByTechnician[tech.id] || []
      return <article key={tech.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/88 p-4 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-extrabold text-[var(--ink)]">{technicianLabel(tech)}</h3>{tech.availability === 'unavailable' && <Badge kind="waiting">Out today</Badge>}{!tech.active && <Badge kind="closed">Inactive</Badge>}</div>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{tech.primary_trade} · {tech.skills.join(', ') || 'Skills pending'}</p>
          </div>
          <Badge kind={assignments.length > 0 ? 'approved' : 'closed'}>{assignments.length} stop{assignments.length === 1 ? '' : 's'}</Badge>
        </div>
        {assignments.length === 0 ? <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-bold text-[var(--muted)]">No dispatch assignment on the loaded schedule.</p> : <div className="mt-3 space-y-2">
          {assignments.map((item) => <div key={item.id} className="rounded-xl border border-[var(--brand-line)] bg-[var(--surface-subtle)] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-display text-sm font-extrabold text-[var(--ink)]">{item.scheduled_time || 'TBD'} · {assignmentTitle(item)}</p><Badge kind={item.kind === 'work_order' ? item.work_order?.normalized_priority || 'approved' : 'scheduled'}>{item.kind === 'work_order' ? item.work_order?.normalized_priority || 'WO' : 'PM'}</Badge></div>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{item.team_name} · Outcome: {item.outcome_status.replaceAll('_', ' ')}</p>
          </div>)}
        </div>}
      </article>
    })}
  </div>
}

export function TeamsPanel({ loading = false, loadError = '', onRetry, selectedDate, onDateChange, teams, technicians, serviceLines, schedule, canEdit, savingTechnicianId, savingTeamId, onToggleAvailability, onUpdateDailyCrew, onUpdateDefaultCrew, onCreateTeam, onArchiveTeam, onCreateTechnician, onUpdateTechnician, onArchiveTechnician }: { loading?: boolean; loadError?: string; onRetry?: () => void; selectedDate: string; onDateChange: (date: string) => void; teams: Team[]; technicians: Technician[]; serviceLines: ServiceLine[]; schedule: DispatchSchedule | null; canEdit: boolean; savingTechnicianId?: number | null; savingTeamId?: number | null; onToggleAvailability: (tech: Technician) => Promise<void>; onUpdateDailyCrew: (teamId: number, technicianIds: number[] | null) => Promise<void>; onUpdateDefaultCrew: (teamId: number, values: TeamInput) => Promise<void>; onCreateTeam: (values: TeamInput) => Promise<void>; onArchiveTeam: (teamId: number) => Promise<void>; onCreateTechnician: (values: TechnicianInput) => Promise<void>; onUpdateTechnician: (technicianId: number, values: TechnicianInput) => Promise<void>; onArchiveTechnician: (technicianId: number) => Promise<void> }) {
  const [mode, setMode] = useState<CrewMode>('today')
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)
  const [creatingCrew, setCreatingCrew] = useState(false)
  const [editingTechnicianId, setEditingTechnicianId] = useState<number | 'new' | null>(null)

  return <><fieldset disabled={loading || Boolean(loadError)} className="min-w-0"><Card className="overflow-hidden">
    <div className="border-b border-[var(--border)] px-3 py-2"><label className="grid min-w-0 w-full gap-2 text-sm font-semibold sm:w-auto sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-3">Crew date<input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) { setEditingTeamId(null); onDateChange(event.target.value) } }} className="field-control rounded-xl px-3 py-2" /></label></div>
    {loading && <p role="status" className="p-3 text-sm">Loading crews for this date...</p>}
    {loadError && <p role="alert" className="p-3 text-sm">{loadError}</p>}
    <PanelHeader eyebrow="Crew readiness" title="Crews" description={mode === 'today' ? 'Morning workflow: mark call-outs and adjust actual crews for the selected date.' : mode === 'people' ? 'Technician day view: see where each person is assigned on the loaded dispatch schedule.' : mode === 'defaults' ? 'Admin setup: manage reusable crews, driver coverage, regions, and service-line preferences.' : 'Technician roster: manage people, skills, driver capability, and active status.'} action={canEdit && mode !== 'people' ? <button type="button" disabled={savingTeamId != null || savingTechnicianId != null} onClick={() => { if (mode === 'roster') setEditingTechnicianId('new'); else { setMode('defaults'); setCreatingCrew((value) => !value); setEditingTeamId(null) } }} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl button-action bg-[var(--jmi-blue)] px-4 py-2.5 font-display text-sm font-extrabold text-[var(--paper)] transition-colors  hover:bg-[var(--jmi-blue-deep)] disabled:cursor-wait disabled:opacity-60 sm:w-auto"><Plus size={16} /> {mode === 'roster' ? 'New Technician' : creatingCrew ? 'Close New Crew' : 'New Default Crew'}</button> : undefined} />
    <div className="border-b border-[var(--line)] bg-[var(--paper)] px-3 py-3 sm:px-4"><div className="flex flex-wrap gap-2">
      {(['today', 'people', 'defaults', 'roster'] as CrewMode[]).map((tab) => <button key={tab} type="button" onClick={() => { setMode(tab); setEditingTeamId(null); setCreatingCrew(false); setEditingTechnicianId(null) }} className={`flex-1 rounded-2xl px-3 py-2 font-display text-xs font-extrabold capitalize transition-colors sm:flex-none sm:px-4 sm:text-sm ${mode === tab ? 'button-action bg-[var(--jmi-blue)] text-[var(--paper)] shadow-none' : 'border border-[var(--brand-line)] bg-[var(--paper)] text-[var(--jmi-blue)] hover:bg-[var(--jmi-blue-soft)]'}`}>{tab === 'today' ? "Today's Crews" : tab === 'people' ? 'Person Day View' : tab === 'defaults' ? 'Default Crew Setup' : 'Technician Roster'}</button>)}
    </div></div>
    <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
      {mode === 'today' && <div className="rounded-2xl border border-[var(--info-soft-strong)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-semibold text-[var(--ink-soft)]">Click a technician name to mark them out today. Edit Today for borrowed drivers or one-day swaps.</div>}
      {creatingCrew && mode === 'defaults' && <CrewEditor technicians={technicians} serviceLines={serviceLines} saving={savingTeamId === 0} onCancel={() => setCreatingCrew(false)} onSave={async (values) => { await onCreateTeam(values); setCreatingCrew(false) }} />}
      {mode === 'people' && <TechnicianDayView technicians={technicians} schedule={schedule} />}
      {mode === 'today' && teams.map((team) => {
        const isEditing = editingTeamId === team.id
        const todayName = team.today_crew_name || crewName(team.technicians)
        return <div key={team.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/88 p-3 shadow-none sm:p-4"><div className="flex flex-col items-start justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-extrabold tracking-tight text-[var(--ink)]">Today: {todayName}</h3>{team.daily_override && <Badge kind="approved">Daily override</Badge>}{team.archived && <Badge kind="waiting">Archived</Badge>}</div><p className="mt-1 text-xs font-semibold text-[var(--muted)]">Default crew: {crewName(team.default_technicians)}</p><p className="mt-1 text-xs font-semibold text-[var(--muted)]">Skills: {team.skills.slice(0, 4).join(', ') || 'Skills pending'}</p></div><div className="flex flex-wrap justify-start gap-2 sm:justify-end">{team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}{canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => setEditingTeamId(isEditing ? null : team.id)} className="rounded-full border border-[var(--brand-line)] bg-[var(--paper)] px-3 py-1 text-xs font-extrabold text-[var(--jmi-blue)]">{isEditing ? 'Close' : 'Edit Today'}</button>}</div></div><div className="mt-3 flex flex-wrap gap-2">{team.technicians.map((tech) => <button key={tech.id} type="button" disabled={!canEdit || savingTechnicianId != null} onClick={() => onToggleAvailability(tech)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold ${tech.availability === 'unavailable' ? 'border-[var(--danger-border)] bg-[var(--danger-soft)] button-destructive text-[var(--danger-text)] line-through' : 'border-[var(--line-strong)] bg-[var(--surface-subtle)] text-[var(--ink-soft)]'}`}>{savingTechnicianId === tech.id ? 'Saving...' : technicianLabel(tech)}</button>)}</div>{isEditing && <TodayCrewEditor team={team} technicians={technicians} saving={savingTeamId === team.id} onCancel={() => setEditingTeamId(null)} onSave={async (ids) => { await onUpdateDailyCrew(team.id, ids); setEditingTeamId(null) }} onUseDefault={async () => { await onUpdateDailyCrew(team.id, null); setEditingTeamId(null) }} />}</div>
      })}
      {mode === 'defaults' && teams.map((team) => {
        const isEditing = editingTeamId === team.id
        return <div key={team.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]/88 p-3 shadow-none sm:p-4"><div className="flex flex-col items-start justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-extrabold tracking-tight text-[var(--ink)]">Default: {crewName(team.default_technicians)}</h3>{team.daily_override && <Badge kind="assessment">Today differs</Badge>}</div><p className="mt-1 text-xs font-semibold text-[var(--muted)]">Label: {team.name}{team.region_preference ? ` · Region: ${team.region_preference}` : ''} · Type: {team.crew_type}</p><p className="mt-1 text-xs font-semibold text-[var(--muted)]">Service lines: {team.service_line_names.join(', ') || 'Any'} · Skills: {team.default_skills.slice(0, 4).join(', ') || 'Skills pending'}</p></div><div className="flex flex-wrap justify-start gap-2 sm:justify-end">{team.default_has_driver ? <Badge kind="approved">Default Driver OK</Badge> : <Badge kind="p1">Default No Driver</Badge>}{canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => setEditingTeamId(isEditing ? null : team.id)} className="rounded-full border border-[var(--brand-line)] bg-[var(--paper)] px-3 py-1 text-xs font-extrabold text-[var(--jmi-blue)]">{isEditing ? 'Close' : 'Edit Default'}</button>}{canEdit && <button type="button" disabled={savingTeamId != null} onClick={() => void onArchiveTeam(team.id)} className="inline-flex items-center gap-1 rounded-full border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-1 text-xs font-extrabold button-destructive text-[var(--danger-text)]"><Archive size={13} /> Archive</button>}</div></div><div className="mt-3 flex flex-wrap gap-2">{team.default_technicians.map((tech) => <span key={tech.id} className="rounded-full border border-[var(--line-strong)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-extrabold text-[var(--ink-soft)]">{technicianLabel(tech)}</span>)}</div>{isEditing && <div className="mt-4"><CrewEditor team={team} technicians={technicians} serviceLines={serviceLines} saving={savingTeamId === team.id} onCancel={() => setEditingTeamId(null)} onSave={async (values) => { await onUpdateDefaultCrew(team.id, values); setEditingTeamId(null) }} /></div>}</div>
      })}
      {mode === 'roster' && <div className="space-y-3">
        {editingTechnicianId === 'new' && <TechnicianForm saving={savingTechnicianId === 0} onCancel={() => setEditingTechnicianId(null)} onSave={async (values) => { await onCreateTechnician(values); setEditingTechnicianId(null) }} />}
        {technicians.map((tech) => <div key={tech.id} className={`rounded-2xl border p-4 ${tech.active ? 'border-[var(--line)] bg-[var(--paper)]' : 'border-[var(--border)] bg-[var(--surface-hover)] opacity-75'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-extrabold text-[var(--ink)]">{technicianLabel(tech)}</h3>{tech.active ? <Badge kind="approved">Active</Badge> : <Badge kind="closed">Inactive</Badge>}{tech.availability === 'unavailable' && <Badge kind="waiting">Out today</Badge>}</div><p className="mt-1 text-xs font-semibold text-[var(--muted)]">{tech.primary_trade} · {tech.skills.join(', ') || 'Skills pending'}{tech.notes ? ` · ${tech.notes}` : ''}</p></div><div className="flex gap-2">{canEdit && <button type="button" onClick={() => setEditingTechnicianId(editingTechnicianId === tech.id ? null : tech.id)} className="rounded-full border border-[var(--brand-line)] bg-[var(--paper)] px-3 py-1 text-xs font-extrabold text-[var(--jmi-blue)]">{editingTechnicianId === tech.id ? 'Close' : 'Edit'}</button>}{canEdit && tech.active && <button type="button" disabled={savingTechnicianId != null} onClick={() => void onArchiveTechnician(tech.id)} className="inline-flex items-center gap-1 rounded-full border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-1 text-xs font-extrabold button-destructive text-[var(--danger-text)]"><Archive size={13} /> Archive</button>}</div></div>{editingTechnicianId === tech.id && <div className="mt-4"><TechnicianForm technician={tech} saving={savingTechnicianId === tech.id} onCancel={() => setEditingTechnicianId(null)} onSave={async (values) => { await onUpdateTechnician(tech.id, values); setEditingTechnicianId(null) }} /></div>}</div>)}
      </div>}
    </div>
  </Card></fieldset>
    {loadError && <button type="button" onClick={onRetry} className="min-h-11 px-3 underline">Retry crews</button>}
  </>
}
