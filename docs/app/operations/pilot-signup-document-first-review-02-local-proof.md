# PILOT-SIGNUP-DOCUMENT-FIRST-REVIEW-02 — local proof

Date: 2026-08-04
Scope: local frontend source/model proof plus two local real PDF fixtures
Marker: `signup-document-first-review-02-proof-ok`

## Proven locally

- The visible journey is exactly Account, Documenten and Ondertekenen.
- Step 2 owns upload, local parsing, seven required review rows, ambiguity,
  missing values, inline correction/replacement and explicit confirmation.
- One registry carries supported energy and charger facts with source, semantic
  role, extraction status, internal confidence/page and rejection metadata. The
  customer matrix does not expose that technical metadata.
- Real energy and charger fixtures parse through the existing adapter. Their
  party and address observations differ by semantic role and therefore require
  persistent ENVAL review; proof output contains neither concrete document
  values nor full EANs.
- Manual correction preserves the observation, records document dependency,
  correction type and frontend confirmation time. Customer intent may close
  the local progression blocker but cannot erase `review_required`. Replacing
  a document invalidates only dependent corrections and confirmations.
- Step 3 renders confirmed canonical facts and safe linked-document tokens only.
  The unavailable sign action is hidden.

## Commands

Run sequentially from the repository root. Supply the two local fixture paths
through environment variables; do not print paths or extracted values.

```sh
deno fmt --check scripts/proofs/app-signup-document-first-review.proof.ts
deno check --sloppy-imports scripts/proofs/app-signup-document-first-review.proof.ts
ENVAL_EAN_REAL_PDF=/local/energy.pdf ENVAL_CHARGER_REAL_PDF=/local/charger.pdf deno run --sloppy-imports --allow-read --allow-env scripts/proofs/app-signup-document-first-review.proof.ts
```

Expected final marker: `signup-document-first-review-02-proof-ok`.

## Explicitly not proven

No browser acceptance, upload transport, document persistence, accepted
evidence, identity, authority, canonical location/EAN/aangeslotene, approved
legal or mandate copy, working signature, immutable server snapshot/hash,
remote action, deploy, production or verifier/NEa acceptance is proven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
