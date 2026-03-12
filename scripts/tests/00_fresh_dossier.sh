# scripts/tests/00_fresh_dossier.sh

#!/usr/bin/env bash

set -euo pipefail
trap 'echo "FATAL: 00_fresh_dossier.sh crashed at line $LINENO"; exit 1' ERR
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== FRESH DOSSIER BOOTSTRAP =="

need SUPABASE_URL
need SUPABASE_ANON_KEY
need SUPABASE_SERVICE_ROLE_KEY

FN_LEAD="$SUPABASE_URL/functions/v1/api-lead-submit"

TS="$(now_ts)"
EMAIL="audit-fresh-${TS}@example.com"

RID="fresh-intake-${TS}"

RESP="$(http_call_with_idem \
  "$FN_LEAD" \
  "{\"flow\":\"ev_direct\",\"first_name\":\"Audit\",\"last_name\":\"Fresh\",\"email\":\"$EMAIL\",\"phone\":\"0612345678\",\"charger_count\":4,\"own_premises\":true,\"in_nl\":true,\"has_mid\":true}" \
  "$RID")"

HTTP="$(extract_http_status "$RESP")"
BODY="$(extract_body_json "$RESP")"

if [[ "$HTTP" != "200" ]]; then
  echo "FATAL: fresh intake expected 200 got $HTTP"
  echo "RESPONSE (head):"
  print_resp_head "$RESP" 60
  echo "BODY (trunc):"
  print_json_safe_trunc "$BODY" 1200
  exit 1
fi

DOSSIER_ID_NEW="$(printf "%s" "$BODY" | sed -n 's/.*"dossier_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
if [[ -z "${DOSSIER_ID_NEW:-}" ]]; then
  echo "FATAL: fresh intake returned 200 but no dossier_id in body"
  print_json_safe_trunc "$BODY" 1200
  exit 1
fi

echo "FRESH) dossier_id: $DOSSIER_ID_NEW"
set_state FRESH_DOSSIER_ID "$DOSSIER_ID_NEW"
set_state FRESH_EMAIL "$EMAIL"

# Fetch newest dossier_link email body and extract token (?t=...)
echo "FRESH) fetching dossier_link email to extract token..."
MAIL_JSON="$(curl -sS \
  --connect-timeout 10 \
  --max-time 30 \
  "$SUPABASE_URL/rest/v1/outbound_emails?select=id,created_at,body&dossier_id=eq.$DOSSIER_ID_NEW&message_type=eq.dossier_link&order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

TOKEN_NEW="$(printf "%s" "$MAIL_JSON" | python3 -c "import sys,json,re; d=json.load(sys.stdin); body=(d[0].get('body') or '') if d else ''; m=re.search(r'[?&]t=([^\\s&]+)', body); print(m.group(1) if m else '')")"

if [[ -z "${TOKEN_NEW:-}" ]]; then
  echo "FATAL: could not extract token (?t=...) from outbound dossier_link email."
  echo "MAIL_JSON (trunc):"
  print_json_safe_trunc "$MAIL_JSON" 800
  exit 1
fi

set_state DOSSIER_ID "$DOSSIER_ID_NEW"
set_state DOSSIER_TOKEN "$TOKEN_NEW"

echo "FRESH) stored DOSSIER_ID + DOSSIER_TOKEN in state"