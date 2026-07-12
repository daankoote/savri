# Legacy Reuse Matrix

Status: CURRENT map for adapting legacy docs into the new `/app` canon.

Legacy files are under `docs/legacy/**`. They are not current source of truth for `/app`, `api-app-*`, or `app_*`.

| Legacy file | Business truth | Technical truth | Reuse decision | New app target | Status |
|---|---|---|---|---|---|
| `docs/legacy/root-static/00_GLOBAL.md` | Superseded: neutral infrastructure, not-inboeker, no revenue share, no money flows. | Useful audit-first discipline and historical runtime facts. | ADAPT_LATER | `docs/app/00_CANON.md`, `docs/app/02_PRODUCT_MODEL.md`, `docs/app/contracts/audit.md` | LEGACY / SUPERSEDED |
| `docs/legacy/root-static/01_SYSTEM_MAP.md` | Superseded for product role and root/static-first architecture. | Useful inventory of old root/static pages, scripts, config, and legacy dossier flow. | ADAPT_LATER | `docs/app/01_SYSTEM_MAP.md`, `docs/app/architecture/frontend.md`, `docs/app/architecture/backend.md` | LEGACY / SUPERSEDED |
| `docs/legacy/root-static/02_AUDIT_MATRIX.md` | Superseded infrastructure framing. | Strong audit event discipline and gateway/auth distinctions. | REUSED_AND_ADAPTED | `docs/app/contracts/audit.md` | Adapted at doctrine level. |
| `docs/legacy/root-static/03_CHANGELOG_APPEND_ONLY.md` | Historical only. | Historical proof chronology. | HISTORICAL_APPEND_ONLY | `docs/app/03_CHANGELOG_APPEND_ONLY.md` for new app entries only. | Preserve body unchanged. |
| `docs/legacy/root-static/04_TODO.md` | Mixed legacy and app-era queue; not current app TODO. | Some open legacy risks useful as archive. | ADAPT_LATER | `docs/app/04_TODO.md` for current app queue. | Legacy only. |
| `docs/legacy/root-static/05_START_CHAT_TEMPLATE.md` | Superseded product role. | Useful no-secrets and audit-first collaboration discipline. | ADAPT_LATER | `docs/app/00_CANON.md`, `docs/app/operations/run-debug.md` | Legacy only. |
| `docs/legacy/root-static/06_OPS_RUN_DEBUG_BOOK.md` | Legacy root/static operational context. | Useful gateway, request ID, and debug habits. | REUSED_AND_ADAPTED | `docs/app/operations/run-debug.md` | Adapted at app level. |
| `docs/legacy/root-static/07_MVP_PLANNING_1_maand.md` | Superseded old MVP plan. | Limited historical context. | ARCHIVE_ONLY | None. | Legacy only. |
| `docs/legacy/root-static/08_ENVAL_POSITIONERING.md` | Superseded: neutral infrastructure, fixed EUR 15 export fee, no vertical integration. | Historical strategy context only. | ARCHIVE_ONLY | None. | Legacy only. |
| `docs/legacy/root-static/09_ARTIKEL_STANDAARD.md` | Old content model. | Useful article formatting ideas. | ADAPT_LATER | future app content/article standard | Legacy until public content strategy is rebuilt. |
| `docs/legacy/root-static/10_EDGE_FUNCTIONS_CONTRACT.md` | Legacy endpoint inventory and session model superseded. | Strong CORE/UTILITY and CORS/META/IDEM/AUD/AUTH/SRV discipline. | REUSED_AND_ADAPTED | `docs/app/contracts/edge-functions.md` | Adapted at app level. |
| `docs/legacy/root-static/11_ANALYSE_PLAN.md` | Draft, not current. | Useful declared/observed/evaluated separation and PDF/image lane lessons. | ADAPT_LATER | future `docs/app/contracts/document-analysis.md` | Legacy draft. |
| `docs/legacy/root-static/Analysis_Test_Matrix.md` | Legacy analysis proof matrix. | Useful invoice/parser scenarios. | ADAPT_LATER | future app document-analysis proof matrix | Legacy proof reference. |
| `docs/legacy/root-static/PHASE_2_UPLOAD_STRATEGY.md` | Superseded: private-only, max-4, old phase scope. | Useful upload cost/hash/client-transform lessons. | ADAPT_LATER | `docs/app/contracts/document-upload.md` and future upload strategy | Legacy only; do not reuse old scope. |
| `docs/legacy/root-static/PROJECT_INSTRUCTIONS_CHAT.md` | Superseded: says ENVAL is not inboeker. | Useful discipline around scope, no secrets, audit-first. | ADAPT_LATER | `docs/app/00_CANON.md`, `docs/app/operations/git-workflow.md` | Legacy only. |
| `docs/legacy/root-static/XX_temp_Concrete_gestructureerde_opl.md` | Old no-dashboard/session recovery proposal. | Useful historical auth/recovery thinking. | ADAPT_LATER | `docs/app/contracts/auth.md` if still relevant | Legacy draft. |
| `docs/legacy/tooling/Cheatsheet_GIT_legacy.md` | Old branch guidance; not current. | Some Git basics useful. | ARCHIVE_ONLY | `docs/app/operations/git-workflow.md` | Replaced by current workflow. |
| `docs/legacy/tooling/Cheatsheet_SUPABASE_SQL_legacy.md` | Not product truth. | Contains destructive SQL; unsafe as current app operations doc. | ARCHIVE_ONLY | None unless rewritten safely. | Legacy tooling only. |

## Reuse Rule

Reuse means deliberate adaptation into `docs/app/`, not linking a legacy file as current instruction.

Old claims that must remain historical only:

- neutral infrastructure
- not an inboeker
- external inboeker owns the relationship
- private-only scope
- max four chargers as global rule
- fixed EUR 15 export fee
- old dossier sessions as app account auth
