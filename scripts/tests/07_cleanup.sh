# scripts/tests/07_cleanup.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== CLEANUP =="

FN_DELETE="$SUPABASE_URL/functions/v1/api-dossier-charger-delete"

CREATED_CSV="$(get_state CREATED_CHARGER_IDS)"
if [[ -z "${CREATED_CSV:-}" ]]; then
  echo "Nothing to cleanup (no chargers created in this run)."
  exit 0
fi

IFS=, read -r -a CREATED_IDS <<< "$CREATED_CSV"

for cid in "${CREATED_IDS[@]}"; do
  rid="cleanup-chargerdelete-$(now_ts)"

  echo ""
  echo "CLEANUP) charger-delete — $cid"
  echo "request_id: $rid"

  RESP_DEL="$(http_call_with_idem \
    "$FN_DELETE" \
    "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"charger_id\":\"$cid\"}" \
    "$rid")"

  DEL_HTTP="$(extract_http_status "$RESP_DEL")"
  DEL_BODY="$(extract_body_json "$RESP_DEL")"

  if [[ "$DEL_HTTP" != "200" ]]; then
    echo "ASSERT FAIL: cleanup charger-delete expected 200 got $DEL_HTTP"
    echo "$DEL_BODY"
    exit 1
  fi

  audit_assert_for_request_id "$rid" "charger_deleted" "" "" "CLEANUP charger-delete" || exit 1

  echo "OK deleted charger: $cid"
done

echo "PASS cleanup"