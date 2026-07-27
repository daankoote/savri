# WP3F-B Bounded Location DDL Decisions

DECISION RECORD — WP3F-B BOUNDED LOCATION DDL PACKAGE APPROVED — NO IMPLEMENTATION AUTHORIZATION

| field | value |
|---|---|
| approved by | Daan |
| approval scope | WP3F-B package 1–18 |
| contract status | APPROVED TARGET |
| implementation status | NOT IMPLEMENTED |
| proof status | NOT PROVEN |
| migration status | NOT AUTHORIZED |
| data population status | NOT AUTHORIZED |
| caller cutover status | BLOCKED |
| retirement status | NOT AUTHORIZED |
| external blockers | OPEN |

approved by: Daan

approval scope: WP3F-B package 1–18

contract status: APPROVED TARGET

implementation status: NOT IMPLEMENTED

proof status: NOT PROVEN

migration status: NOT AUTHORIZED

data population status: NOT AUTHORIZED

caller cutover status: BLOCKED

retirement status: NOT AUTHORIZED

external blockers: OPEN

## 1. Scope And Authority

Dit besluitrecord keurt uitsluitend de bounded interne TARGET-besluiten
`WP3F-B-01` tot en met `WP3F-B-18` goed. Het bepaalt de minimale fysieke
foundationvorm en de database-invarianten waarvoor een latere, afzonderlijk
geautoriseerde migration en proof mogen worden ontworpen.

Dit record creëert geen `CURRENT PROVEN`-truth, migration, SQL, proof,
databasewrite, data-populatie, write-RPC, runtime, Edge Function, frontend,
CSS, caller-cutover, retirement, remote actie of deployment.

De historische WP3F-documenten worden niet herschreven. WP3F blijft het bewijs
dat location-DDL vóór deze besluiten niet veilig was. De privacy-safe
classificatie blijft eveneens leidend voor current-datawerk: alle 44 current
rows vereisen manual review en geen row mag automatisch worden gepromoveerd,
gekopieerd, geaccepteerd of gewijzigd.

## 2. Approved Bounded Decision Package

### WP3F-B-01

De bounded foundation bestaat uitsluitend uit:

- `app_locations`;
- `app_location_address_observations`;
- `app_location_versions`.

Case-locationlinks, allocation-point-locationlinks, charge-point-locationlinks
en split/merge-relaties vallen buiten deze foundation.

### WP3F-B-02

De eerste migration is leeg en additive. Geen van de 44 current rows wordt
gekopieerd, geaccepteerd of gewijzigd.

Deze approval autoriseert die migration niet. Zij bepaalt uitsluitend de
toegestane vorm van een later afzonderlijk te autoriseren eerste migration.

### WP3F-B-03

`app_locations` is een opaque, server-assigned, statusloze root met:

- `id`;
- `created_at`;
- `created_by_actor_ref`;
- `created_from_request_id`;
- `creation_basis`.

De gesloten `creation_basis`-vocabulary is:

- `customer_declaration`;
- `source_observation`;
- `manual_migration_review`.

### WP3F-B-04

`app_locations` is immutable. Er is geen UPDATE, DELETE, cascade, adresveld,
externe identifier, deduplicatie of adresgebaseerde uniqueness.

Rootidentiteit wordt niet afgeleid van een adres, genormaliseerde adrestuple,
provider-ID, customer, party, case, aansluiting, allocation point, charger of
current locationrow.

### WP3F-B-05

`app_location_address_observations` bevat immutable bronobservaties met:

- `id`;
- `location_id`;
- `observation_kind`;
- `descriptor_kind`;
- `observed_at`;
- `recorded_at`;
- actor- en requestrefs;
- optionele bronhashes;
- freshness;
- genormaliseerde adres- of sitereferencevelden.

Elke observation hoort bij exact één locationroot. De relatie registreert de
bronobservatie; zij accepteert of verifieert die observation niet.

### WP3F-B-06

De gesloten `observation_kind`-vocabulary is:

- `customer_declared`;
- `document_parsed`;
- `pdok_observed`;
- `bag_observed`;
- `provider_observed`;
- `manual_observed`;
- `migration_snapshot`.

De gesloten `descriptor_kind`-vocabulary is:

- `postal_address`;
- `site_reference`.

### WP3F-B-07

Geen raw bronpayload, provider-ID, storage path, documentinhoud, secret,
e-mail of telefoon wordt in observations opgeslagen. Bronrefs en payloads
worden uitsluitend als lowercase SHA-256-hash opgeslagen.

Hashvelden accepteren daarom uitsluitend 64 lowercase hextekens. De hash
bewijst integriteit van de gerefereerde bytes of referentiewaarde, niet
autoriteit, freshness, acceptatie of fysieke-site-identiteit.

### WP3F-B-08

Een observation is nooit accepted, approved, verified, current, operational
of eligible truth. Conflicten blijven derived/reviewdata.

Customer declaration, parseroutput, upload, PDOK/BAG-resultaat,
providerresultaat, manual observation of migration snapshot kan geen accepted
version of operationele location truth creëren.

### WP3F-B-09

`app_location_versions` bevat uitsluitend expliciet geaccepteerde, immutable
location truth met:

- een stabiele version-ID en exact één `location_id`;
- business validity;
- afzonderlijke `recorded_at`;
- acceptanceprovenance;
- descriptorvelden;
- optionele supersession.

De geaccepteerde descriptor is exact één `postal_address` of
`site_reference`. De version verwijst naar de exact geaccepteerde inputs en
het besluit; evidence en observations blijven afzonderlijke objecten.

### WP3F-B-10

`app_location_versions` is accepted-only. Er is geen
draft/pending/rejected-lifecyclekolom.

Afgewezen, onbesliste of conflicterende input blijft buiten
`app_location_versions` en kan uitsluitend als observation/reviewdata worden
vastgelegd.

### WP3F-B-11

`postal_address` vereist country, postal code, house number, street en city.
`site_reference` vereist `site_reference`.

Geen descriptor bewijst EAN, aansluiting, aangeslotene, meter, MID of
eligibility.

### WP3F-B-12

Businessperioden zijn `timestamptz` en half-open:
`[valid_from, valid_to)`. Touching boundaries zijn toegestaan.
`recorded_at` blijft afzonderlijk.

Een null `valid_to` is onbegrensd. Een niet-null `valid_to` ligt strikt na
`valid_from`.

### WP3F-B-13

Per root en business-time moment bestaat maximaal één operationele,
niet-gesupersede version.

Een version is operationeel wanneer zij geaccepteerd is, niet is
gesupersede en het business-time moment binnen haar half-open validityperiode
valt. Dit is een database-invariant, geen verifier- of eligibilitybesluit.

### WP3F-B-14

Supersession is uitsluitend een correctie binnen dezelfde root:

- maximaal één directe successor;
- geen cycles;
- successor heeft een latere `recorded_at`;
- `correction_reason` is verplicht;
- historie blijft behouden.

Een physical relocation gebruikt een nieuwe root en is geen supersession
binnen de oude root.

### WP3F-B-15

Toegestane toekomstige databasehandhaving:

- CHECK-constraints;
- composite FK's;
- partial unique indexes;
- immutable guards;
- deferrable transaction-end constraint triggers voor same-root-, cycle-,
  successor- en overlapinvarianten.

Deze lijst keurt de invariantmechanismen als TARGET goed, maar bevat geen SQL
en autoriseert geen migration of proof.

### WP3F-B-16

Latere operationele writes vereisen:

- één servertransaction;
- een deterministic `pg_advisory_xact_lock` per `location_id`;
- deferred validatie;
- idempotency;
- audit;
- echte concurrencyproofs met afzonderlijke transacties.

De bounded foundation bevat nog geen write-RPC. RPC-signatures,
executegrants, foutcontracten en callerautorisatie blijven buiten deze
approval.

### WP3F-B-17

Alle drie tabellen:

- RLS enabled;
- deny-all;
- geen `PUBLIC`-, `anon`- of `authenticated`-privileges;
- `service_role` uitsluitend `SELECT` en `INSERT`;
- geen `UPDATE` of `DELETE`.

Customer reads lopen later uitsluitend via een afzonderlijk goedgekeurde
customer-safe projection.

### WP3F-B-18

Er staat geen raw payload in de foundation. Verification-relevante gegevens
moeten ten minste gedurende de TKV-termijn beschikbaar blijven.

Exacte privacy, langere retentie en vernietiging blijven open. Deze
architectuur ondersteunt reconstructie maar bewijst geen verifier- of
NEa-acceptatie.

## 3. Bounded Foundation Shape

| table | bounded responsibility | mutable state | population in first migration | caller |
|---|---|---|---|---|
| `app_locations` | opaque, statusloze physical-locationroot met creationprovenance | none; immutable INSERT-only | empty | none |
| `app_location_address_observations` | immutable declared/parsed/external/manual/migration observations | none; immutable INSERT-only | empty | none |
| `app_location_versions` | immutable, accepted-only location truth met business validity en correctiesupersession | none; immutable INSERT-only | empty | none |

Niet in de bounded foundation:

- case-locationlinks;
- allocation-point-locationlinks;
- charge-point-locationlinks;
- split/merge-relaties;
- customer-safe projection;
- write-RPC;
- provideradapter;
- evidence-acceptanceworkflow;
- current-row mapping;
- caller-cutover;
- current-table retirement.

## 4. Reused Internal Patterns

De approval hergebruikt uitsluitend vorm en proofdiscipline uit bestaande
ENVAL-bronnen:

- WP2A immutable rows, half-open periods, scope-preserving supersession,
  one-successor indexes, deny-all RLS en minimum `service_role`
  `SELECT`/`INSERT`;
- WP2B-I deterministic per-root advisory locking, recursive cycle checks,
  deferrable transaction-end validation, echte two-transaction concurrency,
  protected counts en volledige fixturecleanup;
- app audit/idempotency met request-, actor-, payloadhash- en eventprovenance;
- `SECURITY DEFINER`/fixed-search-path en minimum-execute-grant discipline voor
  een latere afzonderlijk goed te keuren write boundary;
- dashboard serverauthorization en customer-safe projection als latere
  boundaryvorm;
- documenttransport/versioning als voorbeeld van immutable artifacthistorie,
  zonder upload of versie als accepted location truth te behandelen.

Niet herbruikbaar als TARGET-semantiek:

- current dossier/client locationidentity;
- mutable locationstatus, UPDATE/DELETE en cascade;
- address equality of provider-ID als rootidentity;
- current connection/location-FK's en statusmodellen;
- Wave 1 proposal 002;
- browserlookup, parseroutput of upload als acceptance.

Frontendcomponenten, layouts, design tokens en CSS zijn read-only
geïnspecteerd. CSS-hergebruik is niet van toepassing omdat dit besluit geen
runtime of visuele wijziging bevat.

## 5. TKV Alignment Guard

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

- Stable roots, immutable observations/versions, RLS, grants, locks en
  transaction-end-validatie zijn interne ENVAL-controls.
- Zij ondersteunen een volledig en reconstrueerbaar dossier, maar zijn geen
  letterlijke NEa-databasevereisten.
- Location acceptance vervangt geen controle van aansluiting, allocation
  point, bemeterd leverpunt, meter, aangeslotene, directe lijn, opwek op
  hetzelfde adres, Article 10-construct, MID, kWh of eligibility.
- Gegevens die verification-relevant zijn blijven ten minste gedurende de
  toepasselijke TKV-termijn beschikbaar.
- Verifieracceptatie, professionele oordeelsvorming en NEa-acceptatie blijven
  extern.

## 6. Open Blockers

De volgende blockers blijven expliciet open:

- 44-row migrationmapping;
- physical-site matching;
- PDOK/BAG broncontract;
- verifieracceptatie;
- case-locationlinks;
- allocation-point-locationlinks;
- charge-point-locationlinks;
- split/merge-relaties;
- customer-safe projection;
- write-RPC;
- caller-cutover;
- current-table retirement;
- privacy en definitieve retention.

Geen blocker wordt door dit interne TARGET-besluit gesloten. In het bijzonder
blijven alle 44 current rows buiten de foundation totdat elke row een
afzonderlijke manual mapping- en physical-sitebeslissing heeft.

## 7. Implementation And Release Gate

Een latere migration/proofbatch vereist vooraf afzonderlijke expliciete
autorisatie. Die batch moet beperkt blijven tot de lege drie-table foundation,
mag geen current row kopiëren of wijzigen, en moet de approved object-,
constraint-, index-, trigger-, policy- en grantinventaris plus immutability,
temporal, supersession, concurrency, audit/idempotency, RLS en cleanup
bewijzen.

Data population, relation tables, write-RPC, customer projection,
caller-cutover en retirement vereisen elk hun eigen latere contract,
mapping/proof en expliciete autorisatie.

Contract status: APPROVED TARGET.

Implementation status: NOT IMPLEMENTED.

Proof status: NOT PROVEN.

Migration status: NOT AUTHORIZED.
