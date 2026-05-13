# Dispatch Scheduler Web

React + Vite + TypeScript frontend for the JMI dispatch scheduler proof of concept.

## Responsibilities

- Render the dispatch dashboard, work orders, team availability, PM tasks, dispatch builder, and WhatsApp export.
- Wrap the app with Clerk when `VITE_CLERK_PUBLISHABLE_KEY` is set.
- Use a local dev auth provider when Clerk is not configured.
- Hide or disable mutating controls for `viewer` users.
- Attach Clerk bearer tokens to API requests through `src/lib/api.ts`.

## Local Setup

From the repo root:

```bash
cd web
npm install
npm run dev -- --port 5175
```

Open http://127.0.0.1:5175.

To test real Clerk auth, set `VITE_CLERK_PUBLISHABLE_KEY` in `web/.env.local`
and follow `../docs/AUTHENTICATION.md`.

## Verification

```bash
npm run lint
npm run build
```

If local Vite warns about Node, use Node `20.19+` or `22.12+`.
