# NEa Compliance Directive

Status: CURRENT - HIGHEST INTERNAL COMPLIANCE DIRECTIVE.

ENVAL is een inboekdienstverlener voor ERE-E.

Iedere requirement moet traceerbaar zijn van officiële bron naar requirement, controle, data, test en bewijs.

This directive governs every NEa-related ENVAL product, architecture, data, evidence, audit, operation, and MVP decision.

It is not a replacement for law, regulation, or official NEa publications. If this directive conflicts with law, regulation, or official NEa publications, the external source wins.

## Source Registry

Consulted on: 2026-07-21.

| Source ID | Title | Organization | URL | Publication / change date | Status |
|---|---|---|---|---|---|
| SRC-WM-97 | Wet milieubeheer, titel 9.7 hernieuwbare energie vervoer | Overheid.nl | `https://wetten.overheid.nl/BWBR0003245` | Current consolidated law to confirm before implementation | OFFICIAL / PARTIAL ACCESS IN CURRENT AUDIT |
| SRC-BEV | Besluit energie vervoer | Overheid.nl / Staatsblad | `https://wetten.overheid.nl/BWBR0040922` and `https://zoek.officielebekendmakingen.nl/stb-2026-117.html` | Staatsblad 2026, 117; current consolidated text to confirm before implementation | OFFICIAL / PARTIAL ACCESS IN CURRENT AUDIT |
| SRC-REV | Regeling energie vervoer, including inboekverificatie bijlage context | Overheid.nl / Staatscourant | `https://wetten.overheid.nl/BWBR0041050` and `https://zoek.officielebekendmakingen.nl/stcrt-2026-15748.html` | Staatscourant 2026, 15748; current consolidated text to confirm before implementation | OFFICIAL / PARTIAL ACCESS IN CURRENT AUDIT |
| SRC-NEA-ELEC | Inboeken elektriciteit | Nederlandse Emissieautoriteit | `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres/inboeken-hernieuwbare-energie-vervoer/inboeken-elektriciteit` | Publication date not visible in fetched page | OFFICIAL NEa GUIDANCE |
| SRC-NEA-IDV | Inboekdienstverleners | Nederlandse Emissieautoriteit | `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres/inboeken-hernieuwbare-energie-vervoer/inboekdienstverleners` | Publication date not visible in fetched page | OFFICIAL NEa GUIDANCE |
| SRC-NEA-IDV-LIST | Lijst van inboekdienstverleners | Nederlandse Emissieautoriteit | `https://www.emissieautoriteit.nl/documenten/2026/02/02/lijst-van-inboekdienstverleners` | 2026-07-02 in fetched page | OFFICIAL NEa PUBLICATION |
| SRC-NEA-PART | Inboeken elektriciteit particulieren | Nederlandse Emissieautoriteit | `https://www.emissieautoriteit.nl/documenten/2026/02/02/inboeken-elektriciteit-particulieren` | 2026-02-02 | OFFICIAL NEa HELP DOCUMENT |
| SRC-NEA-VER | Informatie voor verificateurs | Nederlandse Emissieautoriteit | `https://www.emissieautoriteit.nl/regelgeving/hernieuwbare-energie-voor-vervoer-eres/informatie-voor-verificateurs` | Publication date not visible in fetched page | OFFICIAL NEa GUIDANCE |
| SRC-NEA-TKV | Toetsingskader verificatieprotocol inboekverificatie elektriciteit | Nederlandse Emissieautoriteit | `https://www.emissieautoriteit.nl/documenten/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit` | 2026-07-09 | OFFICIAL / FULLY READ / ALL 19 PRESENT CLAUSES MAPPED |
| SRC-NEA-REV-ROLES | Gebruikersrollen | Nederlandse Emissieautoriteit | `https://www.emissieautoriteit.nl/registers-en-portalen/register-energie-voor-vervoer/autorisatie-en-toegang/gebruikersrollen` | Publication date not visible in fetched page | OFFICIAL NEa GUIDANCE |

### SRC-NEA-TKV Retrieval Record

| field | value |
|---|---|
| official title | `Toetsingskader verificatieprotocol: Inboekverificatie elektriciteit` |
| publisher | Nederlandse Emissieautoriteit (NEa) |
| publication date | 2026-07-09 |
| document page | `https://www.emissieautoriteit.nl/documenten/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit` |
| PDF URL | `https://www.emissieautoriteit.nl/site/binaries/site-content/collections/documents/2026/07/09/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit/toetsingskader-verificatieprotocol-inboekverificatie-elektriciteit.pdf` |
| official displayed size | 813.27 KB |
| retrieved file size | 832788 bytes |
| PDF page count | 10 |
| SHA-256 | `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` |
| retrieval timestamp | `2026-07-21T10:06:18+08:00` |
| repository path | `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf` |
| retrieval date | 2026-07-21 |
| access status | PASS — official page and PDF accessed; one immutable verified source snapshot stored at the canonical repository path |
| reading status | PASS — all ten pages read; all nineteen present numbered clauses mapped |
| numbering note | the source proceeds from 3.3.4 to 3.3.6 and shows no 3.3.5; no missing requirement is invented |
| source status | OFFICIAL SOURCE SNAPSHOT |

The official document page states that the framework consolidates requirements from the Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer and contains no new requirements compared with those rules. TKV protocol and verification requirements are therefore classified as `VERIFICATION FRAMEWORK`, not automatically as `DIRECT LAW`. Any ENVAL-specific workflow or technical safeguard derived to support those requirements is classified separately as `ENVAL INTERNAL CONTROL`.

### Regulatory Source Hierarchy And Supersede Control

1. Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer are legally higher.
2. De versioned officiële TKV-PDF is de primaire operationele verificatiearchitectuurbron voor ENVAL.
   Source status: OFFICIAL SOURCE SNAPSHOT.
3. `docs/app/06_NEA_REQUIREMENTS.md` is the normalized requirement set.
4. `docs/app/08_NEA_TRACEABILITY_MATRIX.md` connects source, component, data, test, and evidence.
5. `docs/app/07_NEA_TARGET_ARCHITECTURE.md` is the derived, unapproved target architecture.
6. No derived ENVAL document may contradict the official PDF.
7. A conflict or new official version is a hard stop and requires a new source diff before affected requirements, architecture, tests, evidence, or implementation work may continue.

Superseding this snapshot requires: keep the current repository file immutable; retrieve the new official file outside the repository; verify URL, publication date, byte size, page count and SHA-256; store the new version under a distinct versioned filename; diff every present clause and normative reference; map affected requirement IDs and trace rows; review architecture and test/evidence impact; record approval and only then change the primary operational designation. No in-place replacement is allowed.

## Role Of ENVAL

ENVAL is an ERE-E inboekdienstverlener.

All applicable rules must be assessed from the role of inboekdienstverlener. They must not be assessed from the role of customer, neutral software supplier, or external inboeker.

ENVAL remains neither the NEa nor an independent verifier. ENVAL may prepare, control, administer, and submit an inboekdienstverlener basis only where the official rules, account/access status, mandates, evidence, and verification path support that role.

ENVAL is not:

- the NEa;
- a verifier;
- a certifier;
- a legal compliance authority;
- a guarantor of eligibility, ERE creation, payment, timing, verification outcome, or document acceptance.

### Verification Actor Boundary

| actor | responsibility in the TKV chain | ENVAL boundary |
|---|---|---|
| VERIFICATEUR | accreditation/temporary designation eligibility, professional risk and materiality judgment, sample selection, location work, evidence evaluation, findings, statement, and fraud-suspicion reporting | external professional authority; ENVAL must not replace or automate the judgment |
| INBOEKER | provide complete administration, locations, quantities, books, staff access, corrections, and other verification inputs | ENVAL owns this duty for its own inboeking administration |
| INBOEKDIENSTVERLENER | additionally prove valid customer mandates and customer/location eligibility inputs | ENVAL must collect, preserve, and expose the required mandate and evidence package |
| ONDERNEMING/NATUURLIJKE PERSOON | provide valid mandate, connection/EAN facts, location access, and retained source information where applicable | customer workflow must capture these facts without treating ordinary legal acceptance as a complete mandate |
| NEa | assess protocols, receive verification results through the official chain, obtain distributor data under mandate, and receive fraud suspicions | external authority; no ENVAL substitute |
| RvA | perform schema evaluation and accreditation oversight | external dependency |
| MINISTER | decide protocol approval on NEa advice | external decision; never represented as ENVAL approval |

ENVAL may facilitate data, evidence, scheduling, traceability, request/response handling, correction history, and safe projections. ENVAL does not independently select the verifier's sample, decide verification materiality, perform the professional risk judgment, issue the official verification statement, mark an inboeking verified without an external result, register the verifier's professional result in REV, or report fraud suspicions on behalf of the verifier.

ENVAL may also perform preparatory `INTERNAL SUPPORT CONTROL` checks, selected `manual`, `random`, `risk_based`, or `verifier_request`, when they are audit-worthy and historized. An internal support control is never the external verifier's official location visit, never replaces independent verification, and never grants ENVAL the authority to set professional risk/materiality, issue a statement, or register the verifier's REV result.

ENVAL is responsible for controlling its own inboeking chain:

- correctness;
- completeness;
- traceability;
- verifiability;
- data provenance;
- mandate validity;
- evidence decisions;
- batch reproducibility;
- internal control;
- audit trail;
- correction handling.

External verification does not remove ENVAL's own control responsibility. Verification is an independent control layer after ENVAL has produced a controlled, complete, reconstructable inboeking basis.

## Compliance Principles

- The verifier classifies verification risks as `hoog`, `midden`, or `laag`; ENVAL may supply inputs but may not create the professional classification.
- `Locatiebezoek` means the official verifier-controlled visit when used in the TKV chain. An ENVAL internal support control is a separate preparatory activity.
- Meter `nauwkeurigheid en betrouwbaarheid` must be supported with factual records and evidence; the official evaluation and conclusion remain with the verifier.
- Every official `inboekverificatieverklaring` has a unique externally issued code; ENVAL records that code and never issues it.
- `Redelijke mate van zekerheid` is an external verifier objective/conclusion, not an ENVAL software state.
- Evidence before status.
- No inboeking without a valid mandate.
- Truth is time-bound: identity, EAN, ownership, mandate, meter, location, kWh period, and evidence validity must be historized.
- Full provenance: every data point must trace to source, actor, time, transformation, decision, and audit event.
- Raw data is not overwritten.
- Derived data does not mutate core truth.
- Confirmed upload is not accepted evidence.
- Explicit state transitions only.
- Four-eyes for critical decisions.
- Minimum privileges.
- Service-role only server-side.
- Immutable audit trail.
- Reproducible calculations.
- Corrections are new historical events.
- No compliance claim without evidence.
- The 2% quantitative materiality threshold is verifier materiality, not an automatic eligibility, dossier-acceptance, or booking threshold.
- Qualitative non-compliance remains separate; professional materiality judgment remains with the verifier.
- The minimum five-year TKV retention period applies to verification data and documentation and to relevant information collected in the verification chain; it does not by itself impose one identical retention period on every customer-data category.

## Architecture Rule

Every hard requirement must be traceable through this chain:

```text
source -> requirement-ID -> component -> data object -> control -> audit event -> test -> evidence
```

The primary requirement catalog is `docs/app/06_NEA_REQUIREMENTS.md`.

The primary implementation trace is `docs/app/08_NEA_TRACEABILITY_MATRIX.md`.

The primary target architecture is `docs/app/07_NEA_TARGET_ARCHITECTURE.md`.

The primary delivery plan is `docs/app/09_NEA_MVP_PLAN.md`.

No implementation may be called NEa-ready unless its requirement IDs are covered in the traceability matrix and the applicable gate in the MVP plan is passed.

## Change Control

Regulatory source control must run:

- before production launch;
- before every inboekjaar opening;
- before every REV submission process;
- after every relevant NEa publication, law change, REV change, or verifier finding;
- at least once per quarter while the service is active.

Each regulatory change impact assessment must record:

- changed source;
- affected requirement IDs;
- affected components;
- affected data objects;
- affected controls and audit events;
- owner;
- deadline;
- whether tests, docs, and customer copy must be reconfirmed;
- whether active intake, review, booking, or settlement must pause.

## Hard Stopgates

The system or operation must stop or block the affected dossier, batch, or settlement when any of the following applies:

- invalid or missing mandate;
- insufficient evidence of aangeslotene/EAN;
- insufficient charger/MID evidence;
- non-traceable kWh data;
- duplicate or overlapping volumes;
- missing internal review where required;
- open critical deviation;
- non-reproducible batch;
- refused required location visit;
- missing external verification before the applicable deadline;
- unresolved REV reconciliation difference;
- unsupported public claim about eligibility, fixed revenue, NEa approval, or acceptance.

## Status Discipline

`CURRENT PROVEN` may be used only when current code, schema, migration, test, or proof output demonstrates the claim.

`TARGET` may be used only for deliberate architecture or product direction that is not yet implementation proof.

`TO CONFIRM` must be used when the official source is inaccessible, ambiguous, or not specific enough for a hard requirement.

`UNKNOWN` must be used when implementation, source, owner, or evidence is missing.
