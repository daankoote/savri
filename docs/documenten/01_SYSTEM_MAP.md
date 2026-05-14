# 01_SYSTEM_MAP.md (current state, rewrite-ok)

# ENVAL — System Map (CURRENT)

Statusdatum: 2026-05-10
Repo root: /Users/daankoote/dev/enval  
Branch context: feature/dev (main = pilot index)

---

## System Map — Strategische Context (2026-03-02)

Deze System Map representeert uitsluitend de infrastructuurlaag.

Enval bevat:
- Geen ERE-berekeningen
- Geen vergoedingslogica
- Geen compliance-interpretatie
- Geen certificeringsclaims
- Geen downstream economische sturing

Alle businesslogica van inboeken, verificeren of certificeren ligt expliciet buiten dit systeem.

De System Map moet technisch neutraal blijven zodat meerdere inboekers hierop kunnen draaien zonder belangenverstrengeling.

---

## 1) Frontend (static)

### Pages
- ./aanmelden.html
- ./dossier.html
- ./hoe-het-werkt.html
- ./index.html
- ./mandaat.html
- ./pricing.html
- ./privacyverklaring.html
- ./proces.html (OUTDATED; bestaat niet meer — gebruik ./hoe-het-werkt.html)
- ./regelgeving.html
- ./voorwaarden.html

## Frontend SEO artifacts (CURRENT)

Publiek / canoniek (sitemap-waardig):
- index.html
- aanmelden.html
- dossier.html (alleen als het publiek is; als token-required → niet in sitemap)
- hoe-het-werkt.html
- pricing.html
- regelgeving.html
- voorwaarden.html
- privacyverklaring.html

Niet-canoniek / tijdelijk (noindex, niet in sitemap):
- aanmelden_real.html (dev/overgang — later hernoemen naar aanmelden.html, daarna verwijderen)

Bestanden (root):
- /robots.txt (verwijst naar sitemap, disallow tijdelijke routes)
- /sitemap.xml (alleen canonieke pagina’s)

Assets (SEO):
- /assets/img/og-enval.jpg (OG/Twitter image)
- /favicon.ico + /assets/img/favicon-32.png + /assets/img/favicon-16.png

Canonical policy:
- Canonical URL’s wijzen altijd naar https://www.enval.nl/<paginanaam>.html.
- Nooit canonical naar een dev-alias.

### Assets / scripts
- ./assets/css/style.css
- ./assets/js/config.runtime.js (GENERATED – DO NOT COMMIT)
- ./assets/js/config.js (no-secrets)
- ./assets/js/script.js
- ./assets/js/api.js (frontend shared helpers: url params, session token storage, idempotent apiPost wrapper)
- ./assets/js/analyse/analyse_image_step_1_constants.js
- ./assets/js/analyse/analyse_image_step_1_precheck.js
- ./assets/js/analyse/analyse_image_step_1_upload.js
- ./assets/js/analyse/analyse_verify_payload.js
- ./assets/js/pages/dossier.js
---




## 2) Frontend runtime-config model (2026-02-19)

### Script load order (hard)
Voor dossier-flow pages:
1) config.runtime.js
2) config.js
3) api.js
4) page script (script.js of pages/dossier.js)

Rationale:
- api.js gebruikt fetch en localStorage; config.js levert headers/config.


### config.runtime.js
- Generated per environment
- Bevat:
  - SUPABASE_URL
  - SUPABASE_ANON_KEY
  - API_BASE

### config.js
- Leest `window.ENVAL`
- Geen keys hardcoded
- edgeHeaders(extraHeaders) merge:
  - Content-Type
  - apikey
  - Authorization
  - + extra: Idempotency-Key, X-Request-Id

**Implicatie:** Edge endpoints zijn publiek aanroepbaar (anon).  
➡️ Alle security hoort in edge: auth/locks/abuse-controls/validatie.

### Environment model

Lokaal:
- `.env.local`
- Generator: scripts/gen-runtime.sh

Productie:
- Netlify Environment Variables
- netlify.toml build injectie

### Belangrijk
- config.runtime.js moet vóór config.js geladen worden.
- Anon key zichtbaar in browser = correct gedrag.
- Service role key mag nooit zichtbaar zijn.

Status: bewezen via console check (window.ENVAL).

### 2.2 script.js
- Form multiplexer: `api-lead-submit` (flows: ev_direct, installer_to_customer, installer_signup, contact)
- Anti double submit: `lockSubmit`

### Intake eligibility enforcement (CURRENT)

Flow: `ev_direct`

Server-side enforced vóór enige DB write:

- in_nl must be true
- has_mid must be true

Bij fail:
- intake_audit_events insert (stage=eligibility)
- HTTP 400
- Geen lead insert
- Geen dossier create
- Geen mail queue

Dit voorkomt “dead dossiers” en houdt intake rejects los van dossier lifecycle.

- Conversie: aanmelden prefill via query params (`charger_count`, `own_premises`) vanuit index eligibility gate (2026-02-19).

### 2.3 dossier.js (wizard)
Entry: `./dossier.html?d=<uuid>&t=<token>`
- `reloadAll()` → `api-dossier-get`
- “write → reloadAll()” patroon

#### Auth boundary (CURRENT, bevestigd via code)

Entry URL blijft:
- `./dossier.html?d=<uuid>&t=<token>`

**Start-auth (link-token `t`)**
- `t` is een one-time, expirable link-token.
- `t` wordt uitsluitend gebruikt in `api-dossier-get` voor token→session exchange.
- Na succesvolle exchange wordt `t` uit de URL verwijderd.

**Runtime-auth (session-token)**
- Na exchange gebruikt de wizard uitsluitend:
  - body: `{ dossier_id, session_token, ... }`
- Session-token wordt per dossier opgeslagen in localStorage onder:
  - `enval_session_token:<dossier_id>`

**Frontend source of truth**
- `assets/js/api.js` levert:
  - `getDossierIdFromUrl()`
  - `getLinkTokenFromUrl()`
  - `getSessionToken(dossierId)`
  - `setSessionToken(dossierId, tok)`
  - `clearSessionToken(dossierId)`
  - `cleanupLegacySessionKey()`
  - `newIdempotencyKey()`
  - `apiPost()`

**Analyse client helperlaag (CURRENT)**
- `assets/js/analyse/analyse_verify_payload.js` is toegevoegd als aparte orchestrationlaag
- Doel:
  - current dossier/charger/document snapshot synchroniseren
  - upload metadata registreren
  - client observed invoice results registreren
  - verify body opbouwen buiten `assets/js/pages/dossier.js`
  ### Analysis component status (CURRENT)

Doel:
- één technische waarheid vastleggen over welke analyse-onderdelen:
  - actief zijn
  - stubbed zijn
  - alleen proof/dev tooling zijn
  - of bewust uitgesteld zijn

| Onderdeel | Locatie/runtime | Bestand(en) | CURRENT status | Canonieke rol | Opmerking / next action |
|---|---|---|---|---|---|
| Factuur image precheck / uploadvoorbereiding | browser/client | `assets/js/analyse/analyse_image_step_1_constants.js`, `assets/js/analyse/analyse_image_step_1_precheck.js`, `assets/js/analyse/analyse_image_step_1_upload.js` | werkend en runtime-bewezen | actief | CURRENT rol = preflight / explainable quality gate / compressie. Reject-lane is beperkt tot technische onbruikbaarheid (decode/bytes/extreem lage resolutie). Content-/ink-/zone-/sharpness-metrieken blijven wel beschikbaar in `rule_results`, maar zijn CURRENT observability-only en niet user-facing beslissend. |
| Factuur PDF parser | browser/client | `assets/js/analyse/analyse_invoice_parser.js` (`parseInvoicePdfFile`) | werkend | actief | CURRENT primaire parserlane voor PDF facturen |
| Factuur image parser (browser) | browser/client | n.v.t. | verwijderd | geen | browser-side image parsing is niet langer onderdeel van de actieve of legacy runtime; image facturen lopen CURRENT uitsluitend via de lokale/interne worker-lane |
| Verify payload orchestration | browser/client | `assets/js/analyse/analyse_verify_payload.js` | werkend voor PDF-lane + bewezen dev-handoff voor image-lane | actief | payloadcontract bestaat; browser-side PDF parseroutput wordt in de normale dossierflow geregistreerd en meegestuurd naar verify; image worker-output is nu runtime-bewezen op dezelfde contractvorm via `scripts/tools/bridge-image-worker-verify.py`, inclusief mixed image/PDF verify-run |
| Verify orchestration / compare / writes | server / Supabase Edge | `supabase/functions/api-dossier-verify/index.ts` | werkend | canoniek | verify blijft canonieke evaluator/writer; geen inline factuurparsing meer; runtime-bewezen dat worker-afgeleide image observed payload zonder backend-herbouw geconsumeerd kan worden |
| Standalone invoice image worker | lokaal / Python buiten Edge | `scripts/analysis_worker/ocr_extract.py`, `scripts/analysis_worker/extract_invoice_image.py` | werkend / actieve image-lane | actief voor image facturen | CURRENT actieve extractieroute voor image facturen; levert observed fields buiten browser/Edge; reproduceerbare dev-handoff naar verify bestaat nu via `scripts/tools/bridge-image-worker-verify.py` |
| Standalone invoice PDF worker | lokaal / Python buiten Edge | `scripts/analysis_worker/pdf_extract.py` | werkend als proof-tool | proof-loop / referentie | nuttig voor regressie/proof; browser PDF-lane blijft primair |
| Compare-laag image/pdf | lokaal / Python buiten Edge | `scripts/analysis_worker/compare_invoice_results_image.py`, `scripts/analysis_worker/compare_invoice_results_pdf.py` | werkend | proof-loop | bedoeld voor parserkwaliteit en regressiecontrole, niet voor productie-runtime |
| Multipage image aggregation | lokaal / Python buiten Edge | `scripts/analysis_worker/aggregate_invoice_image_multipage.py` | werkend als proof-tool | proof-loop / later integreren | pas relevant nadat image integratie verder wordt gehard |
| Foto laadpunt analysis | n.v.t. / skeleton | verify + future parserlaag | uitgesteld | nog niet actief | CURRENT correct gedrag = `not_checked` / skeleton tot representatieve dataset bestaat |
| “Charger PDF parser” als aparte lane | n.v.t. | n.v.t. | niet bestaand / niet gewenst | geen | factuur-PDF blijft de relevante PDF-lane; geen kunstmatige extra parsercategorie introduceren |

Harde CURRENT waarheid:
- PDF facturen:
  - parser = client-side extractieruntime
  - verify = server-side evaluator/writer
- image facturen:
  - extractie = lokale/interne OCR worker
  - verify = server-side evaluator/writer
- browser-side image OCR/Tesseract.js is geprobeerd maar niet robuust genoeg gebleken en is daarom verlaten als primaire route
- `foto_laadpunt` blijft bewust uitgesteld

Aanvullende CURRENT nuance (2026-04-19):
- voor invoice image precheck bestaat nu een headless browser batch-runner:
  - `scripts/tools/invoice-image-precheck.mjs`
- Doel:
  - exact dezelfde browser-precheck-code terminal-runbaar en reproduceerbaar testen
  - geen drift tussen UI-lane en regressietooling
- Bewezen batch-resultaat op `docs/facturen/facturen_image`:
  - total: 33
  - allow: 23
  - warn: 5
  - reject: 5
  - rare invoices: 3/3 reject

**Evaluate-flow (CURRENT frontend orchestration)**
- stap 1:
  - `api-dossier-evaluate(finalize=false, evaluation_mode="core")`
- stap 2:
  - `api-dossier-verify(mode="refresh", client_verify_payload=...)`
- stap 3:
  - `api-dossier-evaluate(finalize=false, evaluation_mode="full")`
- stap 4:
  - `api-dossier-evaluate(finalize=true, evaluation_mode="full")`

Belangrijke CURRENT waarheid:
- `api-dossier-verify` doet geen inline PDF/image parsing meer
- verify consumeert client-side observed payload voor facturen
- zolang client observed payload voor een document ontbreekt,
  degradeert verify gecontroleerd naar placeholder/inconclusive semantics

Locked UX wanneer:
- `dossier.locked_at != null`
- of `status IN ('in_review','ready_for_booking')`

Dev unlock UX (CURRENT, alleen development-context):
- frontend ondersteunt `api-dossier-dev-unlock`
- knop is alleen zichtbaar wanneer dev unlock expliciet is toegestaan
- doel:
  - locked dossier terugzetten naar editable state in DEV
  - daarna opnieuw precheck/finalize uitvoeren
- dit is geen productiegedrag en geen lifecycle-shortcut voor live dossiers

Client-side gating:
- `precheckOk === true`
- `dirtySincePrecheck === false`

Invariant:
- elke dossiermutatie invalidate de precheck client-side:
  - access save
  - address save
  - charger save/delete
  - document upload/delete
  - consents save

UI-gedrag:
- “Dossier indienen” blijft verborgen tot succesvolle precheck zonder latere mutaties.
- locked dossiers tonen export; analysis kan daarna read-only worden geladen/getoond.

### Uploadgedrag (CURRENT frontend)
- Foto’s (`foto_laadpunt`) worden client-side geoptimaliseerd vóór upload.
- Originele bestanden tot 25MB toegestaan vóór verwerking.
- Finale upload heeft een frontend hard cap van 15MB.
- Wizard stuurt uitsluitend finale bytes + `client_transform` metadata naar Edge.
- Audit-hash (`file_sha256`) wordt client-side berekend over de finale bytes.

Belangrijke CURRENT nuance:
- deze uploadflow is nog de bestaande storage-first route
- maar dat is niet langer de gewenste canonieke analysis-richting
- de nieuwe canonieke analysis-richting is:
  - eerst client parser observed payload
  - daarna server-side verify
- verdere uitlijning van persist/storage op die verify-richting is nog OPEN

### Document UI contract (CURRENT, 2026-03-24)
- Stap 4 gebruikt geen centrale uploadform meer.
- Upload gebeurt direct in de documentvakken binnen de laadpaalkaarten.
- Per laadpaal bestaan in de UI exact 2 documentvakken:
  - `factuur`
  - `foto_laadpunt`
- CURRENT MVP-beperking:
  - maximaal 1 factuur per laadpaal
  - maximaal 1 foto laadpunt per laadpaal
- Zodra een document van het betreffende type al bestaat, wordt het uploadslot voor dat type niet meer getoond.
- Delete maakt het type weer vrij, waarna het uploadslot opnieuw verschijnt.

Belangrijke CURRENT nuance:
- documentstatus `issued` is een echte recovery-state:
  - upload gestart
  - nog niet bevestigd
- zolang een `issued` documentrow bestaat voor hetzelfde type / dezelfde laadpaal,
  blokkeert `api-dossier-upload-url` terecht een nieuwe upload-url
- frontend moet `issued` daarom expliciet zichtbaar en herstelbaar tonen

Belangrijk:
- Dit is een bewuste MVP-beperking van de UI en huidige flow.
- Multi-document support per type is uitgesteld en is geen CURRENT contract.

## 3) Backend platform
- Supabase DB + Storage
- Edge functions (Supabase Functions)
- Resend voor transactional mails
- Google Workspace voor inkomend/human mail
- Netlify voor hosting/domains

### Backend shared helpers (CURRENT)
- `supabase/functions/_shared/customer_auth.ts`
  - gedeelde helper voor dossier session-auth
  - levert:
    - `requireCustomerSession(...)`
    - `actorRefForSession(...)`
    - `scopedSessionIdemKey(...)`

- `supabase/functions/_shared/analysis.ts`
  - gedeelde helper voor Analysis v1
  - levert:
    - document-level analysis rows
    - charger-level analysis rows
    - dossier-level analysis summary row
    - invoice compare-/shape helpers
    - status/shape helpers voor supported analysis-documents

Belangrijke CURRENT wijziging:
- `api-dossier-verify` gebruikt geen inline parserhelpers meer voor factuur-PDF of factuur-image extractie
- verify consumeert client-side observed invoice payload
- oude server-side parserhelpers horen niet meer bij de canonieke verify-runtime

Lokale parser/proof-loop (CURRENT, buiten Edge runtime):
- `scripts/analysis_worker/ocr_extract.py`
- `scripts/analysis_worker/pdf_extract.py`
- `scripts/analysis_worker/compare_invoice_results_image.py`
- `scripts/analysis_worker/compare_invoice_results_pdf.py`
- `scripts/analysis_worker/aggregate_invoice_image_multipage.py`

Doel:
- parser/compare/aggregation lokaal bewijzen
- verify server-side als compare/write/audit laag houden
- geen mutatie van bestaande dossierdata

## 4) Core DB tables (samenvatting)

### Dossier core
- `dossiers` (status, locked_at, access_token_hash, address fields, charger_count, own_premises, email_verified_at MVP)
- `dossier_chargers` (dossier link; MID leidend; serial_number niet langer als harde globale uniqueness-aanname behandelen)
- MID informatie per laadpaal: `dossier_chargers.mid_number` (CURRENT, NOT NULL; zie Stap 3)
- `dossier_documents` (issued/confirmed, sha256, storage bucket/path, immutability op confirmed)
- `dossier_consents` (append-only, immutable)
- `dossier_checks` (UNIQUE dossier_id+check_code)
- `dossier_audit_events` (append-only audit trail)

### Export preservation layer (CURRENT)

Final-retention laag:

- `dossier_exports`
  - immutable final export artifact
  - bevat volledige export JSON (`export_json`)
  - bevat SHA256-proof over export JSON (`export_sha256`)
  - bevat payment/export status
  - bevat request/actor metadata:
    - `generated_request_id`
    - `generated_by_actor_ref`
  - bevat yearly MID claim metadata:
    - `claim_year`
    - `claimed_mid_numbers`

Lifecycle-principe:
- Runtime-tabellen (`dossiers`, `dossier_chargers`, `dossier_documents`, `dossier_checks`, `dossier_consents`, analysis-tabellen, runtime sessions en runtime audit rows) zijn tijdelijk werkmateriaal totdat export preservation is afgerond.
- Na paid/exported preservation mag runtime data worden opgeschoond.
- `dossier_exports` is de final audit source-of-truth.
- Storage objects waarnaar een preserved export verwijst, mogen niet door cleanup worden verwijderd.
- Niet-preserved storage volgt draft/locked retention.

Retention cleanup helpers:
- `public.enval_retention_cleanup(...)`
  - dry-run en apply helper voor runtime DB cleanup
  - `p_apply=true` vereist expliciet `p_target_dossier_id`
  - mass apply zonder target wordt geweigerd
  - preserved runtime cleanup is toegestaan wanneer export preservation bestaat
  - non-preserved cleanup met nog aanwezige storage wordt geweigerd met:
    - `STORAGE_CLEANUP_REQUIRED_BEFORE_DB_DELETE`

- `public.enval_retention_cleanup_apply_after_storage(...)`
  - apply helper voor runtime DB cleanup nadat storage cleanup exact is bevestigd
  - vereist één expliciet `p_target_dossier_id`
  - vergelijkt expected `deletable_storage_paths` met confirmed deleted storage paths
  - weigert DB cleanup bij mismatch
  - gebruikt dezelfde gecontroleerde DB-owner bypass als retention cleanup

Retention worker:
- `supabase/functions/retention-worker/index.ts`
  - utility Edge Function
  - protected via `RETENTION_WORKER_SECRET`
  - gebruikt header `x-retention-worker-secret`
  - voert retention dry-run en target/batch cleanup uit via service-role
  - verwijdert storage uitsluitend voor `deletable_storage_paths`
  - weigert wanneer deletable paths overlappen met preserved paths
  - roept `enval_retention_cleanup_apply_after_storage(...)` aan na storage cleanup
  - preserved runtime cleanup kan zonder storage-delete worden toegepast wanneer `deletable_storage_paths = []`
  - retention windows staan bovenaan in `RETENTION_CONFIG` en worden doorgegeven aan de DB helpers

Live proof:
- dry-run worker call gaf candidates terug met config `3/7/14` en reminderdagen `3/7/10`
- target apply op preserved dossier verwijderde runtime DB data
- preserved storage bleef beschermd
- `dossier_exports` bleef intact
- dry-run cron is live bewezen via `pg_cron` + `pg_net` + `vault.decrypted_secrets`
- cron job:
  - `enval-retention-worker-dry-run-hourly`
  - schedule `0 * * * *`
  - response HTTP 200
  - `apply=false`
  - `candidate_count=0` op laatste proof-run

Belangrijke grens:
- Er is nog géén retention apply cron.
- Reminder-flow voor locked/unpaid dossiers dag 3/7/10 is nog niet gebouwd.
- Permanente cleanup audit-log oplossing is gekozen als privacy-hard tombstone model:
  - tabel `public.retention_cleanup_events`
  - geen FK naar `dossiers`
  - geen PII
  - geen raw storage paths
  - `dossier_id` blijft alleen als historische referentie
- Non-preserved draft target-apply success tombstone is live bewezen.
- Failed tombstone path is live bewezen via dev-only controlled failure na `started` tombstone insert:
  - tombstone status werd `failed`
  - runtime dossier bleef bestaan
  - DB cleanup werd niet toegepast
  - recovery apply op hetzelfde dossier schreef daarna een nieuwe `success` tombstone
- Storage-delete tombstone path is live bewezen voor een non-preserved draft dossier met 1 confirmed storage object:
  - storage object bestond vóór cleanup
  - dry-run gaf `deletable_storage_path_count = 1`
  - apply gaf `storage_deleted = 1`
  - tombstone gaf `deleted_storage_object_count = 1`
  - runtime dossier + child rows zijn verwijderd
- Preserved cleanup tombstone path blijft nog bewijs-open.

Trigger nuance:
- `public._enval_enforce_document_lifecycle()` bevat een expliciete DB-owner bypass via:
  - `set_config('enval.dev_reset', 'YES', true)`
- Deze bypass is uitsluitend bedoeld voor gecontroleerde retention cleanup, niet voor runtime endpoints.

Final MID claim model:
- Runtime `dossier_chargers.mid_number` is klantinvoer, geen finale claim.
- Cross-dossier duplicate MID is runtime toegestaan.
- Same-dossier duplicate MID blijft een datakwaliteitsreject.
- Definitieve claim gebeurt bij export preservation.
- Claim key:
  - `MID + claim_year`
- `claim_year` is CURRENT het UTC jaar van de export/preservation.
- Duplicate `MID + claim_year` tegen een bestaande non-voided preserved export blokkeert export met HTTP 409.
- Bij duplicate final claim wordt géén nieuwe `dossier_exports` row gemaakt.


### Analysis layer (CURRENT, derived only)
- `dossier_analysis_document`
  - document-level observed / extraction layer
  - unique per `(document_id, analysis_kind, method_version)`
- `dossier_analysis_charger`
  - charger-level evaluated consistency layer
  - bevat analysis-codes zoals:
    - `invoice_address_match`
    - `invoice_brand_match`
    - `invoice_model_match`
    - `invoice_serial_match`
    - `invoice_mid_match`
    - `photo_charger_visible`
    - `photo_brand_match`
    - `photo_model_match`
    - `photo_serial_match`
    - `photo_mid_match`
- `dossier_analysis_summary`
  - dossier-level derived summary
  - overall status:
    - `not_run`
    - `partial_pass`
    - `pass`
    - `review_required`
    - `inconclusive`
    

Belangrijk:
- Analysis is volledig derived
- Analysis doet géén writes naar bestaande dossier core tabellen
- Analysis verandert géén lifecycle / lock / review semantics
 
### MID model (CURRENT)

Self-serve dossiers ondersteunen uitsluitend laadpalen met MID-meter.

Architectuur:
- GEEN dossier-level `has_mid`.
- `leads.has_mid` = intake indicatie.
- Per laadpaal: `dossier_chargers.mid_number` blijft verplicht.
- `api-dossier-charger-save` reject indien `mid_number` ontbreekt.
- Non-MID dossiers worden niet aangemaakt.

Runtime versus final claim:
- Runtime `dossier_chargers.mid_number` is customer-declared input.
- Runtime MID is geen finale claim.
- Cross-dossier duplicate MID is toegestaan in runtime tabellen.
- Same-dossier duplicate MID blijft verboden als datakwaliteitscheck.
- Finale MID-claim gebeurt bij export preservation in `dossier_exports`.
- Final claim key:
  - `MID + claim_year`
- `dossier_exports.claim_year` + `dossier_exports.claimed_mid_numbers` zijn de CURRENT final-claim basis.

Audit/export interpretatie:
- `mid_number` = “customer-declared MID-number”.
- Existence validated.
- Authenticity not verified.
- Final conflict enforcement gebeurt pas bij export preservation tegen bestaande non-voided `dossier_exports`.

### Ops / intake
- `leads`
- `installers`
- `contact_messages`
- `idempotency_keys`
- `outbound_emails`: dossier_id (nullable FK), next_attempt_at (retry scheduling)
- `intake_audit_events`
  - Doel: audit logging voor intake rejects zonder dossier scope (pre-dossier).
  - RLS: enabled
  - Policies: `deny_all` voor anon/auth (defense-in-depth); writes uitsluitend via Edge (service_role).
  - Inspectie: Supabase SQL Editor (geen publieke read via REST).


**Phase-2 uploadstrategie (actueel):**
- `api-dossier-upload-url`:
  - Issues signed upload URL
  - Legt document metadata vast (issued)
  - Doet **geen** bestandsverwerking
- `api-dossier-upload-confirm`:
  - Downloadt finale bytes uit storage
  - Berekent sha256 server-side
  - Vergelijkt met client-aangeleverde hash
  - Zet document op `confirmed` bij match

**Belangrijk:**
- Audit-hash is altijd gebaseerd op **finale bytes**.
- Client-side transformatie vermindert kosten, maar vervangt geen auditverificatie.

**Belangrijk — CURRENT vs Phase-2 geplande variant (deferred verify)**
- CURRENT implementatie (wat nu draait):
  - `api-dossier-upload-confirm` doet server-side download + sha256 verificatie en zet document naar `confirmed` bij match.
  - Audit events gebruiken `verified_server_side=true` in de betekenis: “verify gebeurde in confirm”.
- Phase-2 geplande variant (OPEN, niet geïmplementeerd):
  - `upload-confirm` kan verschuiven naar “ontvangst/metadata bevestigen” (lightweight),
  - en server-side download+sha256 verificatie gebeurt pas bij harde gates (finalize/export/download).
  - Dit vereist óf:
    - nieuwe flags (`verification_mode`, `verified_at_gate`), óf
    - aparte audit events voor gate-verificatie,
    - én expliciete export/download gates die “unverified docs” blokkeren.
- Documentatie-regel:
  - Totdat Phase-2 variant gebouwd is, blijft de CURRENT beschrijving hierboven leidend.


## 5) State machine (dossier)
- incomplete
- ready_for_review
- in_review (locked)
- ready_for_booking (later)

Lock rule (source of truth):
- locked_at != null OR status IN ('in_review','ready_for_booking')

## 6) Edge functions inventory (current)

### Read / bootstrap
- api-dossier-get
  - token→session exchange of session-based dossier read
  - levert dossier + documents + consents + audit + chargers + checks
  - chargers worden CURRENT in stabiele oplopende `created_at` volgorde teruggegeven zodat de frontend vaste laadpaalnummering kan tonen

### Lead + mail
- api-lead-submit
  - writes: leads/installers/dossiers/contact_messages/outbound_emails/idempotency_keys
  - idempotency: header `Idempotency-Key` verplicht
  - legacy kill:
    - flow `installer_signup` → 410
    - flow `installer_to_customer` → 410
  - audit:
    - dossier_created bij dossier create
    - mail_queued (dossier-scoped) wanneer outbound_emails.dossier_id wordt gezet
    - mail_worker_triggered (dossier-scoped, fail-open) bij fast-path invoke



**Intake eligibility gates (CURRENT):**
- `ev_direct` reject (pre-dossier) indien:
  - `in_nl != true` of
  - `has_mid != true`
- Error message: “Dossieropbouw is alleen mogelijk voor laadpalen in Nederland met een MID-meter.”
- Audit: `public.intake_audit_events` (stage=eligibility); gateway rejects blijven off-chain.


### Auth recovery
- api-dossier-login-request
  - doel: nieuwe dossier-link uitgeven bij verlopen/geconsumeerde link-token
  - anti-enumeration: response altijd `{ ok: true }`
  - rate limiting: ip/dossier/mail (fail-closed)
  - audit:
    - login_request_received
    - login_link_issued
    - login_request_rejected
    - login_request_throttled (reason enum: ip_rate_limit | dossier_rate_limit | mail_rate_limit)


#### Mail-worker — Gateway auth is óók verplicht (ops critical)

- mail-worker
  - verwerkt outbound_emails queued → sent/failed/requeued
  - guards:
    - Verify JWT (legacy) staat **UIT** voor deze function (Dashboard → Function details).
    - Enige vereiste auth is de extra secret guard:
      - `x-mail-worker-secret == MAIL_WORKER_SECRET` → anders 401.
  - scheduling:
    - selectie op next_attempt_at (<= now) + attempts < MAX_ATTEMPTS
  - audit (dossier-scoped, fail-open):
    - mail_sent / mail_requeued / mail_failed wanneer outbound_emails.dossier_id != null

Mail-worker heeft 2 lagen:
1) Supabase gateway auth (voor `/functions/v1/*`)
2) Interne shared-secret guard (`x-mail-worker-secret`)

Canonical curl (copy-paste):
bash
MAIL_FN="$SUPABASE_URL/functions/v1/mail-worker"
RID="debug-mail-worker-$(date +%s)"

curl -i -s "$MAIL_FN" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "x-mail-worker-secret: $MAIL_WORKER_SECRET" \
  -H "x-request-id: $RID" \
  -H "Content-Type: application/json" \
  -d "{}"


### Dossier read/write (wizard steps)

Stap 1 — Access
- api-dossier-access-save (write, idempotency, MLS, locks)
- api-dossier-access-update (patch-style, idem)

Stap 2 — Address
- api-dossier-address-verify (session-auth preview + audit)
- api-dossier-address-save (session-auth write + PDOK verify + audit)

Stap 3 — Laadpalen (Chargers)
- api-dossier-charger-save (create/update, idempotency, MLS, locks, max chargers)
- api-dossier-charger-delete (cascade cleanup + audit)

### Charger audit contract (2026-02-17 bevestigd)

charger_added / charger_updated events bevatten minimaal:

- mid_number
- serial_number
- brand
- model
- power_kw
- notes
- request_id
- idempotency_key
- actor_ref
- ip
- ua
- environment

Geen legacy meter_id meer gebruiken.


**Dossier opbouw toevoeging (nieuw): MID**
Per laadpaal wordt vastgelegd:
- `mid_number` (string, NOT NULL)

NB:
- Er is geen `has_mid` boolean meer op dossier- of laadpaalniveau.
- Self-serve impliceert altijd MID.


NB:
- “Heeft MID?” is een intake gate (B2C) én een dossier-detail (per laadpaal).
- In audit/export wordt dit als **claim van de klant** behandeld totdat verifier/inboeker anders bepaalt.

Stap 4 — Documents
- api-dossier-upload-url (issue signed upload url + insert issued row + audit)
- api-dossier-upload-confirm (server-side sha256 verify → confirmed + audit)
- api-dossier-doc-delete (delete draft/issued only; confirmed immutable; strict idempotency)
- api-dossier-doc-download-url (signed download url; locked+confirmed gate; audit success + reject coverage)

Stap 5 — Consents
- api-dossier-consents-save (immutable; strict idempotency; audit)

Stap 6 — Review
- api-dossier-evaluate (session-auth canonical review endpoint; precheck + finalize; strict idempotency)

Evidence / export
- api-dossier-verify
  - session-auth
  - derived analysis orchestrator
  - accepteert:
    - `dossier_id`
    - `session_token`
    - `mode`
    - `client_verify_payload`
  - gebruikt declared data uit:
    - `dossiers`
    - `dossier_chargers`
  - gebruikt observed data uit:
    - client-side parser payload per factuurdocument
  - schrijft uitsluitend naar:
    - `dossier_analysis_document`
    - `dossier_analysis_charger`
    - `dossier_analysis_summary`
  - muteert geen bestaande dossierdata
  - voert geen inline OCR/PDF parsing uit
  - fallback:
    - ontbrekende client observed payload → placeholder/inconclusive semantics
- api-dossier-export
  - session-auth
  - export artifact
  - only locked/in_review
  - only confirmed docs
  - preserves export JSON in `public.dossier_exports`
  - calculates `export_sha256`
  - returns `export_id`, `export_sha256`, `preserved`, `payment_status`, `claim_year`, `claimed_mid_numbers`
  - enforces final yearly MID conflict check against non-voided preserved exports
  - duplicate `MID + claim_year` → HTTP 409, `dossier_export_rejected`, no new `dossier_exports` row
  - CURRENT export v5 bevat naast dossier/checks/docs ook:
    - `analysis`
    - `analysis_methods`
    - `analysis_documents`
    - `analysis_chargers`
    - `analysis_summary`

Legacy/compat
- api-dossier-submit-review is verwijderd; canonical review/finalize endpoint is `api-dossier-evaluate`
- api-dossier-address-preview is verwijderd; address preview loopt via `api-dossier-address-verify`


## 7) Security model (kern)
- Customer auth:
  - start-auth: possession of link-token → sha256(token) == `dossiers.access_token_hash`
  - runtime-auth: geldige server-side session in `public.dossier_sessions`
- Hard lock enforcement op alle write endpoints
- CORS allowlist (ALLOWED_ORIGINS + Vary: Origin)
- Mail-worker JWT verify: **UIT** (legacy JWT) — security komt uit shared-secret header + private env secrets.
- Service role key: **nooit delen**; rotatie bij exposure

### DB exposure policy (nieuw, 2026-02-17)
- Anon/auth REST toegang tot core tabellen is bewust dichtgezet (permission denied).
- Alle reads/writes lopen via Supabase Edge Functions met `SUPABASE_SERVICE_ROLE_KEY`.
- Audit-inspectie gebeurt via SQL Editor (Optie 1).
- Conclusie: “security hoort in edge” is nu niet alleen een principe, maar ook technisch afgedwongen.


### Gateway/auth nuance (supabase functions/v1)
- Requests kunnen door de Supabase gateway worden geweigerd vóór de function code draait.
- Voor publieke (anon) calls is canonical header set:
  - `apikey: $SUPABASE_ANON_KEY`
  - `authorization: Bearer $SUPABASE_ANON_KEY`
- Symptom van gateway-401 (niet jouw code):
  - response body: `{"code":401,"message":"Missing authorization header"}`
  - CORS headers zijn niet jouw allowlist (vaak `allow-origin: *`).
- Conclusie:
  - Bij auth-issues eerst checken of de response van gateway komt of uit de function.

### Audit event model (verduidelijking)
- `public.dossier_audit_events` bevat **geen vaste kolommen** voor ip/ua/request_id/etc.
- Alle request- en actor-metadata wordt vastgelegd in `event_data` (jsonb),
  conform Minimum Logging Standard (MLS).

### Session registry (nieuw 2026-03-03)
- Server-side sessions: `public.dossier_sessions`
- Unieke token-hash (global) + per-dossier uniqueness.
- Enforcement:
  - revoked → reject
  - expired → reject
  - last_seen_at kan worden bijgewerkt voor monitoring/ops

Belangrijk:
- Link-token is alleen voor initiële exchange in `api-dossier-get`.
- Session-token is canoniek voor dossier runtime reads/writes.

Shared helper (CURRENT):
- `supabase/functions/_shared/customer_auth.ts`
  - `requireCustomerSession(...)`
  - `actorRefForSession(...)`
  - `scopedSessionIdemKey(...)`

Doel:
- auth- en idempotency-scoping uniform maken over dossier-endpoints
- drift tussen session-auth endpoints reduceren

### Test-contract implicatie van session-auth (bewezen 2026-03-15)

Voor de testsuite geldt nu expliciet:

- `DOSSIER_TOKEN`
  - alleen voor initiële bootstrap / token→session exchange / DB hash proof
- `DOSSIER_SESSION_TOKEN`
  - canonical runtime auth voor:
    - charger save/delete
    - upload-url
    - upload-confirm
    - cleanup deletes
    - overige dossier runtime endpoints

Test helper waarheid:
- `scripts/tests/00_helpers.sh` bevat:
  - `dossier_token()`
  - `dossier_session_token()`
  - `bootstrap_session_from_link_token()`

Operational meaning:
- een groene testsuite bewijst nu niet alleen “link werkt”,
  maar ook dat runtime endpoints correct reageren op session-auth.


## 8) Evidence-grade rules (contract)
- **issued ≠ confirmed**
- Alleen confirmed docs tellen mee voor review/export/download
- Confirmed docs immutable (DB policy/trigger)
- Rejects zijn auditwaardig (attempt logs)

## 9) Tooling & reproducibility

### 9.1 scripts/tests/run_all.sh (contract test — CURRENT, bewezen 2026-05-10)

Doel (CURRENT):
- bootstrap van een volledig nieuw testdossier via echte intake/mailflow
- extractie van `DOSSIER_ID` + link-token uit state/mail
- token→session bootstrap via `api-dossier-get`
- setup vult dossier exact aan tot `dossiers.charger_count`
- reject tests draaien tegen CURRENT session-auth endpoints
- happy uploads draaien uitsluitend op chargers die in deze run zijn aangemaakt
- exportcontract wordt bewezen vóór cleanup
- cleanup is lock-aware en verifieert retained locked state wanneer het dossier inmiddels is ingediend

CURRENT contract:
- fresh-only suite
- runtime auth voor dossier endpoints = `session_token`
- link-token blijft alleen bootstrap/debug input
- testlog wordt volledig geredigeerd weggeschreven naar:
  - `scripts/tests/output/latest.log`

Actieve testsuite-bestanden:
- `scripts/tests/run_all.sh`
- `scripts/tests/00_fresh_dossier.sh`
- `scripts/tests/00_helpers.sh`
- `scripts/tests/01_setup.sh`
- `scripts/tests/02_intake_contract.sh`
- `scripts/tests/03_login_tests.sh`
- `scripts/tests/04_charger_contract.sh`
- `scripts/tests/05_upload_rejects.sh`
- `scripts/tests/06_upload_happy.sh`
- `scripts/tests/08_export_contract.sh`
- `scripts/tests/09_cleanup.sh`

Niet meer actief:
- `scripts/tests/07_cleanup.sh` is verwijderd/vervangen.
- Cleanup draait nu bewust als `09_cleanup.sh`, ná `08_export_contract.sh`.

Bewezen coverage:
- intake rejects + idempotency replay
- login throttle + mismatch
- charger unauthorized / max-chargers
- upload-url rejects
- upload-confirm rejects
- happy upload flow:
  - signed upload URL
  - storage PUT
  - upload-confirm
  - DB proof op confirmed `dossier_documents` row
- export contract:
  - not-locked export reject → HTTP 409
  - address save/verify
  - consents save
  - synthetic observed invoice payload aligned op declared data
  - `api-dossier-verify` → analysis status `partial_pass`
  - `api-dossier-evaluate(finalize=true)` → `status=in_review`
  - locked export success → HTTP 200
  - export artifact shape proof:
    - `schema_version = enval-dossier-export.v5`
    - 8 confirmed documents
    - `analysis.version = enval-analysis.v1`
    - `analysis_readable.version = enval-analysis-readable.v1`
    - `analysis_run.run_id` aanwezig
- cleanup proof:
  - na export is dossier locked/in_review
  - runtime delete wordt bewust niet uitgevoerd, omdat locked dossiers niet muteerbaar zijn
  - retained locked dossierdata wordt gecontroleerd
  - dossier/outbound/audit shell blijft bewust bestaan

Belangrijk:
- suite is niet “fake groen” bewezen:
  - sabotage op verkeerde audit reason → suite faalt
  - sabotage op verkeerde audit stage → suite faalt
  - sabotage op verkeerde file sha256 → suite faalt
- cleanup na export is geen mutable-child cleanup meer, maar een retained-state proof.
- Een 409 op runtime delete na lock is correct backendgedrag.

Wanneer gebruiken:
- na elke wijziging aan dossier auth/runtime endpoints
- na wijzigingen aan upload/audit/idempotency/export/cleanup gedrag

Wanneer niet:
- productie/live data

### 9.2 Local sanity checks (macOS)
- Gebruik `python3` (niet `python`) voor sanity scripts.

## 9.3 Analysis worker tooling (CURRENT, local standalone lane)

Doel:
- standalone invoice-image extractie lokaal bewijzen vóór Edge-koppeling
- regressies zichtbaar maken zonder `api-dossier-verify` al te belasten

Bestanden (CURRENT):
- `scripts/analysis_worker/ocr_extract.py`
  - lokale invoice-image extractor
  - output bevat zowel approved waarden als raw candidates voor serial/MID
- `scripts/analysis_worker/compare_invoice_results.py`
  - lokale compare-laag:
    - expected
    - observed_raw
    - observed_approved
    - field status
    - overall_status
    - overall_reason
- `scripts/analysis_worker/convert_pdf_tests_to_jpg.py`
  - converteert PDF testset lokaal naar JPG’s
- `scripts/analysis_worker/run_pdf_derived_image_batch.py`
  - batch-runner voor PDF-afgeleide JPG lane

Outputmappen (CURRENT):
- `scripts/analysis_worker/output/`
- `scripts/analysis_worker/output/batch_image_tests/`
- `scripts/analysis_worker/output/batch_image_tests_pdf_derived/`

Belangrijke CURRENT ontwerpregel:
- deze lokale workerlane is proof/dev tooling
- nog niet gekoppeld aan `api-dossier-verify`
- nog geen analysis-table writes vanuit deze standalone scripts
- doel is eerst extractie- en compare-contract lokaal stabiel maken

Belangrijke parserregel (CURRENT):
- raw candidate logging voor identifiers is verplicht onderdeel van de lokale output:
  - `serial_candidate_raw`
  - `mid_candidate_raw`
- noisy candidates mogen niet stil worden omgezet naar schijnbaar geldige approved values

## 10) Working Agreement (hoe wij werken)
Input van Daan per sessie:
1) Goal (1 zin) + Phase + Priority
2) Scope: welke files/endpoints
3) Paste: huidige files (1-op-1) + test output

Output van ChatGPT per sessie:
1) Plan (max 10 bullets)
2) Code: full file(s) of exact anchor-patches
3) Exact terminal tests + expected resultaten
4) Doc updates:
   - altijd: 03_CHANGELOG_APPEND_ONLY.md
   - alleen indien nodig: 02_AUDIT_MATRIX.md / 04_TODO.md


# AMENDMENT — 01_SYSTEM_MAP.md

Datum: 2026-02-24
Type: CSS policy clarification + Payment placement note
Status: APPEND-ONLY

---

## 11) CSS Policy Clarification

System Map verduidelijking:

Frontend styling volgt strikt:

* Eén stylesheet: `assets/css/style.css`
* Geen aparte legacy CSS laag
* Informatiepagina’s gebruiken bestaande componenten

System Map implicatie:

* Styling is geen onderdeel van phase branching
* Er wordt geen parallel style-systeem onderhouden

---

## 12) Payment Placement Clarification (Architectural)

Dossier lifecycle:

* incomplete
* ready_for_review
* in_review (locked)
* ready_for_booking

Payment hoort **niet** in deze state machine.

Payment is een orthogonale status:

* `payment_status`

Export endpoint en evaluate endpoint mogen conditioneel blokkeren op basis van:

* payment_status
* PAYMENT_GATE_MODE

Belangrijk:

* Lock blijft audit-driven
* Payment mag lock nooit impliciet forceren
* Payment mag alleen blokkeren, niet muteren

Dit voorkomt schema drift wanneer payment moment in de keten verschuift.


=======
UPDATES
=======


## Update 2026-02-10 — Phase-2 Uploadstrategie (client-side first)

### Uploadarchitectuur (actueel)
- Foto-uploads (`foto_laadpunt`) worden **client-side geoptimaliseerd**:
  - downscale + JPEG re-encode vóór upload
  - server ontvangt alleen finale bytes
- Server-side:
  - signed upload URL (no processing)
  - sha256 verificatie uitsluitend bij `upload-confirm`
- Audit:
  - hash gebaseerd op finale bytes
  - confirm vereist succesvolle server-side verificatie

### Scope particuliere dossiers (CURRENT)
- UI is ingericht voor particuliere gebruikers met één of meerdere laadpalen.
- Backend ondersteunt technisch tot 10 laadpalen per dossier.
- Eventuele systeemlimieten zijn interne implementatiedetails.
- Grootschalige of zakelijke scenario’s vallen buiten de MVP-scope.


### Kosten & stress reductie
- Geen image processing op Edge
- Geen dubbele server-side downloads
- Lagere storage egress
- Audit trail blijft volledig



### PATCH 2026-02-24 — MID naming contract (hard)

CURRENT canonical field:
- `dossier_chargers.mid_number` (NOT NULL)

Frontend/JS contract:
- UI veldnaam en payload key moeten **mid_number** gebruiken.
- `meter_id` is legacy/incorrect en mag niet meer gebruikt worden.

Impact:
- `api-dossier-charger-save` verwacht `mid_number`.
- Render: tabelkolom “MID” toont `mid_number`.

---

### PATCH 2026-02-24 — Export (betaald) decoupling (CURRENT)

- Indienen (lock/in_review) is audit-gate, onafhankelijk van betaling.
- Export is product-gate, later betaalbaar te maken zonder schema drift.
- Export/download blijven: locked only + confirmed docs only.


---

## APPEND-ONLY UPDATE — 2026-03-04 — Pages list + CSS waarheid (single stylesheet)

1) Pages list hygiene (CURRENT)
- `proces.html` bestaat niet (meer). De content zit in `hoe-het-werkt.html`.
- Als er nog ergens naar `proces.html` wordt gelinkt: fix de link, niet de CSS.

2) CSS waarheid (CURRENT)
- `assets/css/legacy.css` bestaat niet (meer).
- Alle pagina’s (core + info) laden `assets/css/style.css`.

3) Implicatie
- “Legacy isolation via file separation” is OUTDATED.
- Isolatie gebeurt via component-contract + HTML normalisatie binnen dezelfde stylesheet.

## APPEND-ONLY UPDATE — 2026-03-16 — Dev unlock + browser runtime-auth waarheid bewezen

### Dev unlock endpoint
Nieuw bewezen CORE behavior:
- `api-dossier-dev-unlock`
  - auth: session-auth (zelfde runtime model als dossier-endpoints)
  - doel: locked dossier in DEV terugzetten naar editable state
  - bewezen response:
    - `ok=true`
    - `unlocked=true`
    - `status="incomplete"`
    - `locked_at=null`
    - `previous_status`
    - `previous_locked_at`

### Root cause van eerdere 401’s
- Niet de unlock function zelf
- Wel: verlopen `dossier_sessions.expires_at`
- Bewezen via:
  - `api-dossier-get` met oude session → 401
  - `api-dossier-dev-unlock` met oude session → 401
  - DB row in `public.dossier_sessions` met matching hash maar verlopen `expires_at`

### Browser/UI runtime waarheid (bevestigd)
De browserflow kent 2 auth-fasen:

1. URL start-auth
- `/dossier.html?d=<uuid>&t=<link_token>`
- `t` betekent uitsluitend one-time link-token

2. Runtime-auth
- na exchange bewaart frontend de session in:
  - `localStorage["enval_session_token:<dossier_id>"]`

Belangrijk:
- de UI leest géén `session_token` uit query param `t`
- `/dossier.html?d=<id>&t=<session_token>` is dus ongeldig gedrag
- voor dev/browsergebruik met reeds geminte session moet localStorage handmatig of via helper worden gevuld

### Nieuw dev helper script
Bestand:
- `scripts/tools/refresh-dossier-session.sh`

Doel:
- login-request triggeren
- nieuwste dossier_link mail uit `outbound_emails` lezen
- link-token extraheren
- exchangen naar nieuwe `session_token`
- export statements printen voor huidige shell

Operational result:
- minder handmatige mail/curl/SQL stappen
- consistente refresh routine voor verlopen sessies

---

## APPEND-ONLY UPDATE — 2026-03-24 — Dossier UI aligned op huidige documentrealiteit + stabiele laadpaalvolgorde

### Wat is gewijzigd
- `dossier.html` bevat niet langer de centrale uploadform in stap 4.
- `assets/js/pages/dossier.js` rendert documentacties nu per laadpaalkaart.
- Upload gebeurt per kaart en per documenttype via het documentvak zelf.

### CURRENT documentcontract in de UI
Per laadpaal:
- exact 1 `factuur`
- exact 1 `foto_laadpunt`

Zodra aanwezig:
- uploadslot voor dat type verdwijnt

Na delete:
- uploadslot voor dat type verschijnt opnieuw

### Waarom dit CURRENT correct is
- Dit sluit aan op de huidige database-/MVP-realiteit.
- Multi-upload per type is bewust uitgesteld.
- De UI stopt dus met doen alsof meerdere documenten per type al ondersteund worden.

### Stabiele nummering
- `api-dossier-get` geeft chargers nu in stabiele volgorde terug.
- Frontend draait die volgorde niet meer om.
- Resultaat:
  - laadpaalnummers blijven consistent
  - nieuw toegevoegde laadpalen verschijnen onderaan
  - documentkaarten blijven visueel logisch gekoppeld aan dezelfde laadpaal

# EINDE 01_SYSTEM_MAP.md (current state, rewrite-ok)