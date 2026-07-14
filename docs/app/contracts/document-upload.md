# App Document Upload Contract

Status: source-of-truth contract for the new `/app` document upload backend.

Implementation status:

- CURRENT: file/version schema, app customer auth helper, `api-app-document-upload-url`, and `api-app-document-upload-confirm` are committed and locally proven.
- LOCAL PROOF: proof was completed in disposable local Supabase only.
- CURRENT / LOCAL PROOF: backend identity binding/bootstrap through `api-app-auth-bootstrap`.
- CURRENT / LOCAL PROOF: shared frontend upload transport.
- OPEN: document-slot UI wiring, production storage bucket/policies, remote deploy, and upload browser QA.

## 1. Current Truth

- `api-app-signup-submit` write v3 creates the dossier shell, locations, chargers, `app_dossier_document_slots`, legal acceptances, scoped idempotency, and app audit events.
- The `/app` signup UI currently has local PDF invoice preview only. It does not upload files, create storage objects, confirm hashes, or mutate document slot state.
- `app_dossier_document_slots` is the expected-evidence/current-version projection.
- `app_dossier_document_files` is the server-issued physical upload target and file lifecycle table.
- `app_dossier_document_versions` is immutable confirmed version history.
- `api-app-document-upload-url` is CURRENT and locally gateway-proven.
- `api-app-document-upload-confirm` is CURRENT and locally gateway-proven.
- Immediate server hash confirmation remains CURRENT.
- Replacement/version history is implemented through immutable versions and slot current pointers.
- `app_customer_auth.ts` is CURRENT for Supabase Auth JWT validation, active identity/customer resolution, and dossier ownership authorization.
- Backend identity binding/bootstrap is CURRENT / LOCAL PROOF through `api-app-auth-bootstrap`.
- Customer-facing Auth UI/session/bootstrap call wiring is CURRENT / LOCAL PROOF.
- Shared frontend upload transport is CURRENT / LOCAL PROOF.
- Frontend document-slot UI wiring remains OPEN.
- Production bucket/policy/deploy proof remains OPEN.
- New upload behavior must use new `api-app-*` endpoints and `app_*` tables.
- Legacy upload endpoints are frozen/reference only:
  - `api-dossier-upload-url`
  - `api-dossier-upload-confirm`
- Legacy upload endpoints must not be extended with new `/app` behavior and must not be wired into the Vite app.
- P0: any previously exposed token/key-like value must be treated as leaked and rotated before production/deploy use. Do not paste or preserve secrets in docs, reports, logs, or source.

## 2. Backend Flow

The app upload backend is split into explicit steps:

1. Browser preflight
2. `api-app-document-upload-url`
3. Direct browser upload to storage
4. `api-app-document-upload-confirm`
5. Atomic backend file confirmation, immutable version creation, slot current pointer update, and audit event
6. Later review/analysis, separate from upload confirmation

Browser preflight may optimize cost and latency by checking file type, size, PDF parse preview, compression, and client hash. It is not trusted as truth. Backend validation and server-side hash confirmation remain required.

## 3. Browser Preflight

Frontend may do:

- File type and size checks.
- Local PDF invoice preview for text-based PDFs.
- Client SHA-256 calculation.
- Image precheck/compression later, if needed.
- Safe parser summary extraction, such as MID found, serial found, address fields found, parser version, and limitation codes.

Frontend must not do:

- No browser OCR as source-of-truth.
- no browser OCR in the customer-facing upload path.
- No raw PDF text or OCR text logging.
- No upload status truth claims.
- No final document acceptance/rejection decisions.
- No direct mutation of `app_dossier_document_slots`.

## 4. Frontend Shared Upload Transport

Status: CURRENT / LOCAL PROOF.

Location:

```text
app/src/features/documents/
```

The shared transport implements the current upload sequence:

1. validate local file metadata
2. compute one client SHA-256 for the logical run
3. call `api-app-document-upload-url`
4. upload through the official Supabase `uploadToSignedUrl` method
5. call `api-app-document-upload-confirm`
6. return a safe stage-specific result or error

Rules:

- The same transport is used for particulier, zakelijk, and VVE.
- The same transport is used across document types; account type and document type determine slot requiredness, not byte transport mechanics.
- The caller supplies dossier ID, document slot ID, current access token, selected file, and two explicit idempotency keys.
- One idempotency key is for upload-url issuance.
- One idempotency key is for upload confirmation.
- The client computes the hash once and reuses it for issue and confirm.
- Storage bucket, path, and upload token come only from the server response.
- The client does not handcraft a Storage URL.
- The client does not automatically retry.
- The client does not poll.
- The client does not persist upload state, tokens, hashes, or storage targets.
- The client does not access app tables directly.
- The client is not imported by a route, page, or UI component yet.
- Raw signed targets, upload tokens, storage paths, hashes, and backend details are not returned in the final safe result.

Retry boundary:

- Future UI may retry the same logical attempt using the same two idempotency keys.
- An issue-stage failure means no storage upload and no confirm call occurred.
- An upload-stage failure means no confirm call occurred.
- A confirm-stage failure may mean an object exists in storage; it must not automatically issue and upload a second file.
- The shared client itself performs no retry loop.

## 5. Endpoint: `api-app-document-upload-url`

Status: CURRENT, committed and locally gateway-proven.

Purpose: issue a short-lived, slot-scoped upload target for one document slot.

Method:

- `OPTIONS`
- `POST`

Required controls:

- CORS according to the app Edge Function foundation.
- Supabase Auth app customer authentication through `app_customer_auth.ts`.
- `Idempotency-Key` required.
- Request metadata captured without storing raw IP by default.
- Backend authorization against customer, dossier, slot, and allowed action.

Current request shape:

```json
{
  "dossier_id": "uuid",
  "document_slot_id": "uuid",
  "file_name": "factuur.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 123456,
  "client_sha256": "optional-64-hex"
}
```

Current success response shape:

```json
{
  "ok": true,
  "mode": "upload_url_v1",
  "request_id": "uuid",
  "document_slot_id": "uuid",
  "document_file_id": "uuid",
  "storage_bucket": "app-documents",
  "storage_path": "server-generated-private-path",
  "signed_upload_url": "short-lived-url",
  "upload_token": "short-lived-token",
  "expires_at": "iso timestamp",
  "max_size_bytes": 5242880
}
```

Backend validation:

- Slot exists in `app_dossier_document_slots`.
- Slot belongs to the authenticated/scoped dossier.
- Slot status allows upload or replacement.
- MIME type and extension are allowed for the slot type.
- Size is within configured limit.
- Client parser summary is treated as untrusted metadata only.
- Storage path is generated by the server, not by the browser.

Writes:

- Create exactly one `app_dossier_document_files` row with status `issued`.
- Store server-issued storage bucket/path and declared file metadata.
- Write scoped app idempotency and fail-closed app audit.
- Do not mark the slot `accepted` from upload-url issuance.
- Do not create a document version from upload-url issuance.

## 6. Endpoint: `api-app-document-upload-confirm`

Status: CURRENT, committed and locally gateway-proven.

Purpose: confirm that the object uploaded to storage matches the expected file and update the app document slot.

Method:

- `OPTIONS`
- `POST`

Required controls:

- CORS according to the app Edge Function foundation.
- Supabase Auth app customer authentication through `app_customer_auth.ts`.
- `Idempotency-Key` required.
- Backend authorization against customer, dossier, slot, and upload intent.
- Server-side object lookup and hash verification.

Current request shape:

```json
{
  "dossier_id": "uuid",
  "document_slot_id": "uuid",
  "document_file_id": "uuid",
  "file_sha256": "64-hex-client-hash"
}
```

Current success response shape:

```json
{
  "ok": true,
  "mode": "upload_confirm_v1",
  "request_id": "uuid",
  "document_slot_id": "uuid",
  "document_file_id": "uuid",
  "document_version_id": "uuid",
  "version_number": 1,
  "file_status": "confirmed",
  "version_status": "current",
  "server_sha256": "server-confirmed-64-hex"
}
```

Backend validation:

- Confirm request matches the upload target previously issued.
- Object exists at the server-issued path.
- Object size and content type are acceptable.
- Server computes SHA-256 over stored bytes.
- Server hash must match the client-submitted `file_sha256`.
- Parser summary is stored only as untrusted support metadata if accepted by contract.
- Raw extracted PDF/OCR text must not be stored in customer-visible data or logs.

Writes:

- Update `app_dossier_document_files` to confirmed with server hash, stored size, detected MIME, and confirmation metadata.
- Create one immutable `app_dossier_document_versions` row.
- Supersede the previous current version, if present.
- Update `app_dossier_document_slots.current_version_id` and `current_version_number`.
- Write scoped app idempotency and fail-closed app audit.
- Do not mark the slot `accepted`; acceptance belongs to later review.

## 7. Storage Path Contract

Recommended path shape:

```text
app/dossiers/{dossier_id}/slots/{document_slot_id}/versions/{version_id}/{safe_file_name}
```

Rules:

- Server generates the final path.
- Browser never chooses the final object path.
- Path must avoid customer names, addresses, email addresses, MID numbers, and other PII.
- `safe_file_name` is optional and must be sanitized if included.
- Versioning must support replacement history before a document is accepted.

## 8. `app_dossier_document_slots`

Current app document tables support the upload backend:

- `app_dossier_document_slots`: expected evidence, status, current version pointer, and customer-facing slot projection.
- `app_dossier_document_files`: physical server-issued upload target and file lifecycle.
- `app_dossier_document_versions`: immutable confirmed version history.

Implemented safeguards:

- Parent deletion is restricted while file/version evidence exists.
- `service_role` has no DELETE permission on evidence files/versions.
- Current version promotion happens atomically through upload confirmation RPCs.
- Reject/compensation behavior is atomic through `app_reject_document_upload_v1`.

## 9. Idempotency

Both endpoints require idempotency.

Rules:

- Scope keys by actor/customer, dossier, document slot, endpoint, and action.
- Same key plus same payload returns the same stored response.
- Same key plus different payload returns `idempotency_conflict`.
- Upload-url replay should return the same upload target while it is valid, or a safe expired-target response if no longer valid.
- Confirm replay should return the same confirmed slot response when file hash and upload reference match.

## 10. Hash Strategy

Recommended MVP:

- Browser calculates client SHA-256 where feasible.
- Confirm endpoint downloads the stored object and computes server SHA-256 immediately.
- Slot status becomes `uploaded` only after server hash matches.

Reason:

- Immediate server hash verification is more expensive than trusting client metadata, but it is simpler and stronger for audit/evidence. Initial file caps are small enough to prefer correctness.

Future optimization:

- Deferred worker hash verification may reduce latency/cost, but then slot status must remain `processing` until server verification completes.
- Client hash can reduce retries and improve UX, but backend remains source-of-truth.

## 11. Cost And Latency Rules

Frontend may reduce cost and latency by:

- Blocking unsupported files before requesting an upload URL.
- Enforcing slot-specific file types.
- Showing local PDF preview before upload.
- Compressing images later if image upload is added.
- Computing client hash once and reusing it for confirm.

Backend must still:

- Validate type and size.
- Authorize dossier/slot access.
- Generate storage path.
- Verify stored object hash.
- Audit success and failure.

OCR and heavy analysis should not run in the browser as the primary truth path. Image OCR belongs in a later worker/internal analysis lane after upload confirmation.

## 12. Slot Status Model

Recommended upload status flow:

```text
expected
  -> processing       upload URL issued or upload confirmation started
  -> uploaded         object exists and server hash matches
  -> needs_review     human/internal review needs more information
  -> accepted         reviewed and accepted for dossier use
  -> rejected         invalid or replaced evidence
  -> not_required     slot no longer required
```

Customer-facing labels must be curated. Raw internal upload/audit states should not be exposed directly.

## 13. Audit Events

Audit events should capture:

- upload URL requested
- upload URL issued
- upload URL rejected
- upload confirm requested
- server hash computed
- hash mismatch
- upload confirmed
- slot status changed
- document replaced
- document rejected/accepted later

Audit metadata should include:

- request metadata
- actor/customer/session or capability scope
- dossier id
- slot id
- storage bucket/path reference or path hash
- file size and MIME type
- client and server SHA-256 where relevant
- parser summary reference if included
- legal/app version context if needed

Audit metadata must not include raw PDF text, raw OCR text, secrets, tokens, or unneeded PII.

## 14. Failure Cases

Expected safe errors:

- missing or invalid auth/capability
- missing `Idempotency-Key`
- idempotency conflict
- dossier or slot not found
- slot does not belong to customer
- slot status does not allow upload
- file type unsupported
- file too large
- upload target expired
- object not found in storage
- hash mismatch
- storage unavailable
- malformed JSON

Customer-facing messages should be short and safe. Internal audit events can store more diagnostic detail without exposing raw evidence content.

## 15. Auth And Access Assumptions

Current backend auth:

- Upload endpoints require Supabase Auth customer JWT validation.
- `app_customer_auth.ts` resolves auth user to active `app_customer_identities` and active `app_customers`.
- Dossier access is authorized server-side by customer ownership.

Current:

- Customer-facing account creation, login, bootstrap, and identity binding are locally proven.

Open:

- Uploads after signup should eventually happen from authenticated dashboard sessions.
- If pre-dashboard uploads are needed, use a short-lived slot-scoped upload capability token, not legacy dossier sessions.

Rules:

- Do not reuse legacy `dossier_sessions` as app account auth.
- Do not write app audit/idempotency to legacy `dossier_audit_events` or `idempotency_keys`.
- New customer-facing upload behavior must use `api-app-*` and app tables.

## 16. Relationship To Legacy Upload Endpoints

Legacy endpoint concepts worth reusing:

- Require `Idempotency-Key`.
- Create signed upload URL server-side.
- Generate storage path server-side.
- Confirm by downloading object from storage.
- Compute server-side SHA-256.
- Reject hash mismatch.
- Audit failures and success.

Legacy endpoint assumptions not to reuse directly:

- old dossier token/session model
- `dossier_documents`
- legacy document type buckets
- legacy `dossier_audit_events`
- legacy `idempotency_keys`
- one-time static wizard assumptions

Legacy upload endpoints are frozen/reference only.

## 17. Non-Goals

This contract does not implement:

- frontend upload UI
- storage bucket creation
- image OCR
- document review workflow
- dashboard document replacement UI
- customer timeline projection
- production deployment

## 18. Recommended Implementation Sequence

Completed / CURRENT:

1. File/version schema implemented.
2. App customer auth helper implemented.
3. `api-app-document-upload-url` implemented and locally proven.
4. `api-app-document-upload-confirm` implemented and locally proven.
5. Replacement/version history implemented and locally proven.
6. Shared frontend upload transport implemented and locally proven.

Next OPEN work:

1. Production storage bucket/policy/config proof.
2. Remote migration/function deploy proof.
3. Wire one authenticated PDF installation-invoice document slot to the shared upload client.
4. Browser QA with PDF invoice upload and hash confirm.
5. Wire dashboard frontend to the current document-slot projection where useful.
6. Add worker/internal analysis lane after upload confirmation.
