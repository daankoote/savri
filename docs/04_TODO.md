# 04_TODO.md (current state, rewrite-ok)

# ENVAL — TODO (CURRENT)

Statusdatum: 2026-02-09  
Prioriteit: audit-first.  
Regel: alleen open items; afgerond → naar changelog.

## P0 (must)
1) **Rotate Supabase Service Role Key**
- DoD: key rotated + alle env/scripts bijgewerkt + oude key revoked.

2) **Secrets uit docs / snippets verwijderen**
- DoD: geen keys/tokens in repo docs, chat dumps, of gedeelde bestanden.

## P1 (must/should)
1) outbound_emails: next_attempt_at + index  — DONE (2026-02-09)
2) outbound_emails: dossier_id nullable      — DONE (2026-02-09)
3) Mail audit events (fail-open, dossier-scoped) — DONE (2026-02-09)
- mail_queued in dossier queue-writers
- mail_sent/mail_failed/mail_requeued in mail-worker
- Matrix + changelog bijgewerkt; evidence via curl tests



## P1.5 / Phase-2 (risico’s die je niet mag vergeten)
1) PDOK ambiguity zonder suffix
- DoD: als meerdere candidates → suffix verplicht of verified=false + audit ambiguous; geen save.

2) upload-confirm performance redesign (na migratie)
- DoD: alternatief verify ontwerp + besluit + implementatieplan (niet per se meteen bouwen).

3) Orphaned storage reconciler
- DoD: job/edge function die storage failures opnieuw probeert op basis van audit events.

4) submit-review vs evaluate overlap
- DoD: kies: submit-review wrapper naar evaluate, of deprecated 410; voorkom drift.

5) Email verification assumption
- DoD: expliciet blijven labelen; Phase-2 echte mailbox-control flow.

6) Deno std imports stabiliseren (jsr:@std i.p.v. deno.land)
- DoD: alle functions gebruiken jsr:@std/http... zodat deploy niet afhankelijk is van deno.land availability.
- Status: DONE (2026-02-09)


## Phase-2 Abuse controls
- rate limit / abuse detection op api-lead-submit/contact
- DoD: basic throttling + logging + minimale blokkade


