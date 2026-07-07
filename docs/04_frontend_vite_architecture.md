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
- Avoid inline styling except trivial dynamic values if unavoidable.
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

## Routes And Pages

The `/app` frontend uses lightweight client-side routing for now.

Current routes:

- `/`
- `/aanmelden`
- `/upload`
- `/ere`
- `/contact`
- `/privacy`
- `/voorwaarden`
- `/dashboard`

Rules:

- Use the internal route map and History API for now.
- Do not add React Router unless route complexity later justifies it.
- Home stays the commercial landing page.
- `Aanmerking` is currently a home section at `/#aanmerking`, not a separate page.
- Pricing/fee content stays on the homepage for now, not in a separate route.
- Placeholder pages are intentionally short: one clear title, one short paragraph, and one action or note.
- Do not wire backend calls from these pages yet.
- Do not change Netlify redirects or production root behavior for these app routes yet.
- Section targets must account for the sticky header with CSS scroll offsets.
- Signup remains the next real route to design.
- Signup/intake architecture lives in `docs/07_signup_intake_architecture.md`.
- `/aanmelden` should be implemented as a frontend-first draft flow before backend wiring.
- `/dashboard` is a mock/read-only customer portal shell for the next phase.
- Dashboard is person-first: one customer can have multiple assets such as private home, business, VVE, or second home.
- Dashboard currently has no auth guard, no backend calls, no Supabase calls, no submit wiring, and no local/session storage.
- Dashboard uses mock data until the dashboard read model and auth decision are defined.
- Dashboard now uses a left-sidebar customer portal layout.
- The first real dashboard content focus is the active Particulier/private charger page.
- Business and VVE detail pages are deferred until the private active page is right.
- The active private dashboard uses full-width charger rows/tabs that are collapsed by default.
- Charger rows can be expanded/collapsed, with only one charger open at a time.
- The expanded charger area uses an inner accordion that is also collapsed by default and can be toggled closed.
- Inner sections are: Laadpaal, Locatie, Toestemmingen, kWh, Rapportages, and Aanpassingen.
- The generic Documenten section is removed: charger evidence lives under Laadpaal, and address evidence lives under Locatie.
- Top charger rows use text status pills; inner section headers and cards use small status dots for calmer scanning.
- Sidebar order is: Nieuwe aanvraag, Actief, History, Contact ENVAL, Settings, and Uitloggen.
- History is its own mock menu tab.
- Verhuizing and Zakelijk rijden live under the Aanpassingen section, not in the sidebar.
- Laadpaal and Locatie sections use read-only table-style summaries after submit.
- Evidence documents are shown in the section they belong to: Installatie factuur and MID bewijs under Laadpaal, Adres bevestiging under Locatie, and legal documents under Toestemmingen.
- The kWh section is split into Handmatig and Automatisch groups.
- kWh, document, consent, and backend-koppeling controls are mock/read-only placeholders.
- Backend koppeling is mock-only; exact provider connection flow still needs research.

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
- Current visible assumptions are explicit: kilometers, kWh per 100 km, yearly kWh, value per kWh, and 10% ENVAL fee.
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

- The dashboard shell is frontend-only and read-only until backend contracts exist.
- Dashboard modules live under `app/src/features/dashboard/`.
- Dashboard copy should be customer-readable: status, open actions, documents, support, timeline, consents, kWh/value, and downloads.
- Do not expose raw audit rows or internal technical payloads in customer-facing views.
- The dashboard sidebar owns primary portal navigation: Nieuwe aanvraag, Actief, History, Contact ENVAL, Settings, and Uitloggen.
- Verhuizing and Zakelijk rijden are dashboard Aanpassingen items because regulatory handling is still unclear.
- ENVAL release/edit mode should later reuse signup form components when a read-only field needs customer correction.
- Contact ENVAL is mock-only and currently shows AI bot and message placeholders.
- ENVAL/internal view is deferred until role-based access and internal review architecture are defined.
- Do not add backend calls, auth guards, Supabase access, localStorage, or sessionStorage from the dashboard shell.

## Signup Intake Rule

- `/aanmelden` currently has a frontend-only intake skeleton.
- Do not wire `/aanmelden` to backend until the API contract is reviewed.
- The target signup page has personal information, charger information, document upload, and consent/signature placeholders.
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
- Current file inputs, KVK placeholders, and signature placeholders are local only.
- Do not store files, submit drafts, or call backend APIs from `/aanmelden` yet.
- Feature files live under `app/src/features/signup/`.

## Migration Rule

Legacy root HTML, `assets/js/**`, and `assets/css/**` are source material only. They should not be edited or replaced until the new app has a reviewed migration plan.
