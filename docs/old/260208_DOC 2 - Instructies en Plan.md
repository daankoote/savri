============
BEGIN DOC 2
============

Instructies & Plan (APPEND-ONLY UPDATE)

enkel de updates worden toegevoegd onderaan, dus lees tot einde door

huidige plan en status:

1-1-2026:

Jouw rol:
Jij bent hier om mij alles te verschaffen, code, tekst, ideeen, oplossingen, gevaren, opties etc.. alles waardoor we een professionele look en feel houden met een logische UI die de klant efficient en snel informeert en het gevoel geft "ok lets do it"... we hebben al een flinke website samen gebouwd maar ik weet dat je die dingen niet onthoudt, dus vraag mij om de relevante htmls, scripts, edge functies, css, etc die je nodig hebt. lees hieronder goed de instructies door hoe wij communiceren om efficient te werkte gaan

Het project Enval:

structuur:

* statische HTML, met https://www.enval.nl (primairy) en https://enval.nl
* javascript voor de acties en frontend sanity validaties --> in VS code
* css voor de opbouw/look and feel --> in vs code
* supabase voor de database en server 
* edge functions voor de banckend validaties voordat het communiceert met de database. ook voor mail worker functies --> DEZE STAAN ALLEMAAL IN SUPABASE DASHBOARD, NIET IN VS CODE
* vs code om in te schrijven
netifly voor mijn domein verwerkingen (bij transip ingeschreven maar doet niets). Staat in netifly nog dat mijn servve/certificate niet secure is maar in reality (check online / slotje) is deze dat wel.
* google workspace met dk@enval.nl als main, met aliassen contact@, onboarding@ en no-reply@. DKIM is ingesteld (UI googlenog op pending, maar ik krijg positieve update mails van de Dmarc server) --> gebruik voor inkomende mail vanuit de website contact form en communicatie met klant
* resend voor alle automatischeverstuur protocollen vanuit de website.

Samenvatting van het gehele project (Enval)

* Enval is opgezet als een dossier- en registratieplatform rondom privé-laadpalen in het kader van RED3 / ERE.
* De kernpositie van Enval is niet: inboeken, verifiëren of vergoeden.
* De kernpositie is wel: zorgen dat data, bewijsstukken en structuur zó zijn ingericht dat een traject niet afketst op administratie.

Belangrijk uitgangspunt:

* De inboeker is en blijft eindverantwoordelijk (juridisch, administratief, frauderisico).
* Enval levert voorbereiding, structuur en overdraagbaarheid.
* Geen garanties op ERE’s of vergoedingen.
* Verbruik/metering is een aparte, nog onduidelijke stap → expliciet “in ontwikkeling”.



Wat we tot nu toe gedaan hebben chat hebben gedaan (inhoudelijk)

2.1 Bedrijfsvoering – fundamentele koerswijziging

* Afgestapt van impliciete “wij regelen ERE/vergoeding”.
* Enval duidelijk gepositioneerd als dossierplatform, niet als inboeker.

Verantwoordelijkheden per stap expliciet gemaakt:

* Enval = dossierbasis
* Externe verificateur = pre-verificatie / audit
* Inboeker = inboeken + eindverantwoordelijkheid

Mandaat bewust teruggeschroefd / afgezwakt vanwege:
* Onvolwassen regelgeving
* Geen BV/KvK (later bij werkelijk online te gaan)
* Geen duidelijke juridische grond om namens klant te handelen

2.2 Proces (proces.html)

We hebben een 5-stappenmodel uitgewerkt en visueel neergezet:

Dossierbasis (Enval)
--> Identiteit, locatie, eigendom, hardware, meter-info, bewijsstukken, audit-trail.

Verbruik (kWh) (in ontwikkeling)
--> Bron en validatie verschillen per inboeker / verificatiemodel.
--> Enval kan structureren, maar is geen bron en geeft geen garantie.

Pre-verificatie (extern)
--> Verificateur beoordeelt de inboekroute.
--> Onderdelen van Enval kunnen worden meegenomen, maar Enval is geen verificateur.

Inboeken (erkende inboeker)
--> Alleen na succesvolle pre-verificatie.

Audit / steekproef (extern)
--> Kan plaatsvinden op keten én locatie (eindgebruiker).

2.3 Pricing – strategische herpositionering

Oorspronkelijk: vaste (hoge) bedragen per dossier → niet houdbaar bij €200 bruto opbrengst per laadpaal.aangezien dit voor privepersonen is.. Huidige/oude scenario is is dat bedrijven grote hoeveelheden hadden waardoor hoge prijzen konden

Nieuwe richting:

- €5–€10 per laadpunt per jaar
- Jaarlijkse bevestiging / actualisatie (“is er iets gewijzigd?”)
- Lage drempel → schaalbaar
- Verbruik-module expliciet als future / in ontwikkeling

Waarom main nu een “veilige” pilot is. Belangrijk besluit:
- Geen BV / KvK → geen operationele claims

Daarom is main nu bewust:
- Informatief
- Pilot / testversie
- Geen actieve dienstverlening
- Geen impliciete verplichtingen

Waar we nu staan (technisch & inhoudelijk)

Technisch

main (productie)
--> Bevat alleen: pilot index + privacy + voorwaarden
--> Is live op enval.nl
--> Geen actieve flows

feature/pricing-page (dev/werk branch)

Bevat al het echte werk:
* Pricing v2
* Proces
* Regelgeving
* Aanmeldflows
* Dossierstructuur

Afspraken over communicatie tussen ons

Deze zijn nu kristalhelder en moeten zo blijven:

* Geen herhaling van afgeronde onderwerpen
* Geen gokken: jij levert code, ik/ENVAL reageer 1-op-1
* Geen halve snippets: altijd hele bestanden of hele secties zoals vervang function{xyz} helemaal voor function {abc}
* Bij het leveren van code door jou MOET JE EEN ZOEKANKER meeleveren gebasseerd op de file die jij van mij hebt gekregen, geen zoektocht door mij naar waar je wilt dat ik de code vervang --> belangrijkste stuk van deze doc!!!

Juridisch eerst, techniek daarna

* Als iets onzeker is → expliciet benoemen, niet gladstrijken
* !!! Wanneer je veranderingen in een file (html, css, js (deze drie staan in vs code) edge, (deze staat in supabase dashboard) etc) vraag je mij ALTIJD om de docs omdat je vaak oude docs in je geheugen gebruikt

Ik/ENVAL bepaalt tempo en scope, ik bewaak scherpte en risico

de stappen zijn:
- Ik/ENVAL vraag jou iets
- jij bevestigd mijn vraag en geeft aan wat je nodig hebt aangezien je anders oude files gaat checken
- ik geef jou wat je nodig hebt (de files of andere info) --> let op dat de vs code heeft html, js, css, supabase heeft in dashboard de edge functions
- ik krijg van jou óf: een heel bestand (1-op-1 copy/paste) -- kleinere files, of een volledige functie (beginnend bij function ... { en eindigend bij }), met EXACT waar je hem moet plakken (grotere files). ---> dus een zoekanker voor mij --> curciaal belangrijk, belangrijkste punt van deze doc

!! Geen halve plakzooi waarbij ik moet gaan zoeken naar waar de code staat!!

Aanwezige files:

site:
aanmelden.html
dossier.html
hoe-het-werkt.html
index.html
installateur.html
mandaat.html
pricing.html
privacyverklaring.html
proces.html
regelgeving.html
voorwaarden.html


scripts:
assets/js/config.js
assets/js/script.js
assets/js/assets/dossier.js

css:
style.css


edge functions:
api-dossier-access-save --> If you read this that step 1 is checking what this is and create description for updating this file (ask me for the file in full) 
api-dossier-access-update --> If you read this that step 1 is checking what this is and create description for updating this file (ask me for the file in full) 
api-dossier-address-preview - stap 2 (in UI - dossier.html/js) pre-check validation for user comfort
api-dossier-address-save — stap 2 (in UI - dossier.html/js) write
api-dossier-address-verify - stap 2 preview (for api-dossier-address-save)
api-dossier-charger-delete - stap 3 (in UI - dossier.html/js) write
api-dossier-charger-save - stap 3 (in UI - dossier.html/js) write
api-dossier-consents-save - stap 5 (in UI - dossier.html/js) immutable consents
api-dossier-doc-delete - delete (draft only for audit purposes)
api-dossier-doc-download-url — download url (dossier)
api-dossier-email-verify-complete - this might be an outdated function, need to check --> we use the email link that people receive after application already as a verification (--> If you read this that step 1 is checking what this is and create description for updating this file (ask me for the file in full) )
api-dossier-email-verify-start - this might be an outdated function, need to check --> we use the email link that people receive after application already as a verification (--> If you read this that step 1 is checking what this is and create description for updating this file (ask me for the file in full) )
api-dossier-evaluate — stap 6 (in UI - dossier.html/js) checks + lock
api-dossier-export --> If you read this that step 1 is checking what this is and create description for updating this file (ask me for the file in full) 
api-dossier-get — read model + token auth
api-dossier-submit-review --> If you read this that step 1 is checking what this is and create description for updating this file (ask me for the file in full) 
api-dossier-upload-confirm - stap 4 (in UI - dossier.html/js) upload issuance + confirm
api-dossier-upload-url — stap 4 (in UI - dossier.html/js) upload issuance + confirm
api-lead-submit — intake flows + writes + email queue
mail-worker — verstuurt queued mails


een aantal functions gebruiken _shared --> (HERHALING: DIT STAAT DUS IN SUPABASE, NIET IN VSCODE (gaan we later doen)):
1) api-dossier-charger-delete
2) api-dossier-charger-save
3) api-dossier-doc-delete
4) api-dossier-export
5) api-dossier-upload-confirm
6) api-dossier-access-save
7) api-dossier-address-save
8) api-dossier-consents-save

en ze gebruiken allemaal:
// supabase/functions/_shared/reqmeta.ts. --> ../_shared/reqmeta.ts in supabase
// supabase/functions/_shared/audit.ts --> ../_shared/audit.ts in supabase
// supabase/functions/_shared/import_map.json --> ../import_map.json in supabase
= 
{
  "imports": {}
}

 
DB tables:
•	dossiers, dossier_chargers, dossier_documents, dossier_consents, dossier_checks, dossier_audit_events
•	idempotency_keys, outbound_emails, contact_messages, installers, leads


edge/supabase secrets:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_DB_URL
- FROM_EMAIL
- RESEND_API_KEY
- MAIL_WORKER_SECRET
- ALLOWED_ORIGIN
- SITE_BASE_URL
- ENVIRONMENT

verder hebben we in supabase de tabellen:

* contact_messages
* dossier_audit_events
* dossier_chargers
* dossier_checks
* dossier_consents
* dossier_documents
* dossiers
* idempotency_keys
* installers
* leads
* outbounds_emails

terminal root: 
* /Users/daankoote/dev/enval

gemaakte audit-test scripts:

eerst:

cd /Users/daankoote/dev/enval
source ./.env.local

daarna:

Run zonder purge (default):  ---> DEZE GEBRUIKEN WE
* ./scripts/audit-tests.sh

— Audit contract test (real-world gedrag)

Doel (wat dit script bewijst):
* Simuleert realistisch dossiergedrag rond meerdere chargers per dossier op basis van de backend target charger_count (1–10).

Verifieert API-contracten van Edge Functions:
* charger-save
* upload-url
* upload-confirm
* doc-delete
* charger-delete

Verifieert dat zowel success als rejects audit-events schrijven in public.dossier_audit_events met traceerbare velden (request_id, actor_ref, environment, stage/reason, idempotency_key).

Belangrijk uitgangspunt (realiteit):
* Het maximum aantal chargers in een dossier wordt bepaald door charger_count zoals opgegeven door de klant in de frontend (1–10).
* Het script test dus: “wat kan er gebeuren” bij ondervulling en bij overschrijding.

Wat het script doet (in volgorde)
SETUP (real-world)

Leest:

* EXPECTED_CHARGERS (de backend target; gelijk aan charger_count)
* EXISTING_CHARGERS (aantal chargers dat al in het dossier staat)
* Berekent: MISSING = EXPECTED_CHARGERS - EXISTING_CHARGERS

Setup regels:

* Als MISSING > 0: maak exact MISSING nieuwe chargers aan (uniek), en onthoud deze lijst als CREATED_CHARGER_IDS.
* Als MISSING == 0: script faalt (doel van de test is “bijvullen + cleanup”; er valt niets bij te vullen).
* Als MISSING < 0: script faalt (dossier inconsistent: meer chargers dan target).

REJECT TESTS (contract)

Unauthorized calls (401) op:

* charger-save
* doc-delete
* charger-delete

Input rejects (400/404) op upload flows:

* missing Idempotency-Key → 400 (en geen audit event als dat zo is afgesproken)
* invalid doc_type → 400 + audit reject
* missing required fields → 400 + audit reject
* document not found → 404 + audit reject

MAX CHARGERS REJECT (realistisch)

Na setup is het dossier op EXPECTED_CHARGERS gebracht.

Daarna probeert het script 1 extra charger toe te voegen:

* Verwacht: 409 “max chargers bereikt” + audit reject event.
* HAPPY PATH (per nieuw aangemaakte charger)

Voor elke charger_id in CREATED_CHARGER_IDS:

* upload-url (doc_type=factuur) → PUT naar signed URL → upload-confirm
* upload-url (doc_type=foto_laadpunt) → PUT → upload-confirm
* Alle idempotency keys + filenames zijn per call uniek om collisions / fail-storm te voorkomen.

CLEANUP (alleen testdata)

* Verwijdert alleen de chargers die in deze run zijn aangemaakt (CREATED_CHARGER_IDS) via charger-delete.
* Verwacht dat bij charger-delete ook de gekoppelde documenten en storage objects worden opgeruimd (en rapporteert aantallen: deleted_documents, deleted_storage_objects).

Wanneer gebruiken

* Na elke wijziging aan Edge Functions die dossierdata / documenten / audit logging raken.
* Vóór deploy naar pilot/staging project.
* Als smoke test om contract + audit trail + idempotency te valideren.

Wanneer NIET gebruiken

* Niet op productie/live data of een live Supabase project.
* Niet op een dossier dat je nodig hebt: het script maakt chargers/documents aan en verwijdert ze weer.

Wat “PASS” betekent

* Juiste HTTP statuscodes per contract (400/401/404/409/200).
* Relevante audit events aanwezig voor success én rejects.
* Cleanup verwijdert alleen wat de test zelf heeft aangemaakt.


ADD 2026-01-22 12:00 — Scope reset: van “audit-slogans” naar aantoonbaar contract
ADD 0.1 — Definitie “auditwaardig” (Enval v0)

Auditwaardig betekent hier NIET “perfecte compliance met een externe standaard”.
Auditwaardig betekent WEL:

1) Alle write-acties (succes en mislukking) laten sporen na in public.dossier_audit_events.
2) De sporen zijn te correleren: request_id + actor_ref + ip + ua + environment.
3) Documenten kunnen niet meetellen voor review zolang upload niet bevestigd is (issued ≠ confirmed).
4) Dossier lock is afdwingbaar (hard enforcement) en zichtbaar in audit trail.

ADD 0.2 — Stop met tunnelvisie: vaste volgorde voor werk

Als we iets verbeteren in één edge function, doen we het pas “klaar” noemen als:
- het format is vastgelegd (Minimum Logging Standard + Idempotency Standard),
- het is doorgetrokken naar alle dossier write endpoints,
- en het is testbaar (scripts).

Zonder die 3 is het half werk en creëert het latere refactor schuld.

ADD 1.0 — Minimum Logging Standard (MLS) (verplicht voor alle dossier write endpoints)

In elke audit event_data:
- request_id
- ip
- ua
- actor_ref
- environment (top-level)
- stage/status/message bij reject

ADD 1.1 — Idempotency Standard (IS)

Waar Idempotency-Key gebruikt wordt:
- reserve/replay/finalize in idempotency_keys
- frontend hergebruikt dezelfde key bij retries per actie

ADD 2.0 — Praktische werkafspraken (anti-herhaling)

- Geen Docker-advies meer (afgehandeld).
- Als jij zegt “dit is al opgelost”, dan is het opgelost totdat jij een foutmelding toont.
- Ik vraag ALTIJD om de huidige file voordat ik wijzigingen voorstel.
- Jij levert: volledig bestand of volledige functieblok.
- Ik lever: volledig bestand of volledige functieblok + exact pad + exact vervangpunt.

ADD 3.0 — Wat we nu aantoonbaar hebben (per 22-01-2026)

- Audit tabel = public.dossier_audit_events (met update/delete block triggers).
- Reproduceerbare audit tests: scripts/audit-tests.sh
- Upload flow auditbaar: api-dossier-upload-url + api-dossier-upload-confirm
- Negatieve paden worden gelogd: charger_save_rejected, document_delete_rejected, upload-url/confirm rejects

ADD 4.0 — Wat de volgende chat concreet gaat doen (geen uitloop)

Doel: “1 consistent format” over alle dossier write endpoints.

Scope:
- Doorvoeren MLS + (waar relevant) IS in:
  api-dossier-access-save
  api-dossier-address-save
  api-dossier-charger-delete
  api-dossier-consents-save
  api-dossier-submit-review (als die nog gebruikt wordt)
  api-dossier-doc-download-url (alleen als we audit willen, anders expliciet niet)
  api-dossier-email-verify-start/complete (alleen als ze muteren/loggen)
  api-lead-submit (P0 abuse later, maar logging consistent maken)
- Tests uitbreiden: per endpoint minimaal 1 reject test + 1 happy test (waar mogelijk).

Niet in scope:
- Externe APIs (energiebedrijven/merk-model/MID) -> later, na eisenpakket.

ADD 5.0 — Security P0

Service role key als “gelekt” beschouwen -> roteren en scripts/env updaten.
Verder temp folder voor audits/scripts verplaatst van mijn Mac naar mijn root in project: TMP_FILE="./scripts/.tmp/enval-devtest-upload.pdf"
mkdir -p "./scripts/.tmp"


ADD 6.0 — 2026-02-08 — scripts/audit-tests.sh: scope + gedrag gecorrigeerd en bewezen

6.1 Correctie op eerdere beschrijving (belangrijk)
Eerdere tekst zei: “Als MISSING == 0: script faalt”.
Dat is NIET meer het huidige gedrag.

Huidig (correct) gedrag:
- Als MISSING == 0 (existing == target):
  - Script faalt NIET.
  - Script draait alle reject tests + audit bewijs.
  - Script slaat happy uploads over (want we raken bestaande chargers/docs niet aan).
  - Script slaat cleanup over (want er is niets aangemaakt).
Dit is bewust “non-destructive” design.

6.2 Nieuw bewezen gedrag (real-world runs)
Run A (allowed_max=3, existing=3):
- Setup: 0 created
- Reject tests: OK
- Happy uploads: SKIP met duidelijke uitleg
- Cleanup: SKIP
Resultaat: PASS (geen mutatie aan bestaande data)

Run B (allowed_max=4, existing=3):
- Setup: created 1 charger
- Happy path: 2 docs (factuur + foto_laadpunt) succesvol:
  - upload-url OK
  - storage PUT 200
  - upload-confirm 200
- Cleanup: charger-delete 200 en rapporteert:
  - deleted_documents=2
  - deleted_storage_objects=2
  - storage_delete_failed_objects=0
Resultaat: PASS met aantoonbare delete-cascade.

6.3 Script wijziging: repo-lint standaard UIT
Toegevoegd:
- RUN_REPO_LINT default = 0
- Repo-lint draait alleen als RUN_REPO_LINT=1

Reden:
- Edge functions zijn momenteel Supabase Dashboard source-of-truth.
- Repo-lint warnings zijn noise in audit contract runs.
- Bij productie-hardening schakelen we RUN_REPO_LINT standaard aan.

6.4 Volgende sessie (scope strak, geen uitloop)
Doel: “MLS + Idempotency Standard” doorvoeren + testbaar maken.

Concreet:
1) MLS (Minimum Logging Standard) afdwingen in ALLE dossier write endpoints:
   - request_id, idempotency_key, actor_ref, ip, ua, environment, stage/status/message (rejects)
2) Idempotency (waar relevant) consistent:
   - reserve/replay/finalize in idempotency_keys
3) Tests uitbreiden:
   - Per endpoint: minimaal 1 reject test (audit aanwezig) + waar mogelijk 1 happy test (audit aanwezig)
4) Script uitbreiden (audit asserts):
   - Happy path: audit events hard assert’en op request_id voor upload-url issued + upload-confirmed
   - (optioneel) idempotency replay test: zelfde Idempotency-Key 2x → geen duplicate records

Niet in scope:
- Externe validaties / APIs (MID/merk/model/energieleverancier) → pas na eisenpakket.


ADD 7.0 — 2026-02-08 — Werkwijze update: stop met Supabase Dashboard als source-of-truth

Probleem
- Handmatig copy/paste in Supabase Dashboard is foutgevoelig, niet reproduceerbaar en breekt auditwaardige discipline.

Nieuwe norm (verplicht)
- Edge functions worden gedeployed vanuit repo via Supabase CLI.
- Wij leveren daarom standaard: volledige file 1-op-1 (of volledige function), zodat repo de waarheid is.

Tooling
- scripts/deploy-edge.sh toegevoegd: deploy per function via terminal:
  bijvoorbeeld: ./scripts/deploy-edge.sh api-dossier-access-update

Doel
- Geen “zoekanker”-gedoe meer in dashboard.
- Elke wijziging is reproduceerbaar (git diff), testbaar (audit-tests.sh), en deploybaar (CLI).

ADD 8.0 — 2026-02-08 — Status update: repo-first edge functions + extra endpoints groen + Phase-2 backlog aangescherpt

8.1 Waar we nu staan (fase)
We zitten nog steeds in Fase 1: “Auditwaardig MVP-contract + reproduceerbare deploys”.
Nieuwe subfase (actief): “Supabase Dashboard is NIET langer source-of-truth; repo + CLI deploy wel”.

8.2 Wat we nu concreet hebben gedaan (geen theorie, harde deliverables)
A) Repo-first workflow ingevoerd
- Edge function code staat in VS Code (repo).
- Deploy gebeurt via: ./scripts/deploy-edge.sh <function_name>.
- Doel: geen dashboard-knipplak, geen zoekanker-ellende, consistentie via git diff en reproduceerbaarheid.

B) Extra edge endpoints getest en/of gemigreerd (groen)
1) api-dossier-export
- Curl bewezen: 200 + export payload incl. confirmed docs, checks, consents_latest.

2) api-dossier-doc-download-url
- Curl bewezen: 200 + signed download_url voor specifiek document_id.

3) api-dossier-submit-review (legacy)
- Bestaat als compat endpoint; werkt maar is conceptueel deprecated t.o.v. api-dossier-evaluate.
- Incomplete dossier → 400 met missingSteps + checks.
- Locked dossier → 200 “already locked”.

4) api-lead-submit
- Contact flow is 1-op-1 aangepast aan SQL table public.contact_messages.
- Tests bewezen:
  - ev_direct → lead + dossier create
  - contact → db write + outbound mail queued
  - installer_to_customer → lead + dossier create
- Idempotency (idempotency_keys) actief in api-lead-submit.

5) mail-worker
- Werkt end-to-end; queued mails komen binnen.
- Guard: x-mail-worker-secret.

6) api-dossier-address-save
- Wordt nu gezien als “save + verify” (niet alleen preview).
- Tests bewezen dat missing suffix tot andere address variant leidt (risico).

8.3 Belangrijke correctie op “invalidatie” discussie
- “in_review” = locked → dossier kan niet worden aangepast (frontend + backend block).
- “ready_for_review” = NIET locked → daar kan nog een wijziging gebeuren.
- Regel voor later (consistent): elke succesvolle write in ready_for_review → status terug naar incomplete + audit: invalidated_ready_for_review=true.
- Dit is niet urgent zolang UI geen “edit na ready_for_review” toestaat, maar backend moet dit uiteindelijk hard afvangen.

8.4 Nieuw aangescherpte backlog / Phase 2 (expliciet vastleggen)
P2 / Phase-2 fixes (veiligheid & audit-semantiek)
1) Email verification is nu een aanname:
   - “Possession of link = email verified” is risicovol (forward/log/screenshot).
   - MVP: log dit als: verified_by_link_assumption (expliciet in audit).
   - Phase-2: echte email verify flow (start/complete) met bewijs dat mailbox control bestaat.

2) PDOK ambiguity / suffix
   - Zonder suffix kan PDOK een andere unit matchen (bewijs: bag_id verandert).
   - Phase-1.5/2 oplossing:
     * óf suffix verplicht zodra meerdere candidates bestaan,
     * óf “ambiguous” → verified=false + audit event + geen save.

3) deno.json + import map waarschuwingen
   - Doelbeeld: supabase/functions/deno.json is source-of-truth.
   - import_map.json alleen als we expliciet import maps willen blijven gebruiken.
   - Warning verdwijnt pas echt bij consistent bare imports + deno.json resolvers.
   - Niet nu refactoren; pas na “alle functies groen”.

4) api-dossier-upload-confirm performance
   - Server-side download+sha256 is duur en kan timeouts geven bij grotere bestanden/drukte.
   - We houden dit nu (audit correctness > performance).
   - Phase-2 herontwerp opties:
     a) client sends sha/size/ctype + server HEAD/metadata check (zwakker)
     b) storage metadata + db constraints + optionele background verify (sterker, meer werk)

5) Mail worker hardening
   - retries/backoff
   - provider errors beter classificeren
   - observability (provider_id/logging)

6) Abuse controls (P0 later maar vastleggen)
   - api-lead-submit/contact zonder rate limit → risico.

8.5 Wat nog te doen (functioneel, in volgorde)
Nog openstaande / te checken edge functies:
- api-dossier-email-verify-start (waarschijnlijk outdated / herontwerp)
- api-dossier-email-verify-complete (waarschijnlijk outdated / herontwerp)
- (eventueel) api-dossier-address-verify (preview endpoint) → alleen houden als UI die echt gebruikt.
- verdere uniformering MLS/Idempotency waar nog niet consequent.

8.6 Praktisch: DB queryen (psql issue)
- psql probeerde lokale socket → DATABASE_URL is niet de remote Supabase Postgres URL.
- Oplossing later: juiste Supabase connection string met host+sslmode=require óf Supabase SQL editor gebruiken.

ADD 9.0 — 2026-02-08 — Stap 1 (Access) is nu auditwaardig: Idempotency verplicht + MLS audit + hard lock + business rule charger_count

Wat is nu bewezen/gestabiliseerd (contract)
- api-dossier-access-save:
  - vereist Idempotency-Key
  - valideert input + NL mobiel
  - voorkomt inconsistentie: charger_count kan niet lager dan bestaande chargers (409)
  - invalidates ready_for_review -> incomplete
  - schrijft audit (success + rejects) via MLS

- api-dossier-access-update:
  - idem, maar PATCH-style (alleen velden die gestuurd zijn)
  - success event is bewust gelijkgetrokken op access_updated

Praktische implicatie voor frontend (dossier.js)
- Frontend kan save/update aanroepen zonder audit-gaten: retries zijn veilig (idempotency replay).
- Als dossier al ready_for_review was en user wijzigt stap 1: backend dwingt terug naar incomplete (consistent met “dirty since precheck”).

Toekomst / Phase-2 cleanup
- Consolidatie: één access endpoint (nu dubbel: save + update).
- Event naming policy: access_updated is canonical success event; rejects blijven endpoint-specifiek.

ADD 10.0 — 2026-02-08 — Stap 2 Address preview/verify onderscheid is nu expliciet (comfort vs audit)

Wat is nu de waarheid
- address-preview = UX helper (geen audit, geen token auth).
- address-verify = dossier-scoped precheck (auth + audit).

Waarom dit belangrijk is
- In audit context mag je nooit claimen dat “preview” bewijs is.
- Alleen dossier-scoped endpoints met audit trail tellen mee voor auditwaardigheid.

Phase-2 / 1.5 TODO (vastleggen, niet nu fixen)
- PDOK ambiguïteit: zonder suffix kan PDOK een “best guess” teruggeven (jij zag dit zelf: suffix=null → resolvet naar 28-H).
  Strakke regel voor later:
  - als meerdere adressen/candidates bestaan voor pc+hn → suffix verplicht maken,
    of return verified=false/ambiguous en NIET opslaan.
- address-preview hoort eigenlijk óf:
  - expliciet “preview only” te heten in response (bijv. preview:true),
  - óf (beter) vervangen door address-verify in de UI zodat je niet twee paden onderhoudt.

ADD 11.0 — 2026-02-08 — Stap 3 Chargers is nu volledig “auditwaardig” (create/update/delete + cascade + review invalidation)

Wat is nu bewezen / gedrag
- charger-save:
  - enforce max chargers op basis van dossiers.charger_count
  - serial_number is globaal uniek (en ook dubbel gecheckt)
  - bij wijzigingen wordt ready_for_review teruggezet naar incomplete
  - idempotency replay/finalize voorkomt dubbele writes bij retries

- charger-delete:
  - kan alleen als dossier niet locked/in_review is
  - verwijdert eerst dossier_documents rows (DB policy beslist)
  - storage delete is fail-open maar audit-logt failures
  - verwijdert daarna de charger row
  - invalidate ready_for_review naar incomplete

Belangrijk (Phase-1.5 / Phase-2 TODO’s — niet nu refactoren)
1) Idempotency fallback (charger-save) is inconsistent
- charger-save gebruikt: idemKey = meta.idempotency_key || meta.request_id
- Andere endpoints vereisen Idempotency-Key strikt.
Risico: request_id replayen is niet hetzelfde als echte idem key discipline (client retries).
Actie: in Phase-2 idemKey STRICT maken (alle write endpoints: missing => 400).

2) Delete-order trade-off (charger-delete)
- DB delete docs eerst => als storage delete faalt, heb je orphaned storage objects (maar wél audit trail).
Dat is acceptabel voor MVP (“fail-open”), maar Phase-2 zou een opschoningsjob kunnen krijgen:
- background reconciler: storage paths die in audit events ‘failed’ staan later opnieuw proberen.

3) Confirmed docs blokkeren delete (verwacht)
- charger-delete detecteert policy/immutability errors en geeft 409.
Dit is correct, maar UX moet dit later duidelijk maken in UI (“confirmed docs zijn immutable; verwijder charger kan niet”).

ADD 12.0 — 2026-02-08 — Stap 4 Documenten: delete is strict + issue is correct (issued≠confirmed)

Wat is nu correct/sterk
- api-dossier-doc-delete:
  - STRICT Idempotency (geen request_id fallback) => retry-safe en audit-proof
  - Not-found delete is idempotent: 200 deleted=false + audit event (bewijst “attempt”)
  - Confirmed docs blokkeren delete via DB policy => 409 (correct immutability model)
  - Storage delete is fail-open maar audit-logt failures

- api-dossier-upload-url:
  - STRICT Idempotency via header-only
  - allowlists op doc_type/ext/mime, max 15MB (als size bekend)
  - charger_id is verplicht voor factuur/foto_laadpunt en wordt gecontroleerd
  - per-charger doc limit enforced (status != rejected)
  - status invalidation: ready_for_review -> incomplete bij document issuance

Phase-1.5 / Phase-2 TODO’s (niet nu refactoren)
1) Storage orphan risk (accepteer, maar benoem)
- doc-delete: DB delete eerst, storage later fail-open.
- Bij storage failure blijft object bestaan zonder DB row.
Actie: Phase-2 “reconciler/cleanup job” op basis van audit events document_delete_storage_failed.

2) Upload-url ordering (klein maar echt)
- We genereren signed upload URL vóór metadata insert.
- Als metadata insert faalt, kan er een “geldige upload token” bestaan zonder DB row.
Actie (Phase-2): eerst metadata row (status='issued') insert, daarna signed url genereren,
OF bij insert failure expliciet signed token ongeldig maken (als dat kan) of markeer row rejected.

3) size_bytes vertrouwen
- size_bytes komt van client. We gebruiken het alleen voor gating (15MB) en opslaan.
Actie (Phase-2): in confirm stap ook server-side verificatie (HEAD/metadata) of hardere check.

4) Consistentie: doc-delete gebruikt shared idempotency helper, upload-url nog “inline”
- Niet functioneel fout, maar inconsistent.
Actie (Phase-2): standaardiseer op één shared helper voor alle write endpoints.

ADD 12.1 — 2026-02-08 — Upload confirm is nu audit-correct; evaluate telt alleen confirmed; get heeft bewuste MVP-side-effect

Wat is nu aantoonbaar correct
1) issued ≠ confirmed is écht afgedwongen
- api-dossier-upload-url maakt status='issued'
- api-dossier-upload-confirm zet pas op 'confirmed' na server-side sha256 verify
- api-dossier-evaluate telt alleen confirmed docs mee

2) Review gating is deterministisch en retry-safe
- api-dossier-evaluate is Idempotency-Key strict (header-only)
- finalize=false => ready_for_review
- finalize=true  => in_review + locked_at
- Locked dossier => stable 200 responses (geen mutatie)

3) Audit trail is compleet op document lifecycle
- rejects (confirm) worden gelogd (document_upload_confirm_rejected)
- success (confirm) wordt gelogd (document_upload_confirmed)

Phase-1.5 / Phase-2 TODO’s (dit zijn echte risico’s, dus expliciet loggen)
A) Performance / cost: server-side download+sha256 in upload-confirm
- storage.download + arrayBuffer + sha256 is expensive en kan timeouts geven bij drukte of grote files.
- We houden dit nu voor audit correctness.
- Phase-2 ontwerp: alternatief verify model (metadata/HEAD + constraints + background verifier) na volledige migratie.

B) “Possession of link = email verified” is een audit-leugen als je het “verified” noemt
- api-dossier-get zet email_verified_at bij eerste access.
- Dit moet in audit expliciet “assumption” blijven (nu gedaan).
- Phase-2: echte verify flow/token (email-verify-start/complete of nieuw).

C) PDOK ambiguïteit (als suffix ontbreekt)
- address-preview/verify pakken “best match” zonder suffix.
- Phase-1.5/2: als meerdere candidates => suffix verplicht of verified=false + audit “ambiguous”.

ADD 12.2 — 2026-02-09 — Export is nu evidence-grade; submit-review overlapt evaluate; consents-save is strict

1) Export evidence is nu goed afgedwongen
- Export alleen na lock/in_review.
- Export bevat alleen confirmed docs.
- Export blokkeert als confirmed doc zonder sha256 (integrity gate).

2) Overlap submit-review vs evaluate(finalize=true)
- Beide doen checks + lock.
- Risico: divergentie in de toekomst.
- Keuze: of submit-review wrapper om evaluate te worden (Phase-2), of 1 endpoint deprecaten.

3) Idempotency policy inconsistency (nu fix nodig)
- api-dossier-submit-review gebruikt fallback meta.request_id als idemKey.
- Dit is in strijd met “header-only idempotency” policy en met de audit testverwachting.
- Fix: idemKey = meta.idempotency_key ONLY (400 als ontbreekt).

4) Consents versioning is hardcoded
- VERSION="v1.0" => goed voor MVP, maar Phase-2: server-driven consent doc versions (ToS/Privacy/Mandate) met hash/URL.

ADD 12.3 — 2026-02-09 — Lead submit / Download evidence / Address PDOK verify

1) api-lead-submit is audit-light (gaten)
- Alleen dossier_created wordt ge-audit in dossier_audit_events.
- Installer signup, lead insert, contact messages en mail queue actions hebben geen audit trail.
- MVP ok, maar Phase-2: minimaal audit events voor lead_submit_received / lead_submit_rejected / mail_queued.

2) api-dossier-doc-download-url heeft idempotency policy violation + ontbrekende reject audits
- Idempotency: gebruikt meta.request_id fallback. Dit moet header-only worden, anders test/audit inconsistent.
- Geen audit events bij rejects (401/404/409/500). Voor evidence-access endpoints wil je reject audit (wie probeerde te downloaden wat en waarom geweigerd).

TODO:
- Fix idemKey = meta.idempotency_key ONLY; 400 zonder header.
- Voeg reject audit events toe: document_download_url_rejected (stages: validate_input, auth, export_gate, doc_lookup, integrity_gate, signed_url)

3) api-dossier-address-save is evidence-grade genoeg, maar PDOK is extern risico
- 502 bij PDOK storingen is correct; logt stage external_lookup.
- Let op: suffix heuristics kunnen false negatives geven; UX moet duidelijke foutmelding tonen.

==============================
UPDATE 2026-02-09 — P1
==============================

Goal: eliminate audit-test failures and close reject-audit gaps.

1) Replace files 1-op-1
- supabase/functions/api-dossier-doc-download-url/index.ts
  -> replace entire file with the provided version (includes document_download_url_rejected audits)
- supabase/functions/mail-worker/index.ts
  -> replace entire file with the provided version (retry + cooldown + provider_id guard)

2) Deploy
- Deploy both Edge Functions.
- Verify env vars exist:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - RESEND_API_KEY
  - FROM_EMAIL
  - MAIL_WORKER_SECRET

3) Quick verification checklist
- doc-download-url:
  - Missing fields => 400 + audit event document_download_url_rejected(stage=validate_input)
  - Unauthorized token => 401 + audit event document_download_url_rejected(stage=auth)
  - Not locked => 409 + audit event document_download_url_rejected(stage=export_gate)
  - Not found doc => 404 + audit event document_download_url_rejected(stage=doc_lookup)
  - Success => 200 + document_download_url_issued

- mail-worker:
  - queued email processed => status sent + provider_id set
  - failing email => status queued (until attempts=5) then failed
  - repeated failures do not hammer every run (cooldown uses last_attempt_at)


============
EINDE DOC 2
============
