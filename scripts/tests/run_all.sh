# scripts/tests/run_all.sh

#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"

# ----------------------------
# Auto-load env (preferred)
# ----------------------------
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env.local}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  echo "FATAL: ENV file not found at: $ENV_FILE"
  echo "Create $REPO_ROOT/.env.local or run with ENV_FILE=/path/to/env"
  exit 1
fi

# ----------------------------
# HARD GUARD: allowlist DOSSIER_ID
# ----------------------------
ALLOWLIST_FILE="${ALLOWLIST_FILE:-$DIR/.allowlist_dossiers}"

if [[ -z "${DOSSIER_ID:-}" ]]; then
  echo "FATAL: DOSSIER_ID missing (env)."
  exit 1
fi

if [[ ! -f "$ALLOWLIST_FILE" ]]; then
  echo "FATAL: allowlist file missing: $ALLOWLIST_FILE"
  echo "Create it and add the allowed DOSSIER_ID(s), one per line."
  exit 1
fi

# match exact line, ignoring comments/blank lines
if ! grep -v '^[[:space:]]*#' "$ALLOWLIST_FILE" | grep -v '^[[:space:]]*$' | grep -Fxq "$DOSSIER_ID"; then
  echo "FATAL: DOSSIER_ID is NOT in allowlist. Refuse to run."
  echo "DOSSIER_ID: $DOSSIER_ID"
  echo "Allowlist:  $ALLOWLIST_FILE"
  exit 1
fi

# ----------------------------
# OPTIONAL GUARD: customer_email must look like a test dossier
# Requires SUPABASE_SERVICE_ROLE_KEY
# ----------------------------
if [[ -n "${TEST_EMAIL_REGEX:-}" ]]; then
  if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || -z "${SUPABASE_ANON_KEY:-}" ]]; then
    echo "FATAL: TEST_EMAIL_REGEX set but missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY"
    exit 1
  fi

  EMAIL_JSON="$(curl -s \
    "$SUPABASE_URL/rest/v1/dossiers?select=customer_email&id=eq.$DOSSIER_ID&limit=1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

  CUSTOMER_EMAIL="$(echo "$EMAIL_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d[0].get('customer_email') or '') if d else '')")"

  if [[ -z "${CUSTOMER_EMAIL:-}" ]]; then
    echo "FATAL: could not read dossiers.customer_email for DOSSIER_ID=$DOSSIER_ID"
    exit 1
  fi

  if ! [[ "$CUSTOMER_EMAIL" =~ $TEST_EMAIL_REGEX ]]; then
    echo "FATAL: dossier customer_email does not match TEST_EMAIL_REGEX. Refuse to run."
    echo "customer_email: $CUSTOMER_EMAIL"
    echo "regex:         $TEST_EMAIL_REGEX"
    exit 1
  fi
fi


# ----------------------------
# Load helpers AFTER env + guard
# ----------------------------
source "$DIR/00_helpers.sh"

export START_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo ""
echo "=================================="
echo "ENVAL AUDIT TEST SUITE"
echo "=================================="

reset_state

"$DIR/01_setup.sh"
"$DIR/02_intake_contract.sh"
"$DIR/03_login_tests.sh"
"$DIR/05_upload_rejects.sh"
"$DIR/06_upload_happy.sh"
"$DIR/07_cleanup.sh"

echo ""
echo "ALL TESTS PASSED"