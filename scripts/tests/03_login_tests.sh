# scripts/tests/03_login_tests.sh

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_helpers.sh"

echo ""
echo "== LOGIN CONTRACT TESTS =="

MODE="${LOGIN_TEST_MODE:-run}"  # run | skip

if [[ "$MODE" == "skip" ]]; then
  echo "SKIP login tests (LOGIN_TEST_MODE=skip)"
  exit 0
fi

FN="$SUPABASE_URL/functions/v1/api-dossier-login-request"

DOSSIER_EMAIL="$(curl -s \
"$SUPABASE_URL/rest/v1/dossiers?select=customer_email&id=eq.$DOSSIER_ID&limit=1" \
-H "apikey: $SUPABASE_ANON_KEY" \
-H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('customer_email','')) if d else print('')")"

if [[ -z "${DOSSIER_EMAIL:-}" ]]; then
  echo "FATAL: could not read dossiers.customer_email"
  exit 1
fi

# mask email for output (no leaking real customer email)
MASKED="$(echo "$DOSSIER_EMAIL" | python3 -c "import sys; s=sys.stdin.read().strip(); 
import re
if '@' not in s: 
  print('<invalid>'); 
else:
  u,d=s.split('@',1)
  u2=(u[:2]+'***') if len(u)>2 else '***'
  d2=('***'+d[-6:]) if len(d)>6 else '***'
  print(u2+'@'+d2)
")"

echo "Using dossier email (masked): $MASKED"

# FRESH FLOW: bootstrap already triggered dossier_link mail.
# Immediate login request should therefore be throttled.
RID="login-throttled-$(now_ts)"

RESP="$(http_call_with_idem "$FN" \
"{\"dossier_id\":\"$DOSSIER_ID\",\"email\":\"$DOSSIER_EMAIL\"}" \
"$RID")"

HTTP="$(extract_http_status "$RESP")"
if [[ "$HTTP" != "200" && "$HTTP" != "429" ]]; then
  echo "ASSERT FAIL: login throttled expected 200 or 429 got $HTTP"
  print_json_safe_trunc "$(extract_body_json "$RESP")" 1200
  exit 1
fi

audit_assert_for_request_id "$RID" "login_request_throttled" "" "recent_mail_exists" "LOGIN throttled after fresh bootstrap" || exit 1

echo "PASS login throttled after fresh bootstrap (audit ok)"

# EMAIL MISMATCH (should still be 200 but audit reject)
RID="login-mismatch-$(now_ts)"

RESP="$(http_call_with_idem "$FN" \
"{\"dossier_id\":\"$DOSSIER_ID\",\"email\":\"nope@example.com\"}" \
"$RID")"

HTTP="$(extract_http_status "$RESP")"
if [[ "$HTTP" != "200" ]]; then
  echo "ASSERT FAIL: login mismatch expected 200 got $HTTP"
  echo "$(extract_body_json "$RESP")"
  exit 1
fi

audit_assert_for_request_id "$RID" "login_request_rejected" "" "email_mismatch" "LOGIN mismatch" || exit 1

echo "PASS login mismatch (audit ok)"