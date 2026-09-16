# ENVAL Architectuur

## Surfaces

1. Production frontend: static HTML/CSS/JS in the repository root.
2. Rebuild frontend: isolated Vite app in `/app`.
3. Backend: Supabase Edge Functions, migrations, storage, and database logic in `/supabase`.
4. Documentation: current app source-of-truth docs in `docs/app/`; the former legacy documentation tree has been removed from the repo after external copy.

## Current Boundary

The root static site remains the live production surface. The `/app` Vite app is local development only and has no Netlify deploy contract yet.

The standard local Vite dev URL is:

```text
http://localhost:5175/
```

Ports `5173` and `5174` are reserved for other projects.

## Current White-Label And Control-Plane Foundation

Status: CURRENT PROVEN LOCAL through TF02-B / commit `9f9f310`. This is local
architecture/runtime readiness, not a production deployment or a finished
commercial tenant-management product.

The repository now contains one provider-neutral ENVAL core boundary with two
server-owned deployment modes:

- managed resolution through `platform_control_plane_v1` and the separately
  modeled local control plane under `platform/control-plane/`;
- standalone resolution through `static_single_tenant_v1` and one fixed,
  trusted deployment-local tenant/data-plane configuration.

The control plane and every tenant data plane are distinct architectural
domains. Tenant #1 remains the existing root `supabase/` data plane; its
customer, case, signing and evidence truth was not copied and its tenant-local
core tables received no convenience `tenant_id` backfill. The local control
plane has independent config, migration history and credentials and currently
models tenant, routing identity, data-plane locator, platform action audit and
versioned presentation configuration. It contains no ordinary customer, case,
signing or evidence truth.

Current server flow:

```text
trusted server/deployment routing context
→ TenantResolverPort / TenantDataPlaneLocator
→ platform_control_plane_v1 or static_single_tenant_v1
→ evaluateAppTenantResolutionBinding
→ exact parity with the immutable fixed server execution identity
→ authoritative gate emits immutable AppTenantExecutionContext
→ AppRequestMeta.tenant_execution for all inventoried CURRENT tenant-business endpoints
→ server-owned presentation source composition
→ safe PublicPresentationBrandV1 projection
→ api-app-presentation-bootstrap
→ PresentationBrandProvider
→ AppHeader / DashboardSidebar / NotFoundPage
```

The separate TF02-B configuration foundation is CURRENT PROVEN LOCAL but has
no current business consumer:

```text
AppTenantExecutionContext tenant/environment
+ server-composition-owned TenantConfigurationClockPort
→ createTenantConfigurationServerSelectionAuthorityV1(clock)
→ StaticSingleTenantConfigurationV1Adapter.resolveForExecutionContext(context)
→ strict manifest/component validation and canonical SHA-256 verification
→ server-time effective-window selection
→ exactly one immutable resolved configuration or fail closed
```

The normal runtime port accepts only `AppTenantExecutionContext`; it exposes no
raw `evaluatedAt`/`effectiveAt`, independent tenant/environment argument,
request object or generic configuration payload. The trusted-time wrapper and
low-level selector are module-private. The core owns all validation, hash,
approval-time, effective-window, zero-match, ambiguity and minimal
supersession rules. The static adapter owns immutable source injection, fixed
execution-context composition, server-clock composition and delegation; it
duplicates none of those policies.

`evaluateAppTenantResolutionBinding` is the single canonical resolution/parity
authority. It compares tenant, environment, locator, deployment ownership,
provider and data-plane reference before the shared gate exposes the frozen,
non-secret `tenant_execution` context. Missing or invalid fixed execution
identity, resolver failure/timeout, inactive or ambiguous resolution, or any
parity mismatch fails closed. Tenant business database, private Storage and
service-role access begin only after that result; earlier server-owned
environment/routing metadata reads do not access tenant business truth.
Hosted fixed identity is derived server-side from the supported Supabase
project identity; local/custom development uses the non-secret fixed
data-plane reference seam. Unknown or unprovable execution identity fails
closed, as do spoofed selection, unknown/inactive routing, ambiguous
resolution, missing/invalid or non-singular locator state, and
environment/provider/deployment/data-plane mismatch. There is no fallback to a
default tenant after failure.

The trusted-ingress boundary does not treat raw browser input, `Host` or
`X-Forwarded-Host` as production tenant authority. Browser payload, query,
storage and runtime values cannot select a tenant, source mode, locator,
project, credential or arbitrary brand. Production proxy/ingress topology and
domain-ownership verification remain UNKNOWN. Current tenant routing and the
tenant Supabase client target are unchanged; `DYNAMIC_DATA_PLANE_SWITCHING=NO`.
TF01 does not dynamically create tenant-specific Supabase clients.

The current inventory is point-in-time evidence: 33 of 33 current
tenant-business `api-app-*` endpoints reach the shared gate, with zero
ungated endpoints and zero endpoint-local/manual parity implementations.
`api-app-presentation-bootstrap` consumes `AppRequestMeta.tenant_execution`
after that gate and neither re-resolves tenant context nor recomputes parity.
Every future CURRENT tenant-business endpoint must enter through this same
shared gate; 33 is an inventory result, not a permanent constant.

TF01 authority map:

| responsibility | single authority / consumer |
|---|---|
| trusted routing context | `buildTrustedTenantRoutingContext` |
| tenant/data-plane resolution | `TenantResolverPort`, `TenantDataPlaneLocator`, selected server-owned adapter (`PlatformControlPlaneV1Adapter` or intentional `static_single_tenant_v1`) |
| fixed deployment execution identity | server environment composition in `app_tenant_resolution_shadow.ts` |
| resolution-to-fixed-execution parity and fail-closed decision | `evaluateAppTenantResolutionBinding` |
| immutable request propagation | `AppTenantExecutionContext` via `AppRequestMeta.tenant_execution` |
| presentation selection | presentation bootstrap consumes the propagated context; it does not resolve or compare again |

TF02-B configuration authority map:

| responsibility | single authority / consumer |
|---|---|
| tenant and environment | immutable `AppTenantExecutionContext` |
| canonical serialization/hash | existing `app_foundation.ts` `payloadHash` authority |
| component and manifest validation, effective selection and ambiguity | `app_tenant_configuration.ts` |
| event-time source | server-composition-owned `TenantConfigurationClockPort`, read once per resolution |
| immutable static source and context-only public port | `StaticSingleTenantConfigurationV1Adapter` |
| presentation | separate `PresentationBrandConfigV1`; no legal/fee/provider authority |
| current business consumers | none |

`PresentationBrandConfigV1` is presentation-only. Tenant identity,
presentation brand, legal operator identity and support-provider identity are
separate concepts. Presentation values grant no Auth/RLS/customer/case access,
platform membership, workforce capability or representation authority, and
cannot rewrite finalized signing/legal evidence. A customer context or case
role also does not by itself prove representation authority. Current ENVAL
rendering parity and synthetic alternate-brand behavior are deterministic
local proof only.

Implementation and proof anchors:

| boundary | implementation | deterministic evidence |
|---|---|---|
| isolated control plane and target guard | `platform/control-plane/`, `scripts/tools/enval-supabase-target.mjs` | `platform-control-plane-foundation.proof.ts`, verifier-runner proof |
| provider-neutral tenant resolution | `platform/runtime/tenant-resolution/` | `tenant-resolution-composition.proof.ts` |
| trusted ingress, fixed execution parity and authoritative propagation | `trusted_ingress.ts`, `app_tenant_resolution_shadow.ts`, `app_foundation.ts`, shared workforce gate | `trusted-ingress-boundary.proof.ts`, `app-tenant-resolution-shadow.proof.ts`, `api-app-ops-location-callers.proof.ts` |
| presentation contract and sources | `platform/runtime/presentation/`, versioned control-plane presentation migration | `presentation-brand-config.proof.ts`, `presentation-brand-sources.proof.ts` |
| safe browser bootstrap and React consumption | `app_presentation_bootstrap.ts`, `api-app-presentation-bootstrap/`, `app/src/shared/presentation/` | `PresentationBrandRuntime.proof.tsx`, `PresentationBrandProvider.proof.tsx` |
| tenant-configuration contract and safe static selection | `app_tenant_configuration.ts`, `app_tenant_configuration_static_single_tenant_v1.ts` | `app-tenant-configuration-manifest.proof.ts` Q01-Q38 plus runtime export proof |

Still TARGET/DEFERRED: a real tenant #2, real customer white-label onboarding,
live control-plane bootstrap/deployment, production custom domains and trusted
proxy topology, dynamic data-plane switching, tenant/fleet provisioning,
customer-cloud or self-host installation automation, brand/domain/admin UI,
uploaded logos or arbitrary themes, real approved tenant
operational/legal/fee/provider content, durable tenant-local configuration
persistence/read authority, approval administration, secret binding and
signing/case/provider consumer cutovers, portable tenant/data-plane provenance,
configurable legal/support authority,
central conflict registry and live remote white-label proof.

Strategic role overlay (DECIDED/TARGET, 2026-09-01): the current root data
plane and ENVAL-branded portal are the technical reference/default tenant
journey. They do not prove an ENVAL Software operator, REV, trader, verifier,
controller or end-customer contract-party role, and they do not select a first
commercial tenant. Existing local proof remains unchanged.

## Current Workforce Authorization Foundation

Status: CURRENT PROVEN — LOCAL ONLY through commit `be2e247`, including the
approved local first-admin activation and later compliance capability tail.
This is not remote or production workforce activation.

The tenant data plane has one central database-authoritative workforce policy
foundation with the original closed nine-capability catalogue plus the two
closed compliance capabilities, for eleven total, and the seniority order
`member < reviewer < admin`. Workforce, policy and assignment governance are
admin-only. Organization policy is immutable and versioned; it may configure
bounded process rules but cannot bypass capability, active-membership,
seniority, scope, environment, Auth or other software/security floors.

The default ENVAL policy requires distinct maker/checker actors. A separately
proven one-person-compatible policy may disable that organization rule while
all hard floors remain enforced. No general Wet/NEa seniority or two-eyes rule
has been proven for these actions: maker/checker separation here is an ENVAL
security/process default, not attributed regulatory law.

Exactly one explicitly approved, verified local Auth principal is active as
the first local admin. Bootstrap replay is idempotent, genesis is closed and a
second or different principal cannot use genesis. Customer access, case
participation, representation authority and signing/legal authority remain
separate from workforce membership.

Still TARGET/DEFERRED: workforce and policy management UI, more workforce
population, recovery ceremony, production activation and remote proof.

## Current Tenant Operator Entry

Status: UI-01B CURRENT PROVEN — LOCAL ONLY. This is the bounded secure operator
entry, not a complete operator console, remote deployment or production proof.

The canonical local `/beheer` route resolves a separate server-bound
`tenant_operator` context. Unauthenticated access enters the operator login
flow with a safe return route; an authenticated principal without an active
workforce identity receives the normal `Geen toegang` state; authorized active
workforce is admitted. `api-app-operator-context` derives tenant and effective
capabilities from trusted server context by reusing
`app_compliance_worklist_source_events_read_v1` and
`app_evidence_review_worklist_source_read_v4`.
`app_workforce_authorize_v1` remains private, and no browser field or JWT role
selects tenant/workforce authority.

The current operator header order is exactly `Overzicht`, `Dossiers`, and
`Uitloggen`. The action reuses the shared Auth logout contract and completes
exact `/inloggen` replace-navigation only after confirmed local session
removal.
`/beheer` is a dedicated operational overview. It limits each section to three
items, uses only server-proven `TO_REVIEW`, `WAITING_CUSTOMER` and
`REVIEW_COMPLETE` projections, and shows no totals. Each bounded overview group
links to its section in `/beheer/dossiers`. That canonical complete authorized
current-tenant list partitions each dossier once into interne beoordeling,
wachten op klant, afgerond or overige actieve dossiers, preserves server order
and reuses the existing safe detail route. The shared responsive navigation
marks the canonical overview or dossier destination active, including dossier
detail and `/intern/dossiers` compatibility routes; `/intern/compliance` maps
to active `Overzicht`.
`WAITING_CUSTOMER` is emitted only after an exact finalized review round covers
all current manifest subjects and a current published, unanswered correction
handoff proves the outgoing customer request. Finalized subject decisions take
presentation precedence over the source truth class so review status, decision
and dossier phase do not conflict visibly.
`/intern/compliance` and `/intern/dossiers` remain temporary compatibility paths
using the same authority. The shared operator shell renders `Powered by ENVAL`
once, and ordinary workforce gains no implicit
`platform_support.request`.

Focused operator-context Q01-Q14, overview Q01-Q10, evidence worklist Q01-Q19,
route/Auth, compliance/evidence and presentation proofs, served allow/deny
evidence, app typecheck/build, guarded Firefox evidence at desktop `1440x900`
and narrow mobile `375x812`, and a fresh independent reviewer PASS are green.
`Klanten`,
`Organisatie`, workforce management UI, ENVAL Control Console, Verifier
Console, tenant #2, dynamic tenant switching and `/intern/*` cleanup remain
TARGET/unimplemented.

## Current Delivery-Year Compliance Foundation

Status: CURRENT PROVEN — LOCAL ONLY through REG03I at commit `be2e247`.
This is a bounded internal compliance runtime for delivery year 2026, not a
remote deployment, external verifier workflow or production-compliance claim.

```text
accepted externally evidenced fact
→ authenticated server-authoritative capture
→ immutable tenant-local source-event ledger
→ deterministic REG02 state reconstruction
→ REG03B derived action plan (14-day INTERNAL_DEFAULT)
→ REG03D derived worklist projection
→ authenticated read-only api-app-compliance-worklist response
```

Runtime and data boundaries:

- `delivery_year_compliance.ts` keeps delivery year `Y` separate from its
  `Y+1` cutoff, statement-possession, year-end, statement-submission and
  verifier REV-registration events. A verifier statement and findings report
  are mutually distinct outcomes, and replay fails closed on malformed,
  conflicting or unauthorized transitions.
- `delivery_year_compliance_calendar_registry.ts` supports only delivery year
  2026. Future calendars are not generated or inferred.
- `app_delivery_year_compliance_source_events` is the immutable persisted
  source-truth/provenance ledger, scoped by tenant data plane and delivery year.
  Its five event kinds are inbooking completion, statement possession,
  findings-report receipt, statement submission and verifier REV-result
  registration. No derived compliance state, action plan or worklist is
  persisted.
- Absence of a source event means `NO_ACCEPTED_SOURCE_FACT_RECORDED` in ENVAL;
  it does not assert that the external event did not happen.
- REG03B's 14-calendar-day lead time is an ENVAL `INTERNAL_DEFAULT`, not a
  regulatory deadline. REG03D separates active attention from the year-end
  informational milestone and has no assignment, completion, dismissal,
  snooze or acknowledgement state.
- `compliance.delivery_year.view` and
  `compliance.delivery_year.record` are separate `TENANT_WIDE` capabilities.
  Their default minimum seniority is reviewer, admin inherits, and member is
  denied by default; bounded organization policy may lower seniority only to
  the non-bypassable member floor where permitted.
- Regulated actor, internal recorder and workforce authorization remain
  separate. Recording evidence of verifier REV registration does not make the
  recorder the verifier, NEa or representation authority.
- `api-app-compliance-worklist` is GET-only and requires trusted tenant
  resolution, verified Auth, active workforce, the view capability and exact
  current-tenant scope. The server owns `asOf`; the read performs zero writes.
  The approved local first admin is authorized for this view.

Implementation/proof anchors are `platform/runtime/compliance/`,
`supabase/functions/api-app-compliance-source-event/`,
`supabase/functions/api-app-compliance-worklist/`, migrations
`20260817120000` through `20260817210000`, and their focused REG02/REG03
proofs.

Still TARGET/PARKED: delivery years after 2026, future calendar generation,
source-event correction/revocation, findings remediation/closure, persisted
tasks or acknowledgement state, scheduler/cron, mail/notification delivery,
customer-facing compliance UX, remote cutover/deploy and production proof.

## Current Tenant Migration Chain

Status: CURRENT PROVEN — LOCAL ONLY through commit `be2e247`.

The executable `TENANT_ENVAL` chain is:

```text
20260816150000_app_current_baseline.sql
→ 20260816160000_app_workforce_policy_foundation.sql
→ 20260817120000_app_compliance_workforce_view.sql
→ 20260817160000_app_compliance_source_event_ledger.sql
→ 20260817190000_app_compliance_source_event_capture.sql
→ 20260817210000_app_compliance_worklist_read.sql
→ future forward-only tenant migrations
```

`supabase/migration-archive/` preserves pre-baseline source provenance and is
not an executable migration root. A clean local rebuild from the baseline and
all five forward migrations, current app-schema parity, RLS/privilege parity
and behavioral parity are proven. MIG02B's earlier two-version local-ledger
reconciliation remains historical proof for that boundary; the four committed
REG03 migrations are now part of the guarded forward chain. No migration in
this chain is remote/production evidence.

Remote schema, baseline-material parity and migration-ledger state remain
UNKNOWN/PARKED. Before any remote registration or apply, a separately approved
read-only cutover audit must compare all three; no remote action follows from
the local proof.

## Target Direction

The rebuild should support one generic managed-SaaS/white-label software core
for separately resolved inboekdienstverlener tenants. The current
ENVAL-branded experience remains the reference/default tenant journey. The
frontend should separate public commercial pages and product flows into clear
modules whose legal identity, brand, fee and contract/signing bundle resolve
from tenant-bound approved configuration:

- ENVAL info
- Price / fee
- Eligibility
- Signup
- Document upload
- ERE info
- Contact
- Privacy
- Terms
- NL/EN support

Backend integration should happen through explicit API contracts rather than copied assumptions from legacy browser scripts.

Tenant resolution, tenant legal/operator identity, presentation brand, support
provider and customer context remain separate. Missing or ambiguous authority
fails closed. A complete multi-tenant rewrite, billing/control-plane product,
tenant #2 and production tenant isolation remain TARGET and require the Phase
2 gap audit plus separately approved evidence-driven batches.

## Current Auth Flow

Status: CURRENT / LOCAL PROOF for lean frontend Auth/session flow, backend bootstrap, customer-safe dashboard read endpoint, and real customer-safe dashboard frontend projection.

Current customer sequence:

```text
/inloggen
→ Supabase Auth signup/sign-in
→ verified Auth session
→ api-app-auth-bootstrap
→ app_customer_identity binding/resolution
→ accessible dossier summary
→ protected /dashboard route
→ api-app-dashboard-get
→ real customer-safe dashboard projection
```

`/account` is retained only as a compatibility replace-redirect to exactly
`/inloggen`; it forwards no query or fragment input.

Rules:

- One customer may have multiple dossiers.
- Dossiers may have different account types: particulier, zakelijk, or VVE.
- Auth logic is not split per account type.
- Legacy dossier sessions are not used for app customer auth.
- Auth module and Supabase browser client are route-lazy.
- Public routes do not initialize Supabase Auth.
- `api-app-dashboard-get` is CURRENT / LOCAL PROOF and reads through the authenticated Edge boundary.
- `/dashboard` uses the real customer-safe projection for factual app-backed fields.
- Dashboard dossier selection supports multiple dossiers.
- Dashboard cache is in-memory and scoped by Auth user, customer, and dossier.
- The browser does not directly read app tables.
- The app does not call legacy dossier sessions or legacy dashboard/read endpoints.
- The dashboard uses no polling or realtime subscription.
- Unsupported future domains remain unavailable/open instead of fabricated.

## Current Document Lifecycle Path

Status: CURRENT / LOCAL PROOF for backend upload/download/withdrawal endpoints,
the authenticated reusable dashboard document card and the CUSTOMER04C shared
signup/customer-correction workflow at commit `d613592`. The recorded final
pre-commit Integration gate for CUSTOMER04C was `127/127 PASS`.

```text
authenticated customer
→ reusable DocumentUploadCard
→ api-app-document-upload-url
→ private signed Storage upload
→ api-app-document-upload-confirm
→ immutable current document version
→ targeted dashboard refresh
```

```text
filename action
→ api-app-document-download-url
→ short-lived signed download URL
```

```text
pre-lock withdrawal
→ api-app-document-withdraw-current
→ atomic RPC
→ audit-preserved missing slot
→ targeted dashboard refresh
```

Signup and correction now enter one external customer document workflow:

```text
signup lifecycle input ─┐
                       ├→ CustomerDocumentWorkflowController
correction input ──────┘  → DocumentEvidenceWorkflow
                           → DocumentEvidenceUploadCard
                           → DocumentFactMatrix
                           → CustomerDocumentFactInteraction
                           → shared customer fact-resolution policy
```

Rules:

- One shared transport applies to particulier, zakelijk, and VVE.
- Account type determines which document slots exist, not how files are transported.
- MID evidence and installation/acquisition invoice slots use the same reusable card and PDF-only transport.
- The browser does not directly read app tables.
- The browser does not choose storage bucket/path/file/version internals.
- Current document withdrawal does not hard-delete storage or immutable evidence.
- The client does not poll, reload the page, or automatically retry blindly.
- No account-type-specific upload transport exists.
- Signup and correction may supply lifecycle-specific documents, readiness,
  locked/read-only facts and actions, but neither builds row interaction state
  independently.
- `app/src/features/signup/documentFactRegistry.ts` remains the one canonical
  fact registry consumed by the shared controller; its historical path name
  does not make it signup-only authority.
- The same `DocumentEvidenceUploadCard`, `DocumentFactMatrix` and
  `CustomerDocumentFactInteraction` render both lifecycles. Correction locking
  is row state, not separate markup or policy.
- Signup charger deletion is an extra charger-item lifecycle action outside the
  PDF upload component and is disabled while only one charger exists.
- Parser observations remain `OBSERVED_DERIVED`; source projection and customer
  confirmation cannot create ENVAL/workforce acceptance.
- The shared customer fact-resolution policy is
  `platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts`.

## Current Signed Intake And Promotion Path

Status: CURRENT PROVEN — LOCAL ONLY through 09C1C-R6 for signed intake, server-owned atomic/idempotent promotion into `app_cases`, Auth/account handoff, and the case-owned customer-safe dashboard foundation. Remote migration/deployment and production acceptance remain unproven. See `docs/app/contracts/intake-verification-promotion.md`.

```text
public form and local parser
→ collecting pre-auth intake
→ private quarantine upload
→ typed-name + OTP email-control challenge
→ atomic signing finalization and locked receipt
→ server-only atomic promotion
→ `app_cases`-owned durable case and initial internal-review state
→ Auth/account handoff and case-owned dashboard when applicable
```

Current bounded customer-correction path (`CURRENT PROVEN — LOCAL`):

```text
internal review
→ action_needed
→ correction-scoped replacement target and private upload
→ immutable candidate/parser observation
→ shared customer document workflow
→ customer resolution and signed finalize
→ immutable successor correction round
```

Rules:

- `typed_name_otp_v1` finalization is the one signed submission and proves bounded email control; a second email-verification promotion link is `SUPERSEDED`.
- Promotion is server-only, atomic and idempotent; the receipt, safe reference, OTP and consumed management capability cannot authorize it.
- Pre-auth quarantine upload must use a separate private capability lane, not authenticated `api-app-document-*`.
- Parser/precheck may warn or prefill but may not approve evidence.
- `app_cases` is the current promotion owner; promotion does not create a parallel `app_customer_dossiers` core.
- Internal review and external inboekverificatie are separate concepts and statuses.
- A successful promoted dashboard must not show a generic `Dossier indienen` button.
- No replacement candidate, parser observation or unsigned customer resolution
  promotes itself to current evidence or canonical accepted truth.
- Customer confirmation is not a `HUMAN_ACCEPTED` decision. Required downstream
  or third-party verification cannot be bypassed by single- or multi-source
  evidence strength.
- Customer correction rounds are immutable/versioned; replacement, withdrawal,
  submission, signing and finalization preserve prior review/handoff truth.

Still `TARGET — NOT CURRENT`: full customer-lifecycle qualification across
party types, repeated correction loops, multi-location/multi-charger and
resume/signing/audit combinations; a ground-truthed parser qualification
corpus; third-party verification/check execution; kWh, renewable-generation
and feed-in accounting; verifier/audit dossier generation and periodic audit
snapshots. Exact target cases are maintained in `04_TODO.md`.

## Backend Data Expectations

The backend must support audit-worthy commercial service operations:

- customer records
- signups
- eligibility answers
- uploaded documents
- consent records
- status transitions
- audit events
- exports
- retention and privacy controls
- evidence versioning where relevant
- language and copy-version awareness for legal/product text where relevant

No Supabase implementation changes are part of this architecture update.

## UI And CSS Architecture

The new UI is a professional redesign. Legacy root HTML/CSS is reference material, not the visual source of truth.

The frontend should use shared CSS layers:

- design tokens
- base elements
- layout primitives
- components
- utilities

Components should reuse shared classes and patterns. Page-specific CSS is allowed only when a module has a justified layout or interaction need.
