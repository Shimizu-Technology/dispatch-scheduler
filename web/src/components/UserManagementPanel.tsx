import { Badge, Card, PanelHeader } from './ui'
import type { ManagedUser } from '../types'

const roles: ManagedUser['role'][] = ['admin', 'dispatcher', 'viewer']

function formatLastSeen(value: string | null) {
  if (!value) return 'Never signed in'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function UserManagementPanel({ users, currentUserId, savingUserId, onRoleChange }: { users: ManagedUser[]; currentUserId: number | null; savingUserId: number | null; onRoleChange: (userId: number, role: ManagedUser['role']) => Promise<void> }) {
  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Admin"
      title="User Management"
      description="Manage who can administer the app, edit dispatch plans, or view operations data. New Clerk sign-ins start as viewers unless they match the bootstrap admin list."
    />
    <div className="space-y-3 p-4">
      {users.length === 0 && <p className="rounded-2xl border border-dashed border-[rgba(16,35,42,0.18)] bg-white/70 p-5 text-sm font-semibold text-[#5c6b70]">No users have signed in yet.</p>}
      {users.map((managedUser) => {
        const isCurrentUser = managedUser.id === currentUserId
        return <div key={managedUser.id} className="grid gap-4 rounded-[1.3rem] border border-[rgba(16,35,42,0.1)] bg-white/72 p-4 shadow-[0_10px_30px_rgba(16,35,42,0.04)] lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-extrabold tracking-tight text-[#10232a]">{managedUser.name}</h3>
              {isCurrentUser && <Badge kind="approved">You</Badge>}
              <Badge kind={managedUser.role}>{managedUser.role}</Badge>
            </div>
            <p className="mt-1 text-sm font-semibold text-[#405157]">{managedUser.email}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a8a8f]">Last seen: {formatLastSeen(managedUser.last_seen_at)}</p>
          </div>
          <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#5c6b70]">
            Role
            <select
              value={managedUser.role}
              disabled={savingUserId !== null}
              onChange={(event) => void onRoleChange(managedUser.id, event.target.value as ManagedUser['role'])}
              className="field-control mt-1 w-full min-w-48 rounded-xl px-3 py-2 text-sm font-bold normal-case tracking-normal text-[#10232a] lg:w-auto"
            >
              {roles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
        </div>
      })}
    </div>
  </Card>
}
