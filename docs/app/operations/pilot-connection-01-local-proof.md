# PILOT-CONNECTION-01B Assisted Connection Capture Correction

CURRENT PROVEN — LOCAL ONLY — ASSISTED AND CUSTOMER-CONFIRMED EAN ACQUISITION WITH MANUAL FALLBACK

Date: 2026-07-30.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Proven boundary

An initial signup location can safely proceed without a confirmed EAN. In that
deferred state no `app_connection_declaration_sources` row is created. The
primary signup copy explains that ENVAL obtains connection data after account
activation through an energy bill or available connector and that the customer
must check the result. Manual EAN entry is a secondary action and requires an
exact 18-digit value plus explicit customer confirmation.

`api-app-signup-submit` validates the fields server-side and invokes exactly
one service-role RPC: `app_submit_signup_v5(jsonb)`. V5 calls the unchanged
`app_submit_signup_v4(jsonb)` in the same transaction. It creates or resolves
exactly one immutable `app_connection_declaration_sources` row only when the
location contains a confirmed declaration. It returns the exact existing
public `write_v3` response.

## Upload and parser integration gate

The existing pre-auth `DocumentUploadSlot` keeps selected files in the local
signup draft; signup does not transport those files. Its reusable local
`InvoicePdfPreviewPanel` and `invoicePdfParserAdapter` parse installation
invoices for customer/address/charger/MID observations, but have no EAN
candidate extraction, electricity/gas distinction, multi-candidate contract or
EAN confirmation path. They do provide confidence/limitations, ambiguity and
safe error degradation.

The CURRENT signed upload clients and Edge Functions under
`features/documents` require an authenticated dossier and document slot. The
older dossier-upload endpoints are not the CURRENT `/app` path. Therefore no
safe CURRENT pre-auth energy-bill upload plus EAN-parser preview path exists.
This batch did not create a second upload system. The next bounded integration
batch is authenticated energy-bill/contract intake, EAN candidate extraction
and explicit customer confirmation using the CURRENT document transport.

## Source and truth contract

The purpose-specific source stores typed customer, dossier and dossier-location
references, stable client location ID, customer-confirmed declared EAN, bounded
capture method, confirmation/declaration timestamps and
request/payload/actor/environment provenance.

The CURRENT connection-foundation EAN rule is reused exactly:
`ean_normalized ~ '^[0-9]{18}$'`. This is syntax only; no checksum, registry,
CAR, DSO, ownership or acceptance claim is made. Parser output remains
observed/derived and creates no declared source without explicit confirmation.
Confirmation creates declared truth only, never verified or accepted truth.

`capture_method` is limited to
`energy_document_customer_confirmed` and `manual_customer_confirmed`.
`customer_confirmed_at` equals the server-side declared/source-valid timestamp.
`network_operator_declared`, `claimed_valid_from` and `claimed_valid_to` are
optional and remain null in the current signup path. Network operator is
derived later from EAN/postcode or another competent source and is not
automatically verified. Mandate and calendar-year validity are separate future
truths; no mandate date is stored as a connection period. The location role is
fixed to `connection_service_location`.

The table is update/delete/truncate guarded, RLS-enabled and browser
deny-all. `service_role` receives only `SELECT, INSERT`. Customer, dossier,
location and client-location coupling is checked before insert.

## Atomicity, replay, audit and privacy

V4 business writes, any confirmed connection declaration source, its audit and
idempotency success commit or roll back together. Same-key/same-payload replay
resolves the same source without duplication. Same-key/different-payload returns
`idempotency_conflict`. Deterministic transaction locks and unique
location keys prevent duplicates under real concurrency.

The fail-closed `signup_connection_declaration_recorded` event exists only for
a confirmed declaration and contains only
request/idempotency correlation, opaque customer/dossier/location/source
references, capture method, confirmation flag, created/resolved outcome,
absence flags for operator/period and timestamp.
It contains no raw EAN, address, network-operator text, name, e-mail, JWT or
request payload.

## Apply and proof

The forward-only correction migration was applied exactly once to local container
`supabase_db_enval`, database `postgres`, with `psql -X`,
`--single-transaction` and `ON_ERROR_STOP=1`. V5 was not called against real
local customer data.

`PILOT-CONNECTION-01-Q01` through `PILOT-CONNECTION-01-Q24`: PASS.

End marker:
`signup-connection-declaration-sources-proof-ok`.

The final proof fresh-applied the unchanged base migration plus correction
exactly once as one transaction in one disposable schema-only database. It
proved deferred signup without a source, manual confirmation, unconfirmed and
confirmed parser-candidate boundaries, optional operator/period fields, all
account types, replay, payload conflict, genuine concurrent calls, full
rollback after source/audit failure, safe retry, minimal grants, immutability,
protected-count equality and complete cleanup. Zero disposable databases
remained. The v4 fingerprint stayed unchanged.

The shared signup field/grid/location classes and existing design tokens were
reused. No CSS or inline style was added. The production frontend build and a
visible local browser check are recorded in the batch end report.

## Explicit nonclaims

This is assisted acquisition plus customer declaration capture only. It creates
no accepted canonical
connection or connection version, CAR result, aangeslotene or ownership
decision, accepted canonical location, residence/establishment/party address,
case-confirmed role, mandate, eligibility, profile promotion, evidence
acceptance, kWh, verifier decision or NEa acceptance.

The proof is local only. It makes no remote, deployment or production claim.

## PILOT-SIGNUP-JOURNEY-01 frontend composition addendum — historical

HISTORICAL PARTIAL — SUPERSEDED BY LATER FRONTEND BATCHES.

The protected connection migrations, v4/v5 functions and signup Edge remain
unchanged. The visible frontend order is now Aanvrager, Aansluiting en locatie,
Laadpalen, Aanvullende documenten, and Controleren en afronden.

Assisted EAN and local energy-document selection are independently owned per
location. Energy documents are cross-check sources; charger
installation/acquisition invoices and the existing local charger/MID preview
remain per charger. The zakelijk-rijden document is one dossier-wide
conditional selection.

The read-only review uses the same draft and state-preserving Wijzigen actions.
Current general acceptances are not a definitive mandate. That later
authenticated mandate requires complete scoped facts. kWh remains
dashboard-only and is absent from signup.

Official local TKV SHA-256:
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

## PILOT-SIGNUP-JOURNEY-02 frontend supersession addendum — historical

HISTORICAL PARTIAL — SUPERSEDED BY LATER EAN/CROSSCHECK BATCHES.

The protected PILOT-CONNECTION migrations, v4/v5 functions and signup Edge
remain unchanged. Journey-02 supersedes the uncommitted Journey-01 UI with
Aanvrager, Locatie, Aansluiting, Laadpalen and Ondertekenen.

The active signup UI no longer exposes manual EAN, EAN confirmation,
network-operator or connection-period controls. It retains one local
energy-document selection per location. Aansluiting and Laadpalen share one
location-tab component and active location ID. Charger invoice/preview state
remains per charger.

Additional documents, EAN acquisition/confirmation, kWh and the definitive
immutable signer/party/location/EAN/calendar-year mandate are authenticated
dashboard tasks. General onboarding acceptance is not that mandate.

No migration, SQL, Edge, parser, upload transport, database or remote action
was performed for this frontend supersession.

## PILOT-SIGNUP-EAN-PREFLIGHT-02 corrective frontend addendum

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND PROOF-ONLY REAL PDF.

PRE-01 proved synthetic candidate extraction and correct field ownership, but
did not prove the real contract's stream/font/text-item composition or that
required errors were hidden before a submit attempt. PRE-02 corrects both
evidence gaps.

The existing adapter now decodes the proven Flate-only streams and ToUnicode
font maps, retains page/row context and inserts an explicit column separator.
This prevents the following contract date from being treated as part of the
EAN numeric sequence. A privacy-safe real-file run through the same adapter as
the browser proves exactly two candidates: one electricity and one gas. The
file, raw text, personal fields and candidate values are never printed or
added to the repository.

`submitAttempted=false` keeps visible errors empty while the validator remains
complete. The first invalid CTA click sets the gate, renders every current
field error, focuses/scrolls the first invalid control and returns before
mapping or network access. The idle CTA is not disabled. After the attempt,
live correction removes only resolved or no-longer-applicable errors.

Q01-Q32 and `signup-ean-preflight-02-proof-ok` are green. Source/proof covers
initially hidden errors, zero invalid-click requests, first-field focus,
independent correction and the unique real electricity route. No successful
submit was executed; browser-runtime acceptance remains open.

No backend, package, migration, SQL, RPC, Edge, Storage, OCR, CAR, mandate,
remote, deploy or production action belongs to PRE-02.

## PILOT-SIGNUP-EAN-PREFLIGHT-01 frontend preflight addendum — historical

HISTORICAL PARTIAL — SUPERSEDED BY PRE-02 AND DOCUMENT-CROSSCHECK-02.

The local `File` selected in each location's energy-document draft now runs
through the existing client-side PDF adapter and its existing text extraction.
The additive extractor accepts only exact 18-digit candidates, preserves
compact document context and classifies only explicit electricity/gas labels.
No OCR, second parser, server call or persistence was added.

Each location owns its parser state, selected candidate, manual fallback and
confirmation. Document replacement/removal resets only that location and a
per-location attempt guard rejects stale async results. Parser output remains
observed; an existing declared connection payload is emitted only after
explicit customer confirmation.

Frontend validation now returns stable field paths, shows simultaneous errors
at the corresponding controls and gates the final CTA. The CTA contains no
field-specific error summary and cannot submit an incomplete draft. The
current acceptance shell is not a digital signature or definitive mandate.

The protected connection migrations, v4/v5, signup Edge, intake/quarantine,
document storage/RPCs and database remain unchanged. File persistence,
evidence promotion, signed mandates, e-mail verification, calendar year,
authority, CAR, kWh, remote, deployment and production remain OPEN.

## PILOT-SIGNUP-DOCUMENT-CROSSCHECK-02 frontend parity addendum

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF AND PROOF-ONLY LOCAL PDFS.

The active signup keeps address fields structural and renders house-number
addition through one shared formatter as `28-1`. Addition separators are
comparison syntax only; an unbounded `281` is not guessed apart. The local
energy fixture proves an exact match for the current structured location,
including its addition, without logging the address.

Each location has one EAN source mode. `EAN klopt niet` clears the selected
file, observations, candidates and document confirmation before manual input is
shown. A new energy document clears manual input/confirmation and restarts the
existing parser. Confirmed manual fallback is valid without a hidden document,
and the mapper rejects mixed sources before serialization. The server payload,
Edge function and capture-method strings remain unchanged.

Energy and charger documents reuse the same customer-safe row/card contract and
existing CSS. Charger parser observations are compared with declared MID,
serial, brand, model, address, customer and explicit installation year, but are
not accepted MID evidence or verified charger identity. Invoice date remains
invoice date. No observation prefills or overwrites a declared field.

The parity proof uses one local energy PDF and one local charger invoice only at
runtime. Output consists of PASS markers and
`signup-document-crosscheck-parity-proof-ok`; it contains no fixture values or
full EANs. No browser-runtime, successful submit, database, SQL, RPC, Edge,
Storage, OCR, persistence, remote, deployment or production action is claimed.
