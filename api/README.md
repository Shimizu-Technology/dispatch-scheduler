# Dispatch Scheduler API

Rails API for the JMI dispatch scheduler proof of concept.

## Responsibilities

- Serve dashboard, work-order, team, technician, PM task, dispatch schedule, and WhatsApp export data.
- Verify Clerk JWTs when Clerk is configured.
- Provide a development/test auth bypass when Clerk env vars are absent.
- Enforce `admin` / `dispatcher` / `viewer` role permissions on mutating dispatch endpoints.
- Generate idempotent daily draft dispatch schedules from work orders, PM tasks, team skills, driver coverage, availability, and region preferences.

## Local Setup

From the repo root:

```bash
./scripts/import_sample_data.py
cd api
~/.rbenv/shims/bundle install
~/.rbenv/shims/bundle exec rails db:setup
~/.rbenv/shims/bundle exec rails server -p 3005
```

Without Clerk env vars, development uses the local auth bypass documented in
`../docs/AUTHENTICATION.md`.

## Verification

```bash
~/.rbenv/shims/bundle exec rails test
~/.rbenv/shims/bundle exec rubocop
~/.rbenv/shims/bundle exec brakeman --no-pager
~/.rbenv/shims/bundle exec bundle-audit check --update
```

## Key Endpoints

- `GET /api/v1/me`
- `GET /api/v1/dashboard?date=YYYY-MM-DD`
- `GET /api/v1/work_orders`
- `POST /api/v1/work_orders`
- `GET /api/v1/teams?date=YYYY-MM-DD`
- `PATCH /api/v1/technicians/:id`
- `GET /api/v1/pm_tasks?date=YYYY-MM-DD`
- `POST /api/v1/dispatch_schedules/suggest`
- `GET /api/v1/dispatch_schedules/:id`
- `PATCH /api/v1/dispatch_items/:id`
- `GET /api/v1/dispatch_schedules/:id/whatsapp_export`
