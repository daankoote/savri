# scripts/tests/06_upload_happy.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== HAPPY PATH UPLOADS =="

RUN_HAPPY_UPLOADS="${RUN_HAPPY_UPLOADS:-0}"
if [[ "$RUN_HAPPY_UPLOADS" != "1" ]]; then
  echo "SKIP happy uploads (RUN_HAPPY_UPLOADS=0)"
  exit 0
fi

FN_UPLOAD_URL="$SUPABASE_URL/functions/v1/api-dossier-upload-url"
FN_UPLOAD_CONFIRM="$SUPABASE_URL/functions/v1/api-dossier-upload-confirm"

CREATED_CSV="$(get_state CREATED_CHARGER_IDS)"
if [[ -z "${CREATED_CSV:-}" ]]; then
  echo "No happy uploads: no chargers created in this run (we NEVER touch existing chargers/docs)."
  exit 0
fi

IFS=, read -r -a CREATED_IDS <<< "$CREATED_CSV"
if [[ "${#CREATED_IDS[@]}" -eq 0 ]]; then
  echo "No happy uploads: created list empty."
  exit 0
fi

TMP_DIR="$(dirname "$0")/.tmp"
mkdir -p "$TMP_DIR"
TMP_FILE="$TMP_DIR/enval-devtest-upload.pdf"

# deterministic small file
printf "ENVAL DEVTEST PDF PLACEHOLDER\n" > "$TMP_FILE"
FILE_SIZE="$(wc -c < "$TMP_FILE" | tr -d ' ')"
FILE_SHA256="$(shasum -a 256 "$TMP_FILE" | awk '{print $1}')"

if [[ -z "${FILE_SHA256:-}" ]]; then
  echo "FATAL: could not compute FILE_SHA256"
  exit 1
fi

echo "Happy file: $TMP_FILE (size=$FILE_SIZE sha256=$FILE_SHA256)"
echo "Happy scope: only CREATED_CHARGER_IDS (${#CREATED_IDS[@]} chargers)"

DOC_TYPES=("factuur" "foto_laadpunt")

HAPPY_DOCS_CREATED=0
HAPPY_PUT_OK=0
HAPPY_CONFIRM_OK=0

DOCS_BEFORE="$(count_documents_for_dossier)"
if [[ -z "${DOCS_BEFORE:-}" ]]; then
  echo "FATAL: could not read dossier_documents count before happy uploads"
  exit 1
fi

echo "DB proof) dossier_documents before happy uploads: $DOCS_BEFORE"

for cid in "${CREATED_IDS[@]}"; do
  echo ""
  echo "Charger (created this run): $cid"
  echo "--------------------------------"

  for dt in "${DOC_TYPES[@]}"; do
    rid_url="happy-uploadurl-$dt-$(now_ts)"

    echo ""
    echo "upload-url doc_type=$dt"
    echo "request_id: $rid_url"

    RESP_URL="$(http_call_with_idem \
      "$FN_UPLOAD_URL" \
      "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"doc_type\":\"$dt\",\"filename\":\"devtest-$dt-$cid.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":$FILE_SIZE,\"charger_id\":\"$cid\"}" \
      "$rid_url")"

    HTTP_URL="$(extract_http_status "$RESP_URL")"
    BODY_URL="$(extract_body_json "$RESP_URL")"

    if [[ "$HTTP_URL" != "200" ]]; then
      echo "ASSERT FAIL: upload-url expected 200, got $HTTP_URL (doc_type=$dt charger=$cid)"
      echo "BODY:"
      print_json_safe_trunc "$BODY_URL" 1200
      exit 1
    fi

    # audit evidence: we don't pin event_type here (avoid drift), but we REQUIRE audit row exists for rid
    audit_assert_for_request_id "$rid_url" "" "" "" "HAPPY upload-url ($dt)" || exit 1

    DOC_ID="$(echo "$BODY_URL" | sed -n 's/.*"document_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    SIGNED_URL="$(echo "$BODY_URL" | sed -n 's/.*"signed_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    PATH_HP="$(echo "$BODY_URL" | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

    if [[ -z "${DOC_ID:-}" || -z "${SIGNED_URL:-}" || -z "${PATH_HP:-}" ]]; then
      echo "ASSERT FAIL: upload-url missing document_id/signed_url/path (doc_type=$dt charger=$cid)"
      echo "BODY:"
      echo "$BODY_URL"
      exit 1
    fi

    echo "OK upload-url: document_id=$DOC_ID"
    echo "OK upload-url: path=$PATH_HP"

    echo "PUT -> signed_url"
    PUT_RESP="$(curl -s -i -X PUT "$SIGNED_URL" \
      -H "Content-Type: application/pdf" \
      --data-binary @"$TMP_FILE")"

    PUT_HTTP="$(extract_http_status "$PUT_RESP")"
    print_resp_head "$PUT_RESP" 15

    if [[ "$PUT_HTTP" != "200" ]]; then
      echo "ASSERT FAIL: storage PUT expected 200, got $PUT_HTTP (doc_type=$dt charger=$cid)"
      exit 1
    fi

    rid_conf="happy-uploadconfirm-$dt-$(now_ts)"
    echo "upload-confirm request_id: $rid_conf"

    RESP_CONF="$(http_call_with_idem \
      "$FN_UPLOAD_CONFIRM" \
      "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"document_id\":\"$DOC_ID\",\"file_sha256\":\"$FILE_SHA256\"}" \
      "$rid_conf")"

    HTTP_CONF="$(extract_http_status "$RESP_CONF")"
    BODY_CONF="$(extract_body_json "$RESP_CONF")"
    print_resp_head "$RESP_CONF" 25

    if [[ "$HTTP_CONF" != "200" ]]; then
      echo "ASSERT FAIL: upload-confirm expected 200, got $HTTP_CONF (doc_type=$dt charger=$cid)"
      echo "BODY:"
      print_json_safe_trunc "$BODY_CONF" 1200
      exit 1
    fi

    audit_assert_for_request_id "$rid_conf" "" "" "" "HAPPY upload-confirm ($dt)" || exit 1

    assert_document_row_confirmed \
      "$DOC_ID" \
      "$cid" \
      "$dt" \
      "$FILE_SHA256" \
      "HAPPY DB row confirmed ($dt)" || exit 1

    echo "DB proof) confirmed row ok for document_id=$DOC_ID"

    HAPPY_DOCS_CREATED=$((HAPPY_DOCS_CREATED+1))
    HAPPY_PUT_OK=$((HAPPY_PUT_OK+1))
    HAPPY_CONFIRM_OK=$((HAPPY_CONFIRM_OK+1))
  done
done

DOCS_AFTER="$(count_documents_for_dossier)"
if [[ -z "${DOCS_AFTER:-}" ]]; then
  echo "FATAL: could not read dossier_documents count after happy uploads"
  exit 1
fi

EXPECTED_DOCS_AFTER=$((DOCS_BEFORE + HAPPY_DOCS_CREATED))

if [[ "$DOCS_AFTER" != "$EXPECTED_DOCS_AFTER" ]]; then
  echo "ASSERT FAIL: dossier_documents count mismatch after happy uploads"
  echo "before:   $DOCS_BEFORE"
  echo "created:  $HAPPY_DOCS_CREATED"
  echo "expected: $EXPECTED_DOCS_AFTER"
  echo "actual:   $DOCS_AFTER"
  exit 1
fi

echo ""
echo "PASS happy uploads"
echo "Happy docs (expected 2 * created_chargers): $HAPPY_DOCS_CREATED"
echo "Storage PUT ok: $HAPPY_PUT_OK"
echo "Upload-confirm ok: $HAPPY_CONFIRM_OK"
echo "DB proof) dossier_documents after happy uploads: $DOCS_AFTER"