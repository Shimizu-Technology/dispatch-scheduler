# Post-PR Implementation Plan

This plan starts after the current dispatch workflow PR is merged. The PR proves
the core scheduling loop with John's sample data; the next work should turn the
POC into a usable internal tool for JMI operations.

## Current State

Implemented in the POC:

- Rails API with dashboard, work orders, teams, technicians, PM tasks, dispatch schedules, and WhatsApp export.
- React dispatch board showing dashboard counts, work orders, team availability, PMs, suggested dispatch, and WhatsApp output.
- Seed importer for John's provided Mobil workbook, PM workbook, Sodexo sample, and CBRE sample data.
- Rule-based dispatch suggestion using priority, status, driver availability, skill match, region, and PM commitments.
- Manual dispatch item overrides for crew, time, order, and notes.
- Regenerate confirmation and idempotent draft rebuilding for a schedule date.
- CI, Rails request/service tests, importer tests, and frontend module split.
- Clerk auth plumbing with Rails JWT verification, local dev bypass, `admin`/`dispatcher`/`viewer` roles, and viewer-only UI mode.

Not implemented yet:

- Production file upload/intake.
- OCR or OpenRouter extraction.
- Human review workflow for AI-extracted work orders.
- Finalize/publish schedule state.
- Audit history of overrides and regenerations.
- Production deployment hardening.

## Phase 1 - Secure Internal Access

Goal: only approved JMI/Shimizu users can access the board.

Tasks:

- Add Clerk to the React app.
- Add a Rails auth middleware/service that verifies Clerk JWTs.
- Protect all API endpoints except health checks.
- Add basic roles: admin, dispatcher, viewer.
- Hide edit controls from viewer users.
- Store user identity on manual changes once audit logging exists.

Acceptance criteria:

- Anonymous users cannot load dispatch data.
- Signed-in users can load the app and call the API.
- Viewer users can inspect schedules but cannot edit teams, availability, or dispatch items.

## Phase 2 - Real Intake Foundation

Goal: John/admin can add new work without editing seed files.

Tasks:

- Expand the manual work-order form into a real intake screen.
- Add fields for source, requester, location, WO number, priority, status, trade, requested date, due date, and notes.
- Add edit/update endpoints for work orders.
- Add filters/search for status, priority, client, region, trade, and scheduled date.
- Add duplicate detection by source plus external WO number.

Acceptance criteria:

- A dispatcher can manually create and edit a work order from the UI.
- Newly created work appears in dashboard counts and can be included in dispatch suggestions.
- Duplicate external WO numbers are flagged before save.

## Phase 3 - Upload And OCR With OpenRouter

Goal: uploaded PDFs/images/text can become draft work orders with human review.

Tasks:

- Enable Active Storage or equivalent upload handling in Rails.
- Add upload endpoints for PDF/image/text artifacts.
- Add an OpenRouter extraction service for OCR/vision-capable model calls.
- Extract structured fields into an intake draft, not directly into live work orders.
- Show confidence/status per extracted field.
- Add an approve/edit/reject review screen.
- Keep original files linked to the created work order.

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
- Add environment variable documentation.
- Add CI for Rails lint/tests and frontend lint/build.
- Add request/model tests around scheduling, manual overrides, auth, and intake approval.
- Add error monitoring and structured logs.
- Add backup/restore plan.
- Add deployment documentation.

Acceptance criteria:

- A new developer can set up the app from docs.
- CI protects the core dispatch workflow.
- Production data is backed up and recoverable.

## Recommended Next PR Order

1. Clerk auth and role-gated API/UI.
2. Work-order create/edit/search improvements.
3. Upload storage plus intake draft model.
4. OpenRouter extraction service and review UI.
5. Schedule finalize/audit trail.
6. Daily team composition management.
7. Production deployment hardening.

## Definition Of Ready For John/JMI Pilot

The app is ready for a limited pilot when:

- Auth is enabled.
- John/admin can create/edit work orders without developer help.
- OCR-created records require human approval.
- Dispatch suggestions can be manually edited and finalized.
- WhatsApp export matches the final schedule.
- Changes are auditable.
- The app is deployed with backups.
