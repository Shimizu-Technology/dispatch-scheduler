# Dispatch Scheduler API

Rails API for the JMI dispatch scheduler proof of concept.

## Responsibilities

- Serve dashboard, work-order, team, technician, PM task, dispatch schedule, and WhatsApp export data.
- Verify Clerk JWTs for every API request except health checks.
- Allow frontend origins with `FRONTEND_URL` / `CORS_ORIGINS`.
- Enforce `admin` / `dispatcher` / `viewer` role permissions on mutating dispatch endpoints.
- Generate idempotent daily draft dispatch schedules from work orders, PM tasks, team skills, driver coverage, availability, and region preferences.

## Local Setup

From the repo root:

```bash
./scripts/import_sample_data.py
cd api
bundle install
bundle exec rails db:setup
bundle exec rails server -p 3000
```

Clerk env vars are required for local app testing. See `../docs/AUTHENTICATION.md`
for the mandatory frontend/backend env variables and bootstrap-admin setup.
Rails loads `api/.env` automatically in development and test; restart the server
after changing those values.

## Verification

```bash
bundle exec rails test
bundle exec rubocop
bundle exec brakeman --no-pager
bundle exec bundle-audit check --update
```

## Key Endpoints

- `GET /api/v1/me`
- `GET /api/v1/users`
- `PATCH /api/v1/users/:id`
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
