# scripts/tests/00_helpers.sh

#!/usr/bin/env bash
set -euo pipefail

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
  if [[ ! -f "$TEST_STATE_FILE" ]]; then
    echo ""
    return 0
  fi
  grep -E "^${key}=" "$TEST_STATE_FILE" | tail -n 1 | cut -d= -f2-
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

# -------------------------
# HTTP helpers
# -------------------------
http_call_with_idem() {
  local url="$1"
  local data="$2"
  local idem="$3"

  curl -i -s "$url" \
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

  curl -i -s "$url" \
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

  row="$(echo "$aud" | tr -d '\n' | sed 's/},{/}\n{/g' | grep "$rid" | head -n 1)"
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
  row="$(echo "$aud" | tr -d '\n' | sed 's/},{/}\n{/g' | grep "$rid" | head -n 1)"
  echo "$row"
}

audit_assert_for_request_id() {
  local rid="$1"
  local expected_event_type="${2:-}"
  local expected_stage="${3:-}"
  local expected_reason="${4:-}"
  local label="${5:-audit-check}"

  local tries=6
  local sleep_s=0.25
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
  echo "$resp" | sed -n '1,30p'
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
  echo "$resp" | sed -n '1,60p'
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