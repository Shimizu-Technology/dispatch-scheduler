# Development

## Setup

```bash
# Generate sanitized sample data from docs/examples-from-john/
./scripts/import_sample_data.py

# API
cd api
~/.rbenv/shims/bundle install
~/.rbenv/shims/bundle exec rails db:setup
~/.rbenv/shims/bundle exec rails server -p 3005

# Web
cd ../web
npm install
npm run dev -- --port 5175
```

Open http://127.0.0.1:5175.

## Verification

```bash
# Importer
python3 -m unittest discover -s scripts -p "*_test.py"
./scripts/import_sample_data.py

# API
cd api
~/.rbenv/shims/bundle exec rails test
~/.rbenv/shims/bundle exec rubocop
~/.rbenv/shims/bundle exec rails runner 's=DispatchSuggestionService.new(date: "2026-05-01").call; puts WhatsAppExportService.new(s).call.lines.first'

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
