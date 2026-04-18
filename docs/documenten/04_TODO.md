# 04_TODO.md (CURRENT)

Statusdatum: 2026-03-23  
Prioriteit: audit-first.  
Regel: alleen open items; afgerond → naar changelog.

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
- Status: OPEN

### 2) api-lead-submit: eligibility gate ordering harden + regressie-test
- Context:
  - Behavior is bewezen: pre-dossier reject (NL/MID) + `intake_audit_events` + idempotency replay.
- DoD:
  - Guardrails in code expliciet en vroeg:
    - eligibility checks vóór elke DB write (lead/dossier/mail)
    - `intake_audit_events` write is fail-open maar best-effort
  - Regressie-test aanwezig voor:
    - NL=false → 400 + `intake_audit_events` row + idempotency replay
    - MID=false → 400 + `intake_audit_events` row + idempotency replay
    - OK → lead + dossier + mail
- Status: OPEN

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
- Status: OPEN

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
- Status: OPEN

### 7) Tombstone / archive lifecycle voor audit-gebonden testdossiers
- Context:
  - fresh tests ruimen mutable child rows op, maar retained dossier/outbound/audit shell blijft bestaan
  - hard delete van dossier faalt CURRENT by design door audit immutability
- DoD:
  - kies lifecycle-semantiek voor retained dossiers:
    - `tombstone` / `archived` / `test_retained`
  - leg benodigde velden vast (bijv. `deleted_at`, `deleted_reason`, `retention_class`, `status`)
  - bevestig dat audit trail intact blijft
  - bevestig dat exports/reads zich correct gedragen voor tombstoned dossiers
- Status: OPEN


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

### 9) MID leidend maken in hele dossierketen
- Context:
  - CURRENT veldnaam is `mid_number`
  - serial uniqueness is losgelaten als harde systeemaanname
  - productmatig is MID nu leidend
- DoD:
  - `mid_number` is overal canonical in core flow
  - geen `meter_id` references meer in core flow
  - geen documentatie meer die serial uniqueness als harde waarheid presenteert
  - analyse-/matchingdocs maken expliciet onderscheid tussen:
    - MID als leidende identifier
    - serial als aanvullende observatie/check
- Status: OPEN

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
- Status: OPEN

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
- Status: OPEN

### 12b) Multi-document support per laadpaal expliciet uitgesteld houden
- Context:
  - CURRENT MVP ondersteunt per laadpaal slechts:
    - 1 factuur
    - 1 foto laadpunt
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

### 16b) Storage object cleanup proof sluiten
- Context:
  - DB cleanup proof is nu geleverd:
    - `dossier_documents` rows verdwijnen
    - docs per charger gaan naar 0
  - storage object deletion is nog niet afzonderlijk runtime-bewezen als hard bewijsstap
- DoD:
  - voor happy upload run minimaal 1 storage object key/pad vooraf vastleggen
  - na cleanup bevestigen dat object niet meer opvraagbaar is / niet meer bestaat
  - bewijs vastleggen zonder secrets/signatures te lekken
- Status: OPEN

### 17) Export gate contract tests
- Context:
  - upload/runtime suite is nu sterk genoeg
  - export is productkritische eindgate en nog onvoldoende contractueel bewezen in fresh flow
- DoD:
  - test bewijst:
    - export reject wanneer dossier niet locked is
    - export reject wanneer niet alle vereiste docs confirmed zijn
    - export success wanneer dossier locked is en confirmed-doc set klopt
  - audit events voor export success + reject bevestigd
  - output-contract van export artifact vastgelegd
- Status: OPEN

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

### 21) Invoice image precheck UX persistence
  - Bij client-side warning op factuurafbeelding: uploadvak visueel oranje laten staan
  - Rechtsboven een info-icoon tonen
  - Hover / tooltip met exacte warningtekst tonen
  - Warning mag niet blokkeren; alleen persistent zichtbaar maken

# EINDE 04_TODO.md