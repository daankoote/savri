# Signup Intake Architecture

Status: MIXED. The active document-first journey, pre-auth quarantine, `typed_name_otp_v1` finalization, locked receipt and server-authoritative recovery are CURRENT PROVEN locally. The older direct `api-app-signup-submit` path remains proven source but is not the active signed-intake owner. Atomic case promotion, Auth binding/cutover and production deployment remain TARGET / NOT IMPLEMENTED.

## Scope

The new `/aanmelden` page is a single-page intake with these customer-facing sections:

1. Persoonlijke informatie
2. Laadpaal informatie
3. Documentatie uploaden
4. Toestemming en handtekening

Draft edits remain browser-local. Required PDFs use the dedicated private pre-auth quarantine path; successful Step 3 `typed_name_otp_v1` finalization atomically stores the signed snapshot, legal acceptances, mandate and signature evidence and locks the intake. It does not create a customer, Auth session, dossier or case.

The authenticated shared document module remains separate. `/aanmelden` uses the signup-quarantine transport and keeps parser observations separate from declared/signed facts.

Pre-auth signup must not call authenticated upload endpoints. Quarantine confirmation proves only server-observed bytes/MIME/size/hash and never evidence acceptance. Parser/precheck output remains observed/derived and cannot silently overwrite declared state.

The converged lifecycle is documented in `docs/app/contracts/intake-verification-promotion.md`. A separate email-verification promotion link is `SUPERSEDED`; the CURRENT signing OTP already proves bounded email control. Server-only atomic promotion into `app_cases`-owned durable state remains TARGET / NOT IMPLEMENTED.

## Old Flow Inventory

### Old `aanmelden.html`

The legacy public signup form collects:

- `first_name`
- `last_name`
- `email`
- optional `telefoon`
- `charger_count`
- `own_premises`
- `in_nl`
- `has_mid`
- `akkoord`

Legacy client validation in `assets/js/script.js` includes:

- email regex: basic non-space `@` plus domain check
- NL mobile validation: `06xxxxxxxx` or `+316xxxxxxxx`, after stripping spaces, hyphens, dots, and parentheses
- name normalization via `normalizePersonName`
- charger count must be an integer >= 1
- UI cap uses `window.ENVAL.UI_MAX_CHARGERS`, currently `4`
- hard gates require own premises, Netherlands, and MID all to be `ja`

Legacy submit posts to `api-lead-submit` with:

- `flow: "ev_direct"`
- normalized personal fields
- `charger_count`
- `own_premises: true`
- `in_nl: true`
- `has_mid: true`

This old positioning says ENVAL prepares a dossier and does not book itself. That product wording is obsolete for the new commercial inboekservice positioning.

### Old `dossier.html`

The legacy dossier flow is split into five steps:

1. Basisgegevens
2. Adres
3. Laadpalen
4. Documenten uploaden
5. Toestemmingen

Basisgegevens include first name, last name, optional mobile, and charger count. The UI explicitly says more than 4 chargers should contact ENVAL.

Address fields include postcode, house number, suffix, street, and city. Frontend postcode normalization converts to uppercase and removes whitespace. Address save requires previous address verification.

Charger fields include:

- brand
- model
- notes when brand/model is `Anders`
- MID number
- serial number

Document upload is grouped per saved charger. Current document buckets per charger are:

- `factuur`
- `foto_laadpunt`

The UI currently treats invoice as the hard document gate. Photo support exists, but photo analysis is not the hard launch gate.

Consents include:

- terms
- privacy
- mandaat

### Old Charger Limits

The old frontend enforces a maximum of 4 self-serve chargers:

- `assets/js/config.js`: `window.ENVAL.UI_MAX_CHARGERS = 4`
- `assets/js/script.js`: signup rejects above UI max
- `assets/js/pages/dossier.js`: access form rejects above UI max
- legacy eligibility allows `5plus` only as a maybe/contact path

The backend access save/update code accepts charger counts in the range 1-10, but the old public/self-serve UI still blocks above 4. The new `/aanmelden` architecture must not inherit the 4-charger UI limit.

## Backend And API Findings

Current dossier runtime endpoints are session-based and audit-oriented:

- `api-dossier-get`
- `api-dossier-access-save`
- `api-dossier-access-update`
- `api-dossier-address-save`
- `api-dossier-address-verify`
- `api-dossier-charger-save`
- `api-dossier-charger-delete`
- `api-dossier-upload-url`
- `api-dossier-upload-confirm`
- `api-dossier-consents-save`
- `api-dossier-evaluate`
- `api-dossier-verify`
- `api-dossier-export`

The Edge Function contract classifies intake and dossier write endpoints as CORE: CORS, request metadata, idempotency, audit logging, session/auth boundaries, and service-role server writes matter.

Observed backend assumptions:

- Dossier writes require a valid dossier session after a dossier exists.
- Write endpoints require `Idempotency-Key`.
- Rejects and successful mutations emit audit events when dossier scope is known.
- Dossier lock/status blocks later customer mutation.
- Ready-for-review can be invalidated when customer evidence changes.
- `dossier_chargers` currently uses `mid_number`; a migration renamed the old `meter_id` to `mid_number` and sets it not null when present.
- `api-dossier-charger-save` requires serial number, MID number, brand, and model.
- `api-dossier-charger-save` prevents duplicate MID numbers inside the same dossier.
- `api-dossier-upload-url` supports document types including `factuur` and `foto_laadpunt`; those require a charger ID.
- Upload URL currently limits to one non-rejected document per charger per type for `factuur` and `foto_laadpunt`.
- Upload confirmation verifies server-side file hash before marking a document confirmed.
- Evaluation checks include email verified, address verified, exact charger count, MID per charger, documents per charger, required consents, and optionally analysis gate.

## Analysis And Evidence Findings

The current analysis layer is derived evidence, not direct user input:

- declared dossier and charger fields are compared against observed document fields
- invoice observed fields include address, postcode, brand, model, serial number, and MID number
- hard required invoice checks include address, serial, and MID matching
- optional invoice checks include brand and model
- analysis writes separate document, charger, and summary rows
- analysis events are additional audit events and should not replace upload/review/export audit meaning

This supports the new architecture principle: intake data, uploaded evidence, and derived analysis should stay separate layers.

## Target Page Structure

`/aanmelden` should become one intake page with:

1. Persoonlijke informatie
   - tabs: Particulier, Zakelijk, VVE
   - account-specific registration banner
   - name or bestuurder name
   - email
   - optional phone
   - address/location fields, including optional suffix and country/land with default Nederland
   - street/adres, city/stad, and country/land are visible but read-only in the current UI
   - company/VVE name and KVK number for zakelijk/VVE
   - local KVK-uittreksel placeholder for zakelijk/VVE

2. Laadpaal informatie
   - tab: Handmatig invoeren
   - tab: Importeren
   - particulier uses one implicit location from Step 1
   - zakelijk/VVE support unlimited locations
   - each location supports unlimited chargers
   - both tabs normalize into the same `locations[].chargers[]` state

3. Documentatie uploaden
   - document requirements generated from `locations[].chargers[]`
   - each upload slot links to a stable charger client ID
   - KVK placeholder is surfaced for zakelijk/VVE
   - no storage or backend write in the first frontend implementation

4. Toestemming en handtekening
   - short placeholder only
   - final legal copy and signature implementation are open production decisions

## Proposed Component Architecture

Current frontend feature files:

```text
app/src/features/signup/
  SignupPageShell.tsx
  PersonalInfoSection.tsx
  ChargerInfoSection.tsx
  ChargerManualTab.tsx
  ChargerImportTab.tsx
  ChargerList.tsx
  ChargerCard.tsx
  ChargerForm.tsx
  ChargerDocumentsSection.tsx
  ConsentSignatureSection.tsx
  DocumentUploadSlot.tsx
  SignupReviewPanel.tsx
  address/addressNormalizers.ts
  address/addressLookup.ts
  address/useAddressLookup.ts
  signupTypes.ts
  signupValidation.ts
  signupImport.ts
  signupNormalizers.ts
```

Responsibilities:

- `SignupPageShell`: owns draft state and section order.
- `PersonalInfoSection`: personal/contact input and client validation display.
- `ChargerInfoSection`: tab control and shared charger state.
- `ChargerManualTab`: legacy/simple manual list helper; current Step 2 renders location-aware charger lists.
- `ChargerImportTab`: import file selection, parse preview, row errors, and commit into `locations[].chargers[]`.
- `ChargerList`: shared list renderer for manual and imported chargers.
- `ChargerCard`: one charger summary and edit/remove actions.
- `ChargerForm`: fields for one charger draft.
- `ChargerDocumentsSection`: generated document checklist per charger.
- `ConsentSignatureSection`: local consent/terms bundle checkbox with draft legal popups. Legal copy is still draft until reviewed.
- `DocumentUploadSlot`: local file selection and validation placeholder.
- `SignupReviewPanel`: final draft completeness overview before later backend submit.
- `address/addressNormalizers.ts`: local postcode, house-number, and suffix normalization.
- `address/addressLookup.ts`: read-only signup address lookup adapter with direct PDOK lookup, optional fallback, memory-only cache, and request dedupe.
- `address/useAddressLookup.ts`: debounced per-address-block lookup state.
- `signupValidation.ts`: pure validation rules.
- `signupImport.ts`: isolated CSV/XLSX parsing later.
- `signupNormalizers.ts`: maps manual/import rows into canonical draft shapes.

## Client-Side State Model

Proposed frontend draft shape:

```ts
type SignupDraft = {
  personalInfo: PersonalInfoDraft;
  locations: SignupLocationDraft[];
  documentsByChargerId: Record<string, ChargerDocumentDraft[]>;
  consents: ConsentDraft;
  validation: SignupValidationState;
};

type ConsentDraft = {
  termsBundleAccepted: boolean;
};

type PersonalInfoDraft = {
  accountType: "particulier" | "zakelijk" | "vve";
  firstName: string;
  lastName: string;
  companyName?: string;
  organizationName?: string;
  kvkNumber: string;
  email: string;
  phone: string;
  city: string;
  postcode: string;
  houseNumber: string;
  suffix: string;
  street: string;
  country: string;
  kvkDocument?: File | null;
};

type ChargerDraft = {
  clientId: string;
  source: "manual" | "import";
  brand: string;
  manualBrand: string;
  model: string;
  manualModel: string;
  installationYear: string;
  midNumber: string;
  serialNumber: string;
  backendSupplier: string;
  manualBackendSupplier: string;
  solarPanelStatus: "" | "hourly_exportable" | "not_hourly_exportable" | "none";
};

type SignupLocationDraft = {
  clientId: string;
  address: AddressDraft;
  chargers: ChargerDraft[];
};

type AddressDraft = {
  postcode: string;
  houseNumber: string;
  suffix: string;
  street: string;
  city: string;
  country: string;
  bagId: string | null;
  resolvedLookupKey: string | null;
};

type ChargerDocumentDraft = {
  clientId: string;
  chargerClientId: string;
  documentType: "installation_invoice" | "monthly_reimbursement";
  file: File | null;
  status: "empty" | "selected" | "invalid" | "ready";
  errors: string[];
};
```

Do not treat this as the final backend schema. It is the client-side architecture shape for the `/aanmelden` draft.

## Charger Model

Manual and imported chargers must normalize into the same `locations[].chargers[]` model.

Rules:

- Start manual entry with one charger.
- Provide a `+` action to add another charger.
- No hard maximum of 4 chargers.
- No hard maximum for zakelijk/VVE locations.
- Each charger gets a stable client-side ID at creation/import time.
- Documents attach to `chargerClientId`, not array index.
- Removing a charger should also mark or remove its linked document draft slots.
- Reordering chargers must not break document associations.
- UI may show practical warnings for very large lists, but must not enforce the old max-4 rule.

Potential future charger fields:

- photo of charger
- MID number
- MID meter evidence
- type plate photo
- manufacturer
- model
- serial number
- installation/location details
- extra manufacturer/model checks
- additional consent

## Manual Entry Flow

Manual entry should:

- create a first charger draft by default
- let users add unlimited charger drafts
- validate each charger independently
- show missing fields per charger
- generate document slots per charger after charger data exists
- avoid saving partial charger state to backend in the frontend-only phase

Fields to carry forward from old flow where relevant:

- brand
- model
- installation year
- serial number
- MID number as a required visible field
- back-end supplier
- solar panel data/exportability

Visible charger fields:

- Merk dropdown, using the local option list supplied by the user.
- Merk supports manual entry through `Anders`.
- Model dropdown dependent on selected merk, with manual entry fallback until real model data is sourced.
- Model manual fallback stores `manualModel` separately and changing brand resets model/manual model state.
- Jaar van installatie dropdown, descending from current year to 2000.
- MID nummer, required and placed before serienummer.
- Serienummer.
- Back-end leverancier dropdown, using the local option list supplied by the user.
- Back-end leverancier supports manual entry through visible option `Anders`.
- Zonnepanelen aanwezig dropdown.

Do not put bewijs van installatie in Step 2. It belongs in Step 3 document upload.

## Import Flow

Import is architecture-only for now.

Later supported inputs:

- CSV
- XLSX
- possibly other spreadsheet formats if justified

Import pipeline:

1. Select file.
2. Parse rows locally.
3. Normalize columns into candidate charger rows.
4. Validate row-by-row.
5. Show preview with row errors.
6. Let user accept valid rows.
7. Convert accepted rows to `ChargerDraft[]`.
8. Merge into the same `locations[].chargers[]` list used by manual entry.
9. Generate document slots per imported charger.

Import must not write to backend. Parser code should remain module-isolated in `signupImport.ts` so it can later be tested and replaced without touching the rest of signup.

## Document Model

Documents are tied to charger client IDs in the frontend draft.

Document upload group titles must include the charger number and MID number. This keeps documents distinguishable when a user has multiple identical chargers.

For zakelijk/VVE, document upload location groups show the resolved location address when available:
`Locatie N — street houseNumber+suffix — postcode — city — country`.

Charger document titles show the MID number. If the MID number is missing, only `MID ontbreekt` is styled with the shared warning text style.

Initial customer-facing document slots should be generated per charger. Start with conservative slots:

- Particulier, per charger: Factuur installatie.
- Particulier, per charger when applicable: Indien zakelijk rijden, maandoverzicht thuislaadvergoeding.
- Zakelijk/VVE, per charger: Factuur installatie.
- Zakelijk/VVE: include the Step 1 KVK-uittreksel placeholder in the document section.

Architecture must support future requirements without rewriting the flow:

- required/optional document rules by charger
- document status per slot
- client-side file validation
- one or more files per future document type if later required
- local selected-file state before backend upload
- backend document IDs only after final submit/upload contract exists

Old backend currently requires `charger_id` for `factuur` and `foto_laadpunt`. The new draft must therefore preserve charger-document linkage from the start.

## Validation Model

Validation should be pure, deterministic, and client-side first.

Validation layers:

1. Field validation
   - required names
   - valid email
   - required address/location fields
   - required company or VVE/organization name where relevant
   - required KVK number for zakelijk/VVE
   - optional NL mobile format
   - required charger fields
   - local warnings for KVK/board documents where relevant
   - plausible charger and evidence values

2. Draft consistency
   - at least one charger
   - at least one location for zakelijk/VVE
   - every charger has a stable ID
   - documents are linked to existing charger IDs
   - no duplicate charger client IDs
   - duplicate MID/serial warnings where useful

3. Eligibility checks
   - customer is in relevant jurisdiction
   - home charging situation
   - MID status per charger
   - solar panel data/exportability where relevant
   - evidence completeness

4. Submission readiness
   - all required sections complete
   - bundled terms/privacy/fee checkbox accepted
   - document slots selected/ready where required

Client validation is not final truth. Backend validation still has to re-check all relevant fields during the later final submit task.

## Consent And Terms Section

The current `/aanmelden` frontend uses one local consent field: `termsBundleAccepted`.

The visible checkbox bundles acceptance for:

- algemene voorwaarden
- privacyverklaring
- ENVAL fee

The linked words open local draft popups in the current page. There is no route, PDF, download, backend call, or persisted acceptance.

Data processing, no-guarantee language, and control/verifier permission are currently covered inside draft legal text and still need legal review. Legal review may later require separate consent records.

No fixed consent duration is offered at this stage. Contract duration, profitability, and consent duration are open legal/commercial decisions.

Backend later must store accepted legal versions, content hashes, language, timestamps, customer identity, dossier scope, and request metadata. It may split the bundled frontend acceptance into separate legal/consent records if legal review requires it.

## MID, Model, And Manufacturer Check Architecture

MID meter presence and charger model rules are likely important eligibility criteria. They must support manual review and future manufacturer/model checks.

Architecture rules:

- Capture MID number as a required visible field.
- Keep MID/model eligibility ready for manufacturer/model rules later.
- Keep internal architecture flexible enough for future MID status and evidence review.
- Do not assume automatic manufacturer checks exist.
- Do not hardcode Mennekes or any other manufacturer assumptions without verified source.
- Support manual review fallback from day one.

Future extension points:

- internal charger model database
- known eligible/ineligible model rules
- manufacturer/model matching
- manufacturer check workflow
- external check/API if discovered later
- confidence labels rather than binary hidden decisions

## Historical Direct Submit Model

The direct `api-app-signup-submit` write-v3/v5 family remains locally proven source and supplies reusable transaction/idempotency patterns. It is not the active signed-intake lifecycle and must not become a parallel case owner.

Historical proven behavior:

- User completes local draft.
- Client validates complete draft.
- User clicks `Start dossier`.
- Frontend maps the draft to the submit payload.
- Frontend calls the `api-app-signup-submit` write v3 endpoint.
- Backend creates or matches customer/identity, creates the dossier shell, locations, chargers, document slots, legal acceptances, idempotency, intake audit, and app audit rows.
- Frontend shows loading, success, or safe error state on the same page.

It created the dossier-shaped records listed above without the later signed-intake lifecycle. For 09C1, `app_cases` is the target owner and no new `app_customer_dossiers` row may be created merely to reuse old foreign keys.

Still open:

- dashboard bootstrap/redirect directly from signup success
- public signup document upload to storage
- customer-readable timeline
- support/messages
- kWh/result/fee lifecycle

Final submit must be idempotent and audit-worthy. It must not depend on hidden browser-only state.

## Target Post-Signing Promotion Model

Status: TARGET / NOT IMPLEMENTED. Exact contract: `docs/app/contracts/intake-verification-promotion.md`.

Future public intake should move toward:

1. Customer completes public form, parser-assisted review, quarantine documents and legal/signing actions.
2. `typed_name_otp_v1` proves signing intent and control of the used email channel and atomically finalizes the intake.
3. CURRENT status `pending_verification` means finalized/locked only; 09C1 renames it to `submitted_for_review` to avoid TKV ambiguity.
4. A server-only caller prepares durable private file copies and invokes one idempotent promotion transaction.
5. Promotion safely creates/reuses customer, unbound login identity and parties, creates one `app_cases` root, asserted case roles, declared location observations/links, durable evidence versions and internal-review state.
6. Promotion never creates an `app_customer_dossiers` core, authority truth, accepted EAN/location/MID/evidence or external-verifier state.
7. Supabase Auth binding and dashboard access happen after promotion through the existing Auth product route, not through signing OTP.
8. Later correctable issues expose only targeted server-authorized correction actions.

Parser/precheck may warn, block locally, or prefill. It may not approve evidence, lock lifecycle state, or replace backend validation.

## Audit Implications

The new architecture should preserve these audit principles:

- distinguish customer-declared fields from uploaded evidence
- distinguish uploaded file metadata from derived analysis
- keep all final backend writes behind explicit actions
- preserve stable charger IDs through import/manual flows
- store document links per charger
- record consent versions later
- record fee model version later
- record validation/backend rejection reasons later

Client draft state is useful for UX but is not audit truth until submitted and accepted by backend.

## Backend/API Contract Implications

Current backend contract status:

- New app signup uses `api-app-signup-submit`, not `api-lead-submit`.
- The current write v3 submit creates the customer/dossier foundation, locations, chargers, document slots, legal acceptances, and app audit/idempotency rows.
- The proven upload backend is separate: `api-app-document-upload-url` and `api-app-document-upload-confirm`.
- Authenticated dashboard document upload/download/withdrawal wiring is implemented through the reusable document module.
- Public `/aanmelden` upload wiring remains open.
- Customer-facing Auth/dashboard bootstrap is implemented through `/account` and the protected dashboard, but `/aanmelden` does not redirect/bootstrap directly after submit.

Later backend review must still decide how to:

- create upload intents only after dossier creation or from dashboard/document slots
- keep account-specific document rules aligned for particulier, zakelijk, and VVE
- version fee model, terms, privacy, and consent copy
- store accepted legal versions, content hashes, language, timestamps, customer identity, dossier scope, and request metadata
- support document requirements by charger and by rule version
- emit audit events for final submit and rejected final submit

No Supabase functions or migrations are changed by this planning document.

## Not Implemented Yet

- no frontend upload wiring
- no customer Auth/login/bootstrap
- no dashboard backend read projection
- no CSV/XLSX parser
- no manufacturer database
- no external manufacturer/API lookup
- no production deployment
- no legal final terms copy

## Open Compliance Decisions

- KVK-uittreksel or board-document requirements may apply for zakelijk/VVE.
- The acceptable age of any KVK document is still open; do not hardcode a maximum age yet.
- Consent text and signature requirements are open legal/compliance decisions.
- Solar panel data and hourly exportability may affect eligibility or evidence review.
- MID/model eligibility must support later manufacturer/model rules and manual review.
- Model dropdown values must be sourced later from verified competitor inspection, manufacturer data, or internal eligibility rules.
- Brand and back-end supplier can be selected from catalog or entered manually via their explicit fallback options.

## Address Lookup Strategy

- Address lookup in `/aanmelden` is client-first and read-only.
- The primary lookup path is direct browser lookup against PDOK Locatieserver.
- This lookup does not invoke Supabase, does not create dossier state, does not save address data, and does not emit audit events.
- Postcode, house number, and optional suffix are normalized locally before lookup.
- Postcode must be Dutch format: four digits plus two letters, normalized to `1234AB`.
- House number accepts digits only and must be between 1 and 9999.
- Suffix/toevoeging is optional. Current practical validation allows empty, 1-100 with up to three letters, numeric 1-100, or one to three letters. Suffix edge cases need real-world QA later.
- Street/adres, city/stad, country/land, and `bagId` are derived fields; users do not edit them directly.
- Derived address fields must not be cleared on a no-op blur normalization. They are cleared only when the normalized lookup key changes from the key that produced the current result.
- Country is lookup-derived. PDOK currently resolves Dutch addresses as `Nederland`; future lookup providers may return other supported countries.
- Each address block runs lookup independently and keeps its own loading/error/success state.
- Lookup is debounced, cached in memory only, and dedupes identical in-flight requests to reduce latency and external calls.
- No `localStorage`, `sessionStorage`, or hidden browser persistence is used.
- The Vite app must not call `api-dossier-address-save`, `api-dossier-get`, or old dossier-session endpoints from this draft flow.
- If direct PDOK lookup fails because of browser, CORS, network, or response-shape issues, an optional future read-only fallback endpoint may be used.
- The prepared fallback endpoint is `api-signup-address-lookup`.
- If no clean read-only fallback is configured, the UI shows that address control is temporarily unavailable and keeps validation relaxed for street/city.
- Final backend address persistence remains a later explicit submit-contract task.

## Signup Field Normalization

- Email uses the pragmatic existing frontend regex: non-space local part, `@`, and a domain with a dot. On blur it is trimmed and lowercased.
- Phone is optional. If filled, Dutch mobile and landline-style numbers are accepted with spaces, dashes, dots, parentheses, `+31`, or `0031` formatting.
- Names, company name, and VVE name are title-cased on blur, preserving spaces, hyphens, and apostrophes.
- Name validation is conservative for now: letters, spaces, hyphens, and apostrophes.
- KVK number is normalized by removing spaces and must be exactly eight digits.
- Field-level messages should stay compact; the review panel remains the main final validation summary.

## Model Catalog Source Strategy

- Competitor model loading appears to use `/api/v1/users/getModel?brand_id=<brand_id>`.
- ENVAL must not depend live on a competitor API.
- Current model data is locally seeded from a one-time observed model endpoint response.
- Future corrections should be made in ENVAL's local catalog or a future internal model database.
- The model catalog must remain replaceable and modular.
- Manual model entry remains required as fallback.

## Recommended Next Implementation Task

Strengthen the remaining signup/dashboard boundary:

- formal draft/submit/lock/targeted-unlock contract
- parser/precheck reuse in authenticated document cards
- public signup upload journey decision, if needed
- import parser design or stub tests
- account-specific document requirements for zakelijk/VVE
- no production deploy until remote migrations, functions, storage bucket, and browser QA are proven
