# scripts/tests/07_cleanup.sh
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== CLEANUP =="

TEST_MODE="${TEST_MODE:-fresh}"
if [[ "$TEST_MODE" != "fresh" ]]; then
  echo "FATAL: unsupported TEST_MODE='$TEST_MODE'. CURRENT contract is fresh-only."
  exit 1
fi

DID="$(get_state DOSSIER_ID)"
TOK="$(get_state DOSSIER_TOKEN)"
SESSION_TOK="$(get_state DOSSIER_SESSION_TOKEN)"

if [[ -z "${DID:-}" ]]; then
  echo "Nothing to cleanup (no DOSSIER_ID in state)."
  exit 0
fi

export DOSSIER_ID="$DID"

if [[ -n "${TOK:-}" ]]; then
  export DOSSIER_TOKEN="$TOK"
fi

if [[ -n "${SESSION_TOK:-}" ]]; then
  export DOSSIER_SESSION_TOKEN="$SESSION_TOK"
fi

require_dossier_session_token

FN_DELETE="$SUPABASE_URL/functions/v1/api-dossier-charger-delete"

CREATED_CSV="$(get_state CREATED_CHARGER_IDS)"
if [[ -n "${CREATED_CSV:-}" ]]; then
  IFS=, read -r -a CREATED_IDS <<< "$CREATED_CSV"

  echo "CLEANUP) pre-check created charger/doc rows..."
  for cid in "${CREATED_IDS[@]}"; do
    DOCS_FOR_CHARGER="$(count_documents_for_charger "$cid")"
    echo " - charger_id=$cid has docs before cleanup: $DOCS_FOR_CHARGER"
  done

  for cid in "${CREATED_IDS[@]}"; do
    rid="cleanup-chargerdelete-$(now_ts)"
    echo ""
    echo "CLEANUP) charger-delete — $cid"
    echo "request_id: $rid"

    RESP_DEL="$(http_call_with_idem \
      "$FN_DELETE" \
      "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"charger_id\":\"$cid\"}" \
      "$rid")"

    DEL_HTTP="$(extract_http_status "$RESP_DEL")"
    DEL_BODY="$(extract_body_json "$RESP_DEL")"

    if [[ "$DEL_HTTP" != "200" ]]; then
      echo "ASSERT FAIL: cleanup charger-delete expected 200 got $DEL_HTTP"
      print_json_safe_trunc "$DEL_BODY" 1200
      exit 1
    fi

    audit_assert_for_request_id "$rid" "charger_deleted" "" "" "CLEANUP charger-delete" || exit 1

    DOCS_FOR_CHARGER_AFTER="$(count_documents_for_charger "$cid")"
    if [[ "$DOCS_FOR_CHARGER_AFTER" != "0" ]]; then
      echo "ASSERT FAIL: cleanup cascade failed — dossier_documents rows still exist for charger_id=$cid"
      exit 1
    fi

    echo "OK deleted charger: $cid"
    echo "DB proof) docs after delete for charger_id=$cid: $DOCS_FOR_CHARGER_AFTER"
  done
fi

echo ""
echo "CLEANUP) verifying post-cleanup state for fresh dossier..."

CHARGERS_COUNT="$(count_charger_rows_for_dossier)"

DOCS_AFTER="$(curl -sS \
  --connect-timeout 10 --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_documents?select=id&dossier_id=eq.$DOSSIER_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

MAIL_AFTER="$(curl -sS \
  --connect-timeout 10 --max-time 30 \
  "$SUPABASE_URL/rest/v1/outbound_emails?select=id&dossier_id=eq.$DOSSIER_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

DOS_AFTER="$(curl -sS \
  --connect-timeout 10 --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossiers?select=id&id=eq.$DOSSIER_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

AUDIT_AFTER="$(curl -sS \
  --connect-timeout 10 --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_audit_events?select=id&dossier_id=eq.$DOSSIER_ID&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

DOCS_COUNT="$(printf "%s" "$DOCS_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)")"
MAIL_COUNT="$(printf "%s" "$MAIL_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)")"
DOS_COUNT="$(printf "%s" "$DOS_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)")"
AUDIT_COUNT="$(printf "%s" "$AUDIT_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)")"

if [[ "$CHARGERS_COUNT" != "0" ]]; then
  echo "FATAL: cleanup verify failed — dossier_chargers rows still exist for DOSSIER_ID=$DOSSIER_ID"
  exit 1
fi

if [[ "$DOCS_COUNT" != "0" ]]; then
  echo "FATAL: cleanup verify failed — dossier_documents rows still exist for DOSSIER_ID=$DOSSIER_ID"
  exit 1
fi

echo "CLEANUP) verify OK — mutable child rows removed."
echo "CLEANUP) retained dossier rows: $DOS_COUNT"
echo "CLEANUP) retained outbound_emails rows: $MAIL_COUNT"
echo "CLEANUP) retained audit rows: $AUDIT_COUNT"
echo "CLEANUP) dossier shell is intentionally retained because audit rows are immutable."
echo "PASS cleanup"