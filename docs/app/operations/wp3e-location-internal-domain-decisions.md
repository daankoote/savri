# WP3E Location Internal Domain Decisions

DECISION RECORD — WP3E INTERNAL LOCATION DOMAIN PACKAGE APPROVED — NO DDL AUTHORIZATION

| field | value |
|---|---|
| approved by | Daan |
| approval source | explicit project decision |
| approval scope | WP3E internal location domain package 1–16 |
| implementation status | NOT IMPLEMENTED |
| proof status | NOT PROVEN |
| DDL status | NOT AUTHORIZED |
| data migration status | NOT AUTHORIZED |
| retirement status | NOT AUTHORIZED |
| external blockers | OPEN |

Dit besluitrecord keurt uitsluitend de interne TARGET-domainregels
`WP3E-LOC-01` tot en met `WP3E-LOC-16` goed. Het creëert geen `CURRENT
PROVEN`-truth, implementatieclaim, proofclaim of externe-validatieclaim en
autoriseert geen DDL, datamigratie, retirement, runtime, frontend, CSS, remote
actie of deployment.

De gecommitte WP3D-audit blijft het bewijs van de conflicterende CURRENT
locationlaag en de 44 bestaande locationrows. De bestaande kandidaattabelnamen
in `contracts/location-foundation.md` blijven niet-goedgekeurde
implementatienamen. Dit record keurt domeinverantwoordelijkheden en invarianten
goed, geen tabel, kolom, constraint, trigger, functie, policy, grant, RPC of
migration.

## Goedgekeurde besluiten

### WP3E-LOC-01

`location_id` is opaque, server-assigned en wordt niet afgeleid van adres,
postcode, BAG, PDOK, coördinaten, party, case, aansluiting, allocation point of
EAN.

### WP3E-LOC-02

De locationroot is statusloos en bevat geen mutable adres-, customer-, party-,
case-, ownership-, occupancy-, connection-, eligibility- of settlementvelden.

### WP3E-LOC-03

Adres- en relevante fysieke locatiesnapshots worden vastgelegd in immutable
locationversions.

### WP3E-LOC-04

Alleen een expliciet geaccepteerde, niet-gesupersede locationversion mag
operationele location truth leveren.

Acceptance vereist traceerbare actor-, request-, source-, evidence-, decision-
en tijdmetadata. Een observation alleen is onvoldoende.

### WP3E-LOC-05

Maximaal één operationele locationversion bestaat per locationroot per
business-time moment.

### WP3E-LOC-06

Customer-declared, parsed, PDOK-returned, BAG-returned, provider- en manual
observations creëren niet automatisch een accepted version.

### WP3E-LOC-07

Een administratieve adrescorrectie of gewijzigde adresregistratie kan binnen
dezelfde fysieke locationroot worden vastgelegd.

Een aantoonbare verhuizing naar een andere werkelijke fysieke
leverings-/laadsite vereist een nieuwe locationroot.

Postcode-, straatnaam-, huisnummer-, BAG- of PDOK-wijziging bepaalt dit nooit
zelfstandig. Classificatie vereist bewijs en een expliciet besluit.

### WP3E-LOC-08

Fysieke split en merge worden als expliciete historische relaties vastgelegd.
Zij herschrijven of combineren geen historische roots stilzwijgend.

### WP3E-LOC-09

Business validity en recording time blijven afzonderlijk.

### WP3E-LOC-10

Businessperioden zijn half-open `[valid_from, valid_to)`. Touching boundaries
zijn toegestaan en vormen geen overlap.

### WP3E-LOC-11

Supersession is lineair:

- maximaal één directe successor;
- geen cycles;
- latere `recorded_at`;
- behoud van historische versies;
- correctiereden verplicht.

### WP3E-LOC-12

Case-to-location-, allocation-point-to-location- en toekomstige
charge-point-to-locationrelaties zijn afzonderlijke, expliciete en waar nodig
tijdgebonden relationele objecten.

### WP3E-LOC-13

De locationfoundation bevat geen generieke owner-, occupant-, resident-,
operator- of party-role-engine.

Een party-locationrelatie wordt alleen later toegevoegd voor een afzonderlijk
goedgekeurde businessbetekenis.

### WP3E-LOC-14

Location truth bewijst niet:

- ownership;
- occupancy;
- aangeslotene;
- authority;
- mandate;
- accepted EAN;
- Article 10-construct;
- MID;
- kWh;
- booking eligibility;
- settlement entitlement;
- verifier approval.

### WP3E-LOC-15

Interne core locationtabellen gebruiken:

- RLS enabled;
- deny-all;
- geen `PUBLIC`-, `anon`- of `authenticated`-browserwrites;
- voor immutable roots/versions service_role alleen `SELECT` en `INSERT`;
- geen `UPDATE` of `DELETE` op immutable history;
- append-only correcties;
- customer-safe projection later.

Deze technische keuzes zijn ENVAL-interne controls en mogen niet als
letterlijke NEa-databasevoorschriften worden beschreven.

### WP3E-LOC-16

De huidige locationlaag wordt additive en forward-only vervangen.

Geen retirement, drop, destructive remap of calleromschakeling vóór:

- approved replacement contract;
- replacement migration;
- groene lokale proof;
- source-to-catalog provenance;
- expliciete mapping van alle 44 bestaande locationrows;
- charger-, document-, connection- en callerimpactanalyse;
- conflict-/merge-/splitqueue;
- rowcount- en data-integriteitsbewijs;
- rollbackplan;
- remote inventory;
- privacy- en retentionbesluit;
- expliciete uitvoeringsgoedkeuring.

## TKV Alignment Guard

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

- Stable roots, immutable versions, RLS en grants zijn interne ENVAL-controls.
- Zij ondersteunen reconstructie maar bewijzen geen TKV-acceptatie.
- Location acceptance vervangt geen controle van aansluiting, allocation point,
  bemeterd leverpunt, meter, aangeslotene, directe lijn, opwek op hetzelfde
  adres of Article 10-construct.
- Bezochte locaties, veranderingen, bronnen en besluiten moeten afzonderlijk
  reconstrueerbaar blijven.
- Gegevens die onderdeel zijn van verificatiebewijs moeten gedurende de
  toepasselijke termijn beschikbaar blijven.
- Het TKV vereist voor verificatiegegevens minimaal vijf jaar na afloop van het
  kalenderjaar waarin de verificatie is verricht.
- Exacte ENVAL-retentie en privacy-minimalisatie blijven een afzonderlijk goed
  te keuren contract.

De alignment betreft TKV 3.0.4–3.0.5, 3.1.3–3.1.5 en 3.3.2–3.3.4. Het TKV
vereist een volledig, overzichtelijk en reconstrueerbaar verificatiedossier,
bewaring van verificatiegegevens, herbeoordeling van fysieke situaties en
veranderingen, risicogestuurde locatiebezoeken en reconstructie van
werkzaamheden, conclusies, bezochte locaties en geraadpleegde registers. Het
TKV schrijft niet de interne ENVAL-tabelstructuur voor en keurt deze niet goed.

## Open Externe Blockers

De volgende blockers blijven afzonderlijk `OPEN`:

- PDOK/BAG broncontract en freshness;
- betrouwbare physical-site matching;
- verifieracceptatie van locationbewijs;
- DSO/CAR-semantiek;
- primary/secondary/MLOEA;
- location-visitprocedure en bewijs;
- evidencecategorieën en acceptance;
- privacy/minimalisatie;
- retentie buiten de expliciete TKV-minimumgrens;
- datamapping van de 44 current rows;
- remote catalogus en callertruth.

Geen providerresultaat, adresgelijkheid of huidige rij wordt door dit besluit
automatisch geaccepteerd, samengevoegd of gemigreerd.

## Toekomstige Proofscenario's

Een later afzonderlijk goedgekeurde implementatieproof omvat minimaal:

- root zonder mutable adresvelden;
- observation creëert geen accepted version;
- same-site address correction;
- physical relocation creëert nieuwe root;
- split en merge behouden historie;
- maximaal één operationele version per root/time;
- touching intervals;
- overlap reject;
- lineaire supersession;
- cycle reject;
- concurrent creation/correction;
- geen browsergrants;
- geen ownership/mandate/eligibility inference;
- 44-row migrationmapping en protected-history proof.

Deze scenario's zijn toekomstige acceptance targets. Er is in WP3E geen
migration of proof gemaakt of uitgevoerd.

## Vervolggrens

De approved TARGET-locationfoundation moet eerst worden vertaald naar een later
expliciet goedgekeurd exact replacementcontract en daarna in een afzonderlijk
geautoriseerde additive migration/proofbatch worden geïmplementeerd en bewezen.
Connection-DDL blijft afhankelijk van een bewezen locationfoundation. WP3E
autoriseert geen location- of connection-DDL, datamigratie, calleromschakeling,
retirement of remote actie.
