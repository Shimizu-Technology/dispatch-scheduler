# John Ilao Dispatch/Scheduling POC Plan

Last updated: 2026-05-26
Owner: Leon / Shimizu Technology
Working agent: Prime

## 1. Why We Are Building This

John Ilao is currently the human dispatcher/scheduler for a facilities/work-order operation. Work comes in from systems, email, WhatsApp, PM schedules, and manual tracking. John decides what should happen today, who should go where, what needs assessment, what is waiting on parts/approval, and what gets sent to teams.

The core pain is not generic work-order CRUD. The pain is that John's scheduling judgment lives in his head. If he is gone, the process gets messed up.

**POC goal:** prove we can turn John's real workflow/data into a focused dispatch/scheduling system that helps someone besides John produce a competent daily schedule and WhatsApp-ready team assignments.

## 2. Product Thesis

Build a **focused dispatch/scheduling system** first, not a full enterprise CMMS.

The scheduler is the product:

> Work orders + PM commitments + technician roster + default crews + today's call-outs/crew swaps + drivers + skills + regions → suggested daily dispatch schedule → reviewed/finalized dispatch → WhatsApp-ready output.

Everything else supports that.

See `docs/JMI_WORKFLOW_MODEL.md` for the current product/workflow model, including the important distinction between persistent default crews and selected-date daily crew overrides. See `docs/JOHN_MEETING_2026_05_26.md` for the latest John review notes and product implications.

## 3. What John Sent Us

Artifacts are stored locally in this repo at:

`docs/examples-from-john/`

Files:

- `WORK ORDER 40787.pdf` — sample work order from external work-order workflow.
- `Sodexo-sample.png` — sample WhatsApp/Sodexo request.
- `MOBIL SCHEDULE - MAY2026.xlsx` — active schedule workbook. Includes team/trade tab, monthly daily schedule tabs, approved work order tab, landscaping/ACU PM tabs.
- `PM SCHEDULE-ARPIL2026.xlsx` — PM schedule sample sent to Mobil. The filename is misspelled in the original attachment and the importer intentionally tolerates it.

Important: John's email included external site credentials. Do **not** repeat them in notes/chat. Do **not** log into external systems without explicit Leon approval. Keep generated seed data sanitized even when the local examples remain available for development review.

## 4. POC Scope

### Product Experience Principles

This POC must be easy enough for John, an admin, or a family member to understand quickly without training. The target is not "power-user enterprise software." The target is: open the app, understand what needs attention, build today's schedule, copy the WhatsApp message.

Principles:

1. **Ease of use first**
   - Every screen should answer one obvious question.
   - Avoid dense enterprise tables unless they are filtered/summarized clearly.
   - Use plain labels from John's workflow: Work Orders, Teams, Today's Dispatch, Waiting for Parts, Needs Assessment.

2. **Intuitive by default**
   - Show next actions clearly: Review, Assign, Schedule, Copy WhatsApp.
   - Use badges/colors for priority/status/driver warnings.
   - Preserve John's mental model instead of forcing new terminology.

3. **Mobile + desktop responsive**
   - Desktop: dashboard/table-heavy dispatch planning for office/admin use.
   - Mobile: quick review, status checks, availability edits, and WhatsApp copy/export.
   - Design mobile cards first for work orders and dispatch items, then expand to desktop tables where useful.

4. **Manual override always**
   - The system suggests; John/admin decides.
   - Every suggested assignment should be editable.

5. **Fast demo path**
   - The POC must make the core workflow obvious within 2-3 minutes.
   - No hidden configuration maze before showing value.

### Build These

1. **Dashboard**
   - Today's work orders count
   - Needs assessment count
   - Approved/scheduled count
   - Waiting parts/approval/estimate count
   - Teams available today
   - Driver warnings

2. **Work Orders**
   - List/search/filter sample work orders
   - Fields: client/project, location, region, WO#, description, priority, status, trade/category, source, assigned team, notes
   - Preserve original imported status text
   - Normalize status for app usage
   - Show current lifecycle status clearly on work order and dispatch screens
   - Track PA Project, corrective maintenance, and estimate context for follow-up/reporting
   - Classify work by configurable service line / contract line

3. **Team / Technician Setup**
   - Technicians from John's schedule workbook
   - Skills/trades
   - Driver flag
   - Persistent/default crew setup for normal reusable crews
   - Daily crew overrides for selected-date call-outs and swaps
   - Availability toggle for daily call-outs
   - Clear driver coverage warnings for both default setup and today's actual crews

4. **PM Schedule View**
   - Display sample recurring PMs by location/date
   - Show PM work as schedulable commitments alongside reactive work orders
   - Track monthly PM completion status
   - Eventually suggest same-location PMs when a crew is already dispatched to that site

5. **Dispatch Builder**
   - Pick date
   - Show unscheduled items for that date / open backlog
   - Suggest daily team schedule using rule-based logic
   - Group by region/location when possible
   - Match skills/trades when possible
   - Prefer matching service line / contract line when configured
   - Respect SLA/KPI timing so lower-priority work does not flood today's plan before it is due
  - Keep PA Project follow-up out of normal KPI-driven suggestions unless a dispatcher explicitly schedules it for the selected date
   - Warn if assigned team has no driver
   - Allow manual override/editing of crew, time, order, and notes
   - Allow mid-day work-order status updates separate from end-of-day outcomes

6. **WhatsApp Export**
   - Generate clean copy/paste schedule by team
   - Include location, WO#, priority/status, description, and notes
   - This is a core adoption feature, not a nice-to-have

7. **Sample Intake Demo**
   - Manual work order form
   - Paste text demo using the Sodexo sample
   - Upload/OCR can be stubbed in the POC as "AI prefill preview" using the known sample. Full OCR pipeline can come later.

8. **Secure Internal Access**
   - Clerk browser sign-in
   - Rails-side JWT verification against Clerk JWKS
   - `admin`, `dispatcher`, and `viewer` roles
   - Viewer-safe read-only UI and API guards

### Do Not Build Yet

- Technician mobile app
- Billing/invoices
- Customer portal
- Real CBRE/MyWork integration
- Real email/WhatsApp ingestion
- Perfect route optimization
- Full OCR/AI automation pipeline
- Multi-tenant SaaS packaging

## 5. Current Implementation Snapshot

Implemented as of June 15, 2026:

- Rails API and React/Vite frontend monorepo.
- Sanitized seed/import flow from John's Mobil workbook, PM workbook, Sodexo sample, and CBRE PDF sample.
- Dashboard counts, work-order list, PA Projects workspace, team/technician availability, PM task view with reusable templates/station checklist, monthly reports, and dispatch builder.
- Work-order operational tracking for PA Projects, corrective maintenance, estimate-required work, structured parts/ETA/follow-up owner/vendor references, and configurable service lines / contract lines.
- SLA/KPI due-date modeling for reported time, assessment due time, assessed time, repair due time, Guam-local time, and dashboard SLA pressure counts.
- PM month workflow for reusable Mobil monthly PM templates, duplicate-safe month generation, station-level completion tracking, manual PM creation, spreadsheet-paste exception rows, pending/scheduled/completed/deferred preventive maintenance, and incomplete-this-month tracking.
- Rule-based daily schedule suggestion using priority, lifecycle status, SLA pressure, skill/trade, driver availability, region, PM commitments, same-location “while you’re there” PM opportunities, and late-month PM closeout pressure.
- Idempotent draft regeneration by date with a configurable daily item cap.
- Manual dispatch overrides for crew, per-stop technician assignment, scheduled time, order, and notes.
- WhatsApp-ready schedule export with finalized-before-sent guard.
- AI-assisted intake preview from screenshot/image upload, PDF text, text file, pasted request text, and pasted screenshots; extracted drafts require human review/edit before saving.
- Monthly JSON/CSV report endpoint for Mobil/CBRE/JMI conversations covering KPI pressure, PM completion, CM, estimates, PA Projects, parts, and follow-ups.
- Clerk auth with JWT verification, `FRONTEND_URL` / `VITE_API_URL` wiring, bootstrap-admin setup, in-app user management, and role refresh on sign-in.
- Viewer mode hides/disables mutating controls and Rails guards mutating endpoints.
- CI for Rails tests/lint/security, frontend lint/build, and Python importer tests.

Still not implemented / still evolving:

- Source-file storage for uploaded intake files after preview/save.
- Scanned-image PDF OCR beyond readable PDF text extraction.
- Excel-file PM import beyond the current spreadsheet-paste month setup.
- Deeper service-line-aware crew preferences/scheduler scoring.
- Production deployment/backups/monitoring.

## 6. Tech Stack

Leon prefers Rails + React, matching current Shimizu Technology stack. Use a monorepo.

Recommended repo structure:

```txt
dispatch-scheduler/
  README.md
  docs/
    PLAN.md
    DATA_MODEL.md
    SCHEDULER_RULES.md
    WALKTHROUGH_NOTES.md
  api/                  # Rails API
    app/
    db/
    config/
  web/                  # React + Vite + TypeScript
    src/
  data/
    raw/                # Do not commit sensitive raw files unless approved
    seeds/              # Sanitized JSON/CSV sample data
    imports/            # Import scripts/output
```

### Backend

- Rails API
- PostgreSQL in production direction; SQLite is acceptable for fastest local POC if desired, but Postgres keeps us aligned with deploy path
- Private S3 presigned uploads later for retained intake attachments; current intake preview sends uploaded/pasted content directly for extraction and does not retain source files
- Simple seed/import scripts from XLSX → normalized seed JSON/database rows

### Frontend

- React + Vite + TypeScript
- Tailwind CSS
- TanStack Query or simple fetch hooks
- React Router
- Drag/drop optional; a simple move/select assignment UI is enough for POC

### AI/OCR

Phase 1 POC:
- OpenRouter-backed extraction for images/screenshots, PDF text, text files, pasted text, and pasted screenshots.
- Extracted drafts show confidence/issues and must be reviewed/edited before saving.
- Intake defaults avoid forcing newly created work into today's dispatch unless the dispatcher explicitly sets a dispatch date.

Later:
- Private S3 upload storage for retained source files
- OCR for scanned/non-text PDFs
- Deeper vendor-specific parsing rules as John provides more samples

## 7. Data Model Draft

### Core Tables

#### clients
- id
- name // Mobil, Sodexo, School, Hotel, etc.

#### locations
- id
- client_id
- name // Yigo North, Agana Heights ES, Airport, etc.
- region // north, central, south, etc.
- address optional
- notes

#### work_orders
- id
- client_id
- location_id
- external_id / wo_number
- source // mobil_export, whatsapp, manual, pdf_upload, pm_schedule
- source_reference
- title
- description
- priority // P1/P2/P3/P4/Level 1/etc.
- normalized_priority
- status
- original_status_text
- trade_category
- requested_at
- response_due_at
- repair_due_at
- assigned_team_id nullable
- scheduled_date nullable
- estimated_hours nullable
- notes

#### technicians
- id
- name
- primary_trade
- is_driver boolean
- active boolean

#### technician_skills
- technician_id
- skill // electrical, HVAC, plumbing, carpentry, masonry, landscaping, painting, general, helper

#### teams
- id
- name
- region_preference nullable
- notes

#### team_memberships
- team_id
- technician_id
- date nullable // allow daily team composition if needed

#### technician_availabilities
- technician_id
- date
- status // available, unavailable, partial
- reason // call-out, vacation, etc.

#### pm_tasks
- id
- client_id
- location_id
- task_name
- trade_category
- frequency
- scheduled_date
- source_file

#### dispatch_schedules
- id
- date
- status // draft, finalized

#### dispatch_items
- id
- dispatch_schedule_id
- work_order_id nullable
- pm_task_id nullable
- team_id
- order_index
- scheduled_time nullable
- notes

#### follow_ups
- id
- work_order_id
- type // estimate, approval, parts, repair, material_prep
- status
- notes
- due_at nullable

#### users
- id
- clerk_id
- email
- name
- role // admin, dispatcher, viewer
- last_seen_at

## 8. Status Normalization

Current source data has messy statuses and typos:

- `ASSESSMENT P4`
- `ASSESSMENT P3`
- `ASSESSMENT P2`
- `ASSESSMNET P4`
- `ASSESSMET P3`
- `APPROVED`
- `APPROVED 2267`
- `CM`
- `PM`
- `WAITING FOR PARTS`
- `SCHEDULED`

Normalize into app statuses:

- `new`
- `needs_assessment`
- `assessed`
- `approved`
- `waiting_for_estimate`
- `waiting_for_approval`
- `waiting_for_parts`
- `ready_for_repair`
- `scheduled`
- `in_progress`
- `completed`
- `closed`
- `pm`

Always preserve `original_status_text` for traceability.

## 9. Scheduler Logic Draft

Start rule-based. AI can come later. Boring and reliable. Beautiful.

Suggested ordering:

1. P1/P2 or Level 1 urgent items first.
2. Work nearing/over SLA next.
3. Needs-assessment items before lower-priority approved work if SLA requires it.
4. Waiting-for-parts items should not be scheduled unless marked parts-ready.
5. PA Project work should be visible for follow-up but not automatically pushed into normal dispatch unless explicitly ready.
6. Match required skill/trade to team members.
7. Prefer matching service line / contract line where configured.
8. Ensure every team has at least one driver.
9. Group by region/location to reduce islandwide bouncing.
10. Suggest PM tasks opportunistically when a crew is already at the same location/region.
11. Fill gaps with P4/low-priority/PM work only when SLA timing and workload make sense.
12. Let John/admin manually override everything.

Warnings to show:

- Team has no driver.
- Team lacks required trade.
- Team overloaded.
- Work order is waiting on parts/approval.
- Item is overdue or near SLA breach.
- Schedule sends team across far regions unnecessarily.

## 10. POC Demo Flow

The demo should answer one question:

> Can this help someone besides John create the morning dispatch schedule?

Demo sequence:

1. Open dashboard.
2. Show imported sample Mobil work orders and Sodexo request.
3. Toggle one or two techs unavailable to simulate call-outs.
4. Confirm each team has a driver or show warning.
5. Open Dispatch Builder for a sample date.
6. Click "Suggest Schedule".
7. Review schedule grouped by team/region.
8. Manually move one item.
9. Generate WhatsApp messages.
10. Show status board: needs assessment, approved, waiting parts, PM.

## 11. Completed POC Build Steps

These steps are implemented and should be treated as historical context, not
remaining work.

### Step 1 — Create Repo/Scaffold
- Created monorepo with Rails API in `api/` and Vite React TS app in `web/`.
- Added docs, CI, and root setup guidance.

### Step 2 — Prepare Sanitized Seed Data
- Parsed `MOBIL SCHEDULE - MAY2026.xlsx` into seed data:
  - technicians/skills from `Team` tab
  - work orders from `May2026`
  - approved/waiting parts from `Approved Work Orders`
- Parsed `PM SCHEDULE-ARPIL2026.xlsx` into PM task seed data.
- Added Sodexo and CBRE samples as seed work orders.
- Do not commit external-system credentials. Keep generated seed data sanitized from the local review examples.

### Step 3 — Backend Models/API
- Implemented models, seed data, Clerk auth, and core endpoints:
  - `GET /work_orders`
  - `POST /work_orders`
  - `GET /technicians`
  - `GET /teams`
  - `PATCH /technicians/:id`
  - `GET /pm_tasks`
  - `POST /dispatch_schedules/suggest`
  - `PATCH /dispatch_items/:id`
  - `GET /dispatch_schedules/:id/whatsapp_export`

### Step 4 — Frontend Screens
- Dashboard
- Work Orders
- Teams/Availability
- PM Tasks
- Dispatch Builder
- WhatsApp Export
- Clerk auth gate and viewer mode

### Step 5 — Demo Polish
- Uses John's terminology.
- Keeps UI clean and business-like.
- Adds visible warnings for driver/call-out/region/status.
- Produces copyable WhatsApp output.

## 12. Open Questions For John / Office Walkthrough

We can build a POC now, but before production we still need:

1. Which technicians are licensed drivers?
2. How does John define regions/routes? North/central/south? By village clusters?
3. How many jobs per day is normal per team?
4. How does he estimate job duration?
5. What makes a P1 vs P2 vs P3 vs P4 in practice?
6. Does `Level 1` in Sodexo map to P1/P2, or is it a separate client priority scheme?
7. What exact WhatsApp format does each team prefer?
8. What goes into the physical folder, and when?
9. What is the approval/parts/material-prep lifecycle?
10. Which default service lines / contract lines should be seeded for JMI, and who can maintain them?
11. What fields are needed for PA Project follow-up beyond a checkbox and notes?
12. Should “estimate” be a checkbox, status, estimate number, or eventually a full estimate object?
13. What does his dad/family need to see to approve moving forward?

## 13. Recommended Message To John After Reviewing Artifacts

Brother, this is perfect — this is exactly the kind of stuff I needed. I’m going to review these examples and start mapping out how the proof of concept should work.

I think coming by your office is probably the right next step so you can walk me through the actual process: how you export the open work orders, decide what needs assessment, factor in PMs/call-outs/drivers, assign teams by area, and track what’s still open.

After that I should be able to put together something tangible using your real workflow/data.

## 14. Success Criteria

The POC succeeds if John says:

> Yeah, this is close enough that someone else could use it to help do my morning scheduling.

Not success:
- perfect AI
- perfect routing
- full CMMS
- technician app

Success is removing John as the single point of failure for daily dispatch.
