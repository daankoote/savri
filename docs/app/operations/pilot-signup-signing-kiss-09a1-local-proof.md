# PILOT-SIGNUP-SIGNING-KISS-09A1 local proof

Status: CURRENT PROVEN — LOCAL FRONTEND CONTRACT/PRESENTATION ONLY.

## Proven scope

- Step 3 has exactly four major customer sections.
- The summary checkbox is distinct from evidence acceptance.
- One legal checkbox projects privacy, general-terms and fee-terms actions with
  separate document type, version, language and hash status.
- Preview and download use one self-contained canonical bundle, open safely and
  revoke their browser object URLs.
- Mandate choices use current year plus two; required permission and signer
  declarations are present while organization authority review remains open.
- Tabs, next and back use one immediate scroll/focus transition and preserve
  the existing draft state.

## Verification

Run sequentially from the repository root:

```text
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-signing-kiss.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-signature-core.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-fact-resolution.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-unified-presentation.proof.ts
deno run --allow-read --unstable-sloppy-imports scripts/proofs/app-signup-journey.proof.ts
npm --prefix app run typecheck
npm --prefix app run build
git diff --check
```

The exact 09A1 marker is:

```text
signup-signing-kiss-09a1-proof-ok
```

## Not proven

This proof is not browser acceptance or legal approval. It does not prove a
CURRENT/verified legal version, signature, OTP, immutable evidence, authority,
server timestamp, persistence, audit write, finalization, submit, promotion,
remote, deployment, production or verifier/NEa acceptance.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
