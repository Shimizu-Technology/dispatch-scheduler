# Current Implementation Roadmap

Last updated: 2026-06-02

This plan tracks what is done after the dispatch workflow and Clerk-auth PRs
merged, and what should come next to make the app solid for JMI operations.

## Current State

Latest product review: see `docs/JOHN_MEETING_2026_05_26.md`.

Implemented in the POC:

- Rails API with dashboard, work orders, teams, technicians, PM tasks, dispatch schedules, and WhatsApp export.
- React dispatch board showing dashboard counts, work orders, team availability, PMs, suggested dispatch, and WhatsApp output.
- Seed importer for John's provided Mobil workbook, PM workbook, Sodexo sample, and CBRE sample data.
- Rule-based dispatch suggestion using priority, status, carry-forward continuity, crew-day capacity, driver availability, skill match, region, and PM commitments.
- PM Month Setup workflow with manual PM creation, spreadsheet-paste bulk setup, duplicate-safe bulk creation, and pending/scheduled/completed/deferred tracking.
- Manual dispatch item overrides for crew, time, order, and notes.
- Immutable technician snapshots on dispatch stops, plus a person day view inside Crews.
- Auto carry-forward of unfinished sent/finalized prior-day dispatch work, while completed/blocked/PA Project work stays held out unless explicitly scheduled.
- Crew-day capacity guardrails with urgent/carry-forward overflow warnings and better same-location PM bundling.
- Regenerate confirmation and idempotent draft rebuilding for a schedule date.
- CI, Rails request/service tests, importer tests, frontend lint/build, Brakeman, and bundler-audit.
- Clerk auth with Rails JWT verification, Clerk token-claim setup docs, `admin`/`dispatcher`/`viewer` roles, bootstrap-admin setup, in-app user management, role refresh on sign-in, and viewer-only UI/API mode.
- Admin-only user management for changing persisted roles in the app, with `CLERK_BOOTSTRAP_ADMIN_EMAILS` reserved for first-admin setup and recovery.

Not implemented yet / still evolving:

- Production file upload/intake.
- Full PDF OCR and source-file storage.
- Excel-file PM import beyond the current spreadsheet-paste month setup.
- Full production file upload/intake.
- OpenRouter OCR review workflow.
- Deeper technician-level service-line preferences beyond crew-level service-line preferences.
- More configurable capacity settings by crew if John needs different day caps by crew type.
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

Goal: default crews, call-outs, drivers, and daily crew composition are first-class workflow inputs.

Important product distinction:

- **Default crews** are the persistent normal crew setup.
- **Today's crews** are selected-date adjustments for call-outs, swaps, borrowed drivers, and unusual field capacity.

See `docs/JMI_WORKFLOW_MODEL.md` for the full workflow model.

Tasks:

- Add persistent default crew editing: create, rename, update members, preferred region, and active/archive state.
- Keep daily crew composition editing by date as a separate workflow from default crew editing.
- Let dispatchers assign/remove technicians from a daily crew without mutating default crews.
- Track driver coverage for both default crews and today's actual crews.
- Add reason codes for unavailable technicians.
- Surface overload warnings and no-driver warnings before schedule finalization.
- Improve seed/import logic so historical `TECH ASSIGNED` values are not blindly treated as authoritative default crews.

Acceptance criteria:

- An admin/dispatcher can maintain normal reusable crew setup.
- A dispatcher can model same-day call-outs without changing permanent team data.
- The UI clearly shows default crew vs today's crew and when a daily override is active.
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

1. Private S3 upload storage plus intake draft model.
2. OpenRouter extraction service and review UI.
3. Production deployment hardening and real JMI data loading.
4. Technician-level service-line preferences if John needs person-specific contract affinity.
5. Reporting for monthly client/KPI meetings.

## Current Milestone Branch

Branch: `feature/dispatch-continuity-capacity`

Scope implemented by this milestone:

- Snapshot the assigned technicians for every generated/overridden dispatch stop so historical schedules do not change when default crews later change.
- Add a person day view in Crews showing each technician's assigned dispatch stops for the selected date.
- Carry forward unfinished sent/finalized prior-day work automatically, preferring the previous crew and labeling the context for dispatcher review.
- Keep completed, blocked, and PA Project work out of automatic carry-forward unless the dispatcher explicitly schedules it.
- Apply crew-day capacity caps using estimated work-order hours and shorter PM defaults; defer low-pressure overflow while allowing urgent/carry-forward overflow with warnings.
- Add `required_technician_count` to work orders and prefer crews with enough available technicians.
- Improve PM balancing by bundling incomplete same-location monthly PMs directly after the matching work-order stop.

## Definition Of Ready For John/JMI Pilot

The app is ready for a limited pilot when:

- Auth is enabled with real Clerk credentials, a bootstrap admin, and in-app role assignments for JMI/Shimizu users.
- John/admin can create/edit work orders without developer help.
- OCR-created records require human approval.
- Dispatch suggestions can be manually edited and finalized.
- WhatsApp export matches the final schedule.
- Changes are auditable.
- The app is deployed with backups.
