# Platform Control-Plane Physical Foundation

Status: TARGET — WL04 PHYSICAL FOUNDATION DESIGN — NOT IMPLEMENTED

Authority: this document selects the smallest repository-realistic physical
foundation for the WL02 architecture in
`docs/app/architecture/white-label-control-plane.md` and the WL03 domain
contract in `docs/app/contracts/platform-control-plane.md`. Those documents
remain controlling for ownership, field classification and no-inference
rules. WL04 does not restate them and grants no code, schema, migration, local
service, remote project, deployment or production authority.

The selection is a repository and isolation boundary, not a remote hosting
provider decision. `CURRENT PROVEN` remains limited to tenant #1 foundations;
the control plane described here is entirely TARGET.

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
| A. `platform/control-plane/` as a second Supabase CLI workdir in this repository | directly uses current Supabase/Deno/proof conventions and installed `--workdir` support | independent config, Postgres, Auth, Storage namespace, local ports, migrations and credentials | **SELECTED TARGET** |
| B. separate root-level database directory plus service code scattered under existing tenant directories | technically possible, but splits one plane across unrelated roots and increases wrong-workdir/import risk | can be equivalent only with extra conventions | REJECTED for first slice |
| C. separate repository/service | strong repository isolation, but no current multi-repo build, proof or release authority exists and shared verification would be duplicated prematurely | independent | DEFERRED; not needed for the minimum foundation |
| existing ENVAL `supabase/` with platform-prefixed tables | superficially small, but shares database/Auth/project service role and turns tenant #1 compromise or targeting mistakes into platform exposure | insufficient | REJECTED |

Selected shape: same Git repository for coherent review and verification, but a
different Supabase project workdir and runtime boundary. A future remote
control-plane project must also be independent; WL04 does not choose its
provider, organization, region, billing or project reference.

### 2.1 One Core Across Three Operating Models

The selected managed control plane is one adapter, not the ENVAL business
core. One unchanged core must support:

| model | operator/tenant | deployment ownership | brand/support composition |
|---|---|---|---|
| LabelUP managed service | the actual inboekdienstverlener; LabelUP is not automatically the tenant | normally `ENVAL_MANAGED_DEDICATED` | ENVAL, LabelUP or co-brand presentation; LabelUP support only through a separate tenant-scoped service/access relationship |
| SaaS for existing inboekers | each inboeker remains its own isolated tenant | `ENVAL_MANAGED_DEDICATED` | tenant presentation; digital administration with optional separately contracted physical support |
| full white-label / standalone | the purchasing inboeker remains its own isolated tenant | `ENVAL_MANAGED_DEDICATED` or `CUSTOMER_MANAGED_SELF_HOSTED` | customer-owned brand allowed; support and connected conflict participation independently configured |

Five configuration dimensions remain orthogonal: operator/tenant, deployment
ownership, branding mode, support model and conflict-registry participation.
They must not be collapsed into `tenant_type`, a package-specific schema or an
application fork. SLA/license differences later select configuration,
capabilities, optional integrations and a deployment adapter around shared
business modules/contracts.

Branding is presentation only. Support packaging is not access authority.
Conflict participation is not deployment ownership. LabelUP is not tenant,
platform admin, customer or representation authority merely because it sells
or performs digital/physical support.

## 3. Exact Repository Boundary

The physical root is:

```text
platform/
├── runtime/
│   └── tenant-resolution/
│       ├── tenant_resolution.ts
│       └── adapters/
│           └── platform_control_plane_v1.ts
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
- `platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts`
  contains the managed adapter against injected control-plane reads. A future
  sibling `static_single_tenant_v1.ts` may resolve one fixed trusted local
  context without importing or calling the control plane;
- `scripts/tools/` remains the shared home for repository-level target guards
  and verification selection; and
- `scripts/proofs/` remains the shared evidence location so the existing ENVAL
  harness can classify and report the new plane without a second framework.

No new package manager workspace or dependency is needed for the foundation.
The first pure Deno modules use provider-neutral types and injected adapters;
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

Within the control-plane database, first-slice tables live in a non-public
`platform` schema. Direct `anon` and `authenticated` access is absent/revoked;
RLS and grants are deny-by-default. A later runtime may expose narrowly scoped
service-only RPCs in an API schema, but WL05 exposes no browser endpoint and
grants no platform operator write path.

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
| platform control plane | `platform/control-plane/` | `enval-control-plane` | dedicated `55320`-`55329` assignments |

Examples are command shapes, not execution authorization:

```text
supabase --workdir . status
supabase --workdir platform/control-plane status
```

Start, reset, migration apply, link and deployment remain separately gated.
The control-plane config must assign every enabled local service a unique
`5532x` port; copying only API/database ports is insufficient. Local container,
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

Browser runtime configuration contains no control-plane URL, anon key, project
reference, locator or tenant selector in WL05. Later trusted routing must begin
from the server-observed host. Payload, query, local storage and browser env
cannot override the resolved tenant or data plane.

Future remote commands require both an explicit plane/environment target and a
verified expected linked-project reference. Absence or mismatch is a hard stop.
WL04 defines no remote project and authorizes no remote command.

## 7. Minimum First Schema

WL05 creates only four control-plane tables in schema `platform`:

| table | first-slice purpose | intentionally absent/deferred |
|---|---|---|
| `platform.tenants` | stable opaque tenant root, lifecycle, bounded public label/slug and creation/deactivation provenance | customer, party, case, legal or billing fields |
| `platform.routing_identities` | unique normalized trusted host/domain to tenant mapping, verification provenance and active lifecycle | wildcard fallback, browser-selected tenant and branding UI |
| `platform.data_plane_locators` | tenant/environment to active server-only deployment ownership, provider/project/application route plus opaque `secret_reference_id` | raw secret values, customer data, observed fleet health and universal credentials |
| `platform.action_audit_events` | append-only audit for consequential platform bootstrap/configuration actions and rejected attempts | dossier content, tenant audit mirror and mutable correction |

Required database invariants include stable UUID roots; foreign keys with
restrictive deletion; exact lifecycle/format checks; one active normalized
routing identity globally; one active locator per tenant/environment; no
update/delete of audit; deny-by-default privileges; and atomic audit for every
future consequential write function.

The opaque `secret_reference_id` is a locator field in WL05, not a secret value
and not yet a resolvable secret-registry table. Secret backend integration,
rotation state and a separate secret-reference registry are deferred until a
runtime genuinely resolves credentials.

The locator's deployment ownership is a closed independent value, initially
`ENVAL_MANAGED_DEDICATED` or `CUSTOMER_MANAGED_SELF_HOSTED`; it is not tenant
identity. WL05 needs only managed fixtures but must enforce/round-trip the
field so the schema does not assume every tenant is ENVAL-hosted. Branding,
support model and conflict participation are not needed by first resolution
and remain later separate configuration/relationship records rather than
columns that grant authority. No combined `tenant_type` is allowed.

Platform principals and memberships are also deferred from WL05 because there
is no platform login, UI or human write endpoint. System/migration provenance
may create schema and disposable proof fixtures, but no unaudited operational
bootstrap API is introduced. Principal, membership and platform Auth runtime
become mandatory before the first human administrative write path.

Desired/observed deployment-state tables are deferred. WL05 does not route
production traffic, so it can refuse every live activation rather than invent
health truth. They become mandatory before any locator is eligible for live
tenant traffic.

## 8. First Runtime Seam And Adapter Independence

The provider-independent runtime seam is server-only and has no HTTP handler:

```text
trusted server/deployment routing context
-> selected TenantResolutionAdapter
   -> platform_control_plane_v1
   or future static_single_tenant_v1
-> TenantResolverPort
-> opaque active tenant reference
-> TenantDataPlaneLocator
-> redacted server-only locator/config reference
-> shared ENVAL application/business core
```

`tenant_resolution.ts` defines the two ports, one adapter-neutral resolved
context and closed result/error types. It contains no control-plane client,
brand/package branch or network dependency. `platform_control_plane_v1.ts`
implements managed host normalization and resolution against injected
control-plane reads. Neither initializes a browser Supabase client, reads
tenant business data, resolves a raw secret or accepts arbitrary
tenant/project/URL input.

The later `static_single_tenant_v1` adapter will resolve exactly one fixed
tenant/data-plane context from trusted deployment-local server configuration.
It must fail closed on missing/multiple/invalid configuration and accept no
browser override. It will not call the ENVAL control plane, so a
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
schema evidence. No production static adapter, tenant UI, platform UI, public
routing endpoint or tenant #1 application wiring is part of the slice.

## 9. ENVAL Tenant #1 Future Bootstrap

The first real bootstrap, after its own approval, needs only:

- one stable opaque ENVAL `tenant_id` and active lifecycle;
- bounded ENVAL public slug/display metadata;
- each verified normalized ENVAL host/domain as a separate active routing
  identity with administrative provenance;
- one active locator for the exact environment, containing provider type,
  existing tenant #1 project reference, region/application route reference and
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

The future target guard must precede every migration, reset, link, deploy or
SQL command. It verifies explicit target, fixed workdir, config `project_id`,
expected port family for local work and expected linked project reference for
remote work. It prints only target metadata, never credentials. Ambiguity,
missing config, project mismatch, cross-plane migration path or simultaneous
credential namespaces fails before execution.

The verification harness must classify both migration roots independently.
An unclassified platform migration fails closed, and migration-omission checks
must cover the new root without weakening the exact existing tenant legacy
exceptions. Control-plane migrations can never be applied through the tenant
workdir, and tenant migrations can never be applied through the control-plane
workdir.

WL04 does not implement migration orchestration, fleet rollout, rollback,
remote linking or deployment.

## 12. Exact WL05 Foundation Scope

WL05 is one local-only foundation batch:

1. add the independent `platform/control-plane/supabase/config.toml` with
   project ID `enval-control-plane`, unique `5532x` ports, public Auth signup
   and Storage disabled, and no remote link;
2. add one forward-only control-plane migration creating only the four
   `platform` tables, constraints, deny-by-default grants, append-only audit
   guards and service-only read seams needed by the two ports;
3. add one provider-independent server-only Deno contract defining
   `TenantResolverPort`, `TenantDataPlaneLocator` and their single opaque
   resolved context, plus one separate `platform_control_plane_v1` managed
   adapter against injected control-plane reads; create no HTTP endpoint and no
   core dependency on that adapter;
4. add one explicit closed target/workdir guard for repository tooling;
5. extend the existing verification manifest, runner proof and migration
   omission guard to classify the new paths and reject cross-target execution;
6. add one focused disposable local proof covering schema, fail-closed managed
   routing, secret redaction, audit immutability, target ambiguity,
   adapter-neutral context parity through a fake fixed adapter, absence of a
   managed dependency in the port contract and tenant #1 schema preservation;
   and
7. add only the nested Supabase local-state ignore entries required by the new
   workdir.

Best current file estimate:

```text
NEW  platform/control-plane/supabase/config.toml
NEW  platform/control-plane/supabase/migrations/<timestamp>_platform_control_plane_foundation.sql
NEW  platform/runtime/tenant-resolution/tenant_resolution.ts
NEW  platform/runtime/tenant-resolution/adapters/platform_control_plane_v1.ts
NEW  scripts/tools/enval-supabase-target.mjs
NEW  scripts/proofs/platform-control-plane-foundation.proof.ts
MOD  .gitignore
MOD  scripts/tools/enval-verify-manifest.mjs
MOD  scripts/tools/enval-verify.mjs
MOD  scripts/proofs/enval-verify-runner.proof.mjs
```

WL05 explicitly excludes platform/customer UI, tenant #2, real tenant #1
bootstrap, customer-data movement, tenant schema changes, platform
principal/membership, support elevation, secret-manager integration,
deployment-state/health, conflict registry, remote project creation/linking,
remote migration and production routing. It also excludes the production
`static_single_tenant_v1` adapter, standalone packaging, branding/support
configuration implementation and any LabelUP/SaaS/white-label code fork.

WL05 must leave the provider-independent contract free of control-plane
imports, networking and commercial/package branches. It builds the managed
foundation and managed adapter only; later standalone work adds a fixed local
adapter behind the same ports without changing shared customer/case business
modules.

No additional Daan decision is required for this local-only WL05 foundation.
A remote provider/project/region decision and real ENVAL bootstrap values are
required only before a later remote/bootstrap batch.
