
# ENVAL — Phase-2 (CURRENT)  
## Uploadstrategie, Scope-reductie & Kostenbeheersing

Statusdatum: 2026-02-12  
Phase: 2 (ACTIVE)  
Context: audit-first, low cost, low stress

---

## 1) Doel van dit document

Dit document beschrijft de **huidige** Phase-2 situatie (wat nu geldt/werkt) voor:
- document uploads
- verificatiestrategie
- scope (doelgroep, rollen)
- kosten- en stressreductie
- intake eligibility gates (NL + MID)

Dit document is:
- **CURRENT beschrijving**
- **geen spec op endpoint-niveau**
- **consistent met**:
  - 00_GLOBAL.md
  - 01_SYSTEM_MAP.md
  - 02_AUDIT_MATRIX.md
  - 03_CHANGELOG_APPEND_ONLY.md
  - 04_TODO.md


---

## 2) Audituitgangspunt (expliciet)

Klant-uploads zijn **indicatief bewijs**, geen sluitend bewijs.

Enval auditeert:
- wat is geüpload
- door wie
- wanneer
- in welke vorm
- met welke transformaties

Enval claimt **niet**:
- authenticiteit van documenten
- fraude-vrijheid
- originaliteit van bestanden

Externe verificatie (inboeker / verificateur / netbeheerder) is **leidend** in latere fases.

---

## 3) Auditkracht: 100% is voldoende

Enval kiest bewust voor:
- auditwaardigheid via **transparantie**
- geen forensische perfectie
- geen “bewijs-overselling”

Hoge bestandsgrootte of originele kwaliteit verhogen **niet** de auditwaarde.

Auditwaarde zit in:
- consistente verwerking
- reproduceerbare state
- volledige audit-trail

---

## 4) Uploadstrategie Phase-2

### 4.1 Client-side optimalisatie (leidend)

- Foto’s worden **client-side gecomprimeerd vóór upload**
- Alleen de **finale versie** wordt geüpload
- Originele bestanden worden niet opgeslagen

Per document wordt vastgelegd:
- `client_transformed: true`
- toegepaste transformaties (resize, quality, format, EXIF)
- originele bestandsgrootte (indien bekend)
- finale bestandsgrootte
- sha256 van de finale bytes

---

### 4.2 Server-side verificatie (CURRENT)

- `upload-confirm` is de harde integriteitsgate:
  - server-side download uit storage
  - sha256 berekening over finale bytes
  - vergelijking met client hash
  - alleen bij match → document wordt `confirmed`
- Bij mismatch/fail:
  - document blijft niet-confirmed
  - reject/fail wordt gelogd in audit trail

Rationale:
- Client-side compressie reduceert kosten en latency,
  maar **vervangt nooit** server-side integriteitsverificatie.
- Audit-positie blijft reproduceerbaar: hash is altijd over finale bytes.


---

## 5) Scope-reductie: doelgroep & gebruik

### 5.1 Doelgroep (MVP Phase-2)

- Alleen **particuliere klanten**
- Eigen laadpalen
- Self-serve dossiers
- Geen batch / bulk

### 5.2 UI-beperkingen

- Maximaal **4 laadpalen** in de UI
- Backend blijft technisch tot **10 laadpalen** ondersteunen
- Boven UI-limiet:
  - “Neem contact op”
  - batch/enterprise = latere fase

## 5.3 Intake eligibility gates (CURRENT) — NL + MID

Self-serve dossiers zijn alleen geschikt als:
- installatie is in **Nederland** (`in_nl = true`)
- de laadpaal/MID meetinrichting is **MID** (`has_mid = true`)

Dit is:
- een **intake gate** (voor self-serve start), én
- een **dossier-detail** (per laadpaal) als klantclaim.

Status:
- Gate is **toegevoegd** maar **behoeft nog backend enforcement + audit aanpak** (zie 04_TODO.md).


---

## 6) Rollen: installateur & inboeker (besluit)

- Installateurs maken **geen dossiers** aan
- Installateurs uploaden **geen documenten**
- Inboekers hebben **geen rol** in Phase-2

Overblijvend:
- `installer_ref` blijft optionele herkomst-metadata
- Geen installateur-accounts
- Geen vergoedingsmodel

De installateur-flow wordt beschouwd als **legacy** en niet verder uitgebreid.

---

## 7) Bestandsgroottes (rationeel)

- Foto laadpunt: max **1 MB**
- Factuur (PDF): max **5 MB**
- ID / mandaat / KVK: max **2–3 MB**
- Soft cap totaal dossier: **15 MB**
- Hard cap totaal dossier: **25 MB**

Grotere bestanden voegen geen auditwaarde toe.

---

## 8) Implementatievolgorde (conceptueel)

1) Frontend:
   - client-side compressie
   - UI-caps laadpalen
2) upload-url:
   - harde server-side file- en type-restricties
3) upload-confirm:
   - deferred verificatie (feature-flagged)
4) Review / export:
   - blokkeren bij niet-geverifieerde documenten
5) Tests:
   - default gedrag ongewijzigd
   - audit-tests blijven groen

---

## 9) Bewuste niet-doelen

- Geen ZIP / dossier-bundels
- Geen edge streaming uploads
- Geen installateur-portaal
- Geen batch dossiers
- Geen externe verificaties



---

Einde document.
