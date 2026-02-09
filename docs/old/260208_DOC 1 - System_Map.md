============
BEGIN DOC 1
============

DOC 1 — Enval — System Map (One Pager)

(APPEND-ONLY UPDATE)

Versie: v1.3
Datum: 2026-01-22 12:00
Repo root: /Users/daankoote/dev/enval
Branch context: feature/pricing-page (main bevat pilot index)

Doel:
Canonical overzicht van frontend ↔ edge ↔ database ↔ lifecycle, inclusief audit-contract, immutability-regels, red flags en backlog.
Dit document is source of truth. Niets wordt verwijderd, alleen toegevoegd.

1) Frontend routes (pages)

Repo files

./aanmelden.html
./dossier.html
./hoe-het-werkt.html
./index.html
./installateur.html
./mandaat.html
./pricing.html
./privacyverklaring.html
./proces.html
./regelgeving.html
./voorwaarden.html

Assets

./assets/css/style.css
./assets/js/config.js
./assets/js/script.js
./assets/js/pages/dossier.js

2) Frontend scripts & verantwoordelijkheden
2.1 ./assets/js/config.js

Single source of truth (non-module, window.ENVAL.*)
window.ENVAL.SUPABASE_URL
window.ENVAL.SUPABASE_ANON_KEY
window.ENVAL.API_BASE = ${SUPABASE_URL}/functions/v1
window.ENVAL.edgeHeaders(extraHeaders)

Standaard headers:

* Content-Type: application/json
* apikey: <anon>
* Authorization: Bearer <anon>
* merge extraHeaders (bv. Idempotency-Key, X-Request-Id)

Implication:
Alle edge endpoints zijn publiek aanroepbaar (anon).
➡️ Alle security moet in edge zitten (auth, lock enforcement, abuse-controls, validation).

2.2 ./assets/js/script.js (landing / aanmelden / installateur / contact)

* Mobile nav
* Footer year
* Tabs (.tab-toggle / .tab-panel)
* Form handlers → 1 multiplexer: api-lead-submit

flows:

* ev_direct
* installer_to_customer
* installer_signup
* contact
* Anti double submit (lockSubmit)

2.3 ./assets/js/pages/dossier.js (dossier wizard)

Entry:
./dossier.html?d=<uuid>&t=<token>

Core pattern:
* reloadAll() → api-dossier-get
* Alle writes → daarna reloadAll()

Locked UX wanneer:

* dossier.locked_at != null
OR 
* status IN ('in_review','ready_for_booking')

Evaluate-flow (bevestigd correct):

* finalize=false → precheck, geen lock 
* finalize=true → lock + in_review

Belangrijke fix (afgerond):

* evaluate leest finalize expliciet uit body
* Frontend gating blijft correct (dirtySincePrecheck)

3) Edge functions — contractoverzicht
3.1 Lead intake + mail

* api-lead-submit
* Multiplexer voor 4 flows
* Idempotency via idempotency_keys

Writes:

* leads
* dossiers
* installers
* contact_messages
* Queue emails → outbound_emails
* mail-worker
* Verwerkt outbound_emails → sent/failed
* Guard: x-mail-worker-secret

Backlog:

* retries/backoff (nu: failed blijft failed)
* abuse controls (P0)

3.2 Dossier lifecycle — read/write

Read:

* api-dossier-get
* input: { dossier_id, token }
* auth: sha256(token) == dossiers.access_token_hash


Side-effect (MVP):
* Eerste access → email_verified_at gezet
* Audit: email_verified_by_link

Returns (sorted DESC):

* dossier_documents
* dossier_consents
* dossier_audit_events
* dossier_chargers
* dossier_checks

Write — stap per stap
Stap 1 — Toegang

= api-dossier-access-save
(legacy api-dossier-access-update nog aanwezig)

* Hard lock enforcement

--> Audit: access_updated (customer)

Stap 2 — Adres

= api-dossier-address-verify (PDOK preview)
= api-dossier-address-save (verified write)

* Writes: address_*, address_verified_at, address_bag_id

--> Audit: address_saved_verified

Stap 3 — Laadpalen

= api-dossier-charger-save

* Hard lock enforcement
* Max count = dossiers.charger_count
* Global unique serial_number

--> Audit:

* charger_added
* charger_updated
* charger_save_rejected (unauthorized, max)

= api-dossier-charger-delete
* Hard lock enforcement

Verwijdert:

* gekoppelde documenten (storage + DB)
* charger row

--> Audit: charger_deleted

Stap 4 — Documenten

= api-dossier-upload-url

* Hard lock enforcement
* Idempotency-Key verplicht
* Creates signed upload URL (bucket enval-dossiers)
* Insert dossier_documents row

--> Audit: document_upload_url_issued

Status-semantiek (belangrijk):

* issued ≠ geüpload
* Document telt niet mee tot confirm

= api-dossier-upload-confirm

* Bevestigt upload via file_sha256

Zet:

* status = confirmed
* confirmed_at/by/ip/ua/request_id

Rejects:

* missing fields
* unauthorized
* not found
* hash mismatch

--> Audit: document_upload_confirm_rejected
(success implicit via status change)

= api-dossier-doc-delete

* Auth + lock enforcement
* Confirmed documenten zijn immutable
* Idempotent gedrag bij “not found”

--> Audit:

* document_delete_rejected
* document_deleted (alleen draft)

Stap 5 — Toestemmingen

= api-dossier-consents-save

* Vereist: terms + privacy + mandaat = true
* Append-only
* Na save: immutable

--> Audit: consents_saved

Frontend:

* Opslaan knop verdwijnt
* Checkboxes disabled/grijs

Backend:
* DB weigert nieuwe inputs / aanpassingen

Stap 6 — Review

= api-dossier-evaluate

Writes:

* dossier_checks (upsert dossier_id + check_code)

Checks:

* email_verified
* address_verified
* charger_exact_count
* docs_per_charger (alleen confirmed docs)
* consents_required

Behavior:

* Incomplete → incomplete + audit reject
* Pass + finalize=false → ready_for_review
* Pass + finalize=true → in_review + lock

--> Audit:

* dossier_review_rejected_incomplete
* dossier_ready_for_review
* dossier_locked_for_review

4) Database tables (core)

Dossiers:

* lifecycle: status, locked_at
* auth: access_token_hash
* address fields
* checks: charger_count, own_premises
* email verification MVP

Related:

* dossier_chargers
* dossier_documents
* dossier_consents
* dossier_checks
* dossier_audit_events

Other:

* leads
* installers
* contact_messages
* outbound_emails
* idempotency_keys

5) Hard DB constraints (bevestigd)
5.1 dossier_checks

* UNIQUE (dossier_id, check_code)
* FK → dossiers ON DELETE CASCADE

5.2 dossier_documents

* CHECK: doc_type IN (factuur,foto_laadpunt) ⇒ charger_id IS NOT NULL
* FK charger_id → chargers ON DELETE CASCADE
* FK dossier_id → dossiers ON DELETE CASCADE
* Confirmed rows zijn immutable (trigger enforced)

5.3 dossier_chargers

* UNIQUE (serial_number) globaal
* FK dossier_id → dossiers

5.4 dossiers

* CHECK charger_count >= 1 OR NULL
* FK installer_id / lead_id → SET NULL

6) Dossier state machine
* incomplete
* ready_for_review
* in_review (locked)
* ready_for_booking (later)

Lock rule (source of truth):

* locked_at != null
OR 
* status IN ('in_review','ready_for_booking')

7) Audit matrix v1 (uitgebreid)

System:

* dossier_created
* email_verified_by_link
* dossier_review_rejected_incomplete
* dossier_ready_for_review
* dossier_locked_for_review

Customer

* access_updated
* address_saved_verified
* charger_added
* charger_updated
* charger_deleted
* charger_save_rejected
* document_upload_url_issued
* document_upload_confirm_rejected
* document_delete_rejected
* consents_saved

8) Audit & immutability model (nieuw, expliciet)

Audit tabel:
* public.dossier_audit_events

Principe:

* Audit is append-only
* Confirmed documenten zijn onverwijderbaar
* Storage volgt document-immutability
* Rejects zijn net zo auditwaardig als success
* Belangrijk inzicht (bevestigd via tests):
* “Purge” via scripts faalt bewust (Dat is bewijs van correct ontwerp, geen bug)

9) Tooling
9.1 scripts/audit-tests.sh

Reproduceerbare audit-tests voor:

* Unauthorized
* Max limits
* Not found (idempotent)
* Upload rejects
* Confirm rejects
* Script is observerend, geen muterend admin-tool.

10) Red flags (herijkt)
P0 — Service role key

* Geleakt → rotatie verplicht

P0 — Abuse

* lead/contact zonder rate limit

P1 — Upload semantiek

* issued ≠ confirmed (nu opgelost)

P1 — Audit correlation

* MLS door alle endpoints trekken

11) Backlog (concreet)

P0

* Service role key rotatie
* MLS + Idempotency Standard over alle write endpoints

P1

Admin edge function:
api-admin-dossier-reset (dev-only, audit-logged)
* Audit export/read model

P2

Externe validaties (MID/merk/model) pas na eisenpakket

12) Append-only changelog

ADD 2026-01-21 — Update op status, fixes, en next steps (append-only)

1) ADD 9.1 — Wat we hebben gedaan (technisch, concreet)

* Toestemmingen (stap 5) afgerond als “immutable”
* Backend api-dossier-consents-save is aangepast: opslaan kan alleen als terms + privacy + mandaat alle drie true zijn.

Frontend stap 5 is aangepast:

* Na succesvolle save verdwijnt de Opslaan knop (geen revoke-flow).
* Checkboxes blijven zichtbaar, worden grijs en disabled (niet meer klikbaar), zodat duidelijk is dat dit “af” is.
* UI-tekst toegevoegd/afgesproken: “Toestemmingen zijn vastgelegd en kunnen niet meer worden aangepast.”
* Review gating (stap 6) blijft correct
* api-dossier-evaluate werkt conform contract (precheck vs finalize).
* Dossier.js finalize knop blijft verborgen tot precheck OK, en wordt weer verborgen zodra er een wijziging is gedaan (dirtySincePrecheck).
* Laadpaal verwijderen (stap 3) is correct en auditbaar
* api-dossier-charger-delete verwijdert storage objects en bijbehorende document-rows en logt audit event.

2) ADD 9.2 — Wat erbij is gekomen om aan te pakken (nieuw zichtbaar)

* Audit-gap: upload-url issued ≠ file uploaded
* We registreren nu issuance en insert row, maar hebben nog geen sluitende bevestiging dat het bestand daadwerkelijk is geüpload (auditwaardigheid).
* Audit correlation ontbreekt nog
* Audit events hebben nog geen “request_id / idempotency key / ip / user agent” in event_data als standaard.
* Idempotency is niet overal consistent
* Frontend stuurt Idempotency-Key, maar niet alle write endpoints gebruiken het server-side.

3) ADD 9.3 — Wat we nog in totaal moeten doen (grote lijnen richting auditwaardig)

* Document upload semantiek audit-proof maken (issued → uploaded bevestigd)
* Idempotency standaardiseren over dossier write endpoints
* Audit correlation toevoegen (request_id, actor_ref, ip, ua) met minimale logging standaard
* Abuse controls + mail-worker retries/backoff
* Externe validaties pas nadat acceptance criteria (van inboeker/verificateur) bekend zijn (MID/merk/model/leverancier)

4) ADD 9.4 — Wat we komende sessie gaan doen (concrete scope)

* Focus: stap 4 documenten audit-proof maken
* Nieuwe confirm endpoint: api-dossier-upload-confirm
* dossier_documents uitbreiden met status/confirmed metadata
* Dossier.js: onUpload() na PUT altijd confirm call doen
* Evaluate: docs_per_charger telt alleen confirmed uploads
* Resultaat: dossier kan nooit “ready_for_review” worden op basis van “issued” alleen.

5) ADD 9.5 — Correctie/advies op je voorstel “externe APIs”

* “Energiemaatschappij API check” is in praktijk meestal niet haalbaar zonder machtiging en consistente brondata; dit hoort later.
* Eerst audit-proof dossier + duidelijk eisenpakket van inboeker/verificateur, anders bouw je verificaties zonder target.

6) ADD 9.6 — Audit reject coverage is nu aantoonbaar (negatieve paden)

We hebben reject-tests toegevoegd (scripts/audit-tests.sh) die aantonen dat ook falende acties worden gelogd in public.dossier_audit_events:
* charger_save_rejected (unauthorized, max_chargers_reached)
* document_delete_rejected (unauthorized, not_found)

Dit is belangrijk voor auditwaardigheid: je wil niet alleen “success logs”, je wil ook “attempt logs”.

7) ADD 9.7 — Security must-do: rotate service role key

* Service role key is gedeeld in chat en moet beschouwd worden als gelekt.
* Actie: Supabase key roteren + scripts/env updaten.
Geen discussie: dit is P0.


ADD v1.3 — 2026-01-22 12:00

* Audit reject coverage bewezen via script
* Document immutability expliciet vastgelegd
* Purge ≠ delete bevestigd als ontwerpkeuze
* Upload confirm flow audit-proof
* Minimum Logging Standard vastgelegd als norm

ADD v1.4 — 2026-02-08 — Audit-tests script bewezen op real-world dossier states (3 en 4 chargers)

Context
* We hebben scripts/audit-tests.sh gedraaid op een dossier met bestaande chargers.
Getest in 2 scenario’s:
  (A) allowed_max=3, existing=3 (geen creatie mogelijk/ nodig)
  (B) allowed_max=4, existing=3 (1 charger wordt aangemaakt, 2 docs geüpload + bevestigd, daarna cleanup)

Wat is nu aantoonbaar bewezen (hard bewijs via output)
1) Real-world setup gedrag is correct (geen mutaties aan bestaande data)
Als existing == target:
  * Setup maakt niets aan.
  * Reject tests draaien door.
  * Happy uploads + cleanup worden bewust NIET uitgevoerd (we raken bestaande chargers/docs niet aan).
Als existing < target:
  * Setup maakt exact (target-existing) chargers aan.
  * Happy uploads worden alleen gedaan op CREATED_CHARGER_IDS.
  * Cleanup verwijdert alleen CREATED_CHARGER_IDS.

2) Upload flow is end-to-end bewezen op nieuwe charger (happy path)
* upload-url → signed PUT → upload-confirm werkt.
* Confirm resulteert in confirmed status (en audit events zichtbaar).
Cleanup (charger-delete) verwijdert gekoppelde documenten + storage objecten aantoonbaar:
  * deleted_documents: 2
  * deleted_storage_objects: 2
  * storage_delete_failed_objects: 0

3) Script hardening: geen “unbound var” bij CREATED_CHARGER_IDS
* Output / evidence logging is safe gemaakt voor het geval er 0 chargers zijn aangemaakt.
* Hierdoor werkt het script netjes in scenario’s waar setup niets hoeft te creëren.

4) Tooling: repo-lint is nu optioneel (geen ruis in default audit runs)
* Repo-lint is bewust uitgezet by default, omdat edge functions primair in Supabase Dashboard staan (niet in repo).
* Repo-lint kan later “aan” voor productie-hardening (wanneer supabase/functions lokaal de source of truth wordt).

Implicatie voor auditwaardigheid
* Dit is precies de discipline die je wilt: tests zijn “scoped” en raken geen bestaande dossierdata aan.
* We hebben nu bewijs dat zowel rejects als happy flows + cleanup auditbaar zijn, zonder destructive admin tools.


ADD v1.5 — 2026-02-08 — api-dossier-access-update: anker 4 (MLS+Idempotency+CORS) doorgevoerd + bugfixes

Wat is aangepast (hard, functioneel)
1) CORS preflight gefixt
- OPTIONS wordt nu vóór Idempotency-Key check afgehandeld.
- Browser preflight kan niet meer onterecht 400’en.

2) Idempotency flow gerepareerd
- Supabase client (SB) wordt nu aangemaakt vóór replay/finalize.
- Replay werkt nu correct wanneer dossier_id aanwezig is.
- Locked / in_review responses gaan nu via finalize → idempotent opgeslagen.

3) Audit logging (MLS) consistent gemaakt
- Success event “access_updated” wordt nu via insertAuditFailOpen geschreven (zoals rejects).
- Daarmee bevat audit event_data consistent request meta (request_id / ip / ua / environment / idempotency_key) via shared helper.

Waarom dit belangrijk is
- Dit endpoint is een write endpoint; zonder consistente idempotency + MLS creëer je audit-gaten en rare retry-issues.
- Dit is precies het soort kleine inconsistentie dat later een “audit failure” wordt.


ADD v1.6 — 2026-02-08 — Migratie Supabase Dashboard → VS Code repo als source-of-truth + extra endpoints bewezen

Context / waarom
- Handmatig editen in Supabase Dashboard is foutgevoelig en niet reproduceerbaar.
- We zijn daarom overgestapt naar: edge functions in repo (VS Code) → deploy via Supabase CLI scripts (scripts/deploy-edge.sh).
- Doel: 1-op-1 bestanden, reproduceerbare deploys, testbaar via curl/audit-tests, minder “zoekanker”-frictie.

Wat is concreet gedaan (bewezen via curl outputs)
1) api-dossier-export — export contract bewezen
- Endpoint aangeroepen met dossier_id + token.
- Resultaat: HTTP 200 + schema_version en complete export payload (dossier, chargers, checks, consents_latest, documents_confirmed).
- Bewijs: docs_per_charger check telt confirmed docs (consistent met evaluate contract).

2) api-dossier-doc-download-url — signed download URL bewezen
- Endpoint aangeroepen met dossier_id + token + document_id.
- Resultaat: HTTP 200 met signed download_url + filename.
- Opmerking: response bevat ook expires_in; let op consistentie met server-side expiresIn (nu 10 min in code; response toonde 120 in output — verifiëren later).

3) api-dossier-submit-review — gedepriciëerd maar functioneel bevestigd
- File staat expliciet op 410 “deprecated” (Use api-dossier-evaluate).
- Deployment via scripts/deploy-edge.sh gedaan.
- In praktijk respons gezien:
  - Bij dossier in_review: 200 met “already locked / in review”.
  - Bij incomplete dossier: 400 met missingSteps + checks array.
- Conclusie: endpoint is legacy/compat; definitieve review flow loopt via api-dossier-evaluate.

4) api-lead-submit — aangepast + bewezen flows (incl. contact_messages match)
- api-lead-submit is 1 multiplexer gebleven voor:
  - ev_direct
  - installer_to_customer
  - installer_signup
  - contact
- Belangrijke aanpassing: contact flow schrijft 1-op-1 naar public.contact_messages volgens SQL schema:
  columns: name, email, subject, message, first_name, last_name (geen extra velden).
- Daarna queued mail in outbound_emails voor mail-worker.
- Curl tests bewezen:
  - ev_direct → 200 + lead_id + dossier_id
  - contact → 200 + queued:true
  - installer_to_customer → 200 + lead_id + dossier_id

5) mail-worker — bewezen end-to-end mail delivery
- mail-worker verwerkt outbound_emails(status=queued) → status sent/failed.
- Beveiliging: x-mail-worker-secret.
- Resultaat: “krijg alles binnen” bevestigd (contact/links/installer mails).

6) api-dossier-address-save — write+verify in één endpoint bewezen
- Endpoint slaat adres op + PDOK lookup + zet address_verified_at + bag_id.
- MLS+Idempotency helpers (_shared/reqmeta.ts + _shared/audit.ts) gebruikt.
- Twee tests bewezen:
  A) met toevoeging “H2” → bag_id + display “28-2”
  B) zonder suffix → andere bag_id + display “28-H”
- Implicatie: zonder suffix kan PDOK een andere adresvariant kiezen; dit is een compliance/audit risico (Phase-2/1.5 item).

Gelijkgetrokken “bouwstijl” die nu dominant is (doel & effect)
- CORS strict allowlist (ALLOWED_ORIGINS, Vary: Origin).
- Write endpoints: Idempotency-Key verplicht + replay/finalize via idempotency_keys (waar doorgevoerd).
- MLS: request meta (request_id/ip/ua/idempotency/environment/actor_ref) via shared helpers in audit events, fail-open logging.
- Hard lock enforcement: locked_at/status block op write endpoints.

Open gaten / expliciet Phase-2 (samengevat)
- Email “verified by link possession” is een MVP-aanname en moet expliciet gelabeld worden als assumption in audit (Phase-2 fix).
- PDOK ambiguity bij ontbrekende suffix: of suffix verplicht bij multiple candidates, of verified=false + audit ambiguity.
- deno.json / import map warnings: later uniformeren, nu niet refactoren.
- Upload-confirm server-side download+sha256 is duur (performance spike risico); later herontwerp.
- Missing audit events (submit_review_requested / locked/rejected) als aparte event chain buiten evaluate: later uitwerken.

ADD v1.7 — 2026-02-08 — Stap 1 Access endpoints: api-dossier-access-save + api-dossier-access-update (MLS + Idempotency + lock enforcement)

Wat is het doel
- Stap 1 (“Toegang”) schrijft klantgegevens naar dossiers (naam / telefoon / charger_count / own_premises).
- Beide endpoints zijn write endpoints en voldoen aan:
  - CORS strict allowlist
  - Idempotency-Key verplicht
  - MLS audit logging via _shared/reqmeta.ts + _shared/audit.ts
  - Hard lock enforcement op locked_at/status

1) api-dossier-access-save
Pad: supabase/functions/api-dossier-access-save/index.ts
Contract (input)
- Required: dossier_id, token, first_name
- Optional: last_name, customer_phone, charger_count (1–10), own_premises (boolean)
Validaties / business rules
- NL mobiel: 06xxxxxxxx of +316xxxxxxxx
- charger_count mag niet lager dan bestaand aantal dossier_chargers (409 business_rule)
Auth + locks
- Auth: sha256(token) == dossiers.access_token_hash
- Locked: locked_at != null OR status in (in_review, ready_for_booking) => 409
Idempotency
- Replay/finalize via idempotency_keys: tryGetIdempotentResponse + storeIdempotentResponseFailOpen
Semantiek
- Als status == ready_for_review en er wordt iets gewijzigd in step 1 => status terug naar incomplete (invalidated_ready_for_review)
Audit
- Success: event_type = access_updated (actor_type=customer) met changes + invalidated_ready_for_review
- Reject: event_type = access_save_rejected (auth/validate/db/locked/business_rule)

2) api-dossier-access-update
Pad: supabase/functions/api-dossier-access-update/index.ts
Rol t.o.v. access-save
- “PATCH-style”: werkt alleen velden bij die aanwezig zijn (phone / charger_count / own_premises).
- (Belangrijk) Het schrijft óók event_type=access_updated bij success (zelfde succes-event als access-save).
Contract (input)
- Required: dossier_id, token
- Optional: customer_phone, charger_count, own_premises
Zelfde rules/locks/idempotency als access-save
Audit
- Success: event_type = access_updated
- Reject: event_type = access_update_rejected

Opmerking / mogelijke Phase-2 cleanup (geen actie nu)
- Twee endpoints die hetzelfde domein doen (save vs update) is onderhoudsschuld.
  Phase-2: consolideer naar één endpoint (bijv. access-save als canonical) en laat access-update 410/deprecated worden,
  óf behoud access-update maar zet in docs expliciet “legacy/compat”.


ADD v1.8 — 2026-02-08 — Stap 2 Address: api-dossier-address-preview + api-dossier-address-verify (PDOK) + audit events

Doel
- Stap 2 heeft twee “preview/comfort” endpoints naast de write endpoint (api-dossier-address-save):
  1) address-preview: snelle UI-check zonder dossier auth/audit (comfort)
  2) address-verify: dossier-scoped preview met auth + audit (auditwaardige precheck)

1) api-dossier-address-preview (UI comfort)
Pad: supabase/functions/api-dossier-addres-preview (let op: pad/naam lijkt typo; canonical in docs = api-dossier-address-preview)
Eigenschappen
- Public endpoint (geen Supabase client, geen token auth, geen audit).
- CORS strict allowlist.
- Input accepteert meerdere key-varianten (postcode, house_number/houseNumber/..., suffix/addition/...).
- Valideert formaat:
  - postcode: 1234AB
  - house number: 1..99999
- Doet PDOK lookup en returnt {street, city}.
Gebruik
- Alleen UI preview (snelheid/comfort).
- Niet gebruiken als audit-proof bewijs (geen dossier scope, geen audit trail).

2) api-dossier-address-verify (dossier-scoped preview + audit)
Pad: supabase/functions/api-dossier-address-verify/index.ts
Auth
- Vereist dossier_id + token.
- Auth: sha256(token) == dossiers.access_token_hash.
Audit
- Logged via insertAuditFailOpen (MLS meta via reqmeta).
Events
- address_verify_rejected (auth reject)
- address_verify_failed (PDOK error; actor_type system)
- address_verify_not_found (geen match)
- address_verify_ok (match gevonden; preview=true)
Output
- preview response met normalized input + resolved {street,city,bag_id}.

ADD v1.9 — 2026-02-08 — Stap 3 Chargers: api-dossier-charger-save + api-dossier-charger-delete (MLS + Idempotency + lock + cleanup)

Doel (Stap 3)
- Klant voegt laadpalen toe of wijzigt ze, binnen de limiet charger_count (stap 1).
- Verwijderen moet auditbaar zijn en cascade-cleanup uitvoeren:
  - DB rows dossier_documents weg
  - Storage objects weg (fail-open)
  - Daarna dossier_chargers row weg

A) api-dossier-charger-save
Pad: supabase/functions/api-dossier-charger-save/index.ts
Type: write endpoint (create + update), Idempotency verplicht.

Contract
Input:
- dossier_id, token (required)
- charger_id (optional; aanwezig = update, afwezig = create)
- serial_number (required)
- brand (required)
- model (required)
- power_kw (optional, 0..1000)
- notes (optional)

Auth + lock enforcement
- Auth: sha256(token) == dossiers.access_token_hash
- Hard lock: locked_at != null OR status IN ('in_review','ready_for_booking') => 409 reject

Business rules
- charger_count moet eerst gezet zijn in stap 1 (required > 0), anders 409 reject
- Max chargers: bij create geldt have < required, anders 409 reject (max_chargers_reached)
- Serial uniqueness:
  - duplicate in hetzelfde dossier => 409 reject
  - serial al in ander dossier => 409 reject
  - DB unique violation (23505) => 409 reject

State invalidation (review gating)
- Als dossier.status == 'ready_for_review' en er wordt een charger toegevoegd/gewijzigd:
  - status wordt teruggezet naar 'incomplete' (invalidate ready_for_review)

Audit events
- charger_added (success create)
- charger_updated (success update)
- charger_save_rejected (auth/validate/lock/business rule/unique)
- charger_save_failed (db/unknown failures)

Idempotency
- Idempotency-key required.
- Replay: tryGetIdempotentResponse zodra dossier_id bekend.
- finalize: storeIdempotentResponseFailOpen (status+body).

B) api-dossier-charger-delete
Pad: supabase/functions/api-dossier-charger-delete/index.ts
Type: write endpoint (delete), Idempotency verplicht.

Contract
Input:
- dossier_id, token, charger_id (all required)
Auth + lock enforcement
- Auth: sha256(token) == dossiers.access_token_hash
- Hard lock: locked_at != null OR status IN ('in_review','ready_for_booking') => 409 reject

Delete flow (order is intentional)
0) Charger must exist in dossier (404 reject if not)
1) Lees dossier_documents voor deze charger (reporting + storage paths)
2) Delete dossier_documents rows (DB first)
   - als DB policy/immutability blokkeert (bijv confirmed docs): 409 reject met reason=db_policy_block
3) Delete storage objects (AFTER DB delete, fail-open)
   - storage delete failures worden apart ge-audit als charger_delete_storage_failed
4) Delete dossier_chargers row
5) Invalidate ready_for_review => status terug naar 'incomplete' (als nodig)

Audit events
- charger_deleted (success; inclusief deleted_documents + storage delete stats + invalidated flag)
- charger_delete_rejected (validate/auth/lock/not_found/db_policy_block)
- charger_delete_failed (db errors)
- charger_delete_storage_failed (fail-open; db al verwijderd, storage niet)

Idempotency
- Idempotency-key required.
- Replay: tryGetIdempotentResponse zodra dossier_id bekend.
- finalize: storeIdempotentResponseFailOpen (status+body).

ADD v2.0 — 2026-02-08 — Stap 4 Documenten: api-dossier-doc-delete + api-dossier-upload-url (strict Idempotency + immutability + issued≠confirmed)

A) api-dossier-doc-delete
Pad: supabase/functions/api-dossier-doc-delete/index.ts
Type: write endpoint (delete draft docs), STRICT Idempotency via withIdempotencyStrict()

Doel
- Alleen draft/issued documenten mogen weg.
- Confirmed documenten zijn immutable via DB policy/trigger → delete moet blokkeren met 409.
- Delete is idempotent: "not found" => 200 deleted=false (en audit event).

Contract
Input: { dossier_id, token, document_id } (required)

Auth + lock enforcement
- Auth: sha256(token) == dossiers.access_token_hash
- Hard lock: locked_at != null OR status IN ('in_review','ready_for_booking') => 409 reject

Idempotency
- Alleen header Idempotency-Key telt (geen request_id fallback).
- Wrapper withIdempotencyStrict(SB, idemKey, fn):
  - voorkomt dubbele deletes/writes bij retries
  - response wordt deterministisch gereplayed

Delete flow
1) validate input
2) dossier auth + lock check
3) doc lookup
   - not found => 200 {deleted:false} + audit event (status=200, reason=not_found)
4) DB delete eerst (source of truth)
   - immutability/policy block => 409 db_policy_block + audit
5) Storage delete daarna (fail-open)
   - storage delete failure => audit event document_delete_storage_failed, maar 200 blijft mogelijk
6) invalidate ready_for_review (best effort): status -> incomplete (fail-open)
7) success audit: document_deleted (incl. storage_deleted + invalidated flag)

Audit events
- document_delete_rejected (400/401/409/500 paths; incl. status=200 not_found als “expected reject-style”)
- document_delete_storage_failed (storage delete faalt na DB delete)
- document_deleted (success)

B) api-dossier-upload-url
Pad: supabase/functions/api-dossier-upload-url/index.ts
Type: write endpoint (issue upload URL + insert metadata), Idempotency verplicht.

Doel
- Issue signed upload url (Supabase Storage).
- Insert dossier_documents row met status='issued' (belangrijk: issued ≠ uploaded/confirmed).
- Invalidate ready_for_review bij document-actie.
- Enforce per-charger doc limit (factuur/foto_laadpunt max 1).

Contract
Input:
- dossier_id, token, doc_type, filename (required)
- content_type (optional)
- size_bytes (optional)
- charger_id (required voor doc_type in {factuur,foto_laadpunt})

Validaties
- doc_type allowlist: factuur,foto_laadpunt,mandaat,id,kvk,overig
- file ext allowlist: pdf,png,jpg,jpeg,doc,docx
- mime allowlist: pdf/png/jpeg/doc/docx
- size max: 15MB (als size_bytes geleverd is)
- charger_id validatie: moet bestaan in dossier
- per-charger doc limit: count where status != 'rejected' (dus issued+confirmed blokkeren)

Auth + lock enforcement
- Auth: sha256(token) == dossiers.access_token_hash
- Hard lock: locked_at != null OR status IN ('in_review','ready_for_booking') => 409 reject

Idempotency
- Alleen header Idempotency-Key telt.
- Replay/finalize via idempotency_keys (tryGetIdempotentResponse + storeIdempotentResponseFailOpen).

Write flow
1) createSignedUploadUrl(storage_path)
2) insert dossier_documents (status='issued', metadata)
3) invalidate ready_for_review => status='incomplete'
4) audit event: document_upload_url_issued
5) return signed_url + token + document_id + storage path/bucket

Audit events
- document_upload_url_issued (success)
- document_upload_url_rejected (validate/auth/lock/storage/db errors)

ADD v2.1 — 2026-02-08 — Stap 4 Documenten: api-dossier-upload-confirm (server-side verify) + Read model (api-dossier-get) + Review checks/lock (api-dossier-evaluate)

A) api-dossier-upload-confirm
Pad: supabase/functions/api-dossier-upload-confirm/index.ts
Type: write endpoint (confirm upload), Idempotency verplicht (HEADER ONLY)

Doel
- Sluit issued → confirmed audit-contract.
- Alleen confirmed documenten tellen mee voor review (en dus voor dossier_ready_for_review / dossier_locked_for_review).
- Server-side verify via storage download + sha256, zodat "claimed hash" niet genoeg is.

Contract
Input: { dossier_id, token, document_id, file_sha256 } (required)

Idempotency
- Alleen header Idempotency-Key telt.
- Replay/finalize via idempotency_keys (tryGetIdempotentResponse + storeIdempotentResponseFailOpen).

Auth + lock enforcement
- Auth: sha256(token) == dossiers.access_token_hash
- Hard lock: locked_at != null OR status IN ('in_review','ready_for_booking') => 409 reject

State machine doc row
- doc.status == confirmed => 200 already_confirmed=true (idempotent)
- doc.status != issued => 409 bad_state
- doc.status == issued => proceed

Verify flow (audit-sterk)
1) Validate file_sha256 format (64 hex)
2) Storage download (bucket/path uit dossier_documents)
   - download fail => 409 storage_missing (treated as "upload not present")
3) Compute sha256(server) en compare met client hash
   - mismatch => 409 hash_mismatch
4) Update dossier_documents:
   - status='confirmed'
   - confirmed_at/by/ip/ua/request_id
   - file_sha256 = serverSha
5) Audit success: document_upload_confirmed (incl. verified_server_side=true)

Audit events
- document_upload_confirm_rejected (alle reject/failed paden incl. missing/bad sha, auth, lock, not_found, storage_missing, mismatch, db_error)
- document_upload_confirmed (success)

B) api-dossier-get (read model + MVP email verify side-effect)
Pad: supabase/functions/api-dossier-get/index.ts
Type: read endpoint (maar met side-effect), geen Idempotency

Doel
- Single source of truth voor frontend reloadAll(): dossier + related state (documents/consents/audit/chargers/checks).
- Token-auth model: possession van dossier link geeft toegang.

Auth
- Auth: sha256(token) == dossiers.access_token_hash
- Unauthorized => audit dossier_get_rejected + 401

MVP side-effect (bewust risico)
- Als email_verified_at null: set email_verified_at = now()
- Audit: email_verified_by_link met assumption=possession_of_link_equals_verified
- NOTE: expliciet Phase-2 fix (echte email verify flow)

Related reads (fail-open)
- dossier_documents, dossier_consents, dossier_audit_events, dossier_chargers, dossier_checks
- LIMIT 200, sorted DESC
- Bij query errors: return [] maar log console error (debug)

Audit events
- dossier_get_rejected (401 unauthorized)
- email_verified_by_link (system)

C) api-dossier-evaluate (checks + status + optional lock)
Pad: supabase/functions/api-dossier-evaluate/index.ts
Type: write endpoint (upsert dossier_checks + status transitions + lock), Idempotency verplicht (HEADER ONLY)

Doel
- Deterministische review gating:
  - finalize=false => ready_for_review (no lock)
  - finalize=true  => in_review + locked_at (hard lock)
- Checks schrijven naar dossier_checks (UNIQUE dossier_id+check_code).

Contract
Input: { dossier_id, token, finalize:boolean } + Idempotency-Key header

Idempotency
- Alleen header Idempotency-Key telt.
- Replay/finalize via idempotency_keys.

Auth + lock behavior
- Auth: sha256(token) == dossiers.access_token_hash
- If dossier.locked_at OR status in ('in_review','ready_for_booking') => 200 stable OK (no changes)

Checks (v1)
- email_verified (MVP: email_verified_at)
- address_verified (address_verified_at)
- charger_exact_count (charger_count exact match; fallback: >0 if no required set)
- docs_per_charger (per charger: factuur + foto_laadpunt; ONLY status='confirmed')
- consents_required (terms+privacy+mandaat latest-true)

Write behavior
- Upsert dossier_checks (onConflict dossier_id,check_code)
- If missing => status='incomplete' + audit dossier_review_rejected_incomplete (400)
- If pass + finalize=false => status='ready_for_review' + audit dossier_ready_for_review (200)
- If pass + finalize=true => status='in_review' + locked_at=ts + audit dossier_locked_for_review (200)
- Lock verify: reread fallback indien update response leeg

Audit events
- dossier_evaluate_rejected / dossier_evaluate_failed (rejections + errors)
- dossier_review_rejected_incomplete
- dossier_ready_for_review
- dossier_locked_for_review


ADD v2.2 — 2026-02-09 — Export artifact + Submit-review lock endpoint + Consents-save (idempotency strict)

A) api-dossier-dossier-export
Pad: supabase/functions/api-dossier-dossier-export/index.ts
Type: write-ish endpoint (evidence export), Idempotency verplicht (HEADER ONLY)

Doel
- Genereert een deterministisch export-artefact (evidence snapshot) met schema_version en generated_at.
- Export mag alleen als dossier is ingediend/locked (audit rule).

Contract
Input: { dossier_id, token } (required) + Idempotency-Key header

Idempotency
- tryGetIdempotentResponse + storeIdempotentResponseFailOpen
- Export is "evidence artifact" => idempotency verplicht.

Auth + export gate
- Auth: sha256(token) == dossiers.access_token_hash
- Export toegestaan alleen als:
  - dossiers.locked_at != null OR status IN ('in_review','ready_for_booking')
- Anders: 409 dossier_export_rejected (reason: not_locked)

Data model export (whitelist)
- dossier: whitelisted velden (PII inbegrepen: naam/email/phone) — bewust en expliciet.
- chargers: deterministic order created_at asc
- dossier_documents: deterministic order created_at asc
- dossier_checks: order check_code asc
- dossier_consents: ordered newest-first; reducer naar consents_latest snapshot

Belangrijke evidence rule
- Export bevat ONLY status='confirmed' documenten (documents_confirmed).
- Export integrity gate: confirmed docs MUST have file_sha256; anders 409 export geblokkeerd.

Audit events
- dossier_export_rejected (stages: dossier_lookup, auth, export_gate, *reads*, export_integrity)
- dossier_export_generated (counts: chargers, confirmed_docs, checks)

B) api-dossier-submit-review
Pad: supabase/functions/api-dossier-submit-review/index.ts
Type: write endpoint (locks dossier), Idempotency verplicht

Doel
- “Submit” endpoint die checklist draait, dossier_checks upsert, en daarna lockt (status='in_review', locked_at=ts).
- Overlap met api-dossier-evaluate(finalize=true), maar expliciet endpoint voor UX.

Idempotency
- BUG/SMELL: idemKey = meta.idempotency_key || meta.request_id (request_id is GEEN idempotency key).
- Policy: Idempotency-Key header moet de enige bron zijn. (Conform andere write endpoints.)

Auth + early exits
- Auth: sha256(token) == dossiers.access_token_hash
- Already locked/status in_review/ready_for_booking => 200 OK idempotent.

Checks (zelfde als evaluate)
- email_verified_at, address_verified_at
- charger_exact_count (charger_count exact)
- docs_per_charger: per charger factuur+foto_laadpunt, ONLY confirmed
- consents_required: latest snapshot terms+privacy+mandaat == true
- Upsert dossier_checks onConflict dossier_id,check_code

Lock
- Als checks fail: set status incomplete (best-effort) + audit dossier_submit_review_rejected_incomplete + 400
- Als checks pass: update dossiers.status=in_review, locked_at=ts
- Double-check lock (reread fallback) voor race safety.
- Audit: dossier_locked_for_review met via="api-dossier-submit-review"

Audit events
- dossier_submit_review_requested (best-effort, altijd bij start na auth scope)
- dossier_submit_review_rejected (auth/401)
- dossier_submit_review_rejected_incomplete (checks fail)
- dossier_locked_for_review (system) (success)

C) api-dossier-consents-save
Pad: supabase/functions/api-dossier-consents-save/index.ts
Type: write endpoint, Idempotency strict (HEADER ONLY)

Doel
- Slaat 3 verplichte consents op (terms/privacy/mandaat) als evidence rows in dossier_consents.
- Idempotent op 2 lagen:
  - request-level: withIdempotencyStrict
  - data-level: als versie v1.0 al 3× accepted=true => return already_saved=true

Contract
Input: { dossier_id, token, consents: {terms, privacy, mandaat} } + Idempotency-Key header

Rules
- Alle drie true, anders 400 reject "Vink alle drie..."
- VERSION="v1.0" (hardcoded)
- Writes: insert 3 rows accepted=true + accepted_at + actor_email (customer_email uit dossier)
- Invalidate ready_for_review => incomplete (fail-open)

Audit events
- consents_save_rejected (stages: auth, dossier_locked, validate, db_read, db_write)
- consents_saved (success; includes already_saved flag; invalidated_ready_for_review)


ADD v2.3 — 2026-02-09 — Lead submit + Document download URL + Address save (PDOK verify)

A) api-lead-submit
Pad: supabase/functions/api-lead-submit/index.ts
Type: write endpoint (creates installer/lead/dossier + queues mail), Idempotency verplicht

CORS
- Strict allowlist + Netlify deploy preview allow voor deploy-preview-*--enval1.netlify.app

Idempotency
- Vereist Idempotency-Key header
- Reserveert key in table idempotency_keys (unique constraint op key)
- Duplicate behavior:
  - Als response_status+response_body aanwezig => replay exact
  - Anders => 409 "Request already in progress"
- finalize(status, body) schrijft response_status/body terug naar idempotency_keys

Flows
1) installer_signup
- Validaties: company_name, first/last, email format, phone NL, kvk 8 digits
- Duplicate check: installers by email OR kvk => 409
- Auth invite via supabase auth.admin.inviteUserByEmail(email)
- Insert installers row: ref_code, company, contact, email/phone/kvk, auth_user_id, active=true
- Queue outbound_emails (installer_code)

2) installer_to_customer
- Validate installer_ref + customer fields + charger_count 1..10
- Lookup installer(ref_code, active)
- Insert lead (source via_installateur)
- Create dossier:
  - access_token_hash = sha256(random token)
  - status = incomplete
- Insert dossier_audit_events: system event dossier_created
- Queue outbound_emails (dossier_link) met URL ?d=<id>&t=<token>

3) ev_direct
- Zelfde als installer_to_customer maar zonder installer lookup, source=ev_direct
- Insert dossier_audit_events: system dossier_created
- Queue outbound_emails (dossier_link)

4) contact
- Insert contact_messages (DB is source of truth)
- Queue outbound_emails naar dk@enval.nl (message_type contact)

Audit events
- NB: api-lead-submit schrijft direct naar dossier_audit_events alleen bij dossier create:
  - dossier_created (actor_type system)
- Verder geen audit events voor installer/lead/contact. (Audit gap: zie DOC2 TODO.)

B) api-dossier-doc-download-url
Pad: supabase/functions/api-dossier-doc-download-url/index.ts
Type: evidence access endpoint (signed URL), Idempotency verplicht

Idempotency
- LET OP: gebruikt meta.idempotency_key || meta.request_id (request_id is GEEN idempotency key).
- Policy: header-only. Moet gelijkgetrokken worden met andere endpoints (DOC2 TODO).

Auth + gate
- Auth: dossiers.id + access_token_hash match
- Gate: dossier moet locked zijn:
  - locked_at != null OR status in ('in_review','ready_for_booking')
  - anders 409

Document rule
- Alleen status='confirmed'
- Evidence-grade gate: file_sha256 en confirmed_at moeten bestaan, anders 409

Signed URL
- createSignedUrl(bucket/path, expiresIn=120s)

Audit events
- document_download_url_issued (actor customer)
  Data: document_id, doc_type, expires_in_seconds

C) api-dossier-address-save
Pad: supabase/functions/api-dossier-address-save/index.ts
Type: write endpoint (address + verified_at), Idempotency verplicht

Idempotency
- HEADER ONLY idemKey verplicht; tryGetIdempotentResponse + storeIdempotentResponseFailOpen

Input normalize
- Accepteert meerdere keyvarianten: postcode, house_number/houseNumber/housenumber/number, suffix/addition/house_suffix/houseSuffix
- Postcode normalize + format check (1234AB)
- House number 1..99999
- Suffix normalize (max 12, null allowed)

External verify
- PDOK locatieserver free endpoint (search v3_1 free)
- Query: "<postcode> <huisnummer>" + rows=20 + filter candidates by exact pc/hn
- Suffix matching: huisletter/huisnummertoevoeging + weergavenaam heuristics
- Errors => 502 external_lookup

Write behavior
- Auth: dossier via access_token_hash
- Lock rule: locked_at OR status in ('in_review','ready_for_booking') => 409 address_save_rejected
- On success: update address_* + address_verified_at=ts + updated_at=ts
- If previous status ready_for_review => invalidates to incomplete (status patch)

Audit events
- address_save_rejected (actor customer) stages: validate, auth, dossier_locked, db_read, external_lookup, db_write
- address_saved_verified (actor customer) data:
  - input {postcode, house_number, suffix}
  - resolved {street, city, bag_id, display}
  - source "pdok_locatieserver_v3_1_free"
  - invalidated_ready_for_review flag

==============================
UPDATE 2026-02-09 — P1
==============================

A) Edge Function updates (audit consistency)

1) api-dossier-doc-download-url
- Added reject-audit coverage for all non-200 outcomes.
- New audit event: document_download_url_rejected
  - actor_type: customer
  - stages: validate_input, dossier_lookup, auth, export_gate, doc_lookup, integrity_gate, signed_url
  - event_data: {stage,status,message,reason,...}
- Success audit unchanged: document_download_url_issued

2) mail-worker
- Added retry discipline: attempts < MAX_ATTEMPTS (5)
- Added cooldown selection using last_attempt_at (no next_attempt_at column available)
- Prevented double-send in common failure mode: if provider_id present => force status sent and skip
- NOTE: outbound_emails table has no dossier_id, so mail events cannot be attached to dossier_audit_events yet.

B) Audit matrix delta (P1)

Customer — Documents (Step 4)
- document_download_url_issued — success
  Where: api-dossier-doc-download-url
  Data: {document_id, doc_type, expires_in_seconds}
- document_download_url_rejected — reject/fail
  Where: api-dossier-doc-download-url
  Stages: validate_input, dossier_lookup, auth, export_gate, doc_lookup, integrity_gate, signed_url
  Status: 400/401/404/409/500

System — Mail
- mail-worker currently writes to outbound_emails only (no dossier-linked audit events possible without schema link).

C) Evidence-grade rule reaffirmed
- Download URL issuance requires:
  - dossier locked OR status in_review/ready_for_booking
  - document status confirmed
  - document has file_sha256 and confirmed_at


============
EINDE DOC 1
============