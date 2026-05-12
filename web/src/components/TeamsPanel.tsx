import { Badge, Card } from './ui'
import type { Team, Technician } from '../types'

export function TeamsPanel({ teams, canEdit, onToggleAvailability }: { teams: Team[]; canEdit: boolean; onToggleAvailability: (tech: Technician) => Promise<void> }) {
  return <Card>
    <div className="border-b border-slate-200 p-5">
      <h2 className="text-xl font-black">Teams & Daily Availability</h2>
      <p className="text-sm text-slate-500">{canEdit ? 'Tap a technician to simulate call-outs. Regenerate to apply availability to a fresh draft.' : 'Viewer access can inspect team coverage and driver warnings.'}</p>
    </div>
    <div className="space-y-4 p-4">
      {teams.slice(0, 8).map((team) => (
        <div key={team.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-900">{team.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{team.skills.slice(0, 4).join(', ') || 'Skills pending'}</p>
            </div>
            {team.has_driver ? <Badge kind="approved">Driver OK</Badge> : <Badge kind="p1">No Driver</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.technicians.map((tech) => (
              <button key={tech.id} disabled={!canEdit} onClick={() => onToggleAvailability(tech)} className={`rounded-full border px-3 py-1 text-xs font-bold disabled:cursor-not-allowed ${tech.availability === 'unavailable' ? 'border-red-200 bg-red-50 text-red-700 line-through' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                {tech.name}{tech.is_driver ? ' (driver)' : ''}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Card>
}
