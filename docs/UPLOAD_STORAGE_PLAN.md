# Upload Storage Plan

Last updated: 2026-05-13

This app does not need S3 for the current dispatch board because users cannot upload production files yet. The importer reads John's local example files during development, and the live UI currently works from database records.

S3 becomes necessary in the next upload/OCR phase, when John or a dispatcher can upload PDFs, screenshots, images, or text files that should become reviewable intake drafts.

## Recommendation

Use a private S3 bucket with presigned browser uploads.

Why:

- Work orders and attachments may contain customer, location, requester, vendor, and operational details.
- Files should not be public or guessable.
- The browser can upload large files directly to S3 without routing file bytes through Rails.
- Rails can keep an audit trail of who uploaded the file, what draft it created, and when a reviewer approved it.

## Future Flow

1. User selects a PDF, image, or text file in the intake UI.
2. React asks Rails for a presigned upload target.
3. Rails verifies the user can create intake drafts and returns a short-lived presigned POST.
4. React uploads the file directly to S3.
5. React tells Rails the upload completed.
6. Rails creates an intake draft linked to the S3 object key.
7. The OCR/OpenRouter worker extracts suggested fields into the draft.
8. A human reviews, edits, approves, or rejects the draft.
9. Only approved drafts become dispatch-eligible work orders.

## Bucket Shape

Use one private bucket per environment.

Example names:

```text
dispatch-scheduler-uploads-staging
dispatch-scheduler-uploads-production
```

Suggested object prefixes:

```text
intake/raw/{environment}/{yyyy}/{mm}/{uuid}/{filename}
intake/derived/{environment}/{yyyy}/{mm}/{uuid}/extraction.json
```

## Future Environment Variables

Do not add these to local `.env` until upload intake is implemented.

```bash
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=dispatch-scheduler-uploads-staging
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_UPLOAD_PREFIX=intake/raw
AWS_S3_PRESIGN_EXPIRES_SECONDS=900
AWS_S3_MAX_UPLOAD_MB=25
```

`ap-southeast-2` is a reasonable first choice for Guam/Pacific users based on the starter-app S3 guide, but we should confirm latency and deployment region before production.

## CORS

When upload intake is added, configure bucket CORS for the exact frontend origins.

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "POST", "PUT", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://your-production-domain.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## IAM Policy Direction

Use least-privilege access scoped to the upload bucket and prefixes Rails owns.

Required actions for the future backend:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:ListBucket`

Avoid broad `AmazonS3FullAccess` in production.

## Product Rules

- Original uploaded files stay linked to the intake draft and eventual work order.
- OCR output is never trusted directly.
- Dispatch eligibility starts only after human approval.
- Uploaded files should be visible only to authenticated users who are allowed to manage intake.
- Every upload, extraction, approval, rejection, and work-order creation should be audit logged.
