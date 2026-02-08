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
api-dossier-evaluate-export --> If you read this that step 1 is checking what this is and create description for updating this file (ask me for the file in full) 
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


============
EINDE DOC 2
============
