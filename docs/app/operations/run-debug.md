# App Run And Debug Notes

Status: CURRENT operational notes for app backend debugging.

## Boundaries

- Do not print secrets, tokens, JWTs, signed URLs, upload tokens, or runtime config values.
- Label proof as local, remote, production, or browser QA.
- Do not treat local proof as production proof.
- Do not run remote deploy/apply unless explicitly requested.

## First Checks

```bash
git branch --show-current
git log -1 --oneline
git status --short --untracked-files=all
```

## Function Call Discipline

For local Supabase Edge Functions, gateway auth may require local anon headers depending on serve mode.

Use placeholders in docs and reports:

```text
Authorization: Bearer <LOCAL_ANON_KEY>
apikey: <LOCAL_ANON_KEY>
```

Never paste real key values.

## Gateway 401 Versus App Reject

If a request receives 401 before app CORS/error shape appears, treat it as a gateway boundary failure until proven otherwise.

If the function runtime is not reached, the function cannot write app audit events.

## Idempotency

For app write endpoints:

- send `Idempotency-Key`
- same key + same payload should replay the stored response
- same key + different payload should return conflict

Always report whether replay/conflict behavior was tested.

## Document Upload Proof Labels

Use explicit labels:

- upload URL issued
- object uploaded to local storage
- upload confirm called
- server SHA-256 matched
- document version created
- slot current version promoted

Do not call upload complete until confirm and server hash proof succeeded.

## DB/Audit Inspection

Prefer narrow app table inspection:

- `app_customers`
- `app_customer_identities`
- `app_customer_dossiers`
- `app_dossier_document_slots`
- `app_dossier_document_files`
- `app_dossier_document_versions`
- `app_audit_events`
- `app_intake_audit_events`
- `app_idempotency_keys`

Do not mix app proof with legacy `dossier_*` tables unless the task is explicitly a migration/legacy comparison.
