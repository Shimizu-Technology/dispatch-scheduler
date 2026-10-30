// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UserManagementPanel } from './UserManagementPanel'
import { ApiError } from '../lib/api'
afterEach(cleanup)
it.each([null, 422])('preserves invite fields and accurately describes a %s failure', async (status) => {
  const onCreate = vi.fn().mockRejectedValue(new ApiError('Email has already been taken', status))
  render(<UserManagementPanel users={[]} currentUserId={1} savingUserId={null} onCreate={onCreate} onUpdate={vi.fn()} onResendInvitation={vi.fn()} onDelete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Invite user' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))
  expect(await screen.findByText(status === null ? /result is unconfirmed.*Refresh the user list/ : 'Email has already been taken')).toBeTruthy()
  expect(screen.getByLabelText('Email')).toHaveProperty('value', 'synthetic@example.test')
})
