# /Users/daankoote/dev/enval/scripts/tools/verify-analysis-run.sh


#!/usr/bin/env bash
set -euo pipefail
trap 'echo "FATAL: verify-analysis-run.sh crashed at line $LINENO" >&2; exit 1' ERR

REPO_ROOT="/Users/daankoote/dev/enval"
OUT_DIR="$REPO_ROOT/scripts/tools/output"
OUT_FILE="$OUT_DIR/latest-analysis-verify.log"

mkdir -p "$OUT_DIR"

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env: $name" >&2
    exit 1
  fi
}

need SUPABASE_URL
need API_BASE
need SUPABASE_ANON_KEY
need SUPABASE_SERVICE_ROLE_KEY
need DOSSIER_ID
need DOSSIER_SESSION_TOKEN

if ! command -v jq >/dev/null 2>&1; then
  echo "Missing required tool: jq" >&2
  exit 1
fi

RID="analysis-verify-$(date +%s)"
IDEM_KEY="analysis-verify-$(date +%s)"

VERIFY_PAYLOAD="$(cat <<JSON
{
  "dossier_id": "$DOSSIER_ID",
  "session_token": "$DOSSIER_SESSION_TOKEN",
  "mode": "refresh"
}
JSON
)"

log() {
  echo "$@" | tee -a "$OUT_FILE"
}

section() {
  echo "" | tee -a "$OUT_FILE"
  echo "================================================================" | tee -a "$OUT_FILE"
  echo "$@" | tee -a "$OUT_FILE"
  echo "================================================================" | tee -a "$OUT_FILE"
}

json_pretty_to_log() {
  local raw="$1"
  echo "$raw" | jq | tee -a "$OUT_FILE"
}

write_field_review_block() {
  local title="$1"
  local raw_json="$2"

  section "$title"

  local count
  count="$(echo "$raw_json" | jq 'length')"

  if [[ "$count" == "0" ]]; then
    log "(none)"
    return
  fi

  echo "$raw_json" | jq -r '
    def compact(v):
      if (v == null) then "null"
      elif (v | type) == "object" or (v | type) == "array" then (v | tojson)
      else (v | tostring)
      end;

    def expected_value:
      if .analysis_code == "invoice_address_match" then
        ("street=" + compact(.declared_value.street)
        + ", house_number=" + compact(.declared_value.house_number)
        + ", suffix=" + compact(.declared_value.suffix)
        + ", postcode=" + compact(.declared_value.postcode)
        + ", city=" + compact(.declared_value.city))
      elif .analysis_code == "invoice_brand_match" then
        compact(.declared_value.brand)
      elif .analysis_code == "invoice_model_match" then
        compact(.declared_value.model)
      elif .analysis_code == "invoice_serial_match" then
        compact(.declared_value.serial_number)
      elif .analysis_code == "invoice_mid_match" then
        compact(.declared_value.mid_number)
      elif .analysis_code == "photo_brand_match" then
        compact(.declared_value.brand)
      elif .analysis_code == "photo_model_match" then
        compact(.declared_value.model)
      elif .analysis_code == "photo_serial_match" then
        compact(.declared_value.serial_number)
      elif .analysis_code == "photo_mid_match" then
        compact(.declared_value.mid_number)
      elif .analysis_code == "photo_charger_visible" then
        "{}"
      else
        (.declared_value | tojson)
      end;

    def observed_value_human:
      if .analysis_code == "invoice_address_match" then
        ("street=" + compact(.observed_value.street)
        + ", house_number=" + compact(.observed_value.house_number)
        + ", suffix=" + compact(.observed_value.suffix)
        + ", postcode=" + compact(.observed_value.postcode)
        + ", city=" + compact(.observed_value.city))
      elif .analysis_code == "invoice_brand_match" then
        compact(.observed_value.brand)
      elif .analysis_code == "invoice_model_match" then
        compact(.observed_value.model)
      elif .analysis_code == "invoice_serial_match" then
        compact(.observed_value.serial_number)
      elif .analysis_code == "invoice_mid_match" then
        compact(.observed_value.mid_number)
      elif .analysis_code == "photo_brand_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_model_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_serial_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_mid_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_charger_visible" then
        (.observed_value | tojson)
      else
        (.observed_value | tojson)
      end;

    .[] |
    [
      "- analysis_code=" + .analysis_code,
      "  charger_id=" + .charger_id,
      "  source_document_id=" + (.source_document_id // "null"),
      "  status=" + .status,
      "  observed=" + observed_value_human,
      "  expected_db=" + expected_value,
      "  reason=" + ((.evaluation_details.reason // .evaluation_details.mode // "null") | tostring)
    ] | join("\n")
  ' | tee -a "$OUT_FILE"
}

write_document_trace_block() {
  local docs_json="$1"
  local fail_json="$2"
  local inconclusive_json="$3"
  local pass_json="$4"
  local not_checked_json="$5"

  section "STEP 11 — DOCUMENT → CHARGER TRACE"

  local doc_count
  doc_count="$(echo "$docs_json" | jq 'length')"

  if [[ "$doc_count" == "0" ]]; then
    log "(none)"
    return
  fi

  local trace_json
  trace_json="$(
    jq -n \
      --argjson docs "$docs_json" \
      --argjson fail "$fail_json" \
      --argjson inconclusive "$inconclusive_json" \
      --argjson pass "$pass_json" \
      --argjson not_checked "$not_checked_json" '
      def rows_for_doc($doc_id):
        (($fail + $inconclusive + $pass + $not_checked)
          | map(select(.source_document_id == $doc_id)));

      $docs
      | map(
          . as $doc
          | {
              document_id: $doc.document_id,
              charger_id: $doc.charger_id,
              doc_type: $doc.doc_type,
              analysis_kind: $doc.analysis_kind,
              status: $doc.status,
              observed_fields: ($doc.observed_fields // {}),
              limitations: ($doc.limitations // []),
              summary: ($doc.summary // {}),
              charger_results: rows_for_doc($doc.document_id)
            }
        )
    '
  )"

  echo "$trace_json" | jq -r '
    def compact(v):
      if (v == null) then "null"
      elif (v | type) == "object" or (v | type) == "array" then (v | tojson)
      else (v | tostring)
      end;

    def expected_value:
      if .analysis_code == "invoice_address_match" then
        ("street=" + compact(.declared_value.street)
        + ", house_number=" + compact(.declared_value.house_number)
        + ", suffix=" + compact(.declared_value.suffix)
        + ", postcode=" + compact(.declared_value.postcode)
        + ", city=" + compact(.declared_value.city))
      elif .analysis_code == "invoice_brand_match" then
        compact(.declared_value.brand)
      elif .analysis_code == "invoice_model_match" then
        compact(.declared_value.model)
      elif .analysis_code == "invoice_serial_match" then
        compact(.declared_value.serial_number)
      elif .analysis_code == "invoice_mid_match" then
        compact(.declared_value.mid_number)
      elif .analysis_code == "photo_brand_match" then
        compact(.declared_value.brand)
      elif .analysis_code == "photo_model_match" then
        compact(.declared_value.model)
      elif .analysis_code == "photo_serial_match" then
        compact(.declared_value.serial_number)
      elif .analysis_code == "photo_mid_match" then
        compact(.declared_value.mid_number)
      elif .analysis_code == "photo_charger_visible" then
        "{}"
      else
        (.declared_value | tojson)
      end;

    def observed_value_human:
      if .analysis_code == "invoice_address_match" then
        ("street=" + compact(.observed_value.street)
        + ", house_number=" + compact(.observed_value.house_number)
        + ", suffix=" + compact(.observed_value.suffix)
        + ", postcode=" + compact(.observed_value.postcode)
        + ", city=" + compact(.observed_value.city))
      elif .analysis_code == "invoice_brand_match" then
        compact(.observed_value.brand)
      elif .analysis_code == "invoice_model_match" then
        compact(.observed_value.model)
      elif .analysis_code == "invoice_serial_match" then
        compact(.observed_value.serial_number)
      elif .analysis_code == "invoice_mid_match" then
        compact(.observed_value.mid_number)
      elif .analysis_code == "photo_brand_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_model_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_serial_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_mid_match" then
        (.observed_value | tojson)
      elif .analysis_code == "photo_charger_visible" then
        (.observed_value | tojson)
      else
        (.observed_value | tojson)
      end;

    .[] |
    (
      [
        "- document_id=" + .document_id,
        "  charger_id=" + (.charger_id // "null"),
        "  doc_type=" + .doc_type,
        "  analysis_kind=" + .analysis_kind,
        "  status=" + .status,
        "  filename=" + ((.summary.filename // "null") | tostring),
        "  extraction_source=" + ((.summary.extraction_source // "null") | tostring),
        "  observed_fields=" + ((.observed_fields // {}) | tojson),
        "  limitations=" + ((.limitations // []) | tojson)
      ] | join("\n")
    ),
    (
      if ((.charger_results | length) == 0) then
        "  charger_results=(none)"
      else
        (
          "  charger_results:" + "\n" +
          (
            .charger_results
            | sort_by(.analysis_code)
            | map(
                [
                  "    - analysis_code=" + .analysis_code,
                  "      status=" + .status,
                  "      observed=" + observed_value_human,
                  "      expected_db=" + expected_value,
                  "      reason=" + ((.evaluation_details.reason // .evaluation_details.mode // "null") | tostring)
                ] | join("\n")
              )
            | join("\n")
          )
        )
      end
    ),
    ""
  ' | tee -a "$OUT_FILE"
}

: > "$OUT_FILE"

section "ENVAL ANALYSIS VERIFY RUN"
log "timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "repo_root: $REPO_ROOT"
log "dossier_id: $DOSSIER_ID"
log "request_id: $RID"
log "idempotency_key: $IDEM_KEY"
log "session_token_source: existing_env"
log "mail_request_performed: no"
log "output_file: $OUT_FILE"

section "STEP 1 — CALL api-dossier-verify"

VERIFY_RESPONSE="$(
  curl -sS \
    -w "\nHTTP_STATUS:%{http_code}\n" \
    -X POST "$API_BASE/api-dossier-verify" \
    -H "Content-Type: application/json" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "X-Request-Id: $RID" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d "$VERIFY_PAYLOAD"
)"

echo "$VERIFY_RESPONSE" | tee -a "$OUT_FILE"

HTTP_STATUS="$(echo "$VERIFY_RESPONSE" | sed -n 's/^HTTP_STATUS://p' | tail -n1)"
VERIFY_BODY="$(echo "$VERIFY_RESPONSE" | sed '/^HTTP_STATUS:/d')"

if [[ "$HTTP_STATUS" != "200" ]]; then
  section "FAIL"
  log "api-dossier-verify returned non-200"
  exit 1
fi

RUN_ID="$(echo "$VERIFY_BODY" | jq -r '.run_id // empty')"
ANALYSIS_STATUS="$(echo "$VERIFY_BODY" | jq -r '.analysis_status // empty')"

if [[ -z "$RUN_ID" ]]; then
  section "FAIL"
  log "run_id missing in verify response"
  exit 1
fi

section "STEP 2 — EXTRACT CORE RESPONSE FIELDS"
log "http_status: $HTTP_STATUS"
log "run_id: $RUN_ID"
log "analysis_status: $ANALYSIS_STATUS"
log "documents_seen: $(echo "$VERIFY_BODY" | jq -r '.analysis_run.documents_seen // "null"')"
log "supported_documents_seen: $(echo "$VERIFY_BODY" | jq -r '.analysis_run.supported_documents_seen // "null"')"
log "document_analyses_completed: $(echo "$VERIFY_BODY" | jq -r '.analysis_run.document_analyses_completed // "null"')"
log "document_analyses_failed: $(echo "$VERIFY_BODY" | jq -r '.analysis_run.document_analyses_failed // "null"')"
log "charger_results_written: $(echo "$VERIFY_BODY" | jq -r '.analysis_run.charger_results_written // "null"')"
log "summary_written: $(echo "$VERIFY_BODY" | jq -r '.analysis_run.summary_written // "null"')"

section "STEP 3 — FETCH SUMMARY ROW"

SUMMARY_JSON="$(
  curl -sS \
    "$SUPABASE_URL/rest/v1/dossier_analysis_summary?run_id=eq.$RUN_ID&select=run_id,overall_status,summary,limitations" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept: application/json"
)"

json_pretty_to_log "$SUMMARY_JSON"

SUMMARY_COUNT="$(echo "$SUMMARY_JSON" | jq 'length')"
if [[ "$SUMMARY_COUNT" != "1" ]]; then
  section "FAIL"
  log "Expected exactly 1 summary row, got $SUMMARY_COUNT"
  exit 1
fi

SUMMARY_STATUS="$(echo "$SUMMARY_JSON" | jq -r '.[0].overall_status')"
SUMMARY_FAIL_COUNT="$(echo "$SUMMARY_JSON" | jq -r '.[0].summary.charger_analysis.fail // 0')"
SUMMARY_PASS_COUNT="$(echo "$SUMMARY_JSON" | jq -r '.[0].summary.charger_analysis.pass // 0')"
SUMMARY_INCONCLUSIVE_COUNT="$(echo "$SUMMARY_JSON" | jq -r '.[0].summary.charger_analysis.inconclusive // 0')"
SUMMARY_NOT_CHECKED_COUNT="$(echo "$SUMMARY_JSON" | jq -r '.[0].summary.charger_analysis.not_checked // 0')"
SUMMARY_TOTAL_COUNT="$(echo "$SUMMARY_JSON" | jq -r '.[0].summary.charger_analysis.total // 0')"

section "STEP 4 — FETCH DOCUMENT ANALYSIS ROWS"

DOCUMENT_ROWS_JSON="$(
  curl -sS \
    "$SUPABASE_URL/rest/v1/dossier_analysis_document?run_id=eq.$RUN_ID&select=document_id,charger_id,doc_type,analysis_kind,status,observed_fields,limitations,summary&order=charger_id.asc,document_id.asc" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept: application/json"
)"

json_pretty_to_log "$DOCUMENT_ROWS_JSON"
DOCUMENT_ROWS_COUNT="$(echo "$DOCUMENT_ROWS_JSON" | jq 'length')"

section "STEP 5 — FETCH FAIL ROWS"

FAIL_ROWS_JSON="$(
  curl -sS \
    "$SUPABASE_URL/rest/v1/dossier_analysis_charger?run_id=eq.$RUN_ID&status=eq.fail&select=charger_id,source_document_id,analysis_code,status,declared_value,observed_value,evaluation_details&order=charger_id.asc,analysis_code.asc" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept: application/json"
)"

json_pretty_to_log "$FAIL_ROWS_JSON"
FAIL_COUNT="$(echo "$FAIL_ROWS_JSON" | jq 'length')"

section "STEP 6 — FETCH INCONCLUSIVE ROWS"

INCONCLUSIVE_ROWS_JSON="$(
  curl -sS \
    "$SUPABASE_URL/rest/v1/dossier_analysis_charger?run_id=eq.$RUN_ID&status=eq.inconclusive&select=charger_id,source_document_id,analysis_code,status,declared_value,observed_value,evaluation_details&order=charger_id.asc,analysis_code.asc" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept: application/json"
)"

json_pretty_to_log "$INCONCLUSIVE_ROWS_JSON"
INCONCLUSIVE_COUNT="$(echo "$INCONCLUSIVE_ROWS_JSON" | jq 'length')"

section "STEP 7 — FETCH PASS ROWS"

PASS_ROWS_JSON="$(
  curl -sS \
    "$SUPABASE_URL/rest/v1/dossier_analysis_charger?run_id=eq.$RUN_ID&status=eq.pass&select=charger_id,source_document_id,analysis_code,status,declared_value,observed_value,evaluation_details&order=charger_id.asc,analysis_code.asc" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept: application/json"
)"

json_pretty_to_log "$PASS_ROWS_JSON"
PASS_COUNT="$(echo "$PASS_ROWS_JSON" | jq 'length')"

section "STEP 8 — FETCH NOT_CHECKED ROWS"

NOT_CHECKED_ROWS_JSON="$(
  curl -sS \
    "$SUPABASE_URL/rest/v1/dossier_analysis_charger?run_id=eq.$RUN_ID&status=eq.not_checked&select=charger_id,source_document_id,analysis_code,status,declared_value,observed_value,evaluation_details&order=charger_id.asc,analysis_code.asc" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept: application/json"
)"

json_pretty_to_log "$NOT_CHECKED_ROWS_JSON"
NOT_CHECKED_COUNT="$(echo "$NOT_CHECKED_ROWS_JSON" | jq 'length')"

section "STEP 9 — HUMAN SUMMARY"
log "run_id: $RUN_ID"
log "overall_status: $SUMMARY_STATUS"
log "document_rows_total: $DOCUMENT_ROWS_COUNT"
log "summary_total: $SUMMARY_TOTAL_COUNT"
log "summary_fail: $SUMMARY_FAIL_COUNT"
log "summary_pass: $SUMMARY_PASS_COUNT"
log "summary_inconclusive: $SUMMARY_INCONCLUSIVE_COUNT"
log "summary_not_checked: $SUMMARY_NOT_CHECKED_COUNT"
log "rows_fail: $FAIL_COUNT"
log "rows_pass: $PASS_COUNT"
log "rows_inconclusive: $INCONCLUSIVE_COUNT"
log "rows_not_checked: $NOT_CHECKED_COUNT"

echo "" | tee -a "$OUT_FILE"
echo "FAIL ANALYSIS CODES:" | tee -a "$OUT_FILE"
echo "$FAIL_ROWS_JSON" | jq -r '.[] | "- " + .analysis_code + " | charger=" + .charger_id' | tee -a "$OUT_FILE"

echo "" | tee -a "$OUT_FILE"
echo "INCONCLUSIVE ANALYSIS CODES:" | tee -a "$OUT_FILE"
echo "$INCONCLUSIVE_ROWS_JSON" | jq -r '.[] | "- " + .analysis_code + " | charger=" + .charger_id' | tee -a "$OUT_FILE"

echo "" | tee -a "$OUT_FILE"
echo "PASS ANALYSIS CODES:" | tee -a "$OUT_FILE"
echo "$PASS_ROWS_JSON" | jq -r '.[] | "- " + .analysis_code + " | charger=" + .charger_id' | tee -a "$OUT_FILE"

echo "" | tee -a "$OUT_FILE"
echo "NOT_CHECKED ANALYSIS CODES:" | tee -a "$OUT_FILE"
echo "$NOT_CHECKED_ROWS_JSON" | jq -r '.[] | "- " + .analysis_code + " | charger=" + .charger_id' | tee -a "$OUT_FILE"

section "STEP 10 — DOCUMENT EXTRACTION REVIEW (RAW OBSERVED_FIELDS)"
echo "$DOCUMENT_ROWS_JSON" | jq -r '
  .[] |
  [
    "- document_id=" + .document_id,
    "  charger_id=" + (.charger_id // "null"),
    "  doc_type=" + .doc_type,
    "  analysis_kind=" + .analysis_kind,
    "  status=" + .status,
    "  observed_fields=" + ((.observed_fields // {}) | tojson),
    "  limitations=" + ((.limitations // []) | tojson),
    "  summary=" + ((.summary // {}) | tojson)
  ] | join("\n")
' | tee -a "$OUT_FILE"

write_document_trace_block \
  "$DOCUMENT_ROWS_JSON" \
  "$FAIL_ROWS_JSON" \
  "$INCONCLUSIVE_ROWS_JSON" \
  "$PASS_ROWS_JSON" \
  "$NOT_CHECKED_ROWS_JSON"

write_field_review_block "STEP 12 — FIELD REVIEW — FAIL (OBSERVED VS EXPECTED_DB)" "$FAIL_ROWS_JSON"
write_field_review_block "STEP 13 — FIELD REVIEW — INCONCLUSIVE (OBSERVED VS EXPECTED_DB)" "$INCONCLUSIVE_ROWS_JSON"
write_field_review_block "STEP 14 — FIELD REVIEW — PASS (OBSERVED VS EXPECTED_DB)" "$PASS_ROWS_JSON"

section "DONE"
log "Latest analysis verify log written to:"
log "$OUT_FILE"