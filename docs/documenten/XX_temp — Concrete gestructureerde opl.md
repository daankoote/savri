# XX_temp — Concrete gestructureerde oplossing (MVP → future-proof)

Status: 2026-03-05  
Doel: dossier altijd opnieuw toegankelijk (zonder dashboard), audit-first, repo-first.

## Kernprobleem (P0)
De dossier-link token is one-time (consume bij eerste open) en sessies zijn kort.  
Zonder recovery flow kan een gebruiker niet betrouwbaar terug in zijn dossier → conversielek + support.

---

## Phase 0 (P0) — Recovery zonder account (NU DOEN)
### 0.1 Nieuwe endpoint: api-dossier-login-request
Doel: gebruiker kan een nieuwe dossier-link krijgen als oude link verlopen/consumed is.

Input (strict):
- dossier_id (uuid) — verplicht
- email (string) — verplicht

Behavior:
- Geen account enumeration: response altijd `{ ok: true }` (ook als mismatch), maar audit logt reason.
- Rate limit per ip + dossier_id (simple, fail-closed).
- Als dossier bestaat en email matcht: rotate `access_token_hash` + set nieuwe expires_at + reset consumed fields → enqueue outbound_email → trigger mail-worker.
- Als mismatch: géén mail, wél audit event (dossier-scoped).

Audit events (minimaal):
- login_request_received (success)
- login_link_issued (success)
- login_request_rejected (reject; reason: email_mismatch / not_found)
- login_request_throttled (reject)

Done = curl tests + SQL bewijs dat:
- nieuwe mail in outbound_emails komt (bij match),
- token geroteerd wordt,
- audit events geschreven zijn,
- throttle werkt.

---

## Phase 1 (P1) — Session hardening (direct na Phase 0)
- dossier_sessions: expliciete deny_all policy (RLS) + alleen server-role writes.
- api-dossier-get: als session_token ongeldig → audit `dossier_get_rejected` (bestaat al) + duidelijke 401.
- (Optioneel) last_seen_at / revoke semantics later, maar reject logging moet hard zijn.

Done = regressietest: replay/expired session → 401 + audit evidence.

---

## Phase 2 (P1/P2) — Frontend API-layer consistent maken
- assets/js/api.js als single source of truth voor calls + headers (idempotency/request-id).
- dossier.js gebruikt api.js voor alle calls → één plek voor session_token storage/refresh.

Done = geen losse fetch wrappers meer in dossier flow.

---

## Phase 3 (Future-proof, pas als je echt “gesloten deuren” + dashboard wil)
### 3.1 Identity-laag (Supabase Auth) zonder dashboard
- voeg `dossiers.owner_user_id uuid null` toe
- claim-flow: dossier-link token wordt “claim/recovery” i.p.v. directe toegang
- alle dossier endpoints JWT-only

Dit is uitbreidbaar naar dashboard + social logins later.
NIET nu doen tenzij Phase 0/1/2 groen is.

---



## Scope discipline
- Geen password login nu.
- Geen social login nu.
- Eerst recovery + audit + regressietests groen. Daarna pas identity-layer.



##### EXTRA #####


## token consume flow
                 ┌────────────────────┐
                 │   User opens link  │
                 │ dossier.html?token │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ api-dossier-get    │
                 │ (token mode)       │
                 └─────────┬──────────┘
                           │
                           │ validate token
                           │
                           ▼
                 ┌────────────────────┐
                 │ link_token_consumed│
                 │ audit event        │
                 └─────────┬──────────┘
                           │
                           │ create session
                           ▼
                 ┌────────────────────┐
                 │ dossier_sessions   │
                 │ insert             │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ session_created    │
                 │ audit event        │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ dossier.html loads │
                 │ with session_token │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │ subsequent calls   │
                 │ (session mode)     │
                 └────────────────────┘

## session creation flow

User lost link
      │
      ▼
api-dossier-login-request
      │
      ├─ email mismatch
      │    └─ login_request_rejected
      │
      ├─ throttle
      │    └─ login_request_throttled
      │
      └─ match
           │
           ├─ rotate access_token
           ├─ enqueue email
           └─ login_link_issued

## login flow

User
 │
 │ POST login request
 ▼
api-dossier-login-request
 │
 ├─ audit: login_request_received
 │
 ├─ email mismatch
 │     └─ login_request_rejected
 │
 ├─ throttle hit
 │     └─ login_request_throttled
 │
 └─ email match
       │
       ├─ rotate token
       ├─ enqueue mail
       │
       └─ login_link_issued

en daarna

User opens mail link
        │
        ▼
api-dossier-get
        │
        ├─ link_token_consumed
        │
        ├─ session_created
        │
        ▼
dossier session

## EINDE XX_temp — Concrete gestructureerde oplossing (MVP → future-proof)