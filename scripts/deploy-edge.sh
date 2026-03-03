#!/usr/bin/env bash
set -euo pipefail

FN="${1:-}"
if [[ -z "$FN" ]]; then
  echo "Usage: ./scripts/deploy-edge.sh <function-name>"
  echo "Example: ./scripts/deploy-edge.sh api-dossier-evaluate"
  exit 1
fi

# Always jump to repo root (works even if you run from ~)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_REF="${SUPABASE_PROJECT_REF:-yzngrurkpfuqgexbhzgl}"

echo "Repo root: $REPO_ROOT"
echo "Deploying edge function: $FN"
supabase functions deploy "$FN" --project-ref "$PROJECT_REF"
echo "Done."
