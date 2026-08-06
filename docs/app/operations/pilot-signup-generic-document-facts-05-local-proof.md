# PILOT-SIGNUP-GENERIC-DOCUMENT-FACTS-05 — local proof

Date: 2026-08-04
Scope: local frontend source/model proof, two local real PDF fixtures and one
local generated no-fact PDF
Marker: `signup-generic-document-facts-05-proof-ok`

## Proven locally

- `parseInvoicePdfInput(input)` remains the single technical PDF decode/layout
  entrypoint. Upload slot, location, charger, account type and matrix column are
  not parser or candidate-acceptance inputs.
- Same bytes plus parser version `2026-08-04-unified-document-v4` produce the
  same privacy-safe observation-envelope digest, generic facts and display
  values.
- Both matrix source columns consume the same generic projection. Upload slot
  changes only document/source binding, never value, confidence, extraction
  method, displayability or semantic-role metadata.
- All supported facts are projected independently. Missing values are not
  invented; rejected candidates are treated as not found.
- Explicitly supported roles remain metadata: contract holder, buyer/customer,
  delivery address, invoice address, installation address, connections,
  supplier, period, charger asset and dates. Unknown role stays `unknown`.
- Active signup state, matrix display, confirmation and progression contain no
  document classification, slot compatibility or document-type blocker.
  `documentSlotCompatibility.ts` has no remaining caller and is removed.
- The remaining type-candidate scorer is called only by the parser to populate
  internal descriptive envelope metadata. It exports no customer
  classification function and has no signup caller.
- Missing or rejected matrix values render as `—`, not repeated `Niet
  gevonden`. A parsed PDF with no supported facts renders exactly `Geen
  gegevens gevonden.` at its upload card.
- Required canonical facts are selected after generic extraction by the
  account-type applicability boundary added in Facts-06. For Particulier these
  are name, address, electricity EAN and charger brand/model/MID/serial, plus
  charger-to-location binding. Real material fact conflicts remain
  decision-policy blockers.
- Observations remain browser-local observed/derived state. Corrections,
  confirmations and decisions stay separate and remain excluded from the
  signup submit mapper.
- The energy fixture in both slots and charger fixture in both slots produce
  identical matrix facts per column. The generated no-fact PDF produces an
  empty displayable factset and fail-closed required-fact completeness.
- Proof output contains only the final marker and no fixture paths, extracted
  document values, names, addresses, full EANs, MID, serial or raw PDF text.

## Commands

Run sequentially from the repository root. Supply the two real fixture paths by
environment variable without printing paths or extracted values.

```sh
deno fmt --check app/src/features/invoice-analysis/documentObservationEnvelope.ts app/src/features/invoice-analysis/documentTypeClassifier.ts app/src/features/signup/documentFactRegistry.ts app/src/features/signup/documentSemanticProjector.ts app/src/features/signup/documentReviewMatrix.ts app/src/features/signup/DocumentFirstDocumentsStep.tsx app/src/features/signup/DocumentFirstCheckMatrix.tsx scripts/proofs/app-signup-generic-document-facts.proof.ts
deno check --sloppy-imports scripts/proofs/app-signup-generic-document-facts.proof.ts
ENVAL_EAN_REAL_PDF=/local/energy.pdf ENVAL_CHARGER_REAL_PDF=/local/charger.pdf deno run --sloppy-imports --allow-read --allow-env scripts/proofs/app-signup-generic-document-facts.proof.ts
```

Expected final marker: `signup-generic-document-facts-05-proof-ok`.

## Explicitly not proven

No OCR, broad independent fixture corpus, interactive browser acceptance,
upload transport, document persistence, accepted evidence, canonical TARGET
identity/location/EAN/aangeslotene/charger truth, authorized ENVAL review,
approved legal or mandate copy, signing, immutable server snapshot/hash, audit
persistence, remote action, deploy, production or verifier/NEa acceptance is
proven. Signing and successful submit remain unimplemented.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
