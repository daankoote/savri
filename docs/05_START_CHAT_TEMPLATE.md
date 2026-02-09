# 05_START_CHAT_TEMPLATE.md (rewrite-ok)

# ENVAL — Chat Start (STRICT)

## 0) Non-negotiables
- Auditwaardigheid > correctheid > usability > performance/cost.
- Geen secrets in chat/docs (geen keys/tokens).
- Liever volledige 1-op-1 file replacements. Alleen anchor-patches als een file echt groot is.
- Elk dossier write endpoint: hard lock enforcement + MLS audit + Idempotency-Key policy volgens spec.
- Rejects moeten audit-gelogd worden zodra dossier scope aanwezig is (dossier_id + token scope).

### Key & JWT regels (hard)
- Anon key ≠ Service role key (nooit uitwisselbaar)
- Service role key mag **nooit** als client `apikey` gebruikt worden
- JWT/key-rotatie is **altijd een expliciete stap**, nooit een aanname

---

## 1) Doel (1 zin)
<DOEL — concreet en testbaar>

---

## 2) Phase + Priority
Phase: <0/1/2/3/4>  
Priority: <P0/P1/P2>

**Definities**
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

---

## 4) Scope (wat we aanraken)
Bestanden/endpoints:
- <pad 1>
- <pad 2>

> Als een endpoint/file niet is geplakt: behandel het als **onbekend** en ga **niet gokken**.

---

## 5) Current truth (plakken)
- Huidige code (volledige files): `<PLAK>`
- Relevante DB schema (tabellen/kolommen/constraints): `<PLAK>`
- Laatste terminal output (tests/deploy): `<PLAK>`
- Wat is **al bewezen groen** (curl / SQL / audit-evidence)

---

## 6) Wat ik terug wil (exact)
1) Plan (max 10 bullets, in phase-volgorde)  
2) Code delivery:
   - Optie A: volledige 1-op-1 file(s) met exact pad  
   - Optie B: anchor-patch met:
     - file pad  
     - exact zoekanker  
     - exact insertion/replacement block  
3) Exact terminal commando’s om te testen + expected resultaten  
4) Docs updates **alleen na bewezen groen**, tenzij incident/blocker:
   - Alleen als spec wijzigt: patch voor `02_AUDIT_MATRIX.md`
   - Altijd: append block voor `03_CHANGELOG_APPEND_ONLY.md`
   - Alleen als werkqueue wijzigt: patch voor `04_TODO.md`

**Stopregel**
- Als tests niet groen zijn → **geen docs, geen aannames**

---

## 7) Docs (context, niet als waarheid)
- `00_GLOBAL.md`
- `01_SYSTEM_MAP.md`
- `02_AUDIT_MATRIX.md`
- `03_CHANGELOG_APPEND_ONLY.md`
- `04_TODO.md`

---

## 8) Bevestiging
- Ik wil expliciet horen dat je alles hierboven gelezen hebt, **en**
- dat je **geen aannames** maakt buiten wat hier staat.
