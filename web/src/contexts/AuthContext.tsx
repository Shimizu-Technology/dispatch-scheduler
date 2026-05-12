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
  const [isCheckingApi, setIsCheckingApi] = useState(true)

  useEffect(() => {
    setAuthTokenGetter(async () => getToken())
  }, [getToken])

  const refreshUser = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setUser(null)
      setIsCheckingApi(false)
      return
    }

    setIsCheckingApi(true)
    try {
      const payload = await getJson<{ user: CurrentUser }>('/me')
      setUser(payload.user)
    } finally {
      setIsCheckingApi(false)
    }
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    // Sync the local role/permission state once Clerk has a session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshUser().catch(() => {
      setUser(null)
      setIsCheckingApi(false)
    })
  }, [refreshUser, clerkUser?.id])

  return <AuthContext.Provider value={{
    isClerkEnabled: true,
    isSignedIn: Boolean(isSignedIn),
    isLoading: !isLoaded || isCheckingApi,
    user,
    canEditDispatch: Boolean(user?.permissions.can_edit_dispatch),
    refreshUser,
  }}>{children}</AuthContext.Provider>
}

function NoAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setAuthTokenGetter(async () => null)
  }, [])

  const user: CurrentUser = {
    id: null,
    clerk_id: 'dev_user',
    email: 'dev-dispatcher@example.com',
    name: 'Dev Dispatcher',
    role: 'admin',
    auth_mode: 'development_bypass',
    permissions: { can_edit_dispatch: true, can_admin: true },
  }

  return <AuthContext.Provider value={{
    isClerkEnabled: false,
    isSignedIn: true,
    isLoading: false,
    user,
    canEditDispatch: true,
    refreshUser: async () => undefined,
  }}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children, isClerkEnabled }: { children: ReactNode; isClerkEnabled: boolean }) {
  return isClerkEnabled ? <ClerkAuthProvider>{children}</ClerkAuthProvider> : <NoAuthProvider>{children}</NoAuthProvider>
}
