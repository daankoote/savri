# App Audit Contract

Status: CURRENT audit doctrine for the new `/app` backend.

## Doctrine

Frontend may assist; backend decides.

Audit-relevant and fraud-relevant steps must be server-checkable and audit-logged when the function runtime is reached.

Customer timeline is a curated projection. Raw audit rows are internal and must not be shown directly to customers.

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
- customer dashboard reads if audit-required
- customer request/response
- support messages
- kWh submission/readout
- inboeking lifecycle
- result/value realization
- fee calculation
- retention/minimization

Do not copy legacy `dossier_*` event names as CURRENT app truth without adaptation.

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
