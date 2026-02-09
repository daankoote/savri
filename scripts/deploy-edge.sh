# deploy-edge.sh

#!/usr/bin/env bash

set -euo pipefail

FN="${1:-}"
if [[ -z "$FN" ]]; then
  echo "Usage: ./scripts/deploy-edge.sh <function-name>"
  echo "Example: ./scripts/deploy-edge.sh api-dossier-access-update"
  exit 1
fi

cd /Users/daankoote/dev/enval

echo "Deploying edge function: $FN"
PROJECT_REF="${SUPABASE_PROJECT_REF:-yzngrurkpfuqgexbhzgl}"
supabase functions deploy "$FN" --project-ref "$PROJECT_REF"


echo "Done."
