# JMI Dispatch Workflow Model

Last updated: 2026-05-26

This document captures what we currently understand about John Ilao's dispatch workflow and how the Dispatch Scheduler app should model it. It exists to keep product decisions grounded in John's real process instead of drifting into generic CMMS/work-order software.

Primary sources:

- `docs/PLAN.md`
- `docs/examples-from-john/`
- `Brain-Dump/work/shimizu-tech/JMI-John-Ilao/1) Meeting with John - May 7, 2026.md`
- `Brain-Dump/work/shimizu-tech/JMI-John-Ilao/2) Meeting with John about the Dispatch App.md`
- John's May 11 operation-details email and attachments/screenshots
- `docs/JOHN_MEETING_2026_05_26.md`

## 1. Core Product Thesis

This app is not primarily a work-order CRUD tool and not a full technician CMMS.

The core product is the morning dispatch decision:

> Work orders + PM commitments + technician roster + default crews + today's call-outs/crew swaps + drivers + skills + regions → suggested daily schedule → reviewed/finalized dispatch → WhatsApp-ready crew assignments.

The app succeeds if John, another admin, or a family member can open it and produce a competent daily dispatch plan without everything depending on John's memory.

## 2. What John Actually Does

John is currently the human operating system for JMI dispatch.

His work includes:

1. Reviewing incoming work orders.
   - CBRE/MyWork-style work orders.
   - WhatsApp/Sodexo-style requests.
   - Email/manual requests.
   - Existing open work orders in his exported Excel workflow.

2. Understanding work-order status and urgency.
   - Needs assessment.
   - Approved / ready to work.
   - Waiting for parts.
   - Waiting for approval/estimate.
   - Scheduled / in progress / done.
   - Priority and SLA pressure: P1/P2 urgent, P3/P4 lower but still deadline-bound.

3. Balancing PM work with reactive work orders.
   - PM sheets are commitments that compete with reactive work.
   - PMs are organized by village/section/date and task type.

4. Using technician/trade knowledge.
   - Who can do electrical, HVAC, plumbing, carpentry, painting, landscaping, general/helper work.
   - Which technicians are drivers.
   - Which teams need multiple people.

5. Managing crews for the day.
   - There are normal/default crew groupings.
   - People call out.
   - John swaps people in real time.
   - Every active crew needs a licensed driver.
   - Some teams are more specialized, e.g. painting, landscaping, PM, Mobil/HKR-type work.

6. Thinking geographically.
   - JMI works islandwide.
   - John usually tries to keep teams in a region/route for the day.
   - This is practical, not absolute: priority/skill/urgency can override region.

7. Sending the daily dispatch.
   - John currently copies schedule details and sends them through WhatsApp.
   - The app should preserve that simple adoption path.
   - No technician app is required for the initial product.

8. Tracking follow-up state.
   - After assessment, work may need estimate, approval, parts, PA Project tracking, or repair scheduling.
   - John's physical folder/Excel tracking helps him remember what is still open.
   - The app needs to reduce the risk that work gets lost when John is absent.

9. Managing contract/business reporting context.
   - Some work falls under corrective maintenance.
   - Some work requires an estimate/approval path.
   - Some work should be marked as a PA Project so it does not affect Mobil/CBRE KPI while waiting.
   - John needs these fields for monthly client meetings, KPI conversations, and pricing renegotiation support.

## 3. Source Artifacts And What They Mean

### Technician/trade sheet

The technician/trade sheet is the roster source.

It tells us:

- technician names
- trade/specialty
- driver assumptions only where known or inferred
- broad division context such as Mobil vs HKR

This should feed the `technicians` and `technician_skills` data.

### Monthly schedule workbook

The monthly schedule workbook is operational history/current planning.

Important: `TECH ASSIGNED` values in the workbook are often daily assignments, not necessarily permanent/default crews.

Therefore:

- They are useful examples of how John groups people.
- They are useful for seed/demo data.
- They should not automatically be treated as authoritative permanent crew definitions without review.

### PM schedule workbook

The PM workbook shows recurring commitments by task, location/village, section, and projected date.

This should feed schedulable `pm_tasks` and region/location logic.

### CBRE/MyWork PDF sample

The PDF shows structured work-order details:

- WO number
- customer/location
- service/description
- priority/status
- target dates
- source reference

OCR/import should produce a reviewable draft, not directly commit live dispatch work.

### WhatsApp/Sodexo screenshot

The screenshot shows informal intake:

- sender/requester
- location
- priority text such as `Level 1`
- short issue description

This supports manual intake and AI-assisted prefill, but human review remains required.

## 4. The Correct Crew Model

The crew workflow needs two distinct concepts.

### A. Default Crews

Default crews are the normal reusable team setup.

They answer:

> If nobody calls out and nothing unusual happens, who normally works together?

Admins/dispatchers should be able to:

- create a default crew
- rename a crew
- set default crew members
- add/remove technicians from the default crew
- set preferred region/route
- set crew type/specialty if useful
- confirm the crew has a driver
- deactivate/archive crews that should not be scheduled

Default crew edits are persistent. They affect future dates unless overridden.

### B. Today's Crews

Today's crews are the actual working crews for the selected schedule date.

They answer:

> Given today's call-outs and swaps, who is actually going out today?

Dispatchers should be able to:

- mark a technician unavailable/call-out for the date
- swap/borrow technicians for the date
- add a driver to a crew for the date
- remove a technician for the date
- intentionally leave a crew empty/inactive for the date
- create an extra temporary crew for the date if needed
- reset a daily crew back to its default

Today's crew edits should not silently change the permanent default setup.

### Why this separation matters

John's May 11 note says teams should be editable in real time because people call out, and each team must have a driver. That is daily operations.

But Leon's walkthrough exposed a different need: admins also need to correct or maintain the normal crew setup. If a crew is normally `Anton / Ronel`, the admin should be able to fix that default directly instead of creating a daily override every time.

The UI must make this obvious:

- **Default crew** = normal reusable setup.
- **Today crew** = selected-date reality.
- **Daily override active** = today differs from default.

## 5. Recommended App Flow

### Step 1 — Work intake

Purpose: get work into the system cleanly.

Sources:

- manual entry
- CBRE/MyWork export/PDF/image
- WhatsApp/Sodexo text/image
- PM schedule import

Rules:

- AI/OCR creates drafts only.
- Human reviews before importing.
- Imported work uses duplicate detection and audit logging.

### Step 2 — Work-order triage

Purpose: decide what is dispatch-eligible.

The app should surface:

- needs assessment
- approved/ready work
- scheduled / in progress work
- waiting for parts/approval/estimate
- carry-over/follow-up work
- PA Project work that needs follow-up but may be excluded from KPI pressure
- corrective maintenance vs estimate context
- priority/SLA pressure
- scheduled date/backlog
- client/location/region/trade
- configurable service line / contract line

### Step 3 — Default crew setup

Purpose: maintain the normal operating crew roster.

This is not something John should have to do every morning, but admins need it when staffing/structure changes.

Minimum expected actions:

- manage technicians
- manage skills
- mark driver capability
- create/edit default crews
- ensure default crew driver coverage

### Step 4 — Today's crew readiness

Purpose: model today's actual field capacity.

This is the morning workflow:

- mark call-outs
- adjust crew composition for the selected date
- verify driver coverage
- verify skills coverage
- decide which crews are active today

The dashboard should block or warn schedule generation if driver coverage is unsafe.

### Step 5 — Suggest schedule

Purpose: let the app do the first scheduling pass.

Inputs:

- dispatch date
- eligible work orders
- due PM tasks
- today's actual crews
- technician skills
- driver coverage
- priority/SLA
- region/location

Rules:

- P1/P2 or Level 1 urgent items first.
- Needs-assessment items should not be buried.
- Waiting-for-parts/approval items should be held out unless ready.
- P4 work should not automatically flood today's plan if it is still within SLA.
- Match trade/skill where possible.
- Prefer matching configurable service line / contract line where possible.
- Keep teams geographically sensible where possible.
- Warn when assumptions are weak.

### Step 6 — Manual dispatch review

Purpose: John/admin remains the final decision maker.

Every suggested item must be editable:

- crew
- order
- time
- notes

The system suggests; the dispatcher decides.

### Step 7 — Finalize schedule

Purpose: convert draft to official dispatch plan.

Rules:

- finalized/sent schedules should not be accidentally regenerated
- unlocking/reopening should be explicit
- changes should be auditable

### Step 8 — WhatsApp export

Purpose: preserve John's real send workflow.

The app should produce clean crew-by-crew text that can be pasted into WhatsApp.

The export should include:

- date
- crew names/technicians
- call-outs where relevant
- ordered stops/tasks
- location
- WO number if present
- priority/status
- concise description
- dispatcher notes

### Step 9 — Mark sent and audit

Purpose: show operational state and history.

After dispatch is sent:

- schedule status becomes sent
- sent timestamp/user is recorded
- related work orders can move to in progress
- activity log shows important changes

### Step 10 — Mid-day status updates

Purpose: reflect real operational changes without pretending the day is over.

A dispatcher should be able to update the work order's current status during the day, for example:

- needs assessment → in progress
- in progress → waiting for parts
- in progress → waiting for approval
- waiting for parts → approved/ready again

This is separate from the end-of-day dispatch outcome.

### Step 11 — End-of-day dispatch outcome

Purpose: record what happened during this specific crew visit.

A dispatch outcome may update the work order status, but it is not the same concept.

Examples:

- Complete → work order completed.
- Carry Over → work order carry_over with a future scheduled date.
- Waiting Parts → work order waiting_for_parts.
- Waiting Approval → work order waiting_for_approval.
- Unable to Access → work order may return to needs_assessment/follow-up.
- Pending → work order remains scheduled.

### Step 12 — PA Project / parts follow-up

Purpose: keep long-running blocked work visible.

A PA Project flag should be independent of the normal work order status. Most PA Projects are waiting on parts/materials, but not all. PA Projects should be easy to filter, report, and follow up on.

## 6. UI Information Architecture Direction

The current top-level sections should evolve toward this mental model:

1. **Dashboard**
   - next best action
   - dispatch state
   - open work pressure
   - PM due
   - crew readiness
   - recent activity

2. **Work Orders**
   - intake/review/search/edit
   - manual/OCR import
   - status and priority triage

3. **Crews**
   - should likely split internally into:
     - Default Crews
     - Today's Crews
     - Technicians
   - or become separate nav sections if the page gets too dense

4. **PM Tasks**
   - due PM commitments by date/location
   - monthly completion status
   - future “while you are there” PM suggestions based on work-order locations

5. **PA Projects**
   - work orders marked as PA Projects
   - parts/materials/follow-up notes
   - visibility into long-running work that should not be lost

6. **Service Lines / Contract Lines**
   - admin-configurable list, not hard-coded
   - seeded defaults may include Mobil / CBRE, HKR, Public Schools / Sodexo, General
   - used to classify work orders and optionally prefer crews/technicians

7. **Today's Dispatch**
   - schedule suggestion and manual edits

8. **WhatsApp**
   - copy final schedule

9. **Activity**
   - audit trail

10. **Users**
   - admin-only access control

## 7. Data Model Direction

Current model already has a workable foundation:

- `teams`
- `technicians`
- `team_memberships` with `date` nullable
- `team_daily_overrides`
- `technician_availabilities`

Recommended interpretation:

- `team_memberships.date IS NULL` = default crew membership.
- `team_memberships.date = selected_date` plus `team_daily_overrides` marker = daily crew override.
- `technician_availabilities` = daily availability/call-out status.

Likely additions/changes:

- endpoints/UI for editing default team memberships
- endpoint/UI for renaming/updating teams
- optional `active`/archived flag for teams
- optional `crew_type` or `specialty` field
- optional `preferred_region`/route field beyond current `region_preference`
- configurable `service_lines` / `contract_lines` table managed by admins
- service-line selection on work orders
- PA Project fields on work orders: `pa_project`, `pa_project_notes`, and future follow-up/ETA fields
- corrective maintenance and estimate-required fields on work orders
- optional service-line preference on crews/technicians later, after the base service-line model is in use
- SLA/KPI due fields, likely assessment due and repair due timestamps derived from priority and lifecycle state
- stronger seed/import distinction between default crews and historical daily assignments

## 8. Seed/Data Import Guidance

The seed importer should not pretend historical `TECH ASSIGNED` combinations are all permanent crews.

Better seed strategy:

1. Import technician/trade roster from the Team tab.
2. Import work orders from schedule/export sheets.
3. Store `TECH ASSIGNED` as the work order's historical/planned assignment where possible.
4. Create a small curated set of default crews for demo purposes, preferably from explicit team/route examples or manually reviewed common combinations.
5. Keep generated demo data complete: if a team references a technician, that technician must exist.

## 9. Product Rules To Preserve

- No AI-created work order enters dispatch without review.
- Every active crew should have a driver warning if no available driver exists.
- Daily crew edits should not mutate default crews unless the user explicitly chooses default crew editing.
- Schedule generation uses today's crews, not merely default crews.
- Finalized/sent schedules are locked unless explicitly reopened.
- WhatsApp export is a core feature, not an afterthought.
- Audit events should track operational changes.
- Work order status and dispatch outcome are related but distinct.
- Service lines / contract lines should be configurable by admins, not hard-coded into scheduling logic.
- PA Project is a status-independent tracking flag, not just another work order status.

## 10. Immediate Implementation Implications

Before treating crew management as done, implement or revise toward:

1. Clear Default Crew vs Today's Crew UI.
2. Default crew editing endpoint and UI.
3. Daily crew override endpoint and UI remains separate.
4. New crew creation should create a default crew, not just a daily workaround.
5. Seed data should avoid misleading incomplete default crews.
6. Dashboard next action should distinguish:
   - fix default crew setup
   - resolve today's call-outs/driver coverage
   - ready to suggest schedule

## 11. Success Criteria

A walkthrough should make sense without explanation:

1. Admin can set up normal technicians and crews.
2. Dispatcher can pick a date.
3. Dispatcher can mark today's call-outs and adjust crew composition.
4. App clearly shows whether the issue is default setup or today's override.
5. App suggests a schedule using today's reality.
6. Dispatcher can override the schedule.
7. Dispatcher can finalize, copy WhatsApp, and mark sent.
8. Activity log shows what changed.

If John sees the app and says, "Yes, someone else could use this to help do my morning scheduling," the product is on track.

## 12. May 26 Review Takeaways

John's May 26 walkthrough validated the core POC. He liked the dashboard, understood the dispatch flow, and said the suggested daily work list would already be valuable even before the crew logic becomes perfect.

Important new requirements from that review:

1. PMs need monthly tracking and completion visibility.
2. Scheduler should eventually suggest PMs opportunistically when crews are already at a location.
3. Priority/SLA timing must influence scheduling, especially P4 work that does not need same-day dispatch.
4. PA Projects need first-class tracking with a checkbox and dedicated follow-up view.
5. Corrective maintenance and estimate tracking are needed for Mobil/CBRE reporting and pricing conversations.
6. Service lines / contract lines need to be configurable by admins instead of hard-coded.
7. Work order status needs to be visible and editable on the dispatch page for mid-day changes.
8. Dispatch outcomes should stay focused on the result of a specific crew visit.
