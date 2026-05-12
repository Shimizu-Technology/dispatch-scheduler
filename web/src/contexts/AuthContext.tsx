import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth, useUser } from '@clerk/react'
import { AuthContext } from './authContextValue'
import { getJson, setAuthTokenGetter } from '../lib/api'
import type { CurrentUser } from '../types'

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { user: clerkUser } = useUser()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isCheckingApi, setIsCheckingApi] = useState(true)

  useEffect(() => {
    const template = import.meta.env.VITE_CLERK_JWT_TEMPLATE
    setAuthTokenGetter(async () => getToken(template ? { template } : undefined))
  }, [getToken])

  const refreshUser = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setUser(null)
      setAuthError(null)
      setIsCheckingApi(false)
      return
    }

    setIsCheckingApi(true)
    try {
      const payload = await getJson<{ user: CurrentUser }>('/me')
      setUser(payload.user)
      setAuthError(null)
    } catch (error) {
      setUser(null)
      setAuthError(error instanceof Error ? error.message : 'Unable to verify access')
    } finally {
      setIsCheckingApi(false)
    }
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    // Sync the local role/permission state once Clerk has a session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshUser()
  }, [refreshUser, clerkUser?.id])

  return <AuthContext.Provider value={{
    isClerkEnabled: true,
    isSignedIn: Boolean(isSignedIn),
    isLoading: !isLoaded || isCheckingApi,
    user,
    authError,
    canEditDispatch: Boolean(user?.permissions.can_edit_dispatch),
    refreshUser,
  }}>{children}</AuthContext.Provider>
}

function NoAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setAuthTokenGetter(async () => null)
  }, [])

  const devRole = normalizeDevRole(import.meta.env.VITE_DEV_AUTH_ROLE)
  const canEditDispatch = devRole === 'admin' || devRole === 'dispatcher'
  const user: CurrentUser = {
    id: null,
    clerk_id: 'dev_user',
    email: 'dev-dispatcher@example.com',
    name: 'Dev Dispatcher',
    role: devRole,
    auth_mode: 'development_bypass',
    permissions: { can_edit_dispatch: canEditDispatch, can_admin: devRole === 'admin' },
  }

  return <AuthContext.Provider value={{
    isClerkEnabled: false,
    isSignedIn: true,
    isLoading: false,
    user,
    authError: null,
    canEditDispatch,
    refreshUser: async () => undefined,
  }}>{children}</AuthContext.Provider>
}

function normalizeDevRole(value: string | undefined): CurrentUser['role'] {
  return value === 'dispatcher' || value === 'viewer' ? value : 'admin'
}

export function AuthProvider({ children, isClerkEnabled }: { children: ReactNode; isClerkEnabled: boolean }) {
  return isClerkEnabled ? <ClerkAuthProvider>{children}</ClerkAuthProvider> : <NoAuthProvider>{children}</NoAuthProvider>
}
