# 01_SYSTEM_MAP.md (current state, rewrite-ok)

# ENVAL — System Map (CURRENT)

Statusdatum: 2026-02-09  
Repo root: /Users/daankoote/dev/enval  
Branch context: feature/pricing-page (main = pilot index)

## 1) Frontend (static)
### Pages
- ./aanmelden.html
- ./dossier.html
- ./hoe-het-werkt.html
- ./index.html
- ./installateur.html
- ./mandaat.html
- ./pricing.html
- ./privacyverklaring.html
- ./proces.html
- ./regelgeving.html
- ./voorwaarden.html

### Assets / scripts
- ./assets/css/style.css
- ./assets/js/config.js
- ./assets/js/script.js
- ./assets/js/pages/dossier.js

## 2) Frontend responsibilities (kern)
### 2.1 config.js
Single source of truth (non-module, `window.ENVAL.*`)
- SUPABASE_URL
- SUPABASE_ANON_KEY
- API_BASE = `${SUPABASE_URL}/functions/v1`
- `edgeHeaders(extraHeaders)` merge:
  - Content-Type
  - apikey
  - Authorization
  - + extra: Idempotency-Key, X-Request-Id

**Implicatie:** Edge endpoints zijn publiek aanroepbaar (anon).  
➡️ Alle security hoort in edge: auth/locks/abuse-controls/validatie.

### 2.2 script.js
- Form multiplexer: `api-lead-submit` (flows: ev_direct, installer_to_customer, installer_signup, contact)
- Anti double submit: `lockSubmit`

### 2.3 dossier.js (wizard)
Entry: `./dossier.html?d=<uuid>&t=<token>`
- `reloadAll()` → `api-dossier-get`
- “write → reloadAll()” patroon

Locked UX wanneer:
- `dossier.locked_at != null` OR `status IN ('in_review','ready_for_booking')`

Evaluate-flow:
- finalize=false → precheck (geen lock)
- finalize=true  → lock + in_review
- “dirtySincePrecheck” gating is leidend in UI

## 3) Backend platform
- Supabase DB + Storage
- Edge functions (Supabase Functions)
- Resend voor transactional mails
- Google Workspace voor inkomend/human mail
- Netlify voor hosting/domains

## 4) Core DB tables (samenvatting)
### Dossier core
- `dossiers` (status, locked_at, access_token_hash, address fields, charger_count, own_premises, email_verified_at MVP)
- `dossier_chargers` (serial unique, dossier link)
- `dossier_documents` (issued/confirmed, sha256, storage bucket/path, immutability op confirmed)
- `dossier_consents` (append-only, immutable)
- `dossier_checks` (UNIQUE dossier_id+check_code)
- `dossier_audit_events` (append-only audit trail)

### Ops / intake
- `leads`
- `installers`
- `contact_messages`
- `idempotency_keys`
- `outbound_emails`: dossier_id (nullable FK), next_attempt_at (retry scheduling)


## 5) State machine (dossier)
- incomplete
- ready_for_review
- in_review (locked)
- ready_for_booking (later)

Lock rule (source of truth):
- locked_at != null OR status IN ('in_review','ready_for_booking')

## 6) Edge functions inventory (current)
### Lead + mail
- api-lead-submit
  - writes: leads/installers/dossiers/contact_messages/outbound_emails/idempotency_keys
  - audit: alleen dossier_created bij dossier create (audit-light)
- mail-worker
  - verwerkt outbound_emails queued → sent/failed/requeued
  - guards:
    - gateway auth headers vereist: apikey + Authorization (anon)
    - extra secret guard: x-mail-worker-secret == MAIL_WORKER_SECRET
  - scheduling:
    - selectie op next_attempt_at (<= now) + attempts < MAX_ATTEMPTS
  - audit (dossier-scoped, fail-open):
    - mail_sent / mail_requeued / mail_failed wanneer outbound_emails.dossier_id != null


### Dossier read/write (wizard steps)
Stap 1 — Access
- api-dossier-access-save (write, idempotency, MLS, locks)
- api-dossier-access-update (patch-style, idem)

Stap 2 — Address
- api-dossier-address-preview (UI comfort, géén audit)
- api-dossier-address-verify (dossier-scoped preview + audit)
- api-dossier-address-save (write + PDOK verify + audit)

Stap 3 — Chargers
- api-dossier-charger-save (create/update, idempotency, MLS, locks, max chargers)
- api-dossier-charger-delete (cascade cleanup + audit)

Stap 4 — Documents
- api-dossier-upload-url (issue signed upload url + insert issued row + audit)
- api-dossier-upload-confirm (server-side sha256 verify → confirmed + audit)
- api-dossier-doc-delete (delete draft/issued only; confirmed immutable; strict idempotency)
- api-dossier-doc-download-url (signed download url; locked+confirmed gate; audit success + reject coverage)

Stap 5 — Consents
- api-dossier-consents-save (immutable; strict idempotency; audit)

Stap 6 — Review
- api-dossier-evaluate (checks + transitions + optional lock; strict idempotency)

Evidence / export
- api-dossier-export / api-dossier-dossier-export (naam checken in repo; export artifact; only locked; only confirmed docs)

Legacy/compat
- api-dossier-submit-review (overlap met evaluate(finalize=true); bij voorkeur deprecate of wrapper maken)
- api-dossier-email-verify-start/complete (waarschijnlijk outdated; MVP gebruikt “link possession”)

## 7) Security model (kern)
- Customer auth: possession token → sha256(token) == `dossiers.access_token_hash`
- Hard lock enforcement op alle write endpoints
- CORS allowlist (ALLOWED_ORIGINS + Vary: Origin)
- Mail-worker secret guard
- Service role key: **nooit delen**; rotatie bij exposure

## 8) Evidence-grade rules (contract)
- **issued ≠ confirmed**
- Alleen confirmed docs tellen mee voor review/export/download
- Confirmed docs immutable (DB policy/trigger)
- Rejects zijn auditwaardig (attempt logs)

## 9) Tooling & reproducibility
### 9.1 scripts/audit-tests.sh (contract test)
Doel (real-world default):
- Leest `dossiers.charger_count` (allowed max) uit DB
- Vult aan tot target (zonder bestaande chargers/docs te muteren)
- Draait reject tests (auth/max/notfound/idem)
- Draait happy uploads (2 docs per *nieuw* aangemaakte charger)
- Cleanup: delete alleen created chargers; backend delete cascade opruimen

Belangrijk:
- Non-destructive design: als existing == target → geen create/upload/cleanup, wél rejects + audit bewijs.

Wanneer gebruiken:
- na elke wijziging aan dossier endpoints/audit/idempotency

Wanneer niet:
- productie/live data

## 10) Working Agreement (hoe wij werken)
Input van Daan per sessie:
1) Goal (1 zin) + Phase + Priority
2) Scope: welke files/endpoints
3) Paste: huidige files (1-op-1) + test output

Output van ChatGPT per sessie:
1) Plan (max 10 bullets)
2) Code: full file(s) of exact anchor-patches
3) Exact terminal tests + expected results
4) Doc updates:
   - altijd: 03_CHANGELOG_APPEND_ONLY.md
   - alleen indien nodig: 02_AUDIT_MATRIX.md / 04_TODO.md
