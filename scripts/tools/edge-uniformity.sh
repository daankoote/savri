#!/usr/bin/env bash
set -euo pipefail

# ================================================================
# ENVAL — Edge Uniformity Report (V4)
# Bash 3.2 safe
# ================================================================

# ENVAL — EDGE UNIFORMITY TOOL
#
# Doel:
# - Controleert of edge functions voldoen aan de afgesproken baseline
# - Voorkomt legacy drift en "snowflake" functies
#
# Controleert o.a.:
# - classificatie CORE vs UTILITY
# - CORS
# - request metadata / traceability
# - idempotency enforcement
# - audit logging
# - auth gates
# - service-role usage
#
# Belangrijk:
# - Dit is een repo-kwaliteitscheck, geen runtime test
# - Gebruik dit vóór grotere refactors of contractwijzigingen

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
FN_DIR="$REPO_ROOT/supabase/functions"

if [[ ! -d "$FN_DIR" ]]; then
  echo "FATAL: functions dir not found: $FN_DIR"
  exit 1
fi

CORE_FUNCS=(
  "api-dossier-access-save"
  "api-dossier-access-update"
  "api-dossier-address-save"
  "api-dossier-address-verify"
  "api-dossier-charger-delete"
  "api-dossier-charger-save"
  "api-dossier-consents-save"
  "api-dossier-doc-delete"
  "api-dossier-doc-download-url"
  "api-dossier-evaluate"
  "api-dossier-export"
  "api-dossier-get"
  "api-dossier-login-request"
  "api-dossier-upload-confirm"
  "api-dossier-upload-url"
  "api-lead-submit"
)

UTILITY_FUNCS=(
  "mail-worker"
)

in_list() {
  local needle="$1"
  shift
  local x
  for x in "$@"; do
    if [[ "$x" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

class_of() {
  local name="$1"
  if in_list "$name" "${CORE_FUNCS[@]}"; then
    echo "core"
    return 0
  fi
  if in_list "$name" "${UTILITY_FUNCS[@]}"; then
    echo "utility"
    return 0
  fi
  echo "UNCLASSIFIED"
  return 0
}

detect_cors() {
  local f="$1"
  if grep -q "Access-Control-Allow-Origin" "$f" && grep -q "Vary" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_meta() {
  local f="$1"
  if grep -q "getReqMeta" "$f" || grep -q "request_id" "$f" || grep -q "x-request-id" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_idem() {
  local f="$1"
  if grep -q "Idempotency-Key" "$f" || grep -qi "idempotency" "$f" || grep -q "idempotency_keys" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_aud() {
  local f="$1"
  if grep -q "insertAudit" "$f" || grep -q "insertAuditFailOpen" "$f" || grep -q "auditSessionRejectFailOpen" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_auth() {
  local f="$1"
  if grep -q "authSession" "$f" || grep -q "customer_auth" "$f" || grep -qi "session_token" "$f" || grep -qi "unauthorized" "$f" || grep -qi "access_token_hash" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_srv() {
  local f="$1"
  if grep -q "SUPABASE_SERVICE_ROLE_KEY" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_lock() {
  local f="$1"
  if grep -qi "locked_at" "$f" || grep -qi "in_review" "$f" || grep -qi "ready_for_booking" "$f" || grep -qi "ready_for_review" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

TMP_LIST="$(mktemp)"
trap 'rm -f "$TMP_LIST"' EXIT

find "$FN_DIR" -maxdepth 1 -type d ! -name "_*" ! -path "$FN_DIR" | sort > "$TMP_LIST"

echo "ENVAL — Edge Uniformity Report (V4)"
echo "Repo: $REPO_ROOT"
echo "Dir:  $FN_DIR"
echo ""

printf "%-30s | %-8s | %4s | %4s | %5s | %4s | %4s | %4s | %4s\n" \
  "function" "CLASS" "CORS" "META" "IDEM" "AUD" "AUTH" "SRV" "LOCK"
echo "--------------------------------------------------------------------------------------------------------------"

failcount=0
core_total=0
core_fail=0
util_total=0
util_fail=0
unclassified=0

while IFS= read -r d; do
  name="$(basename "$d")"
  f="$d/index.ts"

  if [[ ! -f "$f" ]]; then
    continue
  fi

  cls="$(class_of "$name")"

  if [[ "$cls" == "UNCLASSIFIED" ]]; then
    unclassified=$((unclassified + 1))
  fi

  CORS="$(detect_cors "$f")"
  META="$(detect_meta "$f")"
  IDEM="$(detect_idem "$f")"
  AUD="$(detect_aud "$f")"
  AUTH="$(detect_auth "$f")"
  SRV="$(detect_srv "$f")"
  LOCK="$(detect_lock "$f")"

  printf "%-30s | %-8s | %4s | %4s | %5s | %4s | %4s | %4s | %4s\n" \
    "$name" "$cls" "$CORS" "$META" "$IDEM" "$AUD" "$AUTH" "$SRV" "$LOCK"

  if [[ "$cls" == "core" ]]; then
    core_total=$((core_total + 1))
    if [[ "$CORS" == "NO" || "$META" == "NO" || "$IDEM" == "NO" || "$AUD" == "NO" || "$AUTH" == "NO" || "$SRV" == "NO" ]]; then
      core_fail=$((core_fail + 1))
      failcount=$((failcount + 1))
    fi
  elif [[ "$cls" == "utility" ]]; then
    util_total=$((util_total + 1))
    if [[ "$META" == "NO" ]]; then
      util_fail=$((util_fail + 1))
      failcount=$((failcount + 1))
    fi
  else
    failcount=$((failcount + 1))
  fi
done < "$TMP_LIST"

echo "--------------------------------------------------------------------------------------------------------------"
echo "SUMMARY:"
echo "- core:     $core_total total, $core_fail failing baseline"
echo "- utility:  $util_total total, $util_fail failing baseline (META required)"
echo "- unclassified: $unclassified (HARD FAIL)"
echo ""

if [[ "$failcount" -gt 0 ]]; then
  echo "FAIL: $failcount issues found."
  echo "Policy: every function must be classified; core baseline strict; utility must have META."
  exit 1
fi

echo "OK: classification complete + baselines satisfied."