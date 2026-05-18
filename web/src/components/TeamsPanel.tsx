import { Badge, Card, PanelHeader } from './ui'
import type { Team, Technician } from '../types'

export function TeamsPanel({ teams, canEdit, savingTechnicianId, onToggleAvailability }: { teams: Team[]; canEdit: boolean; savingTechnicianId?: number | null; onToggleAvailability: (tech: Technician) => Promise<void> }) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Crew readiness"
      title="Teams & Daily Availability"
      description={canEdit ? 'Tap a technician to simulate call-outs. Regenerate to apply availability to a fresh draft.' : 'Viewer access can inspect team coverage and driver warnings.'}
    />
    <div className="space-y-4 p-4">
      {teams.slice(0, 8).map((team) => (
        <div key={team.id} className="rounded-2xl border border-[rgba(23,32,51,0.1)] bg-white/88 p-4 shadow-[0_10px_26px_rgba(23,32,51,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-extrabold tracking-tight text-[#172033]">{team.name}</h3>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">{team.skills.slice(0, 4).join(', ') || 'Available skills pending'}</p>
            </div>
            {team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.technicians.map((tech) => (
              <button key={tech.id} disabled={!canEdit || savingTechnicianId != null} onClick={() => onToggleAvailability(tech)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition disabled:cursor-not-allowed ${tech.availability === 'unavailable' ? 'border-red-200 bg-red-50 text-red-700 line-through' : 'border-[#d8dee8] bg-[#f8faff] text-[#334155] hover:-translate-y-0.5 hover:border-blue-200 hover:bg-[#e8eefc]'}`}>
                {savingTechnicianId === tech.id ? 'Saving...' : `${tech.name}${tech.is_driver ? ' (driver)' : ''}`}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Card>
}
