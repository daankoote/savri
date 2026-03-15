# scripts/tests/04_charger_contract.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== CHARGER CONTRACT TESTS =="

# Link-token blijft alleen bootstrap/debug-bewijs.
# Runtime-auth voor charger endpoints moet via session_token lopen.
assert_token_matches_db

require_dossier_session_token
echo "TOKEN (sha256 prefix):   $(sha256_str "$(dossier_token)" | cut -c1-16)..."
echo "SESSION present:         yes"

FN_SAVE="$SUPABASE_URL/functions/v1/api-dossier-charger-save"
FN_DELETE="$SUPABASE_URL/functions/v1/api-dossier-charger-delete"

# Deterministic valid MID for tests (NOT secret)
MID_OK="${MID_OK:-1234567890123456}"

BAD_SESSION_TOKEN="BAD-$(dossier_session_token)"

CHARGER_ID="$(get_state CHARGER_ID)"
if [[ -z "${CHARGER_ID:-}" ]]; then
  echo "FATAL: CHARGER_ID missing from setup state"
  exit 1
fi

ALLOWED_MAX="$(get_state ALLOWED_MAX)"
EXISTING_AFTER_SETUP="$(get_state EXISTING_AFTER_SETUP)"

run_case \
  "1) REJECT — charger-save (unauthorized)" \
  "$FN_SAVE" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$BAD_SESSION_TOKEN\",\"serial_number\":\"TEST-$(now_ts)\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject unauth\"}" \
  "reject-charger-unauth" \
  "401" \
  "yes" \
  "charger_save_rejected" \
  "auth" \
  "session_not_found" || exit 1

echo "PASS charger-save unauthorized"

# 2) max chargers reject (only if at allowed max)
if [[ -n "${ALLOWED_MAX:-}" && -n "${EXISTING_AFTER_SETUP:-}" && "$EXISTING_AFTER_SETUP" == "$ALLOWED_MAX" ]]; then
  echo ""
  echo "2) REJECT — charger-save (max chargers)"
  echo "------------------------------------------------"
  rid="reject-charger-max-$(now_ts)"
  echo "request_id: $rid"
  echo ""

  # IMPORTANT: always include mid_number so validate_input cannot override expected result
  payload="{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"serial_number\":\"TEST-$(now_ts)\",\"mid_number\":\"$MID_OK\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject max\"}"

  RESP="$(http_call_with_idem "$FN_SAVE" "$payload" "$rid")"
  HTTP="$(extract_http_status "$RESP")"
  BODY="$(extract_body_json "$RESP")"
  print_resp_head "$RESP" 30
  echo ""

  if [[ "$HTTP" == "409" ]]; then
    audit_assert_for_request_id "$rid" "charger_save_rejected" "validate_max_chargers" "max_chargers_reached" "2) max chargers" || exit 1
    echo "PASS charger-save max chargers"
  elif [[ "$HTTP" == "401" ]]; then
    # TEMP: auth is broken; prove audit says unauthorized
    audit_assert_for_request_id "$rid" "charger_save_rejected" "auth" "session_not_found" "2) max chargers (auth broken)" || exit 1
    echo "WARN: charger-save max returned 401 (auth broken, see audit token_hash_prefix in backend after deploy)"
    exit 1
  else
    echo "ASSERT FAIL: expected HTTP 409 (or 401 while auth broken), got $HTTP"
    echo "BODY (trunc):"
    print_json_safe_trunc "$BODY" 800
    exit 1
  fi


else
  echo "WARN: skip max-chargers test (not at allowed max). existing_after_setup=$EXISTING_AFTER_SETUP allowed_max=$ALLOWED_MAX"
fi

# 3) unauthorized charger-delete
run_case \
  "3) REJECT — charger-delete (unauthorized)" \
  "$FN_DELETE" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$BAD_SESSION_TOKEN\",\"charger_id\":\"$CHARGER_ID\"}" \
  "reject-chargerdelete-unauth" \
  "401" \
  "yes" \
  "charger_delete_rejected" \
  "auth" \
  "session_not_found" || exit 1

echo "PASS charger-delete unauthorized"