# 00_GLOBAL.md (current state, rewrite-ok)

# ENVAL — Global Product & Phase Plan (CURRENT)

Statusdatum: 2026-03-02 
Repo: /Users/daankoote/dev/enval  
Branch context: feature/dev (main = pilot index)

---

# Strategische Positionering (2026-03-02)

Enval is een infrastructuurlaag.

Niet:
- Inboeker
- Verificateur
- Certificerende partij
- Resultaatgarant
- ERE-bemiddelaar

Wel:
- Audit-ready dossierstructuur
- Administratieve standaard
- Schema-versioned export artefact (“Audit Pack Standard”)
- Neutrale onderlaag voor meerdere inboekers

Strategische keuze (bewust):
- Geen eigen Inboeker BV
- Geen verticale integratie
- Geen exclusieve partner
- Geen revenue share model

Langetermijnpositie:
- 8.000–15.000 dossiers per jaar
- Hoge marge
- Lage vaste kosten
- Geen personeel
- Infrastructuurdominantie i.p.v. ketendominantie

Belangrijk:
Enval claimt nooit compliance, verificatie of certificering.


## 1) Wat bouwen we (in 1 zin)
Enval is een dossier- en registratieplatform dat bewijsstukken, data en audit-trail zó structureert dat een ERE/RED3 traject niet afketst op administratie — zonder zelf de inboeker/verificateur te zijn.

---

## 2) Positionering & verantwoordelijkheden (niet onderhandelen)

Primaire doelgroep (CURRENT focus):
> Particuliere EV-rijder met eigen laadpaal (NL + MID) die een overdraagbaar, auditwaardig dossier wil zonder administratieve rompslomp.

Secundaire doelgroep (light touch, MVP):
> Inboekers die gebruik willen maken van de Enval dossieropbouw → via contact (geen dashboard in MVP).

- **Enval**: structuur, bewijs, overdraagbaarheid, audit-trail, export.
- **Externe verificateur**: (pre-)verificatie/audit.
- **Inboeker**: eindverantwoordelijk (juridisch/administratief/fraude), en feitelijk inboeken.
- **Geen garanties** op ERE’s/vergoedingen.
- **Verbruik/metering**: aparte module, expliciet “in ontwikkeling”.
- **Geen geldstromen via Enval** (geen escrow/fees/uitbetalingen).

## 3) Prioriteiten (hard order)

1) Auditwaardigheid  
2) Correctheid & determinisme  
3) Conversie & heldere journey (nieuw expliciet gemaakt 2026-02-19)  
4) Usability  
5) Performance/cost  
6) Legal hardening  

Nieuwe expliciete nuance:
> Een technisch werkend product zonder converteerbare journey is geen verkoopbaar product.

**Wedge binnen audit-first (nieuw):**
- **Audit Pack Standard** (schema_versioned export + checks + auditstream) is het centrale productartefact.
- Alle toekomstige modules (verbruik, partners, dashboards) pluggen hierop in.

## 4) Frontend runtime-config model (nieuw 2026-02-19)

Doel:
- Geen secrets in repo
- Eén bron per omgeving
- Reproduceerbare injectie

### Architectuur

Frontend gebruikt:

1. `assets/js/config.runtime.js`
   - GENERATED FILE
   - Nooit committen
   - Bevat:
     - SUPABASE_URL
     - SUPABASE_ANON_KEY
     - API_BASE

2. `assets/js/config.js`
   - Bevat géén secrets
   - Leest uitsluitend `window.ENVAL.*`
   - Bevat edgeHeaders helper

### Script volgorde (hard requirement)

In alle HTML’s:

<script src="/assets/js/config.runtime.js"></script>
<script src="/assets/js/config.js"></script>

Nooit omdraaien.

## Omgevingen

- Lokaal:
  - Bron: .env.local
  - Generator: scripts/gen-runtime.sh
  - Resultaat: config.runtime.js

- Productie (Netlify):
  - Bron: Netlify Environment Variables
  - Injectie: netlify.toml build command
  - Runtime file wordt bij deploy gegenereerd

## Veiligheidspositie

- SUPABASE_ANON_KEY is publiek en mag zichtbaar zijn in browser.
- SUPABASE_SERVICE_ROLE_KEY mag nooit in frontend verschijnen.
- Nooit secrets in repo, docs of chat.

Status: ACTIEF EN BEWEZEN (console-check + deploy-test 2026-02-19)


## 5) Definitie “auditwaardig” (Enval v0)
Auditwaardig betekent hier:
1. Alle write-acties (success én mislukking) laten sporen na in:
   - `public.dossier_audit_events` zodra er een dossier scope is, en
   - `public.intake_audit_events` voor pre-dossier intake rejects.
2. Sporen zijn te correleren: `request_id`, `actor_ref`, `ip`, `ua`, `environment`, en bij rejects `stage/status/message/reason`.
3. Documenten tellen niet mee zolang upload niet is bevestigd (**issued ≠ confirmed**).
4. Dossier lock is afdwingbaar (hard enforcement) en zichtbaar in audit trail.

## 5.1 Session Auth Model (nieuw 2026-03-03)

Doel:
- Dossierlink-token (query `t`) is niet langer een “permanent toegangstoken”.
- We gebruiken een **server-gestructureerde sessie** met TTL + revoke.

### Tokens

1) Link token (dossier link)
- Wordt gebruikt om een sessie te starten (exchange).
- Wordt **niet** gebruikt als langdurige autorisatie voor dossier reads/writes.

2) Session token (Bearer)
- Wordt uitgegeven na succesvolle exchange.
- Wordt gebruikt als `Authorization: Bearer <session_token>`.
- Is short-lived (TTL) en revokeable.

### Server registry
Sessies worden geregistreerd in `public.dossier_sessions`:
- `session_token_hash` is de server-side truth.
- Lifecycle: `expires_at`, `last_seen_at`, `revoked_at`.

### Frontend storage
- Session token wordt client-side opgeslagen per dossier in `localStorage`:
  - key: `enval_session_token:<dossier_id>`
- Legacy key `enval_session_token` mag worden opgeschoond.

### Invariants (hard)
- Geen write endpoint accepteert link-token als auth.
- Session expiry/revoke wordt server-side enforced.
- Audit-first blijft leidend: rejects worden gelogd zodra dossier-scope bekend is.

## 6) Phase model (gates)

### Phase 0 — Foundations (DONE/ACTIVE)
- Basis system map + core tables + wizard routes
- Edge endpoints aanwezig
- Reproduceerbare tests (`scripts/audit-tests.sh`)

### Phase 1 — Evidence-grade dossier (ACTIVE)
Gate = “audit-contract stabiel en consistent over alle dossier write endpoints”
- MLS (Minimum Logging Standard) consistent
- Idempotency Standard (header-only waar verplicht) consistent
- Reject-audit coverage aantoonbaar via tests
- Download/export alleen op locked dossiers + confirmed docs
- Export = schema_versioned + assumptions/not_verified expliciet (Audit Pack Standard v1)

### Phase 2 — Sharing + performance / cost / ops (PLANNED)
Gate = “product werkt audit-proof in real-world”
- User-initiated sharing/export naar inboeker (read-only, revoke/expire)
- Directory (listing) van inboekers (geen transactie/offer-matching)
- Upload-confirm server-side download+sha256 optimaliseren (duur) → alternatief ontwerp
- Reconciler/cleanup voor orphaned storage
- Mail outbox/robust retries/backoff
- Abuse controls/rate limiting

### Phase 3 — Legal hardening (PLANNED)
- Privacy/terms verantwoordelijkheden keihard
- Consent versioning (server-driven) met hash/URL
- Retention & data removal policy (wat mag wel/niet)

### Phase 4 — Scale (PLANNED)
- Multi-partner, monitoring, dashboards, SLA-achtige ops

### Appendix — Phase-2 Besluitstuk status (2026-02-10) vs CURRENT gedrag
- Het document **“ENVAL — Phase-2 Besluitstuk (2026-02-10)”** is besluitvormend en **niet** de CURRENT spec.
- CURRENT waarheid blijft: 00_GLOBAL.md + 01_SYSTEM_MAP.md + 02_AUDIT_MATRIX.md + 03_CHANGELOG_APPEND_ONLY.md + 04_TODO.md.
- Belangrijk conflict dat bewust expliciet gemaakt wordt:
  - **CURRENT (v0/v1):** `upload-confirm` doet server-side download + sha256 verify en zet `confirmed` bij match.
  - **Phase-2 plan (OPEN):** “deferred server-side verificatie” (verify pas bij finalize/export/download) als alternatief ontwerp/optimalisatie.
- Documentatie-regel:
  - Zolang deferred verify niet gebouwd is: **blijft `verified_server_side=true` de betekenis houden van verify-in-confirm**.
  - Zodra deferred verify gebouwd wordt: **nieuwe semantics + nieuwe audit events of expliciete flags** (zie TODO “upload-confirm performance redesign”).

### Branch context nuance (doc hygiene)
- Deze Global doc kan op `feature/pricing-page` staan terwijl System Map op `feature/dev` staat.
- Interpretatie: Global = product/phase waarheid, System Map = implementatie-inventaris op actieve dev-branch.
- Bij twijfel: changelog entry + repo code is leidend.


## 7) Current status snapshot (2026-02-12)
- Repo-first workflow voor edge functions via Supabase CLI deploy scripts.
- Lead intake via `api-lead-submit` werkt audit-proof voor self-serve flows:
  - `installer_*` flows zijn legacy → 410 (hard kill)
  - `ev_direct` → 200 (dossier create + mail queue + trigger)
  - `contact` → 200 (mail queue + trigger)
- Document lifecycle: upload-url → PUT → upload-confirm → confirmed (evidence-grade).
- Review gating: evaluate finalize=false (ready_for_review), finalize=true (lock/in_review).
- Export/download: alleen op locked dossier en confirmed docs.

**Intake eligibility gates (CURRENT):**
Voor een positieve reactie op dossier-opbouw moet gebruiker “Ja” antwoorden op:
- **In Nederland?** → Ja
- **Heeft de laadpaal een MID-meter?** → Ja  

Belangrijk:
- Deze gates zijn een technische systeemvoorwaarde, geen marketingpositie.
- Intake is uitsluitend gericht op particuliere laadpalen in eigendom en op eigen terrein.
- Er wordt geen expliciete “self-serve” terminologie meer gebruikt.




## 8) Non-goals (nu)
- Externe verificaties (merk/model/energiemaatschappij) → pas na eisenpakket van inboeker/verificateur.
- Locatie-checks “verificeren” of claimen als bewijs (hoog risico; hoort bij verifier/inboeker).
- Verifier dashboard / inboeker workflow dashboards vóórdat Audit Pack + sharing stabiel is.


## 9) Payment & Export decoupling (CURRENT) — 2026-02-24

Doel:
- “Indienen” (lock/in_review) blijft een audit-gate en is **niet** afhankelijk van betaling.
- “Export (betaald)” is een product-gate die later kan verschuiven zonder het dossier-schema of de wizard te breken.

CURRENT behavior (v0/v1):
- Dossier indienen = `api-dossier-evaluate(finalize=true)` → lock + status `in_review`.
- Export/download gates blijven audit-first:
  - export/download **alleen** op locked dossier
  - export/download **alleen** confirmed docs
- “Export (betaald)” is in UI een label/positionering; payment enforcement kan later worden toegevoegd zonder de review/lock flow te wijzigen.

Future switch (Optie 2, later):
- Payment gate kan verschuiven naar “Indienen” door uitsluitend:
  - een aparte payment status (bijv. `payment_status=paid`) te controleren op evaluate(finalize=true),
  - zonder wijziging aan upload/confirm/audit semantics.
- Contract: payment enforcement is een **losse gate** (business rule), geen onderdeel van audit-lock.

## 10) Frontend Styling & CSS Contract (CURRENT)

Statusdatum: 2026-02-23
Doel: CSS laten functioneren als een gecontroleerd systeem (component-first), zonder regressies tussen core flow en informatieve pagina’s.

Frontend styling is geen verzameling pagina-specifieke fixes.
Het is één consistent systeem met duidelijke scheiding tussen:

- Core flow (index / aanmelden / dossier)
- Informatieve/legacy pagina’s (pricing / proces / regelgeving etc.)

## 10.1 CSS Architectuur (CURRENT)

We hanteren twee expliciete styling-lagen op bestandsniveau:

1) assets/css/style.css — CORE

Leidend voor:
- index.html
- aanmelden.html
- dossier.html

Bevat:
- CSS Layers (@layer base, components, pages, utilities;)
- Form Contract
- Result system
- Core componenten (.btn, .form, .calc, .card, .table, etc.)
- Dossier-specifieke styling (onder aparte sectie)

Mag niet bevatten:
- .page-hero
- .prose
- pricing-* structuren
- timeline-* structuren

Behalve wanneer een class generiek herbruikbaar is (component-niveau).

2) assets/css/legacy.css (LEGACY PAGES) — OUTDATED (bestaat niet meer; alles gebruikt nu style.css)

Wordt uitsluitend geladen door:
- pricing.html
- proces.html
- hoe-het-werkt.html
- mandaat.html
- regelgeving.html
- voorwaarden.html
- privacyverklaring.html

Bevat uitsluitend:
- page-hero structuren
- prose typografie
- pricing grids/cards
- timeline layouts
- pagina-specifieke presentatielogica

Belangrijk:
- Isolatie gebeurt via file separation.
- body.page-legacy is geen architectuurprincipe meer.
- Core pages laden geen legacy.css.

## 10.2 Reuse-regel (HARD)

Bij nieuwe UI-elementen geldt altijd:

Eerst controleren of bestaande componenten herbruikbaar zijn:
- .form / .form--ev
- .calc / .calc-col
- .btn / .btn.primary / .btn.outline
- .section / .container
- .card
- .result
- .table

Alleen nieuwe class introduceren als hergebruik aantoonbaar niet kan.
- Geen inline styling.
- Geen one-off utility classes tenzij generiek herbruikbaar.

Rationale:
- CSS groeit als systeem, niet als patch-verzameling.

## 10.3 Form Contract (VERPLICHT)

Alle forms volgen exact deze structuur:

<form class="form form--ev"> <label> <span>Label tekst</span> <input ... /> </label> </form>

Regels:
- Geen globale input styling.
- Styling uitsluitend binnen .form.
- Spacing wordt geregeld via .form en varianten.
- JS toggelt alleen classes.
- Geen inline style-mutaties vanuit JS.

## 10.4 Result System (Calculator / Eligibility / toekomstige modules)

Result-weergave volgt één vast patroon:

<div class="result"> <div class="result-status"></div> <ul class="result-list"></ul> <div class="result-cta"></div> </div>

States uitsluitend via modifiers:
- .result--ok
- .result--warn
- .result--bad
- .result--neutral (indien nodig)
Geen losse tekstinjectie zonder vaste containerstructuur.

Doel:
- Uniforme statuslogica
- Consistente visuele semantiek
- Herbruikbare JS-output

## 10.5 Dossier CSS Isolatie

Dossier-specifieke styling blijft in style.css maar onder een duidelijke sectie:
/* DOSSIER (dossier-specifiek) */

Regels:
- Geen generieke tag-selectors (table, th, td) zonder class.
- Geen selectors die andere pagina’s kunnen beïnvloeden.
- Alles onder duidelijke class-names (.table-*, .pill, .statusbar, etc.)

## 10.6 Anti-wildgroei regels (HARD)

Niet toegestaan:
- Nieuwe CSS file voor core features.
- Page-specific selectors (#calculator input[type=number]).
- Deep nested selectors (> 3 niveaus).
- !important.
- Pixel-fixes per element zonder systeemreden.

Toegestaan:
- Modifier classes.
- Component-level overrides.
- Tokens alleen indien door minimaal 2 componenten gebruikt.

## 10.7 Technische schuld-check (verplicht)

Elke nieuwe frontend feature moet expliciet beantwoorden:
- Kan dit met bestaande componenten?
- Introduceren we dubbele spacing-logica?
- Is dit een modifier of nieuw component?
- Is dit generiek herbruikbaar?

Als het antwoord is:
- “Even snel een nieuwe class” → dan is het waarschijnlijk fout.

## 11) Frontend CSS Work Order (EXECUTION ORDER)

Dit is de vaste volgorde bij styling-uitbreidingen:
- CSS Single Source of Truth bewaken (style.css blijft canonical).
- Form contract blijft leidend.
- Component inventory eerst controleren vóór nieuwe classes.
- Result system altijd hergebruiken.
- Dossier styling isoleren binnen eigen sectie.
- Duplicatie verwijderen zodra contract stabiel is.
- Pas daarna docs updaten.

Stopregel:
- Geen nieuwe CSS toevoegen “omdat het sneller is”.
- Eerst normaliseren wat er al is.
- Daarna pas uitbreiden.

# 11.1) SEO & Indexing Hygiene (CURRENT)

Doel:
- Statische site zonder SEO-regressies bij duplicaatpagina’s.
- Geen indexatie van ontwikkel-/tussenroutes.
- Canonical/OG/Twitter consistent per page.

Harde regels (site-wide):

- Elke page heeft:
  - <title>
  - <meta name="description">
  - <link rel="canonical" href="https://www.enval.nl/<pagina>.html">
  - OG (og:title, og:description, og:url, og:image) en Twitter kaart.
  - Favicons:
    - /favicon.ico
    - /assets/img/favicon-32.png
    - /assets/img/favicon-16.png

Duplicaten / dev-pages:
- Dev/overgangspagina’s die niet in Google mogen komen krijgen in <head>:
  - <meta name="robots" content="noindex, nofollow">
- Canonical blijft altijd wijzen naar de beoogde eindpagina (niet naar een dev-alias).

Route-waarheid (CURRENT):
- aanmelden.html is productie-route.
- aanmelden_real.html is tijdelijk in ontwikkeling en wordt later hernoemd naar aanmelden.html.
  - Tot die tijd: aanmelden_real.html moet noindex krijgen.

Robots/sitemap (CURRENT policy):

- robots.txt moet expliciet:
  - indexatie toestaan voor productiepagina’s
  - dev/duplicate pagina’s uitsluiten (minimaal aanmelden_real.html zolang die bestaat)
  - verwijzen naar sitemap.xml
- sitemap.xml moet alleen canonieke, publieke pagina’s bevatten.

Stopregel
- Als een pagina duplicaatcontent heeft of slechts een tijdelijke route is → noindex.

### AMENDMENT — 00_GLOBAL.md

Datum: 2026-02-24 Type: CSS contract + Payment gate switchability (Optie C) Status: APPEND-ONLY

## 12) CSS Single-Source-of-Truth (HARD CONTRACT)

Met ingang van 2026-02-24 geldt expliciet:

* `assets/css/style.css` is de **enige** canonical stylesheet.
* Er worden **geen extra CSS files** meer toegevoegd (geen legacy.css, geen page-specifieke sheets).
* Informatiepagina’s worden in lijn gebracht door:

  * HTML normalisatie
  * hergebruik van bestaande component classes
* Alleen indien aantoonbaar noodzakelijk én herbruikbaar (≥ 2 pagina’s) mag een generieke component-uitbreiding aan `style.css` worden toegevoegd.

Niet toegestaan:

* Inline styles (behalve tijdelijk tijdens refactor, daarna verwijderen)
* Page-specifieke hacks in CSS
* Nieuwe utility-varianten als bestaande utilities volstaan

Doel:

* Eén visueel systeem
* Geen CSS wildgroei
* Geen regressie tussen core- en informatiepagina’s

---

## 13) Payment Gate Switchability (OPTIE C — 1 uur verplaatsbaar)

Architectuur-besluit:

Betaling is een **business gate**, geen audit gate.

Audit gates blijven altijd leidend:

* Dossier lock (evaluate finalize=true)
* Document confirmed

Payment mag:

* óf op export/download zitten (default)
* óf vóór lock (submit) worden afgedwongen

### Minimale technische vereisten

1. Eén eenduidig veld:

`payment_status` ∈ {`unpaid`, `paid`, `waived`}

2. Eén environment toggle:

`PAYMENT_GATE_MODE` ∈ {`export`, `submit`}

### Gedrag

PAYMENT_GATE_MODE=export (default)

* Indienen (lock) toegestaan zonder betaling
* Export/download geblokkeerd bij unpaid

PAYMENT_GATE_MODE=submit

* Lock (evaluate finalize=true) geblokkeerd bij unpaid
* Export vereist daarnaast locked + confirmed

### Invariants (mag nooit wijzigen)

* Audit contract blijft identiek
* Document lifecycle blijft identiek
* State machine blijft identiek
* Geen schema_version wijziging

### Audit events

Bij wijziging payment_status:

* `payment_status_changed`

Bij reject door payment gate:

* `evaluate_rejected` reason=`payment_required`
* of `export_rejected` reason=`payment_required`

Doel:
Payment-gate verplaatsen binnen ±1 uur zonder UI rewrite of DB migratie.



====

## UPDATE AMENDING SECTION

### Update 2026-02-10 — Phase-2 uploadstrategie & DEV opschoning
- **Client-side uploadoptimalisatie bewezen (DEV)**:
  - Foto-uploads worden vóór upload gecomprimeerd (downscale + JPEG re-encode).
  - Server ontvangt uitsluitend finale bytes; geen image processing op Edge.
  - Server-side sha256 verificatie blijft verplicht bij `upload-confirm`.
- **Scope-aanscherping particuliere dossiers**:
  - UI is momenteel ingericht voor particuliere dossiers (meerdere laadpalen mogelijk).
  - Er wordt géén expliciete maximumcommunicatie richting gebruiker gedaan.
  - Backend ondersteunt technisch tot 10 laadpalen.
  - UI-cap is een implementatiedetail en geen productbelofte.
- **Kosten- en stressreductie gerealiseerd** zonder auditkrachtverlies:
  - Geen dubbele downloads
  - Lagere storage egress
  - Audit trail blijft reproduceerbaar
- **DEV-omgeving opgeschoond**:
  - Alle dossiers, documenten, audit events en storage objects verwijderd.
  - Nieuwe tests starten vanuit een schone nulmeting.

### Update 2026-02-11 — Intake validatie (anti-tamper)
- api-lead-submit valideert invoer server-side.
- Frontend UI beperkt invoer tot realistische particuliere scenario’s.
- Server-side validatie blijft leidend (UI is niet trustable).
- Caps of limieten zijn systeemregels en geen marketingclaims.


### Update 2026-02-12 — Auth/Gateway nuance + testbewijs deploy actief
- Supabase Edge Functions gateway kan requests blokkeren vóór de function:
  - Zonder `authorization: Bearer <jwt>` → 401 `Missing authorization header` (gateway response)
  - In dat geval zie je ook niet de function CORS headers (vaak `allow-origin: *`).
- Canonical rule voor curl/clients:
  - Altijd zowel `apikey: SUPABASE_ANON_KEY` als `authorization: Bearer SUPABASE_ANON_KEY` meesturen.
- Bewijs (curl):
  - OPTIONS → 200 met strict allowlist CORS
  - POST zonder Idempotency-Key → 400 uit de function
  - installer_signup → 410 uit de function
  - ev_direct → 200 en idempotency replay → 200 met identieke body
  - contact zonder authorization → 401 gateway
  - contact met authorization → 200 uit de function

### Phase-2 doc hygiene (2026-02-12)
- Het Phase-2 document is bijgewerkt naar **CURRENT** gedrag (geen “plan vs current” meer).
- Upload-confirm is CURRENT de harde gate met server-side sha256 verify.
- Intake eligibility gates uitgebreid met **NL + MID** (self-serve scope); implementatie loopt (zie TODO).

### Update 2026-02-17 — Intake eligibility gates (NL + MID) volledig enforced (pre-dossier)

Self-serve intake (`flow=ev_direct`) wordt nu hard geweigerd vóór lead/dossier creatie indien:

- `in_nl != true`
- `has_mid != true`

Architectuurkeuze:
- Rejects gebeuren **pre-dossier**
- Audit logging gebeurt in `public.intake_audit_events`
- Er wordt géén `lead`, géén `dossier` en géén `outbound_email` aangemaakt bij reject

Auditpositie:
- Dit is bewust “pre-dossier on-chain” via intake_audit_events
- Geen overlap met `dossier_audit_events`
- Idempotency replay geldt ook voor rejects

Bewijs geleverd (curl + SQL):
- 400 responses
- intake_audit_events rows met reason `in_nl_false` en `has_mid_false`
- Geen leads/dossiers voor reject emails
- Idempotency_keys bevat reject response


### Update 2026-02-17 — DB exposure hardening + intake rejects audit (pre-dossier) geïntroduceerd

#### Wat is er gedaan
- Nieuwe intake reject logging geïntroduceerd via `public.intake_audit_events` zodat intake rejects auditbaar zijn zonder dossier scope.
- RLS + policies aangescherpt: REST reads met anon/auth zijn nu hard dicht (permission denied), zodat DB uitsluitend via Edge functions (service_role) benaderd wordt.
- Keuze gemaakt voor audit inspectie: **Optie 1 (SQL Editor)** i.p.v. een admin-edge endpoint.

#### Impact / waarheid (belangrijk)
- Debugging en audit-inspectie gebeurt niet meer via anon REST calls maar via Supabase SQL Editor.
- Security verschuift bewust naar: Edge function auth/validatie/idempotency/audit + locked enforcement.
- “A vs B” intake auditpositie is expliciet geworden:
  - **A (doel):** hard reject vóór dossier-create → log naar `intake_audit_events`.
  - Let op: implementatie in `api-lead-submit` moet hiermee consistent gemaakt worden (TODO).

#### Open risico dat expliciet blijft
- Service_role is superuser in Edge: fout in function = potentieel data-impact.
  → Mitigatie: strict guards, input validation, idempotency, locks, MLS logging, minimale DB privileges voor anon/auth.


### Update 2026-02-17 — MID model: dossier-level has_mid verwijderd, mid_number per charger verplicht (CURRENT)

Wat is nu definitief CURRENT:
- Er bestaat géén dossier-level `has_mid` veld.
- Intake gebruikt `has_mid` uitsluitend als **eligibility gate** (self-serve).
- Per laadpaal is `dossier_chargers.mid_number` verplicht (NOT NULL).
- `api-dossier-charger-save` reject indien `mid_number` ontbreekt.

Auditpositie:
- Charger audit events zijn completeness-gedekt:
  - `charger_added` / `charger_updated` bevatten: `mid_number`, serial/brand/model/power_kw/notes + MLS meta.
- Intake rejects blijven pre-dossier:
  - log naar `public.intake_audit_events`a
  - géén lead/dossier/mail bij reject
  - idempotency replay geldt óók voor rejects

Doc impact:
- 01_SYSTEM_MAP en 02_AUDIT_MATRIX zijn geüpdatet naar dit model.
- 04_TODO item “Charger audit completeness” is DONE gezet (bewijs via audit query).

### Update 2026-02-17 — Mail-worker gateway/auth nuance bevestigd (bewijs geleverd)

Context:
- Supabase Edge Functions kunnen requests blokkeren vóór de function code draait (gateway layer).

Nieuwe expliciete ops-regel (hard):
- Bij curl/Postman naar `.../functions/v1/<fn>` altijd beide headers meesturen:
  - `apikey: $SUPABASE_ANON_KEY`
  - `authorization: Bearer $SUPABASE_ANON_KEY`

Symptoom (gateway, niet jouw code):
- HTTP 401 met body: `{"code":401,"message":"Missing authorization header"}`
- CORS headers zijn niet die van de function (vaak `allow-origin: *`).

Bewijs (mail-worker):
- Call zonder gateway headers + met `x-mail-worker-secret` → 401 `Missing authorization header` (gateway).
- Call met gateway headers + `x-mail-worker-secret` → 200 `No queued emails` (function draaide succesvol).

Impact:
- Debugging: bij deze 401 eerst headers fixen, pas daarna code/secrets onderzoeken.
- Dit voorkomt uurverlies door “fout in code” te debuggen terwijl request nooit bij de function komt.

## APPEND-ONLY UPDATE — 2026-03-04 — CSS: single stylesheet is nu écht CURRENT

Context:
- De eerdere beschrijving met `assets/css/legacy.css` is **niet meer waar**.
- CURRENT repo/website gebruikt **één** stylesheet: `assets/css/style.css`.

Harde regel (CURRENT):
- `assets/css/style.css` is de **enige** canonical stylesheet.
- `assets/css/legacy.css` bestaat niet (meer) en mag nergens meer worden genoemd.

Implicatie:
- Informatiepagina’s (pricing/regelgeving/voorwaarden/privacy/etc.) moeten conform het component-systeem in `style.css` worden gestyled.
- Isolatie gebeurt door **component contract** en **HTML normalisatie**, niet door een tweede stylesheet.

Doc-hygiëne regel:
- Eventuele historische secties die nog naar `legacy.css` verwijzen blijven staan als historie,
  maar worden vanaf nu als **OUTDATED** beschouwd.

# EINDE 00_GLOBAL.md (current state, rewrite-ok)
