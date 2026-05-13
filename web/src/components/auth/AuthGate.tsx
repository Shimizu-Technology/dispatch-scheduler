import { RedirectToSignIn, UserButton } from '@clerk/react'
import { RefreshCw } from 'lucide-react'
import { useAuthContext } from '../../contexts/useAuthContext'

function LoadingScreen({ message = 'Verifying access...' }: { message?: string }) {
  return <main className="grid min-h-screen place-items-center px-6 text-[#51636a]">
    <div className="rounded-[2rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/85 p-8 text-center shadow-[0_24px_80px_rgba(16,35,42,0.12)]">
      <RefreshCw className="mx-auto mb-3 animate-spin text-cyan-700" />
      <p className="font-display font-bold">{message}</p>
    </div>
  </main>
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading, user, authError } = useAuthContext()

  if (isLoading) return <LoadingScreen />
  if (!isSignedIn) return <RedirectToSignIn />
  if (!user) {
    const needsTokenClaims = authError?.toLowerCase().includes('missing clerk email')

    return <main className="grid min-h-screen place-items-center px-4 text-[#405157]">
      <section className="max-w-md rounded-[2rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/90 p-8 text-center shadow-[0_24px_80px_rgba(16,35,42,0.12)]">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#10232a]">{needsTokenClaims ? 'Clerk token setup needed' : 'Unable to verify access'}</h1>
        <p className="mt-3 text-sm leading-6 text-[#5c6b70]">
          {needsTokenClaims
            ? 'Your Clerk sign-in worked, but the API needs the JWT token to include an email claim. Check the Clerk JWT template or custom session claims.'
            : 'Your Clerk sign-in worked, but the dispatch API could not confirm your role. Refresh in a moment, or contact support if this keeps happening.'}
        </p>
        {authError && <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{authError}</p>}
        <div className="mt-6 flex justify-center">
          <UserButton />
        </div>
      </section>
    </main>
  }

  return <>{children}</>
}
