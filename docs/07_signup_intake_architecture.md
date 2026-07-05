# Signup Intake Architecture

Status: frontend skeleton implemented. Backend wiring, real upload, import parsing, and final submit remain out of scope.

## Scope

The new `/aanmelden` page is a single-page intake with these customer-facing sections:

1. Persoonlijke informatie
2. Laadpaal informatie
3. Documentatie uploaden
4. Toestemming en handtekening

No backend writes happen during the draft flow. Database writes, uploads, and dossier creation happen only after a later backend/API contract task defines the final submit boundary.

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
   - street/adres, city/stad, and country/land are visible but read-only in the skeleton
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

Current frontend skeleton files:

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
- `ConsentSignatureSection`: local placeholder for final consent and signature UX.
- `DocumentUploadSlot`: local file selection and validation placeholder.
- `SignupReviewPanel`: final draft completeness overview before later backend submit.
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
   - required consents checked
   - document slots selected/ready where required

Client validation is not final truth. Backend validation still has to re-check all relevant fields during the later final submit task.

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

## Final Submit Model

Final submit is not part of the next implementation.

Target later behavior:

- User completes local draft.
- Client validates complete draft.
- User clicks final action, probably "Start dossier".
- Only then the frontend calls a future backend contract.
- Backend creates customer/dossier/chargers/document upload intents/audit events in one controlled flow or a clearly staged transaction model.
- Backend stores legal/commercial versions accepted by the customer.
- Backend returns a dossier/session state that upload UI can continue from.

Final submit must be idempotent and audit-worthy. It must not depend on hidden browser-only state.

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

Later backend review must decide whether to:

- extend `api-lead-submit`
- add a new signup/intake endpoint
- create dossier and all initial chargers in one final submit
- create upload intents only after dossier creation
- support dynamic charger count without the old UI max 4
- keep or replace the current backend 1-10 charger count rule
- version fee model, terms, privacy, and consent copy
- support document requirements by charger and by rule version
- emit audit events for final submit and rejected final submit

No Supabase functions or migrations are changed by this planning document.

## Not Implemented Yet

- no backend wiring
- no Supabase changes
- no upload implementation
- no CSV/XLSX parser
- no manufacturer database
- no external manufacturer/API lookup
- no final backend schema
- no legal final terms copy

## Open Compliance Decisions

- KVK-uittreksel or board-document requirements may apply for zakelijk/VVE.
- The acceptable age of any KVK document is still open; do not hardcode a maximum age yet.
- Consent text and signature requirements are open legal/compliance decisions.
- Solar panel data and hourly exportability may affect eligibility or evidence review.
- MID/model eligibility must support later manufacturer/model rules and manual review.
- Model dropdown values must be sourced later from verified competitor inspection, manufacturer data, or internal eligibility rules.
- Brand and back-end supplier can be selected from catalog or entered manually via their explicit fallback options.
- Address checker must later populate street/adres, city/stad, and country/land from postcode, house number, and optional suffix.

## Model Catalog Source Strategy

- Competitor model loading appears to use `/api/v1/users/getModel?brand_id=<brand_id>`.
- ENVAL must not depend live on a competitor API.
- Current model data is locally seeded from a one-time observed model endpoint response.
- Future corrections should be made in ENVAL's local catalog or a future internal model database.
- The model catalog must remain replaceable and modular.
- Manual model entry remains required as fallback.

## Recommended Next Implementation Task

Strengthen the frontend skeleton:

- field-level validation messages
- better MID evidence prompts
- import parser design or stub tests
- document upload UX details
- no backend writes
- no real upload
