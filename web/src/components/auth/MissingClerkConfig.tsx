export function MissingClerkConfig() {
  return <main className="grid min-h-screen place-items-center px-6 text-[#334155]">
    <section className="max-w-lg rounded-2xl border border-[rgba(23,32,51,0.12)] bg-white/92 p-8 text-center shadow-[0_24px_70px_rgba(23,32,51,0.12)]">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#172033]">Clerk setup required</h1>
      <p className="mt-3 text-sm leading-6 text-[#526071]">
        JMI Dispatch always uses Clerk sign-in. Add <code className="rounded bg-[#e8eefc] px-1.5 py-0.5 font-bold text-[#244393]">VITE_CLERK_PUBLISHABLE_KEY</code> to <code className="rounded bg-[#e8eefc] px-1.5 py-0.5 font-bold text-[#244393]">web/.env.local</code>, then restart Vite.
      </p>
    </section>
  </main>
}
