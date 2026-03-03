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
- dossier_locked_for_review — success — api-dossier-evaluate (en/of submit-review legacy)
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

NB: api-dossier-address-preview = bewust géén audit events.

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
- dossier_ready_for_review — success — api-dossier-evaluate
- dossier_locked_for_review — success — api-dossier-evaluate
- dossier_review_rejected_incomplete — reject — api-dossier-evaluate
- dossier_evaluate_rejected — reject — api-dossier-evaluate
- dossier_evaluate_failed — fail — api-dossier-evaluate

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

NB:
- Er is geen aparte `session_revoked` audit event in CURRENT code.
- Als revoke/refresh wordt toegevoegd, moet audit matrix uitgebreid worden met expliciete events.

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


# EINDE 02_AUDIT_MATRIX.md (spec, updated)
