# ENVAL App TODO

Status: CURRENT app/MVP TODO — CUSTOMER04C documentation reconciled through
commit `d613592` on 2026-08-24. Earlier bounded work-package records retain
their own dated proof status.

This queue is primarily for the new `/app`, `api-app-*`, and `app_*`
implementation. Bounded legacy-caller cutover and white-label foundation status
are recorded only where they affect the current product/MVP boundary. Removed
legacy documentation and external historical copies do not drive new app
implementation.

## Single Current NEXT

- NEXT — `Minimal internal Compliance Worklist UI` using the existing
  authenticated `api-app-compliance-worklist` GET endpoint.
  - Priority: NEA.
  - Reason: REG01–REG03I now provide the source semantics, immutable facts,
    deterministic derivation, workforce authorization and authenticated
    read-only runtime needed to expose the first useful internal projection
    without inventing another compliance foundation.
  - Boundary: read-only internal workforce UI in the existing
    dashboard/backoffice shell, delivery year 2026 only; no capture form,
    scheduler, mail, notifications, acknowledgement or task persistence.

## Completed Regulatory Source Decision

- `REG-CONFLICT-001` — RESOLVED on 2026-08-16 as a documentation
  interpretation error, not one conflicting deadline:
  - prior-year inbooking is due by the current NEa-published last working day
    before 1 March; for delivery year 2026 this is 2027-02-26;
  - the inboeker must possess the electricity verification statement before
    1 April under current explanatory NEa guidance; NEa/REV year-end is 1 April;
  - Wm 9.7.4.12 requires the inboeker to submit the statement before 1 May and
    the verifier must register the result in REV before 1 May;
  - `voor 1 mei` and `30 april` are the same calendar deadline expression;
  - `NEA-VER-002`, `NEA-OPS-001` and traceability are reconciled; the bounded
    2026 local runtime foundation is now implemented through REG03I, while
    external verifier handoff, REV operations and the complete year-end
    runbook remain unimplemented.

## Current / Locally Proven

- CUSTOMER04C is `CURRENT PROVEN — LOCAL` at commit `d613592`; its recorded
  final pre-commit Integration gate was `127/127 PASS`.
- Signup and customer correction are lifecycle inputs into the same
  `CustomerDocumentWorkflowController` and `DocumentEvidenceWorkflow`.
  Upload-card composition, canonical rows/source projection, interaction
  state, confirm/edit/cancel and projected ENVAL state use shared authorities.
- Both lifecycles use the same `DocumentEvidenceUploadCard`,
  `DocumentFactMatrix`, canonical fact registry and
  `CustomerDocumentFactInteraction`. Correction locked/read-only facts are
  state on those shared rows, not a separate implementation.
- Signup's compact charger-delete action remains charger lifecycle behavior
  outside the PDF upload component.
- Parser output remains `OBSERVED_DERIVED`; customer confirmation is customer
  intent, not ENVAL/workforce acceptance. Correction rounds and provenance are
  immutable/versioned.
- The verification harness uses dependency-aware compiler ownership: app/React
  TypeScript graphs use app semantics, Deno-native graphs use Deno semantics,
  and deleted paths remain visible to repository diff checks without becoming
  compiler inputs.

- REG02–REG03I compliance runtime foundation is DONE / CURRENT PROVEN — LOCAL
  ONLY for the bounded implemented slices:
  - REG02: pure non-linear delivery-year state/event model, fail-closed replay
    and the authoritative 2026 calendar;
  - REG03B: pure derived action plan with a 14-calendar-day ENVAL
    `INTERNAL_DEFAULT`, not a regulatory deadline;
  - REG03D: pure worklist projection with active attention separate from the
    informational year-end milestone and no persisted task state;
  - REG03E: separate `compliance.delivery_year.view` authority with explicit
    `TENANT_WIDE` scope;
  - REG03G: immutable tenant-data-plane/delivery-year source-event ledger for
    the five accepted fact kinds, with fail-closed provenance and no mutable
    aggregate;
  - REG03H: authenticated server-authoritative evidence-backed capture using
    separate `compliance.delivery_year.record` authority;
  - REG03I: authenticated GET-only worklist read for trusted tenant, verified
    Auth, active workforce, view capability and `TENANT_WIDE`, with server-owned
    `asOf`, full REG02 → REG03B → REG03D derivation and zero writes.
- Persisted immutable source events are compliance source truth/provenance;
  REG02 state, REG03B actions and REG03D worklist items are reconstructed or
  derived. No recorded event means no accepted ENVAL source fact, not proof
  that the external event never occurred.
- Regulated actor, ENVAL recorder and workforce authorization remain distinct.
  Evidence-backed recording grants no verifier, NEa or representation
  authority.
- PARKED: post-2026 calendars, source-event correction/revocation, findings
  remediation/closure, acknowledgement/dismiss/snooze, persisted tasks,
  schedulers, mail/notifications, customer compliance UX, remote cutover/deploy
  and production proof.

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
- Shared frontend document-upload transport is locally proven.
- Document upload hash-once issue/upload/confirm flow is locally proven.
- Explicit upload-url and upload-confirm idempotency attempt keys are locally proven.
- Official signed upload through Supabase Storage is locally proven in the frontend proof.
- Reusable `DocumentUploadCard` is locally and browser-proven.
- MID PDF upload is locally and browser-proven.
- Installation/acquisition invoice PDF upload and replacement are locally and browser-proven.
- Current-document download is locally and browser-proven.
- Audit-preserving current-document withdrawal is locally and browser-proven.
- Document aggregate status semantics are locally and browser-proven.
- Browser-reachable local download origin correction is locally and browser-proven.
- Shared dashboard document card UI is locally and browser-proven.
- Pre-auth quarantine, `typed_name_otp_v1` finalization, immutable signing evidence, finalized mutation locks, safe receipt and server-authoritative recovery are CURRENT PROVEN locally within their explicit local/legal gates.
- Post-signing 09C1A/09C1B/09C1C through R6 are CURRENT PROVEN LOCAL for
  atomic case-owned promotion, internal private Storage/Edge orchestration,
  verified Auth/account handoff and customer-safe multi-case dashboard
  convergence. Remote deployment, production Auth/OTP/legal configuration and
  browser acceptance remain open. The former separate email-verification
  promotion trigger is `SUPERSEDED`.
- Gate 1 EAN and electricity connection domain objects are observed locally, not CURRENT PROVEN:
  - `app_connections`
  - `app_connection_periods`
  - `app_connection_ownership_periods`
  - the historical migration source is preserved under
    `supabase/migration-archive/replaced-connection/`; its material current
    catalog is represented by the committed baseline, while the historical
    proof marker `app-ean-connection-domain-foundation-proof-ok` is not current
    acceptance evidence.
- Gate 1 connection write RPC objects are observed locally, not CURRENT PROVEN:
  - `app_declare_connection_v1`
  - `app_declare_connection_ownership_v1`
  - `app_decide_connection_ownership_v1`
  - `app_supersede_connection_ownership_v1`
  - the historical migration source is preserved under
    `supabase/migration-archive/replaced-connection/`; its material current
    catalog is represented by the committed baseline, while the historical
    proof marker `app-connection-write-rpcs-proof-ok` is not current acceptance
    evidence.
- WP3A connection/EAN current-truth readiness audit is committed proof-only evidence in `f3b39aafb2e6817e64401ccb2c47eed285552869`:
  - `docs/app/operations/wp3a-connection-ean-current-truth-readiness-audit.md`;
  - verdict: `BLOCKED — CURRENT OBJECTS CONFLICT WITH CANON`;
  - at that historical checkpoint the local catalog had three empty tables,
    eight guards, one audit helper and four write RPCs while migration history
    had zero rows and no current runtime caller existed;
  - direct customer/dossier ownership, absent party/profile/case links, incomplete evidence/history/concurrency and status-based EAN uniqueness block target acceptance;
  - existing proof files cannot be reused unchanged;
  - no DDL or connection/EAN implementation is authorized.
- WP3B connection/EAN contract reconciliation and object disposition is committed in `ee3f6b59c937f0c39a67ba09936e9ef688bcea59`:
  - `docs/app/contracts/connection-ean-and-aangeslotene.md`;
  - `docs/app/operations/wp3b-connection-ean-object-disposition.md`;
  - its historical draft verdict was `PARTIAL — DOMAIN OR EXTERNAL DECISIONS REQUIRED`;
  - it proposed separate physical connection, EAN-dragend allocation point, immutable metadata, party/profile-pinned aangesloteneclaims, case links, evidence acceptance and calendar-year controls;
  - three current tables, eight guards, one audithelper, four RPCs and nine triggers are dispositioned `REPLACE`; both proofs are `PROVE AGAIN`; both ignored migrations are `RETIRE AFTER REPLACEMENT PROOF`;
  - DDL remained blocked pending Daan's explicit internal decisions and the applicable location, DSO/CAR/register, MLOEA/secondary, evidence/freshness, verifier and calendar-year duplicate-control answers;
  - the old proofs were not rerun and no current object or source was modified or removed;
  - authority legal/verifier validation continues independently and representation authority remains `NOT SCHEMA READY`.
- WP3C connection/EAN internal domain decisions are committed in `da961fa84da73ecc320b55b2cb83881a12d658f3`:
  - `docs/app/operations/wp3c-connection-ean-internal-domain-decisions.md`;
  - Daan explicitly approved internal packages A–E as TARGET: connection/allocation/EAN separation, accepted-EAN immutability and observations; stable location root/versions; party/profile-pinned claim semantics; administrative case/evidence/year-control boundaries; immutable security, concurrency and forward-replacement discipline;
  - contract status is exactly `TARGET — WP3C INTERNAL DOMAIN DECISIONS APPROVED — EXTERNAL BLOCKERS OPEN / NOT DDL READY`;
  - this approves no candidate schema, DDL, implementation, proof, retirement, cleanup or execution;
  - existing connection tables, functions, triggers, policies, grants, migrations and proofs remain intact; old migrations are conflicting source material and old proofs remain `PROVE AGAIN`;
  - historical successor at that checkpoint was locationfoundation readiness;
  - only after separate location approval and proof: limited connection-root/claim DDL-readiness assessment, still without automatic implementation authority;
  - external blockers remain CAR/DSO/register semantics, evidence categories/acceptance/freshness/conflicts, secondary/MLOEA, year duplicate/fallback, verifier acceptance, representation authority and mandate validation;
  - representation authority continues independently and remains `NOT SCHEMA READY`.
- WP3D location current-truth audit and bounded draft contract are committed in HEAD `88e8c0b754c7d44e769f89037676d9732e6fe63c`:
  - `docs/app/operations/wp3d-location-current-truth-readiness-audit.md`;
  - exact audit status is `PROOF ONLY — WP3D LOCATION CURRENT-TRUTH READINESS AUDIT`;
  - audit verdict is `BLOCKED — CURRENT LOCATION OBJECTS CONFLICT WITH TARGET`;
  - `docs/app/contracts/location-foundation.md`;
  - exact contract status is `DRAFT — WP3D LOCATION FOUNDATION — NOT APPROVED / NOT DDL READY`;
  - read-only local catalog evidence records 44 mutable dossier-bound location rows, 68/68 linked chargers, 73/429 location-linked document slots, zero connection rows, RLS deny-all and `service_role` CRUD;
  - signup writes and dashboard reads the current object; Auth/bootstrap does not establish location truth; browser PDOK lookup is an external observation;
  - the current table, update trigger, mutable grants and old connection dependencies are `REPLACE`; relevant proofs are `PROVE AGAIN`; current data is `BLOCKED` pending mapping/retention/cutover decisions;
  - candidate responsibilities are names only: stable root, immutable versions, address observations, case links, allocation-point links and future charge-point links;
  - DDL is blocked on Daan's exact root/version/correction/link/supersession/concurrency/grant/migration decisions and written PDOK/BAG, verifier, DSO/CAR, secondary/MLOEA, evidence, retention and privacy answers;
  - connection remains location-dependent; no migration, proof, SQL, database write, runtime, frontend, CSS, remote action or retirement occurred.
- WP3E location internal domain decisions 1–16 are APPROVED TARGET — DOCS ONLY:
  - `docs/app/operations/wp3e-location-internal-domain-decisions.md`;
  - decision status is exactly `DECISION RECORD — WP3E INTERNAL LOCATION DOMAIN PACKAGE APPROVED — NO DDL AUTHORIZATION`;
  - location contract status is exactly `TARGET — WP3E INTERNAL LOCATION DOMAIN DECISIONS APPROVED — EXTERNAL BLOCKERS OPEN / NOT DDL READY`;
  - Daan approved `WP3E-LOC-01` through `WP3E-LOC-16`: opaque statusless root; immutable accepted versions; non-accepting observations; same-site correction versus relocation; explicit split/merge history; separate temporal links; linear supersession; no-inference security and additive forward-only replacement;
  - `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE` records that roots, immutable versions, RLS and grants are internal ENVAL controls supporting reconstruction, not literal NEa database requirements or verifier acceptance;
  - OPEN remain PDOK/BAG source/freshness, reliable physical-site matching, verifier location-evidence acceptance, DSO/CAR, primary/secondary/MLOEA, visit procedure/evidence, evidence categories/acceptance, privacy/minimization, retention beyond the explicit TKV minimum, 44-row mapping and remote catalog/caller truth;
  - implementation is `NOT IMPLEMENTED`, proof `NOT PROVEN`, and DDL, data migration and retirement are `NOT AUTHORIZED`;
  - historical successor at that checkpoint was attributable blocker resolution, an exact separately approved replacement contract and later bounded proof; connection DDL remained dependent on a proven locationfoundation;
  - no migration, proof, proof execution, SQL, database write, runtime, Edge Function, frontend, CSS, inline CSS, remote action, staging, commit, push, deploy or retirement occurred.
- WP3F location DDL-readiness and 44-row classification audit is proof-only and committed in `c5a46faa26d94ad22adbd2b3748f411e1b37e51e`:
  - `docs/app/operations/wp3f-location-ddl-readiness-audit.md`;
  - exact audit status is `PROOF ONLY — WP3F LOCATION DDL-READINESS AND 44-ROW CLASSIFICATION AUDIT`;
  - `docs/app/operations/wp3f-location-44-row-classification.md`;
  - exact classification status is `PROOF ONLY — PRIVACY-SAFE LOCAL LOCATION ROW CLASSIFICATION`;
  - explicit read-only local SQL assigned ephemeral `LOC-001` through `LOC-044` aliases by `ORDER BY created_at, id`; no raw ID, address, provider ID, other PII or alias mapping was printed or retained;
  - all 44 rows are `POSSIBLE_DUPLICATE`; 7 have `CONFLICTING` and 37 `DECLARED_ONLY` evidence; manual review is `YES` and automatic promotion is `NO` for all 44;
  - all ten candidate DDL responsibilities are blocked; exact physical columns/types/defaults, accepted-version representation, observation privacy/retention/provenance, deterministic lock and transaction-end enforcement, policies/grants/RPCs and future proof matrix remain undecided;
  - verdict is `BLOCKED — LOCATION DDL DESIGN NOT SAFE`;
  - this remains the historical proof that DDL was unsafe before the WP3F-B physical decisions;
  - connection DDL remains dependent on a proven locationfoundation; no migration, proof script, database write, runtime, frontend, CSS, remote action, staging, commit, push, deploy or retirement occurred.
- WP3F-B bounded location DDL decisions 1–18 are APPROVED TARGET — DOCS ONLY:
  - `docs/app/operations/wp3fb-location-bounded-ddl-decisions.md`;
  - decision status is exactly `DECISION RECORD — WP3F-B BOUNDED LOCATION DDL PACKAGE APPROVED — NO IMPLEMENTATION AUTHORIZATION`;
  - location contract status is exactly `TARGET — WP3F-B BOUNDED LOCATION DDL DECISIONS APPROVED — DATA MIGRATION AND CALLER CUTOVER BLOCKED / NOT IMPLEMENTED`;
  - bounded foundation is exactly `app_locations`, `app_location_address_observations`, and `app_location_versions`;
  - root is opaque, server-assigned, statusless and immutable; observations are immutable and never accepted truth; versions are immutable, accepted-only and use separate `timestamptz` business validity and `recorded_at`;
  - approved invariants include half-open periods, at most one operational non-superseded version per root/time, same-root correction supersession, one successor, no cycles, later recorded time and mandatory correction reason;
  - allowed future enforcement is CHECKs, composite FKs, partial unique indexes, immutable guards and deferrable transaction-end constraint triggers; future writes require one server transaction, deterministic per-location advisory locking, deferred validation, idempotency, audit and real concurrency proof;
  - all three tables are RLS enabled and deny-all, with no `PUBLIC`/`anon`/`authenticated` privileges and `service_role` only `SELECT`/`INSERT`; no UPDATE or DELETE;
  - `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`;
  - implementation is `NOT IMPLEMENTED`, proof `NOT PROVEN`, migration/data population/retirement `NOT AUTHORIZED`, caller cutover `BLOCKED`, and external blockers `OPEN`;
  - the first future migration must be empty and additive but is not authorized; none of the 44 current rows may be copied, accepted or changed;
  - OPEN remain 44-row mapping, physical-site matching, PDOK/BAG, verifier acceptance, relation links, split/merge, customer-safe projection, write-RPC, caller cutover, current-table retirement, privacy and final retention;
  - historical successor at that checkpoint was separate explicit migration/proof authorization; no migration, SQL or proof followed automatically.
- WP3G bounded location foundation implementation-readiness and proof contract are PROOF ONLY / DOCS ONLY:
  - WP3F-B is committed in HEAD `e6aac0119c5e545673a07c6a985e1921a663ba49`;
  - readiness status is exactly `PROOF ONLY — WP3G BOUNDED LOCATION FOUNDATION IMPLEMENTATION READINESS`;
  - readiness verdict is exactly `BLOCKED — BOUNDED LOCATION FOUNDATION IMPLEMENTATION NOT SAFE`;
  - proof-contract status is exactly `TARGET — WP3G BOUNDED LOCATION FOUNDATION PROOF CONTRACT — NOT IMPLEMENTED`;
  - all 22 migrations, 25 proof sources, six baseline/rollback proposals, reusable database patterns, callers, frontend modules and CSS layers were inspected read-only;
  - local catalog inspection found all three TARGET names free, zero TARGET FK dependencies, visible `gen_random_uuid()`, `pgcrypto 1.3`, 24 RLS-enabled `app_*` tables with 24 `deny_all` policies, and zero local migration-history rows;
  - WP3F-B translates exactly for table responsibilities, root fields, vocabularies, temporal/supersession invariants and security grants, but not for exact observation actor/request fields, source-hash shape, freshness, normalized descriptors, accepted-input cardinality, acceptance provenance or timestamp defaults;
  - the recommended future paths are `supabase/migrations/20260728100000_app_location_foundation.sql` and `scripts/proofs/app-location-foundation.proof.ts`; neither file exists or is authorized;
  - proof contract Q01-Q42 covers exact catalog/additivity/emptiness, immutable root/observation/version behavior, vocabularies/descriptors/hashes, sequential temporal/supersession checks, RLS/grants, isolation, rollback and protected counts/hashes;
  - operationele advisory-lock and true two-transaction concurrency proof are explicitly deferred to a separately approved write-RPC;
  - operationele write-RPC, 44-row mapping/population, physical-site matching, PDOK/BAG, verifier acceptance, relation tables, customer-safe projection, caller cutover, retirement, privacy and final retention remain BLOCKED;
  - historical successor at that checkpoint was approval of the exact physical observation/descriptor/acceptance catalog and then separate migration/proof authorization;
  - no migration, proof, SQL, database write, runtime, Edge Function, frontend, CSS, staging, commit, push, deploy or remote action occurred.
- WP3G-B exact physical location schema decisions package 1–8 is APPROVED TARGET — DOCS ONLY:
  - WP3G is committed in HEAD `c021d57aacc5d8beb4aa2043bc963839fa38da07`; its readiness verdict and proof contract remain unchanged historical evidence;
  - `docs/app/operations/wp3gb-location-physical-schema-decisions.md`;
  - decision status is exactly `DECISION RECORD — WP3G-B EXACT PHYSICAL LOCATION SCHEMA PACKAGE APPROVED — NO IMPLEMENTATION AUTHORIZATION`;
  - location contract status is exactly `TARGET — WP3G-B EXACT PHYSICAL LOCATION SCHEMA APPROVED — MIGRATION AND PROOF NOT AUTHORIZED / DATA MIGRATION AND CALLER CUTOVER BLOCKED`;
  - Daan approved package 1–8: the exact observation columns and provenance; null-or-64-lowercase-hex source hashes and kind-specific retrieval/freshness rules; normalized exclusive postal/site descriptors; exactly one unique same-root primary observation per version; exact unique opaque acceptance provenance; `clock_timestamp()` only for root creation and immutable recording time; same-root composite accepted-observation and supersession FKs; and the docs-only authorization boundary;
  - the six physical-catalog gaps identified by WP3G are closed as APPROVED TARGET, not as implementation or proof evidence;
  - `TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE`;
  - implementation is `NOT IMPLEMENTED`, proof is `NOT PROVEN`, migration and database writes are `NOT AUTHORIZED`, operational write-RPC/data population/caller cutover are `BLOCKED`, retirement is `NOT AUTHORIZED`, and external blockers are `OPEN`;
  - operationele write-RPC, advisory-lock concurrency, true two-transaction concurrency proof, 44-row mapping/population, physical-site matching, PDOK/BAG source, verifier acceptance, case/allocation-point/charge-point links, split/merge, customer-safe projection, caller cutover, current-table retirement, privacy and final retention remain blocked/open;
  - historical successor at that checkpoint was bounded docs-only implementation-readiness reconciliation and then separate migration/proof authorization;
  - no migration, proof, SQL, database write, runtime, Edge Function, frontend, CSS, package/config, staging, commit, push, deploy or remote action occurred.
- WP3G-C bounded location foundation readiness reconciliation is PROOF ONLY / DOCS ONLY:
  - WP3G-B is committed in HEAD `98f7aa5007a458115afab1f2c3b2333862411250`;
  - `docs/app/operations/wp3gc-location-foundation-readiness-reconciliation.md`;
  - exact document status is `PROOF ONLY — WP3G-C LOCATION FOUNDATION READINESS RECONCILIATION`;
  - exact verdict is `READY — EMPTY BOUNDED LOCATION FOUNDATION IMPLEMENTATION MAY START`;
  - all 8 physical blocker groups are CLOSED; all 42 existing WP3G foundation cases are directly implementation-ready, 0 are deferred within Q01-Q42 and 0 require a new decision;
  - future free paths remain `supabase/migrations/20260728100000_app_location_foundation.sql` and `scripts/proofs/app-location-foundation.proof.ts`;
  - READY is not implementation authorization: implementation is not performed and migration/proof/database writes remain unauthorized;
  - operationele write-RPC, advisory-lock/two-transaction concurrency proof, data population, relation tables, customer-safe projection, caller cutover and current-table retirement remain blocked;
  - PDOK/BAG, physical-site matching, verifier acceptance, privacy/retention above the recorded minimum, 44-row mapping and caller cutover do not block the empty foundation but remain open for later batches;
  - no migration, proof, SQL, database write, runtime, Edge Function, frontend, CSS, package/config, staging, commit, push, deploy or remote action occurred.
- WP3H empty bounded location foundation is CURRENT PROVEN — LOCAL ONLY:
  - implementation commit is `3bb8d50cd7723ad631d75857df4e08d6ef0db311`, parent `98df5993088a098c01d2dafab3f8a9c358f9374d`, subject `Add WP3H location foundation`;
  - migration is `supabase/migrations/20260728100000_app_location_foundation.sql`, SHA-256 `c10c3492eda04b2c342200879be7e3b3e98f098269b19b3190d71f61c24c5aa5`;
  - proof is `scripts/proofs/app-location-foundation.proof.ts`, SHA-256 `2570ab01627ff32fed30fe589adf7d6d88af8087a4107307366ba08f5913f1d6`;
  - exactly three empty additive tables with 44 columns are locally proven;
  - WP3G-Q01 through WP3G-Q42 are green with marker `app-location-foundation-proof-ok`;
  - RLS is enabled on all three tables, exactly three `deny_all` policies exist, browser roles have no grants, and `service_role` has only `SELECT` and `INSERT`;
  - all fixture groups rolled back, all TARGET tables ended empty, protected counts/hashes were equal before and after, and `app_dossier_locations` remained at 44 rows;
  - the migration was applied directly locally; no migration-history record, remote apply, push or deploy exists;
  - docs proof registration is in `docs/app/operations/wp3h-location-foundation-local-proof.md`;
  - historical successor at that checkpoint was the separately authorized WP3J operational write-RPC/idempotency/advisory-lock/concurrency batch;
  - BLOCKED separately: 44-row mapping/population, physical-site matching, PDOK/BAG, verifier acceptance, relations, customer-safe projection, caller cutover and current-table retirement;
  - no EAN, connection, aangeslotene, charge-point, case/allocation-point relationship, remote, production or regulatory claim follows from WP3H.
- WP3I operational location-write readiness is DRAFT / DECISION REQUIRED:
  - `docs/app/operations/wp3i-location-operational-write-readiness.md`;
  - exact verdict is `READY FOR DECISION — OPERATIONAL WRITE PACKAGE CAN BE APPROVED`;
  - the four bounded operations are root creation, observation recording, initial-version acceptance and same-root correction by immutable successor;
  - twelve explicit choices cover RPC shape, server provenance, shared idempotency, canonical hashing/replay, fail-closed audit, root locking, observation/acceptance separation, decision references, immutable correction, safe errors, service-role security and true concurrency proof;
  - every recommended choice remains `NOT APPROVED`; READY FOR DECISION is not implementation authorization;
  - proposed free paths are `supabase/migrations/20260728140000_app_location_write_rpcs.sql` and `scripts/proofs/app-location-write-rpcs.proof.ts`; neither exists;
  - historical successor at that checkpoint was Daan's decision on the complete twelve-choice package, including idempotency expiry/cleanup and the server-role boundary;
  - operational writes remain `NOT IMPLEMENTED`; population, links, projection, caller cutover, retirement, remote and production remain blocked;
  - WP3H remains `CURRENT PROVEN — LOCAL ONLY`; no migration, proof, SQL write, database change, runtime, frontend, CSS, staging, commit, push, deploy or remote action occurred.
- WP3J operational location write RPCs are CURRENT PROVEN — LOCAL ONLY:
  - implementation commit is `45d926478945fedc610ea02a0ff2b0d4f5f14be4`, parent `685e85ff537c7055c9885992e098b88c8fd73025`, subject `Add WP3J operational location write RPCs`;
  - migration is `supabase/migrations/20260728140000_app_location_write_rpcs.sql`, SHA-256 `171490e672a500d303ca097b8aececda8da7f98ae2411cc5e13cd1cb43a48593`;
  - proof is `scripts/proofs/app-location-write-rpcs.proof.ts`, SHA-256 `9330b086e82cff5ce40fcfa25ab0650023c1e3a92174a613a06035f8ee9d626d`;
  - exact public RPCs are `app_create_location_root_v1`, `app_record_location_observation_v1`, `app_accept_initial_location_version_v1` and `app_correct_location_version_v1`;
  - exact helpers are `app_location_write_idempotency_begin_v1`, `app_location_write_lock_v1` and `app_location_write_complete_v1`;
  - public RPCs are service-role-only `SECURITY DEFINER` functions with empty search path; helpers have no direct service-role execute;
  - `app_idempotency_keys` and fail-closed `app_audit_events` are reused; no new table, foundation mutation, TTL or cleanup rule was added;
  - the definitive migration fresh-applies with exitcode `0` after exact removal of the seven functions in a disposable WP3H-compatible schema; seven resulting body hashes equal the migration bodies;
  - `WP3J-Q01` through `WP3J-Q42` are green with marker `app-location-write-rpcs-proof-ok`; Q35-Q41 use genuine separate processes/connections;
  - real local counts remain `app_locations=0`, `app_location_address_observations=0`, `app_location_versions=0`, `app_dossier_locations=44`, `app_audit_events=753`, and `app_idempotency_keys=306`; disposable database count ends at 0;
  - the local direct apply is absent from remote migration history; no remote apply, push or deploy occurred;
  - docs proof registration is `docs/app/operations/wp3j-location-write-rpcs-local-proof.md`;
  - historical successor at that checkpoint was `WP3K — authorized operational location caller boundary`;
  - WP3K must decide human/operations roles, trusted server-derived `actor_ref`, required case/dossier/party/authority context, four-eyes decisions, caller-to-RPC mapping, safe error mapping and audit correlation;
  - Edge Function/runtimecaller, browser-direct calls, population, 44-row mapping, relation links, projection, cutover, retirement, remote and production remain blocked or unproven.
- WP3K authorized operational location caller boundary readiness is committed; D01-D12 are APPROVED TARGET:
  - readiness evidence is `docs/app/operations/wp3k-location-caller-boundary-readiness.md`;
  - the WP3K checkpoint result was partial because no proven workforce identity/role model, role assignment authority, reviewer qualification, case-to-location authorization relation or authorized caller existed; WP3L-B later closes only the bounded local foundation dependency;
  - customer Auth, customer identity, dossier ownership, case roles and representation authority cannot be reused as internal location-review authority;
  - representation authority remains `NOT SCHEMA READY`; the existing simple pilot perimeter and manual-escalation exclusions remain unchanged;
  - Daan approves the twelve TARGET decisions covering specific callers, principal, workforce foundation, capabilities, object scope, representation separation, ingestion, maker/checker, actor provenance, audit/idempotency correlation, safe errors and proof;
  - at this historical checkpoint the approved TARGET caller shape used the
    `api-app-ops-location-*` family while the focused
    `_shared/app_workforce_authorization.ts` helper and
    `scripts/proofs/api-app-ops-location-callers.proof.ts` were not yet
    implemented; WP3N and commit `25b033f` later implement/prove the shared
    caller foundation and authoritative tenant-gate propagation;
  - root creation and observation registration remain non-accepting; initial acceptance and correction require four-eyes;
  - no emergency override is approved;
  - WP3L-B later implements/proves the bounded empty foundation; WP3N later
    implements the four caller families and bridge locally;
  - operations UI, population, remote apply, production, cutover and retirement
    remain unimplemented or unauthorized.
- WP3L-B workforce authorization foundation is CURRENT PROVEN — LOCAL ONLY:
  - WP3L-D01 through WP3L-D18 are APPROVED TARGET;
  - implementation commit is `6485dad9a1cc481efc3f17095f90df72a219b315`, parent `1baaef4174df7a002c8a3bebd1b526d68c7f1d1c`, subject `Add WP3L workforce authorization foundation`;
  - migration SHA-256 is `e29f0576be4b13cb4250f9e0e931b895e1fa02723b8d8cdac2cffa96006319ac`;
  - proof SHA-256 is `f451ab67902ebe1a2612ebc4ab23e4a8777fed95b376fa4936942e1e46d55acb`;
  - the WP3L-B checkpoint created seven initially empty tables for workforce
    roots, lifecycle events, capability events, case/location relation events,
    workforce scope events, maker requests and checker reviews;
  - exact codes are `location.root.create`, `location.observation.record`, `location.version.accept.prepare`, `location.version.accept.approve`, `location.version.correct.prepare` and `location.version.correct.approve`;
  - `WP3L-B-Q01` through `WP3L-B-Q48` pass with marker `app-workforce-location-authorization-foundation-proof-ok`;
  - definitive fresh apply exits `0`; true two-process review and execution races each leave at most one result;
  - a real `SET LOCAL ROLE service_role` trigger route is green and rolled back;
  - at that checkpoint all seven real local tables were empty; protected
    counts/WP3J fingerprints were unchanged and no disposable database remained;
  - operation-request eligibility is locally proven, without calling WP3J;
  - bootstrap/population, authorized callers and the execution bridge were not
    implemented at that checkpoint; WP3N and WP3P/WP3Q supersede those status
    lines below;
  - REMOTE APPLY / CUTOVER: OPEN/BLOCKED;
  - historical successor at that checkpoint was `WP3M — authorized operational location callers and WP3J execution bridge readiness`;
  - WP3M is readiness/decision work only and grants no implementation authorization.
- WP3M authorized caller and execution-bridge readiness is a completed
  historical decision input:
  - evidence is `docs/app/operations/wp3m-location-callers-execution-bridge-readiness.md`;
  - exact verdict is `READY FOR DECISION — CALLER AND EXECUTION BRIDGE PACKAGE CAN BE APPROVED`;
  - all eighteen WP3M recommendations were later approved as TARGET and
    implemented/proven by WP3N;
  - recommendation is exactly four operation-family Edge callers with closed actions above eight purpose-specific service-role-only bridge RPCs;
  - hard requirement is one database transaction for workforce resolution/revalidation, request/review locks, exact WP3J call, WP3L execution marking, idempotency completion and correlated audit;
  - at that readiness checkpoint the proposed sources did not yet exist;
    WP3N is the controlling current caller/bridge status below;
  - operations UI, remote apply and cutover remain open/blocked.
- WP3N authorized operation callers and atomic WP3J execution bridge are
  CURRENT PROVEN — LOCAL ONLY:
  - WP3M-D01 through WP3M-D18 are APPROVED TARGET;
  - implementation commit is `6705fa3baf046510d70b8502da6058009b30b2f3`;
  - exactly four operation-family Edge callers, one shared transport adapter,
    eight purpose-specific bridge RPCs and one private authorization resolver
    are implemented locally;
  - closed action maps prevent browser-selected RPC names and the adapter owns
    no authorization truth;
  - root/relation is atomic, observation is non-accepting, prepare/review call
    no WP3J, and execute is original-maker-only after distinct-checker review
    and execution-time revalidation;
  - `WP3N-Q01` through `WP3N-Q64` pass with marker
    `api-app-ops-location-callers-proof-ok`;
  - fresh apply exactly once, function-body equality, real review race, real
    execution race, real revocation-versus-execution race, protected equality
    and complete disposable cleanup are proven;
  - the later WP3P/WP3Q activation leaves this caller/bridge proof intact and
    adds one approved local admin plus central policy/assignment authority;
  - OPERATIONS UI: NOT IMPLEMENTED;
  - REMOTE APPLY / CUTOVER: OPEN/BLOCKED;
  - browser self-enrollment remains forbidden and no remote execution follows
    without separate approval.
- WP3O/WP3P/WP3Q workforce policy and activation sequence is reconciled:
  - WP3O decision audit is DONE and supplied the approved bounded policy and
    bootstrap decisions;
  - WP3P is CURRENT PROVEN — LOCAL ONLY through commit `4a5d219`: the fixed
    nine-capability catalogue, `member < reviewer < admin` seniority, central
    database-authoritative evaluator, admin-only workforce/policy/assignment
    authority, immutable versioned organization policy and non-bypassable
    software/security floors are active;
  - default policy requires distinct maker/checker actors as an ENVAL
    security/process rule. No general Wet/NEa seniority or two-eyes requirement
    is claimed. A proven solo-policy variant may relax that organization rule
    while capability, membership, seniority, scope, environment and Auth floors
    remain fail-closed;
  - WP3Q local activation and first-admin bootstrap are DONE — LOCAL: one
    explicitly approved verified local Auth principal is the sole active
    workforce member and admin; retry is idempotent, genesis is closed and a
    second/different principal is denied;
  - customer access, case participation, representation authority and
    signing/legal authority remain separate;
  - PARKED: workforce/policy management UI, additional population, recovery
    ceremony, production activation, remote apply/deploy and speculative
    capabilities.
- MIG01/MIG02 tenant migration-chain sequence is reconciled:
  - MIG01 audit is DONE;
  - MIG02A is DONE in commit `95ac548`: the executable root is baseline
    `20260816150000_app_current_baseline.sql` plus forward tail
    `20260816160000_app_workforce_policy_foundation.sql`; historical sources
    are preserved under non-executable `supabase/migration-archive/`;
  - clean disposable rebuild, current app-schema parity, RLS/privilege parity
    and behavioral parity PASS;
  - MIG02B is DONE — LOCAL for its point-in-time two-version reconciliation;
    it resolved the then-current local migration-history drift without schema
    or business-data change;
  - the guarded forward chain now also contains the committed REG03E/G/H/I
    migrations `20260817120000`, `20260817160000`, `20260817190000` and
    `20260817210000`, with clean rebuild/schema/RLS/behavior proof;
  - future tenant migrations are forward-only after `20260817210000`;
  - REMOTE migration/schema/ledger state remains UNKNOWN/PARKED. A separate
    approved read-only cutover audit must compare remote schema, ledger and
    baseline-material parity before any remote registration or apply.
- WP2A party directory and customer-party binding is CURRENT PROVEN — LOCAL:
  - `app_parties`
  - `app_party_person_versions`
  - `app_party_organization_versions`
  - `app_customer_party_relationships`
  - party directory, versioned person/organization profiles, temporal customer-party binding, and local schema/RLS/proof are complete locally;
  - constraints, guards, deny-all RLS, and `service_role` `SELECT`/`INSERT` grants are locally proven;
  - Deno check and Q01-Q24 are green with zero `FAIL` and marker `app-party-foundation-proof-ok`;
  - transactional rollback left all four WP2A party tables with zero rows and protected existing app-table counts unchanged.
- WP2B representation-authority and case-role readiness audit is committed historical evidence with artifact status PROOF ONLY:
  - `docs/app/operations/wp2b-representation-authority-case-role-readiness-audit.md`;
  - historically confirmed representation authority, authority evidence/review, `app_cases`, and `app_case_party_roles` were not implemented at audit time;
  - records the older `app_legal_entities`/`app_representatives` appendix naming as CONFLICT with the later focused WP2 party/authority contract;
  - recommends exactly one next additive batch, without authorizing it: `WP2B-I — additive case shell and case-party-role history — LOCAL SCHEMA AND PROOF ONLY`.
- WP2B-I case and case-party-role foundation is CURRENT PROVEN — LOCAL:
  - earlier `BLOCKED — DECISION` was correct; its case/case-role schema-precision blockers are resolved;
  - `app_cases` and `app_case_party_roles` are locally implemented and proven through migration `20260724110000_app_case_party_role_foundation.sql`;
  - migration SHA-256 is `fb3f9b5d0705d47a5f1be9f934684a25ad474000874daf2ef9e071ab3ddb56a1`;
  - Q01-Q34 are green with marker `app-case-party-role-foundation-proof-ok`; proof SHA-256 is `12e4fdc5587fed04f75d3dda039c56e72fcd144cf1ecd8b943f1db7e32ef52bb`;
  - deterministic case advisory locking and deferred transaction-end checks proved that at most one simultaneous overlapping service-recipient transaction commits;
  - exact authority is the reconciled existing `contracts/customer-party-representation-case.md`; evidence is in `proofs/wp2b-i-case-party-role-foundation.md`; no change to the historical PROOF ONLY audit;
  - API/runtime/customer projection is NOT IMPLEMENTED; remote/production and NEa/verifier acceptance are NOT PROVEN;
  - migration and proof are committed in `5a5265adc516e8198cc25757654920d4aa3316bd`;
    its material current state is represented by the current baseline rather
    than an individual active-ledger row, by design;
  - representation authority remains `NOT SCHEMA READY`; mandates, EAN, kWh, verification and settlement remain outside WP2B-I.
- WP2B-II representation-authority readiness and domain-decision audit is COMPLETE — CURRENT PROVEN with artifact status `PROOF ONLY — WP2B-II REPRESENTATION AUTHORITY READINESS AUDIT`:
  - `docs/app/operations/wp2b-ii-representation-authority-readiness-audit.md`;
  - verdict: `BLOCKED — SOURCE OR LEGAL DECISION REQUIRED`;
  - exact blockers are accepted authority bases/evidence, organization/VvE and acting-person chains, self-action, joint authority, scope, retroactivity/revocation reliance, split status vocabularies, and qualified maker-checker/four-eyes rules;
  - the audit approves no contract and builds no schema, migration, proof, runtime, frontend, or CSS;
  - the audit remains unchanged and its source/legal blockers remain controlling.
- WP2B-II simple-majority MVP authority validation brief is committed as a documentation draft:
  - `docs/app/legal/representation-authority-pilot-validation-brief.md`;
  - status: `DRAFT — PENDING LEGAL AND VERIFIER VALIDATION`;
  - Daan's product direction is common simple MVP cases first and complex exceptions through later bounded modules;
  - approximately 10% or less unsupported outliers is an unproven product assumption;
  - excluded, conflicting and unclear cases are blocked/manual escalation and cannot create operational authority or mandate acceptance;
  - representation authority remains `NOT SCHEMA READY`;
  - next step is attributable written Dutch corporate-law and external-verifier validation, plus register-specialist input where needed, followed by Daan's explicit bounded contract decision; no schema is authorized.

Local proof is not production proof. Remote migration/function deploy, production bucket/policy proof, and production browser QA remain open.

## P0

- WP2 customer/person/organization/representation/case:
  - WP2 remains IN PROGRESS; WP2A four-table and WP2B-I two-table foundations are CURRENT PROVEN — LOCAL within their cited proof boundaries.
  - WP2A and WP2B-I migration/proof sources are committed; their material
    current state is represented by the proven current baseline. The guarded
    current migration chain includes the later REG03 forward tail; remote
    apply and remote parity remain open.
  - Representation authority, authority evidence, Auth/customer-safe projection, intake/backfill/cutover, and external KvK, DSO/CAR, and verifier boundaries remain open; applicable items remain TARGET, TODO, UNKNOWN, NOT SCHEMA READY, or BLOCKED — EXTERNAL.
  - WP2B audit result: representation authority is not schema-ready because target vocabulary, external authority evidence, qualified review/four-eyes, conflict/withdrawal history, and safe projection remain unresolved.
  - WP2B-I is committed and CURRENT PROVEN — LOCAL; WP2B-II readiness evidence is complete.
  - Obtain the written legal/verifier answers requested by the simple-majority pilot validation brief and then seek Daan's explicit bounded contract decision; do not automatically implement representation authority while it remains NOT SCHEMA READY.
- Current code/database/Edge Function assessment against validated NEa requirements:
  - DONE on 2026-07-19 as PROOF ONLY in `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md`.
  - The 2026-07-19 assessment treated `docs/app/07_NEA_TARGET_ARCHITECTURE.md` and `docs/app/09_NEA_MVP_PLAN.md` as PRELIMINARY DRAFT / NOT APPROVED; the 2026-07-22 decision supersedes only the architecture-direction status, not implementation evidence or MVP execution gates.
  - `SRC-NEA-TKV` access and clause mapping are DONE: the verified official repository snapshot contains 10 pages, 832788 bytes, SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`, and all 19 present clauses are mapped; there is no 3.3.5.
  - Remaining PARTIAL status concerns separate consolidated-law, deadline, retention, REV, legal, implementation, and external-verifier gaps.
- Target architecture and rebuild/migration decision:
  - DONE on 2026-07-19 and consolidated on 2026-07-21 into `docs/app/07_NEA_TARGET_ARCHITECTURE.md`, `docs/app/architecture/database-target-model.md`, `docs/app/decisions/architecture-and-environment-decisions.md`, and `docs/app/operations/remote-baseline-and-retirement.md`.
  - Overall recommendation: HYBRID PARALLEL REBUILD.
  - Electricity-TKV verifier detail is mapped and no longer source-blocked. The architecture is TARGET — APPROVED, NOT CURRENT PROVEN; blanket implementation authorization remains NO.
  - Target-only internal support controls are separated from external verifier location visits; approval of the direction gives neither implementation permission nor external professional authority.
- White-label / multi-tenant architectural foundation: DONE — CURRENT PROVEN
  LOCAL; the commercial white-label product remains TARGET:
  - [x] WL02-WL04 approved the TARGET boundaries recorded in `docs/app/architecture/white-label-control-plane.md`, `docs/app/contracts/platform-control-plane.md` and `docs/app/architecture/platform-control-plane-physical-foundation.md`.
  - [x] WL05-WL11E implement and deterministically prove the bounded local foundation through commit `8b47126`: physically separate control-plane workdir/migrations, explicit fail-closed target selection, tenant/routing/locator/platform-audit records, provider-neutral managed/static tenant resolution, trusted ingress, authoritative gating of the inventoried CURRENT `api-app-*` surface, versioned presentation configuration, managed/static presentation sources, safe public presentation bootstrap and React provider consumption.
  - [x] ENVAL remains tenant/data-plane #1 without customer/case copies or a convenience tenant-local `tenant_id` backfill. The control plane owns only platform routing/configuration, locator/secret references and platform audit; it owns no ordinary customer/case/signing/evidence/settlement truth.
  - [x] One core supports ENVAL SaaS, managed white-label, customer-owned cloud and contractually agreed standalone/self-hosted/source-license deployment through orthogonal operator, deployment ownership, branding, support and conflict-participation dimensions; these modes do not create code forks or authority by inference.
  - [x] Tenant identity, presentation brand, legal operator and support provider remain separate. LabelUP is only a conceptual optional support-provider relationship unless separately authorized; it is not automatically tenant, contracting entity, platform admin or representation authority.
  - [x] Current local routing does not switch the tenant data-plane client dynamically: `DYNAMIC_DATA_PLANE_SWITCHING=NO`. Browser-controlled host/payload/query/storage/config values cannot select tenant, locator, source mode or brand authority.
  - [x] Canon/system-map/architecture/contract status promotion is committed in
    `e076a23`; it promotes only local code/proof facts and keeps remote and
    production unproven.
  - [ ] TARGET/DEFERRED: real tenant #2 and customer onboarding; live control-plane bootstrap/deployment; production custom domains, ownership verification and trusted proxy topology; dynamic data-plane switching; provisioning/fleet/customer-cloud/self-host automation; tenant/domain/brand administration UI; uploaded assets/themes; legal/support authority configuration; central conflict registry; and remote/production white-label proof.
  - [ ] UNKNOWN until separately evidenced: remote control-plane provider/project/region/recovery, production ingress authority and live white-label operational readiness.
- Legacy caller retirement and live-cutover separation:
  - DONE — LOCAL SOURCE: commit `cf226df` removes the shipped static
    `api-dossier-dev-unlock` UI/caller while intentionally retaining its Edge
    Function source and historical data.
  - PENDING OBSERVATION: the 14-calendar-day dev-unlock caller-removal window
    started at commit time `2026-08-16 11:25:35 CEST`; earliest review remains
    `2026-08-30 11:25:35 CEST`. This date does not make retirement the current
    priority.
  - DONE — LOCAL SOURCE: commit `08462c8` removes only the secondary
    `api-dossier-access-update` retry; normal `api-dossier-access-save` and both
    legacy function source trees remain present.
  - DONE — LOCAL SOURCE: commit `bcdfe25` removes every shipped static
    `ev_direct` application caller, routes EV application actions to canonical
    `/aanmelden`, and preserves the ordinary `contact` lead flow plus retained
    `api-lead-submit`/legacy dossier function sources.
  - PARKED/BLOCKED: remote legacy function retirement, old live
    `www.enval.nl` static cutover, traffic/usage confirmation, legacy data and
    Storage retirement remain gated on fresh live evidence and explicit
    authorization. Local source state does not prove the current live
    deployment, and no remote function deletion is claimed.
- Database Retirement Phase 1A - Evidence Completion:
  - DONE on 2026-07-19; unique operational content is consolidated in `docs/app/operations/remote-baseline-and-retirement.md`.
  - The WP3D read-only catalog inventory observes 24 `app_*` public tables and substantial app data; the earlier retirement evidence recorded zero local legacy tables and 7 `app-documents` Storage objects.
  - The former empty local migration ledger was reconciled to the then-current
    baseline plus workforce-policy tail; later REG03 compliance migrations are
    guarded forward-chain additions with green local rebuild/parity proof.
  - Legacy runtime/repository objects remain present and remote status remains UNKNOWN.
- Remote Schema and Deployment Inventory:
  - DONE on 2026-07-19; dated evidence is consolidated as PROOF ONLY in `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
  - Linked remote `yzngrurkpfuqgexbhzgl` contains legacy schema, legacy Storage, active cron jobs, and deployed legacy/fallback Edge Functions.
  - Linked remote does not contain the local app schema, `app-documents` bucket, app SQL RPCs, or deployed `api-app-*` functions.
  - No deletion candidate is safe from this batch.
- Environment / Deployment Baseline Decision:
  - Strategy selected on 2026-07-19 and recorded in `docs/app/decisions/architecture-and-environment-decisions.md`; execution remains not permitted.
  - Daan selected in-place parallel rebuild in the existing `enval` project because a separate Supabase app project is not feasible under the current project quota.
  - `docs/app/operations/remote-baseline-and-retirement.md` records the same-project baseline execution plan without execution permission.
  - Phase 0 proof DONE on 2026-07-19 and consolidated in `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
  - Remote app collision count is 0; clean and legacy-shape shadow apply proofs are green.
  - Recovery gate DONE on 2026-07-19 and consolidated in `docs/app/proofs/remote-baseline-and-recovery-gate.md`.
  - Wave 1 proposals are reviewed and approved as migration candidates after minor grant revision, but remote execution is not approved.
  - Terminal-first blocker follow-up DONE on 2026-07-20: CLI backup metadata shows `backups=[]` and `pitr_enabled=false`; Daan accepted no Pro upgrade, no managed scheduled backups, no PITR, and no restore-to-new-project as an operational risk.
  - PostgREST functional request path is PARTIAL PROVEN: current remote public keys reach table routes and receive expected access denial or app-table route-not-found.
  - PostgREST dashboard/platform health remains UNHEALTHY / UNRESOLVED from current dashboard evidence; classification is `B. POSTGREST DEGRADED BUT REQUEST PATH AVAILABLE`.
  - Phase 0 regression rerun is green after local Docker availability was restored.
  - Encrypted backup and restoreproof DONE on 2026-07-20:
    - age recipient and identity are configured outside the repo;
    - encrypted public logical DB backup exists outside the repo;
    - Storage/Auth/Edge Function/cron recovery manifests exist outside the repo;
    - isolated local restore dry-run passed;
    - plaintext temp files and restore database were cleaned up.
  - Remote Wave 1 remains blocked on PostgREST dashboard/platform health.
  - Gate 1 connection/EAN and write-RPC objects are observed locally; historical proof runs are documented but are not CURRENT PROVEN under WP3A.
  - WP3C connection and WP3E location internal TARGET directions are approved without DDL authority; WP3D current-object conflict remains evidence, and open external/source/mapping blockers plus exact replacement contract and proof keep location and dependent connection schema/read-projection implementation unauthorized.
  - The local baseline/archive reconciliation is complete. Do not start remote
    baseline registration/apply, deployment, database drops, further migration
    squash, runtime removals, function deletion, cron changes, Storage cleanup,
    Auth mutation or remote SQL until a read-only remote cutover comparison is
    complete and Daan approves the exact mutation batch.
- Settlement & Payouts TARGET contract:
  - DONE documentair: provider-independent boundary from bruto verkoopopbrengst through direct external transaction costs, netto gerealiseerde verkoopopbrengst, 10% ENVAL-succesfee, 90% klantaandeel, settlement, payout, reconciliation, correction, reversal and bounded clawback;
  - F-01 through F-15 are `APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED`;
  - preferred pilot hypothesis is receipt on ENVAL's own bank account, reconciliation, retention of the 10% all-in fee and payout of the 90% klantaandeel;
  - PSP/split-payment is fallback/risk-reduction, not the standard architecture;
  - implementation remains late, separately bounded, and not approved;
  - legal/payment-regulatory analysis of the own-account money flow remains open;
  - account structure, segregation, safeguarding, licensing and PSD2/Wft classification remain open;
  - beneficiary/IBAN verification and payout export formats remain open;
  - tax, VAT, withholding, invoicing and final legal fee wording remain open;
  - payout approval roles and legal enforceability of correction, reversal and clawback remain open;
  - retention, legal basis, access, and privacy for payment data remain open;
  - pilot candidate after external validation: ledger, statements, own-account manual payout and manual reconciliation; bank/PSP automation later only after a separate decision and batch.
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

## P1 — Remaining

Collecting quarantine/capability transport, the public document-first flow,
`submitted_for_review`, atomic case-owned promotion, internal retry,
Supabase-Auth binding and dashboard convergence are no longer P1 TODOs; they
are CURRENT PROVEN LOCAL in the bounded 09B/09C evidence above.

CUSTOMER04C qualification and downstream foundations remain exactly
`TARGET — NOT CURRENT`:

- Customer Lifecycle Qualification:
  - particulier clean path;
  - single correction loop;
  - multiple correction loops;
  - bedrijf;
  - VvE;
  - multi-location;
  - multi-charger;
  - locked/yellow/green combinations;
  - refresh/resume/signing/audit integrity.
- Parser Qualification Corpus:
  - real sanitized energy contracts;
  - synthetic installation documents;
  - adversarial/ambiguous fixtures;
  - ground-truth expected facts and `MUST_NOT_EMIT` assertions.
- Third-party verification/check execution foundation.
- kWh, renewable-generation and feed-in accounting.
- Verifier/audit dossier generation and periodic audit snapshots.

None of these targets is inferred from CUSTOMER04C source, parser fixtures,
customer confirmation, the green Integration gate or local database state.

- Define review email notification contract.
- Define kWh periodic lifecycle.
- Define consent renewal/version-expiry lifecycle.
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
- Legacy documentation removal: DONE on 2026-07-19 after external copy by Daan.
- Legacy function retirement plan after `/app` production replacement is proven.
- Internal ENVAL review/admin tooling.
- Image OCR worker/internal analysis lane.

## Boundaries

- Future execution batches follow the canonical discipline in
  `docs/app/00_CANON.md`; do not duplicate it here.
- Do not mark the complete inboekservice live or finished.
- Do not use legacy `api-dossier-*` for new app behavior.
- Do not use legacy `dossier_sessions` as app auth.
- Do not treat a particulier-only mock as a global account-type rule.
- Do not expose raw audit rows directly to customers.

The dated checkpoint sections below are append-only status snapshots. Their
historical `OPEN`, `NOT IMPLEMENTED` or successor wording records the state at
that checkpoint and is superseded only by a later explicit CURRENT/P0 entry
above; it is not a second current-priority queue.

## PILOT-CASE-01 checkpoint — 2026-07-29

- [x] CURRENT PROVEN — LOCAL ONLY: verified Auth bootstrap v2 atomically creates/resolves one canonical immutable case per active non-minimized customer dossier and returns safe case fields.
- [x] CURRENT PROVEN — LOCAL ONLY: dashboard case projection is customer-bounded, one bulkread, write-free, strict and shown through the existing `Zaakreferentie` row without CSS or fallback.
- [x] Q01-Q32, one fresh disposable apply, real concurrency, rollback, cleanup, targeted frontend proofs and production build are green; real local case/party-role counts remain 0.
- [ ] OPEN: browser-live protected-route integration with non-mutating intercepted responses.
- [ ] OPEN: remote apply/deploy/production proof.
- [ ] OPEN and separate: party identity/roles, representation authority, mandate, location acceptance, EAN/aangeslotene, evidence, kWh, eligibility and NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-SIGNED-RECEIPT-09B2C checkpoint

CURRENT PROVEN — LOCAL SERVER RECORDS + SERVER-AUTHORITATIVE RECOVERY.

- [x] Server finalization remains core truth; the proved intake is locked in
      `pending_verification` with consumed challenge/capability and exactly one
      immutable signing evidence set.
- [x] Same-tab refresh reuses the existing scoped intake session and the
      service-role-only signing status RPC. Only the server establishes
      `finalized`/`locked` and returns the same safe reference; safe-reference-
      only lookup does not exist.
- [x] The versioned `sessionStorage` receipt remains optional presentation
      cache only. No capability, PII, internal ID, draft, document data or hash
      is cached in it, and it authorizes no mutation.
- [x] Loading and temporary errors fail closed without an editable fallback;
      corrupt/unknown receipt schemas are ignored. There is intentionally no
      `Nieuwe aanmelding` action.
- [x] Finalized upload/replace/remove/confirm, intake update, challenge and
      second-finalization paths are server-rejected; a database trigger also
      locks finalized intake-file rows.
- [ ] BLOCKED: CURRENT production legal records, configured production OTP
      delivery, remote apply/deploy and production/browser acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-UNIFIED-PRESENTATION-08 checkpoint

SOURCE IMPLEMENTED — LOCAL FRONTEND PROOF ONLY.

- [x] Step 1, Step 2 and Step 3 use the same applicability-driven React-free
      row model and shared `FactTable`; all interactive rows use the same
      `FactReviewControls`.
- [x] One `DocumentUploadSlot` presents the account extract, energy document
      and installation invoice through title, scope, binding and help props.
- [x] Step 2 groups facts per stable location and charger binding; Step 3 is
      one vertical review-only document in Account → locations → chargers →
      Documents order.
- [x] Not-applicable and absent informational rows stay out of customer review;
      parser observations remain separate from confirmations and corrections.
- [ ] OPEN: interactive browser acceptance, signing/legal copy, immutable
      signing snapshot and persistence, submit integration, remote, deploy,
      production and verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-FIRST-UI-01 checkpoint

CURRENT PROVEN — LOCAL ONLY — DOCUMENT-FIRST KISS SIGNUP UI AND GAP-DRIVEN CONFIRMATION MODEL

- [x] Exactly five visible steps: Account, Documenten, Controleren, Aanvullen,
      Ondertekenen.
- [x] One account-type configuration and shared shell for Particulier,
      Zakelijk and VvE; audited ORPHAN fields are absent from active Account.
- [x] Location- and charger-scoped documents, parser observations and stable
      client IDs; stale async results cannot repopulate a reset draft.
- [x] One presentation-only customer matrix with bounded statuses; observed,
      confirmed and manually corrected values remain separate.
- [x] Aanvullen is selector-driven and resolved gaps disappear.
- [x] Mapper compatibility retains only confirmed/manual target facts and the
      exclusive document/manual EAN assertion.
- [ ] Batch 3: persist documents, observations/declarations, verification and
      promotion under an approved backend contract.
- [ ] Batch 3: approve/version mandate copy, calendar-year scope, signer
      authority/e-sign evidence and signing persistence.
- [ ] Run interactive desktop/mobile browser acceptance and end-to-end resume;
      do not execute a successful signup until the signing contract exists.
- [ ] Supply an intended `ENVAL_EAN_REAL_PDF` to complete the retained real-PDF
      parity and energy-crosscheck acceptance gates.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-PARTY-NAME-CROSSCHECK-03 checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

- [x] Resolve the expected private party from full given names plus surname and
      the expected business/VvE party from `legalEntity.name` only.
- [x] Exclude administrator, representative, contact, signer, e-mail and
      display-name fallback from document-holder comparison.
- [x] Replace fuzzy/prefix/substring name acceptance with exact full-name,
      limited initial-plus-surname, mismatch and unavailable outcomes.
- [x] Reuse the same resolver/comparator for energy and charger/MID documents,
      while keeping each location/document and charger/document state isolated.
- [x] Focus a mismatch on given names, surname or legal-entity name and reuse
      existing fields, scroll/focus helpers, status pills and design tokens.
- [x] Keep parser comparison observed/derived assistance without overwrite,
      identity verification, authority, aangeslotene, ownership, accepted
      evidence or MID acceptance.
- [ ] OPEN: whether an external verifier accepts an initial-only document for
      the applicable mandate/control. The source wording says `naam` and does
      not resolve initials versus full given names.
- [ ] OPEN: browser-runtime acceptance, remote, deployment and production.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-PARTY-RUNTIME-04 checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

- [x] Keep each parser observation unchanged as observed/derived document data
      while energy and charger party comparisons are reactively derived from
      the current applicant or legal entity during render.
- [x] Treat account type as a hard draft boundary: confirm meaningful data,
      replace it with one fresh initializer-built draft and retain no hidden
      per-account-type history.
- [x] Invalidate pre-reset asynchronous parser results with a monotone draft
      generation.
- [ ] OPEN: local browser proof, accepted evidence, identity/authority or
      verifier acceptance, remote, deployment and production.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-CROSSCHECK-02 checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND PROOF-ONLY LOCAL PDFS.

- [x] Keep house number and addition structurally separate; render the canonical
      `28-1` form and compare `28/1`, `28 / 1` and separate bounded PDF cells as
      equivalent without splitting an arbitrary `281`.
- [x] Enforce exactly one location EAN source mode. Manual mode clears the
      document and all observations/candidates/confirmation; a new document
      clears manual input and confirmation; the mapper rejects mixed sources.
- [x] Permit confirmed manual fallback without an energy document while keeping
      the existing server payload and capture-method values unchanged.
- [x] Reuse one PDF adapter and one customer-safe document-check row/card
      contract for energy and charger documents. Technical preview fields are
      absent from the active customer UI.
- [x] Compare charger MID, serial, brand, model, location, customer and explicit
      installation year without fuzzy substring guesses, acceptance claims,
      prefilling or declared-data overwrite. Invoice date stays distinct.
- [x] Prove location/charger state isolation and bounded cleanup with the two
      existing uncommitted local fixtures; emit no fixture values or full EANs.
- [ ] OPEN: broader supplier/installer corpus, scans/OCR, document persistence,
      accepted evidence, verified charger identity, browser-runtime acceptance,
      remote, deployment, production and regulatory acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-EAN-PREFLIGHT-02 checkpoint

- [x] Required errors are hidden until the first submit attempt; validation
      truth remains continuously computed.
- [x] An invalid CTA click shows all current field-local errors, focuses and
      scrolls the first invalid control and performs no mapper/client/network
      work.
- [x] The idle CTA retains normal active styling and is disabled only during a
      genuine valid request.
- [x] The existing adapter handles Flate-only, ToUnicode-encoded text items with
      page/row boundaries and an explicit column separator.
- [x] A sanitized electricity/gas/contract-period fixture and one uncommitted
      local real-PDF proof both produce one electricity and one gas candidate.
- [x] A unique electricity candidate wins the normal confirmation route; gas is
      not offered as an electricity choice and manual fallback stays hidden.
- [ ] OPEN: broader supplier-document corpus, OCR/scans, persistence, external
      EAN verification, signed mandate, successful browser submit, remote and
      production proof.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-EAN-PREFLIGHT-01 checkpoint

- [x] Energy-document selection invokes the existing client-side PDF parser;
      candidates retain compact source context and stay observed/derived.
- [x] Every location independently handles parsing, candidate selection,
      explicit confirmation, document reset and conditional exact-18-digit
      manual fallback without state leakage.
- [x] Frontend validation produces stable field paths and renders errors at
      applicant, location, document, EAN, charger, invoice and acceptance
      fields.
- [x] `Ondertekenen en dossier starten` is disabled and guarded until the
      complete current frontend draft, documents, confirmed EANs and acceptances
      are ready.
- [ ] NOT IMPLEMENTED: document persistence/promotion, signed mandate or digital
      signature evidence, intake runtime, e-mail verification,
      calendar-year/authority contract, CAR, remote, deploy or production.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-JOURNEY-02 checkpoint — historical, superseded frontend slice

- [x] Current visible order is exactly Aanvrager, Locatie, Aansluiting,
      Laadpalen and Ondertekenen.
- [x] Address/precheck is location-only. Energy-document selection is
      location-scoped under Aansluiting; charger invoices remain charger-scoped.
- [x] Aansluiting and Laadpalen reuse one shared location-tab model; one
      location hides tabs and multiple locations preserve the active selection.
- [x] At that checkpoint manual EAN, operator/period controls, additional
      documents and the expanded review were absent. The later bounded
      connection/crosscheck batches supersede the manual-EAN statement.
- [x] Onboarding acceptance is not presented as the definitive NEa mandate.
- [ ] DASHBOARD: authenticated energy-document transport, EAN acquisition and
      confirmation, additional documents and definitive signed mandate snapshot.
- [ ] DASHBOARD: kWh source/import and customer-safe status projection.
- [ ] OPEN: remote, deployment, production and regulatory acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-JOURNEY-01 checkpoint

- [x] Visible order is exactly Aanvrager, Aansluiting en locatie, Laadpalen,
      Aanvullende documenten, Controleren en afronden.
- [x] EAN and local energy-document state are location-scoped and independent;
      charger/MID invoice state remains charger-scoped.
- [x] The zakelijk-rijden document is dossier-wide and conditionally hidden
      behind an explicit not-applicable state for other account types.
- [x] The read-only summary covers applicant, locations, EAN/document state,
      chargers, additional documents and current general acceptances with
      state-preserving Wijzigen actions.
- [x] Current general acceptances are not shown as a definitive mandate; kWh is
      absent from signup and remains dashboard-only.
- [ ] OPEN: authenticated energy-document transport, candidate extraction,
      confirmation and the later scoped definitive mandate.
- [ ] OPEN: remote, deployment, production and regulatory acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-CONNECTION-01B checkpoint

CURRENT PROVEN — LOCAL ONLY — ASSISTED AND CUSTOMER-CONFIRMED EAN ACQUISITION
WITH MANUAL FALLBACK

- [x] Initial signup safely defers EAN; a deferred location creates no
      declaration source.
- [x] Manual EAN is a secondary action, requires exactly 18 digits and explicit
      confirmation, and creates exactly one declared source.
- [x] `app_submit_signup_v5` wraps unchanged v4 atomically and creates/resolves
      one immutable protected source only for confirmed data.
- [x] Netbeheerder and connection dates are no longer customer requirements;
      mandate/calendar-year validity remains separate future truth.
- [x] Q01-Q24 cover deferred/manual/parser-candidate boundaries, all account
      types, replay, conflict, concurrency, rollback/retry and cleanup.
- [ ] HISTORICAL SUCCESSOR AT THIS CHECKPOINT: authenticated energy-bill/contract intake, EAN
      candidate extraction/preview and explicit confirmation through the CURRENT
      document transport.
- [ ] OPEN: CAR/DSO derivation, accepted canonical connection/allocation point,
      aangeslotene/ownership decision and accepted canonical location.
- [ ] OPEN: browser-live remote integration, remote apply/deploy, production and
      verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-PARTY-01A checkpoint — 2026-07-29

- [x] CURRENT PROVEN — LOCAL ONLY: verified Auth bootstrap v3 atomically
  creates/resolves one canonical root party per current customer and reuses it
  across that customer's dossiers/cases.
- [x] CURRENT PROVEN — LOCAL ONLY: the exact internal link is the existing
  `app_customer_party_relationships.account_owner` service/account relation;
  it creates no legal, representation, mandate or case-role truth.
- [x] Particulier maps to `natural_person`; zakelijk and VvE map to
  `organization`; Q01-Q18, concurrency, rollback, fresh apply and cleanup are
  green.
- [ ] OPEN and separate: profiles/names/identifiers, service recipient,
  case contact, representation authority, mandate, EAN/location/evidence/kWh,
  eligibility, browser-live, remote, production and NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-PROFILE-02 checkpoint

CURRENT PROVEN — LOCAL ONLY: Auth bootstrap v4 promotes complete equivalent
immutable signup declarations to one declared profile and creates or resolves
one `service_recipient/asserted` claim per canonical case. No-source remains
a safe no-op; partial/conflicting source, profile or role truth fails closed.

The declaration timestamp remains exact. Profile validity is the
Europe/Amsterdam business date. Verified identity/KvK, address,
case-confirmed, representation, mandate, EAN, evidence, kWh, eligibility,
browser-live, remote, deploy and production remain open.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-ENERGY-DOCUMENT-CROSSCHECK-01 recovery checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND PROOF-ONLY REAL PDF.

- [x] Reuse the existing PDF decoder, page/row reconstruction and EAN
      classifier; no second parser, package or OCR.
- [x] Bound contractholder, delivery-address and supplier extraction to semantic
      blocks and validate every field candidate before display.
- [x] Reject combined Naam columns, non-delivery post addresses, multiple
      addresses/postcodes and label-only supplier values.
- [x] Hide rejected/missing parser rows and omit comparison pills until
      applicant/location input is sufficient.
- [x] Preserve EAN confirmation, EAN klopt niet and manual fallback; only a
      confirmed electricity EAN reaches declared state.
- [x] Keep parser output observed/derived, comparison assistive, customer input
      unchanged and rejection reasons non-customer-facing.
- [x] Prove the local real-PDF path without fixture commit, document-value
      output, full EAN output or forbidden PII keys.
- [ ] OPEN: browser-runtime acceptance, upload transport, evidence acceptance,
      canonical connection/location, CAR/aangeslotene, mandate, remote,
      deployment, production and regulatory acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-ATOMIC-01 checkpoint

CURRENT PROVEN — LOCAL ONLY for the bounded current direct-signup transaction.
`app_submit_signup_v4` owns customer/identity, one dossier, submitted child
objects, one immutable declaration source, fail-closed audit and idempotency
completion atomically. Q01-Q24 prove failure/replay and concurrency locally.

Still open: profile promotion, service-recipient case claims, address/legal
identity verification, representation, mandate, EAN/aangeslotene, evidence
acceptance, kWh, eligibility, browser-live, remote, deploy and production.
`app_signup_intakes` remains inactive and separate.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-FIRST-REVIEW-02 checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND TWO LOCAL REAL PDF FIXTURES.

- [x] Exactly Account, Documenten and Ondertekenen, shared footer navigation
      and fail-closed step-2 continuation.
- [x] Common fact registry, generic responsive matrix, one action per row,
      inline replacement/correction and explicit canonical-fact confirmation.
- [x] Confirmed-only account/location/charger/document summary; no parser
      context, confidence or source-page data in customer UI.
- [ ] OPEN: approved exact legal/mandate copy, immutable server snapshot/hash,
      signer verification, authority evidence, signed timestamp and audit
      persistence.
- [ ] OPEN: browser acceptance, remote persistence, accepted evidence,
      canonical location/EAN/aangeslotene, deploy, production and verifier/NEa
      acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-DOCUMENT-DECISION-03 checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND TWO LOCAL REAL PDF FIXTURES.

- [x] Compact responsive upload-card grid using the existing upload slot and
      parser; no duplicate card title or second upload/CSS system.
- [x] Exact five-column review matrix with a blank-until-chosen canonical
      `Wordt gebruikt` column and real shared button classes.
- [x] Pure semantic decision policy with bounded normalization, persistent
      review markers and fail-closed material blockers.
- [x] Observation-preserving correction metadata with exact correction types;
      correction and customer intent never create a clean/green fact.
- [x] Compact Account/Locaties/Laadpalen/Documenten summary; unavailable sign
      action is absent.
- [ ] OPEN: approved legal/mandate copy, accepted evidence, server-side
      decision persistence, immutable signing snapshot/hash, signer and
      authority verification, audit persistence, browser acceptance, remote,
      deploy, production and verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-UNIFIED-DOCUMENT-PARSER-04 historical checkpoint

HISTORICAL LOCAL PROOF — CUSTOMER TYPE-GATING SUPERSEDED BY
PILOT-SIGNUP-GENERIC-DOCUMENT-FACTS-05.

- [x] Same bytes plus the same parser version produce the same privacy-safe
      observation-envelope digest and identical generic candidate facts.
- [x] Historical classification/compatibility experiment recorded; it is no
      longer active customer behavior and provides no progression gate.
- [x] Document-ID/fingerprint/parser-version cache with document-scoped
      replacement/removal invalidation.
- [ ] OPEN: OCR/scanned-document support, broader independent fixture corpus,
      interactive browser acceptance, accepted evidence, canonical TARGET
      truth, signing/snapshot persistence, remote, deploy and production.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-GENERIC-DOCUMENT-FACTS-05 checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF, TWO LOCAL REAL PDF FIXTURES AND
ONE LOCAL NO-FACT PDF.

- [x] Same bytes plus the same parser version produce the same envelope, facts
      and display values in both upload columns.
- [x] Upload slot is source binding only; no active customer-facing document
      classification, compatibility state or document-type blocker remains.
- [x] Missing/declined candidates render as `—`; a parsed document with no
      supported facts renders `Geen gegevens gevonden.` at its upload card.
- [x] Required canonical facts and charger/location binding gate progression;
      real EAN, MID, serial, same-role party and explicit-location conflicts
      remain decision-policy blockers.
- [x] Obsolete slot-compatibility module removed with no remaining app caller;
      internal type-candidate scores remain non-blocking envelope metadata.
- [ ] OPEN: OCR/scanned-document support, broader independent fixture corpus,
      interactive browser acceptance, accepted evidence, canonical TARGET
      truth, signing/snapshot persistence, remote, deploy and production.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-FACT-APPLICABILITY-SUMMARY-06 checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND TWO LOCAL REAL PDF FIXTURES.

- [x] One pure account-type plus fact-key selector determines required,
      informational or not-applicable dossier behavior after generic
      extraction.
- [x] Particulier requires exactly name, address, electricity EAN and charger
      brand/model/MID/serial; organization name, KvK and gas EAN are not needed.
- [x] Zakelijk/VvE require organization name and KvK without making document
      `partyName` a second generic organization requirement.
- [x] Missing informational facts show no action and do not block; not-needed
      rows show neutral `Niet nodig` and stay outside `Wordt gebruikt`.
- [x] UI-default `Nederland` creates no correction or confirmation. An explicit
      complete manual address save preserves observations and remains marked
      for ENVAL review.
- [x] The existing signing summary includes confirmed applicable facts, bound
      safe document names and found informational facts without technical
      parser metadata.
- [ ] OPEN: browser acceptance, address-lookup runtime behavior, accepted
      evidence, canonical TARGET truth, legal/mandate approval, signing,
      snapshot/audit persistence, remote, deploy and production.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-ORGANIZATION-DOCUMENT-FIRST-07 checkpoint

SOURCE IMPLEMENTED — LOCAL REAL-FIXTURE GATE BLOCKED.

- [x] Step 1 contains only account type and e-mail; company/VvE name and KvK
      number are absent from the active form.
- [x] One account-bound KvK PDF slot for Zakelijk/VvE reuses the unified
      parser/cache/upload state and clears on account-type reset.
- [x] Conditional six-column organization matrix; Particulier retains five
      columns and no organization upload.
- [x] Organization name, KvK number and registered address are required and a
      manual value cannot compensate for an absent KvK document.
- [x] Legal form, trade name, director/board member and representation text are
      informational and never fill a signer or create an authority decision.
- [ ] BLOCKED: provide a privacy-safe local real Dutch KvK extract whose text
      layer yields organization name, KvK number and registered address. The
      available local Dutch files are a brochure and a multi-document corpus;
      neither is accepted as proof. Re-run the Org-07 proof with both NL/EN
      fixture environment variables to earn the marker.
- [ ] OPEN: interactive browser acceptance, signing/legal copy, immutable
      snapshot/audit persistence, backend payload, remote, deploy, production
      and verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-FACT-RESOLUTION-08B checkpoint

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF; REAL KVK FIXTURE GATES BLOCKED.

- [x] One React-free neutral/green/orange/red resolution model and one shared
      progression gate for organization, location and charger facts.
- [x] Exact five-column review table, compact correction editor and sibling
      location/charger sections without page-local resolution logic.
- [x] Separate source observations with document identity/fingerprint and
      stable bindings; same bytes cannot create false corroboration.
- [x] Bounded natural-person/organization name and structured Dutch address
      comparisons, including orange probable matches and red clear mismatches.
- [x] Confirmation remains customer intent; corrections, manual values and
      resolved document conflicts remain orange rather than becoming evidence.
- [ ] BLOCKED: provide an intended privacy-safe Dutch standalone KvK extract
      that yields exact `organizationName`, and an intended real English KvK
      PDF under Downloads, Desktop or Documents. Then set
      `ENVAL_KVK_DUTCH_PDF=/absolute/path.pdf` and
      `ENVAL_KVK_ENGLISH_PDF=/absolute/path.pdf` and rerun the Org-07 proof.
- [ ] OPEN: browser acceptance, evidence acceptance, approved legal/signing
      copy, immutable snapshot, persistence, backend, remote, deploy,
      production and verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-SIGNATURE-CORE-09A checkpoint

CURRENT PROVEN — LOCAL FRONTEND CONTRACT/PRESENTATION ONLY.

- [x] `typed_name_otp_v1` is the only registered method behind one stable port
      and composition root; future method identifiers have no implementation.
- [x] One generated mandate model covers Particulier, Zakelijk and VvE with
      canonical facts, both required permission references and one whole-
      calendar-year policy.
- [x] Privacy read acknowledgement is separate from service/fee acceptance and
      mandate signing. All four legal documents are versioned and fail closed
      while status/hash is not CURRENT/verified.
- [x] Step 3 reuses the canonical fact document and shows mandate, legal bundle,
      signer inputs and closed readiness without active sign/submit behavior.
- [ ] 09B: approve final legal copy and hashes; implement server-side OTP,
      immutable snapshot/hash, server timestamp, atomic signing/mandate
      finalization, authority-review linkage, idempotency and audit evidence.
- [ ] 09C1: implement server-only case-owned promotion/dashboard projection;
      internal review is not external verification.
- [ ] Post-MVP: jurisdiction-aware foreign trade-register document support and
      separately approved drawn/advanced/qualified method adapters if needed.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-SIGNING-KISS-09A1 checkpoint

CURRENT PROVEN — LOCAL FRONTEND CONTRACT/PRESENTATION ONLY.

- [x] Step 3 has exactly four major customer sections and no customer-facing
      readiness, document-status, method or server-finalization diagnostics.
- [x] Summary confirmation is separate from evidence acceptance; one legal
      checkbox produces three separate versioned legal action intents.
- [x] Local preview and download use one canonical self-contained legal bundle
      and do not navigate to the placeholder privacy/terms routes.
- [x] Mandate year choices are current year plus two and organization signing
      remains a customer declaration with authority review unresolved.
- [x] Tabs, next and back use one scroll/focus transition while preserving the
      browser-local signup draft.
- [ ] 09B: approve final legal copy and hashes and implement server-owned OTP,
      immutable snapshot/hash, timestamp, finalization and audit evidence.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-SIGNING-LAYOUT-09A2 checkpoint

CURRENT PROVEN — LOCAL FRONTEND PRESENTATION ONLY.

- [x] One compact Account table and one compact Documents table show exactly
      two customer columns without removing internal provenance.
- [x] Every location owns one bounded horizontal rail of sibling location and
      stable-ID-linked charger panels with global charger numbering.
- [x] Machtiging, Voorwaarden en privacy and Ondertekening share one responsive
      composition and Step 3 has exactly three customer confirmations.
- [x] Machtiging has no duplicate confirmation; full bundle preview reuses the
      existing export port.
- [x] Signer-name formatting reuses the existing normalizer on blur.
- [ ] 09B: add one working `Ondertekenen en indienen` action only with CURRENT
      server legal versions, complete declarations, valid signer fields,
      calendar year, OTP and atomic finalization.
- [ ] Signing, persistence, audit evidence, remote and production remain NOT
      IMPLEMENTED by 09A2.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-QUARANTINE-UPLOAD-09B1 checkpoint

CURRENT PROVEN — LOCAL RUNTIME/SOURCE ONLY.

- [x] Collecting intake, scoped app idempotency/audit, hashed `intake_manage`, explicit server TTLs and session-only browser storage.
- [x] Private PDF-only signed uploads, server byte/MIME/SHA-256 confirmation and one-time file capability consumption.
- [x] Immutable revisions, atomic replacement/removal, one current revision, no file-history DELETE grant and stable account/location/charger binding isolation.
- [x] Shared dashboard/signup transport primitives and document-first gating on current `confirmed_quarantine` plus fact resolution.
- [ ] 09B2: legal versions, OTP, canonical signing snapshot/hash, atomic legal/mandate/signing evidence and authority-review linkage.
- [ ] 09C1: server-only atomic case promotion and customer-safe dashboard
      projection; do not create external-verification semantics.
- [ ] OPEN: production TTL/rate-limit/retention settings, remote migration/deploy, production Storage and interactive browser acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-LEGAL-BUNDLE-APPROVAL-09B2A checkpoint

DOCUMENTATION/DECISION ONLY — LEGAL BUNDLE DRAFT; OTP ARCHITECTURE AUTHORIZED.

- [x] Record that 09B2 stopped correctly before schema/runtime changes on
      `LEGAL_BUNDLE_SOURCE_BLOCKED` and `OTP_TRANSPORT_BLOCKED`.
- [x] Create one four-document approval source with proposed
      `privacy-notice-nl-v1`, `service-terms-nl-v1`, `fee-terms-nl-v1` and
      `mandate-nl-v1`, exact draft text, clause provenance and explicit
      `DECISION REQUIRED` markers.
- [x] Preserve privacy reading as an acknowledgement, not blanket consent, and
      preserve the combined UI action as three separate legal intents.
- [x] Authorize one new app-scoped `SigningOtpTransportPort`, local Supabase
      mail-testing adapter boundary and configurable production adapter while
      excluding legacy mail/dossier functions.
- [x] P-01: approve future ENVAL B.V. as intended core-service controller —
      `APPROVED PRODUCT/LEGAL DIRECTION — ENTITY DETAILS PENDING`.
- [x] 09B2A3: resolve P-02 through P-06 as internally approved privacy
      directions and consolidate their status in one canonical registry.
- [ ] BLOCKED — ENTITY/EXTERNAL LEGAL: fill the exact controller/contact data
      and validate bases, recipients/processors, transfers, retention, rights
      and material-change action.
- [x] T-01 and T-02: approve future ENVAL B.V. as contracting/assignment/
      service/settlement entity, the Dutch MVP customer definitions, atomic
      server-finalization formation and exact one-year/no-renewal direction.
- [x] 09B2A3: resolve T-03 through T-08 as internally approved contract and
      liability directions without inventing a numeric liability cap.
- [ ] BLOCKED — ENTITY/EXTERNAL LEGAL/INSURANCE: fill the contracting-party
      data and validate consumer rights, termination, liability/cap, force
      majeure, changes, disputes and durable-medium notices.
- [x] DAAN/COMMERCIAL: approve F-01 through F-15 as commercial direction,
      including the exact 10/90 formula, closed external-cost model,
      receipt/reconciliation trigger, correction/reversal rules, fourteen-day
      payout direction and itemized settlement statement.
- [ ] BLOCKED — LEGAL/TAX/PAYMENT: validate final fee wording, VAT/invoicing,
      own-account money flow, beneficiary/ownership, safeguarding, PSD2/Wft,
      banking and enforceability of correction/reversal/clawback.
- [x] M-04 and M-06: approve exactly one chosen full calendar year per
      mandate/finalization and prospective immutable-event withdrawal —
      `APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED`.
- [x] 09B2A3: resolve M-01 through M-03, M-05 and M-07 through M-09 as
      internally approved product directions with exact external gates.
- [ ] BLOCKED — EXTERNAL LEGAL/VERIFIER: validate permission clauses,
      organization/VvE authority, simple-signature evidence, calendar-year and
      withdrawal questions, and obtain written verifier acceptance.
- [ ] After all external gates: freeze effective dates and canonical content, then
      derive server-side SHA-256 and reconcile exactly four registry records to
      `CURRENT` in the separately authorized 09B2 implementation batch.
- [ ] 09B2 runtime remains NOT IMPLEMENTED: no OTP, migration, RPC, Edge
      Function, legal acceptance, mandate, signature evidence, snapshot,
      customer lock or finalization exists from 09B2A.
- [ ] Post-MVP: foreign trade-register and jurisdiction-specific authority
      modules.

Decision sources:
`legal/signing-legal-bundle-approval.md` and
`architecture/signing-otp-transport.md`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-FEE-DECISION-09B2A1 checkpoint

APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED.

- [x] F-01 through F-15 preserve their historical IDs and now contain approved
      commercial direction rather than open recommendations.
- [x] Formula: bruto verkoopopbrengst minus closed directe externe
      transactiekosten equals netto gerealiseerde verkoopopbrengst; 10% is the
      all-in ENVAL-succesfee including applicable VAT and 90% is klantaandeel.
- [x] Internal operating/overhead costs remain inside the 10%; every deductible
      external cost is third-party, sale-linked, itemized and without markup.
- [x] No fee exists before definitive receipt and reconciliation. Settlement
      precedes payout; target payout is within fourteen calendar days unless an
      explicit block is recorded.
- [x] Corrections and reversals move the fee proportionally; clawback is capped
      at evidenced net overpayment; every change is a settlementrevision.
- [x] Preferred pilot operating hypothesis: ENVAL own-account receipt,
      reconciliation, 10% retention and 90% payout. PSP/split-payment remains a
      fallback, not the standard architecture.
- [ ] BLOCKED — external legal, tax, banking and payment-regulatory validation,
      including VAT/invoicing, ownership/entitlement, safeguarding, PSD2/Wft,
      beneficiary verification and correction/clawback enforceability.
- [ ] Technical fee, settlement, payout, report and settlementrevision runtime
      remains NOT IMPLEMENTED. The complete legal bundle remains DRAFT.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-ENTITY-TERM-MANDATE-DECISIONS-09B2A2 checkpoint

DOCUMENTATION/DECISION ONLY — FIVE TARGET DIRECTIONS APPROVED; NO LEGAL OR
RUNTIME PROMOTION.

- [x] `P-01 — APPROVED PRODUCT/LEGAL DIRECTION — ENTITY DETAILS PENDING`:
      future ENVAL B.V. is the intended controller; explicit statutory and
      contact placeholders are mandatory before CURRENT and partner roles stay
      subject to separate legal assessment.
- [x] `T-01 — APPROVED PRODUCT/LEGAL DIRECTION — ENTITY DETAILS PENDING`:
      future ENVAL B.V. is the contracting party, assignment recipient, service
      manager and financial-settlement entity; Particulier, Zakelijk and VvE
      have bounded Dutch MVP definitions and foreign registers are post-MVP.
- [x] `T-02 — APPROVED PRODUCT/LEGAL DIRECTION`: contract formation requires
      successful atomic server signing finalization plus a safe-reference
      submission confirmation; intake, upload, parser, Step 3, confirmations or
      OTP request/delivery do not form the contract.
- [x] Exact one-year term: no silent renewal, subscription or ongoing mandate;
      a later year requires new customer action, legal bundle, snapshot, mandate
      and signature, while only necessary year-related completion and retention
      may continue after year-end.
- [x] `M-04 — APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED`:
      one full selected calendar year, server-finalization issue date, exact year
      in the snapshot, no multi-year mandate and no retroactivity claim.
- [x] `M-06 — APPROVED PRODUCT DIRECTION — LEGAL/VERIFIER VALIDATION REQUIRED`:
      authenticated/reliably verified prospective withdrawal becomes a new
      immutable event and preserves original evidence and bounded historic acts.
- [ ] Reconcile current multi-year-capable frontend/model behavior to the
      one-year TARGET rule only in a separately authorized implementation batch.
- [x] 09B2A3 resolves the then-unapproved P/T/M product directions into one
      canonical decision registry and removes superseded alternatives.
- [ ] Resolve entity details and the enumerated external legal/verifier gates.
      The bundle remains DRAFT; `effective_from` stays unset and hashes remain
      unverified.
- [ ] No OTP, signing, mandate, withdrawal, finalization, remote or production
      behavior is implemented or proven by 09B2A2.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## PILOT-SIGNUP-LEGAL-CONSOLIDATION-09B2A3 checkpoint

DOCUMENTATION/DECISION ONLY — INTERNALLY APPROVED VALIDATION CANDIDATES;
EXTERNAL LIVE GATES OPEN.

- [x] Consolidate every P-01 through P-06, T-01 through T-08, F-01 through
      F-15 and M-01 through M-09 decision exactly once in the canonical legal
      registry.
- [x] Replace duplicate decision tables, rejected alternatives, repeated
      disclaimers and customer-facing architecture detail with four compact
      validation candidates.
- [x] Mark each document
      `VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT` while the bundle
      remains `DRAFT — EXTERNAL LEGAL/VERIFIER VALIDATION REQUIRED`.
- [x] Preserve unset `effective_from`, unverified hashes, incomplete future
      ENVAL B.V. details, the pending numeric liability cap and the written
      verifier-acceptance gate.
- [x] Fix server-canonical party/EAN/location snapshot direction, separate NEa
      and verifier permissions, server issue date and the complete minimized
      simple-signature evidence-pack target without raw OTP or advanced/
      qualified-signature claims.
- [ ] EXTERNAL LIVE GATES: entity data; privacy and consumer-law validation;
      insurance/liability cap; exact mandate wording and authority standard;
      written verifier acceptance; tax, banking, safeguarding and
      payment-services classification.
- [ ] IMPLEMENTATION: registry promotion, effective dates, hashes, OTP,
      signing, mandate, authority review, withdrawal, settlement and atomic
      finalization remain separately authorized future work.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09C0/09C1A/09C1B/09C1C post-signing lifecycle convergence checkpoint

09C1A DATABASE/RPC FOUNDATION, 09C1B SERVER-ONLY STORAGE/EDGE ORCHESTRATION AND 09C1C CUSTOMER HANDOFF CURRENT PROVEN — LOCAL ONLY.

- [x] Map the CURRENT signed-intake flow from intake start through quarantine,
      challenge, OTP/email control, finalization, lock and refresh recovery.
- [x] Mark the separate email-verification promotion link `SUPERSEDED` because
      `typed_name_otp_v1` already proves bounded email control.
- [x] Separate signing/email control, ENVAL internal review and external
      inboekverificatie canonically.
- [x] Define CURRENT `pending_verification` as finalized/locked only and choose
      exact 09C1 replacement `submitted_for_review`.
- [x] Define one server-only atomic/idempotent promotion with `app_cases` as
      owner and no new `app_customer_dossiers` row.
- [x] Define Particulier, Zakelijk and VvE party/role mappings without deriving
      representation authority from signature, account or case role.
- [x] Define server-only quarantine-to-durable file/version mapping without
      automatic evidence acceptance.
- [x] Keep declared/parser EAN, location, charger and MID facts separate from
      accepted operational truth.
- [x] Keep signing OTP separate from Supabase Auth and require later bootstrap
      to reuse promoted customer/party/case state.
- [x] Map the promotion boundary to TKV mandate, EAN, location-control,
      provenance, MID, retention, correction and later verifier-pack needs.
- [x] 09C1A: migrate stored lifecycle truth to `submitted_for_review`; add one
      immutable promotion owner, service-only atomic/idempotent RPC, one
      `app_cases` root, asserted roles, declared location observations,
      non-accepted evidence metadata, audit and focused Q01-Q24 local proof.
- [x] 09C1B: add internal-only `api-app-signup-promote`, server-derived private
      quarantine-to-durable preparation in existing `app-documents`, exact
      byte/MIME/size/SHA-256 reverification, deterministic retry/concurrency,
      creator-only cleanup and focused local Q01-Q30 proof without schema work.
- [x] 09C1C: version receipt semantics and remove active frontend
      `pending_verification`; orchestrate bounded server-owned promotion after
      finalize/status; reuse `/account` and verified Supabase Auth v5 to bind
      the existing promoted identity/customer/case; project the signed case in
      the existing customer dashboard without a new `app_customer_dossiers` row.
- [x] 09C1C-R1: classify post-finalization account handoff server-side; use
      login for an existing account, activation for a new account and direct
      portal access only for an exactly matching verified session. No account
      existence is exposed before consumed signing OTP/finalization.
- [x] 09C1C-R1: treat account and case as separate roots; reuse the existing
      compatible identity/customer for a new application, create one new case,
      and normalize lineage-backed legacy dossiers plus signed cases without
      e-mail/name/address dedupe.
- [x] 09C1C-R1: route authenticated `Nieuwe aanvraag` to the existing
      `/aanmelden` flow; existing-case correction/document update remains a
      separate intent.
- [x] 09C1C-R5: treat verified Auth with no compatible customer/case as
      `unbound_no_cases`; open a customer-safe zero-case portal without
      creating business truth.
- [x] 09C1C-R5: reuse canonical `/aanmelden` for account-first applications,
      derive authenticated e-mail from verified server context, preserve
      signing/OTP, and prove zero→one→two isolated cases in Q113-Q145.
- [x] 09C1C-R5-R1: persist immutable intake-specific verified Auth provenance,
      keep customer/case creation out of account creation and intake start,
      and atomically create/bind the first compatible customer, identity and
      signed case for a zero-case Auth user.
- [x] 09C1C-R5-R1: recover the retained signed account-first fixture through
      the normal verified bearer status route; preserve activation/login paths
      and route `promoted` + `already_authenticated` directly to `/dashboard`.
- [x] 09C1C-R6: keep Auth principal, customer/service context, party, case and
      authority separate; add immutable server-owned multi-context access,
      preserve distinct Particulier/Zakelijk/VvE customers and keep account
      type context-scoped.
- [x] 09C1C-R6: aggregate all explicitly accessible legacy/signed cases and
      invalidate only the current principal's dashboard/bootstrap cache after
      authenticated promotion; keep Zakelijk/VvE authority review incomplete.
- [ ] Post-MVP polish: visually integrate authenticated `Nieuwe aanvraag`
      inside the portal shell. Keep canonical `/aanmelden` as the single shared
      intake flow; do not build a second portal-native application flow.
- [ ] 09C1C-R1 browser acceptance: manually verify existing-account login,
      new-account activation, already-authenticated portal handoff,
      back/forward receipt recovery and multi-case switching in a real browser.
- [ ] 09C1C+: production legal/OTP/Auth configuration and browser acceptance,
      operations review, authority/evidence decisions, external verifier,
      remote apply and deploy require separate authority.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
