# Data Handling And Repository Safety

Last updated: 2026-07-10

## Repository rules

This repository is currently public. Customer workbooks, screenshots, PDFs,
credentials, real technician rosters, site mappings, work-order identifiers,
and operational descriptions must never be committed.

`docs/examples-from-john/` is ignored except for its README. The importer reads
private artifacts and an optional private JSON config locally, then replaces
people, crews, sites, identifiers, descriptions, notes, and source references
before writing `data/seeds/sample_data.json`. Importer tests verify both the
committed aliases and that no private source artifact is tracked.

Removing a file in a normal commit does not remove it from existing Git history.
The previously committed source artifacts therefore require owner-coordinated
history remediation outside this PR:

1. Make the repository private immediately while remediation is planned.
2. Inventory forks, clones, Actions artifacts, releases, caches, and any copied
   credentials or links.
3. Rotate any credential or token that may have appeared in an artifact.
4. Coordinate a `git filter-repo` history rewrite for the private artifact paths,
   force-push all affected branches/tags, and have collaborators reclone.
5. Ask GitHub Support about cached-view removal if necessary, then verify the
   old object IDs and public URLs no longer expose the files.

History rewriting is intentionally not performed in an ordinary feature PR: it
rewrites shared commit IDs and requires explicit owner coordination.

## Runtime data

- Production records belong in PostgreSQL with automated backups and a tested
  restore procedure.
- Intake attachments belong in a private S3-compatible bucket; never use public
  ACLs or public object URLs.
- Clerk limits application access, while Rails persists the authoritative app
  role and soft-deactivates users so audit history remains intact.
- Logs must not include bearer tokens, source bodies, AI raw responses, or
  attachment bytes. Keep production log level at `info` unless diagnosing a
  controlled incident.
- Database and bucket access should use separate least-privilege production
  identities, encryption in transit, and provider-side encryption at rest.

## AI processing

Images, PDFs, and pasted text sent for extraction leave the application and are
processed by the configured OpenRouter route and model/provider. Human review
prevents AI output from becoming dispatchable work automatically, but it does
not eliminate the data-processing decision. Before real customer use, the owner
must approve the provider route, retention/training terms, data residency, and
contractual handling of the source material.

## Retention and access decisions

The application retains source evidence, extraction output, reviewer identity,
and the approved/rejected result. Automatic deletion is not enabled because the
operational/audit retention period has not been confirmed. John and the owner
must decide:

- how long original uploads, pasted text, and raw AI responses are retained;
- whether approved and rejected sources have different retention periods;
- who may view or download the original source;
- whether legal, customer-contract, or incident holds override deletion.
