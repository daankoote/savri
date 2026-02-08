#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ENVAL — audit-tests.sh
#
# Doel (real-world default):
# - Lees allowed/max chargers uit DB: public.dossiers.charger_count
# - Vul dossier_chargers aan tot dat aantal (zonder bestaande te wijzigen/verwijderen)
# - Draai contract reject tests (auth, max, notfound, idem, etc.)
# - Draai happy path uploads: 2 docs per NIEUW aangemaakte charger (factuur + foto_laadpunt)
# - Cleanup: verwijder ALLEEN de chargers die deze run zelf heeft aangemaakt
#   -> backend charger-delete hoort ook documenten + storage objecten te verwijderen
#
# Verwachte “goede” uitkomst (ideaal):
# - Rejects geven de juiste HTTP codes + audit events
# - Happy uploads slagen (upload-url -> PUT -> upload-confirm) voor alle nieuw aangemaakte chargers
# - Cleanup verwijdert created chargers + bijbehorende docs/storage, alles audit-gelogd
#
# Overrides (expliciet afwijken van real-world):
# - EXPECTED_CHARGERS=6      -> target chargers = 6 (i.p.v. dossiers.charger_count)
# - RUN_HAPPY_UPLOAD=1       -> happy uploads altijd aan (default = 1)
# - RUN_REPO_LINT=0          -> repo_lint overslaan totdat we in productie --> edge functions in VS code gaan (default = 0))
# - LINT_STRICT=1            -> repo-lint WARN wordt FAIL
# ============================================================

echo ""
echo "================================================"
echo " ENVAL AUDIT TEST SCRIPT"
echo " DOSSIER: ${DOSSIER_ID:-<missing>}"
echo "================================================"
echo ""

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: env var missing: $name"
    exit 1
  fi
}

need SUPABASE_URL
need SUPABASE_ANON_KEY
need SUPABASE_SERVICE_ROLE_KEY
need DOSSIER_ID
need DOSSIER_TOKEN

LINT_STRICT="${LINT_STRICT:-0}"
RUN_HAPPY_UPLOAD="${RUN_HAPPY_UPLOAD:-1}"   # jouw wens: happy standaard AAN
RUN_REPO_LINT="${RUN_REPO_LINT:-0}"  # default UIT (repo heeft nog geen lokale edge functions)


# Helpers
now_ts() { date +%s; }
now_iso_utc() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

START_ISO="$(now_iso_utc)"

PASS=0
FAIL=0
WARN=0
FAILED_CASES=()
WARNED_CASES=()

# -------------------------
# Repo / tmp
# -------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$SCRIPT_DIR/.tmp"
mkdir -p "$TMP_DIR"

TMP_FILE="$TMP_DIR/enval-devtest-upload.pdf"

# --- Response parsing helpers (no jq) ---
extract_http_status() {
  echo "$1" | head -n 1 | awk '{print $2}' | tr -d '\r'
}

extract_body_json() {
  # print from first JSON-ish line onward
  echo "$1" | awk 'BEGIN{p=0} /^\{/ {p=1} {if(p) print $0}'
}

warn_or_fail() {
  local label="$1"
  local msg="$2"
  if [[ "$LINT_STRICT" == "1" ]]; then
    echo "ASSERT FAIL: $label — $msg"
    FAIL=$((FAIL+1))
    FAILED_CASES+=("$label ($msg)")
    return 1
  else
    echo "WARN: $label — $msg"
    WARN=$((WARN+1))
    WARNED_CASES+=("$label ($msg)")
    return 0
  fi
}

# --- HTTP call helpers ---
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

# --- Audit fetch/assert helpers ---
audit_fetch_since() {
  local limit="${1:-200}"
  curl -s \
    "$SUPABASE_URL/rest/v1/dossier_audit_events?select=created_at,event_type,event_data&dossier_id=eq.$DOSSIER_ID&created_at=gte.$START_ISO&order=created_at.desc&limit=$limit" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
}

# ---- AUDIT ASSERT (single attempt; NO retry) ----
audit_assert_for_request_id_once() {
  local rid="$1"
  local expected_event_type="${2:-}"
  local expected_stage="${3:-}"
  local expected_reason="${4:-}"

  # small delay for async-ish inserts
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

  if [[ -n "$expected_event_type" ]]; then
    if ! echo "$row" | grep -q "\"event_type\":\"$expected_event_type\""; then
      return 1
    fi
  fi

  if [[ -n "$expected_stage" ]]; then
    if ! echo "$row" | grep -q "\"stage\": \"$expected_stage\"" && ! echo "$row" | grep -q "\"stage\":\"$expected_stage\""; then
      return 1
    fi
  fi

  if [[ -n "$expected_reason" ]]; then
    if ! echo "$row" | grep -q "\"reason\": \"$expected_reason\"" && ! echo "$row" | grep -q "\"reason\":\"$expected_reason\""; then
      return 1
    fi
  fi

  if ! echo "$row" | grep -q "\"actor_ref\"" ; then
    return 1
  fi

  if ! echo "$row" | grep -q "\"environment\"" ; then
    return 1
  fi

  return 0
}

# ---- AUDIT ASSERT WITH RETRY (eventual consistency safe) ----
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
    if audit_assert_for_request_id_once \
         "$rid" \
         "$expected_event_type" \
         "$expected_stage" \
         "$expected_reason"; then
      return 0
    fi
    sleep "$sleep_s"
    i=$((i+1))
  done

  echo "ASSERT FAIL: $label — audit not visible after ${tries} retries (request_id=$rid)"
  echo "AUDIT (trunc):"
  audit_fetch_since 300 | head -c 2000
  echo ""
  FAILED_CASES+=("$label (audit mismatch)")
  return 1
}

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
    echo ""
    FAIL=$((FAIL+1))
    FAILED_CASES+=("$label (HTTP $http != $expected_http)")
    return 1
  fi

  if [[ "$expect_audit" == "yes" ]]; then
    if ! audit_assert_for_request_id "$rid" "$expected_event_type" "$expected_stage" "$expected_reason" "$label"; then
      echo "ASSERT FAIL: audit contract failed for request_id=$rid"
      FAIL=$((FAIL+1))
      FAILED_CASES+=("$label (audit mismatch)")
      return 1
    fi
  fi

  PASS=$((PASS+1))
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
    echo ""
    FAIL=$((FAIL+1))
    FAILED_CASES+=("$label (HTTP $http != $expected_http)")
    return 1
  fi

  LAST_RID="$rid"
  LAST_BODY="$body"
  LAST_RESP="$resp"
  PASS=$((PASS+1))
  return 0
}

# ============================================================
# SETUP — determine allowed max from DB + create missing chargers
# ============================================================

# Read allowed chargers from DB (source of truth)
get_allowed_max_from_db() {
  curl -s \
    "$SUPABASE_URL/rest/v1/dossiers?select=charger_count&id=eq.$DOSSIER_ID&limit=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('charger_count','')) if d else print('')"
}

ALLOWED_MAX="$(get_allowed_max_from_db || true)"

if [[ -z "${ALLOWED_MAX:-}" ]]; then
  echo "FATAL: could not read dossiers.charger_count for DOSSIER_ID=$DOSSIER_ID"
  echo "Check: dossiers row exists + service role key is correct."
  exit 1
fi

# Optional override target (test afwijking)
TARGET_CHARGERS="${EXPECTED_CHARGERS:-$ALLOWED_MAX}"

# Basic sanity
if ! [[ "$ALLOWED_MAX" =~ ^[0-9]+$ ]]; then
  echo "FATAL: dossiers.charger_count is not numeric (got: $ALLOWED_MAX)"
  exit 1
fi
if ! [[ "$TARGET_CHARGERS" =~ ^[0-9]+$ ]]; then
  echo "FATAL: EXPECTED_CHARGERS/target is not numeric (got: $TARGET_CHARGERS)"
  exit 1
fi
if [[ "$TARGET_CHARGERS" -lt 1 ]]; then
  echo "FATAL: target chargers must be >= 1 (got: $TARGET_CHARGERS)"
  exit 1
fi
if [[ "$TARGET_CHARGERS" -gt "$ALLOWED_MAX" ]]; then
  echo "FATAL: TARGET_CHARGERS=$TARGET_CHARGERS is > ALLOWED_MAX(from DB)=$ALLOWED_MAX"
  echo "This script does NOT override backend policy. Lower EXPECTED_CHARGERS or update dossier.charger_count."
  exit 1
fi

# Fetch ALL charger ids (service role)
get_all_charger_ids() {
  curl -s \
    "$SUPABASE_URL/rest/v1/dossier_chargers?select=id,created_at&dossier_id=eq.$DOSSIER_ID&order=created_at.asc" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join([r['id'] for r in d]))"
}

# Create charger via edge fn and return charger_id (requires response includes charger_id)
create_charger_and_get_id() {
  local rid="$1"
  local serial="$2"

  local resp http body id
  resp="$(http_call_with_idem \
    "$SUPABASE_URL/functions/v1/api-dossier-charger-save" \
    "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"serial_number\":\"TEST-$rid-$serial\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"audit-test setup\"}" \
    "$rid")"

  http="$(extract_http_status "$resp")"
  body="$(extract_body_json "$resp")"

  if [[ "$http" != "200" ]]; then
    echo "FATAL: charger-create failed (HTTP $http) rid=$rid"
    echo "BODY:"
    echo "$body"
    echo ""
    return 1
  fi

  id="$(echo "$body" | sed -n 's/.*"charger_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [[ -z "$id" ]]; then
    echo "FATAL: charger-create returned 200 but no charger_id in response rid=$rid"
    echo "BODY:"
    echo "$body"
    echo ""
    return 1
  fi

  echo "$id"
  return 0
}

# Read existing chargers
EXISTING_CHARGER_IDS=()
CREATED_CHARGER_IDS=()   # <-- altijd initialiseren, vóór elke mogelijke read
while IFS= read -r line; do
  [[ -n "${line:-}" ]] && EXISTING_CHARGER_IDS+=("$line")
done < <(get_all_charger_ids || true)

EXISTING_COUNT="${#EXISTING_CHARGER_IDS[@]}"

echo ""
echo "SETUP — allowed chargers (DB dossiers.charger_count): $ALLOWED_MAX"
echo "SETUP — target chargers (override only if EXPECTED_CHARGERS set): $TARGET_CHARGERS"
echo "SETUP — existing chargers: $EXISTING_COUNT"
echo ""

# If too many already exist vs target: fail (we never delete existing)
if [[ "$EXISTING_COUNT" -gt "$TARGET_CHARGERS" ]]; then
  echo "FATAL: dossier has more chargers than TARGET_CHARGERS"
  echo "Target: $TARGET_CHARGERS"
  echo "Found:  $EXISTING_COUNT"
  echo "Refuse to run because we will not delete existing chargers/docs."
  exit 1
fi

NEED_CREATE=$((TARGET_CHARGERS - EXISTING_COUNT))

CREATED_CHARGER_IDS=()
if [[ "$NEED_CREATE" -gt 0 ]]; then
  echo "SETUP: creating missing chargers to reach target: $NEED_CREATE"
  echo "------------------------------------------------"
  for i in $(seq 1 "$NEED_CREATE"); do
    rid="setup-charger-$i-$(now_ts)"
    cid="$(create_charger_and_get_id "$rid" "$i")"
    if [[ -z "${cid:-}" ]]; then
      echo "FATAL: failed to create charger ($i/$NEED_CREATE)"
      exit 1
    fi
    CREATED_CHARGER_IDS+=("$cid")
    echo " - created charger_id: $cid"
  done
else
  echo "SETUP: no missing chargers to create (already at target)."
fi

# Choose a stable CHARGER_ID for rejects (prefer an existing one; else first created)
CHARGER_ID=""
if [[ "$EXISTING_COUNT" -gt 0 ]]; then
  CHARGER_ID="${EXISTING_CHARGER_IDS[0]}"
elif [[ "${#CREATED_CHARGER_IDS[@]}" -gt 0 ]]; then
  CHARGER_ID="${CREATED_CHARGER_IDS[0]}"
fi

if [[ -z "${CHARGER_ID:-}" ]]; then
  echo "FATAL: no CHARGER_ID available after setup"
  exit 1
fi

echo ""
echo "SETUP OK — CHARGER_ID (for reject tests): $CHARGER_ID"
echo "SETUP OK — created chargers this run: ${#CREATED_CHARGER_IDS[@]}"
echo ""

echo "SETUP EVIDENCE — existing charger IDs (first 5):"
for i in 0 1 2 3 4; do
  [[ $i -lt ${#EXISTING_CHARGER_IDS[@]} ]] && echo " - existing[$i]=${EXISTING_CHARGER_IDS[$i]}"
done

echo "SETUP EVIDENCE — created charger IDs (all):"

# SAFETY: ensure CREATED_CHARGER_IDS is always a defined array (even if someone accidentally unset/overwrote it)
if ! declare -p CREATED_CHARGER_IDS >/dev/null 2>&1; then
  CREATED_CHARGER_IDS=()
fi

# If it's defined but not an array, force it into an array (defensive)
# shellcheck disable=SC2206
if [[ "$(declare -p CREATED_CHARGER_IDS 2>/dev/null)" != "declare -a"* ]]; then
  CREATED_CHARGER_IDS=()
fi

if [[ "${#CREATED_CHARGER_IDS[@]}" -eq 0 ]]; then
  echo " - (none created this run)"
else
  # HARD GUARD: created IDs must not be in existing list
  for cid in "${CREATED_CHARGER_IDS[@]}"; do
    for eid in "${EXISTING_CHARGER_IDS[@]}"; do
      if [[ "$cid" == "$eid" ]]; then
        echo "FATAL: created charger_id appears in existing list (logic bug): $cid"
        exit 1
      fi
    done
  done

  for cid in "${CREATED_CHARGER_IDS[@]}"; do
    echo " - created=$cid"
  done
fi


echo "TEST SCOPE RULE:"
echo " - Reject tests may use CHARGER_ID=$CHARGER_ID (can be existing)."
echo " - Happy uploads + cleanup MUST use only CREATED_CHARGER_IDS."
echo ""


# ============================================================
# TESTS — contract rejects + audit evidence
# ============================================================

BAD_TOKEN="BAD-${DOSSIER_TOKEN}"

run_case \
  "1) REJECT TEST — charger-save (unauthorized)" \
  "$SUPABASE_URL/functions/v1/api-dossier-charger-save" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$BAD_TOKEN\",\"serial_number\":\"TEST-$(now_ts)\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject unauth\"}" \
  "reject-charger-unauth" \
  "401" \
  "yes" \
  "charger_save_rejected" \
  "auth" \
  "unauthorized" || true

# Max chargers reject: alleen zinvol als we op ALLOWED_MAX zitten
# (Als je target lager zet via EXPECTED_CHARGERS, dan is max-reject in de real world niet bereikt -> skip/warn)
EXISTING_AFTER_SETUP=$((EXISTING_COUNT + ${#CREATED_CHARGER_IDS[@]}))

if [[ "$EXISTING_AFTER_SETUP" -eq "$ALLOWED_MAX" ]]; then
  run_case \
    "2) REJECT TEST — charger-save (max chargers)" \
    "$SUPABASE_URL/functions/v1/api-dossier-charger-save" \
    "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"serial_number\":\"TEST-$(now_ts)\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject max\"}" \
    "reject-charger-max" \
    "409" \
    "yes" \
    "charger_save_rejected" \
    "validate_max_chargers" \
    "max_chargers_reached" || true
else
  warn_or_fail "2) REJECT TEST — charger-save (max chargers)" \
    "SKIPPED (not at allowed max). existing_after_setup=$EXISTING_AFTER_SETUP allowed_max=$ALLOWED_MAX"
fi

run_case \
  "3) REJECT TEST — doc-delete (unauthorized)" \
  "$SUPABASE_URL/functions/v1/api-dossier-doc-delete" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$BAD_TOKEN\",\"document_id\":\"00000000-0000-0000-0000-000000000000\"}" \
  "reject-doc-unauth" \
  "401" \
  "yes" \
  "document_delete_rejected" \
  "auth" \
  "unauthorized" || true

if run_case_raw \
  "4) REJECT TEST — doc-delete (EXPECTED not_found for fake document_id)" \
  "$SUPABASE_URL/functions/v1/api-dossier-doc-delete" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"document_id\":\"00000000-0000-0000-0000-000000000000\"}" \
  "reject-doc-missing" \
  "200"; then

  if ! echo "$LAST_BODY" | grep -q '"deleted":[[:space:]]*false'; then
    echo "ASSERT FAIL: step4 response must contain deleted:false"
    FAIL=$((FAIL+1))
    FAILED_CASES+=("4) doc-delete missing (deleted:false missing)")
  elif ! echo "$LAST_BODY" | grep -qi '"reason":[[:space:]]*"not_found"'; then
    echo "ASSERT FAIL: step4 response must contain reason:\"not_found\""
    FAIL=$((FAIL+1))
    FAILED_CASES+=("4) doc-delete missing (reason:not_found missing)")
  else
    if ! audit_assert_for_request_id "$LAST_RID" "document_delete_rejected" "doc_lookup" "not_found" "4) doc-delete missing"; then
      FAIL=$((FAIL+1))
      FAILED_CASES+=("4) doc-delete missing (audit mismatch)")
    fi
  fi
fi

run_case \
  "X) REJECT TEST — charger-delete (unauthorized)" \
  "$SUPABASE_URL/functions/v1/api-dossier-charger-delete" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$BAD_TOKEN\",\"charger_id\":\"$CHARGER_ID\"}" \
  "reject-chargerdelete-unauth" \
  "401" \
  "yes" \
  "charger_delete_rejected" \
  "auth" \
  "unauthorized" || true

echo ""
echo "5) AUDIT LOG — laatste 15 events (informational)"
echo "------------------------------------------------"
AUDIT_LAST15="$(curl -s \
  "$SUPABASE_URL/rest/v1/dossier_audit_events?select=created_at,event_type,event_data&dossier_id=eq.$DOSSIER_ID&order=created_at.desc&limit=15" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"
echo "$AUDIT_LAST15"
echo ""

FN_UPLOAD_URL="$SUPABASE_URL/functions/v1/api-dossier-upload-url"
FN_UPLOAD_CONFIRM="$SUPABASE_URL/functions/v1/api-dossier-upload-confirm"

echo ""
echo "== Upload URL rejects =="

ridA="uploadurl-missing-idem-$(now_ts)"
echo ""
echo "A) Missing Idempotency-Key (expect 400, no audit)"
echo "------------------------------------------------"
RESP_A="$(http_call_no_idem "$FN_UPLOAD_URL" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"doc_type\":\"factuur\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123,\"charger_id\":\"$CHARGER_ID\"}" \
  "$ridA")"
echo "$RESP_A" | sed -n '1,25p'
echo ""
HTTP_A="$(extract_http_status "$RESP_A")"
if [[ "$HTTP_A" != "400" ]]; then
  echo "ASSERT FAIL: expected HTTP 400, got $HTTP_A"
  FAIL=$((FAIL+1))
  FAILED_CASES+=("A) upload-url missing idem (HTTP $HTTP_A != 400)")
else
  PASS=$((PASS+1))
fi

run_case \
  "B) Invalid doc_type (expect 400 + audit reject)" \
  "$FN_UPLOAD_URL" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"doc_type\":\"hacker\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123,\"charger_id\":\"$CHARGER_ID\"}" \
  "uploadurl-invalid-doctype" \
  "400" \
  "yes" \
  "document_upload_url_rejected" \
  "validate_doc_type" \
  "" || true

run_case \
  "C) Missing charger_id (expect 400 + audit reject)" \
  "$FN_UPLOAD_URL" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"doc_type\":\"factuur\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123}" \
  "uploadurl-missing-charger" \
  "400" \
  "yes" \
  "document_upload_url_rejected" \
  "validate_charger_id" \
  "" || true

echo ""
echo "== Upload Confirm rejects =="

run_case \
  "D) Missing fields (expect 400 + audit reject)" \
  "$FN_UPLOAD_CONFIRM" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\"}" \
  "uploadconfirm-missing-fields" \
  "400" \
  "yes" \
  "document_upload_confirm_rejected" \
  "validate_input" \
  "" || true

run_case \
  "E) Unauthorized (expect 401 + audit reject)" \
  "$FN_UPLOAD_CONFIRM" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"badtoken\",\"document_id\":\"00000000-0000-0000-0000-000000000000\",\"file_sha256\":\"$(printf '0%.0s' {1..64})\"}" \
  "uploadconfirm-unauth" \
  "401" \
  "yes" \
  "document_upload_confirm_rejected" \
  "auth" \
  "" || true

run_case \
  "F) Upload-confirm (EXPECTED 404 not_found for fake document_id)" \
  "$FN_UPLOAD_CONFIRM" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"document_id\":\"00000000-0000-0000-0000-000000000000\",\"file_sha256\":\"$(printf '0%.0s' {1..64})\"}" \
  "uploadconfirm-doc-notfound" \
  "404" \
  "yes" \
  "document_upload_confirm_rejected" \
  "doc_lookup" \
  "" || true

# ============================================================
# HAPPY PATH — default ON (jouw wens)
# 2 docs per NEW charger (factuur + foto_laadpunt)
# ============================================================

echo ""
echo "== HAPPY PATH: upload-url -> storage upload -> upload-confirm =="
echo "------------------------------------------------"

HAPPY_DOCS_CREATED=0
HAPPY_PUT_OK=0
HAPPY_CONFIRM_OK=0

if [[ "$RUN_HAPPY_UPLOAD" == "1" ]]; then
  if [[ "${#CREATED_CHARGER_IDS[@]}" -eq 0 ]]; then
    echo ""
    echo "HAPPY PATH NOTE: no chargers were created in this run."
    echo "=> We will NOT upload docs, because we never touch existing chargers/docs in tests."
    echo ""
  else
    # Create a small deterministic file
    printf "ENVAL DEVTEST %s\n" "$(date -u +%FT%TZ)" > "$TMP_FILE"
    FILE_SIZE="$(wc -c < "$TMP_FILE" | tr -d ' ')"
    FILE_SHA256="$(shasum -a 256 "$TMP_FILE" | awk '{print $1}')"

    if [[ -z "${FILE_SHA256:-}" ]]; then
      echo "ASSERT FAIL: could not compute FILE_SHA256"
      FAIL=$((FAIL+1))
      FAILED_CASES+=("HAPPY PATH (FILE_SHA256 compute)")
    else
      echo ""
      echo "HAPPY PATH — uploading 2 docs per newly created charger (factuur + foto_laadpunt)"
      echo "--------------------------------------------------------------------------"
      echo "File: $TMP_FILE (size=$FILE_SIZE sha256=$FILE_SHA256)"
      echo ""

      DOC_TYPES=("factuur" "foto_laadpunt")

      for cid in "${CREATED_CHARGER_IDS[@]}"; do
        echo ""
        echo "Charger (new): $cid"
        echo "-------------------------------"

        for dt in "${DOC_TYPES[@]}"; do
          idemURL="devtest-uploadurl-$dt-$(now_ts)"
          echo ""
          echo "upload-url doc_type=$dt request_id: $idemURL"

          RESP_HP_URL="$(curl -s \
            "$FN_UPLOAD_URL" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: $idemURL" \
            -H "X-Request-Id: $idemURL" \
            --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"doc_type\":\"$dt\",\"filename\":\"devtest-$dt-$cid.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":$FILE_SIZE,\"charger_id\":\"$cid\"}")"

          DOC_ID_HP="$(echo "$RESP_HP_URL" | sed -n 's/.*"document_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
          SIGNED_URL_HP="$(echo "$RESP_HP_URL" | sed -n 's/.*"signed_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
          PATH_HP="$(echo "$RESP_HP_URL" | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

          if [[ -z "$DOC_ID_HP" || -z "$SIGNED_URL_HP" || -z "$PATH_HP" ]]; then
            echo "ASSERT FAIL: upload-url missing fields for doc_type=$dt charger=$cid"
            echo "RESP:"
            echo "$RESP_HP_URL"
            FAIL=$((FAIL+1))
            FAILED_CASES+=("HAPPY upload-url ($dt) missing fields")
            continue
          fi

          HAPPY_DOCS_CREATED=$((HAPPY_DOCS_CREATED+1))
          echo "OK: document_id=$DOC_ID_HP"
          echo "OK: path=$PATH_HP"

          echo "PUT to signed_url..."
          PUT_RESP="$(curl -s -i -X PUT "$SIGNED_URL_HP" \
            -H "Content-Type: application/pdf" \
            --data-binary @"$TMP_FILE")"
          echo "$PUT_RESP" | sed -n '1,15p'
          PUT_HTTP="$(extract_http_status "$PUT_RESP")"
          if [[ "$PUT_HTTP" == "200" ]]; then
            HAPPY_PUT_OK=$((HAPPY_PUT_OK+1))
          else
            echo "ASSERT FAIL: storage PUT expected 200, got $PUT_HTTP"
            FAIL=$((FAIL+1))
            FAILED_CASES+=("HAPPY storage PUT ($dt) HTTP $PUT_HTTP")
            continue
          fi

          idemCONF="devtest-uploadconfirm-$dt-$(now_ts)"
          echo "upload-confirm request_id: $idemCONF"

          CONF_RESP="$(curl -s -i -X POST "$FN_UPLOAD_CONFIRM" \
            -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: $idemCONF" \
            -H "X-Request-Id: $idemCONF" \
            --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"document_id\":\"$DOC_ID_HP\",\"file_sha256\":\"$FILE_SHA256\"}")"

          echo "$CONF_RESP" | sed -n '1,20p'
          CONF_HTTP="$(extract_http_status "$CONF_RESP")"
          if [[ "$CONF_HTTP" != "200" ]]; then
            echo "ASSERT FAIL: upload-confirm expected 200, got $CONF_HTTP (doc_type=$dt charger=$cid)"
            FAIL=$((FAIL+1))
            FAILED_CASES+=("HAPPY upload-confirm ($dt) HTTP $CONF_HTTP")
          else
            HAPPY_CONFIRM_OK=$((HAPPY_CONFIRM_OK+1))
            PASS=$((PASS+1))
          fi
        done
      done
    fi
  fi
else
  echo "HAPPY PATH SKIPPED (RUN_HAPPY_UPLOAD=0)"
fi

# ============================================================
# CLEANUP — delete ONLY chargers created in this run
# Expected: charger-delete also deletes created docs + storage objects
# ============================================================

CLEANUP_DELETED_CHARGERS=0
CLEANUP_DELETED_DOCS=0
CLEANUP_DELETED_STORAGE=0

if [[ "${#CREATED_CHARGER_IDS[@]}" -gt 0 ]]; then
  echo ""
  echo "CLEANUP — deleting chargers created in this run: ${#CREATED_CHARGER_IDS[@]}"
  echo "------------------------------------------------"

  for cid in "${CREATED_CHARGER_IDS[@]}"; do
    rid="cleanup-chargerdelete-$(now_ts)"
    echo ""
    echo "CLEANUP) charger-delete (authorized) — $cid"
    echo "------------------------------------------------"
    echo "request_id: $rid"
    echo ""

    RESP_DEL="$(http_call_with_idem \
      "$SUPABASE_URL/functions/v1/api-dossier-charger-delete" \
      "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"charger_id\":\"$cid\"}" \
      "$rid")"

    echo "$RESP_DEL" | sed -n '1,30p'
    echo ""

    DEL_HTTP="$(extract_http_status "$RESP_DEL")"
    DEL_BODY="$(extract_body_json "$RESP_DEL")"

    if [[ "$DEL_HTTP" != "200" ]]; then
      echo "ASSERT FAIL: cleanup charger-delete expected 200, got $DEL_HTTP"
      echo "BODY:"
      echo "$DEL_BODY"
      FAIL=$((FAIL+1))
      FAILED_CASES+=("CLEANUP charger-delete ($cid) HTTP $DEL_HTTP")
      continue
    fi

    # audit evidence
    if ! audit_assert_for_request_id "$rid" "charger_deleted" "" "" "CLEANUP charger-delete ($cid)"; then
      FAIL=$((FAIL+1))
      FAILED_CASES+=("CLEANUP charger-delete ($cid) audit mismatch")
      continue
    fi

    CLEANUP_DELETED_CHARGERS=$((CLEANUP_DELETED_CHARGERS+1))
    PASS=$((PASS+1))

    # pull counters from response if present
    dd="$(echo "$DEL_BODY" | sed -n 's/.*"deleted_documents"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
    ds="$(echo "$DEL_BODY" | sed -n 's/.*"deleted_storage_objects"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')"
    [[ -n "${dd:-}" ]] && CLEANUP_DELETED_DOCS=$((CLEANUP_DELETED_DOCS + dd))
    [[ -n "${ds:-}" ]] && CLEANUP_DELETED_STORAGE=$((CLEANUP_DELETED_STORAGE + ds))
  done
else
  echo ""
  echo "CLEANUP — no chargers created in this run, nothing to delete."
fi

# ============================================================
# SUMMARY — single source of truth (no dead counters)
# ============================================================

echo ""
echo "==================== SUMMARY (AUDIT TEST) ===================="
echo "- Dossier ID: $DOSSIER_ID"
echo "- Allowed max chargers (DB): $ALLOWED_MAX"
echo "- Target chargers (test): $TARGET_CHARGERS"
echo "- Existing chargers at start: $EXISTING_COUNT"
echo "- Created chargers this run: ${#CREATED_CHARGER_IDS[@]}"
echo "- Existing-after-setup: $EXISTING_AFTER_SETUP"
echo ""
echo "- Happy upload enabled: $RUN_HAPPY_UPLOAD (default=1)"
echo "- Happy docs created (upload-url ok): $HAPPY_DOCS_CREATED (expected: 2 * created_chargers)"
echo "- Storage PUT ok: $HAPPY_PUT_OK"
echo "- Upload-confirm ok: $HAPPY_CONFIRM_OK"
echo ""
echo "- Cleanup deleted chargers: $CLEANUP_DELETED_CHARGERS (expected: ${#CREATED_CHARGER_IDS[@]})"
echo "- Cleanup deleted documents (reported): $CLEANUP_DELETED_DOCS"
echo "- Cleanup deleted storage objects (reported): $CLEANUP_DELETED_STORAGE"
echo "==============================================================="
echo ""


if [[ "$RUN_REPO_LINT" == "1" ]]; then

  # ============================================================
  # Repo code audit-structure lint (optional “style control evidence”)
  # ============================================================

  echo ""
  echo "==================== REPO LINT (audit-structure) ===================="
  echo "Repo root: $REPO_ROOT"
  echo "LINT_STRICT: $LINT_STRICT (0=warn, 1=fail)"
  echo "---------------------------------------------------------------------"

  FN_DIR="$REPO_ROOT/supabase/functions"
  if [[ ! -d "$FN_DIR" ]]; then
    warn_or_fail "repo-lint" "Expected supabase/functions directory missing at: $FN_DIR"
  else
    FN_FILES=()
    while IFS= read -r line; do
      FN_FILES+=("$line")
    done < <(find "$FN_DIR" -type f -name "*.ts" ! -path "*/_shared/*" | sort)

    if [[ "${#FN_FILES[@]}" -eq 0 ]]; then
      warn_or_fail "repo-lint" "No function .ts files found under $FN_DIR (excluding _shared)."
    else
      for f in "${FN_FILES[@]}"; do
        base="$(basename "$f")"

        if ! grep -q "Access-Control-Allow-Origin" "$f" || ! grep -q "Vary\": \"Origin" "$f"; then
          warn_or_fail "lint:$base" "Missing CORS allow-origin and/or Vary: Origin pattern."
        else
          PASS=$((PASS+1))
        fi

        if ! grep -q "getReqMeta" "$f"; then
          warn_or_fail "lint:$base" "Missing getReqMeta usage/import."
        else
          PASS=$((PASS+1))
        fi

        if ! grep -q "insertAudit" "$f"; then
          warn_or_fail "lint:$base" "Missing insertAudit* usage (no audit trail)."
        else
          PASS=$((PASS+1))
        fi

        if grep -q "req.method !== \"POST\"" "$f" || grep -q "Method not allowed" "$f"; then
          if ! grep -q "Missing Idempotency-Key" "$f"; then
            warn_or_fail "lint:$base" "Missing Idempotency-Key enforcement."
          else
            PASS=$((PASS+1))
          fi
        fi

        if ! grep -q "SUPABASE_SERVICE_ROLE_KEY" "$f"; then
          warn_or_fail "lint:$base" "Missing SUPABASE_SERVICE_ROLE_KEY usage (server-side DB access inconsistent)."
        else
          PASS=$((PASS+1))
        fi
      done
    fi
  fi
fi

echo ""
echo "==================== RESULTAAT ===================="
echo "Start ISO (UTC): $START_ISO"
echo "PASS: $PASS"
echo "WARN: $WARN"
echo "FAIL: $FAIL"
echo "---------------------------------------------------"

if [[ "$WARN" -gt 0 ]]; then
  echo "WARNED CASES:"
  for c in "${WARNED_CASES[@]}"; do
    echo " - $c"
  done
  echo "---------------------------------------------------"
fi

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED CASES:"
  for c in "${FAILED_CASES[@]}"; do
    echo " - $c"
  done
  echo "==================================================="
  exit 1
else
  echo "ALL REQUIRED TESTS PASSED ✅"
  echo "==================================================="
fi

echo "==================== KLAAR ===================="
