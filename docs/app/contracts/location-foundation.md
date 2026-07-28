# Location Foundation Contract

CURRENT PROVEN — LOCAL ONLY — WP3J OPERATIONAL LOCATION WRITE RPCS / CALLER AUTHORIZATION, DATA MIGRATION, REMOTE APPLY AND CUTOVER NOT IMPLEMENTED

## 1. Contract Boundary

This document is the bounded TARGET locationfoundation contract. Daan first
approved `WP3E-LOC-01` through `WP3E-LOC-16` in
`operations/wp3e-location-internal-domain-decisions.md`, the bounded package
`WP3F-B-01` through `WP3F-B-18` in
`operations/wp3fb-location-bounded-ddl-decisions.md`, and the exact physical
schema package 1–8 in
`operations/wp3gb-location-physical-schema-decisions.md`.

WP3G-B closed the six physical-catalog gaps identified by the historical WP3G
readiness audit: exact observation actor/request fields, hash/freshness shape,
normalized descriptor columns, version-to-observation cardinality, acceptance
provenance and timestamp defaults. Package 1–8 remains the APPROVED TARGET
authority. WP3H subsequently implemented and proved only that exact empty
three-table foundation locally. The committed evidence is
`operations/wp3h-location-foundation-local-proof.md`. WP3J subsequently
implemented and proved four bounded operational write RPCs plus three focused
helpers locally. Its evidence is
`operations/wp3j-location-write-rpcs-local-proof.md`.

The approved TARGET direction follows WP3C package B:

- location is a separate bounded foundation;
- a stable location root, immutable versions, and address observations are separate responsibilities;
- an address string is not stable physical-location identity;
- the current `app_dossier_locations` row is not automatically the TARGET location object;
- correction, administrative change, and physical relocation must remain reconstructable.

The CURRENT evidence and conflict verdict remain in the unchanged
`operations/wp3d-location-current-truth-readiness-audit.md`. The historical
WP3F audit and classification and both WP3G documents also remain unchanged.
WP3F remains the proof that DDL was unsafe before the WP3F-B decisions, and
WP3G remains the proof that implementation was unsafe before package 1–8.
The WP3H schema/proof boundary and WP3J operational-RPC/concurrency boundary
are `CURRENT PROVEN — LOCAL ONLY`. Caller authorization, data population and
caller cutover remain `NOT IMPLEMENTED`; retirement remains `NOT AUTHORIZED`;
remote/production remains `NOT PROVEN`; external blockers remain `OPEN`.
Neither proof reinterprets the
historical WP3D, WP3F, WP3G or WP3G-C verdicts.

### WP3H Local Evidence

Implementation commit `3bb8d50cd7723ad631d75857df4e08d6ef0db311`
contains exactly:

- `supabase/migrations/20260728100000_app_location_foundation.sql`, SHA-256
  `c10c3492eda04b2c342200879be7e3b3e98f098269b19b3190d71f61c24c5aa5`;
- `scripts/proofs/app-location-foundation.proof.ts`, SHA-256
  `2570ab01627ff32fed30fe589adf7d6d88af8087a4107307366ba08f5913f1d6`.

The local proof passed 42 of 42 WP3G-Q cases with marker
`app-location-foundation-proof-ok`. It left all three TARGET tables empty,
kept `app_dossier_locations` at 44 rows, and preserved the protected
before/after manifest. The migration was applied directly locally without a
migration-history record. No remote apply, push or deploy occurred.

### WP3J Local Evidence

Implementation commit `45d926478945fedc610ea02a0ff2b0d4f5f14be4`
contains exactly:

- `supabase/migrations/20260728140000_app_location_write_rpcs.sql`, SHA-256
  `171490e672a500d303ca097b8aececda8da7f98ae2411cc5e13cd1cb43a48593`;
- `scripts/proofs/app-location-write-rpcs.proof.ts`, SHA-256
  `9330b086e82cff5ce40fcfa25ab0650023c1e3a92174a613a06035f8ee9d626d`.

The proof passed `WP3J-Q01` through `WP3J-Q42` with marker
`app-location-write-rpcs-proof-ok`. It fresh-applied the definitive migration
from a seven-function-free WP3H-compatible disposable schema, proved exact
migration-body equality with the resulting `pg_proc.prosrc` definitions and
used separate processes/connections for Q35-Q41. All disposable databases were
removed. The three foundation tables stayed empty, `app_dossier_locations`
stayed at 44 rows, and `app_audit_events` and `app_idempotency_keys` stayed at
753 and 306 rows.

The local direct apply is not recorded in remote migration history. No
runtime caller, data population, remote apply, push or deploy occurred.

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

## 3. Approved Bounded Table Responsibilities

WP3F-B approved exactly these physical table names and bounded
responsibilities; WP3G-B approved their exact physical TARGET schema. WP3H
implements and proves these three empty tables locally only.

| approved table | one bounded responsibility |
|---|---|
| `app_locations` | stable internal root for one physical-location continuity |
| `app_location_versions` | immutable accepted location-description versions with business validity and recorded time |
| `app_location_address_observations` | immutable declared, parsed, provider-returned, or manual address observations and provenance |

The WP3H migration created the empty additive foundation. None of the 44
current rows was copied, accepted or changed.

The root contains exactly:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `created_at timestamptz NOT NULL DEFAULT clock_timestamp()`;
- `created_by_actor_ref text NOT NULL`;
- `created_from_request_id text NOT NULL`;
- `creation_basis text NOT NULL`.

`creation_basis` is restricted to `customer_declaration`,
`source_observation` and `manual_migration_review`. Its three text provenance
fields are trimmed and nonblank.

Observations contain exactly:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `location_id uuid NOT NULL`;
- `observation_kind text NOT NULL`;
- `descriptor_kind text NOT NULL`;
- `observed_at timestamptz NOT NULL`;
- `recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()`;
- `recorded_by_actor_ref text NOT NULL`;
- `recorded_from_request_id text NOT NULL`;
- `source_ref_sha256 text NULL`;
- `source_payload_sha256 text NULL`;
- `source_retrieved_at timestamptz NULL`;
- `fresh_until timestamptz NULL`;
- `country_code text NOT NULL`;
- `postal_code text NULL`;
- `house_number integer NULL`;
- `house_number_addition text NULL`;
- `street text NULL`;
- `city text NULL`;
- `site_reference text NULL`.

`location_id` has a foreign key to `app_locations(id) ON DELETE RESTRICT`.
Observations have no document, provider, case or generic-evidence foreign key.
Raw source payloads and raw external/provider IDs remain outside the
foundation.

Versions contain exactly:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `location_id uuid NOT NULL`;
- `accepted_from_observation_id uuid NOT NULL`;
- `descriptor_kind text NOT NULL`;
- `valid_from timestamptz NOT NULL`;
- `valid_to timestamptz NULL`;
- `recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()`;
- `accepted_at timestamptz NOT NULL`;
- `accepted_by_actor_ref text NOT NULL`;
- `accepted_from_request_id text NOT NULL`;
- `acceptance_decision_ref text NOT NULL`;
- `country_code text NOT NULL`;
- `postal_code text NULL`;
- `house_number integer NULL`;
- `house_number_addition text NULL`;
- `street text NULL`;
- `city text NULL`;
- `site_reference text NULL`;
- `supersedes_version_id uuid NULL`;
- `correction_reason text NULL`.

Versions are accepted-only immutable truth. There is no draft, pending or
rejected lifecycle column and none of the three tables has `updated_at`.
Only `app_locations.created_at`,
`app_location_address_observations.recorded_at`, and
`app_location_versions.recorded_at` default to `clock_timestamp()`. There is
no default on `observed_at`, `source_retrieved_at`, `fresh_until`,
`valid_from`, `valid_to`, or `accepted_at`.

The following responsibilities remain outside this bounded foundation and
their earlier candidate names remain unapproved:

- case-locationlinks;
- allocation-point-locationlinks;
- charge-point-locationlinks;
- split/merge-relations;
- customer-safe projection;
- authorized runtime caller.

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
`WP3E-LOC-09` through `WP3E-LOC-11`, physically bounded by
`WP3F-B-09` through `WP3F-B-14`, reconciled by the WP3G-B exact physical
package:

- every accepted description has a stable version ID and exactly one stable root;
- a version is an immutable snapshot of the accepted location description;
- the table is accepted-only and has no draft, pending or rejected lifecycle column;
- business validity and recorded time are separate;
- `valid_from`, `valid_to` and `recorded_at` use `timestamptz`;
- business validity is half-open `[valid_from, valid_to)`;
- null `valid_to` means unbounded;
- `valid_to` must be later than `valid_from`;
- touching boundaries are allowed;
- `recorded_at` states when ENVAL immutably recorded the version;
- every version has exactly one `accepted_from_observation_id`;
- `accepted_at`, `accepted_by_actor_ref`, `accepted_from_request_id`, and
  `acceptance_decision_ref` are required, have no defaults, and the text
  references are trimmed and nonblank;
- `acceptance_decision_ref` is unique and opaque;
- `accepted_at` is not later than `recorded_at`;
- `postal_address` requires country, postal code, house number, street and city;
- `site_reference` requires `site_reference`;
- a successor names exactly one predecessor;
- one version has at most one direct successor;
- a chain has no cycles;
- successor `recorded_at` is later than predecessor `recorded_at`;
- correction supersession is only within the same root and requires `correction_reason`;
- root and version scope cannot change within a chain;
- a later version never updates or deletes its predecessor;
- historical consumers can remain pinned to the exact version on which they relied.

At most one explicitly accepted, non-superseded operational version may exist
per root at every business-time moment. Ambiguous or overlapping candidates do
not become operational until resolved. Acceptance requires traceable actor,
request, source, evidence, decision and time metadata; an observation alone is
insufficient. The exact primary accepted input is the same-root observation
identified by `accepted_from_observation_id`. Additional evidence is
referenced through the opaque `acceptance_decision_ref` under a separately
approved evidence/decision contract; the foundation adds no fourth table or
generic evidence foreign key.

## 6. Address Observation Rules

The approved `observation_kind` vocabulary is:

- `customer_declared`;
- `document_parsed`;
- `pdok_observed`;
- `bag_observed`;
- `provider_observed`;
- `manual_observed`;
- `migration_snapshot`.

The approved `descriptor_kind` vocabulary is:

- `postal_address`;
- `site_reference`.

Approved TARGET under `WP3E-LOC-06`, physically bounded by
`WP3F-B-05` through `WP3F-B-08`, reconciled by the WP3G-B exact physical
package:

1. Observations are immutable and never self-accept.
2. Each observation records the exact columns approved in section 3;
   `recorded_by_actor_ref` and `recorded_from_request_id` are trimmed and
   nonblank.
3. A PDOK result does not rewrite a customer declaration, an existing observation, a location version, or a stable root.
4. A BAG/PDOK/provider identifier is not stored raw in the foundation and is never an ENVAL stable root ID.
5. Conflicting observations are preserved side by side and explicitly related as supporting, contradicting, insufficient, superseding, or revoking only under a separately approved evidence/decision contract.
6. Freshness/expiry and acceptance are separate. A recent result is not automatically accepted; an older relied-on result is not silently erased.
7. Raw payload, provider ID, storage path, document content, secret, e-mail and phone are forbidden in observations. `source_ref_sha256` and `source_payload_sha256` are null or exactly 64 lowercase hexadecimal characters.
8. Parser output is derived. Upload confirmation proves bytes/hash transport only. Client lookup is a UX observation. None creates root or accepted version truth.

`document_parsed`, `pdok_observed`, `bag_observed`, and `provider_observed`
require `source_payload_sha256`. `pdok_observed`, `bag_observed`, and
`provider_observed` also require `source_retrieved_at`.
`source_retrieved_at` is not later than `recorded_at`. `fresh_until` is
permitted only with `source_retrieved_at` and must be later than it.
`customer_declared`, `manual_observed`, and `migration_snapshot` prohibit
`fresh_until`.

For both observations and versions, `country_code` is server-normalized,
exactly two uppercase characters and database-enforced as `^[A-Z]{2}$`. A
`postal_address` requires
`country_code`, uppercase-trimmed `postal_code`, positive `house_number`,
trimmed nonblank `street` and `city`, a null-or-trimmed-nonblank
`house_number_addition`, and null `site_reference`. A `site_reference`
requires `country_code` and a trimmed nonblank `site_reference`; all postal
fields are null. Normalization creates no identity, deduplication, merge,
acceptance or matching inference.

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

All three bounded location-foundation tables must:

- have RLS enabled;
- be deny-all;
- expose no privileges to `PUBLIC`, `anon`, or `authenticated`;
- allow `service_role` only `SELECT` and `INSERT`;
- deny UPDATE and DELETE on immutable history;
- model corrections append-only;
- return customer data only through a later customer-safe projection.

No frontend hiding, Auth claim, customer ID, dossier ID, or service-role possession substitutes for domain authorization.

The exact physical schema is approved by WP3G-B and locally proven by WP3H.
WP3J locally proves four service-role-only public RPCs and three non-public
helpers. `service_role` execute is only a technical boundary: projection
fields, operational caller authorization and any additional protected-source
boundary remain later contract responsibilities.

These controls are internal ENVAL architecture. They are not literal NEa
database requirements and do not prove TKV acceptance.

## 10. Transaction, Supersession, And Concurrency Requirements

The business-validity, recording-time, half-open-period, maximum-one-
operational-version and linear-supersession invariants are approved under
`WP3E-LOC-05`, `WP3E-LOC-09` through `WP3E-LOC-11` and
`WP3F-B-12` through `WP3F-B-16`:

1. Competing writes for the same location root serialize or conflict safely.
2. The committed transaction state satisfies one-successor, no-cycle,
   root/scope preservation, increasing recorded time, and the approved
   maximum-one-operational-version invariant.
3. Concurrent creation and correction are tested with true separate
   transactions; sequential overlap tests are insufficient.
4. A failed competing transaction leaves none of the approved invariants
   violated.

Observations and versions each have `UNIQUE (location_id, id)`. Versions use
the composite foreign key `(location_id, accepted_from_observation_id)` to
observations and the composite self-foreign key
`(location_id, supersedes_version_id)` to versions.
`accepted_from_observation_id` is unique across versions. Cross-root
acceptance and correction supersession are prohibited.

Allowed database enforcement is CHECK constraints, composite FKs, partial
unique indexes, immutable guards and deferrable transaction-end constraint
triggers for same-root, cycle, successor and overlap invariants. Later
operational callers must use the four WP3J RPCs, which locally prove one server
transaction, deterministic advisory locking, deferred validation,
idempotency, fail-closed audit and real process-level concurrency. The caller
authorization boundary remains not implemented.

## 11. Proven Foundation And Required Future Proof

WP3H proves the exact empty three-table catalog, constraints, immutable
history, sequential transaction-end temporal/supersession behavior, RLS,
minimum grants, rollback, protected counts/hashes and absence of a write
route at the WP3H boundary. WP3J later proves four bounded local operational
RPCs, transactionally fail-closed audit/idempotency, advisory locking, fresh
migration apply and true concurrency. It does not prove the later caller and
relationship responsibilities below:

- authorized operational caller roles and use-case context;
- server-derived actor, case/dossier, party and authority enforcement;
- four-eyes decisions where required;
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

## 13. Approved Decision Packages

The authoritative full wording is in
`operations/wp3e-location-internal-domain-decisions.md`,
`operations/wp3fb-location-bounded-ddl-decisions.md`, and
`operations/wp3gb-location-physical-schema-decisions.md`.

| IDs | status | implementation | proof | migration | data population | caller cutover | retirement | external blockers |
|---|---|---|---|---|---|---|---|---|
| `WP3E-LOC-01` through `WP3E-LOC-16` | APPROVED TARGET by Daan | NOT IMPLEMENTED | NOT PROVEN | NOT AUTHORIZED | NOT AUTHORIZED | BLOCKED | NOT AUTHORIZED | OPEN |
| `WP3F-B-01` through `WP3F-B-18` | APPROVED TARGET by Daan | NOT IMPLEMENTED | NOT PROVEN | NOT AUTHORIZED | NOT AUTHORIZED | BLOCKED | NOT AUTHORIZED | OPEN |
| WP3G-B package 1–8 | APPROVED TARGET by Daan | NOT IMPLEMENTED | NOT PROVEN | NOT AUTHORIZED | BLOCKED | BLOCKED | NOT AUTHORIZED | OPEN |
| WP3H empty bounded foundation | CURRENT PROVEN — LOCAL ONLY | CURRENT PROVEN — LOCAL ONLY | 42/42 PASS | LOCAL DIRECT APPLY; NO HISTORY RECORD | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT AUTHORIZED | OPEN |
| WP3J operational write RPCs | CURRENT PROVEN — LOCAL ONLY | CURRENT PROVEN — LOCAL ONLY | 42/42 PASS INCLUDING FRESH APPLY AND REAL CONCURRENCY | LOCAL DIRECT APPLY; NO REMOTE HISTORY RECORD | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT AUTHORIZED | OPEN |

The first three rows preserve the statuses of the historical decision
packages. The WP3H row records the later bounded implementation/proof outcome;
it does not rewrite those decision records.

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

- 44-row migrationmapping;
- authorized operational caller boundary;
- data population;
- physical-site matching;
- PDOK/BAG broncontract;
- verifieracceptatie;
- case-locationlinks;
- allocation-point-locationlinks;
- charge-point-locationlinks;
- split/merge-relaties;
- customer-safe projection;
- caller-cutover;
- current-table retirement;
- privacy en definitieve retention.

External answers do not automatically authorize internal DDL or establish
regulatory acceptance.

## 16. Implementation And Release Gate

The exact bounded three-table physical schema is
`CURRENT PROVEN — LOCAL ONLY` through WP3H. Four bounded operational write
RPCs, fresh migration apply and real concurrency are
`CURRENT PROVEN — LOCAL ONLY` through WP3J. Caller authorization, data
population and caller cutover remain `NOT IMPLEMENTED`; remote/production
remains `NOT PROVEN`; retirement remains `NOT AUTHORIZED`.

1. WP3H is committed in
   `3bb8d50cd7723ad631d75857df4e08d6ef0db311`; its local proof evidence is in
   `operations/wp3h-location-foundation-local-proof.md`.
2. Its first migration is empty and additive and is limited to
   `app_locations`, `app_location_address_observations` and
   `app_location_versions`.
3. No current row was copied, accepted or changed.
4. The exact approved columns, constraints, guards, policies, grants, temporal
   and supersession invariants have green local foundation proof.
5. All 44 current rows and protected history require an explicit manual
   mapping before a separately authorized population batch.
6. Authorized caller roles/context, relation tables, customer projection,
   population, caller cutover and retirement each require their own later
   contract, proof and approval.
7. No retirement or remote action occurs without its own approval.

Connection/EAN remains location-dependent. WP3J proves only the bounded local
RPC mechanics; it does not authorize a caller or connection implementation,
evidence acceptance, charger/MID, mandate, authority, kWh, booking, verifier,
settlement, remote, or deployment work.

## 17. WP3I Operational Write Readiness Overlay

`operations/wp3i-location-operational-write-readiness.md` records a
docs-only/read-only readiness verdict:
`READY FOR DECISION — OPERATIONAL WRITE PACKAGE CAN BE APPROVED`.

The proposal is limited to four operations: create one root, record one
observation, accept one initial version, and correct one version by inserting
an immutable same-root successor. It recommends four narrow service-role-only
RPCs, shared `app_idempotency_keys`, canonical server hashing, transactionally
fail-closed success/controlled-reject audit, deterministic per-root advisory
locking, stable safe error codes and a real two-process/two-connection proof.

All twelve WP3I recommendations are `NOT APPROVED`. The proposed migration and
proof paths are not implementation, and no expiry duration is selected
without an explicit cleanup/retention decision. WP3H remains
`CURRENT PROVEN — LOCAL ONLY`; operational writes remain `NOT IMPLEMENTED`.
Population, relationships, projection, caller cutover, retirement, remote and
production remain blocked or unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 18. WP3J Operational Location Write RPC Local-Proof Overlay

CURRENT PROVEN — LOCAL ONLY — WP3J OPERATIONAL LOCATION WRITE RPCS AND CONCURRENCY

Commit `45d926478945fedc610ea02a0ff2b0d4f5f14be4` implements exactly four
public RPCs and three focused internal helpers. The public functions are
`SECURITY DEFINER`, use an empty search path and grant execute only to
`service_role`; the helpers have no direct service-role execute.

WP3J reuses `app_idempotency_keys` without adding a TTL or cleanup rule and
reuses `app_audit_events` transactionally fail closed. It creates no table and
changes no foundation table. Q01-Q42 prove bounded behavior, rollback,
replay/conflict semantics, fresh migration apply, equality between migration
bodies and resulting catalog bodies, separate-process concurrency and complete
disposable cleanup.

Technical `service_role` execute does not authorize a human, operations role,
case, dossier, party, authority or use case. No browser-direct RPC call is
permitted. At the WP3J checkpoint, the next separate readiness step was
`WP3K — authorized operational location caller boundary`.

Population and 44-row mapping, physical matching, PDOK/BAG, EAN/connection,
relation links, customer projection, remote apply, caller cutover, current
object retirement, verifier acceptance and production remain blocked or
unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 19. WP3K Authorized Caller Readiness Overlay

HISTORICAL WP3K READINESS OVERLAY — TARGET DECISIONS APPROVED; CALLERS NOT IMPLEMENTED

The readiness audit in
`operations/wp3k-location-caller-boundary-readiness.md` was partial because,
at that checkpoint, the repository had no proven workforce identity, internal
role assignment, reviewer qualification or case-to-location authorization
relation. WP3L-B later closes only that bounded local foundation gap.

WP3J remains `CURRENT PROVEN — LOCAL ONLY` for the four RPCs and technical
service-role boundary. An authenticated customer, customer identity, dossier
owner, case participant or party representative does not thereby receive
location-write or review authority. `service_role` is not a human identity.

The approved TARGET caller shape keeps root creation, observation
registration, initial acceptance and correction as four specific operations.
Root creation and observation are non-accepting registration paths; initial
acceptance and correction are material maker/checker decisions. Exact human
role names remain decision-required and are not invented by WP3K.

No Edge Function, helper, authorized caller, operations UI, population,
remote apply, cutover or retirement is implemented or authorized.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 20. WP3L-B Workforce Authorization Foundation Local-Proof Overlay

CURRENT PROVEN — LOCAL ONLY — WP3L WORKFORCE LOCATION AUTHORIZATION FOUNDATION AND CONCURRENCY

WP3L-D01 through WP3L-D18 are APPROVED TARGET. Commit
`6485dad9a1cc481efc3f17095f90df72a219b315` implements exactly seven empty
tables for workforce roots, lifecycle, six closed capabilities, temporal
case/location relations, temporal workforce scope, material operation
requests and checker reviews.

Root creation uses exact case scope before a location exists and must later
use an authorized caller to create a case/location relation atomically with
the root; that caller remains not implemented. Observation registration
requires capability plus exact case/location scope but no checker. Initial
acceptance and correction use immutable maker intent, the exact payload hash,
a different active checker with the matching approve capability/scope and
revalidation at execution.

The case/location relation is workflow scope only. It does not infer address
acceptance, physical identity, ownership, EAN, aangeslotene, party authority,
representation, evidence acceptance or customer projection.

All seven tables have deny-all browser RLS and only `SELECT, INSERT` for
`service_role`. Q01-Q48 prove catalog, no-inference, temporal rules,
maker/checker separation, execution eligibility, fresh apply and real
two-process review/execution races. No WP3J RPC is called.

No emergency override, system-ingestion principal, bootstrap, population,
authorized runtime caller, execution bridge, Edge Function, UI, 44-row
mapping, remote apply, cutover or retirement is implemented. Next:
`WP3M — authorized operational location callers and WP3J execution bridge readiness`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
