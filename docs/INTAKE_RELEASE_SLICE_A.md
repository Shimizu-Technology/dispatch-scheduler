# Intake release, slice A

Prepared 30 October 2026 in `codex/jmi-intake-release`, based on
`origin/main` at `ea08a2c430a3e6cd3aa32295c15b99f1b5f3d03b`.
Source archive: `archive/jmi-work-order-experience-2026-10-12`, peeled commit
`6d0ab313613e84e4c144a2c8b3ff24c2536c7dc4`.
Local implementation only; no push, PR, merge, deployment, or production access.

## Product context and scope

George enters WhatsApp requests in small batches. Office staff need to find and
update those requests without losing the queue they were viewing. This slice
ports the October work-order experience onto production's code base.
Sources: the supplied release brief; `docs/JMI_WORKFLOW_MODEL.md`; the archive's
`docs/WORK_ORDER_EXPERIENCE.md`; section 2a of the 30 October design-audit plan;
and the matching `wox/FINDINGS.md` in Leon's audit output directory. The Brain
Dump's JMI-John-Ilao meeting context supports the intake/operations distinction.
Production identity is inherited from the brief, not checked through production.

The queue defaults to creation time descending, reads the URL query, and retains
filters, sorting and page after saves. Obsolete queue/detail reads cannot reopen
an old record or overwrite newer results. Legacy API defaults remain compatible.
Work Orders is the landing route for **all roles**, as in the archive; Dashboard
remains at `/dashboard`. Role-based landing is deferred.

The editor shows basic fields first, with scheduling/assessment and parts/estimate
disclosures. Save and add another retains client, source and service line. Failed
saves retain input; uncertain creates retry their original UUID and payload.
Stale edits return `409`, `code: stale_work_order`, errors and `latest_work_order`;
the editor requires explicit reload before retry. Dirty close/navigation and page
unload are guarded, with modal focus trapping/restoration. Unchanged timestamps
retain their precision. Intake review includes the archive's source/warning and
normalization safeguards used by this editor; extraction remains human-reviewed.

Only these additive migrations are included, with their original timestamps:

- `20261011104000_create_work_order_identity_locks`
- `20261011104500_create_work_order_create_receipts`
- `20261011105000_add_work_order_lock_version`

Dispatch day locks, visit duration snapshots/repair/trigger, dispatch carry-over
and export freshness, PM site locks/identity/pagination, unrelated workspace
recovery, and PR #69 are excluded. The later archive coupling to `PmSiteLock`
is omitted by using the earlier intake implementation. Distinct concurrent
operations creating a shared new client/site retain main's concurrency limits;
this slice does not claim shared canonical-site serialization. SLA windows,
status meanings and PA rules are unchanged. One existing dispatch test reloads
its model after finalization because revisions now advance on saved changes;
no dispatch runtime implementation changed.

## Acceptance record

Agent-executed automated checks on the final slice code, Ruby 3.3.7, Rails 8.1.4,
Node 22.22.3, Vite 8.3.4. Full browser/device QA is deferred to the later release
slices; the optional signed-local-Clerk browser smoke was **not run**. There were
no real sign-ins, provider fixtures, external extraction calls or production reads.
Backend implementation: `f39daeb`; frontend implementation: `5f0603d`, with the
security lockfile committed alongside this record. Build assets:
`index-CPzmIXgf.js` and `index-txxQ2fHN.css`.

- Importer: 4 tests passed; compile check passed.
- SQLite: 265 Rails tests / 1,371 assertions passed; no failures/errors/skips.
- RuboCop: 140 files, no offenses. Brakeman 8.1.0: zero warnings/errors,
  including CI's `bin/brakeman --no-pager` and its latest-version check.
- Bundler Audit: no vulnerabilities, including CI's binstub. Required security
  updates include Rails 8.1.4 and affected transitive gems, restricted to patch
  updates apart from the explicitly requested Brakeman update.
- Web: `npm ci`, 67 tests in 3 files, lint and build passed. CI now runs web tests
  and uses Node 22.22.3 to meet the test toolchain's Node requirement.
  Vitest 4.1.12 and Zod 4.6.7 resolve the archive lockfile's advisories;
  `npm audit` reports zero vulnerabilities. Lockfile repair used a temporary
  npm 11 invocation after npm 10's resolver crashed; normal npm 10.9.8 `npm ci`
  and the full web gate passed against that resulting lockfile.
- App tests execute route-to-request mapping, create/edit query retention,
  pagination and browser Back/Forward, obsolete reads, and dirty leave/unload.
  Component tests cover retained repeat-entry defaults, focus, disclosures,
  dirty close, failed saves, uncertain receipts, conflicts and viewer details.
- PostgreSQL 16.11 at `127.0.0.1:5432`: 58 focused request/concurrency tests /
  388 assertions passed, including numbered identity races, receipt retries,
  competing stale editors, filtered/distinct sorts and old-client calls.
- SQLite and PostgreSQL each completed two up/down cycles of all three migrations
  plus final reapply. An existing synthetic row survived every rollback and
  received non-null `lock_version` 0 on each apply.
- `WorkOrderLegacyClientTest` exercises main's list/create/update/archive/restore
  request shapes without either new concurrency field on both adapters.
- Impeccable 4.6.0 source advisory returned `[]`; this is not browser acceptance.
- Final diff reviewed for schema churn, excluded work, fixtures and customer files.
  The existing PostgreSQL extension declaration is retained in the schema.

Rehearsal helper: `api/script/verify_intake_migrations.rb`. It refuses databases
outside the explicit local disposable naming/path constraints. Run on an empty
database with `RAILS_ENV=test` and both `DATABASE_URL` and
`JMI_INTAKE_VERIFICATION_DATABASE` set explicitly. Example SQLite identity:
`storage/intake_release_migrations.sqlite3`. PostgreSQL identity used here:
`jmi_intake_release_slice_a_01a18b90`. No `.env` database URL or seeds were used.
Raw local checks remain in ignored `api/tmp/intake-*.log` files.

## Remaining release work

Slice B covers saved scroll position, dashboard drilldowns, manual extraction
fallback and compact phone controls. Slice C covers styling/motion/platform
details. Physical iPhone/software-keyboard testing, browser acceptance,
external OAuth, production migration rehearsal, PR review and deployment are
not accepted by these automated checks. No release is authorized by this slice.

## Cleanup

Lifecycle session: `01a18b90-30d2-78f2-be72-02bfc96155b4`.
The shared local PostgreSQL server was borrowed and left running. Its uniquely
named disposable database was tracked manually (the lifecycle helper has no
database resource kind) and dropped after verification. The owned migration
SQLite file and temporary dependency copy were removed. No API/web server,
browser tab, simulator or container was started. The release worktree and local
branch are retained for the next slices; no runtime resource handoff is needed.
