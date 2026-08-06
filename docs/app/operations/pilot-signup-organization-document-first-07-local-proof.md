# PILOT-SIGNUP-ORGANIZATION-STEP1-07A — local proof

Date: 2026-08-04
Scope: local parser, frontend state and source proofs with the required real
Dutch KvK PDF; no persistence, backend, database, signing or authority decision
Marker contract: `signup-organization-document-first-07-proof-ok`
Current result: PASS — marker emitted

## Repair result

- The existing PDF adapter remains the only parser entrypoint:
  `parseInvoicePdfInput(input)`.
- The Dutch organization extractor now preserves PDF row/cell position and
  section context instead of flattening every cell into one next-line list.
- Exact mappings are bounded to `KvK-nummer`, `Statutaire naam`, `Rechtsvorm`,
  `Handelsnaam` inside Onderneming/Vestiging, `Bezoekadres`, and the
  `Bestuurder` fields `Naam`, `Titel` and `Bevoegdheid`.
- The real fixture proves all eight mappings with method, page and value hashes;
  the proof prints no document values.
- RSIN, vestigingsnummer, shareholder data, dates and birth date are not used as
  replacement facts. `Directeur` is kept as `directorTitle`, not authority.
- The English alias surface is exact and bounded. The locally available English
  extract is used only as optional deterministic/no-filename regression proof.

## Step 1 and Step 2

- Particulier Step 1 remains account type plus e-mail only.
- Zakelijk/VvE Step 1 adds the compact `KvK-uittreksel` upload and compact
  label/value/action review directly below the account fields.
- Step 1 remains closed until the document exists and organization name, KvK
  number and registered address are confirmed.
- A manual correction retains the observation separately, remains marked
  `ENVAL-controle nodig`, and cannot replace the document requirement.
- Step 2 contains no account KvK upload, KvK column or organization rows under
  a charger. Location and charger grouping were not changed.
- Account-type replacement creates a fresh draft and clears the account PDF,
  observations, confirmations, corrections and canonical organization facts.

## Local proof markers

- `signup-organization-document-first-07-proof-ok`
- `invoice-pdf-parser-adapter-proof-ok`
- `signup-generic-document-facts-05-proof-ok`
- `signup-fact-applicability-summary-06-proof-ok`
- `signup-document-first-ui-proof-ok`
- `signup-journey-proof-ok`
- app typecheck: PASS
- app build: PASS
- `git diff --check`: PASS

The three protected backend hashes remain:

- `c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8`
- `561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25`
- `fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3`

## Commands

```sh
ENVAL_KVK_DUTCH_PDF=/local/230714_KOHOL_KVK.pdf \
  ENVAL_KVK_ENGLISH_PDF=/local/english-register.pdf \
  deno run --allow-env --allow-read --sloppy-imports \
  scripts/proofs/app-signup-organization-document-first.proof.ts
deno eval --sloppy-imports '<run parser adapter proof with local fixture>'
ENVAL_EAN_REAL_PDF=/local/energy.pdf \
  ENVAL_CHARGER_REAL_PDF=/local/charger.pdf \
  deno run --allow-env --allow-read --sloppy-imports \
  scripts/proofs/app-signup-generic-document-facts.proof.ts
ENVAL_EAN_REAL_PDF=/local/energy.pdf \
  ENVAL_CHARGER_REAL_PDF=/local/charger.pdf \
  deno run --allow-env --allow-read --sloppy-imports \
  scripts/proofs/app-signup-fact-applicability-summary.proof.ts
deno run --allow-read --sloppy-imports \
  scripts/proofs/app-signup-document-first-ui.proof.ts
deno run --allow-read --sloppy-imports scripts/proofs/app-signup-journey.proof.ts
cd app && npm run typecheck
cd app && npm run build
git diff --check
```

## Explicitly not proven

No browser acceptance, accepted evidence, canonical party/address truth,
representation authority, legal/mandate approval, signing, immutable snapshot,
audit persistence, backend payload, database/remote action, deploy, production
or verifier/NEa acceptance is proven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
