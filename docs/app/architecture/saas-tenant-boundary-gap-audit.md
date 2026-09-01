# SaaS Tenant Boundary Gap Audit

Status: TARGET / READ-ONLY GAP AUDIT

Audit date: 2026-09-01. Repository state inspected: branch `main`, HEAD
`015433e`. This document records a read-only Phase 2 gap audit. It does not
authorize or claim implementation, tenant onboarding, schema application,
database mutation, deployment, remote proof, legal approval, or production
readiness.

Current supersession overlay (2026-09-01): commit `034691e` completes the
bounded TF01 gap identified by this dated audit. Immutable server-derived
tenant execution context is now emitted only after exact parity with the fixed
server execution identity and is propagated through the shared app boundary.
Missing/invalid fixed identity, resolver failure/timeout, inactive or ambiguous
resolution and mismatch fail closed before tenant business database, private
Storage or service-role access. The point-in-time inventory is 33/33 current
tenant-business endpoints shared-gated, with 0 manual duplicate parity
implementations and 0 ungated. Presentation consumes authoritative
`tenant_execution` and does not re-resolve or recompute parity.

Current TF02-B overlay (2026-09-01): commit `9f9f310` completes only the
runtime contract/static-selection foundation of historical gap N1. CURRENT
PROVEN LOCAL now includes a strict versioned manifest that references exactly
one approved operational, legal, fee/commercial and provider/integration
revision descriptor, with revision identity, content hash and canonical
whole-manifest SHA-256. Selection uses `AppTenantExecutionContext`
tenant/environment and a server-composition-owned clock. Missing, invalid,
unapproved, hash-mismatched, future/expired or ambiguous configuration fails
closed, and resolved output is immutable. The public runtime port accepts no
raw event time; the trusted-time wrapper and low-level selector are private.

This closes neither N1 as a whole nor the consumer gaps. There is no real
approved tenant content, persistence/read authority in either plane,
approval-capability administration, secret binding, signing/case/provider
cutover or portable provenance. `PresentationBrandConfigV1` remains a separate
presentation-only authority.

Accordingly, the audit-date statements below that the gate discards resolved
context, E2 is open, TF01 is future, or this binding remains a current critical
gap are HISTORICAL chronology, not active current-state claims. TF01 does not
prove dynamic data-plane switching, tenant #2, a second data plane,
provisioning, production routing/isolation, real approved tenant configuration
content, durable persistence/read authority, consumer provenance cutover,
portable tenant/data-plane provenance, workforce/platform redesign, pricing,
SLA or privacy completion.

## 1. Decision

ENVAL does not need a full shared-database multi-tenant rewrite. The approved
direction is one isolated tenant data plane per operator, with separate Auth,
Postgres business truth, private Storage, Edge runtime and credentials. The
existing root `supabase/` tree is tenant data plane number one. Its absence of
`tenant_id` on every operational row is intentional under that topology.

The current local foundation is not sufficient to operate a safe second tenant
today. It can resolve and validate a trusted server-owned tenant context, but
the authoritative app gate discards that resolved context before business
handlers run and the actual Supabase client remains fixed by deployment
environment. A second isolated data plane, route, Auth realm, Storage boundary,
credential set, operator configuration and acceptance proof do not yet exist.

The shortest safe path is therefore to extend the existing isolation,
resolution, authorization and provenance patterns. Do not add a blanket
`tenant_id` column to every root data-plane table and do not put tenant choice
in browser input.

## 2. Evidence boundary and method

The audit traced current source and callers for public intake, customer Auth,
dashboard, document upload/download/withdrawal, shared customer document
workflow, signing, workforce review, correction handoff, correction
replacement/signing/finalization, audit/idempotency, Storage, presentation,
provider adapters and control-plane runtime.

Evidence used:

- current canon, system map, TODO gate, architecture and app contracts;
- `platform/control-plane/` migrations;
- `platform/runtime/tenant-resolution/` and presentation runtime;
- shared Edge foundations and all current `api-app-*` callers of
  `getAppRequestMeta()`;
- current root data-plane migrations, RPCs, RLS declarations and Storage paths;
- app clients/components and shared customer document workflow composition;
- Wave A1 proof source, without executing it.

Static source and migration inspection completed. A live local catalog check
could not run because the Docker daemon was unavailable. No remote catalog or
production configuration was inspected. Claims about current schema therefore
mean repository migration truth, not live local, remote or production parity.

## 3. Current tenant boundary by layer

### 3.1 Control plane and tenant resolution

The separate control-plane foundation already models:

- `platform.tenants`;
- `platform.routing_identities` with `tenant_id`;
- `platform.data_plane_locators` with `tenant_id` and a secret reference;
- `platform.action_audit_events`, optionally tenant-scoped;
- versioned `platform.tenant_presentation_configs`.

`TenantResolverPort`, `TenantDataPlaneLocator`, trusted-ingress validation,
`static_single_tenant_v1` and `platform_control_plane_v1` are reusable. They
fail closed on ambiguity, inactive routing, locator mismatch and untrusted
browser-provided authority. Local development uses AUTHORITATIVE mode with one
immutable static tenant/data-plane configuration.

Every inventoried current `api-app-*` Edge route reaches the shared tenant gate
through `getAppRequestMeta()`. The gap is after resolution: `AppRequestMeta`
does not carry the resolved tenant/data-plane context, handlers construct the
ordinary fixed Supabase service client, and `DYNAMIC_DATA_PLANE_SWITCHING=NO`.
The foundation proves parity with one deployment target; it does not yet route
one runtime safely to tenant B.

### 3.2 Public signup and customer Auth

Public signup starts an intake through the tenant-gated Edge surface and uses
opaque, scoped pre-Auth capabilities. Quarantine upload issue/confirm operates
in the private project-local `app-documents` bucket. Submit and signing use
database RPCs and scoped idempotency/audit records.

Customer Auth is the Auth realm of the owning data-plane project.
`requireAppCustomer` derives the verified user server-side, resolves active
customer identities and access grants, and then enforces customer, dossier and
case access. Customer identity is not tenant identity. The same email can be an
independent customer in two tenants only when the tenants really use separate
Auth and data-plane projects. In a shared project, email bootstrap/reuse logic
and the globally unique active `auth_user_id` would make that separation unsafe
or ambiguous.

### 3.3 Case, dossier and dashboard ownership

`app_cases`, customers, dossiers, connections, documents and related business
rows have no tenant foreign key. Ownership is indirect: the isolated data-plane
database is the tenant boundary. Dashboard and correction reads authenticate
the customer, resolve explicit access, restrict case/dossier identifiers and
return safe projections through service-role queries.

Several identifiers are unique only within one data plane: dossier and case
references, active EAN constraints, Auth bindings, Storage object namespaces
and `(scope, key)` idempotency. That is correct under isolated projects. It
would cause collisions, denials or cross-tenant ambiguity if two operators
were put into the current root database.

### 3.4 Workforce review

The current workforce evaluator is reusable. It requires a verified Auth user,
active workforce identity, active policy, sufficient seniority, the exact
capability and exact case/location scope unless an explicit global capability
applies. Reviewer seniority alone grants no review action.

The tenant boundary remains indirect through the owning Auth/data-plane
project. The tenant-wide scope overload uses the literal
`CURRENT_TENANT_DATA_PLANE`, not a platform tenant foreign key. Global
administrative capabilities apply to the whole current data plane. This is
safe between operators only when their workforce identities, tokens, service
roles and databases are separate. A platform administrator must not acquire
tenant dossier access by virtue of platform membership.

### 3.5 Storage

Current object paths are case-, dossier-, intake- or handoff-scoped, including:

- `app/dossiers/{dossier}/slots/{slot}/files/{file}/{filename}`;
- `signup-quarantine/{intake}/{file}/document.pdf`;
- `case-evidence/signed-signup/{intake}/{file}/document.pdf`;
- `customer-corrections/{case}/{handoff}/{target}/{upload}.pdf`.

There is no tenant segment. This is acceptable only because the private bucket
and Storage project are intended to be dedicated to one tenant. Signed URL
issuance occurs after the shared tenant gate and the relevant customer,
dossier, case, intake or workforce authorization. A path alone cannot prove
its tenant. Do not add a tenant path prefix while the isolated-project
invariant holds; instead prove project/credential isolation and record portable
tenant/data-plane provenance outside the raw object key.

### 3.6 Audit, idempotency and historical reconstruction

`app_audit_events`, `app_intake_audit_events` and `app_idempotency_keys` are
tenant-local and carry no direct tenant identifier. Their current uniqueness
and scope are safe inside an isolated database. Tenant provenance is indirect:
an investigator must know which project/database produced the row.

This is inadequate for central export, incident response or evidence exchange.
Historical records need an immutable, non-secret tenant/data-plane provenance
envelope at the case root and in portable audit/idempotency/export projections.
That does not require copying `tenant_id` onto every operational child row.

### 3.7 Signing, operator identity, legal bundle and fees

The current signing runtime is not tenant-safe for a second operator. It still
hardcodes ENVAL-branded/operator material, ENVAL B.V. legal roles, a 90/10 fee
projection, mandate text, export names and parts of the OTP/mail presentation.
TF02-B changed none of those consumers. Its descriptor-only manifest
foundation does not supply real legal/operator/fee values and is not imported
by signing. The immutable signing snapshot pins document versions, hashes and
content values, but not an authoritative tenant/operator configuration,
legal-bundle configuration, fee configuration or deployment/data-plane
identity.

Presentation configuration cannot substitute for legal identity. A future
tenant B could receive the wrong contracting party, mandate and fee split even
if its logo and routing were correct. A later signing cutover must consume real
approved, durably read tenant-local legal/fee revisions and persist the exact
operator, bundle, fee and configuration references/hashes used.

### 3.8 External providers

The parser port/adapter and its observation provenance are strong reusable
patterns. OTP also has a port/adapter boundary. TF02-B supplies only a typed
provider/integration revision descriptor; it contains no provider credentials
and no provider consumer uses it. Current credentials and sender configuration
remain deployment environment values rather than a durably resolved,
tenant-bound provider selection with a non-secret configuration fingerprint.
Future CAR/EAN/MID and verifier integrations remain TARGET/UNKNOWN.

The control plane may hold provider/secret references and safe status metadata,
but raw credentials must remain outside customer and presentation data. Core
business truth must retain provider, adapter, version, configuration
fingerprint, source and observation provenance without turning an external
observation into accepted truth.

## 4. Two-tenant thought experiment

Assume tenant A is ENVAL and tenant B is a design partner. Both have a customer
with the same normalized email; both have cases, reviewers, legal bundles, fee
configurations and private documents.

### If both are forced into the current root project

- Auth binding and email-based bootstrap can merge or ambiguously reuse a
  customer context.
- dossier/case references, active EAN, idempotency scopes and Storage keys share
  global namespaces;
- all business RPCs and direct queries use one service role and contain no
  tenant predicate;
- reviewer/global-admin authority is scoped to that one database, not to an
  operator tenant;
- both signing journeys use the current ENVAL legal and fee material;
- audit rows cannot directly show which operator owned the event.

That model is unsafe and is not the approved architecture.

### Under the intended isolated-data-plane model

- the same email maps to separate Auth principals/customer identities;
- cases, identifiers, idempotency keys, databases and private objects are
  independent;
- reviewer A's token and grants are not valid in tenant B's project;
- a service role has authority in exactly one data plane;
- case and Storage queries need no cross-tenant row predicate.

This topology prevents cross-tenant customer and evidence access if deployment
routing, project targets and credentials are bound correctly. It still cannot
operate tenant B safely today because tenant B is not provisioned/proven and
the operator legal/fee/provider configuration is not tenant-resolved or pinned.

## 5. Gap classification

Counts in this audit: KEEP 8, EXTEND 10, REFACTOR 3, NEW 4, DEFER 5,
UNKNOWN 4. There are 6 cross-tenant critical gaps.

### KEEP

| ID | Current asset/invariant | Reason |
|---|---|---|
| K1 | One isolated data plane per operator | Correct primary tenant boundary; avoids pervasive shared-row tenancy. |
| K2 | Trusted server-side resolver ports/adapters | Browser input cannot choose tenant or locator; adapters fail closed. |
| K3 | Tenant-local Supabase Auth plus explicit customer access grants | Correctly separates account identity from customer/case authority. |
| K4 | Central workforce capability/case/location evaluator | Exact action and scope checks are reusable within each tenant plane. |
| K5 | Browser-deny RLS and service-mediated safe projections | Keeps raw tables and service credentials out of the browser boundary. |
| K6 | Private Storage plus short-lived authorized signed URLs | Correct transport pattern when the project is tenant-dedicated. |
| K7 | Immutable evidence/correction/parser provenance | Preserves source and supersession without promoting observations to truth. |
| K8 | Presentation, parser and OTP ports/adapters | Existing provider-neutral composition can accept tenant-bound configuration. |

### EXTEND

| ID | Current source | Exact gap and consequence | Minimum target, dependencies and reuse | Migration/data/test/priority |
|---|---|---|---|---|
| E1 | control-plane tenant/routing/locator/presentation tables | They model records but do not prove an accepted second tenant deployment. | Add explicit manual design-tenant registration/verification status and configuration references; reuse RLS, append-only audit and locator readers. Depends on N1/N2. | Forward-only control-plane migration if fields are required; seed no production tenant automatically; test ambiguity/inactive/unverified fail-closed. CRITICAL. |
| E2 | tenant gate and `getAppRequestMeta()` | Resolved context is discarded and the business client remains fixed; a wrong fixed project can pass only for the one configured context. | Return an immutable safe tenant/data-plane execution context and bind it to the server-owned client target; keep browser inputs excluded. Depends on E1 and deployment strategy. | No customer-row backfill; contract proofs for mismatch, ambiguity, spoofed headers and client/locator parity. CRITICAL. |
| E3 | app request metadata and audit helpers | Metadata contains environment/request data but no portable tenant/data-plane provenance. | Carry a non-secret immutable tenant/data-plane reference into audit/export envelopes; reuse request hashing/redaction. Depends on E2/N3. | Backfill only where database origin can be proven; otherwise mark legacy provenance unknown. Test no secrets/PII and immutable attribution. HIGH. |
| E4 | `(scope,key)` idempotency | Safe only within one project and not tenant-attributable after central export. | Preserve local uniqueness; add tenant/data-plane provenance to portable receipt/envelope and central aggregation key. Depends on E2/N3. | Do not rewrite existing keys; deterministic compatibility tests for replay/conflict and cross-plane aggregation. HIGH. |
| E5 | case/dossier roots | Tenant ownership is only the hosting database, so exported histories are ambiguous. | Pin an immutable operator/configuration provenance reference on newly created case roots or their creation envelope; child rows inherit through case. Depends on N1/N3. | Forward-only nullable/provenance-safe addition; never fabricate legacy tenant. Creation, export and reconstruction tests. CRITICAL. |
| E6 | customer Auth/bootstrap | Same-email separation is architectural, not proven with two Auth realms; shared-project reuse would be unsafe. | Codify one Auth realm per tenant and prove equal-email customers cannot cross projects or access grants. Reuse current server-derived Auth/customer checks. Depends on N2. | No central customer merge or federation. Static/two-plane acceptance proof with distinct tokens, IDs and access. CRITICAL. |
| E7 | workforce authorization | Tenant-wide scope is the literal `CURRENT_TENANT_DATA_PLANE`; global capabilities cover the whole local plane. | Bind tenant-wide authority to immutable deployment tenant context, retain exact case/location checks, and separate platform membership. Depends on E2/N4. | Preserve existing local grants; map only with proven tenant origin. Test reviewer A denied in B and platform admin denied dossier access. HIGH. |
| E8 | private Storage authorization | Project isolation is implicit and object keys are not portable tenant evidence. | Keep current paths; assert bucket/project/client parity and attach tenant/data-plane provenance to document metadata/audit, not browser paths. Depends on E2/N3. | No object move required. Test wrong-project client, wrong dossier/case, expired URL and cross-plane token denial. CRITICAL. |
| E9 | presentation bootstrap/provider | Safe presentation is tenant-resolved, but hardcoded ENVAL display copy/export naming remains elsewhere. | Route non-legal display name, marks, support contact and filenames through the existing presentation provider; keep legal text separate. Depends on E1. | Default current ENVAL config for tenant A; snapshot tests for A/B and safe fallback/fail-closed rules. MEDIUM. |
| E10 | parser/OTP/provider adapters | Selection, credentials and sender provenance are deployment-global and not version-pinned to tenant operations. | Resolve tenant-local adapter configuration and secret references server-side; persist safe adapter/version/config fingerprint. Reuse current ports. Depends on N1/E2. | Never copy raw secrets into DB/audit; rotate by new config version. Adapter-selection, redaction and wrong-tenant-secret tests. HIGH. |

### REFACTOR

| ID | Current source | Exact gap and consequence | Minimum target, dependencies and reuse | Migration/data/test/priority |
|---|---|---|---|---|
| R1 | hardcoded signing legal runtime | ENVAL B.V., operator role, mandate clauses and 90/10 fee are applied to every resolved deployment. Tenant B can sign the wrong contract. | Resolve an approved versioned tenant-local legal/fee bundle; presentation cannot override it. Reuse immutable hashing and clause snapshot mechanics. Depends on N1/E2. | Existing signed evidence is immutable; no silent rewrite. Golden bundle/hash tests per tenant and missing/unapproved fail-closed. CRITICAL. |
| R2 | signing snapshot/finalization RPC | Snapshot lacks authoritative tenant/operator, legal-bundle, fee-config and data-plane references. Historical responsibility cannot be reconstructed after configuration changes. | Persist exact operator identity, bundle/config versions and hashes at finalization. Reuse current atomic finalization/idempotency. Depends on R1/N3. | Forward-only versioned snapshot fields/table; legacy remains explicitly legacy/unknown. Replay, conflict, immutability and reconstruction tests. CRITICAL. |
| R3 | OTP/mail/export/legal presentation defaults | ENVAL sender, subject, purpose and export naming mix display brand with legal/operator authority. | Separate communications presentation from legal authority and resolve approved tenant config at server boundary. Reuse OTP port and presentation config types. Depends on N1/E9/E10. | Preserve historical outbound evidence; new sends pin config fingerprint. A/B sender, reply-to, export and redaction tests. HIGH. |

### NEW

| ID | New foundation | Exact need and consequence | Minimum target, dependencies and reuse | Migration/data/test/priority |
|---|---|---|---|---|
| N1 | versioned tenant operational configuration | PARTIAL FOUNDATION CLOSED by TF02-B / `9f9f310`: the strict four-component manifest/revision-reference contract, canonical hash and safe static server-time selection exist. Real approved operator/legal/fee/provider content, durable persistence/read, approval administration, secret binding and consumers do not. | NEXT TF02-C: persist immutable approved revisions/manifests and read exactly within the owning fixed tenant data plane. The control plane may later hold publishing intent or opaque references only; `PresentationBrandConfigV1` remains separate. Later consumer cutovers stay separate. | Forward-only data-plane schema, minimum grants, deny-by-default RLS, service-role read authority and SQL proofs; no implicit ENVAL defaults. CRITICAL. |
| N2 | manual design-tenant provisioning and acceptance record | A modeled tenant row is not an isolated Auth/DB/Storage/Edge/credential deployment. | Define a human-gated procedure/record for a second tenant: verified route, separate project, credentials, buckets, migrations, config and proof evidence. No self-service automation. Depends on E1/N1. | No autonomous provisioning or remote mutation. Acceptance must prove isolation and record exact versions. CRITICAL. |
| N3 | portable tenant/data-plane provenance envelope | Tenant attribution disappears when audit, evidence or receipts leave their database. | Define a non-secret immutable envelope containing platform tenant ref, data-plane ref, environment/config ref and source record identity. Reuse existing audit/evidence provenance conventions. Depends on E2. | Versioned envelope; legacy origin unknown unless proven. Serialization, hash, redaction and central collision tests. HIGH. |
| N4 | platform principal-to-tenant administration boundary | Platform actions have tenant audit support but no complete tenant membership/change authority contract; platform role could be confused with tenant operational access. | Define platform principals, exact tenant-management capabilities and audited changes, explicitly excluding tenant dossier access. Reuse control-plane deny/default RLS. | Separate control-plane migration; no customer identity federation. Least-privilege and negative dossier-access proofs. HIGH. |

### DEFER

| ID | Deferred item | Reason |
|---|---|---|
| D1 | SaaS billing, invoicing and revenue engine | Commercial model and price remain unknown; not needed for isolation proof. |
| D2 | Self-service tenant onboarding and fleet provisioning | First design tenant must be manually proven before automation. |
| D3 | Customer federation, central identity or enterprise SSO | Tenant-local Auth is the safer current boundary. |
| D4 | Advanced feature flags, reseller hierarchy and arbitrary themes | Not required for the minimum design-tenant foundation. |
| D5 | Central conflict registry or cross-tenant support elevation | Would expand sensitive data and authority before the basic boundary is proven. |

### UNKNOWN

| ID | Unknown | Required owner/evidence |
|---|---|---|
| U1 | First commercial/design tenant and its legal operator identity | Daan plus design partner and legal review. |
| U2 | Production ingress, hostname ownership, proxy and control-plane hosting/provider | Approved infrastructure design and production proof. |
| U3 | Controller/processor roles, SaaS terms, SLA, pricing and tenant fee authority | Legal/commercial approval; code cannot infer it. |
| U4 | Concrete CAR/EAN/MID/verifier providers, availability and credential custody | Provider agreements, security review and adapter acceptance. |

## 6. Historical six cross-tenant critical gaps

These are the six gaps at the audit snapshot. Item 2 is closed for the bounded
fixed-plane local scope by TF01 / commit `034691e`; the others remain open.

1. No second isolated tenant data plane, Auth realm, Storage project, route and
   credential set has been provisioned and accepted.
2. HISTORICAL / CLOSED BY TF01 LOCALLY: the authoritative resolution gate did
   not propagate and bind the resolved tenant/data-plane context to the fixed
   server execution identity used by handlers.
3. PARTIAL FOUNDATION CLOSED BY TF02-B: the versioned four-component
   configuration contract and safe static selector exist, but no durable
   approved content/read authority owns legal operator, bundle, fee,
   communications or provider values and no consumer uses it.
4. Signing snapshots do not pin the responsible tenant/operator and exact
   legal/fee configuration.
5. Case/audit/idempotency/evidence exports lack portable tenant/data-plane
   provenance.
6. Tenant-scoped administrative/provider/workforce deployment authority is not
   fully modeled and proven separately from platform membership.

## 7. Historical minimum ordered tenant-ready foundation

At this audit date, the Wave A1 signing replay defect had to be corrected first
because it was an existing single-tenant product-contract failure independent
of tenant topology. That prerequisite is now closed by commit `5dfaed1`; the
historical finding remains recorded here and was not hidden inside a SaaS
foundation batch.

At that audit point, the minimum foundation order was:

1. DONE LOCALLY BY TF01 / `034691e`: propagate an immutable resolved
   tenant/data-plane execution context through the shared app foundation and
   prove fixed execution parity;
2. DONE LOCALLY BY TF02-B / `9f9f310`: define the versioned four-component
   configuration manifest/revision-reference contract and safe static
   server-time selection boundary;
3. NEXT TF02-C: add tenant-local durable approved component-revision and
   manifest persistence/read authority;
4. in separate batches, bind and pin operator/config provenance into new
   signing truth, opening/material configuration provenance into case truth,
   and provider configuration provenance into provider evidence;
5. extend audit/idempotency/document exports with the portable provenance
   envelope;
6. bind workforce tenant-wide authority and platform administration to their
   distinct resolved contexts;
7. manually register and provision one design tenant with separate Auth,
   database, Storage, Edge runtime and credentials;
8. run a two-plane acceptance scenario using the same customer email, separate
   reviewers, distinct legal/fee bundles and distinct private objects.

The first implementation batch proposed by this audit was exactly one bounded
batch: **TF01 — resolved tenant execution-context propagation and fixed
data-plane client parity**. Its historical scope was to extend the shared
tenant gate and request metadata so every current `api-app-*` handler received
the immutable server-resolved tenant/data-plane context and failed closed if it
did not match the actual fixed Supabase client/deployment target, with static
contract proofs and without dynamic switching, schema tenancy, tenant B,
legal configuration, UI, remote changes or deployment. Commit `034691e`
completes that bounded local scope.

## 8. Wave A1 impact

Current supersession (2026-09-01): Wave A1 is now `CURRENT PROVEN — LOCAL
ONLY`. Commit `5dfaed1` restored exact authenticated signing-finalize replay
through the single authoritative RPC, and commit `4f0542f` hardened the
separate proof-only expired-OTP fixture. The fresh qualification reaches
`REVIEW_COMPLETE`, refresh/resume and audit lineage with cleanup and real-pilot
invariance. This supersedes only the active failure status below. TF01 later
adds a compatible pre-business-access fixed execution boundary without
changing Wave A1 signing, review, cleanup or retained-pilot semantics; neither
batch proves tenant #2 or production.

Wave A1 currently assumes one local ENVAL tenant data plane, one Auth/Storage
namespace, ENVAL legal/fee/OTP material and workforce grants within
`CURRENT_TENANT_DATA_PLANE`. Those assumptions make it a valid single-plane
qualification source, not a two-tenant acceptance proof.

Historical first observed A1 product-contract failure was the identical signing
finalize replay returning `resolution_provenance_invalid` after the first
successful finalization/promotion. The replay revalidates mutable quarantine
file state before reaching the stored idempotent finalization result; promotion
had already changed that state. The first FIX-01 candidate was rejected because
it duplicated authority in the endpoint. FIX-01B instead kept Auth/context
binding and canonical input construction in the Edge boundary while the v1 RPC
behind v2 remained authoritative for replay/conflict, mutable readiness, OTP,
finalization and snapshot persistence.

Historical recommendation `SIGNING_FIX_FIRST` is complete. Historical TF01 is
also complete at commit `034691e`, and the TF02-B contract/static-selection
foundation is complete at `9f9f310`. Current NEXT is exactly **TF02-C —
tenant-local durable approved component-revision and manifest persistence/read
authority**. Signing, case and provider-evidence cutovers remain separate
forward-only batches; existing signed evidence must never be rewritten.

## 9. Static validation result

- duplicate tenant resolver/control-plane modules found: none;
- reusable CSS remains the shared app token/base/layout/components/utilities
  system; this audit introduces no UI or CSS;
- inline CSS in implementation source: none found after excluding proof files;
  the 10 raw `style=` matches are assertion strings inside proof sources;
- all 33 inventoried current tenant-business `api-app-*` endpoints use the
  shared request/tenant gate, with 0 manual duplicate parity implementations
  and 0 ungated;
- root data-plane migrations contain no operational `tenant_id`, `operator_id`
  or organization-tenant row boundary;
- browser RLS is deny-by-default/deny-all for the inspected app tables, while
  service-role server paths remain responsible for business authorization;
- live local schema/catalog parity: partial, Docker unavailable;
- remote and production state: not inspected and not inferred.

## 10. Audit conclusion

`SECOND_TENANT_SAFE_TODAY=NO`.

The current code contains substantial reusable isolation, resolution, Auth,
workforce, private Storage, safe projection and provenance foundations. It does
not require a full rewrite. TF01 now supplies the bounded fail-closed
fixed-plane binding from trusted tenant resolution to the actual server
execution identity. TF02-B now supplies the strict versioned configuration
contract and safe static selector. The remaining path still requires durable
tenant-local approved configuration persistence/read authority, real approved
operator/legal/fee/provider content, separate consumer/provenance cutovers,
portable historical provenance and a manually accepted second isolated
deployment before any design partner can be treated as safely operational.
