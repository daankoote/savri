#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== RETENTION CLEANUP TESTS =="

need SUPABASE_URL
need SUPABASE_ANON_KEY
need SUPABASE_SERVICE_ROLE_KEY

TEST_MODE="${TEST_MODE:-fresh}"
if [[ "$TEST_MODE" != "fresh" ]]; then
  echo "FATAL: unsupported TEST_MODE='$TEST_MODE'. CURRENT contract is fresh-only."
  exit 1
fi

DID="$(get_state DOSSIER_ID)"
if [[ -z "${DID:-}" ]]; then
  echo "FATAL: retention cleanup requires DOSSIER_ID in state"
  exit 1
fi

export DOSSIER_ID="$DID"

RPC_RETENTION="$SUPABASE_URL/rest/v1/rpc/enval_retention_cleanup"

rpc_retention_raw() {
  local payload="$1"

  curl -sS -i \
    --connect-timeout 10 \
    --max-time 60 \
    "$RPC_RETENTION" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    --data "$payload"
}

extract_http_body_any_json() {
  # RPC responses can be JSON arrays (`[...]`) instead of objects (`{...}`).
  # The shared extract_body_json helper only captures object bodies.
  awk 'BEGIN{body=0} body==1 {print} /^\r?$/ {body=1}'
}

echo "RETENTION) dossier_id: $DOSSIER_ID"

# -------------------------------------------------------------------
# 1) Precondition: preserved export exists for current fresh dossier
# -------------------------------------------------------------------
echo ""
echo "1) PRECONDITION — preserved export exists"
echo "------------------------------------------------"

EXPORT_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/dossier_exports?select=id,dossier_id,schema_version,export_status,payment_status,export_sha256,claim_year,claimed_mid_numbers,export_json,created_at&dossier_id=eq.$DOSSIER_ID&order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

EXPORT_ASSERTS="$(python3 - "$DOSSIER_ID" "$EXPORT_JSON" <<'PY'
import json, sys

expected_dossier_id = sys.argv[1]
rows = json.loads(sys.argv[2])

errors = []
if not isinstance(rows, list) or len(rows) != 1:
    errors.append(f"expected exactly 1 latest export row, got {0 if not isinstance(rows, list) else len(rows)}")
else:
    r = rows[0]
    if str(r.get("dossier_id") or "") != expected_dossier_id:
        errors.append("dossier_id mismatch")
    if r.get("schema_version") != "enval-dossier-export.v5":
        errors.append("schema_version mismatch")
    if r.get("payment_status") != "waived":
        errors.append("payment_status mismatch")
    sha = str(r.get("export_sha256") or "")
    if len(sha) != 64:
        errors.append("export_sha256 invalid")
    if not isinstance(r.get("claim_year"), int) or r.get("claim_year") < 2020:
        errors.append("claim_year invalid")
    if not isinstance(r.get("claimed_mid_numbers"), list) or not r.get("claimed_mid_numbers"):
        errors.append("claimed_mid_numbers missing")
    export_json = r.get("export_json") or {}
    docs = export_json.get("documents_confirmed") or []
    if not isinstance(docs, list) or len(docs) != 8:
        errors.append(f"preserved document count != 8 (got {0 if not isinstance(docs, list) else len(docs)})")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$EXPORT_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: preserved export precondition failed"
  printf "%s\n" "$EXPORT_ASSERTS" | tail -n +2
  echo "EXPORT JSON:"
  print_json_safe_trunc "$EXPORT_JSON" 1600
  exit 1
fi

EXPORT_ID="$(python3 - "$EXPORT_JSON" <<'PY'
import json, sys
rows = json.loads(sys.argv[1])
print(rows[0].get("id") if rows else "")
PY
)"

echo "OK preserved export exists: $EXPORT_ID"

# -------------------------------------------------------------------
# 2) Mass apply without target must fail
# -------------------------------------------------------------------
echo ""
echo "2) REJECT — mass apply without explicit target"
echo "------------------------------------------------"

MASS_PAYLOAD='{"p_apply":true,"p_now":"2099-01-01T00:00:00Z","p_target_dossier_id":null,"p_limit":20}'
MASS_RESP="$(rpc_retention_raw "$MASS_PAYLOAD")"
MASS_HTTP="$(extract_http_status "$MASS_RESP")"
MASS_BODY="$(printf "%s\n" "$MASS_RESP" | extract_http_body_any_json)"

if [[ "$MASS_HTTP" == "200" || "$MASS_HTTP" == "201" ]]; then
  echo "ASSERT FAIL: mass apply without target unexpectedly succeeded"
  print_json_safe_trunc "$MASS_BODY" 1200
  exit 1
fi

if ! printf "%s" "$MASS_BODY" | grep -q "RETENTION_CLEANUP_REFUSED"; then
  echo "ASSERT FAIL: mass apply reject missing RETENTION_CLEANUP_REFUSED"
  echo "HTTP: $MASS_HTTP"
  print_json_safe_trunc "$MASS_BODY" 1200
  exit 1
fi

echo "PASS mass apply rejected"

# -------------------------------------------------------------------
# 3) Dry-run target: preserved runtime cleanup candidate
# -------------------------------------------------------------------
echo ""
echo "3) DRY-RUN — preserved runtime cleanup candidate"
echo "------------------------------------------------"

DRY_PAYLOAD="$(python3 - "$DOSSIER_ID" <<'PY'
import json, sys
print(json.dumps({
    "p_apply": False,
    "p_now": "2099-01-01T00:00:00Z",
    "p_target_dossier_id": sys.argv[1],
    "p_limit": 1,
}))
PY
)"

DRY_RESP="$(rpc_retention_raw "$DRY_PAYLOAD")"
DRY_HTTP="$(extract_http_status "$DRY_RESP")"
DRY_BODY="$(printf "%s\n" "$DRY_RESP" | extract_http_body_any_json)"

if [[ "$DRY_HTTP" != "200" ]]; then
  echo "ASSERT FAIL: dry-run expected 200 got $DRY_HTTP"
  print_json_safe_trunc "$DRY_BODY" 1600
  exit 1
fi

DRY_ASSERTS="$(python3 - "$DOSSIER_ID" "$DRY_BODY" <<'PY'
import json, sys

expected_dossier_id = sys.argv[1]
rows = json.loads(sys.argv[2])

errors = []
if not isinstance(rows, list) or len(rows) != 1:
    errors.append(f"expected 1 dry-run row, got {0 if not isinstance(rows, list) else len(rows)}")
else:
    r = rows[0]
    if str(r.get("dossier_id") or "") != expected_dossier_id:
        errors.append("dossier_id mismatch")
    if r.get("retention_class") != "preserved_runtime_cleanup":
        errors.append(f"retention_class mismatch: {r.get('retention_class')!r}")
    if r.get("apply") is not False:
        errors.append("apply should be false")
    if r.get("preserved") is not True:
        errors.append("preserved should be true")
    if r.get("deleted_runtime_dossier") is not False:
        errors.append("deleted_runtime_dossier should be false in dry-run")
    if int(r.get("runtime_documents") or 0) != 8:
        errors.append(f"runtime_documents != 8 (got {r.get('runtime_documents')!r})")
    if int(r.get("runtime_chargers") or 0) != 4:
        errors.append(f"runtime_chargers != 4 (got {r.get('runtime_chargers')!r})")
    deletable = r.get("deletable_storage_paths")
    if not isinstance(deletable, list) or len(deletable) != 0:
        errors.append("deletable_storage_paths should be [] for preserved runtime cleanup")
    runtime_paths = r.get("runtime_storage_paths") or []
    preserved_paths = r.get("preserved_storage_paths") or []
    if len(runtime_paths) != 8:
        errors.append(f"runtime_storage_paths length != 8 (got {len(runtime_paths)})")
    if len(preserved_paths) != 8:
        errors.append(f"preserved_storage_paths length != 8 (got {len(preserved_paths)})")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$DRY_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: retention dry-run mismatch"
  printf "%s\n" "$DRY_ASSERTS" | tail -n +2
  echo "DRY BODY:"
  print_json_safe_trunc "$DRY_BODY" 2400
  exit 1
fi

echo "PASS dry-run preserved runtime cleanup candidate"

# -------------------------------------------------------------------
# 4) Apply target: runtime dossier removed, export preserved
# -------------------------------------------------------------------
echo ""
echo "4) APPLY — preserved runtime cleanup"
echo "------------------------------------------------"

APPLY_PAYLOAD="$(python3 - "$DOSSIER_ID" <<'PY'
import json, sys
print(json.dumps({
    "p_apply": True,
    "p_now": "2099-01-01T00:00:00Z",
    "p_target_dossier_id": sys.argv[1],
    "p_limit": 1,
}))
PY
)"

APPLY_RESP="$(rpc_retention_raw "$APPLY_PAYLOAD")"
APPLY_HTTP="$(extract_http_status "$APPLY_RESP")"
APPLY_BODY="$(printf "%s\n" "$APPLY_RESP" | extract_http_body_any_json)"

if [[ "$APPLY_HTTP" != "200" ]]; then
  echo "ASSERT FAIL: apply expected 200 got $APPLY_HTTP"
  print_json_safe_trunc "$APPLY_BODY" 2400
  exit 1
fi

APPLY_ASSERTS="$(python3 - "$DOSSIER_ID" "$APPLY_BODY" <<'PY'
import json, sys

expected_dossier_id = sys.argv[1]
rows = json.loads(sys.argv[2])

errors = []
if not isinstance(rows, list) or len(rows) != 1:
    errors.append(f"expected 1 apply row, got {0 if not isinstance(rows, list) else len(rows)}")
else:
    r = rows[0]
    if str(r.get("dossier_id") or "") != expected_dossier_id:
        errors.append("dossier_id mismatch")
    if r.get("retention_class") != "preserved_runtime_cleanup":
        errors.append("retention_class mismatch")
    if r.get("apply") is not True:
        errors.append("apply should be true")
    if r.get("preserved") is not True:
        errors.append("preserved should be true")
    if r.get("deleted_runtime_dossier") is not True:
        errors.append("deleted_runtime_dossier should be true")
    deletable = r.get("deletable_storage_paths")
    if not isinstance(deletable, list) or len(deletable) != 0:
        errors.append("deletable_storage_paths should be [] for preserved runtime cleanup")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$APPLY_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: retention apply response mismatch"
  printf "%s\n" "$APPLY_ASSERTS" | tail -n +2
  echo "APPLY BODY:"
  print_json_safe_trunc "$APPLY_BODY" 2400
  exit 1
fi

echo "PASS apply removed preserved runtime dossier"

# -------------------------------------------------------------------
# 5) Post-cleanup DB proof
# -------------------------------------------------------------------
echo ""
echo "5) POST-CLEANUP PROOF"
echo "------------------------------------------------"

PROOF_JSON="$(python3 - "$SUPABASE_URL" "$SUPABASE_ANON_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "$DOSSIER_ID" "$EXPORT_ID" <<'PY'
import json, sys, urllib.request

base, anon, service, dossier_id, export_id = sys.argv[1:6]

headers = {
    "apikey": anon,
    "Authorization": f"Bearer {service}",
}

def get(path):
    req = urllib.request.Request(base + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

result = {}

tables = {
    "runtime_dossier_rows": f"/rest/v1/dossiers?select=id&id=eq.{dossier_id}",
    "runtime_document_rows": f"/rest/v1/dossier_documents?select=id&dossier_id=eq.{dossier_id}",
    "runtime_charger_rows": f"/rest/v1/dossier_chargers?select=id&dossier_id=eq.{dossier_id}",
    "runtime_audit_rows": f"/rest/v1/dossier_audit_events?select=id&dossier_id=eq.{dossier_id}",
    "runtime_session_rows": f"/rest/v1/dossier_sessions?select=id&dossier_id=eq.{dossier_id}",
    "runtime_analysis_run_rows": f"/rest/v1/dossier_analysis_runs?select=id&dossier_id=eq.{dossier_id}",
}

for key, path in tables.items():
    rows = get(path)
    result[key] = len(rows) if isinstance(rows, list) else -1

exports = get(f"/rest/v1/dossier_exports?select=id,dossier_id,export_json,claim_year,claimed_mid_numbers&id=eq.{export_id}&limit=1")
result["preserved_export_rows"] = len(exports) if isinstance(exports, list) else -1

if exports:
    export_json = exports[0].get("export_json") or {}
    docs = export_json.get("documents_confirmed") or []
    result["preserved_document_count"] = len(docs) if isinstance(docs, list) else -1
    result["claim_year_present"] = isinstance(exports[0].get("claim_year"), int)
    result["claimed_mid_numbers_present"] = isinstance(exports[0].get("claimed_mid_numbers"), list) and len(exports[0].get("claimed_mid_numbers")) > 0
else:
    result["preserved_document_count"] = -1
    result["claim_year_present"] = False
    result["claimed_mid_numbers_present"] = False

print(json.dumps(result, ensure_ascii=False))
PY
)"

PROOF_ASSERTS="$(python3 - "$PROOF_JSON" <<'PY'
import json, sys

d = json.loads(sys.argv[1])
errors = []

zero_keys = [
    "runtime_dossier_rows",
    "runtime_document_rows",
    "runtime_charger_rows",
    "runtime_audit_rows",
    "runtime_session_rows",
    "runtime_analysis_run_rows",
]

for key in zero_keys:
    if d.get(key) != 0:
        errors.append(f"{key} expected 0 got {d.get(key)!r}")

if d.get("preserved_export_rows") != 1:
    errors.append(f"preserved_export_rows expected 1 got {d.get('preserved_export_rows')!r}")

if d.get("preserved_document_count") != 8:
    errors.append(f"preserved_document_count expected 8 got {d.get('preserved_document_count')!r}")

if d.get("claim_year_present") is not True:
    errors.append("claim_year missing from preserved export")

if d.get("claimed_mid_numbers_present") is not True:
    errors.append("claimed_mid_numbers missing from preserved export")

if errors:
    print("FAIL")
    for e in errors:
        print(e)
else:
    print("OK")
PY
)"

if [[ "$(printf "%s" "$PROOF_ASSERTS" | head -n 1)" != "OK" ]]; then
  echo "ASSERT FAIL: post-cleanup proof mismatch"
  printf "%s\n" "$PROOF_ASSERTS" | tail -n +2
  echo "PROOF JSON:"
  print_json_safe_trunc "$PROOF_JSON" 1600
  exit 1
fi

echo "PASS preserved export intact after runtime cleanup"
echo "PASS runtime dossier data removed after preservation"
echo "PASS retention cleanup"
