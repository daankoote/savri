# WP3D Location Current-Truth Readiness Audit

Status: PROOF ONLY — WP3D LOCATION CURRENT-TRUTH READINESS AUDIT

## 1. Scope And Authority

This is a documentation-only, read-only inventory of the current location implementation and its readiness for a separately bounded location contract. It is not legal advice, external-source acceptance, a schema decision, DDL authorization, implementation proof, retirement approval, remote parity proof, or deployment approval.

WP3C package B is controlling TARGET direction:

- location is a separate bounded foundation;
- location has a stable root, immutable versions, and separate address observations;
- an address string is not stable physical-location truth;
- `app_dossier_locations` does not automatically become the TARGET location object;
- relocation, address correction, and administrative address change must remain historically reconstructable;
- connection DDL remains blocked until the location foundation is separately approved and proven.

This audit tests CURRENT truth against that direction. It does not approve the candidate names or decisions in `contracts/location-foundation.md`.

## 2. Execution Guard

| control | observed result |
|---|---|
| repository | `/Users/daankoote/dev/enval` |
| branch | `main` |
| HEAD | `da961fa84da73ecc320b55b2cb83881a12d658f3` |
| HEAD parent | `ee3f6b59c937f0c39a67ba09936e9ef688bcea59` |
| HEAD subject | `Record WP3C connection EAN internal decisions` |
| index | empty |
| tracked worktree | clean before this batch |
| known pre-existing untracked files | `deno.lock`; three connection/signup proof sources; four baseline/recovery proof sources; Wave 1 rollback proposal; Wave 1 proposals `001` through `005` |
| local database action | read-only catalog and aggregate queries inside explicit `READ ONLY` transactions |
| remote action | none; remote location truth remains UNKNOWN |

No row-level PII or address value was selected. Only catalog metadata, categorical counts, and aggregate row counts were read.

## 3. Sources Read

### 3.1 Canon And Domain Sources

- `docs/app/00_CANON.md`
- `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md`
- `docs/app/06_NEA_REQUIREMENTS.md`
- `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md`
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md`
- `docs/app/08_NEA_TRACEABILITY_MATRIX.md`
- `docs/app/09_NEA_MVP_PLAN.md`
- `docs/app/contracts/connection-ean-and-aangeslotene.md`
- `docs/app/contracts/customer-party-representation-case.md`
- `docs/app/contracts/audit.md`
- `docs/app/contracts/intake-verification-promotion.md`
- `docs/app/contracts/signup-dashboard.md`
- `docs/app/operations/wp3b-connection-ean-object-disposition.md`
- `docs/app/operations/wp3c-connection-ean-internal-domain-decisions.md`
- `docs/app/operations/nea-implementation-roadmap.md`
- `docs/app/architecture/signup-intake.md`
- `docs/app/architecture/schema.md`
- `docs/app/04_TODO.md`
- `docs/app/03_CHANGELOG_APPEND_ONLY.md`

The official local TKV snapshot was read directly:

| source | bytes | pages | SHA-256 |
|---|---:|---:|---|
| `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf` | 832788 | 10 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |

Relevant mapped requirements are `NEA-EAN-002`, `NEA-CHG-001` through `NEA-CHG-003`, `NEA-MID-002`, `NEA-MAND-002`, `NEA-MAND-003`, `NEA-MAND-005`, `NEA-VER-003`, `NEA-VER-004`, `NEA-VER-007`, `NEA-VER-010` through `NEA-VER-014`, `NEA-AUD-002`, `NEA-COR-001`, `NEA-RET-001`, and `NEA-SEC-001/002`. The TKV requires reconstructable location-change information and verifier-controlled location work; it does not prescribe the candidate physical table names in the bounded contract.

### 3.2 Current Source And Provenance Inputs

| source | repository status | SHA-256 | relevance |
|---|---|---|---|
| `supabase/migrations/20260708120000_app_locations_chargers_schema.sql` | tracked; introduced by commit `ba296dd7b0367779615f2c3758344c52d267970e` | `5fd71a98c8beb9e56908f44987ec632592582a0e5ca25ae398225ac5f0bdafcd` | canonical source for current dossier locations and chargers |
| `supabase/migrations/20260708133000_app_document_legal_slots_schema.sql` | tracked | `b401e4d921f378fa85befd566ac8a2c5ab706b312a5bc496f8a75b67f31bb368` | current location-scoped document-slot FK |
| `supabase/baseline-proposals/wave-1/002_app_case_location_foundation.sql` | pre-existing untracked proposal only | `324867ef92b98923c7b871fa3695efcdcfb2d492f1e50e4f97541f9bb7b16c16` | conflicting mutable case-bound `app_locations` proposal; not CURRENT and not TARGET authority |
| `supabase/functions/api-app-signup-submit/index.ts` | tracked runtime | `201c820845e66cf80495c123f6211ac8a10bb397585fe5470dc025305941df9d` | writes current location snapshots |
| `supabase/functions/api-app-dashboard-get/index.ts` | tracked runtime | `e8b99f467e4764c9f46f194209c7ac7e80f31b01076067cdbb359d1a06ae3e86` | reads and projects current location snapshots |
| `supabase/functions/_shared/app_customer_auth.ts` | tracked helper | `78de0479456fc8583d3e8ccf8162e2d03a29c61f843756250bf3d81d5d74cd72` | authorizes customer/dossier access, not location truth |
| `app/src/features/signup/address/addressLookup.ts` | tracked frontend | `c78571557af7116d2bab7525558da2c0924a39ade037808939ac55d9bc694fac` | direct PDOK observation and optional fallback |
| `app/src/features/signup/signupSubmitMapper.ts` | tracked frontend | `dc10c6e9973f3c88ff6eda96036cf38cb045cb680403b223166d0f27b8a12939` | maps declared/resolved address into submit payload |
| `app/src/features/dashboard/dashboardReadClient.ts` | tracked frontend | `edd56d867fe97abc75aa17ad9d8850bf990568ec252fa57fac6fbe23859bf516` | consumes customer-safe location projection |
| `app/src/features/dashboard/ActivePrivateDashboard.tsx` | tracked frontend | `36c903cdd29cac42afebcf45f09587b408d3a87af790536ac09049d9c202081d` | renders read-only address and charger-location association |

Relevant Git history:

| migration / proof / proposal | latest introducing history | history conclusion |
|---|---|---|
| `20260708120000_app_locations_chargers_schema.sql` | `ba296dd7b0367779615f2c3758344c52d267970e` — `Add app locations and chargers schema migration` | tracked canonical source |
| `20260708133000_app_document_legal_slots_schema.sql` | `051190e2cfe54796313324d8a769b5c422244c9c` — `Add app document and legal slots schema migration` | tracked canonical source |
| `scripts/proofs/api-app-dashboard-get.proof.ts` | `5cce922da0bbf8be583e1292942cae526602f31e` — `Add customer-safe app dashboard read` | tracked current projection proof source |
| `app/src/features/documents/documentUploadLocalIntegration.proof.ts` | `2ea1f7c88551ee4112a96e7bc0c44899c64d855a` — `Add reusable customer document cards` | tracked current transport integration proof source |
| Wave 1 proposal `002` | none | untracked proposal; no commit history |
| two old connection proofs | none | untracked; no commit history; `PROVE AGAIN` |

Local `supabase_migrations.schema_migrations` exists but has zero rows. Versions `20260708120000`, `20260708133000`, `20260720120000`, and `20260720143000` are absent. The tracked migration plus matching local catalog establish source/catalog consistency for the current object shape, but not normal migration-tooling provenance or remote parity.

## 4. Exact CURRENT `app_dossier_locations` Inventory

### 4.1 Responsibility And Identity

The table is a mutable address snapshot under one dossier. Its primary key is a row identifier, while `(dossier_id, client_location_id)` preserves signup-payload mapping only. Neither key is proven stable physical-location identity across dossiers, cases, corrections, relocations, split/merge events, or time.

### 4.2 Columns

| ordinal | column | type | null | default | current meaning |
|---:|---|---|---|---|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` | dossier-location row ID |
| 2 | `dossier_id` | `uuid` | no | none | owning dossier; cascade-delete FK |
| 3 | `client_location_id` | `text` | no | none | client-generated submit mapping key |
| 4 | `label` | `text` | yes | none | optional display label |
| 5 | `status` | `text` | no | `submitted` | mutable dossier-processing state |
| 6 | `postcode_normalized` | `text` | no | none | submitted normalized address component |
| 7 | `house_number` | `text` | no | none | submitted house-number component |
| 8 | `suffix_normalized` | `text` | yes | none | optional submitted suffix |
| 9 | `street` | `text` | yes | none | declared/lookup-derived value, not separately classified |
| 10 | `city` | `text` | yes | none | declared/lookup-derived value, not separately classified |
| 11 | `country` | `text` | no | `Nederland` | submitted/default country text |
| 12 | `lookup_provider` | `text` | yes | none | unbounded provider label |
| 13 | `lookup_provider_id` | `text` | yes | none | untyped external identifier |
| 14 | `lookup_metadata` | `jsonb` | no | `{}` | minimized lookup metadata mixed into current snapshot |
| 15 | `created_at` | `timestamptz` | no | `now()` | row creation time |
| 16 | `updated_at` | `timestamptz` | no | `now()` | mutable last-update time |

Missing from the current object:

- stable cross-context root identity;
- immutable location version ID;
- business `valid_from` and `valid_to`;
- explicit `recorded_at`;
- declared/observed/accepted classification;
- source/artifact/version/content-hash provenance;
- request and actor provenance for the row;
- explicit decision, decision reason, and reviewer;
- supersession root, predecessor, and successor semantics;
- correction-versus-relocation classification;
- conflict preservation;
- external observation retrieval/freshness metadata;
- split/merge or uncertainty representation.

### 4.3 Constraints And Indexes

| type | object | exact behavior |
|---|---|---|
| PK | `app_dossier_locations_pkey` | primary key on `id` |
| FK | `app_dossier_locations_dossier_id_fkey` | `dossier_id -> app_customer_dossiers(id) ON DELETE CASCADE` |
| unique | `app_dossier_locations_dossier_client_location_key` | unique `(dossier_id, client_location_id)` |
| check | `app_dossier_locations_status_chk` | `submitted`, `needs_review`, `accepted_for_processing`, `needs_customer_action`, `rejected_or_paused` |
| index | `app_dossier_locations_dossier_id_idx` | `dossier_id` |
| index | `app_dossier_locations_status_idx` | `status` |

There is no normalized-address uniqueness, external-ID uniqueness, temporal check, non-overlap constraint, immutable-version constraint, one-successor constraint, cycle guard, or stable-root constraint. Address/postcode/house number uniqueness would not be an acceptable substitute for physical-location identity.

### 4.4 Trigger, Mutability, RLS, Policies, And Grants

| item | CURRENT catalog |
|---|---|
| trigger | `trg_app_dossier_locations_updated_at` invokes shared `app_set_updated_at()` before every update |
| UPDATE | permitted to `service_role`; all business columns can be silently overwritten |
| DELETE | permitted to `service_role`; dossier deletion also cascades to location |
| RLS | enabled; not forced for owner |
| policy | one permissive `deny_all`, `FOR ALL`, roles `anon, authenticated`, `USING false`, `WITH CHECK false` |
| `public` | explicitly revoked by migration |
| `anon` | no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` |
| `authenticated` | no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` |
| `service_role` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |

The current customer read path is not a table policy: `api-app-dashboard-get` reads as the server and emits a customer-safe projection after `app_customer_identities` and dossier-access checks. That projection is useful as a safety pattern, but the current projected ID and status still expose the mutable dossier-row semantics.

### 4.5 Aggregate Data Shape

No row values were read.

| measure | count |
|---|---:|
| `app_dossier_locations` rows | 44 |
| `status = submitted` | 44 |
| `label IS NULL` | 6 |
| `suffix_normalized IS NULL` | 42 |
| `street IS NULL` | 0 |
| `city IS NULL` | 0 |
| `lookup_provider IS NULL` | 39 |
| `lookup_provider = pdok` | 5 |
| `lookup_provider_id IS NULL` | 37 |
| `lookup_metadata = {}` | 40 |
| `created_at = updated_at` | 44 |

These counts show current data, not semantic acceptance. A populated street/city or PDOK identifier does not turn a declaration or lookup result into accepted physical-location truth.

## 5. Inbound Relationships And Delete Semantics

| dependent object | current rows | linked rows | FK behavior | consequence |
|---|---:|---:|---|---|
| `app_dossier_chargers.location_id` | 68 | 68 | `ON DELETE CASCADE` | deleting a dossier-location deletes charger snapshots |
| `app_dossier_document_slots.location_id` | 429 | 73 | `ON DELETE SET NULL` | deleting a location detaches historical/current evidence slots |
| `app_connections.location_id` | 0 | 0 | `ON DELETE RESTRICT` | ignored old-model connection object fixes location to dossier row |
| `app_connection_periods.location_id` | 0 | 0 | `ON DELETE RESTRICT` | ignored old-model period object repeats that dependency |

Three local functions name `app_dossier_locations`: `app_connections_boundary_guard()`, `app_connection_periods_boundary_guard()`, and `app_declare_connection_v1(...)`. These are part of the already-conflicting WP3A/WP3B connection model. They are not reusable location contract authority.

No current party, party-profile-version, case, authority, mandate, accepted evidence, allocation point, or charge-point root references `app_dossier_locations`.

## 6. Caller And Consumer Table

| caller / object | file / module / function | read or write | input | output / dependency | CURRENT status | customer-visible | replacement risk |
|---|---|---|---|---|---|---|---|
| signup submit | `supabase/functions/api-app-signup-submit/index.ts`; `normalizeLocation`, submit handler | WRITE | declared address, optional client PDOK-derived fields, client location ID | inserts one mutable snapshot; returns IDs/counts; maps chargers and slots to row ID | tracked runtime; locally proven as wider signup flow | indirect receipt | high: additive target needs dual-write/cutover or explicit bridge; current writes cannot be silently redirected |
| dashboard get | `supabase/functions/api-app-dashboard-get/index.ts`; `loadDashboardReadModel`, `mapLocation` | READ | authenticated customer + dossier ID | address projection and location UUID | tracked runtime; locally proven | yes | high: response ID/status/address shape is consumed by frontend and charger joins |
| Auth bootstrap | `supabase/functions/api-app-auth-bootstrap/index.ts` and `_shared/app_customer_auth.ts` | no direct location access | verified Auth user, identity, dossier | dossier summaries/access only | relevant boundary, not a location caller | dossier list only | low direct; must never infer location ownership/truth from Auth or account |
| charger rows | `app_dossier_chargers.location_id`; signup and dashboard modules | WRITE + READ by surrounding runtime | current dossier-location UUID | every current charger points to one dossier location | 68/68 linked | yes through dashboard | critical: cascade delete and ID replacement can orphan/delete or misattach charger history |
| document slots | `app_dossier_document_slots.location_id`; signup, dashboard, document endpoints | WRITE + READ | current dossier-location UUID, nullable by slot scope | 73 of 429 slots have location link; upload/download/withdraw endpoints authorize slot, not location truth | current transport/history foundation | yes through dashboard | high: `SET NULL` can erase relationship context; evidence acceptance remains separate |
| document files/versions | document endpoint family | no direct location-table query | slot/file/version IDs | inherits location context only through slot | current immutable file/version transport | file summary visible | medium: target links must preserve exact historical location-version reliance without rewriting file/version history |
| signup frontend | `AddressFields`, `addressLookup`, `signupSubmitMapper`, `SignupPageShell` | external READ + payload WRITE | postcode, number, suffix; direct PDOK response | declared draft plus `lookupProvider=pdok`, provider ID and resolved lookup key | current browser flow | yes | high: browser lookup must remain an observation and cannot choose accepted root/version |
| dashboard frontend | `dashboardReadClient`, `dashboardTypes`, `ActivePrivateDashboard` | READ | dashboard safe projection | renders address; joins charger by `location_id` | current read-only UI | yes | high: projection adapter required before target IDs/versions replace current row semantics |
| direct PDOK lookup | `app/src/features/signup/address/addressLookup.ts`; `lookupAddressViaPdok` | external READ only | normalized address query | street, city, returned document ID labeled `bagId` | current UX lookup | yes | high semantic risk: PDOK result/source/freshness is not accepted BAG truth |
| configured lookup fallback | `lookupAddressViaConfiguredEndpoint` -> `api-signup-address-lookup` | intended external READ | normalized address query | same frontend result shape | caller exists; fallback endpoint source is not present in current repository | yes when configured | blocked/unknown: capability is referenced but not implemented here |
| invoice PDF parser | `app/src/features/invoice-analysis/invoicePdfParserAdapter.ts`; `extractInvoiceObservedFieldsFromText`; `InvoicePdfPreviewPanel` | local file READ/derived preview | selected PDF bytes and optional expected customer name | versioned `observed_fields`, including address components, confidence and limitations | current client preview; no location DB write | yes in signup preview | high semantic risk if derived address is promoted; keep as observation only |
| legacy analysis matcher | `supabase/functions/_shared/analysis.ts`; `evaluateInvoiceAddress` | derived READ/compare | legacy declared dossier address plus observed invoice fields | pass/fail/inconclusive analysis rows | legacy/source material only | no direct current app projection | do not reuse as acceptance; comparison/evaluation separation is logic-only input |
| legacy address save | `api-dossier-address-save` | legacy WRITE to `dossiers` | legacy session + address + PDOK result | overwrites legacy address and `address_bag_id`; audit event | source material only; separate legacy schema | legacy customer | do not reuse: mutable verification flag and overwrite model conflict |
| legacy address verify | `api-dossier-address-verify` | legacy external READ | legacy session + address | preview plus audit | source material only | legacy customer | logic-only input at most; does not create target observation/evidence acceptance |
| connection proofs | untracked `app-ean-connection-domain-foundation.proof.ts`, `app-connection-write-rpcs.proof.ts` | disposable local INSERT/DELETE | proof dossier-location rows | old connection proof fixtures | `PROVE AGAIN` under WP3B/WP3C | no | cannot prove TARGET location identity/version/concurrency |
| dashboard proof | `scripts/proofs/api-app-dashboard-get.proof.ts` | local fixture WRITE + endpoint READ | dossier/location/charger fixtures | safe read projection assertions | useful current caller proof | no | reuse projection/cleanup patterns only; target semantics need new proof |
| document integration proof | `app/src/features/documents/documentUploadLocalIntegration.proof.ts` | local fixture WRITE/cleanup | current location/charger/slot rows | upload transport integration | useful current transport proof | no | reuse isolation/cleanup only; it does not prove accepted location or historical version pinning |
| Wave 1 proposal | `baseline-proposals/wave-1/002_app_case_location_foundation.sql` | not executed by this audit | case-bound mutable address row | proposed `app_locations`, connections, chargers, charge points | untracked proposal; not CURRENT | no | conflicts with stable root/version/observation TARGET and must not be treated as a migration |

Inspected runtime/UI structure:

- services/helpers: `api-app-signup-submit`, `api-app-dashboard-get`, `api-app-auth-bootstrap`, `_shared/app_customer_auth`, document endpoint slot reads, signup address normalizers/lookup/hook/mapper, dashboard client/cache/hook, client PDF parser, and legacy analysis/address helpers;
- components/layout: `AddressFields`, `PersonalInfoSection`, `ChargerInfoSection`, `InvoicePdfPreviewPanel`, `DashboardPageShell`, and `ActivePrivateDashboard`;
- styling: `app/src/styles/tokens.css`, `base.css`, `layout.css`, `components.css`, `utilities.css`, and `global.css`, including shared form-grid, address-status and read-only overview patterns.

Reusable patterns are backend validation and scoped idempotency, server-derived safe projection, deny-all RLS/no-browser access, explicit FK/join discipline, parser kind/version plus confidence/limitations, address normalization/deduplication, proof isolation/protected counts/cleanup, and the WP2B-I deterministic-lock/deferred-check proof form. None of these patterns supplies location identity or acceptance semantics.

CSS reuse: not applicable. WP3D creates no runtime or visual behavior, so no component, layout, design-token, CSS, or inline-style change is needed.

Proof hashes:

- dashboard proof: `1f4c0d1474524e06b8395e21eb3841fcb6f8c67e4b8efa016fd921cc6a69886e`;
- document integration proof: `efa36b6decb38ace53657cad2fa7236884a949ffff5a94d9111d2d60bdfa8a7a`;
- old connection RPC proof: `6d271aa83c236b5336340c83117edf4d8f56bddaee42c86a026284f1a07c6391`;
- old connection foundation proof: `5b3cb099313aa25a2d908c02123a2e60093100fe0b79180abe844a64f781b7ee`.

No proof was run in WP3D. Hash and source inspection are not a green location-foundation proof.

## 7. Hard Truth Boundaries

- Auth proves credential control and verified email only. It does not prove a location, physical presence, occupancy, ownership, operational control, delivery, connection, or eligibility.
- An account or customer is not a location.
- A party or party-profile version is not a location.
- A case is not a location and does not own a location.
- A dossier-location row is not a stable physical location root.
- An address, postcode, house number, suffix, address string, or normalized tuple is not physical-location identity.
- A BAG, PDOK, or other provider ID is an external observation. It is not automatically accepted identity, evidence, freshness, or physical truth.
- A case-location link is administrative. It creates no ownership, occupancy, operational control, connection, aangeslotene status, authority, mandate, evidence acceptance, eligibility, or settlement entitlement.
- A party-location link does not prove ownership, occupancy, usage rights, control, or authority.
- An allocation-point-location link does not prove an EAN, aangeslotene claim, eligible construct, or calendar-year exclusivity.
- A charger-location link does not prove a charge point, MID conformity, kWh delivery, transport use, eligibility, or booking.
- Upload, parser output, browser lookup, declared address, and external result remain respectively declared, observed, or derived until a separate authorized decision accepts a specific version for a specific purpose.
- Location truth never creates representation authority, a mandate, evidence acceptance, verifier approval, booking eligibility, or settlement/payout truth.

## 8. CURRENT Conflicts With TARGET

| conflict | evidence | risk |
|---|---|---|
| dossier row is treated as location identity | PK plus dossier ownership; no stable root | same physical site across dossiers/cases cannot be referenced safely |
| mutable snapshot | service-role UPDATE/DELETE; only `updated_at` trigger | correction or relocation silently overwrites historical truth |
| cascade ownership | dossier delete cascades location and chargers | location/asset history can disappear with administrative dossier lifecycle |
| no business time | no `valid_from`/`valid_to` | cannot reconstruct the site/address applicable to connection, charger, mandate, evidence, or visit |
| no recorded-time model | only mutable creation/update timestamps | cannot distinguish what was true from when ENVAL learned/recorded it |
| declaration and observation mixed | address plus provider fields in one row | browser/PDOK result can appear equivalent to accepted truth |
| untyped external ID | free-text provider and provider ID | source namespace, version, retrieval time, freshness, conflict, and re-use are unresolved |
| mutable status as acceptance proxy | `accepted_for_processing` in same row | processing status can be mistaken for location evidence/identity acceptance |
| no supersession | no root/predecessor/successor/decision fields | no linear history, correction reason, or reliance trace |
| no concurrency protection | no deterministic root lock or deferred chain check | future competing accepted versions could both commit |
| dependent current IDs | chargers, slots, dashboard contract | direct replacement would break product joins and historical context |
| conflicting proposal | untracked case-bound mutable `app_locations` | duplicate mutable root model may be mistaken for approved target |

## 9. Current Object Disposition

Only the approved disposition vocabulary is used. A row count of zero, 44, or any other value never authorizes deletion or automatic migration.

| object / caller | CURRENT role | rows / data impact | dependency | conflict | reusable logic | disposition | replacement precondition | retirement precondition | rollback / audit risk |
|---|---|---|---|---|---|---|---|---|---|
| `app_dossier_locations` and its location portion of migration `20260708120000` | mutable dossier address snapshot | 44 protected rows | signup, dashboard, 68 chargers, 73 slots, old zero-row connections | no stable root/version/observation/time/supersession; cascade ownership | column normalization and client mapping are source inputs only | REPLACE | approved exact contract; additive schema/proof; mapping and caller plan | protected export/reconciliation, cutover proof, rollback plan, remote inventory, explicit retirement approval | loss or false merge of customer/site history |
| PK/unique/status/address indexes and checks | current row integrity and query support | all 44 rows | current table and callers | enforce dossier/client/status, not stable/temporal identity | exact status/index inventory and negative-test form | REPLACE | approved root/version/query semantics | retired only with table replacement and query parity | retaining them can legitimize wrong identity; removing early breaks callers |
| `trg_app_dossier_locations_updated_at` | maintains mutable `updated_at` | fires on any current UPDATE | shared `app_set_updated_at()` | enables overwrite rather than immutable history | none for immutable location truth | REPLACE | append-only target proven | current write path retired and table frozen/retired | silent overwrite or timestamp provenance loss |
| shared `app_set_updated_at()` | generic timestamp helper | used beyond location | multiple mutable app tables | not itself a location conflict | shared helper for legitimately mutable objects | KEEP | no replacement needed | not applicable; do not attach to immutable target | accidental reuse on immutable history |
| deny-all RLS and server projection pattern | blocks direct client table use | all current rows | policies plus Edge server reads | current target semantics are wrong, access boundary is sound | deny-all/no-browser/server-safe-projection form | KEEP | exact new policies/grants/projection proof | not applicable | policy drift could expose address/provenance |
| `service_role SELECT/INSERT` | server read/create capability | all current rows | Edge Functions | compatible only with immutable target objects | minimum-grant pattern | KEEP | exact per-object least-privilege proof | not applicable | overly broad grants bypass domain functions |
| current `service_role UPDATE/DELETE` | mutable/destructive capability | all 44 rows and cascades | current signup/support-capable server | silent overwrite and destructive history loss | none | REPLACE | append-only correction function and denial proof | current table write/cutover retired explicitly | data loss, detached slots, deleted chargers |
| signup location writer | normalizes payload and inserts current snapshots | creates every new current location plus charger/slot IDs | `api-app-signup-submit` response/idempotency/audit | declaration and lookup observation enter one mutable row | backend validation, idempotency, request/audit, mapping discipline | REPAIR | approved promotion/dual-write/bridge and failure semantics | old write disabled only after replay/cutover parity | split writes, duplicate roots, partial dossier |
| dashboard read/projection | reads current snapshot and returns safe address/ID/status | exposes all selected-dossier locations | Auth/dossier helper and frontend contract | row ID/status presented as location semantics | server authorization, redaction and safe DTO boundary | EXTEND | approved operational-version selection and compatibility DTO | old fields removed only after client compatibility proof | wrong current version or privacy leak |
| dashboard frontend consumer | parses/renders location and joins charger by ID | customer-visible current addresses | dashboard DTO | assumes one mutable row/current ID | strict parser, unavailable state, read-only overview | REPAIR | stable projection adapter and browser/source proof | old DTO removed only after compatibility release gate | missing/misattached charger location |
| `app_dossier_chargers.location_id` | mandatory current charger-location FK | 68/68 chargers linked | current table; `ON DELETE CASCADE` | charger snapshot is not charge-point root; cascade destroys history | explicit FK and join discipline | REPLACE | later charger/charge-point contract and typed location relationship | data mapping, charger caller proof, separate asset retirement approval | charger loss or wrong physical-site association |
| `app_dossier_document_slots.location_id` | optional current slot-location FK | 73/429 slots linked | current table; `ON DELETE SET NULL`; document endpoints via slot | link is not exact version-pinned and can disappear | scoped slot/link and immutable file/version patterns | REPAIR | evidence contract and exact historical location/version reliance | old FK removed only after evidence reconciliation and retention decision | unreconstructable evidence context |
| PDOK signup lookup/mapper | browser address observation and payload metadata | 5 current rows label provider `pdok`; 37 provider IDs present overall | direct external call, fallback reference, signup writer | source/freshness/transformation/acceptance are not persisted separately | normalization, request dedupe, memory cache, explicit ambiguity error | REPAIR | approved observation/source/privacy contract and server validation | current payload path retired only after replacement caller proof | stale/ambiguous provider result becomes truth |
| invoice parser/preview | derives observed address fields from local PDF | no direct location rows | selected signup file/client preview | derived output could be mistaken for location evidence | parser kind/version, confidence, limitations, observed-field split | KEEP | keep strictly observation-only; later adapter contract if persisted | not a retirement target in WP3D | false auto-promotion or PII over-retention |
| ignored connection objects referring to dossier location | old connection boundary | 0 connection/period rows | three local functions and two old proofs | fixes connection to wrong dossier root | named same-scope guard and half-open predicate only | REPLACE | approved and proven location foundation plus connection DDL-ready contract | every WP3B retirement gate and explicit approval | old and new connection truth become mixed |
| old connection proofs | disposable fixtures/assertions | create/delete old-model locations | ignored migrations and old roots | encode conflicting identity and mutable model | isolation, negative tests, counts, cleanup, true-race harness ideas | PROVE AGAIN | exact new contract and migration | old proof classification retained as evidence; no deletion here | false CURRENT PROVEN claim |
| dashboard/document proofs | current projection/transport proof | protected fixture data only | current IDs and rows | do not prove target roots/versions/observations | isolation, protected counts/hashes, cleanup, no-client-write assertions | PROVE AGAIN | target DTO/relationship contract | keep historical proof; supersede claims only with new evidence | source proof mistaken for target proof |
| Wave 1 proposal `002` location parts | mutable case-bound proposal | untracked; not applied by WP3D | proposed cases/connections/chargers | duplicates the rejected mutable root model | object decomposition is inventory input only | BLOCKED | new approved DDL-ready contract; never promote proposal directly | no retirement action until source-governance decision | accidental apply or false schema authority |
| legacy address endpoints | legacy PDOK preview/save and overwrite | separate legacy data, not inventoried as current app rows | legacy dossier sessions/schema | mutable `verified`/overwrite model | lookup parsing, audit-event and ambiguity handling as logic-only input | RETIRE AFTER REPLACEMENT PROOF | legacy/runtime retirement inventory | proven replacement, remote caller/data inventory, rollback and explicit retirement approval | breaks legacy users or loses address audit |
| current 44 locations and dependent rows | protected customer data | 44 locations; 68 chargers; 429 slots; 286 files; 164 versions | live current app | existing data is not automatic stable-root truth | none without explicit mapping decision | BLOCKED | mapping, retention, legal hold, minimization, cutover and rollback decisions | never retire merely because replacement exists | irreversible false mapping, deletion, or evidence detachment |

## 10. Readiness Blockers

### 10.1 Daan Decisions

The bounded contract contains the exact decision matrix. At minimum, DDL remains blocked on:

- stable-root identity and creation authority;
- accepted-location-version semantics;
- correction versus administrative address change versus physical relocation;
- statusless immutable versions versus a closed status vocabulary;
- whether one and only one operational version per root/time is required;
- external-ID namespace and re-use/change semantics;
- PDOK/BAG observation and acceptance boundary;
- case, allocation-point, charge-point, and party link cardinality and version pinning;
- supersession and split/merge behavior;
- transaction-end and concurrency enforcement;
- exact grants and customer-safe projection;
- current-object disposition and migration/cutover strategy.

### 10.2 External Decisions

- authoritative PDOK/BAG source semantics, identifier namespace, issue/retrieval time, freshness, change and re-use behavior;
- evidence a verifier accepts for location identity, substantial change, physical situation, and location visits;
- DSO/CAR location semantics and whether its address is identity, observation, correspondence, or service-location data;
- secondary allocation/MLOEA and same-site semantics;
- role and evidentiary value of a physical visit;
- accepted evidence categories, reviewer qualifications, conflict and insufficiency handling;
- retention and legal hold for location history and external observations;
- privacy, purpose limitation, minimization, raw payload storage, and customer-safe projection.

### 10.3 Proof And Migration Gates

Any later approved implementation must prove:

- exact object inventory, constraints, indexes, triggers, policies, functions, and grants;
- stable roots are immutable and do not embed address truth;
- immutable versions have valid half-open intervals and separate `recorded_at`;
- explicit linear supersession has one successor, no cycles, increasing record time, and root/scope preservation;
- invalid intervals, unauthorized overlap, silent UPDATE/DELETE, and cross-root links fail;
- deterministic root locking plus deferred transaction-end checks resist true concurrent writes;
- declaration, parser, PDOK/BAG result, upload, and evidence cannot self-promote;
- accepted version and evidence decision remain separate;
- later address/provider/profile information does not rewrite historical reliance;
- case, party, allocation-point, charge-point, authority, mandate, evidence, eligibility, verifier, and settlement truths remain separate;
- all new tables use deny-all RLS, no client grants, no browser writes, and minimal explicit service-role access;
- customer read uses a safe projection rather than raw tables;
- signup/dashboard/document caller compatibility is explicit;
- all 24 current `app_*` table counts and protected source hashes remain unchanged by disposable proof data;
- proof records are isolated and fully removed;
- forward-only migration, rollback, audit, backfill, cutover, and retirement gates are separately approved.

## 11. Conclusion

CURRENT truth is sufficiently inventoried to identify the conflict, but it is not safe to treat the populated mutable dossier snapshot as the TARGET root or to begin DDL. The bounded contract may be discussed and decided; the current object, callers, data, and external-source gaps make implementation and retirement unsafe.

BLOCKED — CURRENT LOCATION OBJECTS CONFLICT WITH TARGET
