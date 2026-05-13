# Frontend Design Audit

Last updated: 2026-05-13

This audit applies the starter-app frontend design guide to the dispatch scheduler UI.

## Design Direction

Chosen direction: Guam operations command board.

The app should feel calm, field-ready, and managerial rather than like a generic SaaS dashboard. The user is JMI dispatch leadership, so the page needs to make morning decisions easier: what is urgent, who is available, which teams have drivers, what PM work competes with reactive work, and what message is ready to send.

## Audit Findings

Before this pass:

- Typography used a default sans-serif stack, which made the app feel scaffolded.
- Most panels shared similar white-card styling, so work orders, teams, dispatch, PMs, and WhatsApp output did not have enough hierarchy.
- The page was functional but visually flat; the primary action did not feel like the morning workflow anchor.
- Inputs and buttons were usable, but they lacked a coherent interaction language.
- The interface communicated "POC" more than "operations tool."
- The first design pass put too much workflow on one page, which made the app feel busy for less technical users.

## Improvements Applied

- Added a distinct type system with `Sora` for display text and `Source Sans 3` for body text.
- Replaced the flat background with a warm paper-and-grid operations surface.
- Introduced a navy, reef-cyan, and amber palette tied to dispatch context instead of generic blue/purple defaults.
- Renamed the product-facing UI to `Dispatch Scheduler` and removed one-person/POC labels from the application shell.
- Added section navigation so dashboard, dispatch planning, work orders, crews, PMs, and WhatsApp export are easier to understand one at a time.
- Added a stronger hero section that states the purpose of the app and anchors the primary schedule action.
- Added shared panel headers for consistent hierarchy across work orders, teams, dispatch, PMs, and WhatsApp.
- Restyled dispatch cards, schedule summary, editable fields, and team availability chips for clearer scanability.
- Changed crew availability updates so a single technician save does not trigger the full-page loading state.
- Preserved the existing API contract and product behavior; this is a design and usability pass, not a workflow rewrite.

## Remaining UX Work

- Add a real search/filter layer for work orders once the intake phase starts.
- Add empty states for filtered data after search is implemented.
- Add richer schedule-finalization states after the schedule operations phase.
- Add upload/intake screens once private S3 storage and OCR review are implemented.
