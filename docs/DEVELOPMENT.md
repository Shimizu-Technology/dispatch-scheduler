# Development

## Setup

```bash
# The committed public-safe seed works without private source artifacts.
# Regeneration is optional; see docs/examples-from-john/README.md.

# API
cd api
bundle install
bundle exec rails db:setup
bundle exec rails server -p 3000

# Web
cd ../web
npm install
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173.

The frontend expects Node `22.13.0` or newer; `web/.node-version` pins that
minimum for local version managers.

## Authentication

The app always uses Clerk. Local development needs the same Clerk setup shape as
production, plus local URLs for the frontend and backend:

```bash
# web/.env.local
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3000

# api/.env or Rails shell
FRONTEND_URL=http://localhost:5173
CLERK_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
CLERK_SECRET_KEY=sk_test_...
CLERK_BOOTSTRAP_ADMIN_EMAILS=you@example.com
```

Rails loads `api/.env` automatically in development and test. Restart `rails server`
after changing Clerk or CORS values so the process sees the new environment.

The bootstrap admin email is only for first sign-in and recovery. After that,
manage admins, dispatchers, and viewers from the in-app `Users` section. See
`docs/AUTHENTICATION.md`.

## Verification

```bash
# Importer
python3 -m unittest discover -s scripts -p "*_test.py"
# Optional, only when private source artifacts and import config are available:
./scripts/import_sample_data.py

# API
cd api
bundle exec rails test
bundle exec rubocop
bundle exec rails runner 's=DispatchSuggestionService.new(date: "2026-05-01").call; puts WhatsAppExportService.new(s).call.lines.first'

# Web
cd ../web
npm test
npm run lint
npm run build
```

## CI

GitHub Actions runs from the repo-level `.github/workflows/ci.yml` file. It verifies:

- Rails tests, RuboCop, Brakeman, and bundler-audit under `api/`.
- Frontend route tests, TypeScript lint, dependency installation, and production build under `web/`.
- Python 3.10 importer compilation and unit tests for the sample-data parser.

## Data Safety

Do not commit credentials, customer source files, real rosters, site mappings, or operational descriptions. The committed seed JSON is pseudonymized and CI verifies its public-safe identifiers. Customer-specific driver and location-region mappings belong in the ignored `JMI_IMPORT_CONFIG_FILE`; see `docs/examples-from-john/README.md` and `docs/DATA_HANDLING.md`.
