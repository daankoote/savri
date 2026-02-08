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



============
EINDE DOC 1
============