# Upload Storage And Intake

Last updated: 2026-07-10

## Current implementation

Work-order intake now persists every successful extraction as a
`WorkOrderImport` with one or more reviewable `WorkOrderImportItem` records.
Uploaded images, PDFs, and text files are attached to the import with Rails
Active Storage. Pasted text is retained on the import, capped at 20,000
characters. Pending drafts survive browser refreshes and can be approved or
rejected; only approval creates a live work order.

Local development uses private disk storage under `api/storage`. Production is
configured for a private S3-compatible bucket. Active Storage object keys are
opaque, and the app does not generate public bucket URLs.

## Production environment

```bash
AWS_REGION=ap-northeast-1
AWS_S3_BUCKET=dispatch-scheduler-uploads-production
# Use an instance/task IAM role when the host supports one. Otherwise:
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Keep one private bucket per environment. Block all public access, enable
server-side encryption, enable object versioning if the selected backup policy
requires it, and scope the runtime identity to the one environment bucket.
Rails currently uploads through the API request; direct browser uploads can be
added later if real files regularly approach the 10 MB application limit.

Minimum runtime permissions:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:ListBucket`

Do not grant broad `AmazonS3FullAccess`.

## Intake and audit rules

1. Rails verifies the user has dispatcher/admin edit access.
2. The extractor verifies file content by signature and enforces a 10 MB limit.
3. Images are sent as image input; PDFs are sent through OpenRouter's file
   parser, defaulting to the `mistral-ocr` engine; text is capped at 20,000
   characters.
4. Successful extraction and its original source are saved atomically.
5. The source SHA-256, model, raw extraction response, uploader, and timestamps
   are retained.
6. AI fields remain a pending draft until a human edits and approves or rejects
   each extracted request.
7. Approval, rejection, and live work-order creation are audit logged.

## Decisions still required

- Approve OpenRouter for the customer data involved and confirm its current
  retention/training/data-processing terms before real uploads.
- Choose source-file and raw-response retention periods. The code deliberately
  does not auto-delete operational evidence before the owner decides that rule.
- Configure and test bucket backup/restore, lifecycle, encryption, and alerting
  in the actual hosting account.
- Decide which roles, beyond the current dispatcher/admin intake queue, may
  download original sources if a download UI is added.

See `docs/DATA_HANDLING.md` and `docs/PILOT_READINESS.md` for the release gates.
