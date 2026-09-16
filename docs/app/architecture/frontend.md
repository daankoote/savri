# Frontend Vite Architecture

## Location

The new frontend app lives in `/app`.

It is a local Vite app and is not connected to Netlify production yet.

The standard dev server is:

```text
http://localhost:5175/
```

The `dev` script must bind to port `5175`. Ports `5173` and `5174` are reserved for other local projects.

## Initial Structure

- `src/pages/`: route-level pages
- `src/features/`: product modules
- `src/shared/api/`: API client and contracts
- `src/shared/components/`: reusable UI components
- `src/shared/config/`: runtime configuration
- `src/shared/utils/`: shared utility code
- `src/styles/`: app-level styles

## CSS Architecture

The new UI is a professional redesign. Do not copy the old static website as the final visual system.

Style files are layered in this order:

1. `tokens.css`
2. `base.css`
3. `layout.css`
4. `components.css`
5. `utilities.css`

Rules:

- Tokens define colors, type, spacing, radii, shadows, and focus rings.
- Base styles set element defaults.
- Layout styles define reusable page and grid primitives.
- Components define reusable visual patterns.
- Utilities are small, generic helpers.
- Avoid page-specific CSS unless justified.
- Inline CSS and page-local style objects are forbidden, including for trivial
  dynamic values. Represent dynamic presentation through controlled classes,
  modifiers, attributes, and design tokens.
- Components should reuse shared classes and established patterns.

## Design System v1

Current v1 foundation:

- CSS entrypoint: `src/styles/global.css`
- Tokens: `src/styles/tokens.css`
- Base defaults: `src/styles/base.css`
- Layout primitives: `src/styles/layout.css`
- Shared components: `src/styles/components.css`
- Small helpers: `src/styles/utilities.css`

Component approach:

- Route pages should compose shared components from `src/shared/components/`.
- Shared components should use shared classes and tokens before adding new CSS.
- Avoid one-off page CSS. Add reusable layout/component primitives when a pattern is likely to repeat.
- The standard local dev URL remains `http://localhost:5175/`.

## TARGET Surface And White-Label Boundary

The shared frontend core must support four distinct surfaces without cloned
applications:

- ENVAL Control Console for authorized platform personnel;
- Tenant Operator Console for one tenant's capability-authorized workforce;
- Tenant Customer Portal for particulier, onderneming, VvE and authorized
  representatives; and
- future restricted Verifier Workspace, not authorized for implementation now.

Routes, shells and navigation must not mix these audiences or infer authority
from a friendly role label.

The approved TARGET host and route model is:

| host/route | surface |
|---|---|
| `enval.nl` | ENVAL commercial/public B2B SaaS site |
| `<tenant>.enval.nl/aanmelden` | Tenant Public Intake |
| `<tenant>.enval.nl/dashboard` | Tenant Customer Portal |
| `<tenant>.enval.nl/beheer` | Tenant Operator Console |
| `control.enval.nl` | ENVAL Control Console |
| `verificatie.enval.nl` | central Verifier Audit Console |

`<tenant>.enval.nl/<tenant>dashboard` and `intern-dashboard` are not canonical
routes. A verifier-specific hostname is never an authorization boundary. The
central verifier console derives access server-side from Auth principal,
verifier-organization membership, verification engagement, tenant/year/case/
sample scope, and capabilities. Verifier UI is not authorized now.

White-label variation uses shared components, layouts and tokens with controlled
tenant display name, logo reference, approved token/accent, customer-support
identity/contact and approved e-mail display identity. Arbitrary tenant CSS,
JavaScript, HTML and per-tenant code forks are prohibited. The future default is
an ENVAL-owned tenant subdomain such as `<tenant>.enval.nl`; custom domains and
theme administration are not MVP work.

One Auth foundation is shared. Authentication reuse never merges the distinct
server-derived actor contexts for tenant customer, tenant workforce, ENVAL
platform actor, and verifier actor. UI visibility is not authorization.

## HARD UI Implementation Boundary

KISS is the default. Customer UI is task/status-first, Tenant Operator UI is
action/decision-first, and ENVAL Control is metadata/platform-health-first.
Expose only what the actor needs for the current task.

Do not invent headings, paragraphs, marketing/explanatory copy, helper text,
tooltips, microcopy, compliance/legal claims, or additional status labels.
Use, in order: approved Daan copy, CURRENT canonical copy, then only minimum
functional/access/error wording. Report any required new functional wording.

The mandatory reuse order and exact frontend pre-flight/evidence markers in
repository `AGENTS.md` apply to every frontend batch. Reuse as-is, extend through
props/configuration, compose, add a shared modifier/token, and create a new
primitive only for a genuinely new responsibility. Inline CSS, near-duplicate
components/CSS, arbitrary tenant presentation code, and page-local primitive
reinvention are hard failures.

## TARGET Information Architecture

Tenant Customer Portal MVP navigation is exactly:

- `Overzicht`
- `Dossiers`
- `Documenten`
- `Berichten`
- `Account`

Open actions/tasks appear prominently in `Overzicht`; MVP has no separate main
`Taken` item. `Berichten` is tenant customer-to-workforce communication, never
ENVAL platform support.

Tenant Operator Console MVP navigation is exactly:

- `Overzicht`
- `Dossiers`
- `Klanten`
- `Organisatie`

UI-01B proves only the current local operator route-link subset: `Overzicht`
and `Dossiers`; the shared header then adds the `Uitloggen` Auth action.
`Klanten` and `Organisatie` remain TARGET/unimplemented, as do the ENVAL
Control Console and Verifier Console.

`Overzicht` is action-first and groups `Te beoordelen`, `Wacht op klant`,
`Geblokkeerd`, `Klaar voor volgende stap`, and `Afgerond`. `Rapportage` is later
unless a concrete requirement moves it into MVP. Candidate dossier detail is
limited to `Samenvatting`, `Gegevens`, `Documenten`, `kWh`, `Controle`, `Vragen`,
and `Historie`. `Gegevens` composes party, representation, EAN/connection,
location, assets/charge points, and MID/meter information. Do not invent more
tabs.

The ENVAL Control IA is tenant/configuration/platform-health/support/audit
metadata-first. It is never a universal tenant-data console.

The CURRENT local operator shell renders one reusable exact attribution:
`Powered by ENVAL`. Other relevant dashboard shells may adopt the same shared
attribution later. It is platform attribution only and must not imply legal,
operator, controller, contracting-party, or verifier responsibility.

Authenticated surface identity is a presentation concern, not authorization.
The customer sidebar and admitted tenant-workforce header derive their
organization name and mark only from the server-resolved presentation provider,
then add the fixed context label `Klantportaal` or `Dossierbeheer`. They do not
render the public tagline. The operator label is composed only inside the
existing server-authorized route guard. The current operator context exposes no
authoritative ENVAL-platform-actor distinction; `ENVAL · Beheerconsole` remains
TARGET until such authority exists and must not be inferred from route, role,
e-mail address or brand text.

## Routes And Pages

The `/app` frontend uses lightweight client-side routing for now.

Current routes:

- `/`
- `/aanmelden`
- `/account`
- `/inloggen`
- `/account/wachtwoord-vergeten`
- `/account/nieuw-wachtwoord`
- `/account/verificatiemail-opnieuw`
- `/upload`
- `/ere`
- `/contact`
- `/privacy`
- `/voorwaarden`
- `/dashboard`
- `/dashboard/aanvragen`
- `/dashboard/aanvragen/:caseReference`
- `/beheer`
- `/beheer/dossiers`
- `/beheer/dossiers/:caseRef`
- `/intern/compliance`
- `/intern/dossiers`
- `/intern/dossiers/:caseRef`

Rules:

- Use the internal route map and History API for now.
- `/beheer` is the CURRENT PROVEN LOCAL canonical Tenant Operator entry and
  `/beheer/dossiers` uses the existing evidence-review worklist/detail flow.
  The overview shows bounded server-status previews for interne beoordeling,
  wachten op klant and recent afgeronde dossiers. The complete list partitions
  the same server projection once into those groups plus overige actieve
  dossiers; overview group links target the corresponding list section.
- The shared operator header renders `Overzicht`, `Dossiers`, then `Uitloggen`.
  It marks `Overzicht` or `Dossiers` active on canonical pages, keeps `Dossiers`
  active on canonical and compatibility detail/list routes, maps
  `/intern/compliance` to active `Overzicht`, and remains usable without
  horizontal overflow at narrow widths. `Uitloggen` uses the existing Auth
  session contract, prevents repeat activation while running and
  replace-navigates to `/inloggen` only after confirmed local session removal.
- `/intern/compliance` and `/intern/dossiers` are CURRENT temporary
  compatibility paths using the same server-authorized operator surface and
  authority. Their later redirect/removal cleanup is separately bounded.
- `/inloggen` and the three recovery/resend routes use the shared
  server-resolved presentation organization and mark with the fixed context
  label `Inloggen`, without the public presentation tagline or public,
  customer-portal or operator navigation. `/account` replace-redirects to
  exactly `/inloggen` and discards query and fragment input. `/inloggen`
  changes only to the operator Auth audience for a validated internal operator
  return route; protected navigation remains unavailable until server-derived
  authority admits the corresponding surface.
- The operator route guard sends unauthenticated access through the operator
  login flow, denies authenticated non-workforce with the normal `Geen toegang`
  state, and admits only a server-derived active workforce context. Tenant and
  effective capabilities are not selected by the browser.
- Do not add React Router unless route complexity later justifies it.
- Home stays the commercial landing page.
- `Aanmerking` is currently a home section at `/#aanmerking`, not a separate page.
- Pricing/fee content stays on the homepage for now, not in a separate route.
- Placeholder pages are intentionally short: one clear title, one short paragraph, and one action or note.
- Placeholder/public information pages remain presentation-only unless a
  separately approved backend contract applies; signup, Auth and dashboard use
  their current proven app endpoints.
- Do not change Netlify redirects or production root behavior for these app routes yet.
- Section targets must account for the sticky header with CSS scroll offsets.
- Signup/intake architecture lives in `docs/app/architecture/signup-intake.md`.
- `/aanmelden` is the current account-first authenticated document-first signup
  journey. It uses the intake/capability boundary, quarantine upload/confirmation,
  customer fact confirmation, signing and signed-intake promotion authorities.
- Successful authenticated promotion may hand off to `/dashboard`; account,
  customer, party, representation and case authority remain separate.
- SL01-C server-resolved presentation, explicit acceptance and receipt-bound OTP
  are an active PARTIAL candidate pending browser/UI acceptance. Its temporary
  finalize guard remains until SL01-D provenance cutover.
- `/dashboard` is a protected compatibility entry that replace-redirects to
  `/dashboard/aanvragen`.
- `/dashboard/aanvragen` is the R7-authorized application list and
  `/dashboard/aanvragen/:caseReference` is the stable detail route using the
  existing factual dashboard projection.
- Dashboard is person-first: one customer can have multiple assets such as private home, business, VVE, or second home.
- Dashboard currently has a frontend Auth/session guard, locally proven backend read endpoint, and real frontend read projection.
- Dashboard selection is route-owned; there is no dossier dropdown.
- The application-index cache is scoped by Auth user. Detail cache is scoped by
  Auth user and dossier; stale list/detail responses cannot repopulate a newer
  request or appear during actor/case switching.
- Shared pending dashboard requests are deduplicated.
- The first dashboard request is not aborted by React effect cleanup.
- Dashboard has loading, empty, error, and retry states.
- Dashboard now uses a left-sidebar customer portal layout.
- One shared dashboard renderer is used across particulier, zakelijk, and VVE.
- Business and VVE detail expansion remains deferred, but account-type-specific auth/dashboard clients are not created.
- Current dashboard composition reuses `DashboardPageShell`,
  `DashboardSidebar` and `ActivePrivateDashboard`; `CustomerApplicationList`
  owns only the small list surface and `dashboardRoutes` owns only strict route
  parsing/building.
- Older asset-overview dashboard components and mock-data files were removed during cleanup because they were not used by `/dashboard`.
- The active private dashboard uses full-width charger rows/tabs that are collapsed by default.
- Charger rows can be expanded/collapsed, with only one charger open at a time.
- The expanded charger area uses an inner accordion that is also collapsed by default and can be toggled closed.
- Inner sections are: Laadpaal, Locatie, Toestemmingen, kWh, Rapportages, and Aanpassingen.
- The generic Documenten section is removed: charger evidence lives under Laadpaal, and address evidence lives under Locatie.
- Top charger rows use text status pills; inner section headers and cards use small status dots for calmer scanning.
- The current reference sidebar label remains `Contact ENVAL` as implemented,
  but it is mock-only and not the generic target. The white-label target resolves
  the tenant customer-support identity/contact and creates no ENVAL platform
  ticket authority.
- History is its own mock menu tab.
- Verhuizing and Zakelijk rijden live under the Aanpassingen section, not in the sidebar.
- Laadpaal and Locatie sections use read-only table-style summaries after submit.
- Evidence documents are shown in the section they belong to: Installatie factuur and MID bewijs under Laadpaal, Adres bevestiging under Locatie, and legal documents under Toestemmingen.
- The kWh section is split into Handmatig and Automatisch groups.
- kWh, consent, and backend-koppeling controls are mock/read-only placeholders.
- Dashboard document cards are real and actionable for the current MID and installation/acquisition invoice PDF slots.
- Backend koppeling is mock-only; exact provider connection flow still needs research.
- Unsupported future domains such as kWh, results, fees, payouts, support, requests, reports, and exports remain unavailable/open rather than fabricated.
- Public navigation uses `Inloggen` as portal entry; protected portal navigation includes `Naar website`.
- Shared global button interactions provide pointer cursor, disabled cursor, and restrained pressed-state feedback.
- Shared document upload transport, download client, withdrawal client, slot presentation mapping, and `DocumentUploadCard` live under `app/src/features/documents/`.
- MID evidence and installation/acquisition invoice evidence reuse the same document card and transport.
- Dashboard no longer has inline document-card upload markup.
- Selecting a valid PDF starts upload automatically and refreshes only the selected dashboard dossier after confirm.
- Current document filename actions request fresh short-lived download URLs.
- Withdrawal uses the backend withdrawal endpoint and waits for refreshed backend state before clearing the customer UI.
- Document aggregate status uses the same presentation source as the individual cards.
- Do not create separate upload implementations for signup, dashboard, account type, or document type.
- Public signup upload wiring remains open and must not call authenticated upload endpoints without a reviewed journey decision.

## Auth And Session Rule

Status: CURRENT / LOCAL PROOF for lean frontend implementation.

The backend Auth bootstrap and the customer-facing frontend Auth/session layer are CURRENT / LOCAL PROOF.

Current frontend flow:

- shared Supabase browser client
- Auth state/session provider with session initialization and Auth state subscription
- `/inloggen` canonical account creation and sign-in surface
- `/account` compatibility replace-redirect to exactly `/inloggen`
- `/account/wachtwoord-vergeten` neutral password-recovery request
- `/account/nieuw-wachtwoord` recovery-event/session-gated password update
- `/account/verificatiemail-opnieuw` neutral signup-verification resend
- bootstrap API client for `api-app-auth-bootstrap`
- logout
- session restore
- safe Auth error mapping
- dashboard route guard
- route-level lazy loading for Supabase Auth runtime on account, recovery and
  protected portal routes
- fixed canonical-origin Auth callbacks, recovery callback URL cleanup and one
  shared recovery/resend event/redirect helper
- `PASSWORD_RECOVERY` priority before ordinary session bootstrap; public request
  routes and recovery sessions do not call portal bootstrap
- local recovery-session termination and fresh login after password update

Still OPEN:

- unsupported future dashboard domains
- document upload controls
- dashboard write actions
- production Auth configuration and production browser proof
- Mailpit/SMTP delivery and interactive browser acceptance for password
  recovery, invalid/expired/used links, resend and fresh login

Rules:

- Do not create separate Auth implementations for particulier, zakelijk, and VVE.
- Auth state is account/customer-level; dossier account types come from backend dossier summaries.
- Do not use legacy dossier sessions for the `/app` dashboard.
- Public pages must not eagerly initialize Supabase Auth or require live Auth state.
- Do not use polling or custom token refresh loops.
- Do not manually persist access or refresh tokens.
- Do not claim unsupported dashboard domains are real until backed by implemented app sources.

## API And CRM Integration Readiness

Status: TARGET design constraint; no public API, connector, webhook engine, or
external contract is implemented or authorized here.

Interactive business/data flow follows:

```text
UI
-> typed frontend/application client
-> server-side application/service capability
-> domain/core
-> persistence/provider adapters
```

Future tenant integration follows:

```text
tenant CRM/API client
-> versioned tenant integration adapter/API
-> the same server-side application/service capabilities
-> the same domain/core
```

React components do not own business decisions, consume database rows as their
domain contract, write business truth directly to the database, or know
Storage/database/provider internals. Use explicit DTOs/read models and mutation
commands. Add application services and ports/adapters only when a current
responsibility needs them; API readiness is not permission for API-first
overengineering.

Do not choose REST versus GraphQL, freeze an external contract, or add `/v1`
endpoints now. Future public DTOs remain separate from database rows, internal
events, component state, and raw audit records.

Future external integrations are tenant-bound, authenticated, capability-
scoped, least-privilege, versioned, rate-limited, auditable, revocable, and
idempotent for retryable mutations, with explicit integration identity. They
receive no service-role credential, database access, RLS bypass, cross-plane
credential, or other-tenant identifiers/data. The server resolves tenant
authority before business execution.

Future significant lifecycle changes may feed a controlled outbox/webhook
adapter. Exact event names and delivery contracts remain undecided; tenant
data-plane business/audit truth is authoritative and delivery is derived.
Integration credentials/settings belong only to authorized tenant admins under
Tenant Operator `Organisatie`. ENVAL Control may expose safe configuration,
health, last-success, and error metadata, not ordinary tenant payloads.

## Homepage Copy Rule

- The homepage is a customer-facing commercial landing page.
- Do not make it feel like an internal roadmap or module dashboard.
- Less text is better.
- Every visible text line must justify its existence.
- Use short headings and one-sentence descriptions.
- Copy should reduce questions, not create new ones.
- No generic SaaS filler.
- No internal roadmap/dev copy in customer-facing UI.
- The hero must be minimal: one offer, one commercial point, clear actions.
- The hero must be calm and controlled, not oversized or loud.
- Hero typography must remain restrained; avoid shouting-scale headlines.
- Avoid giant hero heights, oversized headlines, and decorative panels that slow reading.
- Detailed caveats belong in terms, privacy, ERE info, FAQ, or flow-specific screens.
- Legal caveats belong in FAQ, terms, or flow screens, not the hero.
- Avoid internal terms such as Vite, Netlify, backend, port, roadmap, modules, or audit architecture in customer-facing sections.

## Calculator Rule

- The homepage calculator is local-only until a backend/API contract exists.
- Do not store calculator input.
- The calculator has two modes: yearly kilometers and yearly kWh.
- The current reference calculator visibly contains kilometers, kWh per 100 km,
  yearly kWh, value per kWh and a historical 10% ENVAL-fee assumption. That is
  implemented legacy/reference presentation, not SaaS pricing or a generic
  tenant fee; UX01 must classify its disposition before redesign.
- Calculator copy must show indication/no-guarantee language.
- Calculator assumptions must be documented before it becomes production copy.

## Current Process Model

The homepage currently models five customer-facing steps:

1. Check
2. Meld aan
3. Upload info
4. Einde jaar kWh opgeven
5. Uitbetaling + jaaroverzicht

The year overview is customer-facing output and later supports the audit-worthy dossier model.

## First Modules

- Dossier
- Invoice analysis
- Eligibility
- Articles
- Lead submit
- Signup intake
- Customer dashboard

## Dashboard Rule

- The dashboard factual read projection is CURRENT / LOCAL PROOF and uses `api-app-dashboard-get`.
- The dossier overview renders the additive `timeline` projection from that
  endpoint, including while a correction handoff is active. Copy is mapped at
  the Edge boundary; the frontend accepts only the strict four-type event
  contract and does not derive authority or read event tables directly.
- The page subtitle and integrated `Huidige status` block use
  one dashboard status projection. It combines the curated timeline with the
  active correction and information-request state plus a bounded dossier-status
  fallback, never renders
  raw enums and does not call checked data a completed dossier. The status block
  is limited to status, ENVAL's current step and `Actie van u nodig? Ja/Nee`; past
  milestones remain exclusively in the timeline.
- `CustomerInformationRequestPanel` owns the narrow customer question/one-answer
  surface titled `Vraag over uw dossier` in the existing application detail.
- `WorkforceInformationRequestPanel` owns the matching create/withdraw/resolve
  controls under `Aanvullende vraag` in the existing workforce case detail. It
  distinguishes short explanatory questions from missing/incorrect facts,
  which remain correction decisions. An active request removes the normal
  correction-publication affordance and shows the fixed conflict instruction.
  Both reuse shared cards, fields, buttons and status layout; routes and
  navigation are unchanged.
- `CustomerInformationRequestHistory` is the shared customer/workforce
  presentation for closed questions. It renders only non-empty safe history,
  shows resolved answers and withdrawn questions under `Eerdere vragen en
  antwoorden`, and receives no actor, policy, scope or payload metadata.
- Dashboard modules live under `app/src/features/dashboard/`.
- Dashboard copy should be customer-readable: status, open actions, documents, support, timeline, consents, kWh/value, and downloads.
- Do not expose raw audit rows or internal technical payloads in customer-facing views.
- The dashboard sidebar owns the current reference portal navigation. Its
  `Aanvragen` item contains only exact server-projected accessible application
  links; charger count/content never determines navigation. Its
  `Contact ENVAL` label is not a generic product rule; future customer support
  presentation is tenant-bound.
- Verhuizing and Zakelijk rijden are dashboard Aanpassingen items because regulatory handling is still unclear.
- ENVAL release/edit mode should later reuse signup form components when a read-only field needs customer correction.
- Contact ENVAL is mock-only and currently shows AI bot and message placeholders.
  It neither opens an ENVAL platform-support ticket nor grants support access.
- ENVAL/internal view is deferred until role-based access and internal review architecture are defined.
- Do not add direct Supabase table reads, localStorage, sessionStorage, polling, or realtime subscriptions from the dashboard.

## Signup Intake Rule

- `/aanmelden` currently uses verified Auth where required, a disposable intake
  capability, confirmed quarantine uploads, shared document/fact presentation,
  customer confirmation, `typed_name_otp_v1`, finalization/promotion and
  dashboard handoff boundaries.
- The signup page has account/party information, location/charger evidence,
  document review and signing sections. Parser observations remain derived;
  customer confirmation is not tenant-workforce acceptance.
- Step 1 uses tabs for Particulier, Zakelijk, and VVE. Do not replace these with radio-button UI.
- Step 1 uses account-specific banners and field labels.
- Zakelijk and VVE use location tabs in Step 2. Particulier uses the Step 1 address as its single location.
- Charger information has manual and import paths, both normalizing into the same `locations[].chargers[]` state.
- The frontend architecture supports unlimited chargers; do not reintroduce the legacy max-4 UI cap.
- The frontend architecture supports unlimited locations for zakelijk/VVE.
- Charger fields currently capture brand, model, installation year, required MID number, serial number, back-end supplier, and solar panel status.
- Charger model options are intentionally scaffolded and incomplete until sourced from verified data.
- Solar panel exportability is captured for later review; the frontend must not make final eligibility claims from it.
- Documents attach per charger client ID.
- Signup PDF inputs use the current quarantine upload/confirm/remove authorities;
  local preview/parser output never substitutes for server confirmation or
  evidence acceptance.
- Feature files live under `app/src/features/signup/`.

### Unified signup fact presentation

- `app/src/features/signup/presentation/factPresentationModel.ts` is the
  React-free projection boundary for existing observations, applicability,
  decisions, canonical values, confirmations and corrections.
- `FactTable` owns headers, rows, sources, judgments, responsive layout and the
  `review`/`document` typography variants. `FactReviewControls` is the only
  confirm/correct/checkmark renderer.
- Step-level components supply state, callbacks and sections only. They do not
  define fact rows, source labels or judgment mappings.
- `DocumentUploadSlot` is the single signup upload surface; account, location
  and charger differences are configuration and stable binding props.
- The signing document is read-only review presentation. It is not a signed
  snapshot, persistence boundary, approval, evidence acceptance or production
  proof.
- The same React-free projector owns the customer resolution state for every
  account, location and charger fact: `pending`, `confirmed`,
  `review_required` or `blocked`. Required pending/blocked facts stop progress;
  confirmed/review-required facts may progress; informational facts never gate.
- The five-column review table is fixed to `Gegeven`, `Waarde`, `Bronnen`,
  `Bevestiging / correctie` and `Oordeel`. Actions and the compact correction
  editor stay outside the value and judgment cells. Address correction exposes
  only postcode, house number and suffix plus the existing read-only lookup
  preview.
- Presentation keeps every source observation with its stable document and
  location/charger binding. Equal bytes in two upload bindings remain one
  document identity and therefore are not independent corroboration.
- Step 2 projects location and charger fact tables as sibling sections in
  location order. Page components do not recreate resolution or gating rules.

### Modular signup signing core

- `app/src/features/signup/signing/` owns React-free method, registry, intent,
  evidence, legal-document, canonical-fact and mandate contracts. The core does
  not import a concrete method.
- `signupSigningComposition.ts` is the only composition root and registers
  `typed_name_otp_v1`. Step 3 requests the active port from that root and never
  imports `methods/typedNameOtpV1.ts`.
- `DocumentFirstSigningSummary` remains the one vertical Step 3 renderer and
  reuses `selectUnifiedFactPresentation` plus the `FactTable` document variant.
  Mandate, legal, signer and readiness components extend it; they do not create
  a second dossier summary.
- Legal actions and signer input remain browser interaction state until submitted,
  while server authorities own presentation receipts, explicit acceptance, OTP
  challenge, immutable finalization and signed snapshots. SL01-C presentation/
  acceptance binding is PARTIAL pending browser/UI acceptance; SL01-D owns the
  final provenance cutover.
- Signing UI reuses `components.css` document, form, checkbox, button and status
  tokens. New selectors are signing-document scoped; no stylesheet or global
  typography rule was added.

### Compact signing presentation 09A1

Status: HISTORICAL FOUNDATION retained by the current Wave A1/SL01-C signing
composition; its former no-runtime statements below are superseded.

- Step 3 renders exactly four major sections. Fact tables remain subparts of
  the single summary and do not become separate signing cards.
- `legalBundleDocument.ts` is the canonical legal/mandate render input.
  `legalBundleExportPort.ts` isolates export behavior and
  `browserHtmlLegalBundleV1.ts` supplies the local blob-backed preview/download
  adapter. React components do not contain duplicate legal paragraphs.
- The combined legal control changes three separate browser-local action
  intents. Legal status still closes readiness internally but is not presented
  as customer diagnostics.
- `signupStepTransition.ts` is the single active-step transition path for tabs,
  next, back and reachability correction. It uses immediate scrolling and
  focuses the newly visible heading; ordinary transitions do not recreate the
  reducer draft.
- The 09A method/evidence composition remains reused. Active OTP, finalization,
  persistence, success/recovery UI and the SL01-C candidate now exist under
  their later contracts and proof status.

### Compact signing layout 09A2

- `DocumentFirstSigningSummary` remains the sole state/composition owner.
  `SigningEntityGroup` is its only new presentation child and owns only a
  heading, bounded horizontal rail and sibling `FactTable` panels.
- The additive two-column `FactTable` configuration hides source and judgment
  cells in the customer summary. Review variants and the underlying projected
  sources/resolution values are unchanged.
- Location-to-charger grouping uses projected `locationId` values and existing
  global charger titles. The rail contains overflow locally and stacks at the
  existing narrow-screen breakpoint.
- Document binding is visible in the document-type label; customer-safe
  filename remains the value. No third column or alternate document projector
  exists.
- The three signing sections share an equal-column desktop grid and stack in
  source order on narrow screens. The former empty 09A2 primary-action boundary
  is now occupied by the current signing controls.
- Signer name normalization imports the existing `normalizeName` helper and
  runs on blur, preserving controlled input behavior while typing.

## Migration Rule

Legacy root HTML, `assets/js/**`, and `assets/css/**` are source material only. They should not be edited or replaced until the new app has a reviewed migration plan.
