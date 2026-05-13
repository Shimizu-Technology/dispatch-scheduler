# Development

## Setup

```bash
# Generate sanitized sample data from docs/examples-from-john/
./scripts/import_sample_data.py

# API
cd api
bundle install
bundle exec rails db:setup
bundle exec rails server -p 3005

# Web
cd ../web
npm install
npm run dev -- --port 5175
```

Open http://127.0.0.1:5175.

## Authentication

The app runs with a local auth bypass when Clerk env vars are absent. It defaults
to an admin user so the POC opens quickly, but you can test read-only behavior
with `DEV_AUTH_ROLE=viewer` for Rails and `VITE_DEV_AUTH_ROLE=viewer` for React.

To test real auth, copy `.env.example` values into `web/.env.local` and your
Rails shell/API environment, then add real Clerk values. See
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
