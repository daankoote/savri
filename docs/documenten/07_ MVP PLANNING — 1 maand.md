# 07_MVP_PLANNING.md

# ENVAL — MVP Planning (1 maand naar live)

Start: 17-02-2026  
Doel live: 17-03-2026  

Principes:
- Audit-first blijft leidend.
- Geen scope creep.
- Eén converteerbare flow: bezoeker → dossier → lock → export.
- Geen backend-uitbreidingen tenzij blokkade.
- UI en journey zijn nu P0 voor verkoopbaarheid.

---

## Kritiek pad

Intake → Dossier wizard → Lock → Export/Download → Overdraagbaar bewijs

Review, externe verificatie, partnerflows = later.

---

# WEEK 1 — Hardening & Shipped Path

Doel:
Eén volledige, stabiele happy flow die niet kan lekken, driften of audit breken.

### 1. Uniform write contract

Alle dossier write endpoints volgen exact:

auth → lock-check → business rules → validate → write → audit (success/reject)

Met name controleren:
- api-dossier-charger-save
- api-dossier-upload-url
- api-dossier-upload-confirm
- api-dossier-evaluate

### 2. Lock-contract expliciet

Editable:
- incomplete
- ready_for_review

Locked:
- in_review
- ready_for_booking

Alle write endpoints blokkeren bij lock.

### 3. Export/download gates

Export/download mag alleen wanneer:
- dossier.locked_at != null
- alle documenten confirmed

Rejects moeten auditwaardig zijn.

### 4. Testcontract uitbreiden

scripts/tests/run_all.sh moet aantonen:
- lock enforcement werkt
- reject audits worden geschreven
- idempotency replay correct werkt

**Deliverable eind week 1:**
- audit-tests groen
- 1 dossier volledig door wizard → lock → export/download

---

# WEEK 2 — UI Journey & Conversie

Doel:
Van technisch product → verkoopbaar product.

### 1. Funnel structuur

Stap 0: Pre-check (UI-only)
Stap 1: Intake (ev_direct)
Stap 2–5: Dossier wizard
Stap 6: Indienen (evaluate finalize=true)

Geen alternatieve paden.
Geen installateurflows in primary journey.

### 2a. Terminologie corrigeren

Nooit:
- “email verified”
- “geautoriseerd”
- “self-serve”

Wel:
- “toegang via dossierlink”
- “dossier indienen”
- “auditwaardig dossier”

### 2b. Positionering scherp houden

- Expliciet communiceren dat Enval géén inboeker is.
- Export (Audit Pack) positioneren als overdraagbaar artefact.
- Geen taal gebruiken die compliance of certificering suggereert.

### 3. Frictie minimaliseren

- Autosave per stap
- Duidelijke voortgang
- Locked state duidelijk read-only
- Download/export prominent zichtbaar bij lock

**Deliverable eind week 2:**
- End-to-end flow werkt in browser
- Copy is juridisch correct en audit-proof
- Geen interne terminologie zichtbaar

---

# WEEK 3 — Operationaliseren

Doel:
Geen handmatige interventies nodig.

### 1. Mail scheduling failsafe

Naast fast-path:
- Cron/scheduler elke 2 minuten
- Bewijs: queued → sent zonder handmatige curl

### 2. Observability

- request_id door frontend genereren en doorgeven
- SQL snippet in ops runbook:
  - queued mails
  - failed mails
  - locked dossiers
  - stuck processing

### 3. Abuse controls light

- Basic rate limit op api-lead-submit
- Logging bij throttle
- Geen heavy anti-bot nu

**Deliverable eind week 3:**
- Mail queue werkt autonoom
- Geen silent failures
- Basis monitoring aanwezig

---

# WEEK 4 — Polishing & Go-Live

Doel:
Publieke lancering zonder reputatieschade.

### 1. Legal & disclaimers

- Geen garantie op ERE/vergoedingen
- Rolverdeling helder
- Privacy/terms consistent met data retention

### 2. UX polish

- Heldere foutmeldingen
- Empty states
- Mobile sanity
- Performance sanity

### 3. Launch checklist

- Netlify deploy gecontroleerd
- Environment vars correct
- Curl smoke tests
- Browser end-to-end test
- 1 echte proefaanmelding

**Deliverable eind week 4:**
Live MVP

# EINDE 07_MVP_PLANNING.md