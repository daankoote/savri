#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# // scripts/tools/refresh-dossier-session.sh

# ============================================================
# ENVAL — Refresh dossier session token (dev helper)
#
# Doel:
# - .env.local laden (optioneel, als aanwezig)
# - nieuwe login-link aanvragen
# - nieuwste dossier_link mail uit outbound_emails lezen
# - link-token uit mail body halen
# - link-token exchangen naar nieuwe session_token
# - exports printen voor huidige shell
#
# Gebruik:
#   eval "$(bash /Users/daankoote/dev/enval/scripts/tools/refresh-dossier-session.sh)"
#
# Vereiste env vars (als niet via .env.local geladen):
#   SUPABASE_URL
#   SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   DOSSIER_ID
#   DOSSIER_EMAIL
#
# Optioneel:
#   API_BASE
#   REFRESH_WAIT_SECONDS   (default: 20)
#   REFRESH_POLL_INTERVAL  (default: 1)
#
# Output:
# - stdout: alleen export statements
# - stderr: logging
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

log() {
  printf '%s\n' "$*" >&2
}

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    log "FATAL: missing env var: $name"
    exit 1
  fi
}

need_bin() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    log "FATAL: required command not found: $name"
    exit 1
  fi
}

# ------------------------------------------------------------
# 0) Load env.local automatically if present
# ------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  log "Loaded env file: $ENV_FILE"
else
  log "No .env.local found at: $ENV_FILE (continuing with current shell env)"
fi

# API_BASE afleiden als niet gezet
if [[ -z "${API_BASE:-}" && -n "${SUPABASE_URL:-}" ]]; then
  export API_BASE="${SUPABASE_URL}/functions/v1"
fi

REFRESH_WAIT_SECONDS="${REFRESH_WAIT_SECONDS:-20}"
REFRESH_POLL_INTERVAL="${REFRESH_POLL_INTERVAL:-1}"

need_bin curl
need_bin python3

need SUPABASE_URL
need API_BASE
need SUPABASE_ANON_KEY
need SUPABASE_SERVICE_ROLE_KEY
need DOSSIER_ID
need DOSSIER_EMAIL

json_field_from_arg() {
  local json="$1"
  local field="$2"

  python3 - "$json" "$field" <<'PY'
import json, sys

raw = sys.argv[1]
field = sys.argv[2]

if not raw.strip():
    print("")
    raise SystemExit

obj = json.loads(raw)
value = obj.get(field, "")

if value is None:
    print("")
elif value is True:
    print("true")
elif value is False:
    print("false")
else:
    print(str(value))
PY
}

first_row_field_from_list_arg() {
  local json="$1"
  local field="$2"

  python3 - "$json" "$field" <<'PY'
import json, sys

raw = sys.argv[1]
field = sys.argv[2]

if not raw.strip():
    print("")
    raise SystemExit

data = json.loads(raw)
if not isinstance(data, list) or not data:
    print("")
    raise SystemExit

row = data[0] or {}
value = row.get(field, "")

if value is None:
    print("")
else:
    print(str(value))
PY
}

extract_token_from_body_arg() {
  local body="$1"

  python3 - "$body" <<'PY'
import re, sys
from urllib.parse import urlparse, parse_qs

body = sys.argv[1]
m = re.search(r'https://www\.enval\.nl/dossier\.html\?[^ \n\r\t]+', body)
if not m:
    print("")
    raise SystemExit

url = m.group(0)
qs = parse_qs(urlparse(url).query)
print((qs.get("t") or [""])[0])
PY
}

urlencode() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=''))
PY
}

fetch_latest_mail_json() {
  local dossier_id_enc
  dossier_id_enc="$(urlencode "$DOSSIER_ID")"

  curl -sS \
    "${SUPABASE_URL}/rest/v1/outbound_emails?select=id,created_at,status,body&dossier_id=eq.${dossier_id_enc}&message_type=eq.dossier_link&order=created_at.desc&limit=1" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
}

issue_login_request() {
  local idem_key="$1"

  curl -sS -X POST "${API_BASE}/api-dossier-login-request" \
    -H "Content-Type: application/json" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Idempotency-Key: ${idem_key}" \
    -d "{
      \"dossier_id\": \"${DOSSIER_ID}\",
      \"email\": \"${DOSSIER_EMAIL}\"
    }"
}

exchange_link_for_session() {
  local link_token="$1"
  local idem_key="$2"

  curl -sS -X POST "${API_BASE}/api-dossier-get" \
    -H "Content-Type: application/json" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Idempotency-Key: ${idem_key}" \
    -d "{
      \"dossier_id\": \"${DOSSIER_ID}\",
      \"token\": \"${link_token}\"
    }"
}

log "== refresh-dossier-session =="
log "Repo:    $REPO_ROOT"
log "Dossier: $DOSSIER_ID"
log "Email:   $DOSSIER_EMAIL"
log "Wait:    ${REFRESH_WAIT_SECONDS}s max"

# ------------------------------------------------------------
# 1) read latest mail before request
# ------------------------------------------------------------
before_raw="$(fetch_latest_mail_json)"
before_created_at="$(first_row_field_from_list_arg "$before_raw" "created_at")"

if [[ -n "$before_created_at" ]]; then
  log "Latest dossier_link mail before request: $before_created_at"
else
  log "No previous dossier_link mail found."
fi

# ------------------------------------------------------------
# 2) issue login request
# ------------------------------------------------------------
login_idem="refresh-login-request-$(date +%s)"
login_resp="$(issue_login_request "$login_idem")"
login_ok="$(json_field_from_arg "$login_resp" "ok")"

if [[ "$login_ok" != "true" ]]; then
  log "FATAL: login request did not return ok=true"
  log "Response: $login_resp"
  exit 1
fi

log "Login request accepted."

# ------------------------------------------------------------
# 3) poll for new outbound email row
# ------------------------------------------------------------
deadline=$(( $(date +%s) + REFRESH_WAIT_SECONDS ))
latest_raw=""

while true; do
  current_raw="$(fetch_latest_mail_json)"
  current_created_at="$(first_row_field_from_list_arg "$current_raw" "created_at")"

  if [[ -n "$current_created_at" && "$current_created_at" != "$before_created_at" ]]; then
    latest_raw="$current_raw"
    log "New dossier_link mail detected: $current_created_at"
    break
  fi

  if (( $(date +%s) >= deadline )); then
    break
  fi

  sleep "$REFRESH_POLL_INTERVAL"
done

if [[ -z "$latest_raw" ]]; then
  log "FATAL: no new dossier_link mail detected within ${REFRESH_WAIT_SECONDS}s."
  log "Likely causes:"
  log "- throttle window still active"
  log "- wrong DOSSIER_ID or DOSSIER_EMAIL"
  log "- queue/mail failure"
  exit 1
fi

# ------------------------------------------------------------
# 4) extract link token from mail body
# ------------------------------------------------------------
mail_body="$(first_row_field_from_list_arg "$latest_raw" "body")"
link_token="$(extract_token_from_body_arg "$mail_body")"

if [[ -z "$link_token" ]]; then
  log "FATAL: could not extract link token from outbound email body."
  exit 1
fi

log "Extracted link token."

# ------------------------------------------------------------
# 5) exchange link token for session token
# ------------------------------------------------------------
exchange_idem="refresh-link-exchange-$(date +%s)"
exchange_resp="$(exchange_link_for_session "$link_token" "$exchange_idem")"
exchange_ok="$(json_field_from_arg "$exchange_resp" "ok")"

if [[ "$exchange_ok" != "true" ]]; then
  log "FATAL: link exchange failed."
  log "Response: $exchange_resp"
  exit 1
fi

session_token="$(json_field_from_arg "$exchange_resp" "session_token")"

if [[ -z "$session_token" ]]; then
  log "FATAL: exchange response did not contain session_token."
  exit 1
fi

log "New session token minted."

# ------------------------------------------------------------
# 6) stdout only: exports for eval
# ------------------------------------------------------------
printf 'export LINK_TOKEN=%q\n' "$link_token"
printf 'export DOSSIER_SESSION_TOKEN=%q\n' "$session_token"
printf 'export DOSSIER_SESSION_REFRESHED_AT=%q\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"