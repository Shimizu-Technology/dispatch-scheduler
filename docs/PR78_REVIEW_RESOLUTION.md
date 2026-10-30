# PR #78 first review resolution

Review work started on 2026-10-30 at `25eff8e633a22670669bd18dd20fcb5d2180c5aa`, matching origin in `dispatch-scheduler-intake-release`, branch `codex/jmi-intake-release`. PR #78 targets `main` and remains a held draft. Main has no branch protection; `.github/workflows/ci.yml` supplies the three CI jobs. Nothing here authorizes ready, merge, deployment, production data changes, or real Clerk/OCR-provider contact.

## Context and acceptance

JMI staff use this app for work-order intake, follow-up, PM tracking, and dispatch planning. The held release prioritizes George's batch intake and phone usage while preserving dispatch decisions, SLA windows, status meanings, PA treatment, and creation defaults. Sources: `docs/JMI_WORKFLOW_MODEL.md`, `docs/INTAKE_RELEASE_SLICE_A.md`, PR #78's hold/body, current controllers/models, and the canonical Brain-Dump `work/shimizu-tech/JMI-John-Ilao` meeting records. Historical workflow descriptions are context, not verified production behavior.

Scope: classify all 23 CodeRabbit top-level inline comments plus both review summaries, fix material and cheap valid findings with regressions, run the complete local gate, push, answer all threads, and request one incremental review. Agent executes affected-flow QA with synthetic fixtures only. Physical iPhone/Safari/software keyboard and real external delivery remain untested; release stays held.

## Review classification

Numbers follow the fetched top-level comment order. Each fixed item is in the commit containing this record; final SHA is reported in GitHub replies and the implementation return.

| # / comment ID | Finding | Classification / disposition |
| --- | --- | --- |
| 1 / 4421664927 | CI token permissions | Valid; explicit workflow `contents: read`. |
| 2 / 4421664933 | Duplicate lookup scan/index | Valid performance observation, nonblocking follow-up; deferred below. |
| 3 / 4421664938 | Oversized text message | Valid; stable `intake_text_too_long` code through API/UI, retained-source regression. |
| 4 / 4421664941 | Missing extracted title | Valid; inspect source title before fallback; confidence/issue regression. |
| 5 / 4421664952 | Global optimistic-lock blast radius | Valid/material; shared 409 handler and 14 real stale-write request variants. |
| 6 / 4421664964 | Unbounded thread join | Valid; 10-second joins with assertions. |
| 7 / 4421664983 | Wrong revision test parameter | Valid; `expected_lock_version` and stale negative assertion. |
| 8 / 4421664992 | Hidden test/filter boundaries | Valid; move before private, exclude future open order from both filters. |
| 9 / 4421664998 | Duplicated queue defaults | Valid; shared import. |
| 10 / 4421665003 | Save refresh names dashboard | Valid; queue-specific messages and create/update failure tests. |
| 11 / 4421665009 | Archive succeeds but refresh fails | Valid; mutation failure separated from refresh recovery; integration regression. |
| 12 / 4421665014 | Dashboard uses global error | Valid; independent dashboard error, recoverable retry, unrelated failure tests. |
| 13 / 4421665020 | Incomplete tile/date/retry tests | Valid; all 12 queue tiles, empty date, retained data, Retry. |
| 14 / 4421665026 | Unused dashboard props | Valid; remove props and call-site work. |
| 15 / 4421665032 | Date control unmounts | Valid; header/date stays mounted, focus regression, current date prop. |
| 16 / 4421665036 | Partial month/stale report | Valid; local month draft and RequestGuard, partial-input and old success/failure tests. |
| 17 / 4421665044 | Report loading announcement | Valid; status region. |
| 18 / 4421665051 | Old daily crew selection | Valid; close daily editor on date change, regression. |
| 19 / 4421665059 | Interrupted invite outcome | Valid; unconfirmed-result/refresh guidance, distinguish confirmed validation error, preserve fields. |
| 20 / 4421665066 | Masked 403 reason | Valid; preserve actionable server reason, simulated missing-claim/access-denial tests. |
| 21 / 4421665070 | Tablet touch target | Valid; remove 32px override, browser computed height 44px at 820px. |
| 22 / 4422125685 | Unnamed PM close controls | Valid; descriptive labels for all five icon close buttons. |
| 23 / 4422125699 | Crew edits use old date data | Valid/material; disable fieldset through loading/failure, explicit retry, date-owned readiness, regressions. |

Summary-only findings: stale initial-date success/failure responses are guarded before writes (including loading and WhatsApp results); deep-linked editor state survives repeated sidebar attempts while dirty or saving; filter cancel restores filters but retains pending search. All valid and fixed with regressions. No false positives were manufactured to close review threads. CodeRabbit's generic docstring coverage warning is advisory; broad documentation churn is outside this correctness pass.

The duplicate lookup's SQL fast path does lack an expression index. The fallback deliberately protects identities that SQL LOWER cannot match identically to Ruby, demonstrated by `Unicode number normalization does not depend on database case folding`. Restricting candidates with the same SQL normalization would lose that guarantee; an arbitrary cap would miss duplicates. A safe optimization needs a persisted canonical identity for legacy and new rows, with a reversible backfill and database-specific plan evidence. No new migration or unique constraint is added during this held correctness pass. The performance thread stays unresolved, with this reason recorded; all legacy duplicates remain editable.

## WorkOrder write audit

| Path | Existing WorkOrder writes and staleness behavior |
| --- | --- |
| WorkOrdersController update | Existing row/identity locks and explicit expected-revision check remain; shared rescue catches a late stale SQL UPDATE and serializes the latest row. |
| Archive / unarchive / status | Transaction rolls back mutation and audit on stale UPDATE; shared handler returns 409 `code`, `errors`, `latest_work_order`. |
| Dispatch schedule finalize | Transaction includes schedule state, technician snapshots, item previous state, WorkOrders, PM transitions and audit. A stale WorkOrder aborts all and returns the same 409. |
| Dispatch schedule mark_sent | Same rollback and 409; no reload/retry of an old transition. |
| Dispatch schedule reopen | Same rollback and 409, including previous-state bookkeeping. |
| Dispatch item outcomes | All seven outcomes (completed, carry_over, waiting_parts, waiting_approval, unable_to_access, cancelled, pending) covered; item/outcome/audit rollback and 409 preserve newer WorkOrder edits. |
| Dispatch item crew/order update | Writes DispatchItem/technician snapshots only; no WorkOrder mutation, including model callbacks. |
| DispatchSuggestionService / carry-over selection | Reads WorkOrders and creates DispatchItems; no existing WorkOrder save. No separate outcome/carry-over write service exists on this branch. |
| PM controllers/template generation | Write PmTask, templates, location/assignment data; no existing WorkOrder mutation. WorkOrder-linked dispatch outcome covered above. |
| OCR preview / approval | Preview normalizes proposals only. Approval calls the ordinary create path, inserting a new WorkOrder under identity/receipt locks. No existing WorkOrder update. |
| Creation/imports/seeds | Create inserts; importer produces JSON consumed by seeds, which delete demo rows and create new records. No stale existing-row save. |
| Rake tasks | `jmi:clear_demo_data` uses direct delete_all inside a transaction; no optimistic instance updates. |
| Model callbacks/status events/jobs | WorkOrder callbacks normalize SLA values before the same guarded save and clear in-memory metadata afterward. No status-event model or WorkOrder-writing job exists on this branch. Related associations have no touch/autosave WorkOrder writes. |

No internal existing-WorkOrder writer needs a reload/retry policy on this branch. User-facing transitions fail safely for review rather than blindly retrying changed domain decisions. The shared handler re-reads only to construct the conflict response after transaction rollback.

## Verification evidence

- SQLite full Rails gate: 281 tests, 1,559 assertions; zero failures/errors/skips. RuboCop: 141 files clean. Brakeman: zero warnings/errors. bundler-audit: no vulnerabilities.
- PostgreSQL 16.11: confirmed local server/user and empty uniquely named `dispatch_pr78_review_01a18c34` before schema load; never used `dispatch_scheduler_development`. Focused real locking/concurrency suite: 20 tests / 199 assertions passing, including all 14 stale-write variants and existing edit/intake concurrency tests.
- Importer: compile plus four tests pass using a disposable local venv with openpyxl. System Python lacked openpyxl; the isolated rerun passed.
- npm ci: 247 packages, zero vulnerabilities. Final web/lint/build results recorded in the implementation return after the last test additions.
- Advisory Impeccable 4.6.0 detect on all changed UI paths returned `[]`.

QA ledger (current fix diff on base 25eff8e; synthetic dispatcher and in-memory synthetic fixtures, no real Clerk/provider):

| Case | Required dimension and expected outcome | Result / evidence |
| --- | --- | --- |
| Q1 tablet target | Browser at 820×1180; details target >=44px and no horizontal overflow | Passed: `innerWidth=820`, summary bounding height=44, document overflow=false via T3 browser. |
| Q2 existing editor leave | Repeated sidebar attempts retain dirty deep-link inputs and pending save | Automated integration passed for dirty/saving cases; browser journey blocked after open/edit by preview host connection failure. |
| Q3 saved mutations / queue failure | Create/update/archive remain successful, queue gets recovery message, dashboard not mislabeled | Automated integration passed; remaining browser journey blocked by tooling. |
| Q4 dashboard date/recovery | Date remains mounted/focused, old requests ignored, independent error and retry | Automated component/integration passed; browser journey blocked by tooling. |
| Q5 crew date/recovery | Daily editor closes, old-date edits disabled while loading and after failure; retry works | Automated component/integration passed; browser journey blocked by tooling. |
| Q6 reports | Partial text retained without malformed requests; old success/failure ignored; loading announced | Automated component/integration passed; browser journey blocked by tooling. |
| Q7 phone filter cancel | Pending search retained while filters restore | Automated interaction passed; physical phone not run. |

T3 `preview_snapshot` twice returned `Preview automation snapshot timed out after 15000ms.` A fresh T3 tab allowed DOM measurement and editing, then click failed and the host reported no preview automation host available. Chrome fallback tab creation timed out; reconnect reported `Browser is not available: 1`. These failures do not establish browser acceptance for Q2–Q7. The parent can rerun browser acceptance after tooling recovers; physical iPhone/Safari, real external sign-in/delivery and release remain on hold.

Final local web gate: 118 tests across 10 files pass (including the 25-request intake case); lint and production build pass. The final test-only addition corrects the daily-crew button's actual accessible name (Save Today Only).

Lifecycle: both T3 QA tabs were closed and released. The first background Vite launcher had already exited; its record was released. The foreground Vite server PID 47136 was validated and terminated by lifecycle cleanup. The session reports no active owned resources. The Chrome fallback never returned a created-tab ID, then reported its browser unavailable; no successful native-tab creation was confirmed. Shared PostgreSQL, Redis, network/model services, simulators, and baseline resources were left unchanged. The disposable PostgreSQL database is dropped after the optional full PostgreSQL suite completes; its final result and drop receipt are in the implementation handoff.
