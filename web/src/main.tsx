import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { MissingClerkConfig } from './components/auth/MissingClerkConfig'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'
import App from './App.tsx'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkPublishableKey
      ? <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
          <AuthProvider><App /></AuthProvider>
        </ClerkProvider>
      : <MissingClerkConfig />}
  </StrictMode>,
)
