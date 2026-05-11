# scripts/tests/08_export_contract.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== EXPORT CONTRACT TESTS =="

FN_EXPORT="$SUPABASE_URL/functions/v1/api-dossier-export"
FN_ADDRESS="$SUPABASE_URL/functions/v1/api-dossier-address-save"
FN_CONSENTS="$SUPABASE_URL/functions/v1/api-dossier-consents-save"
FN_VERIFY="$SUPABASE_URL/functions/v1/api-dossier-verify"
FN_EVALUATE="$SUPABASE_URL/functions/v1/api-dossier-evaluate"
FN_LEAD="$SUPABASE_URL/functions/v1/api-lead-submit"
FN_CHARGER_SAVE="$SUPABASE_URL/functions/v1/api-dossier-charger-save"
FN_UPLOAD_URL="$SUPABASE_URL/functions/v1/api-dossier-upload-url"
FN_UPLOAD_CONFIRM="$SUPABASE_URL/functions/v1/api-dossier-upload-confirm"

if [[ -z "${FN_EXPORT:-}" || "$FN_EXPORT" == "/functions/v1/api-dossier-export" ]]; then
  echo "FATAL: FN_EXPORT empty or SUPABASE_URL missing. SUPABASE_URL='${SUPABASE_URL:-}'"
  exit 1
fi

require_dossier_session_token

# -------------------------------------------------------------------
# 1) PRE-LOCK EXPORT REJECT
# -------------------------------------------------------------------
echo ""
echo "1) REJECT — export on not-locked dossier"
echo "------------------------------------------------"

rid="export-not-locked-$(now_ts)"
echo "request_id: $rid"
echo ""

RESP="$(http_call_with_idem \
  "$FN_EXPORT" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\"}" \
  "$rid")"

HTTP="$(extract_http_status "$RESP")"
BODY="$(extract_body_json "$RESP")"

print_resp_head "$RESP" 40
echo ""

if [[ "$HTTP" != "409" ]]; then
  echo "ASSERT FAIL: export not-locked expected 409 got $HTTP"
  echo "BODY:"
  print_json_safe_trunc "$BODY" 1200
  exit 1
fi

audit_assert_for_request_id \
  "$rid" \
  "dossier_export_rejected" \
  "export_gate" \
  "not_locked" \
  "EXPORT not locked reject" || exit 1

echo "PASS export reject on not-locked dossier"

# -------------------------------------------------------------------
# 2) PRECONDITIONS FOR LOCK FIXTURE
# -------------------------------------------------------------------
echo ""
echo "2) PREPARE locked export fixture"
echo "------------------------------------------------"

need TEST_ADDRESS_POSTCODE
need TEST_ADDRESS_HOUSE_NUMBER

TEST_ADDRESS_SUFFIX="${TEST_ADDRESS_SUFFIX:-}"

HAPPY_DOCS_FILE="$(get_state HAPPY_DOCS_FILE)"
if [[ -z "${HAPPY_DOCS_FILE:-}" || ! -f "$HAPPY_DOCS_FILE" ]]; then
  echo "FATAL: HAPPY_DOCS_FILE missing. 06_upload_happy.sh must persist confirmed doc mapping first."
  exit 1
fi

EMAIL_VERIFIED_AT="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossiers?select=email_verified_at&id=eq.$DOSSIER_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d[0].get("email_verified_at") or "") if d else "")')"

if [[ -z "${EMAIL_VERIFIED_AT:-}" ]]; then
  echo "FATAL: dossier email_verified_at is empty. Fresh bootstrap/session exchange did not establish verified email state."
  exit 1
fi

echo "OK precondition: email_verified_at present"

# -------------------------------------------------------------------
# 3) ADDRESS SAVE / VERIFY
# -------------------------------------------------------------------
echo ""
echo "3) ADDRESS SAVE / VERIFY"
echo "------------------------------------------------"

rid_addr="address-save-$(now_ts)"
echo "request_id: $rid_addr"

ADDRESS_PAYLOAD="$(python3 - "$DOSSIER_ID" "$(dossier_session_token)" "$TEST_ADDRESS_POSTCODE" "$TEST_ADDRESS_HOUSE_NUMBER" "$TEST_ADDRESS_SUFFIX" <<'PY'
import json, sys
dossier_id, session_token, postcode, house_number, suffix = sys.argv[1:6]
payload = {
    "dossier_id": dossier_id,
    "session_token": session_token,
    "postcode": postcode,
    "house_number": house_number,
}
if str(suffix).strip():
    payload["suffix"] = suffix
print(json.dumps(payload, ensure_ascii=False))
PY
)"

RESP_ADDR="$(http_call_with_idem "$FN_ADDRESS" "$ADDRESS_PAYLOAD" "$rid_addr")"
HTTP_ADDR="$(extract_http_status "$RESP_ADDR")"
BODY_ADDR="$(extract_body_json "$RESP_ADDR")"
print_resp_head "$RESP_ADDR" 30
echo ""

if [[ "$HTTP_ADDR" != "200" ]]; then
  echo "ASSERT FAIL: address-save expected 200 got $HTTP_ADDR"
  echo "BODY:"
  print_json_safe_trunc "$BODY_ADDR" 1200
  exit 1
fi

audit_assert_for_request_id \
  "$rid_addr" \
  "address_saved_verified" \
  "" \
  "" \
  "ADDRESS saved verified" || exit 1

echo "PASS address saved/verified"

# -------------------------------------------------------------------
# 4) CONSENTS SAVE
# -------------------------------------------------------------------
echo ""
echo "4) CONSENTS SAVE"
echo "------------------------------------------------"

rid_cons="consents-save-$(now_ts)"
echo "request_id: $rid_cons"

RESP_CONS="$(http_call_with_idem \
  "$FN_CONSENTS" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"consents\":{\"terms\":true,\"privacy\":true,\"mandaat\":true}}" \
  "$rid_cons")"

HTTP_CONS="$(extract_http_status "$RESP_CONS")"
BODY_CONS="$(extract_body_json "$RESP_CONS")"
print_resp_head "$RESP_CONS" 30
echo ""

if [[ "$HTTP_CONS" != "200" ]]; then
  echo "ASSERT FAIL: consents-save expected 200 got $HTTP_CONS"
  echo "BODY:"
  print_json_safe_trunc "$BODY_CONS" 1200
  exit 1
fi

audit_assert_for_request_id \
  "$rid_cons" \
  "consents_saved" \
  "" \
  "" \
  "CONSENTS saved" || exit 1

echo "PASS consents saved"

# -------------------------------------------------------------------
# 5) VERIFY WITH SYNTHETIC OBSERVED PAYLOAD ALIGNED TO DECLARED DATA
# -------------------------------------------------------------------
echo ""
echo "5) VERIFY"
echo "------------------------------------------------"

DOSSIER_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossiers?select=id,address_postcode,address_house_number,address_suffix,address_street,address_city,address_verified_at,email_verified_at,status,locked_at&id=eq.$DOSSIER_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

CHARGERS_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_chargers?select=id,serial_number,mid_number,brand,model&dossier_id=eq.$DOSSIER_ID&order=created_at.asc" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

VERIFY_PAYLOAD_JSON="$(python3 - "$DOSSIER_ID" "$(dossier_session_token)" "$HAPPY_DOCS_FILE" "$DOSSIER_JSON" "$CHARGERS_JSON" <<'PY'
import json, sys

dossier_id = sys.argv[1]
session_token = sys.argv[2]
happy_docs_file = sys.argv[3]
dossier_json = json.loads(sys.argv[4])
chargers_json = json.loads(sys.argv[5])

dossier = dossier_json[0] if dossier_json else {}
charger_by_id = {str(c.get("id")): c for c in chargers_json}

street = str(dossier.get("address_street") or "").strip()
house_number = str(dossier.get("address_house_number") or "").strip()
suffix = str(dossier.get("address_suffix") or "").strip()
postcode = str(dossier.get("address_postcode") or "").strip()
city = str(dossier.get("address_city") or "").strip()

address_line = street
if house_number:
    address_line = f"{address_line} {house_number}".strip()
if suffix:
    address_line = f"{address_line} {suffix}".strip()

client_invoice_observed = []

with open(happy_docs_file, "r", encoding="utf-8") as fh:
    for raw in fh:
        raw = raw.rstrip("\n")
        if not raw:
            continue
        charger_id, doc_type, document_id, _sha = raw.split("\t")
        if doc_type != "factuur":
            continue

        ch = charger_by_id.get(charger_id)
        if not ch:
            continue

        serial_number = str(ch.get("serial_number") or "").strip() or None
        mid_number = str(ch.get("mid_number") or "").strip() or None
        brand = str(ch.get("brand") or "").strip() or None
        model = str(ch.get("model") or "").strip() or None

        observed_fields = {
            "customer_name": None,
            "address_line": address_line or None,
            "house_number": house_number or None,
            "postcode_line": postcode or None,
            "city_line": city or None,
            "country_line": "Nederland",
            "brand": brand,
            "model": model,
            "serial_number": serial_number,
            "serial_candidate_raw": serial_number,
            "mid_number": mid_number,
            "mid_candidate_raw": mid_number,
        }

        non_null_count = sum(1 for v in observed_fields.values() if v not in (None, ""))

        client_invoice_observed.append({
            "document_id": document_id,
            "parser_payload": {
                "parser_kind": "test_fixture",
                "parser_version": "2026-04-22-lock-export-v1",
                "source_kind": "pdf",
                "observed_fields": observed_fields,
                "confidence": {
                    "fixture": True,
                    "observed_non_null_fields": non_null_count,
                    "analysis_mode": "synthetic_test_fixture_payload",
                },
                "limitations": [
                    "synthetic_test_fixture_payload"
                ],
                "summary": {
                    "source": "scripts/tests/08_export_contract.sh",
                    "note": "Synthetic observed invoice fields aligned to declared dossier/charger data for lock/export proof.",
                },
                "field_sources": {},
                "pages": [],
            }
        })

payload = {
    "dossier_id": dossier_id,
    "session_token": session_token,
    "mode": "refresh",
    "client_verify_payload": {
        "version": "test-client-verify-payload.v1",
        "document_snapshot": {
            "client_invoice_observed": client_invoice_observed
        }
    }
}

print(json.dumps(payload, ensure_ascii=False))
PY
)"

rid_verify="verify-lock-fixture-$(now_ts)"
echo "request_id: $rid_verify"

RESP_VERIFY="$(http_call_with_idem "$FN_VERIFY" "$VERIFY_PAYLOAD_JSON" "$rid_verify")"
HTTP_VERIFY="$(extract_http_status "$RESP_VERIFY")"
BODY_VERIFY="$(extract_body_json "$RESP_VERIFY")"
print_resp_head "$RESP_VERIFY" 35
echo ""

if [[ "$HTTP_VERIFY" != "200" ]]; then
  echo "ASSERT FAIL: verify expected 200 got $HTTP_VERIFY"
  echo "BODY:"
  print_json_safe_trunc "$BODY_VERIFY" 1600
  exit 1
fi

audit_assert_for_request_id \
  "$rid_verify" \
  "analysis_run_completed" \
  "" \
  "" \
  "VERIFY analysis run completed" || exit 1

ANALYSIS_STATUS="$(printf "%s" "$BODY_VERIFY" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("analysis_status",""))')"
if [[ -z "${ANALYSIS_STATUS:-}" ]]; then
  echo "ASSERT FAIL: verify response missing analysis_status"
  exit 1
fi

echo "PASS verify completed (analysis_status=$ANALYSIS_STATUS)"

# -------------------------------------------------------------------
# 6) EVALUATE + FINALIZE (LOCK)
# -------------------------------------------------------------------
echo ""
echo "6) EVALUATE FINALIZE"
echo "------------------------------------------------"

rid_eval="evaluate-finalize-$(now_ts)"
echo "request_id: $rid_eval"

RESP_EVAL="$(http_call_with_idem \
  "$FN_EVALUATE" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"evaluation_mode\":\"full\",\"finalize\":true}" \
  "$rid_eval")"

HTTP_EVAL="$(extract_http_status "$RESP_EVAL")"
BODY_EVAL="$(extract_body_json "$RESP_EVAL")"
print_resp_head "$RESP_EVAL" 35
echo ""

if [[ "$HTTP_EVAL" != "200" ]]; then
  echo "ASSERT FAIL: evaluate finalize expected 200 got $HTTP_EVAL"
  echo "BODY:"
  print_json_safe_trunc "$BODY_EVAL" 1600
  exit 1
fi

audit_assert_for_request_id \
  "$rid_eval" \
  "dossier_locked_for_review" \
  "" \
  "" \
  "EVALUATE locked for review" || exit 1

EVAL_STATUS="$(printf "%s" "$BODY_EVAL" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("status",""))')"
EVAL_LOCKED_AT="$(printf "%s" "$BODY_EVAL" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("locked_at","") or "")')"

if [[ "$EVAL_STATUS" != "in_review" ]]; then
  echo "ASSERT FAIL: evaluate finalize expected status=in_review got '$EVAL_STATUS'"
  exit 1
fi

if [[ -z "${EVAL_LOCKED_AT:-}" ]]; then
  echo "ASSERT FAIL: evaluate finalize did not return locked_at"
  exit 1
fi

echo "PASS evaluate finalize locked dossier"

# -------------------------------------------------------------------
# 7) EXPORT SUCCESS
# -------------------------------------------------------------------
echo ""
echo "7) EXPORT SUCCESS"
echo "------------------------------------------------"

rid_export_ok="export-locked-success-$(now_ts)"
echo "request_id: $rid_export_ok"

TMP_EXPORT_HEADERS="$(mktemp)"
TMP_EXPORT_BODY="$(mktemp)"
TMP_EXPORT_ERR="$(mktemp)"
trap 'rm -f "$TMP_EXPORT_HEADERS" "$TMP_EXPORT_BODY" "$TMP_EXPORT_ERR"' RETURN

set +e
curl -sS --no-progress-meter \
  --connect-timeout 10 \
  --max-time 60 \
  -D "$TMP_EXPORT_HEADERS" \
  -o "$TMP_EXPORT_BODY" \
  -X POST "$FN_EXPORT" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Idempotency-Key: $rid_export_ok" \
  -H "X-Request-Id: $rid_export_ok" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\"}" \
  2> "$TMP_EXPORT_ERR"
CURL_EXPORT_STATUS="$?"
set -e

echo "OK export curl returned"
echo "Curl exit: $CURL_EXPORT_STATUS"

if [[ "$CURL_EXPORT_STATUS" != "0" ]]; then
  echo "ASSERT FAIL: export curl failed before HTTP assertion"
  echo "CURL STDERR:"
  cat "$TMP_EXPORT_ERR"
  echo ""
  echo "HEADERS (if any):"
  head -n 60 "$TMP_EXPORT_HEADERS" || true
  echo ""
  echo "BODY (first 2000 bytes, if any):"
  head -c 2000 "$TMP_EXPORT_BODY" || true
  echo ""
  exit 1
fi

HTTP_EXPORT_OK="$(awk 'BEGIN{code=""} /^HTTP\//{code=$2} END{print code}' "$TMP_EXPORT_HEADERS")"
BODY_EXPORT_OK="$(cat "$TMP_EXPORT_BODY")"

echo "OK export response captured"
echo "Export HTTP: $HTTP_EXPORT_OK"
echo "Export body bytes: $(wc -c < "$TMP_EXPORT_BODY" | tr -d ' ')"
echo "HEADERS:"
head -n 40 "$TMP_EXPORT_HEADERS"
echo ""

if [[ "$HTTP_EXPORT_OK" != "200" ]]; then
  echo "ASSERT FAIL: export locked expected 200 got $HTTP_EXPORT_OK"
  echo "BODY:"
  print_json_safe_trunc "$BODY_EXPORT_OK" 2000
  exit 1
fi

audit_assert_for_request_id \
  "$rid_export_ok" \
  "dossier_export_generated" \
  "" \
  "" \
  "EXPORT generated" || exit 1

EXPORT_ASSERTS="$(python3 - "$DOSSIER_ID" "$TMP_EXPORT_BODY" <<'PY'
import json, sys

expected_dossier_id = sys.argv[1]
export_body_path = sys.argv[2]

with open(export_body_path, "r", encoding="utf-8") as fh:
    d = json.load(fh)

errors = []

if d.get("ok") is not True:
    errors.append("ok != true")

if d.get("schema_version") != "enval-dossier-export.v5":
    errors.append(f"schema_version != enval-dossier-export.v5 (got {d.get('schema_version')!r})")

dossier = d.get("dossier") or {}
if str(dossier.get("id") or "") != expected_dossier_id:
    errors.append("dossier.id mismatch")

documents_confirmed = d.get("documents_confirmed")
if not isinstance(documents_confirmed, list) or len(documents_confirmed) != 8:
    errors.append(f"documents_confirmed length != 8 (got {0 if not isinstance(documents_confirmed, list) else len(documents_confirmed)})")

analysis = d.get("analysis") or {}
if str(analysis.get("version") or "") != "enval-analysis.v1":
    errors.append("analysis.version mismatch")

analysis_readable = d.get("analysis_readable") or {}
if str(analysis_readable.get("version") or "") != "enval-analysis-readable.v1":
    errors.append("analysis_readable.version mismatch")

analysis_run = d.get("analysis_run")
if not isinstance(analysis_run, dict) or not str(analysis_run.get("run_id") or "").strip():
    errors.append("analysis_run.run_id missing")

if not str(d.get("export_id") or "").strip():
    errors.append("export_id missing")

export_sha256 = str(d.get("export_sha256") or "").strip()
if len(export_sha256) != 64 or any(c not in "0123456789abcdef" for c in export_sha256):
    errors.append("export_sha256 missing or invalid")

if d.get("payment_status") != "waived":
    errors.append(f"payment_status != waived (got {d.get('payment_status')!r})")

claim_year = d.get("claim_year")
if not isinstance(claim_year, int) or claim_year < 2020:
    errors.append(f"claim_year invalid (got {claim_year!r})")

claimed_mid_numbers = d.get("claimed_mid_numbers")
if not isinstance(claimed_mid_numbers, list) or not claimed_mid_numbers:
    errors.append("claimed_mid_numbers missing or empty")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$EXPORT_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: export artifact shape mismatch"
  printf "%s\n" "$EXPORT_ASSERTS" | tail -n +2
  exit 1
fi

EXPORT_ID="$(python3 - "$TMP_EXPORT_BODY" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    d = json.load(fh)
print(d.get("export_id") or "")
PY
)"

EXPORT_SHA256="$(python3 - "$TMP_EXPORT_BODY" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    d = json.load(fh)
print(d.get("export_sha256") or "")
PY
)"

if [[ -z "${EXPORT_ID:-}" || -z "${EXPORT_SHA256:-}" ]]; then
  echo "ASSERT FAIL: export response missing export_id/export_sha256"
  exit 1
fi

EXPORT_DB_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_exports?select=id,dossier_id,schema_version,export_status,payment_status,export_sha256,generated_request_id,claim_year,claimed_mid_numbers&id=eq.$EXPORT_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

EXPORT_DB_ASSERTS="$(python3 - "$DOSSIER_ID" "$EXPORT_ID" "$EXPORT_SHA256" "$rid_export_ok" "$EXPORT_DB_JSON" <<'PY'
import json, sys

expected_dossier_id = sys.argv[1]
expected_export_id = sys.argv[2]
expected_sha = sys.argv[3]
expected_request_id = sys.argv[4]
rows = json.loads(sys.argv[5])

errors = []
if not rows:
    errors.append("dossier_exports row missing")
else:
    row = rows[0]
    if str(row.get("id") or "") != expected_export_id:
        errors.append("export id mismatch")
    if str(row.get("dossier_id") or "") != expected_dossier_id:
        errors.append("dossier_id mismatch")
    if row.get("schema_version") != "enval-dossier-export.v5":
        errors.append("schema_version mismatch")
    if row.get("export_status") != "generated":
        errors.append("export_status mismatch")
    if row.get("payment_status") != "waived":
        errors.append("payment_status mismatch")
    if row.get("export_sha256") != expected_sha:
        errors.append("export_sha256 mismatch")
    if row.get("generated_request_id") != expected_request_id:
        errors.append("generated_request_id mismatch")
    if not isinstance(row.get("claim_year"), int) or row.get("claim_year") < 2020:
        errors.append("claim_year invalid")
    if not isinstance(row.get("claimed_mid_numbers"), list) or not row.get("claimed_mid_numbers"):
        errors.append("claimed_mid_numbers missing")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$EXPORT_DB_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: dossier_exports preservation mismatch"
  printf "%s\n" "$EXPORT_DB_ASSERTS" | tail -n +2
  echo "DB JSON:"
  print_json_safe_trunc "$EXPORT_DB_JSON" 1600
  exit 1
fi

PRESERVED_AUDIT_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_audit_events?select=event_type,event_data&dossier_id=eq.$DOSSIER_ID&event_type=eq.dossier_export_preserved&event_data->>request_id=eq.$rid_export_ok&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

PRESERVED_AUDIT_ASSERTS="$(python3 - "$EXPORT_ID" "$EXPORT_SHA256" "$PRESERVED_AUDIT_JSON" <<'PY'
import json, sys

expected_export_id = sys.argv[1]
expected_sha = sys.argv[2]
rows = json.loads(sys.argv[3])

errors = []
if not rows:
    errors.append("dossier_export_preserved audit row missing")
else:
    row = rows[0]
    if row.get("event_type") != "dossier_export_preserved":
        errors.append("event_type mismatch")
    event_data = row.get("event_data") or {}
    if str(event_data.get("export_id") or "") != expected_export_id:
        errors.append("audit export_id mismatch")
    if str(event_data.get("export_sha256") or "") != expected_sha:
        errors.append("audit export_sha256 mismatch")
    if event_data.get("payment_status") != "waived":
        errors.append("audit payment_status mismatch")
    if not isinstance(event_data.get("claim_year"), int) or event_data.get("claim_year") < 2020:
        errors.append("audit claim_year invalid")
    if not isinstance(event_data.get("claimed_mid_numbers"), list) or not event_data.get("claimed_mid_numbers"):
        errors.append("audit claimed_mid_numbers missing")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$PRESERVED_AUDIT_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: dossier_export_preserved audit proof mismatch"
  printf "%s\n" "$PRESERVED_AUDIT_ASSERTS" | tail -n +2
  echo "AUDIT JSON:"
  print_json_safe_trunc "$PRESERVED_AUDIT_JSON" 1600
  exit 1
fi

echo "PASS export success on locked dossier"
echo "PASS export preservation row + SHA proof"
echo "PASS export preserved audit proof"


# -------------------------------------------------------------------
# 8) EXPORT REJECT — duplicate MID claim in same claim_year
# -------------------------------------------------------------------
echo ""
echo "8) REJECT — duplicate MID claim in same claim_year"
echo "------------------------------------------------"

CLAIMED_MID_FOR_CONFLICT="$(python3 - "$TMP_EXPORT_BODY" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    d = json.load(fh)
mids = d.get("claimed_mid_numbers") or []
print(str(mids[0]) if mids else "")
PY
)"

CLAIM_YEAR_FOR_CONFLICT="$(python3 - "$TMP_EXPORT_BODY" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    d = json.load(fh)
print(d.get("claim_year") or "")
PY
)"

if [[ -z "${CLAIMED_MID_FOR_CONFLICT:-}" || -z "${CLAIM_YEAR_FOR_CONFLICT:-}" ]]; then
  echo "ASSERT FAIL: cannot build conflict test; missing claimed MID or claim_year from first export"
  exit 1
fi

echo "Conflict MID: $CLAIMED_MID_FOR_CONFLICT"
echo "Conflict claim_year: $CLAIM_YEAR_FOR_CONFLICT"

# Preserve original main dossier state for 09_cleanup.sh.
ORIG_DOSSIER_ID="$DOSSIER_ID"
ORIG_DOSSIER_TOKEN="$(dossier_token)"
ORIG_DOSSIER_SESSION_TOKEN="$(dossier_session_token)"
ORIG_HAPPY_DOCS_FILE="$(get_state HAPPY_DOCS_FILE)"
ORIG_CREATED_CHARGER_IDS="$(get_state CREATED_CHARGER_IDS)"

CONFLICT_TS="$(now_ts)"
CONFLICT_EMAIL="audit-conflict-${CONFLICT_TS}@example.com"
rid_conflict_intake="export-mid-conflict-intake-${CONFLICT_TS}"

echo ""
echo "8A) create conflict dossier"
echo "request_id: $rid_conflict_intake"

RESP_CONFLICT_INTAKE="$(http_call_with_idem \
  "$FN_LEAD" \
  "{\"flow\":\"ev_direct\",\"first_name\":\"Audit\",\"last_name\":\"Conflict\",\"email\":\"$CONFLICT_EMAIL\",\"phone\":\"0612345678\",\"charger_count\":1,\"own_premises\":true,\"in_nl\":true,\"has_mid\":true}" \
  "$rid_conflict_intake")"

HTTP_CONFLICT_INTAKE="$(extract_http_status "$RESP_CONFLICT_INTAKE")"
BODY_CONFLICT_INTAKE="$(extract_body_json "$RESP_CONFLICT_INTAKE")"

if [[ "$HTTP_CONFLICT_INTAKE" != "200" ]]; then
  echo "ASSERT FAIL: conflict intake expected 200 got $HTTP_CONFLICT_INTAKE"
  echo "BODY:"
  print_json_safe_trunc "$BODY_CONFLICT_INTAKE" 1200
  exit 1
fi

CONFLICT_DOSSIER_ID="$(printf "%s" "$BODY_CONFLICT_INTAKE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("dossier_id") or "")')"
if [[ -z "${CONFLICT_DOSSIER_ID:-}" ]]; then
  echo "ASSERT FAIL: conflict intake returned no dossier_id"
  print_json_safe_trunc "$BODY_CONFLICT_INTAKE" 1200
  exit 1
fi

echo "Conflict dossier_id: $CONFLICT_DOSSIER_ID"

CONFLICT_MAIL_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/outbound_emails?select=id,created_at,body,message_type,to_email,dossier_id&dossier_id=eq.$CONFLICT_DOSSIER_ID&message_type=eq.dossier_link&order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

CONFLICT_TOKEN="$(printf "%s" "$CONFLICT_MAIL_JSON" | python3 -c "import sys,json,re; d=json.load(sys.stdin); body=(d[0].get('body') or '') if d else ''; m=re.search(r'[?&]t=([^\\s&]+)', body); print(m.group(1) if m else '')")"

if [[ -z "${CONFLICT_TOKEN:-}" ]]; then
  echo "ASSERT FAIL: conflict dossier link token missing"
  echo "MAIL JSON:"
  print_json_safe_trunc "$CONFLICT_MAIL_JSON" 1200
  exit 1
fi

export DOSSIER_ID="$CONFLICT_DOSSIER_ID"
export DOSSIER_TOKEN="$CONFLICT_TOKEN"
unset DOSSIER_SESSION_TOKEN || true

set_state DOSSIER_ID "$CONFLICT_DOSSIER_ID"
set_state DOSSIER_TOKEN "$CONFLICT_TOKEN"
bootstrap_session_from_link_token
export DOSSIER_SESSION_TOKEN="$(dossier_session_token)"

if [[ -z "${DOSSIER_SESSION_TOKEN:-}" ]]; then
  echo "ASSERT FAIL: conflict session token missing after bootstrap"
  exit 1
fi

echo "OK conflict session bootstrap"

echo ""
echo "8B) create conflict charger with already-claimed MID"

rid_conflict_charger="export-mid-conflict-charger-$(now_ts)"
RESP_CONFLICT_CHARGER="$(http_call_with_idem \
  "$FN_CHARGER_SAVE" \
  "{\"dossier_id\":\"$CONFLICT_DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"serial_number\":\"TEST-CONFLICT-$CONFLICT_TS\",\"mid_number\":\"$CLAIMED_MID_FOR_CONFLICT\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"audit-test duplicate MID conflict fixture\"}" \
  "$rid_conflict_charger")"

HTTP_CONFLICT_CHARGER="$(extract_http_status "$RESP_CONFLICT_CHARGER")"
BODY_CONFLICT_CHARGER="$(extract_body_json "$RESP_CONFLICT_CHARGER")"

if [[ "$HTTP_CONFLICT_CHARGER" != "200" ]]; then
  echo "ASSERT FAIL: conflict charger-create expected 200 got $HTTP_CONFLICT_CHARGER"
  echo "This usually means the runtime MID unique index still exists, which is now stale."
  echo "BODY:"
  print_json_safe_trunc "$BODY_CONFLICT_CHARGER" 1200
  exit 1
fi

CONFLICT_CHARGER_ID="$(printf "%s" "$BODY_CONFLICT_CHARGER" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(d.get("charger_id") or d.get("id") or "")
')"

if [[ -z "${CONFLICT_CHARGER_ID:-}" ]]; then
  echo "ASSERT FAIL: conflict charger-create returned no charger_id"
  print_json_safe_trunc "$BODY_CONFLICT_CHARGER" 1200
  exit 1
fi

echo "Conflict charger_id: $CONFLICT_CHARGER_ID"

echo ""
echo "8C) upload required conflict docs"

CONFLICT_TMP_DIR="$(dirname "$0")/.tmp"
mkdir -p "$CONFLICT_TMP_DIR"
CONFLICT_TMP_FILE="$CONFLICT_TMP_DIR/enval-devtest-conflict-upload.pdf"
CONFLICT_DOCS_FILE="$CONFLICT_TMP_DIR/conflict-documents.tsv"
: > "$CONFLICT_DOCS_FILE"

printf "ENVAL DEVTEST CONFLICT PDF PLACEHOLDER\n" > "$CONFLICT_TMP_FILE"
CONFLICT_FILE_SIZE="$(wc -c < "$CONFLICT_TMP_FILE" | tr -d ' ')"
CONFLICT_FILE_SHA256="$(shasum -a 256 "$CONFLICT_TMP_FILE" | awk '{print $1}')"

for dt in factuur foto_laadpunt; do
  rid_conflict_url="conflict-uploadurl-$dt-$(now_ts)"
  echo ""
  echo "conflict upload-url doc_type=$dt"
  echo "request_id: $rid_conflict_url"

  RESP_CONFLICT_URL="$(http_call_with_idem \
    "$FN_UPLOAD_URL" \
    "{\"dossier_id\":\"$CONFLICT_DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"doc_type\":\"$dt\",\"filename\":\"conflict-$dt-$CONFLICT_CHARGER_ID.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":$CONFLICT_FILE_SIZE,\"charger_id\":\"$CONFLICT_CHARGER_ID\"}" \
    "$rid_conflict_url")"

  HTTP_CONFLICT_URL="$(extract_http_status "$RESP_CONFLICT_URL")"
  BODY_CONFLICT_URL="$(extract_body_json "$RESP_CONFLICT_URL")"

  if [[ "$HTTP_CONFLICT_URL" != "200" ]]; then
    echo "ASSERT FAIL: conflict upload-url expected 200 got $HTTP_CONFLICT_URL"
    echo "BODY:"
    print_json_safe_trunc "$BODY_CONFLICT_URL" 1200
    exit 1
  fi

  CONFLICT_DOC_ID="$(echo "$BODY_CONFLICT_URL" | sed -n 's/.*"document_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  CONFLICT_SIGNED_URL="$(echo "$BODY_CONFLICT_URL" | sed -n 's/.*"signed_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

  if [[ -z "${CONFLICT_DOC_ID:-}" || -z "${CONFLICT_SIGNED_URL:-}" ]]; then
    echo "ASSERT FAIL: conflict upload-url missing document_id/signed_url"
    print_json_safe_trunc "$BODY_CONFLICT_URL" 1200
    exit 1
  fi

  PUT_CONFLICT_RESP="$(curl -s -i -X PUT "$CONFLICT_SIGNED_URL" \
    -H "Content-Type: application/pdf" \
    --data-binary @"$CONFLICT_TMP_FILE")"

  PUT_CONFLICT_HTTP="$(extract_http_status "$PUT_CONFLICT_RESP")"
  if [[ "$PUT_CONFLICT_HTTP" != "200" ]]; then
    echo "ASSERT FAIL: conflict storage PUT expected 200 got $PUT_CONFLICT_HTTP"
    print_resp_head "$PUT_CONFLICT_RESP" 20
    exit 1
  fi

  rid_conflict_confirm="conflict-uploadconfirm-$dt-$(now_ts)"
  RESP_CONFLICT_CONFIRM="$(http_call_with_idem \
    "$FN_UPLOAD_CONFIRM" \
    "{\"dossier_id\":\"$CONFLICT_DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"document_id\":\"$CONFLICT_DOC_ID\",\"file_sha256\":\"$CONFLICT_FILE_SHA256\"}" \
    "$rid_conflict_confirm")"

  HTTP_CONFLICT_CONFIRM="$(extract_http_status "$RESP_CONFLICT_CONFIRM")"
  BODY_CONFLICT_CONFIRM="$(extract_body_json "$RESP_CONFLICT_CONFIRM")"

  if [[ "$HTTP_CONFLICT_CONFIRM" != "200" ]]; then
    echo "ASSERT FAIL: conflict upload-confirm expected 200 got $HTTP_CONFLICT_CONFIRM"
    echo "BODY:"
    print_json_safe_trunc "$BODY_CONFLICT_CONFIRM" 1200
    exit 1
  fi

  assert_document_row_confirmed \
    "$CONFLICT_DOC_ID" \
    "$CONFLICT_CHARGER_ID" \
    "$dt" \
    "$CONFLICT_FILE_SHA256" \
    "CONFLICT DB row confirmed ($dt)" || exit 1

  printf "%s\t%s\t%s\t%s\n" "$CONFLICT_CHARGER_ID" "$dt" "$CONFLICT_DOC_ID" "$CONFLICT_FILE_SHA256" >> "$CONFLICT_DOCS_FILE"
done

echo "OK conflict docs uploaded + confirmed"

echo ""
echo "8D) address + consents + verify + lock conflict dossier"

rid_conflict_addr="conflict-address-save-$(now_ts)"
CONFLICT_ADDRESS_PAYLOAD="$(python3 - "$CONFLICT_DOSSIER_ID" "$(dossier_session_token)" "$TEST_ADDRESS_POSTCODE" "$TEST_ADDRESS_HOUSE_NUMBER" "$TEST_ADDRESS_SUFFIX" <<'PY'
import json, sys
dossier_id, session_token, postcode, house_number, suffix = sys.argv[1:6]
payload = {
    "dossier_id": dossier_id,
    "session_token": session_token,
    "postcode": postcode,
    "house_number": house_number,
}
if str(suffix).strip():
    payload["suffix"] = suffix
print(json.dumps(payload, ensure_ascii=False))
PY
)"

RESP_CONFLICT_ADDR="$(http_call_with_idem "$FN_ADDRESS" "$CONFLICT_ADDRESS_PAYLOAD" "$rid_conflict_addr")"
HTTP_CONFLICT_ADDR="$(extract_http_status "$RESP_CONFLICT_ADDR")"
BODY_CONFLICT_ADDR="$(extract_body_json "$RESP_CONFLICT_ADDR")"

if [[ "$HTTP_CONFLICT_ADDR" != "200" ]]; then
  echo "ASSERT FAIL: conflict address-save expected 200 got $HTTP_CONFLICT_ADDR"
  print_json_safe_trunc "$BODY_CONFLICT_ADDR" 1200
  exit 1
fi

rid_conflict_cons="conflict-consents-save-$(now_ts)"
RESP_CONFLICT_CONS="$(http_call_with_idem \
  "$FN_CONSENTS" \
  "{\"dossier_id\":\"$CONFLICT_DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"consents\":{\"terms\":true,\"privacy\":true,\"mandaat\":true}}" \
  "$rid_conflict_cons")"

HTTP_CONFLICT_CONS="$(extract_http_status "$RESP_CONFLICT_CONS")"
BODY_CONFLICT_CONS="$(extract_body_json "$RESP_CONFLICT_CONS")"

if [[ "$HTTP_CONFLICT_CONS" != "200" ]]; then
  echo "ASSERT FAIL: conflict consents-save expected 200 got $HTTP_CONFLICT_CONS"
  print_json_safe_trunc "$BODY_CONFLICT_CONS" 1200
  exit 1
fi

CONFLICT_DOSSIER_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossiers?select=id,address_postcode,address_house_number,address_suffix,address_street,address_city,address_verified_at,email_verified_at,status,locked_at&id=eq.$CONFLICT_DOSSIER_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

CONFLICT_CHARGERS_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_chargers?select=id,serial_number,mid_number,brand,model&dossier_id=eq.$CONFLICT_DOSSIER_ID&order=created_at.asc" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

CONFLICT_VERIFY_PAYLOAD_JSON="$(python3 - "$CONFLICT_DOSSIER_ID" "$(dossier_session_token)" "$CONFLICT_DOCS_FILE" "$CONFLICT_DOSSIER_JSON" "$CONFLICT_CHARGERS_JSON" <<'PY'
import json, sys

dossier_id = sys.argv[1]
session_token = sys.argv[2]
docs_file = sys.argv[3]
dossier_json = json.loads(sys.argv[4])
chargers_json = json.loads(sys.argv[5])

dossier = dossier_json[0] if dossier_json else {}
charger_by_id = {str(c.get("id")): c for c in chargers_json}

street = str(dossier.get("address_street") or "").strip()
house_number = str(dossier.get("address_house_number") or "").strip()
suffix = str(dossier.get("address_suffix") or "").strip()
postcode = str(dossier.get("address_postcode") or "").strip()
city = str(dossier.get("address_city") or "").strip()

address_line = street
if house_number:
    address_line = f"{address_line} {house_number}".strip()
if suffix:
    address_line = f"{address_line} {suffix}".strip()

client_invoice_observed = []

with open(docs_file, "r", encoding="utf-8") as fh:
    for raw in fh:
        raw = raw.rstrip("\n")
        if not raw:
            continue
        charger_id, doc_type, document_id, _sha = raw.split("\t")
        if doc_type != "factuur":
            continue

        ch = charger_by_id.get(charger_id)
        if not ch:
            continue

        serial_number = str(ch.get("serial_number") or "").strip() or None
        mid_number = str(ch.get("mid_number") or "").strip() or None
        brand = str(ch.get("brand") or "").strip() or None
        model = str(ch.get("model") or "").strip() or None

        observed_fields = {
            "customer_name": None,
            "address_line": address_line or None,
            "house_number": house_number or None,
            "postcode_line": postcode or None,
            "city_line": city or None,
            "country_line": "Nederland",
            "brand": brand,
            "model": model,
            "serial_number": serial_number,
            "serial_candidate_raw": serial_number,
            "mid_number": mid_number,
            "mid_candidate_raw": mid_number,
        }

        non_null_count = sum(1 for v in observed_fields.values() if v not in (None, ""))

        client_invoice_observed.append({
            "document_id": document_id,
            "parser_payload": {
                "parser_kind": "test_fixture",
                "parser_version": "2026-04-22-lock-export-v1",
                "source_kind": "pdf",
                "observed_fields": observed_fields,
                "confidence": {
                    "fixture": True,
                    "observed_non_null_fields": non_null_count,
                    "analysis_mode": "synthetic_test_fixture_payload",
                },
                "limitations": [
                    "synthetic_test_fixture_payload"
                ],
                "summary": {
                    "source": "scripts/tests/08_export_contract.sh",
                    "note": "Synthetic observed invoice fields aligned to declared dossier/charger data for MID conflict proof.",
                },
                "field_sources": {},
                "pages": [],
            }
        })

payload = {
    "dossier_id": dossier_id,
    "session_token": session_token,
    "mode": "refresh",
    "client_verify_payload": {
        "version": "test-client-verify-payload.v1",
        "document_snapshot": {
            "client_invoice_observed": client_invoice_observed
        }
    }
}

print(json.dumps(payload, ensure_ascii=False))
PY
)"

rid_conflict_verify="conflict-verify-$(now_ts)"
RESP_CONFLICT_VERIFY="$(http_call_with_idem "$FN_VERIFY" "$CONFLICT_VERIFY_PAYLOAD_JSON" "$rid_conflict_verify")"
HTTP_CONFLICT_VERIFY="$(extract_http_status "$RESP_CONFLICT_VERIFY")"
BODY_CONFLICT_VERIFY="$(extract_body_json "$RESP_CONFLICT_VERIFY")"

if [[ "$HTTP_CONFLICT_VERIFY" != "200" ]]; then
  echo "ASSERT FAIL: conflict verify expected 200 got $HTTP_CONFLICT_VERIFY"
  print_json_safe_trunc "$BODY_CONFLICT_VERIFY" 1600
  exit 1
fi

rid_conflict_eval="conflict-evaluate-finalize-$(now_ts)"
RESP_CONFLICT_EVAL="$(http_call_with_idem \
  "$FN_EVALUATE" \
  "{\"dossier_id\":\"$CONFLICT_DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"evaluation_mode\":\"full\",\"finalize\":true}" \
  "$rid_conflict_eval")"

HTTP_CONFLICT_EVAL="$(extract_http_status "$RESP_CONFLICT_EVAL")"
BODY_CONFLICT_EVAL="$(extract_body_json "$RESP_CONFLICT_EVAL")"

if [[ "$HTTP_CONFLICT_EVAL" != "200" ]]; then
  echo "ASSERT FAIL: conflict evaluate finalize expected 200 got $HTTP_CONFLICT_EVAL"
  print_json_safe_trunc "$BODY_CONFLICT_EVAL" 1600
  exit 1
fi

echo "OK conflict dossier locked"

echo ""
echo "8E) export must reject duplicate MID claim"

rid_conflict_export="conflict-export-duplicate-mid-$(now_ts)"
RESP_CONFLICT_EXPORT="$(http_call_with_idem \
  "$FN_EXPORT" \
  "{\"dossier_id\":\"$CONFLICT_DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\"}" \
  "$rid_conflict_export")"

HTTP_CONFLICT_EXPORT="$(extract_http_status "$RESP_CONFLICT_EXPORT")"
BODY_CONFLICT_EXPORT="$(extract_body_json "$RESP_CONFLICT_EXPORT")"

if [[ "$HTTP_CONFLICT_EXPORT" != "409" ]]; then
  echo "ASSERT FAIL: conflict export expected 409 got $HTTP_CONFLICT_EXPORT"
  echo "BODY:"
  print_json_safe_trunc "$BODY_CONFLICT_EXPORT" 1600
  exit 1
fi

CONFLICT_EXPORT_ASSERTS="$(python3 - "$BODY_CONFLICT_EXPORT" "$CLAIMED_MID_FOR_CONFLICT" "$CLAIM_YEAR_FOR_CONFLICT" <<'PY'
import json, sys

body = json.loads(sys.argv[1])
expected_mid = str(sys.argv[2])
expected_year = int(sys.argv[3])

errors = []
if body.get("ok") is not False:
    errors.append("ok != false")
if body.get("reason") != "mid_already_claimed_for_claim_year":
    errors.append("reason mismatch")
if str(body.get("mid_number") or "") != expected_mid:
    errors.append("mid_number mismatch")
if body.get("claim_year") != expected_year:
    errors.append("claim_year mismatch")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$CONFLICT_EXPORT_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: conflict export body mismatch"
  printf "%s\n" "$CONFLICT_EXPORT_ASSERTS" | tail -n +2
  echo "BODY:"
  print_json_safe_trunc "$BODY_CONFLICT_EXPORT" 1600
  exit 1
fi

audit_assert_for_request_id \
  "$rid_conflict_export" \
  "dossier_export_rejected" \
  "final_mid_claim" \
  "mid_already_claimed_for_claim_year" \
  "EXPORT duplicate MID reject" || exit 1

CONFLICT_EXPORT_ROWS="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_exports?select=id&generated_request_id=eq.$rid_conflict_export&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

CONFLICT_EXPORT_ROW_COUNT="$(printf "%s" "$CONFLICT_EXPORT_ROWS" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)')"

if [[ "$CONFLICT_EXPORT_ROW_COUNT" != "0" ]]; then
  echo "ASSERT FAIL: duplicate MID conflict created dossier_exports row"
  echo "ROWS:"
  print_json_safe_trunc "$CONFLICT_EXPORT_ROWS" 1200
  exit 1
fi

echo "PASS export duplicate MID rejected by preserved yearly claim"
echo "PASS no dossier_exports row created for duplicate MID conflict"

# Restore original main dossier state before 09_cleanup.sh.
export DOSSIER_ID="$ORIG_DOSSIER_ID"
export DOSSIER_TOKEN="$ORIG_DOSSIER_TOKEN"
export DOSSIER_SESSION_TOKEN="$ORIG_DOSSIER_SESSION_TOKEN"

set_state DOSSIER_ID "$ORIG_DOSSIER_ID"
set_state DOSSIER_TOKEN "$ORIG_DOSSIER_TOKEN"
set_state DOSSIER_SESSION_TOKEN "$ORIG_DOSSIER_SESSION_TOKEN"
set_state HAPPY_DOCS_FILE "$ORIG_HAPPY_DOCS_FILE"
set_state CREATED_CHARGER_IDS "$ORIG_CREATED_CHARGER_IDS"

echo "OK restored original dossier state for cleanup"