# 09_ARTIKEL_STANDAARD

Statusdatum: 2026-03-02
Doel: elk artikel in **exact hetzelfde format** zodat `regelgeving.html` (grid + modal) altijd strak, rustig en klantgericht blijft.

---

## 1) Hoe het werkt (architectuur)

### 1.1 Bestandsstructuur

* Elk artikel leeft in een eigen map:

  * `/artikelen/<slug>/artikel.md`
  * `/artikelen/<slug>/cover.jpeg` (optioneel maar aanbevolen)
* De lijst met artikelen komt uit:

  * `/artikelen/index.json`

### 1.2 Rendering op `regelgeving.html`

* Pagina laadt `index.json` en rendert cards in de grid.
* Klik op card → `artikel.md` wordt geladen in een modal.
* Markdown wordt omgezet naar HTML met een simpele parser:

  * `#`, `##`, `###` headings
  * `-` bullets
  * links als `[tekst](https://...)`

**Belangrijk (hard):**

* **Geen** inline scripts, placeholders, of “dev-notes” in content.
* **Geen** dubbele secties (bijv. 2× “Bronnen”).
* **Geen** interne referenties zoals `:contentReference[...]`.

### 1.3 Meta in de modal

De modal-header (datum/bron/titel/subtitel) komt **uit `index.json`**, niet uit `artikel.md`.

Dus in `artikel.md`:

* **geen** titel herhalen als je template/flow al een titel in de modal rendert;
* **geen** `Datum:` of `Bron:` regels;
* **geen** `## Bronnen` sectie.

Bronnen horen in `index.json` → `sources[]` en worden onderaan de modal getoond.

---

## 2) Standaard format artikel (plak dit in elk `artikel.md`)

> Regels (hard):
>
> * Klantgericht, geen interne taal.
> * Geen beloftes over opbrengst.
> * Korte zinnen, actief.
> * Onzekerheden expliciet.
> * Geen marketingwoorden (“makkelijk”, “nuchter”, “zonder bullshit”).

Template:

```md
<Korte intro (1–2 zinnen).>

## Samenvatting
- <bullet>
- <bullet>
- <bullet>

## Wat betekent dit voor privé-laadpalen?
- <bullet>
- <bullet>
- <bullet>

## Wat is nog onzeker?
- <bullet>
- <bullet>
```

**Toegestane extra secties (optioneel, alleen als het echt helpt):**

* `## Begrippen (kort)`
* `## Veelgemaakte misverstanden`

---

## 3) Standaard format slug

### 3.1 Regels

* lowercase
* kebab-case
* geen stopwoorden als het kan
* maximaal ~40 tekens (richtlijn)

Voorbeelden:

* `nea-inboeken-elektriciteit-red3`
* `mid-meter-bij-thuisladen`
* `waarde-en-verhandelbaarheid-eres`

---

## 4) `index.json` contract (per item)

Minimaal:

```json
{
  "slug": "...",
  "title": "...",
  "badge": "...",
  "abstract": "...",
  "source_name": "...",
  "sources": [{"label":"...","url":"https://..."}],
  "doc": "/artikelen/<slug>/artikel.md",

  "cover": "/artikelen/<slug>/cover.jpeg",
  "cover_alt": "...",

  "date": "YYYY-MM-DD"
}
```

**Conventies:**

* `date` is **altijd** `YYYY-MM-DD` (sorting + uniforme presentatie).
* `sources` is een array van `{label,url}`.
* `cover` is een absolute path (start met `/`).

---

## 5) Gebruikte CSS / classes (waar content op leunt)

### 5.1 In de modal (artikelcontent)

De MD→HTML maakt:

* headings: `h1`, `h2`, `h3`
* bullets: `ul.list` en `li`
* paragraphs: `p`
* links: `a`

Daarom moet je CSS minimaal dit netjes ondersteunen:

* `.list` (bestaat al)
* `h1/h2/h3` spacing (bestaat al)
* `a` styling (brand + underline)

### 5.2 Op de card (grid)

De card gebruikt o.a.:

* `.reg-card`, `.reg-title`, `.reg-abstract`, `.reg-foot`, `.reg-date`, `.reg-source`
* optioneel cover image: `.reg-cover`

---

## 6) Opdrachtformulering (standaard)

Als je een nieuw artikel wil laten maken of een bestaand artikel wil laten herschrijven, geef je:

1. de bronlink(s) (liefst NEa/EU/bedrijf/autoriteit, **niet** een concurrent als primaire bron)
2. de `slug`
3. eventuele focus (bijv. “thuisladen, particulier, geen belofte, alleen zekerheden”)

En gebruik exact deze instructie:

> “Vat samen in eigen woorden, vind een betrouwbare link (niet de concurrent) en zet dit neer volgens de standaarden in `09_ARTIKEL_STANDAARD`.”


## 7) STANDARD ENVAL COVER PROMPT (v1 — minimal audit style) 

Minimalistisch, professioneel, rustig, veel negatieve ruimte.
Lichte achtergrond (off-white of zacht grijs).
Eén centraal object of symbool, subtiel 3D, matte afwerking.
Geen tekst, geen icoontjes, geen drukke patronen.
Geen gradients die schreeuwen.
Kleuraccenten: zacht blauw, donkerblauw of neutrale tinten.
Thema: audit, administratie, energiedata, laadpaal, documentatie.
Zakelijk, modern, betrouwbaar.
Geen stockfoto gevoel.
Resolutie: 1600x900

---


## 8) gebruikte prompts voor de 12 artikelen:

1) nea-inboeken-elektriciteit-red3

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een strakke “document-map” met een subtiel gestileerd netwerk/route-icoon (process flow) als reliëf (embossed), matte 3D. Subtiele accentkleur donkerblauw. Thema: regelgeving, proces, inboeken, audit. Geen tekst, geen iconen-set, geen drukke patronen, geen schreeuwerige gradients, geen stockfoto gevoel. Resolutie 1600x900.

2) nea-inboeken-elektriciteit-particulieren

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een huis-silhouet als minimal matte 3D vorm met daarin een kleine, subtiele kWh-meter (geen cijfers), clean en strak. Accentkleur zacht blauw. Thema: particulier thuisladen, aantoonbaarheid, administratie. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

3) eu-red-iii-90-seconden

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een minimalistische “EU-sterrenring” (abstract, niet letterlijk logo) rondom een dun document-icoon als matte 3D sculptuur. Subtiele accentkleur donkerblauw met heel licht blauwgrijs. Thema: EU-richtlijn, kader, regelgeving. Geen tekst, geen drukke patronen, geen stockfoto gevoel. Resolutie 1600x900.

4) vattenfall-thuisladen-cashback

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een simpele “wallet/kaart” vorm (matte 3D) naast een minimalistische laadstekker, met een subtiele pijl omlaag/terug (cashback-gevoel) als reliëf, niet schreeuwerig. Accentkleur zacht blauw. Thema: marketingactie vs realiteit, thuisladen, keten. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

5) tibber-ere-campagnes

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een minimal “megaphone/announcement” vorm (matte 3D) gecombineerd met een kleine laadstekker, zeer subtiel en clean. Accentkleur donkerblauw. Thema: campagnes, communicatie, zonder belofte. Geen tekst, geen drukke patronen, geen stockfoto gevoel. Resolutie 1600x900.

6) eneco-ere-campagnes

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een minimalistische “speech bubble” (matte 3D) met een klein document-icoon erachter (communicatie + bewijs), strak en rustig. Accentkleur zacht blauwgrijs. Thema: leverancierscommunicatie, claim vs bewijs. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

7) mid-meter-bij-thuisladen

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een strakke, generieke energiemeter (matte 3D) met een subtiele “keurmerk”-rand als vorm (geen letters), clean en technisch. Accentkleur donkerblauw. Thema: meting, MID-context, aantoonbaarheid. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

8) techniek-en-metingen-voor-eres

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een abstracte “data-stack” (3 dunne lagen/tegels) met een heel subtiele grafiek-lijn als reliëf (geen cijfers), matte 3D. Accentkleur zacht blauw. Thema: meetdata, export, herleidbaarheid, audit. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

9) overstap-hbe-naar-ere

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: twee gestileerde “tokens” of “labels” als matte 3D vormen met een pijl ertussen (transitie), zonder letters, zonder logo’s. Accentkleur donkerblauw met neutraal grijs. Thema: overgang, systeemwijziging, context. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

10) eres-a-tot-z

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een nette “woordenboek/boek” vorm (matte 3D) met een subtiele tab-index aan de zijkant, clean. Accentkleur zacht blauw. Thema: uitleg, termen, rollen, misverstanden. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

11) waarde-en-verhandelbaarheid-eres

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een minimalistische “balance scale” of “weegschaal” als matte 3D sculptuur, zeer strak en modern, met een klein token-vormpje op één schaal (zonder letters). Accentkleur donkerblauw. Thema: waarde, markt, kosten, realiteit. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.

12) ev-rijders-laten-waarde-liggen

Prompt:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: een minimal “coin/token” vorm die half achter een simpele document-map schuift (waarde die blijft liggen door administratie), matte 3D, subtiel. Accentkleur zacht blauw. Thema: gemiste waarde, bottleneck bewijs + acceptatie + kosten. Geen tekst, geen drukte, geen stockfoto gevoel. Resolutie 1600x900.


## 9) PROMPS VOOR ANDERE PLAATJES

Eledgibiliy:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs).Eén centraal object: een strak, matte 3D documentpaneel met subtiele horizontale lijnen (als checklist of formulier), waar een eenvoudige geometrische “filter” vorm (transparante cirkel of overlay met zacht blauw accent) gedeeltelijk overheen ligt. De compositie moet suggereren: selectie, toetsing, controle vóór actie. Geen vinkjes, geen tekst, geen icoontjes, geen geldsymbolen.Zacht blauw als enige accentkleur. Geen gradients, geen stockfoto gevoel, geen menselijke elementen.Stijl: high-end SaaS, neutrale infrastructuur, audit-denken.Resolutie: 1600x900.

Contact:
Minimalistisch, professioneel, rustig, veel negatieve ruimte. Lichte achtergrond (off-white of zacht grijs). Eén centraal object: twee strakke matte 3D document-mappen die subtiel in elkaars richting verschoven staan, met daartussen een dunne, geometrische verbindingslijn of subtiel netwerk-element in reliëf (zacht blauw accent). De compositie moet suggereren: overdraagbaarheid, infrastructuur, neutrale tussenlaag. Geen pijlen, geen tekst, geen icoon-set, geen mensen. Matte materialen, zachte schaduw, premium SaaS uitstraling. Accentkleur: donkerblauw of zacht blauw, consistent met huisstijl. Geen drukte, geen gradients, geen stockfoto gevoel. Resolutie: 1600x900.

# EINDE 09_ARTIKEL_STANDAARD
