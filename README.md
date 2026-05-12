# Dispatch Scheduler

Focused dispatch/scheduling proof of concept for JMI facilities work orders.

The app helps a dispatcher turn open work orders, PM commitments, crew availability,
driver coverage, skills, and regions into a daily dispatch schedule with a
WhatsApp-ready export.

Stack:
- Rails API (`api/`)
- React + Vite + TypeScript (`web/`)

Current state:

- Sanitized demo data imports from John's real review examples in `docs/examples-from-john/`.
- Dashboard, work-order list, teams/availability, PM task view, dispatch builder, manual overrides, and WhatsApp export are implemented.
- Clerk authentication is implemented with Rails JWT verification, `admin` / `dispatcher` / `viewer` roles, and a local dev/test bypass.
- CI covers Rails tests/lint/security, frontend lint/build, and Python importer tests.

See `docs/PLAN.md` for product scope, architecture, and current implementation snapshot.
See `docs/POST_PR_IMPLEMENTATION_PLAN.md` for the current phased implementation plan.
See `docs/AUTHENTICATION.md` for Clerk setup, roles, and local auth-bypass behavior.

Current demo data is generated from John's review examples in `docs/examples-from-john/` with:

```bash
./scripts/import_sample_data.py
```

Core verification commands:

```bash
python3 -m unittest discover -s scripts -p "*_test.py"
cd api && bundle exec rails test && bundle exec rubocop
cd web && npm run lint && npm run build
```
