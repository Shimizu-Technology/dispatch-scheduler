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
- Dashboard, work-order list, PA Projects workspace, configurable service lines, SLA/KPI due-date tracking, PM month workflow, opportunistic “while you’re there” PM suggestions, AI-assisted work-order image upload preview, teams/availability, dispatch builder, manual overrides, and WhatsApp export are implemented.
- Clerk authentication is implemented with Rails JWT verification, `admin` / `dispatcher` / `viewer` roles, a bootstrap admin email, and in-app user management.
- CI covers Rails tests/lint/security, frontend lint/build, and Python importer tests.

See `docs/PLAN.md` for product scope, architecture, and current implementation snapshot.
See `docs/JMI_WORKFLOW_MODEL.md` for the current understanding of John's real workflow, the intended app flow, and the default-crew vs daily-crew model.
See `docs/POST_PR_IMPLEMENTATION_PLAN.md` for the current phased implementation plan.
See `docs/AUTHENTICATION.md` for Clerk setup, required env vars, roles, and user management.

Production deploy note: keep `WEB_CONCURRENCY=1` while the API uses process-local cache for Clerk JWKS. Background jobs run inline until Solid Queue tables/workers are intentionally added.

User invitations use Clerk plus optional Resend delivery. Configure `CLERK_SECRET_KEY` for Clerk invitations and `RESEND_API_KEY` with `RESEND_FROM_EMAIL` for branded invite emails. Without Resend, admins can still pre-provision users and resend after email is configured.

AI-assisted work-order upload uses OpenRouter vision models. Configure these API env vars when enabling it:

- `OPENROUTER_API_KEY` - required for upload preview extraction.
- `OPENROUTER_WORK_ORDER_OCR_MODEL` - optional, defaults to `google/gemini-2.5-flash`.
- `OPENROUTER_HTTP_REFERER` - optional request attribution header.

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
