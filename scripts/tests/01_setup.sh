# scripts/tests/01_setup.sh

#!/usr/bin/env bash
set -euo pipefail
trap 'echo "FATAL: 01_setup.sh crashed at line $LINENO"; exit 1' ERR
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== SETUP =="

need SUPABASE_URL
need SUPABASE_ANON_KEY
need SUPABASE_SERVICE_ROLE_KEY

# DOSSIER_ID must come from fresh bootstrap state
DOSSIER_ID_STATE="$(get_state DOSSIER_ID)"
if [[ -n "${DOSSIER_ID_STATE:-}" ]]; then
  export DOSSIER_ID="$DOSSIER_ID_STATE"
fi

need DOSSIER_ID

# CURRENT contract: fresh-only
TEST_MODE="${TEST_MODE:-fresh}"
if [[ "$TEST_MODE" != "fresh" ]]; then
  echo "FATAL: unsupported TEST_MODE='$TEST_MODE'. CURRENT contract is fresh-only."
  exit 1
fi

# In fresh mode token comes from intake/mail bootstrap, never reset here by default
TOKEN_RESET=0

# Test-only data (NOT secret)
TEST_MID_NUMBER="${TEST_MID_NUMBER:-MID-TEST-0001}"

# SAFETY: service role key must NEVER equal anon
if [[ "${SUPABASE_ANON_KEY:-}" == "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "FATAL: SUPABASE_ANON_KEY equals SUPABASE_SERVICE_ROLE_KEY (misconfigured env)."
  exit 1
fi

# Read allowed chargers from DB (source of truth)
get_allowed_max_from_db() {
    curl -sS \
    --connect-timeout 10 \
    --max-time 30 \
    "$SUPABASE_URL/rest/v1/dossiers?select=charger_count&id=eq.$DOSSIER_ID&limit=1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('charger_count','')) if d else print('')"
}

ALLOWED_MAX="$(get_allowed_max_from_db || true)"
if [[ -z "${ALLOWED_MAX:-}" ]]; then
  echo "FATAL: could not read dossiers.charger_count for DOSSIER_ID=$DOSSIER_ID"
  exit 1
fi

TARGET_CHARGERS="${EXPECTED_CHARGERS:-$ALLOWED_MAX}"

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
  exit 1
fi

get_all_charger_ids() {
    curl -sS \
    --connect-timeout 10 \
    --max-time 30 \
    "$SUPABASE_URL/rest/v1/dossier_chargers?select=id,created_at&dossier_id=eq.$DOSSIER_ID&order=created_at.asc" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join([r['id'] for r in d]))"
}

create_charger_and_get_id() {
  local rid="$1"
  local serial="$2"

  local resp http body id
  resp="$(http_call_with_idem \
    "$SUPABASE_URL/functions/v1/api-dossier-charger-save" \
    "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$(dossier_token)\",\"serial_number\":\"TEST-$rid-$serial\",\"mid_number\":\"$TEST_MID_NUMBER\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"audit-test setup\"}" \
    "$rid")"

  http="$(extract_http_status "$resp")"
  body="$(extract_body_json "$resp")"

  if [[ "$http" != "200" ]]; then
    echo "FATAL: charger-create failed (HTTP $http) rid=$rid"
    echo "BODY:"
    print_json_safe_trunc "$body" 1200
    echo ""
    echo "RAW (first 60 lines):"
    print_resp_head "$resp" 60
    return 1
  fi

  id="$(echo "$body" | sed -n 's/.*"charger_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [[ -z "$id" ]]; then
    echo "FATAL: charger-create returned 200 but no charger_id in response rid=$rid"
    echo "BODY:"
    echo "$body"
    return 1
  fi

  echo "$id"
  return 0
}

# Read existing chargers
EXISTING_CHARGER_IDS=()

CHARGERS="$(get_all_charger_ids || true)"

while IFS= read -r line; do
  if [[ -n "${line:-}" ]]; then
    EXISTING_CHARGER_IDS+=("$line")
  fi
done <<< "$CHARGERS"

EXISTING_COUNT="${#EXISTING_CHARGER_IDS[@]}"

echo "Allowed max chargers (DB): $ALLOWED_MAX"
echo "Target chargers: $TARGET_CHARGERS"
echo "Existing chargers: $EXISTING_COUNT"

if [[ "$EXISTING_COUNT" -gt "$TARGET_CHARGERS" ]]; then
  echo "FATAL: dossier has more chargers than TARGET_CHARGERS. Refuse to run."
  exit 1
fi

CREATED_CHARGER_IDS=()

# Normal fill-to-target
if [[ "$EXISTING_COUNT" -ge "$TARGET_CHARGERS" ]]; then
  echo "No chargers to create (existing_count=$EXISTING_COUNT target=$TARGET_CHARGERS)."
  NEED_CREATE=0
else
  NEED_CREATE=$((TARGET_CHARGERS - EXISTING_COUNT))
fi

if [[ "$NEED_CREATE" -gt 0 ]]; then
  echo "Creating missing chargers to reach target: $NEED_CREATE"
  for i in $(seq 1 "$NEED_CREATE"); do
    rid="setup-charger-$i-$(now_ts)"
    echo ""
    echo "SETUP) creating charger $i/$NEED_CREATE (request_id=$rid)"

    # Belangrijk: vang failure af en print bewijs (anders lijkt het alsof tests “verdwijnen”)
    if ! cid="$(create_charger_and_get_id "$rid" "$i")"; then
      echo "FATAL: create_charger_and_get_id failed at i=$i rid=$rid"
      exit 1
    fi

    if [[ -z "${cid:-}" ]]; then
      echo "FATAL: create_charger_and_get_id returned empty charger_id i=$i rid=$rid"
      exit 1
    fi

    CREATED_CHARGER_IDS+=("$cid")
    echo " - created charger_id: $cid"
  done
else
  echo "No chargers to create."
fi

# Choose CHARGER_ID for reject tests (prefer existing, else first created)
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

EXISTING_AFTER_SETUP=$((EXISTING_COUNT + ${#CREATED_CHARGER_IDS[@]}))

# Persist state (comma-separated list)
CREATED_CSV=""
if [[ "${#CREATED_CHARGER_IDS[@]}" -gt 0 ]]; then
  CREATED_CSV="$(IFS=,; echo "${CREATED_CHARGER_IDS[*]}")"
fi

set_state ALLOWED_MAX "$ALLOWED_MAX"
set_state TARGET_CHARGERS "$TARGET_CHARGERS"
set_state EXISTING_COUNT "$EXISTING_COUNT"
set_state EXISTING_AFTER_SETUP "$EXISTING_AFTER_SETUP"
set_state CHARGER_ID "$CHARGER_ID"
set_state CREATED_CHARGER_IDS "$CREATED_CSV"

echo "SETUP OK — CHARGER_ID (rejects): $CHARGER_ID"
echo "SETUP OK — created chargers this run: ${#CREATED_CHARGER_IDS[@]}"

if [[ "${#CREATED_CHARGER_IDS[@]}" -eq 0 ]]; then
  echo "FATAL: fresh setup requires created chargers this run, got 0."
  echo "This means setup did not create chargers for a fresh dossier."
  exit 1
fi