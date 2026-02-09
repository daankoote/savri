# 03_CHANGELOG_APPEND_ONLY.md (append-only, hier komt al je historie)

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
