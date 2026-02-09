# 05_START_CHAT_TEMPPLATE.md (rewrite-ok, niet append-only)

# ENVAL — Chat Start (STRICT)

## 0) Non-negotiables
- Auditwaardigheid > correctheid > usability > performance/cost.
- Geen secrets in chat/docs (geen keys/tokens).
- Liever volledige 1-op-1 file replacements. Alleen anchor-patches als een file echt groot is.
- Elk dossier write endpoint: hard lock enforcement + MLS audit + Idempotency-Key policy volgens spec.
- Rejects moeten audit-gelogd worden zodra dossier scope aanwezig is (dossier_id + token scope).

## 1) Doel (1 zin)
<DOEL>

## 2) Phase + Priority
Phase: <0/1/2/3/4>  
Priority: <P0/P1/P2>

## 3) Repo + runtime context (vast)
- Repo root: /Users/daankoote/dev/enval
- Frontend: static HTML/JS/CSS in repo (Netlify)
- Backend: Supabase DB + Storage + Edge Functions (repo-first via CLI deploy scripts)
- Mail: Resend (outbound) + Google Workspace (inbound)
- Branch context: feature/pricing-page (main = pilot index)

## 4) Scope (wat we aanraken)
Bestanden/endpoints:
- <pad 1>
- <pad 2>
(Als een endpoint/file niet is geplakt: behandel het als onbekend en ga niet gokken.)

## 5) Current truth (plakken)
- Huidige code (volledige files): <PLAK>
- Relevante DB schema (tabellen/kolommen/constraints): <PLAK>
- Laatste terminal output (tests/deploy): <PLAK>

## 6) Wat ik terug wil (exact)
1) Plan (max 10 bullets, in phase-volgorde)
2) Code delivery:
   - Optie A: volledige 1-op-1 file(s) met exact pad
   - Optie B: anchor-patch met:
     - file pad
     - exact zoekanker
     - exact insertion/replacement block
3) Exact terminal commando’s om te testen + expected resultaten
4) Doc updates (pas nadat het werkt óf als er blockers zijn die niet direct oplosbaar zijn):
   - Altijd: append block voor 03_CHANGELOG_APPEND_ONLY.md
   - Alleen als spec wijzigt: patch voor 02_AUDIT_MATRIX.md
   - Alleen als werkqueue wijzigt: patch voor 04_TODO.md

## 7) Docs 
- ik heb de volgende docs hieronder toegevoegd, voor jouw informatie:
   - 00_GLOBAL
   - 01_SYSTEM_MAP
   - 02_AUDIT_MATRIX
   - 03_CHANGELOG_APPEND_ONLY
   - 04_TODO

## 8) Bevestiging
- ik wil expliciet horen dat je alles hierboven gelezen hebt, inclusief alle docs die zijn toegevoegd. 




volgene 

We starten een nieuwe chat. Context: Enval auditwaardige MVP. Repo-first: edge functions in VS Code repo, deploy via ./scripts/deploy-edge.sh.

Wat is al groen & bewezen via curl/audit-tests:
- Document lifecycle: upload-url → PUT → upload-confirm → confirmed (issued≠confirmed).
- Review gating: evaluate finalize=false (ready_for_review) en finalize=true (lock/in_review).
- Export/download alleen op locked dossier + confirmed docs.
- audit-tests.sh is non-destructive (existing==target → geen mutaties, wel rejects + audit bewijs).
- mail-worker werkt end-to-end.

DOEL van deze sessie (P0→P1, audit-first, geen cosmetica):
1) P0: Supabase Service Role Key rotatie + cleanup van secrets in repo/docs/scripts.
2) P1 ontwerp + start implementatie: outbound_emails “on-chain” maken:
   - voeg outbound_emails.dossier_id (nullable) toe
   - voeg outbound_emails.next_attempt_at + index toe
   - voeg mail audit events toe (fail-open): mail_queued / mail_sent / mail_failed / mail_requeued
   - update audit matrix + tests (minimaal 1 case)

Wat ik nu van jou ga plakken (current truth):
A) SQL schema / huidige kolommen van outbound_emails (en indexes) zoals ze nu zijn
B) Huidige supabase/functions/mail-worker/index.ts (volledig)
C) Huidige api-lead-submit/index.ts (volledig) + één dossier endpoint dat outbound_emails queued (als die bestaat)
D) De deploy manier die je gebruikt (scripts/deploy-edge.sh) + laatste deploy output (indien relevant)

Jij antwoordt met:
- Exact SQL migratie(s) (Supabase SQL editor-ready) om outbound_emails uit te breiden (dossier_id, next_attempt_at + index)
- 1-op-1 file replacements:
  - mail-worker/index.ts met next_attempt_at scheduling + audit events (fail-open)
  - api-lead-submit/index.ts (en eventuele andere queue-writers) met mail_queued audit event (waar dossier scope bestaat)
- Testplan:
  - 3 curl tests (queue mail → worker verwerkt → audit zichtbaar)
  - 1 negatieve test (worker secret fout / reject audit waar toepasselijk)
- Doc updates:
  - append in 03_CHANGELOG_APPEND_ONLY.md
  - patch in 02_AUDIT_MATRIX.md (mail events)
  - patch in 04_TODO.md (P1 items bijgewerkt)

Documenten
- ik heb de volgende docs hieronder toegevoegd, voor jouw informatie:
   - 00_GLOBAL
   [ik voeg als user deze toe]
   - 01_SYSTEM_MAP
   [ik voeg als user deze toe]
   - 02_AUDIT_MATRIX
   [ik voeg als user deze toe]
   - 03_CHANGELOG_APPEND_ONLY
   [ik voeg als user deze toe]
   - 04_TODO
   [ik voeg als user deze toe]

Bevestiging
- ik wil expliciet horen dat je alles hierboven gelezen hebt, inclusief alle docs die zijn toegevoegd. 
