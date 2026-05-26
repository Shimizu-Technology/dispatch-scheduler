# John Ilao Dispatch App Review - May 26, 2026

Source transcript:

- `Brain-Dump/work/shimizu-tech/JMI-John-Ilao/2) Meeting with John about the Dispatch App.md`
- Prior discovery baseline: `Brain-Dump/work/shimizu-tech/JMI-John-Ilao/1) Meeting with John - May 7, 2026.md`

## Overall Outcome

The review went well. John understood the app, liked the direction, and validated the focused dispatch-first approach.

The strongest product validation was that the dispatch suggestion itself is already valuable:

> If the app can show the work orders that should be scheduled for the day, that is already golden. The crews are icing on the cake.

This confirms the core product thesis: JMI does not need a heavy technician CMMS first. John needs a practical daily dispatch command center that lets him or another admin enter work, generate a competent daily plan, adjust it, and send it through WhatsApp.

## What John Validated

### 1. Dispatch suggestion is the core value

John's main pain is still that the scheduling logic lives in his head. If he can enter accurate work-order and PM data, then click a dispatch button and get the day's likely work, the app materially reduces his morning workload and makes handoff possible.

Keep optimizing for:

- correct dispatch-eligible work
- priority/SLA awareness
- region/location grouping
- crew skill and driver fit
- manual override
- WhatsApp-ready output

### 2. Work-order lifecycle is central

John needs the app to prevent open work from getting lost. A work order may move through assessment, repair, waiting parts, waiting approval/estimate, carry-over, PA project tracking, and completion.

Important distinction:

- **Work order status** = the current lifecycle state of the job.
- **Dispatch outcome** = what happened during a specific crew visit.

They are related but not identical. Mid-day status changes should not be forced through end-of-day outcome controls.

### 3. PM tracking is operational, not passive

John wants PMs entered for the month/year and tracked through completion. Current paper workflow groups PM sheets and highlights completed stations. The app should eventually answer:

- Which PMs are due this month?
- Which PMs have not been completed yet?
- If a crew is already at a station for a work order, can they also complete nearby/same-location PMs?

PM suggestions should become opportunistic: “while you are there, also do these PMs.”

### 4. SLA/KPI timing needs to drive scheduling

John clarified the contract response/repair expectations:

| Priority | Assessment expectation | Repair expectation |
| --- | --- | --- |
| P1 | within 2 hours | within next 2 hours |
| P2 | within 2 hours | within next 2 hours |
| P3 | within 24 hours | within 48 hours |
| P4 | within 4 days | within next 4 days |

The scheduler should not blindly schedule all new work today. For example, a P4 entered today may be scheduled later as long as it stays within SLA/KPI timing.

Future scheduling should understand:

- assessment due time/date
- repair due time/date
- overdue status
- whether work has already been assessed
- whether it is now a repair/follow-up job

### 5. Waiting parts must not become a black hole

John repeatedly emphasized not losing waiting-for-parts work. Waiting parts should be held out of normal dispatch suggestions, but it should remain visible as follow-up work.

The dashboard and work queue should make it easy to ask:

- Which parts are still pending?
- Did someone order the part?
- What needs follow-up today?

### 6. PA Projects are a first-class tracking need

CBRE/Mobil allows JMI to place some work orders under a **PA Project** so they do not count against KPI while waiting for parts/materials/long-lead work.

John wants this modeled simply:

- checkbox on a work order: `PA Project`
- dedicated PA Projects tab or filtered workspace
- status-independent: a work order can be in a PA Project regardless of normal status
- notes/follow-up context for parts, ETA, and updates

This replaces a physical “PA project” folder John currently checks manually.

### 7. Corrective maintenance and estimates matter for business reporting

John wants to track how many work orders fall under corrective maintenance vs how many require estimates. This supports pricing renegotiation and monthly client conversations.

Requested fields:

- `Corrective Maintenance` checkbox
- `Estimate` checkbox or estimate tracking field

Example reporting question:

> How many work orders this month were corrective maintenance, and how many needed estimates?

### 8. Divisions / contract lines need to be configurable

JMI has multiple operational lines, including Mobil/CBRE, HKR, public schools/Sodexo, and likely more over time. Crews are mostly general, but some technicians/crews should preferentially stay within certain service lines.

Do **not** hard-code these divisions. They should be configurable by an admin.

Recommended model:

- Add a configurable `Service Line` or `Contract Line` admin-managed list.
- Seed default options from known context, such as:
  - Mobil / CBRE
  - Hotels / Kitchens / Restaurants
  - Public Schools / Sodexo
  - General
- Allow admins to rename, add, deactivate/archive, and reorder options.
- Work orders can select one service line.
- Crews/technicians can optionally have preferred service lines.
- Scheduler should prefer matching service line when possible but allow manual override.

This avoids locking JMI into our assumptions and keeps the app adaptable as they add contracts or reorganize crews.

## What This Means For Product Direction

The app should continue to stay dispatch-first, but the next layer is operational continuity:

1. John or data-entry staff enters accurate work-order/PM data.
2. The app tracks status, PA project, parts/approval/estimate state, and SLA pressure.
3. The dispatch suggestion uses that state to decide what should be scheduled.
4. John/admin adjusts crew/time/order manually.
5. WhatsApp remains the primary crew communication path.
6. Outcome and status updates keep the queue clean for the next day.

## Recommended Next Work

### Immediate

1. Finish and merge the work-order status lifecycle PR.
2. Add PA Project tracking.
3. Add corrective maintenance / estimate flags.
4. Start SLA/KPI due-date modeling.

### Near-term

5. Add configurable Service Lines / Contract Lines.
6. Improve PM workflow for monthly completion and “while you are there” suggestions.
7. Add waiting-parts/PA follow-up dashboard cards.

### Later

8. Real data import for John's open work orders.
9. Real PM month setup for June.
10. More robust reporting for client/KPI/monthly meetings.
11. Optional technician-facing workflow only if JMI asks for it later.

## Product Guardrails

- Keep the app simple enough for John, George, or another admin to use.
- Do not require technicians to use a mobile app for the POC.
- Do not bury waiting-parts or PA-project work in hidden tabs without dashboard visibility.
- Do not hard-code JMI service lines; seed sensible defaults but let admins configure them.
- Keep manual override available everywhere the scheduler makes a recommendation.
