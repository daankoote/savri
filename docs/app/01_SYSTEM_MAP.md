# ENVAL Architectuur

## Surfaces

1. Production frontend: static HTML/CSS/JS in the repository root.
2. Rebuild frontend: isolated Vite app in `/app`.
3. Backend: Supabase Edge Functions, migrations, storage, and database logic in `/supabase`.
4. Documentation: current app source-of-truth docs in `docs/app/`, with legacy material in `docs/legacy/`.

## Current Boundary

The root static site remains the live production surface. The `/app` Vite app is local development only and has no Netlify deploy contract yet.

The standard local Vite dev URL is:

```text
http://localhost:5175/
```

Ports `5173` and `5174` are reserved for other projects.

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

Status: CURRENT / LOCAL PROOF for lean frontend Auth/session flow, backend bootstrap, and the customer-safe dashboard read endpoint. Frontend dashboard projection remains OPEN.

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
→ customer-safe dossier projection
```

Rules:

- One customer may have multiple dossiers.
- Dossiers may have different account types: particulier, zakelijk, or VVE.
- Auth logic is not split per account type.
- Legacy dossier sessions are not used for app customer auth.
- Auth module and Supabase browser client are route-lazy.
- Public routes do not initialize Supabase Auth.
- `api-app-dashboard-get` is CURRENT / LOCAL PROOF and reads through the authenticated Edge boundary.
- The browser does not directly read app tables.
- The app does not call legacy dossier sessions or legacy dashboard/read endpoints.
- Dashboard content remains mock/read-only.
- Frontend wiring from `/dashboard` to the real read projection remains OPEN.

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
