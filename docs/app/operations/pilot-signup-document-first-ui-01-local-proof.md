# PILOT-SIGNUP-DOCUMENT-FIRST-UI-01 Local Proof

Status: CURRENT PROVEN — LOCAL ONLY — DOCUMENT-FIRST KISS SIGNUP UI AND GAP-DRIVEN CONFIRMATION MODEL

Date: 2026-08-04.

## Proven boundary

The active signup composition has exactly five visible steps: Account,
Documenten, Controleren, Aanvullen and Ondertekenen. Particulier, Zakelijk and
VvE share one account shell and one account-type configuration. The frontend
uses one canonical document-first draft with stable location/charger IDs and
separate properties for documents, parser observations, customer
confirmations, manual corrections, rejected candidates and acceptances.

Documents remain bound to one location or charger. The existing upload slot,
PDF adapter, observation model, EAN candidate extractor, crosschecks, address
model, EAN confirmation control, location tabs and consent surface are reused.
One location hides the tab strip; multiple locations use the existing compact
tabs. A generation plus per-scope attempt guard prevents an old asynchronous
parser result from repopulating reset or replaced draft state.

Controleren uses one presentation-only matrix. Its bounded customer statuses
are `Komt overeen`, `Initiaal en achternaam komen overeen`, `Controle nodig`
and `Bevestigen`; no comparison status is shown before comparison is possible.
Parser output remains observed/derived. Only explicit confirmation, correction,
candidate selection or manual fallback changes declared frontend state.
Aanvullen renders only current selector-produced gaps and removes a gap as soon
as its required value is resolved.

Mapper compatibility remains an adapter from confirmed/manual frontend facts
to the existing draft. No parser observation, matrix or comparison status is
added to the payload. The existing exclusive document/manual EAN assertion is
unchanged. Facts without a current backend destination remain marked
`pendingPersistence` in frontend state.

## Explicitly not proven

- document upload or observation persistence;
- intake finalization, evidence verification or promotion;
- accepted identity, representation, signer authority, EAN/aangeslotene,
  charger/MID or verifier truth;
- final mandate copy, mandate persistence, e-sign evidence or calendar-year
  scope;
- a successful signup submission;
- interactive browser acceptance, remote behavior, deployment or production.

The signing selector therefore remains fail-closed and the final action is not
wired to the submit client. Browser-responsive behavior is supported by the
source/build/CSS model only; no interactive browser run is claimed here.

## Local evidence

- `scripts/proofs/app-signup-document-first-ui.proof.ts`: Q01-Q19 PASS and
  `signup-document-first-ui-proof-ok`;
- `scripts/proofs/app-signup-party-runtime.proof.ts`: Q01-Q21 PASS and
  `signup-party-runtime-04-proof-ok`;
- `scripts/proofs/app-signup-party-name-crosscheck.proof.ts`: Q01-Q24 PASS and
  `signup-party-name-crosscheck-proof-ok`;
- `scripts/proofs/app-signup-ean-preflight.proof.ts`: Q01-Q32 PASS and
  `signup-ean-preflight-02-proof-ok`; real-PDF extension skipped when
  `ENVAL_EAN_REAL_PDF` is not set;
- adjusted `scripts/proofs/app-signup-journey.proof.ts`:
  `signup-journey-proof-ok`;
- mapper, contract-fixture and client unit proofs remain green;
- targeted formatting and Deno check passed; app typecheck and production build
  passed; `git diff --check` passed.

The document-parity and energy-crosscheck proofs retain their fail-closed
real-PDF acceptance gates. With `ENVAL_EAN_REAL_PDF` unset, their deterministic
Q01-Q18 and Q01-Q36 portions respectively pass, while their final real-PDF
claims remain unproven.

## Protected boundary

The protected hashes remain:

- `c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8`;
- `561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25`;
- `fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3`.

No SQL, database, RPC, Auth, Storage, package, staging, commit, push, deploy or
remote action is part of this proof.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Superseded presentation note — 2026-08-04

Review-02 supersedes the five visible steps in this UI-01 snapshot with exactly
Account, Documenten and Ondertekenen. UI-01 remains a regression for canonical
state separation, mapper exclusion, protected hashes and shared component/CSS
reuse. Current real-fixture and signing-summary acceptance is recorded in
`pilot-signup-document-first-review-02-local-proof.md`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
