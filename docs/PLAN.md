# John Ilao Dispatch/Scheduling POC Plan

Last updated: 2026-05-11
Owner: Leon / Shimizu Technology
Working agent: Prime

## 1. Why We Are Building This

John Ilao is currently the human dispatcher/scheduler for a facilities/work-order operation. Work comes in from systems, email, WhatsApp, PM schedules, and manual tracking. John decides what should happen today, who should go where, what needs assessment, what is waiting on parts/approval, and what gets sent to teams.

The core pain is not generic work-order CRUD. The pain is that John's scheduling judgment lives in his head. If he is gone, the process gets messed up.

**POC goal:** prove we can turn John's real workflow/data into a focused dispatch/scheduling system that helps someone besides John produce a competent daily schedule and WhatsApp-ready team assignments.

## 2. Product Thesis

Build a **focused dispatch/scheduling system** first, not a full enterprise CMMS.

The scheduler is the product:

> Work orders + PM commitments + team availability + drivers + skills + region → suggested daily dispatch schedule → WhatsApp-ready output.

Everything else supports that.

## 3. What John Sent Us

Artifacts are stored locally at:

`/Users/jerry/.openclaw/workspaces/prime/john-ilao-artifacts/`

Files:

- `WORK ORDER 40787.pdf` — sample work order from external work-order workflow.
- `Sodexo-sample.png` — sample WhatsApp/Sodexo request.
- `MOBIL SCHEDULE - MAY2026.xlsx` — active schedule workbook. Includes team/trade tab, monthly daily schedule tabs, approved work order tab, landscaping/ACU PM tabs.
- `PM SCHEDULE-APRIL2026.xlsx` — PM schedule sample sent to Mobil.

Important: John's email included external site credentials. Do **not** repeat them in notes/chat. Do **not** log into external systems without explicit Leon approval.

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

3. **Team / Technician Setup**
   - Technicians from John's schedule workbook
   - Skills/trades
   - Driver flag
   - Availability toggle for daily call-outs
   - Team grouping/editing

4. **PM Schedule View**
   - Display sample recurring PMs by location/date
   - Show PM work as schedulable commitments alongside reactive work orders

5. **Dispatch Builder**
   - Pick date
   - Show unscheduled items for that date / open backlog
   - Suggest daily team schedule using rule-based logic
   - Group by region/location when possible
   - Match skills/trades when possible
   - Warn if assigned team has no driver
   - Allow manual override/editing

6. **WhatsApp Export**
   - Generate clean copy/paste schedule by team
   - Include location, WO#, priority/status, description, and notes
   - This is a core adoption feature, not a nice-to-have

7. **Sample Intake Demo**
   - Manual work order form
   - Paste text demo using the Sodexo sample
   - Upload/OCR can be stubbed in the POC as "AI prefill preview" using the known sample. Full OCR pipeline can come later.

### Do Not Build Yet

- Full production auth/roles
- Technician mobile app
- Billing/invoices
- Customer portal
- Real CBRE/MyWork integration
- Real email/WhatsApp ingestion
- Perfect route optimization
- Full OCR/AI automation pipeline
- Multi-tenant SaaS packaging

## 5. Tech Stack

Leon prefers Rails + React, matching current Shimizu Technology stack. Use a monorepo.

Recommended repo structure:

```txt
john-dispatch-poc/
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
- Active Storage later for attachments; not required for first demo unless we want uploaded work-order files
- Simple seed/import scripts from XLSX → normalized seed JSON/database rows

### Frontend

- React + Vite + TypeScript
- Tailwind CSS
- TanStack Query or simple fetch hooks
- React Router
- Drag/drop optional; a simple move/select assignment UI is enough for POC

### AI/OCR

Phase 1 POC:
- Stub/controlled parser from sample text/image extraction results.
- Demonstrate "paste text → suggested fields → human review".

Later:
- OCR for images/PDFs
- LLM field extraction
- Confidence indicators
- Human review before saving

## 6. Data Model Draft

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

## 7. Status Normalization

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

## 8. Scheduler Logic Draft

Start rule-based. AI can come later. Boring and reliable. Beautiful.

Suggested ordering:

1. P1/P2 or Level 1 urgent items first.
2. Work nearing/over SLA next.
3. Needs-assessment items before lower-priority approved work if SLA requires it.
4. Waiting-for-parts items should not be scheduled unless marked parts-ready.
5. Match required skill/trade to team members.
6. Ensure every team has at least one driver.
7. Group by region/location to reduce islandwide bouncing.
8. Include PM tasks already committed for the day.
9. Fill gaps with P4/low-priority/PM work.
10. Let John/admin manually override everything.

Warnings to show:

- Team has no driver.
- Team lacks required trade.
- Team overloaded.
- Work order is waiting on parts/approval.
- Item is overdue or near SLA breach.
- Schedule sends team across far regions unnecessarily.

## 9. POC Demo Flow

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

## 10. Immediate Build Plan

### Step 1 — Create Repo/Scaffold
- Create monorepo under `~/work/john-dispatch-poc` or chosen Shimizu repo name.
- Rails API in `api/`.
- Vite React TS app in `web/`.
- Add `docs/` copied from this plan.

### Step 2 — Prepare Sanitized Seed Data
- Parse `MOBIL SCHEDULE - MAY2026.xlsx` into JSON/CSV:
  - technicians/skills from `Team` tab
  - work orders from `May2026`
  - approved/waiting parts from `Approved Work Orders`
- Parse `PM SCHEDULE-APRIL2026.xlsx` into PM task seed data.
- Add Sodexo sample as a seed work order.
- Do not commit raw confidential files unless Leon approves.

### Step 3 — Backend Models/API
- Implement models and seed data.
- API endpoints:
  - `GET /work_orders`
  - `GET /technicians`
  - `GET /teams`
  - `PATCH /technicians/:id/availability`
  - `GET /pm_tasks`
  - `POST /dispatch_schedules/suggest`
  - `PATCH /dispatch_items/:id`
  - `GET /dispatch_schedules/:id/whatsapp_export`

### Step 4 — Frontend Screens
- Dashboard
- Work Orders
- Teams/Availability
- Dispatch Builder
- WhatsApp Export

### Step 5 — Demo Polish
- Use John's real terminology.
- Keep UI clean and business-like.
- Add visible warnings for driver/call-out/region/status.
- Make WhatsApp output look like something John would actually send.

## 11. Open Questions For John / Office Walkthrough

We can build a POC now, but before production we still need:

1. Which technicians are licensed drivers?
2. How does John define regions/routes? North/central/south? By village clusters?
3. How many jobs per day is normal per team?
4. How does he estimate job duration?
5. What makes a P1 vs P2 vs P3 vs P4 in practice?
6. Does `Level 1` in Sodexo map to P1/P2, or is it a separate client priority scheme?
7. What does `CM` mean in his Mobil workbook?
8. What exact WhatsApp format does each team prefer?
9. What goes into the physical folder, and when?
10. What is the approval/parts/material-prep lifecycle?
11. What does his dad/family need to see to approve moving forward?

## 12. Recommended Message To John After Reviewing Artifacts

Brother, this is perfect — this is exactly the kind of stuff I needed. I’m going to review these examples and start mapping out how the proof of concept should work.

I think coming by your office is probably the right next step so you can walk me through the actual process: how you export the open work orders, decide what needs assessment, factor in PMs/call-outs/drivers, assign teams by area, and track what’s still open.

After that I should be able to put together something tangible using your real workflow/data.

## 13. Success Criteria

The POC succeeds if John says:

> Yeah, this is close enough that someone else could use it to help do my morning scheduling.

Not success:
- perfect AI
- perfect routing
- full CMMS
- technician app

Success is removing John as the single point of failure for daily dispatch.
