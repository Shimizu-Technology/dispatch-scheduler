// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { useAuthContext } from './useAuthContext'
import { ApiError, getJson } from '../lib/api'
const clerk = vi.hoisted(() => ({ getToken: vi.fn(), user: { id: 'synthetic' } }))
vi.mock('@clerk/react', () => ({ useAuth: () => ({ getToken: clerk.getToken, isLoaded: true, isSignedIn: true }), useUser: () => ({ user: clerk.user }) }))
vi.mock('../lib/api', async (original) => ({ ...await original<typeof import('../lib/api')>(), getJson: vi.fn() }))
afterEach(cleanup)
function Feedback() { return <p>{useAuthContext().authError}</p> }
it.each(['Missing Clerk email. Set CLERK_SECRET_KEY or configure Clerk token email claims.', 'Your account has not been invited yet. Ask a JMI dispatch admin to invite synthetic@example.test.'])('preserves the actionable 403 reason: %s', async (message) => {
  vi.mocked(getJson).mockRejectedValueOnce(new ApiError(message, 403, { errors: [message] }))
  render(<AuthProvider><Feedback /></AuthProvider>)
  expect(await screen.findByText(message)).toBeTruthy()
})
