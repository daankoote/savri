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
- Frontend Auth module, customer account activation/sign-in, session restoration, logout, recovery, verification UX, dashboard route guard, and bootstrap API client.
- Dashboard bootstrap/read endpoint.
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

- Build the modular frontend Auth/session layer and call `api-app-auth-bootstrap` after a verified Supabase Auth session exists.
- Modular `/app` upload client.
- PDF invoice slot frontend upload wiring.
- Business and VVE upload slots.
- Dashboard read model.
- Business and VVE dashboard detail pages.
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
