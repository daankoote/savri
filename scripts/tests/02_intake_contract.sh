# scripts/tests/02_intake_contract.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== INTAKE CONTRACT TESTS (api-lead-submit) =="

FN_LEAD="$SUPABASE_URL/functions/v1/api-lead-submit"
TEST_EMAIL_BASE="audit-test-$(now_ts)"

# 1) Reject in_nl=false
IDEM_IN_NL="intake-in-nl-false-$(now_ts)"
EMAIL_IN_NL="${TEST_EMAIL_BASE}+nlfalse@example.com"

RESP_IN_NL="$(http_call_with_idem \
  "$FN_LEAD" \
  "{\"flow\":\"ev_direct\",\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"$EMAIL_IN_NL\",\"phone\":\"0612345678\",\"charger_count\":1,\"own_premises\":true,\"in_nl\":false,\"has_mid\":true}" \
  "$IDEM_IN_NL")"

HTTP_IN_NL="$(extract_http_status "$RESP_IN_NL")"
BODY_IN_NL="$(extract_body_json "$RESP_IN_NL")"

if [[ "$HTTP_IN_NL" != "400" ]]; then
  echo "ASSERT FAIL: intake in_nl=false expected 400 got $HTTP_IN_NL"
  echo "$BODY_IN_NL"
  exit 1
fi

intake_audit_assert_idem_reason "$IDEM_IN_NL" "in_nl_false" "INTAKE in_nl=false audit" || exit 1
assert_no_lead_for_email_since_start "$EMAIL_IN_NL" "INTAKE in_nl=false no lead" || exit 1
assert_no_dossier_for_lead_email_since_start "$EMAIL_IN_NL" "INTAKE in_nl=false no dossier" || exit 1

# Idempotency replay must be identical
RESP_IN_NL_REPLAY="$(http_call_with_idem \
  "$FN_LEAD" \
  "{\"flow\":\"ev_direct\",\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"$EMAIL_IN_NL\",\"phone\":\"0612345678\",\"charger_count\":1,\"own_premises\":true,\"in_nl\":false,\"has_mid\":true}" \
  "$IDEM_IN_NL")"

BODY_IN_NL_REPLAY="$(extract_body_json "$RESP_IN_NL_REPLAY")"
if [[ "$BODY_IN_NL_REPLAY" != "$BODY_IN_NL" ]]; then
  echo "ASSERT FAIL: intake idempotency replay body mismatch (in_nl=false)"
  exit 1
fi

# 2) Reject has_mid=false
IDEM_HAS_MID="intake-has-mid-false-$(now_ts)"
EMAIL_HAS_MID="${TEST_EMAIL_BASE}+midfalse@example.com"

RESP_HAS_MID="$(http_call_with_idem \
  "$FN_LEAD" \
  "{\"flow\":\"ev_direct\",\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"$EMAIL_HAS_MID\",\"phone\":\"0612345678\",\"charger_count\":1,\"own_premises\":true,\"in_nl\":true,\"has_mid\":false}" \
  "$IDEM_HAS_MID")"

HTTP_HAS_MID="$(extract_http_status "$RESP_HAS_MID")"
BODY_HAS_MID="$(extract_body_json "$RESP_HAS_MID")"

if [[ "$HTTP_HAS_MID" != "400" ]]; then
  echo "ASSERT FAIL: intake has_mid=false expected 400 got $HTTP_HAS_MID"
  echo "$BODY_HAS_MID"
  exit 1
fi

intake_audit_assert_idem_reason "$IDEM_HAS_MID" "has_mid_false" "INTAKE has_mid=false audit" || exit 1
assert_no_lead_for_email_since_start "$EMAIL_HAS_MID" "INTAKE has_mid=false no lead" || exit 1
assert_no_dossier_for_lead_email_since_start "$EMAIL_HAS_MID" "INTAKE has_mid=false no dossier" || exit 1

RESP_HAS_MID_REPLAY="$(http_call_with_idem \
  "$FN_LEAD" \
  "{\"flow\":\"ev_direct\",\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"$EMAIL_HAS_MID\",\"phone\":\"0612345678\",\"charger_count\":1,\"own_premises\":true,\"in_nl\":true,\"has_mid\":false}" \
  "$IDEM_HAS_MID")"

BODY_HAS_MID_REPLAY="$(extract_body_json "$RESP_HAS_MID_REPLAY")"
if [[ "$BODY_HAS_MID_REPLAY" != "$BODY_HAS_MID" ]]; then
  echo "ASSERT FAIL: intake idempotency replay body mismatch (has_mid=false)"
  exit 1
fi

echo "PASS intake contract rejects + idempotency"