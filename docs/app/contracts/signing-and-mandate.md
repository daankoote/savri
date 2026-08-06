# Signing And Mandate Contract

Status: TARGET — MODULAR ELECTRONIC SIGNING — PERSISTENCE NOT IMPLEMENTED

## Bounded 09A decision

The active MVP signature method is `typed_name_otp_v1`. It represents a simple
electronic signature with a strong future evidence context: typed full name,
business/VvE signer role, explicit signing intent, a server-issued and verified
one-time challenge, exact legal-document versions, one immutable canonical
snapshot, hashes and audit evidence.

This contract makes no advanced or qualified electronic-signature claim.
Print/scan, uploaded signed PDFs and drawn/canvas signatures are not MVP routes.
The reserved identifiers `drawn_signature_v1`,
`external_advanced_signature_v1` and `qualified_signature_v1` document only the
extension boundary. They have no adapter, provider, UI or registry entry.

09A is frontend contract and presentation only. It sends no OTP, accepts no OTP,
creates no evidence, signs no mandate, submits no signup, starts no dossier and
persists nothing.

## Method port and registry

Every concrete method implements the stable `SignatureMethodPort`:

- `methodId` and `methodVersion`;
- customer display name;
- required signer fields by account type;
- signer-input validation;
- canonical method-intent creation;
- required challenge type;
- evidence-envelope validation.

The core, mandate model, legal registry, canonical snapshot, audit model and
dashboard projection import no concrete method. The composition root registers
`typed_name_otp_v1` once and exposes the active method to Step 3. A later method
is added through that composition boundary without changing mandate or snapshot
shapes.

## Legal-document registry

The registry contains exactly:

| document type | required customer action | current 09A status |
| --- | --- | --- |
| `privacy_notice` | read acknowledgement | `UNKNOWN` |
| `service_terms` | acceptance | `DRAFT` |
| `fee_terms` | acceptance | `DRAFT` |
| `mandate` | signed through the active method | `DRAFT` |

Each entry has version, language, status, effective-from value, title,
canonical content reference/render input and hash status. The current privacy
and terms pages are placeholders, fee terms are a working commercial source,
and final mandate wording is not approved. Their hashes are therefore
unverified and signing readiness remains false. Privacy reading is not modeled
as general consent for all processing.

## Mandate model

One React-free `mandate-document-model-v1` supports Particulier, Zakelijk and
VvE.

Particulier contains:

- full name and canonical address;
- every applicable electricity EAN;
- the existing requirement references for NEa/DSO connection-data retrieval
  and verifier location inspection;
- server-assigned issue-date placeholder;
- whole-calendar-year validity;
- selected signature method.

Zakelijk and VvE contain:

- legal organization name, KvK number and registered address;
- signer full name and signer role;
- every applicable electricity EAN;
- the same two permission requirement references;
- server-assigned issue-date placeholder;
- whole-calendar-year validity;
- selected signature method;
- `required_not_completed` authority-review status.

The permission text is requirement wording, not final legal copy. No parser
observation, title, Auth account or customer ownership proves representation or
signing authority.

`whole_calendar_years_v1` is the single MVP year policy. It accepts one or more
successive integer calendar years and exposes the next full calendar year in
09A. It contains no free start/end dates and creates no silent renewal.

## Intent, snapshot and readiness

`signup-signing-intent-v1` contains account type, the existing canonical fact
projection, signer input, selected method, legal-document versions, mandate
model, calendar-year scope, unresolved review markers and readiness reasons.
Its stable snapshot shape is `signup-signing-snapshot-v1`; 09A computes no hash
and claims no immutability.

Client readiness is false for pending or blocked required facts, missing signer
name, missing Zakelijk/VvE signer role, missing explicit intent, missing mandate
year, incomplete legal action, non-CURRENT or unhashed legal document, missing
method, missing challenge or invalid evidence. `review_required` facts remain in
the intent and snapshot as explicit review risks and do not disappear.

## Later phases

09B1 owns only pre-auth collecting intake and confirmed private quarantine transport. It creates no legal acceptance, mandate, signing evidence, OTP, customer or dossier.

09B2 owns OTP challenge issue/delivery/verification, verified-channel binding,
expiry/replay/rate limits, server-side canonicalization and hashes, CURRENT
legal-version enforcement, server issue time, atomic signature/mandate
finalization, authority-review linkage, idempotency and audit evidence.

09C owns verified promotion and dashboard projection. Foreign trade-register
documents and their jurisdiction-specific authority/evidence rules are
post-MVP. No provider adapter, persistence, submit, database, remote or
production behavior is approved by 09A.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09A1 compact customer presentation

Step 3 has exactly four customer sections: `Samenvatting`, `Machtiging`,
`Voorwaarden en privacy` and `Ondertekening`. Summary confirmation records
only the customer's declaration that the shown data is correct and complete;
it is not evidence acceptance.

One legal-bundle checkbox projects to the three distinct actions
`privacy_notice_read`, `service_terms_accepted` and
`fee_terms_accepted`. Each action retains its own document type, version,
language and hash status. The compact checkbox does not merge those contracts
and does not bypass the internal CURRENT/verified readiness gate.

`legal-bundle-document-v1` is the canonical render input for local preview,
download and a later server renderer. It composes the legal registry content
and generated mandate only. The browser HTML adapter opens a blob-backed new
context or downloads a self-contained HTML file, then revokes the object URL;
it neither navigates to placeholder routes nor invents legal text.

The year selector exposes the current calendar year and the following two
years. The organization signing declaration is customer-declared authority;
`authorityReviewStatus` remains `required_not_completed`. All active legal
versions remain DRAFT/UNKNOWN and unverified, so signing readiness remains
false and no signature, OTP or finalization occurs.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09A2 compact signing layout

`DocumentFirstSigningSummary` remains the only Step 3 summary renderer. Its
customer projection is compact: one two-column Account table, one group per
location with its linked chargers, and one two-column Documents table. The
tables omit source, judgment and action columns, while the existing signing
intent and snapshot continue to retain provenance and resolution state.

Each location group uses the projector's stable location and charger IDs. The
visible charger titles retain global numbering. Documents incorporate their
Account, location or charger binding into `Documentsoort`; no separate binding
column is introduced.

After the summary, Machtiging, Voorwaarden en privacy and Ondertekening share
one responsive three-column composition. There are exactly three customer
confirmations in Step 3: summary accuracy, the combined legal action and the
account-type-aware signing declaration. Machtiging has no additional checkbox.
The signer name reuses the existing signup name normalization on blur.

09A2 reserves only a composition boundary for the future primary action. It
adds no button, OTP, signature, submit, persistence or finalization. 09B owns
the first working `Ondertekenen en indienen` action and its server-side gates.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
