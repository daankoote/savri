# NEa Regulatory Completeness Audit

Status: PROOF ONLY.

Audit date: 2026-07-19; official electricity TKV completion update: 2026-07-21.

Repo: `/Users/daankoote/dev/enval`.

Branch at audit start: `main`.

HEAD at audit start: `f24b90263c3e22b8fdebd8c3fa016594ddfa7333`.

Legacy absence result: `docs/legacy` does not exist in the working tree.

Exact role statement: ENVAL is a inboekdienstverlener for ERE-E. ENVAL is assessed as inboekdienstverlener, not as customer, neutral software supplier, external inboeker, NEa, or independent verifier.

The original audit did not compare requirements with implementation. The separate assessment in `docs/app/06B_CURRENT_IMPLEMENTATION_ASSESSMENT.md` now contains the documentary TKV-impact delta. No implementation was changed or approved.

## Scope Rule

The required order is:

1. prove legacy docs are absent;
2. prove ENVAL is treated as inboekdienstverlener;
3. prove applicable official NEa/law sources and the current toetsingskader are processed;
4. compare with current code/database/Edge Functions;
5. only then approve target architecture and plan.

## Source Inventory

| source_id | official_title | publisher | publication_or_change_date | consulted_on | document_version | applicable_to_ENVAL_as_IDV | fully_read | access_gap |
|---|---|---|---|---|---|---|---|---|
| SRC-WM-97 | Wet milieubeheer, title 9.7 hernieuwbare energie vervoer | Overheid.nl / Wetten.nl | Current consolidated text, exact current article text to reconfirm | 2026-07-19 | Consolidated law | YES | NO | Wetten.nl current consolidated full text was not fully extracted in this tool session; official search/publication snippets were reviewed. |
| SRC-BEV | Besluit energie vervoer | Overheid.nl / Wetten.nl / Staatsblad | Staatsblad 2026, 117; current consolidated text to reconfirm | 2026-07-19 | Consolidated AMvB plus 2026 amendment | YES | NO | Relevant electricity and IDV passages were reviewed through official publication; full consolidated current text remains to reconfirm. |
| SRC-REV | Regeling energie vervoer including bijlagen | Overheid.nl / Wetten.nl / Staatscourant | Staatscourant 2026, 15748 | 2026-07-19 | Ministerial regulation plus 2026 amendment | YES | NO | Relevant electricity, IDV data, and inboekverificatie sections were reviewed; full consolidated current text remains to reconfirm. |
| SRC-NEA-ELEC | Inboeken elektriciteit | Nederlandse Emissieautoriteit | Page date not visible in fetched content | 2026-07-19 | NEa web guidance | YES | YES | None in fetched content. |
| SRC-NEA-IDV | Inboekdienstverleners | Nederlandse Emissieautoriteit | Page date not visible in fetched content | 2026-07-19 | NEa web guidance | YES | YES | None in fetched content. |
| SRC-NEA-PART | Inboeken elektriciteit particulieren | Nederlandse Emissieautoriteit | 2026-02-02 | 2026-07-19 | NEa hulpdocument | YES | YES | None in fetched content. |
| SRC-NEA-VER | Informatie voor verificateurs | Nederlandse Emissieautoriteit | Page date not visible in fetched content | 2026-07-19 | NEa web guidance | YES | YES | None in fetched content. |
| SRC-NEA-TKV | Toetsingskader verificatieprotocol: Inboekverificatie elektriciteit | Nederlandse Emissieautoriteit | 2026-07-09 | 2026-07-21 | Immutable official 10-page repository snapshot at `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf`; 832788 bytes; SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf` | YES | YES | None. All ten pages and all nineteen present numbered clauses were read and mapped; the source contains no 3.3.5. |
| SRC-NEA-IDV-LIST | Lijst van inboekdienstverleners | Nederlandse Emissieautoriteit | 2026-07-02 in fetched page | 2026-07-19 | NEa publication | CONDITIONAL | YES | None in fetched content. |
| SRC-NEA-REV | Register Energie voor Vervoer | Nederlandse Emissieautoriteit | Page date not visible in fetched content | 2026-07-19 | NEa register information | YES | YES | JavaScript REV application itself is not readable; public register information page is readable. |
| SRC-NEA-REV-ROLES | Gebruikersrollen | Nederlandse Emissieautoriteit | Page date not visible in fetched content | 2026-07-19 | NEa register guidance | YES | YES | None in fetched content. |
| SRC-NEA-HANDH | Handhavingsinstrumenten Hernieuwbare Energie voor Vervoer | Nederlandse Emissieautoriteit | Page date not visible in fetched content | 2026-07-19 | NEa handhaving guidance | YES | YES | None in fetched content. |

## Coverage Matrix

| source_id | article_chapter_section_page | normative_or_relevant_claim | applicable_to_ENVAL | existing_requirement_id | missing_requirement_id | classification | evidence | result |
|---|---|---|---|---|---|---|---|---|
| SRC-WM-97 | title 9.7 / inboeken | Prior-year inboekingen must respect statutory calendar deadlines. | YES | NEA-OPS-001 |  | DIRECT LAW | Official Wm source identified; exact consolidated wording to reconfirm. | PARTIAL |
| SRC-WM-97 | title 9.7 / inboekbevoegdheid electricity | Electricity delivered to transport can be booked under rules elaborated by AMvB. | YES | NEA-ELIG-001 |  | DIRECT LAW | Official Wm source identified; Besluit article 10 reviewed. | COVERED |
| SRC-WM-97 | title 9.7 / verification coupling | Inboekverification timing must be reconciled with NEa deadline guidance. | YES | NEA-VER-001; NEA-VER-002 |  | DIRECT LAW | NEa verifier page says before 1 May; NEa electricity page says statement before 1 April. | CONFLICT |
| SRC-BEV | article 1 definitions | `bemeterd leverpunt`, `aangeslotene`, `aansluiting`, `allocatiepunt`, ERE-E, and reasonable assurance are defined in the system context. | YES | NEA-EAN-001; NEA-MID-001; NEA-VER-007 |  | DIRECT LAW | Staatsblad 2026, 117 relevant definitions reviewed. | COVERED |
| SRC-BEV | article 10 electricity | Electricity booking requires eligible delivery via allowed electricity constructs and measured delivery point. | YES | NEA-MID-001; NEA-ELIG-001 |  | DIRECT LAW | Staatsblad 2026, 117 article 10 explanation and NEa electricity page reviewed. | COVERED |
| SRC-BEV | article 10 IDV explanation | IDV is not the customer-side aangeslotene; customer-side delivery requirements remain applicable to the mandating customer. | YES | NEA-ORG-006; NEA-EAN-001 |  | DIRECT LAW | 2026 Besluit explanation explicitly addresses IDV role. | COVERED |
| SRC-BEV | article 10 destinations | Rail is excluded; walstroom expires from 2030; eligible scope includes specified transport contexts. | YES | NEA-ELIG-005 |  | DIRECT LAW | Besluit explanation and NEa electricity destination list reviewed. | COVERED |
| SRC-BEV | article 10 renewable/direct line | 100% renewable electricity requires same-address generation or direct-line conditions and excludes biomass/biogas sources. | CONDITIONAL | NEA-KWH-005 |  | DIRECT LAW | Besluit explanation and NEa renewable section reviewed. | COVERED |
| SRC-BEV | article 10 backfeed | Electricity fed back from vehicle/vessel to grid must not be booked. | CONDITIONAL | NEA-KWH-006 |  | DIRECT LAW | Besluit explanation and Regeling electricity data fields reviewed. | COVERED |
| SRC-BEV | articles 15 and 23 | Verifier/protocol framework governs approval and reasonable assurance for inboekverificatie. | YES | NEA-VER-006; NEA-VER-007 |  | VERIFICATION EXPECTATION | Besluit explanation and NEa verifier page reviewed. | COVERED |
| SRC-REV | article 9 electricity | Quantity is determined by the meter at the measured delivery point, not by an external non-delivery-point meter. | YES | NEA-KWH-001; NEA-MID-001 |  | DIRECT LAW | Staatscourant 2026, 15748 article 9 explanation reviewed. | COVERED |
| SRC-REV | article 9 thresholds | IDV may satisfy the alternative threshold with 200 mandates; normal electricity threshold is 2 million kWh. | YES | NEA-ORG-002 |  | DIRECT LAW | Staatscourant explanation reviewed. | COVERED |
| SRC-REV | article 9 mandate period | IDV mandates must be for at least one full calendar year or multiples of full calendar years. | YES | NEA-MAND-004 |  | DIRECT LAW | Staatscourant explanation reviewed. | COVERED |
| SRC-REV | article 9 duplicate prevention | Same customer/location/connection cannot use multiple IDVs for the same calendar year. | YES | NEA-EAN-004 |  | DIRECT LAW | Staatscourant explanation reviewed. | COVERED |
| SRC-REV | bijlage 3 electricity fields | IDV booking data must include per customer/EAN quantity, mandate issue date, validity period, and enterprise mandate. | YES | NEA-BOOK-005 |  | DIRECT LAW | Staatscourant bijlage 3 electricity fields reviewed. | COVERED |
| SRC-REV | bijlage 8 section E | Verifier must understand administrative processes and relevant physical situations. | YES | NEA-VER-003; NEA-AUD-001 |  | VERIFICATION EXPECTATION | Staatscourant bijlage 8 section E reviewed. | COVERED |
| SRC-REV | bijlage 8 section E | Verifier performs sample location visits and checks allowed constructs, MID/conformity, quantities, and relevant source records. | YES | NEA-VER-003; NEA-VER-004; NEA-MID-003 |  | VERIFICATION EXPECTATION | Staatscourant bijlage 8 section E reviewed. | COVERED |
| SRC-REV | bijlage 8 section E | AO/IB and internal control processes are assessed. | YES | NEA-AUD-001 |  | VERIFICATION EXPECTATION | Staatscourant bijlage 8 section E reviewed. | COVERED |
| SRC-REV | bijlage 8 section E | Electricity purchase/sales bookkeeping and financial bookkeeping are checked where relevant. | YES | NEA-FIN-002 |  | VERIFICATION EXPECTATION | Staatscourant bijlage 8 section E reviewed. | COVERED |
| SRC-REV | bijlage 8 section E | Verification statement content requires inboeker/account data, work performed, visited locations/registers, quantities, assurance, judgment, and sufficient evidence statement. | YES | NEA-VER-007 |  | VERIFICATION EXPECTATION | Staatscourant bijlage 8 section E reviewed. | COVERED |
| SRC-NEA-ELEC | who may inbook | IDV is a company registered with KvK that books electricity for companies or individuals and must meet threshold. | YES | NEA-ORG-001; NEA-ORG-002 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-ELEC | aangeslotene / CAR | Customer must be aangeslotene; CAR, not energy contract alone, is control source. | YES | NEA-EAN-001; NEA-EAN-002 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-ELEC | allowed constructs | Exclusive main connection, secondary allocation point, or integrated MID meter are allowed constructs. | YES | NEA-MID-001; NEA-EAN-003 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-ELEC | MID | MID meter must be regulated, conforming, marked, and integrated for private customers; transition year applies only to existing business inbookers. | YES | NEA-MID-001; NEA-MID-002; NEA-MID-003 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-ELEC | transport eligibility list | Specific transport destinations are included/excluded; non-limitative doubts require NEa confirmation. | YES | NEA-ELIG-005 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-ELEC | renewable share | REV calculates renewable share; grid average for 2026 is 50.5%; 100% renewable requires strict evidence. | YES | NEA-KWH-005; NEA-BOOK-003 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-ELEC | REV data | REV registration requires delivery dates, type, connection name, EAN, quantity, address, explanation, and GvO where applicable. | YES | NEA-EAN-002; NEA-BOOK-005 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-ELEC | deadlines | Inbooking by 1 March, verification statement before 1 April, year-end on 1 April, and corrections until 1 March are stated. | YES | NEA-OPS-001; NEA-VER-002 |  | DIRECT NEA | NEa electricity page reviewed. | PARTIAL |
| SRC-NEA-ELEC | correction risk | NEa can correct incorrect inbookings up to five years after the relevant calendar year. | YES | NEA-COR-001; NEA-RET-001 |  | DIRECT NEA | NEa electricity page reviewed. | PARTIAL |
| SRC-NEA-ELEC | AO/IB examples | Permanent data, contracts, process descriptions, electricity purchase/sales records, charger kWh, and generation data may be requested. | YES | NEA-AUD-001; NEA-KWH-001; NEA-FIN-002 |  | DIRECT NEA | NEa electricity page reviewed. | COVERED |
| SRC-NEA-IDV | definition | IDV registers electricity for others in REV and receives EREs for the booking. | YES | NEA-ORG-006 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | KvK and threshold | IDV must be registered with KvK and meet 2 million kWh or 200 mandate threshold. | YES | NEA-ORG-001; NEA-ORG-002 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | written mandate | Companies and individuals must provide written mandates; each company, including subsidiaries, must authorize separately. | YES | NEA-MAND-001; NEA-MAND-003 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | responsibility | IDV is responsible for correct booking, good administration, annual independent verification, and enforcement consequences. | YES | NEA-ORG-004; NEA-VER-001; NEA-AUD-001 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | customer data/admin | IDV administration must show for which customers quantities were booked and that quantities match actual electricity delivered to transport. | YES | NEA-KWH-001; NEA-AUD-001 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | private evidence | Private customer proof examples include kWh/session evidence, charger-at-address evidence, connection ownership, MID, and mandate. | YES | NEA-CHG-002; NEA-MID-002; NEA-EAN-001; NEA-MAND-002 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | enterprise proof | Enterprise customers must meet normal electricity inbooking conditions and provide connection and mandate proof. | YES | NEA-MAND-003; NEA-EAN-001; NEA-ELIG-001 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | mandate private | Private mandate requires name, address, EAN, CAR permission, verifier location-check permission, issue date, and full calendar-year validity. | YES | NEA-MAND-002; NEA-MAND-004; NEA-MAND-005 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | mandate enterprise | Enterprise mandate requires legal identity, address, trade-register number, authorized signature, EANs, permissions, date, and validity. | YES | NEA-MAND-003; NEA-MAND-004; NEA-MAND-005 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-IDV | customer not NEa target | NEa does not communicate directly with IDV customers; IDV must facilitate customer location visits where needed. | YES | NEA-VER-004; NEA-ELIG-003 |  | DIRECT NEA | NEa IDV page reviewed. | COVERED |
| SRC-NEA-PART | private route | Private individuals arrange home-charging inbooking only through an IDV. | YES | NEA-ELIG-002 |  | DIRECT NEA | NEa private helpdocument reviewed. | COVERED |
| SRC-NEA-PART | private criteria | Private customer needs home charger, own connection, MID meter, with limited non-MID allocation-point exception. | YES | NEA-EAN-001; NEA-CHG-002; NEA-MID-001 |  | DIRECT NEA | NEa private helpdocument reviewed. | COVERED |
| SRC-NEA-PART | contract/full year | Private customer appoints one IDV at a time; contract is for at least a full calendar year and no mid-year switch. | YES | NEA-MAND-004; NEA-EAN-004 |  | DIRECT NEA | NEa private helpdocument reviewed. | COVERED |
| SRC-NEA-PART | no subsidy/fixed value | ERE is not subsidy, no fixed kWh price exists, and eligibility/payment cannot be guaranteed. | YES | NEA-ELIG-004; NEA-FIN-001 |  | DIRECT NEA | NEa private helpdocument reviewed. | COVERED |
| SRC-NEA-PART | checks | Only vehicle electricity may be booked; NEa and external verifiers check this. | YES | NEA-CHG-001; NEA-VER-001 |  | DIRECT NEA | NEa private helpdocument reviewed. | COVERED |
| SRC-NEA-VER | verification types | Inboekverificatie electricity is one of the HE verification types and applies to companies booking EREs. | YES | NEA-VER-001 |  | VERIFICATION EXPECTATION | NEa verifier page reviewed. | COVERED |
| SRC-NEA-VER | independent verifier | Verification is external and independent; institutions require ISO/IEC 17020 accreditation with correct scope. | YES | NEA-VER-006 |  | VERIFICATION EXPECTATION | NEa verifier page reviewed. | COVERED |
| SRC-NEA-VER | protocol | Each verification type requires a separate NEa-approved protocol; NEa uses the toetsingskader to assess protocols. | YES | NEA-VER-006; NEA-OPS-004 |  | VERIFICATION EXPECTATION | NEa verifier page reviewed. | PARTIAL |
| SRC-NEA-VER | result registration | Verification results must be registered in REV annually before 1 May. | YES | NEA-VER-002 |  | VERIFICATION EXPECTATION | NEa verifier page reviewed. | COVERED |
| SRC-NEA-IDV-LIST | list status | NEa list publication is not REV account proof, quality assessment, approval, or accreditation. | CONDITIONAL | NEA-ORG-005 |  | DIRECT NEA | NEa list page reviewed. | COVERED |
| SRC-NEA-IDV-LIST | monthly list / expiry | Monthly list mechanics and planned expiry from October 2026 are operational publication details. | CONDITIONAL |  |  | DIRECT NEA | NEa list page reviewed. | NOT APPLICABLE |
| SRC-NEA-REV | register access | REV is the online register; public REV app itself requires JavaScript and was not content-readable. | YES | NEA-ORG-003; NEA-BOOK-004 |  | DIRECT NEA | NEa register info reviewed. | PARTIAL |
| SRC-NEA-REV-ROLES | account users | REV requires at least two account-authorized users; if fiattering is used, at least two fiatteurs and no self-approval. | YES | NEA-BOOK-006 |  | DIRECT NEA | NEa users roles page reviewed. | COVERED |
| SRC-NEA-REV-ROLES | four-eyes | Four-eyes is described as an optional REV safety measure, not a universal direct legal requirement. | YES | NEA-AUD-003; NEA-BOOK-006 |  | ENVAL INTERNAL CONTROL | NEa users roles page reviewed. | COVERED |
| SRC-NEA-HANDH | enforcement instruments | NEa may use corrective and punitive instruments, including official correction, account/facility blocking, warning, and fine. | YES | NEA-ORG-004; NEA-COR-001; NEA-RET-001 |  | DIRECT NEA | NEa handhavingsinstrumenten page reviewed. | COVERED |
| SRC-NEA-TKV | entire 10-page document | Official electricity TKV is accessible, stored as the single canonical immutable repository snapshot, fully read, hashed, and mapped clause-by-clause. | YES | NEA-OPS-004 |  | VERIFICATION FRAMEWORK | Official page and 832788-byte PDF retrieved 2026-07-21; repository path, SHA-256 and page count recorded. | COVERED |
| SRC-NEA-TKV | clauses 3.0.1-3.3.6 | All nineteen present protocol clauses are mapped to stable requirements and architecture/implementation dispositions. | YES | NEA-VER-003-NEA-VER-017; NEA-RET-003; existing domain IDs |  | VERIFICATION FRAMEWORK | Clause matrix below; exact source pages and headings recorded. | COVERED |
| SRC-NEA-TKV | numbering after 3.3.4 | The source shows 3.3.6 directly after 3.3.4. | YES | NEA-VER-017 |  | VERIFICATION FRAMEWORK | Page 10 visually/textually reviewed; no 3.3.5 appears. | COVERED |

## Official Electricity TKV Clause Inventory And Mapping

Source classification rule: the official NEa page says this framework contains no new requirements compared with the Wm, Besluit, and Regeling. Each clause is therefore classified `VERIFICATION FRAMEWORK`; a `DIRECT LAW reference` column records explicit legal anchors without relabeling the clause itself as law. ENVAL-derived workflow safeguards remain `ENVAL INTERNAL CONTROL` in the primary requirement catalog.

| clause_id | exact page | exact heading | concise official requirement | addressed actor | DIRECT LAW reference if explicit | classification | requirement IDs | ENVAL support obligation | verifier professional judgment boundary | component | database/evidence impact | workflow impact | test/proof requirement | current alignment | required documentation correction | implementation impact after GO | remaining external dependency |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3.0.1 | 2 | `dat verificaties worden uitgevoerd onder accreditatie tegen ISO/IEC 17020, werkveld hernieuwbare energie vervoer, onderdeel inboekverificatie elektriciteit` | Accredited verification; temporary designation based on accreditation application is limited to at most one calendar year. | VERIFICATEUR; RvA; NEa; MINISTER | Wm 9.7.4.12; Bev 22-23; Rev 17 | VERIFICATION FRAMEWORK | NEA-VER-006 | Preserve engagement, scope, accreditation/designation and protocol evidence. | Accreditation/schema evaluation, advice and approval are external decisions. | verifier engagement | engagement plus accreditation/designation/protocol evidence | eligibility gate before verifier work | expired/missing scope and one-year designation tests | NOT IMPLEMENTED | Remove blocked-source wording; add designation limit. | New verifier eligibility data/workflow. | verifier, RvA evaluation, NEa advice, ministerial protocol decision |
| 3.0.2 | 2 | `dat er een redelijke mate van zekerheid wordt gehanteerd ten aanzien van de in de inboekverificatieverklaring verantwoorde inboekingen elektriciteit in het register` | Verification reduces control risk to an acceptably low level for positive assurance. | VERIFICATEUR | Bev 23; Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-008; NEA-VER-007 | Supply complete evidence and control descriptions. | Assurance level and conclusion are verifier-only. | verification scope/plan | assurance objective and external conclusion provenance | plan intake and result intake | prove ENVAL cannot self-set assurance/result | NOT IMPLEMENTED | Add assurance boundary. | Store objective/result references, not a software judgment. | verifier methodology and conclusion |
| 3.0.3 | 2 | `wanneer afwijkingen materieel zijn, waarbij onderscheid wordt gemaakt tussen kwantitatieve en kwalitatieve afwijkingen` | Quantitative materiality is 2%; regulatory non-compliance is qualitatively material. De bepaling of een kwalitatieve afwijking van materieel belang is, is een kwestie van professionele oordeelsvorming van de verificateur. | VERIFICATEUR | Wm/Bev/Rev requirements being verified | VERIFICATION FRAMEWORK | NEA-VER-009; NEA-VER-005 | Supply populations and record external finding/materiality outcome. | 2% is not an ENVAL acceptance/eligibility rule; qualitative judgment is verifier-only. | risk/finding | external materiality record and qualitative finding | findings and statement blocker | negative tests against automatic 2% acceptance | NOT IMPLEMENTED | Explicitly prohibit 2% business-rule automation. | Finding fields and boundary tests. | verifier judgment |
| 3.0.4 | 2 | `welke informatie wordt vastgelegd ter documentatie van de verificaties en het gevolgde verificatieproces` | Dossier shows relevant steps, relationships, reasoning, detailed work, completeness and order. | VERIFICATEUR | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-010; NEA-AUD-002 | Provide indexed, versioned evidence and request/response chronology. | Professional reasoning/workpapers remain verifier-owned. | verification evidence pack | dossier index, provenance links, external workpaper refs | reconstruction/export | full-chain reconstruction proof | TARGET foundations only | Add verification-dossier boundary. | New pack/index model and exports. | verifier workpaper format/access |
| 3.0.5 | 2 | `dat alle gegevens en documentatie met betrekking tot de verificatie bewaard worden gedurende ten minste vijf jaar na afloop van het kalenderjaar waarin de verificatie is verricht` | Verification data/documentation and relevant supplied information retained at least five years after verification year-end. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER; ONDERNEMING/NATUURLIJKE PERSOON | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-RET-001; NEA-RET-003 | Apply verification-specific retention metadata and preservation obligations. | Verifier decides necessary dossier copies; clause does not set one period for unrelated data. | retention/evidence | category, purpose, period anchor, copy inventory | hold/export/expiry review | boundary and year-end retention tests | TARGET foundations only | Replace undifferentiated retention assumption. | Extend retention policies/actions. | legal basis, controller roles, verifier copy needs |
| 3.1.1 | 2 | `welke procedure gevolgd wordt voor de planning van de verificatiewerkzaamheden` | Protocol defines planning procedure. | VERIFICATEUR | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-011 | Support scheduling, request/response and plan versions. | Verifier owns planning method. | verification plan | plan metadata/version | planning request/acknowledgement | plan version and actor-boundary proof | NOT IMPLEMENTED | Add plan module. | New plan workflow after GO. | verifier process |
| 3.1.2 | 3 | `welke informatie verzameld wordt ter voorbereiding van de verificatiewerkzaamheden, en op basis waarvan de verificateur voorafgaand aan de verificatie kennis van de scope neemt` | Collect preparation information so verifier understands scope. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-003; NEA-VER-011 | Deliver scoped population, administration and evidence inventory. | Scope sufficiency remains verifier-only. | verification scope/evidence pack | scope version and evidence manifest | preparation request/response | completeness and provenance tests | NOT IMPLEMENTED | Add scope/preparation mapping. | New scope/pack records. | verifier information requests |
| 3.1.3 | 3 | `hoe het risico op materiële afwijkingen beoordeeld wordt met een risicoanalyse en welke risicofactoren hierin beoordeeld worden` | Risico's en risicofactoren worden gewogen en/of gekwalificeerd naar hoog, midden en laag. The dynamic analysis covers prior results, changes, connections, controls, competence, metering, AO/IB, CAPA, complexity, assumptions, raw data and sustainability status. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-012 | Maintain risk-input inventory and change triggers with provenance. | Risk weighting, classification and reassessment are verifier-only. | risk assessment | immutable external assessment versions plus ENVAL input snapshots | initial and triggered reassessment exchange | prove input completeness and no ENVAL risk decision | NOT IMPLEMENTED | Replace generic TKV blocker with full risk factors. | New risk-input/assessment records. | verifier professional judgment |
| 3.1.4 | 3-5 | `hoe, op basis van de risicoanalyse, de noodzaak en frequentie van het bezoek aan de locatie waar de inboeker zijn boekhouding heeft en de locaties waar de inboeker elektriciteit aan wegvoertuigen, mobiele machines, binnenschepen en zeeschepen in Nederland levert` | Visit bookkeeping location, sampled new locations, substantial-change locations and on-site generation; inspect meters, aangeslotene/constructs and renewable conditions. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER; ONDERNEMING/NATUURLIJKE PERSOON | Bev 10; Metrologiewet 1, 5(1)(c), 8; Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-004; NEA-EAN-001-003; NEA-MID-001-003; NEA-KWH-005; NEA-ELIG-001/005 | Preserve location, novelty/change, access, meter, construct and renewable evidence; schedule visits. | Final necessity/frequency and findings are verifier-only; no invented uniform cadence. | location visit | visit request/status, location/change/meter/evidence refs | risk-triggered visit support | new/substantial-change/on-site generation and refusal tests | NOT IMPLEMENTED; location/MID foundations partial | Add exact visit triggers and constructs. | New visit records/change detection; extend location evidence. | verifier selection, physical access, meter/conformity evidence |
| 3.1.5 | 5-8 | `hoe, op basis van de risicoanalyse, bepaald wordt welke controle-activiteiten uitgevoerd moeten worden en welke gegevens en informatie verzameld en beoordeeld moeten worden om een redelijke mate van zekerheid te bereiken` | Risk-based controls and samples cover booked/delivered kWh, meters, direct line/on-site generation, books, AO/IB, staff, mandates, GvO, subsidy and backfeed. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER; ONDERNEMING/NATUURLIJKE PERSOON; NEa | Rev 9(6), 9(8), 17/bijlage 8 E; Bev 10 | VERIFICATION FRAMEWORK | NEA-VER-003; NEA-VER-013; NEA-MAND-001-005; NEA-KWH-001/005/006; NEA-FIN-002; NEA-AUD-001 | Export complete population and requested evidence; preserve signed enterprise/private mandates and permissions. | Sample method/size/selection and evidence evaluation are verifier-only. | sample/evidence pack | population manifest, sample request/response, mandate/quantity/bookkeeping evidence | scoped evidence delivery and interviews | population completeness, mandate-field, GvO/subsidy/backfeed tests | Mostly NOT IMPLEMENTED; document/audit primitives partial | Add full control/evidence and mandate field set. | New sample/pack workflow and mandate extension. | verifier sample, DSO data, GvO/subsidy sources, customer cooperation |
| 3.1.6 | 8 | `welke onderdelen deel uitmaken van het verificatieplan` | Plan contains scope, client, personnel, assurance, materiality, legal articles, preparation/risk findings, programme, evidence, interviews, visits and schedule; shared with client. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-011 | Receive, version, acknowledge and support external plan. | Verifier owns plan and programme. | verification plan | immutable external plan/version and acknowledgement | plan share/acknowledge/change | required-field/version tests | NOT IMPLEMENTED | Add exact plan content. | New plan/version model. | verifier plan |
| 3.2.1 | 8 | `welke procedure gevolgd wordt voor de uitvoering van de verificatiewerkzaamheden` | Protocol defines execution procedure. | VERIFICATEUR | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-014 | Support status and requests. | Execution method is verifier-only. | verification execution | external status/provenance | controlled request/response | actor-boundary test | NOT IMPLEMENTED | Add execution boundary. | Workflow integration only. | verifier procedure |
| 3.2.2 | 8 | `hoe de verificatiewerkzaamheden gedocumenteerd worden` | Verification work is documented. | VERIFICATEUR | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-010; NEA-VER-014 | Preserve references, evidence responses and chronology. | Workpaper content remains verifier-owned. | evidence pack/execution | work references and evidence versions | evidence exchange | reconstruction/access tests | TARGET foundations only | Add execution-documentation link. | Extend pack/provenance. | verifier workpapers |
| 3.2.3 | 8 | `dat de verificatiewerkzaamheden overeenkomstig het opgestelde verificatieplan uitgevoerd worden` | Execute current plan; reassess relevant changes and document justified plan changes. | VERIFICATEUR | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-012; NEA-VER-014 | Detect and disclose relevant source/control/method/calculation changes; store plan revisions. | Verifier decides impact and changed work. | plan/change detection | plan versions and change reasons | reassessment/change exchange | stale-plan and change-provenance tests | NOT IMPLEMENTED | Add dynamic plan-change rule. | Change detection plus versioned plan support. | verifier reassessment |
| 3.3.1 | 8-9 | `welke procedure gevolgd wordt voor het afronden van de verificatiewerkzaamheden en de uitgifte van de inboekverificatieverklaring elektriciteit` | Statement has unique code, covers delivered/booked kWh and calendar year, goes to inboeker, and is not issued when requirements are unmet. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-015; NEA-VER-007 | Register external statement reference/outcome and blocked/no-statement state. | ENVAL neither issues the statement nor marks verification complete independently. | verification statement | external code, scope, quantities, year, outcome, provenance | external result intake | uniqueness, scope and no-self-verification tests | NOT IMPLEMENTED | Add statement and no-statement boundary. | New external result model. | verifier issuance |
| 3.3.2 | 9 | `hoe de resultaten van de verificatiewerkzaamheden gedocumenteerd worden` | Report work, conclusions, risks/errors, risk/plan/programme changes, materiality consideration and evidence sufficiency. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-016 | Receive immutable report/reference and route disclosed findings. | Conclusions/materiality/evidence sufficiency are verifier-only. | verification result/finding | report version, change rationale, conclusion refs | result intake/finding creation | report-field and provenance tests | NOT IMPLEMENTED | Add result-report mapping. | New result intake. | verifier report |
| 3.3.3 | 9 | `hoe tekortkomingen (materiële en niet-materiële afwijkingen) vastgesteld, vastgelegd en afgehandeld worden` | Communicate all findings; verifier may add work or request correction/CAPA; unresolved material deviations can prevent a statement. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER | Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-005; NEA-COR-001/002 | Track finding, response, correction/CAPA and statement-block status with history. | Finding severity, sufficiency, extra work and statement outcome are verifier-only. | finding/CAPA/correction | immutable finding, responses, actions, closure and external decision | communicate/respond/correct/review | unresolved-material finding blocks result; history tests | NOT IMPLEMENTED; correction/document primitives partial | Replace generic CAPA with exact boundary. | Extend finding/CAPA/correction targets. | verifier decision and customer/ops response |
| 3.3.4 | 9-10 | `welke onderdelen deel uitmaken van de inboekverificatieverklaring elektriciteit` | Statement includes inboeker/REV account, work/locations/registers, IDV mandate check, booked kWh, reasonable assurance, total judgment and sufficient evidence declaration; verifier manages it in REV. | VERIFICATEUR; INBOEKER; INBOEKDIENSTVERLENER | Wm 9.8.4.1; Rev 17/bijlage 8 E | VERIFICATION FRAMEWORK | NEA-VER-007; NEA-VER-015 | Prepare support fields and store external statement metadata/provenance. | Statement content, judgment, issuance and REV management remain verifier-only. | statement support/external result | support pack plus immutable external reference | pack handoff/result intake | field-completeness and actor-boundary tests | NOT IMPLEMENTED | Add exact fields and external REV owner. | New statement support/result tables. | verifier and REV |
| 3.3.6 | 10 | `welke procedure gevolgd wordt voor het melden van vermoedens van fraude aan de Nederlandse emissieautoriteit` | Verification institution reports suspected intentional inaccuracies, omissions or non-compliance to NEa. | VERIFICATEUR; NEa | Wm/Bev/Rev compliance context | VERIFICATION FRAMEWORK | NEA-VER-017 | Preserve restricted verifier-origin notification reference and support evidence only when lawfully shared. | Suspicion assessment and report are verifier-only; customer projection must not expose it. | fraud suspicion record | restricted reference, provenance, access log | external notification/reference intake | role/access/no-customer-leak tests | NOT IMPLEMENTED | Add fraud boundary and restricted record. | New restricted target record after GO. | verifier and NEa |

Clause inventory count: `19`.

Present clause IDs: `3.0.1`, `3.0.2`, `3.0.3`, `3.0.4`, `3.0.5`, `3.1.1`, `3.1.2`, `3.1.3`, `3.1.4`, `3.1.5`, `3.1.6`, `3.2.1`, `3.2.2`, `3.2.3`, `3.3.1`, `3.3.2`, `3.3.3`, `3.3.4`, `3.3.6`.

Source-numbering control: `3.3.5` is not shown in the official PDF. It is not inferred, reconstructed, or assigned a requirement.

Actor assignment counts count clause-to-actor mappings, so multi-actor clauses contribute to more than one actor:

| actor | mapped clauses |
|---|---:|
| VERIFICATEUR | 19 |
| INBOEKER | 10 |
| INBOEKDIENSTVERLENER | 10 |
| ONDERNEMING/NATUURLIJKE PERSOON | 3 |
| NEa | 3 |
| RvA | 1 |
| MINISTER | 1 |

### Mandatory Subject Coverage Index

| required subject | clause/page | requirement mapping | explicit boundary or support mapping |
|---|---|---|---|
| ISO/IEC 17020 en tijdelijke aanwijzing | 3.0.1 / p.2 | NEA-VER-006 | accreditation scope; temporary designation based on application, maximum one calendar year; external RvA/NEa/minister chain |
| redelijke mate van zekerheid | 3.0.2 / p.2 | NEA-VER-008; NEA-VER-007 | ENVAL supplies evidence; verifier determines assurance and conclusion |
| kwantitatieve materialiteit van 2% | 3.0.3 / p.2 | NEA-VER-009 | verification materiality only; never automatic eligibility, dossier, evidence or booking acceptance |
| kwalitatieve afwijkingen | 3.0.3 / p.2 | NEA-VER-009; NEA-VER-005 | De bepaling of een kwalitatieve afwijking van materieel belang is, is een kwestie van professionele oordeelsvorming van de verificateur. |
| verificatiedossier | 3.0.4 / p.2 | NEA-VER-010 | ordered, complete, reconstructable steps, reasoning, work and evidence links |
| bewaartermijn van minimaal vijf jaar | 3.0.5 / p.2 | NEA-RET-003; NEA-RET-001 | verification data/documentation after verification calendar year; not a blanket period for unrelated data |
| voorbereiding en scope | 3.1.1-3.1.2 / pp.2-3 | NEA-VER-011; NEA-VER-003 | versioned scope/population and request/response support |
| risicoanalyse | 3.1.3 / p.3 | NEA-VER-012 | external verifier assessment linked to ENVAL input snapshot |
| risicofactoren | 3.1.3 / p.3 | NEA-VER-012 | prior results, changes, connections, control system, roles, metering, AO/IB, CAPA, data complexity, assumptions, raw-data processing and sustainability status |
| hoog, midden en laag | 3.1.3 / p.3 | NEA-VER-012 | Risico's en risicofactoren worden gewogen en/of gekwalificeerd naar hoog, midden en laag; de classificatie blijft van de verificateur. |
| dynamische herbeoordeling | 3.1.3 and 3.2.3 / pp.3,8 | NEA-VER-012; NEA-VER-014 | before/during planning and sampling and before statement; change-triggered reassessment |
| locatie van de boekhouding | 3.1.4 / pp.3-5 | NEA-VER-004 | bookkeeping location must be visited; ENVAL supports access/status |
| nieuwe locaties | 3.1.4 / pp.3-5 | NEA-VER-004 | sampled during initial investigation; verifier selects sample |
| substantiële wijzigingen | 3.1.4 and 3.2.3 / pp.3-5,8 | NEA-VER-004; NEA-VER-014 | location/change history triggers verifier reassessment/visit decision |
| meterbetrouwbaarheid en nauwkeurigheid | 3.1.4 / pp.4-5 | NEA-MID-001-003; NEA-VER-004 | concrete meter/location evidence; verifier performs visit check |
| hoedanigheid van aangeslotene | 3.1.4-3.1.5 / pp.4-7 | NEA-EAN-001; NEA-ORG-006 | customer-side truth and verifier check, not inferred from ENVAL account |
| aansluitings-/allocatiepuntconstructen | 3.1.4-3.1.5 / pp.4-7 | NEA-EAN-002-003; NEA-MID-001 | explicit construct decision and evidence; no automatic acceptance |
| geregeld meetinstrument | 3.1.4-3.1.5 / pp.4-6 | NEA-MID-001-003 | regulated meter evidence tied to concrete asset/period |
| conformiteitsbeoordeling | 3.1.4-3.1.5 / pp.4-6 | NEA-MID-002-003 | validity and provenance required |
| voorgeschreven merktekens | 3.1.4-3.1.5 / pp.4-6 | NEA-MID-001-003 | visual/documentary proof made available for verifier review |
| openbaar vervoer | 3.1.4-3.1.5 / pp.4-7 | NEA-ELIG-005; NEA-MID-001 | dedicated connection/allocation construct and quantity evidence |
| verwisselbare accu’s | 3.1.4 / p.4 | NEA-ELIG-005 | eligible-construct evidence; verifier check |
| binnenschepen en zeeschepen | 3.1.4-3.1.5 / pp.3-7 | NEA-ELIG-001/005 | transport destination, battery/electrolyte and quantity evidence |
| directe lijn | 3.1.4-3.1.5 / pp.4-7 | NEA-KWH-005; NEA-ELIG-001 | source, delivery and quantity relationship evidence |
| opwek op locatie | 3.1.4-3.1.5 / pp.5-7 | NEA-KWH-005 | generation/meter/quantity provenance and mandatory visit context |
| garanties van oorsprong | 3.1.5 / p.6 | NEA-KWH-005 | validity end date must cover delivery-period end; verifier checks external evidence |
| exploitatiesubsidie | 3.1.5 / pp.6-7 | NEA-KWH-005; NEA-ELIG-001 | evidence that booked quantity received no prohibited operating subsidy |
| teruglevering | 3.1.5 / p.7 | NEA-KWH-006 | deducted from final booked quantity where applicable |
| steekproefgrootte | 3.1.5 / p.5 | NEA-VER-013 | verifier calculates from risk profile; ENVAL does not automate official size |
| steekproefselectie | 3.1.5 / p.5 | NEA-VER-013 | external selection linked to immutable population |
| hoeveelheid ingeboekte elektriciteit | 3.1.5 and 3.3.1/3.3.4 / pp.5-10 | NEA-KWH-001; NEA-VER-013/015; NEA-VER-007 | population/support pack and external statement field |
| hoeveelheid geleverde elektriciteit | 3.1.5 and 3.3.1 / pp.5-9 | NEA-KWH-001; NEA-VER-013/015 | measured delivery and booked quantity reconciled by verifier |
| in- en verkoopboekhouding | 3.1.5 / pp.6-7 | NEA-VER-003; NEA-FIN-002 | scoped evidence/export for verifier review |
| financiële boekhouding | 3.1.5 / pp.6-7 | NEA-VER-003; NEA-FIN-002 | scoped evidence/export; no assumption that all finance is customer-visible |
| administratieve organisatie | 3.1.3 and 3.1.5 / pp.3,6-7 | NEA-AUD-001; NEA-VER-003/012 | AO description and risk-input/evidence pack |
| interne beheersing | 3.1.3 and 3.1.5 / pp.3,6-7 | NEA-AUD-001; NEA-VER-003/012 | control descriptions/evidence; verifier evaluates effectiveness |
| medewerkersinterviews | 3.1.5-3.1.6 / pp.6-8 | NEA-VER-003; NEA-VER-011 | staff list/access/planning support; verifier determines interviews |
| eisen voor inboekdienstverleners | 3.1.5 / pp.7-8 | NEA-MAND-001-005; NEA-VER-003/013 | initial establishment visit and exact mandate-control evidence |
| machtiging onderneming | 3.1.5 / p.7 | NEA-MAND-001/003-005 | legal name, establishment address, trade-register number, authorized name/signature, EAN, two permissions, issue date and calendar-year validity |
| machtiging natuurlijke persoon | 3.1.5 / pp.7-8 | NEA-MAND-001/002/004/005 | aangeslotene name/signature, address/EAN, two permissions, issue date and calendar-year validity |
| EAN | 3.1.5 / pp.7-8 | NEA-MAND-002/003; NEA-EAN-001-003 | required mandate/connection identifier with period/provenance |
| distributiesysteembeheerdercontrole | 3.1.5 / pp.7-8 | NEA-MAND-005 | signed permission for NEa to request connection data |
| toestemming voor locatiecontrole | 3.1.5 / pp.7-8 | NEA-MAND-005; NEA-VER-004 | signed permission for verifier check; visit decision remains external |
| datum en geldigheidsduur in kalenderjaren | 3.1.5 / pp.7-8 | NEA-MAND-004 | issue date and at least one whole calendar year |
| verificatieplan | 3.1.6 / p.8 | NEA-VER-011 | exact required plan fields, version and acknowledgement |
| wijzigingen in risicoanalyse/plan | 3.2.3 and 3.3.2 / pp.8-9 | NEA-VER-012/014/016 | reasoned immutable versions and result-report rationale |
| unieke verificatieverklaringscode | 3.3.1 / p.9 | NEA-VER-015 | externally issued unique code; ENVAL records reference only |
| inhoud van de verklaring | 3.3.4 / pp.9-10 | NEA-VER-007/015 | inboeker/REV account, work, locations/registers, mandate check, kWh, assurance, total judgment and sufficient evidence |
| geen verklaring bij niet-naleving | 3.3.1 and 3.3.3 / p.9 | NEA-VER-005/015 | externally issued no-statement/block outcome; no ENVAL substitute |
| bevindingen | 3.3.2-3.3.3 / p.9 | NEA-VER-005/016 | immutable external finding, communication and response history |
| correcties | 3.3.3 / p.9 | NEA-VER-005; NEA-COR-001 | history-preserving correction linked to finding |
| correctieve acties | 3.3.3 / p.9 | NEA-VER-005; NEA-COR-002 | ENVAL response/CAPA; verifier decides sufficiency and statement effect |
| fraudevermoedens | 3.3.6 / p.10 | NEA-VER-017 | verifier reports to NEa; ENVAL holds only restricted external reference/support provenance |

## Coverage Counts

Source anchors assessed: 77, including 19 clause-level TKV mappings.

- COVERED: 70
- PARTIAL: 5
- MISSING: 0
- CONFLICT: 1
- NOT APPLICABLE: 1

## Conflict Identification

| conflict_id | source_anchor | requirement | document_line_or_row | nature_of_conflict | impact | required_correction |
|---|---|---|---|---|---|---|
| REG-CONFLICT-001 | `SRC-WM-97` title 9.7 / verification coupling; `SRC-NEA-ELEC` deadlines; `SRC-NEA-VER` result registration | `NEA-VER-002`; `NEA-OPS-001` | Coverage rows for `SRC-WM-97`, `SRC-NEA-ELEC`, and `SRC-NEA-VER` | Official NEa electricity guidance states verification statement before 1 April, while the verifier guidance states verification results must be registered in REV before 1 May. This may be a statement-versus-registration distinction, but it is not resolved in this audit. | Year-end controls, verifier pack timing, REV runbook, customer settlement timing, and architecture gates cannot be finalized on one deadline only. | Keep both dates visible until confirmed. Requirements must distinguish inbooking deadline, possession/submission of verification statement, REV result registration, and year-end closure. |

## Requirement Corrections Made

Added requirement IDs:

- `NEA-ORG-005`: NEa list is not approval, accreditation, REV account status, or quality assessment.
- `NEA-ORG-006`: role-bound assessment as inboekdienstverlener; customer-side delivery requirements remain applicable.
- `NEA-KWH-006`: vehicle/vessel backfeed must be excluded.
- `NEA-ELIG-005`: transport-destination eligibility and exclusions.
- `NEA-BOOK-005`: IDV-specific REV input fields per customer/EAN and mandate.
- `NEA-BOOK-006`: REV user-role governance.
- `NEA-VER-006`: external accredited verifier and NEa-approved protocol.
- `NEA-VER-007`: verification statement support pack.
- `NEA-VER-008` through `NEA-VER-017`: assurance, materiality, dossier, planning, risk, sampling, execution/change, statement, result-report, and fraud-notification boundaries.
- `NEA-RET-003`: TKV-specific verification-data/document retention of at least five years after the verification calendar year.

Requirements materially corrected by the 2026-07-21 TKV mapping:

- `NEA-MAND-001` through `NEA-MAND-005` now carry the exact enterprise/natural-person fields, DSO and verifier permissions, signatures, issue date, and calendar-year validity from TKV 3.1.5.
- `NEA-VER-003` through `NEA-VER-007` now contain the complete evidence-pack, visit, finding/CAPA, accreditation/designation, and external-statement boundaries.
- `NEA-RET-001` now distinguishes verification retention from category-specific customer/operational retention.
- `NEA-OPS-004` now records a passed source-integrity/change-control gate, not a source-access blocker.

Reclassified requirement types:

- `LAW` became `DIRECT LAW`.
- `NEA GUIDANCE` became `DIRECT NEA`.
- `INTERNAL CONTROL` became `ENVAL INTERNAL CONTROL`.
- `CAPA` owner/due-date governance was explicitly marked as ENVAL internal control where no direct article was identified in this audit.

## Internal Controls That Are Not Direct Legal Musts

These controls may remain hard ENVAL controls, but must be described as internal controls, not direct statutory commands:

- four-eyes for ENVAL critical decisions;
- CAPA owner, due date, response, closure, and re-verification workflow;
- raw/normalized metering-data separation;
- immutable internal audit trail and append-only correction events;
- Supabase `service_role` server-only boundary;
- RLS and minimum-privilege implementation choices;
- detailed historization choices beyond source-specified period and validity requirements.

These controls are retained only as: `ENVAL INTERNAL CONTROL - chosen to satisfy or evidence requirement X`.

## Open Legal Or Source Questions

- `SRC-NEA-TKV` access and clause mapping are complete. Future source-version changes remain subject to `NEA-OPS-004` change control.
- Current consolidated Wetten.nl article text for `SRC-WM-97`, `SRC-BEV`, and `SRC-REV` must be reconfirmed before implementation; official amendment publications and relevant passages were reviewed but not a full consolidated export.
- `REG-CONFLICT-001`: the NEa electricity page mentions a verification statement before 1 April, while the verifier page states verification results before 1 May. This may be a distinction between possession of a statement and REV result registration, but must be confirmed.
- Exact retention schedule remains partial: TKV 3.0.5 fixes the verification-data/document minimum, but legal basis, controller roles, copying, access and periods for other customer/operational categories require legal review.
- Exact REV import/API/screen fields and operational account setup must be confirmed once REV access is available.
- Verifier availability, ISO/IEC 17020 scope, any temporary designation, approved protocol version, RvA evaluation, ministerial decision, workpaper exchange, and professional methods remain external dependencies.

## Completeness Verdict

OFFICIAL ELECTRICITY TKV ACCESS VERDICT: PASS

OFFICIAL ELECTRICITY TKV CLAUSE COVERAGE VERDICT: PASS

REGULATORY CONFORMANCE VERDICT: PARTIAL — ELECTRICITY TKV COMPLETE; CONSOLIDATED LAW RECONFIRMATION, DEADLINE INTERPRETATION, RETENTION LEGAL ANALYSIS, REV DETAILS, AND EXTERNAL VERIFIER READINESS REMAIN OPEN

All ten official TKV pages and all nineteen present numbered clauses are mapped. The source numbering contains no 3.3.5 and no replacement clause has been invented. This closes only the electricity-TKV source-access and clause-coverage blocker. It does not approve target architecture or implementation.
