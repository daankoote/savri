# Location Foundation Contract

TARGET — WP3E INTERNAL LOCATION DOMAIN DECISIONS APPROVED — EXTERNAL BLOCKERS OPEN / NOT DDL READY

## 1. Contract Boundary

This document is the bounded TARGET locationfoundation contract. Daan approved
only `WP3E-LOC-01` through `WP3E-LOC-16` in
`operations/wp3e-location-internal-domain-decisions.md`. It is not CURRENT
truth, legal advice, external-source acceptance, an approved schema, a column
contract, DDL authorization, implementation proof, backfill/cutover approval,
data-migration authorization, or retirement approval.

The approved TARGET direction follows WP3C package B:

- location is a separate bounded foundation;
- a stable location root, immutable versions, and address observations are separate responsibilities;
- an address string is not stable physical-location identity;
- the current `app_dossier_locations` row is not automatically the TARGET location object;
- correction, administrative change, and physical relocation must remain reconstructable.

The CURRENT evidence and conflict verdict remain in the unchanged
`operations/wp3d-location-current-truth-readiness-audit.md`. WP3E changes the
internal package from candidate direction to approved TARGET only; implementation remains
`NOT IMPLEMENTED`, proof remains `NOT PROVEN`, and the external blockers remain
`OPEN`.

## 2. Hard Separation Of Truth

| concept | proves | never proves by itself |
|---|---|---|
| Auth | credential control and verified email | location, presence, ownership, occupancy, control, connection, authority, mandate, evidence acceptance |
| customer/account | commercial/account relationship | party identity, physical site, ownership, occupancy, operational control |
| party/profile | a versioned person or organization profile | location identity or a relationship to a location |
| case | administrative work context | location ownership, control, authority, mandate, connection, eligibility |
| location root | stable internal identity for one accepted physical-site continuity | address correctness, party relationship, connection, charger, evidence sufficiency |
| location version | immutable accepted description of the root for a business-time interval | how the fact was proven or whether a verifier accepts it |
| address observation | a declared, parsed, provider-returned, or manually observed candidate | acceptance, root identity, evidence sufficiency |
| evidence | an exact artifact/source/version potentially supporting or contradicting a claim | acceptance without a separate authorized decision |
| acceptance decision | an authorized decision for a specific purpose and exact inputs | verifier judgment, connection truth, authority, mandate, eligibility |
| case-location link | administrative case use | ownership, occupancy, control, aangeslotene, authority, mandate |
| party-location link | a separately decided typed relationship | ownership, occupancy, control, authority unless that exact relation is separately evidenced and decided |
| allocation-point-location link | physical/administrative association for a period | EAN acceptance, aangeslotene, eligible construct, year exclusivity |
| charge-point-location link | physical association for a period | MID conformity, kWh, transport use, eligibility |

Location truth creates no settlement or payout entitlement.

## 3. Approved Responsibilities And Unapproved Candidate Names

The responsibilities in this section follow the approved package. Names remain
candidate names only. They approve no table, column, constraint, vocabulary,
FK, index, trigger, policy, grant, RPC, or migration.

| candidate | one responsibility |
|---|---|
| `app_locations` | stable internal root for one physical-location continuity |
| `app_location_versions` | immutable accepted location-description versions with business validity and recorded time |
| `app_location_address_observations` | immutable declared, parsed, provider-returned, or manual address observations and provenance |
| `app_case_locations` | administrative, typed, time-bound case-to-location use |
| `app_allocation_point_locations` | typed, time-bound allocation-point-to-location relationship |
| `app_charge_point_locations` | future typed, time-bound charge-point-to-location relationship |

External location identifiers are a separate semantic responsibility inside the immutable observation/source boundary: namespaced, provenance-bound, time-aware, and never root identity by default. This contract intentionally names no extra candidate table for them.

Not proposed:

- generic EAV;
- generic ownership/occupancy/role engine;
- generic evidence or decision engine;
- party-location relationship table without a separately approved real business need;
- connection, allocation-point, charger, charge-point, MID, kWh, authority, mandate, eligibility, verifier, or settlement implementation.

Evidence acceptance and customer-safe projection remain separate responsibilities. Raw provider payloads remain outside the core location root/version/relationship objects.

## 4. Stable Root Rules

Approved TARGET under `WP3E-LOC-01` and `WP3E-LOC-02`:

1. `location_id` is an opaque, server-assigned stable identifier. It is never derived from address, postcode, house number, BAG/PDOK/provider ID, coordinates, customer, party, case, connection, allocation point, or charger.
2. A root represents continuity of one physical site, not one address string, dossier, customer, party, case, connection, allocation point, charger, or provider record.
3. A root contains no mutable address truth and no customer, party, case, ownership, occupancy, operational-control, connection, eligibility, or lifecycle status. It is append-only after creation.
4. A root is not created merely because a browser supplied an address, PDOK returned a document ID, a parser found an address, a dossier was submitted, or a file was uploaded.
5. Root creation requires an explicit, attributable server-side operation under a later approved decision/evidence contract.
6. The same site used by multiple cases or parties remains one root only when the accepted identity decision establishes continuity. Equality of normalized address fields is insufficient.
7. Uncertainty does not force a merge. Separate candidates remain separate or blocked until an authorized decision establishes continuity.
8. A later profile, case, address, external-source, or relationship change never rewrites root identity or historical version reliance.

### 4.1 Same-Site Correction

Approved TARGET under `WP3E-LOC-07`: a typographical, formatting, postcode,
street-name, municipality, or provider-ID correction that does not change the
accepted physical site creates a new immutable version on the same root. The
earlier version remains historically addressable.

This default is not self-executing. The correction must cite exact observations/evidence, actor, request, reason, decision, and predecessor.

### 4.2 Administrative Registration Change

Approved TARGET under `WP3E-LOC-07`: a registry or addressing-authority change
for the same physical site creates a new version on the same root with explicit
business validity and source provenance. A changed external identifier is
preserved as a new observation; it does not overwrite the earlier identifier.

### 4.3 Physical Relocation

Approved TARGET under `WP3E-LOC-07`: a move to a different physical site
creates a new location root. It must not be modeled as a new address version of
the old physical site. A case, allocation point, or charge point receives a
separately historized relationship to the new root where the applicable
relationship contract requires it.

### 4.4 Split, Merge, And Boundary Change

Approved TARGET under `WP3E-LOC-08`: split and merge are explicit historical
relations and never silently rewrite, combine, reuse, or delete historical
roots. Uncertain physical-boundary changes remain blocked/manual review until
evidence and an explicit decision classify the event.

## 5. Immutable Version Rules

Approved TARGET under `WP3E-LOC-03` through `WP3E-LOC-05` and
`WP3E-LOC-09` through `WP3E-LOC-11`:

- every accepted description has a stable version ID and exactly one stable root;
- a version is an immutable snapshot of the accepted location description;
- business validity and recorded time are separate;
- business validity is half-open `[valid_from, valid_to)`;
- null `valid_to` means unbounded;
- `valid_to` must be later than `valid_from`;
- touching boundaries are allowed;
- `recorded_at` states when ENVAL immutably recorded the version;
- conceptual `source_class`, `source_ref`, `request_id`, actor type/ref, decision time/reason, and an explicit superseded-version reference are required at the approved precision; these labels are contract concepts, not approved columns;
- a successor names exactly one predecessor;
- one version has at most one direct successor;
- a chain has no cycles;
- successor `recorded_at` is later than predecessor `recorded_at`;
- root and version scope cannot change within a chain;
- a later version never updates or deletes its predecessor;
- historical consumers can remain pinned to the exact version on which they relied.

At most one explicitly accepted, non-superseded operational version may exist
per root at every business-time moment. Ambiguous or overlapping candidates do
not become operational until resolved. Acceptance requires traceable actor,
request, source, evidence, decision and time metadata; an observation alone is
insufficient. The exact physical decision representation remains a later
DDL-ready contract detail.

## 6. Address Observation Rules

The following remain distinct observation classes:

- customer-declared address;
- parser/OCR-derived address;
- browser or server PDOK result;
- BAG or another register result;
- manual staff observation;
- physical-visit observation;
- address embodied in an already accepted location version.

Approved TARGET under `WP3E-LOC-06`:

1. Observations are immutable and never self-accept.
2. Each observation records source class, source/reference namespace, exact external identifier where supplied, retrieval/observation time, request and actor provenance, transformation method/version, and a raw-reference plus content hash where applicable.
3. A PDOK result does not rewrite a customer declaration, an existing observation, a location version, or a stable root.
4. A BAG/PDOK/provider identifier is an external observation, not an ENVAL stable root ID.
5. Conflicting observations are preserved side by side and explicitly related as supporting, contradicting, insufficient, superseding, or revoking only under a separately approved evidence/decision contract.
6. Freshness/expiry and acceptance are separate. A recent result is not automatically accepted; an older relied-on result is not silently erased.
7. Raw provider payload belongs in a separately protected source/evidence store with its own retention, access, minimization, and integrity contract, not in core location rows.
8. Parser output is derived. Upload confirmation proves bytes/hash transport only. Client lookup is a UX observation. None creates root or accepted version truth.

## 7. Relationship Rules

### 7.1 Case To Location

Approved TARGET under `WP3E-LOC-12`:

- The relationship is administrative and typed.
- It has its own half-open business validity and recorded time.
- It should pin the exact location version used by the case when historical reliance matters.
- Multiple cases may use the same location when the approved cardinality permits it; a case may use a location without owning it.
- Removing or closing a case-location link never deletes or rewrites the location root, versions, observations, evidence, decisions, or other historical links.
- Exact link purposes, maximum active links, simultaneous cases, required version pinning, and delete behavior remain later replacement-contract details and are not approved here.
- The link creates no party relationship, ownership, occupancy, control, connection, aangeslotene, authority, mandate, evidence acceptance, eligibility, verifier outcome, or settlement entitlement.

### 7.2 Allocation Point To Location

Approved TARGET under `WP3E-LOC-12`:

- The relationship is typed, immutable/versioned, and time-bound.
- It links a separately approved allocation-point root to a location root and, where required, an exact location version.
- It does not create or accept an EAN, connection, aangeslotene claim, primary/secondary construct, mandate, year exclusivity, or eligibility.
- Correction, relocation, primary/secondary/MLOEA, and external-source semantics remain controlled by the separate connection contract and external blockers.

### 7.3 Charge Point To Location

Approved TARGET under `WP3E-LOC-12`:

- This is a future typed, immutable/versioned, time-bound relationship.
- It links a separately approved charge-point root, not the current mutable charger snapshot.
- It does not create charger identity, MID conformity, meter identity, kWh truth, transport-use eligibility, booking, or verifier approval.
- Its concrete shape is blocked until the charger/charge-point/MID foundation is separately approved.

### 7.4 Party To Location

Approved TARGET under `WP3E-LOC-13`: the location foundation contains no
generic owner, occupant, resident, operator, or party-role engine. A
party-location relationship may be added later only for a separately approved
business meaning with its own semantics, provenance, validity, evidence, and
decision rules. A party link can never be used as shorthand for another type
or for representation authority.

## 8. Evidence, Decision, And Projection Separation

Approved no-inference boundary under `WP3E-LOC-14`:

- A location version is core historical truth, not its evidence pack.
- Evidence files/versions, source observations, review tasks, and acceptance decisions remain separate and exact-version referenced.
- The accepted decision must identify the purpose for which a specific version is accepted. Acceptance for dossier processing is not automatically verifier acceptance or connection/eligibility acceptance.
- A customer-safe current-location projection is derived server-side from approved operational semantics.
- Raw observations, conflicts, source payloads, internal reasons, hashes, actor references, and audit rows are not returned directly to the browser.
- Projection does not mutate root, version, observation, evidence, or decision truth.
- Current `api-app-dashboard-get` is a reusable boundary pattern, not a reusable TARGET ID/status contract.

## 9. Security Target

Approved TARGET under `WP3E-LOC-15`.

Every future location-foundation table must:

- have RLS enabled;
- be deny-all;
- expose no `PUBLIC`, `anon`, or `authenticated` browser write;
- allow `service_role` only `SELECT` and `INSERT` for immutable roots and versions;
- deny UPDATE and DELETE on immutable history;
- model corrections append-only;
- return customer data only through a later customer-safe projection.

No frontend hiding, Auth claim, customer ID, dossier ID, or service-role possession substitutes for domain authorization.

Exact schemas, policies, grants, functions, execution privileges, projection
fields, and any additional protected-source boundary remain later
replacement-contract details and are not approved here.

These controls are internal ENVAL architecture. They are not literal NEa
database requirements and do not prove TKV acceptance.

## 10. Transaction, Supersession, And Concurrency Requirements

The business-validity, recording-time, half-open-period, maximum-one-
operational-version and linear-supersession invariants are approved under
`WP3E-LOC-05` and `WP3E-LOC-09` through `WP3E-LOC-11`. A later exact
replacement contract must choose and prove a concurrency mechanism without
changing those invariants:

1. Competing writes for the same location root serialize or conflict safely.
2. The committed transaction state satisfies one-successor, no-cycle,
   root/scope preservation, increasing recorded time, and the approved
   maximum-one-operational-version invariant.
3. Concurrent creation and correction are tested with true separate
   transactions; sequential overlap tests are insufficient.
4. A failed competing transaction leaves none of the approved invariants
   violated.

Advisory locks, deferred constraints, serializable transactions, or another
mechanism are not selected by WP3E. The WP2B-I temporal/concurrency proof
discipline is reusable input, not an approved location mechanism or vocabulary.

## 11. Required Future Proof

Before any implementation can be called `CURRENT PROVEN — LOCAL`, prove at minimum:

- a root contains no mutable address fields;
- an observation cannot create an accepted version;
- Deno/type checking for the proof and any changed runtime source;
- exact object, function, trigger, constraint, index, policy, and grant inventory;
- exact additive file/object scope;
- RLS enabled and no `public`, `anon`, or `authenticated` table privileges;
- no browser writes and no direct customer read policy;
- minimal service-role grants and exact server-function execute grants;
- valid minimal root, version, observation, case-link, and approved relationship inserts;
- invalid root/scope/type combinations rejected;
- invalid and empty temporal intervals rejected;
- touching half-open intervals accepted where applicable;
- unauthorized operational overlap rejected;
- immutable UPDATE and DELETE rejected;
- linear supersession, one successor, no cycles, and increasing record time;
- same-site correction preserves root and predecessor;
- relocation uses a new root;
- split and merge preserve history and uncertainty does not auto-merge;
- customer declaration, parser, upload, PDOK/BAG result, Auth, account, party, case, charger, and document slot cannot simulate acceptance;
- exact historical version remains stable after later address, provider, party-profile, case, and relationship changes;
- case, allocation-point, charge-point, party, authority, mandate, evidence, eligibility, verifier, and settlement boundaries remain technically separate;
- true concurrent competing writes permit only the contract-allowed outcome;
- customer-safe projection hides raw observations, internal reasons, hashes, provenance, and audit rows;
- no location fact infers ownership, mandate, or eligibility;
- an explicit mapping covers all 44 current location rows and proves protected history remains unchanged;
- signup/dashboard/document compatibility or explicitly approved cutover behavior;
- protected source hashes and all existing `app_*` row counts unchanged;
- isolated proof records fully cleaned up;
- no remote action.

## 12. Approved Current Object Disposition Direction

Approved TARGET under `WP3E-LOC-16`. This contract does not authorize
execution.

The current location layer is replaced additively and forward-only. No
retirement, drop, destructive remap, or caller switch occurs before:

- an approved replacement contract;
- a replacement migration;
- green local proof;
- source-to-catalog provenance;
- explicit mapping of all 44 current location rows;
- charger, document, connection, and caller impact analysis;
- a conflict/merge/split queue;
- row-count and data-integrity proof;
- a rollback plan;
- remote inventory;
- a privacy and retention decision;
- explicit execution approval.

The WP3D object-level candidate dispositions remain audit/design input. WP3E
does not separately approve a table, trigger, FK, caller, endpoint, projection,
proposal, proof, or retirement action.

## 13. WP3E Approved Decision Package

The authoritative full wording is in
`operations/wp3e-location-internal-domain-decisions.md`.

| IDs | status | implementation | proof | DDL | data migration | retirement | external blockers |
|---|---|---|---|---|---|---|---|
| `WP3E-LOC-01` through `WP3E-LOC-16` | APPROVED TARGET by Daan | NOT IMPLEMENTED | NOT PROVEN | NOT AUTHORIZED | NOT AUTHORIZED | NOT AUTHORIZED | OPEN |

## 14. TKV Alignment Guard

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

- Stable roots, immutable versions, RLS and grants are internal ENVAL controls.
- They support reconstruction but do not prove TKV acceptance.
- Location acceptance does not replace checks of connection, allocation point,
  metered delivery point, meter, aangeslotene, direct line, on-site generation,
  or an Article 10 construct.
- Visited locations, changes, sources, and decisions remain separately
  reconstructable.
- Data forming part of verification evidence remains available for the
  applicable period.
- The TKV requires verification data to be retained for at least five years
  after the end of the calendar year in which verification occurred.
- Exact ENVAL retention and privacy minimization remain a separately approved
  contract.

This alignment concerns TKV 3.0.4–3.0.5, 3.1.3–3.1.5, and 3.3.2–3.3.4. It
does not make the internal model a literal NEa database requirement or a
verifier-accepted implementation.

## 15. External Blockers

- PDOK/BAG source contract and freshness;
- reliable physical-site matching;
- verifier acceptance of location evidence;
- DSO/CAR semantics;
- primary/secondary/MLOEA;
- location-visit procedure and evidence;
- evidence categories and acceptance;
- privacy/minimization;
- retention beyond the explicit TKV minimum;
- mapping of all 44 current rows;
- remote catalog and caller truth.

External answers do not automatically authorize internal DDL or establish
regulatory acceptance.

## 16. Release Gate

Location foundation remains `NOT DDL READY` until:

1. the approved package is translated into an exact replacement contract;
2. the applicable external blockers are resolved in attributable writing;
3. all 44 current rows and protected history have an explicit mapping;
4. exact columns, types, constraints, functions, policies, grants,
   caller/cutover behavior, data handling, rollback, and proof are approved;
5. a later explicitly authorized additive local migration/proof batch succeeds;
6. no retirement or remote action occurs without its own approval.

Connection/EAN remains location-dependent. Approval of the WP3E internal
package does not authorize location or connection DDL, evidence acceptance,
charger/MID, mandate, authority, kWh, booking, verifier, settlement, remote,
or deployment work.
