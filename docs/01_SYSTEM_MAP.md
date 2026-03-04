# 01_SYSTEM_MAP.md (current state, rewrite-ok)

# ENVAL — System Map (CURRENT)

Statusdatum: 2026-02-19  
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
- ./installateur.html (legacy)
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
- ./assets/js/pages/dossier.js
- ./assets/js/api.js (shared helpers: url params, session token storage, apiPost wrapper)


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
- Entry URL blijft: `./dossier.html?d=<uuid>&t=<token>`

**Start-auth (link-token `t`)**
- `t` is een one-time, expirable link-token.
- Wordt uitsluitend gebruikt om een server-side session te minten.

**Runtime-auth (session-token)**
- Na exchange gebruikt de wizard uitsluitend een session-token:
  - `Authorization: Bearer <session_token>`
- Session-token wordt per dossier opgeslagen in localStorage.

**Server-side source of truth**
- Sessions staan in `public.dossier_sessions` (expired/revoked → reject).

**Exchange gebeurt in `api-dossier-get` (geen aparte exchange function)**
- Mode A: client stuurt `{ dossier_id, session_token }` → `authSession(...)`
- Mode B: client stuurt `{ dossier_id, token }` → consume link-token + mint session + return `session_token`

Frontend helper:
- `assets/js/api.js` levert:
  - `getDossierIdFromUrl()` / `getLinkTokenFromUrl()`
  - `getSessionToken(dossierId)` / `setSessionToken(dossierId, tok)`

Locked UX wanneer:
- `dossier.locked_at != null` OR `status IN ('in_review','ready_for_booking')`

Evaluate-flow:
- finalize=false → precheck (geen lock)
- finalize=true  → lock + in_review
- “dirtySincePrecheck” gating is leidend in UI

### Uploadgedrag (Phase-2, actueel)
- Foto’s (`foto_laadpunt`) worden **client-side geoptimaliseerd** vóór upload.
- Originele bestanden tot **25MB** toegestaan vóór verwerking.
- Finale upload naar storage is doorgaans <500KB.
- Wizard stuurt uitsluitend finale bytes + metadata naar Edge.

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
- MID informatie per laadpaal: `dossier_chargers.mid_number` (CURRENT, NOT NULL; zie Stap 3)
- `dossier_documents` (issued/confirmed, sha256, storage bucket/path, immutability op confirmed)
- `dossier_consents` (append-only, immutable)
- `dossier_checks` (UNIQUE dossier_id+check_code)
- `dossier_audit_events` (append-only audit trail)
 
### MID model (CURRENT — Optie A, harde systeemeis)

Self-serve dossiers ondersteunen uitsluitend laadpalen met MID-meter.

Architectuur:

- GEEN dossier-level has_mid
- leads.has_mid = intake indicatie (boolean)
- Per laadpaal: mid_number (string, NOT NULL)
- api-dossier-charger-save reject indien mid_number ontbreekt
- Non-MID dossiers worden niet aangemaakt

Audit/export interpretatie:
- mid_number = “customer-declared MID-number”
- Existence validated
- Authenticity not verified



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
  - Issuet signed upload URL
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

#### Mail-worker — Gateway auth is óók verplicht (ops critical)

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
- api-dossier-address-preview (UI comfort, géén audit)
- api-dossier-address-verify (dossier-scoped preview + audit)
- api-dossier-address-save (write + PDOK verify + audit)

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
- Link-token is niet voldoende voor dossier reads/writes.
- Session-token is vereist.

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

### 9.2 Local sanity checks (macOS)
- Gebruik `python3` (niet `python`) voor sanity scripts.

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

---

# EINDE 01_SYSTEM_MAP.md (current state, rewrite-ok)