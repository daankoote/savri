# Connection, EAN And Aangeslotene Contract

DRAFT — WP3B DOMAIN RECONCILIATION — NOT APPROVED / NOT DDL READY

Dit document is het docs-only WP3B-besluitvoorstel voor connection-, allocatiepunt-, EAN- en aangeslotene-truth. Het is geen juridische interpretatie, contractgoedkeuring, DDL-specificatie, implementatiebewijs of toestemming voor schema-, runtime-, provider-, remote- of deploywerk.

De bronvolgorde uit `00_CANON.md` blijft leidend. Dit voorstel gebruikt uitsluitend de aantoonbare mappings `NEA-ORG-006`, `NEA-EAN-001` tot en met `NEA-EAN-004`, `NEA-MAND-002` tot en met `NEA-MAND-005`, `NEA-AUD-002`, `NEA-COR-001`, `NEA-RET-001` en `NEA-SEC-001/002`. De officiële TKV-snapshot is lokaal aanwezig met SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`. Dit contract voegt geen juridische uitleg toe aan die bronnen.

## A. Harde domeingrenzen

- Auth identity is geen connection truth.
- `app_customers` is geen juridische aangeslotene.
- Een customer-party relationship is geen aangeslotene.
- `service_recipient` of `case_contact` is geen aangeslotene.
- Representation authority is geen aangeslotene.
- Een mandate is geen aangeslotene.
- Connection ownership bewijst geen representation authority of mandate.
- Een upload is geen accepted evidence.
- Parseroutput blijft observed/derived en kan geen accepted EAN, aangeslotene of operationele connection truth creëren.
- Charger/MID en kWh zijn afzonderlijke bounded contexts.
- Settlement entitlement volgt nooit automatisch uit connection truth.
- Een case link, adresmatch, handtekening, Auth-account, contactrol, customerrelatie, legal acceptance of vrij tekstveld creëert geen van deze truths.

## B. Voorgestelde TARGET-verantwoordelijkheden

De volgende namen zijn uitsluitend niet-goedgekeurde voorstellen. Zij zijn geen schema-authorisatie en definiëren geen kolommen of constraints.

| voorgestelde verantwoordelijkheid | niet-goedgekeurde kandidaatnaam | begrensde TARGET-verantwoordelijkheid |
|---|---|---|
| fysieke elektriciteitsaansluiting | `app_electricity_connections` | Stabiele identiteit van één fysieke aansluiting en haar historiseerbare relatie met een goedgekeurde stabiele locationroot; geen EAN-, aangeslotene-, mandate-, charger-, kWh- of eligibility-engine. |
| EAN-dragend allocatiepunt | `app_allocation_points` | Stabiele externe allocatiepuntroot waarvan een geaccepteerde EAN de voorgestelde immutable identiteit is; declared, parsed of observed waarden creëren deze root niet. |
| allocatiepuntmetadata over tijd en primary/secondary/direct-line-relatie | `app_allocation_point_versions` | Immutable versies van period-bound netwerk-/constructmetadata en de bewuste historische relatie met een primary connection/point; geen accepted-evidencebesluit in de versie zelf. |
| stabiele aangesloteneclaim | `app_allocation_point_party_claims` | Eén claimroot tussen één allocation point en één represented legal party; geen authority, mandate, account ownership, case role of financieel recht. |
| immutable aangesloteneclaimversie | `app_allocation_point_party_claim_versions` | Period-bound, profile-version-pinned, provenanced en supersedeerbare claim- en beslistruth. |
| case-to-allocation-point-link | `app_case_allocation_points` | Historiseerbare administratieve koppeling waardoor een case een allocation point kan gebruiken zonder het te bezitten of andere domeintruth te creëren. |

External/manual source observations blijven een afzonderlijke observation/provenance-verantwoordelijkheid. Evidence artifacts, reviews en accepted/rejected evidence decisions blijven een afzonderlijke toekomstige evidence-module. Kalenderjaarexclusiviteitscontrole blijft een afzonderlijke toekomstige mandate/controlmodule. Er komt geen generieke ownership-, role-, evidence- of EAV-engine.

## C. EAN-semantiek

Aanbevolen TARGET-besluiten, allemaal onder voorbehoud van Daan-goedkeuring:

1. EAN-syntax is exact 18 numerieke tekens. Dit contract doet geen checksumclaim en leidt geen registergeldigheid uit syntax af.
2. Een `declared EAN` is door een actor aangeleverde, nog niet geaccepteerde data.
3. Een `observed EAN` is uit een artifact, parser of handmatige observatie afkomstige data.
4. Een `externally returned EAN` is een immutable, provenanced resultaat van een externe of gecontroleerde handmatige bron, inclusief bronversie, retrieval time en freshness.
5. Een `accepted EAN` ontstaat uitsluitend door een expliciete acceptancebeslissing op gekende bronnen en conflicten. Declared, parsed of merely observed EAN creëert geen core allocation-pointroot.
6. De geaccepteerde EAN is voorgesteld als immutable externe identiteit op de stabiele allocation-pointroot.
7. Correctie van een foutief gedeclareerde EAN vóór acceptance corrigeert de claim/observation history en creëert nog geen root.
8. Correctie van een reeds geaccepteerde EAN naar een andere EAN creëert een nieuwe allocation-pointroot en een expliciete replacement/relationship; de historische root wordt niet herschreven.
9. Duplicate detection controleert syntactische normalisatie, bestaande accepted roots, actieve acceptancebesluiten en externe/manual conflictresultaten. Alleen syntactische gelijkheid is geen bewijs dat twee fysieke situaties gelijk zijn.
10. EAN-reuse, externe heruitgifte of een echte EAN-wijziging wordt niet verondersteld. Een dergelijke situatie blijft conflict/manual review totdat de gezaghebbende bron en relatie schriftelijk zijn vastgesteld.
11. Afwijkende bronnen worden als conflict gekoppeld; een actuele externe response overschrijft geen eerdere observation, decision of historical reliance.
12. Historische reconstructie bewaart declared, observed, externally returned en accepted waarden met hun eigen tijd, bron, artifact/version/hash en besluit.

Dit is een besluitvoorstel, geen goedgekeurde waarheid.

## D. Connection en location

Aanbevolen TARGET-relatie:

- de fysieke connection is een afzonderlijke stabiele root;
- een stabiele locationroot vertegenwoordigt de fysieke locatie, niet een adresstring;
- iedere juridisch of operationeel relevante relatie pint waar nodig de exacte historische locationversion;
- een address observation is brondata en kan een locationversion ondersteunen of tegenspreken, maar is niet zelf stabiele location truth;
- een allocation point draagt de EAN-identiteit en relateert historisch aan de fysieke connection/location;
- relocation, adrescorrectie en administratieve adreswijziging krijgen nieuwe historiseerbare relaties of versions en herschrijven geen eerdere reliance.

`app_dossier_locations` is niet automatisch het target-locationmodel. Het blijft een dossiergebonden snapshot met bruikbare normalizationvelden, maar niet de goedgekeurde stabiele fysieke locationroot.

De locationdependency blokkeert WP3B-DDL voor `app_electricity_connections` en iedere allocation-pointversion die een fysieke location/version moet vastleggen. Een afzonderlijk goedgekeurde locationfoundation, inclusief stabiele root, versionsemantiek en correctierelaties, is eerst nodig. Een uitsluitend EAN-dragende allocation-pointroot zou technisch apart kunnen worden ontworpen, maar wordt in deze batch niet los geautoriseerd omdat acceptance-, duplicate- en replacementbesluiten eveneens openstaan.

## E. Aangesloteneclaim

Aanbevolen TARGET-besluiten:

- de claim verwijst naar de represented legal party uit WP2A, nooit rechtstreeks naar een Auth identity, account, customer, dossier of case role;
- iedere claimversie pint exact één passende person- of organization-profileversion van die party;
- een stabiele claimroot identificeert één party-to-allocation-point-claim;
- claimversies zijn immutable en append-only;
- business validity gebruikt `valid_from` en optioneel `valid_to`;
- `recorded_at` is afzonderlijke recorded time;
- source class/reference, request ID, actor en decisionmetadata zijn verplicht waar van toepassing;
- supersession is expliciet en lineair;
- dispute en rejection blijven zichtbaar en kunnen geen operationele truth leveren;
- correctie naar een andere party sluit of betwist de oude claim en start een nieuwe claimroot; de party wordt nooit binnen dezelfde chain vervangen.

Voorgestelde gesloten statusvocabulary ter beoordeling:

- `asserted`
- `connection_confirmed`
- `disputed`
- `rejected`

Alleen een terminale, niet-gesupersede `connection_confirmed`-versie mag operationele aangeslotene-truth leveren. `asserted`, `disputed` en `rejected` zijn niet-operationeel.

`connection_confirmed` bewijst uitsluitend de party-to-allocation-point-relatie voor de vastgelegde periode. Het bewijst geen authority, mandate, kalenderjaarexclusiviteit, charger/MID, kWh, booking eligibility, settlement entitlement of verifier approval.

## F. Tijd, overlap en concurrency

Aanbevolen TARGET-regels:

- business validity is half-open: `[valid_from, valid_to)`;
- null `valid_to` is onbegrensd;
- touching boundaries zijn toegestaan;
- retroactieve registratie is toegestaan wanneer oorspronkelijke business validity, actuele `recorded_at`, bron, actor, request, reden en decision time bewaard blijven;
- per allocation point bestaat per moment maximaal één operationele `connection_confirmed` aangeslotene;
- meerdere historische aangeslotenen over niet-overlappende perioden zijn toegestaan;
- competing `asserted` en `disputed` claims mogen naast elkaar bestaan wanneer zij expliciet als conflict zijn gekoppeld en geen operationele truth leveren;
- een inhoudelijk gelijke same-party duplicate claim voor hetzelfde point en interval wordt idempotent herkend of afgewezen; een nieuwe bronobservatie hoort niet via duplicatie van core claim truth te worden opgeslagen;
- iedere versionchain heeft exact één root, maximaal één directe successor, geen cycles, toenemende `recorded_at` en ongewijzigde root/scope-identiteit;
- wrong-party correction gebruikt een nieuwe claimroot;
- operationele overlap en chainvaliditeit worden aan het einde van de transactie gecontroleerd;
- writes op dezelfde allocation-pointbusinesskey gebruiken een deterministic advisory transaction lock om write-skew te voorkomen;
- een latere proof bevat echte gelijktijdige transacties, niet alleen sequentiële overlaptests.

De tijdsdimensies blijven afzonderlijk:

| tijd | betekenis |
|---|---|
| business validity | periode waarin de connection-, allocation- of partyrelatie in de werkelijkheid geldt |
| recording time | wanneer ENVAL de immutable row vastlegde |
| evidence validity | periode/freshness waarin een artifact of externe bron bruikbaar is |
| decision time | wanneer een bevoegde reviewer een expliciet besluit nam |
| calendar-year controls | mandate- en inboekdienstverlenerexclusiviteit per volledig kalenderjaar |

## G. Primary en secondary allocation points

- `secondary_allocation_point` als los label is onvoldoende.
- Een secondary point moet bewust, historiseerbaar en period-bound aan een primary physical connection en/of primary allocation point worden gekoppeld.
- Relationship type en geldigheidsperiode zijn afzonderlijke historische metadata.
- Eligibility volgt nooit automatisch uit deze relatie.
- Exacte evidence en een expliciet reviewerbesluit blijven noodzakelijk.
- De exacte MLOEA-/secondary-acceptatieregels blijven `BLOCKED — EXTERNAL` zolang de gemapte bronnen de toegestane constructen, relatie en evidence niet volledig bepalen.

Conservatieve MVP-default: ieder onduidelijk secondary-allocationgeval is blocked/manual review. Het krijgt geen automatische promotion of booking eligibility.

## H. Kalenderjaarexclusiviteit

- `NEA-EAN-004` is geen globale active-EAN uniqueness.
- Connection/allocation-point identity en inboekdienstverlenerexclusiviteit zijn verschillende concerns.
- De exclusiviteitscontrole hoort bij party + allocation point/EAN + mandate + inboekdienstverlener + calendar year.
- Externe duplicatecontrole of een gecontroleerde manual fallback blijft noodzakelijk.
- Een lokale unique index kan externe dubbele machtiging of inboeking niet bewijzen.
- Een unresolved duplicatecontrole blokkeert promotion/booking voor het betrokken kalenderjaar, maar hoeft historische connectionregistratie niet te blokkeren.
- Connection truth creëert geen mandate en een mandate creëert geen connection truth.

## I. Evidence en provenance

De volgende lagen blijven afzonderlijk:

1. declared fact;
2. observed fact;
3. external result;
4. evidence artifact en exacte version;
5. evidence review;
6. accepted/rejected evidence decision;
7. operational connection/party truth.

Het aanbevolen contract vereist waar relevant:

- source type/class en source reference;
- retrieval time en issue time;
- artifact ID, exact version en content hash;
- actor en request ID;
- decision time en decision reason;
- freshness/expiry;
- supports, contradicts, insufficient, supersedes of revokes conflictlinks;
- expliciete historical reliance op de gebruikte source/evidence/decisionversies.

Raw providerpayload hoort niet in core connection-, allocation-point- of claimrows. Het blijft in een afzonderlijk afgeschermd source/evidence-object onder een eigen retention- en toegangscontract.

## J. Casekoppeling

- Cases mogen allocation points gebruiken zonder ze te bezitten.
- Eén allocation point mag historisch of gelijktijdig in meerdere administratieve cases voorkomen wanneer de caseproductregels dat toestaan.
- Een case link creëert geen aangeslotene, authority, mandate of kalenderjaarexclusiviteit.
- Een case link verwijst naar stabiele IDs en, wanneer een beslissing historische metadata gebruikt, naar de exact gebruikte versions.
- Removal of beëindiging van een case link verwijdert geen connection-, allocation-point- of aangeslotenehistorie.

Aanbevolen MVP-cardinaliteit: many-to-many tussen case en allocation point, met maximaal één niet-gesupersede overlappende link voor dezelfde case/point/link-purpose-combinatie. Open productbesluiten zijn: of een case precies één primary point moet hebben, welke link purposes zijn toegestaan, of dezelfde point tegelijk in meerdere actieve cases mag voorkomen en welke exact gepinde metadata/evidence een casebesluit vereist.

## K. Security

Aanbevolen contractgrens:

- RLS enabled op iedere core tabel;
- deny-all policies;
- geen `PUBLIC`, `anon` of `authenticated` tabelwrites;
- immutable truth krijgt voor `service_role` uitsluitend `SELECT` en `INSERT`;
- geen `UPDATE` of `DELETE` op immutable roots/versions tenzij een later afzonderlijk mutable projectionobject aantoonbaar nodig is;
- geen browserwrites;
- een customer-safe projection is later werk en geeft geen raw evidence, reviewmetadata of interne conflictinformatie vrij;
- `SECURITY DEFINER` wordt alleen gebruikt wanneer een bewezen transactionele invariant dit vereist;
- iedere definerfunctie heeft een veilige expliciete `search_path` en minimale executegrants;
- directe service-role writes mogen een transactionele invariant niet omzeilen.

## L. Daan-besluitmatrix

Geen rij in deze matrix is al goedgekeurd.

| besluit-ID | onderwerp | CURRENT truth | aanbevolen TARGET-besluit | alternatief | risico | externe validatie nodig | Daan-goedkeuring nodig | blokkeert contract | blokkeert DDL | voorgestelde proof |
|---|---|---|---|---|---|---|---|---|---|---|
| WP3B-D01 | connection versus allocation-pointroot | één `app_connections`-row mengt EAN, type, account/dossier/location en status | fysieke connection en EAN-dragend allocation point zijn gescheiden roots | één gecombineerde root | constructen en historie blijven ambigu | ja, DSO/verifier | ja | ja | ja | root-/relationshipinventaris en negatieve cross-contexttests |
| WP3B-D02 | accepted-EAN-immutability | status-based mutable connectionrow | accepted EAN is immutable op allocation-pointroot | versioned EAN op dezelfde root | historische identiteit kan worden herschreven | ja, DSO/register | ja | ja | ja | accepted-root correction/replacement/historyproof |
| WP3B-D03 | EAN syntax/checksum | exact 18 digits; geen checksumbron | exact 18 digits, expliciet geen checksumclaim | later bewezen checksum | ongefundeerde registry claim | ja | ja | nee | ja | syntax en no-auto-accept tests |
| WP3B-D04 | locationdependency | dossier-location FK | afzonderlijke stable locationroot en exact historical version; dependency blokkeert fysieke connection-DDL | dossier snapshot behouden | relocation/adrescorrectie herschrijft truth | mogelijk adresbron | ja | ja | ja | relocation/correction/reliance proof |
| WP3B-D05 | claimstatusvocabulary | declared/under_review/verified/rejected/superseded | asserted/connection_confirmed/disputed/rejected | andere gesloten vocabulary | operationele truth blijft onduidelijk | verifier | ja | ja | ja | closed-vocabulary en operational-state tests |
| WP3B-D06 | profile-versionpinning | customer/dossier, geen party profile | exact één passende WP2A profileversion per claimversie | alleen partyroot | latere profielwijziging herschrijft historische reliance | nee | ja | ja | ja | later-profile-stability proof |
| WP3B-D07 | operationele truth | non-rejected ownershipclaim | alleen terminale niet-gesupersede connection_confirmed version | actuele pointer/status | asserted data kan operationeel worden | verifier | ja | ja | ja | state filtering en supersessionproof |
| WP3B-D08 | maximaal één aangeslotene per point/time | nonterminal overlapguard op accountclaim | maximaal één operationele confirmed party per allocation point per moment | meerdere confirmed claims | conflicterende juridische truth | ja | ja | ja | ja | temporal en concurrent overlap proof |
| WP3B-D09 | competing claims | overlap grotendeels geweigerd | asserted/disputed conflicts toegestaan maar niet operationeel en expliciet gekoppeld | alle overlap weigeren | conflictgeschiedenis verdwijnt of blokkeert intake | verifier | ja | ja | ja | competing-claim/conflict/no-operation tests |
| WP3B-D10 | wrong-party correction | ambigu supersede-row | oude claim sluiten/betwisten; nieuwe party krijgt nieuwe claimroot | party binnen chain wijzigen | chain identity en audit worden vals | nee | ja | ja | ja | atomic close/new-root en scope-preservation proof |
| WP3B-D11 | primary/secondary relationship | los enumlabel | expliciete historiseerbare relation met manual-review default | label behouden | `NEA-EAN-003` wordt onterecht voldaan verklaard | ja, MLOEA/verifier | ja | ja | ja | relation/evidence/negative eligibility proof |
| WP3B-D12 | case cardinaliteit | geen case link | many-to-many historische link; geen ownership/inference | één point per case | toekomstige dossiers worden kunstmatig beperkt | product | ja | ja | ja | cardinality, version pin en no-inference proof |
| WP3B-D13 | external evidence acceptance | vrije source refs | externe result, artifact/version, review en acceptance afzonderlijk | bronlabel als truth | stale/conflicting evidence wordt core truth | ja, DSO/verifier | ja | ja | ja | freshness/conflict/no-parser-promotion proof |
| WP3B-D14 | kalenderjaarexclusiviteit | globale active-EAN unique index | afzonderlijke party+point/EAN+mandate+IDV+year control met external/manual check | lokale index | externe dubbele machtiging blijft onzichtbaar | ja | ja | ja | ja | year boundary, duplicate source en fail-closed proof |
| WP3B-D15 | security/grants | RLS deny-all; service role SELECT/INSERT/UPDATE | immutable core: RLS deny-all en service role SELECT/INSERT only | mutable rows/RPC-only discipline | silent overwrite of bypass via direct service writes | nee | ja | nee | ja | exact grants, immutability en bypass tests |
| WP3B-D16 | supersession/concurrency | mutable rows, nonlocking direct triggers, ambiguous successors | immutable linear chain, one successor, deferred checks en deterministic point lock | application-only locking | race/write-skew en meerdere current truths | nee | ja | ja | ja | two-transaction race, cycle en successor proof |
| WP3B-D17 | oude objectdispositie | drie lege lokale tabellen en oude RPCs buiten migration history | forward-only replacement; niets verwijderen vóór alle replacementgates | in-place repair of directe drop | audit/rollback/source provenance verloren | nee | ja | ja | ja | rowcount/caller/rollback/catalog parity/cleanup proof |

## M. Contractverdict

PARTIAL — DOMAIN OR EXTERNAL DECISIONS REQUIRED

### Exacte besluiten die Daan moet nemen

1. WP3B-D01: separate fysieke connection- en allocation-pointroots.
2. WP3B-D02: accepted-EAN-immutability en new-root correction.
3. WP3B-D03: 18-digit syntax zonder checksumclaim.
4. WP3B-D04: locationfoundation als dependency en historische versionpinning.
5. WP3B-D05: de vier claimstatuswaarden.
6. WP3B-D06: verplichte party profile-versionpinning.
7. WP3B-D07: uitsluitend terminale niet-gesupersede `connection_confirmed` operationele truth.
8. WP3B-D08: maximaal één operationele aangeslotene per allocation point per moment.
9. WP3B-D09: competing asserted/disputed claims zonder operationele werking.
10. WP3B-D10: wrong-party correction via een nieuwe claimroot.
11. WP3B-D11: expliciete primary/secondaryrelatie en fail-closed MVP-default.
12. WP3B-D12: many-to-many casecardinaliteit en de nog open productkeuzes.
13. WP3B-D13: afzonderlijke external result, artifact/version, review en acceptance.
14. WP3B-D14: afzonderlijke kalenderjaarexclusiviteitscontrol.
15. WP3B-D15: immutable grants en geen directe mutable history.
16. WP3B-D16: lineaire supersession, transaction-end checks en deterministic locking.
17. WP3B-D17: forward-only replacement van de huidige objecten.

### Externe blockers

- gezaghebbende DSO/CAR/registerbron, toegangsroute, resultsemantiek, freshness en accepted-evidencevorm;
- schriftelijke bevestiging van EAN-reuse/change/correctiongedrag wanneer dit voor rootidentiteit nodig is;
- exacte MLOEA-/secondary-allocation-pointrelatie en acceptatie-evidence;
- externe duplicatebron of gecontroleerde manual fallback voor `NEA-EAN-004`;
- verifieracceptatie van aangeslotene-, connection-, location- en conflictbewijs;
- de al bekende afzonderlijke consolidated-law- en verifierdependencies uit de canon;
- representation-authorityvalidatie loopt onafhankelijk en kan geen aangeslotene- of connectionbesluit vervangen.

### Implementation dependencies

- expliciete Daan-goedkeuring van de bovenstaande contractbesluiten;
- een afzonderlijk goedgekeurde locationfoundation voor fysieke connection/location truth;
- WP2A party/profileversiontruth blijft de partybasis;
- een afzonderlijk evidence acceptance contract;
- een afzonderlijk mandate/calendar-year control contract;
- provider-independent external/manual source contracts;
- goedgekeurde forward-only replacement-, data-, caller-, rollback- en auditstrategie.

### Kleinste latere DDL-batch

Pas na alle voor die scope relevante besluiten is de kleinste kandidaat een additive, immutable allocation-point- en aangesloteneclaimfoundation met uitsluitend de niet-goedgekeurde kandidaten `app_allocation_points`, `app_allocation_point_versions`, `app_allocation_point_party_claims` en `app_allocation_point_party_claim_versions`, plus één geïsoleerde lokale proof. `app_electricity_connections` blijft buiten die batch zolang de locationfoundation niet is goedgekeurd. `app_case_allocation_points` blijft buiten die batch totdat de casecardinaliteit en versionpinning expliciet zijn goedgekeurd. Dit voorstel is geen DDL-authorisatie.

### Hard exclusions

- Auth-schema, account/customer-hermodellering en representation authority;
- mandates, signed-mandate lifecycle en kalenderjaarexclusiviteitsimplementatie;
- evidence acceptance, raw providerpayload en provideradapters;
- charger/MID, kWh, eligibility, booking/REV en verifierbeslissingen;
- settlement/payout;
- backfill, cutover, drop/cleanup van bestaande objecten;
- RPC, Edge Function, runtime, frontend, UI of CSS;
- remote apply, deploy of productie.
