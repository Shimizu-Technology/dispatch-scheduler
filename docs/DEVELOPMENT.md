# Development

## Setup

```bash
# Generate sanitized sample data from docs/examples-from-john/
./scripts/import_sample_data.py

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
./scripts/import_sample_data.py

# API
cd api
bundle exec rails test
bundle exec rubocop
bundle exec rails runner 's=DispatchSuggestionService.new(date: "2026-05-01").call; puts WhatsAppExportService.new(s).call.lines.first'

# Web
cd ../web
npm run lint
npm run build
```

## CI

GitHub Actions runs from the repo-level `.github/workflows/ci.yml` file. It verifies:

- Rails tests, RuboCop, Brakeman, and bundler-audit under `api/`.
- TypeScript lint and production build under `web/`.
- Python 3.10 importer compilation and unit tests for the sample-data parser.

## Data Safety

Do not commit external-system credentials. The committed seed JSON is sanitized and generated from the local review examples in `docs/examples-from-john/`.
