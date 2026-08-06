# PILOT-SIGNUP-DOCUMENT-DECISION-03 — local proof

Date: 2026-08-04
Scope: local frontend source/model proof plus two local real PDF fixtures
Marker: `signup-document-decision-policy-03-proof-ok`

## Proven locally

- Uploads use one compact responsive card grid and the existing upload slot,
  parser and CSS tokens. Desktop auto-fits cards and mobile collapses to one
  column.
- The customer matrix has exactly the canonical five columns. `Wordt gebruikt`
  is empty until a supported match is confirmed or canonical intent is stated.
- One pure policy emits exactly seven statuses. Normalization is bounded;
  prefix/fuzzy name matching is excluded.
- Contract-holder versus buyer and delivery-address versus invoice-address
  differences remain `review_required`. Confirmation may permit local summary
  progression but the review marker persists.
- Comparable different EAN, MID, serial, same-role party and explicit
  installation/delivery address facts block. Missing and ambiguous facts also
  fail closed.
- Corrections preserve the observed fact and document metadata, use only
  `parser_correction` or `customer_declared_difference`, record frontend
  `confirmedAt`, and remain review-required.
- Real fixtures prove the intended source roles without printing document
  values. Energy supplies EAN; charger invoice supplies charger facts; invoice
  address is not treated as installation location.
- The compact signing preparation keeps Account, Locaties and Documenten, adds
  one charger row per charger, shows review markers and exposes no sign action.

## Commands

Run sequentially from the repository root. Supply fixture paths through
environment variables without printing paths or extracted values.

```sh
deno fmt --check scripts/proofs/app-signup-document-decision-policy.proof.ts
deno check --sloppy-imports scripts/proofs/app-signup-document-decision-policy.proof.ts
ENVAL_EAN_REAL_PDF=/local/energy.pdf ENVAL_CHARGER_REAL_PDF=/local/charger.pdf deno run --sloppy-imports --allow-read --allow-env scripts/proofs/app-signup-document-decision-policy.proof.ts
```

Expected final marker: `signup-document-decision-policy-03-proof-ok`.

## Explicitly not proven

No browser acceptance, upload transport, document persistence, accepted
evidence, server-side canonical decision, identity, authority, canonical
location/EAN/aangeslotene, approved legal or mandate copy, signing, immutable
server snapshot/hash, audit persistence, remote action, deploy, production or
verifier/NEa acceptance is proven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Superseding parser boundary

PILOT-SIGNUP-UNIFIED-DOCUMENT-PARSER-04 supersedes the slot-associated parser
observation wiring used by this proof while preserving the decision policy and
its marker. Both real fixtures now enter one slot-independent observation
envelope and are projected semantically only after content classification.
See `pilot-signup-unified-document-parser-04-local-proof.md` for the new local
proof and fail-closed wrong-document-type contract.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
