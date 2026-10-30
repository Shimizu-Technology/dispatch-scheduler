import { useState } from 'react'
import { Mail, Plus, RefreshCw, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react'
import { Badge, Card, PanelHeader } from './ui'
import { ApiError } from '../lib/api'
import type { ManagedUser, UserRole } from '../types'

const roles: Array<{ value: UserRole; label: string; description: string }> = [
  { value: 'admin', label: 'Admin', description: 'Can manage users, roles, dispatch setup, and all operations data.' },
  { value: 'dispatcher', label: 'Dispatcher', description: 'Can build schedules, update work, crews, PMs, and outcomes.' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to dispatch plans and operations status.' },
]

function formatDateTime(value: string | null | undefined, fallback: string) {
  if (!value) return fallback
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function roleLabel(role: UserRole) {
  return roles.find((candidate) => candidate.value === role)?.label || role
}

type UserFormState = {
  email: string
  name: string
  role: UserRole
}

export function UserManagementPanel({ deliveryNotice, users, currentUserId, savingUserId, onCreate, onUpdate, onResendInvitation, onDelete }: {
  deliveryNotice?: string
  users: ManagedUser[]
  currentUserId: number | null
  savingUserId: number | null
  onCreate: (values: { email: string; name?: string; role: UserRole }) => Promise<void>
  onUpdate: (userId: number, changes: Partial<Pick<ManagedUser, 'name' | 'role' | 'active'>>) => Promise<void>
  onResendInvitation: (userId: number) => Promise<void>
  onDelete: (userId: number) => Promise<void>
}) {
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState<UserFormState>({ email: '', name: '', role: 'dispatcher' })
  const [formError, setFormError] = useState('')

  async function submitInvite() {
    const email = form.email.trim().toLowerCase()
    if (!email) {
      setFormError('Email is required.')
      return
    }
    setFormError('')
    try { await onCreate({ email, name: form.name.trim() || undefined, role: form.role }) }
    catch (error) {
      setFormError(error instanceof ApiError && error.status === null ? 'The invitation result is unconfirmed. Refresh the user list before retrying; access may already have been saved.' : error instanceof Error ? error.message : 'The invitation could not be saved. Try again.')
      return
    }
    setForm({ email: '', name: '', role: 'dispatcher' })
    setShowInvite(false)
  }

  async function updateRole(userId: number, role: UserRole) {
    await onUpdate(userId, { role })
  }

  async function toggleActive(user: ManagedUser) {
    await onUpdate(user.id, { active: !user.active })
  }

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(`Delete ${user.email}? This removes their local dispatch access and cannot be undone.`)) return
    await onDelete(user.id)
  }

  return <Card className="overflow-hidden">
    <PanelHeader
      eyebrow="Admin"
      title="User invitations and access"
      description="Invite JMI dispatch users, resend pending invitations, and control who can edit schedules or administer the workspace. Only invited users can access the workspace."
      action={<button type="button" onClick={() => setShowInvite((current) => !current)} className="inline-flex items-center gap-2 rounded-2xl button-action bg-[var(--jmi-blue)] px-4 py-2 font-display text-xs font-extrabold  tracking-normal text-[var(--paper)] shadow-none transition-colors  hover:bg-[var(--jmi-blue-deep)]"><Plus size={16} /> Invite user</button>}
    />

    <div className="space-y-4 p-4">
      {deliveryNotice && <p role="status" className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning-ink-strong)]">{deliveryNotice}</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        {roles.map((role) => <div key={role.value} className="rounded-2xl border border-[var(--jmi-blue)]/12 bg-[var(--surface-subtle)] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[var(--jmi-blue)]" size={18} />
            <h3 className="font-display text-sm font-extrabold text-[var(--ink)]">{role.label}</h3>
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-soft)]">{role.description}</p>
        </div>)}
      </div>

      {showInvite && <section className="rounded-3xl border border-[var(--jmi-blue)]/14 bg-[var(--surface-subtle)] p-4 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-xs font-extrabold  tracking-normal text-[var(--jmi-blue)]">New invitation</p>
            <h3 className="font-display mt-1 text-xl font-extrabold tracking-tight text-[var(--ink)]">Send dispatch access</h3>
            <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">The user receives an email invitation. Their role is ready when they sign in with this email.</p>
          </div>
          <button type="button" onClick={() => setShowInvite(false)} className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2 font-display text-xs font-extrabold  tracking-normal text-[var(--ink-soft)] transition-colors hover:bg-[var(--jmi-blue-soft)]">Cancel</button>
        </div>
        {formError && <p className="mt-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--danger-ink)]">{formError}</p>}
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_14rem_auto] lg:items-end">
          <label className="text-xs font-extrabold  tracking-normal text-[var(--ink-soft)]">Email
            <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@company.com" className="field-control mt-1 w-full rounded-xl px-3 py-3 text-sm font-bold normal-case tracking-normal text-[var(--ink)]" />
          </label>
          <label className="text-xs font-extrabold  tracking-normal text-[var(--ink-soft)]">Name
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Optional" className="field-control mt-1 w-full rounded-xl px-3 py-3 text-sm font-bold normal-case tracking-normal text-[var(--ink)]" />
          </label>
          <label className="text-xs font-extrabold  tracking-normal text-[var(--ink-soft)]">Role
            <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))} className="field-control mt-1 w-full rounded-xl px-3 py-3 text-sm font-bold normal-case tracking-normal text-[var(--ink)]">
              {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </label>
          <button type="button" disabled={savingUserId !== null} onClick={() => void submitInvite()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl button-primary bg-[var(--primary)] px-4 py-3 font-display text-sm font-extrabold text-[var(--paper)] transition-colors  hover:bg-[var(--jmi-red-deep)] disabled:cursor-not-allowed disabled:opacity-60"><Mail size={17} /> {savingUserId === 0 ? 'Sending...' : 'Send invite'}</button>
        </div>
      </section>}

      {users.length === 0 && <p className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-subtle)] p-5 text-sm font-semibold text-[var(--ink-soft)]">No users have been invited yet.</p>}
      {users.map((managedUser) => {
        const isCurrentUser = managedUser.id === currentUserId
        const isSaving = savingUserId === managedUser.id
        return <article key={managedUser.id} className={`grid gap-4 rounded-3xl border p-4 shadow-none xl:grid-cols-[1fr_auto] xl:items-center ${managedUser.active ? 'border-[var(--line)] bg-[var(--paper)]/90' : 'border-[var(--border)] bg-[var(--surface-hover)]/80'}`}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-extrabold tracking-tight text-[var(--ink)]">{managedUser.name}</h3>
              {isCurrentUser && <Badge kind="approved">You</Badge>}
              <Badge kind={managedUser.role}>{roleLabel(managedUser.role)}</Badge>
              {managedUser.invitation_pending && <span className="inline-flex items-center gap-1 rounded-full border border-[var(--warning-border)] bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-extrabold  tracking-normal text-[var(--warning-text)]"><Mail size={13} /> Pending invite</span>}
              {!managedUser.active && <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-extrabold  tracking-normal text-[var(--neutral-ink-soft)]"><UserX size={13} /> Inactive</span>}
            </div>
            <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">{managedUser.email}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold  tracking-normal text-[var(--muted)]">
              <span>Last seen: {formatDateTime(managedUser.last_seen_at, 'Never')}</span>
              {managedUser.invitation_pending && <span>Invited: {formatDateTime(managedUser.invited_at, 'Not sent yet')}</span>}
              {managedUser.invitation_accepted_at && <span>Accepted: {formatDateTime(managedUser.invitation_accepted_at, 'Not accepted')}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
            <label className="text-xs font-extrabold  tracking-normal text-[var(--ink-soft)]">
              Role
              <select
                value={managedUser.role}
                disabled={savingUserId !== null || (isCurrentUser && managedUser.role === 'admin')}
                onChange={(event) => void updateRole(managedUser.id, event.target.value as UserRole)}
                className="field-control mt-1 w-full min-w-48 rounded-xl px-3 py-2 text-sm font-bold normal-case tracking-normal text-[var(--ink)] sm:w-auto"
              >
                {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
            {managedUser.invitation_pending && <button type="button" disabled={savingUserId !== null} onClick={() => void onResendInvitation(managedUser.id)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--jmi-blue)]/15 bg-[var(--jmi-blue-soft)] px-4 py-3 font-display text-xs font-extrabold  tracking-normal text-[var(--jmi-blue)] transition-colors hover:bg-[var(--jmi-blue-hover)] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={isSaving ? 'animate-spin' : ''} size={16} /> Resend</button>}
            {!isCurrentUser && <button type="button" disabled={savingUserId !== null} onClick={() => void toggleActive(managedUser)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 font-display text-xs font-extrabold  tracking-normal text-[var(--ink)] transition-colors hover:bg-[var(--steel)] disabled:cursor-not-allowed disabled:opacity-60">{managedUser.active ? <UserX size={16} /> : <UserCheck size={16} />}{managedUser.active ? 'Deactivate' : 'Activate'}</button>}
            {!isCurrentUser && <button type="button" disabled={savingUserId !== null} onClick={() => void deleteUser(managedUser)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 font-display text-xs font-extrabold  tracking-normal button-destructive text-[var(--danger-text)] transition-colors hover:bg-[var(--danger-soft-strong)] disabled:cursor-not-allowed disabled:opacity-60"><Trash2 size={16} /> Delete</button>}
          </div>
        </article>
      })}
    </div>
  </Card>
}
