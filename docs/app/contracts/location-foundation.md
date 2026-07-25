# Location Foundation Contract

Status: DRAFT — WP3D LOCATION FOUNDATION — NOT APPROVED / NOT DDL READY

## 1. Contract Boundary

This document is a bounded TARGET proposal for discussion and explicit decision. It is not CURRENT truth, legal advice, external-source acceptance, an approved schema, a column contract, DDL authorization, implementation proof, backfill/cutover approval, or retirement approval.

The proposal follows WP3C package B:

- location is a separate bounded foundation;
- a stable location root, immutable versions, and address observations are separate responsibilities;
- an address string is not stable physical-location identity;
- the current `app_dossier_locations` row is not automatically the TARGET location object;
- correction, administrative change, and physical relocation must remain reconstructable.

The CURRENT evidence and conflict verdict are in `operations/wp3d-location-current-truth-readiness-audit.md`.

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

## 3. Unapproved Candidate Responsibilities

Names in this section are candidate names only. They approve no table, column, constraint, vocabulary, FK, index, trigger, policy, grant, or migration.

| candidate | one responsibility |
|---|---|
| `app_locations` | stable internal root for one physical-location continuity |
| `app_location_versions` | immutable accepted location-description versions with business validity and recorded time |
| `app_location_address_observations` | immutable declared, parsed, provider-returned, or manual address observations and provenance |
| `app_case_locations` | administrative, typed, time-bound case-to-location use |
| `app_allocation_point_locations` | typed, time-bound allocation-point-to-location relationship |
| `app_charge_point_locations` | future typed, time-bound charge-point-to-location relationship |

External location identifiers are a separate semantic responsibility inside the immutable observation/source boundary: namespaced, provenance-bound, time-aware, and never root identity by default. This draft intentionally names no extra candidate table for them.

Not proposed:

- generic EAV;
- generic ownership/occupancy/role engine;
- generic evidence or decision engine;
- party-location relationship table without a separately approved real business need;
- connection, allocation-point, charger, charge-point, MID, kWh, authority, mandate, eligibility, verifier, or settlement implementation.

Evidence acceptance and customer-safe projection remain separate responsibilities. Raw provider payloads remain outside the core location root/version/relationship objects.

## 4. Stable Root Rules

Proposed TARGET:

1. `location_id` is an opaque, server-assigned stable identifier. It is never derived from address, postcode, house number, BAG/PDOK/provider ID, coordinates, customer, party, case, connection, allocation point, or charger.
2. A root represents continuity of one physical site, not one address string, dossier, customer, party, case, connection, allocation point, charger, or provider record.
3. A root contains no mutable address truth and no customer, party, case, ownership, occupancy, operational-control, connection, eligibility, or lifecycle status. It is append-only after creation.
4. A root is not created merely because a browser supplied an address, PDOK returned a document ID, a parser found an address, a dossier was submitted, or a file was uploaded.
5. Root creation requires an explicit, attributable server-side operation under a later approved decision/evidence contract.
6. The same site used by multiple cases or parties remains one root only when the accepted identity decision establishes continuity. Equality of normalized address fields is insufficient.
7. Uncertainty does not force a merge. Separate candidates remain separate or blocked until an authorized decision establishes continuity.
8. A later profile, case, address, external-source, or relationship change never rewrites root identity or historical version reliance.

### 4.1 Same-Site Correction

Proposed default: a typographical, formatting, postcode, street-name, municipality, or provider-ID correction that does not change the accepted physical site creates a new immutable version on the same root. The earlier version remains historically addressable.

This default is not self-executing. The correction must cite exact observations/evidence, actor, request, reason, decision, and predecessor.

### 4.2 Administrative Registration Change

Proposed default: a registry or addressing-authority change for the same physical site creates a new version on the same root with explicit business validity and source provenance. A changed external identifier is preserved as a new observation; it does not overwrite the earlier identifier.

### 4.3 Physical Relocation

Proposed default: a move to a different physical site creates a new location root. It must not be modeled as a new address version of the old physical site. A case, party, allocation point, or charge point can receive a separately historized relationship to the new root.

### 4.4 Split, Merge, And Boundary Change

Proposed default: split, merge, parcel/building restructuring, campus subdivision, or uncertain physical-boundary change is blocked/manual review. It requires an explicit later relationship/correction contract. No root is silently reused, merged, or deleted.

## 5. Immutable Version Rules

Proposed TARGET:

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

Open internal decision: whether there must be at most one operational accepted version per root at every business-time moment, and which exact state or decision makes a version operational. The conservative default is yes: ambiguous or overlapping accepted versions do not become operational until resolved. This default is not DDL-approved.

Versions should be statusless if acceptance is represented entirely by a separate immutable decision. If product workflows require a closed version-status vocabulary, that vocabulary must be explicitly approved and may not combine declaration, observation, review, evidence, or verifier outcomes.

## 6. Address Observation Rules

The following remain distinct observation classes:

- customer-declared address;
- parser/OCR-derived address;
- browser or server PDOK result;
- BAG or another register result;
- manual staff observation;
- physical-visit observation;
- address embodied in an already accepted location version.

Proposed TARGET:

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

- The relationship is administrative and typed.
- It has its own half-open business validity and recorded time.
- It should pin the exact location version used by the case when historical reliance matters.
- Multiple cases may use the same location when the approved cardinality permits it; a case may use a location without owning it.
- Removing or closing a case-location link never deletes or rewrites the location root, versions, observations, evidence, decisions, or other historical links.
- Exact link purposes, maximum active links, simultaneous cases, required version pinning, and delete behavior remain Daan decisions.
- The link creates no party relationship, ownership, occupancy, control, connection, aangeslotene, authority, mandate, evidence acceptance, eligibility, verifier outcome, or settlement entitlement.

### 7.2 Allocation Point To Location

- The relationship is typed, immutable/versioned, and time-bound.
- It links a separately approved allocation-point root to a location root and, where required, an exact location version.
- It does not create or accept an EAN, connection, aangeslotene claim, primary/secondary construct, mandate, year exclusivity, or eligibility.
- Correction, relocation, primary/secondary/MLOEA, and external-source semantics remain controlled by the separate connection contract and external blockers.

### 7.3 Charge Point To Location

- This is a future typed, immutable/versioned, time-bound relationship.
- It links a separately approved charge-point root, not the current mutable charger snapshot.
- It does not create charger identity, MID conformity, meter identity, kWh truth, transport-use eligibility, booking, or verifier approval.
- Its concrete shape is blocked until the charger/charge-point/MID foundation is separately approved.

### 7.4 Party To Location

No generic party-location relationship is proposed. If a later bounded need exists, every relationship type—such as declared contact, occupant, owner, operator, user, lessor, or establishment—must have separate semantics, provenance, validity, evidence and decision rules. A party link can never be used as shorthand for a different type or for representation authority.

## 8. Evidence, Decision, And Projection Separation

- A location version is core historical truth, not its evidence pack.
- Evidence files/versions, source observations, review tasks, and acceptance decisions remain separate and exact-version referenced.
- The accepted decision must identify the purpose for which a specific version is accepted. Acceptance for dossier processing is not automatically verifier acceptance or connection/eligibility acceptance.
- A customer-safe current-location projection is derived server-side from approved operational semantics.
- Raw observations, conflicts, source payloads, internal reasons, hashes, actor references, and audit rows are not returned directly to the browser.
- Projection does not mutate root, version, observation, evidence, or decision truth.
- Current `api-app-dashboard-get` is a reusable boundary pattern, not a reusable TARGET ID/status contract.

## 9. Security Target

Every future location-foundation table must:

- be in `public` with an additive `app_*` name only after explicit approval;
- have RLS enabled;
- have deny-all policies for `anon` and `authenticated`;
- revoke all privileges from `public`, `anon`, and `authenticated`;
- expose no browser write;
- expose no direct customer table read;
- grant `service_role` only the minimum explicit privileges;
- allow `SELECT` and `INSERT` only for immutable roots, versions, observations, and immutable relationships unless a separately justified mutable operational object is approved;
- deny UPDATE and DELETE on immutable history;
- keep transaction functions server-only with exact execute grants;
- use an empty or explicitly safe search path where `SECURITY DEFINER` is later justified;
- return customer data only through a separately proven customer-safe projection;
- preserve raw external payloads and internal conflict/review data behind stricter separate access boundaries.

No frontend hiding, Auth claim, customer ID, dossier ID, or service-role possession substitutes for domain authorization.

## 10. Transaction, Supersession, And Concurrency Target

Proposed TARGET:

1. Writes for the same location-root business key take a deterministic transaction-scoped advisory lock or an equally proven serialization mechanism.
2. Root creation, version insertion, predecessor/successor validation, business-validity checks, decision linkage, and audit/idempotency complete atomically.
3. Deferred end-of-transaction checks validate one-successor, no-cycle, root/scope preservation, increasing recorded time, and any approved maximum-one-operational-version invariant.
4. Direct table writes cannot bypass the same invariants.
5. Idempotent replay returns the same accepted result; a changed payload under the same key conflicts safely.
6. Concurrent competing versions are tested with true separate transactions. Sequential overlap tests are insufficient.
7. A failed competing transaction leaves no partial root, version, observation, relationship, decision, or audit claim.

The WP2B-I advisory-lock and deferred-constraint pattern is a reusable proof/design pattern. Its case-role vocabulary and object shape are not reusable location semantics. The old connection overlap functions are predicate input only and remain `REPLACE`.

## 11. Required Future Proof

Before any implementation can be called `CURRENT PROVEN — LOCAL`, prove at minimum:

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
- split/merge/uncertainty does not auto-merge;
- customer declaration, parser, upload, PDOK/BAG result, Auth, account, party, case, charger, and document slot cannot simulate acceptance;
- exact historical version remains stable after later address, provider, party-profile, case, and relationship changes;
- case, allocation-point, charge-point, party, authority, mandate, evidence, eligibility, verifier, and settlement boundaries remain technically separate;
- true concurrent competing writes permit only the contract-allowed outcome;
- customer-safe projection hides raw observations, internal reasons, hashes, provenance, and audit rows;
- signup/dashboard/document compatibility or explicitly approved cutover behavior;
- protected source hashes and all existing `app_*` row counts unchanged;
- isolated proof records fully cleaned up;
- no remote action.

## 12. Current Object Disposition Direction

This contract does not authorize execution.

| item | proposed disposition |
|---|---|
| current `app_dossier_locations` object | REPLACE |
| current update trigger and mutable status/overwrite model | REPLACE |
| current client/dossier mapping and aggregate data | BLOCKED pending mapping/retention/cutover decision |
| current deny-all/no-browser pattern | KEEP |
| current server-side safe projection boundary | EXTEND |
| current signup writer | REPAIR |
| current dashboard frontend/backend ID and status contract | REPAIR |
| current charger location FK | REPLACE in later charger/charge-point work |
| current document-slot location FK | REPAIR under exact historical evidence/version linkage |
| old connection location dependencies | REPLACE under WP3C |
| existing location-dependent proofs | PROVE AGAIN |
| Wave 1 mutable `app_locations` proposal | BLOCKED |
| legacy address endpoints | RETIRE AFTER REPLACEMENT PROOF |

No object is dropped, altered, backfilled, cut over, or retired before additive replacement, data/caller proof, rollback/audit planning, remote inventory in a separately authorized batch, and explicit retirement approval.

## 13. Daan Decision Matrix

Every row is `OPEN`. `Daan approval needed` is `YES` for every row. Proposed defaults are conservative discussion inputs, not decisions.

| ID | topic | CURRENT truth | recommended TARGET | alternative requiring an explicit decision | risk | external validation needed | Daan approval needed | blocks contract | blocks DDL | proposed proof |
|---|---|---|---|---|---|---|---|---|---|---|
| LOC-D01 | root identity | dossier row/client ID; address/provider fields mixed | opaque server ID after explicit continuity decision; never address equality | approved deterministic external-root rule | duplicate or incorrectly merged sites | YES — BAG/PDOK and verifier | YES | YES | YES | same/different-site, no-derived-ID, merge-block tests |
| LOC-D02 | accepted version semantics | mutable `status` on snapshot | separate attributable decision on exact immutable version and purpose | approved closed version state with equivalent separation | observation mistaken for truth | YES — verifier/evidence | YES | YES | YES | no-observation-promotion and decision-version pinning |
| LOC-D03 | same-site correction versus relocation | UPDATE can overwrite either | same-site administrative correction stays on root; physical move creates root | approved narrower/wider continuity rule | rewritten history or false continuity | YES — verifier/register | YES | YES | YES | correction preserves root; relocation creates root |
| LOC-D04 | version status | mixed mutable processing vocabulary | statusless immutable version plus separate decision | approved closed version-only vocabulary | review and acceptance collapse | NO, if D02 externally resolved | YES | YES | YES | closed-vocabulary/no-state-inference tests |
| LOC-D05 | operational version | dashboard returns dossier snapshot | only accepted, non-superseded exact version selected by server projection | no operational concept; consumers always pin decisions | ambiguous current truth | YES — evidence/verifier | YES | YES | YES | projection selection and historical-pin tests |
| LOC-D06 | maximum one version per root/time | no temporal rule | at most one operational version per root/business-time; conflicts blocked | multiple operational versions with explicit purpose partitions | contradictory operational truth | NO | YES | YES | YES | interval, touching, overlap and concurrent race tests |
| LOC-D07 | external identifiers | free-text provider and ID on mutable row | immutable namespaced observations; no root identity/uniqueness until validated | approved authoritative external identity mapping | provider re-use/change corrupts identity | YES — BAG/PDOK | YES | YES | YES | namespace, reuse/change and historical-reliance tests |
| LOC-D08 | PDOK/BAG observation | client PDOK result enters snapshot | immutable observation with retrieval/freshness/transformation/raw reference; no auto-accept | approved server-only lookup source contract | stale or ambiguous lookup promoted | YES — BAG/PDOK/privacy | YES | YES | YES | no-auto-accept, conflict and freshness tests |
| LOC-D09 | case cardinality | no case link | multiple typed links when allowed; pin exact relied-on version | approved single active location or root-only link | case ownership inference or stale context | NO | YES | YES | YES | cardinality, link-delete, pinning and no-inference tests |
| LOC-D10 | allocation-point relation | old zero-row objects reference dossier location | typed immutable time-bound relation; pin version when relied upon | root-only or version-only relationship | connection bound to wrong site/time | YES — DSO/CAR/MLOEA/verifier | YES | YES | YES | temporal, relocation and no-EAN-inference tests |
| LOC-D11 | charge-point relation | current charger FK cascades to snapshot | defer to future charge-point root and typed time-bound relation | approved bounded bridge from current charger | MID/kWh/eligibility inference | YES — verifier/evidence | YES | NO | YES | no-MID/kWh/eligibility inference and history tests |
| LOC-D12 | party-location relation | none | none in foundation | separately typed, evidenced, time-bound relationship | generic ownership/occupancy engine | YES if a relation is requested | YES | NO | YES for such object | no-ownership/authority inference tests |
| LOC-D13 | supersession | none | linear predecessor chain, one successor, no cycles, root preserved | approved DAG with explicit branch semantics | forked or rewritten history | NO | YES | YES | YES | successor, cycle, record-time and scope tests |
| LOC-D14 | split/merge/uncertainty | not representable | blocked/manual review; no merge/delete in foundation | separately approved root-relationship contract | irreversible identity corruption | YES — BAG/verifier | YES | YES | YES | no-auto-merge and preserved-candidate tests |
| LOC-D15 | concurrency | no location lock/deferred invariant | deterministic root lock plus deferred transaction-end checks | serializable-only design with equivalent proof | write-skew and dual operational versions | NO | YES | YES | YES | true two-transaction create/correct races |
| LOC-D16 | security/grants | deny-all; service-role CRUD | deny-all; immutable service-role `SELECT`/`INSERT`; exact execute only | narrowly approved mutable operational table | silent overwrite or browser access | NO | YES | YES | YES | catalog grants, RLS, client denial, UPDATE/DELETE denial |
| LOC-D17 | current-object disposition | 44 rows plus live FKs/callers | forward additive `REPLACE`; preserve all data until separate cutover/retirement | keep/repair current table under a proven equivalent design | data loss and caller breakage | YES — retention/privacy | YES | YES | YES | protected counts/hashes, caller inventory and rollback |
| LOC-D18 | data migration strategy | no mapping/bridge/cutover plan | decide after DDL-ready contract/proof; no in-place rewrite | approved dual-write, event bridge, or offline mapping variant | mixed truth or irreversible cutover | YES — retention/legal hold | YES | YES | YES | mapping reconciliation, retry, rollback and zero-loss proof |
| LOC-D19 | safe projection | server projects mutable snapshot | accepted/current server projection only; no raw observation/provenance | approved purpose-specific projections | privacy leak or false acceptance signal | YES — privacy | YES | YES | YES | authorization, redaction, stable-ID and stale-version tests |
| LOC-D20 | evidence reliance | no exact evidence/decision pin | exact evidence/source/decision versions linked separately | approved decision-manifest indirection | unreconstructable acceptance | YES — verifier/evidence | YES | YES | YES | later-source-change and historical-reconstruction tests |

Written approval must identify every accepted row and any amended wording. Silence, document creation, or approval of WP3C package B is not approval of this matrix.

## 14. External Blockers

| blocker | written answer needed | blocked decision |
|---|---|---|
| PDOK/BAG authority | source namespace, returned-object meaning, change/re-use behavior, retrieval time, freshness, availability, and permissible retention | LOC-D01, D07, D08 |
| verifier location evidence | accepted evidence categories for site identity, change, charger/site link, substantial change, and visit preparation | LOC-D02, D03, D20 |
| DSO/CAR location | meaning of supplied address/location fields and relationship to connection/allocation point | LOC-D10 |
| secondary/MLOEA | exact primary/secondary physical-location relationship and evidence | LOC-D10, D14 |
| physical visit | whether/how visit observations support identity/change and who may accept them internally | LOC-D02, D08, D20 |
| evidence acceptance | categories, exact versions, freshness, conflicts, insufficiency, reviewer qualification, and four-eyes where needed | LOC-D02, D20 |
| retention/legal hold | period anchors and preservation/minimization rules for roots, versions, observations, raw payloads, decisions, and links | LOC-D17, D18 |
| privacy/minimization | legal basis, purpose, access, customer projection, address/provider-ID minimization, raw payload storage | LOC-D08, D19 |

External answers do not automatically approve internal DDL. Daan must record the bounded internal decision after those answers are attributable and written.

## 15. Release Gate

Location foundation remains `NOT DDL READY` until:

1. the WP3D current-truth conflict is accepted as the migration starting point;
2. Daan resolves the applicable decision matrix in writing;
3. external blockers needed by the chosen scope are resolved in writing;
4. an exact DDL-ready contract defines columns, types, constraints, functions, policies, grants, caller/cutover behavior, data handling, rollback, and proof;
5. a later explicitly authorized additive local migration/proof batch succeeds;
6. no retirement or remote action occurs without its own approval.

Connection/EAN remains location-dependent. Completion or approval of this draft would still not authorize connection DDL, evidence acceptance, charger/MID, mandate, authority, kWh, booking, verifier, settlement, remote, or deployment work.
