# PILOT-SIGNUP-FACT-APPLICABILITY-SUMMARY-06 — local proof

Date: 2026-08-04
Scope: local frontend source/model proof and two local real PDF fixtures
Marker: `signup-fact-applicability-summary-06-proof-ok`

## Proven locally

- Generic PDF extraction remains unchanged. One pure non-React selector maps
  account type plus fact key to `required`, `informational` or
  `not_applicable`; parser output is not a requirement source.
- Particulier requires exactly party name, structured address, electricity EAN
  and charger brand/model/MID/serial. Organization name, KvK and gas EAN render
  `Niet nodig`, expose no action and do not block.
- Missing informational supplier, contract and date facts render as absent
  values, expose no action and do not block. Found informational facts remain
  visible and flow to the compact preparation summary without mandatory
  confirmation.
- Zakelijk and VvE require organization name and KvK. Document party name is
  informational and cannot populate a representative, administrator or signer.
  Gas EAN remains not applicable as a dossier requirement.
- An empty address with UI-default country `Nederland` remains
  `required_missing`. It creates no correction, confirmation, canonical value
  or review marker.
- The address editor keeps draft input in component-local state. Cancel clears
  that state. Save accepts only a complete street, house number, postcode and
  city, then creates a separate manual declared correction while preserving
  parser observations and retaining `review_required`.
- The existing summary groups Account, Locaties, Laadpalen, Documenten and
  Aanvullend uit documenten. It shows applicable confirmed canonical facts,
  safe filenames with source/location/charger binding and only informational
  facts actually found.
- Manual summary values show
  `Handmatig aangepast · ENVAL-controle nodig`. Confidence, source page, raw
  context and extraction method are not rendered.
- The six protected parser/semantic pipeline file hashes and three protected
  backend hashes match their startgate values.
- No inline CSS, new stylesheet, signing control, submit path, backend payload,
  database or remote behavior was added.

## Commands

Run sequentially from the repository root. Supply both local fixtures without
printing their paths or extracted values.

```sh
deno fmt --check app/src/features/signup/documentFactApplicability.ts app/src/features/signup/documentFactRegistry.ts app/src/features/signup/structuredAddress.ts app/src/features/signup/documentReviewMatrix.ts app/src/features/signup/DocumentFirstCheckMatrix.tsx app/src/features/signup/DocumentFirstSigningSummary.tsx app/src/features/signup/SignupPageShell.tsx scripts/proofs/app-signup-fact-applicability-summary.proof.ts scripts/proofs/app-signup-generic-document-facts.proof.ts scripts/proofs/app-signup-document-decision-policy.proof.ts scripts/proofs/app-signup-document-first-review.proof.ts scripts/proofs/app-signup-document-first-ui.proof.ts scripts/proofs/app-signup-journey.proof.ts
deno check --sloppy-imports scripts/proofs/app-signup-fact-applicability-summary.proof.ts
ENVAL_EAN_REAL_PDF=/local/energy.pdf ENVAL_CHARGER_REAL_PDF=/local/charger.pdf deno run --sloppy-imports --allow-read --allow-env scripts/proofs/app-signup-fact-applicability-summary.proof.ts
```

Expected marker: `signup-fact-applicability-summary-06-proof-ok`.

## Explicitly not proven

No interactive browser acceptance, broader independent document corpus,
address-lookup availability, accepted evidence, canonical TARGET
identity/location/EAN/charger truth, representation, authority, approved legal
or mandate copy, signing, immutable snapshot/hash, audit persistence, backend
payload change, database/remote action, deploy, production or verifier/NEa
acceptance is proven.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Org-07 supersession note

Org-07 extends the generic fact registry and unified parser, so the six parser
and semantic hashes recorded by this historical Facts-06 report are no longer
current. Facts-06 applicability remains the baseline, extended for required
registered address and informational organization facts. Org-07 has its own
proof and fixture gate; this note does not re-earn the Facts-06 marker.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
