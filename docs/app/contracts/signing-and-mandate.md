# Signing And Mandate Contract

Status: MIXED — `typed_name_otp_v1` SIGNING AND 09C1A/B/C POST-SIGNING HANDOFF CURRENT PROVEN LOCALLY; PRODUCTION LEGAL/OTP NOT CURRENT

Strategic status overlay (DECIDED/TARGET, 2026-09-01): the signing mechanics
and CURRENT PROVEN local evidence retain their status. The former fixed ENVAL
B.V. controller/contracting-party and 90/10 bundle direction is SUPERSEDED as
a generic platform default. Future legal documents, fees and signing bundles
resolve from the tenant's approved identity/configuration.
Controller/processor allocation remains TARGET LEGAL REVIEW.

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

## 09C1C-R1 post-signing account guidance

CURRENT PROVEN — LOCAL ONLY. Only after the signing challenge is delivered,
consumed and bound to immutable finalization may the server project whether
the controlled e-mail should log in, activate an account, continue directly
with an already verified session or stop on ambiguity. Collecting/challenge
responses expose no account-existence signal. This guidance grants no customer,
case, mandate or representation authority and is presentation-cached only.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## 09B2C signed submission receipt

The atomic server finalization and immutable records remain the only core
truth. A successful `submitted_for_review` response may create one same-tab
presentation receipt with schema `signup-submission-receipt-v2`, the safe
public `SIG-...` reference, status and safe promotion presentation state only. The receipt grants no capability
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

`app_signup_signing_status_v2` is service-role-only and requires both the
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

CURRENT database truth is `submitted_for_review`: finalized, locked and awaiting
ENVAL internal handling. 09C1A migrated old stored rows and all new database
writes; 09C1C removes the temporary frontend discriminator and versions the
presentation receipt instead of silently changing v1. Customer
copy remains `Ondertekend en ingediend`; external verifier states remain in a
separate future bounded context.

The exact atomic case-owned promotion and evidence/Auth/dashboard boundaries
are canonical in `intake-verification-promotion.md`. Signing snapshots, legal
acceptances, mandate and signature evidence are linked by the CURRENT local
09C1A service-only promotion RPC and never rewritten or duplicated. 09C1B
Storage/Edge orchestration and 09C1C Auth/dashboard handoff are CURRENT PROVEN
locally; production configuration, review and external verification remain TARGET.

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

## Wave A1 authoritative finalization and replay

Status: `CURRENT PROVEN — LOCAL ONLY` through commits `5dfaed1` and `4f0542f`.

The Edge Function owns only request parsing, verified authentication,
caller/intake/capability/provenance authorization and binding, canonical
immutable input/fingerprint construction, RPC invocation/orchestration and safe
response mapping. It performs no direct `app_idempotency_keys` query and does
not duplicate confirmed-file readiness or other mutable signing business-state
validation owned by the database.

`app_signup_signing_finalize_v1`, invoked through v2, is the single authority
for idempotency lookup, same-request replay, idempotency conflict,
first-finalization mutable readiness, OTP validation and consumption,
finalization and immutable signed-snapshot persistence. The effective order is:

```text
request parsing
→ verified Auth
→ caller/intake/capability/provenance authorization and context binding
→ canonical immutable input and fingerprint construction
→ authoritative finalize RPC
→ exact persisted replay
  OR first-finalization mutable validation and mutation
```

No persisted response is disclosed from an idempotency key, intake reference,
signing reference, request ID or capability alone. Exact authenticated replay
returns the original logical result and preserves signing reference, snapshot
hash and server timestamp while creating zero new finalization/snapshot writes
and consuming no OTP twice. A changed canonical payload with the same key
returns `idempotency_conflict`; unauthorized replay fails closed.

The private clean Wave A1 qualification continues through exact-case workforce
review, the deliberate 10-subject/8-unique-key contract, `REVIEW_COMPLETE`,
refresh/resume, audit lineage, disposable cleanup and retained real-pilot
invariance. The signing runtime regression is `14/14 PASS`; Q04's prior failure
was proof-fixture-only, and the deterministic one-clock fixture proves the
unchanged product expiry path returns `otp_expired`.

This authority and evidence are local only. TF02-B / commit `9f9f310` now
provides the CURRENT PROVEN LOCAL versioned tenant-configuration descriptor and
safe static selection foundation, but signing does not consume it. The current
ENVAL B.V./legal-bundle/mandate/10/90 assumptions and OTP/provider settings are
unchanged known debt, not tenantized values. A later bounded signing cutover
must consume durable approved tenant revisions and pin exact operator,
legal-bundle, fee and provider/configuration provenance without rewriting
historical signed evidence.

Production legal/OTP/Auth, real approved tenant content and signing cutover,
tenant #2 and cross-tenant isolation, independent verifier/NEa acceptance, REV
operations, third-party checks, parser/kWh qualification and A2/A3/A4 remain
unproven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

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

P-01 and T-01's former fixed ENVAL B.V. direction is SUPERSEDED as a generic
default. The resolved tenant's approved legal identity is the prospective
operator/customer contract party; purpose-specific controller/processor and
any ENVAL Software role require legal assessment. Full applicable statutory
and contact details remain mandatory before a bundle may become CURRENT. A
brand, holding, shareholder, software vendor, partner or verifier is never
silently assigned a legal or privacy role. Particulier,
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
