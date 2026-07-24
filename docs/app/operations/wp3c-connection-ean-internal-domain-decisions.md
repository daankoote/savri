# WP3C Connection/EAN Internal Domain Decisions

DECISION RECORD — WP3C INTERNAL DOMAIN PACKAGE APPROVED — NO DDL AUTHORIZATION

| field | value |
|---|---|
| approved by | Daan |
| approval source | explicit project decision |
| approval scope | WP3C internal decision package A-E |
| implementation status | NOT IMPLEMENTED |
| proof status | NOT PROVEN |
| DDL status | NOT AUTHORIZED |
| external blockers | OPEN |

Dit besluitrecord keurt uitsluitend de interne TARGET-domainregels A-E goed. Het creëert geen `CURRENT PROVEN`-truth, implementeert geen object, valideert geen externe bron of evidencecategorie en autoriseert geen DDL, migration, proof, runtime, frontend, remote actie of deployment.

De requirements en externe bronmappings blijven ongewijzigd. `NEA-EAN-001` tot en met `NEA-EAN-004` blijven leidend binnen de canon. De gecommitte WP3A-audit blijft het bewijs van de conflicterende CURRENT lokale objecten. Het gecommitte WP3B-contract en dispositiondocument blijven de ontwerp- en inventarisbasis die door dit record voor package A-E wordt superseded van voorstel naar approved TARGET.

## Package A — Connection- en EAN-identiteit

Approved TARGET:

- A1. Een fysieke electricity connection en een EAN-dragend allocation point zijn afzonderlijke roots.
- A2. Een geaccepteerde EAN is immutable op de stabiele allocation-pointroot.
- A3. Core EAN-syntax is exact achttien numerieke tekens.
- A4. Er wordt geen checksumvalidatie geclaimd zolang daarvoor geen officiële, aantoonbaar toepasselijke bron bestaat.
- A5. Declared, parsed/observed en externally returned EAN-waarden zijn observations.
- A6. Een observation creëert niet zelfstandig een geaccepteerde allocation-pointroot of accepted EAN.
- A7. Een correctie van een accepted EAN naar een andere EAN herschrijft de bestaande root niet; zij vereist een nieuwe root of expliciete historische relatie volgens een later goedgekeurd correctiecontract.

Package A keurt geen fysieke tabelnaam, external register, evidencecategorie, acceptancemethode of correctie-DDL goed.

## Package B — Location

Approved TARGET:

- B1. Location is een afzonderlijke bounded foundation.
- B2. Location gebruikt een stabiele locationroot, immutable locationversions en afzonderlijke address observations.
- B3. Een adresstring is geen stabiele fysieke location truth.
- B4. Een bestaand `app_dossier_locations`-record wordt niet automatisch het target-locationobject.
- B5. Relocation, adrescorrectie en administratieve adreswijziging moeten historisch reconstrueerbaar blijven.
- B6. Connection-DDL die naar een juridische/fysieke locationversion moet verwijzen blijft geblokkeerd totdat de locationfoundation expliciet is goedgekeurd en bewezen.

Package B keurt de locationfoundation als eerstvolgende bounded context goed, niet haar contract, schema of implementatie.

## Package C — Aangesloteneclaim

Approved TARGET:

- C1. Een aangesloteneclaim verwijst naar exact één allocation point, exact één represented legal party en exact één gepinde person- of organization-profileversion.
- C2. De gesloten claimstatusvocabulary is `asserted`, `connection_confirmed`, `disputed`, `rejected`.
- C3. Alleen een terminale, niet-gesupersede `connection_confirmed`-versie levert operationele aangeslotene-truth.
- C4. Maximaal één operationele aangeslotene bestaat per allocation point per business-time moment.
- C5. Meerdere `asserted` of `disputed` claims mogen naast elkaar bestaan voor review, zolang zij geen operationele truth leveren.
- C6. Correctie naar een andere party maakt een nieuwe claimroot.
- C7. Historische party- en profileversiontruth wordt nooit herschreven door actuele profiel- of registerinformatie.
- C8. `connection_confirmed` bewijst uitsluitend de vastgelegde party-to-allocation-pointrelatie voor de vastgelegde periode.
- C9. `connection_confirmed` bewijst geen authority, mandate, calendar-year exclusivity, charger of MID, kWh, booking eligibility, settlement entitlement of verifier approval.

Package C keurt geen evidencecategorie, reviewbevoegdheid, verifieracceptatie, kolomset, constraintset of DDL goed.

## Package D — Relaties en externe controls

Approved TARGET:

- D1. Een case-to-allocation-point-link is administratief.
- D2. Een case link creëert geen aangeslotene, ownership, authority, mandate, exclusiviteit of eligibility.
- D3. Primary/secondary/direct-line wordt een expliciete, historische, getypeerde relatie.
- D4. Een los `secondary_allocation_point`-label is onvoldoende.
- D5. Onduidelijke secondary/MLOEA-cases zijn voor de MVP `blocked/manual review`.
- D6. Evidence acceptance is een afzonderlijke bounded context en een expliciete menselijke beslissing.
- D7. Upload, parseroutput of external result is niet automatisch accepted evidence.
- D8. Kalenderjaarexclusiviteit is een afzonderlijke control boundary rond party, allocation point/EAN, mandate, inboekdienstverlener en calendar year.
- D9. Kalenderjaarexclusiviteit wordt niet als globale EAN-unique index geïmplementeerd.
- D10. Onopgeloste externe duplicatecontrole blokkeert promotion/booking, maar hoeft historische connectionregistratie niet te verwijderen.

Package D keurt geen casecardinaliteit, external evidence standard, MLOEA-acceptatieregel, duplicateprovider of booking implementation goed.

## Package E — Security, historie en vervanging

Approved TARGET:

- E1. RLS is verplicht.
- E2. Sensitive core tables gebruiken deny-all.
- E3. Er zijn geen `PUBLIC`-, `anon`- of `authenticated`-browserwrites.
- E4. Immutable core truth geeft `service_role` uitsluitend `SELECT` en `INSERT`.
- E5. `UPDATE` en `DELETE` zijn niet toegestaan op immutable roots en versions.
- E6. Correctie gebeurt append-only door supersession of een nieuwe claimroot.
- E7. Supersession is lineair: maximaal één directe successor, geen cycles, latere `recorded_at` en behoud van claimidentity waar dezelfde claim wordt gereviseerd.
- E8. Business validity en recorded time blijven gescheiden.
- E9. Half-open `[valid_from, valid_to)`-perioden worden gebruikt.
- E10. Touching boundaries zijn toegestaan en overlappen niet.
- E11. Transaction-end-validatie bewaakt cross-row invarianten.
- E12. Deterministische advisory locking voorkomt write-skew.
- E13. Latere proofs bevatten echte concurrerende transacties.
- E14. De bestaande tabellen, guards, triggers, RPC’s, mutable rows en `UPDATE`-grants worden forward-only vervangen.
- E15. Geen drop of retirement vindt plaats vóór een approved replacement contract, replacement migration, groene lokale proof, dependency- en callerproof, rowcount- en data-integriteitsbewijs, rollbackplan, remote inventory en expliciete uitvoeringsgoedkeuring.

Package E keurt de `REPLACE`-richting als TARGET goed. Retirement execution, cleanup, migration, proofwijziging en remote inventory-uitvoering zijn niet goedgekeurd. Alle huidige objecten en bronnen blijven intact.

## Open externe blockers

De volgende blockers zijn door WP3C niet opgelost en worden niet geconverteerd naar interne defaults:

- locationfoundation implementatie;
- CAR/DSO/registerbron;
- evidencecategorieën en accepted-evidencebesluit;
- evidence freshness;
- conflicterende externe bronnen;
- secondary/MLOEA-acceptatieregels;
- kalenderjaar-duplicatebron en fallback;
- verifieracceptatie;
- representation authority;
- mandatevalidatie;
- booking eligibility.

Alleen de reeds goedgekeurde conservatieve regels blijven gelden: onduidelijke secondary/MLOEA-cases zijn blocked/manual review en onopgeloste externe duplicatecontrole blokkeert promotion/booking zonder historische connectionregistratie automatisch te verwijderen.

## Vervolgvolgorde

1. Eerstvolgende bounded context: locationfoundation-contract en readiness, zonder automatische schema-authorisatie.
2. Pas na expliciete locationgoedkeuring en bewijs: een beperkte connection root/claim DDL-readinesscheck.
3. Iedere migration, proof, lokale apply, runtime, customer projection, remote actie en deployment vereist een eigen expliciete batch.
4. Representation-authorityvalidatie loopt onafhankelijk extern en creëert geen connection- of aangeslotene-truth.

## Non-mutation record

Deze besluitbatch wijzigt geen schema, migration, proof, SQL, databaseobject, RPC, Edge Function, runtime, frontend, CSS, configuratie of remote state. De bestaande WP3A-audit, het party/casecontract, requirements, completeness audit en MVP-plan blijven ongewijzigd.
