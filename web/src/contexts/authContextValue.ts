import { createContext } from 'react'
import type { CurrentUser } from '../types'

export type AuthContextValue = {
  isClerkEnabled: boolean
  isSignedIn: boolean
  isLoading: boolean
  user: CurrentUser | null
  canEditDispatch: boolean
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  isClerkEnabled: false,
  isSignedIn: true,
  isLoading: false,
  user: null,
  canEditDispatch: true,
  refreshUser: async () => undefined,
})
