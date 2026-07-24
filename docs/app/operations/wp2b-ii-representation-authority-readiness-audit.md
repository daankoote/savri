# WP2B-II Representation-Authority Readiness And Domain-Decision Audit

Status: PROOF ONLY — WP2B-II REPRESENTATION AUTHORITY READINESS AUDIT

Audit date: 2026-07-24.

Representation authority is `NOT SCHEMA READY`.

This audit approves no domain contract, creates no schema, and builds no runtime. It is not a legal assessment, NEa assessment, verifier assessment, evidence-acceptance decision, or implementation authorization. Historical DRAFT models and older appendix names are not source of truth and grant no authority for schema work.

## 1. Scope, Authority And Source Limitation

This document records the decisions that are still required before a bounded representation-authority contract can become DDL-ready. It uses only:

- the current repository canon and its mapped official requirements;
- committed migrations and proof sources;
- the read-only local PostgreSQL catalog;
- current modules, helpers, services, components, CSS, tokens, and layout sources.

The repository contains the versioned official 2026-07-09 electricity TKV snapshot. Its SHA-256 was rechecked as `f08ae9cc56d7145f8962e9e0930f0e9b8676a55e73437aba4f0193b3edcc55cf`. This batch did not perform or claim a new clause-by-clause legal reading. It relies on the already demonstrable mappings in `05`, `06`, `06A`, `07`, and `08`. Wet milieubeheer, Besluit energie vervoer, and Regeling energie vervoer remain higher authorities. Consolidated-law reconfirmation and legal interpretation remain open where the current canon says so.

The directly relevant mapped truth is:

- `NEA-MAND-001`: an ordinary legal acceptance is not a complete signed mandate;
- `NEA-MAND-002`: the natural-person mandate needs the named/signing aangeslotene and the mapped mandate fields;
- `NEA-MAND-003`: an enterprise or VvE mandate needs legal identity plus the name and signature of an authorized representative and authority evidence;
- `NEA-MAND-004`: mandate issue date and whole-calendar-year validity are mandate truth, not authority truth;
- `NEA-MAND-005`: the two exact permissions are signed mandate clauses, not consequences of authority;
- `NEA-AUD-002`: material decisions need actor, request, source, evidence, decision, and time traceability;
- `NEA-AUD-003`: four-eyes for critical decisions is an ENVAL internal control, not a newly claimed statutory rule;
- `NEA-COR-001`: corrections preserve prior truth;
- `NEA-SEC-001/002`: minimum privilege and server-side service-role boundaries are ENVAL security controls.

The mapped sources require an authorized enterprise signer but do not define a complete ENVAL authority-basis vocabulary, evidence-sufficiency standard, chain-of-authority model, VvE board/manager rule, joint-signing rule, retroactivity rule, revocation-reliance rule, or internal reviewer qualification model. Those gaps may not be filled by inference from Auth, UI, old DRAFT models, generic legal terms, or free text.

## 2. Repository And Current Evidence

### Repository guard

| guard | result |
|---|---|
| repository | `/Users/daankoote/dev/enval` |
| branch | `main` |
| start HEAD | `5a5265adc516e8198cc25757654920d4aa3316bd` |
| expected HEAD | exact match |
| index | empty |
| tracked worktree | clean |
| untracked paths | only the pre-existing protected proof, lock, and baseline-proposal artifacts |
| remote action | none |

### Read sources

The audit read and used:

- `docs/app/00_CANON.md`;
- `docs/app/05_NEA_COMPLIANCE_DIRECTIVE.md`;
- `docs/app/06_NEA_REQUIREMENTS.md`;
- `docs/app/06A_NEA_REGULATORY_COMPLETENESS_AUDIT.md`;
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md`;
- `docs/app/08_NEA_TRACEABILITY_MATRIX.md`;
- `docs/app/09_NEA_MVP_PLAN.md`;
- `docs/app/contracts/customer-party-representation-case.md`;
- `docs/app/contracts/auth.md`;
- `docs/app/contracts/audit.md`;
- `docs/app/contracts/intake-verification-promotion.md`;
- `docs/app/contracts/document-upload.md`;
- `docs/app/operations/wp2b-representation-authority-case-role-readiness-audit.md`;
- `docs/app/operations/nea-implementation-roadmap.md`;
- `docs/app/proofs/wp2b-i-case-party-role-foundation.md`;
- `docs/app/03_CHANGELOG_APPEND_ONLY.md`;
- `docs/app/04_TODO.md`.

The following committed implementation sources were fully inspected:

- `supabase/migrations/20260722100000_app_party_foundation.sql`;
- `scripts/proofs/app-party-foundation.proof.ts`;
- `supabase/migrations/20260724110000_app_case_party_role_foundation.sql`;
- `scripts/proofs/app-case-party-role-foundation.proof.ts`.

Rechecked hashes:

| source | SHA-256 |
|---|---|
| WP2A migration | `0356a978ed20b208ca8e3a350b5e80579e0cd186b9f909a761600d1bebf6a9a4` |
| WP2A proof | `f2e36b8c68178fe911547277fcd9686211dd65a8d0f6eb95c5355e182ef9c086` |
| WP2B-I migration | `fb3f9b5d0705d47a5f1be9f934684a25ad474000874daf2ef9e071ab3ddb56a1` |
| WP2B-I proof | `12e4fdc5587fed04f75d3dda039c56e72fcd144cf1ecd8b943f1db7e32ef52bb` |

WP2B-I migration, proof, and governance evidence are committed in `5a5265adc516e8198cc25757654920d4aa3316bd`. The protected WP2B-I proof page still contains its evidence-time statement that the migration and proof were uncommitted. This audit does not rewrite that historical proof page because the batch explicitly excludes changes to it; the roadmap, TODO, and append-only changelog record the later commit truth.

### Current schema truth

Read-only local catalog inspection confirmed:

| object | current truth | authority boundary |
|---|---|---|
| `app_customers` | 211 rows; ENVAL account shell | not a party or authority |
| `app_customer_identities` | 73 rows; Auth/account binding | credential and verified-email control only |
| `app_dossier_legal_acceptances` | 60 rows; versioned legal/commercial acceptance | not authority and not a signed mandate |
| `app_parties` | 0 rows; immutable party roots | no authority semantics |
| `app_party_person_versions` | 0 rows; immutable natural-person profiles | profile is not identity or authority evidence |
| `app_party_organization_versions` | 0 rows; immutable organization/VvE profiles | organization facts are not board/signing authority |
| `app_customer_party_relationships` | 0 rows; account/service roles | account owner, contact, and service recipient are not authority |
| `app_cases` | 0 rows; immutable customer-owned case roots | account ownership is not authority |
| `app_case_party_roles` | 0 rows; profile-pinned immutable case-role claims | case role is not authority or mandate |
| `app_dossier_document_files` | 286 rows; file transport/confirmation lifecycle | upload/confirmed file is not accepted authority evidence |
| `app_dossier_document_versions` | 164 rows; immutable document-version history | document version is not an acceptance decision |
| intake/files/capabilities | 0 rows; quarantine/capability schema exists | precheck/parser output is non-authoritative |

Both WP2A and WP2B-I tables have RLS enabled. Their deny-all policies remain active; `PUBLIC`, `anon`, and `authenticated` have no table privileges; `service_role` has exactly `SELECT` and `INSERT`. Their immutable-history, subtype/profile, temporal, provenance, supersession, and overlap guards remain the reusable local patterns.

Versions `20260722100000` and `20260724110000` are absent from local `supabase_migrations.schema_migrations`. That migration-history condition is not changed by this audit.

No current authority root, authority version, authority-evidence link, or authority decision object exists.

### Current runtime and visual truth

Inspected runtime/module boundaries include:

- `supabase/functions/_shared/app_customer_auth.ts`;
- `supabase/functions/_shared/app_foundation.ts`;
- `supabase/functions/api-app-signup-submit/index.ts`;
- `supabase/functions/api-app-auth-bootstrap/index.ts`;
- `supabase/functions/api-app-dashboard-get/index.ts`;
- current app document upload, confirmation, download, and withdrawal functions;
- legacy parser/analysis helpers and `api-dossier-verify`, for classification only;
- `app/src/features/auth/**`;
- `app/src/features/signup/**`;
- `app/src/features/dashboard/**`;
- `app/src/features/documents/**`;
- `app/src/features/invoice-analysis/**`;
- shared app components;
- `app/src/styles/tokens.css`, `base.css`, `layout.css`, `components.css`, `utilities.css`, and `global.css`.

The current patterns confirm that this readiness question is a domain-contract question. It requires no runtime, component, layout, token, CSS, or visual change. Existing frontend auth, signup, dashboard, upload, parser, and status presentation cannot establish authority. CSS reuse is not applicable in this docs-only batch.

## 3. Auth And Account Boundary

The following facts never prove representation authority:

- a Supabase Auth user;
- a verified email;
- a row in `app_customer_identities`;
- a row in `app_customers`;
- account ownership;
- a contact role;
- a customer-party relationship;
- a service-recipient role;
- a case-contact role;
- dossier ownership;
- a legal acceptance;
- parser output;
- an upload or confirmed immutable document version;
- detected text, a detected name, or signature detection.

Auth proves credential control and, under the current helper boundary, verified-email control. `app_customer_identities` binds that credential to an ENVAL account. Portal authorization may permit an endpoint call while the caller still has no legal authority to represent, sign for, or bind a party.

No future authority decision may be created merely because an Auth ID, email, account, customer, dossier, relationship, acceptance, upload, parser result, or case role exists. A customer or parser may submit a claim or observation only; neither may create operational accepted authority.

## 4. Party Boundary

### Required concepts

| concept | required meaning |
|---|---|
| represented party | the natural person or organization whose legal sphere is affected by the act |
| representative party | the natural person or organization said to hold authority to act for the represented party |
| acting natural person | the human who performs the concrete action; always separately identifiable for an authority-dependent action |
| organization | an organization party, including a VvE classification, not an Auth account |
| VvE | an organization classification; not a third party kind and not automatically represented by an account contact |

### Recommended TARGET decisions, not approved

1. Permit both `natural_person` and `organization` as representative-party kinds. Restricting all representation to natural persons would fail to express a documented representative organization or delegated professional organization.
2. Require every authority-dependent action to identify an acting natural-person party and its exact historical profile version.
3. If a representative organization acts, require a separately reviewed authority path from the represented party to that organization and from that organization to the acting natural person, or another explicitly approved equivalent chain. An organization name or employee/contact role is insufficient.
4. Pin the represented-party profile version, representative-party profile version, and acting-person profile version that were relied on. Later profile or register versions create new observations/versions; they do not rewrite historical claims or decisions.
5. Treat a natural person acting for the same natural-person party as explicit self-action, not as a fabricated representation-authority record. Identity and party matching still require their own evidence and review; Auth equality is insufficient.
6. Treat a third party representing a natural person through the same explicit authority aggregate, evidence, scope, time, decision, and conflict rules as other third-party representation.
7. An organization never “self-acts” without an acting natural person. A natural person behind an organization must not disappear into an actor string or job title.

Decisions 1, 3, 5, and 6 require explicit legal/product approval. They are not derived from the mapped TKV text.

## 5. Authority Versus Mandate

The contexts must remain strictly separate:

- representation authority supports a decision that an actor may act for a represented party within an explicit scope and period;
- a mandate is the signed authorization by the competent party to ENVAL, with its exact clauses, EAN/location scope, issue date, and whole-calendar-year validity;
- authority is not a mandate;
- a mandate is not authority evidence merely because it has a signature;
- mandate evidence is not authority evidence;
- authority validity is not mandate calendar-year validity;
- an authority decision may not simulate the two signed mandate permissions;
- a mandate may not automatically prove the signatory's authority.

A later mandate version should consciously reference:

- the represented party;
- the signatory natural-person party and pinned profile version;
- the exact relied-on authority version and accepted authority decision where representation is involved;
- an explicit self-action classification where a natural person signs for self;
- the applicable connection/EAN references;
- the explicit calendar year or successive whole calendar years;
- the signed mandate evidence version and its hash/provenance;
- the exact mandate clause/version set.

Authority expiry, revocation, dispute, or correction after signature must not silently mutate the historical mandate. A later contract must decide when that event blocks future reliance, requires mandate re-execution, or creates a legal-review task.

## 6. Authority Basis

Possible basis categories are an inventory, not approval:

| possible basis | structural readiness | unresolved approval |
|---|---|---|
| statutory/legal representation | category can be modeled only after terminology is approved | applicable legal grounds, actor types, evidence, scope, and expiry |
| board authority | category can be modeled only after terminology is approved | register/statute/board evidence and sole-signing rule |
| joint board authority | not DDL-ready | joint composition, K-of-N/all rule, changes, and action proof |
| limited power of attorney | category can be modeled only after terminology is approved | permitted acts, delegation, termination, and evidence standard |
| chain of powers of attorney | not DDL-ready | maximum/allowed chain, each link, scope narrowing, broken-link behavior |
| VvE board authority | not DDL-ready | VvE-specific board, register, statutes, and joint-signing criteria |
| VvE manager authority | not DDL-ready | management agreement scope and whether subdelegation is permitted |
| judicial or other legal representation | not DDL-ready | accepted legal instrument, competent authority, period, and restricted handling |
| other documented basis | not operationally schema-ready | closed classification and legal approval are mandatory; free text alone is forbidden |

No listed basis is accepted merely by storing its label. Every operational authority version needs an approved closed basis code, basis-specific evidence requirements, review rules, explicit scope, validity, and a decision. Free text may explain a decision but may never be the sole basis.

The current mapped NEa requirements do not supply those basis-specific legal rules. This is the principal source/legal blocker.

## 7. Scope

Scope needs a closed, composable contract. The following are separate candidates for explicit approval:

- general representation;
- signing only the ENVAL mandate;
- case handling;
- supplying evidence;
- submitting corrections;
- receiving information;
- signing or granting the mandate's inspection permission;
- connection/EAN-specific acts;
- calendar-year or period-bound acts.

Required rules:

- scope is explicit and cannot be inferred from a UI action, endpoint call, upload, account role, customer relationship, case role, or mandate;
- broad scope never follows from a narrower scope;
- the authority to sign the ENVAL mandate does not itself create that mandate;
- permission for NEa/DSO data retrieval and verifier location control remains signed mandate content;
- party-wide, case-bound, mandate-bound, connection-bound, and action-bound scope are distinct dimensions;
- connection/EAN and calendar-year references remain owned by their bounded contexts;
- a scope expansion creates a new reviewed authority version and never inherits acceptance silently;
- unrecognized scope is rejected, not stored as free-form operational truth.

DDL remains blocked until Daan approves the closed scope vocabulary, allowed combinations, narrowing/expansion rules, and which dimensions are mandatory for each authority basis.

## 8. Time And History

### Required temporal model

- `valid_from` and optional exclusive `valid_to` express business validity.
- `recorded_at` expresses system recording time.
- Effective time and recorded time remain separate.
- Invalid or empty intervals are forbidden.
- Versions are immutable.
- Every correction, new evidence outcome, suspension, revocation, dispute resolution, or scope change appends a new version or decision.
- Supersession is explicit and the revision chain is linear.
- Old profile, evidence, external-register, authority, and decision truth is retained.

### Decisions still required

| topic | recommended TARGET rule | unresolved point |
|---|---|---|
| retroactive registration | permitted only with an explicit backdated decision, evidence, reason, and four-eyes | maximum/allowed retroactivity and legal effect |
| expiry | derived from approved business validity; never silently renewed | warning/review policy |
| revocation | blocks future reliance from an explicit effective time; history remains | whether and when prior acts are affected |
| suspension | temporary future-use block with reason, start/end or reinstatement decision | who may impose/lift it |
| dispute | blocks operational reliance unless an approved exception exists | legal-review and resolution rule |
| supersession | same stable authority root, explicit predecessor, later recording time | which scope changes require a new root |
| overlap | competing operational versions are rejected or made non-operational pending review | exact same-scope and partial-scope rules |
| multiple representatives | allowed only when individual/joint conditions are explicit | allowed concurrency and priority |
| joint authority | action must prove all required participants under the approved joint rule | K-of-N/all semantics and membership history |
| profile changes | new profile version never rewrites an authority version | when profile change forces re-review |

Current external register data is a new observed/source-bound fact. It can support a new review or decision but cannot rewrite what was known, relied on, or decided at an earlier recorded time.

## 9. Evidence

Potential authority-evidence categories include:

- trade-register extract;
- statutes;
- board resolution;
- power of attorney;
- management agreement;
- identity/signature evidence;
- external register outcome;
- human review record.

These categories are not accepted evidence standards. Exact source, freshness, authenticity, completeness, signer, scope, and legal-sufficiency rules still need approval.

Required boundaries:

- upload is not accepted evidence;
- confirmed bytes and an immutable document version are not accepted evidence;
- parser/OCR/signature-detection output remains observed/derived;
- evidence acceptance is a separate authorized decision;
- every evidence link identifies the exact evidence version or immutable external reference, content/source hash where applicable, source, actor, request, and recorded time;
- an evidence relation is explicit: supports, contradicts, indicates withdrawal/revocation, or is insufficient;
- duplicate bytes or duplicate source references must be detected without collapsing distinct review contexts;
- current external register output creates a new observation and cannot rewrite historical authority;
- identity/signature evidence may support who acted but does not alone prove authority;
- a human review record is decision provenance, not evidence that the underlying legal basis exists.

Evidence acceptance runtime remains outside this audit. The legal/product evidence matrix per authority basis is a DDL blocker.

## 10. Claim, Decision, Workflow And Validity Status

One overloaded status field is rejected.

Recommended closed categories for contract approval:

| category | proposed vocabulary | meaning |
|---|---|---|
| claim lifecycle | `submitted`, `withdrawn` | what the claimant has done; withdrawal does not erase history |
| review workflow | `queued`, `in_review`, `awaiting_evidence`, `awaiting_second_review`, `completed`, `reopened` | operational work routing only |
| decision outcome | `confirmed`, `rejected`, `disputed`, `insufficient_evidence`, `suspended`, `revoked`, `reinstated` | immutable authority-review outcome |
| derived validity | `not_yet_effective`, `effective`, `expired`, `suspended`, `revoked`, `disputed`, `superseded` | computed operational usability at a requested time |

This vocabulary is a recommendation, not approval. `withdrawn` is a claim act; `expired` is temporal truth; `in_review` is workflow; `confirmed` is a decision. They must not be collapsed.

Operational authority truth may exist only when:

1. the exact authority version has a terminal `confirmed` decision;
2. all required maker/checker approvals exist;
3. the requested action falls within explicit scope;
4. the requested time falls within business validity;
5. the exact profile and evidence versions are pinned;
6. no later applicable suspension, revocation, dispute, rejection, or supersession blocks reliance;
7. every required link in an authority chain is independently operational;
8. any joint-representation condition is satisfied.

A single stored status must not substitute for this evaluation.

## 11. Four-Eyes And Decision Authority

Customers, contacts, account owners, uploaders, parsers, background workers, and generic system actors may submit claims or observations but may never self-create accepted authority.

Recommended material decisions requiring two distinct qualified reviewers:

- first confirmation of operational authority;
- scope expansion;
- retroactive effective start;
- acceptance of a chain or joint-signing arrangement;
- acceptance of VvE board/manager authority;
- override of missing, stale, contradictory, or inconclusive evidence;
- suspension, reinstatement, or revocation where reliance is affected;
- resolution of competing claims;
- correction after an authority-dependent action was already performed;
- emergency authorization or emergency reliance.

Minimum immutable decision metadata:

- exact authority root and version;
- outcome and closed reason code;
- decision time and effective time if different;
- reviewer actor type and opaque actor reference;
- request/correlation ID;
- evidence links and requirement/basis references;
- scope reviewed;
- prior decision/supersession reference;
- maker and checker identities;
- explicit conflict-of-interest/self-approval result;
- emergency flag, expiry, and mandatory later-review reference where applicable.

Maker-checker rules:

- maker and checker are different authorized natural persons;
- neither may be the claimant, represented party's acting representative, uploader whose work is being accepted, or the other reviewer;
- no actor approves its own submitted, corrected, or emergency decision;
- parser/system output cannot occupy a reviewer position;
- a failed audit write fails the material decision closed;
- reopen/correction appends new review truth and never edits the old decision.

The exact qualified role model, delegation of reviewer authority, conflict-of-interest policy, and emergency procedure require Daan and legal/operations approval.

## 12. Cardinality, Joint Authority And Conflict

Required domain cardinality:

- one represented party may have multiple representatives;
- one representative may represent multiple parties;
- one representative organization may have multiple acting natural persons;
- multiple authority roots may coexist historically;
- individual and joint authority must remain distinguishable;
- multiple claims may compete without destructive merging;
- evidence may support multiple claims while every use remains explicit and context-bound;
- an authority chain consists of explicit reviewed links, never one opaque text or JSON claim.

Database-enforceable future invariants:

- mandatory represented and representative parties are different except the explicit no-authority self-action path;
- party/profile-version same-party and subtype consistency;
- exact basis and scope vocabularies;
- valid half-open intervals;
- immutable versions and decisions;
- one linear supersession chain per stable root;
- no self-supersession or cycles;
- no duplicate direct successor;
- no operational same-scope overlap that violates the approved individual/joint rule;
- all referenced authority-chain links and joint participants are exact stable IDs;
- no operational decision without required maker/checker separation;
- no authority is created by a case-role, Auth, customer, relationship, acceptance, upload, or parser FK/trigger.

Operational/legal review rather than database inference:

- whether evidence is authentic and legally sufficient;
- whether scopes conflict semantically;
- whether an authority chain is legally valid;
- whether joint participants satisfy the governing instrument;
- whether revocation affects historical reliance;
- whether emergency reliance is permissible;
- whether a competing claim blocks all or only some acts.

Joint-membership representation and chain composition have not yet been assigned an approved single-responsibility physical model. This alone prevents exact DDL.

## 13. Case And Future-Context Linkage

Authority can be:

- party-wide;
- case-bound;
- mandate-bound;
- connection-bound;
- action-bound.

These are explicit scope dimensions, not inferred ownership.

Later modules need stable conscious references to:

- the authority root;
- the exact authority version relied on;
- the accepted authority decision;
- each authority evidence link relied on.

An authority-dependent action should also preserve the evaluation time, acting natural person, requested scope, and result. A case role may provide workflow context only. No FK, trigger, shared enum, or service helper may automatically promote `service_recipient`, `case_contact`, represented-party context, customer ownership, or any future case role into authority.

A future mandate must deliberately reference the exact authority decision/version used for its signatory, or the explicit self-action route. Connection/EAN, regulatory versioning, verifier workflow, findings/CAPA, and settlement remain separate bounded contexts.

## 14. Provenance, Privacy And Security Reuse

Reusable WP2A/WP2B-I patterns:

- the actor vocabulary `customer`, `system`, `support`, `admin`, `edge_function`, `worker`, `provider`, `unknown`;
- mandatory nonblank source/request/actor references;
- separate business validity and recording time;
- immutable roots/history where responsibility matches;
- explicit supersession;
- profile-version pinning;
- half-open interval checks;
- deterministic locking and deferred checks where cross-row cardinality requires them;
- deny-all RLS;
- no browser grants;
- minimal explicit `service_role` grants;
- proof isolation, protected counts/hashes, and full cleanup.

Required authority-specific limits:

- actor/source references contain opaque internal IDs or pseudonymous references, not names, emails, phone numbers, government identifiers, raw document text, tokens, Storage paths, or secrets;
- evidence and review metadata remain internal and are not directly browser-readable;
- customer-safe projection is later scope and cannot expose raw evidence, reviewer identity, conflict notes, provider payload, hashes, or internal audit;
- material authority writes are server-side and fail closed on authorization/audit failure;
- existing generic helpers may be reused only when their responsibility and vocabulary match; no near-duplicate authority helper is justified in this audit.

## 15. Modularity And Future Change

Representation authority remains its own bounded context. It may later link additively to:

- mandates;
- connection/EAN;
- evidence acceptance;
- regulatory requirement versions;
- verifier workflows;
- findings/CAPA;
- settlement where signing authority matters.

It must not become:

- a generic EAV model;
- a generic JSON authority blob;
- a universal role engine;
- an extension of Auth claims;
- an extension of customer/account roles;
- an extension of case-role status;
- an extension of legal acceptance;
- an extension of parser output.

New NEa or legal requirements should be expressible through new immutable versions, approved scope/basis vocabulary, evidence links, decisions, and requirement references. Historical authority may never be mutated to resemble a later rule.

## 16. Decision Matrix

| subject | CURRENT truth | official/mapped requirement | recommended TARGET decision | alternative | risk | Daan decision needed | blocks DDL | proposed test/proof |
|---|---|---|---|---|---|---|---|---|
| Auth boundary | verified credential/email to account only | `NEA-SEC-001/002` | prohibit every Auth/account-to-authority inference | permit account-owner inference | unauthorized acts | yes | yes | negative Auth/customer/identity inserts cannot create authority |
| represented party | WP2A party roots exist | `NEA-MAND-002/003` | exact natural-person or organization party plus pinned profile | customer/dossier as principal | unstable legal identity | yes | yes | subtype/profile pinning and later-profile stability |
| representative kind | no model | `NEA-MAND-003` names authorized representative | allow natural person or organization; always record acting human | natural-person-only | cannot express organization chain, or overcomplexity | yes plus legal | yes | valid/invalid representative and acting-person combinations |
| VvE | organization classification only | `NEA-MAND-003` | VvE-specific reviewed authority basis | infer from VvE account/KvK | invalid mandate signer | yes plus legal | yes | VvE account/contact cannot simulate authority |
| self-action | absent | `NEA-MAND-002` | explicit self-action without fabricated authority root | create self-authority record | false representation semantics | yes plus legal | yes | self-action requires party/profile match, never Auth equality |
| third-party natural person | absent | authorized signer requirement | full authority aggregate and review | contact/customer relation | unauthorized signature | yes plus legal | yes | relationship/case role cannot substitute |
| organization acting person | absent | signer name/signature | explicit authority chain and acting-person profile | actor string/job title | untraceable human act | yes plus legal | yes | broken chain and missing acting person rejected |
| basis vocabulary | absent | authority evidence required by `NEA-MAND-003` | closed basis codes with basis-specific evidence | free text | unverifiable claims | yes plus legal | yes | unknown/free-text-only basis rejected |
| general versus limited scope | absent | mandate signer must be authorized | closed action and dimension scopes | one broad boolean | overreach | yes plus legal/product | yes | out-of-scope action rejected |
| mandate-signing scope | absent | `NEA-MAND-001-005` | authority permits signing act only; mandate remains separate | authority creates mandate | simulated mandate | yes | yes | no authority write creates mandate truth |
| connection/year scope | separate contexts | `NEA-MAND-002-005` | conscious stable references; no ownership/year inference | copy EAN/year strings | drift and false ownership | yes | yes | exact reference and boundary-negative proof |
| business time | WP2A/WP2B-I patterns | `NEA-MAND-004`; `NEA-AUD-002` | half-open validity separate from recording time | one timestamp/status | lost historical truth | yes | yes | invalid/boundary intervals and time-travel evaluation |
| retroactivity | absent | no exact mapped rule | explicit backdated decision plus four-eyes | allow arbitrary `valid_from` | retrospective authority fabrication | yes plus legal | yes | backdate without approval rejected |
| expiry | absent | time-bound truth principles | derived expiry, no silent renewal | mutable active flag | stale authority | yes | yes | expiry blocks later action and preserves prior reliance |
| revocation | absent | correction/history internal controls | explicit effective revocation; preserve history | delete/update | erased reliance | yes plus legal | yes | future blocked, historical record unchanged |
| suspension/dispute | absent | audit/correction controls | separate decisions that block operational use | mixed claim status | ambiguous authority | yes | yes | disputed/suspended version non-operational |
| supersession | WP2A/WP2B-I linear patterns | `NEA-COR-001` | linear immutable chain | silent overwrite | unreconstructable decisions | no, pattern accepted; scope rule still needed | yes | roots/successors/cycle/concurrency proof |
| overlap | bounded WP2A/WP2B-I rules only | internal control | enforce approved individual/joint semantics | forbid all overlap | blocks legitimate joint/multiple reps | yes plus legal | yes | competing overlap and permitted joint cases |
| joint representation | absent | no exact mapped rule | explicit participants and K-of-N/all rule | prose condition | incomplete signatures | yes plus legal | yes | missing participant and changed membership rejected |
| evidence categories | upload/version primitives only | authority evidence in `NEA-MAND-003`; `NEA-AUD-002` | basis-specific accepted-source matrix | any upload | false acceptance | yes plus legal | yes | upload/parser alone remains non-operational |
| evidence relation | absent | traceability requirement | supports/contradicts/revokes/insufficient links | binary accepted flag | loses conflict meaning | yes | yes | conflicting and insufficient evidence proof |
| claim/workflow/decision/validity | WP2B-I has case-role claim states only | `NEA-AUD-002/003` | four separate categories | one status field | invalid operational evaluation | yes | yes | status-category and derived-truth truth table |
| four-eyes | target only | `NEA-AUD-003` internal control | distinct qualified maker/checker for material decisions | single reviewer | fraud/error/self-approval | yes | yes | same actor and conflicted reviewer rejected |
| emergency path | absent | no exact mapped rule | narrow expiring exception plus mandatory later review, or prohibit | unrestricted override | unauthorized urgent action | yes plus legal/ops | yes | expiry and mandatory checker proof |
| case linkage | WP2B-I case roles exist | mapped case/audit context | explicit optional scope reference; never automatic | trigger from case role | case role becomes authority | yes | yes | FK/trigger inventory and negative role proof |
| stable references | no authority IDs | audit/traceability | root, exact version, decision, and evidence-link IDs | current-row lookup | history changes underneath act | yes | yes | later supersession does not change relied-on IDs |
| privacy/projection | deny-all local tables; no authority UI | `NEA-AUD-004`, `NEA-SEC-001/002` | internal-only evidence/review; later safe projection | direct browser select | PII/reviewer leakage | no for baseline; later projection decision | no for internal contract, yes for UI | grants/RLS/redaction/no-PII proof |
| candidate object split | no authority objects | one responsibility and auditability | stable root, immutable versions, evidence links, immutable decisions | one universal table/JSON | mixed responsibilities | yes | yes | exact object/column/responsibility inventory |
| migration history | both committed migrations absent locally | repository operational truth | keep separate deployment gate | manual history repair | false migration proof | no | no for contract; yes for deploy | read-only history/parity proof later |

## 17. DDL-Readiness Verdict

BLOCKED — SOURCE OR LEGAL DECISION REQUIRED

The block is exact: the current mapped official requirements require an authorized enterprise/VvE signer and authority evidence, but do not define which legal authority bases ENVAL may confirm, which evidence proves each basis, how organization and VvE chains work, how joint authority works, or how revocation/retroactivity affects reliance. Those are not safe database defaults.

## 18. Exact Decisions Daan Must Approve

Daan must approve the following only after the identified legal/source input is available:

1. Whether both natural persons and organizations may be representative parties.
2. The mandatory acting-natural-person and authority-chain rule for a representative organization.
3. The self-action rule for a natural person and the prohibition on fabricated self-authority.
4. The treatment of third-party representation of a natural person.
5. The closed authority-basis vocabulary.
6. The legal/evidence acceptance matrix for every basis, including VvE board and manager authority.
7. The closed authority-scope vocabulary and allowed party/case/mandate/connection/action/time dimensions.
8. The rule that authority never creates mandate clauses, permissions, EAN truth, or calendar-year mandate validity.
9. Exact represented, representative, acting-person, and profile-version pinning.
10. Retroactive registration limits and legal effect.
11. Expiry, suspension, dispute, revocation, reinstatement, and historical-reliance rules.
12. Linear supersession and when a scope/basis change needs a new stable root.
13. Same-scope, partial-scope, competing-claim, and multiple-representative overlap rules.
14. Joint authority composition and K-of-N/all action requirements.
15. Authority-chain length/delegation/narrowing and broken-link behavior.
16. The separate closed claim, workflow, decision, and derived-validity vocabularies.
17. Which material decisions require four-eyes.
18. Reviewer qualification, maker-checker separation, conflict-of-interest, and no-self-approval rules.
19. Whether an emergency path exists and, if so, its expiry and mandatory later review.
20. The exact stable references later case, mandate, connection, evidence, verifier, correction, and settlement modules must retain.
21. The authority-specific privacy, retention, internal access, and later customer-safe projection boundary.
22. Whether the four candidate responsibilities below are sufficient, especially for joint membership and authority chains; no additional object should be named until it has one approved responsibility.

## 19. Bounded Follow-Up Contract

The next step is a contract-decision batch, not schema work.

That bounded follow-up should:

1. obtain or record the legal/source decision for accepted authority bases, evidence, organization/VvE representation, joint authority, chains, retroactivity, and revocation reliance;
2. record Daan's decisions 1-22 above in the existing customer/party/representation/case contract;
3. resolve the exact closed vocabularies and truth-evaluation rules;
4. prove the proposed responsibilities are non-overlapping and sufficient without EAV, JSON, or a universal role engine;
5. define an exact future proof matrix;
6. end with a separate explicit DDL-ready or still-blocked decision.

It must not create SQL, migration, proof script, runtime, RPC, Edge Function, frontend, UI, CSS, backfill, remote action, or deployment.

## 20. Unapproved Candidate Responsibilities

The following are unapproved candidates only:

| candidate name | single proposed responsibility |
|---|---|
| `app_representation_authorities` | stable identity of one represented-party to representative-party authority claim/relationship, without mutable status |
| `app_representation_authority_versions` | immutable basis, scope, business validity, pinned party/profile references, joint/chain semantics, and explicit supersession for one stable root |
| `app_representation_authority_evidence` | immutable, typed linkage from an exact authority version to an exact evidence version/external reference, including supports/contradicts/revokes/insufficient meaning |
| `app_representation_authority_decisions` | immutable maker/checker review outcomes, reasons, effective/recorded times, requirement/evidence references, corrections, and emergency metadata |

These names are not approved schema. Their columns, constraints, normalization, cardinality, and even final necessity remain undecided. In particular, joint-membership and chain composition must not be forced into JSON or an overloaded candidate merely to avoid an additional contract decision.

## 21. Hard Exclusions

- no contract approval;
- no DDL or migration;
- no SQL or proof script;
- no authority runtime;
- no mandate implementation;
- no connection/EAN implementation;
- no evidence-acceptance runtime;
- no Auth change;
- no RPC;
- no Edge Function;
- no frontend, UI, CSS, or inline CSS;
- no backfill or cutover;
- no migration-history repair;
- no remote action;
- no staging, commit, push, merge, deploy, or production claim.

This audit changes documentation only. It neither approves nor constructs representation authority.
