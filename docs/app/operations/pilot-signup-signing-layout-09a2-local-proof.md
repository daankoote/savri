# PILOT-SIGNUP-SIGNING-LAYOUT-09A2 local proof

Status: CURRENT PROVEN — LOCAL FRONTEND PRESENTATION ONLY.

## Proven scope

- One existing `DocumentFirstSigningSummary` renders the complete Step 3.
- Account and Documents use the shared document-mode `FactTable` with exactly
  two customer columns.
- Each location owns a bounded horizontal rail with its stable-ID-linked
  chargers; projected global charger numbering is retained.
- Document binding is part of `Documentsoort`, not a third column.
- Machtiging, Voorwaarden en privacy and Ondertekening share one responsive
  three-block composition.
- Step 3 has three customer confirmations total and no mandate checkbox.
- Signer-name normalization reuses the existing signup helper on blur.
- No primary signing action, OTP, readiness or success state is rendered.

## Verification

Run the targeted sequence from the repository root:

```text
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-signing-layout.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-signing-kiss.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-signature-core.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-unified-presentation.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-journey.proof.ts
npm --prefix app run typecheck
npm --prefix app run build
git diff --check
```

Exact marker:

```text
signup-signing-layout-09a2-proof-ok
```

## Not proven

This is not interactive browser acceptance and does not implement or prove a
signature, OTP, legal approval, immutable evidence, authority outcome,
persistence, audit write, submit, finalization, remote, deployment, production
or verifier/NEa acceptance. The working primary action remains 09B scope.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
