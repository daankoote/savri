# API App Signup Submit Smoke Test

Status: manual proof/smoke contract for `api-app-signup-submit`.

Endpoint placeholder:

`http://localhost:54321/functions/v1/api-app-signup-submit`

## Latest Proof Status

Status: write v1 foundation endpoint proven locally.

Foundation migration proof:

- Full `supabase db reset --local` is blocked by legacy non-baseline migrations for old dossier tables.
- Isolated apply of `20260707151801_app_foundation_schema.sql` against local Postgres succeeded.
- All six app foundation tables exist.
- RLS is enabled on all six real app foundation tables.

Edge runtime proof:

- Docker daemon OK.
- Supabase DB and Kong healthy.
- Edge runtime running.
- `api-app-signup-submit` served locally.

Write v1 proof status:

- `OPTIONS` returned 200.
- Request without `Authorization` returned 401. This is the gateway auth boundary, not an application failure.
- With local anon auth, `GET` returned 405 `method_not_allowed`.
- With local anon auth, `POST` without `Idempotency-Key` returned 400 `missing_idempotency_key`.
- With local anon auth, invalid JSON returned 400 `invalid_json`.
- With local anon auth, missing consent/fee returned 400 `invalid_signup_contract`.
- `deno check supabase/functions/api-app-signup-submit/index.ts` passed.
- With local anon auth, valid payload returned 200 with `ok: true`, `mode: "write_v1"`, `request_id`, `customer_id`, `dossier_id`, and `payload_hash`.
- Replay with the same `Idempotency-Key` and same payload returned the same stored response.
- Reusing the same `Idempotency-Key` with a different payload returned 409 `idempotency_conflict`.
- DB row proof after valid write:
  - `app_customers`: 1
  - `app_customer_identities`: 1
  - `app_customer_dossiers`: 1
  - `app_idempotency_keys`: 1
  - `app_intake_audit_events`: 2
  - `app_audit_events`: 2
- No raw payload or secret output was included in responses or reports.
- Frontend is still not connected.
- Current endpoint mode write_v1 is the proven foundation state.

Interpretation:

- Valid write v1 proves the endpoint runtime, app foundation table access, scoped idempotency, customer matching/creation, identity creation, dossier shell creation, intake audit, and app audit.
- It does not prove production submit readiness.
- It does not create locations/chargers, document slots, document uploads, legal version records, fee terms records beyond minimal accepted flag validation, customer timeline, support/messages, or kWh/result/fee lifecycle rows.
- `/app` frontend wiring remains blocked until the payload mapper, full contract validation, and remaining write phases are implemented.
- Do not paste secrets or `supabase status` output into docs, reports, or commits.

Historical skeleton proof:

- The earlier skeleton mode was proven before write v1.
- Current endpoint mode is `write_v1`.

## 1. Purpose

This document tests the current `api-app-signup-submit` write v1 foundation endpoint and preserves earlier skeleton smoke history.

The endpoint is not a production submit flow yet.

Current boundaries:

- DB-write v1 only.
- Creates/matches a customer.
- Creates an identity row when needed.
- Creates a dossier shell.
- No email.
- No frontend wiring.
- No locations/chargers writes yet.
- No document slots, legal acceptances, customer timeline, support/messages, kWh/result/fee lifecycle, or production deployment.
- Requires the endpoint runtime to be served separately.
- Foundation migration must be applied/tested before write v1 can run.

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

Minimal valid write v1 payload:

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

### 4.6 POST Valid Write V1 Payload

```sh
curl -i -X POST "$URL" \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -H "apikey: <LOCAL_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-valid-write-v1-001" \
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
- Body includes `mode: "write_v1"`.
- Body includes `request_id`.
- Body includes `customer_id`.
- Body includes `dossier_id`.
- Body includes `payload_hash`.
- Body explains the foundation submit was accepted and a dossier shell was created.
- Repeating the same key and same payload should return the same stored response.
- Repeating the same key with a different payload should return 409 `idempotency_conflict`.

## 5. Pass / Fail Expectations

Pass:

- All negative cases return safe customer-facing error bodies.
- Invalid/missing contract cases do not return raw request payloads.
- Valid payload returns `mode: "write_v1"`, `customer_id`, `dossier_id`, and `payload_hash`.
- Valid payload creates a customer/identity/dossier shell.
- Same idempotency key and same payload replays the same stored response.
- Same idempotency key and different payload returns `idempotency_conflict`.

Fail:

- Any response exposes the raw submitted payload.
- Valid write v1 payload does not create locations/chargers, document slots, legal version records, customer timeline, support/messages, or kWh/result/fee lifecycle rows.
- Valid write v1 payload sends email.
- Any smoke response is treated as production dossier creation.
- `/app` is wired to this endpoint before payload mapper and full contract validation are ready.

## 6. Guardrails

- Do not connect /app yet.
- Do not treat write v1 response as full production dossier creation.
- Do not deploy as production submit.
- Do not expose raw payload in response.
- Do not add locations/chargers, document slots, legal acceptances, customer timeline, or lifecycle logic without a separate implementation task.
