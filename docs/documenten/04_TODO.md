# 04_TODO.md (CURRENT)

Statusdatum: 2026-05-10
Prioriteit: audit-first.  
Regel: alleen open items; afgerond → naar changelog.

## MVP Launch Cut — CURRENT

Doel:
- Niet meer elk open hardening-item vóór MVP behandelen.
- Alleen uitvoeren wat nodig is om een eerste echte gebruiker veilig door de kernflow te krijgen.
- Alles wat geen launch blocker is, blijft zichtbaar maar wordt expliciet post-MVP of Phase-2.

### A) Launch blockers — vóór MVP doen

1. Compacte end-to-end browser regressierun
   - DONE: productie E2E-run 2026-05-17 groen na `apiAuthed` wrapper-fix
   - bewezen:
     - aanmelden → mail/link → session
     - access save
     - address verify/save
     - charger save
     - PDF factuur upload
     - consents save
     - verify/precheck
     - submit/lock
     - dev unlock in DEV
     - opnieuw submit/lock
     - export generated
   - proof:
     - dossier_id `6bd895c6-f5bd-48be-b0e7-86b1e4c2d1da`
     - export_id `7f2765ec-077b-48d0-bd8d-a07755f92914`
     - export_status `generated`
     - payment_status `waived`
     - claimed_mid_numbers `["M0987654321"]`
   - remaining UI findings uit deze run staan als should-fix items hieronder

2. Product/copy claim audit
   - geen complianceclaims
   - geen verificatieclaims
   - geen certificeringsclaims
   - Enval blijft infrastructuur/dossierlaag

3. Cron/job inventory eindcheck
   - bevestigen dat alleen bedoelde lifecycle-jobs actief zijn
   - geen proof-only jobs
   - frequenties/batch limits bewust akkoord

4. SEO/basic live checks
   - robots.txt
   - sitemap.xml
   - canonical/noindex tijdelijke pagina’s

### B) Should-fix before launch — alleen quick wins

1. Defense-in-depth policies op audit tabellen
2. OPS-runbook gateway-401 preventie
3. Minimale abuse controls op publieke intake/contactflow

### C) Post-MVP hardening — niet launch-blocking

1. Mail-worker stuck processing recovery proof
2. Session-auth hardening volledig afronden
3. Storage lifecycle split runtime-only vs preserved/source-evidence
4. Export incomplete-doc edgecase besluit/test
5. Fresh-only tests aanpassen richting echte retention cleanup
6. Foto laadpunt analysis v1 zodra representatieve laadpaalfoto-dataset bestaat
7. Image invoice lane herstellen/proven als JPG/PNG facturen later ondersteund moeten worden

### D) Phase-2 / later

1. Volledige factuur-regressiematrix
2. Foto analysis v1
3. Multi-document support
4. Analysis source-model guardrail
5. PDOK ambiguity zonder suffix
6. Upload-confirm performance redesign
7. Orphaned storage reconciler
8. Invoice warning-state server persistent maken

---

## P1 (must/should)

### 1) Dossier frontend-flow resterende live regressiecheck compact houden
- Context:
  - kernflow is inmiddels browsermatig bewezen:
    - precheck gating
    - finalize gating
    - export op locked dossier
    - dev unlock in DEV
    - upload per laadpaalkaart
    - stabiele laadpaalnummering
    - browser-PDF parser → verify end-to-end
    - `issued` recovery UX in documentflow
- Open restdoel:
  - 1 compacte regressieronde uitvoeren na eerstvolgende dossier-UI wijziging, zodat bewezen blijft dat de vereenvoudigde documentflow niet opnieuw drift veroorzaakt
- DoD:
  - 1 volledige browser-run na volgende dossier-UI wijziging
  - bevestigen dat:
    - nummering stabiel blijft
    - uploadslot per type correct verdwijnt/terugkomt
    - `issued` zichtbaar blijft wanneer confirm niet is afgerond
    - conflict recovery de UI direct hersynct naar server truth
    - finalize alleen zichtbaar wordt na geldige precheck
- Status: DONE voor huidige MVP E2E-run 2026-05-17; opnieuw openen bij volgende dossier-UI wijziging

### 2) api-lead-submit eligibility ordering / intake proof gesloten houden
- Context:
  - CURRENT runtime-proof is nu geleverd:
    - pre-dossier reject op `in_nl` / `has_mid`
    - `intake_audit_events` row aanwezig
    - geen lead / geen dossier bij reject
    - idempotency replay gelijk
    - fresh happy-path bootstrap bewijst expliciet:
      - `lead_id`
      - `dossier_id`
      - outbound `dossier_link` row
  - `_shared/reqmeta.ts` is aligned op huidige callers (`origin`, `environment`)
  - fresh-only testsuite loopt volledig groen
- Open restdoel:
  - dit gesloten bewijs alleen regressievrij houden bij volgende wijzigingen aan:
    - `api-lead-submit`
    - intake audit-flow
    - fresh bootstrap tests
- DoD:
  - bij eerstvolgende wijziging aan intake/bootstrap opnieuw bevestigen:
    - NL=false → 400 + `intake_audit_events` row + idempotency replay
    - MID=false → 400 + `intake_audit_events` row + idempotency replay
    - OK → `lead_id` + `dossier_id` + outbound `dossier_link`
  - geen nieuwe DB writes vóór eligibility reject introduceren
  - geen drift tussen endpointcode en fresh-only testsuite
- Status: OPEN (regressiewacht, geen actieve hardening meer)

### 2b) MVP E2E UI findings 2026-05-17

- Context:
  - Productie E2E-run is functioneel groen na `apiAuthed` wrapper-fix.
  - Export is gegenereerd en preserved.
  - MVP-besluit blijft:
    - factuur is verplicht
    - foto laadpunt is optioneel / niet-blokkerend
    - foto-analysis blijft skeleton/not_checked tot representatieve laadpaalfoto-dataset bestaat
  - E2E-run toonde enkele UI-restpunten.
  - Deze UI-restpunten zijn daarna opgelost en live bevestigd.

- Findings:
  - Address UI:
    - `address_street` en `address_city` worden correct gevuld uit PDOK/BAG
    - deze velden ogen nog als normale bewerkbare inputvelden
  - Document UI:
    - upload-uitlegtekst valt buiten/over de container op smalle viewport
    - factuurinput accepteert JPG/PNG terwijl MVP feitelijk PDF-only moet zijn
    - PDF factuur werkt en passeert analyse
    - dezelfde factuur als JPG uploadt wel, maar lokale factuuranalyse faalt/inconclusive
  - Developer UI:
    - na consents opslaan flitst kort een developer-only container voor niet-developer user

- DoD:
  - straat en plaats zijn readonly of disabled na succesvolle address verify
  - straat en plaats krijgen visueel readonly/disabled styling, bijvoorbeeld grijze achtergrond
  - factuurinput accepteert voor MVP alleen PDF
  - UI-copy vermeldt duidelijk dat factuur als PDF vereist is
  - JPG/PNG factuur geeft duidelijke user-facing reject of is niet selecteerbaar
  - upload-uitlegtekst blijft binnen de container op desktop en small/mobile viewport
  - developer-only panel is default hidden in HTML/CSS
  - developer-only panel wordt pas zichtbaar na bevestigde developer authority
  - geen flicker van developer-only controls voor normale users

- Proof/fix:
  - Address UI:
    - straat/plaats zijn readonly en visueel grijs/disabled weergegeven
  - Document UI:
    - factuurinput is PDF-only voor MVP
    - factuurupload-copy vermeldt PDF duidelijk
    - JPG/PNG facturen worden vóór upload user-facing geweigerd of zijn niet selecteerbaar
    - overbodige upload-uitlegtekst is verwijderd/hidden
  - Developer/analysis UI:
    - dev unlock/default developer controls zijn hidden by default
    - `analysisSection` wordt niet meer automatisch getoond via access-recovery reload
    - documentanalyse/review-panel flitst niet meer bij normale save/reload acties
  - Live bevestigd na Netlify deploy:
    - production `main@786b4af`
    - follow-up fix voor echte flitsoorzaak: `setMainDossierUiHidden(false)` mag `#analysisSection` niet tonen

- Status: DONE — MVP UI findings opgelost en live bevestigd

### 3) Defense-in-depth policies op audit tabellen
- DoD:
  - `deny_all` policy aanwezig op `public.intake_audit_events` en `public.dossier_audit_events` voor anon/auth
  - grants blijven dicht
  - bevestigd via `pg_policies`
- Status: OPEN

### 4) OPS-runbook enforcement: gateway-401 preventie (mail-worker + alle functions)
- DoD:
  - `06_OPS_RUN_DEBUG_BOOK.md` bevat canonical rule + diagnose matrix voor gateway-401 vs function-401
  - alle curl snippets in docs bevatten standaard:
    - `apikey: $SUPABASE_ANON_KEY`
    - `authorization: Bearer $SUPABASE_ANON_KEY`
  - één stop-rule: bij `Missing authorization header` nooit code debuggen, eerst headers fixen
  - 1× herhalingstest door Daan bevestigd
- Status: OPEN

### 5) Mail-worker stuck processing recovery — bewijs sluiten
- Context:
  - Implementatie staat beschreven in changelog, maar bewijs-eis was strenger: één geforceerde stuck case aantonen.
- DoD:
  - geforceerde stuck-processing case uitgevoerd
  - bewijs geleverd dat worker correct herstelt naar:
    - `queued` + `next_attempt_at`, of
    - `failed` bij max attempts
  - dossier-scoped audit events bevestigd:
    - `mail_requeued` of `mail_failed`
    - met reason `stuck_processing_timeout`
- Status: POST-MVP HARDENING — niet launch-blocking

### 6) Session-auth hardening afronden (`dossier_sessions`)
- Context:
  - runtime testsuite is bewezen aligned op `session_token`
  - shared helper `supabase/functions/_shared/customer_auth.ts` bestaat
  - expired session reject is nu runtime-bewezen op meerdere endpoints:
    - `api-dossier-get`
    - `api-dossier-dev-unlock`
  - CURRENT bewezen reason-waarden:
    - `session_not_found`
    - `session_expired`
- Open DoD:
  - bevestigen dat alle dossier runtime endpoints shared auth helper gebruiken waar dat logisch is
  - reason-enums documenteren waar ze bewust specifieker zijn dan generiek `unauthorized`
  - beslissen of `last_seen_at` actief wordt bijgewerkt of bewust deferred blijft
  - expliciet bewijs leveren voor:
    - revoked session reject
    - op meerdere endpoints (minimaal read + write)
- Status: POST-MVP HARDENING — niet launch-blocking zolang geen auth-code wordt gewijzigd

### 7) Retention lifecycle + runtime cleanup na export preservation bouwen

- Context:
  - Export preservation is inmiddels gebouwd en bewezen.
  - `dossier_exports` is de final source-of-truth voor preserved exports.
  - Export preservation bevat:
    - volledige `export_json`
    - `export_sha256`
    - `payment_status`
    - `claim_year`
    - `claimed_mid_numbers`
  - Runtime MID uniqueness is verplaatst:
    - cross-dossier runtime duplicate MID mag
    - final duplicate `MID + claim_year` wordt bij export geblokkeerd
  - DB cleanup helper is gebouwd en live bewezen:
    - `public.enval_retention_cleanup(...)`
    - dry-run werkt
    - target-only apply werkt
    - mass apply zonder target wordt geweigerd
    - preserved runtime cleanup verwijdert runtime data terwijl `dossier_exports` intact blijft
    - non-preserved cleanup met storage wordt geblokkeerd met `STORAGE_CLEANUP_REQUIRED_BEFORE_DB_DELETE`
  - Storage cleanup tool is handmatig gebouwd en bewezen.
  - Retention worker is gebouwd, gedeployed en target-apply bewezen.
  - Retention worker dry-run cron is live bewezen via `pg_cron` + `pg_net` + `vault.decrypted_secrets`.
  - Retention preserved batch apply is live bewezen:
    - dry-run request `437728`
    - apply request `437729`
    - replay request `437730`
    - `processed_count=4`
    - `failed_count=0`
    - runtime `dossiers=0`
    - `dossier_exports=4`
    - `retention_cleanup_events_success=4`
  - Retention apply scheduler proof is live bewezen:
    - temporary proof cron `enval-retention-worker-apply-proof-once`
    - jobid `13`
    - cron run `succeeded`
    - pg_net response `437736`
    - `apply=true`
    - `candidate_count=0`
    - `processed_count=0`
    - `failed_count=0`
    - proof cron disabled after proof
  - Locked/unpaid reminder-worker is gebouwd.
  - Day-3 reminder apply + idempotency + mail delivery zijn live bewezen.
  - Day-7 reminder apply + idempotency + audit + dev-forced mail delivery zijn live bewezen.
  - Day-10 reminder apply + idempotency + audit + dev-forced mail delivery zijn live bewezen.
  - skipped_no_email branch is live bewezen met skipped_reason `missing_customer_email` en zonder outbound email row.
  - reminder-worker scheduler/cron is gebouwd en bewezen:
    - dry-run daily cron proof groen
    - apply daily cron proof groen
    - manual apply `candidate_count=8`, `queued_count=8`
    - replay `candidate_count=0`
    - outbound emails `29` t/m `36` delivered to `sent`
    - jobs daarna disabled als safety state
  - Privacy-hard `retention_cleanup_events` tombstone table is gebouwd.
  - Non-preserved draft target-apply success tombstone is live bewezen.
  - Failed tombstone path + recovery-success path zijn live bewezen via dev-only controlled failure.
  - Storage-delete tombstone path is live bewezen.
  - Preserved runtime cleanup tombstone path is live bewezen.
  - CURRENT fresh-only cleanup in tests is nog bewust lock-aware retained-state proof.

- Retention policy:
  - niet-locked dossiers:
    - bewaren tot 7 dagen na laatste activiteit
    - daarna verwijderen/anonymiseren + storage cleanup
  - locked/in_review maar niet betaald/geëxporteerd:
    - bewaren tot 14 dagen
    - reminder-mails op dag 3, 7 en 10
    - daarna verwijderen/anonymiseren + storage cleanup
  - paid/exported/preserved:
    - langdurig bewaren via immutable `dossier_exports`
    - runtime-tabellen mogen na preservation worden opgeschoond
    - storage objects waarnaar preserved export verwijst, mogen niet worden verwijderd

- Al DONE:
  - `public.dossier_exports` bestaat.
  - export preservation is gebouwd.
  - export SHA proof is getest.
  - `dossier_export_preserved` audit proof is getest.
  - yearly MID claim metadata is toegevoegd.
  - duplicate `MID + claim_year` reject is getest.
  - runtime MID unique index is verwijderd.
  - cross-dossier duplicate MID is runtime toegestaan.
  - final duplicate MID conflict blokkeert export.
  - retention DB cleanup helper is live bewezen.
  - preserved runtime cleanup na export preservation is live bewezen.
  - migration voor retention cleanup is toegevoegd aan `supabase/migrations`.

- Nog OPEN:
  - DONE: handmatige storage cleanup tool bouwen voor non-preserved files
  - DONE: locked/unpaid reminder-worker built and day-3 proof completed
  - DONE: day-7 reminder proof
  - DONE: day-10 reminder proof
  - DONE: skipped_no_email branch proof
  - DONE: reminder-worker scheduler/cron proof, with jobs disabled after proof as safety state
 - DONE: access recovery UX/flow voor gebruikte/verlopen dossierlinks is gebouwd en live bewezen.
  - FK/trigger/immutability model regressievrij houden nu DB cleanup bypass bestaat
  - `dossier_audit_events` verwijderen/anonymiseren mogelijk maken voor abandoned runtime dossiers waar nog geen preserved export bestaat
  - DONE: storage cleanup guard bouwen zodat preserved source files nooit worden verwijderd in handmatige tooling
  - DONE: runtime cleanup na successful preservation opnemen in regressietests
  - DONE: retention worker maken voor automatische retention cleanup
  - DONE: retention-worker dry-run cron ingesteld en live bewezen
  - DONE: privacy-hard cleanup tombstone model bouwen (`retention_cleanup_events`)
  - DONE: non-preserved draft target-apply success tombstone live bewezen
  - DONE: failed tombstone path + recovery-success path live bewezen
  - DONE: storage-delete tombstone path live bewezen
  - DONE: preserved runtime cleanup tombstone path live bewezen
  - DONE: reminder-worker apply cron gebouwd, bewezen en daarna disabled als safety state
  - DONE: retention apply scheduler proof gebouwd, bewezen en daarna disabled als safety state
  - geen actieve retention apply cron totdat expliciet live-retention besluit is genomen
  - fresh-only tests aanpassen zodra cleanup van retained-state proof naar echte retention cleanup verschuift

- DoD:
  - abandoned niet-locked dossiers worden na retention verwijderd/geanonimiseerd
  - locked/unpaid dossiers krijgen reminders en worden na retention verwijderd/geanonimiseerd
  - paid/exported exports blijven reproduceerbaar vanuit `dossier_exports`
  - storage cleanup verwijdert alleen non-preserved files
  - handmatige proof bestaat via `scripts/tools/retention-storage-cleanup.mjs`
  - cleanup worker probeert functionele system events te schrijven:
    - `dossier_runtime_cleanup_applied`
    - `dossier_runtime_cleanup_failed`
  - DONE: permanente cleanup audit-log richting gekozen en gebouwd als privacy-hard tombstone table zonder FK naar `dossiers`
  - DONE: failed tombstone path runtime-bewijs geleverd
  - DONE: storage-delete tombstone path runtime-bewijs geleverd
  - DONE: preserved runtime cleanup tombstone path runtime-bewijs geleverd
  - suite bewijst dat preserved export intact blijft na runtime cleanup

- Status: OPEN — P1 MVP cleanup/access recovery
  - dry-run scheduler is DONE
  - reminder-worker apply scheduler proof is DONE and disabled after proof
  - locked/unpaid reminder-worker is gebouwd; day-7/day-10/skipped_no_email/scheduler zijn bewezen
  - retention apply scheduler proof is DONE and disabled after proof
  - active retention apply scheduler blijft OFF tot expliciet live-retention besluit
  - cleanup tombstone model is gebouwd
  - non-preserved draft success-path is bewezen
  - failed tombstone path + recovery-success path zijn bewezen
  - storage-delete tombstone path is bewezen
  - preserved runtime cleanup tombstone path is bewezen
  - tombstone proof-gates zijn groen



### 8) Docs hygiene: contradictions en dubbele waarheid actief blijven opruimen
- Context:
  - core docs bevatten nog geregeld:
    - dubbele statusregels
    - oude statusdatums
    - historische tekst die te veel op CURRENT waarheid lijkt
- DoD:
  - bij elke inhoudelijke werkdag:
    - 00_GLOBAL
    - 01_SYSTEM_MAP
    - 03_CHANGELOG_APPEND_ONLY
    - 04_TODO
    worden op contradicties gecontroleerd
  - dubbele regels, dubbele assets-lijsten en verouderde CURRENT-claims worden direct opgeschoond
  - append-only blijft append-only; CURRENT docs blijven daadwerkelijk CURRENT
- Status: OPEN

### 8b) Cron/job inventory eindcheck vóór MVP launch

- Context:
  - Lifecycle automation staat nu dagelijks aan richting MVP:
    - retention dry-run
    - retention apply
    - locked/unpaid reminder dry-run
    - locked/unpaid reminder apply
  - Tijdens proof zijn meerdere tijdelijke cronjobs aangemaakt en weer verwijderd.
  - Voor launch moet één keer hard worden gecontroleerd welke jobs actief zijn en of frequenties nog logisch zijn.

- Open restdoel:
  - vlak vóór MVP launch één cron/job inventory uitvoeren
  - controleren of alleen bedoelde jobs actief zijn
  - beoordelen of frequenties/batch limits nog passend zijn

- DoD:
  - SQL inventory vastgelegd van:
    - `cron.job`
    - recente `cron.job_run_details`
    - recente `net._http_response`
  - bevestigd dat geen proof-only jobs actief zijn
  - bevestigd dat geen hourly lifecycle jobs actief zijn tenzij bewust gewenst
  - bevestigd dat apply-jobs alleen deze bedoelde muterende lifecycle-jobs zijn:
    - `enval-retention-worker-apply-daily`
    - `enval-locked-unpaid-reminder-worker-apply-daily`
  - optimalisatiebesluit vastgelegd:
    - frequenties houden
    - frequenties aanpassen
    - of bepaalde jobs tijdelijk uitschakelen

- Status: OPEN — finale MVP launch check

### 9) MID final-claim regressiewacht

- Context:
  - `mid_number` is canonical in core flow.
  - Serial uniqueness is losgelaten als harde systeemaanname.
  - Cross-dossier runtime duplicate MID is toegestaan.
  - Final claim enforcement gebeurt via `dossier_exports.claim_year` + `dossier_exports.claimed_mid_numbers`.
  - Duplicate `MID + claim_year` wordt bij export geblokkeerd.
  - Same-dossier duplicate MID blijft een runtime datakwaliteitsreject.

- Reeds bewezen:
  - runtime duplicate MID tussen dossiers kan worden opgebouwd
  - eerste preserved export claimt MID + claim_year
  - tweede export met dezelfde MID + claim_year geeft HTTP 409
  - reject audit:
    - event_type `dossier_export_rejected`
    - stage `final_mid_claim`
    - reason `mid_already_claimed_for_claim_year`
  - geen extra `dossier_exports` row bij conflict

- Open restdoel:
  - regressievrij houden bij wijzigingen aan:
    - `api-dossier-charger-save`
    - `api-dossier-export`
    - `scripts/tests/08_export_contract.sh`
    - `dossier_exports` schema

- DoD:
  - geen `meter_id` references meer in core flow
  - geen documentatie die serial uniqueness als harde waarheid presenteert
  - duplicate yearly MID claim test blijft groen
  - analysis-/matchingdocs blijven onderscheid maken tussen:
    - MID als leidende identifier/final claim
    - serial als aanvullende observatie/check

- Status: OPEN als regressiewacht, niet meer als basisimplementatie


### 10) Positionering consistent houden in product & copy
- DoD:
  - geen compliance-claims in UI
  - geen verificatieclaims
  - geen certificeringsclaims
  - Inboeker ≠ Enval expliciet zichtbaar
- Status: OPEN (doorlopend)

### 11) SEO artifacts live zetten / verifiëren
- Waarom:
  - duplicate content voorkomen
  - Google index alleen canoniek houden
- DoD:
  - `https://www.enval.nl/robots.txt` bereikbaar (200) en bevat sitemap-verwijzing
  - `https://www.enval.nl/sitemap.xml` bereikbaar (200) en valide XML
  - `aanmelden_real.html` bevat `<meta name="robots" content="noindex, nofollow">` zolang die bestaat
  - sitemap bevat alleen canonieke publieke pagina’s
  - live check bevestigd via curl/view-source
- Status: OPEN totdat live geverifieerd

---

## P1.5 / Phase-2 (open risico’s)

### 11) PDF parser → verify end-to-end wiring afronden
- Context:
  - `api-dossier-verify` accepteert nu `client_verify_payload`
  - verify is ontkoppeld van inline PDF/image parsing
  - `assets/js/analyse/analyse_verify_payload.js` bestaat
  - browser-side PDF parserresultaten worden nu in de normale dossierflow geregistreerd en meegestuurd naar verify
- Open DoD:
  - regressie compact houden na eerstvolgende dossier-UI wijziging
  - bevestigen dat PDF facturen zonder handmatige bridge nog steeds echte observed payload naar verify sturen
  - fallback naar placeholder blijft alleen bestaan bij echte missende parseroutput
- Status: DONE voor MVP PDF-factuurroute; regressiewacht bij volgende dossier/document-UI wijziging

### 11b) Analysis component status als CURRENT truth in docs vastzetten
- Context:
  - runtime-code, proof-scripts en oudere analyse-docs lopen deels door elkaar
  - daardoor ontstaat verwarring tussen:
    - actieve runtime-lanes
    - stubbed onderdelen
    - lokale proof-/referentielagen
    - bewust uitgestelde foto-analysis
- Open DoD:
  - `01_SYSTEM_MAP.md` bevat een expliciete analysis component status-matrix
  - per onderdeel is zichtbaar:
    - locatie/runtime
    - current state
    - canonieke rol
    - next action
  - `00_GLOBAL.md` bevat geen verouderde CURRENT claims meer over server-side canonieke invoice-image runtime
  - `11_ANALYSE_PLAN.md` blijft DRAFT en wordt niet meer gelezen als current source-of-truth
- Status: OPEN

### 11c) Upload/persist flow expliciet aligned houden op verify-richting
- Context:
  - huidige documentflow blijft `upload-url` → PUT → `upload-confirm`
  - verify-richting gebruikt nu parser/worker observed payload als aanvullende input
  - extractie moet zo licht en goedkoop mogelijk blijven:
    - PDF client-side
    - image via lokale/interne worker
  - verify blijft compare/write laag en niet de zware extractieruntime
- Harde ontwerpregel:
  - `upload-confirm` blijft de canonieke ankerstap voor documenttruth
  - analysis mag niet canoniek worden op andere bytes dan de bytes die uiteindelijk als `confirmed` dossierdocument gelden
- Open DoD:
  - docs expliciet aligned op:
    - confirmed documents zijn source-of-truth
    - observed payload is aanvullend, niet vervangend
  - verify consumeert payload die gekoppeld is aan actuele confirmed document rows
  - submit/review/export steunen niet op ongeconfirmde parser/worker bytes
  - geen herintroductie van zware server-side extractie in verify
- Status: OPEN

### 11d) Volledige factuur-regressiematrix opnieuw draaien zodra analysis-flow stabiel staat
- Context:
  - de huidige runtimebewijzen zijn vooral gebaseerd op perfecte of relatief schone voorbeelden
  - de browser-PDF lane is nu weer end-to-end werkend
  - MVP-besluit 2026-05-17:
    - publieke factuurinput wordt PDF-only
    - JPG/PNG facturen worden niet ondersteund vóór MVP
    - image invoice lane blijft post-MVP totdat deze opnieuw bewezen is
  - juist daardoor ontstaat regressierisico op moeilijkere varianten:
    - mindere kwaliteit
    - minimale info
    - verkeerde waarde in één veld
    - chaos-layout
    - multi-page
- Open DoD:
  - na stabilisatie van de analysis-flow de volledige factuurmatrix opnieuw draaien
  - minimaal opnieuw beoordelen:
    - clean baseline
    - minimal PDF
    - single-field negatieve varianten
    - chaos-layout
    - multi-page
    - multi-page chaos
  - per variant expliciet vastleggen:
    - parser observed fields
    - verify charger-resultaten
    - afwijking t.o.v. verwachte matrix
  - regressies documenteren in changelog en matrix waar nodig aanscherpen
- Status: OPEN

### 12a) Foto analysis v1 uitgesteld tot representatieve laadpaalfoto-dataset bestaat
- Context:
  - huidige beschikbare slechte voorbeelden gaan vooral over facturen, niet over laadpalen
  - foto-analysis zonder echte laadpaalfoto-set is nu schijnvoortgang
  - CURRENT skeleton (`not_checked`) is daarom correct gedrag
- DoD:
  - pas starten nadat een bruikbare laadpaalfoto-dataset bestaat
  - dataset moet minimaal voorbeelden bevatten van:
    - volledig laadpunt zichtbaar
    - merk/model zichtbaar
    - serial/MID label zichtbaar of juist niet zichtbaar
    - realistische slechte kwaliteit / hoek / licht / blur
  - tot die tijd:
    - `foto_laadpunt` blijft skeleton
    - verify-run log moet dit expliciet zichtbaar houden
    - geen geforceerde extractie of pseudo-zekerheid
- Status: POST-MVP / PHASE-2 — niet MVP-blocking; foto laadpunt blijft optioneel en niet-blokkerend

### 12b) Multi-document support per laadpaal expliciet uitgesteld houden
- Context:
  - CURRENT MVP ondersteunt per laadpaal slechts:
    - 1 factuur
    - 1 foto laadpunt
  - MVP requiredness:
    - 1 PDF-factuur per laadpaal is verplicht
    - foto laadpunt is optioneel / niet-blokkerend
  - UI is daar nu bewust strak op aangepast
- DoD:
  - toekomstig ontwerp vastleggen voor:
    - meerdere facturen per laadpaal
    - meerdere foto’s per laadpaal
    - volgorde / primary document semantics
    - analysis-bronkeuze wanneer meerdere documenten van hetzelfde type bestaan
  - pas daarna UI en backend uitbreiden
- Status: OPEN

### 13) Analysis source-model guardrail expliciet vastleggen
- Context:
  - `11_ANALYSE_PLAN.md` maakt nu hard onderscheid tussen:
    - declared
    - observed
    - evaluated
  - toekomstige remote observed bronnen mogen Analysis v1 niet blokkeren
- DoD:
  - analysis-model expliciet voorbereid op bronsoorten:
    - `customer_declared`
    - `document_observed`
    - `remote_observed`
    - `system_evaluated`
  - bevestigd dat v1 schema en exportcontract hiervoor uitbreidbaar zijn zonder herbouw
  - geen implementatie in v1
- Status: OPEN

### 14) PDOK ambiguity zonder suffix
- DoD:
  - als meerdere candidates → suffix verplicht of `verified=false` + audit ambiguous
  - geen save bij onopgeloste ambiguity
- Status: OPEN

### 15) Upload-confirm performance redesign / deferred verificatie
- DoD:
  - alternatief verify-ontwerp + besluit + implementatieplan
  - expliciet auditcontract voor waar sha256-verificatie gebeurt:
    - `verification_mode` + `verified_at_gate`
    - of aparte audit events voor gate-verificatie
  - audit-tests bewijzen:
    - unverified docs blokkeren export/download
    - gate-verificatie schrijft audit event (success + reject)
- Status: OPEN

### 16a) Orphaned storage reconciler
- DoD:
  - job/edge function die storage failures opnieuw probeert op basis van audit events
- Status: OPEN

### 16b) Storage lifecycle expliciet scheiden: runtime-only vs preserved/source-evidence storage

- Context:
  - Supabase Storage bucket `enval-dossiers` bevat CURRENT zowel:
    - runtime uploadobjecten tijdens dossieropbouw
    - preserved/source-evidence objecten waar een preserved export naar verwijst
  - Preserved cleanup is bewezen:
    - preserved storage paths blijven beschermd
    - `deletable_storage_path_count = 0`
    - `storage_deleted = 0`
  - Non-preserved storage-delete path is bewezen, maar het lifecycle-model moet nog explicieter worden gemaakt zodat runtime-only storage en preserved/source-evidence storage niet semantisch door elkaar lopen.

- Open restdoel:
  - expliciet vastleggen en/of technisch afdwingen welke storage objects:
    - runtime-only zijn en onder 7/14 dagen retention vallen
    - preserved/source-evidence zijn en niet door cleanup verwijderd mogen worden
  - bepalen of dit voldoende blijft via metadata/path/reference checks, of dat bucket-/prefixscheiding nodig is

- DoD:
  - storage lifecycle model is expliciet vastgelegd:
    - runtime-only storage
    - preserved/source-evidence storage
  - cleanup gebruikt aantoonbaar alleen `deletable_storage_paths`
  - preserved referenced objects blijven beschermd op basis van `dossier_exports`
  - voor minimaal één non-preserved cleanup is object deletion hard bewezen:
    - object key vooraf vastgelegd
    - object na cleanup niet meer opvraagbaar / bestaat niet meer
    - bewijs vastgelegd zonder secrets/signatures te lekken
  - voor minimaal één preserved cleanup is bewezen:
    - preserved object key vooraf vastgelegd
    - object na runtime cleanup nog aanwezig/bereikbaar
  - besluit vastgelegd:
    - één bucket met harde path/reference discipline blijft voldoende
    - of fysieke scheiding via aparte prefixes/buckets wordt later ingevoerd

- Status: POST-MVP HARDENING — expliciet bewaren als ontwerp-/cleanup-risico, niet MVP-blocking zolang preserved path protection groen blijft

### 17) Export contract regressiewacht + resterende edge-case beslissing
- Context:
  - export reject in de fresh-only suite is bewezen:
    - not-locked dossier → HTTP 409
    - audit `dossier_export_rejected`
    - reason `not_locked`
  - locked export success is nu ook bewezen in de fresh-only suite:
    - canonical address save/verify
    - consents save
    - synthetic invoice observed payload
    - `api-dossier-verify`
    - `api-dossier-evaluate(finalize=true)`
    - locked export → HTTP 200
    - audit `dossier_export_generated`
  - export artifact shape wordt gecontroleerd:
    - `schema_version = enval-dossier-export.v5`
    - 8 confirmed documents
    - analysis blocks aanwezig
    - `analysis_run.run_id` aanwezig
  - cleanup is na export lock-aware:
    - geen runtime deletes na locked/in_review
    - retained locked dossierdata is bewust correct

- Reeds bewezen:
  - export reject wanneer dossier niet locked is
  - locked export success
  - load-bearing export artifact shape
  - export success audit event
  - cleanup retained-state na locked export

- Open restdoel:
  - expliciet beslissen of er nog een aparte export rejectcase nodig is voor:
    - locked maar incomplete confirmed-doc set
  - of dat deze gate uitsluitend in evaluate/finalize hoort en export alleen locked+confirmed snapshot exporteert

- DoD:
  - besluit vastleggen:
    - aparte export rejectcase bouwen/testen
    - of expliciet documenteren dat incomplete-doc gating bij evaluate/finalize hoort
  - bij toekomstige exportwijzigingen fresh-only suite opnieuw groen draaien

- Status: OPEN als regressiewacht / edge-case besluit, niet meer als basis exportcontract


### 18) Email verification assumption (audit risk)
- Context:
  - huidig gedrag: `email_verified_at` gezet op link-click
  - dit bewijst geen mailbox-control, alleen possession of link
- DoD:
  - expliciet blijven labelen zolang CURRENT gedrag actief is
  - later:
    - óf semantiek aanpassen (bijv. `email_link_clicked_at`)
    - óf verificatie upgraden (OTP / single-use / TTL)
- Status: OPEN

### 19) Installer flows definitief deprecaten
- Context:
  - `installer_signup` en `installer_to_customer` zijn nog restmatig aanwezig
  - backend retourneert 410
- DoD:
  - beslis: behouden, beperken of volledig deprecaten
  - documenteer eindstate + migratiepad
  - verwijder legacy bindings zodat self-serve journey single-path blijft (`ev_direct` + contact)
- Status: OPEN

### 20) Abuse controls
- DoD:
  - rate limit / abuse detection op `api-lead-submit` en contactflow
  - basic throttling + logging + minimale blokkade
- Status: OPEN

### Phase 2 

### 21) Invoice image precheck warning-state server-persistent maken (alleen indien later nodig)
- Context:
  - browser-side invoice image precheck is CURRENT functioneel gehardend
  - accepted-with-warning uploads blijven nu client-side persistent zichtbaar in de documentkaart-UI:
    - gele/oranje sectietoon
    - `warning` badge
    - warning-tekst onder bestandsnaam
  - state wordt CURRENT bewust client-side in `sessionStorage` bijgehouden en opgeschoond bij delete/reload
- Open restdoel:
  - alleen oppakken als later blijkt dat warning-state ook cross-session / cross-device persistent moet zijn
- DoD:
  - expliciete productbeslissing of warning-state:
    - puur client-side UX-state blijft
    - of server-side documentmetadata wordt
  - bij server-side variant:
    - warning-source en warning-tekst blijven uit canonieke precheck-summary komen
    - geen tweede messaging-laag
    - geen verwarring met audit-truth / analysis-truth
- Status: OPEN (lage prioriteit / alleen bij echte productbehoefte)

# EINDE 04_TODO.md