# ENVAL App TODO

Status: CURRENT app-only TODO.

This queue is only for the new `/app`, `api-app-*`, and `app_*` implementation. Legacy root/static operational backlog lives under `docs/legacy/**` and does not drive new app implementation.

## Current / Locally Proven

- `/app` Vite rebuild foundation exists.
- Signup/intake frontend supports particulier, zakelijk, and VVE draft flows.
- Signup payload mapper supports particulier, zakelijk, and VVE.
- `api-app-signup-submit` write v3 is locally proven.
- App foundation schema is locally proven.
- Locations/chargers schema is locally proven.
- Document/legal slot schema is locally proven.
- App customer auth helper is locally proven.
- `api-app-auth-bootstrap` backend identity binding is locally proven.
- Document file/version schema is locally proven.
- `api-app-document-upload-url` is locally proven.
- `api-app-document-upload-confirm` is locally proven.
- Atomic confirm/reject RPCs are locally proven.
- PDF invoice parser adapter and local PDF preview exist for frontend-only preview.
- Modular frontend Auth/session layer is locally proven.
- `/account` supports account creation and login locally.
- Frontend session restoration and logout are locally proven.
- Frontend bootstrap API wiring to `api-app-auth-bootstrap` is locally proven.
- Dashboard route guard is locally proven.
- Auth/Supabase frontend code is lazy-loaded for `/account` and `/dashboard`.
- `api-app-dashboard-get` is locally proven.
- Dashboard read is account-neutral and supports multiple dossiers, locations, and chargers.
- Dashboard read returns customer-safe dossier, document-slot/current-document, and legal-acceptance projections.
- Successful dashboard reads perform zero database writes.
- Real dashboard frontend projection is locally proven.
- Selected dossier support is locally proven.
- Scoped memory cache and shared request deduplication are locally proven.
- First dashboard request race/abort behavior is fixed locally.
- Terminal bootstrap cleanup is locally proven.
- Portal navigation split is locally proven.
- Shared button pointer/disabled/pressed interaction is locally proven.

Local proof is not production proof. Remote migration/function deploy, production bucket/policy proof, and production browser QA remain open.

## P0

- Exact legal/regulatory requirements for ENVAL acting as inboeker.
- Exact 10% result/fee contract:
  - result definition
  - fee trigger
  - gross/net basis
  - VAT/tax wording
  - partial success
  - reversal, audit correction, and clawback
- Password recovery UX.
- Resend verification UX.
- Production secrets, storage, function, and migration deployment proof.
- Production Auth configuration and remote auth proof.
- Account-specific document contracts:
  - particulier
  - zakelijk
  - VVE
- KVK and signing-authority evidence.
- VVE mandate and board-authority evidence.
- Verifier/inboeking integration boundary.
- Rotate any previously exposed token/key-like value before production or deploy use.

## P1

- Build one lean shared document upload client for the proven upload-url → signed PUT → upload-confirm flow, without wiring UI yet.
- First PDF invoice slot wiring.
- Dashboard refresh after upload.
- Modular document upload client.
- Zakelijke/VvE document requirements.
- Business and VVE upload slots.
- Business and VVE dashboard detail pages.
- Password recovery and resend verification.
- Unsupported dashboard domains.
- Result/inboeking lifecycle.
- Fee/payout lifecycle.
- Customer-readable timeline projection.
- Browser QA for signup submit, upload, dashboard, auth, and document state.
- Legal text version/hash/language hardening.
- Customer request/response model for missing information.
- Yearly kWh input/readout contract.

## P2

- Content/article migration into the new app content model.
- NL/EN language structure.
- Legacy root/static retirement plan.
- Legacy function retirement plan after `/app` production replacement is proven.
- Internal ENVAL review/admin tooling.
- Image OCR worker/internal analysis lane.

## Boundaries

- Do not mark the complete inboekservice live or finished.
- Do not use legacy `api-dossier-*` for new app behavior.
- Do not use legacy `dossier_sessions` as app auth.
- Do not treat a particulier-only mock as a global account-type rule.
- Do not expose raw audit rows directly to customers.
