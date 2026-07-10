# JMI Pilot Readiness

Last updated: 2026-07-10

## What the application is for

The product captures the dispatch judgment that currently lives largely with
John: combine reactive work, preventive-maintenance commitments, status and KPI
pressure, crew composition, licensed-driver coverage, skills, geography, and
call-outs into a daily plan that a dispatcher can review and send through
WhatsApp. It is intentionally a focused dispatch operating system rather than a
replacement for every customer work-order platform or a full CMMS.

The meeting notes and workflow documentation consistently support four design
choices:

- suggestions remain editable and do not replace dispatcher judgment;
- default crews and today's actual crews are different concepts;
- PM work competes with reactive work and cannot disappear from the month;
- assessment, parts, approval, PA Project, and follow-up state must remain
  visible instead of being flattened into a single open/closed flag.

## Code-complete pilot protections

- Clerk-backed authentication and server-enforced admin/dispatcher/viewer roles.
- Durable AI intake drafts, private source attachment storage, explicit approve
  or reject actions, and approval/rejection audit events.
- Scanned and digital PDF extraction through OpenRouter file parsing; no local
  embedded-text-only PDF assumption.
- Work-order and PM status-event history for month-end cutoff reporting.
- Current closure timestamps plus lifecycle events, including reopen scenarios.
- Public-safe demo seed output and ignored local source artifacts/config.
- PostgreSQL-compatible queries tested locally, Rails tests, lint, Brakeman,
  dependency audit, frontend lint/build, and importer privacy tests.

Historical reports created after this change use the status at the selected
month cutoff rather than today's status. Existing records receive a migration
backfill from their available timestamps; because the old database never stored
every transition, exact pre-migration lifecycle history cannot be reconstructed.
That limitation should be stated on any legacy report used operationally.

## Requires John confirmation

These are product-policy questions, not safe implementation guesses:

1. Exact KPI/SLA clocks per priority and lifecycle stage, including whether
   business hours, weekends, waiting for parts/approval, reassessment, and PA
   Projects pause, reset, or continue each clock.
2. The authoritative meaning and mapping of every external priority/status,
   especially client-specific labels, before changing the current provisional
   P1–P4 timing constants.
3. Monthly report vocabulary and which date owns a count: reported, completed,
   closed, scheduled, billed, or customer-accepted.
4. Required source/AI-response retention period and which roles may retrieve an
   original attachment.
5. Whether a shared intake queue is desired or drafts should be private to the
   uploader until assigned.

## Requires owner/provider setup

- Make the GitHub repository private and coordinate the history purge described
  in `docs/DATA_HANDLING.md`; deleting artifacts in this branch is not a purge.
- Provision PostgreSQL and a private S3-compatible bucket with least-privilege
  runtime identities.
- Configure the production Clerk project, allowed origins, bootstrap admin, and
  invitation email settings.
- Approve the OpenRouter/model provider data-processing route for real customer
  documents.
- Enable TLS/host protection, error monitoring, structured log retention, and
  availability alerts in the selected host.
- Configure automated database and object-storage backups, then complete and
  record a restore drill.

## Pilot go/no-go

A limited pilot is reasonable only after all owner/provider items above are
complete and John has validated the provisional KPI behavior against a small
set of real lifecycle examples. Until then, the application is suitable for
local/staging workflow validation with synthetic data, not production customer
records.
