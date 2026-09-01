# White-Label And Control-Plane Architecture

Status: CURRENT PROVEN LOCAL foundation through WL11E / commit `8b47126`;
remaining architecture TARGET; REMOTE / PRODUCTION NOT PROVEN

Strategic status overlay: DECIDED/TARGET on 2026-09-01. ENVAL is the generic
software/IP platform; every regulated operator is a separately resolved
tenant. The current ENVAL-branded root data plane is the technical
reference/default tenant journey only. It does not prove ENVAL Software as
operator or select a first commercial tenant.

Current-evidence status: CURRENT PROVEN LOCAL for the bounded separate
control-plane workdir/schema, managed and static tenant-resolution adapters,
trusted-ingress boundary, authoritative gate over the inventoried CURRENT
`api-app-*` surface, provider-neutral presentation contract/sources, versioned
local control-plane presentation configuration, safe server-issued
presentation bootstrap and React provider consumption. Tenant #1 core rows and
client target remain unchanged; `DYNAMIC_DATA_PLANE_SWITCHING=NO`. Remote and
production presence remain separate and unproven.

Deferred / unknown: physical control-plane provider and hosting, cross-tenant
customer federation, support-elevation workflow detail, tenant provisioning
automation, and conflict-signal matching policy, key custody, legal basis and
retention.

Responsibility: define the approved white-label boundary between isolated
tenant data planes and the minimum separate platform control plane. This is a
focused TARGET appendix subordinate to `docs/app/07_NEA_TARGET_ARCHITECTURE.md`.
It is not a second primary architecture canon and grants no implementation,
database, Auth, Storage, migration, remote, deployment or production
permission.

The focused WL03 conceptual record, field-classification, routing,
platform-access, deployment-state and readiness refinement is
`docs/app/contracts/platform-control-plane.md`. Its implemented local subset
is CURRENT PROVEN LOCAL; platform principal/membership administration,
deployment orchestration and other deferred records remain TARGET.

The existing `HYBRID PARALLEL REBUILD` decision concerns how ENVAL rebuilds its
own application inside the current ENVAL project. It does not select a shared
multi-tenant database. For white-label architecture, ordinary tenant truth is
isolated in separate data planes.

## A. Architectural Invariants

1. Each service provider has a separate tenant data plane containing its
   customer Auth, Postgres business truth, private Storage, data-plane Edge
   services and tenant workforce authorization.
2. The current root project is the technical reference/data-plane #1. Its
   isolated customer, case, party, signing and evidence tables do not gain
   `tenant_id` merely to represent that deployment. The `ENVAL` label is not
   legal/operator identity and proves no first commercial tenant.
3. Customer Auth is tenant-local. There is no central customer identity
   authority in the initial architecture.
4. The platform control plane is a separate isolated system and contains only
   minimum platform authority and minimized operational metadata.
5. Customer PII, parties, cases, evidence, signing, mandates, legal
   acceptances, assets, settlement/payment truth and tenant operational audit
   remain tenant-local.
6. Platform principal, tenant membership, tenant workforce identity, tenant
   customer identity/access, case role and representation authority are
   separate concepts and grants.
7. Platform admin grants no automatic customer, case, evidence or dossier
   access.
8. Tenant resolution is derived only from trusted server-controlled routing
   context. Browser input never chooses a Supabase project, database,
   service-role credential or arbitrary tenant locator.
9. Every data-plane service role and private credential is tenant-specific.
   No universal platform service role spans tenant data planes.
10. Storage and evidence bytes are isolated with their owning tenant data
    plane; a central object namespace is not the TARGET.
11. Cross-tenant conflict signalling is derived and pseudonymized. It never
    replaces or becomes customer, party, case, evidence or decision truth.
12. `CURRENT PROVEN`, `TARGET`, and `DEFERRED / UNKNOWN` remain explicit. A
    TARGET boundary never proves runtime, remote, production or regulatory
    acceptance.
13. One ENVAL software core serves managed SaaS, managed white-label,
    customer-owned cloud and contractually agreed
    standalone/self-hosted/source-license deployment. Commercial packaging
    never selects a code fork.
14. Tenant/operator, deployment ownership, branding, support model and
    conflict-registry participation are orthogonal configuration dimensions;
    none is a combined tenant type.
15. Branding is presentation only and grants no identity, routing, Auth,
    customer/case ownership or legal authority.
16. Physical support is an explicit tenant-scoped service relationship, not
    tenant ownership, platform administration, customer identity or
    representation authority.
17. A standalone single-tenant deployment can resolve its fixed tenant and
    data plane from trusted deployment-local server configuration. Ordinary
    tenant-local workflows do not require live ENVAL control-plane access.

## B. CURRENT Tenant #1 Data-Plane State

The CURRENT reference/data-plane #1 remains one isolated tenant-shaped
Supabase project. Its local `enval` project label and ENVAL-branded presentation
do not establish the legal operator or first commercial tenant:

- `supabase/config.toml` identifies the local project as `enval`;
- the frontend is configured with one Supabase URL and anon key;
- Edge Functions use one `SUPABASE_URL` and project-wide
  `SUPABASE_SERVICE_ROLE_KEY`;
- current `app_*` customer, party, case, access, signing, evidence, audit and
  workforce foundations have no tenant/provider dimension;
- `app_customer_access_grants` scopes an Auth principal to customer contexts
  inside that one project, not to a service-provider tenant;
- private dossier and signup evidence uses the project-local `app-documents`
  bucket and dossier/intake-derived paths without a tenant segment;
- browser roles are denied direct core-table access and current customer reads
  pass through service-mediated, customer-safe projections; and
- current service-role functions and background workers are project-wide.

These are reusable foundations inside one isolated tenant data plane. The
repository now also contains a separate local control-plane workdir and
provider-neutral resolution/presentation runtime, but no evidence supports
multiple service providers sharing the tenant #1 database, Auth namespace,
Storage namespace or service role.

## C. Tenant Data-Plane Responsibility

Every tenant data plane exclusively owns:

- tenant customer Auth users, sessions and recovery;
- customer accounts, customer identities and customer access grants;
- parties, profiles, customer-party relationships, case roles and future
  representation-authority truth;
- cases/dossiers, locations, chargers, connections, EAN and other business
  truth when those domains become implemented;
- intake/quarantine, signing snapshots, signature evidence, mandates, legal
  acceptances and post-signing promotion provenance;
- evidence metadata, versions, decisions, private document bytes and signed
  object access;
- customer-safe dashboard and document projections;
- tenant workforce identities, capabilities, scopes, reviews and operational
  actions;
- tenant audit, lifecycle, idempotency, retention and incident evidence; and
- all future kWh, eligibility, booking, verifier-exchange, settlement,
  entitlement, payout and reconciliation truth.

Tenant data is authoritative only in its owning tenant data plane. The control
plane may hold an opaque tenant/data-plane reference but may not copy ordinary
tenant truth for convenience, search, support, analytics or administration.

## D. Minimum Separate Control Plane

The remote physical provider and hosting remain DEFERRED. The separate local
Supabase workdir/schema and its bounded records are CURRENT PROVEN LOCAL; the
broader logical responsibilities below remain TARGET where not implemented.

| central domain | why central | data class and authority | security / retention boundary |
|---|---|---|---|
| tenant registry and status | identify an approved participant and whether routing is allowed | authoritative platform metadata; no ordinary customer PII | restricted platform writes; lifecycle and status history retained/audited |
| trusted host/domain mapping | resolve a request before selecting a data plane | authoritative routing metadata; no customer PII | verified ownership/change control; fail closed on ambiguity |
| public branding/config | select tenant-owned public presentation and non-secret product configuration | authoritative public config; no customer truth | versioned and cache-safe; signed legal evidence remains tenant-local |
| data-plane locator | identify the approved tenant application/data-plane destination | authoritative infrastructure reference; sensitive but not customer PII | never browser-selectable; no secret values; change-audited |
| schema/deployment state | coordinate compatible tenant releases and detect drift | authoritative intended version plus derived observed health | minimized operational metadata; no row counts or dossier contents by default |
| platform principals | authenticate platform operators | limited staff identity data; authoritative platform identity only | MFA, revocation, least privilege and platform retention policy required |
| explicit tenant memberships | state which platform principal may administer which tenant at the platform layer | authoritative platform authorization; not tenant dossier access | tenant-scoped, time/status bounded, revocable and audited |
| platform action audit | reconstruct control-plane administration | authoritative append-only platform evidence with minimized actor metadata | restricted access and separately approved retention |
| secret references/identifiers | locate credentials in a separate secret-management boundary | authoritative reference only; never a credential value | no secret material in control-plane business data, responses or logs |

The minimum control plane contains no customer directory, central customer
login, party index, case index, evidence index, signing record, mandate,
settlement ledger or tenant operational audit mirror.

## D1. One Core And Orthogonal Operating Dimensions

The same core contracts and business modules support the agreed
commercial/deployment models without code forks:

| operating model | tenant/operator | deployment and presentation | optional relationships |
|---|---|---|---|
| managed SaaS with default ENVAL presentation | resolved inboekdienstverlener tenant; exact first tenant UNKNOWN | ENVAL-managed dedicated data plane with reference presentation | legal identity and support relationships remain separate |
| managed white-label | the actual inboeker/service provider is the tenant; ENVAL operates the deployment | ENVAL-managed dedicated data plane with tenant presentation | support and conflict participation independently selectable |
| customer-owned cloud | the actual inboeker/service provider is the tenant | customer-owned isolated cloud boundary using the shared core | operations/support responsibilities are separately contracted |
| standalone/self-hosted/source-license where contractually agreed | the actual inboeker/service provider is the tenant | fixed trusted deployment-local mode without required live ENVAL control-plane access | update, support and connected conflict participation remain independent |

The independent dimensions are:

- operator/tenant: who operates the inbooking service;
- deployment ownership: at least `ENVAL_MANAGED_DEDICATED` or
  `CUSTOMER_MANAGED_SELF_HOSTED`;
- branding mode: ENVAL, LabelUP/co-brand or customer-owned presentation;
- support model: `DIGITAL_ONLY`, `DIGITAL_PLUS_PHYSICAL`,
  `EXTERNAL_SUPPORT_PROVIDER`, or `NONE_CUSTOMER_OPERATED` where applicable;
  and
- conflict-registry participation: connected opt-in/eligible participation or
  no platform-wide participation, independent of deployment ownership.

These dimensions may constrain compatible adapters/capabilities, but no value
creates Auth, tenant identity, dossier access, case ownership or legal
authority. SLA and license packaging compose configuration, capabilities and
optional integrations around the shared core; they do not copy the app,
database domain or business rules.

LabelUP is not a commercial-mode authority value. Where contractually
involved, it is currently only a conceptual optional support-provider
relationship. It does not automatically become tenant/operator, contracting
entity, platform admin, customer identity, case role or representation
authority.

## E. Identity And Access Separation

| concept | owning plane | responsibility | must not imply |
|---|---|---|---|
| platform principal | control plane | authenticate a platform operator | tenant membership, tenant workforce authority or dossier access |
| tenant membership | control plane | authorize bounded platform actions for one tenant | customer access, tenant workforce capability, case role or representation |
| tenant workforce identity | tenant data plane | identify an internal tenant operator | platform role, customer identity or representation authority |
| tenant workforce capability/scope | tenant data plane | authorize an exact operational action and scope | general support access or legal authority |
| tenant customer Auth principal | tenant data plane | authenticate one tenant's customer account session | a customer context, party identity, case role or representation authority by itself |
| customer identity/access grant | tenant data plane | bind or grant access to explicit customer contexts | party identity, case participation or representation authority |
| case role | tenant data plane | record a party's participation in a case | login access, tenant membership or representation authority |
| representation authority | tenant data plane | record separately established legal authority with provenance and validity | inference from Auth, email, membership, access, title, signature or case role |

The CURRENT `app_customer_identities`, `app_customer_access_grants`,
`app_cases`, `app_case_party_roles`, workforce identity/capability/scope
foundations and no-inference rules remain reusable inside each tenant data
plane. They do not become platform identity objects.

Customer federation or cross-tenant SSO is DEFERRED. If later approved, it is
an explicit federation layer mapping independently owned tenant identities; it
may not create shared customer, party or case truth.

## F. Trusted Routing Boundary And Adapters

CURRENT PROVEN LOCAL route:

```text
trusted server/deployment routing context
-> TenantResolutionAdapter
   -> platform_control_plane_v1
   or static_single_tenant_v1
-> TenantResolverPort
-> opaque resolved tenant reference
-> TenantDataPlaneLocator
-> approved tenant application/data-plane destination
-> authoritative app tenant gate
-> server-owned presentation source and safe public projection
-> tenant-local Auth and data-plane services without dynamic client switching
```

`platform_control_plane_v1` resolves trusted managed routing through the
separate ENVAL control plane. `static_single_tenant_v1` resolves exactly one
fixed tenant/data-plane context from trusted deployment-local server
configuration. The static adapter accepts no browser tenant/project/URL
override and fails closed if its fixed configuration is absent, invalid or
ambiguous. It does not require live ENVAL control-plane availability.

The core application receives the same opaque resolved tenant/data-plane
context from either adapter. Business modules do not branch on commercial
package, brand, LabelUP involvement, deployment owner or adapter kind.

`TenantResolverPort` owns the deterministic, fail-closed mapping from trusted
server-observed or deployment-local routing context to one active tenant
reference. It does not authenticate customers, return credentials or accept a
browser-supplied project/database choice.

`TenantDataPlaneLocator` owns the restricted mapping from one already-resolved
active tenant reference to its approved application/data-plane destination and
secret references. It returns no secret values to browsers and does not query
tenant business data.

A tenant application may receive fixed public runtime configuration only after
trusted resolution or through a tenant-specific deployment. Request payload,
query string, local storage, JWT custom input or arbitrary browser configuration
cannot override the resolved data plane.

Unknown hosts, inactive tenants, ambiguous managed mappings, invalid fixed
standalone context, locator mismatch and unavailable destinations fail closed
without falling back to ENVAL or another tenant.

Trusted ingress is server/deployment-owned. Raw browser/request `Host` and
`X-Forwarded-Host` values are not production authority, and the production
proxy topology remains UNKNOWN. The browser cannot choose adapter mode,
tenant, locator, control-plane identity or presentation source. The
authoritative gate is proven for the repository-inventoried CURRENT
`api-app-*` surface; this is not universal proof for legacy routes, remote
functions or future entrypoints.

Presentation resolution follows tenant resolution. `PresentationBrandConfigV1`
and the managed/static presentation adapters yield the same safe public shape;
the control plane stores versioned public presentation configuration while
legal operator, support provider, Auth/RLS and signing evidence remain separate
authorities. Finalized signing/legal snapshots are never rewritten by current
presentation configuration.

## G. Storage And Evidence Isolation

CURRENT ENVAL object paths are dossier/intake scoped within one private
`app-documents` bucket. Under the separate-data-plane TARGET they may remain
tenant-local without adding a tenant segment because the project/bucket itself
is the tenant boundary.

Each tenant must have independently configured private Storage, signed URL
issuance, object metadata and retention handling. A tenant service role may not
read or sign another tenant's objects. The control plane stores no document
bytes, filenames, hashes, Storage paths or signed URLs.

A later export, verifier pack or support transfer is an explicit tenant-plane
operation with its own authorization, audit, expiry and retention. It is not a
control-plane read-through.

## H. Data-Plane Credentials And Service-Role Boundary

- Every tenant has separate public runtime configuration, server credentials,
  signing/capability secrets and provider credentials.
- A tenant service role is a technical credential for that tenant data plane;
  it is never a platform principal, tenant membership or human authority.
- Platform services hold only secret references/identifiers in ordinary
  control-plane data. Secret values belong in a separately controlled secret
  manager or deployment boundary.
- No browser receives a service role, database credential, secret reference
  capable of resolution, or arbitrary data-plane locator.
- No universal worker credential may scan all tenant databases or Storage.
  Fleet operations invoke explicitly selected tenant deployments under
  separately authorized platform actions.
- Logs, audits and errors contain minimized tenant/action references, never
  credential values or customer data copied from another plane.

## I. Platform Admin And Support Elevation

Platform administration covers control-plane tenants, routing, membership,
deployment metadata and platform audit only. It grants zero implicit tenant
dossier access.

Future support elevation must be a separate TARGET capability that is:

- requested for one explicit tenant and purpose/reason reference;
- limited to the minimum action and resource scope;
- approved under a separately decided policy;
- time limited and automatically expired;
- revocable before expiry;
- visible in platform audit and the affected tenant's operational audit; and
- exercised through tenant-local workforce authorization, never by exposing a
  tenant service role or manufacturing customer access.

Approval counts, tenant participation, emergency/break-glass policy and exact
retention remain DEFERRED. None may weaken the non-access invariant.

LabelUP physical/on-site support is an optional support-provider relationship,
not a special tenant type. LabelUP may serve one or more tenants only through
separate tenant-scoped workforce/support authorization with exact capability,
purpose, time and audit boundaries. LabelUP involvement implies neither tenant
identity nor platform admin, customer identity, case role or representation
authority. Evidence created during physical/on-site work belongs to the
relevant tenant data plane and case lineage; it is not copied into a central
LabelUP dossier database merely because LabelUP performed the work.

## J. Conflict-Registry Seam Only

`ConflictCheckPort` is a future tenant-side boundary for asking a
provider-independent platform service whether a purpose-specific equality
signal conflicts with an existing signal. No implementation or interface is
approved in WL02. Participation is independent of deployment ownership:
separate ENVAL-managed databases and explicitly participating
customer-managed/self-hosted deployments may use the same seam while retaining
all raw truth locally.

The later platform adapter/service may store only purpose-limited keyed or
pseudonymized matching signals and minimal workflow state. It must:

- never store raw MID, EAN, email, name, address, Auth ID, dossier ID, evidence
  or tenant business payload;
- never become customer, party, case, allocation-point, eligibility or evidence
  truth;
- never reveal which other tenant, customer or dossier produced a match;
- return only a minimized opaque match/no-match/conflict workflow result;
- preserve tenant-local decision authority and provenance; and
- use separately approved matching rules, key custody, legal basis, access,
  correction, retention and deletion controls.

Exact MID/EAN/year matching, normalization, false-positive handling, HMAC key
ownership and rotation, legal basis and retention are DEFERRED / UNKNOWN.

A fully disconnected/offline standalone deployment cannot receive
platform-wide cross-tenant matching while disconnected. The core must surface
that check as unavailable/not performed, never infer `no conflict`. Tenant-local
workflows may continue only under their separately approved policy; offline
operation does not weaken or fabricate conflict evidence.

## K. ENVAL As Tenant/Data-Plane #1

The bounded migration path avoids a big-bang rewrite:

1. Designate the current ENVAL application project as tenant data plane #1 in
   architecture and future control-plane registration.
2. Preserve all current tenant-local customer, Auth, party, case, signing,
   evidence, audit and Storage identifiers and rows unchanged.
3. Do not add `tenant_id` to those isolated core tables merely for the first
   tenant.
4. Register only ENVAL's tenant status, trusted domains, public branding,
   data-plane locator, intended schema/deployment state and secret references
   in the future control plane.
5. Route ENVAL hosts deterministically to the existing ENVAL deployment/data
   plane before customer Auth initializes.
6. Parameterize future platform deployment, migration and health tooling around
   one explicitly selected tenant data plane without giving it customer-data
   read authority.
7. Before tenant #2, provision a separate Auth/Postgres/Storage/Edge data plane,
   apply the approved migration set and tenant configuration, and prove
   negative cross-tenant routing, Auth, Storage, service-role, support and audit
   behavior.
8. Add federation, conflict signalling, fleet automation or cross-tenant
   reporting only through separately approved later work packages.

The historical current-project quota and in-place rebuild decisions remain
valid for ENVAL data-plane #1. They do not authorize a second provider to share
the ENVAL data plane.

## L. Current Local Foundation And Explicitly Deferred Scope

The original WL02 statement that no control-plane or resolver implementation
existed is a LEGACY pre-implementation status snapshot, superseded by WL05
through WL11E. CURRENT PROVEN LOCAL now includes:

- a separate `platform/control-plane/` Supabase workdir, migrations and
  fail-closed target/migration verification;
- the bounded tenant, routing, locator and append-only platform-audit schema;
- `TenantResolverPort`, `TenantDataPlaneLocator`, managed and static adapters,
  shared composition and trusted-ingress normalization;
- shadow then authoritative tenant gating for the inventoried CURRENT
  `api-app-*` runtime surface, without fallback or dynamic data-plane client
  switching;
- `PresentationBrandConfigV1`, managed/static presentation sources and a
  versioned local control-plane presentation table/view;
- a safe server-issued public presentation bootstrap and React
  `PresentationBrandProvider`; and
- deterministic ENVAL parity plus synthetic alternate-brand proof.

Still TARGET/DEFERRED or UNKNOWN:

- real tenant #2, customer onboarding and production tenant isolation proof;
- live control-plane project/bootstrap, remote migration/deployment and
  production readiness;
- production domain ownership, DNS/certificate workflow and trusted proxy
  topology;
- dynamic tenant data-plane switching, provisioning/fleet orchestration,
  customer-cloud automation and self-host installation automation;
- central customer Auth, customer directory or cross-tenant SSO;
- platform-admin UI, tenant/domain/brand administration, uploaded logos or
  arbitrary theme overrides;
- legal-operator and support-provider configuration/authority or support
  elevation;
- shared Storage, universal service-role/fleet credentials, conflict registry,
  cross-tenant analytics and settlement/payment implementation.

There is no LabelUP, SaaS or white-label business-code fork. Commercial/SLA
differences compose the shared core through orthogonal deployment,
presentation, support and optional-integration configuration. LabelUP does not
become tenant identity, contracting entity, platform admin or representation
authority by product packaging.

## M. Traceability Expectations

Every later implementation batch must trace one approved platform requirement
to its component, owning plane, security boundary and deterministic proof.

| requirement | component / concept | owning plane | mandatory security boundary | later proof expectation |
|---|---|---|---|---|
| `WL-ISO-001` separate customer data planes | tenant Auth/Postgres/Storage/Edge deployment | tenant data plane | no cross-tenant credential, network or object reach | negative tenant-A/tenant-B Auth, SQL, RPC and Storage tests |
| `WL-CUR-001` preserve current ENVAL foundations | reference/data-plane #1; operator identity unresolved | tenant data plane | no convenience `tenant_id` rewrite | schema/data hash and current-proof preservation |
| `WL-AUTH-001` tenant-local customer Auth | tenant Auth configuration and customer access helpers | tenant data plane | no central customer authority | wrong-tenant token and identity denial |
| `WL-CTRL-001` minimum control plane | tenant registry, membership and platform audit | control plane | no ordinary tenant truth | schema allowlist and forbidden-field/data-flow proof |
| `WL-ROUTE-001` trusted resolution | `TenantResolverPort` | control plane boundary | server-observed host only; ambiguity fails closed | host spoof, unknown host and browser-override rejection |
| `WL-LOC-001` restricted locator | `TenantDataPlaneLocator` | control plane boundary | active resolved tenant only; no secret values | locator mismatch, inactive tenant and secret-output denial |
| `WL-CRED-001` tenant-specific credentials | secret references and tenant deployment secrets | both, separated | no universal service role; no browser secret | credential-scope and log/redaction proof |
| `WL-ADMIN-001` platform admin non-access | platform principal/membership | control plane | no implicit customer/workforce grant | platform-admin direct dossier denial |
| `WL-SUP-001` explicit support elevation | future support grant plus tenant workforce scope | both, separated | tenant/purpose/time/resource scope and dual audit | expiry, revocation, scope, audit and no-service-role tests |
| `WL-STOR-001` tenant evidence isolation | tenant private Storage | tenant data plane | no shared bucket/object authority | signed URL and cross-project object denial |
| `WL-AUTHZ-001` authority separation | identity/access/role/authority domains | tenant data plane | no grant inference across concepts | no-inference contract and negative authorization tests |
| `WL-CONFLICT-001` derived conflict seam | `ConflictCheckPort` plus future adapter | tenant/control boundary | pseudonymized signal only; no disclosure or truth ownership | raw-data rejection, tenant non-disclosure and local-truth invariants |
| `WL-DEPLOY-001` controlled fleet operations | migration/deployment/schema-state tooling | control plane operations | one explicitly selected tenant and audited action | drift, partial rollout, rollback and wrong-tenant denial |
| `WL-CORE-001` one core across commercial models | shared tenant-local business modules/contracts | tenant data plane | package/brand/support values grant no authority and select no fork | identical core-contract and no-package-branch proof |
| `WL-RESOLVE-002` provider-independent resolution | managed and static single-tenant adapters behind the same ports | deployment boundary | trusted server/deployment config only; no browser override | adapter contract parity, standalone control-plane-outage operation and fail-closed config tests |
| `WL-SUPPORT-002` optional external physical support | tenant-local support/workforce authorization | tenant data plane | explicit tenant/capability/purpose/time scope; evidence stays tenant-local | LabelUP non-authority and cross-tenant denial proofs |
| `WL-CONFLICT-002` deployment-independent participation | future `ConflictCheckPort` adapter | tenant/platform boundary | connected opt-in only; unavailable is not no-conflict | managed/self-hosted parity and offline-unavailable proof |

Proof for one layer never substitutes for another: control-plane routing proof
does not prove tenant RLS; tenant RLS does not prove Storage isolation;
platform membership does not prove support elevation; and a conflict signal
does not prove a tenant-local business decision.

Current local implementation evidence is intentionally concise:

| implemented boundary | component anchors | proof anchors | status limit |
|---|---|---|---|
| physical separation and migration targeting | `platform/control-plane/`, `enval-supabase-target.mjs`, ENVAL verifier | `platform-control-plane-foundation.proof.ts`, `enval-verify-runner.proof.mjs` | CURRENT PROVEN LOCAL; no remote project/deploy |
| tenant resolution and ingress | `platform/runtime/tenant-resolution/`, `app_tenant_resolution_shadow.ts` | `tenant-resolution-composition.proof.ts`, `trusted-ingress-boundary.proof.ts`, `app-tenant-resolution-shadow.proof.ts` | CURRENT PROVEN LOCAL; production ingress UNKNOWN |
| CURRENT app gate propagation | shared app foundation/workforce authorization | `api-app-ops-location-callers.proof.ts` plus tenant-gate proof | CURRENT PROVEN LOCAL for inventoried CURRENT surface |
| presentation sources/config | `platform/runtime/presentation/`, control-plane presentation migration | `presentation-brand-config.proof.ts`, `presentation-brand-sources.proof.ts` | CURRENT PROVEN LOCAL; no brand administration |
| public bootstrap/provider | `app_presentation_bootstrap.ts`, `api-app-presentation-bootstrap/`, `app/src/shared/presentation/` | `PresentationBrandRuntime.proof.tsx`, `PresentationBrandProvider.proof.tsx` | CURRENT PROVEN LOCAL; no remote/browser acceptance claim |

## Deferred Decisions And Next Gate

Still DEFERRED / UNKNOWN:

- physical control-plane provider, region, network and recovery design;
- tenant provisioning, billing and lifecycle automation;
- trusted domain ownership and certificate workflow detail;
- brand administration, uploaded/dynamic asset lifecycle, arbitrary theme
  overrides and cache invalidation operations;
- standalone deployment packaging, update and support lifecycle;
- platform-principal Auth provider and membership administration workflow;
- support approval counts, tenant participation, emergency use and retention;
- migration-fleet rollout, rollback and compatibility policy;
- cross-tenant customer federation/SSO;
- conflict identifiers, normalization, matching scope, key custody, legal basis,
  retention, correction and deletion; and
- production availability, observability, incident and disaster-recovery SLOs.

The next bounded implementation gate must select one deferred responsibility
only. The completed local foundation grants no blanket product, remote,
deployment or production authorization.
