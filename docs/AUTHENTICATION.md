# Authentication

The dispatch scheduler uses Clerk for browser sign-in and Rails-side JWT verification.

## Local Development Modes

### No Clerk Credentials

In development and test only, if `VITE_CLERK_PUBLISHABLE_KEY` is not set in the web app and neither `CLERK_JWKS_URL` nor `CLERK_DOMAIN` is set for Rails, the app runs with a local development bypass:

- User: `dev-dispatcher@example.com`
- Role: `admin` by default
- Override with `DEV_AUTH_ROLE=dispatcher` or `DEV_AUTH_ROLE=viewer`

This keeps CI and local setup unblocked before real Clerk credentials are added.

Production does not use this bypass. If Clerk JWT verification is not configured, Rails returns a service-unavailable auth configuration error.

### Clerk Enabled

Set the frontend key in `web/.env.local`:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Set Rails JWT verification in `api/.env` or your shell. Use one of these:

```bash
CLERK_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
```

or:

```bash
CLERK_DOMAIN=your-clerk-domain
```

The React API client automatically attaches `Authorization: Bearer <token>` to Rails requests when Clerk is enabled.

## Roles

Roles live in the Rails `users` table. The first time a Clerk user is verified, Rails creates or updates the user record.

Supported roles:

- `admin`: full dispatch edit access and future admin-only settings.
- `dispatcher`: can create/regenerate schedules, edit dispatch items, and update availability.
- `viewer`: can read dashboard/work-order/team/PM data but cannot change dispatch data.

Initial role assignment can be controlled with comma-separated env vars:

```bash
CLERK_ADMIN_EMAILS=admin@example.com
CLERK_DISPATCHER_EMAILS=john@example.com,dispatcher@example.com
```

Anyone not listed there is created as `viewer`.

## Approved Access

To restrict who can read dispatch data, configure at least one allowlist variable:

```bash
CLERK_ALLOWED_EMAILS=john@example.com,dispatcher@example.com
CLERK_ALLOWED_DOMAINS=jmiguam.com,shimizutechnology.com
```

If neither allowlist variable is set, any signed-in Clerk user can enter as a viewer. That is convenient for early setup, but production should use an allowlist.

## API Protection

All Rails API endpoints require auth when Clerk is configured, except:

- `OPTIONS *` CORS preflight
- `GET /up` health check

Mutating dispatch endpoints also require `admin` or `dispatcher`:

- `POST /api/v1/work_orders`
- `PATCH /api/v1/technicians/:id`
- `POST /api/v1/dispatch_schedules/suggest`
- `PATCH /api/v1/dispatch_items/:id`

`GET /api/v1/me` returns the current role and permissions for the frontend.
