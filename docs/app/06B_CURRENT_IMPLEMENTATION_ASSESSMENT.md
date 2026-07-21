# Current Implementation Assessment

Status: PROOF ONLY.

Disposition rule: local foundations that depend on open regulatory semantics are `PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON`. Local proof does not approve target architecture, remote deployment, REV compatibility, CAR access, verifier workflow, mandate wording, AO/IB detail, or CAPA detail.

Audit date: 2026-07-19.

Repo: `/Users/daankoote/dev/enval`.

Branch at audit start: `main`.

HEAD at audit start: `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`.

Regulatory status remains: PARTIAL — ELECTRICITY TKV ACCESS AND CLAUSE COVERAGE PASS; OTHER LEGAL, DEADLINE, RETENTION, REV, AND EXTERNAL-VERIFIER GAPS REMAIN.

The 2026-07-09 `Toetsingskader verificatieprotocol inboekverificatie elektriciteit` was fully read and mapped on 2026-07-21. TKV-affected rows below are implementation dispositions, not source blockers. This documentary reassessment changes no code, CSS, Supabase object, proof, migration, or runtime state.

This assessment does not approve target architecture, does not approve a data model, and does not finalize an implementation plan.

## Pre-Task Confirmation

- `docs/legacy` does not exist.
- `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md` states: `ENVAL is een inboekdienstverlener voor ERE-E.`
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md` is `PRELIMINARY DRAFT - NOT APPROVED`.
- `docs/app/09_NEA_MVP_PLAN.md` is `PRELIMINARY DRAFT - NOT APPROVED`.
- Existing worktree items were inspected read-only and left untouched.

## Part 1 - Inventory

### A. Frontend Modules

Frontend inventory count: 10 module groups.

| group | files | actual role | proven status |
|---|---|---|---|
| routes | `app/src/App.tsx` | Client-side routes for `/`, `/aanmelden`, `/upload`, `/ere`, `/contact`, `/privacy`, `/voorwaarden`, lazy `/account`, lazy `/dashboard`. | PARTIAL PROVEN for routing only. |
| signup/intake | `app/src/features/signup/**` | Captures applicant, account type, address, locations, chargers, MID number, serial, supplier, solar status, consent bundle and fee terms. | PARTIAL PROVEN; no signed mandate, EAN, CAR, kWh, verifier permission, or REV-ready state. |
| address lookup | `app/src/features/signup/address/**` | PDOK-style lookup hook and normalizers. | PARTIAL PROVEN for lookup/prefill only; not EAN/CAR proof. |
| account/auth | `app/src/features/auth/**` | Supabase Auth client, runtime config, bootstrap client, provider, route guard. | PARTIAL PROVEN for account binding/dashboard guard. |
| dashboard | `app/src/features/dashboard/**` | Reads customer-safe dashboard projection with dossiers, locations, chargers, document slots, legal acceptances. | PARTIAL PROVEN; no operations, review, REV, verifier, or kWh lifecycle. |
| document upload UI | `app/src/features/documents/**` | PDF selection, client SHA-256, upload-url, signed upload, confirm, download, withdrawal clients/cards. | PARTIAL PROVEN for document transport and current document version projection. |
| parser/precheck | `app/src/features/invoice-analysis/**` | Local invoice PDF parser adapter/proof. | REUSE LOGIC ONLY; parser output is not accepted evidence. |
| status presentation | `documentSlotPresentation.ts`, dashboard components | Customer-safe document slot visual states. | PARTIAL PROVEN; not compliance decisioning. |
| correction flows | document withdrawal client/card | Withdraw current document pointer while preserving versions. | PARTIAL PROVEN for documents only; no REV correction model. |
| calculator/public copy | `RevenueCalculator.tsx`, public pages | Indicative revenue calculator and no-guarantee copy. | PARTIAL PROVEN public-copy guard; formula is not ERE-E compliance calculation. |

### B. App Edge Functions

App Edge Function count: 7.

| function | inputs | auth model | writes | reads | helpers | audit/idempotency | proven status |
|---|---|---|---|---|---|---|---|
| `api-app-signup-submit` | anonymous signup payload + `Idempotency-Key` | anon key / public endpoint, service-role DB writes | `app_customers`, `app_customer_identities`, `app_customer_dossiers`, locations, chargers, slots, legal acceptances, idempotency | identity lookup | `app_foundation` | app intake/app audit fail-open; strict idempotency replay/conflict | PARTIAL PROVEN. |
| `api-app-auth-bootstrap` | verified Supabase Auth bearer + idempotency | Supabase Auth user + service-role RPC | via `app_bootstrap_customer_auth_v1` | `auth.users`, `app_customer_identities`, `app_customers`, dossiers | `app_customer_auth`, `app_foundation` | RPC audit/idempotency | PARTIAL PROVEN. |
| `api-app-dashboard-get` | bearer + dossier ID | `requireAppCustomer` + dossier ownership | success path writes zero DB rows | customer dossiers, locations, chargers, slots, versions, files, legal acceptances | `app_customer_auth`, `app_foundation` | reject audit only | PARTIAL PROVEN. |
| `api-app-document-upload-url` | bearer + dossier/slot/file metadata + SHA-256 hint | `requireAppCustomer` + dossier/slot access | app document file row, app audit, app idempotency | slot/files | `app_customer_auth`, `app_foundation` | strict idempotency, strict success audit | PARTIAL PROVEN. |
| `api-app-document-upload-confirm` | bearer + dossier/slot/file ID + SHA-256 | `requireAppCustomer` + dossier/slot/file access | RPC confirms file/version/slot/audit/idempotency | storage object, file, slot | `app_customer_auth`, `app_foundation` | atomic RPC and reject RPC | PARTIAL PROVEN. |
| `api-app-document-download-url` | bearer + dossier/slot | `requireAppCustomer` + dossier/slot access | none on success | slot/version/file; signed storage URL | `app_customer_auth`, `app_foundation` | reject audit | PARTIAL PROVEN. |
| `api-app-document-withdraw-current` | bearer + dossier/slot + idempotency | `requireAppCustomer` + dossier/slot access | RPC withdraws current pointer, preserves version | slot/current state | `app_customer_auth`, `app_foundation` | atomic RPC/idempotency | PARTIAL PROVEN. |

### C. Old / Runtime Edge Functions

Legacy/runtime function count: 22.

`api-dossier-*`, `api-lead-submit`, `mail-worker`, `locked-unpaid-reminder-worker`, and `retention-worker` are not architecture sources for the new app. They are assessed as `REUSE LOGIC ONLY` or future deletion candidates after replacement proof.

Reusable logic found:

- hashing: `sha256Hex` in `_shared/sessions.ts`, `_shared/app_foundation.ts`, old upload confirm/export helpers;
- canonical payload hashing: `stableJsonStringify` and `payloadHash` in `_shared/app_foundation.ts`;
- idempotency replay/conflict: app and legacy scoped idempotency helpers;
- request metadata: request ID, idempotency key, IP/user-agent hashing, environment metadata in `_shared/app_foundation.ts`;
- actor references: `app_customer_identity:<id>` and legacy dossier-session actor refs;
- safe errors: `appErrorResponse`, frontend safe error mappers;
- CORS: app CORS helper and legacy endpoint CORS patterns;
- signed uploads/downloads: app and legacy storage helpers;
- server-side file hash: app and legacy upload-confirm flows;
- immutable versioning: app document file/version schema and RPCs;
- parser/extraction: `_shared/analysis.ts`, `pdf_text.ts`, `image_text.ts`, frontend invoice parser adapter;
- address lookup: app frontend PDOK hook and legacy `api-dossier-address-verify` concept;
- audit export: legacy `api-dossier-export` concept only;
- retention cleanup: `retention-worker` and retention events concept only.

Non-reusable assumptions:

- old `dossier_sessions` token identity;
- old `dossier_*` lifecycle;
- old max-charger/document assumptions;
- legacy endpoint names as app architecture;
- old parser/OCR as final evidence decision;
- old export as REV/auditor-ready package.

Formula review:

| file | function | input | output | units | assumptions | rounding | factor source | reusability |
|---|---|---|---|---|---|---|---|---|
| `app/src/features/calculator/RevenueCalculator.tsx` | `RevenueCalculator` | yearly km, kWh/100km, yearly kWh, value/kWh | estimated kWh, gross, 10% fee, net | km, kWh, EUR | user-entered commercial indication | formatter display only | none | REUSE LOGIC ONLY for public calculator; not ERE-E calculation. |
| `supabase/functions/_shared/app_foundation.ts` | `payloadHash` | JSON-like payload | SHA-256 over stable JSON | hex digest | sorted object keys, JSON-like values | none | cryptographic hash only | KEEP/EXTEND as idempotency primitive. |
| `supabase/functions/api-app-document-upload-confirm/index.ts` | `sha256HexFromBytes` | stored object bytes | SHA-256 | hex digest | stored bytes are downloaded server-side | none | cryptographic hash only | KEEP/EXTEND for evidence integrity. |
| `supabase/functions/_shared/analysis.ts` | match/evaluate helpers | declared and observed invoice/photo fields | pass/fail/inconclusive rows | text/status | heuristic parser/extractor | not numeric | parser method version `analysis_v1` | REUSE LOGIC ONLY; cannot approve evidence. |

No current ERE/kWh statutory calculation is implemented.

### D. Database Inventory

Current migration-created table count: 18.

Relevant legacy/runtime referenced table count: 19.

Key current app tables:

- `app_customers`, `app_customer_identities`, `app_customer_dossiers`
- `app_dossier_locations`, `app_dossier_chargers`
- `app_dossier_document_slots`, `app_dossier_document_files`, `app_dossier_document_versions`
- `app_dossier_legal_acceptances`
- `app_audit_events`, `app_intake_audit_events`, `app_idempotency_keys`
- `app_signup_intakes`, `app_signup_intake_files`, `app_signup_intake_capabilities`
- `retention_cleanup_events`, `locked_unpaid_reminder_events`, `dossier_analysis_runs`

All current `app_*` migrations inspected use deny-all RLS for `anon` and `authenticated`, service-role grants, and constrained status fields. This is a security foundation, not NEa completeness.

### E. Migrations

Migration count: 18.

Committed/current migrations include legacy session hardening, analysis runs, retention/reminders, and app foundations. The quarantine migration `20260716100000_app_signup_intake_quarantine_schema.sql` exists in the working tree; remote status remains UNKNOWN.

### F. Tests And Proofs

Relevant proof/test count: 19.

Proofs demonstrate local behavior for signup submit, auth bootstrap, dashboard read, document upload URL/confirm/download/withdrawal, frontend upload cards/clients, parser adapter, and auth session cleanup. They do not prove production, REV access, TKV compliance, external verifier readiness, or full NEa compliance.

## Part 2 - Requirement-By-Requirement Assessment

| requirement_id | requirement_type | requirement_summary | applicable_role | frontend_evidence | edge_function_evidence | database_evidence | migration_evidence | test_or_proof_evidence | actual_behavior | coverage_status | compliance_gap | architectural_mismatch | security_risk | audit_risk | TKV_dependency | disposition | reusable_parts | deletion_candidate | next_design_requirement |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NEA-ORG-001 | DIRECT NEA | KvK registration | IDV | none | none | none | none | none | No KvK entity proof. | NOT IMPLEMENTED | Legal entity proof missing. | Compliance not modeled. | low | high | no | REPLACE | none | no | Legal/KvK evidence object. |
| NEA-ORG-002 | DIRECT NEA | 200 mandates or 2M kWh threshold | IDV | none | none | no counters | none | none | No threshold tracking. | NOT IMPLEMENTED | Mandate/kWh threshold proof missing. | No aggregate source. | low | high | no | REPLACE | none | no | Threshold ledger/report. |
| NEA-ORG-003 | DIRECT NEA | REV account readiness | IDV | none | none | none | none | none | REV status unknown. | UNKNOWN | REV account/access not evidenced. | No REV integration. | medium | high | no | UNKNOWN | none | no | REV account/access evidence. |
| NEA-ORG-004 | DIRECT NEA | IDV responsible for administration | IDV | none | app audit partial | app audit partial | `app_audit_events` | local app proofs partial | Audit primitives exist; AO/IB absent. | NOT IMPLEMENTED | AO/IB pack missing. | Ops controls absent. | medium | high | yes | REPLACE | audit primitives | no | AO/IB and management signoff. |
| NEA-ORG-005 | DIRECT NEA | NEa list not approval | IDV/public | no-guarantee copy in public/signup | none | none | none | frontend copy not fully tested | Copy avoids guarantees but no claim-control system. | PARTIAL PROVEN | List/accreditation wording gate missing. | Public copy not source-driven. | low | medium | no | EXTEND | public no-guarantee copy | no | Claim library and approval gate. |
| NEA-ORG-006 | DIRECT LAW | Assess as IDV, not customer/neutral supplier | IDV | public app positions ENVAL as service | app namespace only | app_* separate from legacy | app schema | none | Role partly reflected in docs/product, not encoded. | NOT IMPLEMENTED | Role-bound controls absent. | Customer-side delivery rules not mapped. | medium | high | yes | REPLACE | app namespace boundary | no | Role-to-control map. |
| NEA-MAND-001 | DIRECT NEA | Written mandate required | IDV/customer | consent checkbox only | optional legal acceptance support | `app_dossier_legal_acceptances`, mandate document slot | document/legal slots migration | signup proof counts legal acceptances | No signed mandate object or full mandate capture. | PARTIAL PROVEN | Signed mandate missing. | Acceptance is not mandate. | medium | high | yes | EXTEND | legal acceptance table; mandate slot | no | Mandate version/entity. |
| NEA-MAND-002 | DIRECT NEA | Private mandate fields | IDV/customer | name/address captured | signup writes applicant/address | customer/dossier/location | app foundation/location migrations | signup mapper proof | No EAN, mandate date/validity/signature. | PARTIAL PROVEN | Required mandate fields incomplete. | Applicant data mixed with mandate proof. | medium | high | yes | EXTEND | applicant/address mapping | no | Private mandate model. |
| NEA-MAND-003 | DIRECT NEA | Enterprise/VvE authority | IDV/customer | company/VvE name and KvK fields | legalEntity writes partial | identity/customer only | app foundation | signup mapper proof | No representative authority/signature proof. | PARTIAL PROVEN | Authority evidence missing. | Legal entity not representation model. | medium | high | yes | EXTEND | KvK field validation | no | Representation/authority evidence. |
| NEA-MAND-004 | DIRECT NEA | Calendar-year mandate validity | IDV/customer | none | none | no validity period | none | none | No mandate period. | NOT IMPLEMENTED | Calendar-year validity missing. | No time-bound mandate truth. | low | high | yes | REPLACE | none | no | Mandate period/version states. |
| NEA-MAND-005 | DIRECT NEA | NEa/CAR/verifier permissions | IDV/customer | generic consent copy | optional mandate acceptance support | legal acceptance can store versions | document/legal slots migration | none | No explicit CAR/location-visit clauses proven. | PARTIAL PROVEN | Required clauses missing. | Generic acceptance too broad. | medium | high | yes | EXTEND | versioned legal acceptances | no | Clause-specific acceptance evidence. |
| NEA-EAN-001 | DIRECT NEA | Customer is aangeslotene | IDV/customer | address only | none | no EAN/CAR entity | none | none | No EAN or CAR proof. | NOT IMPLEMENTED | Aangeslotene proof missing. | Address treated as location only. | medium | high | yes | REPLACE | address normalizers | no | EAN/CAR ownership period. |
| NEA-EAN-002 | DIRECT NEA | EAN/address/period captured | IDV/customer | address captured | signup writes address | location without EAN/period | locations migration | signup proofs | Address yes; EAN and period no. | PARTIAL PROVEN | EAN and period missing. | Location model not connection model. | medium | high | yes | EXTEND | location rows | no | Connection/EAN period entity. |
| NEA-EAN-003 | DIRECT NEA | Secondary allocation not enough alone | IDV/customer | none | none | none | none | none | Allocation construct not modeled. | NOT IMPLEMENTED | Construct decision missing. | No measured construct model. | low | high | yes | REPLACE | none | no | Allocation/construct decision. |
| NEA-EAN-004 | DIRECT NEA | One private IDV/EAN/year | IDV/customer | none | none | no year/EAN uniqueness | none | none | No exclusivity control. | NOT IMPLEMENTED | Duplicate IDV/EAN/year risk. | No external duplicate strategy. | medium | high | yes | REPLACE | idempotency pattern only | no | EAN/year duplicate checks. |
| NEA-CHG-001 | DIRECT NEA | Transport use only | IDV/customer | charger form only | none | charger record only | chargers migration | signup proofs | No transport-use evidence or review. | NOT IMPLEMENTED | Eligibility decision absent. | Charger existence not transport use. | low | high | yes | REPLACE | charger form | no | Transport-use evidence workflow. |
| NEA-CHG-002 | DIRECT NEA | Charger tied to address/connection | IDV/customer | chargers under locations | signup writes charger/location | FK charger-location | locations/chargers migration | signup proof | Charger-location link exists; no connection/EAN link. | PARTIAL PROVEN | Connection proof missing. | Location not connection. | medium | high | yes | EXTEND | FK/location mapping | no | Charger-location-connection linkage. |
| NEA-CHG-003 | ENVAL INTERNAL CONTROL | Charger identity historized | IDV/internal | serial/MID fields | signup writes current charger | charger row has timestamps | chargers migration | signup proof | Current snapshot only; no history table. | PARTIAL PROVEN | Historical changes absent. | Overwrites possible via service role. | medium | medium | yes | EXTEND | charger row/status | no | Charger history/versioning. |
| NEA-MID-001 | DIRECT LAW | MID or allowed construct | IDV/customer | MID required in signup | signup writes MID | `mid_number`, `mid_status` | chargers migration | signup proof | MID number captured; construct/conformity not proven. | PARTIAL PROVEN | MID applicability/conformity missing. | MID number mistaken for evidence. | medium | high | yes | EXTEND | MID field and document slot | no | MID construct decision. |
| NEA-MID-002 | DIRECT NEA | MID linked to concrete charger | IDV/customer | MID per charger | upload slots per charger | charger-scoped doc slots | document slot migration | upload proofs partial | Slot can link evidence to charger; no accepted proof. | PARTIAL PROVEN | Asset-level proof decision missing. | Confirmed upload not accepted evidence. | medium | high | yes | EXTEND | charger-scoped slots | no | MID evidence decision entity. |
| NEA-MID-003 | VERIFICATION FRAMEWORK | MID validity period | IDV/customer | none | none | no validity fields | none | none | No validity period. | NOT IMPLEMENTED | Validity/time proof missing. | Evidence lacks validity semantics. | low | high | yes | REPLACE | none | no | MID validity period model. |
| NEA-KWH-001 | DIRECT NEA | Traceable kWh | IDV | none | none | no kWh tables | none | none | No kWh source/readings. | NOT IMPLEMENTED | kWh provenance missing. | Core ERE-E data absent. | medium | high | yes | REPLACE | none | no | Raw kWh source/import model. |
| NEA-KWH-002 | DIRECT LAW | Calendar/delivery period | IDV | none | none | no kWh period | none | none | No delivery-period quantity. | NOT IMPLEMENTED | Inboekjaar quantity missing. | Dossier status not kWh period. | low | high | yes | REPLACE | status timestamps only | no | Booking period/readings. |
| NEA-KWH-003 | ENVAL INTERNAL CONTROL | Prevent duplicate volumes | IDV/internal | none | none | no dedupe keys for kWh | none | none | No volume dedupe. | NOT IMPLEMENTED | Double count risk. | No volume identity. | medium | high | yes | REPLACE | idempotency pattern only | no | Volume dedupe keys. |
| NEA-KWH-004 | ENVAL INTERNAL CONTROL | Raw/normalized reconstructable | IDV/internal | none | none | no readings | none | none | No raw/normalized metering data. | NOT IMPLEMENTED | Transform provenance missing. | No kWh pipeline. | low | high | yes | REPLACE | payload hash pattern | no | Raw and normalized reading tables. |
| NEA-KWH-005 | DIRECT NEA | Renewable share basis | IDV | calculator only not compliant | none | no source/factor | none | none | No renewable-share basis. | NOT IMPLEMENTED | Factor/GvO/default basis missing. | Public calculator unrelated. | medium | high | yes | REPLACE | calculator only as indication | no | Renewable basis decision. |
| NEA-KWH-006 | DIRECT LAW | Exclude backfeed | IDV | none | none | no backfeed field | none | none | No V2G/backfeed exclusion. | NOT IMPLEMENTED | Overbooking risk. | No meter event model. | medium | high | yes | REPLACE | none | no | Backfeed exclusion rule. |
| NEA-ELIG-001 | DIRECT LAW | Eligible transport electricity only | IDV | none | none | no eligibility decision | none | none | No eligibility review. | NOT IMPLEMENTED | Invalid electricity risk. | Dossier submit not eligibility. | medium | high | yes | REPLACE | none | no | Eligibility decision engine/review. |
| NEA-ELIG-002 | DIRECT NEA | Private/small via IDV | IDV/public | account types and public flow | signup accepts types | account_type/customer_type | app foundation | signup proof | Customer route partly exists. | PARTIAL PROVEN | Threshold/company route absent. | Account type not eligibility. | low | medium | no | EXTEND | account type routing | no | Route decision with threshold. |
| NEA-ELIG-003 | ENVAL INTERNAL CONTROL | Conditional status until review | IDV/customer | dashboard status projection | dashboard read | status fields | app foundation/doc slots | dashboard proof | Customer-safe projection exists; no review engine. | PARTIAL PROVEN | Decision taxonomy missing. | Status may imply more than proven. | medium | high | yes | EXTEND | projection/read model | no | Evidence decision statuses. |
| NEA-ELIG-004 | DIRECT NEA | No fixed price/guarantee | IDV/public | no-guarantee copy exists | none | none | none | frontend proof not complete | Public copy partly guarded. | PARTIAL PROVEN | Claim lint/approval missing. | Calculator uses editable value/kWh. | low | medium | no | EXTEND | copy pattern | no | Source-driven public claim control. |
| NEA-ELIG-005 | DIRECT LAW | Destination eligibility/exclusions | IDV | none | none | no destination field | none | none | No destination classification. | NOT IMPLEMENTED | Excluded destinations risk. | No transport scope model. | low | high | yes | REPLACE | none | no | Destination taxonomy/decision. |
| NEA-BOOK-001 | ENVAL INTERNAL CONTROL | Reproducible batch | IDV/internal | none | none | no booking batch | none | none | No batch model. | NOT IMPLEMENTED | REV batch proof missing. | No inboeking pipeline. | medium | high | yes | REPLACE | payload hash/idempotency | no | Batch manifest model. |
| NEA-BOOK-002 | ENVAL INTERNAL CONTROL | No REV before blockers closed | IDV/internal | none | none | no gate table | none | none | No pre-REV gate. | NOT IMPLEMENTED | Invalid submission risk. | Stopgates not modeled. | medium | high | yes | REPLACE | status fields only | no | Batch blocker/gate system. |
| NEA-BOOK-003 | DIRECT NEA | Reproducible ERE-E calculation | IDV | calculator not compliant | none | no formula/factor table | none | none | No ERE-E calculation. | NOT IMPLEMENTED | ERE amount cannot be proven. | Commercial calculator mismatch. | medium | high | yes | REPLACE | none | no | REV-aligned calculation record. |
| NEA-BOOK-004 | DIRECT NEA | REV roles controlled | IDV/ops | none | none | none | none | none | REV roles unknown. | UNKNOWN | Access evidence missing. | No REV ops model. | high | high | no | UNKNOWN | none | no | REV role evidence. |
| NEA-BOOK-005 | DIRECT LAW | IDV REV fields per customer/EAN | IDV/ops | none | none | no EAN/kWh/mandate period | none | none | No REV input pack. | NOT IMPLEMENTED | Required fields absent. | Current schema cannot populate REV. | medium | high | yes | REPLACE | customer/location basics | no | REV input schema. |
| NEA-BOOK-006 | DIRECT NEA | REV user-role rules | IDV/ops | none | none | none | none | none | No REV user-role governance. | NOT IMPLEMENTED | Role governance missing. | App roles not REV roles. | high | high | no | REPLACE | none | no | REV access role process. |
| NEA-VER-001 | VERIFICATION FRAMEWORK | Annual independent verification | IDV | none | none | no verifier engagement | none | none | No verifier workflow. | NOT IMPLEMENTED | Verifier setup missing. | No verification domain. | medium | high | mapped | FULL REBUILD | none | no | Verifier engagement and external-professional boundary. |
| NEA-VER-002 | VERIFICATION FRAMEWORK | Verification timing / 1 Apr vs 1 May conflict | IDV/ops | none | none | no calendar | none | none | Deadline conflict unresolved. | CONFLICT | Deadline model cannot be finalized. | One date would be unsafe. | medium | high | yes | REFACTOR | none | no | Distinguish statement, registration, year-end. |
| NEA-VER-003 | VERIFICATION FRAMEWORK | Verifier review pack | IDV/ops | none | legacy export only | no verifier pack | legacy export tables only | none | No app verifier pack. | NOT IMPLEMENTED | TKV pack scope now known but absent. | Legacy export is not the scoped, versioned TKV pack. | medium | high | mapped | FULL REBUILD | legacy export concept only | no | Population/evidence pack with administration, quantities, books, AO/IB, mandates and provenance. |
| NEA-VER-004 | VERIFICATION FRAMEWORK | Risk-driven location visits | IDV/customer/ops | none | none | no visit records | none | none | No visit workflow. | NOT IMPLEMENTED | Visit permission, request/status, novelty and substantial-change triggers missing. | Current locations are not a verifier visit model. | medium | high | mapped | FULL REBUILD | location/address facts only | no | Risk-triggered visit support; verifier chooses final visits/frequency. |
| NEA-VER-005 | VERIFICATION FRAMEWORK | Findings, corrections and CAPA | IDV/ops | none | none | no finding/CAPA table | none | none | No CAPA workflow. | NOT IMPLEMENTED | Findings cannot be routed, corrected or block an external statement. | No verifier result domain. | medium | high | mapped | FULL REBUILD | incident/audit and document-withdraw patterns | no | Immutable finding, responses, correction/CAPA history and external closure/outcome. |
| NEA-VER-006 | VERIFICATION FRAMEWORK | Accredited verifier/protocol or limited temporary designation | IDV/ops | none | none | none | none | none | No verifier/protocol/designation evidence. | NOT IMPLEMENTED | Verifier eligibility gate missing. | No engagement or external approval provenance. | medium | high | mapped | FULL REBUILD | none | no | Accreditation scope, one-year temporary designation, protocol and validity registry. |
| NEA-VER-007 | VERIFICATION FRAMEWORK | Verification statement support pack and external result | IDV/ops | none | none | no pack or statement fields | none | none | No support pack/result intake. | NOT IMPLEMENTED | Statement support and external unique-code/outcome provenance absent. | ENVAL cannot issue or self-mark verification. | medium | high | mapped | FULL REBUILD | app audit/doc versions | no | Support pack plus external statement reference/result boundary. |
| NEA-AUD-001 | ENVAL INTERNAL CONTROL | AO/IB description | IDV/internal | none | audit primitives only | no AO/IB object | none | none | No AO/IB pack. | NOT IMPLEMENTED | Process evidence missing. | Docs not implementation. | low | high | yes | REPLACE | audit event taxonomy | no | AO/IB control model. |
| NEA-AUD-002 | ENVAL INTERNAL CONTROL | Decision traceability | IDV/internal | request IDs in clients | app audit/meta | `app_audit_events` | app foundation | app proofs partial | Request/actor/audit primitives exist. | PARTIAL PROVEN | Not all decisions modeled. | Fail-open audit in some paths. | medium | high | yes | EXTEND | app audit/meta/idempotency | no | Complete event taxonomy. |
| NEA-AUD-003 | ENVAL INTERNAL CONTROL | Four-eyes critical decisions | IDV/internal | none | none | no approval table | none | none | No four-eyes. | NOT IMPLEMENTED | Critical decisions unreviewed. | Operations absent. | medium | high | yes | REPLACE | REV role concept only | no | Distinct-actor approval model. |
| NEA-AUD-004 | ENVAL INTERNAL CONTROL | No raw audit to customer | IDV/customer | dashboard parser rejects raw fields | dashboard reads safe projection | no direct policies | RLS deny-all | dashboard proof checks no raw markers | Customer projection avoids raw audit in dashboard. | PARTIAL PROVEN | Other exports/flows absent. | Auditor/customer split not final. | low | medium | yes | EXTEND | dashboard projection | no | Projection/export contracts. |
| NEA-COR-001 | ENVAL INTERNAL CONTROL | Corrections preserve history | IDV/internal | document withdraw UI | withdraw RPC | version/history tables | document migrations/RPC | withdraw proofs | Document withdrawal preserves versions. | PARTIAL PROVEN | REV/business corrections absent. | Only documents covered. | medium | high | yes | EXTEND | immutable versions/withdraw | no | App-wide correction ledger. |
| NEA-COR-002 | ENVAL INTERNAL CONTROL | CAPA governance | IDV/internal | none | none | no CAPA | none | none | No CAPA. | NOT IMPLEMENTED | Findings untracked. | Ops absent. | medium | high | yes | REPLACE | audit pattern | no | CAPA/finding workflow. |
| NEA-RET-001 | ENVAL INTERNAL CONTROL | Reconstructable records | IDV/internal | none | document lifecycle | immutable doc files/versions partial | doc migrations; retention events legacy | upload/withdraw proofs | Documents reconstructable; full dossier not. | PARTIAL PROVEN | kWh/mandate/REV retention missing. | Retention schedule absent. | medium | high | yes | EXTEND | immutable document tables | no | Retention policy by domain. |
| NEA-RET-002 | ENVAL INTERNAL CONTROL | Privacy minimization preserves proof | IDV/internal | none | withdrawal preserves proof | minimized markers and retention events partial | app foundation/retention migration | proofs partial | Minimization markers exist; policy absent. | PARTIAL PROVEN | Retention/privacy schedule missing. | Deletion rules not complete. | medium | high | yes | EXTEND | minimized markers/tombstones | no | Retention/minimization rules. |
| NEA-FIN-001 | DIRECT NEA | No guaranteed value | IDV/public | no-guarantee copy, calculator indication | none | no terms final | none | frontend proof not complete | Public copy partly safe. | PARTIAL PROVEN | Final legal fee copy missing. | Calculator could be overread. | low | medium | no | EXTEND | no-guarantee copy | no | Approved finance copy/terms. |
| NEA-FIN-002 | ENVAL INTERNAL CONTROL | Finance reconciliation | IDV/finance | none | none | no settlement ledger | none | none | No finance model. | UNKNOWN | Settlement/tax/provider unknown. | No result/fee ledger. | high | high | yes | UNKNOWN | none | no | Settlement ledger decision. |
| NEA-OPS-001 | DIRECT LAW | Deadlines/year-end | IDV/ops | none | none | no calendar | none | none | No operational calendar. | NOT IMPLEMENTED | Deadline controls missing. | 1 Apr/1 May conflict open. | medium | high | yes | REPLACE | none | no | Compliance calendar. |
| NEA-OPS-002 | ENVAL INTERNAL CONTROL | Regulatory source review | IDV/internal | none | none | none | none | docs only | No repeatable source proof tool. | NOT IMPLEMENTED | Source review not automated. | Docs only. | low | high | yes | REPLACE | docs source registry | no | Source-review proof process. |
| NEA-OPS-003 | ENVAL INTERNAL CONTROL | Incident impact assessment | IDV/ops | none | safe errors/audit partial | no incident table | none | none | No incident workflow. | NOT IMPLEMENTED | Evidence-impact incidents missing. | Run-debug not implementation. | medium | high | yes | REPLACE | safe errors/audit | no | Incident model/runbook. |
| NEA-OPS-004 | ENVAL INTERNAL CONTROL | Keep TKV source package versioned and mapped; mapping is not implementation approval | IDV/internal | none | none | none | none | source audit and clause matrix | Source access and clause mapping now pass; recurring change control is documentary target. | TARGET | Future source changes require reassessment. | No implementation approval follows from source PASS. | low | medium | mapped | EXTEND | source registry and audit | no | Source hash/version/change review workflow after GO. |
| NEA-SEC-001 | ENVAL INTERNAL CONTROL | Minimum privileges/role split | IDV/internal | customer routes guarded | app auth helper | deny-all RLS, service-role grants | all app migrations | auth/dashboard proofs | Customer/server boundary partial. | PARTIAL PROVEN | Ops/admin/four-eyes roles absent. | Service role broad. | medium | medium | yes | EXTEND | RLS deny-all/auth guard | no | Role matrix and ops auth. |
| NEA-SEC-002 | ENVAL INTERNAL CONTROL | Service role server-side | IDV/internal | anon key only in clients | app functions use service env | service-role-only grants | app migrations | auth/upload proofs | Server-side service-role pattern exists. | PARTIAL PROVEN | Production secret rotation/deploy unknown. | Broad service-role dependency. | medium | medium | yes | EXTEND | env-based service client | no | Secret inventory/rotation proof. |
| NEA-SEC-003 | ENVAL INTERNAL CONTROL | Integration auth/provenance | IDV/internal | PDOK client lookup partial | storage integration partial | no integration contracts | none | upload proofs partial | Storage integration proven; provider/REV/kWh not. | NOT IMPLEMENTED | External contracts missing. | No provider provenance. | medium | high | yes | REPLACE | storage/request metadata | no | Integration contract model. |

Coverage counts:

- CURRENT PROVEN: 0
- PARTIAL PROVEN: 21
- NOT IMPLEMENTED: 30
- UNKNOWN: 3
- CONFLICT: 1
- TKV source/clauses mapped: 7 formerly blocked rows reclassified; 6 are `NOT IMPLEMENTED`, 1 is documentary/control `TARGET`.

Disposition counts:

- KEEP: 0
- EXTEND: 21
- REFACTOR: 1
- REUSE LOGIC ONLY: 0
- REPLACE: 30
- DELETE CANDIDATE: 0
- UNKNOWN: 10

## Part 3 - Database Disposition

| table_name | current_purpose | current_callers | requirement_families_served | actual_constraints | time_bound_truth_support | provenance/evidence/audit/correction_support | RLS/security_status | missing_required_concepts | disposition | reusable_columns_constraints | migration_implications | TKV_dependency |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `app_customers` | Customer shell | signup/auth/dashboard | ORG, SEC | customer type/status checks | weak | customer/audit link only | deny-all; service-role | legal entity/KvK/role history | EXTEND | type/status/email | may survive or be rebuilt | no |
| `app_customer_identities` | Auth identity link | signup/auth helpers | AUTH, SEC | active auth user unique | weak | actor ref source | deny-all; service-role | verified mandate actor, representatives | EXTEND | auth user uniqueness | likely extend | no |
| `app_customer_dossiers` | Customer dossier lifecycle | signup/dashboard/document | AUD, RET, ELIG | broad status enum | weak | audit FK; document FK | deny-all; service-role | NEa review, REV, kWh, verifier states | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | customer/dossier FK | may need split/rebuild | yes |
| `app_dossier_locations` | Address/location | signup/dashboard | EAN, CHG | unique client location | weak | address lookup metadata | deny-all; service-role | EAN, CAR, ownership period | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | address normalizers/FK | add connection entity | yes |
| `app_dossier_chargers` | Charger snapshot | signup/dashboard | CHG, MID | MID required, year check | weak | charger-location FK | deny-all; service-role | charge point, MID validity, history | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | charger/location FK | add history/evidence | yes |
| `app_dossier_document_slots` | Expected evidence slots | signup/upload/dashboard | MAND, MID, RET | status/sha checks, current pointer | partial | current pointer and file metadata | deny-all; service-role | accepted evidence decision model | EXTEND | slot/current pointer | separate evidence decisions | yes |
| `app_dossier_document_files` | Physical upload intent/file metadata | upload URL/confirm | AUD, RET, SEC | terminal/status/hash/storage constraints | partial | server SHA-256, immutable fields | deny-all; service-role | retention schedule, evidence acceptance | EXTEND | hash/status/storage constraints | preserve pattern | yes |
| `app_dossier_document_versions` | Immutable document version history | confirm/withdraw/dashboard | AUD, COR, RET | immutable trigger/current unique | strong for documents | version/supersede/withdraw | deny-all; service-role | evidence acceptance/verifier decision | EXTEND | immutable versioning | preserve pattern | yes |
| `app_dossier_legal_acceptances` | Versioned consent/terms acceptance | signup/dashboard | MAND, FIN, SEC | type/version/status checks | partial | hashed request metadata | deny-all; service-role | full signed mandate and clauses | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | version/hash/evidence_data | add mandate entity | yes |
| `app_audit_events` | Raw app audit | app functions/RPCs | AUD, SEC, RET | actor/scope checks | event time | request/actor/ip/ua hashes | deny-all; service-role | event taxonomy, strictness policy | EXTEND | audit shape | preserve but govern | yes |
| `app_intake_audit_events` | Anonymous/pre-dossier audit | signup | AUD, SEC | actor checks | event time | request/ip/ua hash | deny-all; service-role | rate-limit/abuse model | EXTEND | minimized audit | likely extend | no |
| `app_idempotency_keys` | Scoped replay/conflict | app writes/RPCs | AUD, SEC | unique scope/key; payload hash | expiry only | response replay | deny-all; service-role | cleanup policy, domain scopes | EXTEND | payload hash/replay | preserve pattern | no |
| `app_signup_intakes` | Future quarantine intake | no runtime endpoint yet | MAND, RET, SEC | payload hash, status guard | partial | immutable finalized payload | deny-all; service-role | promotion implementation | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | immutable payload/expiry | not current runtime | yes |
| `app_signup_intake_files` | Future quarantine file metadata | no runtime endpoint yet | AUD, RET, SEC | hash/storage/status guard | partial | quarantine file proof | deny-all; service-role | actual upload/promote RPCs | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | token/file transition | local-only until proven | yes |
| `app_signup_intake_capabilities` | Hashed one-time capability | no runtime endpoint yet | SEC | unique token hash/type scope | expiry/consume | no raw token storage | deny-all; service-role | consume RPC | PROVISIONALLY REUSABLE — FINAL DISPOSITION AFTER REGULATORY CANON | token hash rule | local-only until proven | no |
| `retention_cleanup_events` | Legacy retention log | retention-worker | RET | status/count checks | event time | cleanup metadata | deny-all; service-role | app retention schedule | REUSE LOGIC ONLY | cleanup event pattern | app-specific retention needed | yes |
| `locked_unpaid_reminder_events` | Legacy reminder events | locked worker | FIN, OPS | day/status uniqueness | event time | reminder audit | deny-all; service-role | app settlement model | DELETE CANDIDATE after replacement | idempotent reminders | replace finance ops | no |
| `dossier_analysis_runs` | Legacy analysis run tracking | legacy verify/evaluate/export | AUD | status/run lifecycle | partial | run tracking | legacy | app review jobs absent | REUSE LOGIC ONLY | run lifecycle pattern | app-specific jobs needed | yes |
| legacy `dossier_*` and related old tables | Static fallback runtime | `api-dossier-*`, workers | legacy only | old constraints unknown here | old | old audit/export/parser | legacy | conflicts with app auth/model | DELETE CANDIDATE after fallback retirement | hash/export/parser concepts only | delete only after runtime proof | yes |

Database verdict: MAJOR REDESIGN REQUIRED.

## Part 4 - Edge Function Disposition

| function_or_helper | current_role | auth | tables | input_output | audit_idempotency | security | requirement_families | proven_status | disposition | reusable_logic | non_reusable_assumptions | deletion_prerequisite |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `api-app-signup-submit` | current app submit | anon + service role | app customer/dossier/location/charger/slot/legal/idempotency | write v3 payload to dossier shell | app audit/idem | safe errors | MAND, CHG, MID, AUD, SEC | PARTIAL PROVEN | REFACTOR/EXTEND | validation, idempotency, app rows | direct dossier creation before verified promotion | replaced by validated intake/promotion flow |
| `api-app-auth-bootstrap` | bind Supabase Auth to app identity | verified bearer + service RPC | auth/users, app identities/customers/dossiers | auth bootstrap | RPC audit/idem | service-role only | AUTH, SEC | PARTIAL PROVEN | EXTEND | verified auth guard | email identity is not mandate identity | keep until auth redesign |
| `api-app-dashboard-get` | customer-safe projection | bearer + dossier ownership | app read tables | dashboard read model | reject audit only | no raw storage/audit in response | AUD, SEC, RET | PARTIAL PROVEN | EXTEND | projection/redaction | no ops/verifier view | keep as customer projection |
| `api-app-document-upload-url` | issue signed upload | bearer + slot access | files, slots, audit, idem, storage | signed upload URL | strict audit/idem | server-issued path | AUD, RET, SEC | PARTIAL PROVEN | EXTEND | signed URL, active upload check | upload does not equal accepted evidence | keep pattern, adapt evidence model |
| `api-app-document-upload-confirm` | server-side file confirm | bearer + slot/file access | files, versions, audit, idem, storage | confirm version | atomic RPC/reject RPC | server hash | AUD, RET, SEC | PARTIAL PROVEN | EXTEND | server SHA-256, immutable version | confirmed upload not accepted evidence | keep pattern, add review decision |
| `api-app-document-download-url` | signed download | bearer + slot access | slots/versions/files/storage | signed URL response | reject audit | safe URL handling | AUD, SEC | PARTIAL PROVEN | EXTEND | short-lived download | no auditor export | keep for customer docs |
| `api-app-document-withdraw-current` | withdraw current doc pointer | bearer + slot access | slots/versions/idempotency | withdraw current | atomic RPC | locked-state check | COR, RET | PARTIAL PROVEN | EXTEND | audit-preserving withdrawal | only document correction | keep pattern |
| `_shared/app_foundation.ts` | app primitives | none by itself | app audit/idem through callers | CORS, meta, hash, response | payload hash/meta | safe errors | AUD, SEC | PARTIAL PROVEN | EXTEND | canonical hash, request metadata | fail-open audit helper not for critical writes | keep |
| `_shared/app_customer_auth.ts` | app auth boundary | Supabase Auth bearer | identities/customers/dossiers | auth context | none by itself | no legacy session | AUTH, SEC | PARTIAL PROVEN | EXTEND | customer/dossier access guard | no ops/admin roles | keep until role model |
| legacy `api-dossier-*` | fallback dossier wizard | old session token | `dossier_*` | old wizard read/write/export | legacy audit/idem | old token contract | legacy | LEGACY | REUSE LOGIC ONLY | hash, parser, export, idempotency | old tables/sessions/states | fallback traffic off and app replacements proven |
| `api-lead-submit` | old lead/dossier bootstrap | public + idempotency | leads/dossiers/mail | old lead/dossier creation | old audit/idem | old token hash | legacy | LEGACY | DELETE CANDIDATE after replacement | token hashing/idempotency | old dossier creation | app intake live |
| workers | mail/reminder/retention | service/scheduled | outbound/retention/legacy | background jobs | audit/logging partial | service-side | OPS, RET | LEGACY | REUSE LOGIC ONLY | retry/retention/reminder patterns | old export/payment statuses | app ops workers exist |
| `_shared/analysis*`, `pdf_text.ts`, `image_text.ts` | parser/analysis helpers | legacy callers | analysis tables/storage | observed/inconclusive checks | analysis run tracking | internal only | AUD, MID, CHG | LEGACY | REUSE LOGIC ONLY | extraction, inconclusive degradation | no final evidence approval | app review pipeline exists |

Edge Function verdict: MAJOR REDESIGN REQUIRED.

## Part 5 - Critical Gap Map

| gap_group | requirements | current_coverage | risk | blocker | impact |
|---|---|---|---|---|---|
| organization/REV | ORG, BOOK-004, BOOK-006 | mostly absent | operating without account/role proof | REV access unknown | operations/legal |
| mandate | MAND | legal acceptance partial only | invalid inboeking | mandate wording/signing | frontend/backend/database/legal |
| identity/representation | MAND-003, SEC | identity partial; representation absent | unauthorized mandate | legal authority model | frontend/backend/legal |
| EAN/aangeslotene | EAN | address partial only | invalid customer electricity | CAR/EAN source | frontend/backend/database/ops |
| location | EAN/CHG | location row partial | weak proof | connection linkage | database/ops/verifier |
| charger/charge point | CHG/MID | charger snapshot partial | wrong asset | history/evidence model | frontend/database/ops |
| MID | MID | number and slots partial | invalid measurement | conformity evidence | frontend/backend/database/verifier |
| kWh/raw data | KWH | absent | unverifiable volume | provider/source contracts | backend/database/ops |
| eligibility | ELIG | copy/status partial | non-eligible booking | TKV/source decisions | frontend/ops/legal |
| batching/inboeking | BOOK | absent | cannot book/reproduce | REV details | backend/database/ops |
| verification | VER | absent; TKV requirements mapped | cannot verify or receive authoritative result | verifier workflow, evidence pack, risk/plan/visit/sample/finding/statement modules absent | ops/legal/verifier |
| AO/IB/audit | AUD | audit primitives partial | weak audit | AO/IB design | operations/backend |
| corrections | COR | document-only partial | lost correction trail | REV correction rules | backend/database/ops |
| retention | RET | document/marker partial | proof/privacy failure | retention policy | database/legal/ops |
| finance/settlement | FIN | public copy partial; ledger absent | wrong payout/clawback | commercial/legal model | frontend/database/finance |
| security | SEC | customer/service-role partial | excessive privilege | role model | backend/database/ops |
| operations/year-end | OPS | absent | missed deadlines | 1 Apr/1 May conflict | operations/legal/verifier |

## Part 6 - TKV Impact Delta

This is a documentary disposition reassessment only. `Code impact after GO` and `database impact after GO` describe future work that remains prohibited until a separately approved implementation batch.

| object | previous disposition | TKV clause | new disposition | reason | code impact after GO | database impact after GO | test impact | external dependency |
|---|---|---|---|---|---|---|---|---|
| `app_customer_dossiers` / future `app_cases` | PROVISIONALLY REUSABLE container | 3.1.2-3.1.6; 3.3.1-3.3.4 | KEEP AS CASE SHELL; DO NOT STORE VERIFIER JUDGMENT | Case can scope evidence and workflow but cannot collapse risk, plan, sample, finding or statement truth. | Add links/projections only. | New verification-domain tables; no all-purpose dossier columns. | Case-to-verification isolation and projection tests. | verifier workflow |
| `app_dossier_locations` / `app_locations` | PROVISIONALLY REUSABLE facts | 3.1.3-3.1.5 | EXTEND WITH HISTORY/CHANGE INPUT; SEPARATE VISIT RECORD | Newness, substantial change, bookkeeping/on-site-generation context and visit evidence are distinct. | Change-detection and visit-status support after GO. | Historized location facts plus separate visits. | new/substantial-change/on-site-generation scenarios | verifier visit selection and physical access |
| `app_dossier_chargers` / charge-point target | PROVISIONALLY REUSABLE snapshot | 3.1.4-3.1.5 | KEEP FACTS; SPLIT CHARGER, CHARGE POINT, METER AND EVIDENCE | TKV requires concrete meter/construct and quantity evidence, not one charger snapshot. | Separate UI/API projections after GO. | Preserve target split; link visit/sample evidence. | asset-meter-location-period linkage | meter/conformity evidence |
| document files/versions | EXTEND transport/version primitives | 3.0.4-3.0.5; 3.1.2; 3.2.2 | KEEP AND EXTEND; NEVER EQUATE UPLOAD WITH VERIFICATION EVIDENCE SUFFICIENCY | Bytes/versions support evidence but verifier decides relevance and sufficiency. | Build scoped pack/export after GO. | Add pack/index links and verification retention metadata. | immutable version, pack reconstruction, access tests | verifier evidence requests/workpapers |
| legal acceptances versus mandates | PROVISIONALLY REUSABLE pattern | 3.1.5 pages 7-8 | LEGAL ACCEPTANCE NOT REUSABLE AS COMPLETE MANDATE; FULL MANDATE VERSION REQUIRED | TKV lists signatures, identity fields, EAN, two permissions, issue date and calendar-year validity. | Dedicated mandate signing/validation flow after GO. | `app_mandates` and immutable versions with exact clauses. | enterprise/natural-person field and validity cases | legal wording, e-sign evidence, DSO/verifier acceptance |
| audit events | EXTEND taxonomy | 3.0.4; 3.2.1-3.2.3; 3.3.2-3.3.6 | KEEP PRIMITIVE; EXTEND EXTERNAL-PROVENANCE TAXONOMY | Current audit can support chronology but lacks verifier plan/risk/sample/result/fraud events. | Emit minimized domain events after GO. | Link immutable external refs without copying unrestricted workpapers. | reconstruction, actor, redaction and ordering tests | verifier exchange/access rules |
| idempotency | EXTEND scopes | all exchange clauses | KEEP TECHNICAL CONTROL; NO REGULATORY DECISION AUTHORITY | Safe retries help exchanges but cannot decide materiality/sample/result. | Add request/response scopes after GO. | Extend technical keys only. | replay/conflict and no-judgment tests | external endpoint contracts |
| connection/EAN foundations | PROVISIONALLY REUSABLE; local proof only | 3.1.4-3.1.5 | KEEP FOUNDATION; EXTEND EVIDENCE/CONSTRUCT/DSO LINKS | Syntax/local history does not prove aangeslotene, allowed construct or verifier outcome. | Add review/projection/integration after GO. | Link DSO evidence, construct decisions, visits and samples. | construct, ownership, period, DSO and visit linkage | DSO/CAR access and verifier review |
| evidence acceptance | NEW target decision | 3.0.2-3.0.4; 3.1.5; 3.3.2-3.3.4 | KEEP ENVAL EVIDENCE DECISION SEPARATE FROM VERIFIER SUFFICIENCY/JUDGMENT | Internal acceptance cannot impersonate reasonable assurance or statement outcome. | Separate labels and APIs after GO. | Distinct internal decision and external verifier result refs. | no-self-verification and projection wording tests | verifier judgment |
| retention | TARGET policy/actions | 3.0.5 | EXTEND WITH VERIFICATION-SPECIFIC MINIMUM; KEEP CATEGORY-SPECIFIC SCHEDULE | Five years applies to verification data/documentation after verification year-end, not automatically every customer category. | Policy/hold/export UI after GO. | category, purpose, legal basis, period anchor and copy inventory. | year-end calculation, hold, export, minimization boundaries | legal/privacy analysis and verifier copy requirements |
| verifier/CAPA target modules | DEFER — TKV BLOCKED | 3.0.1-3.3.6 | FULL REBUILD — REQUIREMENTS MAPPED, IMPLEMENTATION NOT APPROVED | Source blocker is closed; detailed external-verifier boundaries and data gaps are now known. | New engagement/scope/risk/plan/visit/sample/pack/finding/CAPA/result workflows after GO. | Add dedicated target tables; preserve external provenance/history. | end-to-end negative/actor/boundary/reconstruction tests | verifier, RvA, NEa, minister, REV |
| customer-safe dashboard | PARTIAL PROVEN projection | 3.1.6; 3.3.1-3.3.6 | KEEP PROJECTION PATTERN; SHOW ONLY SAFE REQUEST/STATUS/OUTCOME | Risk reasoning, samples, fraud suspicion and raw workpapers must not be exposed. | Add safe status/request/correction views after GO. | Projection/read model only. | redaction and role tests | verifier disclosure rules/legal review |
| legacy parser/OCR logic | REUSE LOGIC ONLY | 3.0.4; 3.1.5; 3.2.2 | REUSE EXTRACTION ONLY; NEVER EVIDENCE ACCEPTANCE OR PROFESSIONAL JUDGMENT | Extraction can produce observations but not materiality, sample or assurance decisions. | Adapter behind observation boundary after GO. | Immutable observations linked to evidence versions. | inconclusive/degraded/no-auto-accept tests | evidence format/provider quality |
| current CSS/components | CURRENT/PARTIAL UI implementation | all clauses | NO TKV-SPECIFIC REUSE DECISION; NO CSS CHANGE | TKV establishes workflow/data/professional boundaries, not visual styling requirements. | Future approved UI may reuse generic form/status components only after data contracts exist. | none in this batch | future accessibility, redaction and state-label tests | approved UX and workflow contracts |
| new verification scope/risk/plan/visit/sample/pack/statement/fraud records | absent | 3.0.1-3.3.6 | NEW TARGET — IMPLEMENTATION NOT APPROVED | Existing objects cannot own the independent verifier lifecycle without conflating ENVAL and verifier authority. | New modular services/adapters after GO. | Eight focused target tables proposed in architecture appendix. | actor separation, immutability, external provenance and no-self-verification suite | verifier/RvA/NEa/minister/REV and legal access rules |

TKV impact delta count: `15` objects/object groups.

## Part 7 - Conflict Identification

Exact conflict: `REG-CONFLICT-001`.

- Source anchor: `SRC-NEA-ELEC` deadlines versus `SRC-NEA-VER` result registration, also connected to `SRC-WM-97` verification coupling.
- Requirement: `NEA-VER-002`; related: `NEA-OPS-001`.
- Document line/row: `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md` coverage rows for Wm verification coupling, NEa electricity deadlines, and NEa verifier result registration.
- Nature: electricity guidance mentions verification statement before 1 April; verifier guidance mentions REV verification result before 1 May. This may be a statement-versus-registration distinction, but it is unresolved.
- Impact: year-end runbook, verifier pack timing, REV submission, settlement timing, and architecture gates cannot rely on a single date.
- Correction made: `NEA-VER-002` now explicitly distinguishes statement timing, REV result registration, and the unresolved 1 April/1 May conflict.

## Part 8 - Verdict

| area | verdict | reason |
|---|---|---|
| frontend fit | PARTIAL FIT | Signup/dashboard/document surfaces are useful but do not capture EAN, CAR, mandate validity, kWh, eligibility review, verifier workflow, or corrections beyond documents. |
| database fit | MAJOR REDESIGN REQUIRED | Strong app primitives exist, but core NEa concepts are absent. Existing `app_*` must not be assumed final. |
| Edge Function fit | MAJOR REDESIGN REQUIRED | App functions prove transport/auth/document primitives, not inboekdienstverlener compliance. Legacy functions are reuse-only. |
| audit fit | PARTIAL FIT | App audit/idempotency/document immutability are valuable, but AO/IB, decision taxonomy, verifier/CAPA, kWh and REV audit are missing. |
| security fit | PARTIAL FIT | Deny-all RLS and service-role-only pattern are good; ops/admin/four-eyes/REV role model absent. |
| regulatory fit | PARTIAL — TKV MAPPED, IMPLEMENTATION ABSENT | Electricity TKV access and clause coverage pass; implementation, external verifier readiness, consolidated-law confirmation, deadline interpretation and retention legal analysis remain open. |

Overall verdict: MAJOR REDESIGN REQUIRED.

No target architecture is approved by this assessment.
