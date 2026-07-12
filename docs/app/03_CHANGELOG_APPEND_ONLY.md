# ENVAL App Change Log

Status: CURRENT append-only changelog for the new `/app`, `api-app-*`, and `app_*` product generation.

Rule: append only. Do not rewrite previous app entries. The legacy root/static changelog remains historical under `docs/legacy/root-static/03_CHANGELOG_APPEND_ONLY.md`.

## 2026-07-04 — Start isolated ENVAL Vite rebuild

Commit: `4d98c00 Start isolated ENVAL Vite rebuild`

- Created the isolated `/app` Vite rebuild surface.
- Kept root/static Netlify production untouched.
- Established `/app` as the new frontend development surface.
- Established port `5175` as the standard local Vite dev port.

## 2026-07-06 — Build signup intake skeleton

Commit: `7de83d1 Build ENVAL signup intake skeleton`

- Added `/aanmelden` frontend intake skeleton.
- Modeled particulier, zakelijk, and VVE draft paths.
- Added multiple locations for zakelijk/VVE.
- Added unlimited chargers through stable client IDs.
- Kept the flow frontend-only at this stage.

## 2026-07-06 — Add client-first signup address lookup and validation

Commit: `3f29fcb Add client-first signup address lookup and validation`

- Added client-first address lookup and field validation.
- Kept address lookup frontend-first and read-only.
- Kept backend source-of-truth doctrine intact.

## 2026-07-06 — Add mock customer dashboard shell

Commit: `7c81b56 Add mock customer dashboard shell`

- Added mock/read-only dashboard shell.
- Kept dashboard frontend-only with no auth, backend calls, storage, or persistence.
- Business and VVE dashboard details remained deferred.

## 2026-07-07 — Add app foundation schema migration

Commit: `05aab6b Add app foundation schema migration`

- Added app customer, identity, dossier, audit, intake-audit, and idempotency foundations.
- Account type foundation includes `particulier`, `zakelijk`, and `vve`.
- Local isolated apply proof exists; full local reset remains blocked by legacy non-baseline migrations.

## 2026-07-08 — Add app signup submit write v3

Commit: `2c6de76 Add app signup submit write v3`

- `api-app-signup-submit` write v3 creates customer/identity/dossier shell.
- Writes locations, chargers, expected document slots, and legal acceptances.
- Uses app audit and app idempotency.
- Locally proven with idempotency replay/conflict behavior.
- Does not upload documents, create storage objects, bootstrap dashboard auth, or create result/fee lifecycle rows.

## 2026-07-09 — Fix app signup submit env resolution

Commit: `beffb34 Fix app signup submit env resolution`

- Fixed Vite env resolution for local `/aanmelden` submit.
- Local browser QA later proved `/aanmelden` submit stayed on-page and showed a dossier ID.
- No dashboard redirect or upload flow was implemented.

## 2026-07-09 — Document app signup browser QA proof

Commit: `9a35cc4 Document app signup browser QA proof`

- Recorded local browser QA for `/aanmelden` submit.
- Proof was local-only, not production deployment proof.

## 2026-07-10 — Add app PDF invoice parser adapter proof

Commit: `997723d Add app PDF invoice parser adapter proof`

- Added `/app` PDF invoice parser adapter proof for text-based PDFs.
- Kept parsing frontend/client-side and preview-only.
- No upload processing or backend verification was claimed.

## 2026-07-10 — Add local PDF invoice preview

Commit: `bb17391 Add local PDF invoice preview`

- Wired local PDF preview into signup invoice slots.
- Preview shows safe summary only.
- No upload, backend mutation, or document acceptance was implemented.

## 2026-07-11 — Add app document file version schema

Commit: `b9359c9 Add app document file version schema`

- Added `app_dossier_document_files`.
- Added `app_dossier_document_versions`.
- Added current-version fields to document slots.
- Preserved immutable/versioned evidence model.

## 2026-07-11 — Add app customer auth foundation

Commit: `aa13736 Add app customer auth foundation`

- Added app customer auth helper.
- Uses Supabase Auth JWT validation.
- Resolves active app customer identity, customer, and dossier ownership.
- Does not reuse legacy `dossier_sessions`.

## 2026-07-11 — Add app document upload URL endpoint

Commit: `a17dfa6 Add app document upload URL endpoint`

- Added `api-app-document-upload-url`.
- Issues server-generated private upload targets.
- Creates `app_dossier_document_files` rows with `issued` status.
- Uses app auth, dossier/slot authorization, app idempotency, and app audit.
- Local proof only; no production deploy proof.

## 2026-07-12 — Document app upload backend proof

Commit: `adedd8f Document app upload backend proof`

- Documented locally proven app upload backend.
- Covers upload-url, upload-confirm, atomic confirm/reject RPCs, replacement, idempotency, audit, and local gateway proof.
- Boundaries remain open: frontend upload wiring, customer auth bootstrap/login, production bucket/policy/deploy proof, browser QA.

## 2026-07-12 — Separate app canon from legacy ENVAL docs

Commit: this documentation migration commit.

- Establishes `docs/app/` as the sole CURRENT product and implementation canon.
- Moves root/static docs into `docs/legacy/root-static/`.
- Moves unsafe/outdated tooling notes into `docs/legacy/tooling/`.
- Adapts high-value legacy Edge, audit, and ops lessons into app-specific docs.
- Keeps old neutral-infrastructure, external-inboeker, max-4, and fixed export-fee assumptions as historical only.
