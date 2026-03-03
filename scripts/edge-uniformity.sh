#!/usr/bin/env bash
set -euo pipefail

# ================================================================
# ENVAL — Edge Uniformity Report (V2)
#
# Goals:
# - No surprises: every function must be classified as CORE or UTILITY
# - CORE baseline is strict: CORS + META + IDEM + AUD + AUTH + SRV
# - UTILITY baseline is minimal: META (traceability). Other columns report-only.
#
# Bash 3.2 compatible (macOS default): no mapfile, no associative arrays.
# ================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FN_DIR="$REPO_ROOT/supabase/functions"

if [[ ! -d "$FN_DIR" ]]; then
  echo "FATAL: functions dir not found: $FN_DIR"
  exit 1
fi

# -------------------------
# Classification (NO SURPRISES)
# -------------------------
# Any new function MUST be added to one of these lists or the script FAILS.
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
  "api-dossier-submit-review"
  "api-dossier-upload-confirm"
  "api-dossier-upload-url"
  "api-lead-submit"
)

UTILITY_FUNCS=(
  "api-dossier-address-preview"
  "mail-worker"
)

in_list() {
  local needle="$1"; shift
  for x in "$@"; do
    if [[ "$x" == "$needle" ]]; then return 0; fi
  done
  return 1
}

class_of() {
  local name="$1"
  if in_list "$name" "${CORE_FUNCS[@]}"; then
    echo "core"; return 0
  fi
  if in_list "$name" "${UTILITY_FUNCS[@]}"; then
    echo "utility"; return 0
  fi
  echo "UNCLASSIFIED"; return 0
}

# -------------------------
# Grep helpers (heuristics, but stable)
# -------------------------
has() { grep -q "$1" "$2" && echo "yes" || echo "NO"; }

detect_cors() {
  local f="$1"
  if grep -q "Access-Control-Allow-Origin" "$f" && grep -q "Vary\"*[: ]*\"Origin" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_meta() {
  local f="$1"
  # Accept shared helper(s) or direct request_id functions
  if grep -q "getReqMeta" "$f" || grep -q "getReqId" "$f" || grep -q "x-request-id" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_idem() {
  local f="$1"
  # Explicit header check or idempotency table usage
  if grep -q "Idempotency-Key" "$f" || grep -qi "idempotency" "$f" || grep -q "idempotency_keys" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_aud() {
  local f="$1"
  # Accept variations; your code uses insertAudit* patterns
  if grep -q "insertAudit" "$f" || grep -q "insertAuditFailOpen" "$f" || grep -q "dossier_audit_events" "$f" || grep -q "intake_audit_events" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_auth() {
  local f="$1"
  # Heuristic: token checks / unauthorized responses / auth wording
  if grep -q "\"token\"" "$f" || grep -qi "unauthorized" "$f" || grep -qi "auth" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_srv() {
  local f="$1"
  # Service role usage (either env key name or actual createClient with service role)
  if grep -q "SUPABASE_SERVICE_ROLE_KEY" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

detect_lock() {
  local f="$1"
  if grep -qi "locked" "$f" || grep -qi "lock_check" "$f" || grep -qi "is_locked" "$f"; then
    echo "yes"
  else
    echo "NO"
  fi
}

# -------------------------
# Report header
# -------------------------
echo "ENVAL — Edge Uniformity Report (V2)"
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

# macOS bash 3.2 safe loop
while IFS= read -r d; do
  name="$(basename "$d")"
  f="$d/index.ts"
  if [[ ! -f "$f" ]]; then
    continue
  fi

  cls="$(class_of "$name")"
  if [[ "$cls" == "UNCLASSIFIED" ]]; then
    unclassified=$((unclassified+1))
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

  # -------- Enforcements --------
  if [[ "$cls" == "core" ]]; then
    core_total=$((core_total+1))

    # CORE baseline: strict
    if [[ "$CORS" == "NO" || "$META" == "NO" || "$IDEM" == "NO" || "$AUD" == "NO" || "$AUTH" == "NO" || "$SRV" == "NO" ]]; then
      core_fail=$((core_fail+1))
      failcount=$((failcount+1))
    fi
  elif [[ "$cls" == "utility" ]]; then
    util_total=$((util_total+1))

    # UTILITY baseline: minimal traceability
    if [[ "$META" == "NO" ]]; then
      util_fail=$((util_fail+1))
      failcount=$((failcount+1))
    fi
  else
    # Unclassified is always a hard fail (no surprises)
    failcount=$((failcount+1))
  fi

done < <(find "$FN_DIR" -maxdepth 1 -type d -not -name "_*" -not -path "$FN_DIR" | sort)

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