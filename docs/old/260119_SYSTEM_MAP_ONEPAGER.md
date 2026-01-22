# Enval — System Map (One Pager)

Versie: v1  
Datum: 2026-01-19  
Repo root: /Users/daankoote/dev/enval  
Branch context: feature/pricing-page (main bevat pilot index)

Doel: canonical overzicht van frontend ↔ edge ↔ database ↔ lifecycle, incl. red flags en backlog.

---

## 1) Frontend routes (pages)

**Repo files**
- ./index.html
- ./aanmelden.html
- ./installateur.html
- ./pricing.html
- ./dossier.html
- ./hoe-het-werkt.html
- ./proces.html
- ./mandaat.html
- ./privacyverklaring.html
- ./voorwaarden.html
- ./regelgeving.html

**Assets**
- ./assets/css/style.css
- ./assets/js/config.js
- ./assets/js/script.js
- ./assets/js/pages/dossier.js

---

## 2) Frontend scripts & verantwoordelijkheden

### 2.1 `./assets/js/config.js`
Single source of truth (non-module, window.ENVAL.*)

- `window.ENVAL.SUPABASE_URL = "https://yzngrurkpfuqgexbhzgl.supabase.co"`
- `window.ENVAL.SUPABASE_ANON_KEY = <anon>`
- `window.ENVAL.API_BASE = ${SUPABASE_URL}/functions/v1`
- `window.ENVAL.edgeHeaders(extraHeaders)`  
  Standaard headers:
  - Content-Type: application/json
  - apikey: <anon>
  - Authorization: Bearer <anon>
  + merge extraHeaders (bv. Idempotency-Key)

**Implication:** alle edge endpoints zijn publiek aanroepbaar (anon), dus security moet in edge zitten (lock checks, validation, abuse controls).

### 2.2 `./assets/js/script.js` (landing/aanmelden/installateur/contact)
- Mobile nav, footer year
- Tabs: `.tab-toggle` / `.tab-panel` (aanmelden.html)
- Form handlers → 1 multiplexer endpoint: `api-lead-submit` met flows:
  - `ev_direct`
  - `installer_to_customer`
  - `installer_signup`
  - `contact`
- Anti double submit / loading state (lockSubmit)

### 2.3 `./assets/js/pages/dossier.js` (dossier wizard)
- Entry via `./dossier.html?d=<uuid>&t=<token>`
- Core pattern: `reloadAll()` → `api-dossier-get`, alle writes → reloadAll()
- Locked UX als:
  - `dossier.locked_at != null` OR `status in (in_review, ready_for_booking)`
- Evaluate flow:
  - `finalize:false` → precheck (ready_for_review, no lock)
  - `finalize:true`  → lock + in_review

**Belangrijke fix die nu gedaan is:** evaluate leest `finalize` uit body en gedraagt zich correct.

---

## 3) Edge functions (contract overzicht)

### 3.1 Lead intake + mail
- `api-lead-submit`
  - multiplexer voor 4 flows
  - idempotency via `idempotency_keys` op `Idempotency-Key`
  - schrijft leads/dossiers/installers/contact_messages + queued emails
- `mail-worker`
  - verwerkt `outbound_emails` queued → sent/failed
  - secret header guard `x-mail-worker-secret`
  - **Backlog:** retries/backoff (nu: failed blijft failed)

### 3.2 Dossier lifecycle (read/write)

**Read**
- `api-dossier-get`
  - input: {dossier_id, token}
  - auth: sha256(token) == dossiers.access_token_hash
  - side effect (MVP): bij eerste access → set `email_verified_at` + audit `email_verified_by_link`
  - returns (sorted created_at DESC):
    - dossier_documents
    - dossier_consents
    - dossier_audit_events
    - dossier_chargers
    - dossier_checks

**Write**
Stap 1 (Toegang):
- `api-dossier-access-save` (en legacy fallback `api-dossier-access-update` indien nog gebruikt)
  - hard lock enforcement: locked_at / in_review / ready_for_booking → 409
  - audit: `access_updated` (customer)

Stap 2 (Adres):
- `api-dossier-address-verify` (PDOK preview, no DB write)
- `api-dossier-address-save` (PDOK verified write)
  - hard lock enforcement
  - writes: address_* + address_verified_at + address_bag_id
  - audit: `address_saved_verified` (customer)

Stap 3 (Laadpalen):
- `api-dossier-charger-save`
  - hard lock enforcement
  - max count = dossiers.charger_count (bij insert)
  - global unique serial_number (DB constraint)
  - audit: `charger_added` / `charger_updated`
- `api-dossier-charger-delete`
  - hard lock enforcement
  - audit: `charger_deleted`

Stap 4 (Documenten):
- `api-dossier-upload-url`
  - hard lock enforcement
  - Idempotency-Key verplicht (idempotency_keys)
  - creates signed upload url (bucket enval-dossiers)
  - inserts dossier_documents row
  - audit: `document_upload_url_issued`
  - **Status semantiek:** hoort `issued/pending`, niet “uploaded”
- `api-dossier-doc-download-url`
  - signed download url (10 min)
  - **Backlog:** audit event “download issued/opened” (privacy afweging)
- `api-dossier-doc-delete`
  - storage remove + db delete
  - audit: `document_deleted`

Stap 5 (Toestemmingen):
- `api-dossier-consents-save`
  - hard lock enforcement
  - append-only logging
  - audit: `consents_saved`
  - evaluate moet “latest per type” deterministisch gebruiken (get endpoint sorteert DESC, dus UI “first wins” is ok)

Stap 6 (Review):
- `api-dossier-evaluate`
  - auth token-hash
  - writes dossier_checks (upsert onConflict dossier_id,check_code)
  - checks:
    - email_verified
    - address_verified
    - charger_exact_count (exact)
    - docs_per_charger (factuur + foto per charger)
    - consents_required
  - behavior:
    - incomplete → status incomplete + audit rejected
    - all pass + finalize:false → status ready_for_review (no lock)
    - all pass + finalize:true  → status in_review + locked_at (lock)
  - audit:
    - `dossier_review_rejected_incomplete`
    - `dossier_ready_for_review`
    - `dossier_locked_for_review`

---

## 4) Database tables (core)

**Dossiers**
- lifecycle: status, locked_at
- auth: access_token_hash, access_token_created_at
- identity: customer_* + installer_ref / installer_id + lead_id
- address: address_* + address_verified_at + address_bag_id
- checks: charger_count, own_premises
- email verification MVP: email_verified_at set on first dossier-get access

**Dossier related**
- dossier_chargers
- dossier_documents
- dossier_consents
- dossier_checks
- dossier_audit_events

**Other**
- leads, installers
- contact_messages
- outbound_emails
- idempotency_keys

---

## 5) Hard DB constraints (gevalideerd)

### 5.1 `dossier_checks`
✅ Correct:
- `UNIQUE (dossier_id, check_code)` via `dossier_checks_dossier_id_check_code_unique`
- FK dossier_id → dossiers(id) ON DELETE CASCADE

**Implication:** upsert onConflict "dossier_id,check_code" is correct.

### 5.2 `dossier_documents`
- `CHECK`: doc_type in (factuur,foto_laadpunt) ⇒ charger_id IS NOT NULL  
  (`dossier_documents_doc_type_requires_charger_chk`)
- FK charger_id → dossier_chargers(id) ON DELETE SET NULL  ✅ (charger delete leaves docs, decoupled)
- FK dossier_id → dossiers(id) ON DELETE CASCADE

### 5.3 `dossier_chargers`
- `UNIQUE(serial_number)` (globaal)
- FK dossier_id → dossiers(id) ON DELETE CASCADE

### 5.4 `dossiers`
- `CHECK (charger_count IS NULL OR charger_count >= 1)`  
  (Let op: geen max in DB; max zit in edge validation)
- FK installer_id → installers(id) ON DELETE SET NULL
- FK lead_id → leads(id) ON DELETE SET NULL

---

## 6) Dossier state machine (contract)

- `incomplete` (missingSteps/checks fail)
- `ready_for_review` (checks pass, nog niet gelocked)
- `in_review` (finalize true, locked_at gezet)
- `ready_for_booking` (later; admin/inboeker stap)

Lock rule (source of truth):  
`locked_at != null OR status in ('in_review','ready_for_booking')`

---

## 7) Audit matrix v1 (wat nu al bestaat)

System:
- dossier_created
- email_verified_by_link
- dossier_review_rejected_incomplete
- dossier_ready_for_review
- dossier_locked_for_review

Customer:
- access_updated
- address_saved_verified
- charger_added / charger_updated / charger_deleted
- document_upload_url_issued
- document_deleted
- consents_saved

---

## 8) Red flags (prioriteit, impact, fixrichting)

P0 — Abuse / spam / deliverability
- `api-lead-submit` + contact flow is spam-relay zonder rate limiting/captcha.
- mail-worker heeft geen retry/backoff → tijdelijke Resend errors worden permanent “failed”.
**Fixrichting:** rate limit (IP/email), captcha voor contact, retries/backoff met max attempts.

P0 — Upload status semantiek
- `upload-url issued` ≠ `file uploaded`.
**Fixrichting:** status flow `issued/pending` → `uploaded` via confirm endpoint of client confirm call.

P1 — Idempotency semantics in frontend
- Als retries een nieuwe Idempotency-Key krijgen, dan is “replay” kapot.
**Fixrichting:** per actie 1 idem key genereren en hergebruiken bij retry.

P1 — Centraliseer CORS allowlist
- deploy previews moeten overal consistent werken.
**Fixrichting:** shared CORS helper + env `ALLOWED_ORIGINS`.

P1 — Audit correlation
- audit mist request_id/actor_ref, waardoor reconstructie lastig is.
**Fixrichting:** request_id = Idempotency-Key waar aanwezig, actor_ref = hash prefix token of installer_id.

P2 — Naming / consolidation edge functions
- save/update/upsert inconsistent (access-save vs access-update legacy).
**Fixrichting:** migratieplan i.p.v. “even hernoemen”; endpoints stable houden, intern refactoren.

---

## 9) Backlog (concreet, veilig uitvoeren)

1) Abuse controls (lead-submit/contact) + mail-worker retries
2) Upload confirm flow (document status) + UI update
3) Frontend idempotency key reuse per action
4) Central CORS helper + unify allowlist
5) Audit correlation fields (request_id/actor_ref) + minimal logging standards
6) Remove/retire legacy endpoint `api-dossier-access-update` (na confirm usage)
7) Document download audit (optioneel, privacy afweging)
