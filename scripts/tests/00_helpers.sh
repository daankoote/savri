# scripts/tests/00_helpers.sh

#!/usr/bin/env bash
set -euo pipefail

# --- HARD SAFETY: never allow bash xtrace to leak headers/tokens ---
set +x 2>/dev/null || true

# --- REDACTION: never print secrets to stdout ---
redact() {
  # Reads stdin, prints sanitized output (secrets + PII)
  sed -E \
    -e 's/(Authorization:[[:space:]]*Bearer[[:space:]]+)[^[:space:]]+/\1[REDACTED]/Ig' \
    -e 's/(apikey:[[:space:]]*)[^[:space:]]+/\1[REDACTED]/Ig' \
    -e 's/("token"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/Ig' \
    -e 's/("access_token"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/Ig' \
    -e 's/("access_token_hash"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/Ig' \
    -e 's/("actor_ref"[[:space:]]*:[[:space:]]*"dossier:[^|"]+\|token:)[^"]+"/\1[REDACTED]"/Ig' \
    -e 's/("ip"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED_IP]/Ig' \
    -e 's/("ua"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED_UA]/Ig' \
    -e 's/("to_email"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED_EMAIL]/Ig' \
    -e 's/("email"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED_EMAIL]/Ig' \
    -e 's/("provider_id"[[:space:]]*:[[:space:]]*")[^"]+/\1[REDACTED]/Ig' \
    -e 's/([?&](token|sig|signature|X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token)=)[^&"]+/\1[REDACTED]/Ig'
}

print_safe() {
  # usage: print_safe "$maybe_sensitive_string"
  printf "%s\n" "${1:-}" | redact
}

print_resp_head() {
  # usage: print_resp_head "$resp" [lines]
  local resp="${1:-}"
  local n="${2:-30}"
  printf "%s\n" "$resp" | redact | sed -n "1,${n}p"
}

print_json_safe_trunc() {
  # usage: print_json_safe_trunc "$json" [chars]
  local json="${1:-}"
  local n="${2:-1200}"
  printf "%s\n" "$json" | redact | head -c "$n"
  echo ""
}

# ----------------------------
# Auto-load env when running scripts directly
# ----------------------------
DIR_HELPERS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR_HELPERS/../.." && pwd)"

ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.local}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# ================================================================
# ENVAL — test helpers (shared)
# - state file: /tmp/enval_test_state
# - no jq dependency
# - sha256 via openssl (requested)
# ================================================================

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: env var missing: $name"
    exit 1
  fi
}

now_ts() { date +%s; }
now_iso_utc() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }


# START_ISO must exist for audit fetchers; set if missing (for direct script runs)
if [[ -z "${START_ISO:-}" ]]; then
  export START_ISO="$(now_iso_utc)"
fi

# -------------------------
# State file
# -------------------------
TEST_STATE_FILE="/tmp/enval_test_state"

reset_state() { rm -f "$TEST_STATE_FILE"; }

set_state() {
  local key="$1"
  local value="$2"
  echo "${key}=${value}" >> "$TEST_STATE_FILE"
}

get_state() {
  local key="$1"
  local value=""

  if [[ ! -f "$TEST_STATE_FILE" ]]; then
    echo ""
    return 0
  fi

  value="$(grep -E "^${key}=" "$TEST_STATE_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  printf "%s" "$value"
}

dossier_token() {
  # Prefer token from state (set by 01_setup.sh TOKEN_RESET)
  local t
  t="$(get_state DOSSIER_TOKEN)"
  if [[ -z "${t:-}" ]]; then
    t="${DOSSIER_TOKEN:-}"
  fi

  # HARD: strip CR/LF and surrounding whitespace
  # (prevents sha256 mismatch vs Deno if token file has newline)
  t="$(printf "%s" "$t" | tr -d '\r\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  printf "%s" "$t"
}

require_dossier_token() {
  local t
  t="$(dossier_token)"
  if [[ -z "${t:-}" ]]; then
    echo "FATAL: dossier_token() is empty (state+env)."
    echo "Hint: run_all.sh must set TOKEN_RESET=1 and 01_setup.sh must set_state DOSSIER_TOKEN."
    exit 1
  fi
}

# -------------------------
# Session-token helpers (CURRENT runtime auth)
# -------------------------
# DOSSIER_TOKEN blijft alleen voor initial link-token exchange/debug.
# DOSSIER_SESSION_TOKEN is canonical voor dossier runtime endpoints.

dossier_session_token() {
  local t
  t="$(get_state DOSSIER_SESSION_TOKEN)"
  if [[ -z "${t:-}" ]]; then
    t="${DOSSIER_SESSION_TOKEN:-}"
  fi
  t="$(printf "%s" "$t" | tr -d '\r\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  printf "%s" "$t"
}

require_dossier_session_token() {
  local t
  t="$(dossier_session_token)"
  if [[ -z "${t:-}" ]]; then
    echo "FATAL: dossier_session_token() is empty (state+env)."
    exit 1
  fi
}

bootstrap_session_from_link_token() {
  local fn_get="$SUPABASE_URL/functions/v1/api-dossier-get"
  local token
  token="$(dossier_token)"

  if [[ -z "${DOSSIER_ID:-}" ]]; then
    echo "FATAL: DOSSIER_ID missing for session bootstrap"
    exit 1
  fi

  if [[ -z "${token:-}" ]]; then
    echo "FATAL: DOSSIER_TOKEN missing for session bootstrap"
    exit 1
  fi

  local rid resp http body session_token
  rid="bootstrap-session-$(now_ts)"

  resp="$(http_call_with_idem \
    "$fn_get" \
    "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$token\"}" \
    "$rid")"

  http="$(extract_http_status "$resp")"
  body="$(extract_body_json "$resp")"

  if [[ "$http" != "200" ]]; then
    echo "FATAL: session bootstrap expected 200 got $http"
    echo "BODY:"
    print_json_safe_trunc "$body" 1200
    exit 1
  fi

  session_token="$(printf "%s" "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_token',''))")"

  if [[ -z "${session_token:-}" ]]; then
    echo "FATAL: api-dossier-get returned 200 but no session_token"
    print_json_safe_trunc "$body" 1200
    exit 1
  fi

  set_state DOSSIER_SESSION_TOKEN "$session_token"
  echo "OK session bootstrap complete"
}

# -------------------------
# HTTP parsing
# -------------------------
extract_http_status() {
  echo "$1" | head -n 1 | awk '{print $2}' | tr -d '\r'
}

extract_body_json() {
  echo "$1" | awk 'BEGIN{p=0} /^\{/ {p=1} {if(p) print $0}'
}

# -------------------------
# sha256 (openssl)
# -------------------------
sha256_file() {
  local file="$1"
  openssl dgst -sha256 "$file" | awk '{print $2}'
}

sha256_str() {
  # sha256 of a string, hex output
  local s="${1:-}"
  printf "%s" "$s" | openssl dgst -sha256 | awk '{print $2}'
}

get_dossier_access_token_hash() {
  # returns dossiers.access_token_hash (service role)
  curl -sS \
    --connect-timeout 10 \
    --max-time 30 \
    "$SUPABASE_URL/rest/v1/dossiers?select=access_token_hash&id=eq.$DOSSIER_ID&limit=1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); v=(d[0].get('access_token_hash') if d else None); print('' if v is None else str(v))"
}

assert_token_matches_db() {
  # hard proof: sha256(token) == dossiers.access_token_hash
  local t
  t="$(dossier_token)"

  if [[ -z "${t:-}" ]]; then
    echo "FATAL: DOSSIER_TOKEN empty (state+env)."
    exit 1
  fi

  local want got
  want="$(sha256_str "$t")"
  got="$(get_dossier_access_token_hash || true)"

  if [[ -z "${got:-}" ]]; then
    echo "FATAL: dossiers.access_token_hash is empty/null in DB after TOKEN_RESET."
    exit 1
  fi

  if [[ "$want" != "$got" ]]; then
    echo "FATAL: DOSSIER_TOKEN does NOT match DB access_token_hash."
    echo "sha256(token) prefix: ${want:0:16}..."
    echo "db hash prefix:       ${got:0:16}..."
    exit 1
  fi

  # safe evidence (no secrets)
  echo "OK token/hash match (sha256 prefix ${want:0:16}...)"
}
# -------------------------
# Safe printing (always redacted)
# -------------------------
print_lines() {
  local n="${1:-40}"
  sed -n "1,${n}p" | redact
}

# -------------------------
# HTTP helpers (timeouts + retry on transient errors)
# -------------------------

http_call_with_idem() {
  local url="$1"
  local data="$2"
  local idem="$3"

  if [[ -z "${url:-}" ]]; then
    echo "FATAL: http_call_with_idem missing url"
    return 2
  fi

  curl -sS -i \
    --connect-timeout 10 \
    --max-time 30 \
    --retry 2 \
    --retry-all-errors \
    "$url" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $idem" \
    -H "X-Request-Id: $idem" \
    --data "$data"
}

http_call_no_idem() {
  local url="$1"
  local data="$2"
  local xrid="$3"

  if [[ -z "${url:-}" ]]; then
    echo "FATAL: http_call_no_idem missing url"
    return 2
  fi

  curl -sS -i \
    --connect-timeout 10 \
    --max-time 30 \
    --retry 2 \
    --retry-all-errors \
    "$url" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Request-Id: $xrid" \
    --data "$data"
}

# -------------------------
# Audit fetchers
# -------------------------
audit_fetch_since() {
  local limit="${1:-200}"
  curl -s \
    "$SUPABASE_URL/rest/v1/dossier_audit_events?select=created_at,event_type,event_data&dossier_id=eq.$DOSSIER_ID&created_at=gte.$START_ISO&order=created_at.desc&limit=$limit" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
}

intake_audit_fetch_since() {
  local limit="${1:-200}"
  curl -s \
    "$SUPABASE_URL/rest/v1/intake_audit_events?select=created_at,request_id,idempotency_key,flow,stage,status,reason,message,payload&created_at=gte.$START_ISO&order=created_at.desc&limit=$limit" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
}

intake_audit_assert_idem_reason() {
  local idem="$1"
  local expected_reason="$2"
  local label="${3:-intake-audit-check}"

  sleep 0.5

  local aud
  aud="$(intake_audit_fetch_since 300)"

  if ! echo "$aud" | grep -q "\"idempotency_key\":\"$idem\""; then
    echo "ASSERT FAIL: $label — intake audit missing idempotency_key=$idem"
    return 1
  fi

  if ! echo "$aud" | grep -q "\"reason\":\"$expected_reason\""; then
    echo "ASSERT FAIL: $label — intake audit missing reason=$expected_reason (idem=$idem)"
    return 1
  fi

  return 0
}

assert_no_lead_for_email_since_start() {
  local email="$1"
  local label="${2:-no-lead-check}"

  local email_enc="${email//@/%40}"

  local res
  res="$(curl -s \
    "$SUPABASE_URL/rest/v1/leads?select=id,created_at,email&email=eq.$email_enc&created_at=gte.$START_ISO&limit=1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

  if echo "$res" | grep -q "\"id\""; then
    echo "ASSERT FAIL: $label — lead was created for email=$email"
    return 1
  fi

  return 0
}

assert_no_dossier_for_lead_email_since_start() {
  local email="$1"
  local label="${2:-no-dossier-check}"

  local email_enc="${email//@/%40}"

  local res
  res="$(curl -s \
    "$SUPABASE_URL/rest/v1/dossiers?select=id,created_at,customer_email&customer_email=eq.$email_enc&created_at=gte.$START_ISO&limit=1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

  if echo "$res" | grep -q "\"id\""; then
    echo "ASSERT FAIL: $label — dossier was created for customer_email=$email"
    return 1
  fi

  return 0
}


# -------------------------
# DB proof helpers — dossier_documents / cleanup verification
# -------------------------

get_document_row_by_id() {
  local document_id="$1"

  curl -sS \
    --connect-timeout 10 \
    --max-time 30 \
    "$SUPABASE_URL/rest/v1/dossier_documents?select=id,dossier_id,charger_id,doc_type,status,file_sha256,storage_path,created_at&id=eq.$document_id&limit=1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
}

assert_document_row_confirmed() {
  local document_id="$1"
  local expected_charger_id="$2"
  local expected_doc_type="$3"
  local expected_sha256="$4"
  local label="${5:-document-row-confirmed}"

  local row_json
  row_json="$(get_document_row_by_id "$document_id")"

  if [[ -z "${row_json:-}" || "$row_json" == "[]" ]]; then
    echo "ASSERT FAIL: $label — dossier_documents row not found for document_id=$document_id"
    return 1
  fi

  local parsed
  parsed="$(printf "%s" "$row_json" | python3 -c '
import sys, json
d = json.load(sys.stdin)
r = d[0] if d else {}
print("\t".join([
    str(r.get("id","")),
    str(r.get("dossier_id","")),
    str(r.get("charger_id","")),
    str(r.get("doc_type","")),
    str(r.get("status","")),
    str(r.get("file_sha256","")),
    str(r.get("storage_path","")),
]))
')"

  local got_id got_dossier got_charger got_doc_type got_status got_sha got_path
  IFS=$'\t' read -r got_id got_dossier got_charger got_doc_type got_status got_sha got_path <<< "$parsed"

  if [[ "$got_id" != "$document_id" ]]; then
    echo "ASSERT FAIL: $label — wrong id in dossier_documents row"
    echo "expected: $document_id"
    echo "got:      $got_id"
    return 1
  fi

  if [[ "$got_dossier" != "$DOSSIER_ID" ]]; then
    echo "ASSERT FAIL: $label — wrong dossier_id in dossier_documents row"
    echo "expected: $DOSSIER_ID"
    echo "got:      $got_dossier"
    return 1
  fi

  if [[ "$got_charger" != "$expected_charger_id" ]]; then
    echo "ASSERT FAIL: $label — wrong charger_id in dossier_documents row"
    echo "expected: $expected_charger_id"
    echo "got:      $got_charger"
    return 1
  fi

  if [[ "$got_doc_type" != "$expected_doc_type" ]]; then
    echo "ASSERT FAIL: $label — wrong doc_type in dossier_documents row"
    echo "expected: $expected_doc_type"
    echo "got:      $got_doc_type"
    return 1
  fi

  if [[ "$got_status" != "confirmed" ]]; then
    echo "ASSERT FAIL: $label — expected status=confirmed"
    echo "got: $got_status"
    return 1
  fi

  if [[ "$got_sha" != "$expected_sha256" ]]; then
    echo "ASSERT FAIL: $label — wrong file_sha256"
    echo "expected: $expected_sha256"
    echo "got:      $got_sha"
    return 1
  fi

  if [[ -z "${got_path:-}" ]]; then
    echo "ASSERT FAIL: $label — storage_path is empty"
    return 1
  fi

  return 0
}

count_documents_for_dossier() {
  curl -sS \
    --connect-timeout 10 \
    --max-time 30 \
    "$SUPABASE_URL/rest/v1/dossier_documents?select=id&dossier_id=eq.$DOSSIER_ID" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)"
}

count_documents_for_charger() {
  local charger_id="$1"

  curl -sS \
    --connect-timeout 10 \
    --max-time 30 \
    "$SUPABASE_URL/rest/v1/dossier_documents?select=id&charger_id=eq.$charger_id" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)"
}

count_charger_rows_for_dossier() {
  curl -sS \
    --connect-timeout 10 \
    --max-time 30 \
    "$SUPABASE_URL/rest/v1/dossier_chargers?select=id&dossier_id=eq.$DOSSIER_ID" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)"
}

# -------------------------
# Audit asserts (ported from your big script; no regression)
# -------------------------
audit_assert_for_request_id_once() {
  local rid="$1"
  local expected_event_type="${2:-}"
  local expected_stage="${3:-}"
  local expected_reason="${4:-}"

  sleep 0.5

  local aud row
  aud="$(audit_fetch_since 300)"

  if ! echo "$aud" | grep -q "\"request_id\"" ; then
    return 1
  fi

  if ! echo "$aud" | grep -q "$rid"; then
    return 1
  fi

    # Split objects inside JSON array reliably (handles '},{' and '},  {')
  row="$(
    echo "$aud" \
    | tr -d '\n' \
    | sed -E 's/},[[:space:]]*{/}\n{/g' \
    | grep -E "\"request_id\"[[:space:]]*:[[:space:]]*\"$rid\"" \
    | head -n 1
  )"

  if [[ -z "$row" ]]; then
    return 1
  fi

  # Always require these meta fields (audit-first)
  if ! echo "$row" | grep -q "\"actor_ref\"" ; then
    return 1
  fi
  if ! echo "$row" | grep -q "\"environment\"" ; then
    return 1
  fi

  if [[ -n "$expected_event_type" ]]; then
    if ! echo "$row" | grep -q "\"event_type\":\"$expected_event_type\""; then
      return 2  # special: event type mismatch
    fi
  fi

  if [[ -n "$expected_stage" ]]; then
    if ! echo "$row" | grep -q "\"stage\": \"$expected_stage\"" && ! echo "$row" | grep -q "\"stage\":\"$expected_stage\""; then
      return 3
    fi
  fi

  if [[ -n "$expected_reason" ]]; then
    if ! echo "$row" | grep -q "\"reason\": \"$expected_reason\"" && ! echo "$row" | grep -q "\"reason\":\"$expected_reason\""; then
      return 4
    fi
  fi

  return 0
}

audit_debug_row_for_rid() {
  local rid="$1"
  local aud row
  aud="$(audit_fetch_since 300)"
  row="$(
    echo "$aud" \
    | tr -d '\n' \
    | sed -E 's/},[[:space:]]*{/}\n{/g' \
    | grep -E "\"request_id\"[[:space:]]*:[[:space:]]*\"$rid\"" \
    | head -n 1
  )"
  echo "$row"
}

audit_assert_for_request_id() {
  local rid="$1"
  local expected_event_type="${2:-}"
  local expected_stage="${3:-}"
  local expected_reason="${4:-}"
  local label="${5:-audit-check}"

  local tries=12
  local sleep_s=0.5
  local i=1

  while [[ $i -le $tries ]]; do
    set +e
    audit_assert_for_request_id_once "$rid" "$expected_event_type" "$expected_stage" "$expected_reason"
    rc=$?
    set -e

    if [[ $rc -eq 0 ]]; then
      return 0
    fi

    # If event_type mismatch, print what we actually saw (this is the point)
    if [[ $rc -eq 2 ]]; then
      echo "ASSERT FAIL: $label — event_type mismatch for request_id=$rid"
      echo "Expected: $expected_event_type"
      echo "Found row:"
      audit_debug_row_for_rid "$rid"
      return 1
    fi

    if [[ $rc -eq 3 ]]; then
      echo "ASSERT FAIL: $label — stage mismatch for request_id=$rid"
      echo "Expected stage: $expected_stage"
      echo "Found row:"
      audit_debug_row_for_rid "$rid"
      return 1
    fi

    if [[ $rc -eq 4 ]]; then
      echo "ASSERT FAIL: $label — reason mismatch for request_id=$rid"
      echo "Expected reason: $expected_reason"
      echo "Found row:"
      audit_debug_row_for_rid "$rid"
      return 1
    fi

    sleep "$sleep_s"
    i=$((i+1))
  done

  echo "ASSERT FAIL: $label — audit not visible after ${tries} retries (request_id=$rid)"
  echo "Found row (if any):"
  audit_debug_row_for_rid "$rid"
  return 1
}

# -------------------------
# run_case helpers (ported)
# -------------------------
run_case() {
  local label="$1"
  local url="$2"
  local data="$3"
  local rid_prefix="$4"
  local expected_http="$5"
  local expect_audit="$6"
  local expected_event_type="${7:-}"
  local expected_stage="${8:-}"
  local expected_reason="${9:-}"

  local rid="${rid_prefix}-$(now_ts)"

  echo ""
  echo "$label"
  echo "------------------------------------------------"
  echo "request_id: $rid"
  echo ""

  local resp http body
  resp="$(http_call_with_idem "$url" "$data" "$rid")"
  print_resp_head "$resp" 30
  echo ""

  http="$(extract_http_status "$resp")"
  body="$(extract_body_json "$resp")"

  if [[ "$http" != "$expected_http" ]]; then
    echo "ASSERT FAIL: expected HTTP $expected_http, got $http"
    echo "BODY:"
    echo "$body"
    return 1
  fi

  if [[ "$expect_audit" == "yes" ]]; then
    if ! audit_assert_for_request_id "$rid" "$expected_event_type" "$expected_stage" "$expected_reason" "$label"; then
      return 1
    fi
  fi

  return 0
}

run_case_raw() {
  local label="$1"
  local url="$2"
  local data="$3"
  local rid_prefix="$4"
  local expected_http="$5"

  local rid="${rid_prefix}-$(now_ts)"

  echo ""
  echo "$label"
  echo "------------------------------------------------"
  echo "request_id: $rid"
  echo ""

  local resp http body
  resp="$(http_call_with_idem "$url" "$data" "$rid")"
  print_resp_head "$resp" 60
  echo ""

  http="$(extract_http_status "$resp")"
  body="$(extract_body_json "$resp")"

  if [[ "$http" != "$expected_http" ]]; then
    echo "ASSERT FAIL: expected HTTP $expected_http, got $http"
    echo "BODY:"
    echo "$body"
    return 1
  fi

  # export-ish via state file
  set_state LAST_RID "$rid"
  # store body flattened (no newlines) to keep state file sane
  set_state LAST_BODY "$(echo "$body" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g')"
  return 0
}