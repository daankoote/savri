# Pilot Signup Document-First Architecture 01

Status: TARGET ARCHITECTURE — BOUNDED DOCUMENT-FIRST FRONTEND CURRENT PROVEN LOCAL ONLY

Product decision: DOCUMENT-FIRST — CONFIRMATION-LED — GAP-DRIVEN — AUDIT-TRACEABLE

Date: 2026-08-04.

## 0. Authority, Scope And Truth Boundary

This document remains the executable document-first UI target architecture. The bounded five-step
frontend state, selectors, composition, confirmation matrix and gap rendering
are `CURRENT PROVEN — LOCAL ONLY` through
`pilot-signup-document-first-ui-01-local-proof.md`. Persistence, finalization,
promotion, signing and every backend, remote, legal or verifier outcome remain
`TARGET` or open unless a narrower owning contract says otherwise.

09C0 convergence override: quarantine and `typed_name_otp_v1` finalization are
now CURRENT PROVEN locally under their narrower owning contracts. The exact
post-signing target is `contracts/intake-verification-promotion.md`; its
server-only case promotion and `SUPERSEDED` separate email-verification trigger
override older persistence/endpoint wording below.

The source order is:

1. applicable law and regulation;
2. the local official ten-page TKV source `docs/app/sources/official/nea/2026-07-09_toetsingskader-verificatieprotocol_inboekverificatie_elektriciteit.pdf`, SHA-256 `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`;
3. `05`, `06`, `06A`, `07`, `08` and their target database appendix;
4. focused repository contracts;
5. this product architecture.

The official TKV source requires, for the mapped mandate, exact party, signer, address, EAN, issue-date, calendar-year and permission facts. For enterprises it additionally requires legal name, establishment address, trade-register number and the name/signature of an authorized representative. It does not prove that an uploaded, parsed or customer-confirmed document is accepted evidence, that a signer is authorized, or that ENVAL may make an external verifier decision.

The truth transition is fixed:

| layer | actor/source | meaning | forbidden promotion |
|---|---|---|---|
| selected | browser/customer | a file or value was selected | selected is not observed, declared or accepted |
| observed/derived | versioned parser or external adapter | a source produced a bounded observation with provenance | parser output never overwrites customer declaration or core truth |
| declared | customer confirmation or customer fallback entry | the customer asserts this value for this exact semantic role | declaration is not identity, authority, evidence or verifier acceptance |
| evaluated | authorized internal or external reviewer | a qualified actor evaluated a pinned declaration/evidence version | support review is not official verifier judgment |
| accepted/rejected | decision owner named by the relevant contract | a versioned decision applies to an exact scope and period | frontend, parser, Auth, account role and generic consent never create acceptance |

Status vocabulary in this document is exact:

| status | meaning |
|---|---|
| `CURRENT PROVEN` | source plus bounded local proof exists for the named capability only; it makes no browser, remote, production, legal or verifier claim |
| `PARTIAL` | some required layers exist, but the complete target flow or authority is absent |
| `TARGET` | intended contract with a demonstrated destination; implementation is not thereby started or approved |
| `UNKNOWN` | a required product, legal, source, provider or verifier decision is unresolved |
| `ORPHAN` | a current or proposed value lacks a complete source-to-destination flow and must remain hidden/removed |

`CURRENT PROVEN` examples include the bounded document-first frontend
source/model proof, existing client parser/fixture proofs, the current
mapper/submit proofs and separately proven local schema primitives cited by
their owning contracts. None proves persistence, signing, a successful signup,
browser acceptance or the document-first journey end to end.

Customer-facing projections may show declared values and safe decision statuses. They may not expose confidence scores, extraction methods, candidate arrays, page coordinates, hashes, storage paths, parser versions, rejection reasons, raw provider responses, internal reviewer reasoning or verifier workpapers.

## 1. Exacte journey per stap

Only the following five top-level steps are visible. Each step has one `eyebrow`, one compact `h2`, at most one short helper sentence, and only the blocks defined here. Any customer-facing helper or action text not already present in source is `COPY DECISION REQUIRED`.

### Stap 1 — Account

Block order:

1. account-type control;
2. minimal account fields;
3. one continue action.

| audience | field | why it cannot reliably come from the scoped documents | destination | status |
|---|---|---|---|---|
| everyone | `accountType` with existing choices `particulier`, `zakelijk`, `vve` | it is an explicit legal/product route choice; document layout or a displayed name cannot decide the customer's intended legal role | intake route, later case/party composition | PARTIAL: current route and payload exist; target role separation does not |
| everyone | account email, existing label `E-mail` | it is a credential/contact channel that must be supplied and verified; an email printed on a document need not belong to the account controller | `app_signup_intakes.email_normalized`, then identity/contact binding after verification | PARTIAL |
| Zakelijk | legal organization name, existing label `Bedrijfsnaam` | an energy or charger document may show a trade name, supplier-side abbreviation, buyer or another contract party; none conclusively selects the account's legal party | declared organization profile; later evaluated legal entity | PARTIAL |
| Zakelijk | trade-register number, existing label `KVK nummer` | it is frequently absent and must never be inferred from a name match; a printed number is still only observed until confirmed and externally checked | declared organization profile; later KvK external reference/decision | PARTIAL |
| VvE | legal organization name, existing label `VVE naam` | a manager, administrator, complex name or invoice addressee may differ from the VvE legal party | declared organization profile; later evaluated legal entity | PARTIAL |
| VvE | trade-register number, existing label `KVK nummer` | it is not guaranteed to be present and does not by itself prove the VvE, board, manager or signer's authority | declared organization profile; later KvK external reference/decision | PARTIAL |

No extra Step 1 field is required for `Particulier`. The private legal-party name is first observed from a document and confirmed in Step 3, or collected once as a Step 4 gap. It is not collected in Step 1 and then asked again.

Step 1 consciously does not ask for a telephone number, address, contact-person name, representative/manager role, signer, EAN, supplier, contract dates, network operator, charger attributes, MID, serial number, installer, installation date, solar-panel state, backend supplier, evidence decision, authority, mandate clauses or signature. Contact, party, representative and signer remain separate; a missing role is never filled from another role.

The current backend requires private first/last name at submit and the current frontend requires applicant/bestuurder names for all account types. The target therefore needs a contract change before Step 1 can be implemented; the architecture does not pretend the current submit path already accepts this minimal basis.

### Stap 2 — Documenten

Block order:

1. location tabs;
2. active-location energy-document slot;
3. charger list inside that location;
4. one charger-document slot per charger;
5. scoped add-location/add-charger controls where allowed.

Each location receives a stable opaque `clientLocationId`. Each charger receives a stable opaque `clientChargerId` and is owned by exactly one location in the draft. Changing tabs changes only the active projection; it never rebinds a charger or document. Moving a charger between locations is not a target action. Correction is remove-and-add before signing or versioned correction after submit.

`Particulier` starts with one location and one charger. Zakelijk and VvE start with one of each and may add more. Tabs use the existing `SignupLocationTabs` behavior and labels `Locatie 1`, `Locatie 2`, and so on until a confirmed location supplies an approved customer-safe label. A location cannot be removed when it is the only location; a charger cannot be removed when it is the only charger for that location.

The energy-document slot occurs once per location. The charger-document slot occurs once per charger. A single file is never silently shared across locations or chargers. If the same physical file is intentionally selected twice, each binding and later evidence version remains explicit and auditable.

| state | trigger | visible result | available action | progression |
|---|---|---|---|---|
| empty | no file selected | existing text `Nog geen document gekozen`; additional copy `COPY DECISION REQUIRED` | select file | blocked for that required slot |
| parsing | supported file selected and extraction running | existing text `Documentgegevens worden lokaal uitgelezen…` | replace/cancel semantics: `COPY DECISION REQUIRED` | blocked until terminal state |
| success | bounded displayable facts produced | success label: `COPY DECISION REQUIRED`; show no facts yet in Step 2 | continue or replace | eligible for Step 3 |
| ambiguity | multiple candidates or unreliable semantic binding | customer text and action label: `COPY DECISION REQUIRED` | continue to exact Step 3 choice or replace | blocked only for required unresolved facts |
| failure | unsupported, malformed or no reliable facts | existing text `We konden geen betrouwbare gegevens uit dit document halen.` | replace file or proceed to Step 4 fallback | not accepted as evidence; progression depends on required gaps |

The customer sees none of the technical parser information listed in section 0. File selection and client parsing are not upload confirmation. The current signup keeps files only in browser memory; target pre-auth quarantine transport and promotion must exist before the UI may claim a document was saved.

### Stap 3 — Controleren

Step 3 shows one active location at a time. Within it, energy facts precede charger facts grouped by charger. A confirmed row becomes compact read-only declared summary and is not rendered again as an input. A rejected, ambiguous or missing fact is routed to Step 4. Action labels not already sourced are `COPY DECISION REQUIRED`.

#### Energy-document review matrix

| customer label | parser fact | semantic role | customer action | comparison | severity | external verification later | payload/database destination |
|---|---|---|---|---|---|---|---|
| `EAN elektriciteit` | one displayable electricity `normalizedEan` | declared electricity connection identifier for this location | choose if multiple, then confirm; reject routes to fallback | other EAN candidates and later CAR/DSO result; never gas | blocking | yes | declared connection payload -> `app_connection_declaration_sources`; target accepted `app_connections`/periods after decision |
| gas alternative | `gasConnections[]` | excluded alternative, never an electricity connection | no confirmation; exclude and hide unless needed to explain that no electricity EAN was found | classification/context only | informational when surfaced; blocking if no electricity EAN remains | no for this signup fact | observed provenance only; never mapper/core connection payload |
| `Contracthouder` | `contractHolderName` | candidate mandating/connected party, not contact or signer | confirm exact party role or reject | Particulier natural-person candidate; Zakelijk/VvE declared legal organization | blocking | yes | declared party/profile; evaluated identity/organization and ownership remain separate |
| `Leveradres` | `deliveryAddress` | candidate service/charging location | confirm or reject | declared Step 1 contains no address; compare against other documents after first confirmation | blocking | yes | declared location/address observation; accepted target `app_locations` only after decision |
| `Energieleverancier` | `supplierName` | source-party observation; not customer, DSO or verifier | no customer declaration in this batch; read-only only when observed persistence exists | later energy-supplier external reference if required | informational | only if used downstream | target `app_extracted_observations`/`app_external_references`; current mapper destination absent |
| contract period | connection `validFrom`/`validTo` | claimed delivery/connection-source period | confirm, correct or reject when present; missing becomes gap only if required | same EAN and later external source period | blocking for a required period | yes | declared connection-period source -> target `app_connection_periods` |
| network operator | `electricityNetworkOperatorCandidate` only when reliably electricity-linked | claimed DSO for the EAN period | confirm/reject; do not show ambiguous candidate | same EAN and later DSO/CAR source | warning until confirmed; blocking only when required for submit | yes | declared connection-period source -> target `app_connection_periods`; external provenance separately |
| `KVK nummer` | parser fact only if actually present and semantically bound | observed trade-register number of the organization candidate | confirm/reject; otherwise Step 1 value remains the declaration | Step 1 organization and later KvK source | blocking for Zakelijk/VvE mismatch | yes | declared organization profile -> later legal-entity decision; current parser has no extractor/destination |

The exact customer label for contract period, network operator and any surfaced gas alternative is `COPY DECISION REQUIRED`. Rows without a current customer label are not implemented with invented copy.

#### Charger-document review matrix

| customer label | parser fact | semantic role | customer action | comparison | severity | external verification later | payload/database destination |
|---|---|---|---|---|---|---|---|
| `Merk` | `brand` | charger manufacturer declaration | confirm/reject | charger catalog normalized label only | blocking | later evidence review, not necessarily an external register | declared charger version -> target `app_chargers` |
| `Model` | `model` | charger model declaration | confirm/reject | model within confirmed brand | blocking | later evidence review | declared charger version -> target `app_chargers` |
| `MID` | `midNumber` | candidate meter conformity identifier, not conformity acceptance | confirm/reject | other charger document and later MID/certificate source | blocking | yes | declared meter candidate -> target `app_mid_meters`; evidence decision remains separate |
| `Serienummer` | `serialNumber` | charger or meter serial candidate; exact subject binding required | confirm/reject | subject-specific document facts | blocking when required for subject binding | yes when used in verification | declared charger/meter version; target subject split required |
| `Klant/contracthouder` | `customerName` | buyer/order party candidate, not automatically connected party or signer | confirm semantic role or reject | confirmed party and energy contract holder | blocking on conflict; otherwise warning | yes when ownership/authority relies on it | declared evidence relation; later party/ownership decision |
| `Locatie` | `location` | installation/delivery location candidate | confirm/reject | confirmed energy delivery location | blocking on conflict | yes | declared location relation; accepted target location remains separate |
| `Leverancier/installateur` | `supplierInstallerName` | observed commercial/source party | no customer declaration until a downstream use is approved | external reference when needed | informational | only if relied upon | target observation/external reference; current mapper destination absent |
| `Installatiedatum` | `installationDate` | exact installation date candidate | confirm/correct/reject | invoice date must not substitute; current declared installation year is only a weaker comparison | blocking when exact date is required | yes when used in eligibility/verification | target charger validity/version; current mapper has year only |
| factuurdatum | `invoiceDate` | source-document issue date, not installation date | no substitution; confirm only if a decided downstream rule requires it | document metadata and explicit installation date | informational by default | no, unless evidence freshness rule requires | target evidence observation/provenance; current mapper destination absent |

The existing label for invoice date is absent: `COPY DECISION REQUIRED`.

### Stap 4 — Ontbrekende gegevens

Step 4 contains no permanent questionnaire. It is an ordered list generated from unresolved required facts. A fallback appears exactly once and only when at least one of these reason codes is present:

| reason | exact condition | behavior |
|---|---|---|
| `missing` | required parser fact is absent or not displayable | render the fact's manual control |
| `ambiguous` | more than one eligible candidate remains or semantic binding is unreliable | render bounded choice when candidates are customer-safe; otherwise manual control |
| `rejected` | customer explicitly rejects the observed fact | preserve rejection provenance and render manual correction |
| `not_document_provable` | the scoped document cannot establish the fact's legal meaning | render a declaration/evidence request only if a destination and authority rule exist |
| `account_type_required` | Zakelijk/VvE requires KvK, signer or authority facts not resolved elsewhere | render only the applicable legal gap; never apply a role fallback |

Fallback order is: party/organization, location, EAN/period/network operator, charger identity, MID/serial, ownership/installation, contact/representation/authority. A field disappears from editable fallback after confirmation and is shown only as a compact declared summary with one correction action. Correction creates a new draft fact version and records the superseded source; it does not mutate the parser observation.

No fallback may render unless its registry entry defines: semantic role, reason, validator, mapper, payload key, database destination, audit event and correction model. If any one is absent, the field is `ORPHAN`, remains hidden, and blocks implementation rather than being posted as generic JSON.

Specific target dispositions:

- manual EAN is a fallback only after `missing`, `ambiguous` or `rejected`;
- address fields are fallback only after location observation cannot be confirmed;
- brand, model, MID, serial and installation date are per-charger fallbacks only;
- KvK number is already a Step 1 declaration and is not asked again; a mismatch requires explicit choose/correct behavior with `COPY DECISION REQUIRED`;
- representative, manager, signer and authority evidence appear only when the account type and exact acting-party relationship require them;
- supplier/installer, phone, backend supplier and solar-panel status do not become fallbacks without a separately approved destination/rule.

### Stap 5 — Ondertekenen

The signing review contains only these data groups, in this order:

1. party: exact natural person or legal organization and trade-register number where applicable;
2. signer: exact natural person, distinct from contact and representative unless an explicit same-person declaration and accepted authority support that relation;
3. locations: confirmed address/version references;
4. electricity EANs: exact confirmed EAN per location;
5. clause versions: immutable references and hashes for the two mapped permissions; customer text `COPY DECISION REQUIRED`;
6. fee, general terms and privacy: independently versioned acceptances, not one semantic mandate checkbox;
7. issue date and complete calendar-year scope once the legal/product decision exists;
8. signature evidence and immutable signed snapshot.

No legal clause text is authored here. Final Dutch mandate wording, electronic-signature evidence standard, calendar-year selection/renewal behavior, enterprise/VvE authority evidence and verifier acceptance are `UNKNOWN` / `COPY DECISION REQUIRED`. Until resolved, Step 5 cannot create an active or valid mandate. Generic `termsBundleAccepted`, `consent_bundle`, `fee_terms` or optional `mandate_authorization` acceptance is not the signed mandate/version required by target architecture.

## 2. Accounttypematrix

No cell implies another cell. `same person possible` always requires an explicit relation; it is never a fallback.

| account type | legal party | contact person | representative/manager | signer | contract holder/aangeslotene | document comparison target | KvK need | authority need | mandate need |
|---|---|---|---|---|---|---|---|---|---|
| Particulier | one natural-person party, declared after document confirmation or gap entry | account email controller; named contact only if separately needed | none for a validated self-action; third-party action is a separate, currently unapproved route | exact natural person; may be the party only after explicit self-action relation and required identity evidence | document contract holder and externally evaluated aangeslotene remain separate facts | confirmed natural-person party name, location and EAN | no | self-action evidence rules `UNKNOWN`; third-party authority blocked | yes: natural-person fields, two permissions, issue date, whole calendar years and signature |
| Zakelijk | exact organization party with legal name and KvK declaration | separate natural-person contact if needed; current applicant fields must not silently become this role | exact natural person plus separately evidenced, scoped, time-valid organization authority | exact natural person; authority must cover signing the ENVAL mandate and permissions | organization document holder and externally evaluated aangeslotene; not inferred from account ownership | legal organization, location/EAN and only then acting-person/authority evidence | yes | yes; KvK extract, title, email or contact role alone is insufficient | yes: enterprise fields, authorized representative, two permissions, issue date, whole calendar years and signature |
| VvE | exact VvE organization party with legal name and KvK declaration | separate contact; administrator/manager label proves no authority | exact natural person and VvE-specific authority route; manager and board-member routes remain unresolved | exact natural person with accepted VvE signing authority for this act | VvE document holder and externally evaluated aangeslotene; manager is not fallback | VvE legal party, location/EAN and later exact authority evidence | yes | yes; simple VvE route remains pending legal/register/verifier validation | yes: enterprise-form fields plus VvE authority, permissions, issue date, whole calendar years and signature |

## 3. Documentfactmatrix

The parser may produce more data internally, but only the facts below are in this journey contract. `customer confirmation = none` means the row remains observed/informational and may not silently become declared.

### Energy-document fact matrix

| fact | extraction requirement | customer-facing label | customer confirmation | comparison target | truth status after parse/confirm | audit provenance | fallback | external verification |
|---|---|---|---|---|---|---|---|---|
| electricity EAN | exactly 18 digits plus electricity or bounded unclassified context; exclude gas context | `EAN elektriciteit` | required selection/confirmation | location and later CAR/DSO | observed -> declared | evidence version, parser/version/run, source page/context, candidate set internally, actor/time confirmation | manual EAN | yes |
| gas EAN | recognize gas context only to exclude it | `COPY DECISION REQUIRED` if surfaced | none | exclusion against electricity candidates | observed/excluded only | same parser provenance and exclusion reason | never map as electricity; request electricity EAN | no |
| contract holder | one privacy-safe semantic holder candidate; ambiguous/multiple is not displayable | `Contracthouder` | required for candidate party | Particulier party or Zakelijk/VvE legal organization | observed -> declared party claim | evidence/parser provenance plus comparison and actor/time | exact party name | yes: identity/organization/ownership as applicable |
| delivery address | complete bounded address block with reliable semantic binding | `Leveradres` | required | location and charger location | observed -> declared location claim | evidence/parser provenance plus normalized and raw bounded values | structured address | yes |
| energy supplier | one semantic supplier candidate not confused with holder | `Energieleverancier` | none until a downstream rule is approved | later supplier external reference | observed only | evidence/parser provenance | none; hide when destination is absent | only if relied upon |
| contract period | period must bind to the selected electricity connection; start and end remain distinct | `COPY DECISION REQUIRED` | required only under approved connection-period rule | same EAN and external period | observed -> declared period | evidence/parser provenance plus exact date/value confirmation | date controls for missing/rejected component | yes |
| network operator | show only when uniquely and reliably linked to electricity, never ambiguous | `COPY DECISION REQUIRED` | required only under approved connection-period rule | same EAN and DSO/CAR source | observed -> declared DSO claim | evidence/parser provenance and ambiguity guard | manual bounded value only if rule/source approved | yes |
| KvK | exact 8 digits only when actually present and bound to holder organization; current extractor does not provide it | `KVK nummer` | compare/resolve against Step 1, never auto-overwrite | declared legal organization | observed -> retained declaration or corrected declared version | evidence/parser provenance plus explicit resolution | Step 1 value already exists; correction only | yes |

### Charger-document fact matrix

| fact | extraction requirement | customer-facing label | customer confirmation | comparison target | truth status after parse/confirm | audit provenance | fallback | external verification |
|---|---|---|---|---|---|---|---|---|
| brand | explicit invoice/product field; no low-confidence customer display | `Merk` | required | normalized catalog label | observed -> declared charger fact | evidence/parser run plus actor/time | catalog/manual brand control | evidence review later |
| model | explicit model bound to product/brand | `Model` | required | confirmed brand/model pair | observed -> declared charger fact | same | catalog/manual model control | evidence review later |
| MID | explicit MID candidate; preserve raw candidate internally but display only approved bounded value | `MID` | required | exact charge point/meter subject and later certificate source | observed -> declared meter candidate | same plus candidate rejection provenance internally | MID control | yes |
| serial number | explicit serial candidate distinct from MID | `Serienummer` | required when subject binding requires | charger/meter subject | observed -> declared subject fact | same | serial control | yes when relied upon |
| buyer/client | one bounded customer name candidate | `Klant/contracthouder` | exact semantic-role confirmation required | party and energy contract holder | observed -> declared evidence relation | same plus comparison result | party choice/name only once | yes when ownership/authority relies on it |
| installation/delivery location | complete unambiguous address block | `Locatie` | required | confirmed energy location | observed -> declared location relation | same | structured location fallback | yes |
| supplier/installer | explicit bounded field | `Leverancier/installateur` | none until destination/rule approved | later external reference | observed only | same | none; hide when no destination | only if relied upon |
| explicit installation date | explicit date label; never derive from invoice date | `Installatiedatum` | required under approved asset-period rule | charger validity and existing installation-year comparison | observed -> declared installation date | same | exact date control | yes when used in eligibility/verification |
| invoice date | explicit invoice-date label, stored separately | `COPY DECISION REQUIRED` | none by default | evidence issue date only | observed only | evidence/parser provenance | none unless a decided evidence rule requires it | only if freshness rule requires |

## 4. Veld-doorstroommatrix

Legend: `DF` means the proposed `documentFirst` target draft; `OBS` means immutable observed storage; `DECL` means immutable customer declaration/source; `DEC` means a separate evaluated/accepted decision. Proposed module names in this matrix are target files from implementation batches 1–3, not current files.

No `ORPHAN` row is a target-visible field. An ORPHAN must either receive the complete flow shown here in an approved implementation batch or remain hidden/removed.

| target field | status | source | parser observation | customer confirmation | draft path | validator | mapper/payload | Edge/RPC | database | dashboard | mandate | audit | correction/supersession |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| account type | PARTIAL | customer | none | direct declaration | `DF.account.type` | enum | `account.type` | intake finalize/promotion | intake -> customer/case composition; current dossier type is legacy | safe account route | selects mandate form only | intake/party event | new declaration version before signing; post-signing case correction |
| account email | PARTIAL | customer | none | `typed_name_otp_v1` email control, not document confirmation or Auth login | `DF.account.email` | normalized email | `account.email` | signing finalize; later server-only promote | `app_signup_intakes` -> promoted `app_customer_identities` -> later Auth bind | masked contact | none | signing proof, promotion, identity binding | identity change/rebind event; no party mutation |
| private party name | PARTIAL | energy document or gap | `contractHolderName` | required | `DF.party.name` | bounded natural-person name | `declarations.party` | finalize/promote | party/profile claim; current declaration source is partial | safe party summary | mandating party/signer candidate | observed + confirmed events | new claim/profile version |
| organization legal name | PARTIAL | Step 1 plus document comparison | holder/buyer candidate | Step 1 declaration; explicit mismatch resolution | `DF.organization.legalName` | bounded legal name | `declarations.organization` | finalize/promote | party/profile claim -> legal-entity decision | safe organization summary | mandating party | declaration/comparison/decision | new profile/decision version |
| KvK number | PARTIAL | Step 1; document only if actually present | TARGET extractor only | declaration and mismatch resolution | `DF.organization.kvkNumber` | 8 digits | `declarations.organization` | finalize/promote + later KvK adapter | party/profile claim -> `app_external_references`/legal entity decision | masked/safe organization summary | enterprise party field | declaration/source/review | new source and decision; never overwrite |
| contact person | UNKNOWN | explicit gap only when operationally required | none | direct role declaration | `DF.contact` | role-specific identity fields | `relationships.contact` | promotion/party service | customer-party/case-party relationship | safe contact summary | never signer/authority fallback | role asserted/confirmed | period-bound relationship version |
| representative/manager | UNKNOWN | explicit legal gap/evidence | possible observed evidence only | declaration does not accept authority | `DF.authority.claim` | approved route/scope only | authority claim/evidence refs | future authority service | representation authority/evidence model not schema-ready | plain status only | authority reference required when applicable | maker/checker/source trail | immutable version, withdraw/supersede |
| signer natural person | UNKNOWN | explicit Step 5 selection/declaration | none authoritative | explicit signer confirmation | `DF.signing.signer` | identity and role completeness | signing snapshot | future signing service | party/profile plus mandate-version signer ref | signed-copy status | exact signer | sign request/result | new mandate version; no signer overwrite |
| location document file | PARTIAL | customer file | parser consumes local bytes now | file selection is not confirmation | `DF.locations[id].energyDocument` | PDF/size/hash policy TARGET | intake file manifest | quarantine issue/upload/confirm then promote | `app_signup_intake_files` -> evidence file/version | file name and safe status | evidence ref only | issue/upload/confirm/promote | replacement creates new evidence version |
| location address | PARTIAL | energy observation or gap | `deliveryAddress` | required | `DF.locations[id].address` | structured NL address | `declarations.locations[]` | finalize/promote | declared address observation -> target `app_locations` DEC | safe declared/decision status | exact scoped location | observe/confirm/review | new address observation/decision; supersede |
| electricity EAN | PARTIAL | energy observation or manual gap | electricity candidate(s) | required exact choice | `DF.locations[id].connection.ean` | exactly 18 digits plus source exclusivity | `declarations.connections[]` | current v5 source can be reused/adapted | `app_connection_declaration_sources` -> target connection DEC | safe declared/decision status | exact EAN scope | candidate/confirmation/source/review | new declaration/period/decision version |
| gas EAN exclusion | TARGET | energy observation | gas candidate(s) | none | internal observation only | must never satisfy electricity validator | omitted | none for core submit | OBS only | hidden unless actionable error | excluded | parser/exclusion provenance | new observation run |
| energy contract holder | TARGET | energy observation | `contractHolderName` | required semantic role | `DF.locations[id].energy.contractHolder` | party-role match | party/evidence relation | finalize/promote | OBS + DECL relation; later ownership DEC | safe comparison outcome | party candidate only | observe/compare/confirm | new relation version |
| energy supplier | TARGET | energy observation | `supplierName` | none | OBS projection only | displayability | observation manifest only | parser persistence worker TARGET | `app_extracted_observations`/external ref | hidden unless approved informative projection | none | parser provenance | new observation/reference version |
| contract valid from/to | TARGET | connection-bound energy observation or gap | connection dates | required when rule approved | `DF.locations[id].connection.period` | ordered dates, partial-date rule | connection declaration period | finalize/promote | declared source -> `app_connection_periods` DEC | safe declared/decision status | supports period, not calendar-year mandate by inference | observe/confirm/review | new period version |
| network operator | TARGET | reliable energy observation or gap | unique electricity-linked candidate | required when rule approved | `DF.locations[id].connection.networkOperator` | bounded value/source rule | connection declaration | finalize/promote | declared source -> period/external ref DEC | safe declared/decision status | supports permission scope only | ambiguity/confirm/external review | new declaration/external reference |
| charger document file | PARTIAL | customer file | parser consumes local bytes now | selection is not confirmation | `DF.locations[id].chargers[id].document` | PDF/size/hash policy TARGET | intake file manifest | quarantine upload/confirm/promote | intake file -> evidence file/version | file name and safe status | evidence ref only | issue/upload/confirm/promote | new evidence version |
| charger brand/model | PARTIAL | charger observation or gap | `brand`, `model` | required | `DF...charger.brand/model` | catalog/manual exclusivity | `declarations.chargers[]` | finalize/promote | declared charger version -> `app_chargers` DEC | safe charger summary | none | observe/compare/confirm/review | new asset version |
| MID | PARTIAL | charger observation or gap | `midNumber` | required | `DF...charger.midNumber` | bounded MID syntax; no conformity claim | meter declaration | finalize/promote | declared candidate -> `app_mid_meters` DEC | safe status, not raw internal evidence | evidence relation only | candidate/confirm/external/evidence decision | new meter/evidence/decision version |
| serial number | PARTIAL | charger observation or gap | `serialNumber` | required when subject binding requires | `DF...charger.serialNumber` | bounded identifier | charger/meter declaration | finalize/promote | target subject-specific version | safe masked/summary value | none | observe/confirm/review | new subject version |
| charger buyer/client | TARGET | charger observation | `customerName` | required semantic role | `DF...charger.buyerParty` | party relation | evidence relation | finalize/promote | OBS + DECL party/evidence relation | safe comparison status | never signer fallback | observe/compare/confirm | new relation version |
| charger location relation | TARGET | charger observation or chosen confirmed location | `location` | required | `DF...charger.locationId` | must equal owning location unless conflict resolved | charger declaration | finalize/promote | charger version -> location ref | grouped under location | exact location scope support | compare/confirm | new charger version/rebinding correction |
| supplier/installer | TARGET | charger observation | `supplierInstallerName` | none until rule approved | OBS only | displayability | observation manifest only | parser persistence TARGET | observation/external reference | hidden unless approved informative projection | none | parser provenance | new observation/reference |
| installation date | TARGET | explicit charger observation or gap | `installationDate` | required when asset rule approved | `DF...charger.installedOn` | exact date; invoice date prohibited | charger declaration | finalize/promote | charger validity/version | safe charger summary | none | observe/confirm/review | new asset version |
| invoice date | TARGET | explicit charger observation | `invoiceDate` | none by default | OBS only | exact date | observation manifest | parser persistence TARGET | evidence observation | hidden unless approved informative projection | none | parser provenance | new observation run |
| fee terms version | PARTIAL | approved legal version | none | independent acceptance | `DF.signing.feeTerms` | exact version/hash | legal acceptances | finalize/sign | current legal acceptance pattern reusable for commercial terms | customer copy | separate from mandate | acceptance actor/time/version/hash | new acceptance/version; withdrawal rule decision |
| general terms version | PARTIAL | approved legal version | none | independent acceptance | `DF.signing.terms` | exact version/hash | legal acceptances | finalize/sign | commercial legal acceptance | customer copy | separate from mandate | same | new acceptance/version |
| privacy version | PARTIAL | approved legal version | none | independent acknowledgement/consent as legally decided | `DF.signing.privacy` | exact version/hash | legal acceptances | finalize/sign | privacy acceptance record | customer copy | separate from mandate | same | new acceptance/version |
| mandate clause versions | UNKNOWN | final reviewed Dutch clauses | none | exact clause acceptance plus signature | `DF.signing.mandateClauses` | both mapped permissions and immutable versions | signed snapshot | signing service | `app_mandates`/`app_mandate_versions` TARGET | signed copy and safe state | core signed clauses | issue/sign/activate events | new signed version only |
| mandate location/EAN scope | TARGET | confirmed declared facts | none | Step 5 scope confirmation | `DF.signing.scopes[]` | exact location/EAN refs | signed snapshot | signing service | mandate scope entities TARGET | signed copy | exact scope | snapshot/hash/sign event | new mandate version |
| mandate issue date | TARGET | signing service/server time under decided rule | none | included in signed snapshot | `DF.signing.issueDate` | legal rule UNKNOWN | signed snapshot | signing service | mandate version | signed copy | required | issue/sign event | immutable per version |
| mandate calendar years | UNKNOWN | customer selection under final legal/product rule | none | explicit scope confirmation | `DF.signing.calendarYears[]` | whole years, renewal rule UNKNOWN | signed snapshot | signing service | mandate scopes/validity | signed copy | required | scope/sign/renewal events | no silent renewal; new signed version |
| signature artifact/hash | UNKNOWN | approved e-sign mechanism | none authoritative | signing act | `DF.signing.resultRef` only after service response | evidence standard UNKNOWN | never trust browser-supplied result alone | signing service callback/RPC | evidence file/version + mandate version | customer signed copy/status | required evidence | request/result/actor/time/hash | new artifact/version; revoke/supersede event |

### Current ORPHAN and removal register

| current field/fact | current break | target disposition |
|---|---|---|
| `personalInfo.phone` | mapper emits `applicant.phone`; Edge ignores it and no database/dashboard destination is proven | ORPHAN: remove from the five-step target until a contact contract is approved |
| `personalInfo.kvkDocument` | local file/warning only; mapper, payload, upload and persistence omit it | ORPHAN: hide; later authority/KvK evidence slot only under approved contract |
| energy `supplierName`, document date, network-operator candidate and non-selected periods | client observation only; mapper excludes the observation object | ORPHAN in current submit: target OBS persistence required before visible use |
| charger `customerName`, `supplierInstallerName`, location, exact installation date and invoice date | client observation only; mapper excludes it | ORPHAN in current submit: target OBS/DECL destinations required before visible use |
| selected energy and charger files | browser `File` only; signup submit creates expected slots but uploads no bytes | ORPHAN across current signup roundtrip: quarantine upload/promotion required |
| `backendSupplier`/manual backend supplier | current declared payload/database exists, but no required source or role in this five-step document-first contract | remove from this journey; separate later operational data contract if needed |
| `solarPanelStatus` | current validator/payload/database exists, but no source or approved destination in this journey/mandate contract | remove from this journey; separate eligibility/data batch if required |
| `installationYear` | current declared payload/database exists but conflicts with the required exact explicit installation date and can be inferred incorrectly | replace by exact date target; year may be derived downstream with provenance, never requested twice |
| generic `termsBundleAccepted` as signing | one checkbox creates commercial acceptances; it contains no party/signer/EAN/location/clause/calendar-year signed snapshot | obsolete for mandate; retain only separately versioned commercial/privacy acceptances |

## 5. UX-specificatie

### Exact block and heading hierarchy

The page uses the existing `.container`, `.signup-flow-compact`, `.signup-section`, `.signup-section-header`, `.eyebrow`, `.form-grid`, `.location-tabs`, `.location-panel`, `.document-slot`, `.invoice-preview-list`, `.field`, `.field-message`, `.button` and token system. No new CSS is required to establish this architecture; implementation must first compose existing primitives and add CSS only for a demonstrated missing state.

Each page has at most one plain `h1`; it must not use the current large marketing hero inside the operational flow. Each step card has `eyebrow` for `Stap N`, compact `h2` from the existing signup override, and optional `h3` only for location or charger grouping. A fact label is `dt` or field label, never another heading. Duplicate section and card titles are forbidden.

Maximum visible text per block:

- one heading;
- at most one helper sentence;
- one status or error sentence only when it changes the customer's next action;
- fact rows with label, safe value and one meaningful action;
- no explanatory paragraph stack, marketing claim, legal summary or raw metadata.

Any new literal customer copy, including success, ambiguity, network-operator, contract-period, invoice-date, scope, mandate and correction labels, is `COPY DECISION REQUIRED`.

### Desktop and mobile

Desktop remains a single centered flow, not a split review dashboard. Location tabs are horizontal/wrapping with one active location. Document slots and their compact state may use existing grid primitives; Step 3 rows remain a two-column definition list only while readable. Multiple chargers are vertically grouped under the active location to preserve binding.

At the existing `700px` breakpoint, form/document grids become one column and mode/location tabs become full-width vertical controls. Header/action rows stack. Fact rows must also become one column if the existing definition-list width is insufficient; this is the only potential CSS gap and must be verified in browser before adding a rule. The active location and charger identity remain visible above each document/review block.

### Cardinality behavior

| case | behavior |
|---|---|
| one location | no redundant location tab strip if there is no alternative action; show one compact location heading |
| multiple locations | show tabs once per step; only active location content is mounted/visible; unresolved count may be shown only with approved copy and an action |
| one charger | no charger navigation shell; show one charger group inside its location |
| multiple chargers | ordered vertical groups or compact charger selector inside the active location; never a global charger list detached from location |

### Status vocabulary

Internal UI states are exactly `empty`, `parsing`, `success`, `ambiguity`, `failure`, `needs_confirmation`, `confirmed`, `needs_fallback`, and `blocked_external`. Customer labels use only existing sourced copy identified in Step 2; all other labels are `COPY DECISION REQUIRED`. These are UI workflow states, not evidence, authority, mandate, verifier or regulatory statuses.

Errors are local to the file, fact or fallback field and focus the exact actionable control. Parser failure offers replacement or bounded fallback; it never shows stack/error codes. Ambiguity shows only safe candidate choices. External blockers stop signing and show approved customer copy only after a decision. An empty informational card, a row with no value/action, a status pill without consequence, a raw parser panel and a broad review dashboard are never rendered.

A block or row is fully hidden when:

- its fact is absent and not required;
- it is observed-only but has no approved customer projection/destination;
- it is already confirmed and the compact summary is shown in the owning group;
- it belongs to a different account type, location or charger;
- its only content would be technical metadata, an empty state card or a non-actionable status;
- its fallback trigger is no longer active.

Explicitly forbidden: large marketing headings, long helper text, duplicate titles, technical parser details, broad review dashboards, status pills without customer action/meaning, empty informational cards, duplicate inputs and a second full dossier form.

## 6. Huidige code versus target

### Current journey contradictions

| current behavior | contradiction | target disposition |
|---|---|---|
| visible order is `Aanvrager`, `Locatie`, `Aansluiting`, `Laadpalen`, `Ondertekenen` | asks party/address/asset data before documents and has no dedicated confirmation/gap steps | replace composition with the five fixed steps; do not delete files in this architecture batch |
| `PersonalInfoSection` calls organization applicant a `bestuurder` | account contact/applicant is silently presented as authorized representative; no authority proof exists | remove role claim; collect only account/organization basis, then explicit role/authority gaps |
| all address fields are permanent Step 2 inputs | duplicates a reliable delivery address and violates gap-driven behavior | move to location fallback |
| charger manual/import controls and long charger form are permanent | document facts are compared only after manual entry | document first; brand/model/MID/serial/date controls become fallbacks |
| energy and charger observations live in separate state shapes | duplicated document state and no shared fact/confirmation lifecycle | one typed document-fact registry and reducer |
| document cards mainly compare observations to pre-entered declarations | confirmation is navigation back to old fields rather than a declared fact transition | fact-level confirm/reject/correct with immutable provenance |
| signup files remain local while submit creates expected document slots | UI can select/parse but no byte/version roundtrip exists | pre-auth quarantine transport, promotion and evidence version linkage |
| current mapper intentionally excludes parser observations/files | most shown facts have no payload/database/audit trail | OBS manifest + explicit DECL only; never send raw parser internals as core fields |
| general consent checkbox precedes `Ondertekenen en dossier starten` | button/checkbox does not produce a signed exact mandate snapshot | independent commercial acceptances plus separately blocked signing contract |
| current direct submit creates customer/dossier immediately | conflicts with CURRENT signed quarantine plus TARGET case-owned server promotion | reuse atomic/idempotent patterns, not current lifecycle semantics |
| `app_dossier_locations` and `app_dossier_chargers` are mutable dossier snapshots | they are not accepted location/asset/MID target truth | promotion bridge only; target versioned domain entities/decisions remain separate |

### Module disposition

| module/group | disposition | exact reason |
|---|---|---|
| `invoicePdfParserAdapter.ts`, `energyDocumentObservation.ts`, `energyEanCandidateExtractor.ts` | reuse | bounded client parser and observation types already preserve observed/derived semantics; add no authority |
| `energyDocumentCrossCheck.ts`, `chargerDocumentCrossCheck.ts`, `signupPartyNameCrossCheck.ts` | reuse and generalize | safe comparisons are useful; target must compare against confirmed facts without treating match as acceptance |
| `SignupLocationTabs.tsx`, stable ID normalizers | reuse | correct location scoping and stable client binding |
| `DocumentUploadSlot.tsx`, `DocumentCheckCard.tsx`, `EnergyDocumentCheckCard.tsx`, `InvoicePdfPreviewPanel.tsx` | merge behind shared document/fact components | duplicated per-document presentation lacks common confirmation and fallback registry |
| `DocumentUploadCard`, upload clients/hooks and document RPCs | reuse transport/state patterns only | authenticated dossier scope cannot be called from public signup; confirmation proves bytes, not evidence acceptance |
| `PersonalInfoSection.tsx` | narrow | retain account-type/email/legal-organization controls; move/remove everything else per Step 1 |
| `SignupLocationSection.tsx`, `AddressFields.tsx` | fallback-only | permanent address entry becomes gap-driven |
| `ChargerInfoSection.tsx`, `ChargerForm.tsx`, manual/import tabs | fallback-only/obsolete composition | permanent manual-first form conflicts with product decision; catalog and controls remain reusable inside gaps |
| `ConnectionEanConfirmation.tsx` | fallback/confirmation reuse | source-exclusivity and explicit EAN confirmation are sound; permanent separate connection step is obsolete |
| `ConsentSignatureSection.tsx` | split | commercial modal/acceptance UI may be reused after copy approval; generic checkbox is not mandate signing |
| `signupTypes.ts`, normalizers, validator, mapper | replace shared shape in bounded steps | current types mix account, party, document observation, declared asset and consent state |
| `signupSubmitClient.ts`, config, idempotency pattern | reuse | safe transport/idempotency useful after target payload exists |
| `api-app-signup-submit` and `app_submit_signup_v5` | reuse validation/atomic/audit patterns; change contract/lifecycle | current direct customer/dossier write omits files/observations/signing and is not quarantine promotion |
| intake quarantine tables | reuse subject to fresh proof/governance | local schema foundation exists, but no active public endpoints/promotion runtime is proven |
| document slot/file/version schema | reuse/extend | transport/version foundation exists; evidence observations/decisions remain separate target work |
| party/case/location/connection foundations | bridge only | bounded local foundations exist; none makes party/location/EAN/authority accepted by signup |
| current CSS/tokens/layout | reuse first | compact cards, grids, fields, tabs and breakpoints already exist; browser proof decides any minimal delta |

### Persistence and signing blockers

- production retention enforcement, malware/content checks and promotion runtime are not implemented;
- observed-fact persistence and confirmation audit schema/contract are not implemented;
- target location/charger/charge-point/MID splits and evidence decisions are incomplete;
- representation authority is `NOT SCHEMA READY`;
- production legal/OTP approval remains open although bounded local signing entities/services are proven;
- current document upload requires authenticated dossier scope;
- a separate email-verification promotion trigger is `SUPERSEDED`; server-only case promotion remains target-only;
- KvK, CAR/DSO, MID/certificate, energy supplier, external verifier and REV ports are absent or blocked;
- customer-safe dashboard projections for declarations versus decisions do not exist;
- production Dutch legal approval/versions and OTP delivery remain open; bounded local e-sign evidence and one-year behavior are proven only within their owning contracts.

## 7. Implementatieplan — maximaal drie batches

Batches 1 and 2 below have a bounded combined frontend implementation with
local source/model proof in `PILOT-SIGNUP-DOCUMENT-FIRST-UI-01`. Their listed
backend/persistence and browser-roundtrip implications are not thereby proven.
Batch 3 remains unauthorized and requires its own startgate and explicit scope.

### Batch 1 — Shared document-first frontend state and journey model

Bounded status: `CURRENT PROVEN — LOCAL ONLY` for the shared frontend draft,
pure selectors, exact five-step composition, reset and async-generation guard.

Exact file scope:

- modify `app/src/features/signup/SignupPageShell.tsx`, `signupTypes.ts`, `signupNormalizers.ts`, `signupValidation.ts`, `signupAccountTypeTransition.ts`, `PersonalInfoSection.tsx`, `SignupLocationTabs.tsx`, `SignupLocationSection.tsx`, `ChargerInfoSection.tsx`, `ChargerForm.tsx`, `ConsentSignatureSection.tsx`;
- add `app/src/features/signup/documentFirstSignupModel.ts`, `documentFirstSignupReducer.ts`, `DocumentFirstJourney.tsx`, `documentFirstSignupModel.proof.ts`;
- update only if browser evidence requires it: `app/src/styles/components.css`.

Reuse stable client IDs, location tabs, catalog controls, field errors, existing tokens and submit-state shell. New model/reducer modules are necessary to separate file state, observations, confirmations, gaps and signing snapshot without parallel `useState` trees. `DocumentFirstJourney` owns only five-step composition.

Tests: reducer transitions; account-type destructive reset; location/charger ownership; no confirmed value reappears as input; no role fallback; no ORPHAN registry entry; source-inspection proof of exactly five steps. Browser checks: desktop and 700px/mobile order, focus/error routing, one/multiple location and charger cases, no marketing hero or duplicate headings. Database checks: none. Blockers: Step 1 submit contract remains incompatible, so final network submit stays disabled/not wired. Docs impact: update signup architecture/current assessment only after implementation proof.

### Batch 2 — Document matrices, confirmations and gap-driven fallbacks

Bounded status: `CURRENT PROVEN — LOCAL ONLY` for customer-safe frontend
matrices, separate confirmations/corrections and selector-driven gaps. Document
persistence and browser acceptance are not proven.

Exact file scope:

- modify `SignupConnectionSection.tsx`, `ChargerDocumentsSection.tsx`, `DocumentUploadSlot.tsx`, `DocumentCheckCard.tsx`, `EnergyDocumentCheckCard.tsx`, `InvoicePdfPreviewPanel.tsx`, `ConnectionEanConfirmation.tsx`, `energyDocumentCrossCheck.ts`, `chargerDocumentCrossCheck.ts`, `signupPartyNameCrossCheck.ts`, `signupValidation.ts`, `documentFirstSignupModel.ts`, `documentFirstSignupReducer.ts`;
- reuse without semantic widening `app/src/features/invoice-analysis/invoicePdfParserAdapter.ts`, `energyDocumentObservation.ts`, `energyEanCandidateExtractor.ts`;
- add `app/src/features/signup/documentFactDefinitions.ts`, `DocumentFactReview.tsx`, `GapDrivenFields.tsx`, `documentFactDefinitions.proof.ts`;
- update only if browser evidence requires it: `app/src/styles/components.css`.

The fact registry is new because one authoritative entry must bind source, label decision, semantic role, confirmation, severity, validator, destination and fallback reason. Shared review and fallback components replace two bespoke read-only cards while keeping parser facts observed.

Tests: every required energy/charger row; gas exclusion; ambiguous/missing/rejected transitions; exact install date distinct from invoice date; supplier facts remain observed; no parser metadata in customer render; confirmation creates declared state without mutating observation; hidden empty/non-actionable rows. Browser checks: empty/parsing/success/ambiguity/failure, replace file, mismatch correction, keyboard/focus, all cardinalities and mobile stacking. Database checks: none; persistence remains deliberately unwired. Blockers: customer copy decisions for unsourced labels/actions and approved destination for every surfaced field. Docs impact: update parser inventory and signup contract only after green proof.

### Batch 3 — Persistence, verification/promotion, signing snapshot and end-to-end roundtrip

Exact file scope:

- modify `app/src/features/signup/signupSubmitMapper.ts`, `signupSubmitClient.ts`, `signupSubmitConfig.ts`, `SignupPageShell.tsx`, `documentFirstSignupModel.ts`, `documentFirstSignupReducer.ts`, `ConsentSignatureSection.tsx` and their existing proof files;
- reuse/extend `app/src/features/documents/documentUploadClient.ts`, `documentUploadTypes.ts` and the existing upload/confirm/download/withdraw transport contracts without calling authenticated endpoints pre-auth;
- reuse the implemented quarantine/signing endpoints; add only the internal `api-app-signup-promote` boundary specified by the canonical 09C1 contract;
- modify `supabase/functions/api-app-signup-submit/index.ts` only as an explicit compatibility/retirement adapter, never as a second truth path;
- add only forward 09C1 promotion/status/evidence responsibilities from the canonical contract and purpose-specific local proofs; do not recreate implemented signing/quarantine schema;
- update dashboard projection types/components only for safe declared/decision statuses after the backend contract is green.

Reuse intake quarantine/signing tables and endpoints, idempotency/audit patterns, party/case foundations and current customer-confirmed EAN declaration-source logic. 09C1 requires one internal promotion endpoint because promotion has a distinct service-only authority and replay boundary. New additive schema is limited to the canonical promotion, case-lifecycle and case-owned durable-evidence responsibilities; generic JSON or legal-acceptance rows cannot substitute.

Tests: payload allowlist and raw-parser exclusion; capability expiry/replay; hash/file confirmation; one-time promotion; atomic rollback; exact party/location/charger bindings; observation-to-declaration separation; evidence decision separation; safe errors; signing snapshot/hash/version; withdrawal/supersession; no Auth/account/contact/role shortcut to authority. Browser checks: complete document-first happy path, every fallback family, signed receipt/status recovery, internal promotion, signed-copy/dashboard roundtrip and no duplicate re-entry. Database checks: fresh local apply, grants/RLS, negative anon/auth access, constraints, idempotency/concurrency, audit completeness, immutable version history and rollback injection. Blockers: approved retention/security contract, production OTP/email provider, party/location/asset target-governance decisions, legal/verifier authority answers and external source contracts. The exact 09C1 docs/proof impact is owned by `contracts/intake-verification-promotion.md`.

## 8. Open Source, Legal And Verifier Decisions

| item | current status | consequence |
|---|---|---|
| final reviewed Dutch mandate and the two permission clauses | UNKNOWN / `COPY DECISION REQUIRED` | signing cannot create a mandate version |
| electronic-signature form and acceptable evidence | UNKNOWN | signature service/schema acceptance blocked |
| natural-person self-action identity standard | pending attributable legal/verifier answer | even private signer-to-party relation is not accepted automatically |
| Zakelijk individual authority evidence, scope, freshness and revocation | representation authority `NOT SCHEMA READY` | organization signing blocked |
| VvE board member/manager/direct authority route | pending VvE-specific legal/register/verifier answers | VvE signing blocked/manual escalation |
| KvK source/access, exact usable fields and whether an extract is sufficient | BLOCKED — EXTERNAL / UNKNOWN | legal-entity and authority evaluation blocked |
| CAR/DSO EAN, network-operator, period and aangeslotene access | BLOCKED — EXTERNAL | declaration cannot become accepted connection/ownership truth |
| MID/certificate source and acceptable charger/meter evidence | BLOCKED — EXTERNAL | MID/conformity acceptance blocked |
| verifier evidence package, visit/access and customer-safe result vocabulary | BLOCKED — EXTERNAL | no verifier-ready/accepted claim |
| whole-calendar-year selection, issue date, renewal, withdrawal and historical reliance behavior | BLOCKED — DECISION | mandate activation/renewal blocked; no silent renewal |
| retention/minimization for intake files, observations, rejected facts, signatures and non-verification records | BLOCKED — DECISION | public upload and long-term persistence blocked |
| full consolidated law sources and the documented before-1-April versus before-1-May deadline conflict | PARTIAL / UNKNOWN | source/legal review remains required; TKV mapping alone is not full legal completeness |
| customer copy for new states, field labels, confirmations, corrections, blockers and signing | `COPY DECISION REQUIRED` | do not invent UI text |

No online or remote source was fetched for this architecture batch. The official current repository source was read locally. External access and professional answers remain missing rather than being guessed.

## 9. Architecture Acceptance Gate

Implementation may start only when a bounded batch has an explicit go and every field in that batch has a complete source-to-destination registry entry. Batch 1 and most of Batch 2 can be built without claiming persistence or signing. Batch 3 cannot start as one undifferentiated build while authority, legal text, signature evidence, calendar-year, retention and external-source decisions remain open; its internally executable subset must be separately bounded after those blockers are resolved.

The product acceptance invariant is:

> A document may propose a fact. Only the customer may declare the customer-owned fact. Only the authorized decision owner may evaluate or accept it. Every transition pins its source, actor, scope, time and supersession history.

## 10. Review-02 refinement — three-step presentation

The active presentation is now Account, Documenten and Ondertekenen. The former
Controleren and Aanvullen business rules are retained as pure selectors and
inline row resolution inside Documenten; they are no longer navigation steps.

`documentFactRegistry.ts` defines common fact names and internal observation
metadata. `documentReviewMatrix.ts` derives every row from declared state,
parser observations, corrections and confirmations. The React matrix is a
generic renderer. Replacing a document invalidates only state that cites its
stable local document id. A manual correction never overwrites the observation
and must be explicitly confirmed before the row resolves.

An invoice date is not an installation date. A charger-invoice address remains
an invoice/customer address and is not automatically promoted to installation
location. The invoice name has buyer/customer semantics, not contract-holder or
aangeslotene semantics.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Decision-03 semantic preparation overlay

CURRENT PROVEN — LOCAL FRONTEND SOURCE/PROOF ONLY.

One pure decision module consumes declared input, preserved parser
observations, semantic document roles and optional customer correction. Its
closed result vocabulary is `clean_match`, `normalized_match`,
`review_required`, `blocked`, `missing`, `ambiguous` and `not_applicable`.
Only bounded case/punctuation/whitespace, identifier punctuation,
house-number separators and initial-plus-same-surname variants normalize;
prefix and fuzzy matching do not.

Contract holder, invoice buyer, delivery address, invoice address and explicit
installation/delivery address remain distinct semantic roles. Invoice date is
not installation date. Energy EAN and charger asset facts stay source-scoped.
Corrections retain the observed fact, source document, exact correction type
and frontend confirmation time. They remain review-required.

`review_required` may continue to the browser-local summary only after
customer intent and is never projected as accepted/verified. `blocked`, missing
and ambiguous prevent progression. External checks and authorized ENVAL review
are not implemented.

This overlay neither mutates the submit mapper nor establishes accepted
evidence, canonical location/EAN, aangeslotene, charger identity, legal
identity, representation, authority, mandate, signing or regulatory truth.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE

## Generic document facts-05 refinement — slot-independent facts

The active technical pipeline is `parseInvoicePdfInput(input)`. It receives
only PDF input and produces one generic observation envelope. The deterministic
invariant is: same bytes plus the same parser version produce the same envelope,
generic facts and display values, regardless of where the document is uploaded.

Every supported candidate is projected generically into the source column bound
to its upload. Candidate extraction metadata may provide contract-holder,
buyer/customer, delivery, invoice or installation roles, but upload slot never
determines a role and role metadata never suppresses a display value. An
unsupported role remains `unknown`.

Upload slots are source bindings only. Active signup has no document-type gate,
compatibility blocker or customer repair action for classifier output. Required
canonical facts and real material conflicts determine progression. Missing or
rejected facts render as `—`; a no-fact PDF receives one bounded upload-card
message. Observed/derived envelopes remain separate from declarations,
corrections, confirmations and decisions.

TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
