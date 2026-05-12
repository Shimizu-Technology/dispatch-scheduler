# Dispatch Scheduler

Focused dispatch/scheduling proof of concept for facilities work orders.

Stack:
- Rails API (`api/`)
- React + Vite + TypeScript (`web/`)

See `docs/PLAN.md` for product scope, architecture, and build plan.
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
