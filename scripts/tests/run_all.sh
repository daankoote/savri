#!/usr/bin/env bash

# scripts/tests/run_all.sh
# Fresh-only test runner:
# - bootstrap een nieuw testdossier via echte intake/mailflow
# - hydrateer DOSSIER_ID + DOSSIER_TOKEN vanuit state
# - run contract/reject/happy-path tests
# - ruim mutable child artefacten op
# - behoud dossier/outbound/audit shell vanwege audit immutability


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
# Test mode (CURRENT: fresh-first)
# ----------------------------
TEST_MODE="${TEST_MODE:-fresh}"

if [[ "$TEST_MODE" != "fresh" ]]; then
  echo "FATAL: unsupported TEST_MODE='$TEST_MODE'. CURRENT contract is fresh-only."
  exit 1
fi

# ----------------------------
# Load helpers AFTER env
# ----------------------------
source "$DIR/00_helpers.sh"

# Make redact() available inside process substitution subshell (macOS bash needs this)
export -f redact

# ----------------------------
# Output: always redacted + saved to file (overwrite each run)
# ----------------------------
OUTDIR="$DIR/output"
OUTFILE="$OUTDIR/latest.log"
mkdir -p "$OUTDIR"
: > "$OUTFILE"

# Force ALL stdout+stderr through redact + tee
exec > >(redact | tee "$OUTFILE") 2>&1

export START_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "LOG FILE: $OUTFILE"
echo "START_ISO: $START_ISO"

echo ""
echo "=================================="
echo "ENVAL AUDIT TEST SUITE"
echo "=================================="

reset_state

"$DIR/00_fresh_dossier.sh"

DOSSIER_ID_STATE="$(get_state DOSSIER_ID)"
DOSSIER_TOKEN_STATE="$(get_state DOSSIER_TOKEN)"

if [[ -z "${DOSSIER_ID_STATE:-}" || -z "${DOSSIER_TOKEN_STATE:-}" ]]; then
  echo "FATAL: fresh bootstrap did not populate state DOSSIER_ID/DOSSIER_TOKEN"
  exit 1
fi

export DOSSIER_ID="$DOSSIER_ID_STATE"
export DOSSIER_TOKEN="$DOSSIER_TOKEN_STATE"

echo "RUN) using fresh DOSSIER_ID from state: $DOSSIER_ID"

# ----------------------------
# OPTIONAL GUARD: customer_email must look like a test dossier
# Requires SUPABASE_SERVICE_ROLE_KEY
# Runs ONLY after fresh bootstrap, because DOSSIER_ID now exists
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

echo "DOSSIER_ID: $DOSSIER_ID"

"$DIR/01_setup.sh"
echo ""
echo "POST-SETUP PROOF:"
echo " - DOSSIER_ID (state): $(get_state DOSSIER_ID)"
echo " - DOSSIER_ID (env):   ${DOSSIER_ID:-<empty>}"
echo " - token sha256 prefix: $(sha256_str "$(dossier_token)" | cut -c1-16)..."
"$DIR/02_intake_contract.sh"
"$DIR/03_login_tests.sh"
echo ""
echo "POST-LOGIN PROOF:"
echo " - DOSSIER_TOKEN sha256 prefix: $(sha256_str "$(dossier_token)" | cut -c1-16)..."
"$DIR/04_charger_contract.sh"
"$DIR/05_upload_rejects.sh"
"$DIR/06_upload_happy.sh"
"$DIR/07_cleanup.sh"

echo ""
echo "ALL TESTS PASSED"