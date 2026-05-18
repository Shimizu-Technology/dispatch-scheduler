# Current Implementation Roadmap

Last updated: 2026-05-12

This plan tracks what is done after the dispatch workflow and Clerk-auth PRs
merged, and what should come next to make the app solid for JMI operations.

## Current State

Implemented in the POC:

- Rails API with dashboard, work orders, teams, technicians, PM tasks, dispatch schedules, and WhatsApp export.
- React dispatch board showing dashboard counts, work orders, team availability, PMs, suggested dispatch, and WhatsApp output.
- Seed importer for John's provided Mobil workbook, PM workbook, Sodexo sample, and CBRE sample data.
- Rule-based dispatch suggestion using priority, status, driver availability, skill match, region, and PM commitments.
- Manual dispatch item overrides for crew, time, order, and notes.
- Regenerate confirmation and idempotent draft rebuilding for a schedule date.
- CI, Rails request/service tests, importer tests, frontend lint/build, Brakeman, and bundler-audit.
- Clerk auth with Rails JWT verification, Clerk token-claim setup docs, `admin`/`dispatcher`/`viewer` roles, bootstrap-admin setup, in-app user management, role refresh on sign-in, and viewer-only UI/API mode.
- Admin-only user management for changing persisted roles in the app, with `CLERK_BOOTSTRAP_ADMIN_EMAILS` reserved for first-admin setup and recovery.

Not implemented yet:

- Production file upload/intake.
- OCR or OpenRouter extraction.
- Human review workflow for AI-extracted work orders.
- Robust work-order edit/search/filter workflow.
- Finalize/publish schedule state.
- Audit history of overrides, regenerations, availability changes, and future intake approval.
- Daily team composition editing by date.
- Production deployment hardening, backups, and monitoring.

## Completed Phase 1 - Secure Internal Access

Goal: only approved JMI/Shimizu users can access the board.

Completed:

- Clerk added to the React app.
- Rails verifies Clerk JWTs against JWKS.
- All API endpoints are protected by Clerk, except health/CORS paths.
- Mutating dispatch endpoints require `admin` or `dispatcher`.
- Roles implemented: `admin`, `dispatcher`, `viewer`.
- Viewer users can inspect but cannot edit dispatch data.
- Frontend/backend URL env vars are documented through `VITE_API_URL` and `FRONTEND_URL`.
- Auth docs cover Clerk token claims, bootstrap-admin setup, in-app role management, and required env vars.

## Phase 2 - Real Intake Foundation

Goal: John/admin can add and maintain work without editing seed files.

Tasks:

- Expand the manual work-order form into a real intake screen.
- Add edit/update endpoints for work orders.
- Add UI controls for source, requester, location, WO number, priority, status, trade, requested date, due date, and notes.
- Add filters/search for status, priority, client, region, trade, and scheduled date.
- Add duplicate detection by source plus external WO number.
- Decide whether created/edited work orders should be immediately dispatch-eligible or require review.

Acceptance criteria:

- A dispatcher can manually create and edit a work order from the UI.
- Newly created work appears in dashboard counts and can be included in dispatch suggestions.
- Duplicate external WO numbers are flagged before save.

## Phase 3 - Upload And OCR With OpenRouter

Goal: uploaded PDFs/images/text can become draft work orders with human review.

Tasks:

- Implement private S3-backed upload storage using the plan in `docs/UPLOAD_STORAGE_PLAN.md`.
- Add Rails endpoints for presigned browser uploads and upload-complete registration.
- Add upload endpoints for PDF/image/text artifacts.
- Add an OpenRouter extraction service for OCR/vision-capable model calls.
- Extract structured fields into an intake draft, not directly into live work orders.
- Show confidence/status per extracted field.
- Add an approve/edit/reject review screen.
- Keep original files linked to the created work order.
- Add transactional email only when invitations, schedule notifications, or intake/OCR alerts exist. Resend is the likely default provider; document `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `APP_URL` when that work starts.

Acceptance criteria:

- Uploading the CBRE sample PDF creates a reviewable draft with WO number, location, service description, priority/status, target dates, requester/vendor details where available, and source reference.
- Uploading the Sodexo image or pasted text creates a reviewable draft.
- No AI-extracted work order enters dispatch until a human approves it.

## Phase 4 - Daily Schedule Operations

Goal: the dispatch schedule behaves like a real daily operating artifact.

Tasks:

- Add schedule status transitions: draft, reviewed, finalized, sent, archived.
- Add a "finalize schedule" action.
- Prevent accidental regeneration of finalized schedules.
- Add audit events for regenerate, manual override, availability change, and finalize.
- Add schedule notes and dispatcher owner.
- Add print/export options beyond copyable WhatsApp text.

Acceptance criteria:

- John/admin can finalize a schedule after review.
- Manual changes are traceable by user and timestamp.
- Regenerating a finalized schedule requires an explicit unlock/admin action.

## Phase 5 - Team And Availability Management

Goal: call-outs, drivers, and daily crew composition are first-class workflow inputs.

Tasks:

- Add team composition editing by date.
- Let dispatchers assign/remove technicians from a daily crew.
- Track driver coverage per team per day.
- Add reason codes for unavailable technicians.
- Surface overload warnings and no-driver warnings before schedule finalization.

Acceptance criteria:

- A dispatcher can model same-day call-outs without changing permanent team data.
- The scheduler uses the edited daily crew setup.
- Finalization warns if a team has no driver or lacks the likely trade skill.

## Phase 6 - Production Readiness

Goal: the app is safe and supportable for real JMI usage.

Tasks:

- Move production to PostgreSQL.
- Add deployment documentation.
- Add error monitoring and structured logs.
- Add backup/restore plan.
- Expand request/model tests around intake approval, audit history, and schedule finalization.
- Confirm production Clerk project settings, bootstrap admin email, frontend URL, and backend URL with JMI/Shimizu stakeholders.

Acceptance criteria:

- A new developer can set up the app from docs.
- CI protects the core dispatch workflow.
- Production data is backed up and recoverable.
- Support can diagnose auth, intake, scheduling, and export failures from logs.

## Recommended Next PR Order

1. Work-order create/edit/search improvements.
2. Private S3 upload storage plus intake draft model.
3. OpenRouter extraction service and review UI.
4. Schedule finalize/audit trail.
5. Daily team composition management.
6. Production deployment hardening.

## Definition Of Ready For John/JMI Pilot

The app is ready for a limited pilot when:

- Auth is enabled with real Clerk credentials, a bootstrap admin, and in-app role assignments for JMI/Shimizu users.
- John/admin can create/edit work orders without developer help.
- OCR-created records require human approval.
- Dispatch suggestions can be manually edited and finalized.
- WhatsApp export matches the final schedule.
- Changes are auditable.
- The app is deployed with backups.
