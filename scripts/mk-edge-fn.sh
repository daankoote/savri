#!/usr/bin/env bash
set -euo pipefail

FN="${1:-}"
if [[ -z "$FN" ]]; then
  echo "Usage: ./scripts/mk-edge-fn.sh <function-name>"
  echo "Example: ./scripts/mk-edge-fn.sh api-dossier-charger-save"
  exit 1
fi

ROOT="/Users/daankoote/dev/enval"
DIR="$ROOT/supabase/functions/$FN"
FILE="$DIR/index.ts"

mkdir -p "$DIR"

if [[ -f "$FILE" ]]; then
  echo "OK: exists: $FILE"
  exit 0
fi

cat > "$FILE" <<'TEMPLATE'
// supabase/functions/<function-name>/index.ts
// TEMPLATE created by scripts/mk-edge-fn.sh
// Replace this file content with the actual function implementation.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve((_req) => new Response("ok", { status: 200 }));
TEMPLATE

echo "CREATED: $FILE"
