# Signing And Mandate Contract

Status: MIXED — `typed_name_otp_v1` SIGNING PERSISTENCE CURRENT PROVEN LOCALLY; PRODUCTION LEGAL/OTP AND 09C PROMOTION NOT CURRENT

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

09A remains the historical frontend composition boundary. Later 09B2B/09B2C
runtime now sends and verifies OTP locally, creates the immutable signing record
set, finalizes/locks the intake and restores a customer-safe receipt. It still
creates no customer, Auth session, dossier or case and does not make the legal
bundle or production OTP CURRENT.

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
and terms pages are placeholders, fee terms contain approved commercial
direction but remain DRAFT legal text,
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

`whole_calendar_years_v1` is the current 09A frontend/model policy. It still
accepts one or more successive integer calendar years and exposes the next full
calendar year in 09A. The approved 09B2A2 TARGET direction instead permits
exactly one chosen calendar year per mandate/finalization. That source/runtime
reconciliation is NOT IMPLEMENTED in this documentation batch. Neither policy
contains free start/end dates or creates silent renewal.

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

09C owns internal durable promotion and dashboard projection. The word
`verified` is not used for that internal lifecycle: `typed_name_otp_v1` proves
signing intent and bounded email control, while external inboekverificatie
remains a separate verifier-owned process. Foreign trade-register
documents and their jurisdiction-specific authority/evidence rules are
post-MVP. No provider adapter, persistence, submit, database, remote or
production behavior is approved by 09A.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09B2C signed submission receipt

The atomic server finalization and immutable records remain the only core
truth. A successful `pending_verification` response may create one same-tab
presentation receipt with schema `signup-submission-receipt-v1`, the safe
public `SIG-...` reference and status only. The receipt grants no capability
and cannot authorize intake, upload, signing, verification or dashboard work.

On refresh, the existing scoped intake session calls the existing signing
boundary in status mode. Only its server response may establish `finalized`
and `locked`; the presentation receipt never may. A valid finalized response
restores the compact locked confirmation and exactly the same safe reference.
A temporary status failure remains read-only with retry and never falls back
to an editable or newly created intake. Missing, corrupt, extra-field or
unknown receipt values are removed or ignored. No intake UUID, capability,
idempotency key, request ID, OTP/challenge, e-mail, signer/party data,
EAN/address, document data, legal/snapshot hash or canonical snapshot may
enter the receipt cache.

`app_signup_signing_status_v1` is service-role-only and requires both the
intake UUID and hash of the existing `intake_manage` ownership capability. It
does not support lookup by safe reference. Finalized status is returned only
when the intake, consumed challenge/capability, one snapshot, three legal
acceptances, one mandate, one signature evidence row and one finalization
audit event agree. Finalized intake-file rows are database-trigger locked.

This local receipt behavior does not promote the validation-candidate legal
bundle to CURRENT and does not configure or approve production OTP delivery.

## 09C0 post-signing verification boundaries

`typed_name_otp_v1` proves the signing act and control of the email channel
used for that act. It proves no material eligibility, representation authority,
accepted EAN/location/MID/evidence or NEa inboekverificatie. Zakelijk/VvE keeps
`authority_review_status=required_not_completed`; Particulier acting for
themself needs no fictitious representation-authority row.

The former separate one-time email-verification promotion link is
`SUPERSEDED`. Durable promotion is server-only and is never authorized by the
receipt, safe reference, OTP, signing challenge or consumed management
capability. Supabase Auth verification/login remains a separate post-promotion
account-access boundary and signing OTP creates no Auth session.

CURRENT `pending_verification` means only finalized, locked and awaiting ENVAL
internal handling. Because it is ambiguous beside the formal TKV verification
concept, 09C1 must rename it to `submitted_for_review` across database, RPC,
client, receipt schema and proofs. Customer copy remains `Ondertekend en
ingediend` followed by `In behandeling`; external verifier states remain in a
separate future bounded context.

The exact atomic case-owned promotion and evidence/Auth/dashboard boundaries
are canonical in `intake-verification-promotion.md`. Signing snapshots, legal
acceptances, mandate and signature evidence are linked by promotion and never
rewritten or duplicated.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09B2C-R2 local signing runtime

The server uses one shared strict classifier for local signup and signing
runtime behavior. It accepts loopback Supabase URLs and exact
`http://kong:8000`, the embedded local Supabase Edge URL. It rejects HTTPS
Kong, other Kong ports, Kong-like hostnames and production Supabase URLs.

Only that local runtime may automatically use the local Mailpit adapter and
the service-role-backed verifier-secret fallback. A configured production
transport and dedicated verifier secret remain mandatory outside local
development; missing production configuration returns a customer-safe 503.
The local exception does not make the validation-candidate legal bundle
CURRENT and does not approve production legal or OTP behavior.

## 09B2C-R3 frontend challenge readiness

The frontend challenge CTA gates only observable customer prerequisites:
confirmed required uploads, the scoped intake session, summary confirmation,
one mandate year, the three legal acknowledgements, typed signer fields and
the signer declaration. Missing customer input is shown next to the action.

Legal-bundle eligibility is not duplicated as a build-time or development
flag. The intent model still records non-CURRENT legal status, while the
server decides whether the active runtime may issue a challenge. One enabled
click issues at most one challenge request and never finalizes. Finalization
still requires the separate OTP confirmation action and every server gate.
Signing input is retained across step navigation while the underlying draft
is unchanged and reset when that draft changes.

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

## 09B2A legal-bundle and OTP architecture decision

Status: DRAFT LEGAL BUNDLE + AUTHORIZED TARGET OTP ARCHITECTURE — NO RUNTIME
IMPLEMENTATION

The 09B2 implementation attempt stopped correctly before schema or runtime
changes because all four legal records were DRAFT/UNKNOWN and no suitable
existing app-scoped signing OTP route existed. 09B2A resolves only the
architecture authorization: one new app-scoped provider-independent OTP
transport behind `SigningOtpTransportPort` may be built in 09B2. Legacy
`mail-worker`, `outbound_emails`, `api-dossier-*` functions and dossier sessions
remain excluded.

The controlled legal decision source is now
`docs/app/legal/signing-legal-bundle-approval.md`. It contains exactly four
customer documents, proposed versions, exact draft text and legal/verifier
risks. 09B2A3 later consolidates every P/T/F/M decision into one canonical
registry and removes superseded alternatives. No source registry record may
become `CURRENT`, effective or hashed until the external live gates are met and
the exact canonical text is frozen.

F-01 through F-15 inside the draft `fee_terms` are now
`APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED`.
This approves the 10/90 calculation, closed direct-external-cost model,
receipt/reconciliation trigger, correction/reversal boundaries, fourteen-day
payout direction and itemized settlement report as commercial direction only.
The `fee_terms` registry record remains DRAFT/unverified; no legal, fiscal,
PSD2/Wft, verifier or runtime status is promoted.

The approved OTP architecture is
`docs/app/architecture/signing-otp-transport.md`. The local adapter will use the
local Supabase mail-testing boundary when explicitly available; production
delivery remains configurable and separately approved. Raw OTP persistence is
forbidden. Hash-only verification, short expiry, limited attempts, one-time
consumption, rate limiting, verified-channel binding and redacted logs remain
mandatory.

The one customer checkbox stays:

`Ik heb de privacyverklaring gelezen en ga akkoord met de algemene voorwaarden en de vergoedingsvoorwaarden.`

It yields three separate future immutable intents:
`privacy_notice_read`, `service_terms_accepted` and
`fee_terms_accepted`. The mandate and account-type-aware signer declaration
remain separate parts of `typed_name_otp_v1`.

The next 09B2 runtime startgate waits on external legal/verifier validation,
entity completion, canonical freeze and a separately authorized implementation
batch. This does not mean runtime exists: no OTP, endpoint, migration, RPC,
evidence, snapshot, hash, acceptance, mandate, customer lock, button or
finalization was built in 09B2A. Foreign trade-register and
jurisdiction-specific authority modules remain post-MVP.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09B2A2 entity, formation, term and mandate decisions

Status: APPROVED TARGET DIRECTIONS — ENTITY DETAILS AND LEGAL/VERIFIER
VALIDATION OPEN — NO RUNTIME IMPLEMENTATION

P-01 and T-01 approve the future ENVAL B.V. as the intended core-service
controller and contracting party. The same future legal entity receives the
customer assignment, manages the service and performs the agreed financial
settlement. Its full statutory name, legal form, KvK number, statutory seat,
correspondence address, general contact and privacy contact remain mandatory
before either document may become CURRENT. A holding, shareholder, software
vendor, partner or verifier is not silently assigned the controller role;
future separate or joint partner roles require legal assessment. Particulier,
Zakelijk and VvE are limited to the approved Dutch MVP definitions, and foreign
enterprises/registers remain post-MVP. A business/VvE signer declaration is
still neither ENVAL authority review nor verifier acceptance.

T-02 fixes contract formation at successful atomic server finalization of the
electronic signature followed by a customer submission confirmation containing
a safe reference. Account/e-mail selection, intake start, document selection or
upload, `confirmed_quarantine`, parser output, fact confirmation, reaching Step
3, clicking confirmations and requesting or sending an OTP do not by themselves
form a contract. The service covers exactly one selected calendar year with no
silent renewal. Later activity is limited to that year's verification, booking,
sale, settlement, corrections/reversals, objection/dispute and required legal,
fiscal, audit or evidence retention. A new year requires new explicit customer
action, the then-current legal bundle, a new snapshot, mandate and signature;
this is neither a subscription nor an ongoing mandate.

M-04 fixes exactly one complete chosen calendar year in each immutable signed
snapshot. Server finalization supplies the issue date. A later year requires a
new mandate/finalization, and no retroactivity is claimed. Legal/verifier
validation remains required for signing after the year started, earlier periods
inside that year, overlap with an existing inboekdienstverlener,
EAN/year exclusivity and verifier acceptance. The current multi-year-capable
model and selector remain
an explicit NOT IMPLEMENTED reconciliation item.

M-06 permits prospective withdrawal through the authenticated dashboard or a
written route with reliable identity verification. The server must record
received date, actor, source and audit context as a new immutable event without
changing original evidence. It must stop new unperformed acts, block quantities
not irreversibly included, preserve lawful historic acts and necessary
legal/fiscal/verifier/audit/evidence records, settle accrued rights and
obligations and create no next-year mandate. Exact effective date, started but
unfinished booking, irreversibility, external notifications and post-withdrawal
retention still require legal/verifier validation and later implementation.

These five decisions do not make any legal record CURRENT, set an effective
date, verify a hash, approve `typed_name_otp_v1` evidence, or build OTP,
snapshot, mandate, withdrawal, finalization, remote or production behavior.
At the 09B2A2 checkpoint all other P, T and M decisions retained their prior
open status; 09B2A3 supersedes that historical state with internally approved
validation directions.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09B2A3 legal consolidation decision

Status: VALIDATION CANDIDATES INTERNALLY APPROVED — EXTERNAL LIVE GATES OPEN —
NO RUNTIME IMPLEMENTATION

`signing-legal-bundle-approval.md` is the single canonical decision source. It
contains each P/T/F/M decision once and exactly four compact documents with the
internal status `VALIDATION CANDIDATE — INTERNALLY APPROVED, NOT CURRENT`.
Their `effective_from` values remain unset and hashes remain unverified.

For the signing boundary, party fields come only from server-canonical facts;
every EAN and linked relevant location must be fixed in the snapshot; issue
date is server finalization; and the evidence pack must bind snapshot/hash,
legal versions/hashes, typed name, separate intents, challenge and verified
channel references, server time, method version and minimized audit metadata.
Raw OTP is forbidden. The method remains a simple electronic-signature target
without an advanced or qualified claim.

Zakelijk/VvE authority is a separate ENVAL review and blocks required
downstream use until sufficient. Joint signing and authority chains remain
post-MVP. Exact permission wording, legal signature sufficiency and written
verifier acceptance remain hard pilot-live gates.

This consolidation changes no registry code, mandate model, selector, OTP
transport, frontend, persistence, endpoint, database, remote or production
state. In particular, the current multi-year-capable model still requires a
later implementation reconciliation to the approved one-year product rule.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
