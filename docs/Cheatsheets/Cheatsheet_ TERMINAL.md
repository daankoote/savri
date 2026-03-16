# Terminal Cheat Sheet


## bij starten nieuwe terminal
 - cd ~/dev/enval
 - kopieer alle "export ..... "  uit env.local en plak in de terminal ----> DIT MAG NERGENS ANDERS GEPLAKT WORDEN!!
 
## deploy edge function

- supabase functions deploy <EDGE_FUNCTION> --project-ref <YOUR_PROJECT_REF>

bijvoorbeeld: 
- supabase functions deploy mail-worker --project-ref yzngrurkpfuqgexbhzgl

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



==========

vraag een nieuwe sessio token aan:


eerst in terminal:

# 1. 

cd ~/dev/enval

# 2. 

plak de env.local vars in de terminal

# 3.
 
curl -s -X POST "$API_BASE/api-dossier-login-request" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Idempotency-Key: login-request-$(date +%s)" \
  -d "{
    \"dossier_id\": \"$DOSSIER_ID\",
    \"email\": \"$DOSSIER_EMAIL\"
}"


# 4. 

als het goed is krijg je nu een mail (zolang die "$DOSSIER_EMAIL" in de env.local staat )

# 5. 

daar staat de volledige link weer in met nieuwe token: 

https://www.enval.nl/dossier.html?d=...&t=...

En haal daar de t= waarde uit.

Noem die waarde:
LINK_TOKEN

export LINK_TOKEN="PLAK_HIER_DE_T_WAARDE"

# 6. 

plak de export LINK_TOKEN="5f5b1f87c9d64fb84f5b9e2d070c4af70e3b" in de terminal


# 7

curl -s -X POST "$API_BASE/api-dossier-get" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Idempotency-Key: link-exchange-$(date +%s)" \
  -d "{
    \"dossier_id\": \"$DOSSIER_ID\",
    \"token\": \"$LINK_TOKEN\"
  }"

  je krijgt hele grote JSON, met aan het einde de SESSION_TOKEN

  # 8

  export DOSSIER_SESSION_TOKEN="PLAK_HIER_DE_NIEUWE_SESSION_TOKEN"

deze keer:
  export DOSSIER_SESSION_TOKEN="1ec3e954332904d89cbbc362da79febee547009dbfca6db1" 


  # 9

  nu testen:

  curl -s -X POST "$API_BASE/api-dossier-get" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Idempotency-Key: session-check-$(date +%s)" \
  -d "{
    \"dossier_id\": \"$DOSSIER_ID\",
    \"session_token\": \"$DOSSIER_SESSION_TOKEN\"
  }"

  Als dit ok: true teruggeeft, ben je klaar om verder te werken.

  # 10 

  openen in de browser is nu lastiger want je hebt het al gebruikt, doe daarvoor:

    open de link, zonder de token bijvoorbeeld: https://www.enval.nl/dossier.html?d=3790dd0c-cbf1-487d-a0c1-0669b1a526c0

    en dan in de devtools --> console: 

  localStorage.setItem(
  "enval_session_token:3790dd0c-cbf1-487d-a0c1-0669b1a526c0",
  "1ec3e954332904d89cbbc362da79febee547009dbfca6db1"
    );
  location.reload();


  # =====

    Automatisch via een script:

    in terminal:

# 1 Terminal
cd ~/dev/enval
# 2 Terminal
eval "$(bash /Users/daankoote/dev/enval/scripts/tools/refresh-dossier-session.sh)"

# 3 Terminal:
echo "$LINK_TOKEN"                                                                
echo "$DOSSIER_SESSION_TOKEN"          
echo "$DOSSIER_SESSION_REFRESHED_AT"

# 4 open in browser: 
https://www.enval.nl/dossier.html?d=3790dd0c-cbf1-487d-a0c1-0669b1a526c0

or:

http://127.0.0.1:5500/dossier.html?d=3790dd0c-cbf1-487d-a0c1-0669b1a526c0

# 5 in devTools --> console + run
localStorage.setItem(
  "enval_session_token:3790dd0c-cbf1-487d-a0c1-0669b1a526c0",
  "PASTE_HIER_JE_DOSSIER_SESSION_TOKEN"
);
location.reload();