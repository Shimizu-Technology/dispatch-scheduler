export function MissingClerkConfig() {
  return <main className="grid min-h-screen place-items-center px-6 text-[var(--ink-soft)]">
    <section className="max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--paper)]/92 p-8 text-center shadow-none">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--ink)]">Clerk setup required</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
        JMI Dispatch always uses Clerk sign-in. Add <code className="rounded bg-[var(--jmi-blue-soft)] px-1.5 py-0.5 font-bold text-[var(--jmi-blue)]">VITE_CLERK_PUBLISHABLE_KEY</code> to <code className="rounded bg-[var(--jmi-blue-soft)] px-1.5 py-0.5 font-bold text-[var(--jmi-blue)]">web/.env.local</code>, then restart Vite.
      </p>
    </section>
  </main>
}
