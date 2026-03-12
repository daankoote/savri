# 03_CHANGELOG_APPEND_ONLY.md (append-only, updated)

# ENVAL — Change Log (APPEND-ONLY)

Regel: niets herschrijven, alleen toevoegen.
Doel: chronologie bewaren zonder de “current docs” te vervuilen.

---

## 2026-01-21 — Consents immutable + review gating + charger delete auditability
- Stap 5 consents immutable gemaakt: only save wanneer terms+privacy+mandaat = true.
- Frontend: na save verdwijnt “Opslaan”, checkboxes disabled + tekst “niet meer aanpasbaar”.
- api-dossier-evaluate werkt conform precheck vs finalize.
- api-dossier-charger-delete: cascade delete (docs + storage) + audit event.

Open zichtbaar geworden:
- Upload-url issued ≠ file uploaded (audit gap toen).
- Audit correlation (request_id/idempotency/ip/ua) nog niet uniform.
- Idempotency niet overal consistent.

P0:
- Service role key exposure → rotatie verplicht.

---

## 2026-01-22 12:00 — System map update + audit reject coverage + immutability expliciet
- Reject tests toegevoegd (scripts/audit-tests.sh) die reject events aantonen (charger_save_rejected, document_delete_rejected).
- Immutability model expliciet: confirmed docs onverwijderbaar; purge faalt bewust.
- Minimum Logging Standard als norm vastgelegd.

---

## 2026-02-08 — audit-tests bewezen op real-world dossier states (3–4 chargers)
Bewezen gedrag:
- Non-destructive: existing==target → geen mutaties, wel rejects + audit bewijs.
- existing<target → maakt exact missing chargers, doet uploads alleen op created chargers, cleanup alleen created chargers.
- upload-url → PUT → upload-confirm happy path bewezen + cleanup stats.

Repo-lint default uit (RUN_REPO_LINT=0) om noise te vermijden zolang edge functions migratie actief is.

---

## 2026-02-08 — MLS + Idempotency + CORS doorgevoerd op access-update (en vergelijkbaar patroon)
- OPTIONS vóór Idempotency check (CORS preflight fix).
- Idempotency replay/finalize correct (SB init vóór replay).
- Success audit events via insertAuditFailOpen (MLS consistent).

---

## 2026-02-08 — Migratie Supabase Dashboard → VS Code repo als source-of-truth
- Edge functions in repo; deploy via Supabase CLI scripts (scripts/deploy-edge.sh).
- api-dossier-export bewezen (schema_version + payload incl confirmed docs).
- api-dossier-doc-download-url bewezen (signed url, expiresIn aandachtspunt).
- api-dossier-submit-review bevestigd als legacy/compat; canonical is evaluate.

---

## 2026-02-08 — Step inventory: access/address/chargers/documents/evaluate (auditwaardig MVP)
- Access: access-save + access-update (MLS+Idempotency+locks+business rules)
- Address: preview (no audit) vs verify (audit) vs save (write+audit)
- Chargers: save + delete (cascade + fail-open storage audit)
- Documents: upload-url (issued) + upload-confirm (server-side sha256) + doc-delete (immutable confirmed)
- Evaluate: checks only confirmed docs + finalize lock

Bekende Phase-2 risico’s vastgelegd:
- upload-confirm performance (server-side download+sha256 duur)
- email_verified_by_link = assumption
- PDOK ambiguity zonder suffix
- orphaned storage bij fail-open deletes

---

## 2026-02-09 — P1: doc-download-url reject-audits + mail-worker retries/cooldown
- api-dossier-doc-download-url: reject audit event toegevoegd (document_download_url_rejected) met stages.
- mail-worker: retry discipline (max attempts), cooldown via last_attempt_at, provider_id guard om dubbel-send te voorkomen.
- Constraint: outbound_emails heeft geen dossier_id → mail blijft off-chain.

---

## 2026-02-09 — audit-tests.sh (process/contract documentatie)
- Script beschreven als contract evidence tool (rejects + happy path + non-destructive scope).
- Belangrijk: draait niet op productie, en raakt bestaande chargers/docs niet aan.

---

## 2026-02-09 — P1 start: outbound_emails on-chain + next_attempt_at + mail audit events
- DB: outbound_emails uitgebreid met dossier_id (nullable) + next_attempt_at + pick index (status,next_attempt_at,priority,created_at).
- api-lead-submit: dossier_link mails nu met outbound_emails.dossier_id + next_attempt_at=now; dossier-scoped audit event mail_queued (fail-open).
- mail-worker: scheduling op next_attempt_at (geen last_attempt_at cooldown hack meer), exponential backoff, en dossier-scoped audit events mail_sent/mail_failed/mail_requeued (fail-open).

P0 (deferred risk):
- Service Role key rotatie bewust uitgesteld; risico geaccepteerd zolang secrets nooit in git/docs komen. Plan blijft P0.

---

## 2026-02-09 — P1 bewezen groen: outbound_emails on-chain + mail-worker auth+secret guard + mail audit events
- DB: outbound_emails uitgebreid met `dossier_id` (nullable FK) en `next_attempt_at`, plus index `outbound_emails_pick_idx (status, next_attempt_at, priority, created_at)`.
- api-lead-submit: dossier-scoped mails (dossier_link) schrijven nu `outbound_emails.dossier_id` + `next_attempt_at` en loggen `mail_queued` (fail-open) in `public.dossier_audit_events`.
- mail-worker: verwerkt queued mails op basis van `next_attempt_at`, gebruikt gateway auth (apikey+Authorization) + `x-mail-worker-secret` guard, en logt dossier-scoped `mail_sent` / `mail_requeued` / `mail_failed` (fail-open).
- Tooling: projectbreed Deno std import gemigreerd van `https://deno.land/std@0.224.0/...` naar `jsr:@std/http@0.224.0/server` om deploy/bundling afhankelijkheid van deno.land te elimineren.

Bewijs:
- Worker call met correcte headers + secret → HTTP 200 `Processed batch`.
- Worker call met fout secret → HTTP 401 `Unauthorized`.

NB: Deze entry is de “bewijs/groen” consolidatie van de eerdere 2026-02-09 “P1 start” entry.

---

## 2026-02-09 — P1: mail-worker stuck processing recovery (audit-first)
- mail-worker: detecteert `outbound_emails.status='processing'` die ouder is dan 10 minuten (last_attempt_at) en herstelt deze naar:
  - `queued` met `next_attempt_at` (backoff) óf
  - `failed` bij max attempts.
- Dossier-scoped audit (fail-open): `mail_requeued`/`mail_failed` met reason `stuck_processing_timeout`.
- Doel: voorkomt silent backlog door crashes tussen lock en update.

---

## 2026-02-09 — P0: Supabase JWT secret rotation (anon + service_role) + repo hygiene + audit-tests hardening

Wat er is gebeurd
- Supabase JWT secret is geroteerd → hierdoor veranderen automatisch zowel:
  - `SUPABASE_ANON_KEY` (frontend/public)
  - `SUPABASE_SERVICE_ROLE_KEY` (server/admin)
- Gevolg: alle clients die nog de oude anon key gebruiken krijgen “verkeerde JWT key” / auth failures.

Fixes / changes
- Frontend: `assets/js/config.js` bijgewerkt met de nieuwe `SUPABASE_ANON_KEY`.
  - Noot: dit vereist een frontend deploy (Netlify) om live te gaan.
- Local dev: `.env.local` moet de nieuwe keys bevatten (bestand blijft gitignored; geen secrets in repo).
- Tooling (audit-tests.sh):
  - Safety guard toegevoegd: fail als `SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY` (misconfig).
  - REST calls blijven service-role autoriseren via `Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY`,
    maar gebruiken als `apikey` header de anon key (veilig, consistent met Supabase REST verwachtingen).
- Hygiene / leak-reductie:
  - Oude/archiefmappen met potentieel gevoelige historie zijn uit de repo gehaald en lokaal weggeplaatst.
  - Repo scan proces aangescherpt: tracked-only grep als primaire check.

Bewijs / symptoom dat hiermee opgelost wordt
- UI dossier openen faalde met “verkeerde JWT key” zolang frontend nog oude anon key gebruikte.
- audit-tests konden dossiers.charger_count niet lezen via REST zolang keys niet consistent waren.

Open aandacht
- Na JWT rotation: verifieer dat alle Supabase Edge Function secrets nog correct staan
  (met name `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_WORKER_SECRET`).
  CLI kan env-namen met `SUPABASE_` prefix soms skippen; dashboard is dan de bron van waarheid.

---

## 2026-02-09 — P0 JWT / API Key rotation afgerond (bewijs geleverd)
- Supabase ANON en SERVICE_ROLE keys succesvol geroteerd.
- Frontend (assets/js/config.js) gebruikt nieuwe ANON key.
- Edge functions + REST access functioneren correct met nieuwe keys.
- UI dossier openen werkt zonder JWT errors.
- audit-tests.sh draait volledig groen (EXIT=0).
- Bewijs geleverd via curl + audit logs.

Status: CLOSED (P0)

---

## 2026-02-10 — Phase-2 besluit: uploadstrategie + scope-reductie (besluitvormend)

Besluiten (nog geen implementatie):
- Klant-uploads zijn indicatief bewijs; audit focust op herleidbaarheid, niet authenticiteit.
- Client-side compressie wordt leidend voor foto-uploads; alleen finale bytes worden opgeslagen.
- upload-confirm wordt Phase-2 herontworpen met deferred server-side verificatie (alleen bij finalize/export/download).
- UI wordt beperkt tot particuliere dossiers met max 4 laadpalen; backend blijft tot 10 ondersteunen.
- Installateur-flow wordt als legacy beschouwd en niet verder uitgebreid:
  - geen dossier-creatie of uploads door installateurs
  - installer_ref blijft optionele herkomst-metadata
  - geen vergoedingsmodel.

Motivatie:
- Kosten en latency reduceren zonder auditkracht te verzwakken.
- Scope versmallen om Phase-2 auditwaardig af te ronden vóór batch/enterprise flows.

---

## 2026-02-10 — Phase-2 Upload optimalisatie + database reset (DEV)

### Context
In Phase-2 is expliciet gekozen voor kosten- en stressreductie op Edge / Storage,
zonder verlies van auditkracht. Dit is gerealiseerd via client-side optimalisatie
en harde caps, gevolgd door een volledige database opschoning van de DEV-omgeving.

### Wijzigingen (functioneel bewezen)

#### 1) Client-side foto-optimalisatie (foto_laadpunt)
- Originele uploads tot **25MB** toegestaan (hard cap vóór verwerking).
- Foto’s worden **client-side verkleind en geherencodeerd naar JPEG**:
  - max dimensie: `1600px`
  - JPEG quality: `0.78`
- Server ontvangt **alleen de geoptimaliseerde bytes**.
- Audit-contract blijft intact:
  - sha256 wordt berekend over finale bytes
  - upload → confirm → server-side verify blijft verplicht

**Bewijs (DEV):**
- 18MB origineel → ~328KB opgeslagen, status `confirmed`
- 24.4MB origineel → ~395KB opgeslagen, status `confirmed`
- 29MB origineel → client-side geblokkeerd (max 25MB)

#### 2) Upload caps & abuse-preventie
- UI hard cap:
  - max **4 laadpalen** per dossier (particulier self-serve)
- Backend cap blijft:
  - max **10 laadpalen** (voor toekomstige batch/enterprise flows)
- Document caps:
  - max **15MB finale upload**
  - per laadpaal:
    - 1× factuur
    - 1× foto_laadpunt
- Ongeldige combinaties worden vroegtijdig geweigerd (UI + Edge).

#### 3) Deferred server-side verificatie
- Server-side download + sha256 gebeurt uitsluitend bij `upload-confirm`.
- `upload-url` endpoint blijft auditwaardig maar goedkoop.
- Resultaat:
  - lagere Edge runtime
  - lagere storage egress
  - audit trail blijft volledig reproduceerbaar

### Technische opschoning (DEV only)

#### 4) Volledige database reset (DEV)
- Alle tabellen in `public` schema geleegd (`TRUNCATE … RESTART IDENTITY CASCADE`).
- Alle `audit_events` verwijderd (±1100 test events).
- Storage bucket `enval-dossiers` volledig geleegd.
- Doel:
  - tests niet langer vervuild door mislukte of experimentele runs
  - nieuwe audits starten vanuit een **schone nulmeting**

**Status na reset:**
- `audit_events`: 0
- `storage.objects (enval-dossiers)`: 0

### Resultaat
- Upload flow is functioneel bewezen.
- Audit-contract is intact.
- Kosten- en stressreductie gerealiseerd.
- DEV-omgeving is schoon en klaar voor volgende Phase-2 stappen.

---

## 2026-02-10 — Upload audit uitbreiding: client_transform in issued+confirmed events (bewijs geleverd)

Wijziging
- `api-dossier-upload-url` en `api-dossier-upload-confirm` nemen `client_transform` op in `event_data` (jsonb).
- `client_transform` is allowlist-only + primitives-only (voorspelbare audit payload; geen nested blobs).

Audit events (impacted)
- `document_upload_url_issued`
- `document_upload_url_rejected`
- `document_upload_confirmed`
- `document_upload_confirm_rejected`

Bewijs (DEV)
- Foto (24.4MB origineel) → client-side downscale JPEG → ~395KB final.
  - `document_upload_url_issued.event_data.client_transform.applied = true`
  - `document_upload_confirmed.event_data.client_transform.applied = true`
  - velden aanwezig: kind/max_dim/quality/out_w/out_h/original_bytes/final_bytes/filenames/mimes
- PDF (±81KB) → geen transform
  - `applied = false` in zowel issued als confirmed
- `event_data_type = object` (jsonb object); geen aparte kolommen voor deze velden.

Status
- DONE (Phase-2 evidence upgrade voor uploads)

---

---

## 2026-02-11 — Mail outbox diagnose: worker OK, scheduler ontbreekt (queued bleef hangen)

Bewezen (DEV, project-ref yzngrurkpfuqgexbhzgl)
- `mail-worker` verwerkt queued mails correct:
  - outbound_emails: `queued → processing → sent`
  - `attempts` increment, `provider_id` gezet, `sent_at` en `last_attempt_at` gevuld
- Dossier-scoped audit events werken (fail-open):
  - `mail_queued` gelogd door `api-lead-submit`
  - `mail_sent` gelogd door `mail-worker`

Evidence (timestamps)
- outbound_emails.id=2 en id=3 stonden queued met `attempts=0` tot manual worker call.
- Manual call:
  - HTTP 200 `Processed batch` (x-request-id `debug-mail-worker-1770775674`)
- Resultaat:
  - id=2 `sent_at=2026-02-11 02:07:58.238+00`, `provider_id=d538...`
  - id=3 `sent_at=2026-02-11 02:07:59.971+00`, `provider_id=535f...`
- Audit:
  - dossier `fff6...`: `mail_queued` (01:50:17Z) → `mail_sent` (02:07:58Z)
  - dossier `489d...`: `mail_sent` (02:07:59Z)

Diagnose
- Backlog “stuck on queued” werd veroorzaakt doordat `mail-worker` niet automatisch werd getriggerd.
- Manual trigger bewijst dat queue writer + worker + audit correct zijn; scheduler/cron configuratie is de ontbrekende schakel.

Next (P1)
- Scheduler/cron job herstellen zodat `mail-worker` elke 2 minuten draait zonder manual curl.
- Bewijscriteria: queued mail gaat automatisch naar sent + audit `mail_sent` met cron request_id.

---

## 2026-02-11 — Mail-worker fast-path gefixt: JWT verify UIT + invoke werkt (bewijs geleverd)

Wijziging
- Supabase Edge Function `mail-worker`:
  - “Verify JWT with legacy secret” staat **UIT** (Dashboard function config).
  - Auth gebeurt via `x-mail-worker-secret` header (shared secret) in de function zelf.
- `api-lead-submit` triggert `mail-worker` via `SB.functions.invoke("mail-worker")` (fail-open, 3s timeout).

Bewijs (DEV)
- Dossier `3da7b8c6-64c4-4a56-a172-88508b04f423` audit events:
  - `mail_queued` → `mail_worker_triggered (ok=true, status=200)` → `mail_sent`
- `mail_sent.request_id = realtime-mail-worker-<request_id>` toont dat het de fast-path call was, niet cron.
- Geen 401 “Invalid JWT” meer bij fast-path.

Security note
- JWT verificatie was hier geen echte securitylaag (server-to-server, geen user claims/RLS).
- Shared-secret guard + private env + audit trail blijft de kern.

---

## 2026-02-11 — Self-serve cap: max 4 laadpunten afgedwongen (frontend + backend, bewijs geleverd)

Wijziging
- `api-lead-submit` (flows `ev_direct` + `installer_to_customer`):
  - reject `charger_count > 4` met duidelijke error: “Maximaal 4 laadpunten per locatie (self-serve).”
- Frontend `aanmelden.html`:
  - dropdown “aantal laadpunten” beperkt tot 1–4 (installateur→klant + EV-rijder).
- Frontend `assets/js/script.js`:
  - client-side guard: toont inline error als gebruiker >4 probeert te sturen (UX-only; backend blijft leidend).

Bewijs
- Curl: `charger_count=5` → `{ ok:false, error:"Maximaal 4..." }` (server-side reject).
- UI: dropdown toont alleen 1–4.

Rationale
- UI is niet trustable; server-side enforce is verplicht voor kwaadwillende clients.
- Backend blijft future-proof: >4 blijft mogelijk voor latere batch/enterprise flows, maar niet via self-serve intake.

---

## 2026-02-12 — api-lead-submit deploy bewezen + canonical testset + gateway/auth nuance vastgelegd

Wat er is bewezen (curl, project-ref yzngrurkpfuqgexbhzgl)
- Function is actief gedeployed:
  - OPTIONS → 200 met strict allowlist CORS (`Access-Control-Allow-Origin: https://www.enval.nl`, `Vary: Origin`)
  - POST zonder `Idempotency-Key` → 400 `Missing Idempotency-Key` (function response)
  - `installer_signup` → 410 `Legacy; neem contact op.` (function response)
  - `ev_direct` → 200 `{ ok:true, lead_id, dossier_id }` (function response)
  - idempotency replay (zelfde key+payload) → 200 met identieke body (function replay)

Auth/gateway nuance (root cause “JWT errors”)
- Zonder `authorization: Bearer <jwt>` kan de Supabase gateway requests weigeren vóór de function draait:
  - 401 `Missing authorization header`
  - CORS headers zijn niet die van de function (vaak `allow-origin: *`)
- Canonical client rule vastgelegd:
  - Altijd zowel `apikey: SUPABASE_ANON_KEY` als `authorization: Bearer SUPABASE_ANON_KEY` meesturen
  - En bij write endpoints: `Idempotency-Key` verplicht waar gespecificeerd

Tooling
- macOS sanity checks: gebruik `python3` (niet `python`) voor kleine scripts en environment checks.

## 2026-02-12 — Docs consistency: CURRENT upload-confirm verify vs Phase-2 deferred verify (expliciet gemaakt)
- Documentatie is aangepast om een expliciet onderscheid te maken tussen:
  - CURRENT gedrag: server-side sha256 verify gebeurt in `api-dossier-upload-confirm`,
  - Phase-2 plan (OPEN): deferred server-side verify bij finalize/export/download.
- Audit Matrix uitgebreid met future-proof guidance voor event semantics (`verified_server_side` + gate).
- TODO DoD aangescherpt: audit-contract + tests moeten gate-verificatie aantoonbaar maken zodra gebouwd.

## 2026-02-12 — Phase-2 doc bijgewerkt naar CURRENT + MID intake gate toegevoegd (WIP)
- Phase-2 document bijgewerkt: geen “plan vs current” meer; beschrijft CURRENT gedrag.
- Upload-confirm blijft harde gate: server-side download + sha256 verify → confirmed bij match.
- MID uitbreiding toegevoegd:
  - intake velden: `in_nl`, `has_mid` (self-serve gate)
  - per laadpaal: `has_mid`, `mid_number` (customer-claim)
- Open: backend enforcement + auditpositie voor intake rejects (pre-dossier vs dossier-scoped).

## 2026-02-17 — DB exposure hardening + intake rejects auditbaar zonder dossier (pre-dossier)

Wat is er gebeurd
- `public.intake_audit_events` toegevoegd als auditstream voor intake rejects zonder dossier scope.
- RLS + privileges aangescherpt: anon/auth REST reads geven nu `permission denied` op core tabellen (by design).
- Keuze gemaakt voor audit inspectie: Optie 1 = Supabase SQL Editor (geen admin read endpoint).

Bewijs / signalen
- `curl .../rest/v1/<table>` met anon key → `42501 permission denied` op o.a. `leads`, `dossiers`, `outbound_emails`, `contact_messages`, `idempotency_keys`, `intake_audit_events`, `dossier_audit_events`.
- `pg_tables.rowsecurity=true` voor alle public tabellen.
- `intake_audit_events` bevat reject rows (flow=ev_direct, reason in_nl_false / has_mid_false).

Open aandacht (belangrijk)
- Intake auditpositie “A” (hard reject vóór dossier-create) moet code-consistent worden in `api-lead-submit`:
  - eligibility check vóór `leads.insert` en vóór `dossiers.insert`
  - reject → insert in `intake_audit_events`

---

## 2026-02-17 — NL + MID intake gates volledig audit-proof (pre-dossier)

- api-lead-submit enforce:
  - reject indien in_nl != true
  - reject indien has_mid != true
- Rejects worden gelogd in public.intake_audit_events (stage=eligibility)
- Geen lead/dossier/mail bij reject
- Idempotency replay werkt ook voor rejects
- Curl + SQL bewijs geleverd

Architectuurkeuze expliciet:
- Intake rejects zijn pre-dossier en worden niet in dossier_audit_events gelogd.
- intake_audit_events is dedicated intake audit stream.

## 2026-02-17 — Mail-worker debug bewijs + gateway-401 root cause vastgelegd

Bewezen gedrag (curl):
- Call naar mail-worker zonder gateway auth headers:
  - HTTP/2 401 met JSON `{ "code":401,"message":"Missing authorization header" }`
  - Dit is gateway reject vóór function runtime (geen function logs/audit).
- Call met gateway auth headers + juiste secret:
  - HTTP/2 200 `No queued emails`
  - Bewijst dat mail-worker runtime OK is en secret guard werkt.

DB bewijs:
- outbound_emails laatste 5 rows staan op `status=sent` en `attempts=1` (geen backlog).
- Conclusie: queue → worker → provider keten functioneert; debug-issues hierna eerst op headers/cron/scheduling toetsen.

Doc impact:
- 00_GLOBAL + 01_SYSTEM_MAP + 02_AUDIT_MATRIX uitgebreid met “gateway auth is verplicht” runbook-regel.

---

## 2026-02-19 — Frontend runtime-config herarchitectuur (no-secrets model)

Context
- Secrets mochten niet langer in `assets/js/config.js` staan.
- Doel: repo-first, reproduceerbaar, geen keys in code.

Wijziging
- Introduced `assets/js/config.runtime.js` (generated file, not committed).
- config.js bevat geen SUPABASE keys meer.
- netlify.toml build-injectie toegevoegd.
- scripts/gen-runtime.sh toegevoegd voor lokale regeneratie.
- Scriptvolgorde verplicht gemaakt:
  - config.runtime.js vóór config.js

Bewijs
- Console: `window.ENVAL` toont correcte SUPABASE_URL en SUPABASE_ANON_KEY.
- Service role key niet zichtbaar in frontend.
- Netlify deploy injecteert environment vars correct.

Security impact
- Repo bevat geen secrets.
- Eén bron per omgeving:
  - lokaal → .env.local
  - productie → Netlify UI

Status: DONE


## 2026-02-19 — Conversie: eligibility → aanmelden prefill (charger_count + own_premises)
- index.html eligibility gate: “Start aanmelden” link geeft nu query params mee:
  - charger_count
  - own_premises
- assets/js/script.js: aanmelden-form leest query params en prefilt dropdowns.
- Legacy URL param `ref` / installer_ref prefill verwijderd (installer frontend is gedelete).
Doel: frictie omlaag, dubbel invullen weg, zonder backend changes.

## 2026-02-19 — Frontend regressie fix: forms submit + eligibility gate + button classes + journey anchors
- Fix: assets/js/script.js DOMContentLoaded block hersteld (prefill query params + bindings) → voorkomt default GET form submits.
- Fix: index.html eligibility gate → eligible route stuurt naar /aanmelden.html met query param prefill (charger_count, own_premises).
- Fix: button class naming gestandaardiseerd (btn primary/outline) i.p.v. mix met btn-primary/btn-secondary → styling hersteld.
- Fix: homepage “Hoe het werkt” is anchor-based (id=hoe-het-werkt) zodat buttons/nav niet naar de lange pagina sturen.
- Hardening: forms method="post" om querystring/PII in URL te vermijden bij JS-fail.

## 2026-02-23 — Frontend CSS refactor: core vs legacy fysiek gescheiden (audit-proof onderhoud)

Wijziging

- Legacy page styling is verplaatst naar een aparte file: assets/css/legacy.css <-- legacy.css bestaat niet meer sinds 25-02-2026, alles gebruikt nu style.css>
- Core styling blijft in assets/css/style.css en blijft leidend voor:
  - index.html, aanmelden.html, dossier.html
- style.css bevat CSS Layers:
  - @layer base, components, pages, utilities;
  - Legacy isolation gebeurt nu via file separation (niet via body.page-legacy scoping).

Impact

- Minder regressierisico: pricing/timeline/page-hero/prose beïnvloeden core pages niet meer.
- Geen regex-scoping scripts nodig; eenvoud en determinisme omhoog.

Bewijs / checks
- grep in style.css toont geen legacy structuren (behalve generieke badge/icon hergebruik).
- grep in legacy.css toont page-hero/prose/pricing/timeline regels. <-- legacy.css bestaat niet meer sinds 25-02-2026, alles gebruikt nu style.css>

## 2026-02-24 — Frontend contract fixes: MID naming + export/payment decoupling + flow-step symmetry

Wijzigingen
1) MID naming aligned met CURRENT spec:
- Frontend dossier UI gebruikt nu `mid_number` i.p.v. `meter_id`.
- `api-dossier-charger-save` payload key aangepast naar `mid_number`.
- Charger tabel render toont `mid_number`.

Rationale:
- Voorkomt schema/contract drift en audit/export inconsistenties.

2) Export/payment decoupling expliciet gemaakt in CURRENT docs:
- “Indienen” blijft audit-gate (lock/in_review), onafhankelijk van betaling.
- “Export (betaald)” is product-gate die later enforcement kan krijgen zonder wizard/schema wijziging.

3) Flow UI (“Hoe het werkt” cards) symmetrie gefixt:
- Cards krijgen vaste interne layout zodat 1-regel vs 2-regel titels niet optisch scheef trekken.


# AMENDMENT — 02_AUDIT_MATRIX.md

Datum: 2026-02-24
Type: Payment events toevoeging
Status: APPEND-ONLY

---

## Nieuwe audit events (Payment)

### payment_status_changed

Scope: dossier
Type: success
Trigger: wijziging van payment_status

Event_data bevat minimaal:

* from
* to
* reason (optioneel)
* request_id
* actor_ref
* ip
* ua
* environment

---

### evaluate_rejected (payment_required)

Scope: dossier
Type: reject
Trigger: evaluate(finalize=true) geblokkeerd door unpaid status wanneer PAYMENT_GATE_MODE=submit

Event_data reason:

* payment_required

---

### export_rejected (payment_required)

Scope: dossier
Type: reject
Trigger: export geblokkeerd door unpaid status wanneer PAYMENT_GATE_MODE=export

Event_data reason:

* payment_required

---

## 2026-03-02 — Strategische positionering expliciet gemaakt

- Enval bevestigd als infrastructuurlaag.
- Geen Inboeker BV of verticale integratie.
- Uniform export pricing model vastgesteld (€15 per dossier).
- Audit Pack Standard benoemd als kernproductartefact.
- Expliciet vastgelegd: geen compliance-, verificatie- of certificeringsclaims.


## 2026-03-03 — Session-auth geïntroduceerd: dossier_sessions + frontend api.js shared

Wijzigingen
- DB: nieuwe tabel `public.dossier_sessions` toegevoegd:
  - bewaart sessies per dossier met TTL (`expires_at`), revoke (`revoked_at`) en observability (`last_seen_at`).
  - unieke indexen op `session_token_hash` (global) en `(dossier_id, session_token_hash)`.
- Auth boundary aangescherpt:
  - dossier link-token (`t`) is start-auth; voor dossier reads/writes wordt een session-token gebruikt.
- Edge functions aangepast:
  - api-dossier-get / api-dossier-access-save / api-dossier-access-update / api-lead-submit (session-aware).
- Frontend: `assets/js/api.js` toegevoegd als shared helper:
  - url param helpers (`d`, `t`)
  - session token storage per dossier (`enval_session_token:<dossier_id>`)
  - `apiPost()` wrapper voor Netlify functions + Idempotency-Key.

Rationale
- Link-token als permanent auth is te zwak (geen revoke/TTL controle en lastig te auditen).
- Session registry maakt TTL, revoke, monitoring en incidentanalyse mogelijk.

Open aandacht
- Audit matrix moet session events expliciet maken (session_created/session_invalid/etc.).
- Ops runbook moet session-debug queries toevoegen (active/expired/revoked sessions).


## 2026-03-04 — Docs hygiene: CSS single-source bevestigd; legacy.css references gelabeld als OUTDATED
- Docs gecorrigeerd zodat CURRENT waarheid eenduidig is:
  - Eén stylesheet: `assets/css/style.css`.
  - `assets/css/legacy.css` bestaat niet (meer).
- Bestaande historische passages zijn niet verwijderd, maar gelabeld als OUTDATED waar nodig.
Doel:
- Geen interne contradicties in core docs (audit-first → ook doc-first).

## 2026-03-04 — SEO/robots baseline

Wijziging:
- SEO baseline gehardend: canonical/OG/Twitter/favicons per core page (consistent).
- Route-truth vastgelegd: aanmelden.html productie; aanmelden_real.html tijdelijk (noindex, later hernoemen en verwijderen).
- Robots/sitemap beleid toegevoegd aan docs (robots.txt + sitemap.xml; sitemap alleen canoniek).

Risico’s (bewust):
- Als aanmelden_real.html zonder noindex live gaat → duplicate content in index.

DoD:
- aanmelden_real.html bevat <meta name="robots" content="noindex, nofollow"> zolang hij bestaat.
- robots.txt verwijst naar sitemap en disallowt tijdelijke routes.
- sitemap.xml bevat alleen canonieke publieke pagina’s.

## 2026-03-05 — Login recovery live + throttle reason enums gestandaardiseerd

Wijziging
- `api-dossier-login-request` geïntroduceerd/afgerond als recovery-flow zonder dashboard.
- Anti-enumeration: response altijd `{ ok: true }`; audit events zijn source-of-truth.
- Throttling reasons gestandaardiseerd (event_data.reason enum):
  - `ip_rate_limit`
  - `dossier_rate_limit`
  - `mail_rate_limit`

Bewijs
- Audit trail toont: `login_request_received`, `login_request_rejected` (email_mismatch), `login_link_issued`, `login_request_throttled` met bovenstaande reasons.

## 2026-03-12 — Fresh-only testsuite contract gecorrigeerd (bootstrap/login/cleanup)

Wijzigingen
- Testsuite is nu expliciet `fresh-only`:
  - nieuw dossier via echte intake/mailflow
  - `DOSSIER_ID` + `DOSSIER_TOKEN` vanuit state
  - geen allowlist-pad meer
- Legacy `TOKEN_RESET`-skelet verwijderd uit `scripts/tests/01_setup.sh`.
- `FORCE_CREATE` verwijderd; setup maakt nu alleen exact tot target chargers aan.
- Login recovery test gecorrigeerd naar CURRENT runtime waarheid:
  - direct na fresh bootstrap wordt extra login-request **gethrottled**
  - canonical auditverwachting: `login_request_throttled`
  - geen onterechte verwachting meer van `login_link_issued` in dezelfde run
- Cleanup contract gecorrigeerd:
  - created chargers/docs/storage worden verwijderd
  - dossier/outbound/audit shell blijft bewust bestaan
  - hard delete van dossier blijkt in strijd met immutability (`IMMUTABLE_TABLE: dossier_audit_events cannot be DELETE`)

Bewijs
- `scripts/tests/run_all.sh` volledig groen:
  - intake rejects/idempotency
  - login throttle + mismatch
  - charger rejects
  - upload rejects
  - happy uploads
  - cleanup verify
- Cleanup verify toont CURRENT eindstatus:
  - mutable child rows verwijderd
  - retained dossier rows: 1
  - retained outbound_emails rows: 1
  - retained audit rows: 1

Architecturale conclusie
- audit-gebonden dossiers zijn CURRENT niet hard deletebaar
- lifecycle-oplossing moet later via tombstone/archive semantics, niet via hard delete


## 2026-03-12 — TODO hygiene note: open vs bewezen afbakening

Documentatiebesluit:
- DONE-items horen niet in `04_TODO.md`, maar in changelog.
- TODO blijft uitsluitend open werk bevatten.

Nuance:
- Niet elke implementatie-entry impliceert volledig bewezen DoD.
- Met name voor hardening-/proof-items blijft de maatstaf:
  - expliciet runtimebewijs, of
  - expliciete grep/sql/curl bevestiging.

Gevolg:
- Items zoals session-auth hardening, api.js adoptie, MID grep-cleanliness en live SEO verificatie blijven OPEN totdat hun bewijs expliciet is geleverd.
---

# EINDE 03_CHANGELOG_APPEND_ONLY.md (append-only, updated)
