# Representation-Authority Pilot Validation Brief

Status: DRAFT — PENDING LEGAL AND VERIFIER VALIDATION

Date: 2026-07-24.

Audience: a Dutch corporate-law lawyer, an external inbooking verifier and, where register interpretation requires it, a KVK/register specialist.

## 1. Purpose And Evidence Status

This brief turns the committed WP2B-II readiness audit into one compact, fillable validation package. It is not legal advice, contract approval, evidence acceptance, schema authorization, an NEa or verifier decision, or proof that any proposed case is legally sufficient.

The mapped electricity TKV requires the name and signature of an authorized representative plus authority evidence for an enterprise or VvE mandate (`NEA-MAND-003`). It does not provide the legal rules needed to decide which representation basis and evidence are sufficient. The official snapshot specifically maps mandate content and verifier checks; it does not make an Auth account, contact, upload, parser result, signature, or KVK extract conclusive authority proof.

The following repository controls are relevant:

- `NEA-MAND-001`: legal/commercial acceptance is not a signed mandate;
- `NEA-MAND-002`: a natural-person mandate needs the named/signing aangeslotene and mapped mandate fields;
- `NEA-MAND-003`: an enterprise or VvE mandate needs the legal identity, authorized representative, signature and authority evidence;
- `NEA-MAND-004/005`: issue date, whole-calendar-year validity and the two permissions belong to mandate truth, not authority truth;
- `NEA-AUD-002`: material decisions need actor, request, source, evidence, outcome and time provenance;
- `NEA-AUD-003`: four-eyes is a proposed ENVAL internal control, not a claimed statutory rule;
- `NEA-COR-001`: corrections preserve prior truth;
- `NEA-SEC-001/002`: least privilege and server-side service boundaries apply.

Representation authority remains `NOT SCHEMA READY`.

## 2. Approved MVP Product Scope

Daan has approved the following product direction only:

- the MVP should support common, simple representation-authority cases;
- complex and exceptional cases should be added later through bounded modules;
- the estimate that unsupported outliers are approximately 10% or less is an unproven product assumption, not measured evidence or a release criterion;
- every unsupported, conflicting or unclear case is blocked and routed to manual escalation;
- no case is simplified automatically into authority derived from Auth, account ownership, contact status, customer relationship, upload, parser output, detected signature or free text.

“Simple-majority” means the proposed product perimeter for common cases. It is not a corporate voting rule, signing rule, K-of-N rule or legal conclusion. Legal validity, evidence sufficiency and verifier acceptability remain unanswered until recorded in writing below and approved by Daan.

## 3. Proposed Simple Pilot Cases

Every route below is a proposal for external validation, not an accepted authority basis.

| case | proposed pilot route | minimum proposed perimeter | current status |
|---|---|---|---|
| A | Natural-person self-action | One natural person acts only for the same natural-person party. Party and acting-person identity must be evidenced independently; Auth or email equality is insufficient. No fabricated representation-authority claim is created. | Proposed; legal/verifier validation required |
| B | Individually authorized natural person for an organization | One identifiable natural person acts directly for one organization under a simple, individually exercisable authority that is evidenced, current, scope-appropriate and unconflicted. No joint rule, chain or subdelegation. | Proposed; legal/verifier validation required |
| C | Simple VvE route | One identifiable natural person acts directly for one VvE under one simple, individually exercisable and evidenced authority. No inference from account/contact/manager status and no unclear board, manager, joint or delegation route. | Proposed; VvE-specific legal/register/verifier validation required |
| D | Optional one-step direct power-of-attorney candidate | One represented party directly grants one natural person a written, scope- and time-bounded power of attorney. No subdelegation or chain. | Candidate only; excluded from acceptance until explicitly validated and approved |

For every proposed pilot route:

- the represented party and acting natural person are exact and separately evidenced;
- the authority basis, permitted act, scope and applicable time are unambiguous;
- exact evidence versions or immutable source references are pinned;
- evidence freshness and contradiction checks pass;
- two distinct qualified reviewers complete the proposed four-eyes review;
- no later known suspension, revocation, dispute, rejection or supersession blocks reliance;
- an unknown or ambiguous fact fails closed to manual escalation.

## 4. Explicitly Excluded Pilot Cases

The pilot excludes:

- joint signing or two or more required signers;
- K-of-N, all-signers or changing joint-membership rules;
- an organization acting as representative;
- authority chains;
- subdelegation;
- unclear VvE board, manager or management-agreement authority;
- third-party natural-person representation outside the explicitly approved direct route, including case D while it remains unvalidated;
- retroactive authority or retroactive reliance;
- emergency override or emergency reliance;
- conflicting, contradictory or inconclusive evidence;
- unclear, stale, incomplete or disputed register information;
- suspended, revoked, disputed or expired authority;
- every case in which basis, identity, scope, time, evidence sufficiency or reviewer competence is unclear.

The required outcome is `blocked/manual escalation`. An excluded case creates no operational authority, accepts no mandate, receives no automatic promotion and is not coerced into a simple case. A later solution requires a separate additive, bounded module and approval.

## 5. Hard Domain Boundaries

| concept | proves | never proves or creates |
|---|---|---|
| Auth | credential control and, through the current boundary, verified-email control | natural-person identity, party identity, case role, authority, mandate or evidence acceptance |
| account/customer | an ENVAL account shell and its authorized portal context | legal party, representative, signing authority or mandate |
| party/profile | a pinned natural-person or organization profile claim/version | credential identity, representation authority or evidence sufficiency |
| case role | a profile-pinned workflow relationship to a case | representation authority, mandate or legal capacity |
| representation authority | only a separately evidenced and reviewed permission to act for a represented party within explicit scope and time | Auth, account ownership, case role, mandate clauses, EAN truth or evidence acceptance |
| mandate | a separate signed authorization to ENVAL with exact clauses, EAN/location scope, issue date and calendar-year validity | proof that its signatory had representation authority |
| evidence | exact source material or an immutable source reference | authority merely because it was uploaded, confirmed, parsed or contains a signature |
| authority decision | a qualified, provenance-complete review outcome about a specific authority claim and evidence set | professional legal advice, a mandate, or permission beyond its exact scope and time |

Account owner, contact, service recipient, customer-party relationship, legal acceptance, dossier ownership, uploader, parser result, detected name and detected signature are never authority shortcuts. Parser output remains observed/derived.

## 6. External Validation Questionnaire

Instructions:

- The lawyer records the applicable Dutch legal analysis and exact documentary basis.
- The external verifier records whether the proposed evidence and review package is acceptable for its inbooking-verification work and what it would reject or escalate.
- A KVK/register specialist answers register-semantics questions where neither party can do so authoritatively.
- “Written answer required” means a dated, attributable answer with cited source or document; verbal confirmation is insufficient.
- Empty answer fields mean unresolved and block the affected release gate.

| ID | subject | lawyer question | verifier question | conservative pilot default | risk if wrong | blocks contract | blocks DDL | written answer required | answer | source/document | date | reviewer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| VAL-01 | natural-person self-action | When may ENVAL treat a natural person as acting for the same legal person without creating a representation relationship, and what identity evidence is required? | What exact evidence and checks would you require to accept the signer as the natural-person aangeslotene? | Allow only exact, independently evidenced person-to-same-party action; Auth/email never suffices. | False self-match or fabricated authority. | yes | yes | yes | — | — | — | — |
| VAL-02 | individual organization director | When does one natural person have individually exercisable authority to bind an organization for the relevant act? | Which source fields and checks demonstrate individual signing authority to your satisfaction? | Block unless sole/direct authority for the exact act is explicit and current. | Unauthorized organization mandate. | yes | yes | yes | — | — | — | — |
| VAL-03 | power-of-attorney basis | Which direct power-of-attorney forms are legally usable for this act, and which formalities and limits apply? | Would you accept a direct power of attorney, and under which documentary and review conditions? | Route D remains excluded until an accepted direct form is documented. | Invalid delegation or overbroad reliance. | yes | yes | yes | — | — | — | — |
| VAL-04 | VvE director/board member | When may one VvE board member act individually for the VvE for this mandate? | Which register/statute evidence proves that individual route? | Block unless individual VvE authority is explicit in accepted sources. | Invalid VvE mandate signer. | yes | yes | yes | — | — | — | — |
| VAL-05 | VvE manager | Can a VvE manager ever use a direct simple route, and what instrument must grant the relevant authority? | What evidence would make a manager route acceptable, if any? | Exclude every manager route from the pilot. | Account/contact/management status mistaken for authority. | yes | yes | yes | — | — | — | — |
| VAL-06 | direct POA, no subdelegation | Is one direct grant from represented party to one natural person legally sufficient when scope, time and non-delegation are explicit? | What checks show that the grant is direct and no chain/subdelegation exists? | Candidate only; no acceptance before written approval. | Hidden chain or invalid substitution. | yes | yes | yes | — | — | — | — |
| VAL-07 | official authority evidence | Which official register or instrument is required for each proposed simple case? | Which official sources can you inspect and retain or reference during verification? | Require an approved source per case; no generic “official document” category. | Reliance on non-authoritative evidence. | yes | yes | yes | — | — | — | — |
| VAL-08 | supplementary evidence | When must statutes, board resolutions, POA documents or other evidence supplement register information? | Which missing/ambiguous register facts cause you to request which additional evidence? | Any gap blocks; no inference from a KVK extract alone. | Incomplete proof accepted as sufficient. | yes | yes | yes | — | — | — | — |
| VAL-09 | evidence freshness | How recent must register and other evidence be at decision and reliance time? | What freshness window and recheck events do you apply? | Require current retrieval and block when freshness cannot be shown. | Stale authority relied upon. | yes | yes | yes | — | — | — | — |
| VAL-10 | acting-person identity | What identity match is legally necessary between acting human, authority evidence and signature? | Which identity attributes and discrepancies must be checked or escalated? | Exact human must be separately identified and matched; Auth is insufficient. | Wrong person uses another person's authority. | yes | yes | yes | — | — | — | — |
| VAL-11 | signature form | Which signature forms are legally adequate for the intended mandate and POA documents? | Which signature forms and validation evidence will you accept? | Do not infer authority or acceptance from presence of a signature. | Invalid signature or false authority inference. | yes | no | yes | — | — | — | — |
| VAL-12 | ENVAL-mandate signing scope | What authority scope is required specifically to sign ENVAL's mapped mandate and grant its two permissions? | What wording/evidence lets you verify that exact signing scope? | General job title or contact role is insufficient; scope must be explicit. | Authorized person acts outside scope. | yes | yes | yes | — | — | — | — |
| VAL-13 | authority validity | Which start/end rules determine whether authority is effective at mandate signing and later reliance? | At which moments do you require validity checks or rechecks? | Authority must be current at each relied-on act; no silent renewal. | Expired or future authority accepted. | yes | yes | yes | — | — | — | — |
| VAL-14 | revocation and suspension | What events legally revoke or suspend authority, from when, and what prior acts remain valid? | Which signals block verification or require re-review? | Known revocation/suspension blocks future use; historical effect stays unresolved. | Continued or retroactively invalid reliance. | yes | yes | yes | — | — | — | — |
| VAL-15 | changed register information | How should later changed register information affect an earlier decision and pending act? | When must a changed extract reopen or invalidate your verification work? | Append a new observation and re-review; never rewrite earlier evidence. | Current truth overwrites reliance history. | yes | yes | yes | — | — | — | — |
| VAL-16 | historical reliance | What evidence must ENVAL preserve to show why authority was reasonably relied upon at an earlier time? | What historical package must be reconstructable for your file and later audit? | Preserve exact evidence version/reference, retrieval time and decision trail. | Unprovable past authorization. | yes | yes | yes | — | — | — | — |
| VAL-17 | four-eyes decisions | Which proposed authority decisions should require two reviewers, and are any simple cases safely exempt? | Will you accept ENVAL's two-reviewer control and what independence must it show? | Require four-eyes for every pilot authority acceptance. | Error, fraud or self-approval. | yes | yes | yes | — | — | — | — |
| VAL-18 | reviewer qualifications | What legal knowledge/role is required for maker and checker, including VvE and POA review? | Which reviewer qualifications and conflict rules do you expect? | No acceptance until both reviewer roles and competence are approved. | Unqualified or conflicted decision. | yes | yes | yes | — | — | — | — |
| VAL-19 | minimum decision metadata | Which reasons, evidence references and provenance must a defensible authority decision retain? | What minimum decision record must be included in or reproducible for your evidence file? | Require basis, scope, time, actors, reason, exact sources and maker/checker trail. | Decision cannot be reconstructed or challenged safely. | yes | yes | yes | — | — | — | — |
| VAL-20 | dossier block behavior | Must an unresolved/expired/conflicting authority question block mandate acceptance or other dossier actions, and can any action proceed safely? | Which dossier/verifier steps must stop and what manual escalation evidence is required? | Block every authority-dependent action and mandate acceptance; allow no automatic override. | Unauthorized action proceeds downstream. | yes | yes | yes | — | — | — | — |

## 7. Proposed Evidence Package

This is a validation proposal, not an approved evidence standard:

| proposed item | proposed purpose | approval status |
|---|---|---|
| identified official register/source and document type | establish what source was consulted | Pending |
| exact pinned export or immutable source reference | prevent later source drift from changing the relied-on material | Pending |
| content/source hash where lawful and applicable | identify the exact relied-on artifact | Pending privacy/legal validation |
| issue time and retrieval/recorded time | separate source currency from ENVAL recording | Pending |
| exact represented party | bind the review to the party whose legal sphere is affected | Pending |
| exact acting natural person | preserve the human behind every action | Pending |
| proposed authority basis | state the claimed direct basis without free-text substitution | Pending legal vocabulary |
| exact permitted act and scope | prevent broader inferred authority | Pending legal/verifier validation |
| business-validity dates | test authority at the relied-on act | Pending temporal rules |
| required supplementary documents | close source-specific gaps without assuming a KVK extract suffices alone | Pending |
| human review record | record evidence assessment and reason | Pending reviewer rules |
| distinct second-reviewer record | implement proposed four-eyes control | Pending |
| closed outcome reason plus explanatory note | make acceptance, rejection or escalation reconstructable | Pending vocabulary |

A KVK extract is never assumed to be independently sufficient. A signature proves neither authority nor evidence acceptance. Upload confirmation and parser output do not promote evidence.

## 8. Release Gate

Representation authority remains `NOT SCHEMA READY`.

No representation-authority DDL may be designed or implemented until:

1. all contract- and DDL-blocking questions have attributable written answers with cited sources;
2. the pilot inclusion rules, evidence standard, time/revocation behavior and reviewer controls are internally consistent;
3. the external lawyer and verifier have recorded their validation within their own competence;
4. any required KVK/register specialist has resolved register semantics;
5. Daan has explicitly approved the resulting bounded contract.

Unknown, blank, contradictory or qualified answers block the affected case. Only simple cases that are explicitly validated and then approved may enter a later contract. Outliers remain blocked/manual and are added only through later bounded modules. A later source, profile, evidence or rule version never rewrites historical claims, evidence, decisions or reliance.

## 9. Modular Future Boundary

This brief defines no candidate tables, columns, enums, constraints or schema. Future approved cases must remain additive and single-responsibility. They may link consciously to party, case, mandate, connection/EAN, evidence acceptance, verifier and correction contexts without merging their truth.

Complex cases must not be compressed into:

- EAV;
- generic JSON authority payloads;
- a universal role engine;
- Auth claims;
- account/customer/contact roles;
- case-role status;
- legal acceptance;
- upload/parser/signature output;
- free-text operational authority.

## 10. Validation Record

| role | name/organization | scope of validation | written response reference | date | outcome |
|---|---|---|---|---|---|
| Dutch corporate-law lawyer | — | — | — | — | Pending |
| external inbooking verifier | — | — | — | — | Pending |
| KVK/register specialist, if required | — | — | — | — | Pending |
| Daan, bounded contract approval | Daan | product and contract decision after external answers | — | — | Pending |
