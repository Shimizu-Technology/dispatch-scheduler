# Frontend Design Audit

Last updated: 2026-05-13

This audit applies the starter-app frontend design guide to the dispatch scheduler UI.

## Design Direction

Chosen direction: Guam operations command board.

The app should feel calm, field-ready, and managerial rather than like a generic SaaS dashboard. The user is John/JMI dispatch leadership, so the page needs to make morning decisions easier: what is urgent, who is available, which teams have drivers, what PM work competes with reactive work, and what message is ready to send.

## Audit Findings

Before this pass:

- Typography used a default sans-serif stack, which made the app feel scaffolded.
- Most panels shared similar white-card styling, so work orders, teams, dispatch, PMs, and WhatsApp output did not have enough hierarchy.
- The page was functional but visually flat; the primary action did not feel like the morning workflow anchor.
- Inputs and buttons were usable, but they lacked a coherent interaction language.
- The interface communicated "POC" more than "operations tool."

## Improvements Applied

- Added a distinct type system with `Sora` for display text and `Source Sans 3` for body text.
- Replaced the flat background with a warm paper-and-grid operations surface.
- Introduced a navy, reef-cyan, and amber palette tied to dispatch context instead of generic blue/purple defaults.
- Added a stronger hero section that states the purpose of the board and anchors the primary schedule action.
- Added shared panel headers for consistent hierarchy across work orders, teams, dispatch, PMs, and WhatsApp.
- Restyled dispatch cards, schedule summary, editable fields, and team availability chips for clearer scanability.
- Preserved the existing API contract and product behavior; this is a design and usability pass, not a workflow rewrite.

## Remaining UX Work

- Add a real search/filter layer for work orders once the intake phase starts.
- Add empty states for filtered data after search is implemented.
- Add richer schedule-finalization states after the schedule operations phase.
- Add upload/intake screens once private S3 storage and OCR review are implemented.
