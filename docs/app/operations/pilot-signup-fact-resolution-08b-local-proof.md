# Pilot signup fact resolution 08B — local proof

Status: CURRENT LOCAL FRONTEND PROOF. REAL KVK FIXTURE GATES BLOCKED.

## Scope

This checkpoint proves one browser-local fact resolution contract for Account,
locations and chargers. It changes no parser semantics, submit mapper, backend,
database, remote environment or deployment.

The central states and customer judgments are:

| State | Customer judgment | Color | Required-row progression |
| --- | --- | --- | --- |
| `pending` | empty | neutral | blocked |
| `confirmed` | `Bevestigd` | green | allowed |
| `review_required` | `ENVAL-controle nodig` | orange | allowed |
| `blocked` | `Kan niet worden ingediend` | red | blocked |

Informational rows never gate progression. Missing informational facts remain
hidden. A confirmation records customer intent only and does not create another
source observation.

## Proven behavior

- One observed value requires confirmation; correction remains orange.
- Two distinct documents with the same normalized value may confirm; the same
  bytes in two bindings remain one document identity.
- A document conflict is red until a choice is made; the selected resolution
  remains orange and all original observations remain visible.
- A valid manual value without a document is orange; invalid or unresolved
  required input is red.
- Natural-person and organization names follow separate bounded matching rules.
  Structured address matching uses postcode, house number and suffix.
- The review surface has exactly five columns. Correction is a compact shared
  editor; address input has postcode, house number and suffix plus a read-only
  lookup preview.
- Location and charger tables are sibling sections in stable location order.

## Targeted commands

```sh
deno run --unstable-sloppy-imports --allow-read scripts/proofs/app-signup-fact-resolution.proof.ts
deno run --unstable-sloppy-imports --allow-read scripts/proofs/app-signup-unified-presentation.proof.ts
ENVAL_ENERGY_PDF=/private/tmp/enval_energy_proof.pdf ENVAL_CHARGER_PDF=/private/tmp/enval_charger_proof.pdf deno run --unstable-sloppy-imports --allow-read --allow-env scripts/proofs/app-signup-document-decision-policy.proof.ts
deno run --unstable-sloppy-imports --allow-read scripts/proofs/app-signup-document-first-ui.proof.ts
deno run --unstable-sloppy-imports --allow-read scripts/proofs/app-signup-journey.proof.ts
ENVAL_KVK_DUTCH_PDF=/absolute/path/to/intended-dutch-kvk.pdf ENVAL_KVK_ENGLISH_PDF=/absolute/path/to/intended-english-kvk.pdf deno run --unstable-sloppy-imports --allow-read --allow-env scripts/proofs/app-signup-organization-document-first.proof.ts
npm --prefix app run typecheck
npm --prefix app run build
git diff --check
```

The fact-resolution marker is
`signup-fact-resolution-08b-proof-ok`. The unified-presentation, decision, UI
and journey regressions also pass locally.

## Real-fixture blockers

`ENGLISH_KVK_FIXTURE=BLOCKED`. A focused filename/content search in Downloads,
Desktop and Documents plus the single permitted metadata fallback found no
intended English KvK PDF. No English parser expectation was inferred and no
parser change was made. To rerun, place the intended PDF in one of those roots
and set `ENVAL_KVK_ENGLISH_PDF` to its absolute path.

The available local Dutch PDF was tried separately and fails with
`Nederlandse fixture mist exact organizationName`. Supply the intended
privacy-safe standalone Dutch extract and set `ENVAL_KVK_DUTCH_PDF` to its
absolute path.

These fixture blockers do not invalidate the state-machine/source-preservation
proof, but the Org-07 real-fixture marker is not earned. Browser acceptance,
evidence acceptance, signing, immutable snapshot, persistence, backend, remote,
deploy, production and verifier/NEa acceptance remain open.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
