# 02_AUDIT_MATRIX.md (spec, updated)

# ENVAL — Audit Matrix (SPEC)

Statusdatum: 2026-02-17  
Doel: canonical lijst van audit events + waar/wanneer ze ontstaan.  
Regel: als een endpoint behavior wijzigt → update matrix + log change in changelog.

---

## Strategisch Auditprincipe (2026-03-02)

Audit events ondersteunen de infrastructuurpositie van Enval.

Enval logt:
- Structuur
- State transitions
- Integriteit
- Authenticiteit van bytes (sha256)

Enval logt expliciet géén:
- Compliance-oordelen
- Verificatiebeslissingen
- Certificeringsuitkomsten
- Economische claims

Auditcontract blijft technisch, niet normatief.

## 0) Meta standaard (MLS)
Elke audit event_data bevat minimaal:
- request_id
- idempotency_key (indien relevant)
- actor_ref
- ip
- ua
- environment
- stage/status/message/reason (bij rejects/fails)

NB:
- De hierboven genoemde velden zijn **logische auditvelden**.
- Ze worden **niet als kolommen** gemodelleerd, maar altijd opgenomen in `event_data` (jsonb).
- Queries en exports moeten daarom `event_data->>'field'` gebruiken.

### Test-suite cleanup positie (CURRENT, bewezen 2026-03-12)

Fresh test runs gebruiken een nieuw dossier, maar ruimen na afloop **alleen mutable child artefacten** op.

Wat cleanup wél verwijdert:
- `dossier_chargers` (via canonical edge delete)
- `dossier_documents` / storage-objecten die aan created chargers hangen
- andere mutable child state voor zover via bestaande delete-contracten opruimbaar

Wat cleanup bewust níet hard verwijdert:
- `dossiers` row
- `outbound_emails` rows
- `dossier_audit_events` rows

Rationale:
- `dossier_audit_events` is immutabel
- hard delete van dossier-shell zou audit trail breken of FK/trigger-conflicten veroorzaken
- test cleanup moet audit-first blijven, niet “database volledig leeg maken”

Operational meaning:
- een fresh testdossier eindigt als **retained dossier shell** met audit history
- dit is CURRENT gewenst gedrag, geen cleanup failure

Toekomst:
- als lifecycle verder wordt uitgewerkt, gebeurt dat via tombstone/archive semantics, niet via hard delete van audit-gebonden dossiers

### Test-suite sabotage-proof bewijs (CURRENT, bewezen 2026-03-15)

De testsuite is expliciet gecontroleerd op “false green” gedrag.

Bewezen faalscenario’s:
- verkeerde audit `reason` verwachting → suite faalt
- verkeerde audit `stage` verwachting → suite faalt
- verkeerde `file_sha256` bij upload-confirm → suite faalt met 409 mismatch
- ontbrekende/onjuiste DB-confirmation lookup → happy upload proof faalt

Conclusie:
- de suite controleert niet alleen HTTP-status,
- maar ook audit-inhoud en database-eindstaat waar dat load-bearing is.

Dit is belangrijk omdat:
- 200/400/401 alleen onvoldoende bewijs zijn
- audit-first contract ook inhoudelijk bewezen moet worden
- cleanup pas “echt groen” is wanneer cascade-effect in DB zichtbaar is

### Gateway rejects (belangrijk)
Sommige rejects gebeuren **vóór** de edge function code draait (Supabase gateway).
- Voorbeeld: 401 `Missing authorization header`.
- Gevolg: er wordt **geen** `dossier_audit_event` geschreven (function draait niet).
- Bewijs/diagnose: CORS headers zijn niet die van de function (vaak `allow-origin: *`).

### Mail-worker gateway rejects (ops nuance)
- 401 `Missing authorization header` is een gateway reject vóór function runtime.
- Gevolg: er wordt géén `dossier_audit_event` geschreven door mail-worker (code draait niet).
- Dit is geen “mail-worker auth failure”, maar een client/header failure.
- Canonical client rule: altijd `apikey` + `authorization` meesturen bij function calls (ook server-to-server debug curls).

## 1) System events
- dossier_created — success — api-lead-submit (ev_direct / installer_to_customer)
- link_token_consumed — success — api-dossier-get (token mode; consume + email_verified_at MVP)
- session_created — success — api-dossier-get (token mode; dossier_sessions insert)
- dossier_review_rejected_incomplete — reject — api-dossier-evaluate
- dossier_ready_for_review — success — api-dossier-evaluate
- dossier_locked_for_review — success — api-dossier-evaluate
- dossier_export_generated — success — api-dossier-export (locked only)
- dossier_export_rejected — reject/fail — api-dossier-export

Beperking (bewust, MVP):
- `email_verified_at` wordt (indien leeg) gezet bij geldige link-token consume.
- Dit bewijst geen mailbox-control; het bewijst uitsluitend “possession of link”.
- Dit is acceptabel voor MVP maar moet expliciet blijven in product claims.

## 1.1 Intake eligibility gates (NL + MID) — auditpositie (CURRENT)

Architectuurkeuze: A) Pre-dossier reject (on-chain via intake_audit_events)

Flow:
- api-lead-submit (ev_direct)

Bij:
- in_nl_false
- has_mid_false

### MID enforcement (Optie A — harde systeemeis, bevestigd 2026-02-17)

Self-serve ondersteunt uitsluitend laadpalen met MID.

Regels:

- Intake reject indien has_mid != true
- dossier_chargers.mid_number verplicht (NOT NULL)
- api-dossier-charger-save reject bij ontbrekend mid_number
- Geen dossier-level has_mid veld

Audit:

charger_added / charger_updated event_data bevat:

- mid_number
- serial_number
- brand
- model
- power_kw
- notes

Interpretatie in audit/export:
“customer-declared MID-number; existence validated, authenticity not verified”.

Gedrag:
- intake_audit_events insert
- HTTP 400
- Geen lead
- Geen dossier
- Geen dossier_audit_event

Rationale:
- Vermijdt dead-on-arrival dossiers
- Houdt intake lifecycle gescheiden van dossier lifecycle
- Idempotency replay blijft actief voor reject responses


## 1.2 Intake audit events (pre-dossier) — `public.intake_audit_events` (CURRENT)

Doel:
- Rejected intakes (bijv. NL=false of MID=false) auditbaar maken zonder dossier-create.

Events (pre-dossier)
- intake_eligibility_rejected — reject — api-lead-submit (flow=ev_direct)
  - reason: `in_nl_false` | `has_mid_false` | `charger_count_invalid` | `charger_count_cap_exceeded` | `invalid_payload` | `legacy_flow`
  - event_data (MLS minimum):
    - request_id, idempotency_key, actor_ref, ip, ua, environment
    - flow, stage="eligibility", status, message, reason
    - payload_allowlist (geen PII dump): email, charger_count, own_premises, in_nl, has_mid

NB (schema):
- `intake_audit_events` is een tabel met expliciete velden (created_at, request_id, idempotency_key, flow, stage, status, reason, message, payload).
- Er is geen `event_type` kolom; de combinatie `stage + reason + status` definieert het audit event.


NB:
- Gateway rejects (401 missing auth header) blijven off-chain: function draait niet.
- Zodra dossier bestaat, moeten rejects dossier-scoped in `dossier_audit_events` (on-chain).



## 2) Customer — Step 1 Access
Success
- access_updated — api-dossier-access-save, api-dossier-access-update

Reject/Fail
- access_save_rejected — api-dossier-access-save — stages: auth|validate|db_read|db_write|dossier_locked|business_rule
- access_update_rejected — api-dossier-access-update — stages idem

## 3) Customer — Step 2 Address
Preview (auditwaardig)
- address_verify_ok — success — api-dossier-address-verify
- address_verify_not_found — reject — api-dossier-address-verify
- address_verify_rejected — reject — api-dossier-address-verify

System
- address_verify_failed — fail — api-dossier-address-verify (PDOK failure)

Write
- address_saved_verified — success — api-dossier-address-save
- address_save_rejected — reject/fail — api-dossier-address-save — stages: validate|auth|dossier_locked|db_read|external_lookup|db_write

NB:
- `api-dossier-address-preview` is verwijderd.
- Address preview loopt nu uitsluitend via `api-dossier-address-verify`, dus preview is dossier-scoped en auditwaardig.

## 4) Customer — Step 3 Chargers
Success
- charger_added — api-dossier-charger-save
- charger_updated — api-dossier-charger-save
- charger_deleted — api-dossier-charger-delete

Reject/Fail
- charger_save_rejected — api-dossier-charger-save — (401/409/400)
- charger_save_failed — api-dossier-charger-save — (500)
- charger_delete_rejected — api-dossier-charger-delete — (400/401/404/409)
- charger_delete_failed — api-dossier-charger-delete — (500)
- charger_delete_storage_failed — partial fail-open — api-dossier-charger-delete

## 5) Customer — Step 4 Documents
### Issue
- document_upload_url_issued — success — api-dossier-upload-url
  - event_data kan bevatten:
    - document_id
    - doc_type
    - charger_id
    - storage_bucket
    - storage_path
    - filename
    - content_type
    - size_bytes
    - invalidated_ready_for_review (bool)
    - client_transform (object|null)

- document_upload_url_rejected — reject/fail — api-dossier-upload-url
  - event_data bevat minimaal: stage/status/message/reason
  - event_data kan bevatten: client_transform (object|null)

### Confirm
- document_upload_confirmed — success — api-dossier-upload-confirm
  - event_data kan bevatten:
    - document_id
    - doc_type
    - charger_id
    - filename
    - storage_bucket
    - storage_path
    - content_type
    - size_bytes
    - file_sha256_client
    - file_sha256_server
    - file_sha256
    - verified_server_side (bool)
    - client_transform (object|null)

Testbewijs (CURRENT, 2026-03-15):
- happy path is pas geslaagd wanneer niet alleen HTTP 200 is ontvangen,
  maar ook de corresponderende `dossier_documents` row in DB bewezen `confirmed` is
  voor exact `document_id`.

- document_upload_confirm_rejected — reject/fail — api-dossier-upload-confirm
  - event_data bevat minimaal: stage/status/message/reason
  - event_data kan bevatten:
    - bucket/path, file_sha256_client/server (bij mismatch), etc.
    - client_transform (object|null)

### Delete
- document_deleted — success — api-dossier-doc-delete (draft/issued)
- document_delete_rejected — reject/fail — api-dossier-doc-delete (incl. 200 not_found as idempotent attempt)
- document_delete_storage_failed — partial fail-open — api-dossier-doc-delete

### Evidence access (download)
- document_download_url_issued — success — api-dossier-doc-download-url
- document_download_url_rejected — reject/fail — api-dossier-doc-download-url
  stages: validate_input | dossier_lookup | auth | export_gate | doc_lookup | integrity_gate | signed_url

## 6) Customer — Step 5 Consents
- consents_saved — success — api-dossier-consents-save
- consents_save_rejected — reject/fail — api-dossier-consents-save
  stages: validate|auth|dossier_locked|db_read|db_write

## 7) Customer — Step 6 Review
Canonical endpoint:
- `api-dossier-evaluate`

Success
- dossier_ready_for_review — success — api-dossier-evaluate (`finalize=false`)
- dossier_locked_for_review — success — api-dossier-evaluate (`finalize=true`)

Reject/Fail
- dossier_review_rejected_incomplete — reject — api-dossier-evaluate
- dossier_evaluate_rejected — reject — api-dossier-evaluate
- dossier_evaluate_failed — fail — api-dossier-evaluate

NB:
- `api-dossier-submit-review` is verwijderd.
- Er is dus geen parallel review-endpoint meer.

## 8) Customer — Read/Auth
- dossier_get_rejected — reject — api-dossier-get (401)

## 8.1 Link-token + Session (CURRENT, code-accurate)

Bron: `supabase/functions/api-dossier-get/index.ts` + runtime endpoints die `authSession(...)` gebruiken.

### Link-token rejects (token mode)
- link_token_rejected — reject — api-dossier-get
  - redenen (event_data.reason):
    - link_expired (HTTP 410)
    - link_consumed (HTTP 410)
    - unauthorized / invalid token (HTTP 401)

### Link-token consume (token mode)
- link_token_consumed — success — api-dossier-get
  - wanneer: na succesvolle consume update op `dossiers.*access_token_*`
  - doel: auditbaar dat de one-time link gebruikt is

### Session issuance (token mode)
- session_created — success — api-dossier-get
  - wanneer: na insert in `public.dossier_sessions`
  - event_data bevat minimaal: `expires_at`

### Session rejects (session mode, runtime auth)
- dossier_get_rejected — reject — api-dossier-get (session mode) wanneer `authSession(...)` faalt
- access_save_rejected — reject — api-dossier-access-save wanneer `authSession(...)` faalt
- access_update_rejected — reject — api-dossier-access-update wanneer `authSession(...)` faalt
- address_verify_rejected — reject — api-dossier-address-verify (session mode)
- address_save_rejected — reject — api-dossier-address-save (session mode)
- charger_save_rejected — reject — api-dossier-charger-save (session mode)
- charger_delete_rejected — reject — api-dossier-charger-delete (session mode)
- document_upload_url_rejected — reject — api-dossier-upload-url (session mode)
- document_upload_confirm_rejected — reject — api-dossier-upload-confirm (session mode)
- document_delete_rejected — reject — api-dossier-doc-delete (session mode)
- document_download_url_rejected — reject — api-dossier-doc-download-url (session mode)
- consents_save_rejected — reject — api-dossier-consents-save (session mode)
- dossier_evaluate_rejected — reject — api-dossier-evaluate (session mode)
- dossier_export_rejected — reject — api-dossier-export (session mode)

NB:
- Er is geen aparte `session_revoked` of `session_expired` audit event in CURRENT code.
- Session failures landen momenteel als reject event van het aangeroepen endpoint, met session-auth reason in `event_data`.
- CURRENT reason-values kunnen endpoint-specifiek zijn, maar bewezen reden is o.a.:
  - `session_not_found`
- Test-implicatie:
  - tests mogen niet blind `unauthorized` als audit reason verwachten wanneer backend specifieker reason enums logt.
- Als expliciete revoke/refresh lifecycle wordt toegevoegd, moet audit matrix uitgebreid worden met aparte session events.

## 8.2 Login Recovery (CURRENT)

Endpoint:
`api-dossier-login-request`

Doel:
Herstellen van dossier toegang wanneer oorspronkelijke dossier-link token
verlopen of geconsumeerd is.

Security model:
- anti enumeration
- email + dossier_id match vereist
- response altijd { ok: true }

### Success events

login_request_received — success — api-dossier-login-request

login_link_issued — success — api-dossier-login-request
  event_data bevat minimaal:
  - outbound_email_id
  - expires_at

NB:
- raw email wordt niet in `actor_ref` gezet.
- `actor_ref` gebruikt masked email scope (`dossier:<id>|email:xx***`).

### Reject events

login_request_rejected — reject — api-dossier-login-request
  reason:
  - email_mismatch
  - dossier_not_found
  - invalid_payload

login_request_throttled — reject — api-dossier-login-request
  reason (enum):
  - ip_rate_limit
  - dossier_rate_limit
  - mail_rate_limit


NB:
Response blijft altijd `{ ok: true }` voor anti-enumeration.
Audit events zijn de enige bron van waarheid.

## 8.3 Analysis (CURRENT)

Canonical endpoint:
- `api-dossier-verify`

### Document analysis
- document_analysis_started — success — api-dossier-verify
- document_analysis_completed — success — api-dossier-verify
- document_analysis_failed — fail — api-dossier-verify

Event_data minimaal:
- `document_id`
- `charger_id` (indien relevant)
- `doc_type`
- `analysis_kind`
- `method_code`
- `method_version`
- `status`

### Charger analysis
- charger_analysis_result_written — success — api-dossier-verify

Event_data minimaal:
- `charger_id`
- `document_id` (indien relevant; source document)
- `analysis_code`
- `method_code`
- `method_version`
- `status`

### Dossier summary
- dossier_analysis_summary_generated — success — api-dossier-verify

Event_data minimaal:
- `method_code`
- `method_version`
- `overall_status`
- `document_analysis_count`
- `charger_analysis_count`

### Reject/Fail
- dossier_verify_rejected — reject — api-dossier-verify

Stages:
- `auth`
- `dossier_lookup`
- `analysis_gate`
- `chargers_read`
- `documents_read`
- `analysis_refresh_delete_document`
- `analysis_refresh_delete_charger`
- `analysis_refresh_delete_summary`
- `analysis_document_insert`
- `analysis_charger_insert`
- `analysis_summary_insert`

Belangrijk:
- Analysis-events zijn aanvullend
- Ze vervangen geen bestaande dossier lifecycle events
- Analysis beïnvloedt CURRENT geen lock/review gate

### Parser boundary (CURRENT, bewezen 2026-03-22)

Analysis v1 ondersteunt text-based PDF facturen ook wanneer relevante velden over meerdere pagina’s zijn verspreid,
zolang de velden zelf nog herkenbaar en label-/blok-achtig aanwezig zijn.

Bewezen:
- multipage factuur met:
  - address op page 1
  - brand/model op page 2
  - serial/MID op page 3
  → alle invoice checks kunnen CURRENT `pass` geven

Huidige bewezen limiet:
- address extractie is afhankelijk van een herkenbaar address block
- bij chaos-layouts waar straat/huisnummer/postcode/plaats los en ongeordend door de PDF staan,
  worden address fields CURRENT niet gereconstrueerd
- resultaat is dan:
  - `invoice_address_match = inconclusive`
  - met reason `one_or_more_address_parts_missing`

Belangrijk:
- Dit is CURRENT geen multipage-probleem
- Dit is CURRENT een address block reconstruction limiet

Bewezen boundary varianten (Paul):
- `invoice_paul_-_real_like_-_10_serial_wrong_01.pdf`
  - `invoice_serial_match = fail`
- `invoice_paul_-_real_like_-_11_all_correct_01.pdf`
  - alle invoice checks = `pass`
- `invoice_paul_-_real_like_-_12_chaos_01.pdf`
  - `invoice_address_match = inconclusive`
  - brand/model/mid/serial = `pass`
- `invoice_paul_-_real_like_-_13_multi-page_01.pdf`
  - alle invoice checks = `pass`
- `invoice_paul_-_real_like_-_14_multi-page_chaos_01.pdf`
  - `invoice_address_match = inconclusive`
  - brand/model/mid/serial = `pass`

Auditinterpretatie:
- CURRENT gedrag is bewust veilig:
  - geen false pass bij onduidelijk adres
  - geen verzonnen address reconstruction
  - degradeert naar `inconclusive` i.p.v. normatieve claim

## 9) System — Mail (dossier-scoped on-chain vanaf 2026-02-09)
Regel: mail audit events worden alleen gelogd wanneer `outbound_emails.dossier_id != null`.

Queue
- mail_queued — success — api-lead-submit (dossier flows) en eventuele andere dossier queue-writers

Delivery (mail-worker)
- mail_sent — success — mail-worker
- mail_requeued — success — mail-worker (retry gepland; next_attempt_at gezet)
- mail_failed — fail — mail-worker (max attempts bereikt)
- mail_requeued reason kan ook stuck_processing_timeout zijn.

NB: mails zonder dossier_id blijven off-chain (geen dossier_audit_event).


---

## Phase-2 uitbreiding — Upload optimalisatie

### document_upload_url_issued
- Context:
  - document metadata vastgelegd vóór upload
  - client-side optimalisatie kan reeds hebben plaatsgevonden
- Auditpositie:
  - event blijft verplicht
  - hash wordt **nog niet** gevalideerd in deze stap
- Uitbreiding (bewijs geleverd):
  - `client_transform` (object|null) wordt gelogd in event_data (allowlist-only, primitives-only)

### document_upload_confirmed
- Uitbreiding:
  - sha256 verificatie gebeurt over finale bytes
  - server-side download verplicht
- Resultaat:
  - `verified_server_side = true`
  - audit trail blijft reproduceerbaar, ondanks client-side transformatie
- Uitbreiding (bewijs geleverd):
  - `client_transform` (object|null) wordt gelogd in event_data (zelfde object als bij issue)

### Belangrijk
Client-side compressie **vervangt geen bewijs**, maar:
- reduceert kosten
- verschuift verwerking
- laat audit-verificatie onaangetast

### Toekomstige wijziging (Phase-2 planned, OPEN): deferred server-side verificatie
- Als `upload-confirm` wordt omgebouwd naar “light confirm” en server-side verify verhuist naar finalize/export/download:
  - `verified_server_side` kan niet langer impliceren “verified in confirm”.
  - Dan is één van deze nodig:
    1) nieuw veld: `verification_mode = "confirm" | "deferred"`
    2) of nieuw veld: `verified_at_gate = "upload_confirm" | "finalize" | "export" | "download"`
    3) of aparte audit events voor gate-verificatie (bijv. `document_integrity_verified_at_export`).
- Tot implementatie: huidige semantics blijven gelden (verify in confirm).

---

### PATCH 2026-02-24 — MID naming fix

Charger events:
- `charger_added` / `charger_updated` bevatten `mid_number` (niet `meter_id`).

Frontend/back-end payload keys:
- `mid_number` is canonical.

---

### PATCH 2026-02-24 — Payment/export audit positie (CURRENT)

CURRENT:
- Geen payment events in audit matrix (geen payment enforcement gebouwd).

Contract:
- Payment gate hoort bij export (product-artefact), niet bij dossier lock (audit-artefact).
- Zodra payment enforcement wordt gebouwd: nieuwe audit events toevoegen, bijv.:
  - `export_payment_required` (reject)
  - `export_payment_confirmed` (success)
  - (optioneel) `payment_session_created` (success)


## APPEND-ONLY UPDATE — 2026-03-16 — Dev unlock auditpositie + bewezen session expiry oorzaak

### Dev unlock
Endpoint:
- `api-dossier-dev-unlock`

Success
- dossier_dev_unlocked — success — api-dossier-dev-unlock
  - event_data minimaal:
    - previous_status
    - previous_locked_at
    - new_status
    - new_locked_at
    - request_id
    - actor_ref
    - ip
    - ua
    - environment

Reject/Fail
- dossier_dev_unlock_rejected — reject — api-dossier-dev-unlock
  - stages:
    - auth
    - dossier_lookup
    - lock_state
    - db_write
  - bewezen reason:
    - session_expired

### Bewezen session expiry patroon
Runtime rejects op session-auth endpoints kunnen CURRENT reason dragen:
- session_not_found
- session_expired
- session_revoked (indien van toepassing)

Bewezen in audit:
- `dossier_get_rejected` met reason `session_expired`
- `dossier_dev_unlock_rejected` met reason `session_expired`

Belangrijk:
- deze rejects zijn endpoint-scoped session-auth failures
- er bestaat CURRENT nog geen apart top-level audit event `session_expired`

# EINDE 02_AUDIT_MATRIX.md (spec, updated)
