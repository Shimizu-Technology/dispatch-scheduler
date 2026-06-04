# Frontend Design Audit

Last updated: 2026-05-13

This audit applies the starter-app frontend design guide to the dispatch scheduler UI.

## Design Direction

Chosen direction: professional Guam operations workspace.

The app should feel calm, field-ready, and managerial rather than like a generic SaaS dashboard. The user is JMI dispatch leadership, so the page needs to make morning decisions easier: what is urgent, who is available, which teams have drivers, what PM work competes with reactive work, and what message is ready to send.

The second design pass intentionally reduced the landing-page feel. Professional scheduling and operations products usually keep persistent navigation, summary metrics, and task-specific pages/sections visible without forcing every workflow onto one giant scroll.

External references reviewed during this pass:

- Datapad dashboard guidance: operational dashboards should emphasize status, alerts, resource utilization, drill-downs, and quick action buttons.
- Holistics dashboard guidance: put high-priority information first, then support deeper detail through drill-through/detail pages.
- Sisense dashboard guidance: keep dashboards focused, avoid excessive widgets, group related data, keep essential information visible, and use consistent visual systems.
- Scheduling dashboard case study by Riley Knowles: scheduling tools work better when information architecture mirrors the user's workflow and central actions are easy to find.

## Audit Findings

Before this pass:

- Typography used a default sans-serif stack, which made the app feel scaffolded.
- Most panels shared similar white-card styling, so work orders, teams, dispatch, PMs, and WhatsApp output did not have enough hierarchy.
- The page was functional but visually flat; the primary action did not feel like the morning workflow anchor.
- Inputs and buttons were usable, but they lacked a coherent interaction language.
- The interface communicated "POC" more than "operations tool."
- The first design pass put too much workflow on one page, which made the app feel busy for less technical users.
- The first design pass had a strong visual style but leaned too casual for a professional operations app.

## Improvements Applied

- Added a distinct type system with `Sora` for display text and `Source Sans 3` for body text.
- Replaced the flat background with a warm paper-and-grid operations surface.
- Introduced a navy, reef-cyan, and amber palette tied to dispatch context instead of generic blue/purple defaults.
- Renamed the product-facing UI to `Dispatch Scheduler` and removed one-person/POC labels from the application shell.
- Added hash-backed section navigation so dashboard, dispatch planning, work orders, crews, PMs, and WhatsApp export can be used one at a time with browser back/forward support.
- Reduced the hero area and removed demo/pilot chips so the screen feels more like a production app than a demo page.
- Added shared panel headers for consistent hierarchy across work orders, teams, dispatch, PMs, and WhatsApp.
- Restyled dispatch cards, schedule summary, editable fields, and team availability chips for clearer scanability.
- Changed crew availability updates so a single technician save does not trigger the full-page loading state.
- Preserved the existing API contract and product behavior; this is a design and usability pass, not a workflow rewrite.

## Current Operations UI Polish

The latest UI pass moves the app further from a demo-style dashboard toward a compact professional operations console:

- Replaced the oversized hero with a tighter JMI command header that keeps branding, current section context, schedule date, user role, and the primary dispatch action visible without consuming the whole viewport.
- Tightened the sticky navigation and renamed key areas around the operator workflow: Dispatch Draft, Work Queue, PM Month Setup.
- Reworked the dashboard into a denser command-center view: command decision, dispatch state, work pressure, crew readiness, PA/CM/estimate follow-up, PM completion, and recent activity.
- Converted work-order cards into compact operational rows for 45–100+ item queues while preserving badges, KPI pressure, PA Project, CM, estimate, blocked status, service line, and edit/archive actions.
- Adjusted SLA wording toward KPI pressure so PA Projects and waiting-parts work feel closer to John’s CBRE/Mobil language.
- Added a mobile pass across the shell, dashboard, work queue, PM setup, crews, dispatch, WhatsApp, service-line, PA Project, and activity panels: full-width touch actions, shortened mobile nav labels, reduced mobile padding, stacked dispatch-state metrics, and no horizontal page overflow at 390px.

## Remaining UX Work

- Confirm John’s real PM spreadsheet format and adapt the PM paste parser if needed.
- Add a safe one-time location cleanup/merge task for existing production records with trailing spaces or duplicate capitalization.
- Add richer parts-follow-up fields for PA Projects and waiting-parts work.
- Add monthly reporting/export for KPI, PM completion, CM, estimates, and PA Projects.
- Add upload/intake screens once private S3 storage and OCR review are implemented.
