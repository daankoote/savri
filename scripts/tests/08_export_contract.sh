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
  "$SUPABASE_URL/rest/v1/dossier_exports?select=id,dossier_id,schema_version,export_status,payment_status,export_sha256,generated_request_id&id=eq.$EXPORT_ID&limit=1" \
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