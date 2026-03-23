# ENVAL — Analysis Test Matrix

Statusdatum: 2026-03-22
Doel: vaste testmatrix voor Analysis v1 factuur-hardening.
Regel: alleen scenario’s en expected outcomes. Geen interpretatieve marketingtaal.

---

## 1) Scope (CURRENT)

Deze matrix is uitsluitend voor:

* factuur-extractie
* factuur consistency matching
* observed vs expected_db review

Niet voor:

* laadpaalfoto-analyse
* OCR-claims
* authenticity claims
* compliance claims

Ondersteunde uitvoerstatus (CURRENT):

* PDF text-based facturen → ondersteund
* invoice images / camera shots → nog niet ondersteund, dus verwacht `inconclusive` of document limitation

---

## 2) Bestandsoverzicht

### Daan

* invoice_daan - real like - 02.pdf
* invoice_daan - real like - 03.pdf
* invoice_daan - real like - 01 .jpg
* invoice_daan - real like - 04.jpg
* invoice_daan - camera - bad - 01.jpg
* invoice_daan - camera - bad - 02.jpg
* incoice_daan - camera - bad - 03.png

### Paul

* invoice_paul - real like - 01.pdf
* invoice_paul - real like - 01.jpg
* invoice_paul - real like - 02.jpg
* invoice_paul - camera - good - 01.jpg
* invoice_paul - camera - bad - 01.jpg
* invoice_paul - camera - bad - 02.jpg
* invoice_paul - camera - bad - 03.png

---

## 3) Canonical expected dossier data per persoon

### Daan — TEST-A baseline

* naam: Daan Koote
* street: Geulstraat
* house_number: 28
* suffix: 1H
* postcode: 1078LA
* city: Amsterdam
* serial_number: 1234567890
* mid_number: M123456789
* brand: Test Brand (alleen waar document dat expliciet bevat)
* model: Model A (alleen waar document dat expliciet bevat)

### Paul — TEST-B/C/D baseline

* naam: Paul Koote
* street: Kostverlorenstraat
* house_number: 65
* suffix: null
* postcode: 2042PC
* city: Zandvoort
* serial_number: 0987654321
* mid_number: M0987654321
* brand/model verschillen per variant en moeten document-specifiek beoordeeld worden

---

## 4) Scenario-matrix

| ID   | Bestand                                         | Persoon | Vorm | Kwaliteit        | CURRENT support                   | Verwachte observed fields                                                       | Verwachte charger-resultaten                                                                  |
| ---- | ----------------------------------------------- | ------- | ---- | ---------------- | --------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D-01 | invoice_daan - real like - 02.pdf               | Daan    | PDF  | clean            | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=pass, serial=pass, mid=pass, brand=pass, model=pass                                   |
| D-02 | invoice_daan - real like - 03.pdf               | Daan    | PDF  | clean-minimal    | supported_text_pdf                | address + city + postcode + serial + mid, brand/model mogen null zijn           | address=pass, serial=pass, mid=pass, brand=inconclusive, model=inconclusive                   |
| D-03 | invoice_daan - real like - 01 .jpg              | Daan    | JPG  | clean            | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| D-04 | invoice_daan - real like - 04.jpg               | Daan    | JPG  | clean            | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| D-05 | invoice_daan - camera - bad - 01.jpg            | Daan    | JPG  | camera-bad       | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| D-06 | invoice_daan - camera - bad - 02.jpg            | Daan    | JPG  | camera-bad       | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| D-07 | incoice_daan - camera - bad - 03.png            | Daan    | PNG  | camera-bad       | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| P-01 | invoice_paul - real like - 01.pdf               | Paul    | PDF  | clean            | supported_text_pdf                | address + city + postcode + serial + mid                                        | address=pass, serial=pass, mid=pass, brand=inconclusive, model=inconclusive                   |
| P-02 | invoice_paul - real like - 01.jpg               | Paul    | JPG  | clean            | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| P-03 | invoice_paul - real like - 02.jpg               | Paul    | JPG  | clean            | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| P-04 | invoice_paul - camera - good - 01.jpg           | Paul    | JPG  | camera-good      | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| P-05 | invoice_paul - camera - bad - 01.jpg            | Paul    | JPG  | camera-bad       | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| P-06 | invoice_paul - camera - bad - 02.jpg            | Paul    | JPG  | camera-bad       | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| P-07 | invoice_paul - camera - bad - 03.png            | Paul    | PNG  | camera-bad       | unsupported_invoice_image_for_now | geen observed fields in CURRENT                                                 | alle invoice_* = inconclusive wegens unsupported invoice image                                |
| P-08 | invoice_paul_-_real_like_-_06_MID_wrong_01.pdf  | Paul    | PDF  | clean-negative   | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=pass, serial=pass, mid=fail, brand=pass, model=pass                                   |
| P-09 | invoice_paul_-_real_like_-_07_brand_wrong_01.pdf| Paul    | PDF  | clean-negative   | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=pass, serial=pass, mid=pass, brand=fail, model=pass                                   |
| P-10 | invoice_paul_-_real_like_-_08_model_wrong_01.pdf| Paul    | PDF  | clean-negative   | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=pass, serial=pass, mid=pass, brand=pass, model=fail                                   |
| P-11 | invoice_paul_-_real_like_-_09_address_wrong_01.pdf | Paul | PDF  | clean-negative   | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=fail, serial=pass, mid=pass, brand=pass, model=pass                                   |
| P-12 | invoice_paul_-_real_like_-_10_serial_wrong_01.pdf | Paul | PDF  | clean-negative   | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=pass, serial=fail, mid=pass, brand=pass, model=pass                                   |
| P-13 | invoice_paul_-_real_like_-_11_all_correct_01.pdf | Paul | PDF  | clean-full       | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=pass, serial=pass, mid=pass, brand=pass, model=pass                                   |
| P-14 | invoice_paul_-_real_like_-_12_chaos_01.pdf      | Paul    | PDF  | chaos            | supported_text_pdf                | brand + model + serial + mid, address fields CURRENT verwacht null              | address=inconclusive, serial=pass, mid=pass, brand=pass, model=pass                           |
| P-15 | invoice_paul_-_real_like_-_13_multi-page_01.pdf | Paul    | PDF  | multi-page       | supported_text_pdf                | address + city + postcode + serial + mid + brand + model                        | address=pass, serial=pass, mid=pass, brand=pass, model=pass                                   |
| P-16 | invoice_paul_-_real_like_-_14_multi-page_chaos_01.pdf | Paul | PDF | multi-page-chaos | supported_text_pdf               | brand + model + serial + mid, address fields CURRENT verwacht null              | address=inconclusive, serial=pass, mid=pass, brand=pass, model=pass                           |
---

## 5) Actieve werkhypotheses voor extractor-hardening

### H1 — PDF-minimaal moet slagen zonder expliciet Brand/Model label

Te bewijzen met:

* D-02
* P-01

### H2 — Address block detectie moet werken via regels, niet alleen labels

Te bewijzen met:

* D-02
* P-01

### H3 — MID / Serial moeten ID-first geëxtraheerd worden

Te bewijzen met:

* D-01
* D-02
* P-01

### H5 — Negatieve single-field varianten moeten exact één inhoudelijke fail geven

Te bewijzen met:

* P-08
* P-09
* P-10
* P-11
* P-12

Verwacht:
- alleen het doelveld faalt
- overige invoice-velden blijven pass

### H6 — Volledige text-based PDF met alle velden expliciet aanwezig moet volledig slagen

Te bewijzen met:

* P-13

### H7 — Multipage text-based PDF moet ondersteund blijven

Te bewijzen met:

* P-15

Verwacht:
- multipage op zichzelf veroorzaakt geen inconclusive of fail

### H8 — Chaos-layout zonder herkenbaar adresblok moet veilig degraderen naar address inconclusive

Te bewijzen met:

* P-14
* P-16

Verwacht:
- address fields blijven null
- address_match = inconclusive
- brand/model/mid/serial blijven pass indien los herkenbaar

---

## 6) Werkprotocol per iteratie

Per iteratie doen we exact dit:

1. Kies 1 dossierconfiguratie en 1 of 2 documenten om te wisselen.
2. Draai verify-run.
3. Vergelijk output met deze matrix.
4. Noteer afwijking:

   * extractor tekort
   * matrix fout
   * testdata fout
5. Pas pas daarna code of matrix aan.

---

## 7) Eerstvolgende aanbevolen testvolgorde

1. D-01 baseline groen houden.
2. D-02 baseline groen houden.
3. P-01 baseline groen houden.
4. P-08 t/m P-12 gebruiken als negatieve single-field regressies.
5. P-13 gebruiken als full-pass referentie met alle relevante velden expliciet aanwezig.
6. P-15 gebruiken als multipage regressie.
7. P-14 en P-16 gebruiken als boundary-tests voor chaos / address reconstruction limiet.
8. Daarna pas regressietests op unsupported images.
9. Pas daarna eventueel invoice-image support overwegen.

---

## 8) Resultaten t/m 2026-03-22

### Bewezen groen

* **D-01 / Daan / real like 02.pdf**
  * observed: address + city + postcode + serial + mid + brand + model
  * results: address=pass, serial=pass, mid=pass, brand=pass, model=pass

* **D-02 / Daan / real like 03.pdf**
  * observed: address + city + postcode + serial + mid
  * results: address=pass, mid=pass
  * brand/model mogen CURRENT inconclusive zijn wanneer document die velden niet expliciet draagt

* **P-01 / Paul / real like 01.pdf**
  * observed: address + city + postcode + serial + mid
  * results: address=pass, serial=pass, mid=pass
  * brand/model CURRENT inconclusive indien niet aanwezig in document

* **P-08 / Paul / 06 MID wrong 01**
  * results: alleen `invoice_mid_match=fail`
  * overige invoice checks = pass

* **P-09 / Paul / 07 brand wrong 01**
  * results: alleen `invoice_brand_match=fail`
  * overige invoice checks = pass

* **P-10 / Paul / 08 model wrong 01**
  * results: alleen `invoice_model_match=fail`
  * overige invoice checks = pass

* **P-11 / Paul / 09 address wrong 01**
  * results: alleen `invoice_address_match=fail`
  * overige invoice checks = pass

* **P-12 / Paul / 10 serial wrong 01**
  * results: alleen `invoice_serial_match=fail`
  * overige invoice checks = pass

* **P-13 / Paul / 11 all correct 01**
  * results: alle invoice checks = pass

* **P-15 / Paul / 13 multi-page 01**
  * results: alle invoice checks = pass

### Boundary-resultaten

* **P-14 / Paul / 12 chaos 01**
  * observed:
    * brand/model/mid/serial aanwezig
    * address fields = null
  * results:
    * address=inconclusive
    * brand=pass
    * model=pass
    * mid=pass
    * serial=pass

* **P-16 / Paul / 14 multi-page chaos 01**
  * observed:
    * brand/model/mid/serial aanwezig
    * address fields = null
  * results:
    * address=inconclusive
    * brand=pass
    * model=pass
    * mid=pass
    * serial=pass

### Eerder zichtbaar probleem — inmiddels opgelost / niet meer reproduceerbaar

Historische observatie:
- Er was eerder verdenking dat `address_match` onterecht `inconclusive` werd
  wanneer declared suffix en observed suffix beide `null` waren.

Huidige bewezen status (2026-03-22):
- Dit probleem is in de recente Paul-runs niet meer reproduceerbaar.
- `suffix=null` + `suffix=null` geeft CURRENT correct:
  - `status = pass`
  - `reason = both_missing_not_applicable`

Conclusie:
- De actuele bewezen limiet zit niet in suffix-null handling,
  maar in address block reconstruction bij chaos-layouts.

### Bewezen correct unsupported gedrag

* **P-03 / Paul / real like 02.jpg**
  * CURRENT correct gedrag:
    * document limitation = `invoice_image_extraction_not_implemented`
    * alle `invoice_*` rows = `inconclusive`

## 9) Open beslissingen

* Daan negatieve PDF-varianten nog expliciet uitwerken, analoog aan Paul P-08 t/m P-16.
* Mogelijk aparte kolom toevoegen: `expected limitation`.
* Mogelijk aparte kolom toevoegen: `expected summary.overall_status contribution`.
* Beslissen of address reconstruction in een volgende iteratie:
  - strikt block-based blijft, of
  - uitgebreid wordt met losse candidate reconstruction voor street / house_number / postcode / city.


## 10) Analysis verification — invoice parser boundary tests (Paul)

Statusdatum: 2026-03-22

| Variant | Bestandsnaam | Verwachte uitkomst | Werkelijke uitkomst | Conclusie |
|---|---|---:|---:|---|
| 10 | invoice_paul_-_real_like_-_10_serial_wrong_01.pdf | fail op serial | correct | serial mismatch detectie werkt |
| 11 | invoice_paul_-_real_like_-_11_all_correct_01.pdf | alle invoice checks pass | correct | happy flow werkt |
| 12 | invoice_paul_-_real_like_-_12_chaos_01.pdf | boundary test | address inconclusive, overige fields pass | chaos-layout breekt adres-extractie |
| 13 | invoice_paul_-_real_like_-_13_multi-page_01.pdf | alle invoice checks pass | correct | multipage PDF werkt |
| 14 | invoice_paul_-_real_like_-_14_multi-page_chaos_01.pdf | boundary test | address inconclusive, overige fields pass | multipage + chaos breekt adres-extractie |

### Samenvatting
- Brand/model/MID/serial extractie is robuust bij text-based PDF’s, inclusief multipage.
- Address extractie is afhankelijk van een herkenbaar adresblok.
- Bij chaos-layouts zonder duidelijk adresblok wordt address niet foutief gepassed, maar inconclusive.
- Huidige limiet zit dus in address block reconstruction, niet in multipage ondersteuning.


# EINDE ENVAL — Analysis Test Matrix