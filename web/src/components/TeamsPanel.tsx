import { useState } from 'react'
import { Badge, Card, PanelHeader } from './ui'
import type { Team, Technician } from '../types'

function technicianLabel(tech: Technician) {
  return `${tech.name}${tech.is_driver ? ' (driver)' : ''}`
}

function CrewEditor({ team, technicians, saving, onCancel, onSave, onUseDefault }: { team: Team; technicians: Technician[]; saving: boolean; onCancel: () => void; onSave: (technicianIds: number[]) => Promise<void>; onUseDefault: () => Promise<void> }) {
  const [selectedIds, setSelectedIds] = useState<number[]>(team.technicians.map((tech) => tech.id))

  function toggleTechnician(technicianId: number) {
    setSelectedIds((current) => current.includes(technicianId) ? current.filter((id) => id !== technicianId) : [ ...current, technicianId ])
  }

  return <div className="mt-4 rounded-2xl border border-[rgba(36,67,147,0.14)] bg-[#f8faff] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-display text-sm font-extrabold text-[#172033]">Edit today&apos;s crew</p>
        <p className="text-xs font-semibold text-[#64748b]">Choose who is actually assigned to this crew for the selected date.</p>
      </div>
      {team.daily_override && <Badge kind="approved">Daily override active</Badge>}
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {technicians.map((tech) => {
        const checked = selectedIds.includes(tech.id)
        return <label key={tech.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${checked ? 'border-[#244393] bg-white text-[#172033]' : 'border-[rgba(23,32,51,0.1)] bg-white/70 text-[#526071] hover:border-blue-200'}`}>
          <input type="checkbox" checked={checked} onChange={() => toggleTechnician(tech.id)} className="mt-1 h-4 w-4 accent-[#244393]" />
          <span>
            <span className="font-display block font-extrabold">{technicianLabel(tech)}</span>
            <span className="block text-xs font-semibold text-[#64748b]">{tech.skills.join(', ') || tech.primary_trade || 'Skills pending'}{tech.availability === 'unavailable' ? ' • unavailable' : ''}</span>
          </span>
        </label>
      })}
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={saving} onClick={() => onSave(selectedIds)} className="rounded-2xl bg-[#244393] px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#172b63] disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving...' : 'Save Daily Crew'}</button>
      {team.daily_override && <button disabled={saving} onClick={onUseDefault} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-wait disabled:opacity-60">Use Default Crew</button>}
      <button disabled={saving} onClick={onCancel} className="rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white px-4 py-2.5 font-display text-sm font-extrabold text-[#334155] transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
    </div>
  </div>
}

export function TeamsPanel({ teams, technicians, canEdit, savingTechnicianId, savingTeamId, onToggleAvailability, onUpdateDailyCrew }: { teams: Team[]; technicians: Technician[]; canEdit: boolean; savingTechnicianId?: number | null; savingTeamId?: number | null; onToggleAvailability: (tech: Technician) => Promise<void>; onUpdateDailyCrew: (teamId: number, technicianIds: number[] | null) => Promise<void> }) {
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null)

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Crew readiness"
      title="Teams & Daily Availability"
      description={canEdit ? 'Mark call-outs and adjust today\'s crew composition without changing the default team setup.' : 'Viewer access can inspect team coverage and driver warnings.'}
    />
    <div className="space-y-4 p-4">
      {teams.slice(0, 8).map((team) => {
        const isEditing = editingTeamId === team.id
        const savingThisTeam = savingTeamId === team.id
        return <div key={team.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-extrabold tracking-tight text-[#172033]">{team.name}</h3>
                {team.daily_override && <Badge kind="approved">Daily crew</Badge>}
              </div>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">{team.skills.slice(0, 4).join(', ') || 'Available skills pending'}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}
              {canEdit && <button disabled={savingTeamId != null} onClick={() => setEditingTeamId(isEditing ? null : team.id)} className="rounded-full border border-[rgba(36,67,147,0.18)] bg-white px-3 py-1 text-xs font-extrabold text-[#244393] transition hover:-translate-y-0.5 hover:bg-[#e8eefc] disabled:cursor-wait disabled:opacity-60">{isEditing ? 'Close' : 'Edit Crew'}</button>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.technicians.length === 0 && <span className="rounded-full border border-dashed border-[rgba(23,32,51,0.18)] px-3 py-1.5 text-xs font-extrabold text-[#64748b]">No technicians assigned today</span>}
            {team.technicians.map((tech) => (
              <button key={tech.id} disabled={!canEdit || savingTechnicianId != null} onClick={() => onToggleAvailability(tech)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition disabled:cursor-not-allowed ${tech.availability === 'unavailable' ? 'border-red-200 bg-red-50 text-red-700 line-through' : 'border-[#d8dee8] bg-[#f8faff] text-[#334155] hover:-translate-y-0.5 hover:border-blue-200 hover:bg-[#e8eefc]'}`}>
                {savingTechnicianId === tech.id ? 'Saving...' : technicianLabel(tech)}
              </button>
            ))}
          </div>
          {isEditing && <CrewEditor
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
    </div>
  </Card>
}
