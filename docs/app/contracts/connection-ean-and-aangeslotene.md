# Connection, EAN And Aangeslotene Contract

TARGET — WP3C INTERNAL DOMAIN DECISIONS APPROVED — EXTERNAL BLOCKERS OPEN / NOT DDL READY

Dit document is het connection-, allocatiepunt-, EAN- en aangeslotenecontract. Daan heeft via `operations/wp3c-connection-ean-internal-domain-decisions.md` uitsluitend internal decision package A-E als TARGET goedgekeurd. Die goedkeuring is geen juridische interpretatie, externe validatie, DDL-specificatie, implementatiebewijs of toestemming voor schema-, runtime-, provider-, remote- of deploywerk.

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

## B. Approved TARGET-verantwoordelijkheden en niet-goedgekeurde namen

De gescheiden verantwoordelijkheden voor physical connection, allocation point, metadata/history, aangesloteneclaim en administratieve case link zijn approved TARGET onder package A-D. De volgende fysieke namen blijven uitsluitend niet-goedgekeurde voorstellen. Zij zijn geen schema-authorisatie en definiëren geen kolommen of constraints.

| voorgestelde verantwoordelijkheid | niet-goedgekeurde kandidaatnaam | begrensde TARGET-verantwoordelijkheid |
|---|---|---|
| fysieke elektriciteitsaansluiting | `app_electricity_connections` | Stabiele identiteit van één fysieke aansluiting en haar historiseerbare relatie met een goedgekeurde stabiele locationroot; geen EAN-, aangeslotene-, mandate-, charger-, kWh- of eligibility-engine. |
| EAN-dragend allocatiepunt | `app_allocation_points` | Stabiele externe allocatiepuntroot waarvan een geaccepteerde EAN de voorgestelde immutable identiteit is; declared, parsed of observed waarden creëren deze root niet. |
| allocatiepuntmetadata over tijd en primary/secondary/direct-line-relatie | `app_allocation_point_versions` | Immutable versies van period-bound netwerk-/constructmetadata en de bewuste historische relatie met een primary connection/point; geen accepted-evidencebesluit in de versie zelf. |
| stabiele aangesloteneclaim | `app_allocation_point_party_claims` | Eén claimroot tussen één allocation point en één represented legal party; geen authority, mandate, account ownership, case role of financieel recht. |
| immutable aangesloteneclaimversie | `app_allocation_point_party_claim_versions` | Period-bound, profile-version-pinned, provenanced en supersedeerbare claim- en beslistruth. |
| case-to-allocation-point-link | `app_case_allocation_points` | Historiseerbare administratieve koppeling waardoor een case een allocation point kan gebruiken zonder het te bezitten of andere domeintruth te creëren. |

External/manual source observations blijven een afzonderlijke observation/provenance-verantwoordelijkheid. Evidence artifacts, reviews en accepted/rejected evidence decisions blijven een afzonderlijke toekomstige evidence-module. Kalenderjaarexclusiviteitscontrole blijft een afzonderlijke toekomstige mandate/controlmodule. Er komt geen generieke ownership-, role-, evidence- of EAV-engine.

## C. Approved TARGET EAN-semantiek

De volgende interne regels zijn door Daan als TARGET goedgekeurd:

1. Een fysieke electricity connection en een EAN-dragend allocation point zijn afzonderlijke roots.
2. De geaccepteerde EAN is immutable op de stabiele allocation-pointroot.
3. Core EAN-syntax is exact 18 numerieke tekens. Dit contract doet geen checksumclaim zonder officiële, aantoonbaar toepasselijke bron.
4. Declared, parsed/observed en externally returned EAN-waarden zijn observations.
5. Een observation creëert niet zelfstandig een geaccepteerde allocation-pointroot of accepted EAN.
6. Correctie van een accepted EAN naar een andere EAN herschrijft de bestaande root niet; zij vereist een nieuwe root of expliciete historische relatie volgens een later goedgekeurd correctiecontract.

De interne identity- en observationgrenzen zijn approved TARGET. External register truth, accepted-evidencecategorieën, freshness, conflictafhandeling, EAN-reuse en het correctiecontract blijven open en niet geïmplementeerd.

## D. Approved TARGET connection- en locationgrens

Approved TARGET:

- de fysieke connection is een afzonderlijke stabiele root;
- een stabiele locationroot vertegenwoordigt de fysieke locatie, niet een adresstring;
- iedere juridisch of operationeel relevante relatie pint waar nodig de exacte historische locationversion;
- een address observation is brondata en kan een locationversion ondersteunen of tegenspreken, maar is niet zelf stabiele location truth;
- een allocation point draagt de EAN-identiteit en relateert historisch aan de fysieke connection/location;
- relocation, adrescorrectie en administratieve adreswijziging krijgen nieuwe historiseerbare relaties of versions en herschrijven geen eerdere reliance.

`app_dossier_locations` is niet automatisch het target-locationmodel. Het blijft een dossiergebonden snapshot met bruikbare normalizationvelden, maar niet de goedgekeurde stabiele fysieke locationroot.

De locationdependency blokkeert connection-DDL voor `app_electricity_connections` en iedere allocation-pointversion die een juridische/fysieke locationversion moet vastleggen. De eerstvolgende bounded context is de locationfoundation. Die foundation moet afzonderlijk worden gecontracteerd, goedgekeurd en bewezen. Pas daarna volgt een beperkte connection root/claim DDL-readinesscheck; WP3C autoriseert die DDL niet.

## E. Approved TARGET aangesloteneclaim

Approved TARGET:

- de claim verwijst naar de represented legal party uit WP2A, nooit rechtstreeks naar een Auth identity, account, customer, dossier of case role;
- iedere claimversie pint exact één passende person- of organization-profileversion van die party;
- een stabiele claimroot identificeert één party-to-allocation-point-claim;
- claimversies zijn immutable en append-only;
- business validity gebruikt `valid_from` en optioneel `valid_to`;
- `recorded_at` is afzonderlijke recorded time;
- supersession is expliciet en lineair;
- dispute en rejection blijven zichtbaar en kunnen geen operationele truth leveren;
- correctie naar een andere party sluit of betwist de oude claim en start een nieuwe claimroot; de party wordt nooit binnen dezelfde chain vervangen.

Goedgekeurde gesloten statusvocabulary:

- `asserted`
- `connection_confirmed`
- `disputed`
- `rejected`

Alleen een terminale, niet-gesupersede `connection_confirmed`-versie mag operationele aangeslotene-truth leveren. `asserted`, `disputed` en `rejected` zijn niet-operationeel.

`connection_confirmed` bewijst uitsluitend de party-to-allocation-point-relatie voor de vastgelegde periode. Het bewijst geen authority, mandate, kalenderjaarexclusiviteit, charger/MID, kWh, booking eligibility, settlement entitlement of verifier approval.

Concrete provenancevelden, actorclassificaties, reviewbevoegdheid, decisionmetadata, kolommen en constraints blijven open voor een latere DDL-readinessbeslissing.

## F. Approved TARGET tijd, overlap en concurrency

Approved TARGET:

- business validity is half-open: `[valid_from, valid_to)`;
- null `valid_to` is onbegrensd;
- touching boundaries zijn toegestaan;
- per allocation point bestaat per moment maximaal één operationele `connection_confirmed` aangeslotene;
- meerdere historische aangeslotenen over niet-overlappende perioden zijn toegestaan;
- competing `asserted` en `disputed` claims mogen naast elkaar bestaan voor review wanneer zij geen operationele truth leveren;
- iedere versionchain heeft exact één root, maximaal één directe successor, geen cycles, toenemende `recorded_at` en ongewijzigde root/scope-identiteit;
- wrong-party correction gebruikt een nieuwe claimroot;
- operationele overlap en chainvaliditeit worden aan het einde van de transactie gecontroleerd;
- writes op dezelfde allocation-pointbusinesskey gebruiken een deterministic advisory transaction lock om write-skew te voorkomen;
- een latere proof bevat echte gelijktijdige transacties, niet alleen sequentiële overlaptests.

Business validity en recorded time blijven approved afzonderlijk. Evidence validity, decision time en calendar-year controls blijven eveneens afzonderlijke concerns, maar hun precieze external/evidencecontracten zijn open:

| tijd | betekenis |
|---|---|
| business validity | periode waarin de connection-, allocation- of partyrelatie in de werkelijkheid geldt |
| recording time | wanneer ENVAL de immutable row vastlegde |
| evidence validity | periode/freshness waarin een artifact of externe bron bruikbaar is |
| decision time | wanneer een bevoegde reviewer een expliciet besluit nam |
| calendar-year controls | mandate- en inboekdienstverlenerexclusiviteit per volledig kalenderjaar |

## G. Approved TARGET primary en secondary allocation points

- `secondary_allocation_point` als los label is onvoldoende.
- Een secondary point moet bewust, historiseerbaar en period-bound aan een primary physical connection en/of primary allocation point worden gekoppeld.
- Relationship type en geldigheidsperiode zijn afzonderlijke historische metadata.
- Eligibility volgt nooit automatisch uit deze relatie.
- Evidence acceptance blijft een afzonderlijke expliciete menselijke beslissing; de exacte evidencecategorieën zijn open.
- De exacte MLOEA-/secondary-acceptatieregels blijven `BLOCKED — EXTERNAL` zolang de gemapte bronnen de toegestane constructen, relatie en evidence niet volledig bepalen.

Conservatieve MVP-default: ieder onduidelijk secondary-allocationgeval is blocked/manual review. Het krijgt geen automatische promotion of booking eligibility.

## H. Approved TARGET kalenderjaarexclusiviteitsgrens

- `NEA-EAN-004` is geen globale active-EAN uniqueness.
- Connection/allocation-point identity en inboekdienstverlenerexclusiviteit zijn verschillende concerns.
- De exclusiviteitscontrole hoort bij party + allocation point/EAN + mandate + inboekdienstverlener + calendar year.
- Externe duplicatecontrole of een gecontroleerde manual fallback blijft noodzakelijk.
- Een lokale unique index kan externe dubbele machtiging of inboeking niet bewijzen.
- Een unresolved duplicatecontrole blokkeert promotion/booking voor het betrokken kalenderjaar, maar hoeft historische connectionregistratie niet te blokkeren.
- Connection truth creëert geen mandate en een mandate creëert geen connection truth.

## I. Approved evidencegrens en open provenancebesluiten

De volgende lagen blijven afzonderlijk:

1. declared fact;
2. observed fact;
3. external result;
4. evidence artifact en exacte version;
5. evidence review;
6. accepted/rejected evidence decision;
7. operational connection/party truth.

De afzonderlijke evidence-acceptancecontext en de menselijke beslisgrens zijn approved TARGET. De precieze categorieën, freshness, conflictregels en onderstaande provenancevelden blijven een later contractbesluit:

- source type/class en source reference;
- retrieval time en issue time;
- artifact ID, exact version en content hash;
- actor en request ID;
- decision time en decision reason;
- freshness/expiry;
- supports, contradicts, insufficient, supersedes of revokes conflictlinks;
- expliciete historical reliance op de gebruikte source/evidence/decisionversies.

Raw providerpayload hoort niet in core connection-, allocation-point- of claimrows. Het blijft in een afzonderlijk afgeschermd source/evidence-object onder een eigen retention- en toegangscontract.

## J. Approved administratieve casegrens

- Cases mogen allocation points gebruiken zonder ze te bezitten.
- Een case link creëert geen aangeslotene, authority, mandate of kalenderjaarexclusiviteit.

Exacte casecardinaliteit, link purposes, simultane actieve cases, versionpinning, lifecycle en verwijdergedrag zijn niet onderdeel van package A-E en blijven open productbesluiten.

## K. Approved TARGET securitygrens

Approved TARGET:

- RLS enabled op iedere core tabel;
- deny-all policies;
- geen `PUBLIC`, `anon` of `authenticated` tabelwrites;
- immutable truth krijgt voor `service_role` uitsluitend `SELECT` en `INSERT`;
- geen `UPDATE` of `DELETE` op immutable roots/versions tenzij een later afzonderlijk mutable projectionobject aantoonbaar nodig is;
- geen browserwrites;
- transaction-end-validatie en deterministic advisory locking bewaken cross-row invarianten en write-skew;
- latere proofs bevatten echte concurrerende transacties.

Customer-safe projection, concrete RPC-vorm, `SECURITY DEFINER`-gebruik, search path en executegrants blijven latere implementatiebesluiten binnen de approved least-privilegegrens.

## L. WP3C-besluitmatrix

De interne TARGET-richting van pakketten A tot en met E is op 2026-07-24 expliciet door Daan goedgekeurd. Dat besluit autoriseert geen DDL, implementatie, retirement of proofclaim.

| besluit-ID | onderwerp | WP3C-pakket | besluitstatus | goedgekeurde TARGET-richting | externe/open blocker | DDL-status | latere proofverplichting |
|---|---|---|---|---|---|---|---|
| WP3B-D01 | connection versus allocation-pointroot | A | APPROVED TARGET | separate fysieke connection- en EAN-dragende allocation-pointroots | register-/verifieraansluiting | NOT AUTHORIZED | objectinventaris en negatieve cross-contexttests |
| WP3B-D02 | accepted-EAN-immutability | A | APPROVED TARGET | accepted EAN is immutable op de stabiele allocation-pointroot; correctie herschrijft niet | officiële correctie-/reuserules | NOT AUTHORIZED | correction/replacement/historyproof |
| WP3B-D03 | EAN syntax/checksum | A | APPROVED TARGET | exact 18 numerieke tekens; geen checksumclaim zonder officiële toepasselijke bron | officiële toepasselijke bron | NOT AUTHORIZED | syntax en no-auto-accept tests |
| WP3B-D04 | locationdependency | B | APPROVED TARGET | separate stabiele locationroot, immutable versions en address observations; eerst locationfoundation | locationcontract en implementatie | NOT AUTHORIZED | relocation/correction/reliance proof |
| WP3B-D05 | claimstatusvocabulary | C | APPROVED TARGET | `asserted`, `connection_confirmed`, `disputed`, `rejected` | verifieracceptatie | NOT AUTHORIZED | closed-vocabulary en operational-state tests |
| WP3B-D06 | profile-versionpinning | C | APPROVED TARGET | claimversie pint exact de passende person- of organization-profileversie | geen intern besluit meer; concrete DDL nog open | NOT AUTHORIZED | later-profile-stability proof |
| WP3B-D07 | operationele truth | C | APPROVED TARGET | alleen terminale, niet-gesupersede `connection_confirmed` truth is operationeel | verifieracceptatie | NOT AUTHORIZED | state filtering en supersessionproof |
| WP3B-D08 | maximaal één aangeslotene per point/time | C | APPROVED TARGET | maximaal één operationele confirmed party per allocation point per moment | verifieracceptatie | NOT AUTHORIZED | temporal en concurrent overlap proof |
| WP3B-D09 | competing claims | C | APPROVED TARGET | asserted/disputed claims mogen naast elkaar bestaan maar zijn niet operationeel | conflicterende-bronafhandeling | NOT AUTHORIZED | competing-claim/conflict/no-operation tests |
| WP3B-D10 | wrong-party correction | C | APPROVED TARGET | nieuwe party krijgt een nieuwe claimroot; historische claim wordt niet herschreven | concrete correction contract | NOT AUTHORIZED | atomic close/new-root en scope-preservation proof |
| WP3B-D11 | primary/secondary relationship | D | APPROVED TARGET | expliciete historiseerbare typed relation; onduidelijk secondary/MLOEA blokkeert en gaat naar manual review | MLOEA-/secondarybron en verifier | NOT AUTHORIZED | relation/evidence/negative eligibility proof |
| WP3B-D12 | casecardinaliteit | buiten A–E | OPEN | een case-link is administratief en creëert geen connection, allocation point, aangeslotene, authority, mandate of evidence acceptance | exacte productcardinaliteit en linkpurpose | NOT AUTHORIZED | cardinality, version-pin en no-inference proof |
| WP3B-D13 | external evidence acceptance | D | APPROVED TARGET BOUNDARY | external result, artifact/version, review en acceptance blijven gescheiden; upload/parser/result is nooit automatisch accepted | evidencecategorieën, freshness en conflicting sources | NOT AUTHORIZED | freshness/conflict/no-parser-promotion proof |
| WP3B-D14 | kalenderjaarexclusiviteit | D | APPROVED TARGET BOUNDARY | afzonderlijke party+point/EAN+mandate+IDV+year-control; niet een globale EAN-index | externe duplicatebron of manual fallback | NOT AUTHORIZED | year boundary, duplicate source en fail-closed proof |
| WP3B-D15 | security/grants | E | APPROVED TARGET | RLS deny-all, geen browserwrites, immutable core voor `service_role` alleen `SELECT`/`INSERT` | concrete object- en RPC-authorisatie | NOT AUTHORIZED | exact grants, immutability en bypass tests |
| WP3B-D16 | supersession/concurrency | E | APPROVED TARGET | immutable lineaire chain, één successor, transaction-end-checks en deterministic advisory locking | concrete transactionele DDL | NOT AUTHORIZED | echte two-transaction race-, cycle- en successorproof |
| WP3B-D17 | oude objectdispositie | E | APPROVED TARGET DIRECTION | forward-only replacement; niets verwijderen vóór alle retirementgates en expliciete execution approval | replacementcontract, bewijs, callers, data en remote inventory | NOT AUTHORIZED | rowcount/caller/rollback/catalog parity/cleanup proof |

## M. Contractverdict

TARGET — WP3C INTERNAL DOMAIN DECISIONS APPROVED — EXTERNAL BLOCKERS OPEN / NOT DDL READY

### Goedgekeurde interne grens

De letterlijke beslispakketten A tot en met E staan in `operations/wp3c-connection-ean-internal-domain-decisions.md`. Voor die interne TARGET-richting staat geen nieuw Daan-besluit meer open. Dit contract autoriseert echter geen kandidaattabel, kolom, constraint, migration, proofrun, bestaande-objectmutatie of retirement.

Nog open buiten A tot en met E zijn onder meer de exacte casecardinaliteit en linkpurpose, concrete tabel-/kolom-/constraintnamen, het afzonderlijke locationcontract en zijn implementatie, concrete correction flows, concrete RPC/projectievormen en alle hieronder genoemde externe beslissingen.

### Externe blockers

- gezaghebbende DSO/CAR/registerbron, toegangsroute, resultsemantiek, freshness en accepted-evidencevorm;
- schriftelijke bevestiging van EAN-reuse/change/correctiongedrag wanneer dit voor rootidentiteit nodig is;
- exacte MLOEA-/secondary-allocation-pointrelatie en acceptatie-evidence;
- externe duplicatebron of gecontroleerde manual fallback voor `NEA-EAN-004`;
- verifieracceptatie van aangeslotene-, connection-, location- en conflictbewijs;
- de al bekende afzonderlijke consolidated-law- en verifierdependencies uit de canon;
- representation-authorityvalidatie loopt onafhankelijk en kan geen aangeslotene- of connectionbesluit vervangen.

### Implementation dependencies

- het WP3C-besluitrecord voor de goedgekeurde interne A–E-richting;
- een afzonderlijk goedgekeurde én bewezen locationfoundation voor fysieke connection/location truth;
- WP2A party/profileversiontruth blijft de partybasis;
- een afzonderlijk evidence acceptance contract;
- een afzonderlijk mandate/calendar-year control contract;
- provider-independent external/manual source contracts;
- goedgekeurde forward-only replacement-, data-, caller-, rollback- en auditstrategie.

### Eerstvolgende bounded context

De eerstvolgende bounded context is uitsluitend de locationfoundation-readiness. Pas nadat die foundation afzonderlijk is goedgekeurd en bewezen, mag een beperkte connection-root/claim-DDL-readinessbeoordeling plaatsvinden. Ook die latere beoordeling is geen implementatie- of DDL-authorisatie.

### Hard exclusions

- Auth-schema, account/customer-hermodellering en representation authority;
- mandates, signed-mandate lifecycle en kalenderjaarexclusiviteitsimplementatie;
- evidence acceptance, raw providerpayload en provideradapters;
- charger/MID, kWh, eligibility, booking/REV en verifierbeslissingen;
- settlement/payout;
- backfill, cutover, drop/cleanup van bestaande objecten;
- RPC, Edge Function, runtime, frontend, UI of CSS;
- remote apply, deploy of productie.
