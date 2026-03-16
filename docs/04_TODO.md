# 04_TODO.md (CURRENT)

Statusdatum: 2026-03-15  
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

### 5) Session-auth hardening afronden (`dossier_sessions`)
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


### 7) Docs hygiene: CURRENT docs consistent en renderbaar houden
- Context:
  - docs zijn inhoudelijk sterk, maar markdown-formatting en CURRENT-vs-historie kunnen weer gaan divergeren
- DoD:
  - codevoorbeelden staan in fenced code blocks
  - CURRENT secties spreken append-only historie niet tegen
  - geen dubbele of dode secties
  - bij architectuurwijziging: current doc + changelog blijven synchroon
- Status: OPEN

### 8) Frontend contract: MID veldnaam volledig consistent met spec
- Context:
  - CURRENT docs en backend-contract gebruiken `mid_number` als canonical veld.
  - Dit item blijft alleen OPEN totdat grep-bewijs expliciet is vastgelegd na merge/sync check.
- DoD:
  - `dossier.html` input name = `mid_number`
  - `dossier.js` gebruikt `mid_number` in payload en render
  - geen `meter_id` references meer in core flow
  - grep-bewijs expliciet vastgelegd
- Status: OPEN totdat grep formeel bevestigd en vastgelegd is

### 9) Positionering consistent houden in product & copy
- DoD:
  - geen compliance-claims in UI
  - geen verificatieclaims
  - geen certificeringsclaims
  - Inboeker ≠ Enval expliciet zichtbaar
- Status: OPEN (doorlopend)

### 10) SEO artifacts live zetten / verifiëren
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

### 11) Factuur analysis v1 (eerste echte inhoudelijke implementatie)
- Context:
  - Analysis v1 skeleton + export v5 zijn live en bewezen
  - testdossier + meerdere invoice-varianten zijn nu beschikbaar voor ontwikkelwerk
  - richting is aangescherpt in `11_ANALYSE_PLAN.md`
- DoD:
  - scope v1 blijft eerst strikt `factuur`
  - in `dossier_analysis_document.observed_fields` opslaan:
    - `address_text`
    - `postcode`
    - `house_number`
    - `street`
    - `city`
    - `brand`
    - `model`
    - `serial_number`
    - `mid_number`
    - `invoice_date`
  - in `dossier_analysis_charger` schrijven:
    - `invoice_address_match`
    - `invoice_brand_match`
    - `invoice_model_match`
    - `invoice_serial_match`
    - `invoice_mid_match`
  - statussen uitsluitend:
    - `pass`
    - `fail`
    - `inconclusive`
    - `not_checked`
  - observed / declared / evaluated semantiek expliciet gescheiden houden
  - geen lifecycle-impact:
    - geen lock mutatie
    - geen dossier_checks mutatie
    - geen export gate op analysis-uitkomst
  - export toont echte analysis-blokken i.p.v. skeleton placeholders
- Status: OPEN

### 12) Foto analysis v1 (fase ná factuur)
- Context:
  - foto-analyse blijft bewust secundair aan factuur-analyse
  - foto-checks zijn zwakker en zullen vaak terecht `inconclusive` zijn
  - richting is aangescherpt in `11_ANALYSE_PLAN.md`
- DoD:
  - alleen starten nadat factuur analysis v1 contractueel groen is
  - document-level observed fields voorbereiden voor:
    - `charger_visible`
    - `brand_visible`
    - `brand`
    - `model_visible`
    - `model`
    - `serial_label_visible`
    - `serial_number`
    - `mid_label_visible`
    - `mid_number`
  - charger-level checks beperkt tot:
    - `photo_charger_visible`
    - `photo_brand_match`
    - `photo_model_match`
    - `photo_serial_match`
    - `photo_mid_match`
  - standaard liever `inconclusive` dan geforceerde zekerheid
  - duidelijke limitations in export en audit
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

# EINDE 04_TODO.md