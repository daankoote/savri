# Platform Control-Plane Domain Contract

Status: CURRENT PROVEN LOCAL implemented subset through TF02-B / commit
`9f9f310`; remaining control-plane domain TARGET/DEFERRED; REMOTE / PRODUCTION
NOT PROVEN

Strategic status overlay: DECIDED/TARGET on 2026-09-01. Each tenant is the
regulated inboekdienstverlener/operator. ENVAL is the generic platform/IP
layer. The existing reference data plane selects neither a tenant legal
identity nor a first commercial tenant.

Authority: this contract refines
`docs/app/architecture/white-label-control-plane.md` within its approved WL02
separate-data-plane architecture. It is subordinate to
`docs/app/07_NEA_TARGET_ARCHITECTURE.md` and grants no implementation,
database, Auth, Storage, migration, deployment, remote or production
authority.

CURRENT PROVEN LOCAL evidence now covers the separate control-plane workdir and
physical tenant/routing/locator/action-audit records, opaque locator secret
reference, versioned presentation configuration/current view, managed/static
resolver and presentation adapters, trusted ingress, authoritative tenant
gate, immutable fixed-execution parity, propagated `tenant_execution` context,
safe public presentation bootstrap and React consumption. The exact
physical migration columns remain authoritative for that implemented subset.
TF02-B adds a tenant-data-plane configuration contract/port and static
selection foundation only; it adds no control-plane configuration table,
publishing flow or tenant-data-plane persistence.
Conceptual platform principals/memberships, deployment-state orchestration,
secret-registry lifecycle, support elevation, tenant #2 and other later
records in this contract remain TARGET/DEFERRED.

## 1. Scope And Non-Negotiable Boundary

The TARGET platform has one separately isolated minimum control plane and one
isolated data plane per service-provider tenant. Each tenant data plane owns
its customer Auth, Postgres business truth, private Storage, Edge services and
tenant workforce authorization.

The control plane owns only tenant routing/configuration, platform operator
identity and access, deployment coordination metadata, platform action audit
and opaque secret references. It is not a customer, dossier, evidence,
support-read or analytics plane.

Terminology is strict:

- `tenant` is the stable platform identity for one service provider or
  inboekdienstverlener;
- each tenant's legal identity, customer contracts, fees, signing/legal bundle
  and tenant audit remain tenant-bound; the ENVAL brand supplies none of them;
- `tenant != customer`;
- `tenant != case/dossier`;
- `tenant != party or organization represented by a customer`;
- `platform principal != tenant workforce principal != customer Auth
  principal`;
- customer access, case participation and representation authority remain
  distinct tenant-local facts; and
- a platform role, data-plane locator, project reference, domain or public
  slug never becomes tenant identity by inference.

## 2. Classification Vocabulary

Every field introduced below has exactly one primary classification:

| classification | meaning |
|---|---|
| `AUTHORITATIVE_PLATFORM_CONFIG` | server-owned tenant, routing, locator or desired deployment configuration and immutable platform-action evidence |
| `AUTHORITATIVE_PLATFORM_ACCESS` | server-owned platform principal, membership or future elevation authorization truth |
| `DERIVED_OPERATIONAL_STATE` | observed health, version, proof or drift state that never overwrites desired configuration |
| `PUBLIC_PRESENTATION_CONFIG` | intentionally public, non-secret tenant presentation metadata; never routing or security authority |
| `SECRET_REFERENCE` | opaque identifier resolved only across a separate server-side secret-management boundary; never secret material |
| `FORBIDDEN_CENTRAL_DATA` | tenant business, identity, evidence, credential or financial truth that may not enter ordinary control-plane rows, audit or logs |

Sensitivity and visibility are separate from authority class. For example, a
provider project reference is authoritative configuration but remains
server-only. Fields not explicitly allowed by this contract fail closed and
require a later contract decision before central storage.

## 3. Minimum Control-Plane Records

### 3.1 Tenant

`Tenant` is the durable platform root. Creation allocates a new opaque
`tenant_id` and records provenance, but does not activate routing. Activation
requires separately valid routing and locator records. Deactivation blocks new
routing and platform operations that require an active tenant; it retains the
identity and history, never reassigns the identifier and does not delete or
rewrite tenant-local data.

| field | required TARGET meaning | classification |
|---|---|---|
| `tenant_id` | stable opaque internal identifier, independent of host, slug, provider and data plane | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `lifecycle_status` | closed state such as `provisioning`, `active`, `suspended` or `deactivated`; only `active` is routable | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `public_slug` | optional stable-looking public/navigation label; unique if present but never an authority input by itself | `PUBLIC_PRESENTATION_CONFIG` |
| `display_name` | bounded public operator label; not customer, party or legal-identity truth | `PUBLIC_PRESENTATION_CONFIG` |
| `presentation_config_version` | version reference for separately bounded non-secret public configuration | `PUBLIC_PRESENTATION_CONFIG` |
| `created_at` | server timestamp of identity creation | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `created_by_principal_id` | platform actor that created the record | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `deactivated_at` | null or server timestamp of deactivation | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `deactivated_by_principal_id` | null or platform actor that deactivated it | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `change_reason_ref` | bounded reason/change record reference | `AUTHORITATIVE_PLATFORM_CONFIG` |

The public slug and display name may change without changing `tenant_id`.
Neither may select a data plane unless a separate active trusted routing
identity maps the server-observed request to the tenant.

### 3.2 Routing Identity

`RoutingIdentity` binds exactly one normalized trusted request identity to one
tenant. For a host/domain identity, normalization is a canonical lowercase
ASCII host without scheme, path, query, fragment, credentials, port or trailing
dot. Internationalized domains use one canonical IDNA form. An active
normalized identity is globally unique; ambiguity is invalid, never resolved
by priority or fallback.

| field | required TARGET meaning | classification |
|---|---|---|
| `routing_identity_id` | opaque record identifier | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `tenant_id` | owning stable tenant reference | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `identity_kind` | closed server-supported kind, initially trusted host/domain | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `normalized_value` | canonical routing identity used by server lookup | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `lifecycle_status` | `pending_verification`, `active`, `inactive` or `revoked` | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `verified_at` | server timestamp of successful administrative/ownership verification | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `verification_method` | closed provenance method, without secret challenge material | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `verification_evidence_ref` | bounded non-secret administrative evidence reference | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `created_by_principal_id` | platform actor responsible for registration | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `activated_at` / `deactivated_at` | server lifecycle timestamps | `AUTHORITATIVE_PLATFORM_CONFIG` |

A browser-observed host value is only request input. The trusted server
boundary determines which host/domain context is eligible for lookup; browser
payload, query, local storage or client configuration is never authoritative.

### 3.3 Data-Plane Locator

`DataPlaneLocator` is a replaceable server-only reference from one tenant to
one approved data-plane destination. Replacing a locator does not replace the
tenant. A provider project/reference identifier is infrastructure metadata,
not tenant identity.

| field | required TARGET meaning | classification |
|---|---|---|
| `data_plane_locator_id` | opaque replaceable locator identifier | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `tenant_id` | owning stable tenant reference | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `provider_type` | closed infrastructure/provider adapter kind, without selecting the physical WL03 host | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `provider_project_ref` | server-only provider/project reference; never accepted from the browser | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `region` | deployment region reference | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `environment` | closed environment such as production, acceptance or development | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `application_route_ref` | approved server-side application/bootstrap destination reference | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `secret_reference_id` | opaque pointer to the separate tenant credential bundle | `SECRET_REFERENCE` |
| `lifecycle_status` | `provisioning`, `active`, `inactive` or `retired`; one compatible active locator per tenant/environment | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `effective_at` / `retired_at` | server lifecycle timestamps | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `changed_by_principal_id` | platform actor responsible for the locator change | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `change_reason_ref` | bounded change purpose/reference | `AUTHORITATIVE_PLATFORM_CONFIG` |

Raw service-role keys, database passwords, signing secrets, provider tokens and
other credential values are forbidden in the locator and its responses.

### 3.4 Platform Principal

`PlatformPrincipal` authenticates an ENVAL platform operator only. Its Auth and
authorization boundary is separate from every tenant Auth namespace.

| field | required TARGET meaning | classification |
|---|---|---|
| `platform_principal_id` | opaque platform operator identity | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `platform_auth_subject_ref` | unique subject reference in the separately selected platform Auth boundary; no credential or session value | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `operator_label` | minimized internal administrative label; no customer identity role | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `lifecycle_status` | `invited`, `active`, `suspended` or `revoked` | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `created_at` / `activated_at` / `revoked_at` | server lifecycle timestamps | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `created_by_principal_id` / `revoked_by_principal_id` | responsible platform actor references where applicable | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `provenance_ref` | bounded identity-administration provenance | `AUTHORITATIVE_PLATFORM_ACCESS` |

Authentication provider, MFA mechanics, recovery and operator lifecycle
workflow remain later security decisions. Customer Auth users and tenant
workforce users must not be copied into this record merely to give them
platform identity.

### 3.5 Platform Tenant Membership

`PlatformTenantMembership` is the only direct platform principal-to-tenant
administrative grant. It authorizes only named control-plane capabilities.

| field | required TARGET meaning | classification |
|---|---|---|
| `platform_tenant_membership_id` | opaque membership identifier | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `platform_principal_id` | active platform principal | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `tenant_id` | exact platform tenant scope | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `capability_set` | closed least-privilege platform capabilities for routing, configuration, membership, deployment or audit administration | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `lifecycle_status` | `pending`, `active`, `suspended` or `revoked` | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `grant_reason_ref` | bounded purpose/approval reference | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `granted_by_principal_id` | responsible authorized platform actor | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `created_at` / `activated_at` / `revoked_at` | server lifecycle timestamps | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `revoked_by_principal_id` | null or responsible revoking actor | `AUTHORITATIVE_PLATFORM_ACCESS` |

No capability in this membership grants customer impersonation, tenant
workforce status, dossier/case access, evidence access, case role or
representation authority.

### 3.6 Data-Plane Deployment State

Desired configuration and observed state are separate. Observation may report
drift but cannot silently redefine what should be deployed.

| field | required TARGET meaning | classification |
|---|---|---|
| `tenant_id` / `data_plane_locator_id` | exact deployment target | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `expected_schema_version` | approved desired migration/schema baseline | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `expected_application_version` | approved desired tenant application release | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `expected_function_version` | approved desired Edge/function release or manifest reference | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `compatibility_policy_version` | approved rule used to decide whether routing is safe | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `observed_schema_version` | last safely observed deployed schema baseline | `DERIVED_OPERATIONAL_STATE` |
| `observed_application_version` | last safely observed application release | `DERIVED_OPERATIONAL_STATE` |
| `observed_function_version` | last safely observed function release/manifest | `DERIVED_OPERATIONAL_STATE` |
| `observed_health` | bounded state such as unknown, healthy, degraded or unavailable; no customer row counts/content | `DERIVED_OPERATIONAL_STATE` |
| `drift_state` | derived comparison such as unknown, compatible, incompatible or ahead | `DERIVED_OPERATIONAL_STATE` |
| `observed_at` | timestamp and freshness boundary for the observation | `DERIVED_OPERATIONAL_STATE` |
| `last_successful_rollout_ref` | opaque last successful platform rollout/audit reference | `DERIVED_OPERATIONAL_STATE` |
| `last_successful_proof_ref` | opaque proof/evidence reference and time, without copied tenant data | `DERIVED_OPERATIONAL_STATE` |

Unknown, stale or incompatible observations fail according to the approved
compatibility policy. A green control-plane observation never substitutes for
tenant RLS, Auth, Storage, business or regulatory proof.

### 3.7 Platform Action Audit

`PlatformActionAudit` is append-only evidence for consequential control-plane
actions. Correction adds a linked event; it never updates or deletes the
original. The common event envelope is authoritative platform configuration
evidence, while actor references remain platform-access data.

| field | required TARGET meaning | classification |
|---|---|---|
| `platform_action_audit_id` | opaque immutable event identifier | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `actor_platform_principal_id` | authenticated platform actor, or explicit bounded system actor | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `tenant_id` | exact tenant scope when applicable; null only for a genuinely platform-global action | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `action_type` | closed consequential control-plane action | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `reason_or_purpose_ref` | required bounded reason/approval reference where applicable | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `occurred_at` | authoritative server timestamp | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `result` | closed success, rejection or failure outcome; no fabricated success | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `request_id` / `correlation_ref` | bounded request and cross-system correlation | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `provenance_ref` | source/change/proof reference without tenant dossier payload | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `supersedes_audit_id` | optional correction link to an earlier event | `AUTHORITATIVE_PLATFORM_CONFIG` |

Platform audit may identify a tenant and platform action. It contains no
customer identity, case content, evidence metadata/bytes, tenant Storage path,
raw credential or tenant operational audit mirror.

### 3.8 Secret Reference

`SecretReference` is an opaque handle to a separately isolated secret manager
or deployment-secret boundary. Control-plane services resolve it server-side
only after tenant, action and authorization checks.

| field | required TARGET meaning | classification |
|---|---|---|
| `secret_reference_id` | opaque non-secret reference identifier | `SECRET_REFERENCE` |
| `tenant_id` | exact tenant scope; no cross-tenant credential bundle | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `secret_purpose` | closed purpose such as data-plane service connection; not the secret value | `SECRET_REFERENCE` |
| `secret_backend_ref` | opaque backend locator that is not browser/log visible | `SECRET_REFERENCE` |
| `lifecycle_status` | active, rotation-pending, revoked or retired reference state | `SECRET_REFERENCE` |
| `version_ref` | opaque rotation/version reference, not key material | `SECRET_REFERENCE` |
| `changed_at` / `changed_by_principal_id` | lifecycle time and authorized platform actor | `AUTHORITATIVE_PLATFORM_ACCESS` |

No password, service-role key, private key, signing secret, provider token,
database connection string or resolvable credential value is an allowed field.

### 3.9 Tenant Presentation Configuration

Status: CURRENT PROVEN LOCAL for
`platform.tenant_presentation_configs` and its security-invoker current view.

Presentation configuration is append-only and versioned per exact
`tenant_id`/environment. The implemented bounded fields contain schema/config
version, display name, short mark, product label, optional tagline, safe
repository asset references/alt text and optional export basename. The
managed and static source adapters validate the same
`PresentationBrandConfigV1` contract and expose only
`PublicPresentationBrandV1` to the browser.

Presentation config is `PUBLIC_PRESENTATION_CONFIG`, not routing, tenant,
Auth/RLS, customer/case, legal-operator, signing, representation or support
authority. It stores no locator, project reference, credential, raw secret,
customer truth or finalized signing/legal snapshot. Missing, invalid,
ambiguous, tenant-mismatched or environment-mismatched configuration fails
closed. Canonical ENVAL defaults are allowed only through explicit
server-owned standalone configuration, never as a global white-label fallback.

### 3.10 Tenant Operational Configuration Boundary

Status: CURRENT PROVEN LOCAL for the TF02-B runtime contract/static selector;
TARGET for durable content, persistence, publishing and consumers.

The current `TenantConfigurationManifestV1` references exactly one approved
revision descriptor for operational, legal, fee/commercial and
provider/integration concerns. References carry revision identity and
canonical content hash; canonical whole-manifest SHA-256 reuses
`app_foundation`. Strict exact-key validation rejects generic payloads,
extension bags and credential-like fields.

Tenant/environment authority comes only from `AppTenantExecutionContext`.
Event time comes from a server-composition-owned `TenantConfigurationClockPort`.
The normal port is `resolveForExecutionContext(context)`; it exposes no raw
event time, independent tenant/environment or request/browser input. Core
validation, approval/effective-window selection, zero-match, ambiguity and
minimal supersession are single-authority and fail closed. The static adapter
owns immutable source and clock composition only.

This contract does not persist configuration in the control plane or tenant
data plane. TARGET durable material revisions/manifests belong to the owning
tenant data plane. A future control plane may own minimized publishing intent,
status or opaque references, never the material legal/fee/provider content or
credentials. `PresentationBrandConfigV1` remains separate public presentation
authority and cannot supply operator identity, contracting party, mandate
recipient, controller/privacy role, fee terms or provider credentials.

TF02-C is the next bounded foundation: tenant-local durable approved
component-revision and manifest persistence/read authority. Real content,
approval administration, opaque secret-binding lifecycle, signing/case/provider
cutovers, tenant #2, dynamic switching and production remain later work.

## 4. Forbidden Central Data

The following domain and field families are `FORBIDDEN_CENTRAL_DATA` in
ordinary control-plane records, platform audit, caches, logs and derived
health observations:

- customer PII, customer profiles and customer Auth credentials or sessions;
- tenant-local customer identities and customer access grants;
- parties, cases/dossiers, case roles and representation-authority evidence;
- charger, charge-point, location, EAN, MID, connection and allocation-point
  core truth;
- document/evidence bytes, filenames, hashes, object paths, signed URLs,
  parser output and evidence decisions;
- signing snapshots, signatures, OTP challenges, mandates and legal
  acceptances;
- eligibility, booking, verifier, REV and regulatory decision truth;
- settlement, payment, fee, payout and reconciliation ledger truth;
- raw tenant service-role keys, raw database credentials, provider tokens,
  signing/capability secrets and private keys; and
- tenant operational audit events or customer-support content copied for
  central convenience.

An opaque tenant-scoped correlation or proof reference is allowed only when it
cannot itself disclose or resolve forbidden data outside the separately
authorized owning plane.

## 5. Identifier Strategy

1. `tenant_id` is the stable internal platform identity and survives host,
   brand, provider, project, region, environment and data-plane replacement.
2. `public_slug` and `display_name` are presentation metadata only. They are
   never authentication, authorization or routing authority.
3. `routing_identity_id` and normalized host/domain identify a route record,
   not the tenant itself.
4. `data_plane_locator_id` and provider/project references identify a
   replaceable deployment destination, not the tenant itself.
5. All cross-control-plane references use opaque platform identifiers. They do
   not require copying tenant-local customer, party, case or evidence IDs.
6. Reference data-plane #1 receives a stable platform `tenant_id` only after
   the actual operator/tenant identity is resolved. The ENVAL brand/project
   label cannot supply that identity. Existing tenant-local identifiers and
   rows are not rewritten.

### 5.1 Orthogonal Operating Configuration

Commercial/deployment packaging is not a tenant type. These dimensions remain
independent and do not change the stable `tenant_id`:

| dimension | minimum TARGET values/shape | classification and authority limit |
|---|---|---|
| operator/tenant | one stable inboekdienstverlener tenant identity | `AUTHORITATIVE_PLATFORM_CONFIG`; not customer, support provider or represented organization |
| deployment ownership | `ENVAL_MANAGED_DEDICATED` or `CUSTOMER_MANAGED_SELF_HOSTED` | `AUTHORITATIVE_PLATFORM_CONFIG`; selects compatible deployment adapter/operations, never Auth or tenant identity |
| branding mode | ENVAL, LabelUP/co-brand or customer-owned presentation | `PUBLIC_PRESENTATION_CONFIG`; never routing, identity, authorization, ownership or legal authority |
| support model | `DIGITAL_ONLY`, `DIGITAL_PLUS_PHYSICAL`, `EXTERNAL_SUPPORT_PROVIDER` or `NONE_CUSTOMER_OPERATED` where applicable | `AUTHORITATIVE_PLATFORM_CONFIG`; names service shape only, while every actual access grant remains separate `AUTHORITATIVE_PLATFORM_ACCESS` |
| conflict-registry participation | connected eligible/opt-in participation or no platform-wide participation | `AUTHORITATIVE_PLATFORM_CONFIG`; independent of deployment owner and never evidence of no conflict |

Managed SaaS with the default ENVAL presentation, managed white-label,
customer-owned cloud and contractually agreed
standalone/self-hosted/source-license deployment are compositions of these
dimensions over one core. They do not create separate table families,
contracts, business modules or code forks. Branding never supplies an
identifier to `RoutingIdentity`, and support model never supplies an
authorization grant. LabelUP remains only a possible separately contracted
support-provider relationship; it is not automatically tenant, contracting
entity, platform admin or representation authority.

## 6. Trusted Routing Contract

CURRENT PROVEN LOCAL flow, with production ingress/deployment still unproven:

```text
trusted server/deployment routing context
-> selected trusted TenantResolutionAdapter
   -> platform_control_plane_v1: active RoutingIdentity -> active Tenant
   or static_single_tenant_v1: one fixed deployment-local Tenant context
-> resolve exactly one active compatible DataPlaneLocator/context
-> compare against the immutable fixed server execution identity
-> emit AppTenantExecutionContext only on exact parity
-> start the selected tenant application/bootstrap
-> initialize tenant-local customer Auth and data-plane services
```

Both adapters implement the same provider-independent `TenantResolverPort` and
`TenantDataPlaneLocator` outcomes. The core application receives only the
opaque resolved context and does not know which adapter, commercial package,
brand, support provider or deployment owner produced it.

`platform_control_plane_v1` uses the authoritative control-plane records in
this contract. `static_single_tenant_v1` uses trusted, immutable-at-runtime
deployment-local server configuration for exactly one tenant/data plane. It
requires no live ENVAL control-plane connection for tenant-local business
workflows, exposes no central credentials and cannot accept browser-selected
tenant, project, URL, locator or credential input.

Resolution fails closed without fallback to ENVAL or another tenant when:

- the host is unknown, unverified, inactive or revoked;
- no active tenant exists;
- multiple records could resolve the same identity;
- the tenant is suspended or deactivated;
- the required data-plane locator is missing, inactive, ambiguous or
  unavailable;
- observed configuration is stale/unknown where policy requires freshness, or
  schema/application/function drift is incompatible; or
- the server-side locator/secret boundary cannot resolve safely.

For the current fixed data-plane runtime,
`evaluateAppTenantResolutionBinding` is the single parity authority. It
compares tenant, environment, locator, deployment ownership, provider and
data-plane reference and emits no execution context on missing/invalid fixed
identity, resolver failure/timeout or mismatch. The shared app gate completes
before tenant business database, private Storage or service-role access and
propagates the frozen, non-secret result through
`AppRequestMeta.tenant_execution`. Presentation consumes that result rather
than re-resolving or recomputing parity. At commit `034691e`, the point-in-time
inventory is 33/33 current tenant-business endpoints shared-gated, with 0
manual duplicate parity implementations and 0 ungated.

For static resolution, absent, multiple, mutable/untrusted or incompatible
fixed contexts fail closed. Managed-mode control-plane failure cannot cause
fallback to static mode; adapter selection is trusted deployment
configuration, not runtime browser input.

A browser may never submit or override a tenant UUID, Supabase URL, provider
project reference, database target, locator or credential and thereby obtain a
tenant context. Public host data is at most a routing hint until the trusted
server boundary validates and resolves it.

Routing results may be cached only as a bounded server-controlled projection.
The cache key includes the normalized trusted routing identity and relevant
environment; values expose no secrets. Authoritative state stays in the
control plane. Status/domain/locator revocation must invalidate or expire
within a defined maximum propagation window, and stale/ambiguous cache state
fails closed. Exact cache technology and interval are DEFERRED.

## 7. Identity, Membership And No-Inference Rules

| relationship | owner | exact meaning | never implies |
|---|---|---|---|
| platform principal -> platform tenant membership | control plane | named platform administration capabilities for one tenant | tenant workforce role, customer access, dossier access, case role or representation authority |
| tenant workforce principal -> operational capability/scope | tenant data plane | tenant-local internal action authority | platform membership, customer identity or representation authority |
| customer Auth principal -> customer identity/access grant | tenant data plane | authenticated access to explicit tenant-local customer contexts | workforce authority, case participation or representation authority |
| party -> case role | tenant data plane | explicit participation in one case | Auth access, workforce authority or legal representation |
| representative -> representation authority | tenant data plane | separately reviewed legal/business fact with scope, provenance and validity | inference from email, Auth, title, signature, membership or case role |

No relationship may be inferred from another row family, matching email,
matching name, public slug, host, provider reference or convenience claim.

## 8. Future Support-Elevation Seam

Detailed support and break-glass workflow is DEFERRED. Any later design must use
a distinct, temporary `SupportElevation` authorization rather than widening
platform membership. Its minimum conceptual fields are:

| field | boundary | classification |
|---|---|---|
| `support_elevation_id` | opaque immutable grant identity | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `tenant_id` | one exact target tenant | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `actor_platform_principal_id` | one authenticated platform actor | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `target_capability_and_scope` | minimum named action/resource scope; never universal service role | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `reason_and_approval_ref` | mandatory purpose and separately decided approval evidence | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `starts_at` / `expires_at` | bounded validity; expiry mandatory | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `revoked_at` / `revoked_by_principal_id` | early revocation evidence | `AUTHORITATIVE_PLATFORM_ACCESS` |
| `platform_audit_ref` | immutable grant/use/expiry/revocation audit correlation | `AUTHORITATIVE_PLATFORM_CONFIG` |
| `tenant_authorization_evidence_ref` | opaque reference to separate tenant-side authorization/evidence when required | `AUTHORITATIVE_PLATFORM_ACCESS` |

Platform membership alone never permits dossier access. A later elevation must
be enforced through tenant-local authorization, recorded in immutable platform
audit and applicable tenant audit, and must not expose a service role or create
customer access. Approval count, tenant participation, emergency policy,
resource vocabulary, execution channel and retention remain DEFERRED.

An external physical support organization such as LabelUP is neither a
platform principal category nor a tenant type. Each future support relationship
and use requires one explicit tenant, provider organization reference,
capability/scope, actor, purpose, validity and tenant-side authorization.
LabelUP status grants no platform administration, tenant ownership, customer
identity, case role or representation authority. Physical/on-site evidence is
created in the owning tenant data plane and case lineage, not a central support
provider dossier store.

## 9. Control-Plane Security Boundary

- The control plane has its own Auth, authorization, network, storage, audit
  and secret-resolution boundaries.
- Browsers receive neither tenant data-plane credentials nor server-only
  locator/secret references capable of resolution.
- Service credentials are resolved server-side from one tenant-scoped opaque
  secret reference only after trusted routing and authorization checks.
- No universal service-role credential spans tenant data planes.
- Data minimization means control-plane compromise should not automatically
  expose ordinary tenant dossier data; it contains no such convenience copy.
- Separate Auth, credentials, private Storage and service boundaries limit the
  intended blast radius so compromise of one tenant data plane should not
  automatically expose another tenant.
- These are architecture controls, not absolute breach-prevention claims.
  Network, IAM, provider, logging, recovery and penetration evidence remain
  required before any production assurance.

## 10. Reference Data-Plane #1 Registration

Future bootstrap is additive control-plane registration only:

1. resolve the actual operator/tenant identity before activation; the ENVAL
   brand or current project label cannot supply it;
2. allocate one stable opaque `tenant_id` for that resolved tenant;
3. register and verify the trusted ENVAL reference host/domain routing identity;
4. register one active locator pointing to the existing ENVAL application and
   isolated data plane, with tenant-scoped secret references;
5. register desired schema/application/function versions and separately
   observed deployment/health state;
6. activate routing only after compatibility and fail-closed proofs pass; and
7. audit every registration, activation and later change.

Bootstrap does not rewrite or migrate existing customer/case/party/evidence
IDs, add `tenant_id` to isolated core tables, copy cross-plane customer data or
create a central customer identity. This contract performs none of these
steps.

## 11. Second-Tenant Readiness Gate

Tenant #2 remains prohibited until deterministic evidence proves all of:

- an independently provisioned tenant data plane;
- the identical approved migration/schema baseline;
- a separate customer Auth namespace;
- a separate private Storage namespace;
- separate tenant-scoped data-plane service credentials;
- correct trusted-host routing with unknown/ambiguous/override failure;
- negative cross-tenant browser access across Auth, API and Storage paths;
- negative cross-tenant service access across database, RPC, Edge and Storage;
- no default dossier access for a platform administrator;
- tenant A customer credentials cannot authenticate to or access tenant B,
  including through host, tenant, project, URL or locator-routing tricks;
- control-plane outage, stale cache, incompatible drift and locator failure
  fail safely without cross-tenant fallback; and
- append-only platform audit identifies provisioning, routing, locator,
  membership, deployment and revocation changes.

Proof of one boundary never substitutes for another. No second tenant is
created or provisioned by WL03.

## 12. Current Resolver Ports And Future Conflict Port

`TenantResolverPort`

- Input: trusted server request/routing context.
- Output: one opaque resolved active tenant context/reference.
- Responsibility: normalize and resolve one active routing identity and tenant
  deterministically; reject unknown, inactive or ambiguous context.
- Excludes: credentials, data-plane endpoints, customer Auth and browser-chosen
  tenant identity.

`TenantDataPlaneLocator`

- Input: one already-resolved active tenant context/reference and environment.
- Output: one restricted server-side active data-plane connection/config
  reference.
- Responsibility: enforce locator status and compatibility, then cross the
  separate secret-management boundary as independently authorized.
- Excludes: browser-visible credentials, raw secret values and tenant business
  queries.

`ConflictCheckPort` remains a DEFERRED seam only. WL03 defines no registry,
matching identifiers, normalization, methods, HMAC/key design, legal basis,
retention or implementation.

The future seam may connect isolated ENVAL-managed data planes and explicitly
participating customer-managed/self-hosted deployments to one
purpose-specific pseudonymized/keyed registry. Raw customer, case, EAN and MID
truth remains tenant-local, and a result reveals no other tenant, customer or
dossier. Participation does not require a shared customer database and is
independent of deployment ownership.

A disconnected/offline standalone deployment has no platform-wide conflict
result. It must record/report the check as unavailable/not performed rather
than interpreting absence of connectivity as `no conflict`. Exact policy for
whether other tenant-local work may continue remains DEFERRED.

## 13. Explicitly Deferred / Not Implemented

The original WL03 claim that every control-plane object was TARGET only is a
LEGACY pre-implementation status snapshot. The implemented local subset is
identified above and traced in `docs/app/01_SYSTEM_MAP.md`. The following
remain TARGET/DEFERRED or UNKNOWN:

- physical control-plane provider, hosting, region, network or recovery;
- live remote control-plane project/bootstrap/deployment and platform Auth
  provider/administration;
- tenant provisioning automation or fleet migration orchestration;
- centralized customer SSO or federation;
- platform support/break-glass workflow implementation;
- tenant/domain/brand administration UI, dynamic/uploaded logos and arbitrary
  theme overrides;
- real legal-operator/fee/provider content, durable tenant-local configuration
  persistence/read authority, publishing/approval and secret-binding lifecycle,
  consumer provenance cutovers and support-provider authority;
- separate LabelUP, SaaS or white-label application/business-code forks;
- customer-cloud and standalone/self-host installation, update distribution or
  support lifecycle automation;
- billing, settlement, payment or cross-tenant analytics;
- a second tenant/data plane;
- production domain ownership verification and trusted proxy/ingress topology;
- dynamic server-side data-plane client switching;
- conflict-registry implementation, MID/EAN/year matching, HMAC/key design,
  conflict legal basis or retention; or
- remote deployment, production proof or regulatory acceptance.

Any later implementation batch must trace an approved field and responsibility
from this contract to its owning component, authorization boundary, migration,
negative tests and audit evidence. The current local foundation grants no
blanket product, remote, deployment or production authorization.
