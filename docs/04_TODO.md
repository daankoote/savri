# 04_TODO.md (current state, rewrite-ok)

# ENVAL — TODO (CURRENT)

Statusdatum: 2026-02-17  
Prioriteit: audit-first.  
Regel: alleen open items; afgerond → naar changelog.

## P0 (must)
1) JWT rotation doorvoeren op alle runtime plekken
→ DONE (2026-02-09, bewijs via curl + audit-tests)
2) P0 — Session continuity (kritiek: users moeten later verder kunnen)
- Probleem:
  - session TTL (2h) + one-time link-token → “later verder gaan” breekt.
  - Users moeten info opzoeken/aanvragen; dossier invullen is niet in 1 sessie.
- Doel (MVP):
  - Users kunnen binnen een redelijke periode (bv. dagen/weken) opnieuw inloggen en verder gaan.
- Minimale oplossingsrichtingen (kies 1 in volgende sessie):
  A) Magic-link re-issue flow (zonder dashboard):
     - endpoint: `api-dossier-login-request` → mail nieuwe one-time link
     - rate-limit + audit events
  B) Session refresh mechanisme:
     - refresh token (httpOnly cookie) of server-side refresh key (phase-2/3; complexer)
  C) “Dashboard light”:
     - email-based login + dossier lijst (later; meer UI + auth werk)

- Acceptance criteria:
  - user kan na 24h+ opnieuw toegang krijgen zonder support
  - audit events: login_request, link_issued, link_consumed, session_created, session_rejected
  - abuse-controls: rate limit per email/ip + backoff

## P1 (must/should)
1) outbound_emails: next_attempt_at + index  — DONE (2026-02-09)
2) outbound_emails: dossier_id nullable      — DONE (2026-02-09)
3) Mail audit events (fail-open, dossier-scoped) — DONE (2026-02-09)
4) “Mail-worker: stuck processing recovery” → DONE zodra bewezen met één geforceerde stuck case (kan later).
5) Max chargers self-serve cap = 4 (frontend + api-lead-submit) — DONE (2026-02-11)

6) Canonical testset + auth headers vastleggen (docs + scripts)
- DoD:
  - Alle curl voorbeelden gebruiken altijd:
    - `apikey: $SUPABASE_ANON_KEY`
    - `authorization: Bearer $SUPABASE_ANON_KEY`
  - En bij write endpoints:
    - `Idempotency-Key: <unique>`
  - Docs beschrijven expliciet gateway-401 vs function-reject.
- Status: DONE (2026-02-12) — via doc updates + bewijs curl outputs.

7) Tooling consistentie: python3 op macOS
- DoD: docs/commands gebruiken `python3` (niet `python`) voor sanity checks/scripts.
- Status: DONE (2026-02-12)

8) Intake eligibility gates: NL + MID (self-serve)
- DoD (functioneel):
  - Frontend `aanmelden.html` vraagt:
    - in NL? (bool)
    - heeft de laadpaal een MID? (bool)
    - (optioneel) mid_number input (text) als “als je dit hebt, vul in”
  - Backend `api-lead-submit` enforce voor `ev_direct`:
    - reject als `in_nl != true` of `has_mid != true`
    - error message: “Self-serve is alleen voor NL + MID.”
- DoD (data model):
  - `leads` bevat intake velden (`in_nl`, `has_mid`, optioneel `mid_number` of per-charger later)
  - `dossier_chargers` bevat `mid_number` (string, NOT NULL) per laadpaal
  - Er bestaat geen dossier-level of charger-level `has_mid` boolean meer

- DoD (audit):
  - Kies auditpositie (pre-dossier off-chain vs dossier-scoped reject) en documenteer in Audit Matrix.
  - Bewijs via curl: reject case + audit/log bewijs volgens gekozen auditpositie.
- Status: DONE (2026-02-17)

9) Phase-2 document updaten naar CURRENT (geen plan vs current)
- DoD:
  - upload-confirm = server-side sha256 verify (CURRENT)
  - intake gates NL+MID opgenomen
  - consistent met 00_GLOBAL/01_SYSTEM_MAP/02_AUDIT_MATRIX
- Status: DONE (2026-02-12)

10) api-lead-submit: eligibility gate ordering harden + regressie-test
- Context:
  - Behavior is bewezen: pre-dossier reject (NL/MID) + intake_audit_events + idempotency replay.
- DoD:
  - Guardrails in code expliciet en vroeg:
    - eligibility checks vóór elke DB write (lead/dossier/mail)
    - intake_audit_events write is fail-open maar best-effort
  - Voeg regressie-test toe in scripts/audit-tests.sh:
    - NL=false → 400 + intake_audit_events row + idempotency replay
    - MID=false → 400 + intake_audit_events row + idempotency replay
    - OK → lead+dossier+mail
- Status: OPEN


11) Defense-in-depth policies op audit tabellen
- DoD:
  - `deny_all` policy aanwezig op `public.intake_audit_events` en `public.dossier_audit_events` voor anon/auth
  - (grants blijven ook dicht)
- Status: OPEN totdat `pg_policies` expliciet bevestigt dat beide deny_all policies bestaan

12) Charger audit completeness
- DoD:
  - charger_added en charger_updated events bevatten:
    - mid_number
    - serial_number
    - brand
    - model
    - power_kw
    - notes
- Status: DONE (2026-02-17, bewezen via audit query)

13) OPS-runbook enforcement: gateway-401 preventie (mail-worker + alle functions)
- DoD:
  - 06_OPS_RUN_DEBUG_BOOK.md bevat canonical rule + diagnose matrix voor gateway-401 vs function-401.
  - Alle curl snippets in docs bevatten standaard:
    - `apikey: $SUPABASE_ANON_KEY`
    - `authorization: Bearer $SUPABASE_ANON_KEY`
  - Eén “stop rule”: bij `Missing authorization header` nooit code debuggen, eerst headers fixen.
- Status: OPEN (totdat alle docs/snippets audited zijn + 1× herhalingstest door Daan bevestigd)

14) Frontend legacy CSS isolation — OUTDATED (legacy.css bestaat niet; single stylesheet is CURRENT)

- DoD:
  - legacy pages includen legacy.css <-- legacy.css bestaat niet meer sinds 25-02-2026, alles gebruikt nu style.css>
  - core pages includen alleen style.css
  - grep check blijft groen:
    - style.css bevat geen .page-hero/.prose/.pricing-grid/.timeline-wrap etc.
- Status:  DONE (2026-02-23) 1× browser smoke test is bevestigd op: 
  - index.html
  - aanmelden.html
  - pricing.html

15) Session-auth hardening (dossier_sessions) — WIP
- DoD:
  - Dossier read/write endpoints vereisen session-token (Bearer).
  - Session TTL enforced via `dossier_sessions.expires_at`.
  - Revoked sessions blokkeren reads/writes.
  - last_seen_at wordt minimaal bij dossier-get bijgewerkt (rate-limited / best-effort).
  - Audit events aanwezig voor session created + session invalid.
- Status: OPEN

16) Frontend shared API layer (assets/js/api.js) — align + adopt
- DoD:
  - dossier.js gebruikt uitsluitend helpers uit `api.js` voor:
    - url parsing (`d`, `t`)
    - session token get/set/clear
    - `apiPost()` wrapper
  - Legacy localStorage key (`enval_session_token`) is opgeschoond.
  - Geen dubbele fetch wrappers meer verspreid over pages.
- Status: OPEN (totdat grep bewijst dat oude helpers weg zijn)

## PATCH 2026-02-24

17) Frontend contract: MID veldnaam consistent met spec
- DoD:
  - dossier.html input name = `mid_number`
  - dossier.js gebruikt `mid_number` in payload en render
  - geen `meter_id` references meer in core flow
- Status: OPEN totdat grep bewezen schoon is (meter_id in core)

18) Export/payment decoupling voorbereiden (Optie 1 nu, Optie 2 later)
- DoD:
  - Docs: 00_GLOBAL + 01_SYSTEM_MAP + 02_AUDIT_MATRIX bevatten contract.
  - Implementatie later: payment gate kan worden toegevoegd op export (en optioneel op indienen) zonder schema drift.
- Status: OPEN (docs done zodra gecommit; implementatie later)

18) Positionering consistent houden in product & copy
- DoD:
  - Geen compliance-claims in UI
  - Geen verificatieclaims
  - Geen certificeringsclaims
  - Inboeker ≠ Enval expliciet zichtbaar
- Status: OPEN (doorlopend)

19) SEO artifacts live zetten (robots + sitemap + dev noindex) --> eerst met test checken wat er al gebeurd is.. ik denk namelijk al af, 

Waarom:
- Duplicate content voorkomen.
- Google index alleen canoniek houden.

Taken:
- Root robots.txt toevoegen:
- Sitemap: https://www.enval.nl/sitemap.xml
- Disallow tijdelijke routes (minimaal aanmelden_real.html zolang die bestaat)

Root sitemap.xml toevoegen:
- Alleen canonieke publieke pages (index/aanmelden/hoe-het-werkt/pricing/regelgeving/voorwaarden/privacy)
- aanmelden_real.html → <meta name="robots" content="noindex, nofollow"> in <head>.

Definition of Done:
- https://www.enval.nl/robots.txt bereikbaar (200) en bevat sitemap-verwijzing.
- https://www.enval.nl/sitemap.xml bereikbaar (200) en valide XML.
- aanmelden_real.html noindex bevestigd (view source).



## P1.5 / Phase-2 (risico’s die je niet mag vergeten)
1) PDOK ambiguity zonder suffix
- DoD: als meerdere candidates → suffix verplicht of verified=false + audit ambiguous; geen save.

2) upload-confirm performance redesign (na migratie)
- DoD: alternatief verify ontwerp + besluit + implementatieplan (niet per se meteen bouwen).

3) Orphaned storage reconciler
- DoD: job/edge function die storage failures opnieuw probeert op basis van audit events.

4) submit-review vs evaluate overlap
- DoD: kies: submit-review wrapper naar evaluate, of deprecated 410; voorkom drift.

5) Email verification assumption (audit risk)
- DoD: expliciet blijven labelen; Phase-2 echte mailbox-control flow.
- Huidig gedrag: `email_verified_at` gezet op link-click.
- Audit event: `email_verified_by_link` met expliciete assumption.
- Probleem:
  - Geen hard bewijs van mailbox-control.
  - Terminologie “verified” is audit-technisch te sterk.
- DoD (later):
  - óf semantiek aanpassen (bijv. `email_link_clicked_at`)
  - óf verificatie upgraden (OTP / single-use / TTL).
- Status: bewust uitgesteld om Phase-2 uploadstrategie niet te verstoren.

6) Deno std imports stabiliseren (jsr:@std i.p.v. deno.land)
- DoD: alle functions gebruiken jsr:@std/http... zodat deploy niet afhankelijk is van deno.land availability.
- Status: DONE (2026-02-09)

7) Installer flows (installer_signup + installer_to_customer) definitief deprecaten
- DoD:
  - beslis: behouden, beperken, of deprecaten
  - documenteer gewenste eindstate + migratiepad (incl. UI routes)
- Status: OPEN
Installer flows deprecatie
- Frontend script.js bevat nog handlers voor installer_signup en installer_to_customer.
- Backend retourneert 410.
- DoD:
  - Verplaats installer flows naar legacy map of verwijder bindings
  - Zorg dat self-serve journey single-path blijft (ev_direct + contact)
- Status: OPEN




## Phase-2 Abuse controls, scope & uploadstrategie

1) Client-side compressie voor foto-uploads
- DoD: foto’s vóór upload gecomprimeerd; server ziet alleen finale bytes
- Audit: transformatie metadata vastgelegd
— DONE (bewijs geleverd)

2) Deferred upload-confirm verificatie
- DoD: server-side sha256 alleen bij finalize/export/download
- upload-confirm blijft auditwaardig maar goedkoper
— OPEN (besluit + implementatieplan)

- Extra DoD (audit/contract):
  - Documenteer expliciet welke audit event(s) bewijzen dat de sha256 check is gedaan, en op welke gate.
  - Voeg één van de volgende toe (keuze maken):
    - `verification_mode` + `verified_at_gate` velden in event_data,
    - of aparte audit events voor gate-verificatie.
  - Update audit-tests:
    - bewijs dat “unverified docs” export/download blokkeren,
    - en bewijs dat gate-verificatie een audit event schrijft (success + reject).


3) UI beperken tot particuliere dossiers
- DoD: max 4 laadpalen in UI
- Backend max blijft 10
— DONE (max 4)

4) Installateur-flow deprecaten
- DoD:
  - geen installateur-accounts of dossier-creatie
  - installer_ref alleen als herkomst-metadata
  - geen vergoedingslogica
- OPEN (besluit volgt)

5) Abuse controls
- rate limit / abuse detection op api-lead-submit/contact
- DoD: basic throttling + logging + minimale blokkade
 — OPEN

6) Installer flows (installer_signup + installer_to_customer) zijn nog actief (besluit volgt)
- Context:
  - Installateurs kunnen nog accounts maken en EV-rijders aanmelden.
- DoD (later):
  - Beslis: behouden, beperken, of deprecaten.
  - Documenteer gewenste eindstate + migratiepad (incl. UI routes).
- Status: OPEN (bewust later)


---

## APPEND-ONLY UPDATE — 2026-03-04 — TODO hygiene: CSS items opgeschoond (zonder delete)

- Alle verwijzingen naar `legacy.css` zijn OUTDATED omdat het project nu single-stylesheet is.
- Nieuwe regel: als styling-issues ontstaan → fix in `assets/css/style.css` met component/variant, geen tweede stylesheet.
- Actiepunt (doorlopend): grep op `legacy.css` moet 0 zijn in core pages + docs.


---

# EINDE 04_TODO.md (current state, rewrite-ok)