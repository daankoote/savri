# PILOT-SIGNUP-UNIFIED-DOCUMENT-PARSER-04 — local proof

Date: 2026-08-04
Scope: local frontend source/model proof plus two local real PDF fixtures
Marker: `signup-unified-document-parser-04-proof-ok`
Status: historical technical-pipeline proof; active customer type-gating was
removed by PILOT-SIGNUP-GENERIC-DOCUMENT-FACTS-05.

## Proven locally

- `parseInvoicePdfInput(input)` is the single active PDF decode/layout
  entrypoint for both upload slots. It accepts no slot, expected family,
  signup ID, account type or matrix context.
- Same bytes plus parser version
  `2026-08-04-unified-document-v4` produce the same canonical privacy-safe
  observation-envelope digest and generic facts.
- The envelope contains parser version, SHA-256 content fingerprint, page
  count, document-type candidates, generic fact candidates, extraction
  warnings and internally rejected candidates. It contains no UI,
  confirmation, decision or compatibility state. Descriptive type-candidate
  scores are internal metadata only.
- A separate pure projector applies contract-holder, buyer/customer, delivery,
  invoice, explicit installation, connection, supplier, period, charger-asset
  and date roles without parsing PDF text again.
- The former customer-facing classification and compatibility assertions are
  obsolete. The updated proof now establishes that active customer callers do
  not consume classification or slot compatibility.
- Observations are cached by document/client ID with content fingerprint and
  parser version. Replacing or removing that document invalidates its cache and
  dependent local confirmations/corrections only.
- The real fixtures prove identical documents retain identical envelope and
  generic-fact digests across source columns. Facts-05 owns the complete active
  matrix/completeness proof. Output omits extracted values, fixture paths and
  full EANs.
- Parser output remains observed/derived. Declarations, corrections,
  confirmations and decisions remain separate and are excluded from the
  signup submit mapper.

## Commands

Run sequentially from the repository root. Supply both local fixture paths by
environment variable without printing paths or extracted values.

```sh
deno fmt --check app/src/features/invoice-analysis/documentObservationEnvelope.ts app/src/features/invoice-analysis/documentTypeClassifier.ts app/src/features/signup/documentSemanticProjector.ts scripts/proofs/app-signup-unified-document-parser.proof.ts
deno check --sloppy-imports scripts/proofs/app-signup-unified-document-parser.proof.ts
ENVAL_EAN_REAL_PDF=/local/energy.pdf ENVAL_CHARGER_REAL_PDF=/local/charger.pdf deno run --sloppy-imports --allow-read --allow-env scripts/proofs/app-signup-unified-document-parser.proof.ts
```

Expected final marker: `signup-unified-document-parser-04-proof-ok`.

Active customer behavior and its proof marker are documented in
`pilot-signup-generic-document-facts-05-local-proof.md`.

## Explicitly not proven

No OCR, broad independent fixture corpus, interactive browser acceptance,
upload transport, document persistence, accepted evidence, canonical TARGET
identity/location/EAN/aangeslotene/charger truth, authorized ENVAL review,
approved legal or mandate copy, signing, immutable server snapshot/hash, audit
persistence, remote action, deploy, production or verifier/NEa acceptance is
proven. Signing and successful submit remain unimplemented.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
