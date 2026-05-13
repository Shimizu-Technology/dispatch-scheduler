export function MissingClerkConfig() {
  return <main className="grid min-h-screen place-items-center px-6 text-[#405157]">
    <section className="max-w-lg rounded-[2rem] border border-[rgba(16,35,42,0.12)] bg-[#fffdf7]/90 p-8 text-center shadow-[0_24px_80px_rgba(16,35,42,0.12)]">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#10232a]">Clerk setup required</h1>
      <p className="mt-3 text-sm leading-6 text-[#5c6b70]">
        Dispatch Scheduler always uses Clerk sign-in. Add <code className="rounded bg-cyan-50 px-1.5 py-0.5 font-bold text-cyan-900">VITE_CLERK_PUBLISHABLE_KEY</code> to <code className="rounded bg-cyan-50 px-1.5 py-0.5 font-bold text-cyan-900">web/.env.local</code>, then restart Vite.
      </p>
    </section>
  </main>
}
