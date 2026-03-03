# 10_EDGE_FUNCTIONS_CONTRACT.md

# ENVAL — Edge Functions Contract (CORE vs UTILITY)

Statusdatum: 2026-03-03
Scope: Supabase Edge Functions
Branch context: feature/dev

---

## 0) Doel

Dit document definieert de harde contractregels voor alle Edge Functions binnen Enval.

Doelstellingen:

* Geen verborgen afhankelijkheden
* Geen audit-gaps
* Geen “legacy drift”
* Geen onverwachte baseline-verschillen
* Nieuwe functies kunnen niet stilzwijgend ontstaan zonder classificatie
* Auth-boundaries zijn expliciet en consistent

Uniformiteit is geen cosmetische eis, maar een audit- en risicobeheersingsmechanisme.

---

# 1) Classificatiemodel (VERPLICHT)

Elke Edge Function is expliciet geclassificeerd als:

* CORE
* UTILITY

Geen derde categorie.
Geen impliciete aannames.
Geen stilzwijgende uitzonderingen.

Nieuwe functie toegevoegd?
→ Moet worden opgenomen in `scripts/edge-uniformity.sh` onder `CORE_FUNCS` of `UTILITY_FUNCS`.
→ Anders: FAIL.

---

# 2) CORE Functions

## 2.1 Definitie

Een functie is CORE als zij:

* Deel uitmaakt van intake- of dossier-flow
* Dossierdata schrijft of beïnvloedt
* Auth-, session- of lock-status kan beïnvloeden
* Audit-events veroorzaakt
* Wordt aangeroepen door frontend als business endpoint

CORE betekent: audit-relevant en security-relevant.

---

## 2.2 CORE Baseline (HARD ENFORCED)

Elke CORE functie moet bevatten:

* CORS
* META (request-id / req meta)
* IDEM (Idempotency-Key enforced voor write endpoints)
* AUD (audit logging aanwezig)
* AUTH (auth gates aanwezig)
* SRV (SUPABASE_SERVICE_ROLE_KEY gebruikt server-side)

LOCK is report-only (niet overal verplicht, maar zichtbaar in report).

Ontbreekt één van deze elementen?
→ Baseline FAIL.

---

## 2.3 Auth Boundary (CORE)

Binnen Enval geldt het volgende auth-model:

### 2.3.1 Link Token (Access Token)

* Wordt alleen gebruikt voor session exchange.
* Is expirable (`access_token_expires_at`).
* Is one-time (`access_token_consumed_at`).
* Mag niet worden gebruikt voor read/write business endpoints.
* Link-token mag slechts voor **exchange** gebruikt worden.
* Elk dossier endpoint dat read/write doet accepteert géén link-token.

### 2.3.2 Session Token

* Wordt uitgegeven via exchange endpoint.
* Is short-lived (TTL via `dossier_sessions`).
* Wordt gebruikt via `Authorization: Bearer <session_token>`.
* Is vereist voor alle dossier read- en write-endpoints.
* Geldigheid is server-side: `dossier_sessions` (expires/revoked).
* Client storage is een convenience, geen truth.
NB:
- Enval heeft geen aparte exchange function.
- Session minting gebeurt in `api-dossier-get` (token mode).

### 2.3.3 Read Endpoints

* Mogen geen security-state muteren.
* Mogen geen implicit email-verificatie uitvoeren.

### 2.3.4 Write Endpoints

* Vereisen geldige session.
* Vereisen Idempotency-Key.
* Loggen rejects zodra dossier-scope bekend is.

Auth-grenzen zijn expliciet. Impliciete aannames zijn niet toegestaan.



---

## 2.4 Canonical CORE lijst

* api-lead-submit
* api-dossier-access-save
* api-dossier-access-update
* api-dossier-address-save
* api-dossier-address-verify
* api-dossier-charger-save
* api-dossier-charger-delete
* api-dossier-consents-save
* api-dossier-doc-delete
* api-dossier-doc-download-url
* api-dossier-upload-url
* api-dossier-upload-confirm
* api-dossier-submit-review
* api-dossier-get
* api-dossier-export
* api-dossier-evaluate

Deze lijst is source-of-truth.

---

# 3) UTILITY Functions

## 3.1 Definitie

UTILITY functies:

* Zijn helpers
* Hebben geen directe dossier-mutatie
* Zijn niet audit-kritisch
* Mogen geen business state beïnvloeden
* Worden gebruikt als worker of lookup

UTILITY betekent: ondersteunend, niet leidend.

---

## 3.2 UTILITY Baseline (MINIMAAL HARD)

Elke UTILITY functie moet bevatten:

* META (request-id traceability)

Overige checks (CORS, IDEM, AUD, AUTH, SRV, LOCK) zijn report-only.

Waarom META verplicht is:

* Traceerbaarheid
* Incidentanalyse
* Correlatie met request_id

---

## 3.3 Canonical UTILITY lijst

* api-dossier-address-preview
* mail-worker

Nieuwe utility?
→ expliciet toevoegen aan script + dit document.

---

# 4) Call Graph Policy (HARD)

## 4.1 CORE → CORE

Toegestaan.
Audit blijft binnen baseline.

---

## 4.2 CORE → UTILITY

Alleen toegestaan indien expliciet allowlisted in audit-tests.sh.

Momenteel toegestaan:

* api-lead-submit → mail-worker

Geen andere core→utility dependency zonder:

1. Contract update
2. Allowlist update
3. Repo-lint update

Verborgen koppelingen zijn niet toegestaan.

---

## 4.3 UTILITY → CORE

Niet toegestaan.

Workers mogen geen business endpoints aanroepen.

---

# 5) Enforcement

## 5.1 Uniformity Gate

Command:

```bash
cd /Users/daankoote/dev/enval
./scripts/edge-uniformity.sh
```

Resultaat:

* Alle functies geclassificeerd
* CORE baseline strict enforced
* UTILITY baseline META enforced

FAIL betekent:

* Ontbrekende baseline
* Ongeclassificeerde functie

---

## 5.2 Dependency Guard

Repo-lint controleert:

* CORE mag geen UTILITY aanroepen tenzij expliciet toegestaan
* Nieuwe dependency zonder allowlist → FAIL

---

# 6) Change Management Regel

Bij toevoegen of wijzigen van een Edge Function:

1. Classificeren (CORE of UTILITY)
2. Baseline controleren
3. edge-uniformity.sh draaien
4. audit-tests.sh draaien
5. Contract document bijwerken

Geen uitzondering.

---

# 7) Anti-Drift Principe

Dit contract bestaat om:

* Legacy snowflakes te voorkomen
* Impliciete uitzonderingen te elimineren
* Audit-zwakte vroeg zichtbaar te maken
* Core-business endpoints homogeen te houden
* Auth-boundaries expliciet en verifieerbaar te maken

Uniformiteit is geen esthetiek.
Het is risicobeheersing.

---

# EINDE 10_EDGE_FUNCTIONS_CONTRACT.md
