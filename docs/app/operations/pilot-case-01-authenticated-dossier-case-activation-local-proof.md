# PILOT-CASE-01 Authenticated Dossier Case Activation

CURRENT PROVEN — LOCAL ONLY — PILOT-CASE-01 AUTHENTICATED DOSSIER-TO-CASE ACTIVATION AND CUSTOMER-SAFE CASE PROJECTION

Date: 2026-07-29.

## Proven boundary

`app_bootstrap_customer_auth_v2` reuses
`app_bootstrap_customer_auth_v1` inside one database transaction. After the
verified Auth/customer binding succeeds, v2 creates or resolves exactly one
immutable `app_cases` root for every current dossier satisfying
`minimized_at is null` and `status <> 'expired_minimized'`.

The database-authoritative source is exactly
`source_class='app_customer_dossier'` plus the physical text
`source_ref=app_customer_dossiers.id::text`. The unique partial source index
and deterministic advisory lock protect concurrent create-or-resolve. The
public reference is exactly `CASE-<full canonical dossier UUID>`.

Case and activation audit failure roll back Auth binding, case state and
success idempotency together. Replay of the same key/payload creates neither
a second case nor a second activation audit; payload conflict remains
`idempotency_conflict`.

Auth-bootstrap and the write-free dashboard return only the safe dossier
summary with `case_id` and `case_reference`. Dashboard case loading is one
customer-bounded bulkread, never N+1. Frontend clients validate both case
fields without deriving a fallback. The existing selected-dossier state,
document journey and `portal-info-row` presentation are reused; visible copy
is `Zaakreferentie` plus `case_reference`, never `case_id`. No CSS changed.

## Manifest and hashes

| Artifact | SHA-256 |
|---|---|
| `supabase/migrations/20260729140000_app_authenticated_dossier_case_activation.sql` | `66f0a8a494426f70e3673134c2f29664155ff83344385749779aa6d6d26adc30` |
| `scripts/proofs/app-authenticated-dossier-case-activation.proof.ts` | `875c5bae5c72257e9a2f92ac0aa681c68f5d6cad50bbf7b4e3be22d1963cae70` |
| `supabase/functions/api-app-auth-bootstrap/index.ts` | `62b459dffe87b4eeafdd2a60d6c1442d0a124cff4891b7f1265dc676aee1134e` |
| `supabase/functions/api-app-dashboard-get/index.ts` | `7c121c7d38b9bb22e118ba276e1dcb4c96335d6d679eeb73e82427e1e7476f2f` |
| Auth client/types | `55a169787aaae7c2fd09720a74acf417c174c6046358dda18d2ade1a1933da9c` / `7fc5692ab6815c16016dfc1658010ec2838e69ec167cf6857ecd2051aea0cb96` |
| Dashboard client/types/component | `dcf900d7305af1723797f678ec941b36dc85c448ac9b90ab458fe1804653de4a` / `7e9b153c10fa63e77f8db057c82c604366a97bdc164e04c5ddfc17a98bc92c75` / `675d41ed424705059dd1db7522c69eae022087efef755ad37bc19e3fc95fb647` |

The pre-existing v1 migration SHA-256 remains
`c43dc5183a86bc01de4a6e3420f6712eee7c806e9779014da015e7ec0f12e8f0`;
its local `pg_get_functiondef` MD5 remains
`690b68a752ac64b988bb69442dc8d20e`. The reconciled local v2 `prosrc`
SHA-256 is
`957625ff3c0b11ee6e1587481230a1a6c65d27bdeb2ea011e67b1f3d14e57c10`.

The fixed local migration had already been applied before recovery
completion. The exact number of earlier local apply executions is UNKNOWN and
is not used as evidence. The reliable apply evidence is one exact fresh apply
of the definitive migration in the disposable proof database.

## Proof result

`PILOT-CASE-01-Q01` through `PILOT-CASE-01-Q32`: PASS.

End marker:
`authenticated-dossier-case-activation-proof-ok`.

Q13 uses two genuine concurrent `psql` processes. Q16 and Q17 prove full
rollback on case and audit failure. Q32 proves the fresh disposable apply,
protected before/after equality, cleanup and zero remaining disposable
databases. Real local `app_cases=0` and `app_case_party_roles=0` before and
after.

The final green proof run fresh-applied the definitive migration exactly once.
One earlier aborted recovery attempt had also fresh-applied it in a different
disposable database before stopping at a proof-output assertion; its
`finally` cleanup succeeded and that incomplete run is not the proof result.

`deno fmt --check`, `deno check`, the dashboard-client proof, Auth-session
cleanup proof and `app` production build are green. Existing backend Auth and
dashboard proofs were not run because their real-local fixture route would
now create immutable cases that their cleanup contract cannot safely remove.

No established app Playwright/intercept harness can exercise the protected
route without real local population. Browser-live integration therefore
remains OPEN; no browser-runtime claim is made. Source assertions and the
green production build establish browser-ready wiring only.

## Explicit nonclaims

This case root proves only one canonical ENVAL case linked to one current
customer dossier. It proves no party identity, service recipient, case
contact, representation authority, mandate, EAN, aangeslotene, ownership,
location acceptance, MID, evidence acceptance, kWh, eligibility, NEa
acceptance, workforce authority, remote parity or production readiness.

Official local TKV SHA-256:
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
