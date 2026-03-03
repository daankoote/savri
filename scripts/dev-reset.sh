#!/usr/bin/env bash
set -euo pipefail

# scripts/dev-reset.sh
# Veiligheidsrails:
# - Alleen draaien als ENVIRONMENT=dev
# - Alleen draaien als I_UNDERSTAND=YES
# - Vereist DATABASE_URL of SUPABASE_DB_URL (Postgres connection string)

ENVIRONMENT="${ENVIRONMENT:-}"
I_UNDERSTAND="${I_UNDERSTAND:-}"

if [[ "$ENVIRONMENT" != "dev" ]]; then
  echo "ABORT: ENVIRONMENT must be 'dev' (current: '${ENVIRONMENT:-<empty>}')"
  exit 1
fi

if [[ "$I_UNDERSTAND" != "YES" ]]; then
  echo "ABORT: set I_UNDERSTAND=YES to run this reset."
  echo "Example:"
  echo "  ENVIRONMENT=dev I_UNDERSTAND=YES DATABASE_URL='postgresql://...' bash scripts/dev-reset.sh"
  exit 1
fi

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "ABORT: missing DATABASE_URL (or SUPABASE_DB_URL)."
  echo "Tip: haal je connection string uit Supabase Dashboard -> Project Settings -> Database."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/dev-reset.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "ABORT: cannot find $SQL_FILE"
  exit 1
fi

echo "About to run DEV RESET against DB:"
echo "  (redacted) postgresql://USER:***@HOST:PORT/DB"
echo ""
echo "Running: $SQL_FILE"
echo ""

psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"

echo ""
echo "DONE: dev reset completed."
echo "NOTE: storage bucket files are NOT deleted by SQL."
