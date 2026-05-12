import { RedirectToSignIn, SignInButton, UserButton } from '@clerk/react'
import { RefreshCw } from 'lucide-react'
import { useAuthContext } from '../../contexts/useAuthContext'

function LoadingScreen({ message = 'Verifying access...' }: { message?: string }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
    <div className="text-center">
      <RefreshCw className="mx-auto mb-3 animate-spin" />
      <p className="font-semibold">{message}</p>
    </div>
  </main>
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isClerkEnabled, isSignedIn, isLoading, user } = useAuthContext()

  if (!isClerkEnabled) return <>{children}</>
  if (isLoading) return <LoadingScreen />
  if (!isSignedIn) return <RedirectToSignIn />
  if (!user) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-700">
      <section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-slate-950">Access pending</h1>
        <p className="mt-3 text-sm text-slate-600">Your Clerk sign-in worked, but this app could not verify your JMI dispatch role yet. Ask an admin to approve your email.</p>
        <div className="mt-6 flex justify-center">
          <UserButton />
        </div>
      </section>
    </main>
  }

  return <>{children}</>
}

export function SignInNotice() {
  const { isClerkEnabled } = useAuthContext()
  if (!isClerkEnabled) return null

  return <SignInButton mode="modal">
    <button className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300">Sign in</button>
  </SignInButton>
}
