# Work order experience

The work-order workspace supports repeated intake, finding existing requests,
and recording their next stage. The initial cleanup preserves the existing API
and operational rules while reducing the controls shown during common tasks.

The application opens on Work Orders. Requests are initially sorted by creation
time, newest first. Existing dashboard, PM, crew, dispatch, WhatsApp, report,
activity, service-line, and user routes remain available.

| Capability | Placement |
| --- | --- |
| New manual request | Primary New Work Order action |
| Paste or upload extraction | Existing intake actions with human review |
| Essential request information | Visible editor fields, including editable reported time |
| Scheduling, assessment, duration, crew size | Scheduling and assessment disclosure |
| PA Projects, CM, estimates, parts and follow-up | Parts, estimates and follow-up disclosure |
| Complete description and operational notes | Details and notes on each queue record |
| Search and status | Visible queue controls; Enter applies search |
| Other filters, sort, archive and restore | More filters and sorting, or record details |
| Repeated entry | Save and add another; retains client, source and service line |
| Saved request outside current filters | View saved work order; queue context remains intact |
| Viewer deep link | Read-only detail drawer |

Failed saves keep the editor inputs and show the error inside the drawer.
Pending saves disable editing and repeat submission. Closing a modified editor
requires a discard confirmation. Focus moves into the editor, remains within it,
and returns to the prior control or queue search when it closes.

Unchanged reported, assessed and parts-order timestamps retain the precision received from the API
through edits, even though the date controls display minutes. Creating a request
for an existing site preserves its canonical name and known region when intake
leaves the region Unknown. Explicit edits retain the existing update behavior.

The release changes no SLA windows, status meanings, PA exclusions, dispatch
constraints, or historical reporting definitions. Lifecycle/history and durable
source storage from the earlier hardening branch require separate integration.

Acceptance covers consecutive creation, duplicate and failed-save recovery,
advanced-field preservation, filtered pagination and back navigation, read-only
access, keyboard focus, and desktop/narrow browser layouts. Synthetic fixtures
exercise the real local Rails API with a signed local authentication-provider
fixture. This does not substitute for an external Clerk OAuth test or physical
mobile-device testing. Other workspaces receive route-loading checks because
they now load on demand; their unchanged full business journeys are outside the
affected-flow scope.
