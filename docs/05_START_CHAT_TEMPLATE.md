# ENVAL — Chat Start (STRICT)

---

## 0) Non-negotiables

- Auditwaardigheid > correctheid > usability > performance/cost.
- Geen secrets in chat/docs (geen keys/tokens).
- Liever volledige 1-op-1 file replacements. Alleen anchor-patches als een file echt groot is.
- Elk dossier write endpoint:
  - hard lock enforcement
  - MLS audit
  - Idempotency-Key policy volgens spec
- Rejects moeten audit-gelogd worden zodra dossier scope aanwezig is (dossier_id + token scope).
- Intake gates (NL + MID) mogen **geen audit gap** introduceren.

### Key & JWT regels (hard)

- Anon key ≠ Service role key (nooit uitwisselbaar)
- Service role key mag nooit als client `apikey` gebruikt worden
- JWT/key-rotatie is altijd een expliciete stap, nooit een aanname

## Secrets policy (hard)

- Nooit secrets in chat, docs of repo. Dus: geen keys/tokens/JWT’s in Markdown of code die wordt gecommit.
- Supabase "anon" key is functioneel public, maar behandelen we alsnog als sensitive: geen verspreiding buiten runtime config.

### Runtime config model (frontend, no modules)

- `/assets/js/config.js` bevat alleen:
  - default placeholders
  - helpers (edgeHeaders)
  - UI caps (bijv. max chargers)
- De echte waarden worden **runtime geïnjecteerd** via:
  - `/assets/js/config.runtime.js` (generated, gitignored)
- Frontend laadt altijd in deze volgorde:
  1) `/assets/js/config.runtime.js` (vult `window.ENVAL.SUPABASE_URL` en `window.ENVAL.SUPABASE_ANON_KEY`)
  2) `/assets/js/config.js` (bouwt `window.ENVAL.API_BASE` + headers + defaults)

### Local development

- Maak `config.runtime.js` via script (uit env vars) en commit het niet.
- `.gitignore` bevat:
  - `/assets/js/config.runtime.js`

### Netlify production

- Netlify build genereert `config.runtime.js` uit env vars (geen keys in repo).
- Netlify Environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`



---

## 1) Doel (1 zin)

<DOEL — concreet en testbaar>

Voorbeeld:

- “MID volledig backend enforced + auditgedekt voor self-serve intake”
- “api-dossier-charger-save uitbreiden met mid_number + MLS coverage”

---

## 2) Phase + Priority

Phase: <0/1/2/3/4>  
Priority: <P0/P1/P2>

### Definities

- P0 = security / audit / data-integriteit  
- P1 = betrouwbaarheid / herstelbaarheid  
- P2 = UX / DX  

---

## 3) Repo + runtime context (vast)

- Repo root: `/Users/daankoote/dev/enval`
- Frontend: static HTML/JS/CSS in repo (Netlify)
- Backend: Supabase DB + Storage + Edge Functions (repo-first via CLI deploy scripts)
- Mail: Resend (outbound) + Google Workspace (inbound)
- Branch context: **feature/dev (leidend, mag niet sneuvelen)**

Geen wijzigingen buiten deze branch zonder expliciete instructie.

---

## 4) Scope (wat we aanraken)

Bestanden/endpoints:

- <pad 1>
- <pad 2>
- <edge function naam>

> Als een endpoint/file niet is geplakt: behandel het als onbekend en ga niet gokken.

---

## 5) Current truth (plakken)

Plak exact wat nu geldt. Geen samenvattingen.

- Huidige code (volledige files): `<PLAK>`
- Relevante DB schema (tabellen/kolommen/constraints): `<PLAK>`
- Laatste terminal output (tests/deploy): `<PLAK>`
- Wat is al bewezen groen (curl / SQL / audit-evidence)

### Specifiek bij MID:

- huidige `leads` kolommen
- huidige `dossier_chargers` kolommen
- huidige intake payload vanuit frontend
- huidige audit events (indien al aangepast)

---

## 6) Wat ik terug wil (exact)

1) Plan (max 10 bullets, in phase-volgorde)

2) Code delivery:

- Optie A: volledige 1-op-1 file(s) met exact pad  
- Optie B: anchor-patch met:
  - file pad  
  - exact zoekanker  
  - exact insertion/replacement block  

3) Exact terminal commando’s om te testen  
+ expected resultaten (HTTP status + body shape + audit bewijs)

4) Docs updates alleen na bewezen groen, tenzij incident/blocker:

- Alleen als spec wijzigt: patch voor `02_AUDIT_MATRIX.md`
- Altijd: append block voor `03_CHANGELOG_APPEND_ONLY.md`
- Alleen als werkqueue wijzigt: patch voor `04_TODO.md`

---

## 7) Auditpositie (verplicht bij intake/MID wijzigingen)

Als de wijziging intake of pre-dossier raakt:

Expliciet kiezen:

- A) Pre-dossier reject = off-chain (bewust)
- B) Dossier eerst creëren → dan on-chain reject

Geen impliciete keuze.  
Geen audit-gap.  
Geen half-oplossingen.

---

## 8) Stopregel

- Als tests niet groen zijn → geen docs, geen aannames
- Geen “waarschijnlijk”
- Geen impliciete schema-wijzigingen
- Geen silent breaking changes

---

## 9) Docs (context, niet als waarheid)

- 00_GLOBAL.md
- 01_SYSTEM_MAP.md
- 02_AUDIT_MATRIX.md
- 03_CHANGELOG_APPEND_ONLY.md
- 04_TODO.md

Docs volgen de code. Niet andersom.

---

## 10) Bevestiging

Ik wil expliciet horen:

- Dat je alles hierboven gelezen hebt.
- Dat je geen aannames maakt buiten wat hier staat.
- Dat je audit-first en branch `feature/dev` bewaakt.

---

# EINDE 05_START_CHAT_TEMPLATE.md (rewrite-ok)
