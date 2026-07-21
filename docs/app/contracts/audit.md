# App Audit Contract

Status: CURRENT audit doctrine for the new `/app` backend.

## Doctrine

Frontend may assist; backend decides.

Audit-relevant and fraud-relevant steps must be server-checkable and audit-logged when the function runtime is reached.

Customer timeline is a curated projection. Raw audit rows are internal and must not be shown directly to customers.

## Consolidated Legacy Principles

The following principles are retained from legacy material only as app doctrine. Old endpoint names, table names, session models, event names, and dossier states are not retained as current truth.

- Audit-first: every fraud-relevant or audit-relevant write must be reconstructable from server-side evidence.
- Historical truth must not be overwritten. Corrections and replacements add history, versions, or explicit transitions.
- Confirmed upload is not automatically accepted evidence.
- Derived analysis, parser output, OCR output, and customer-facing projections must not mutate core truth unless a future app contract explicitly defines a reviewed write path.
- Writes that can be retried must use scoped idempotency where current code proves it or where a new target contract requires it.
- Request and actor traceability are required for meaningful app writes.
- RLS and minimum privileges remain mandatory boundaries; service-role writes stay server-side.
- Retention and expiry rules must be policy decisions. Do not import arbitrary legacy TTLs as app truth.
- No hidden dependencies: a claim that depends on a function, RPC, storage policy, role, secret, bucket, or migration must identify that dependency or remain UNKNOWN.

## Current App Audit Tables

- `app_intake_audit_events`: pre-customer or intake-level events.
- `app_audit_events`: customer/dossier/document scoped app events.
- `app_idempotency_keys`: scoped idempotency locks and stored responses.
- `app_dossier_document_files`: server-issued file/upload-intent lifecycle.
- `app_dossier_document_versions`: immutable confirmed evidence history.

## Current Proven Event Families

Current locally proven app flows include:

- signup submit accepted/rejected audit events
- document upload URL issued/rejected events
- document upload confirm accepted/rejected events
- app idempotency replay and conflict behavior
- document file/version replacement behavior
- customer current-document withdrawal audit
- immutable file/version evidence retention after withdrawal

Exact runtime event names live in the current endpoint and RPC code. This document defines doctrine and table ownership, not a substitute for code inspection.

## Required Fields And Metadata

Audit events should preserve enough metadata to reconstruct:

- who acted
- when
- authenticated/session context
- request ID
- idempotency key when relevant
- submitted payload hash where relevant
- server-side validation decision
- evidence/hash/version used
- accepted/rejected state

Do not store raw IP or raw user agent by default. Store hashed request metadata where supported.

## Future / Draft Event Families

Future app work must define app-specific events for:

- auth bootstrap/login/recovery
- intake finalization / `Start dossier`
- legal acceptance during public intake
- verification-link consumption
- pre-auth intake promotion
- immutable initial intake/submission snapshot creation
- quarantine evidence promotion
- targeted section unlock
- targeted correction submission / `Correcties indienen`
- promotion reject/failure
- customer dashboard reads if audit-required
- customer request/response
- support messages
- kWh submission/readout
- inboeking lifecycle
- result/value realization
- fee calculation
- retention/minimization

Do not copy legacy `dossier_*` event names as CURRENT app truth without adaptation.

## Target Intake Promotion Audit Boundary

Status: TARGET / NOT IMPLEMENTED. Detailed contract: `docs/app/contracts/intake-verification-promotion.md`.

Audit-required target events include:

- `Start dossier` / intake finalization;
- accepted legal versions;
- verification-link consumption;
- atomic promotion;
- customer/dossier creation from promotion;
- initial immutable intake/submission snapshot;
- document/evidence promotion from quarantine;
- targeted unlock;
- replacement evidence;
- `Correcties indienen`;
- ENVAL lifecycle changes.

Not every browser-side action is an immutable compliance revision. These are not immutable audit revisions by default:

- local client validation attempts;
- unsubmitted public form edits;
- ordinary field edits before the customer clicks `Correcties indienen`.

The target flow must preserve enough server-side evidence to reconstruct promotion and correction decisions without exposing raw audit rows, storage paths, raw parser text, raw hashes, or internal payloads to customers.

## Document Withdrawal Boundary

Customer withdrawal of a current document is a product lifecycle action, not proof cleanup.

Current locally proven behavior:

- withdrawal is audited;
- immutable file/version rows remain;
- storage is not hard-deleted immediately;
- the current slot pointer may be cleared atomically;
- the customer-facing slot returns to expected/missing state;
- locked/finalized dossiers reject withdrawal safely.

Proof cleanup of disposable local fixtures is separate and must not be described as normal product deletion.
