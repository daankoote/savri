# API App Signup Submit Smoke Test

Status: manual smoke-test contract for `api-app-signup-submit`.

Endpoint placeholder:

`http://localhost:54321/functions/v1/api-app-signup-submit`

## 1. Purpose

This document tests the current `api-app-signup-submit` skeleton contract only.

The endpoint is not a production submit flow.

Current boundaries:

- Contract/smoke only.
- No DB writes.
- No customer creation.
- No dossier creation.
- No email.
- No frontend wiring.
- Requires the endpoint runtime to be served separately.
- Foundation migration must be applied/tested before production writes are enabled.

## 2. Local Serving Note

Local Supabase function serving may require Docker and the Supabase local stack, depending on workflow.

Do not assume Docker is available.

Optional local flow, only when the local Supabase function runtime is available:

```sh
supabase functions serve api-app-signup-submit
```

Direct `deno run` is not the canonical local workflow for Supabase Edge Functions in this repo. Use it only for isolated experimentation if the import/runtime setup is understood.

Local development may require anon-key headers depending on serve mode. Do not paste real keys into docs or commits.

Use placeholders only:

```sh
-H "Authorization: Bearer <LOCAL_ANON_KEY>"
-H "apikey: <LOCAL_ANON_KEY>"
```

## 3. Payload Fixture

Minimal valid skeleton payload:

```json
{
  "accountType": "particulier",
  "applicant": { "email": "test@example.com" },
  "consentBundleAcceptance": { "accepted": true },
  "feeTermsAcceptance": { "accepted": true },
  "chargers": []
}
```

## 4. Test Cases

Set the endpoint URL:

```sh
URL="http://localhost:54321/functions/v1/api-app-signup-submit"
```

### 4.1 OPTIONS

```sh
curl -i -X OPTIONS "$URL" \
  -H "Origin: http://localhost:5175" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, apikey, content-type, idempotency-key"
```

Expected:

- HTTP 200.
- CORS headers are present.
- Body may be `ok`.

### 4.2 GET Is Not Allowed

```sh
curl -i -X GET "$URL" \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -H "apikey: <LOCAL_ANON_KEY>"
```

Expected:

- HTTP 405.
- Body includes `ok: false`.
- Body includes `code: "method_not_allowed"`.

### 4.3 POST Without Idempotency-Key

```sh
curl -i -X POST "$URL" \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -H "apikey: <LOCAL_ANON_KEY>" \
  -H "Content-Type: application/json" \
  --data '{"accountType":"particulier"}'
```

Expected:

- HTTP 400.
- Body includes `ok: false`.
- Body includes `code: "missing_idempotency_key"`.

### 4.4 POST Invalid JSON

```sh
curl -i -X POST "$URL" \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -H "apikey: <LOCAL_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-invalid-json-001" \
  --data '{"accountType":'
```

Expected:

- HTTP 400.
- Body includes `ok: false`.
- Body includes `code: "invalid_json"`.

### 4.5 POST Missing Consent/Fee

```sh
curl -i -X POST "$URL" \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -H "apikey: <LOCAL_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-invalid-contract-001" \
  --data '{
    "accountType": "particulier",
    "applicant": { "email": "test@example.com" },
    "chargers": []
  }'
```

Expected:

- HTTP 400.
- Body includes `ok: false`.
- Body includes `code: "invalid_signup_contract"`.

### 4.6 POST Valid Skeleton Payload

```sh
curl -i -X POST "$URL" \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -H "apikey: <LOCAL_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-valid-skeleton-001" \
  --data '{
    "accountType": "particulier",
    "applicant": { "email": "test@example.com" },
    "consentBundleAcceptance": { "accepted": true },
    "feeTermsAcceptance": { "accepted": true },
    "chargers": []
  }'
```

Expected:

- HTTP 200.
- Body includes `ok: true`.
- Body includes `mode: "skeleton"`.
- Body includes `request_id`.
- Body includes `payload_hash`.
- Body includes a smoke message explaining the backend contract is present but not wired to production submit yet.

## 5. Pass / Fail Expectations

Pass:

- All negative cases return safe customer-facing error bodies.
- Invalid/missing contract cases do not return raw request payloads.
- Valid skeleton payload returns `mode: "skeleton"` and `payload_hash`.
- No DB rows are expected or required.
- No customer or dossier is created.

Fail:

- Any response exposes the raw submitted payload.
- Valid skeleton payload creates database state.
- Valid skeleton payload sends email.
- Any smoke response is treated as production dossier creation.
- `/app` is wired to this endpoint before production-write readiness.

## 6. Guardrails

- Do not connect /app yet.
- Do not treat skeleton response as dossier creation.
- Do not deploy as production submit.
- Do not expose raw payload in response.
- Do not continue to DB writes until Foundation migration has been applied/tested.
- Do not add business logic to this endpoint during smoke-test documentation work.

