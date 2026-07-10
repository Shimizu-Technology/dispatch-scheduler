# Authentication

Dispatch Scheduler always uses Clerk for browser sign-in and Rails-side JWT verification. There is no local dev bypass. Local development, staging, and production all use the same authentication flow so role behavior is tested the same way users experience it.

## Required Environment Variables

Frontend (`web/.env.local`):

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3000
```

Backend (`api/.env` or the Rails process environment):

```bash
FRONTEND_URL=http://localhost:5173
CLERK_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
CLERK_SECRET_KEY=sk_test_...
CLERK_BOOTSTRAP_ADMIN_EMAILS=leon@example.com
```

You can use `CLERK_DOMAIN=your-clerk-domain` instead of `CLERK_JWKS_URL`; Rails will derive `https://<domain>/.well-known/jwks.json`. `CLERK_SECRET_KEY` lets Rails fetch the Clerk user profile when the verified browser token does not include email claims, which is Clerk's default behavior.

## Optional Environment Variables

```bash
# Frontend: request a Clerk JWT template instead of customized session claims.
VITE_CLERK_JWT_TEMPLATE=dispatch-scheduler

# Backend: additional browser origins beyond FRONTEND_URL.
CORS_ORIGINS=http://127.0.0.1:5173,https://staging.example.com

# Backend: JWKS HTTP open/read timeout. Defaults to 3 seconds.
CLERK_JWKS_TIMEOUT_SECONDS=3

# Backend: Clerk Backend API open/read timeout. Defaults to 3 seconds.
CLERK_API_TIMEOUT_SECONDS=3
```

Access is controlled by the Clerk application plus Dispatch Scheduler's in-app roles. Email/domain allowlist env vars and local auth-role bypass env vars are intentionally not supported.

## Frontend And Backend URLs

The frontend uses `VITE_API_URL` as the Rails origin. In local development that should usually be:

```bash
VITE_API_URL=http://localhost:3000
```

The API client appends `/api/v1`, so do not include a trailing API path unless you intentionally want to override it.

Rails uses `FRONTEND_URL` for CORS:

```bash
FRONTEND_URL=http://localhost:5173
```

In development and test, Rails also allows `localhost` and `127.0.0.1` on port `5173` so Vite remains easy to run locally. In non-development environments, set `FRONTEND_URL` or `CORS_ORIGINS` explicitly.

## Clerk User Email

Rails needs the signed-in user's email to create or find the local `users` row. The recommended setup is to provide `CLERK_SECRET_KEY`, so Rails can verify the JWT with JWKS and then fetch the Clerk user profile by `sub` when email is not present in the token.

If you do not want Rails to call the Clerk Backend API for profile data, configure one of these token-claim options instead:

- Customize the Clerk session token claims and add the claims below.
- Create a Clerk JWT template with the claims below and set `VITE_CLERK_JWT_TEMPLATE=<template-name>` in `web/.env.local` so the frontend requests that token template.

Required/optional claims:

```json
{
  "email": "{{user.primary_email_address}}",
  "name": "{{user.first_name}} {{user.last_name}}",
  "first_name": "{{user.first_name}}",
  "last_name": "{{user.last_name}}"
}
```

`email` is required when `CLERK_SECRET_KEY` is not set. The name fields are optional but make `/api/v1/me` display friendlier user information.

## Roles And User Management

Roles live in the Rails `users` table. Clerk creates the identity; Dispatch Scheduler stores the application role.

Supported roles:

- `admin`: full dispatch edit access and user management.
- `dispatcher`: can create/regenerate schedules, edit dispatch items, and update availability.
- `viewer`: can read dashboard/work-order/team/PM data but cannot change dispatch data.

Dispatch Scheduler is invite-only after the bootstrap admin is established. A Clerk user can sign in only when their email matches an existing invited Rails user, or when their email is listed in `CLERK_BOOTSTRAP_ADMIN_EMAILS`.

`CLERK_BOOTSTRAP_ADMIN_EMAILS` is for first-admin setup and emergency recovery only. Set it to Leon's or the primary owner email before the first real sign-in so that person can open the `Users` section and invite John or other staff.

After the first admin is in, normal access changes should happen in the app:

- Admin opens the `Users` section.
- Admin invites a user by email and chooses `admin`, `dispatcher`, or `viewer`.
- Admin can resend pending invitations, deactivate users, reactivate users, and change roles.
- Access removal is a soft deactivation so audit and intake-review history remains intact. The API prevents removing the last admin, changing your own role, or deactivating yourself.

Optional invite email delivery:

```bash
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="JMI Dispatch <dispatch@your-domain.com>"
```

If Resend is not configured, the user row is still pre-provisioned and can be resent after email is configured.

## API Protection

All Rails API endpoints require Clerk auth except:

- `GET /up` health check
- CORS preflight handled by Rack CORS

Mutating dispatch endpoints also require `admin` or `dispatcher`:

- `POST /api/v1/work_orders`
- `PATCH /api/v1/technicians/:id`
- `POST /api/v1/dispatch_schedules/suggest`
- `PATCH /api/v1/dispatch_items/:id`

User management endpoints require `admin`:

- `GET /api/v1/users`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `DELETE /api/v1/users/:id`
- `POST /api/v1/users/:id/resend_invitation`

`GET /api/v1/me` returns the current role and permissions for the frontend.

## Future Email Delivery

No email provider is required for the current dispatch board. Clerk handles sign-in email flows inside Clerk itself.

When the app adds invitations, admin notifications, schedule-send emails, or intake/OCR alerts, use Resend or an equivalent transactional email provider. Expected future env vars:

```bash
RESEND_API_KEY=...
RESEND_FROM_EMAIL=Dispatch Scheduler <dispatch@your-domain.com>
APP_URL=https://dispatch.your-domain.com
```
