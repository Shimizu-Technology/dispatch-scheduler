# Development

## Setup

```bash
# Generate sanitized sample data from local artifacts (raw files are not committed)
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
cd web && npm run build
cd ../api && ~/.rbenv/shims/bundle exec rails runner 's=DispatchSuggestionService.new(date: "2026-05-01").call; puts WhatsAppExportService.new(s).call.lines.first'
```

## Data Safety

Do not commit raw John/customer artifacts or credentials. The repo only contains sanitized seed JSON generated from the sample workflow files.
