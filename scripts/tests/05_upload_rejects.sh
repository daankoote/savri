# scripts/tests/05_upload_rejects.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== UPLOAD REJECT TESTS =="

FN_UPLOAD_URL="$SUPABASE_URL/functions/v1/api-dossier-upload-url"
FN_UPLOAD_CONFIRM="$SUPABASE_URL/functions/v1/api-dossier-upload-confirm"

CHARGER_ID="$(get_state CHARGER_ID)"
if [[ -z "${CHARGER_ID:-}" ]]; then
  echo "FATAL: CHARGER_ID missing from setup state"
  exit 1
fi

echo ""
echo "== Upload URL rejects =="

ridA="uploadurl-missing-idem-$(now_ts)"
echo ""
echo "A) Missing Idempotency-Key (expect 400)"
RESP_A="$(http_call_no_idem "$FN_UPLOAD_URL" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"doc_type\":\"factuur\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123,\"charger_id\":\"$CHARGER_ID\"}" \
  "$ridA")"
HTTP_A="$(extract_http_status "$RESP_A")"
if [[ "$HTTP_A" != "400" ]]; then
  echo "ASSERT FAIL: expected HTTP 400, got $HTTP_A"
  echo "$(extract_body_json "$RESP_A")"
  exit 1
fi
echo "PASS upload-url missing idem"

run_case \
  "B) Invalid doc_type (expect 400 + audit reject)" \
  "$FN_UPLOAD_URL" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"doc_type\":\"hacker\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123,\"charger_id\":\"$CHARGER_ID\"}" \
  "uploadurl-invalid-doctype" \
  "400" \
  "yes" \
  "document_upload_url_rejected" \
  "validate_doc_type" \
  "" || exit 1

echo "PASS upload-url invalid doc_type"

run_case \
  "C) Missing charger_id (expect 400 + audit reject)" \
  "$FN_UPLOAD_URL" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"doc_type\":\"factuur\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123}" \
  "uploadurl-missing-charger" \
  "400" \
  "yes" \
  "document_upload_url_rejected" \
  "validate_charger_id" \
  "" || exit 1

echo "PASS upload-url missing charger_id"

echo ""
echo "== Upload Confirm rejects =="

run_case \
  "D) Missing fields (expect 400 + audit reject)" \
  "$FN_UPLOAD_CONFIRM" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\"}" \
  "uploadconfirm-missing-fields" \
  "400" \
  "yes" \
  "document_upload_confirm_rejected" \
  "validate_input" \
  "" || exit 1

echo "PASS upload-confirm missing fields"

run_case \
  "E) Unauthorized (expect 401 + audit reject)" \
  "$FN_UPLOAD_CONFIRM" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"badtoken\",\"document_id\":\"00000000-0000-0000-0000-000000000000\",\"file_sha256\":\"$(printf '0%.0s' {1..64})\"}" \
  "uploadconfirm-unauth" \
  "401" \
  "yes" \
  "document_upload_confirm_rejected" \
  "auth" \
  "session_not_found" || exit 1

echo "PASS upload-confirm unauthorized"

run_case \
  "F) Upload-confirm (EXPECTED 404 Document not found for fake document_id)" \
  "$FN_UPLOAD_CONFIRM" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"session_token\":\"$(dossier_session_token)\",\"document_id\":\"00000000-0000-0000-0000-000000000000\",\"file_sha256\":\"$(printf '0%.0s' {1..64})\"}" \
  "uploadconfirm-doc-notfound" \
  "404" \
  "yes" \
  "document_upload_confirm_rejected" \
  "doc_lookup" \
  "not_found" || exit 1

echo "PASS upload-confirm doc-notfound"