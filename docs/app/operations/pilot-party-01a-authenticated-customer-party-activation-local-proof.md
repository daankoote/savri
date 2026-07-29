# PILOT-PARTY-01A Authenticated Customer Party Activation

CURRENT PROVEN — LOCAL ONLY — PILOT-PARTY-01A AUTHENTICATED CUSTOMER-TO-PARTY ROOT ACTIVATION

Date: 2026-07-29.

## Proven boundary

`app_bootstrap_customer_auth_v3` calls the unchanged v2 Auth/case bootstrap
inside one transaction. After v2 succeeds, v3 creates or resolves exactly one
canonical `app_parties` root and one current
`app_customer_party_relationships.account_owner` link for the current
customer. The link is the existing WP2A account/service relationship and is
not legal identity, case participation, representation authority or mandate.

Canonical batch provenance is
`source_type='authenticated_customer_party_root'`,
`source_reference_type='app_customer'` and the customer UUID as text. A
partial unique source index plus a deterministic customer advisory lock
enforces concurrency-safe create-or-resolve. One valid current binding is
reused. Duplicate, non-current, cross-customer or kind-conflicting truth fails
closed.

The exact mapping is:

| current account type | party kind |
|---|---|
| `particulier` | `natural_person` |
| `zakelijk` | `organization` |
| `vve` | `organization` |

No person/organization profile version, name, address, identifier,
`app_case_party_roles`, service recipient, case contact, authority or mandate
row is created.

## Implementation manifest and hashes

| Artifact | SHA-256 |
|---|---|
| `supabase/migrations/20260729180000_app_authenticated_customer_party_activation.sql` | `3cecb481c0e8182d21454fea47030fb9bb5d3bb100511636d5d22dc4ec8b023d` |
| `scripts/proofs/app-authenticated-customer-party-activation.proof.ts` | `9ef631f545df82f0d07b21d0f0c6cd2035a9ca4e0babaa0c232a70d72baed5fa` |
| `supabase/functions/api-app-auth-bootstrap/index.ts` | `d59e52b1c41b7d9940756a1c70df07f8e22d7803024096e33ed23914c3f1ba7b` |

V1 migration SHA-256 remains
`c43dc5183a86bc01de4a6e3420f6712eee7c806e9779014da015e7ec0f12e8f0`
and its local function-definition MD5 remains
`690b68a752ac64b988bb69442dc8d20e`. V2 migration SHA-256 remains
`66f0a8a494426f70e3673134c2f29664155ff83344385749779aa6d6d26adc30`
and its local function-definition MD5 remains
`56d1d4b8fc016bb4435e00cea077dc1d`.

The v3 identity signature is
`public.app_bootstrap_customer_auth_v3(uuid,text,text,text,text,text,text,text,text,text)`.
Its local function-definition MD5 is
`fa10dbbd12ae110d8368679fdcda1113`; its `prosrc` SHA-256 is
`c2c45ea8a20e0f7dd165fea131f8fc911beb14855b56dbbeb605e17927c07814`.
It is `SECURITY DEFINER`, has empty `search_path`, grants execute only to
`service_role` and denies `PUBLIC`, `anon` and `authenticated`.

The Edge Function changed only its RPC target from v2 to v3. The public
response remains the exact v2 safe shape/mode and exposes no party, source,
profile, relationship, role or authority internal. No frontend or CSS changed.

## Apply and proof

The definitive migration was applied to local container
`supabase_db_enval`, database `postgres`, using `psql -X`,
`--single-transaction` and `ON_ERROR_STOP=1`. V3 was not invoked against real
local customer data.

`PILOT-PARTY-01A-Q01` through `PILOT-PARTY-01A-Q18`: PASS.

End marker:
`authenticated-customer-party-activation-proof-ok`.

Q13 uses two genuine concurrent `psql` processes. Q14-Q16 prove existing
binding resolution, ambiguity rejection and full party/audit failure
rollback. Q18 proves exactly one fresh migration apply in the disposable
database, protected before/after equality, cleanup and zero remaining
disposable databases.

Real local counts before and after remained:

| Table | Before | After |
|---|---:|---:|
| `app_parties` | 0 | 0 |
| `app_customer_party_relationships` | 0 | 0 |
| `app_party_person_versions` | 0 | 0 |
| `app_party_organization_versions` | 0 | 0 |
| `app_cases` | 0 | 0 |
| `app_case_party_roles` | 0 | 0 |

## Explicit nonclaims

This proof establishes local internal root/account linkage only. It proves no
profile fact, legal identity, identifier, service recipient, case contact,
representation authority, mandate, EAN/aangeslotene, location, evidence,
kWh, eligibility, browser runtime, remote parity, production readiness,
NEa acceptance or verifier acceptance.

Official local TKV SHA-256:
`f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
