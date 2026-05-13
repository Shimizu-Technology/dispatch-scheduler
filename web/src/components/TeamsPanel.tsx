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
        <div key={team.id} className="rounded-[1.35rem] border border-[rgba(16,35,42,0.1)] bg-white/68 p-4 shadow-[0_10px_30px_rgba(16,35,42,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-extrabold tracking-tight text-[#10232a]">{team.name}</h3>
              <p className="mt-1 text-xs font-semibold text-[#6c7c80]">{team.skills.slice(0, 4).join(', ') || 'Skills pending'}</p>
            </div>
            {team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.technicians.map((tech) => (
              <button key={tech.id} disabled={!canEdit || savingTechnicianId === tech.id} onClick={() => onToggleAvailability(tech)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition disabled:cursor-not-allowed ${tech.availability === 'unavailable' ? 'border-red-200 bg-red-50 text-red-700 line-through' : 'border-[#dce7e5] bg-[#f7fbf8] text-[#335057] hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50'}`}>
                {savingTechnicianId === tech.id ? 'Saving...' : `${tech.name}${tech.is_driver ? ' (driver)' : ''}`}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Card>
}
