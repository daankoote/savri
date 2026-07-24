# WP3A Connection/EAN Current-Truth And Readiness Audit

Status: PROOF ONLY — WP3A CONNECTION/EAN CURRENT-TRUTH READINESS AUDIT

Audit date: 2026-07-24.

This is a read-only current-truth and readiness audit. It approves no contract, schema, migration, proof, runtime, customer projection, CAR/DSO integration, mandate, authority, eligibility decision or deployment.

## Scope, Sources And Evidence Limits

The repository guard passed on `/Users/daankoote/dev/enval`, branch `main`, at exact HEAD `d44379f52125370eb91b0de52098a1df69bd2f92`, subject `Add authority pilot validation brief`, parent `14fe70a175232f30a525e4d139ca5012dc81a4a3`. The index and tracked worktree were clean. Only the explicitly protected pre-existing untracked proof, lock and baseline-proposal artifacts were present.

Read and used:

- `docs/app/00_CANON.md`;
- `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md`;
- `docs/app/06_NEA_REQUIREMENTS.md`;
- `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md`;
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md`;
- `docs/app/08_NEA_TRACEABILITY_MATRIX.md`;
- `docs/app/09_NEA_MVP_PLAN.md`;
- `docs/app/contracts/customer-party-representation-case.md`;
- `docs/app/contracts/auth.md`;
- `docs/app/contracts/audit.md`;
- `docs/app/contracts/intake-verification-promotion.md`;
- `docs/app/operations/nea-implementation-roadmap.md`;
- `docs/app/proofs/wp2b-i-case-party-role-foundation.md`;
- `docs/app/04_TODO.md`;
- `docs/app/03_CHANGELOG_APPEND_ONLY.md`;
- the two local connection migrations and two untracked proof sources;
- the committed WP2A and WP2B-I migrations and proofs;
- read-only local PostgreSQL catalog and migration-history queries;
- current app functions, shared helpers, features, components, styles, tokens and layouts.

The local official TKV snapshot exists, is 832788 bytes and has SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`. Its relevant connection, allocation-point, aangeslotene and mandate passages were rechecked. This audit does not claim a new legal interpretation. The already mapped requirements remain controlling:

- `NEA-EAN-001`: the customer-side legal party must be the aangeslotene for the relevant connection;
- `NEA-EAN-002`: EAN, address, network operator and period must be captured;
- `NEA-EAN-003`: a secondary allocation point alone does not satisfy an unmet primary-connection requirement;
- `NEA-EAN-004`: private-customer/inboekdienstverlener and address/EAN exclusivity applies per calendar year, with the external duplicate source still open;
- `NEA-MAND-002/003`: the mandate carries address/EAN and signer/party fields;
- `NEA-MAND-005`: DSO-query and verifier-location-inspection permissions are signed mandate clauses;
- `NEA-AUD-002`, `NEA-COR-001` and `NEA-SEC-001/002`: provenance, correction history and least privilege apply.

The target architecture classifies connection/EAN as `FULL REBUILD`, physical location as a separate bounded context and CAR/EAN/aangeslotene/DSO capabilities as external. Evidence comes before status; parser output remains observed/derived.

## 1. Actual Object Inventory

### Repository classification

| source | repository state | migration/proof state | local catalog relationship |
|---|---|---|---|
| `supabase/migrations/20260720120000_app_ean_connection_domain_foundation.sql` | ignored by `.gitignore`; not tracked; no Git history | not in committed migrations | its three tables, eight named guard functions, nine triggers, three policies and fifteen indexes are structurally present locally |
| `supabase/migrations/20260720143000_app_connection_write_rpcs.sql` | ignored by `.gitignore`; not tracked; no Git history | not in committed migrations | its audit helper and four RPCs are structurally present locally |
| `scripts/proofs/app-ean-connection-domain-foundation.proof.ts` | untracked; not ignored | proof source only | expects the first migration's objects |
| `scripts/proofs/app-connection-write-rpcs.proof.ts` | untracked; not ignored | proof source only | expects both migrations plus existing audit/idempotency/customer/dossier/location objects |
| WP2A migration/proof | tracked and committed | CURRENT PROVEN — LOCAL within its evidence boundary | its four tables exist locally; version remains absent from local migration history |
| WP2B-I migration/proof/evidence page | tracked and committed | CURRENT PROVEN — LOCAL within its evidence page | its two tables exist locally; version remains absent from local migration history |

Current SHA-256 values:

| source | SHA-256 |
|---|---|
| connection domain migration | `83f278d70c239e890d5892102118c20425e167a6a99b4406588521bb6398cbd4` |
| connection write-RPC migration | `11131138f43fd0560189609160b824175549d1b9019c7781c4180dba1210b371` |
| connection domain proof | `5b3cb099313aa25a2d908c02123a2e60093100fe0b79180abe844a64f781b7ee` |
| connection write-RPC proof | `6d271aa83c236b5336340c83117edf4d8f56bddaee42c86a026284f1a07c6391` |

These hashes identify current local files. They do not prove that the local catalog was created from those exact bytes or that either proof passed against the current state.

### Tables

| object | repository source | local catalog | rowcount | migration history | current evidence status | caller status |
|---|---|---:|---:|---|---|---|
| `app_connections` | ignored `20260720120000` migration | exists; RLS on; 14 constraints; 6 indexes including PK; 3 triggers; 1 deny-all policy | 0 | version `20260720120000` absent; migration history has 0 rows total | OBSERVED — LOCAL; NOT CURRENT PROVEN; historical PASS claim only | no current app/Edge/runtime table caller found |
| `app_connection_periods` | ignored `20260720120000` migration | exists; RLS on; 13 constraints; 4 indexes including PK; 3 triggers; 1 deny-all policy | 0 | absent | OBSERVED — LOCAL; NOT CURRENT PROVEN; historical PASS claim only | no current app/Edge/runtime table caller found |
| `app_connection_ownership_periods` | ignored `20260720120000` migration | exists; RLS on; 14 constraints; 5 indexes including PK; 3 triggers; 1 deny-all policy | 0 | absent | OBSERVED — LOCAL; NOT CURRENT PROVEN; historical PASS claim only | no current app/Edge/runtime table caller found |
| dedicated allocation-point table/object | none | absent | not applicable | not applicable | NOT IMPLEMENTED | none |

`secondary_allocation_point` exists only as a value in `app_connections.connection_type` and `app_connection_periods.configuration_type`. There is no dedicated allocation-point identity, no explicit primary-to-secondary relationship and no separate allocation-point period/history object.

### Connection guard functions and triggers

Eight connection-specific trigger functions exist:

- `app_connection_periods_overlap_guard`;
- `app_connection_ownership_periods_overlap_guard`;
- `app_connections_boundary_guard`;
- `app_connection_periods_boundary_guard`;
- `app_connection_ownership_periods_boundary_guard`;
- `app_connections_transition_guard`;
- `app_connection_periods_transition_guard`;
- `app_connection_ownership_periods_transition_guard`.

They are security-invoker PL/pgSQL functions with `search_path=pg_catalog, public`. The nine triggers are the eight corresponding boundary/overlap/transition triggers plus `trg_app_connections_updated_at`, which reuses the tracked shared helper `app_set_updated_at()`.

The period overlap predicates implement half-open interval comparison. They do not lock a deterministic business key and are not deferrable transaction-end constraints. Direct concurrent service-role inserts therefore have no proof comparable to WP2B-I's advisory-lock/deferred-check proof.

### Write boundary

The following locally exist:

| function | local security | grants | repository/runtime caller |
|---|---|---|---|
| `app_connection_write_audit_event` | `SECURITY DEFINER`; `search_path=""` | `service_role` EXECUTE only, apart from owner | called by the four local RPCs; no Edge/app caller |
| `app_declare_connection_v1` | `SECURITY DEFINER`; `search_path=""` | `service_role` EXECUTE only | proof source only |
| `app_declare_connection_ownership_v1` | `SECURITY DEFINER`; `search_path=""` | `service_role` EXECUTE only | proof source only |
| `app_decide_connection_ownership_v1` | `SECURITY DEFINER`; `search_path=""` | `service_role` EXECUTE only | proof source only |
| `app_supersede_connection_ownership_v1` | `SECURITY DEFINER`; `search_path=""` | `service_role` EXECUTE only | proof source only |

Repository-wide exact-name search found documentation references but no current Edge Function, service, frontend or browser caller. No customer-safe connection projection exists.

### Migration history

`supabase_migrations.schema_migrations` exists and currently contains zero rows. Neither `20260720120000` nor `20260720143000` is registered. Historical changelog text says both files were applied directly to the local container without a reset. Current catalog shape is consistent with those files, but normal migration-tooling apply, exact source-to-catalog provenance and reproducibility are not proven.

## 2. Proof Status

Neither proof was executed in this audit.

Both sources are standalone Deno scripts with no external imports and appear syntactically/structurally compileable. No `deno check` was run, so compileability is not claimed as proven.

### Domain-foundation proof

- destructive opt-in: exact environment gate `ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES`;
- execution target: local Docker container `supabase_db_enval`, database `postgres`;
- expected inventory: three tables, eight guard functions, nine triggers, three policies and fifteen indexes;
- Q1-Q34 cover object/column inventory, RLS/grants, 18-digit EAN syntax, customer/dossier/location boundaries, invalid and half-open periods, overlap, boundary-touching periods, primary/secondary distinction, claim states/decisions, terminal immutability, supersession, provenance, raw-payload absence, protected counts, legacy inventory and cleanup;
- final marker: `app-ean-connection-domain-foundation-proof-ok`;
- cleanup is explicit but performs real DELETE/INSERT/UPDATE operations and is therefore destructive local proof code.

### Write-RPC proof

- destructive opt-in: the same exact environment gate;
- execution target: the same local Docker container;
- expected RPCs: the four service-role write functions;
- Q1-Q36 cover inventory, `SECURITY DEFINER`, empty `search_path`, grants, valid declaration, idempotency replay/conflict, customer/dossier/location scope, audit/idempotency writes, declared ownership, provenance/interval/overlap rejection, decisions, terminal rewrite rejection, supersede history, cleanup and protected counts;
- final marker: `app-connection-write-rpcs-proof-ok`;
- the script creates and deletes customer, dossier, location, connection, audit and idempotency fixtures.

### Available prior evidence

Committed `03_CHANGELOG_APPEND_ONLY.md`, `04_TODO.md`, `08_NEA_TRACEABILITY_MATRIX.md` and `09_NEA_MVP_PLAN.md` contain historical narrative claims that Q1-Q34 and Q1-Q36 passed on 2026-07-20. There is:

- no committed migration source for either version;
- no committed proof source for either proof;
- no committed connection-specific evidence page;
- no captured raw proof output in the repository;
- no recorded source hashes tied to the historical execution;
- no migration-history record.

Therefore the objects may be described as currently observed locally, and the earlier run as historically documented, but the connection foundation and RPC boundary must not currently be called `CURRENT PROVEN — LOCAL`. Untracked proof code and narrative PASS text are insufficient.

## 3. NEa Domain Boundary

| concept | current implementation truth | required boundary / gap |
|---|---|---|
| EAN code | one `ean_normalized` text with exactly 18 digits | syntax only; no checksum, register match, source freshness or accepted evidence |
| address/location | FK to dossier-bound `app_dossier_locations`; periods also pin a location row | physical location is separate from account/dossier, EAN and ownership truth; final location disposition remains open |
| network operator | nullable declared text on connection and nullable text on period | no controlled identity, external result, source version or freshness |
| primary/secondary allocation point | `primary`, `secondary_allocation_point`, `direct_line` labels | no primary-secondary relationship; a secondary label never proves `NEA-EAN-003` compliance |
| aangeslotene | represented as an “ownership” claim against `customer_id` and `dossier_id` | must identify the legal party and exact relied-on party profile/evidence; customer account is not the aangeslotene |
| represented/service-recipient party | absent from connection objects | `service_recipient` is case participation only and never proves aangeslotene, ownership, authority or mandate |
| connection role | absent | no approved role vocabulary or party-to-connection relationship contract |
| ownership/entitlement period | date-bounded customer claim | “ownership” is ambiguous; it must not become representation authority, mandate or financial entitlement |
| calendar year | not modeled on connection or claim | `NEA-EAN-004` and mandate calendar-year truth need separate explicit contracts |
| source/evidence | source labels and free text references | no exact evidence version, external immutable reference, acceptance decision, content hash or contradiction relation |
| CAR/DSO query permission | absent | signed mandate clause owned by the mandate context, never inferred from connection/customer ownership |
| verifier location-inspection permission | absent | signed mandate clause, not connection status |

The following remain strictly separate:

- connection/EAN truth;
- `service_recipient` or `case_contact` case role;
- representation authority;
- ENVAL mandate and mandate evidence;
- customer account and Auth identity;
- physical location;
- charger/MID;
- kWh quantity;
- evidence acceptance and verifier judgment;
- settlement or payout entitlement.

## 4. Temporal Truth

### What exists

- `app_connection_periods` and `app_connection_ownership_periods` use `date valid_from` and optional exclusive `valid_to`.
- Invalid/empty finite intervals are rejected.
- Overlap predicates allow boundary-touching periods.
- `observed_at` and `created_at` are separate from business dates.
- Sequential non-overlapping claims can represent different customers over time.
- Terminal rows reject later update through transition guards.

### Gaps and conflicts

- There is no canonical `recorded_at` field; `observed_at`, `created_at`, `verified_at` and `decided_at` have different meanings and do not replace an explicit recorded-time contract.
- Retroactive registration is unrestricted by decision type, reason, reviewer or policy.
- Direct inserts use non-locking BEFORE triggers; concurrency is not proven.
- The ownership RPC locks the connection row before its overlap check, which serializes that RPC path, but direct service-role inserts remain available and the proof contains no concurrent-transaction test.
- `service_role` has UPDATE on all three tables. Before terminal status, fields outside the selected “core” list can be changed in place; the history is not fully immutable.
- Supersession has no stable root/chain identity, no unique direct-successor constraint, no same-scope composite FK, no cycle guard beyond self-reference and no strictly later recorded-time rule.
- The supersede RPC creates a new row whose own status is `superseded`, while leaving the prior verified row unchanged. A second successor from the same prior row is not prevented. Operational replacement truth is therefore ambiguous.
- `app_connections` uses status rather than business validity for its global active-EAN uniqueness. Historical/current connection identity cannot be reconstructed from a clear time-bound root/version model.
- No exact party profile version is pinned, so later party/profile truth cannot be distinguished from the identity relied upon for a historical connection claim.

WP2A/WP2B-I append-only immutable rows, explicit `recorded_at`, linear same-scope supersession, profile-version pinning, deterministic locking and deferred transaction-end checks are stronger reusable patterns.

## 5. Cardinality And Exclusivity

| rule | current enforcement | classification |
|---|---|---|
| one operational aangeslotene per connection per instant | non-rejected/non-superseded ownership intervals may not overlap, but they point to accounts/dossiers, not legal parties; direct concurrency is unproven | TARGET / REPAIR |
| multiple historical aangeslotenen over time | sequential customer claims are structurally possible | PARTIAL; party semantics absent |
| one private person/inboekdienstverlener per calendar year | absent | BLOCKED — external duplicate source and mandate/party contract |
| one address/EAN/inboekdienstverlener per calendar year | absent; global status-based EAN uniqueness is not the required calendar-year rule | BLOCKED |
| duplicate active EAN | globally rejected for statuses other than rejected/superseded | CURRENT OBSERVED internal guard; requirement fit UNKNOWN |
| overlap between cases | no case reference exists | UNKNOWN / BLOCKED |
| secondary allocation point | label only | TARGET; exact relationship/evidence BLOCKED |
| multiple charge points behind one connection | not modeled in this bounded context | TARGET future charger/charge-point context |

No official requirement found in the mapped set authorizes treating the current global active-EAN unique index as the complete `NEA-EAN-004` rule. No case, authority, mandate, evidence or kWh cardinality may be inferred from it.

## 6. Provenance And Evidence

Current source classes are:

- `customer_declared`;
- `invoice_observed`;
- `car_observed`;
- `network_operator_observed`;
- `manual_review`.

They use free-text `source_reference_type` and `source_reference_id`, plus request and actor references. The write RPCs also reuse `app_idempotency_keys` and `app_audit_events`.

Useful current boundaries:

- declared claims start non-verified;
- observed invoice/CAR/network-operator labels do not automatically verify a claim;
- decision metadata is required for verified/rejected/superseded terminal states;
- raw CAR/provider payload columns are intentionally absent;
- RPC audit and idempotency writes are transactionally colocated.

Missing:

- exact immutable evidence-version or external-result reference;
- source-system/version and retrieval time;
- content/payload hash tied to the evidence, rather than only request idempotency;
- evidence freshness and expiry;
- supports/contradicts/insufficient/revokes relation;
- conflicting-source handling;
- separate evidence-acceptance decision;
- maker/checker or qualified-reviewer separation;
- external CAR/DSO result provenance;
- parser method/version/confidence linkage.

Parser/OCR output remains observed/derived. It cannot create operational connection truth, an accepted EAN, an accepted aangeslotene claim or accepted evidence.

## 7. Security

Read-only catalog result:

- RLS is enabled on all three tables; force-RLS is off.
- Each table has one `deny_all` policy for `anon` and `authenticated`, with `USING false` and `WITH CHECK false`.
- `PUBLIC`, `anon` and `authenticated` have no table privileges.
- `service_role` has exactly `SELECT`, `INSERT` and `UPDATE` on each table; no DELETE.
- the eight guard functions are security invoker with `search_path=pg_catalog, public`;
- the audit helper and four RPCs are `SECURITY DEFINER` with `search_path=""`;
- `PUBLIC`, `anon` and `authenticated` have no EXECUTE grants on those connection functions;
- `service_role` has EXECUTE;
- no browser write path or customer read policy exists;
- no customer-safe projection exists;
- no current Edge Function or service caller exists.

The security surface is deny-by-default for clients. It does not solve the domain conflicts. `service_role` UPDATE and direct INSERT mean the RPCs are not the only possible write path, and there is no committed server caller authorization contract.

## 8. Compatibility With WP2

The connection foundation does not reference:

- `app_parties`;
- `app_party_person_versions`;
- `app_party_organization_versions`;
- `app_cases`;
- `app_case_party_roles`.

Instead, connection, period and ownership boundaries are fixed to `app_customers`, `app_customer_dossiers` and `app_dossier_locations`. This conflicts with the approved WP2 boundaries:

- an account is not a legal party;
- a dossier is not the canonical immutable case root;
- a service-recipient role is not aangeslotene truth;
- a later profile version must not rewrite the historical party relied upon;
- case participation creates neither connection ownership, representation authority nor mandate;
- legal/commercial acceptance and Auth create none of these facts.

The tables are empty, so no existing connection business rows require backfill protection today. That does not authorize replacement or schema work.

## 9. Modular Reuse

### Reuse as accepted patterns

- WP2A actor vocabulary and nonblank opaque actor/request/source references;
- explicit `recorded_at` separate from business validity;
- immutable append-only roots/history;
- restrictive subtype/profile-version references;
- half-open validity;
- same-scope linear supersession with one direct successor;
- deny-all RLS and no client grants;
- `service_role` `SELECT`/`INSERT` only for immutable truth;
- protected rowcount/hash and full-cleanup proof discipline;
- WP2B-I deterministic advisory locking and deferred transaction-end cardinality checks.

### Connection code that deserves logic-only reuse

- 18-numeric-character EAN syntax validation, without claiming registry validity;
- distinction between declared, observed and reviewed/decided data;
- half-open overlap predicate and boundary-touch behavior;
- primary versus secondary/direct construct labels as candidate vocabulary only;
- customer/dossier/location mismatch rejection as a legacy safety check;
- scoped idempotency and minimized audit-event structure;
- safe `SECURITY DEFINER search_path=""`;
- no raw external payload in core connection rows.

### Do not reuse unchanged

- direct account/dossier ownership semantics;
- global status-based EAN uniqueness as the calendar-year rule;
- mutable pre-terminal rows and UPDATE grants;
- the current supersession model;
- single-reviewer “verified” as accepted evidence;
- free-text-only evidence references;
- non-locking overlap triggers for direct inserts;
- exact RPC signatures and their dossier-scoped audit ownership;
- exact proof inventories and customer/dossier assertions.

The two existing proof files cannot be reused unchanged. They encode the conflicting customer/dossier model, expect UPDATE grants and the exact current inventory, and do not test party/profile pinning, case separation, evidence decisions, calendar-year exclusivity or concurrency to WP2B-I standard. Their fixture isolation, negative-test style, local safety gate and cleanup patterns are reusable.

No new runtime, frontend, CSS or generic infrastructure module is needed for this audit. A later implementation must not introduce EAV, a JSON ownership blob or a universal ownership/role engine. It must first receive a single bounded contract and disposition.

Near-duplication risks:

- adding another interval-overlap helper instead of choosing one concurrency-safe domain pattern;
- adding another actor/source vocabulary instead of reusing WP2A;
- adding a second audit/idempotency helper with overlapping responsibility;
- adding connection-specific party/profile guards that duplicate WP2 subtype truth;
- creating a generic connection/role/authority engine that merges separate contexts.

CSS reuse: not applicable.

## 10. Decision Matrix

| subject | CURRENT truth | evidence | requirement | conflict/gap | disposition | Daan decision needed | blocks DDL | proposed future proof |
|---|---|---|---|---|---|---|---|---|
| source/migration provenance | two ignored migrations; history empty | files, Git classification, catalog | audit/reproducibility | no committed migration chain | PROVE AGAIN | yes | yes | committed source hash, tooling apply and catalog parity |
| table existence | three empty tables exist locally | read-only catalog | internal foundation | existence is not target approval | KEEP | no | no | exact inventory and zero protected-row drift |
| EAN syntax | exactly 18 digits | check constraint | `NEA-EAN-002` | registry/checksum truth absent | EXTEND | yes | yes | syntax plus accepted external/manual evidence boundary |
| connection identity | status-bearing row tied to account/dossier/location | table/index | `NEA-EAN-002` | no time-bound stable identity/version contract | BLOCKED | yes | yes | identity/history/duplicate/concurrency matrix |
| active-EAN uniqueness | global partial unique index | catalog | `NEA-EAN-004` | not calendar-year/inboekdienstverlener exclusivity | REPLACE | yes | yes | calendar-bound duplicate scenarios and external-source fallback |
| connection periods | half-open date rows | constraints/triggers | `NEA-EAN-002`; audit | mutable, no recorded-time contract, direct-write race | REPAIR | yes | yes | invalid/touching/overlap/concurrent/retroactive/history proof |
| aangeslotene/ownership | account/dossier claim | ownership table | `NEA-EAN-001` | customer account is not legal party | REPLACE | yes | yes | exact party/profile and later-profile stability proof |
| case linkage | absent | catalog | WP2 boundary | no conscious optional case scope | BLOCKED | yes | yes | no role/ownership inference; explicit stable reference tests |
| secondary allocation point | enum label only | checks | `NEA-EAN-003` | no relationship/evidence/eligibility rule | BLOCKED | yes plus external | yes | primary/secondary relation and negative eligibility proof |
| network operator | nullable text | columns | `NEA-EAN-002` | no source identity/freshness | REPAIR | yes | yes | declared/observed/accepted and conflict tests |
| calendar year | absent | catalog | `NEA-EAN-004`, mandate rules | validity period is not calendar-year exclusivity | BLOCKED | yes plus external | yes | year-boundary and duplicate-source tests |
| evidence | free-text source refs | columns | evidence before status; `NEA-AUD-002` | no exact evidence or acceptance | EXTEND | yes | yes | version/hash/retrieval/freshness/conflict/no-parser-promotion |
| decisions | one actor can set verified/rejected | constraints/RPC | audit/internal controls | no qualified four-eyes or evidence decision | REPAIR | yes | yes | maker/checker/conflict/fail-closed audit |
| supersession | self-link only; ambiguous replacement row | constraints/RPC | `NEA-COR-001` | no linear chain/unique successor/current truth | REPLACE | yes | yes | chain/scope/cycle/concurrent-successor/old-truth proof |
| RLS/client grants | deny-all and no client privileges | catalog | `NEA-SEC-001/002` | none within internal-table boundary | KEEP | no | no | exact policy/grant inventory |
| service-role grants | SELECT/INSERT/UPDATE | catalog | least privilege | UPDATE conflicts with append-only WP2 pattern | REPAIR | yes | yes | no direct mutable history/browser write |
| write RPCs | four secure local RPCs, no runtime caller | catalog/source search | server-side writes | signatures and truth ownership use old model | REPLACE | yes | yes | authz, party/case scope, idem/audit/concurrency/rollback |
| existing proofs | untracked, historical narrative PASS only | source/docs | proof governance | not committed/reproducible; old assertions | PROVE AGAIN | no after contract | yes | revised Deno check plus full isolated proof/evidence page |
| customer projection | absent | source search | customer-safe projection | no approved read contract | BLOCKED | yes | no for internal contract; yes for UI | later auth/redaction/non-enumeration proof |
| CAR/DSO | absent | source/catalog | `NEA-EAN-001/002`; mandate permission | external access/evidence standard unknown | BLOCKED | external plus Daan | yes for accepted external truth | port/manual-fallback provenance and stale/conflict proof |

## 11. Final Verdict

BLOCKED — CURRENT OBJECTS CONFLICT WITH CANON

### Demonstrably exists

- three empty local connection/EAN tables;
- eight connection guard functions, nine triggers, fifteen indexes and three deny-all policies;
- one local audit helper and four service-role-only write RPCs;
- local RLS and grants matching the ignored migration sources;
- historical committed documentation that reports prior local proof runs.

### Demonstrably proven

- current catalog existence, shape, rowcounts, RLS, grants, function security and zero migration-history rows through read-only inspection;
- repository tracked/ignored/untracked classification and current file hashes;
- absence of current app/Edge/runtime callers and customer projection;
- official TKV snapshot availability and exact required SHA-256.

No current connection schema or RPC behavior is promoted to `CURRENT PROVEN — LOCAL`.

### Untracked or proof-only

- both proof scripts are untracked;
- both migration sources are ignored and untracked;
- historical Q1-Q34/Q1-Q36 PASS claims have no raw output, source hashes or committed connection evidence page;
- proof compileability and current runtime behavior were not executed.

### Conflicts

- account/dossier ownership replaces legal-party/profile truth;
- dossier ownership replaces conscious case linkage;
- no historical party-profile pinning;
- global status-based EAN uniqueness replaces unresolved calendar-year exclusivity;
- mutable pre-terminal rows and UPDATE grants conflict with append-only WP2 patterns;
- supersession is not a linear unambiguous replacement chain;
- direct-write concurrency is not proven;
- evidence references, freshness, conflicts and acceptance decisions are incomplete;
- secondary allocation point is a label without its required relationship/evidence contract;
- no runtime caller, safe projection or committed deployment path exists.

### Smallest next bounded batch

`WP3B — connection/EAN domain contract reconciliation and object disposition — DOCS ONLY`.

That batch must decide, without DDL:

1. stable connection/EAN identity and business-validity semantics;
2. exact represented/aangeslotene party and historical profile-version pinning;
3. optional case linkage without service-recipient inference;
4. connection, physical-location and allocation-point relationships;
5. calendar-year and duplicate/exclusivity rules;
6. declared, observed, evaluated, evidence-accepted and operational-decision separation;
7. source hash/version/retrieval/freshness/conflict requirements;
8. immutable history, supersession and concurrency;
9. disposition of each existing table, function, trigger, grant and RPC as keep, repair or replace;
10. exact proof and migration-history gates.

It must end with a separate `DDL READY` or still-blocked decision. It authorizes no migration, proof execution, schema, runtime, frontend or remote action.

### Existing proof reuse

The existing proof files cannot be reused unchanged. Safety gating, fixture isolation, negative assertions, protected counts and cleanup deserve reuse. Object inventory, account/dossier scope, grants, supersession, evidence and concurrency assertions must be reconciled to the approved WP3B contract before a later proof is authorized.

Authority validation continues externally and remains separate. Representation authority stays `NOT SCHEMA READY`.
