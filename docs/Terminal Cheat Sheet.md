# Terminal Cheat Sheet


Deploy — alle functions in één keer (copy/paste)
Optie A (aanrader): loop over supabase/functions/* (excl. _shared)

Terminal (repo root):

cd /Users/daankoote/dev/enval

PROJECT_REF="${SUPABASE_PROJECT_REF:-yzngrurkpfuqgexbhzgl}"

for d in supabase/functions/*; do
  fn="$(basename "$d")"
  if [[ -d "$d" && "$fn" != "_shared" && "$fn" != "node_modules" ]]; then
    echo "== Deploy $fn =="
    supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  fi
done

echo "== Done =="


Optie B: alleen gewijzigde functions (sneller, maar minder “zeker”)

cd /Users/daankoote/dev/enval
PROJECT_REF="${SUPABASE_PROJECT_REF:-yzngrurkpfuqgexbhzgl}"

git diff --name-only | awk -F/ '/^supabase\/functions\/[^\/]+\/index\.ts$/ {print $3}' | sort -u | while read -r fn; do
  echo "== Deploy $fn =="
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done



beter --> ./scripts/deploy-edge.sh mail-worker
