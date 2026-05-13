# Dispatch Scheduler Web

React + Vite + TypeScript frontend for the JMI dispatch scheduler proof of concept.

## Responsibilities

- Render the dispatch dashboard, work orders, team availability, PM tasks, dispatch builder, and WhatsApp export.
- Wrap the app with Clerk for all environments.
- Hide or disable mutating controls for `viewer` users.
- Provide an admin-only user management section for assigning `admin`, `dispatcher`, and `viewer` roles.
- Attach Clerk bearer tokens to API requests through `src/lib/api.ts`.

## Local Setup

From the repo root:

```bash
cd web
npm install
npm run dev -- --port 5175
```

Open http://127.0.0.1:5175.

Set `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL` in `web/.env.local`, then
follow `../docs/AUTHENTICATION.md`.

## Verification

```bash
npm run lint
npm run build
```

If local Vite warns about Node, use Node `20.19+` or `22.12+`.
