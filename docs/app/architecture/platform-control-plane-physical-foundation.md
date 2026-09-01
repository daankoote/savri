# Platform Control-Plane Physical Foundation

Status: CURRENT PROVEN LOCAL physical/runtime foundation through WL11E /
commit `8b47126`; TARGET remote/operations; LEGACY completed WL05 plan snapshot

Strategic status overlay: DECIDED/TARGET on 2026-09-01. The ENVAL software and
generic IP remain independently owned. The root project is the
reference/default tenant data plane, not proof that ENVAL Software is the
regulated operator or that a first commercial tenant has been selected.

Authority: this document selects the smallest repository-realistic physical
foundation for the WL02 architecture in
`docs/app/architecture/white-label-control-plane.md` and the WL03 domain
contract in `docs/app/contracts/platform-control-plane.md`. Those documents
remain controlling for ownership, field classification and no-inference
rules. WL04 originally granted no implementation authority; WL05 through WL11E
subsequently implemented the bounded local foundation described below. This
does not grant remote project, deployment or production authority.

The selection is a repository and isolation boundary, not a remote hosting
provider decision. The separate local control-plane schema/runtime and tenant
#1 parity are CURRENT PROVEN LOCAL. A live remote control plane, production
ingress and commercial tenant-management operations remain TARGET/UNKNOWN.

## 1. Repository Evidence

The current checkout establishes these design constraints:

- the root `supabase/` directory is tenant #1: `project_id = "enval"`, local
  API/database ports are `54321`/`54322`, and its migrations, Auth, Storage and
  `api-app-*` Edge Functions own ENVAL customer/case behavior;
- the installed Supabase CLI supports an explicit `--workdir` on project,
  migration and database commands, so two independent project directories are
  supported without inventing a second toolchain;
- `app/` is one tenant #1 Vite customer app. Its runtime config selects one
  tenant Supabase URL/anon key and API base; it is not a platform-admin app;
- the root static/Netlify surface is also wired to tenant #1 public runtime
  configuration and is not a control-plane host;
- current Edge `_shared` modules contain tenant concepts, tenant table names,
  ENVAL origins and tenant service-role behavior. They are not neutral
  platform libraries;
- current environment files are ignored, but generic names such as
  `SUPABASE_URL` are already tenant-runtime conventions and are ambiguous for
  host-side multi-project tooling;
- `scripts/tools/enval-readonly-sql.mjs` intentionally rejects any local
  project other than `enval`; that guard must remain tenant #1-specific until
  separately extended through an explicit target contract; and
- the ENVAL verification harness already provides static command
  classification, fail-closed unknown paths, gated SQL/mutation classes,
  compact evidence and proof conventions under `scripts/proofs/`.

No current evidence supports placing platform tables, platform Auth or
platform credentials in the tenant #1 project.

## 2. Options And Decision

| option | repository fit | isolation | disposition |
|---|---|---|---|
| A. `platform/control-plane/` as a second Supabase CLI workdir in this repository | directly uses current Supabase/Deno/proof conventions and installed `--workdir` support | independent config, Postgres, Auth, Storage namespace, local ports, migrations and credentials | **SELECTED — CURRENT PROVEN LOCAL** |
| B. separate root-level database directory plus service code scattered under existing tenant directories | technically possible, but splits one plane across unrelated roots and increases wrong-workdir/import risk | can be equivalent only with extra conventions | REJECTED for first slice |
| C. separate repository/service | strong repository isolation, but no current multi-repo build, proof or release authority exists and shared verification would be duplicated prematurely | independent | DEFERRED; not needed for the minimum foundation |
| existing ENVAL `supabase/` with platform-prefixed tables | superficially small, but shares database/Auth/project service role and turns tenant #1 compromise or targeting mistakes into platform exposure | insufficient | REJECTED |

Selected shape: same Git repository for coherent review and verification, but a
different Supabase project workdir and runtime boundary. A future remote
control-plane project must also be independent; WL04 does not choose its
provider, organization, region, billing or project reference.

### 2.1 One Core Across Commercial/Deployment Models

The selected managed control plane is one adapter, not the ENVAL business
core. One unchanged core must support:

| model | operator/tenant | deployment ownership | brand/support composition |
|---|---|---|---|
| managed SaaS with default ENVAL presentation | resolved inboekdienstverlener tenant; exact first tenant UNKNOWN | `ENVAL_MANAGED_DEDICATED` | ENVAL reference presentation; legal identity and support remain separate |
| managed white-label | actual inboeker/service-provider tenant | `ENVAL_MANAGED_DEDICATED` | tenant presentation; support separately contracted |
| customer-owned cloud | actual inboeker/service-provider tenant | `CUSTOMER_MANAGED_SELF_HOSTED` | customer presentation; operational/support ownership separately contracted |
| standalone/self-hosted/source-license where contractually agreed | actual inboeker/service-provider tenant | `CUSTOMER_MANAGED_SELF_HOSTED` | fixed trusted local resolution; updates, support and conflict participation separate |

Five configuration dimensions remain orthogonal: operator/tenant, deployment
ownership, branding mode, support model and conflict-registry participation.
They must not be collapsed into `tenant_type`, a package-specific schema or an
application fork. SLA/license differences later select configuration,
capabilities, optional integrations and a deployment adapter around shared
business modules/contracts.

Branding is presentation only. Support packaging is not access authority.
Conflict participation is not deployment ownership. LabelUP is not tenant,
contracting entity, platform admin, customer or representation authority
merely because it sells or performs digital/physical support.

## 3. Exact Repository Boundary

The physical root is:

```text
platform/
├── runtime/
│   ├── tenant-resolution/
│   │   ├── tenant_resolution.ts
│   │   ├── tenant_resolution_composition.ts
│   │   ├── trusted_ingress.ts
│   │   └── adapters/
│   │       ├── platform_control_plane_v1.ts
│   │       └── static_single_tenant_v1.ts
│   └── presentation/
│       ├── presentation_brand_config.ts
│       ├── presentation_brand_source.ts
│       ├── presentation_source_composition.ts
│       └── adapters/
│           ├── platform_control_plane_presentation_v1.ts
│           └── static_presentation_config_v1.ts
└── control-plane/
    └── supabase/
        ├── config.toml
        └── migrations/
```

Responsibilities:

- `platform/control-plane/supabase/config.toml` is the only Supabase config for
  the control plane and uses project ID `enval-control-plane` plus a dedicated
  local port range;
- `platform/control-plane/supabase/migrations/` contains only platform schema
  and platform RPC migrations; tenant migrations remain only in
  `supabase/migrations/`;
- `platform/runtime/tenant-resolution/tenant_resolution.ts` contains only the
  provider-independent port/context contract consumed before tenant-local
  business logic;
- `platform/runtime/tenant-resolution/` contains the provider-neutral
  contracts, composition, trusted-ingress normalization and managed/static
  adapters;
- `platform/runtime/presentation/` contains the presentation contract,
  canonical ENVAL defaults, managed/static sources and composition;
- `supabase/functions/_shared/app_presentation_bootstrap.ts` and
  `supabase/functions/api-app-presentation-bootstrap/` provide the safe
  server-owned public presentation seam after tenant resolution;
- `scripts/tools/` remains the shared home for repository-level target guards
  and verification selection; and
- `scripts/proofs/` remains the shared evidence location so the existing ENVAL
  harness can classify and report the new plane without a second framework.

No new package manager workspace or dependency is needed for the foundation.
The pure Deno modules use provider-neutral types and injected adapters;
they do not import tenant customer/Auth/audit helpers or make a network call at
module load. Core business modules consume only the resolved context, never a
managed/static adapter type. Generic helpers may be extracted later only when
both planes have a proven identical, tenant-neutral contract. Copying
`app_foundation.ts`, the legacy fail-open `audit.ts`, customer CORS defaults or
tenant service-client factories is prohibited.

There is no `platform/control-plane/app/` in WL05. A platform admin UI, if ever
approved, is a later separately authenticated application.

## 4. Physical Data And Auth Boundary

The control plane is a distinct Supabase project locally and in every future
environment. Therefore it has its own Postgres cluster/database, `auth` schema,
JWT issuer/signing keys, anon/service-role keys, Edge runtime secrets and
migration history. Storage is disabled in WL05 because the minimum control
plane stores no objects; if later required, it must be a separate platform
namespace rather than tenant Storage.

Tenant #1 remains the current root `supabase/` project. WL04/WL05 makes no
change to its `public` schema, Auth users, Storage objects, migrations,
customer/case rows or credentials. It adds no `tenant_id` to tenant-local core
tables.

Within the control-plane database, current local tables live in the `platform`
schema. Direct `anon` and `authenticated` access is absent/revoked; RLS and
grants are deny-by-default. The schema is exposed through the control-plane
PostgREST boundary only for server service-role reads. The tenant application
exposes a separate safe presentation-bootstrap projection; browsers receive no
control-plane URL/key, tenant route, locator or internal provenance. There is
still no platform operator write path or administration UI.

Control-plane Auth is physically available only in the independent project.
Public signup is disabled. WL05 creates no platform Auth user, principal,
membership, login flow or UI. A later admin-access slice must validate only the
control-plane issuer/audience and add explicit principal plus membership truth
before any human write API exists. Tenant customer or workforce tokens are
never accepted as platform identity.

## 5. Local Development Model

Both projects may run concurrently, but every command names its plane:

| plane | Supabase workdir | project ID | reserved local ports |
|---|---|---|---|
| tenant #1 ENVAL data plane | repository root (`supabase/`) | `enval` | existing `54320`-`54329` assignments |
| platform control plane | `platform/control-plane/` | `enval-control-plane` | dedicated `56320`-`56329` assignments |

Examples are command shapes, not execution authorization:

```text
supabase --workdir . status
supabase --workdir platform/control-plane status
```

Start, reset, migration apply, link and deployment remain separately gated.
The control-plane config assigns every enabled local service a unique `5632x`
port; copying only API/database ports is insufficient. Local container,
volume and network names must derive from `enval-control-plane`, not `enval`.

No tool may infer target from the current shell directory, a generic
`SUPABASE_URL`, a running port or whichever project was linked last. Host-side
tooling requires an explicit closed target:

```text
CONTROL_PLANE
TENANT_ENVAL
```

Missing, unknown, conflicting or mismatched target/workdir/project ID exits
non-zero before a subprocess or database connection is created. A target guard
maps the closed target to its fixed repository workdir and expected local
project ID; callers cannot pass an arbitrary path or project reference.

## 6. Environment And Credential Selection

Host-side environment namespaces are distinct:

```text
ENVAL_CONTROL_PLANE_*
ENVAL_TENANT_ENVAL_*
```

Raw values remain only in ignored local environment/secret storage or the
future deployment secret manager. They never enter tracked config, migration,
seed, audit, log or proof output. A host tool selects one namespace only after
the explicit target guard passes and never falls back to generic credentials.

Inside a Supabase Edge runtime, provider-injected generic variables such as
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain scoped to that runtime's
own project. Platform functions may use only values from the control-plane
deployment. A tenant data-plane credential is reachable only through a
tenant-scoped opaque secret reference and a later server-side secret adapter;
it is never stored as an ordinary control-plane row or returned to a browser.

Browser runtime configuration contains no control-plane URL, key, project
reference, locator or tenant selector. Current trusted ingress begins from a
server/deployment-owned routing context; raw browser/request host values are
not production authority. Payload, query, local storage and browser env cannot
override the resolved tenant, source mode, brand or data plane. Production
proxy/ingress topology remains UNKNOWN.

Future remote commands require both an explicit plane/environment target and a
verified expected linked-project reference. Absence or mismatch is a hard stop.
WL04 defines no remote project and authorizes no remote command.

## 7. Current Local Schema

The local control plane has five bounded tables in schema `platform`:

| table | first-slice purpose | intentionally absent/deferred |
|---|---|---|
| `platform.tenants` | stable opaque tenant root, lifecycle, bounded public label/slug and creation/deactivation provenance | customer, party, case, legal or billing fields |
| `platform.routing_identities` | unique normalized trusted host/domain to tenant mapping, verification provenance and active lifecycle | wildcard fallback, browser-selected tenant and branding UI |
| `platform.data_plane_locators` | tenant/environment to active server-only deployment ownership, provider/project/application route plus opaque `secret_reference_id` | raw secret values, customer data, observed fleet health and universal credentials |
| `platform.action_audit_events` | append-only audit for consequential platform bootstrap/configuration actions and rejected attempts | dossier content, tenant audit mirror and mutable correction |
| `platform.tenant_presentation_configs` | append-only, versioned public presentation configuration per tenant/environment | legal operator, support authority, tenant routing authority, secrets and customer truth |

`platform.current_tenant_presentation_configs` is a security-invoker current
view over the versioned presentation records. It does not make presentation
identity into tenant, legal or support authority.

Required database invariants include stable UUID roots; foreign keys with
restrictive deletion; exact lifecycle/format checks; one active normalized
routing identity globally; one active locator per tenant/environment; no
update/delete of audit; deny-by-default privileges; and atomic audit for every
future consequential write function.

The opaque `secret_reference_id` is a locator field in WL05, not a secret value
and not yet a resolvable secret-registry table. Secret backend integration,
rotation state and a separate secret-reference registry are deferred until a
runtime genuinely resolves credentials.

The locator's deployment ownership is a closed independent value,
`ENVAL_MANAGED_DEDICATED` or `CUSTOMER_MANAGED_SELF_HOSTED`; it is not tenant
identity. Both managed and static resolution round-trip the same safe context.
Presentation has its own versioned table; support model and conflict
participation remain later separate configuration/relationship records rather
than columns that grant authority. No combined `tenant_type` is allowed.

Platform principals and memberships are also deferred from WL05 because there
is no platform login, UI or human write endpoint. System/migration provenance
may create schema and disposable proof fixtures, but no unaudited operational
bootstrap API is introduced. Principal, membership and platform Auth runtime
become mandatory before the first human administrative write path.

Desired/observed deployment-state tables are deferred. WL05 does not route
production traffic, so it can refuse every live activation rather than invent
health truth. They become mandatory before any locator is eligible for live
tenant traffic.

## 8. Current Local Runtime Seam And Adapter Independence

Tenant and presentation resolution remain server-owned. The only public HTTP
result is a validated, non-secret presentation projection:

```text
trusted server/deployment routing context
-> selected TenantResolutionAdapter
   -> platform_control_plane_v1
   or static_single_tenant_v1
-> TenantResolverPort
-> opaque active tenant reference
-> TenantDataPlaneLocator
-> redacted server-only locator/config reference
-> authoritative tenant gate
-> platform_control_plane_presentation_v1
   or static_presentation_config_v1
-> PublicPresentationBrandV1
-> api-app-presentation-bootstrap
-> PresentationBrandProvider
-> shared ENVAL application/business core without dynamic client switching
```

`tenant_resolution.ts` defines the two ports, one adapter-neutral resolved
context and closed result/error types. It contains no control-plane client,
brand/package branch or network dependency. `platform_control_plane_v1.ts`
implements managed host normalization and resolution against injected
control-plane reads. Neither initializes a browser Supabase client, reads
tenant business data, resolves a raw secret or accepts arbitrary
tenant/project/URL input.

`static_single_tenant_v1` resolves exactly one fixed tenant/data-plane context
from trusted deployment-local server configuration. It fails closed on
missing/multiple/invalid configuration and accepts no browser override. It
does not call the ENVAL control plane, so a
customer-managed/self-hosted deployment can continue its tenant-local business
workflows while the ENVAL control plane is unavailable. Managed mode never
silently falls back to static mode; adapter selection is fixed deployment
configuration.

The shared ENVAL core sees only the resolved context. It cannot branch on
LabelUP/SaaS/white-label package, brand, support provider, deployment owner or
adapter implementation. Adapter-specific connection/bootstrap work stays
outside customer/case/signing/evidence domain modules.

The WL05 proof uses synthetic control-plane fixtures inside a disposable local
control-plane transaction and rolls them back. It proves exact host success;
unknown/inactive/ambiguous host denial; inactive/missing locator denial;
browser override rejection; secret-value absence; deduplication/uniqueness;
append-only audit; adapter-neutral result parity through a fake fixed adapter;
no managed dependency in the port/core contract; and unchanged tenant #1
schema evidence. Later proofs add static-adapter parity, trusted ingress,
shadow/authoritative gating, presentation-source parity and safe React runtime
consumption. There is still no tenant/platform administration UI, production
routing proof or dynamic tenant data-plane client selection.

## 9. Reference Data-Plane #1 Future Registration

Any real registration, after a first tenant is selected and after its own
approval, needs only:

- one stable opaque `tenant_id` for the resolved operator and active lifecycle;
- bounded public slug/display metadata, which may use the ENVAL reference
  presentation but never supplies legal identity;
- each verified normalized reference host/domain as a separate active routing
  identity with administrative provenance;
- one active locator for the exact environment, containing provider type,
  existing reference-project identity, region/application route reference and
  an opaque tenant-scoped secret reference;
- compatible desired/observed deployment state before live activation; and
- one atomic platform audit chain for registration, verification, locator
  assignment and activation.

No customer, Auth user, customer access grant, party, case, evidence, signing,
mandate, settlement, Storage object or tenant audit row is copied. Existing
tenant #1 identifiers remain untouched and no tenant-local `tenant_id` backfill
occurs.

WL05 does not persist this real bootstrap. Its proof may use synthetic/local
fixtures only, rolled back after verification. Production host, provider
project reference, region, secret reference and activation evidence belong to
the later environment-specific bootstrap gate.

### 9.1 Presentation, Support And Conflict Integration Boundaries

Branding is deployment/tenant presentation configuration only. The shared core
must permit ENVAL, LabelUP/co-brand and customer-owned branding without using a
brand value as tenant ID, host authority, Auth issuer, customer/case owner or
legal/representation fact. WL05 stores/designs no branding UI or theme schema.

Physical support is an optional provider relationship. A support organization
such as LabelUP may serve several tenants only through separate tenant-local
workforce/support identity, capability, scope, purpose, validity and audit.
Support access is not platform admin, tenant owner, customer identity, case role
or representation authority. On-site evidence is written to the owning tenant
data plane/case lineage under its authorization and provenance; there is no
central LabelUP dossier copy. Detailed support/elevation runtime remains
deferred.

Cross-database matching remains possible without shared customer storage. A
future optional outbound `ConflictCheckPort` adapter may send only separately
approved purpose-specific keyed/pseudonymized signals from connected
ENVAL-managed or explicitly participating customer-managed/self-hosted data
planes to the future registry. Raw customer/case/EAN/MID truth stays local and
the registry reveals no other tenant/customer/dossier.

Conflict participation is independent of deployment ownership. A fully
offline/disconnected standalone deployment cannot receive platform-wide
matching; it must represent the check as unavailable/not performed, never as
`no conflict`. Exact signals, matching, keys, legal basis, retention and offline
continuation policy remain DEFERRED and are excluded from WL05.

## 10. Security And Blast-Radius Boundary

- Platform database, Auth, JWT keys, service role, Edge secrets and migration
  history are separate from tenant #1 and every later tenant.
- No platform credential is accepted by a tenant data plane, and no tenant
  credential is platform identity.
- Tenant credentials and locator/secret references are server-only and never
  enter customer browser configuration or responses.
- The control plane stores no ordinary dossier truth, limiting the data exposed
  by a control-plane compromise; this is blast-radius reduction, not an
  absolute breach claim.
- Separate tenant projects, credentials and Storage limit the intended effect
  of one tenant compromise from automatically reaching another tenant.
- Platform membership, when later implemented, authorizes only named platform
  actions and never dossier access, tenant workforce authority, customer
  access, case role or representation authority.
- Branding, commercial package, support model, deployment ownership and
  conflict participation grant no authorization by themselves.
- No universal service role or fleet credential may span tenants.

## 11. Migration And Deployment Model

Migration histories never mix:

```text
supabase/migrations/                              # TENANT_ENVAL only
platform/control-plane/supabase/migrations/       # CONTROL_PLANE only
```

The current target guard and verification harness fail closed on ambiguous or
cross-plane migration workdirs and independently inventory both migration
roots. Any future migration, reset, link, deploy or SQL orchestration must keep
that explicit target, fixed workdir, config `project_id`, local port family and
remote linked-project verification. It may print only target metadata, never
credentials.

The harness classifies both migration roots independently. An unclassified,
ignored, invalid or colliding platform migration fails closed, and omission
checks cover the new root without weakening the exact existing tenant legacy
exceptions. Control-plane migrations cannot be applied through the tenant
workdir, and tenant migrations cannot be applied through the control-plane
workdir.

WL04 does not implement migration orchestration, fleet rollout, rollback,
remote linking or deployment.

## 12. LEGACY — Completed WL05 Plan Snapshot

The former file estimate and “not implemented” wording in this section were a
WL04 planning snapshot. WL05 completed the local managed foundation; WL06-WL11E
then added static resolution, trusted ingress, authoritative gate propagation,
presentation contracts/sources, versioned presentation storage and the safe
browser bootstrap/provider seam. The current implementation and evidence
anchors are listed in `docs/app/01_SYSTEM_MAP.md`.

The exclusions that remain current are: platform/customer administration UI,
tenant #2, live tenant onboarding/bootstrap, customer-data movement, tenant #1
schema rewrites, platform principal/membership administration, support
elevation, secret-manager lifecycle, deployment-state/health orchestration,
conflict registry, remote project creation/linking/migration and production
routing. Remote provider/project/region and real environment bootstrap values
require later explicit decisions and proof.
