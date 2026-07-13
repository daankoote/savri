# ENVAL App Canon

Status: CURRENT source of truth for the new ENVAL `/app` product and implementation.

This file overrides every legacy document for new app work. If a legacy file conflicts with this document, this document wins.

## Product Canon

ENVAL is a customer-facing commercial ERE inboeker.

The current `/app` product scope includes:

- particulier
- zakelijk
- VVE

ENVAL is responsible for customer intake, dossier construction, evidence lifecycle, audit trail, and the ERE inboeking service within the final legal/commercial terms.

Commercial direction:

- Intended customer-facing model: 10% success fee.
- Exact result definition, fee trigger, fee base, partial success, reversal, audit correction, and clawback remain legal/commercial open items.
- No public competitor fee claims may be made without verified sources.

ENVAL is not:

- a verifier
- a certifier
- a compliance authority
- a result guarantor

ENVAL does not guarantee:

- eligibility
- acceptance
- number or value of EREs
- payment
- timing
- verification outcome
- certification outcome
- approval of every document

## Architecture Canon

Current implementation direction:

- `/app` is the active rebuild frontend.
- `api-app-*` is the active backend endpoint namespace.
- `app_*` tables are the active backend data model.
- Branch for active work is `main`.

Legacy/fallback surface:

- Root/static HTML, CSS, and JS remain the legacy production/fallback surface until explicit cutover.
- `api-dossier-*`, `api-lead-submit`, and legacy workers remain legacy/fallback only.
- Legacy `dossier_*` tables remain legacy/fallback only.
- New app work must not write app audit/idempotency to legacy tables.

The recent app backend is retained as valid foundation:

- `app_customers`, `app_customer_identities`, and `app_customer_dossiers`
- account types: `particulier`, `zakelijk`, `vve`
- multiple locations
- multiple chargers
- app audit/idempotency
- app customer auth foundation
- app document slots/files/versions
- `api-app-auth-bootstrap`
- `api-app-document-upload-url`
- `api-app-document-upload-confirm`
- no legacy dossier dependency in app endpoints

The recent app frontend Auth/session flow is retained as local proof:

- `/account` supports customer account creation and sign-in.
- Supabase Auth session restoration and logout are wired locally.
- `/dashboard` is protected by the current frontend session flow.
- Auth/Supabase frontend code is route-lazy for `/account` and `/dashboard`.
- Dashboard content is still mock/read-only; no dashboard read model is implemented yet.

## Source-Of-Truth Order

When sources conflict, use this order:

1. Current code, migrations, and proof output.
2. `docs/app/00_CANON.md`.
3. `docs/app/01_SYSTEM_MAP.md`.
4. `docs/app/02_PRODUCT_MODEL.md`.
5. `docs/app/03_CHANGELOG_APPEND_ONLY.md`.
6. `docs/app/04_TODO.md`.
7. Focused contracts under `docs/app/contracts/`.
8. Architecture, operations, legal, and proof documents under `docs/app/`.
9. Legacy files under `docs/legacy/**` only when explicitly referenced as legacy source material.

## Legacy Rule

`docs/legacy/**` is never CURRENT for new app implementation.

No legacy file may override:

- current app code
- current app migrations
- current proof output
- `docs/app/**`

Legacy reuse requires explicit adaptation. Old neutral-infrastructure, external-inboeker, max-4, private-only, and fixed export-fee assumptions are historical only.

## Account-Type Rule

Shared app foundations must remain generic across:

- particulier
- zakelijk
- VVE

Account-specific requiredness belongs in explicit contracts for each account type.

Private-only MVP work may not silently become a global rule. A document, endpoint, or UI flow that is only proven for particulier must say so directly.

## Public Copy Boundary

Public copy must remain simple, commercial, and customer-oriented.

Public copy may say:

- ENVAL helpt je met het aanmeld- en inboekproces.
- Je betaalt alleen bij resultaat.
- Geen garantie op resultaat.
- Wij zorgen dat je dossier controleerbaar en compleet wordt opgebouwd.

Public copy must not expose internal legal/audit/anti-fraud doctrine except in legal, FAQ, or terms context.

## Active Entry Points

- Current system map: `docs/app/01_SYSTEM_MAP.md`
- Product model: `docs/app/02_PRODUCT_MODEL.md`
- App TODO: `docs/app/04_TODO.md`
- Signup/dashboard contract: `docs/app/contracts/signup-dashboard.md`
- Auth contract: `docs/app/contracts/auth.md`
- Document upload contract: `docs/app/contracts/document-upload.md`
- Edge contract: `docs/app/contracts/edge-functions.md`
- Audit contract: `docs/app/contracts/audit.md`
- Legacy reuse matrix: `docs/app/LEGACY_REUSE_MATRIX.md`
