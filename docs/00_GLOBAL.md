# 00_GLOBAL.md (current state, rewrite-ok)

# ENVAL — Global Product & Phase Plan (CURRENT)

Statusdatum: 2026-02-09  
Repo: /Users/daankoote/dev/enval  
Branch context: feature/pricing-page (main = pilot index)

## 1) Wat bouwen we (in 1 zin)
Enval is een dossier- en registratieplatform dat bewijsstukken, data en audit-trail zó structureert dat een ERE/RED3 traject niet afketst op administratie — zonder zelf de inboeker/verificateur te zijn.

## 2) Positionering & verantwoordelijkheden (niet onderhandelen)
- **Enval**: structuur, bewijs, overdraagbaarheid, audit-trail, export.
- **Externe verificateur**: (pre-)verificatie/audit.
- **Inboeker**: eindverantwoordelijk (juridisch/administratief/fraude), en feitelijk inboeken.
- **Geen garanties** op ERE’s/vergoedingen.
- **Verbruik/metering**: aparte module, expliciet “in ontwikkeling”.

## 3) Prioriteiten (hard order)
1) **Auditwaardigheid** (evidence-grade + aantoonbare rejects)  
2) Correctheid & determinisme (idempotency + locks + state machine)  
3) Usability (wizard, duidelijke foutmeldingen)  
4) Performance/cost reductie (pas na correctness/audit)  
5) Legal hardening (privacy/terms/claims/retention) — parallel waar nodig

## 4) Definitie “auditwaardig” (Enval v0)
Auditwaardig betekent hier:
1. Alle write-acties (success én mislukking) laten sporen na in `public.dossier_audit_events`.
2. Sporen zijn te correleren: `request_id`, `actor_ref`, `ip`, `ua`, `environment`, en bij rejects `stage/status/message/reason`.
3. Documenten tellen niet mee zolang upload niet is bevestigd (**issued ≠ confirmed**).
4. Dossier lock is afdwingbaar (hard enforcement) en zichtbaar in audit trail.

## 5) Phase model (gates)
### Phase 0 — Foundations (DONE/ACTIVE)
- Basis system map + core tables + wizard routes
- Edge endpoints aanwezig
- Reproduceerbare tests (`scripts/audit-tests.sh`)

### Phase 1 — Evidence-grade dossier (ACTIVE)
Gate = “audit-contract stabiel en consistent over alle dossier write endpoints”
- MLS (Minimum Logging Standard) consistent
- Idempotency Standard (header-only waar verplicht) consistent
- Reject-audit coverage aantoonbaar via tests
- Download/export alleen op locked dossiers + confirmed docs

### Phase 2 — Performance / cost / ops (PLANNED)
Gate = “product werkt audit-proof in real-world”
- Upload-confirm server-side download+sha256 optimaliseren (duur) → alternatief ontwerp
- Reconciler/cleanup voor orphaned storage
- Mail outbox/robust retries/backoff
- Abuse controls/rate limiting

### Phase 3 — Legal hardening (PLANNED)
- Privacy/terms verantwoordelijkheden keihard
- Consent versioning (server-driven) met hash/URL
- Retention & data removal policy (wat mag wel/niet)

### Phase 4 — Scale (PLANNED)
- Multi-installer, monitoring, dashboards, SLA-achtige ops

## 6) Current status snapshot (2026-02-09)
- Repo-first workflow voor edge functions via Supabase CLI deploy scripts.
- Document lifecycle: upload-url → PUT → upload-confirm → confirmed (evidence-grade).
- Review gating: evaluate finalize=false (ready_for_review), finalize=true (lock/in_review).
- Export/download: alleen op locked dossier en confirmed docs.
- Audit-tests bewezen op dossiers met 3–4 chargers (non-destructive).

## 7) Non-goals (nu)
- Externe verificaties (MID/merk/model/energiemaatschappij) → pas na eisenpakket van inboeker/verificateur.
