import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'
import App from './App.tsx'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const isClerkEnabled = Boolean(clerkPublishableKey)

const app = <AuthProvider isClerkEnabled={isClerkEnabled}><App /></AuthProvider>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isClerkEnabled ? <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">{app}</ClerkProvider> : app}
  </StrictMode>,
)
