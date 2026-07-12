# API App Signup Submit Smoke Test

Status: manual proof/smoke contract for `api-app-signup-submit`.

Endpoint placeholder:

`http://localhost:54321/functions/v1/api-app-signup-submit`

## Latest Proof Status

Status: write v3 endpoint proven locally.

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

Historical write v1 proof status:

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
- At the write v1 proof point, frontend was still not connected.
- At the write v1 proof point, write v1 was the proven foundation state.

Write v2 proof status:

- `deno check supabase/functions/api-app-signup-submit/index.ts` passed.
- At the write v2 proof point, endpoint response mode was `write_v2`.
- Valid write v2 payload returned `location_count: 1` and `charger_count: 2`.
- Valid write v2 payload created `app_dossier_locations` and `app_dossier_chargers` rows.
- Replay with the same `Idempotency-Key` and same payload returned the same stored response.
- Reusing the same `Idempotency-Key` with a different payload returned 409 `idempotency_conflict`.
- DB proof after the validation run showed the write v2 request created/presented app location and charger rows:
  - `app_dossier_locations` rows were present/created for the valid request.
  - `app_dossier_chargers` rows were present/created for the valid request.
- At the write v2 proof point, frontend was still not connected.

Write v3 proof status:

- `deno check supabase/functions/api-app-signup-submit/index.ts` passed.
- Current endpoint response mode is `write_v3`.
- Valid write v3 payload returned `location_count: 1`, `charger_count: 2`, `document_slot_count: 5`, and `legal_acceptance_count: 2`.
- Valid write v3 payload created/presented `app_dossier_document_slots` and `app_dossier_legal_acceptances` rows.
- Replay with the same `Idempotency-Key` and same payload returned the same stored response.
- Reusing the same `Idempotency-Key` with a different payload returned 409 `idempotency_conflict`.
- DB proof after the validation run showed document slot and legal acceptance rows were present/created for the valid request.
- Frontend submit wiring is now connected locally through the mapper and frontend API client.

Local browser-QA proof status:

- Controlled local browser-QA for `/aanmelden` submit is green after the Vite env resolver fix, Vite restart, and local `api-app-signup-submit` serving.
- Local validation showed `Concept klaar`.
- Browser Network showed OPTIONS 200 and POST 200 to local `api-app-signup-submit`.
- The success panel showed `Aanmelding ontvangen` and displayed Dossier ID.
- The page stayed on `/aanmelden`; no dashboard redirect/bootstrap occurred.
- The path used frontend validation, `mapSignupDraftToSubmitPayload`, `submitSignupPayload`, `api-app-signup-submit` write_v3, and the local Edge Function.
- This is local proof only, not production deployment proof.
- No document upload, storage object, customer timeline, dashboard bootstrap, redirect, or kWh/result/fee lifecycle is implemented yet.
- P0 before production/deploy: treat the previously exposed runtime token/key-like value as leaked and rotate it. Do not print or preserve the value in docs, reports, commits, or chat.

Interpretation:

- Valid write v1 proved the endpoint runtime, app foundation table access, scoped idempotency, customer matching/creation, identity creation, dossier shell creation, intake audit, and app audit.
- Write v2 adds location and charger persistence.
- Write v3 adds expected document slots and legal acceptance records.
- It does not prove production submit readiness.
- It does not create document uploads, storage objects, customer timeline, support/messages, or kWh/result/fee lifecycle rows.
- `/app` frontend submit wiring is implemented locally. Dashboard bootstrap, document upload wiring, customer timeline, support/messages, and kWh/result/fee lifecycle remain separate open phases.
- Do not paste secrets or `supabase status` output into docs, reports, or commits.

Historical skeleton proof:

- The earlier skeleton mode was proven before write v1.
- Current endpoint mode is `write_v3`.

## 1. Purpose

This document tests the current `api-app-signup-submit` write v3 endpoint and preserves earlier skeleton/write v1/write v2 smoke history.

The endpoint is not a production submit flow yet.

Current boundaries:

- DB-write v3 only.
- Creates/matches a customer.
- Creates an identity row when needed.
- Creates a dossier shell.
- Creates locations.
- Creates chargers.
- Creates expected document slots.
- Creates legal acceptance records.
- No email.
- Frontend `/aanmelden` submit wiring exists locally.
- No document upload processing, storage object writes, customer timeline, support/messages, kWh/result/fee lifecycle, or production deployment.
- Requires the endpoint runtime to be served separately.
- Foundation, locations/chargers, and document/legal slots migrations must be applied/tested before write v3 can run.

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

Minimal valid write v3 payload:

```json
{
  "accountType": "particulier",
  "applicant": {
    "email": "test@example.com",
    "address": {
      "postcode": "2042PC",
      "houseNumber": "65",
      "street": "Kostverlorenstraat",
      "city": "Zandvoort",
      "country": "Nederland"
    }
  },
  "consentBundleAcceptance": { "accepted": true },
  "feeTermsAcceptance": { "accepted": true },
  "chargers": [
    {
      "clientChargerId": "charger-1",
      "brand": "1",
      "model": "1",
      "serialNumber": "TEST-001",
      "midNumber": "MID-001"
    }
  ]
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

### 4.6 POST Valid Write V3 Payload

```sh
curl -i -X POST "$URL" \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -H "apikey: <LOCAL_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-valid-write-v3-001" \
  --data '{
    "accountType": "particulier",
    "applicant": {
      "email": "test@example.com",
      "address": {
        "postcode": "2042PC",
        "houseNumber": "65",
        "street": "Kostverlorenstraat",
        "city": "Zandvoort",
        "country": "Nederland"
      }
    },
    "consentBundleAcceptance": { "accepted": true },
    "feeTermsAcceptance": { "accepted": true },
    "chargers": [
      {
        "clientChargerId": "charger-1",
        "brand": "1",
        "model": "1",
        "serialNumber": "TEST-001",
        "midNumber": "MID-001"
      }
    ]
  }'
```

Expected:

- HTTP 200.
- Body includes `ok: true`.
- Body includes `mode: "write_v3"`.
- Body includes `request_id`.
- Body includes `customer_id`.
- Body includes `dossier_id`.
- Body includes `location_count`.
- Body includes `charger_count`.
- Body includes `document_slot_count`.
- Body includes `legal_acceptance_count`.
- Body includes `payload_hash`.
- Body explains the foundation submit was accepted and a dossier shell, locations, chargers, document slots, and legal acceptances were created.
- Repeating the same key and same payload should return the same stored response.
- Repeating the same key with a different payload should return 409 `idempotency_conflict`.

## 5. Pass / Fail Expectations

Pass:

- All negative cases return safe customer-facing error bodies.
- Invalid/missing contract cases do not return raw request payloads.
- Valid payload returns `mode: "write_v3"`, `customer_id`, `dossier_id`, `location_count`, `charger_count`, `document_slot_count`, `legal_acceptance_count`, and `payload_hash`.
- Valid payload creates a customer/identity/dossier shell plus location, charger, expected document slot, and legal acceptance rows.
- Same idempotency key and same payload replays the same stored response.
- Same idempotency key and different payload returns `idempotency_conflict`.

Fail:

- Any response exposes the raw submitted payload.
- Valid write v3 payload creates document uploads, storage objects, customer timeline, support/messages, or kWh/result/fee lifecycle rows.
- Valid write v3 payload sends email.
- Any smoke response is treated as production dossier creation.
- The frontend submit result is treated as dashboard bootstrap, production deployment, or complete document-upload lifecycle.

## 6. Guardrails

- `/app` submit is connected locally, but do not treat it as dashboard bootstrap, upload processing, or production deployment.
- Do not treat write v3 response as full production dossier creation.
- Do not deploy as production submit.
- Do not expose raw payload in response.
- Do not add document upload processing, storage object writes, customer timeline, or lifecycle logic without a separate implementation task.
