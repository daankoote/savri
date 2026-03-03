# Terminal Cheat Sheet


## bij starten nieuwe terminal
 - cd ~/dev/enval
 - kopieer alle "export ..... "  uit env.local en plak in de terminal ----> DIT MAG NERGENS ANDERS GEPLAKT WORDEN!!
 
## deploy edge function

- supabase functions deploy <EDGE_FUNCTION> --project-ref <YOUR_PROJECT_REF>

bijvoorbeeld: 
- supabase functions deploy mail-worker --project-ref yzngrurkpfuqgexbhzgl

of --> ./scripts/deploy-edge.sh mail-worker

supabase functions deploy mail-worker
supabase functions deploy api-lead-submit

!!! deploy alles in 1 keer: supabase functions deploy --no-verify-jwt


## commit alles


## push alles
supabase link --project-ref yzngrurkpfuqgexbhzgl
supabase db push



## .env.local

in terminal:

set -a
source .env.local
set +a

--> dit laadt alle exports in de shell/terminal


## KEYS ROTEREN of
## als de env.local wordt aangepast --> dit runnen

1. roteren keysin supabase
2. 

cat > ./assets/js/config.runtime.js <<EOF
// GENERATED — DO NOT COMMIT
window.ENVAL = window.ENVAL || {};
window.ENVAL.SUPABASE_URL = "${SUPABASE_URL}";
window.ENVAL.SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";
window.ENVAL.API_BASE = "${SUPABASE_URL}/functions/v1";
EOF

3. als keys roteren dan ook naar netifly --> https://app.netlify.com/projects/enval1/configuration/env#content 
en aanpassen
