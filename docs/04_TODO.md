# ENVAL — TODO (CURRENT)

Statusdatum: 2026-03-12  
Prioriteit: audit-first.  
Regel: alleen open items; afgerond → naar changelog.

## P1 (must/should)

### 1) api-lead-submit: eligibility gate ordering harden + regressie-test
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

### 2) Defense-in-depth policies op audit tabellen
- DoD:
  - `deny_all` policy aanwezig op `public.intake_audit_events` en `public.dossier_audit_events` voor anon/auth
  - grants blijven dicht
  - bevestigd via `pg_policies`
- Status: OPEN

### 3) OPS-runbook enforcement: gateway-401 preventie (mail-worker + alle functions)
- DoD:
  - `06_OPS_RUN_DEBUG_BOOK.md` bevat canonical rule + diagnose matrix voor gateway-401 vs function-401
  - alle curl snippets in docs bevatten standaard:
    - `apikey: $SUPABASE_ANON_KEY`
    - `authorization: Bearer $SUPABASE_ANON_KEY`
  - één stop-rule: bij `Missing authorization header` nooit code debuggen, eerst headers fixen
  - 1× herhalingstest door Daan bevestigd
- Status: OPEN

### 4) Mail-worker stuck processing recovery — bewijs sluiten
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

### 5) Session-auth hardening (`dossier_sessions`)
- Context:
  - session-auth is nu canonical voor dossier read/write endpoints
  - shared helper `supabase/functions/_shared/customer_auth.ts` bestaat
- Open DoD:
  - bevestigen dat alle dossier runtime endpoints shared auth helper gebruiken waar dat logisch is
  - bevestigen dat session reject-audits overal reason-consistent zijn
  - beslissen of `last_seen_at` actief moet worden bijgewerkt of bewust deferred blijft
  - expliciet bewijs leveren voor expired + revoked session reject gedrag op meerdere endpoints
- Status: OPEN

### 6) Tombstone / archive lifecycle voor audit-gebonden testdossiers
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

### 7) Frontend shared API layer (`assets/js/api.js`) — proof sluiten
- Context:
  - `assets/js/api.js` is nu canonical frontend shared helper
  - foutieve duplicate onder `supabase/functions/_shared/api.js` is verwijderd
- Open DoD:
  - expliciet grep-bewijs bewaren dat er geen runtime references meer bestaan naar `supabase/functions/_shared/api.js`
  - bevestigen dat dossierflow uitsluitend `window.ENVAL.api.*` helpers gebruikt voor shared auth/session/api gedrag
- Status: OPEN (alleen nog bewijs/admin hygiene)

### 8) Frontend contract: MID veldnaam volledig consistent met spec
- DoD:
  - `dossier.html` input name = `mid_number`
  - `dossier.js` gebruikt `mid_number` in payload en render
  - geen `meter_id` references meer in core flow
  - grep-bewijs geleverd
- Status: OPEN totdat grep bewezen schoon is

### 9) Export/payment decoupling voorbereiden
- DoD:
  - docs (`00_GLOBAL`, `01_SYSTEM_MAP`, `02_AUDIT_MATRIX`) bevatten het contract correct
  - implementatie later: payment gate kan worden toegevoegd op export (en optioneel op indienen) zonder schema drift
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

### 12) PDOK ambiguity zonder suffix
- DoD:
  - als meerdere candidates → suffix verplicht of `verified=false` + audit ambiguous
  - geen save bij onopgeloste ambiguity
- Status: OPEN

### 13) Upload-confirm performance redesign / deferred verificatie
- DoD:
  - alternatief verify-ontwerp + besluit + implementatieplan
  - expliciet auditcontract voor waar sha256-verificatie gebeurt:
    - `verification_mode` + `verified_at_gate`
    - of aparte audit events voor gate-verificatie
  - audit-tests bewijzen:
    - unverified docs blokkeren export/download
    - gate-verificatie schrijft audit event (success + reject)
- Status: OPEN

### 14) Orphaned storage reconciler
- DoD:
  - job/edge function die storage failures opnieuw probeert op basis van audit events
- Status: OPEN

### 15a) Reviewflow doc cleanup na verwijderen legacy endpoint
- Context:
  - `api-dossier-submit-review` is verwijderd
  - canonical endpoint is `api-dossier-evaluate`
- Open DoD:
  - alle docs/repo-lists/contracts/changelogs volledig opschonen zodat geen CURRENT referenties meer suggereren dat submit-review nog bestaat
- Status: OPEN

### 15b) Address preview doc cleanup na verwijderen legacy endpoint
- Context:
  - `api-dossier-address-preview` is verwijderd
  - canonical preview loopt via `api-dossier-address-verify`
- Open DoD:
  - alle docs/contracts/auditbeschrijvingen volledig opschonen zodat address-preview nergens meer als actuele endpoint staat
- Status: OPEN

### 16) Email verification assumption (audit risk)
- Context:
  - huidig gedrag: `email_verified_at` gezet op link-click
  - dit bewijst geen mailbox-control, alleen possession of link
- DoD:
  - expliciet blijven labelen zolang CURRENT gedrag actief is
  - later:
    - óf semantiek aanpassen (bijv. `email_link_clicked_at`)
    - óf verificatie upgraden (OTP / single-use / TTL)
- Status: OPEN

### 17) Installer flows definitief deprecaten
- Context:
  - `installer_signup` en `installer_to_customer` zijn nog restmatig aanwezig
  - backend retourneert 410
- DoD:
  - beslis: behouden, beperken of volledig deprecaten
  - documenteer eindstate + migratiepad
  - verwijder legacy bindings zodat self-serve journey single-path blijft (`ev_direct` + contact)
- Status: OPEN

### 18) Abuse controls
- DoD:
  - rate limit / abuse detection op `api-lead-submit` en contactflow
  - basic throttling + logging + minimale blokkade
- Status: OPEN

# EINDE 04_TODO.md