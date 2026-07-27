# WP3F Location DDL-Readiness And 44-Row Classification Audit

PROOF ONLY — WP3F LOCATION DDL-READINESS AND 44-ROW CLASSIFICATION AUDIT

## 1. Scope And Authority

This is a docs-only, read-only repository and local-database audit. It
separates empty additive foundation DDL-readiness from current-data migration
and caller-cutover readiness. It creates no migration, SQL file, proof,
database write, accepted location, cutover, retirement, remote action, or
execution authorization.

The controlling TARGET is WP3E decisions `WP3E-LOC-01` through
`WP3E-LOC-16`. WP3E approves domain responsibilities and invariants, not a
physical table, column, constraint, function, policy, grant, RPC, migration,
or concurrency mechanism.

## 2. Execution Guard And Method

| control | observed result |
|---|---|
| repository | `/Users/daankoote/dev/enval` |
| branch | `main` |
| HEAD | `e04f4a695d983c71a52f48d0c3c26ca605bb4402` |
| parent | `88e8c0b754c7d44e769f89037676d9732e6fe63c` |
| subject | `Record WP3E internal location decisions` |
| index before audit | empty |
| tracked worktree before audit | clean |
| untracked state before audit | only the known protected artifacts |
| local SQL | explicit `BEGIN TRANSACTION READ ONLY` and `ROLLBACK` |
| temporary tables/functions | none |
| database writes | none |
| remote action | none |

Catalog queries returned only object names, definitions, counts, roles, and
privileges. The row-classification CTE returned only deterministic aliases,
counts, booleans, closed-vocabulary classifications, and non-identifying
blocking categories. No raw identifier, address, contact data, file metadata,
storage path, or document content was printed or persisted.

## 3. Sources And Current Modules Inspected

The complete required canon, compliance directive, requirements, completeness
audit, architecture, traceability, MVP plan, location/connection/party-case
contracts, WP3B–WP3E records, roadmap, TODO, and append-only changelog were
read. The official ten-page local TKV snapshot was read only after its
SHA-256 matched
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

Repository inspection covered:

- the current location/charger and document-slot migrations;
- both current connection migrations and their guards/RPCs;
- WP2A party and WP2B-I case-role temporal, provenance, immutable,
  advisory-lock, deferred-invariant, RLS, and grant patterns;
- Wave 1 proposals 001–003, including conflicting proposal 002;
- `api-app-signup-submit`, `api-app-dashboard-get`,
  `api-app-auth-bootstrap`, and the shared customer-auth helper;
- document upload, confirm, download, and withdraw flows;
- signup address lookup, normalizers, mapper, fields, and proofs;
- dashboard reader/types/renderer and current projection proofs;
- parser/precheck, direct PDOK lookup, legacy address inputs, and current
  connection proofs;
- shared CSS tokens, base, layout, components, utilities, and global styles.

No runtime or UI module is needed for this audit. CSS reuse is not applicable,
and no inline CSS was found.

## 4. Local CURRENT Inventory

### 4.1 `app_dossier_locations`

| item | observed local result |
|---|---|
| rows | 44 |
| columns | 16 |
| constraints | 4: PK, dossier FK, dossier/client-location unique, mutable status check |
| indexes | 4 |
| non-internal triggers | 1 mutable `updated_at` trigger |
| RLS | enabled |
| policy | one deny-all policy for `anon` and `authenticated` |
| `service_role` grants | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| outbound FKs | dossier FK with `ON DELETE CASCADE` |
| inbound FKs | 4 |
| migration-history rows | 0 total |

The table is a mutable dossier/address snapshot. Its UUID and
`client_location_id` are not stable physical-site identity. It lacks a
statusless root, immutable versions and observations, accepted-version
decision metadata, business/recording-time separation, supersession, split/
merge history, and concurrency-safe operational-version enforcement.

### 4.2 Current References

| current reference | local count | delete/cutover consequence |
|---|---:|---|
| `app_dossier_chargers.location_id` | 68 | `ON DELETE CASCADE`; current ID replacement risks charger loss/mislink |
| `app_dossier_document_slots.location_id` | 73 | `ON DELETE SET NULL`; current ID replacement risks lost evidence context |
| `app_connections.location_id` | 0 | `ON DELETE RESTRICT`; old connection model still fixes the FK shape |
| `app_connection_periods.location_id` | 0 | `ON DELETE RESTRICT`; repeats old location dependency |
| ownership claims through connection | 0 | no data, but old claim/RPC shape remains conflicting source material |

Local functions using current location identity are
`app_connections_boundary_guard`, `app_connection_periods_boundary_guard`,
`app_connections_transition_guard`, and `app_declare_connection_v1`. No
location-dependent view exists.

## 5. Privacy-Safe 44-Row Result

The exact alias table is in
`operations/wp3f-location-44-row-classification.md`.

| classification | count |
|---|---:|
| `POSSIBLE_DUPLICATE` | 44 |
| `ONE_TO_ONE_CANDIDATE` | 0 |
| `POSSIBLE_SPLIT` | 0 |
| `POSSIBLE_MERGE` | 0 |
| `UNRESOLVED` | 0 |
| `DECLARED_ONLY` | 37 |
| `PROVIDER_OBSERVED` | 0 |
| `CONFLICTING` | 7 |
| `INSUFFICIENT` | 0 |
| manual review required | 44 |
| automatic promotion allowed | 0 |

All 44 rows occur in normalized-address clusters larger than one. That result
cannot establish duplicate physical sites, one physical site, split, merge,
or continuity. No current row is safe for automatic accepted-root or
accepted-version promotion.

## 6. Foundation DDL-Readiness By Responsibility

| responsibility | approved contract basis | dependency | open decision | safe as empty additive foundation | safe to populate | safe for caller cutover | proof required | verdict |
|---|---|---|---|---|---|---|---|---|
| `app_locations` | WP3E-01/02: opaque statusless root | exact physical contract and root-creation boundary | table name remains candidate; exact columns/types/defaults/comments, root-creation API and grants not approved | NO | NO | NO | catalog, immutable root, RLS/grants, no-derived-ID, concurrency and cleanup | BLOCKED |
| `app_location_versions` | WP3E-03–05/07/09–11 | accepted-decision and exact temporal contract | exact columns/types, acceptance representation, operational predicate, correction metadata, successor enforcement and concurrency mechanism open | NO | NO | NO | immutable update/delete denial, half-open/touching/overlap, one operational version, linear chain/cycle and true concurrency | BLOCKED |
| `app_location_address_observations` | WP3E-06 | source/evidence/privacy/retention contract | exact observation vocabulary, raw reference/hash, freshness/conflict representation, minimization, retention and `service_role` grants open | NO | NO | NO | no-auto-accept, provenance, source conflict, RLS/grants, privacy and retention | BLOCKED |
| location split/merge relations | WP3E-08 | proven root identity and separate relationship contract | object responsibility/name, relation vocabulary, cardinality, time, evidence, decision and uncertainty queue open | NO | NO | NO | no silent merge/delete, preserved history, invalid relation/cycle and concurrency | BLOCKED |
| `app_case_locations` | WP3E-12 | WP2B-I case plus exact link contract | purpose vocabulary, maximum active links, pinning, deletion and simultaneous-case rules explicitly open | NO | NO | NO | cardinality, version pin, no ownership/authority inference and history | BLOCKED |
| `app_allocation_point_locations` | WP3E-12 and WP3C separation | proven location and later connection/allocation-point foundation | point/version scope, primary/secondary/MLOEA, DSO/CAR and evidence semantics open | NO | NO | NO | temporal relationship, relocation, no EAN/aangeslotene inference and external evidence | BLOCKED |
| `app_charge_point_locations` | WP3E-12 | later charger/charge-point/MID contract | charge-point root and exact link shape are not DDL-ready | NO | NO | NO | history, relocation, no MID/kWh/eligibility inference | BLOCKED |
| customer-safe location projection | WP3E-15 | proven core plus authorization/projection contract | exact fields, root/version ID exposure, status vocabulary, redaction and caller compatibility open | NO | NO | NO | authz, redaction, stable historical projection and browser proof | BLOCKED |
| operational write RPCs | WP3E-04/05/11/15 | exact tables, acceptance decision, audit/idempotency and authorization | signatures, actor/source/evidence inputs, deterministic lock key, deferred validation, execute grants and error contract open | NO | NO | NO | idempotency, audit, safe errors, advisory locking, transaction-end invariants and true concurrent transactions | BLOCKED |
| current-data migration | WP3E-16 forward-only replacement | exact replacement, 44-row decisions, caller/FK plan, privacy/retention and rollback | every row needs manual physical-site decision; mapping and cutover contracts absent | NO | NO | NO | 44-row reconciliation, protected history, row counts, zero loss, rollback and caller parity | BLOCKED |

### 6.1 Why The Minimum Additive Foundation Is Not Yet Safe

The three core responsibilities are sufficiently separated at domain level,
but WP3E explicitly leaves their physical names as candidates and explicitly
does not approve columns, types, constraints, policies, grants, functions,
RPCs, or a migration. In particular:

- the exact accepted-version representation and operational predicate are open;
- observation privacy, retention, provenance and grant details are open;
- WP3E does not select advisory locking, deferred constraints, serializable
  transactions, or another concurrency mechanism;
- deterministic lock scope and transaction-end validation are therefore not
  exact;
- `service_role` `SELECT`/`INSERT` is explicit for immutable roots/versions,
  but the minimum observation privileges and all function execute grants are
  not exact;
- the future proof list is broad, but no exact object/function/grant inventory
  exists against which a migration can be written.

Consequently, even an empty additive three-table migration would make
unapproved physical decisions. Current rows must not be copied into any first
foundation migration.

## 7. Current Caller Disposition

Only the permitted disposition vocabulary is used. No row authorizes
retirement.

| current caller/object | disposition | evidence and precondition |
|---|---|---|
| `app_dossier_locations` | REPLACE | populated mutable dossier snapshot; preserve until exact replacement, 44-row mapping, proof, cutover and rollback approval |
| `app_dossier_chargers.location_id` | REPLACE | 68 cascade-bound references require a proven historical bridge and later charge-point contract |
| `app_dossier_document_slots.location_id` | REPAIR | 73 links need exact historical root/version reliance without rewriting document history |
| current connection location FKs | REPLACE | old dossier-location scope conflicts with WP3C/WP3E; zero rows do not authorize removal |
| `api-app-signup-submit` | REPAIR | current writer inserts mutable snapshot and binds chargers/slots; future observation/root writes need a separate authorized contract |
| `api-app-dashboard-get` | REPAIR | safe projection boundary is reusable, but current ID/status/address contract is not |
| signup frontend | REPAIR | declared/PDOK data may remain observation input but cannot select accepted root/version |
| dashboard frontend | REPAIR | joins chargers by current location UUID and consumes mutable status/address projection |
| PDOK lookup | REPAIR | lookup is usable only as provenance/freshness-bound observation; `bagId` naming cannot establish BAG or site truth |
| baseline proposal 002 | BLOCKED | mutable case-bound `app_locations` and link shapes conflict with WP3E |
| current location migration `20260708120000` | KEEP | canonical source/catalog provenance for current objects; never edit in place |
| current connection migrations | RETIRE AFTER REPLACEMENT PROOF | conflicting source material; retain until replacement/catalog/caller/rollback proof and explicit cleanup approval |
| current connection RPCs | REPLACE | old combined connection/location and customer-ownership semantics; safe-error/idempotency/audit patterns are logic-only input |
| current location/connection proofs | PROVE AGAIN | old fixtures and assertions cannot prove WP3E root/version/observation invariants or target concurrency |

## 8. Reusable Patterns And Non-Reusable Semantics

Reusable design/proof inputs:

- WP2A immutable rows, provenance fields, half-open period predicates,
  scope-preserving supersession FKs, one-successor indexes, deny-all RLS, and
  service-role-only table access;
- WP2B-I deterministic advisory locking, deferred transaction-end checks,
  recursive cycle detection, true two-transaction proof, protected-count
  checks, and cleanup discipline;
- current app audit/idempotency forms, safe `SECURITY DEFINER` search path,
  minimized audit payloads, and safe errors;
- current dashboard server-side authorization and customer-safe projection
  boundary;
- current document transport/version isolation.

Not reusable as TARGET semantics are current dossier/client location identity,
mutable status/update/delete, address equality, provider ID as root identity,
case/customer ownership inference, old connection location FKs/statuses, and
Wave 1 proposal 002.

## 9. TKV Alignment

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

The classification and future foundation can support reconstruction, location
change history, and later location-visit evidence. They do not prove verifier
acceptance, connection, allocation point, metered delivery point, meter,
aangeslotene, MID, kWh, or eligibility. They may not perform automatic
physical-site matching. Consulted sources, visited locations, changes,
evidence, and decisions must later remain separately reconstructable. Internal
roots, immutable versions, RLS, grants, advisory locks, and deferred checks are
ENVAL controls, not literal TKV database requirements.

## 10. Readiness Separation And Next Advice

| gate | status | reason |
|---|---|---|
| foundation DDL design | BLOCKED | physical contract, observation privacy/grants, accepted-version representation, lock key/mechanism and transaction-end implementation are not exact |
| empty additive foundation population | BLOCKED | no approved table shape or write boundary exists |
| current-data migration | BLOCKED | all 44 rows require manual review; no row is auto-promotable |
| caller cutover | BLOCKED | live signup/dashboard and 68 charger plus 73 document-slot references depend on current IDs |
| relation-table DDL | BLOCKED | case/allocation-point/charge-point/split-merge dependencies are not DDL-ready |
| retirement | BLOCKED | replacement, proof, remote inventory, rollback and explicit cleanup approval are absent |

The single executable next advice is a docs-only WP3G physical-contract
decision limited to the empty `app_locations`, `app_location_versions`, and
`app_location_address_observations` responsibilities. It must approve exact
columns/types/defaults, accepted-version and operational predicates,
observation privacy/retention/provenance, constraints/indexes, deterministic
advisory-lock scope, transaction-end validation, RLS/policies/grants,
server-only RPC signatures/execute grants, comments, and an exact future proof
matrix. It must exclude relation tables, current-row copying, caller changes,
retirement, remote action, and implementation authorization.

BLOCKED — LOCATION DDL DESIGN NOT SAFE
