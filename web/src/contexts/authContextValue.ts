import { createContext } from 'react'
import type { CurrentUser } from '../types'

export type AuthContextValue = {
  isSignedIn: boolean
  isLoading: boolean
  user: CurrentUser | null
  authError: string | null
  canEditDispatch: boolean
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  isSignedIn: false,
  isLoading: false,
  user: null,
  authError: null,
  canEditDispatch: false,
  refreshUser: async () => undefined,
})
