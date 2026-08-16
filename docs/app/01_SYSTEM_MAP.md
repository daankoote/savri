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

Status: CURRENT PROVEN LOCAL through commit `8b47126`. This is local
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
→ authoritative tenant gate for the inventoried CURRENT api-app surface
→ server-owned presentation source composition
→ safe PublicPresentationBrandV1 projection
→ api-app-presentation-bootstrap
→ PresentationBrandProvider
→ AppHeader / DashboardSidebar / NotFoundPage
```

The trusted-ingress boundary does not treat raw browser input, `Host` or
`X-Forwarded-Host` as production tenant authority. Browser payload, query,
storage and runtime values cannot select a tenant, source mode, locator,
project, credential or arbitrary brand. Production proxy/ingress topology and
domain-ownership verification remain UNKNOWN. Current tenant routing and the
tenant Supabase client target are unchanged; `DYNAMIC_DATA_PLANE_SWITCHING=NO`.

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
| trusted ingress and authoritative gate | `trusted_ingress.ts`, `app_tenant_resolution_shadow.ts`, shared app foundation/workforce gate | `trusted-ingress-boundary.proof.ts`, `app-tenant-resolution-shadow.proof.ts`, `api-app-ops-location-callers.proof.ts` |
| presentation contract and sources | `platform/runtime/presentation/`, versioned control-plane presentation migration | `presentation-brand-config.proof.ts`, `presentation-brand-sources.proof.ts` |
| safe browser bootstrap and React consumption | `app_presentation_bootstrap.ts`, `api-app-presentation-bootstrap/`, `app/src/shared/presentation/` | `PresentationBrandRuntime.proof.tsx`, `PresentationBrandProvider.proof.tsx` |

Still TARGET/DEFERRED: a real tenant #2, real customer white-label onboarding,
live control-plane bootstrap/deployment, production custom domains and trusted
proxy topology, dynamic data-plane switching, tenant/fleet provisioning,
customer-cloud or self-host installation automation, brand/domain/admin UI,
uploaded logos or arbitrary themes, configurable legal/support authority,
central conflict registry and live remote white-label proof.

## Target Direction

The rebuild should support ENVAL as a customer-facing commercial ERE inboekservice. The frontend should separate public commercial pages and product flows into clear modules:

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

## Current Auth Flow

Status: CURRENT / LOCAL PROOF for lean frontend Auth/session flow, backend bootstrap, customer-safe dashboard read endpoint, and real customer-safe dashboard frontend projection.

Current customer sequence:

```text
/account
→ Supabase Auth signup/sign-in
→ verified Auth session
→ api-app-auth-bootstrap
→ app_customer_identity binding/resolution
→ accessible dossier summary
→ protected /dashboard route
→ api-app-dashboard-get
→ real customer-safe dashboard projection
```

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

Status: CURRENT / LOCAL PROOF for backend upload/download/withdrawal endpoints and the authenticated reusable dashboard document card.

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

Rules:

- One shared transport applies to particulier, zakelijk, and VVE.
- Account type determines which document slots exist, not how files are transported.
- MID evidence and installation/acquisition invoice slots use the same reusable card and PDF-only transport.
- The browser does not directly read app tables.
- The browser does not choose storage bucket/path/file/version internals.
- Current document withdrawal does not hard-delete storage or immutable evidence.
- The client does not poll, reload the page, or automatically retry blindly.
- No account-type-specific upload transport exists.

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

Later internal-review/correction path (TARGET / not implemented):

```text
internal review
→ action_needed
→ targeted editable section
→ Correcties indienen
→ immutable correction revision
```

Rules:

- `typed_name_otp_v1` finalization is the one signed submission and proves bounded email control; a second email-verification promotion link is `SUPERSEDED`.
- Promotion is server-only, atomic and idempotent; the receipt, safe reference, OTP and consumed management capability cannot authorize it.
- Pre-auth quarantine upload must use a separate private capability lane, not authenticated `api-app-document-*`.
- Parser/precheck may warn or prefill but may not approve evidence.
- `app_cases` is the current promotion owner; promotion does not create a parallel `app_customer_dossiers` core.
- Internal review and external inboekverificatie are separate concepts and statuses.
- A successful promoted dashboard must not show a generic `Dossier indienen` button.

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
