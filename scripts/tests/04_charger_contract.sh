# scripts/tests/04_charger_contract.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== CHARGER CONTRACT TESTS =="

FN_SAVE="$SUPABASE_URL/functions/v1/api-dossier-charger-save"
FN_DELETE="$SUPABASE_URL/functions/v1/api-dossier-charger-delete"

BAD_TOKEN="BAD-${DOSSIER_TOKEN}"

CHARGER_ID="$(get_state CHARGER_ID)"
if [[ -z "${CHARGER_ID:-}" ]]; then
  echo "FATAL: CHARGER_ID missing from setup state"
  exit 1
fi

ALLOWED_MAX="$(get_state ALLOWED_MAX)"
EXISTING_AFTER_SETUP="$(get_state EXISTING_AFTER_SETUP)"

# 1) unauthorized save
run_case \
  "1) REJECT — charger-save (unauthorized)" \
  "$FN_SAVE" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$BAD_TOKEN\",\"serial_number\":\"TEST-$(now_ts)\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject unauth\"}" \
  "reject-charger-unauth" \
  "401" \
  "yes" \
  "charger_save_rejected" \
  "auth" \
  "unauthorized" || exit 1

echo "PASS charger-save unauthorized"

# 2) max chargers reject (only if at allowed max)
if [[ -n "${ALLOWED_MAX:-}" && -n "${EXISTING_AFTER_SETUP:-}" && "$EXISTING_AFTER_SETUP" == "$ALLOWED_MAX" ]]; then
  run_case \
    "2) REJECT — charger-save (max chargers)" \
    "$FN_SAVE" \
    "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"serial_number\":\"TEST-$(now_ts)\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject max\"}" \
    "reject-charger-max" \
    "409" \
    "yes" \
    "charger_save_rejected" \
    "validate_max_chargers" \
    "max_chargers_reached" || exit 1
  echo "PASS charger-save max chargers"
else
  echo "WARN: skip max-chargers test (not at allowed max). existing_after_setup=$EXISTING_AFTER_SETUP allowed_max=$ALLOWED_MAX"
fi

# 3) unauthorized charger-delete
run_case \
  "3) REJECT — charger-delete (unauthorized)" \
  "$FN_DELETE" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$BAD_TOKEN\",\"charger_id\":\"$CHARGER_ID\"}" \
  "reject-chargerdelete-unauth" \
  "401" \
  "yes" \
  "charger_delete_rejected" \
  "auth" \
  "unauthorized" || exit 1

echo "PASS charger-delete unauthorized"