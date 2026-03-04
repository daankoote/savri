# 06_OPS_RUN_DEBUG_BOOK.md

# ENVAL — OPS / RUN / DEBUG BOOK

Status: 2026-02-24
Doel: snelle diagnose van runtime issues zonder tijdverlies
Regel: eerst deze checklist volgen, daarna pas code aanpassen

---

## 0) CORE DEBUG PRINCIPLES (NON-NEGOTIABLES)

* Runtime ≠ lokale code → ALTIJD deploy checken
* 401 ≠ altijd jouw code → vaak gateway / auth layer
* 500 zonder JSON → uncaught error → logs nodig
* Idempotency issues → altijd replay testen
* Contract drift is gevaarlijker dan syntaxfouten
* No secrets in logs / docs

---

## 1) PRE-DEPLOY CONTRACT CHECK (VERPLICHT)

Voor elke wijziging in:

* veldnamen
* payload keys
* schema contract
* audit event velden

Altijd eerst naming controleren.

### 1.1 Frontend ↔ Backend naming check

Voorbeeld (MID veld):

* grep -R "meter_id" -n .
* grep -R "mid_number" -n .

Expected:

* Geen legacy keys in core flow
* Canonical veldnaam consistent met spec

### STOP RULE

Als naming in UI ≠ naming in DB/spec
→ NIET deployen
→ Eerst contract fixen

---

### 1.2.1 Audit contract check

Vraag jezelf af:

* Wordt dit veld gelogd in audit?
* Wordt dit veld verwacht in export?
* Staat dit veld in SYSTEM_MAP?

Als antwoord onduidelijk is → eerst docs patchen.

## 1.2.2 Edge Functions — Uniformity Gate (NO SURPRISES)

Doel:
- Voorkom “legacy drift” / vergeten sneeuwvlok-functies.
- Elke edge function is óf CORE óf UTILITY (expliciet gelist).
- Nieuwe functie zonder classificatie = FAIL.

### Policy
CORE baseline (hard):
- CORS
- META (request-id / req meta)
- IDEM (Idempotency-Key enforced)
- AUD (audit logging aanwezig)
- AUTH (auth gates aanwezig)
- SRV (service-role usage voor server-side DB)
LOCK is report-only (niet overal relevant).

UTILITY baseline (minimal hard):
- META (traceability)
Overige kolommen zijn report-only.

### Command
```bash
cd /Users/daankoote/dev/enval
./scripts/edge-uniformity.sh
```

## 1.2.3 SEO / Robots Smoke Check (NA DEPLOY)

Doel:
- Verifiëren dat Google alleen canonieke routes indexeert.
- Dev/duplicate routes zijn noindex.

Checks (copy-paste):
- Robots.txt live
- curl -s https://www.enval.nl/robots.txt | sed -n '1,200p'

Expected:
- Bevat Sitemap: https://www.enval.nl/sitemap.xml
- Disallow voor tijdelijke routes (minimaal aanmelden_real.html zolang die bestaat)
- Sitemap live
- curl -s https://www.enval.nl/sitemap.xml | sed -n '1,200p'

Expected:
- Alleen canonieke pagina’s
- Geen aanmelden_real.html
- Noindex op dev/overgangspagina
- curl -s https://www.enval.nl/aanmelden_real.html | grep -i "meta name=\"robots\"" -n

Expected:
- noindex, nofollow
- Canonical check per core page (spot check)
- curl -s https://www.enval.nl/index.html | grep -i "rel=\"canonical\"" -n
- curl -s https://www.enval.nl/aanmelden.html | grep -i "rel=\"canonical\"" -n

Expected:
- Canonical klopt exact met pagina-url.

---

## 2) EDGE FUNCTION DEBUG — BASIS CHECKLIST

### Stap 1 — Is de code gedeployed?

supabase functions deploy <function-name>

80% van bugs = oude code draait

---

### Stap 2 — Directe curl test (isoleren)

Test altijd de function direct, niet via frontend.

---

### Stap 3 — Logs checken (Dashboard)

Edge Functions → function → Logs

Zoek op:

* request_id
* sb-request-id
* x-deno-execution-id

---

### Stap 4 — Response type

* JSON → code bereikt finalize()
* text/plain 500 → uncaught error
* 401 JSON → gateway auth
* 401 plain → jouw code auth

---

## 3) SUPABASE GATEWAY AUTH (KRITISCH)

Symptoom
{"code":401,"message":"Missing authorization header"}

Betekenis

* Request komt NIET bij jouw code
* Supabase gateway blokkeert

Fix
Altijd deze headers meesturen bij curl/Postman:

* Authorization: Bearer $SUPABASE_ANON_KEY
* apikey: $SUPABASE_ANON_KEY

### STOP RULE

Als je deze error ziet:

* Niet debuggen in code
* Eerst headers fixen

---

## 4) MAIL-WORKER DEBUG

Mail-worker heeft 2 lagen:

* Supabase gateway auth
* Interne secret check (x-mail-worker-secret)

Canonical curl (copy-paste):
```bash
MAIL_FN="$SUPABASE_URL/functions/v1/mail-worker"
RID="debug-mail-worker-$(date +%s)"

curl -i -s "$MAIL_FN" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "x-mail-worker-secret: $MAIL_WORKER_SECRET" \
  -H "x-request-id: $RID" \
  -H "Content-Type: application/json" \
  -d "{}"
```
Expected responses:

* 200 — No queued emails → auth + secret OK
* 200 — Processed batch → worker OK
* 401 Unauthorized → MAIL_WORKER_SECRET mismatch
* 401 Missing authorization header → headers ontbreken

---

## 5) INTAKE (api-lead-submit) DEBUG

Gates:

* in_nl must be true
* has_mid must be true

Reject flow (pre-dossier)

Verwacht:

* HTTP 400
* intake_audit_events row

Audit check:

curl -s 
"$SUPABASE_URL/rest/v1/intake_audit_events?select=created_at,request_id,idempotency_key,reason,message&order=created_at.desc&limit=10" 
-H "apikey: $SUPABASE_ANON_KEY" 
-H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

Happy path

Verwacht:

* HTTP 200
* lead_id
* dossier_id
* outbound_emails row

---

## 6) DOSSIER FLOW DEBUG (LOCK / EXPORT DECOUPLING)

CURRENT CONTRACT (2026-02-24)

* Indienen = audit lock (status in_review)
* Export = product artefact
* Payment hoort bij export (nog niet enforced)

Debug bij export issues:

Check:

* dossier locked?
* alle documenten confirmed?
* correcte token?

Export mag nooit afhankelijk zijn van:

* payment logic (tenzij expliciet toegevoegd)
* review outcome
* externe verificatie

Als export niet werkt:

* Check evaluate(finalize=true)
* Check document confirmed flags
* Check audit events

## 3.1 SESSION AUTH (nieuw 2026-03-03)

### Symptomen
- 401/403 uit jouw function (JSON) terwijl gateway headers correct zijn.
- Dossier-link werkt 1× en daarna niet meer.
- Random “unauthorized” na X minuten.

### Betekenis
- Link-token (`t`) is start-auth en kan verlopen/one-time zijn.
- Daarna moet een session-token gebruikt worden.
- Server-side source-of-truth: `public.dossier_sessions`.

### Snelle checks (SQL Editor)

Actieve sessies voor dossier:
```sql
select id, dossier_id, created_at, expires_at, last_seen_at, revoked_at
from public.dossier_sessions
where dossier_id = '<DOSSIER_UUID>'
order by created_at desc
limit 20;

Sessies die nu ongeldig zijn:
select id, dossier_id, expires_at, revoked_at
from public.dossier_sessions
where (revoked_at is not null) or (expires_at < now())
order by created_at desc
limit 50;
```
### STOP RULE (session auth)
Als gateway OK is (geen `Missing authorization header`) en je ziet in `dossier_sessions` dat de laatste sessie:
- expired is (`expires_at < now()`), of
- revoked is (`revoked_at is not null`)

→ dan is dit géén CORS/keys issue en ook geen frontend bug.
→ dit is expected behavior van TTL/revoke policy.
→ oplossing is product/auth-flow (refresh/login), niet debuggen in UI.


---

## 7) IDEMPOTENCY DEBUG

Test:

Doe exact dezelfde call 2x met dezelfde Idempotency-Key

Verwachting:

* Exact dezelfde response
* Geen extra DB rows

Check outbound_emails:

curl -s 
"$SUPABASE_URL/rest/v1/outbound_emails?select=*&order=created_at.desc&limit=10" 
-H "apikey: $SUPABASE_ANON_KEY" 
-H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

Slechts 1 row verwacht

---

## 8) 500 ERROR DEBUG

Symptoom → HTTP 500 (text/plain)

Betekenis:

* Uncaught error
* finalize() niet bereikt

Actie:

* Logs openen

Zoek:

* ReferenceError
* TypeError
* undefined var
* schema mismatch

---

## 9) DEPLOY DISCIPLINE (KRITISCH)

Regel:

Code wijziging ≠ productie

Altijd:

1. Code aanpassen
2. Naming contract check (grep)
3. Deploy
4. Curl test
5. DB check
6. Audit event check

Command:

supabase functions deploy <function>

---

## 10) QUICK DIAGNOSE MATRIX

401 Missing authorization header
→ Supabase gateway
→ Headers fixen

401 Unauthorized (plain)
→ Eigen auth
→ Secret check

400 met JSON
→ Validatie
→ OK

500 text/plain
→ Crash
→ Logs check

200 maar niets gebeurt
→ Worker niet triggered
→ mail-worker debug

Field mismatch / undefined payload
→ Contract drift
→ Naming grep + docs check

---

## 11) MENTAL MODEL (ANTI-BUG)

Stop met gokken.

Volg altijd:

1. Curl direct function
2. Check HTTP status
3. Check logs
4. Check DB
5. Check audit events
6. Pas DAN code aan

Schema drift > logica bug.
Contract mismatch > styling bug.




# EINDE 6_OPS_RUN_DEBUG_BOOK.md