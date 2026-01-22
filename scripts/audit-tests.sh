#!/usr/bin/env bash
set -euo pipefail

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

# Helpers
now_ts() { date +%s; }

call() {
  local label="$1"
  local url="$2"
  local data="$3"
  local idem="$4"

  echo ""
  echo "$label"
  echo "------------------------------------------------"
  # Print headers + body (so we can verify payload semantics)
  curl -i "$url" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $idem" \
    --data "$data"
  echo ""
}

# 1) REJECT TEST — charger-save (unauthorized)
BAD_TOKEN="BAD-${DOSSIER_TOKEN}"
idem1="reject-charger-unauth-$(now_ts)"
call "1) REJECT TEST — charger-save (unauthorized)" \
  "$SUPABASE_URL/functions/v1/api-dossier-charger-save" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$BAD_TOKEN\",\"serial_number\":\"TEST-$(now_ts)\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject unauth\"}" \
  "$idem1"

# 2) REJECT TEST — charger-save (max chargers)
idem2="reject-charger-max-$(now_ts)"
call "2) REJECT TEST — charger-save (max chargers)" \
  "$SUPABASE_URL/functions/v1/api-dossier-charger-save" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"serial_number\":\"TEST-$(now_ts)\",\"brand\":\"TEST\",\"model\":\"TEST\",\"power_kw\":11,\"notes\":\"reject max\"}" \
  "$idem2"

# 3) REJECT TEST — doc-delete (unauthorized)
idem3="reject-doc-unauth-$(now_ts)"
call "3) REJECT TEST — doc-delete (unauthorized)" \
  "$SUPABASE_URL/functions/v1/api-dossier-doc-delete" \
  "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$BAD_TOKEN\",\"document_id\":\"00000000-0000-0000-0000-000000000000\"}" \
  "$idem3"

# 4) REJECT TEST — doc-delete (document not found) — idempotent 200, but must be deleted:false + reason:not_found
idem4="reject-doc-missing-$(now_ts)"
RESP4="$(curl -i -s "$SUPABASE_URL/functions/v1/api-dossier-doc-delete" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $idem4" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"document_id\":\"00000000-0000-0000-0000-000000000000\"}")"

echo ""
echo "4) REJECT TEST — doc-delete (document not found)"
echo "------------------------------------------------"
echo "$RESP4"
echo ""

# Extract body (last JSON object in response)
BODY4="$(echo "$RESP4" | awk 'BEGIN{p=0} /^\{/ {p=1} {if(p) print $0}')"

# Assert payload semantics
if ! echo "$BODY4" | grep -q '"deleted":[[:space:]]*false'; then
  echo "ASSERT FAIL: step4 response must contain deleted:false"
  echo "BODY:"
  echo "$BODY4"
  exit 1
fi
if ! echo "$BODY4" | grep -qi '"reason":[[:space:]]*"not_found"'; then
  echo "ASSERT FAIL: step4 response must contain reason:\"not_found\""
  echo "BODY:"
  echo "$BODY4"
  exit 1
fi

# 5) AUDIT LOG — latest 15 events
echo ""
echo "5) AUDIT LOG — laatste 15 events"
echo "------------------------------------------------"
AUDIT="$(curl -s "$SUPABASE_URL/rest/v1/dossier_audit_events?select=created_at,event_type,event_data&dossier_id=eq.$DOSSIER_ID&order=created_at.desc&limit=15" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"
echo "$AUDIT"
echo ""

# Assert: newest event for idem4 is document_delete_rejected not_found, and NOT document_deleted
if echo "$AUDIT" | head -n 1 | grep -q "document_deleted"; then
  echo "ASSERT FAIL: newest audit event should not be document_deleted for missing doc"
  exit 1
fi
if ! echo "$AUDIT" | grep -q "$idem4"; then
  echo "ASSERT FAIL: could not find audit entry with request_id=$idem4"
  exit 1
fi
if ! echo "$AUDIT" | grep -q '"event_type":"document_delete_rejected"'; then
  echo "ASSERT FAIL: expected document_delete_rejected in recent audit events"
  exit 1
fi


# -----------------------------
# Upload URL rejects + Confirm rejects
# (consistent met SUPABASE_URL/functions/v1)
# -----------------------------

need CHARGER_ID

FN_UPLOAD_URL="$SUPABASE_URL/functions/v1/api-dossier-upload-url"
FN_UPLOAD_CONFIRM="$SUPABASE_URL/functions/v1/api-dossier-upload-confirm"

echo ""
echo "== Upload URL rejects =="

# A) Missing Idempotency-Key (moet 400)
echo ""
echo "A) Missing Idempotency-Key"
echo "------------------------------------------------"
curl -s -i \
  -X POST "$FN_UPLOAD_URL" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: uploadurl-missing-idem-$(now_ts)" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"doc_type\":\"factuur\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123,\"charger_id\":\"$CHARGER_ID\"}" \
  | sed -n '1,20p'

# B) Invalid doc_type (moet 400 + audit reject)
idemB="uploadurl-invalid-doctype-$(now_ts)"
echo ""
echo "B) Invalid doc_type (expect 400 + audit reject)"
echo "------------------------------------------------"
curl -s -i \
  -X POST "$FN_UPLOAD_URL" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $idemB" \
  -H "X-Request-Id: $idemB" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"doc_type\":\"hacker\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123,\"charger_id\":\"$CHARGER_ID\"}" \
  | sed -n '1,20p'

# C) Missing charger_id for required type (factuur) (moet 400 + audit reject)
idemC="uploadurl-missing-charger-$(now_ts)"
echo ""
echo "C) Missing charger_id (expect 400 + audit reject)"
echo "------------------------------------------------"
curl -s -i \
  -X POST "$FN_UPLOAD_URL" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $idemC" \
  -H "X-Request-Id: $idemC" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"doc_type\":\"factuur\",\"filename\":\"test.pdf\",\"content_type\":\"application/pdf\",\"size_bytes\":123}" \
  | sed -n '1,20p'


echo ""
echo "== Upload Confirm rejects =="

# D) Missing fields (moet 400 + audit reject)
idemD="uploadconfirm-missing-fields-$(now_ts)"
echo ""
echo "D) Missing fields (expect 400 + audit reject)"
echo "------------------------------------------------"
curl -s -i \
  -X POST "$FN_UPLOAD_CONFIRM" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $idemD" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\"}" \
  | sed -n '1,20p'

# E) Unauthorized (bad token) (moet 401 + audit reject)
idemE="uploadconfirm-unauth-$(now_ts)"
echo ""
echo "E) Unauthorized (expect 401 + audit reject)"
echo "------------------------------------------------"
curl -s -i \
  -X POST "$FN_UPLOAD_CONFIRM" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $idemE" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"badtoken\",\"document_id\":\"00000000-0000-0000-0000-000000000000\"}" \
  | sed -n '1,20p'

# F) Document not found (moet 404 + audit reject)
idemF="uploadconfirm-doc-notfound-$(now_ts)"
echo ""
echo "F) Document not found (expect 404 + audit reject)"
echo "------------------------------------------------"
curl -s -i \
  -X POST "$FN_UPLOAD_CONFIRM" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $idemF" \
  --data "{\"dossier_id\":\"$DOSSIER_ID\",\"token\":\"$DOSSIER_TOKEN\",\"document_id\":\"00000000-0000-0000-0000-000000000000\"}" \
  | sed -n '1,20p'


echo ""
echo "== Assert audit events for reject tests (last 60 events) =="
echo "------------------------------------------------"

AUDIT2="$(curl -s "$SUPABASE_URL/rest/v1/dossier_audit_events?select=created_at,event_type,event_data&dossier_id=eq.$DOSSIER_ID&order=created_at.desc&limit=60" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

echo "$AUDIT2" | head -c 4000
echo ""

# We verwachten dat idemB/C/D/E/F terugkomt in audit request_id (X-Request-Id)
for rid in "$idemB" "$idemC" "$idemD" "$idemE" "$idemF"; do
  if ! echo "$AUDIT2" | grep -q "$rid"; then
    echo "ASSERT FAIL: could not find audit entry with request_id=$rid"
    exit 1
  fi
done

# We verwachten de reject event types
if ! echo "$AUDIT2" | grep -q '"event_type":"document_upload_url_rejected"'; then
  echo "ASSERT FAIL: expected document_upload_url_rejected in recent audit events"
  exit 1
fi
if ! echo "$AUDIT2" | grep -q '"event_type":"document_upload_confirm_rejected"'; then
  echo "ASSERT FAIL: expected document_upload_confirm_rejected in recent audit events"
  exit 1
fi

echo "==================== KLAAR ===================="
