# 11_ANALYSE_PLAN.md

Statusdatum: 2026-03-20
Type: voorstel / ontwerpdocument
Status: DRAFT

> BELANGRIJK:
> Dit document is een ontwerp-/transitiedocument.
> Het is expliciet niet de CURRENT source-of-truth.
> CURRENT waarheid staat in:
> - `00_GLOBAL.md`
> - `01_SYSTEM_MAP.md`
> - `03_CHANGELOG_APPEND_ONLY.md`
> - `04_TODO.md`
>
> Bij conflict geldt:
> - runtime-code + bovenstaande CURRENT docs winnen
> - deze file mag historische tussenfasen en verlaten richtingen bevatten

## AMENDMENT — 2026-04-15 — PDF browser-lane, image worker-lane, verify server-side canonical

Deze draft is op één kritiek punt verouderd en moet scherper gelezen worden.

De CURRENT richting is gesplitst per factuurtype:

- PDF facturen:
  - parser client-side
  - verify server-side
- image facturen:
  - lokale/interne OCR worker als actieve extractielane
  - verify server-side

Dat betekent:

- `api-dossier-verify` blijft de canonieke evaluator/writer
- verify vergelijkt:
  - declared
  - observed
- verify schrijft:
  - document analysis
  - charger analysis
  - dossier summary
  - audit
- verify doet geen inline OCR/PDF parsing meer

Belangrijke expliciete correctie:
- browser-side OCR met Tesseract.js is eerder geprobeerd voor image facturen
- die route bleek niet robuust genoeg als primaire productieroute
- daarom is browser image-OCR verlaten als actieve implementatierichting

Belangrijke consequentie:
- browser-side parser-output blijft CURRENT relevant voor PDF facturen
- lokale Python scripts zijn CURRENT niet alleen proof-loop, maar ook de actieve image-extractielane
- verify blijft canoniek voor server truth,
  maar niet voor extractieruntime zelf

Transitie-nuance:
- end-to-end wiring is nu verschillend per lane:
  - PDF: browser parser → verify
  - image: interne worker → verify
- zolang observed payload ontbreekt, blijft placeholder/inconclusive fallback correct gedrag

Belangrijke bewaakregels:
- de eerdere poging om de lokale invoice-image OCR-engine direct binnen Supabase Edge te draaien is expliciet verlaten
- browser image-OCR is ook niet de actieve route
- image factuur-extractie loopt CURRENT via de lokale/interne OCR worker buiten Edge
---

## 1) Doel

Analysis v1 breidt Enval uit van dossierdump naar reviewable evidence package.

Doel:

- harde, uitlegbare consistency checks
- export uitbreiden met analysis-blokken
- menselijke review makkelijker maken
- geen compliance-, authenticiteits- of certificeringsclaims doen

Analysis v1 is dus:

- geen fraudedetectiesysteem
- geen issuer validation
- geen compliance engine
- geen certificeringsmachine
- geen waarheidsmachine

Analysis v1 is een **derived consistency layer** bovenop het bestaande dossier.

---

## 2) Productbesluit

Analysis v1 positioneren als:

**document consistency analysis engine**

Niet als:

- authenticity verifier
- compliance engine
- fraud clearance layer
- approval engine

Dat betekent:

- klantdata vergelijken met documentdata
- zichtbare documentkenmerken expliciet maken
- verschillen en onzekerheden expliciet markeren
- menselijke controle ondersteunen

Belangrijke taalregel:

- intern en technisch: **analysis**
- niet doen: “AI verification”, “verified by AI”, “automatisch geverifieerd”

---

## 3) Harde architectuurregel

Analysis v1 mag de huidige dossierdatabase niet muteren of herinterpreteren.

Dus:

- géén writes naar `dossiers`
- géén writes naar `dossier_chargers`
- géén writes naar `dossier_documents`
- géén wijziging van bestaande `dossier_checks`
- géén impact op bestaande review/lock state machine

Analysis v1 mag alleen:

1. lezen uit:
   - `dossiers`
   - `dossier_chargers`
   - `dossier_documents`
2. schrijven naar:
   - eigen analysis-tabellen
   - aanvullende audit events
3. gelezen worden door:
   - `api-dossier-export`

Analysis blijft dus volledig **derived**, niet canoniek.

---

## 4) Kernmodel

Elke analyse houdt drie lagen strikt uit elkaar:

### A. Declared

Wat de klant invulde in het dossier.

### B. Observed

Wat het systeem uit document of foto haalde.

### C. Evaluated

Wat het systeem concludeerde op basis van declared vs observed.

Voorbeeld:

- declared: `mid_number = 1234567890`
- observed: `mid_number = 1234567890`
- evaluated: `invoice_mid_match = pass`

Dit onderscheid is hard nodig om het systeem verdedigbaar, auditwaardig en uitbreidbaar te houden.

---

## 5) Analyse-scopes

Analysis v1 kent drie scopes.

### 5.1 Document-level

Doel:
- pure observed layer per document

Voorbeelden:
- factuur: adres, merk, model, serienummer, MID
- foto: laadpunt zichtbaar, label zichtbaar, zichtbaar serienummer, zichtbaar MID

Deze laag doet **nog geen dossierwaarheidsclaim**.

### 5.2 Charger-level

Doel:
- consistency-evaluatie per laadpaal

Hier worden declared velden uit `dossier_chargers` vergeleken met observed velden uit gekoppelde documenten.

Voorbeelden:
- `invoice_brand_match`
- `invoice_model_match`
- `invoice_serial_match`
- `invoice_mid_match`
- `photo_serial_match`
- `photo_mid_match`
- `photo_charger_visible`

Dit is de belangrijkste reviewlaag voor menselijke beoordeling.

### 5.3 Dossier-level summary

Doel:
- samenvatting op dossierniveau

Voorbeelden:
- hoeveel chargers zijn geanalyseerd
- hoeveel checks `fail`
- hoeveel checks `inconclusive`
- welke beperkingen gelden
- overall analysis status

Deze laag is samenvattend en template-based.

---

## 6) Scope v1

Belangrijke CURRENT nuance (2026-03-27):
- Scope v1 blijft formeel factuur + foto,
  maar de uitvoeringsvolgorde is bewust asymmetrisch:
  - eerst factuur hardenen
  - daarbinnen nu ook factuur-afbeeldingen ondersteunen
  - laadpaalfoto blijft voorlopig skeleton

Factuur-input splitst daarmee op in:
- text-based PDF factuur
- image-based factuur (jpg/png)

Beide routes moeten uitkomen op dezelfde observed/evaluated contractlaag.

Harde ontwerpregel:
- geen externe OCR/vision provider
- alleen interne/local extractie
- de eerdere poging om de OCR-engine direct in Supabase Edge runtime te draaien is verlaten
- nieuwe richting:
  - standalone interne OCR worker buiten Edge
  - `light`/preflight blijft contractuele basislaag
  - standalone worker levert de echte invoice-image extractie
- beide routes moeten uitkomen op dezelfde outputcontractlaag:
  - PDF text extractie
  - invoice image extractie
- `light` mag dus niet verdwijnen:
  - het blijft de image preflight- en normalisatielaag
  - maar is niet langer het eindstation voor invoice-images

### 6.1 Factuur consistency checks

Per charger met documenttype `factuur`:

- adres match met dossieradres
- merk match met charger.brand
- model match met charger.model
- serienummer match met charger.serial_number
- MID match met charger.mid_number

### 6.1.1 Factuur input types (CURRENT)

Analysis v1 ondersteunt voor facturen:

- `application/pdf`
- `image/jpeg`
- `image/png`

Niet in scope voor analysis v1:

- `image/webp`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Belangrijke nuance:
- upload-support en analysis-support zijn niet automatisch hetzelfde
- een bestandstype mag uploadbaar zijn zonder dat analysis v1 daar inhoudelijke extractie op doet

### 6.2 Foto evidence checks

Per charger met documenttype `foto_laadpunt`:

- laadpunt zichtbaar
- merk mogelijk zichtbaar
- model mogelijk zichtbaar
- serienummerlabel zichtbaar
- MID-label zichtbaar
- als zichtbaar: match met declared chargerdata

Belangrijk:

- foto-checks zullen vaak `inconclusive` zijn
- dat is correct gedrag, geen fout

Operational reality (CURRENT):
- dit spoor wordt nu bewust niet verder uitgewerkt
- eerst moet een representatieve laadpaalfoto-dataset bestaan
- tot die tijd is `not_checked` de correcte uitkomst, niet een tijdelijk ongemak

---

## 7) Wat v1 expliciet niet doet

Niet bouwen in v1:

- issuer validation
- echte anti-fraud forensics
- remote charger/backend integraties
- automatische juridische of compliance-conclusies
- authenticiteitsclaims over documenten
- wijziging van review-gates
- blokkeren van dossier lock op basis van analysis-uitkomst

Analysis v1 is ondersteunend voor review, niet bepalend voor lifecycle.

---

## 8) Relatie tot bestaande checks

`dossier_checks` en analysis zijn **niet hetzelfde** en mogen niet worden vermengd.

### 8.1 `dossier_checks` blijven

`dossier_checks` blijven lifecycle-/gating-checks, bijvoorbeeld:

- adres bevestigd
- exact aantal chargers aanwezig
- documenten bevestigd
- consents aanwezig
- MID ingevuld

### 8.2 Analysis komt erbovenop

Analysis beoordeelt inhoudelijke consistentie, bijvoorbeeld:

- matcht het serienummer op de factuur met de declared charger?
- is er een MID-label zichtbaar op de foto?
- matcht zichtbaar merk/model met declared velden?

Dus:

- `dossier_checks = completeness / lifecycle`
- `analysis = consistency / review support`

---

## 9) Status-taxonomie

### 9.1 Document analysis status

- `queued`
- `completed`
- `failed`

Betekenis:

- `queued`
  - analyse is aangemaakt maar nog niet afgerond
- `completed`
  - analyse is technisch uitgevoerd, ook als observed output leeg of beperkt is
- `failed`
  - analyse kon technisch niet worden uitgevoerd door runtime-, decode- of extractor-fout

Belangrijke waarheidregel:
- "geen bruikbare tekst gevonden" is geen `failed`, maar `completed` met expliciete `limitations`
- technische extractor-crash is wel `failed`

### 9.2 Charger analysis result status

- `pass`
- `fail`
- `inconclusive`
- `not_checked`

### 9.3 Overall analysis status

- `not_run`
- `partial_pass`
- `pass`
- `review_required`

Gebruik bewust **geen** overall status `verified`.

---

## 10) Datamodel — voorstel

## 10.1 Nieuwe tabel: `public.dossier_analysis_document`

Doel:
- observed layer per document

Voorstelvelden:

- `id` uuid pk
- `dossier_id` uuid not null
- `document_id` uuid not null
- `charger_id` uuid null
- `doc_type` text not null
- `analysis_kind` text not null
  - `factuur_extract_v1`
  - `foto_extract_v1`
- `status` text not null
  - `queued`
  - `completed`
  - `failed`
- `method_code` text not null
- `method_version` text not null
- `observed_fields` jsonb not null default '{}'
- `confidence` jsonb not null default '{}'
- `limitations` jsonb not null default '[]'
- `summary` jsonb not null default '{}'
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Belangrijke constraints:

- FK naar `dossiers(id)`
- FK naar `dossier_documents(id)`
- FK naar `dossier_chargers(id)` indien aanwezig
- unique op `(document_id, analysis_kind, method_version)`

## 10.2 Nieuwe tabel: `public.dossier_analysis_charger`

Doel:
- evaluated layer per charger per analysis code

Voorstelvelden:

- `id` uuid pk
- `dossier_id` uuid not null
- `charger_id` uuid not null
- `source_document_id` uuid null
- `analysis_code` text not null
  - `invoice_address_match`
  - `invoice_brand_match`
  - `invoice_model_match`
  - `invoice_serial_match`
  - `invoice_mid_match`
  - `photo_charger_visible`
  - `photo_brand_match`
  - `photo_model_match`
  - `photo_serial_match`
  - `photo_mid_match`
- `status` text not null
  - `pass`
  - `fail`
  - `inconclusive`
  - `not_checked`
- `declared_value` jsonb not null default '{}'
- `observed_value` jsonb not null default '{}'
- `evaluation_details` jsonb not null default '{}'
- `method_code` text not null
- `method_version` text not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Belangrijke constraints:

- FK naar `dossiers(id)`
- FK naar `dossier_chargers(id)`
- FK naar `dossier_documents(id)` indien aanwezig
- unique op combinatie van:
  - `charger_id`
  - `analysis_code`
  - `method_version`
  - `source_document_id` (waar relevant)

## 10.3 Nieuwe tabel: `public.dossier_analysis_summary`

Doel:
- dossier-level derived summary

Voorstelvelden:

- `id` uuid pk
- `dossier_id` uuid not null
- `overall_status` text not null
  - `not_run`
  - `partial_pass`
  - `pass`
  - `review_required`
- `method_code` text not null
- `method_version` text not null
- `summary` jsonb not null default '{}'
- `limitations` jsonb not null default '[]'
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Belangrijke constraints:

- FK naar `dossiers(id)`
- unique op `(dossier_id, method_code, method_version)`

---

## 11) Waarom drie tabellen

Omdat extractie, evaluatie en samenvatting niet hetzelfde zijn.

Voordelen:

- document extractie blijft herbruikbaar
- evaluaties kunnen opnieuw draaien zonder document opnieuw te analyseren
- dossier-summary blijft compact en uitlegbaar
- remote observed bronnen kunnen later worden toegevoegd zonder modelbreuk
- export kan reviewbaar blijven zonder ruwe observaties met conclusies te vermengen

---

## 12) Method contract v1

## 12.1 Factuur extract v1

Observed fields:

- `customer_name`
- `address_text`
- `postcode`
- `house_number`
- `street`
- `city`
- `brand`
- `model`
- `serial_number`
- `mid_number`
- `invoice_date`

### 12.1.1 Factuur image extractie (CURRENT richting)

Voor image-based facturen geldt:

- extractie blijft intern/local
- geen externe OCR/vision provider
- extractor wordt modulair opgezet in `image_text.ts`
- architectuur is staged:
  - `light` stage eerst
  - zwaardere lokale stage later mogelijk
- beide stages moeten hetzelfde outputcontract gebruiken

Observed output blijft truth-first:
- wat gelezen is → registreren
- wat niet gelezen is → expliciet leeg laten
- onzekerheid → via `limitations` en/of `inconclusive`, nooit maskeren als pass/fail

Canonieke bronregel:
- de browser mag image-bytes optimaliseren of waarschuwen,
  maar de analysis-uitkomst voor een factuurafbeelding wordt server-side bepaald in `api-dossier-verify`.
- client-side OCR of client-side extractie is geen source-of-truth voor analysis v1.

## 12.2 Factuur match v1

Checks:

- `invoice_address_match`
- `invoice_brand_match`
- `invoice_model_match`
- `invoice_serial_match`
- `invoice_mid_match`

## 12.3 Foto extract v1

Observed fields:

- `charger_visible`
- `brand_visible`
- `brand`
- `model_visible`
- `model`
- `serial_label_visible`
- `serial_number`
- `mid_label_visible`
- `mid_number`

## 12.4 Foto match v1

Checks:

- `photo_charger_visible`
- `photo_brand_match`
- `photo_model_match`
- `photo_serial_match`
- `photo_mid_match`

---

## 13) Endpoint

### `api-dossier-verify`

Doel:

- analyses draaien of verversen
- analysis-resultaten opslaan
- summary genereren

Voorbeeld input:

```json
{
  "dossier_id": "...",
  "session_token": "...",
  "mode": "refresh",
  "client_verify_payload": {
    "version": "enval-client-verify-payload.v1",
    "declared_snapshot": {
      "dossier": {},
      "chargers": []
    },
    "document_snapshot": {
      "from_server": [],
      "from_client_uploads": [],
      "client_invoice_observed": []
    }
  }
}

14) Pipeline

De analysis-pipeline is:
- confirmed documenten lezen
- document-level analysis schrijven
- charger-level analysis schrijven
- dossier-summary schrijven
- audit events schrijven

Niet doen in v1:
- analysis draaien tijdens upload
- analysis draaien tijdens export
- analysis-resultaten terugschrijven naar dossier of charger records

15) Export-uitbreiding

De export moet worden uitgebreid met een aparte analysis-laag.

15.1 Nieuw top-level blok
"analysis": {
  "version": "enval-analysis.v1",
  "overall_status": "partial_pass",
  "scope": [
    "invoice_field_matching",
    "photo_evidence_checks"
  ],
  "limitations": [
    "No authenticity guarantee",
    "No issuer validation performed",
    "Photo analysis may be inconclusive",
    "Email verification reflects link possession, not mailbox control"
  ]
}

15.2 Nieuw blok analysis_methods
"analysis_methods": [
  {
    "analysis_key": "factuur_extract_v1",
    "description": "Field extraction from invoice document for address and charger identifiers."
  },
  {
    "analysis_key": "factuur_match_v1",
    "description": "Comparison of extracted invoice fields against dossier and charger declared fields."
  },
  {
    "analysis_key": "foto_extract_v1",
    "description": "Visual evidence extraction from charger photo for charger presence and visible identifiers."
  },
  {
    "analysis_key": "foto_match_v1",
    "description": "Comparison of visible identifiers from charger photo against declared charger fields."
  }
]

15.3 Nieuwe blokken

- analysis_documents
- analysis_chargers
- analysis_summary

15.4 Human summary

De human summary moet template-based zijn.

Dus:

- geen vrije interpretatieve tekst
- alleen afgeleid van expliciete analysis-results
- bedoeld voor menselijke review
- nooit formuleren alsof compliance of authenticiteit is vastgesteld

16) Audit events

Nieuwe audit events toevoegen.

16.1 Document analysis

- document_analysis_started
- document_analysis_completed
- document_analysis_failed

16.2 Charger analysis

charger_analysis_result_written

16.3 Summary

dossier_analysis_summary_generated

Event_data minimaal:
- document_id indien relevant
- charger_id indien relevant
- doc_type indien relevant
- analysis_kind of analysis_code
- method_code
- method_version
- status
- request_id
- actor_ref
- environment

Belangrijke auditregel:
- analysis-events zijn aanvullend
- ze vervangen geen bestaande dossier lifecycle events
- ze wijzigen geen bestaande auditbetekenis van review/export/upload

17) Implementatievolgorde
Fase A — backend skeleton

DB migration voor:
- dossier_analysis_document
- dossier_analysis_charger
- dossier_analysis_summary

nieuw endpoint:
- supabase/functions/api-dossier-verify/index.ts
- optionele shared helper:
- supabase/functions/_shared/analysis.ts

Nog zonder slimme extractie.

Fase B — factuur extraction + matching

Eerst alleen factuur.

Doel:
- extracted fields robuuster opslaan
- 5 invoice checks inhoudelijk betrouwbaarder maken
- verify-run log gebruiken als vaste evidence-loop
- export blijft analysis-blokken tonen, maar de focus ligt nu op betere inhoud i.p.v. alleen structuur

Subvolgorde binnen factuur:
1. text-based PDF hardenen
2. image-based factuur toevoegen via aparte shared extractor (`image_text.ts`)
3. beide extractieroutes laten landen in dezelfde observed/evaluated contractlaag

Harde regel:
- geen externe OCR/vision provider
- liever `completed + limitations + inconclusive` dan schijnzekerheid

Fase C — laadpaalfoto evidence checks

Startvoorwaarde:
- pas beginnen wanneer er een bruikbare laadpaalfoto-dataset is

Doel:
- pas na dataset-opbouw basic visible/presence checks invoeren
- alleen matchen als observed field voldoende zeker is
- standaard liever `inconclusive` dan geforceerde false certainty

Tot die tijd:
- `foto_laadpunt` blijft skeleton
- verify/export/logs moeten deze beperking expliciet zichtbaar houden

Fase D — human summary

Doel:
- korte reviewtekst genereren op basis van analysis-results
- template-based, niet hallucinerend

18) Phase-A ontwerpkeuze

Fase A mag beginnen zonder echte OCR/vision-logica.

Dus eerst:
- schema
- endpoint-contract
- audit-contract
- export-contract

Pas daarna:
- echte factuur extractie
- echte foto-observatie

Rationale:
- eerst bewijzen dat de derived analysis layer technisch klopt
- daarna pas extractiekwaliteit verbeteren



19) Later spoor — remote observed data

Dit is relevant, maar niet voor v1 implementeren.

Later mogelijke bronsoorten:
- laadpaal backend portal
- energy manager / HEMS
- backend supplier data
- remote serial/MID readout
- device screenshots of API payloads

Toekomstige richting:
- customer_declared
- document_observed
- remote_observed
- system_evaluated

Zo blijft het model uitbreidbaar zonder herbouw.


---

## Update 2026-03-16 — Operational dev status + implementatievolgorde aangescherpt

Wat nu bewezen is:
- Analysis v1 skeleton draait technisch end-to-end
- `api-dossier-verify` schrijft naar:
  - `dossier_analysis_document`
  - `dossier_analysis_charger`
  - `dossier_analysis_summary`
- export v5 bevat analysis-blokken
- testdossier met meerdere invoice-/foto-documenten is beschikbaar als ontwikkelbasis
- dev unlock + session refresh routine zijn nu werkbaar, waardoor analysis iteraties op hetzelfde dossier sneller uitvoerbaar zijn

Aangescherpte implementatievolgorde:
1. Factuur observed fields echt vullen in `dossier_analysis_document`
2. Factuur charger-level matching schrijven in `dossier_analysis_charger`
3. Dossier-summary op basis van echte factuur-uitkomsten
4. Pas daarna foto observed fields en foto matching

Belangrijke operational nuance:
- Voor browsergebruik met een reeds geminte runtime-session moet de UI session uit localStorage lezen
- `session_token` via query param `t` is ongeldig, omdat `t` semantisch exclusief link-token betekent
- Dit is een dev-ergonomie issue, geen analysis issue

Harde v1 discipline blijft:
- eerst invoice consistency
- daarna pas photo evidence
- liever `inconclusive` dan geforceerde zekerheid
- geen lifecycle-impact van analysis-uitkomsten


## Update 2026-03-20 — Richting aangescherpt: factuur hardenen eerst, laadpaalfoto’s bewust later

Wat nu expliciet besloten is:
- We gaan nu niet door op laadpaalfoto-analyse.
- Reden:
  - de huidige beschikbare “slechte voorbeelden” zijn vooral facturen
  - er is nog geen representatieve laadpaalfoto-dataset
  - verder bouwen op foto-extractie zou nu vooral schijnvoortgang zijn

Daarom is CURRENT focus:
1. verify-pipeline behouden zoals die nu bewezen draait
2. factuur-extractie robuuster maken
3. testset uitbreiden met realistische slechte factuurvarianten
4. pas daarna laadpaalfoto-spoor oppakken

Nieuwe uitvoeringsregel:
- `foto_laadpunt` blijft voorlopig:
  - skeleton
  - `not_checked`
  - expliciet beperkt in export/logs/summary
  
Aanvullend bewezen (2026-03-22):
- non-PDF facturen (`jpg/png`) volgen CURRENT een gecontroleerde fallback-route:
  - document-level:
    - `status = completed`
    - `observed_fields = {}`
    - `invoice_image_extraction_not_implemented`
    - `invoice_extract_skipped`
  - charger-level:
    - invoice checks worden `inconclusive`
    - reason: `invoice_present_but_no_observed_fields_available`
- Dit is CURRENT correct gedrag en geen tijdelijke fouttoestand.

Factuur-spoor wordt nu opgesplitst in twee niveaus:

### A) Extractierobuustheid
Verbeteren van `extractInvoiceObservedFieldsFromText()` van label-only naar hybrid extractie.

Doel:
- minder afhankelijk zijn van exacte labels zoals `Address`, `City`, `Brand`, `Model`
- eerst hardere identifiers en adrespatronen vinden
- daarna pas zwakkere velden invullen

Praktisch betekent dit:
- serial/MID eerst via ID-achtige patronen
- adres via kandidaatregels i.p.v. alleen labelvelden
- explicieter omgaan met ontbrekende velden
- liever `inconclusive` dan fake zekerheid

### B) Bewijsbaarheid / reviewbaarheid
De verify-run tooling moet laten zien:
- wat exact observed is
- uit welk document dat kwam
- hoe dat doorliep naar charger-resultaten
- wat expected_db was
- waarom iets pass/fail/inconclusive werd

De verify-log is daarmee niet alleen debug-output,
maar onderdeel van de development proof-loop.

Harde beperkingen die blijven gelden:
- geen externe OCR/vision provider
- geen authenticity claim
- geen compliance claim
- geen lifecycle-mutatie op basis van analysis-uitkomst

CURRENT uitvoerfase binnen facturen:
- `text_based_pdf` blijft hard ondersteund
- `image/jpeg` en `image/png` worden nu server-side toegevoegd als invoice-image route
- browser-side processing blijft niet-canoniek voor analysis

Concreet gevolg voor implementatievolgorde:
1. factuur extractie verbeteren
2. verify-run log behouden/uitbreiden als evidence tool
3. slechte factuurset uitbreiden
4. pas daarna laadpaalfoto-dataset verzamelen en foto-analysis starten


## Update 2026-03-30 — Edge-OCR route verlaten; standalone worker eerst

Expliciet besluit:
- lokale invoice-image OCR direct binnen Supabase Edge runtime wordt niet verder doorontwikkeld

Waarom:
- de verify/orchestrationlaag werkt
- de analysis-tabellen werken
- de exportlaag werkt
- de extractor-runtime in Edge bleek de verkeerde plek voor de zware invoice-image OCR-engine

Nieuwe implementatievolgorde:
1. standalone interne invoice OCR worker bouwen en lokaal bewijzen
2. worker-output disciplineren naar hetzelfde observed-fields contract als PDF
3. pas daarna koppelen aan `api-dossier-verify`
4. pas daarna foto-analysis

Belangrijke invariant:
- analysis blijft derived
- `api-dossier-verify` blijft writer/orchestrator
- geen lifecycle-mutatie
- geen compliance/authenticity claim

## Update 2026-03-31 — Standalone worker verdiept: compare-laag + PDF→JPG lane + page-level parserhardening eerst

Wat nu bewezen is:
- standalone/local invoice-image worker is niet meer alleen een runtime-experiment,
  maar een echte parser-proof-loop
- output bevat nu:
  - approved values
  - raw candidates voor ID-velden
  - limitations
  - summary
- daarboven bestaat nu een lokale compare-laag die expected vs observed vergelijkt

Nieuwe expliciete werkverdeling:

### A) Parserlaag (standalone/local)
Doel:
- observed extraction verbeteren zonder verify of analysis-tabellen al te raken

CURRENT aandachtspunten:
- stacked label/value layouts
- Dutch stacked label/value layouts
- customer-name selectie in stacked documenten
- veilige ID candidate handling (raw bewaren, niet gokken)

### B) Compare-laag (standalone/local)
Doel:
- parseruitkomst meteen tegen testverwachting leggen

Status:
- lokaal script bestaat
- gebruikt:
  - `expected`
  - `observed_raw`
  - `observed_approved`
  - field status
  - overall status
  - overall reason

Belang:
- dit is de brug tussen parser en latere verify-integratie
- compare is CURRENT nog geen analysis-table write, maar een lokale beoordelingslaag

### C) PDF→JPG lane
Doel:
- dezelfde testfamilie als de PDF matrix ook als image-lane beoordelen

Bewezen:
- single-page PDF-afgeleide JPG’s geven waardevolle parser- en regressie-informatie
- multipage PDF-afgeleide JPG’s tonen logisch gesplitste documentinformatie per pagina

Belangrijke CURRENT ontwerpregel:
- multipage image aggregation is nog niet aan de beurt
- eerst page-level extraction stabiliseren
- daarna pas document-level merge van `_p01/_p02/_p03`

Nieuwe implementatievolgorde:
1. single-page parser hardenen
2. stacked / Dutch stacked label parsing hardenen
3. regressies bewaken via compare + PDF→JPG lane
4. pas daarna multipage image aggregation
5. pas daarna koppeling naar `api-dossier-verify`

# EINDE 11_ANALYSE_PLAN.md
