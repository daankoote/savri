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

## 2026-03-13 — Session-auth refactor afgerond + legacy endpoints verwijderd + frontend api.js opgeschoond

Wijzigingen
- Dossier runtime-auth verder geharmoniseerd rond `session_token`:
  - write/read dossier-endpoints gebruiken nu session-auth als canonical model
  - link-token blijft uitsluitend voor initial exchange via `api-dossier-get`
- Nieuwe shared helper toegevoegd:
  - `supabase/functions/_shared/customer_auth.ts`
  - levert uniforme session-auth + actor_ref + scoped idempotency helpers
- Frontend shared API helper staat nu canoniek op:
  - `assets/js/api.js`
- Verkeerd geplaatste legacy copy verwijderd:
  - `supabase/functions/_shared/api.js` verwijderd
- Legacy endpoints verwijderd:
  - `api-dossier-submit-review`
  - `api-dossier-address-preview`

Behavior / contract
- Canonical reviewflow:
  - `api-dossier-evaluate(finalize=false)` = precheck
  - `api-dossier-evaluate(finalize=true)` = lock + in_review
- Canonical address preview:
  - via `api-dossier-address-verify`
  - preview is nu dossier-scoped + auditwaardig
- Export blijft:
  - session-auth
  - alleen voor locked / in_review dossiers
  - alleen confirmed docs

Frontend
- `assets/js/api.js` is source-of-truth voor:
  - dossier id uit URL
  - link-token uit URL
  - session-token storage per dossier
  - legacy localStorage cleanup
  - idempotent `apiPost()` wrapper
- `assets/js/pages/dossier.js` gebruikt deze helpers als shared layer i.p.v. verspreide fetch/session logica.

Tooling
- `scripts/tools/edge-uniformity.sh` opgeschoond naar V4:
  - `api-dossier-submit-review` verwijderd uit CORE lijst
  - `api-dossier-address-preview` verwijderd uit UTILITY lijst
  - alleen `mail-worker` resteert als utility
- Uniformity report bevestigt:
  - core baseline groen
  - utility baseline groen
  - geen unclassified functions

Bewijs
- Dossierflow werkt end-to-end:
  - chargers zichtbaar in UI
  - uploads confirmed
  - evaluate finalize zet dossier op `in_review`
  - exportflow session-auth aligned
- grep/uniformity bevestigt:
  - geen actieve references meer naar verwijderde endpoints in runtime code
  - frontend laadt `assets/js/api.js` canoniek

## 2026-03-13 — Docs truth aligned op session-auth canonical model + legacy endpoint removal

Wijzigingen in documentatie
- `01_SYSTEM_MAP.md` aangepast zodat CURRENT waarheid nu expliciet is:
  - runtime dossier-auth = session-token
  - link-token alleen voor initiële exchange via `api-dossier-get`
  - `assets/js/api.js` is frontend source-of-truth
  - `supabase/functions/_shared/customer_auth.ts` verplaatst naar backend shared helpers i.p.v. frontend assets
- `02_AUDIT_MATRIX.md` opgeschoond:
  - `api-dossier-submit-review` verwijderd als actuele reviewbron
  - `api-dossier-address-preview` verwijderd als actuele previewbron
  - session rejects explicieter beschreven als endpoint-scoped reject events
  - login recovery eventbeschrijving aangepast naar CURRENT codegedrag
- `10_EDGE_FUNCTIONS_CONTRACT.md` bevestigd:
  - CORE lijst zonder legacy endpoints
  - UTILITY lijst bevat alleen `mail-worker`
  - session-token in request body is CURRENT canonical runtime auth model

Doel
- CURRENT docs weer één bron van waarheid maken
- voorkomen dat historische tekst als actuele architectuur wordt gelezen


## 2026-03-15 — Fresh-only testsuite gehardend naar CURRENT session-auth + sabotage-proof bewijs

Wijzigingen
- `scripts/tests/run_all.sh` blijft fresh-only, maar runtime contract is nu expliciet session-auth gebaseerd.
- `scripts/tests/00_helpers.sh` uitgebreid met:
  - `dossier_session_token()`
  - `require_dossier_session_token()`
  - `bootstrap_session_from_link_token()`
  - DB proof helpers voor confirmed documents / document counts / charger counts
- `scripts/tests/01_setup.sh` bootstrap nu automatisch session-token wanneer nog niet aanwezig.
- Runtime endpoint tests aangepast van link-token auth naar `session_token` waar CURRENT contract dat vereist:
  - charger save/delete
  - upload-url
  - upload-confirm
  - cleanup deletes
- `scripts/tests/06_upload_happy.sh` gehardend:
  - DB proof vóór uploads (`dossier_documents` count)
  - DB proof per confirmed document row
  - DB proof na uploads (expected total count)
- `scripts/tests/07_cleanup.sh` gehardend:
  - pre-check: docs per created charger aanwezig
  - post-delete proof: docs per charger = 0
  - dossier-level child rows = 0 na cleanup

Belangrijk bewijs
- suite is expliciet getest op sabotage / false-green risico:
  - verkeerde audit reason → suite faalt
  - verkeerde audit stage → suite faalt
  - verkeerde file sha256 → suite faalt met 409 mismatch
  - foutieve DB row confirmation lookup → happy proof faalt

Conclusie
- testsuite bewijst nu niet alleen HTTP-uitkomsten,
  maar ook audit-inhoud en database-eindstaat voor load-bearing flows.

Open gebleven
- expired session bewijs op meerdere endpoints
- revoked session bewijs op meerdere endpoints
- storage object cleanup proof buiten DB-cascade
- export gate contract tests


## 2026-03-15 — Docs sync afgerond op CURRENT testsuite waarheid

Wijzigingen
- `01_SYSTEM_MAP.md` bijgewerkt naar CURRENT testsuite contract:
  - fresh-only bootstrap
  - session-auth als canonical runtime test-auth
  - sabotage-proof testbewijs expliciet gemaakt
- `02_AUDIT_MATRIX.md` bijgewerkt:
  - sabotage-proof bewijs toegevoegd
  - DB proof bij happy upload confirm expliciet gemaakt
  - session reject nuance (`session_not_found`) verduidelijkt
- `04_TODO.md` opgeschoond:
  - docs-sync item verwijderd nadat de doc updates daadwerkelijk waren doorgevoerd

Conclusie
- CURRENT docs reflecteren nu de 2026-03-15 testsuite-hardening correct.
---

## 2026-03-15 — Docs hygiene cleanup: markdown formatting + CURRENT truth verduidelijkt

Wijzigingen
- `00_GLOBAL.md` opgeschoond op leesbaarheid en markdown-formatting:
  - HTML voorbeelden omgezet naar fenced code blocks
  - session-auth wording beter aligned met CURRENT runtime-contract
  - CSS architectuur-sectie rechtgezet naar single-stylesheet waarheid
  - amendment metadata leesbaar gemaakt
  - kleine typo fixes
- `01_SYSTEM_MAP.md` opgeschoond:
  - mail-worker curl voorbeeld omgezet naar fenced bash block
  - kleine typo fix in upload-url beschrijving
- `02_AUDIT_MATRIX.md` licht opgeschoond:
  - gateway/mail-worker nuance leesbaarder gemaakt
  - login recovery endpoint formatting verbeterd

Doel
- Docs beter controleerbaar maken
- CURRENT waarheid explicieter maken
- Markdown rendering voorspelbaar houden


## 2026-03-15 — Analysis v1 skeleton gedeployed en runtime-bewezen (DEV) + export v5 uitgebreid

Wijzigingen
- Nieuwe derived analysis-laag toegevoegd, zonder mutatie van bestaande dossier core tabellen:
  - `public.dossier_analysis_document`
  - `public.dossier_analysis_charger`
  - `public.dossier_analysis_summary`
- Nieuwe shared helper:
  - `supabase/functions/_shared/analysis.ts`
- Nieuw CORE endpoint:
  - `api-dossier-verify`
  - session-auth via `requireCustomerSession(...)`
  - scoped idempotency via session key
  - draait alleen op confirmed documenten
  - schrijft alleen naar analysis-tabellen
- `api-dossier-export` uitgebreid naar schema_version `enval-dossier-export.v5` met:
  - `analysis`
  - `analysis_methods`
  - `analysis_documents`
  - `analysis_chargers`
  - `analysis_summary`

Harde architectuurbetekenis
- Analysis is volledig derived.
- Analysis muteert geen:
  - `dossiers`
  - `dossier_chargers`
  - `dossier_documents`
  - `dossier_checks`

Analysis-semantiek (bewust)
- Analysis is een derived consistency layer
- Geen authenticity-claim
- Geen compliance-claim
- Geen certificeringsclaim
- Geen lifecycle-mutatie van dossier/review/lock

Bewezen runtime-gedrag (DEV)
- verlopen session → `dossier_verify_rejected` met reason `session_expired`
- login recovery → nieuwe link + nieuwe session
- `api-dossier-verify` → HTTP 200 op locked dossier met 4 confirmed docs / 2 chargers
- writes bewezen:
  - `dossier_analysis_document` = 4
  - `dossier_analysis_charger` = 20
  - `dossier_analysis_summary` = 1
- audit events bewezen:
  - `document_analysis_started`
  - `document_analysis_completed`
  - `charger_analysis_result_written`
  - `dossier_analysis_summary_generated`
- idempotency replay bewezen zonder duplicate rows
- export v5 bevat analysis-blokken correct

Belangrijke nuance
- In export metadata is bewust `analysis_key` gebruikt in `analysis_methods`,
  zodat dit niet semantisch botst met row-level `method_code = analysis_v1`.


## 2026-03-16 — Dev unlock bewezen groen + session refresh routine gestandaardiseerd

Bewezen runtime-gedrag
- `api-dossier-dev-unlock` succesvol getest met geldige `session_token`
- Response bevestigd:
  - `ok=true`
  - `unlocked=true`
  - `status="incomplete"`
  - `locked_at=null`
  - `previous_status="in_review"`
  - `previous_locked_at` gevuld
- Daarmee is bevestigd dat de dev-unlock function inhoudelijk werkt

Root cause eerdere failures
- 401’s op zowel `api-dossier-get` als `api-dossier-dev-unlock` bleken veroorzaakt door verlopen runtime sessions
- DB bewijs geleverd in `public.dossier_sessions`:
  - matching `session_token_hash`
  - `revoked_at = null`
  - `expires_at` lag in het verleden

Nieuwe operationele routine
- Canonical dev session refresh flow vastgesteld:
  1. `api-dossier-login-request`
  2. nieuwste `dossier_link` lezen uit `outbound_emails`
  3. link-token exchangen via `api-dossier-get`
  4. nieuwe `session_token` gebruiken voor runtime calls
- Dev helper script toegevoegd:
  - `scripts/tools/refresh-dossier-session.sh`

Browser/UI nuance expliciet bevestigd
- query param `t` blijft exclusief gereserveerd voor link-token
- een `session_token` in `?t=` plaatsen werkt per definitie niet
- browsergebruik met reeds geminte session vereist localStorage key:
  - `enval_session_token:<dossier_id>`

Analysis-context
- testdossier met meerdere invoice-/foto varianten blijft bruikbaar voor verdere Analysis v1 uitwerking
- skeleton analysis staat; volgende stap verschuift van infrastructuur naar echte invoice consistency extraction/matching



## 2026-03-20 — Analysis verify evidence-script verdiept + factuur eerst / foto later aangescherpt

Wijzigingen
- `scripts/tools/verify-analysis-run.sh` verder uitgebreid als dev evidence-tool voor Analysis v1.
- Script schrijft nu één leesbare log weg naar:
  - `scripts/tools/output/latest-analysis-verify.log`
- Log bevat nu naast verify response en summary ook:
  - document analysis rows
  - raw `observed_fields` per document
  - document → charger trace
  - per charger-resultaat:
    - observed
    - expected_db
    - reason
- Hierdoor is de analysis-keten nu direct reviewbaar:
  - document extractie
  - gekoppelde charger-evaluatie
  - dossier-summary

Bewezen runtime-inzicht
- De verify-pipeline zelf werkt technisch correct:
  - `api-dossier-verify` draait
  - analysis-tabellen worden gevuld
  - output is leesbaar en correleerbaar
- Huidige zwakte zit niet primair in pipeline/infrastructuur,
  maar in factuurveldextractie en documentvariatie.

Aangescherpte uitvoeringskeuze
- Eerst factuurspoor hardenen.
- `foto_laadpunt` blijft voorlopig bewust skeleton / `not_checked`.
- Geen laadpaalfoto-analyse starten zonder representatieve dataset.
- Geen OCR in deze fase.
- Eerst uitbreiden op:
  - text-based invoice extraction
  - realistische slechte factuurvarianten
  - field-level observed vs expected review

Architecturale betekenis
- Analysis v1 verschuift nu van “kan technisch draaien” naar “kan inhoudelijk robuust vergelijken”.
- Dev evidence-script is daarmee onderdeel van de canonical analysis debug/proof loop.


## 2026-03-22 — Analysis v1: non-PDF invoice fallback runtime-bewezen (JPG factuur = gecontroleerd inconclusive)

Bewezen via `scripts/tools/verify-analysis-run.sh` op een locked testdossier met gemengde documentset:

### Wat is bewezen
- Een non-PDF factuur (`.jpg`) veroorzaakt geen pipeline failure.
- `api-dossier-verify` verwerkt de JPG factuur gecontroleerd als ondersteund documenttype zonder extractie.
- In `dossier_analysis_document` wordt voor de JPG factuur correct geschreven:
  - `status = completed`
  - `observed_fields = {}`
  - `limitations = ["invoice_image_extraction_not_implemented"]`
  - `summary.mode = "invoice_extract_skipped"`
  - `summary.reason = "non_pdf_invoice_not_supported_yet"`

### Charger-level gedrag (bewezen)
Voor een charger met alleen een JPG factuur als `factuur` document schrijft Analysis v1 correct:
- `invoice_address_match = inconclusive`
- `invoice_brand_match = inconclusive`
- `invoice_model_match = inconclusive`
- `invoice_serial_match = inconclusive`
- `invoice_mid_match = inconclusive`

Met reason:
- `invoice_present_but_no_observed_fields_available`

### Betekenis
- Non-PDF facturen geven CURRENT geen false pass en geen false fail.
- De pipeline degradeert bewust en uitlegbaar naar `inconclusive`.
- Dit bevestigt dat Analysis v1 in deze fase veilig beperkt blijft tot:
  - robuuste `text_based_pdf` extractie voor facturen
  - gecontroleerde fallback voor non-PDF invoices
  - skeleton / `not_checked` voor `foto_laadpunt`

### Belangrijke nuance
- In dezelfde gemengde run bleef `overall_status = review_required`, maar uitsluitend door de reeds bekende en bewust gecreëerde serial mismatch op de andere charger.
- De JPG fallback zelf introduceerde geen nieuwe fail.

## 2026-03-22 — Analysis v1 invoice parser boundary-tests 10 t/m 14 bewezen (Paul)

Bewezen via `scripts/tools/verify-analysis-run.sh` op locked testdossier met Paul-varianten 10 t/m 14.

### Variant 10 — serial wrong
Bestand:
- `invoice_paul_-_real_like_-_10_serial_wrong_01.pdf`

Bewezen resultaat:
- `invoice_serial_match = fail`
- address/brand/model/mid = `pass`

Conclusie:
- serial mismatch detectie werkt correct en geïsoleerd.

### Variant 11 — all correct
Bestand:
- `invoice_paul_-_real_like_-_11_all_correct_01.pdf`

Bewezen resultaat:
- alle invoice checks = `pass`

Conclusie:
- happy-flow voor volledige text-based PDF factuur werkt correct.

### Variant 12 — chaos
Bestand:
- `invoice_paul_-_real_like_-_12_chaos_01.pdf`

Bewezen resultaat:
- `invoice_address_match = inconclusive`
- brand/model/mid/serial = `pass`
- observed address fields bleven `null`

Conclusie:
- chaos-layout breekt CURRENT address extractie,
  maar niet de andere text-based labeled fields.

### Variant 13 — multi-page
Bestand:
- `invoice_paul_-_real_like_-_13_multi-page_01.pdf`

Bewezen resultaat:
- alle invoice checks = `pass`

Conclusie:
- multipage text-based PDF wordt CURRENT correct ondersteund.

### Variant 14 — multi-page + chaos
Bestand:
- `invoice_paul_-_real_like_-_14_multi-page_chaos_01.pdf`

Bewezen resultaat:
- `invoice_address_match = inconclusive`
- brand/model/mid/serial = `pass`
- observed address fields bleven `null`

Conclusie:
- multipage op zichzelf is niet het probleem;
- de bewezen limiet zit in address block reconstruction bij chaos-layouts.

### Harde eindconclusie
Analysis v1 ondersteunt CURRENT aantoonbaar:
- text-based PDF facturen
- multipage PDF facturen
- mismatch-detectie voor:
  - address
  - brand
  - model
  - serial
  - MID

Analysis v1 ondersteunt CURRENT aantoonbaar níet robuust:
- reconstructie van adresvelden wanneer straat/huisnummer/postcode/plaats
  los en ongeordend door de PDF verspreid staan

Auditmatig is dit gewenst gedrag:
- geen false pass
- geen verzonnen adreswaarden
- veilige degradatie naar `inconclusive`

## 2026-03-23 — Dossier frontend hardening: precheck/full-evaluate flow, analysis-weergave, export/dev-unlock UX

Wijzigingen in `assets/js/pages/dossier.js`
- Frontend dossierflow aangescherpt naar expliciete volgorde:
  1. `api-dossier-evaluate(finalize=false, evaluation_mode="core")`
  2. `api-dossier-verify(mode="refresh")`
  3. `api-dossier-evaluate(finalize=false, evaluation_mode="full")`
  4. `api-dossier-evaluate(finalize=true, evaluation_mode="full")`
- “Dossier indienen” wordt client-side pas zichtbaar wanneer:
  - `precheckOk === true`
  - `dirtySincePrecheck === false`
- Elke mutatie invalidate bestaande precheck client-side:
  - access
  - address
  - charger save/delete
  - document upload/delete
  - consents save

Analysis/UI
- `analysis_readable` wordt nu leesbaar gerenderd in de dossier-UI:
  - overall status
  - charger-level resultaten
  - document-level observed fields
  - limitations
  - summary
- Locked dossiers tonen export/read-only analysis-context beter in de UI.

Dev / ops
- Frontend dev-unlock flow toegevoegd:
  - `api-dossier-dev-unlock`
  - alleen zichtbaar in dev-toegestane context
  - zet client-side precheck-status terug naar ongeldig na unlock
- Session runtime model in browser verder gehardend:
  - localStorage key `enval_session_token:<dossier_id>`
  - `t` blijft exclusief link-token voor initiële exchange

Upload/UI
- Client-side foto-optimalisatie actief gehouden
- frontend hard caps expliciet in UI-flow:
  - `UI_MAX_CHARGERS = 4`
  - originele file cap 25MB
  - finale upload cap 15MB

Architecturale betekenis
- Geen wijziging aan backend lifecycle of audit semantics.
- Wel scherpere frontend discipline zodat review/lock/analysis-flow minder impliciet en minder foutgevoelig is.

## 2026-03-24 — Dossier UI aligned op MVP-documentmodel + stabiele laadpaalnummering + MID leidend

Wijzigingen
- `dossier.html`
  - centrale uploadform in stap 4 verwijderd
  - alleen `uploadState` + documentkaarten blijven over
- `assets/js/pages/dossier.js`
  - upload gebeurt nu direct per laadpaalkaart en per documenttype
  - stabiele laadpaalvolgorde behouden in de UI
  - nieuwe laadpalen verschijnen onderaan
  - uploadslot verdwijnt zodra het enige toegestane document van dat type al aanwezig is
- `assets/css/style.css`
  - documentvakken en kaartstatus verder opgeschoond/gealigneerd op de nieuwe per-kaart uploadflow
- `supabase/functions/api-dossier-get/index.ts`
  - charger-volgorde aangepast zodat frontend stabiele nummering kan tonen
- migratie toegevoegd:
  - `20260324_drop_serial_unique_indexes_dossier_chargers.sql`

Bewezen functioneel gedrag
- laadpaalnummering blijft stabiel over refreshes
- nieuwe laadpaal komt onderaan i.p.v. bovenaan
- upload werkt direct vanuit de juiste laadpaalkaart
- zodra factuur of foto aanwezig is, verdwijnt het uploadslot voor dat type
- delete maakt dat type weer uploadbaar
- dossierflow blijft verder werken:
  - upload
  - confirm
  - precheck
  - finalize
  - export

Architecturale betekenis
- Geen wijziging aan audit lifecycle of reviewstate.
- Wel duidelijke reductie van frontend-schijncomplexiteit:
  - geen dropdown voor documenttype/laadpaal meer
  - geen UI die multi-document support suggereert terwijl CURRENT MVP dat niet ondersteunt

Identifier-richting
- Serial uniqueness is losgelaten als harde systeemaanname.
- MID is in deze fase leidend voor product- en dossierlogica.

## 2026-03-30 — Analysis overall-status semantics gecorrigeerd: `inconclusive` toegevoegd en summary-constraint aligned

Probleem
- Na introductie van de nieuwe overall-status `inconclusive` kon `api-dossier-verify` runs starten en document-/charger-analysis rows schrijven,
  maar faalde de summary-write op `public.dossier_analysis_summary.overall_status_check`.
- Gevolg:
  - analysis runs konden blijven hangen op `running`
  - vervolgruns botsten op `uq_analysis_runs_one_active_per_dossier`
  - de zichtbare fout “er draait al een actieve analyse-run” was daardoor secundair, niet de primaire oorzaak

Fix
- DB constraint op `public.dossier_analysis_summary.overall_status` uitgebreid met:
  - `inconclusive`
- Vastgelopen runs handmatig hersteld / vrijgegeven
- Backend semantics in `_shared/analysis.ts` aligned:
  - `AnalysisOverallStatus` bevat nu:
    - `not_run`
    - `inconclusive`
    - `partial_pass`
    - `pass`
    - `review_required`
- `computeOverallStatus()` aangepast zodat:
  - `fail` → `review_required`
  - alleen volledig pass → `pass`
  - minimaal één echte pass + rest onzeker/niet-gecheckt → `partial_pass`
  - geen pass, geen fail, alleen `inconclusive`/`not_checked` → `inconclusive`

UI / dossier.js
- Analysis badge-mapping uitgebreid met:
  - `inconclusive`
- Analysis-dev blok tijdens development expliciet zichtbaar gehouden
- Legendtekst aangescherpt zodat verschil tussen:
  - `pass`
  - `partial_pass`
  - `inconclusive`
  - `not_checked`
  - `fail`
  nu explicieter is

Runtime-bewijs
- Nieuwe analysis-run wordt weer correct afgerond
- Analysis summary toont nu correct:
  - `overall = inconclusive`
  wanneer:
  - factuur-image geen bruikbare observed fields oplevert
  - laadpaalfoto-analysis nog `not_checked` is

Belangrijke inhoudelijke conclusie
- De semantiek is nu correcter, maar invoice image extractie is nog niet echt operationeel.
- Bewijs uit de document-output laat zien dat JPG-facturen CURRENT alleen door de preflight/light-stage gaan:
  - `observed_fields = {}`
  - `image_text_stage2_not_implemented_yet`
  - `image_text_no_local_ocr_engine_available`
  - `image_text_extraction_not_performed`
  - `mode = invoice_image_extract_preflight_only`
- Dus:
  - statuslaag verbeterd
  - extractielaag voor invoice images blijft OPEN werk

## 2026-03-30 — Invoice-image analysis richting expliciet gemaakt in CURRENT docs

Context
- `api-dossier-verify` ondersteunt al factuurdocumenten met:
  - `application/pdf`
  - `image/jpeg`
  - `image/png`
- De image-route liep inhoudelijk nog via `supabase/functions/_shared/image_text.ts` in preflight-only modus:
  - formaatdetectie
  - width/height
  - byte_length
  - geen echte tekstextractie
- Daardoor degradeerden JPG/PNG facturen gecontroleerd naar:
  - document-level `completed` met limitations
  - charger-level invoice checks = `inconclusive`

Wat nu expliciet is vastgezet
- Invoice-image extractie is CURRENT open uitvoerfase binnen Analysis v1.
- Canonieke extractie voor factuurafbeeldingen wordt server-side bepaald.
- Client-side blijft beperkt tot:
  - precheck
  - optimalisatie/compressie
  - UX-waarschuwingen
- `foto_laadpunt` blijft voorlopig bewust skeleton / `not_checked`.

Belangrijke doc-correctie
- Oude formuleringen zoals “geen OCR in deze fase” zijn voor invoice-images niet meer de juiste richting.
- De juiste CURRENT waarheid is:
  - geen externe OCR/vision provider
  - wel server-side invoice-image extractie als onderdeel van Analysis v1
  - met veilige degradatie naar `inconclusive` wanneer extractie onvoldoende bruikbaar is

Status
- Documentatie aligned
- Implementatie nog OPEN

## 2026-03-30 — Invoice-image OCR in Supabase Edge expliciet afgewezen; koers verplaatst naar standalone interne worker

Context
- Analysis v1 orchestration is technisch gezond:
  - `api-dossier-verify` draait
  - analysis-tabellen worden gevuld
  - summary-semantiek is aligned
- De inhoudelijke blokkade zat specifiek in invoice-image extractie binnen de Supabase Edge runtime.

Wat is expliciet mislukt
- Poging om lokale invoice-image OCR direct binnen `api-dossier-verify` / `_shared/image_text.ts` te laten draaien.
- Praktisch resultaat:
  - image facturen bleven hangen op preflight-only / lege `observed_fields`
  - verify-run eindigde gecontroleerd op:
    - document-level `completed`
    - charger-level `inconclusive`
  - en tussentijds zijn ook runtime-/resourceproblemen opgetreden bij de OCR-route in Edge-context

Architecturale conclusie
- Het probleem zit niet in:
  - analysis-tabellen
  - verify orchestration
  - exportmodel
- Het probleem zit wél in:
  - de gekozen runtime-plaatsing van de lokale OCR-engine

Besluit
- Geen externe OCR/vision provider
- Geen browser-side canonieke OCR
- Geen verdere investering in zware invoice-image OCR binnen Supabase Edge runtime

Nieuwe richting
- Invoice-image extractie wordt eerst gebouwd als aparte interne standalone worker buiten Edge
- Doel van fase 1:
  - lokaal/intern bewezen OCR op factuurafbeeldingen
  - output laten landen op hetzelfde observed/evaluated contract als PDF facturen
- Pas daarna:
  - koppeling naar `api-dossier-verify`
  - daarna pas laadpaalfoto-analysis

Betekenis voor de codebasis
- `api-dossier-verify` blijft derived orchestrator
- `_shared/image_text.ts` blijft contract-/normalisatielaag
- Edge wordt voorlopig niet meer gebruikt als runtime-host voor de zware invoice-image OCR-engine zelf

## 2026-03-31 — Standalone invoice-image worker lokaal bewezen + compare-laag toegevoegd + PDF→JPG regressielane opgezet

Context
- De koerswijziging van 2026-03-30 blijft staan:
  - geen zware invoice-image OCR meer in Supabase Edge runtime
  - eerst standalone/internal worker buiten Edge
- Op 2026-03-31 is die richting lokaal inhoudelijk verdiept en bruikbaar bewezen.

### Wat is toegevoegd

#### A) Lokale standalone invoice-image extractor
Nieuwe lokale workerflow in `scripts/analysis_worker/ocr_extract.py` verder gehardend.

Bewezen output-contract bevat nu per analysedocument:
- `customer_name`
- `address_line`
- `house_number`
- `postcode_line`
- `city_line`
- `country_line`
- `serial_number`
- `serial_candidate_raw`
- `mid_number`
- `mid_candidate_raw`
- `address_block_ambiguous`
- `brand`
- `model`

Belangrijke inhoudelijke keuze:
- raw candidate preservation is nu expliciet onderdeel van het contract
- parser mag veilig normaliseren
- parser mag niet gokken
- noisy of ongeldige MID/serial candidates worden niet “gerepareerd”, maar:
  - raw wordt bewaard
  - approved value blijft `null`
  - limitation markeert de reject

Voorbeelden van bewezen veilig gedrag:
- noisy MID candidate → `mid_candidate_raw` gevuld, `mid_number = null`, limitation `mid_candidate_rejected`
- serial mismatch blijft zichtbaar als observed mismatch en wordt niet stil gecorrigeerd

#### B) Lokale compare-laag tussen expected / observed_raw / observed_approved
Nieuw lokaal script:
- `scripts/analysis_worker/compare_invoice_results.py`

Doel:
- brug tussen parser en latere verify-integratie
- per bestand en per veld zichtbaar maken:
  - `expected`
  - `observed_raw`
  - `observed_approved`
  - `status`
  - `reason`

Inhoudelijke status-taxonomie lokaal bewezen:
- `pass`
- `fail`
- `inconclusive`
- `partial`
- `mixed`

Belangrijke verfijning:
- load-bearing velden tellen zwaarder dan brand/model
- `overall_reason` is toegevoegd, o.a.:
  - `all_expected_fields_match`
  - `serial_value_mismatch`
  - `mid_candidate_rejected`
  - `multiple_load_bearing_mismatches`
  - `seller_or_company_block_detected`

#### C) PDF→JPG image-testlane toegevoegd
Nieuwe lokale conversie- en batchroute opgezet:
- PDF testset → JPG’s in repo
- aparte batch-run voor `docs/facturen/facturen_image`
- output in bestaande analysis_worker outputstructuur

Nieuwe scripts:
- `scripts/analysis_worker/convert_pdf_tests_to_jpg.py`
- `scripts/analysis_worker/run_pdf_derived_image_batch.py`

Belang:
- dezelfde testfamilie als PDF analysis matrix kan nu ook als image-lane worden beoordeeld
- regressies tussen PDF-gebaseerde en image-gebaseerde layouts worden zichtbaar

### Wat inhoudelijk is bewezen

#### 1. Camera/screenshot/synthetic lane is sterk genoeg voor een eerste standalone fase
De lokale invoice-image extractor leest inmiddels in meerdere cases correct:
- customer-side address block
- postcode/city normalisatie
- serial/MID
- brand/model waar expliciet aanwezig

#### 2. Parser boundary is nu duidelijker en eerlijker
Niet meer:
- noisy punctuation zelf omzetten naar schijnbaar geldige digits

Wel:
- raw candidate bewaren
- approved alleen bij voldoende harde candidate
- limitation gebruiken om inconclusive zichtbaar te maken

#### 3. Compare-laag laat correct verschil zien tussen extractie en beoordeling
Voorbeeld:
- OCR leest een geldige maar verkeerde serial
- parser bewaart die observed value
- compare-laag markeert vervolgens `value_mismatch`
- dit wordt dus niet meer onterecht als parser-“succes” verkocht

#### 4. PDF→JPG lane levert echte parserinzichten op
Single-page PDF-afgeleide JPG’s bleken vaak verrassend goed leesbaar.
Daarmee is bewezen dat de image-lane niet alleen relevant is voor slechte camera-shots,
maar ook voor layout-gedreven regressietests.

### Nieuwe bewezen parsergrenzen

#### A) Gestapelde label/value-layouts
Een gerichte stacked label/value extractor is toegevoegd.

Hiermee is o.a. bewezen verbeterd:
- `invoice_daan_pdf_03_p01.jpg`
  - serial en MID worden nu correct gelezen uit stacked layout
  - eerdere fout “Product” / “Serial Number” als candidate is opgelost

#### B) Nog open: Dutch stacked label block variant
Er blijft een open parserbug voor de specifieke Dutch variant:
- `invoice_paul_pdf_04 brand_model_variant_02_p01.jpg`

Huidige foutgedrag daar:
- address is inmiddels correct
- maar brand/model/serial/MID pairing is nog fout
- labels worden deels nog als waarden behandeld

#### C) Nieuwe regressie na stacked patch
Bij:
- `invoice_paul_pdf_01_p01.jpg`
wordt customer_name nu foutief:
- `Thank you for your purchase.`

Conclusie:
- stacked extractor was netto positief
- maar customer-name selectie moet nog strakker worden begrensd

### Wat bewust nog NIET is gedaan

Niet gedaan:
- geen koppeling van de standalone worker naar `api-dossier-verify`
- geen multipage image aggregation over `_p01/_p02/_p03`
- geen laadpaalfoto-analysis
- geen nieuwe audit-events

Rationale:
- page-level parser-hardening is nog niet af
- multipage aggregation bovenop foutieve page-level extraction zou de analyse vervuilen
- verify-integratie is pas zinvol zodra standalone observed output stabieler is

### Harde next step
Volgende stap blijft:
1. customer_name selectie begrenzen in stacked layouts
2. expliciete Dutch stacked label parser voor variant_02
3. daarna pas multipage image aggregation
4. daarna pas verify-integratie

## 2026-04-02 — Verify ontkoppeld van inline factuurparsing; client parser payload contract geïntroduceerd

Wijzigingen
- `api-dossier-verify` is expliciet teruggebracht naar:
  - orchestration
  - compare
  - analysis writes
  - audit
- Inline factuurparsing in verify verwijderd:
  - geen server-side PDF text extractie meer in verify
  - geen server-side image extractie meer in verify
- Verify accepteert nu een nieuwe request-structuur:
  - `client_verify_payload`
- Nieuwe client helperlaag toegevoegd:
  - `assets/js/analyse/analyse_verify_payload.js`
- `assets/js/pages/dossier.js` synchroniseert nu:
  - current snapshot
  - upload metadata
  - verify body-opbouw via deze helperlaag
- `dossier.html` laadt deze helper nu vóór `assets/js/pages/dossier.js`

Belangrijke architecturale koers
- canonieke parser-richting is nu:
  - client-side parser
  - server-side verify
- verify gebruikt declared data uit dossier/chargers
- verify consumeert observed data uit client parser payload
- verify blijft de enige server truth voor:
  - `dossier_analysis_document`
  - `dossier_analysis_charger`
  - `dossier_analysis_summary`
  - audit trail

Belangrijke CURRENT nuance
- end-to-end browser wiring van echte observed invoice fields naar verify is nog niet volledig af
- daarom ondersteunt verify CURRENT twee modi:
  1. client observed payload aanwezig → inhoudelijke vergelijking
  2. payload ontbreekt → placeholder/inconclusive fallback

## 2026-04-15 — Image worker → verify bridge runtime-bewezen op testdossier

Bewezen op dossier:
- `88dc2983-fefd-410d-9992-60f3b0b84f49`

Doel van de test:
- niet browser image parsing bewijzen
- wel bewijzen dat `api-dossier-verify` worker-afgeleide image observed payload correct kan consumeren

Uitvoering:
- verse dossier snapshot opgehaald via `api-dossier-get`
- bestaand worker-resultaat gebruikt voor:
  - `invoice_paul_synthetic_good_02.jpg`
  - document_id `00117b4d-d3ba-437e-91e7-cceb13530436`
- handmatig `client_verify_payload.document_snapshot.client_invoice_observed[]` gebouwd
- payload ingestuurd naar `api-dossier-verify`
- daarna `api-dossier-evaluate(finalize=false, evaluation_mode="full")` opnieuw gedraaid

Bewezen resultaat:
- `api-dossier-verify` accepteert worker-afgeleide image observed payload zonder codewijziging
- verify schrijft voor de image factuur echte `observed_fields` weg in `dossier_analysis_document`
- charger-level compare draait inhoudelijk op die observed fields
- charger 2 ging uit placeholder/inconclusive op address naar:
  - `invoice_address_match = pass`
- charger 2 bleef inhoudelijk correct falen op:
  - brand mismatch
  - model mismatch
  - serial mismatch
  - MID mismatch
- charger 1 bleef inconclusive omdat de PDF-factuur in deze run geen observed payload meekreeg

Harde conclusie:
- verify-model / compare-laag / analysis writes zijn niet de bottleneck
- de bottleneck is de handoff:
  - image worker output → verify payload contract

Nieuwe expliciete waarheid:
- voor image facturen hoeft `api-dossier-verify` inhoudelijk niet herbouwd te worden
- eerstvolgende technische stap is:
  - een gecontroleerde bridge/toolinglaag bouwen
  - die worker-output normaliseert naar het bestaande verify-contract

Belangrijke contractnuance:
- `parseClientVerifyPayload(...)` gebruikt CURRENT:
  - `document_id`
  - `parser_payload.observed_fields`
  - `parser_payload.confidence`
  - `parser_payload.limitations`
  - `parser_payload.summary`
  - optioneel:
    - `parser_kind`
    - `parser_version`
    - `source_kind`
- item-level veld `source` is CURRENT niet runtime-load-bearing

## 2026-04-15 — Image worker → verify bridge-script bewezen op charger-2 image factuur

Bewezen met:
- script: `scripts/tools/bridge-image-worker-verify.py`
- dossier: `88dc2983-fefd-410d-9992-60f3b0b84f49`
- document_id: `00117b4d-d3ba-437e-91e7-cceb13530436`
- target filename: `invoice_paul_synthetic_good_02.jpg`

Wat is bewezen:
- `api-dossier-verify` accepteert worker-afgeleide image observed payload via het bestaande `client_verify_payload` contract
- verify schrijft voor de image factuur echte `observed_fields` weg in `dossier_analysis_document`
- charger-level compare draait inhoudelijk op die observed fields
- charger 2 ging uit placeholder/inconclusive voor adres naar:
  - `invoice_address_match = pass`
- charger 2 bleef inhoudelijk correct falen op:
  - `invoice_brand_match = fail`
  - `invoice_model_match = fail`
  - `invoice_serial_match = fail`
  - `invoice_mid_match = fail`
- die fails zijn correct omdat worker-observed waarden niet overeenkomen met de CURRENT declared charger-2 waarden

Harde conclusie:
- verify / compare / analysis writes zijn niet de bottleneck
- de bottleneck is de handoff:
  - image worker output → verify payload contract

Nieuwe CURRENT dev-waarheid:
- `scripts/tools/bridge-image-worker-verify.py` is de reproduceerbare dev-bridge voor:
  - dossier snapshot lezen
  - worker-output normaliseren
  - `api-dossier-verify` draaien
  - `api-dossier-evaluate` draaien
- Dit script hoort onder `scripts/tools/` en niet onder `scripts/analysis_worker/`,
  omdat het geen parser/compare-script is maar een operationele orchestration tool.

## 2026-04-16 — Browser PDF parser → verify runtime bewezen in normale dossierflow

Bewezen in de normale dossier-UI flow:
- PDF factuur upload bevestigd
- browser-side PDF parser draaide automatisch
- `registerInvoiceObservedResult(...)` werd aangeroepen
- `buildClientObservedSnapshot()` bevatte parserpayload
- `DOSSIER verifyExtra` stuurde `client_verify_payload` mee
- `api-dossier-verify` gaf HTTP 200 terug

Harde conclusie:
- de browser-PDF lane is nu end-to-end operationeel in de echte dossierflow
- voor PDF facturen is geen handmatige bridge/payload-file meer nodig om verify van echte observed payload te voorzien

Nieuwe CURRENT waarheid:
- PDF facturen:
  - parser client-side
  - payload via `analyse_verify_payload.js`
  - verify server-side
- image facturen:
  - browser image parser blijft geen actieve route
  - interne/lokale worker + bridge blijft de huidige dev/integratieroute

## 2026-04-16 — `issued` documentstatus bevestigd als echte recovery-state in uploadflow

Bewezen via runtime + DB:
- `api-dossier-upload-url` blokkeert terecht met 409 wanneer voor dezelfde laadpaal al een factuurrow met status `issued` bestaat
- `api-dossier-get` en directe DB-query wezen naar dezelfde open `issued` row
- `api-dossier-doc-delete` verwijderde de `issued` row correct
- herhaalde delete gaf idempotent `{ deleted:false, reason:"not_found" }`

Harde conclusie:
- er was geen backend drift tussen read-model en write-gate
- het echte open punt zat in de frontend UX:
  - `issued` moet zichtbaar en herstelbaar zijn
  - upload conflict moet direct terug syncen naar server truth

Nieuwe CURRENT dev-waarheid:
- `issued` is geen “verborgen intern detail”, maar een echte tussenstatus:
  - upload gestart / nog niet bevestigd
  - recovery via delete + opnieuw uploaden
- frontend moet `issued` expliciet tonen en bij conflict direct hersyncen

## 2026-04-16 — Browser PDF parser → verify runtime bewezen in normale dossierflow

Bewezen in de normale dossier-UI flow:
- PDF factuur upload bevestigd
- browser-side PDF parser draaide automatisch
- `registerInvoiceObservedResult(...)` werd aangeroepen
- `buildClientObservedSnapshot()` bevatte parserpayload
- `DOSSIER verifyExtra` stuurde `client_verify_payload` mee
- `api-dossier-verify` gaf HTTP 200 terug

Harde conclusie:
- de browser-PDF lane is nu end-to-end operationeel in de echte dossierflow
- voor PDF facturen is geen handmatige bridge/payload-file meer nodig om verify van echte observed payload te voorzien

Nieuwe CURRENT waarheid:
- PDF facturen:
  - parser client-side
  - payload via `assets/js/analyse/analyse_verify_payload.js`
  - verify server-side
- image facturen:
  - browser image parser blijft geen actieve route
  - interne/lokale worker + bridge blijft de huidige dev/integratieroute

## 2026-04-16 — `issued` document recovery UX frontend afgerond

Bewezen via runtime + dossier-UI:
- `issued` documentstatus wordt nu expliciet zichtbaar in de documentsectie
- frontend toont hersteltekst:
  - upload gestart / nog niet bevestigd
  - verwijderen en opnieuw uploaden bij mislukte vorige poging
- documentstatusbadge wordt op documentniveau getoond
- upload conflict op `api-dossier-upload-url` forceert directe `reloadAll()` en hersync naar server truth

Belangrijke conclusie:
- backend read/write waarheid was al consistent
- de open stap zat in frontend recovery-UX
- die recovery-UX is nu functioneel aangebracht in `assets/js/pages/dossier.js`

Scopegrens:
- dit sluit de UX-hardening voor `issued` in de huidige MVP-documentflow
- het is nog geen brede multi-document of resumable upload architectuur

## 2026-04-16 — Browser image parser verwijderd uit runtime-code

Wijziging
- `parseInvoiceImageFile(...)` verwijderd uit:
  - `assets/js/analyse/analyse_invoice_parser.js`
- export verwijderd uit:
  - `window.ENVAL.invoice_parser`

Reden
- browser-side image parsing was al geen actieve lane meer
- actieve image-lane ligt CURRENT in de lokale/interne OCR worker
- runtime grep bevestigde dat de browser image parser geen callers meer had buiten de eigen definitie/export en doc-verwijzingen

Harde conclusie
- browser-side image parsing bestaat CURRENT niet meer als runtime-pad
- PDF blijft de enige browser-side invoice parser-lane
- image facturen lopen CURRENT uitsluitend via worker → verify handoff

## 2026-04-16 — Mixed image/PDF handoff naar verify in één run bewezen

Bewezen op testdossier:
- `88dc2983-fefd-410d-9992-60f3b0b84f49`

Run-opzet:
- image factuur:
  - document_id `5bce3bc7-7f00-42d4-956c-b27c8642d4ee`
  - bestand `invoice_paul_synthetic_good_02.jpg`
  - lane: lokale/interne OCR worker → bridge → `client_verify_payload`
- PDF factuur:
  - document_id `e4fa54b0-eb21-41ce-a3aa-27bf52171787`
  - bestand `invoice_paul_pdf_11_all_correct_01.pdf`
  - lane: payload-file / PDF observed payload → `client_verify_payload`

Bewezen resultaat:
- `api-dossier-verify` accepteert in één run tegelijk:
  - worker-afgeleide image observed payload
  - PDF observed payload
- verify response:
  - `ok = true`
  - `client_invoice_observed_count = 2`
  - `document_analyses_completed = 4`
  - `document_analyses_failed = 0`
  - `charger_results_written = 20`

Inhoudelijk bewezen compare-gedrag:
- charger 1 / image factuur:
  - `invoice_address_match = pass`
  - `invoice_serial_match = pass`
  - `invoice_mid_match = pass`
  - `invoice_brand_match = fail`
  - `invoice_model_match = fail`
- charger 2 / PDF factuur:
  - `invoice_address_match = pass`
  - `invoice_brand_match = fail`
  - `invoice_model_match = fail`
  - `invoice_serial_match = fail`
  - `invoice_mid_match = fail`

Harde conclusie:
- image worker lane en PDF lane landen nu aantoonbaar op hetzelfde verify-contract
- verify / compare / analysis writes zijn niet de bottleneck
- de handoff is nu niet alleen single-lane, maar ook mixed-lane runtime-bewezen

Nieuwe CURRENT dev-waarheid:
- `scripts/tools/bridge-image-worker-verify.py` is nu bewezen bruikbaar voor:
  - image worker observed payload
  - PDF payload-file observed payload
  - gecombineerde mixed verify-runs op actuele confirmed document rows

## 2026-04-18 — Browser PDF parser hersteld in normale dossierflow + persisted observed source weer gevuld

Wijzigingen
- `assets/js/analyse/analyse_invoice_parser.js` hersteld zodat browser-side PDF extractie weer echte tekst oplevert in de normale dossierflow.
- PDF stream decoding gehardend:
  - byte → string mapping aligned op Python-semantiek
  - stream extraction robuuster
  - inflate via pako als primaire route
- Browser-PDF parser schrijft weer bruikbare observed payload met:
  - `pdf_text_length`
  - `observed_non_null_fields`
  - `extracted_text_preview`
- `api-dossier-observed-source-upsert` wordt weer gevuld vanuit de normale dossier-UI flow voor PDF facturen.

Bewezen runtime-gedrag
- PDF factuur upload bevestigd in dossier-UI
- browser parser draaide automatisch
- persisted observed source row aanwezig met:
  - `producer_kind = invoice_pdf_parser`
  - `source_kind = pdf`
  - `status = completed`
  - `pdf_text_length = 214`
  - `observed_non_null_fields = 11`
- verify gebruikt deze PDF-observed data correct in de analysis-run
- charger 1 invoice-checks pass
- charger 2 krijgt inhoudelijk correcte fails op niet-matchende invoice-velden
- `foto_laadpunt` blijft bewust `not_checked`

Architecturale betekenis
- PDF lane:
  - parser client-side
  - verify server-side
- image lane blijft:
  - worker/local extractie
  - verify server-side
- geen herintroductie van browser-side image parsing

## 2026-04-19 — Invoice image precheck lane gehardend + batch-run bewezen + dossier.js messaging deduped

Context
- De browser-side invoice image precheck was functioneel te agressief:
  - goede of bruikbare factuurafbeeldingen kregen te vaak warn/reject
  - `dossier.js` bevatte daarnaast een tweede eigen humanizer-/message-laag
- Daardoor ontstond zowel UX-ruis als documentatie-/runtime-drift.

Wijzigingen

### A) `analyse_image_step_1_precheck.js` explainable gemaakt
- Precheck geeft nu per regel `rule_results` terug met:
  - `code`
  - `level`
  - `measured_value`
  - `threshold`
  - `operator`
  - `triggered`
  - `metric`
  - `note`
- Harde reject-lane blijft beperkt tot technische onbruikbaarheid:
  - ontbrekende afmetingen
  - ongeldige byte-length
  - te lage byte-length
  - veel te lage width/height

### B) Content-heuristiek uit user-facing besluitvorming gehaald
- Content-/ink-/zone-/sharpness-regels blijven nog wel gemeten in `rule_results`
- Maar deze regels bepalen CURRENT niet meer de user-facing warn/reject beslissing
- Daardoor is de precheck nu:
  - streng op evidente rommel
  - veel stiller op goede of bruikbare documenten

### C) Headless terminal batch-run toegevoegd
Nieuwe lokale tool:
- `scripts/tools/invoice-image-precheck.mjs`

Nieuwe minimale toolinglaag:
- `package.json`
- lokale `playwright` dev dependency

Doel:
- exact dezelfde browser-precheck-code headless vanuit terminal over de volledige testmap draaien
- geen drift tussen browser en testtool

### D) Batch-run resultaat bewezen
Batch-run over:
- `docs/facturen/facturen_image`

Bewezen totals:
- total = 33
- allow = 23
- warn = 5
- reject = 5
- rare_total = 3
- rare_reject = 3

Interpretatie:
- de 3 expliciete rare fail-cases blijven correct reject
- daarnaast blijven 2 extra camera-bad voorbeelden reject op:
  - `image_byte_length_too_low`
- warn-ruis is sterk teruggebracht:
  - van 24 warns naar 5 warns
- `all_correct` en normale factuurbeelden vallen niet meer onterecht onder content-warnings

### E) `dossier.js` messaging opgeschoond
Verwijderd uit `assets/js/pages/dossier.js`:
- `humanizeInvoiceImagePrecheckError`
- `humanizeInvoiceImagePrecheckWarning`
- `buildInvoiceImagePrecheckMessage`

Toegevoegd:
- `getInvoiceImagePrecheckUiSummary`
- `getInvoiceImagePrecheckUiMessage`

Betekenis:
- `dossier.js` heeft niet langer een tweede waarheid voor precheck-messaging
- browser uploadflow gebruikt nu de canonieke summary uit de analyse-laag
- rare invoices worden correct afgewezen
- warn-images worden correct doorgelaten met warning
- correcte factuurimages gaan correct door

Harde conclusie
- Invoice image precheck is CURRENT productmatig bruikbaar:
  - reject op evidente onbruikbaarheid
  - beperkte en uitlegbare warn-lane
  - geen hysterische content-ruis meer
- `dossier.js` is voor deze lane nu beter aligned met de canonieke analyse-helperlaag

## 2026-04-19 — Invoice image precheck warning-state persistent zichtbaar gemaakt in documentkaart-UI

Context
- Browser-side invoice image precheck was al functioneel gehardend:
  - reject op technische onbruikbaarheid
  - beperkte warn-lane
  - canonieke summary-messaging
- Open restpunt was nog:
  - accepted-with-warning uploads werden wel doorgelaten,
    maar verloren hun warning-semantiek na succesvolle upload / reload

Wijziging
- `assets/js/pages/dossier.js` bewaart nu client-side invoice image precheck warnings per `document_id` in `sessionStorage`
- Warning-state wordt na succesvolle upload opnieuw gerenderd in de documentkaart-UI
- Bestaande UI-styling wordt hergebruikt:
  - documentsectie met warning gebruikt bestaande gele/oranje toon
  - documentregel toont extra `warning` badge
  - warning-tekst blijft zichtbaar onder bestandsnaam
- Delete van document ruimt de warning-state weer op
- `renderDocs()` prune’t stale warning-state wanneer document_id niet meer in de actuele serverdocumentlijst voorkomt

Bewezen gedrag
- allow-image:
  - upload slaagt
  - documentkaart blijft groen
  - geen warning badge/tekst
- warn-image:
  - upload slaagt
  - documentkaart blijft geel/oranje
  - `warning` badge blijft zichtbaar
  - warning-tekst blijft zichtbaar na `reloadAll()`
- delete:
  - warning-state verdwijnt correct
  - geen stale warning-state na reload

Architecturale betekenis
- warning persistence blijft bewust client-side UX-state
- geen audit-truth
- geen server-state
- geen extra CSS-bestand of nieuwe style-variant nodig

## 2026-04-22 — Fresh-only testsuite volledig groen + intake/bootstrap/setup aligned op CURRENT contracttruth

Context
- De testsuite bevatte nog twee soorten drift:
  - happy-path bootstrap bewees wel `dossier_id`, maar nog niet expliciet `lead_id` + outbound `dossier_link` row
  - setup probeerde meerdere chargers aan te maken met hetzelfde test-MID, terwijl `api-dossier-charger-save` duplicate MID’s binnen dossier en globaal correct afwijst
- Daarnaast gebruikte `api-lead-submit` al `meta.origin` en `meta.environment`, terwijl `_shared/reqmeta.ts` die velden nog niet leverde.

Wijzigingen

### A) `_shared/reqmeta.ts` contract aligned
- `ReqMeta` uitgebreid met:
  - `origin`
  - `environment`
- `getReqMeta(req)` levert deze velden nu expliciet.
- Hiermee is de shared request-meta laag weer aligned met de load-bearing callers.

### B) `00_fresh_dossier.sh` hard bewijs uitgebreid
- Fresh bootstrap bewijst nu expliciet:
  - HTTP 200 op intake
  - `lead_id` aanwezig in response body
  - `dossier_id` aanwezig in response body
  - outbound `dossier_link` row bestaat voor het nieuwe dossier
  - `to_email`, `dossier_id` en `message_type=dossier_link` worden gecontroleerd
  - link-token wordt uit de daadwerkelijke outbound mail gehaald

### C) `01_setup.sh` aligned op MID-uniqueness
- Setup gebruikt nu niet meer één vast test-MID voor alle chargers.
- Per aangemaakte charger wordt een uniek test-MID afgeleid uit de base `TEST_MID_NUMBER`.
- Daardoor is de testsuite aligned met CURRENT backend-contract:
  - duplicate MID binnen dossier → reject
  - duplicate MID over dossiers → reject

### D) Test-observability verbeterd
- `create_charger_and_get_id()` logt failure-diagnostiek nu naar `stderr`, zodat echte foutdetails niet meer verdwijnen in command substitution.
- Charger-create response parsing is robuuster gemaakt (`charger_id` / fallback `id`).

### E) Full fresh-only suite bewezen groen
Bewezen in één volledige run:
- fresh dossier bootstrap
- setup met 4 created chargers
- intake contract rejects + idempotency
- login throttle + mismatch
- charger unauthorized + max-chargers reject
- upload reject tests
- happy uploads:
  - 8 documenten confirmed
  - DB proof per confirmed row
- cleanup:
  - created chargers verwijderd
  - docs per charger naar 0
  - dossier/outbound/audit shell bewust retained
- eindstatus:
  - `ALL TESTS PASSED`

Harde conclusie
- `api-lead-submit` eligibility ordering hoefde niet meer inhoudelijk gehard te worden;
  die stond al correct.
- Het open werk zat in bewijs, shared-meta alignment en testsuite-drift.
- Die proof-close is nu geleverd.

## 2026-04-22 — Export reject-test toegevoegd aan fresh-only suite + cleanup-volgorde opnieuw aligned

Context
- De fresh-only testsuite was na intake/bootstrap/setup hardening weer volledig groen,
  maar export gate proof ontbrak nog in de suite.
- CURRENT export-contract is smaller dan eerder grof in TODO stond:
  - bewezen reject op not-locked dossier
  - locked success-proof nog niet geleverd in fresh flow
- Cleanup moet ná export-tests draaien, omdat cleanup de mutable child rows verwijdert die de fresh flow net heeft opgebouwd.

Wijzigingen

### A) Export contract test toegevoegd
- Nieuwe testfile toegevoegd:
  - `scripts/tests/08_export_contract.sh`
- Deze test bewijst in de fresh flow expliciet:
  - export op niet-locked dossier → HTTP 409
  - response meldt correct dat export alleen is toegestaan voor ingediende / locked dossiers

### B) Cleanup-volgorde aangepast
- Cleanup is verplaatst naar:
  - `scripts/tests/09_cleanup.sh`
- `run_all.sh` draait nu:
  - eerst `08_export_contract.sh`
  - daarna `09_cleanup.sh`

### C) Full suite opnieuw bewezen groen
Bewezen in één volledige run:
- fresh dossier bootstrap
- setup met 4 created chargers
- intake contract rejects + idempotency
- login throttle + mismatch
- charger unauthorized + max-chargers reject
- upload reject tests
- happy uploads:
  - 8 documenten confirmed
  - DB proof per confirmed row
- export contract:
  - reject op not-locked dossier bewezen
- cleanup:
  - created chargers verwijderd
  - docs per charger naar 0
  - dossier/outbound/audit shell bewust retained
- eindstatus:
  - `ALL TESTS PASSED`

Belangrijke CURRENT waarheid
- Export gate proof is nu gedeeltelijk gesloten:
  - reject op not-locked dossier = bewezen
- Nog niet bewezen:
  - locked export success
  - volledig output-contract van export artifact in de fresh suite
  - reject op “incomplete maar locked” als aparte contracttest

## 2026-05-10 — Fresh-only export contract volledig bewezen + cleanup aligned op locked dossier semantics

Context
- De fresh-only testsuite bewees al intake, setup, upload rejects en happy uploads.
- Export proof was eerder nog gedeeltelijk:
  - not-locked reject was bewezen
  - locked export success en artifact shape waren nog niet volledig bewezen in de vaste suite.
- Cleanup liep daarna tegen een 409 op `api-dossier-charger-delete` omdat het dossier inmiddels locked/in_review was.
- Die 409 bleek correct backendgedrag, geen cleanup-bug.

### A) Export contract uitgebreid

Actieve testfile:
- `scripts/tests/08_export_contract.sh`

Bewezen in de fresh flow:
- export op niet-locked dossier:
  - HTTP 409
  - audit: `dossier_export_rejected`
  - reason: `not_locked`
- address save/verify:
  - HTTP 200
  - audit: `address_saved_verified`
- consents save:
  - HTTP 200
  - audit: `consents_saved`
- synthetic invoice observed payload:
  - aligned op declared dossier/charger data
  - gebruikt voor deterministic lock/export proof
- `api-dossier-verify`:
  - HTTP 200
  - `analysis_status = partial_pass`
  - audit: `analysis_run_completed`
- `api-dossier-evaluate(finalize=true)`:
  - HTTP 200
  - `status = in_review`
  - `locked_at` gevuld
  - audit: `dossier_locked_for_review`
- locked export:
  - HTTP 200
  - audit: `dossier_export_generated`

### B) Export artifact shape bewezen

De fresh-only suite assert nu minimaal:

- `ok = true`
- `schema_version = enval-dossier-export.v5`
- `dossier.id` matcht het fresh dossier
- `documents_confirmed` bevat 8 documenten
- `analysis.version = enval-analysis.v1`
- `analysis_readable.version = enval-analysis-readable.v1`
- `analysis_run.run_id` is aanwezig

Betekenis:
- export success is nu niet alleen een HTTP 200.
- De load-bearing v5 exportstructuur wordt inhoudelijk gecontroleerd.

### C) Cleanup aligned op locked/in_review semantics

Actieve cleanupfile:
- `scripts/tests/09_cleanup.sh`

Wijziging:
- Cleanup probeert na locked export niet langer `api-dossier-charger-delete` uit te voeren.
- Reden:
  - locked dossiers mogen via runtime endpoints niet meer gemuteerd worden
  - eerdere 409 op charger-delete was dus correct backendgedrag, geen cleanup-fout

Nieuw cleanupgedrag na export:
- dossierstatus en `locked_at` worden getoond
- created charger/doc rows worden vooraf zichtbaar gemaakt
- runtime API delete wordt bewust geskipt
- retained locked dossierdata wordt gecontroleerd

Bewezen eindstatus:
- cleanup verify OK
- locked dossier data retained
- retained charger rows aanwezig
- retained document rows aanwezig
- retained dossier row aanwezig
- retained outbound email row aanwezig
- retained audit rows aanwezig
- `ALL TESTS PASSED`

### D) Testsuite file layout gecorrigeerd

Actieve volgorde:
- `scripts/tests/08_export_contract.sh`
- `scripts/tests/09_cleanup.sh`

Niet meer actief:
- `scripts/tests/07_cleanup.sh` is verwijderd/vervangen.

Architecturale conclusie:
- cleanup na export is geen mutable-child cleanup meer
- cleanup na export is een lock-aware retained-state proof
- dit is audit-correct omdat exportbewijs en audittrail intact blijven

Harde CURRENT waarheid:
- Een locked/in_review dossier mag niet via runtime endpoints worden opgeschoond.
- Retained locked testdossiers zijn acceptabel totdat tombstone/archive lifecycle is ontworpen.

## 2026-05-10 — Developer authority gate + export audit events + retention/preservation besluit

Wijzigingen bewezen en gedeployed:
- `api-dossier-dev-unlock` is niet langer afhankelijk van frontend/dev environment flags.
- Developer unlock wordt server-side gegated via `dossiers.dossier_authority = 'developer'`.
- Frontend toont dev unlock/analyse alleen via server-permission `permissions.can_view_analysis_details`.
- `api-dossier-export` is uitgebreid met `audit_events` in het export artifact.
- Tests bleven groen en functions zijn gedeployed:
  - `api-dossier-dev-unlock`
  - `api-dossier-export`

Nieuw architectuurbesluit:
- Link-token blijft one-time; session-token blijft runtime-auth.
- Access recovery via `api-dossier-login-request` is nodig voor klanten die later terugkomen.
- Runtime dossierdata wordt niet permanent bewaard tenzij betaald/geëxporteerd.
- Niet-locked dossiers krijgen 7 dagen retention.
- Locked/in_review maar unpaid/unexported dossiers krijgen 14 dagen retention met reminders op dag 3/7/10.
- Paid/exported dossiers worden langdurig bewaard via een nieuwe final-retention laag: `dossier_exports`.
- `dossier_exports` wordt de immutable source-of-truth voor auditretentie.
- Runtime-tabellen mogen na preservation worden opgeschoond/geanonimiseerd.
- Storage objects waarnaar een preserved export verwijst, mogen niet verwijderd worden.
- Niet-preserved storage volgt de 7/14 dagen cleanup-regels.

Open P1:
- `dossier_exports` schema ontwerpen.
- Preservation-flow bouwen.
- Runtime cleanup/FK/immutability model herzien.
- Reminder-flow bouwen.
- MID/serial uniqueness aanpassen zodat abandoned drafts geen echte dossiers blokkeren.


## 2026-05-11 — Export preservation bewezen + yearly MID claim enforcement verplaatst naar `dossier_exports`

Bewezen en gecommit:
- `api-dossier-export` preserveert export artifacts in `public.dossier_exports`.
- Export response bevat:
  - `preserved = true`
  - `export_id`
  - `export_sha256`
  - `payment_status = waived`
  - `claim_year`
  - `claimed_mid_numbers`
- `dossier_exports.export_json` bevat de volledige export JSON.
- `dossier_exports.export_sha256` bevat SHA256-proof over de export JSON.
- `dossier_exports.claim_year` + `dossier_exports.claimed_mid_numbers` vormen de final MID-claim basis.
- `dossier_export_preserved` wordt geschreven als audit event.
- `dossier_export_preserve_failed` bestaat als fail-path wanneer preservation faalt vóór cleanup.

Nieuw MID-contract:
- Runtime `dossier_chargers.mid_number` is geen finale claim meer.
- Cross-dossier duplicate MID wordt niet meer geblokkeerd bij `api-dossier-charger-save`.
- Same-dossier duplicate MID blijft een runtime datakwaliteitsreject.
- Definitieve MID-claim gebeurt uitsluitend bij export preservation.
- Duplicate `MID + claim_year` wordt bij export geblokkeerd tegen bestaande non-voided preserved exports.
- Conflict-export:
  - geeft HTTP 409
  - schrijft `dossier_export_rejected`
  - gebruikt stage `final_mid_claim`
  - gebruikt reason `mid_already_claimed_for_claim_year`
  - maakt géén nieuwe `dossier_exports` row.

DB/contract wijzigingen:
- Runtime unique index op `public.dossier_chargers.mid_number` is verwijderd.
- `public.dossier_exports` is gehardend met:
  - `claim_year`
  - `claimed_mid_numbers`
  - SHA256 format constraint
  - indexes voor dossier/request/claim lookup
  - update/delete block triggers

Bewezen in fresh-only suite:
- locked export success
- export preservation row + SHA proof
- preserved audit proof
- duplicate yearly MID export reject
- geen `dossier_exports` row bij duplicate MID conflict
- cleanup blijft CURRENT lock-aware retained-state proof.

Open blijft:
- access recovery voor gebruikte/verlopen dossierlinks.
- retention cleanup na preservation.
- reminder-flow voor locked/unpaid dossiers.
- storage cleanup met preserved-export guard.


## 2026-05-11 — Access recovery UI live bewezen

Bewezen en gecommit:
- Gebruikte/verlopen dossierlinks lopen niet meer dood in de frontend.
- Dossierpagina toont recovery UI wanneer link-token ontbreekt, verlopen is of al gebruikt is.
- Klant kan via dossier-id + e-mailadres een nieuwe toeganglink aanvragen.
- `api-dossier-login-request` blijft anti-enumeration: neutrale response richting gebruiker.
- Nieuwe toeganglink opent het dossier opnieuw via normale token → session exchange.

Belangrijk:
- Link-token blijft one-time.
- Session-token blijft canonical runtime auth.
- Recovery is customer-facing MVP functionaliteit en vervangt handmatige terminal-interventie.


## 2026-05-11 — Retention cleanup DB helper live bewezen + migration vastgelegd

Wijzigingen:
- `public.enval_retention_cleanup(...)` toegevoegd als DB cleanup helper voor runtime dossierdata.
- `public._enval_enforce_document_lifecycle()` uitgebreid met expliciete DB-owner cleanup bypass via `enval.dev_reset=YES`.
- Nieuwe migration vastgelegd:
  - `supabase/migrations/20260511_retention_cleanup_runtime_after_export.sql`

Bewezen gedrag:
- Dry-run werkt zonder mutatie.
- Mass apply wordt geweigerd wanneer `p_apply=true` zonder expliciete `p_target_dossier_id` wordt aangeroepen.
- Preserved runtime cleanup werkt:
  - runtime dossier wordt verwijderd
  - runtime child rows verdwijnen via cascade
  - `dossier_exports` blijft bestaan
  - preserved document count blijft behouden
  - preserved storage paths worden niet als deletable aangemerkt
- Non-preserved dossiers met storage worden geweigerd vóór DB-delete met:
  - `STORAGE_CLEANUP_REQUIRED_BEFORE_DB_DELETE`

Belangrijke auditgrens:
- `dossier_exports` blijft de final source-of-truth.
- Runtime-tabellen zijn tijdelijk werkmateriaal na preservation.
- Storage cleanup is bewust nog separaat en nog niet gebouwd.
- Cleanup scheduler/reminder-flow is nog OPEN.

Legacy nuance:
- Oude testexports van vóór de yearly MID claim patch kunnen `claim_year = null` en `claimed_mid_numbers = null` bevatten.
- Nieuwe exports vullen CURRENT `claim_year` en `claimed_mid_numbers`.

## 2026-05-11 — Retention storage cleanup tool handmatig bewezen

Wijzigingen:
- Nieuwe DB helper toegevoegd:
  - `public.enval_retention_cleanup_apply_after_storage(...)`
- Nieuwe lokale tool toegevoegd:
  - `scripts/tools/retention-storage-cleanup.mjs`
- Tool gebruikt geen extra npm dependency; Node `fetch` + service-role REST/Storage API volstaan.
- Tool is target-only en vereist expliciet:
  - `--dossier-id`
  - `--apply --yes` voor mutaties

Bewezen gedrag:
- Dry-run op non-preserved locked/unpaid dossier classificeerde:
  - `retention_class = locked_unpaid_expired`
  - `preserved = false`
  - `runtime_documents = 8`
  - `runtime_chargers = 4`
  - `runtime_storage_paths = 8`
  - `deletable_storage_paths = 8`
  - `preserved_storage_paths = 0`
- Apply verwijderde eerst 8 storage objects uit `enval-dossiers`.
- Daarna paste DB cleanup toe via `enval_retention_cleanup_apply_after_storage(...)`.
- Post-cleanup proof:
  - `dossiers = []`
  - `dossier_documents = []`
  - `dossier_chargers = []`
  - herhaalde dry-run gaf `NO_CANDIDATE`

Belangrijke correctie:
- Export/preservation maakt `dossier_exports` aan.
- Runtime cleanup gebeurt CURRENT nog niet automatisch in `api-dossier-export`.
- Automatische cleanup blijft bewust uitgesteld totdat scheduler/worker/reminder-flow is gebouwd.

Open:
- scheduler/worker voor retention lifecycle bouwen
- reminder-mails voor locked/unpaid dag 3/7/10 bouwen
- cleanup audit events laten schrijven door toekomstige worker/scheduler-laag
- beslissen of post-export runtime cleanup direct, vertraagd of scheduled wordt uitgevoerd

## 2026-05-11 — Retention worker gebouwd, gedeployed en target-apply bewezen

Wijzigingen:
- Nieuwe utility Edge Function toegevoegd:
  - `supabase/functions/retention-worker/index.ts`
- `scripts/tools/edge-uniformity.sh` uitgebreid:
  - `retention-worker` is nu expliciet `utility`
- Retention cleanup DB helpers zijn parametriseerbaar gemaakt:
  - preserved grace days
  - draft retention days
  - locked/unpaid retention days
- Worker bevat bovenaan één centrale `RETENTION_CONFIG`:
  - `preservedRuntimeCleanupGraceDays = 3`
  - `draftRetentionDays = 7`
  - `lockedUnpaidRetentionDays = 14`
  - `lockedUnpaidReminderDays = [3, 7, 10]`
  - `batchLimit = 10`
  - `storageDeleteBatchSize = 1000`
- Worker geeft deze waarden door aan de DB helpers, zodat worker en SQL geen gesplitste retentionwaarheid krijgen.

Security:
- Worker is protected via:
  - Supabase gateway headers
  - `x-retention-worker-secret`
  - Supabase secret `RETENTION_WORKER_SECRET`
- Secretwaarde is niet in repo/docs opgenomen.

Bewijs:
- `edge-uniformity.sh`:
  - `retention-worker | utility`
  - baseline groen
  - `EDGE_EXIT=0`
- Dry-run live worker call:
  - HTTP 200
  - config zichtbaar in response
  - candidates gevonden
  - eerste candidates waren `preserved_runtime_cleanup`
  - preserved storage count = 8
  - deletable storage count = 0
- Target apply live worker call op één preserved dossier:
  - HTTP 200
  - `candidate_count = 1`
  - `processed_count = 1`
  - `failed_count = 0`
  - `retention_class = preserved_runtime_cleanup`
  - `storage_deleted = 0`
  - `db_cleanup_applied = true`
  - `deleted_runtime_dossier = true`
- Herhaalde dry-run op hetzelfde dossier:
  - `candidate_count = 0`
- Export preservation proof:
  - `dossier_exports` row bleef bestaan
  - `preserved_document_count = 8`

Open:
- scheduler/cron voor automatische worker-run nog niet ingesteld
- reminder-flow voor locked/unpaid dag 3/7/10 nog niet gebouwd
- permanente cleanup audit-log oplossing nog open, omdat `dossier_audit_events` cascaded met runtime dossier delete

## 2026-05-13 — Retention-worker dry-run cron live bewezen via pg_cron + pg_net + Vault

Context
- `retention-worker` was al gebouwd, gedeployed en handmatig bewezen.
- Ontbrekende stap was autonome scheduling zonder secrets in repo of chat.
- Bestaande mail-worker scheduler gebruikt `pg_cron` + `pg_net` + `vault.decrypted_secrets`.
- Retention-worker is op hetzelfde scheduler-patroon aangesloten.

Wijziging / ops-config
- Vault uitgebreid met:
  - `retention_worker_secret`
- Nieuwe cron job aangemaakt:
  - `enval-retention-worker-dry-run-hourly`
  - schedule: `0 * * * *`
- Cron roept `retention-worker` aan via `net.http_post`.
- Secrets worden gelezen uit `vault.decrypted_secrets`:
  - `project_url`
  - `anon_key`
  - `retention_worker_secret`
- Geen secrets in repo, docs of chat.

Bewezen
- `cron.job_run_details` toont meerdere succesvolle hourly runs:
  - `status = succeeded`
  - `return_message = 1 row`
- `net._http_response` toont HTTP 200 voor cron calls.
- Worker response:
  - `ok = true`
  - `apply = false`
  - `candidate_count = 0`
  - config `3/7/14`
  - reminder days `3/7/10`
- `dossier_exports` bleef intact.
- Preserved exports tonen nog steeds gevulde `export_sha256`.

Belangrijke grens
- Dit is uitsluitend dry-run scheduling.
- Er is nog géén apply cron.
- Reminder-flow voor locked/unpaid dossiers dag 3/7/10 is nog niet gebouwd.
- Permanente cleanup audit-log oplossing blijft open.

## 2026-05-14 — Retention cleanup tombstone table + target apply proof

Context
- Retention-worker dry-run cron was al live bewezen.
- Apply cron blijft bewust niet gebouwd.
- Open auditpunt: `dossier_runtime_cleanup_*` events in `dossier_audit_events` verdwijnen mee wanneer runtime dossierdata wordt verwijderd.
- Besluit: privacy-hard tombstone table voor cleanup proof, zonder PII en zonder FK naar `dossiers`.

Wijziging
- Nieuwe tabel:
  - `public.retention_cleanup_events`
- Privacy-hard model:
  - geen email
  - geen naam
  - geen adres/postcode
  - geen IP/UA
  - geen raw storage paths
  - geen FK naar `public.dossiers`
  - `dossier_id` blijft alleen als historische referentie
- RLS:
  - enabled
  - `deny_all` voor `anon` en `authenticated`
- Grants:
  - `service_role` heeft alleen `SELECT`, `INSERT`, `UPDATE`
  - geen `DELETE` of `TRUNCATE` voor `service_role`
- `retention-worker` schrijft nu:
  - `started` tombstone vóór storage/DB cleanup
  - `success` tombstone na geslaagde cleanup
  - `failed` tombstone bij runtime apply failure, indien started row bestaat

Proof
- Disposable fresh dossier aangemaakt:
  - dossier_id `7ddb7523-ba68-4853-8705-cd835eb626af`
- Target dry-run met future `now` override:
  - `candidate_count = 1`
  - `retention_class = draft_expired`
  - `preserved = false`
  - storage path counts = 0
- Target apply:
  - `ok = true`
  - `processed_count = 1`
  - `failed_count = 0`
  - `db_cleanup_applied = true`
  - `deleted_runtime_dossier = true`
  - `cleanup_event_id = 82c8b0a7-35d8-48ad-b753-7e92bae8d6cf`
- Tombstone row:
  - `status = success`
  - `cleanup_reason = draft_retention_expired`
  - `preserved = false`
  - `export_id = null`
  - `pii_included = false`
  - `raw_storage_paths_included = false`
  - `has_dossier_foreign_key = false`
- Runtime rows after cleanup:
  - `dossiers = 0`
  - `dossier_chargers = 0`
  - `dossier_documents = 0`
  - `dossier_audit_events = 0`
  - `dossier_sessions = 0`
  - `outbound_emails = 0`
- Existing `dossier_exports` remained intact with populated `export_sha256`.

Boundaries
- This proves non-preserved draft cleanup success tombstone path.
- Failed tombstone path is not yet runtime-proven.
- Storage-delete tombstone path is not yet runtime-proven.
- Preserved runtime cleanup tombstone path is not yet re-proven after this patch.
- No apply cron exists.

## 2026-05-14 — Retention cleanup tombstone failed-path + recovery proof

Context
- `public.retention_cleanup_events` was al gebouwd en non-preserved draft success-path was live bewezen.
- Nog open bewijs: failed tombstone path.
- Doel: bewijzen dat de worker na een gecontroleerde apply-fout de tombstone van `started` naar `failed` bijwerkt zonder runtime data te verwijderen.

Wijziging
- `retention-worker` bevat nu een dev-only failure injection hook:
  - alleen toegestaan wanneer `environment != production`
  - alleen bij expliciet `target_dossier_id`
  - alleen wanneer request body `force_failure_stage = "after_tombstone_started"` bevat
  - failure gebeurt ná `started` tombstone insert
  - failure gebeurt vóór storage delete / DB cleanup

Proof
- Disposable fresh dossier aangemaakt:
  - dossier_id `60350d82-ecdf-489f-aeef-2965e80f19b8`
- Target dry-run:
  - `candidate_count = 1`
  - `retention_class = draft_expired`
  - `preserved = false`
  - storage path counts = 0
- Forced failure apply:
  - HTTP 500
  - `candidate_count = 1`
  - `processed_count = 1`
  - `failed_count = 1`
  - error `RETENTION_TEST_FAILURE_AFTER_TOMBSTONE_STARTED`
  - `cleanup_event_id = 65d438ce-3b3d-4ce9-8df3-11cf4fd38382`
- Failed tombstone row:
  - `status = failed`
  - `cleanup_reason = draft_retention_expired`
  - `db_cleanup_applied = false`
  - `deleted_runtime_dossier = false`
  - `deleted_storage_object_count = 0`
  - `error_stage = retention_worker_apply`
  - `error_message = RETENTION_TEST_FAILURE_AFTER_TOMBSTONE_STARTED`
  - `pii_included = false`
  - `raw_storage_paths_included = false`
  - `has_dossier_foreign_key = false`
- Runtime dossier remained intact after forced failure:
  - `dossier_rows = 1`
  - no storage or DB cleanup happened
- Recovery apply on the same dossier:
  - `ok = true`
  - `processed_count = 1`
  - `failed_count = 0`
  - `cleanup_event_id = 7152125a-e600-4f32-ab0b-d4a088b33a4a`
  - `db_cleanup_applied = true`
  - `deleted_runtime_dossier = true`
- Tombstone table now contains two rows for the same test dossier:
  - latest `success`
  - earlier `failed`

Boundaries
- This proves the failed tombstone path and recovery-success path for a non-preserved draft candidate.
- Storage-delete tombstone path is not yet runtime-proven.
- Preserved runtime cleanup tombstone path is not yet re-proven after the tombstone patch.
- No apply cron exists.

## 2026-05-14 — Retention cleanup storage-delete tombstone proof

Context
- `public.retention_cleanup_events` was al gebouwd.
- Non-preserved draft success-path was live bewezen.
- Forced failed tombstone path + recovery-success path waren live bewezen.
- Nog open bewijs: storage-delete tombstone path.

Proof setup
- Disposable fresh dossier aangemaakt:
  - dossier_id `b59c767d-ac01-43f6-8d71-84eff4e44b48`
- Setup maakte 4 chargers.
- Eén document bevestigd:
  - document_id `cc20128e-6d33-4ad7-bd21-b49cdb4555cc`
  - bucket `enval-dossiers`
  - file SHA256 `916b6af1eccfeeafdd626454c28cf23efd6ac505f6fa5f95999460c0caaafae6`
- Storage object existence vóór cleanup:
  - HTTP 200

Target dry-run
- `candidate_count = 1`
- `retention_class = draft_expired`
- `preserved = false`
- `runtime_documents = 1`
- `runtime_chargers = 4`
- `runtime_audit_events = 10`
- `runtime_sessions = 1`
- `runtime_storage_path_count = 1`
- `preserved_storage_path_count = 0`
- `deletable_storage_path_count = 1`

Target apply
- `ok = true`
- `processed_count = 1`
- `failed_count = 0`
- `storage_deleted = 1`
- `db_cleanup_applied = true`
- `deleted_runtime_dossier = true`
- `cleanup_event_id = 5090990c-a047-494e-a9ff-c692b2553a62`

Storage proof after cleanup
- Storage HEAD after cleanup returned HTTP 400.
- In this proof context this confirms the object was no longer directly retrievable at the previous object endpoint.

Tombstone proof
- Tombstone row:
  - `status = success`
  - `cleanup_reason = draft_retention_expired`
  - `preserved = false`
  - `runtime_documents_count = 1`
  - `runtime_chargers_count = 4`
  - `runtime_audit_events_count = 10`
  - `runtime_sessions_count = 1`
  - `runtime_storage_path_count = 1`
  - `preserved_storage_path_count = 0`
  - `deletable_storage_path_count = 1`
  - `deleted_storage_object_count = 1`
  - `db_cleanup_applied = true`
  - `deleted_runtime_dossier = true`
  - `error_stage = null`
  - `error_message = null`
  - `pii_included = false`
  - `raw_storage_paths_included = false`
  - `has_dossier_foreign_key = false`

Runtime rows after cleanup
- `dossiers = 0`
- `dossier_chargers = 0`
- `dossier_documents = 0`
- `dossier_audit_events = 0`
- `dossier_sessions = 0`
- `outbound_emails = 0`

Boundary
- This proves non-preserved storage-delete tombstone success-path.
- Preserved runtime cleanup tombstone path is still not re-proven after the tombstone patch.
- No apply cron exists.

[
  {
    "charger_rows": 0,
    "document_rows": 0,
    "dossier_audit_rows": 0,
    "session_rows": 0,
    "outbound_rows": 0
  }
]

## 2026-05-14 — Locked/unpaid reminder worker day-3 proof

Context
- Retention cleanup proof-gates waren groen.
- Apply cron is bewust nog niet gebouwd.
- Eerst is locked/unpaid reminder-flow gebouwd, zodat automatische cleanup later niet vóór klantwaarschuwingen komt.

Implemented
- New Edge Function:
  - `supabase/functions/locked-unpaid-reminder-worker/index.ts`
- New DB table:
  - `public.locked_unpaid_reminder_events`
- New RPC:
  - `public.enval_queue_locked_unpaid_reminders(...)`
- New migrations:
  - `20260514_locked_unpaid_reminders.sql`
  - `20260515_locked_unpaid_reminders_conflict_fix.sql`
  - `20260516_locked_unpaid_reminders_identity_fix.sql`

Design boundaries
- Reminder-worker is producer only.
- Existing `mail-worker` remains delivery worker.
- No dossier lifecycle mutation.
- No export/payment mutation.
- No retention cleanup.
- No scheduler yet.
- Idempotency is enforced through unique `(dossier_id, reminder_day)` reminder event constraint.
- Permanent proof is stored in `locked_unpaid_reminder_events`, not in `outbound_emails`, because `outbound_emails.dossier_id` can be nulled on dossier deletion.

Live proof
- Secret configured:
  - `LOCKED_UNPAID_REMINDER_WORKER_SECRET`
- Dry-run smoke:
  - HTTP 200
  - `ok = true`
  - `apply = false`
  - `candidate_count = 6`
  - candidates were `in_review`
  - first available reminder was day 3
- Target proof dossier:
  - dossier_id `85a5e34c-62de-4a37-8bb8-3659d7016d32`
  - status `in_review`
  - `locked_at = 2026-05-10 06:19:44.331+00`
  - customer email was test-safe `@example.com`
- Apply proof:
  - reminder_day `3`
  - message_type `locked_unpaid_reminder_day_3`
  - reminder_event_id `6b77de43-710d-4067-b131-d3a9feb85c92`
  - outbound_email_id `26`
  - reminder event status `queued`
  - outbound row status initially `queued`
  - audit event `locked_unpaid_reminder_queued`
- Idempotency proof:
  - second apply returned `candidate_count = 0`
  - `queued_count = 0`
  - reminder_event_count remained `1`
  - outbound_count remained `1`
- Mail delivery proof:
  - outbound_email_id `26`
  - status `sent`
  - attempts `1`
  - `sent_at` populated
  - provider_id populated
  - error_message `null`

Fixes during proof
- Initial apply failed safely because `ON CONFLICT (dossier_id, reminder_day)` was ambiguous inside a `RETURNS TABLE` PL/pgSQL function.
- Fixed with named constraint:
  - `locked_unpaid_reminder_events_dossier_day_key`
  - `ON CONFLICT ON CONSTRAINT locked_unpaid_reminder_events_dossier_day_key`
- Second apply failed safely because `outbound_emails.id` is `GENERATED ALWAYS`.
- Fixed by removing explicit id insert and using:
  - `returning id into v_outbound_email_id`

Still open
- Day-7 proof.
- Day-10 proof.
- skipped_no_email branch proof.
- Scheduler/cron for reminder-worker.
- Apply cron remains intentionally not built.

## 2026-05-15 — Locked/unpaid reminder worker day-7/day-10/skipped_no_email proof

Context
- Locked/unpaid reminder-worker was gebouwd.
- Day-3 proof was al groen.
- Reminder scheduler/cron was bewust nog niet gebouwd.
- Retention apply cron blijft geblokkeerd tot expliciet scheduler- en rollback/disable-besluit.

Day-7 proof
- Target dossier:
  - `172558c8-f2d3-4e76-94fd-1eff48208f71`
  - status `in_review`
  - `locked_at = 2026-05-10 06:33:28.825+00`
  - customer email `daankoote@gmail.com`
- Controlled now:
  - `2026-05-17 06:34:28.825+00`
- Dry-run:
  - `candidate_count = 1`
  - `reminder_day = 7`
  - `message_type = locked_unpaid_reminder_day_7`
- Apply:
  - `candidate_count = 1`
  - `queued_count = 1`
  - `reminder_event_id = 501b470a-c58e-4036-bace-a9743a43c956`
  - `outbound_email_id = 27`
  - reminder event status `queued`
  - audit event `locked_unpaid_reminder_queued`
- Idempotency replay:
  - `candidate_count = 0`
  - `queued_count = 0`
- Delivery proof:
  - `next_attempt_at` was dev-forced to `now()`
  - mail-worker sent outbound email `27`
  - status `sent`
  - attempts `1`
  - provider_id `857e6ede-5aac-4428-a767-8e45c4e9f87a`
  - error_message `null`
  - inbox receipt confirmed

Day-10 proof
- Target dossier:
  - `172558c8-f2d3-4e76-94fd-1eff48208f71`
- Controlled now:
  - `2026-05-20 06:34:28.825+00`
- Dry-run:
  - `candidate_count = 1`
  - `reminder_day = 10`
  - `message_type = locked_unpaid_reminder_day_10`
- Apply:
  - `candidate_count = 1`
  - `queued_count = 1`
  - `reminder_event_id = 3b598405-4a2c-46be-8149-2505703a8030`
  - `outbound_email_id = 28`
  - reminder event status `queued`
  - audit event `locked_unpaid_reminder_queued`
- Idempotency replay:
  - `candidate_count = 0`
  - `queued_count = 0`
- Delivery proof:
  - `next_attempt_at` was dev-forced to `now()`
  - mail-worker sent outbound email `28`
  - status `sent`
  - attempts `1`
  - provider_id `3a5b590c-192c-49f1-a349-5121cf8350f4`
  - error_message `null`
  - inbox receipt confirmed

skipped_no_email proof
- Dev-only target dossier:
  - `06bd3726-b5b6-408a-84d9-9817945e608a`
  - source `dev_skipped_no_email_proof`
  - status `in_review`
  - `locked_at = 2026-05-10 06:33:28.825+00`
  - `customer_email = null`
- Controlled now:
  - `2026-05-13 06:34:28.825+00`
- Dry-run:
  - `candidate_count = 1`
  - `reminder_day = 3`
  - `message_type = locked_unpaid_reminder_day_3`
- Apply:
  - `candidate_count = 1`
  - `queued_count = 0`
  - `skipped_count = 1`
  - skipped_reason `missing_customer_email`
  - `reminder_event_id = d6ffbfde-acdc-4950-8405-3d914c3b75d9`
  - reminder event status `skipped_no_email`
  - outbound_email_id `null`
- Idempotency replay:
  - `candidate_count = 0`
  - `queued_count = 0`
  - `skipped_count = 0`
- DB proof:
  - `locked_unpaid_reminder_events.status = skipped_no_email`
  - `outbound_emails` returned no rows for the dev-only target dossier

Boundary
- Day-7/day-10 delivery proofs were dev-forced by manually moving `next_attempt_at` to `now()`.
- This proves mail-worker/provider/inbox delivery, not scheduler timing.
- Reminder-worker scheduler/cron remains open.
- Retention apply cron remains intentionally not built.

## 2026-05-17 — Locked/unpaid reminder scheduler cron built, proven, and disabled after proof

Context
- Locked/unpaid reminder-worker was already built.
- Day-3, day-7, day-10, and skipped_no_email branch proofs were already green.
- Open item was scheduler/cron proof.
- Existing retention dry-run cron pattern used pg_cron + pg_net + Vault.
- Same pattern was reused for locked/unpaid reminder-worker.

Vault
- Added Vault secret:
  - `locked_unpaid_reminder_worker_secret`
- Purpose:
  - allow Postgres cron to call the Edge Function without secrets in repo/docs/chat

Dry-run cron
- Created dry-run cron:
  - jobname `enval-locked-unpaid-reminder-worker-dry-run-hourly`
  - schedule `5 * * * *`
  - body `apply=false`, `limit=10`
- Hourly frequency was proven but judged unnecessarily frequent for reminder scheduling.
- Replaced with daily dry-run cron:
  - jobname `enval-locked-unpaid-reminder-worker-dry-run-daily`
  - schedule `15 6 * * *`
  - body `apply=false`, `limit=10`
- Proof:
  - pg_cron job_run_details showed `succeeded`
  - pg_net response HTTP `200`
  - worker response `ok=true`
  - `apply=false`
  - `candidate_count=8`

Apply cron
- Created apply cron:
  - jobname `enval-locked-unpaid-reminder-worker-apply-daily`
  - schedule `20 6 * * *`
  - body `apply=true`, `limit=10`
- Both dry-run and apply cron commands used only Vault references:
  - `project_url`
  - `anon_key`
  - `locked_unpaid_reminder_worker_secret`

Manual apply proof
- Manual SQL `net.http_post` apply proof:
  - request_id `437720`
  - HTTP `200`
  - `ok=true`
  - `apply=true`
  - `candidate_count=8`
  - `queued_count=8`
  - `skipped_count=0`
- Created day-3 reminder events for test dossiers:
  - outbound_email_id `29`
  - outbound_email_id `30`
  - outbound_email_id `31`
  - outbound_email_id `32`
  - outbound_email_id `33`
  - outbound_email_id `34`
  - outbound_email_id `35`
  - outbound_email_id `36`
- Reminder event rows were written with:
  - `status=queued`
  - `message_type=locked_unpaid_reminder_day_3`
  - `outbound_email_id` filled
  - `event_data.privacy.pii_included=false`
  - `event_data.privacy.has_dossier_foreign_key=false`

Replay proof
- Manual SQL apply replay:
  - request_id `437722`
  - HTTP `200`
  - `ok=true`
  - `apply=true`
  - `candidate_count=0`
  - `queued_count=0`
  - `skipped_count=0`
  - `results=[]`

Delivery proof
- Outbound emails `29` through `36` reached `sent`.
- Attempts:
  - `attempts=1`
- Provider proof:
  - provider_id filled for all delivered rows
- Failure proof:
  - `error_message=null`

Operational boundary
- Scheduler jobs were disabled after proof as safety state.
- Current cron check returned no rows for locked/unpaid reminder scheduler jobs.
- This proves scheduler construction, Vault transport, apply behavior, idempotency replay, and mail-worker delivery.
- Ongoing automatic reminder scheduling is not active while jobs remain disabled.

Still open
- Retention apply cron remains intentionally not built.


## 2026-05-17 — Retention preserved batch cleanup and apply scheduler proof completed

Context
- Retention worker was already built and dry-run cron was already live.
- Open item was retention apply proof and scheduler proof.
- Existing active cron before proof:
  - `enval-retention-worker-dry-run-hourly`
  - schedule `0 * * * *`
  - `apply=false`
- Locked/unpaid reminder scheduler had already been proven and disabled after proof.

Preserved batch candidate review
- Manual dry-run request:
  - request_id `437728`
  - HTTP `200`
  - `ok=true`
  - `apply=false`
  - `candidate_count=4`
- All candidates were:
  - `retention_class=preserved_runtime_cleanup`
  - `preserved=true`
  - `runtime_documents=8`
  - `runtime_chargers=4`
  - `runtime_audit_events=101`
  - `runtime_sessions=1`
  - `runtime_analysis_runs=1`
  - `runtime_storage_path_count=8`
  - `preserved_storage_path_count=8`
  - `deletable_storage_path_count=0`

Preserved batch apply proof
- Manual apply request:
  - request_id `437729`
  - HTTP `200`
  - `ok=true`
  - `apply=true`
  - `candidate_count=4`
  - `processed_count=4`
  - `failed_count=0`
- Applied candidates:
  - `533572a8-4208-46f7-86ce-475d5b54f678`
  - `c2e41ba6-b808-4637-9a5c-6ddca5f0a9a5`
  - `e0c0d458-d8d7-45be-a88a-bf1690e73812`
  - `73eb7cdb-89ef-410e-960d-1927fea56cb0`
- Per candidate:
  - `storage_deleted=0`
  - `db_cleanup_applied=true`
  - `deleted_runtime_dossier=true`
  - `export_id` filled
  - `cleanup_event_id` filled

Replay proof
- Manual replay request:
  - request_id `437730`
  - HTTP `200`
  - `ok=true`
  - `apply=true`
  - `candidate_count=0`
  - `processed_count=0`
  - `failed_count=0`
  - `results=[]`

DB proof
- Runtime rows:
  - `dossiers=0`
- Preserved export rows:
  - `dossier_exports=4`
- Tombstone rows:
  - `retention_cleanup_events_success=4`
- Export integrity:
  - all 4 exports retained
  - `export_sha256` filled
  - `claim_year=2026`
  - `claimed_mid_numbers` filled
  - `export_status=generated`
  - `payment_status=waived`

Tombstone proof
- 4 `retention_cleanup_events` success rows were confirmed.
- Tombstone rows contained:
  - `retention_class=preserved_runtime_cleanup`
  - `cleanup_reason=preserved_runtime_cleanup`
  - `status=success`
  - `preserved=true`
  - `export_id` filled
  - `deleted_runtime_dossier=true`
  - `db_cleanup_applied=true`
  - `deleted_storage_object_count=0`
  - `error_message=null`
  - `event_data.method=retention-worker`
  - `event_data.result=success`
  - `event_data.privacy.pii_included=false`
  - `event_data.privacy.has_dossier_foreign_key=false`
  - `event_data.privacy.raw_storage_paths_included=false`
  - `event_data.tombstone_version=1`

Retention apply scheduler proof
- Temporary proof cron created:
  - jobname `enval-retention-worker-apply-proof-once`
  - jobid `13`
  - schedule `56 00 * * *`
  - body `mode=apply`, `apply=true`, `limit=10`
- Cron run proof:
  - status `succeeded`
  - return_message `1 row`
  - start_time `2026-05-17 00:56:00.031382+00`
  - end_time `2026-05-17 00:56:00.035423+00`
- pg_net response:
  - request_id `437736`
  - HTTP `200`
  - `ok=true`
  - `apply=true`
  - `candidate_count=0`
  - `processed_count=0`
  - `failed_count=0`
  - `results=[]`

Operational boundary
- Temporary retention apply proof cron was disabled after proof.
- Final cron state after proof:
  - active: `enval-retention-worker-dry-run-hourly`
  - no active locked/unpaid reminder scheduler jobs
  - no active retention apply scheduler jobs
- This proves retention apply scheduler construction and transport.
- It does not enable ongoing live retention apply scheduling.
- Active retention apply remains OFF until an explicit live-retention decision.

## 2026-05-17 — Retention and reminder scheduler jobs enabled as MVP runtime lifecycle state

Context
- Locked/unpaid reminder scheduler proof was completed.
- Retention apply scheduler proof was completed.
- Proof-only jobs had previously been disabled after proof as a safety state.
- Decision was made to enable daily runtime lifecycle automation for MVP.

Active scheduler state
- Retention dry-run:
  - jobid `18`
  - jobname `enval-retention-worker-dry-run-daily`
  - schedule `0 6 * * *`
  - body `mode=dry_run`, `apply=false`, `limit=10`
- Retention apply:
  - jobid `19`
  - jobname `enval-retention-worker-apply-daily`
  - schedule `10 6 * * *`
  - body `mode=apply`, `apply=true`, `limit=10`
- Locked/unpaid reminder dry-run:
  - jobid `20`
  - jobname `enval-locked-unpaid-reminder-worker-dry-run-daily`
  - schedule `15 6 * * *`
  - body `apply=false`, `limit=10`
- Locked/unpaid reminder apply:
  - jobid `21`
  - jobname `enval-locked-unpaid-reminder-worker-apply-daily`
  - schedule `20 6 * * *`
  - body `apply=true`, `limit=10`

Operational meaning
- Runtime lifecycle automation is now intentionally ON for MVP.
- Draft / non-locked runtime cleanup follows the 7-day retention policy.
- Locked / in_review unpaid reminder and cleanup flow follows the 14-day retention policy with reminder days 3, 7, and 10.
- Preserved exports remain in `public.dossier_exports`.
- Cleanup tombstone proof remains in `public.retention_cleanup_events`.
- Preserved storage paths remain protected.

Rollback
- Temporary proof-only jobs remain disabled/removed.
- Apply rollback remains available by unscheduling:
  - `enval-retention-worker-apply-daily`
  - `enval-locked-unpaid-reminder-worker-apply-daily`
- Dry-run jobs may remain active for observability during rollback.

Follow-up notes
- Storage lifecycle remains an explicit follow-up:
  - runtime-only storage and preserved/source-evidence storage currently share the same physical bucket
  - cleanup protection is based on preserved export references and deletable/preserved path classification
  - TODO remains to decide whether semantic separation is sufficient or whether physical prefix/bucket separation is needed
- Before MVP launch, run a final cron/job inventory:
  - confirm only intended lifecycle jobs are active
  - confirm proof-only jobs are removed/disabled
  - review job frequency and batch limits for MVP operations

## 2026-05-17 — MVP dossier UI findings fixed after production E2E

Context
- Production E2E exposed small MVP UI issues after the `apiAuthed` wrapper fix.
- Core journey was already functional:
  - access save
  - address verify/save
  - charger save
  - PDF invoice upload
  - consents save
  - precheck/verify
  - submit/lock
  - export

Changes
- Address resolved fields:
  - street/city remain readonly
  - readonly inputs are visually greyed/disabled
- Document upload:
  - invoice upload is PDF-only for MVP
  - JPG/PNG invoice uploads are rejected before upload or not selectable
  - invoice upload copy explicitly states PDF requirement
  - low-value document hint text was hidden/removed
- Developer/analysis UI:
  - developer-only controls remain hidden by default
  - analysis panel visibility is controlled only by analysis render logic
  - fixed flicker caused by `setMainDossierUiHidden(false)` temporarily showing `#analysisSection` during reload
  - normal save/reload actions no longer flash document analysis/review UI

Proof
- Netlify production deploy published:
  - `main@786b4af`
- Live browser retest confirmed:
  - address fields behave correctly
  - PDF-only invoice UI works
  - document hint no longer appears
  - document analysis panel no longer flickers during normal save actions

Audit impact
- No backend lifecycle change.
- No audit contract change.
- UI is now better aligned with MVP requiredness:
  - PDF invoice required
  - charger photo optional/non-blocking
  - analysis remains derived/supportive, not a compliance or verification engine


## 2026-05-18 — MVP public copy/UI sanity proof + post-export correction policy clarified

Context
- After public copy simplification and dossier UI fixes, a production sanity run was completed.
- The run was not a perfectly clean first-time customer run because it included dev/support actions:
  - dev unlocks
  - multiple analysis runs
  - multiple exports
  - old JPG-test audit history
- This is acceptable as MVP sanity proof, not as clean first-time customer proof.

Runtime proof
- Dossier:
  - `6bd895c6-f5bd-48be-b0e7-86b1e4c2d1da`
  - status `in_review`
  - locked `true`
  - email verified `true`
  - address verified `true`
  - declared charger count `1`
  - charger rows `1`
- Documents:
  - confirmed documents `1`
  - confirmed PDF invoices `1`
  - active/final document is PDF invoice
- Checks:
  - `email_verified = pass`
  - `address_verified = pass`
  - `charger_exact_count = pass`
  - `mid_per_charger = pass`
  - `docs_per_charger = pass`
  - `consents_required = pass`
  - `analysis_invoice_gate = pass`
- Analysis:
  - latest analysis status `partial_pass`
  - invoice checks pass
  - photo checks remain `not_checked` and non-blocking for MVP
  - limitations include no authenticity/compliance claim
- Export:
  - latest export status `generated`
  - payment status `waived`
  - schema version `enval-dossier-export.v5`
  - `export_sha256` populated
  - claim year `2026`
  - claimed MID `M0987654321`
- Audit events present:
  - `dossier_export_preserved`
  - `dossier_export_generated`

Interpretation
- This proves MVP public copy + UI sanity for the main production journey.
- It does not prove a clean first-time customer run, because the dossier intentionally includes dev/support actions.
- Audit history correctly preserves these actions.

Post-export correction decision
- Exported dossiers must not be silently mutated.
- After export, correction should become a new export/revision/correction flow, not an ordinary unlock-and-edit flow.
- Before runtime cleanup, a support unlock may technically be possible, but it is not the desired post-export correction model.
- After runtime cleanup, the original runtime dossier cannot be normally reopened because runtime tables have been removed.

MID risk discovered
- Current final claim gate blocks duplicate `MID + claim_year`.
- This is correct for normal duplicate claims.
- For support corrections, the same MID may be correct and must remain claimable in a controlled revision/correction flow.
- Future support hardening must design one of:
  - supersede/void previous export;
  - explicit export revision linked to previous export;
  - controlled correction dossier with support reason;
  - or another audit-safe exception model.
- Until then, post-export correction remains POST-MVP and should not be improvised manually.

## 2026-05-18 — Defense-in-depth audit/final table grants hardened

Context
- Audit/final/derived analysis tables already had RLS enabled.
- Anon REST tests showed no public row exposure:
  - audit/worker-event tables returned `permission denied`
  - export/analysis tables returned no rows before grant hardening
- However, grants inventory showed broad `anon` and `authenticated` privileges on export and derived analysis tables.

Problem
- The following tables had unnecessary client-role grants:
  - `dossier_exports`
  - `dossier_analysis_runs`
  - `dossier_analysis_document`
  - `dossier_analysis_charger`
  - `dossier_analysis_summary`
  - `dossier_document_observed_sources`
- Grants included combinations of:
  - `SELECT`
  - `INSERT`
  - `UPDATE`
  - `DELETE`
  - `TRUNCATE`
  - `REFERENCES`
  - `TRIGGER`
- RLS prevented practical anon access, but audit-first defense-in-depth should not depend on RLS alone where client grants are unnecessary.

Change
- Added migration:
  - `supabase/migrations/20260518_revoke_audit_final_table_client_grants.sql`
- Migration revokes all privileges from `anon` and `authenticated` on:
  - `public.dossier_exports`
  - `public.dossier_analysis_runs`
  - `public.dossier_analysis_document`
  - `public.dossier_analysis_charger`
  - `public.dossier_analysis_summary`
  - `public.dossier_document_observed_sources`

Proof
- Post-migration grants query returned:
  - `0 rows` for `anon` / `authenticated` grants on the hardened tables.
- Post-migration anon REST read tests returned `permission denied` for:
  - `dossier_exports`
  - `dossier_analysis_runs`
  - `dossier_analysis_summary`
  - `dossier_analysis_charger`
  - `dossier_analysis_document`
  - `dossier_document_observed_sources`
- Post-migration anon REST write test against `dossier_exports` returned:
  - HTTP `401`
  - PostgREST `42501`
  - `permission denied for table dossier_exports`
- Service-role smoke remained green:
  - service-role read from `dossier_exports` returned export row for dossier `6bd895c6-f5bd-48be-b0e7-86b1e4c2d1da`
  - service-role read from `dossier_analysis_runs` returned completed analysis run `ea049353-e45b-4e60-b162-b03e03cc45eb`

Audit impact
- Client access surface reduced.
- RLS remains active.
- Service-role Edge Function path remains operational.
- No lifecycle, export, retention, or analysis behavior changed.

Status
- DONE — defense-in-depth grants hardening proven.

## 2026-05-18 — Edge uniformity classification aligned for locked/unpaid reminder worker

- `locked-unpaid-reminder-worker` toegevoegd aan de UTILITY-classificatie in `scripts/tools/edge-uniformity.sh`.
- `10_EDGE_FUNCTIONS_CONTRACT.md` bijgewerkt zodat de canonical utility lijst overeenkomt met de actuele function inventory.
- Reden:
  - de worker was runtime aanwezig en gescheduled,
  - maar de repo-quality gate classificeerde hem nog niet,
  - waardoor `./scripts/tools/edge-uniformity.sh` terecht faalde op `UNCLASSIFIED`.
- Bewijs:
  - `./scripts/tools/edge-uniformity.sh` opnieuw gedraaid
  - core: 19 total, 0 failing baseline
  - utility: 3 total, 0 failing baseline
  - unclassified: 0
  - result: `OK: classification complete + baselines satisfied.`

  ## 2026-05-18 — MVP privacy and dossier finalization UI polish

- Privacyverklaring vereenvoudigd voor gratis pilotfase:
  - minimale verwerking
  - niet-afgeronde dossiers worden periodiek opgeschoond
  - geëxporteerde dossiers blijven bewaard voor auditdoeleinden
  - geen automatische deling met derden
  - geen garantieclaims
- Dossier UI aangepast:
  - “Check dossier” wordt verborgen zodra “Dossier indienen” beschikbaar is
  - exportknoptekst consistent gehouden als “Download dossier”
- Consent locking bevestigd:
  - toestemmingen blijven na opslaan aangevinkt en worden read-only in de UI.

  ## 2026-05-18 — MVP live baseline tagged and readable export README added

- MVP live baseline is tagged:
  - tag: `mvp-live-2026-05-18`
  - commit: `104d0b2`
- `main`, `feature/dev`, `origin/main` en `origin/feature/dev` wijzen naar dezelfde live baseline.
- Live smoke na deploy bevestigd:
  - `/`
  - `/aanmelden.html`
  - `/dossier.html`
  - `robots.txt`
  - `sitemap.xml`
  - `privacyverklaring.html`
  - `dossier.html` export copy
- SEO/indexing MVP-state bevestigd:
  - `robots.txt` disallowt `/dossier.html`, `/aanmelden_real.html` en `/pricing.html`
  - `sitemap.xml` bevat geen `pricing.html`
  - `privacyverklaring.html` blijft `noindex`
  - `dossier.html` blijft `noindex`
- Client-side README-export toegevoegd naast de JSON-export:
  - JSON blijft de canonieke/leidende export
  - README wordt niet opgeslagen in DB of Storage
  - README wordt afgeleid uit dezelfde exportpayload
  - README bevat menselijke uitleg over dossier, checks, factuurverwerking, adrescontrole, SHA-256, server-side verify en auditpositie
- Eigen MVP proof dossier:
  - dossier_id: `f93b305d-3d97-4a60-bcb1-6c437d7dc0ae`
  - status: `in_review`
  - export schema: `enval-dossier-export.v5`
  - payment_status: `waived`
  - claimed MID: `M0987654321`
  - analysis overall: `partial_pass`
  - invoice checks: pass
  - photo analysis: `not_checked` en non-blocking voor MVP
- Post-MVP risk observed:
  - hetzelfde dossier kan meerdere generated exports hebben wanneer export/download opnieuw wordt uitgevoerd
  - dit is geen directe MVP-blocker zolang alle exports immutable blijven
  - post-MVP beslissen of same-dossier re-export bewust toegestaan blijft of idempotent/superseded moet worden gemaakt

## 2026-07-12 — New `/app` document upload backend lokaal bewezen en gecommit

CURRENT / LOCAL PROOF:
- App document file/version schema is gecommit:
  - `app_dossier_document_slots` blijft de expected-evidence/current-version projection.
  - `app_dossier_document_files` modelleert server-issued physical upload targets en file lifecycle.
  - `app_dossier_document_versions` modelleert immutable confirmed version history.
  - Parent deletion is restricted zolang file/version evidence bestaat.
  - `service_role` heeft geen DELETE permission op evidence files/versions.
- App customer auth foundation is gecommit:
  - Supabase Auth JWT validation.
  - auth user -> active app customer identity -> active app customer.
  - dossier access server-side via customer ownership.
- `api-app-document-upload-url` is gecommit en lokaal gateway-proven:
  - app customer auth + dossier/slot authorization.
  - `Idempotency-Key` verplicht.
  - server-generated private bucket/path.
  - `app_dossier_document_files` status `issued`.
  - deterministic replay, conflict/concurrency proof.
  - fail-closed audit.
  - signing failure compensation naar terminal abandoned state.
- `api-app-document-upload-confirm` is gecommit en lokaal gateway-proven:
  - exact server-issued object wordt server-side gelezen.
  - server-side SHA-256, size check, PDF MIME signature check.
  - atomic confirm via `app_confirm_document_upload_v1`.
  - immutable version creation.
  - previous current version superseded.
  - slot `current_version_id` / `current_version_number` updated.
  - atomic scoped reject via `app_reject_document_upload_v1`.
  - same-key and different-key concurrency proven without duplicate versions.
  - replacement v1 -> v2 proven.

Boundaries:
- Local proof only in disposable local Supabase.
- No remote deployment proof.
- No remote database apply.
- No production storage bucket/policy proof.
- No frontend upload wiring.
- No customer login/auth-binding journey.
- No browser QA.
- PDF invoice only for the current first upload lane.
- No browser image OCR.

# EINDE 03_CHANGELOG_APPEND_ONLY.md (append-only, updated)
