# WP3B Connection/EAN Object Disposition

PROOF ONLY — WP3B CURRENT OBJECT DISPOSITION

Dit document legt uitsluitend de docs-only disposition vast van de bestaande lokale connectionobjecten en hun bronnen. Het is geen deletionplan, migration, DDL, proofuitvoering, CURRENT PROVEN-claim of toestemming voor lokale/remote mutatie.

## Evidencebasis

- WP3A is gecommit in HEAD `f3b39aafb2e6817e64401ccb2c47eed285552869`.
- Read-only catalog inspection op 2026-07-24 bevestigt drie lege tabellen, acht connection guards, negen triggers, vijftien indexes, drie deny-all policies, één audithelper, vier write-RPCs en nul lokale migration-historyrijen.
- Exact-name source search vindt geen actuele app-, Edge Function-, service- of frontendcaller van de vier RPCs of drie tabellen. Alleen proofs, docs en inactieve baselinevoorstellen refereren eraan.
- Remote aanwezigheid is niet onderzocht en blijft UNKNOWN.
- De twee migrations zijn ignored/untracked; de twee proofs zijn untracked. Geen ervan is CURRENT canon.

Toegestane dispositionwaarden in dit document zijn uitsluitend `KEEP`, `EXTEND`, `REPAIR`, `REPLACE`, `PROVE AGAIN`, `BLOCKED`, `RETIRE AFTER REPLACEMENT PROOF`.

## Tabellen

| object | huidige bron | repo-classificatie | lokale catalogusstatus | rowcount | migration history | callerstatus | conflict | herbruikbare logica | disposition | deletion/replacement precondition | rollback/auditrisico |
|---|---|---|---|---:|---|---|---|---|---|---|---|
| `app_connections` | ignored migration `20260720120000` | ignored/untracked | bestaat; RLS; 14 constraints; 6 indexes; 3 triggers; deny-all | 0 | versie afwezig; history totaal 0 | geen runtimecaller | mengt EAN, connectiontype, customer/dossier/location en mutable status; globale status-based EAN unique | 18-digit predicate; boundarycheck; provenancevorm | REPLACE | goedgekeurd contract, additive replacement, caller- en rowcountproof, data/exportbesluit, rollbackplan, groen lokaal bewijs en expliciete cleanupgoedkeuring | directe drop verliest catalogus-/auditprovenance en kan onbekende remote of toekomstige caller breken |
| `app_connection_periods` | ignored migration `20260720120000` | ignored/untracked | bestaat; RLS; 13 constraints; 4 indexes; 3 triggers; deny-all | 0 | versie afwezig | geen runtimecaller | mutable periodrow, geen expliciete recorded-timecontract, dossier-locationbinding, direct-write race | half-open predicate; touching boundaries; source/decision separation | REPLACE | goedgekeurde allocation/locationversionsemantiek plus alle replacementgates | in-place wijziging kan oude shape en nieuwe truth oncontroleerbaar mengen |
| `app_connection_ownership_periods` | ignored migration `20260720120000` | ignored/untracked | bestaat; RLS; 14 constraints; 5 indexes; 3 triggers; deny-all | 0 | versie afwezig | geen runtimecaller | customer/dossier “ownership” in plaats van party/profile aangesloteneclaim; mutable; ambigu supersession | intervalpredicate; declared/observed/decisiononderscheid | REPLACE | approved claimcontract, party/profile pinning, replacement migration, concurrency- en historical-truthproof plus alle removalgates | verkeerde partytruth, silent overwrite en verlies van historische reconstructie |

De rowcount `0` autoriseert geen drop. Afwezige migration history bewijst niet hoe of waar alle objecten zijn toegepast. Remote aanwezigheid is niet automatisch bewezen of weerlegd.

## Acht guard-functions

Alle acht functies bestaan lokaal als security-invoker PL/pgSQL met `search_path=pg_catalog, public`. Zij zijn gebonden aan de te vervangen tabellen en krijgen daarom geen object-level `KEEP`; alleen expliciet genoemde predicates/patronen mogen later opnieuw worden ontworpen.

| object | huidige bron | tracked/ignored/untracked | lokale catalogusstatus | rowcount | migration-historystatus | callerstatus | conflict | herbruikbare logica | disposition | replacement precondition | rollback/auditrisico |
|---|---|---|---|---:|---|---|---|---|---|---|---|
| `app_connection_periods_overlap_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; `search_path=pg_catalog, public` | n.v.t. | versie afwezig | trigger-only | nonlocking direct-write overlap en oude periodscope | half-open overlappredicate | REPLACE | nieuwe scope, deterministic lock, deferred eindtransactieproof | write-skew of onverwacht afwijkende overlapsemantiek |
| `app_connection_ownership_periods_overlap_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; veilige path | n.v.t. | versie afwezig | trigger-only | accountclaim en nonlocking overlap | half-open overlappredicate | REPLACE | party/pointscope en concurrentieproof | twee operationele aangeslotenen kunnen door race ontstaan |
| `app_connections_boundary_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; veilige path | n.v.t. | versie afwezig | trigger-only | fixeert customer/dossier/location als core boundary | legacy mismatch rejection als safety observation | REPLACE | nieuwe root-/relationshipboundaries bewezen | in-place behoud legitimeert het conflicterende model |
| `app_connection_periods_boundary_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; veilige path | n.v.t. | versie afwezig | trigger-only | dossier-location- en connectionbinding volgens oude root | same-scope referential guardvorm | REPLACE | approved connection/allocation/locationrelaties | false positives/negatives na replacement |
| `app_connection_ownership_periods_boundary_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; veilige path | n.v.t. | versie afwezig | trigger-only | customer/dossier boundary is geen party/profile truth | focused same-scope guardvorm | REPLACE | WP2A party/profile FK/guardproof | account wordt opnieuw als legal party behandeld |
| `app_connections_transition_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; veilige path | n.v.t. | versie afwezig | trigger-only | UPDATE-gebaseerde mutable statusmachine | expliciete negatieve transitiontests | REPLACE | immutable version/statuscontract en proof | silent overwrite blijft mogelijk vóór terminal status |
| `app_connection_periods_transition_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; veilige path | n.v.t. | versie afwezig | trigger-only | mutable periods en incompleet immutable veldset | terminal mutation rejection als testidee | REPLACE | append-only versionchain bewezen | gedeeltelijke mutatie vervalst history |
| `app_connection_ownership_periods_transition_guard()` | migration `20260720120000` | ignored/untracked | bestaat; security invoker; veilige path | n.v.t. | versie afwezig | trigger-only | mutable claim, oud vocabulary en ambigu supersession | decisionmetadata checks als patroon | REPLACE | nieuwe status-, decision- en supersessionproof | oude verified/ownershipbetekenis lekt in aangeslotene-truth |

## Audithelper en vier RPCs

| object | huidige bron | tracked/ignored/untracked | lokale catalogusstatus | rowcount | migration-historystatus | callerstatus | conflict | herbruikbare logica | disposition | replacement precondition | rollback/auditrisico |
|---|---|---|---|---:|---|---|---|---|---|---|---|
| `app_connection_write_audit_event()` | migration `20260720143000` | ignored/untracked | bestaat; `SECURITY DEFINER`; `search_path=""`; service-role execute | n.v.t. | versie afwezig | alleen vier oude RPCs | scope en event ownership zijn dossier-/RPC-specifiek; geen zelfstandig canonobject | minimized audit-eventvorm en veilige search path | REPLACE | gekozen gedeelde auditverantwoordelijkheid, eventtaxonomy en fail-policy bewezen | dubbele audithelpers of verloren correlatie |
| `app_declare_connection_v1()` | migration `20260720143000` | ignored/untracked | bestaat; definer; empty path; service-role execute | n.v.t. | versie afwezig | geen runtimecaller; proof-only | creëert gecombineerde old-model connection en optionele period | idempotency, safe errors, row locking/auditvorm | REPLACE | approved root/acceptancecontract en nieuwe caller/authzproof | oude RPC kan replacement invariant omzeilen |
| `app_declare_connection_ownership_v1()` | migration `20260720143000` | ignored/untracked | bestaat; definer; empty path; service-role execute | n.v.t. | versie afwezig | geen runtimecaller; proof-only | customer/dossier ownershipclaim; oud vocabulary | scoped idempotency, source/request/actor checks | REPLACE | party/profile claimrootcontract en concurrentieproof | accounttruth wordt als aangeslotene vastgelegd |
| `app_decide_connection_ownership_v1()` | migration `20260720143000` | ignored/untracked | bestaat; definer; empty path; service-role execute | n.v.t. | versie afwezig | geen runtimecaller; proof-only | single-actor mutable decision; geen evidence acceptance/four-eyes | explicit decisionmetadata en safe status rejection | REPLACE | approved decision/evidence boundary en maker-checkerbeleid | “verified” wordt ten onrechte accepted evidence |
| `app_supersede_connection_ownership_v1()` | migration `20260720143000` | ignored/untracked | bestaat; definer; empty path; service-role execute | n.v.t. | versie afwezig | geen runtimecaller; proof-only | maakt ambigu `superseded` successor; geen unique successor of stable claimroot | append-history intent, idempotency en auditvorm | REPLACE | lineaire claimchain, wrong-party new-root en concurrent-successorproof | meerdere opvolgers of onduidelijke current truth |

## Negen triggers

| object | tabel / functie | huidige bron | tracked/ignored/untracked | lokale catalogusstatus | rowcount | migration-historystatus | callerstatus | conflict | herbruikbare logica | disposition | replacement precondition | rollback/auditrisico |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|
| `trg_app_connections_boundary_guard` | `app_connections` / boundary guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | oude combined-root boundary | trigger timing als inventarispunt | REPLACE | replacement table/guard/proof | trigger kan oude writes blijven accepteren/weigeren |
| `trg_app_connections_transition_guard` | `app_connections` / transition guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | mutable statusmachine | negatieve transitiontestvorm | REPLACE | immutable replacementproof | silent mutation |
| `trg_app_connections_updated_at` | `app_connections` / shared `app_set_updated_at()` | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | `updated_at`-mutatie past niet bij immutable root | gedeelde helper zelf blijft buiten WP3B en wordt niet gedupliceerd | REPLACE | immutable replacement bepaalt of een projection apart mutable is | helperbehoud op core suggereert overwrite-authority |
| `trg_app_connection_periods_boundary_guard` | periods / boundary guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | oude scope | focused boundaryvorm | REPLACE | approved relationmodel | oude FK-semantiek lekt |
| `trg_app_connection_periods_overlap_guard` | periods / overlap guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | nonlocking, niet deferred | half-open predicate | REPLACE | concurrency-safe eindtransactieproof | write-skew |
| `trg_app_connection_periods_transition_guard` | periods / transition guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | mutable history | terminal guard testidee | REPLACE | append-only versionproof | history mutation |
| `trg_app_connection_ownership_periods_boundary_guard` | ownership / boundary guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | account/dossier claimscope | focused guardvorm | REPLACE | party/profile scope proof | verkeerde legal party |
| `trg_app_connection_ownership_periods_overlap_guard` | ownership / overlap guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | nonlocking operationele overlap | half-open predicate | REPLACE | point-lock/deferred proof | dubbele aangeslotene-truth |
| `trg_app_connection_ownership_periods_transition_guard` | ownership / transition guard | migration `20260720120000` | ignored/untracked | bestaat | n.v.t. | versie afwezig | databasecaller | oud status/supersessionmodel | decision check testvorm | REPLACE | approved immutable claimversions | ambiguous current truth |

## Bronnen

| source | huidige bron | tracked/ignored/untracked | lokale catalogusstatus | rowcount | migration-historystatus | callerstatus | conflict | herbruikbare logica | disposition | deletion/replacement precondition | rollback/auditrisico |
|---|---|---|---|---:|---|---|---|---|---|---|---|
| `supabase/migrations/20260720120000_app_ean_connection_domain_foundation.sql` | lokaal sourcebestand; SHA-256 `83f278d70c239e890d5892102118c20425e167a6a99b4406588521bb6398cbd4` | ignored/untracked | shape van 3 tabellen, 8 guards, 9 triggers, 15 indexes en 3 policies aanwezig | 0 in elk van 3 tabellen | versie afwezig; totale history 0 | proof en docs; geen runtime | niet-canonieke conflicterende physical model | predicates, deny-all/grantvorm en comments als designinput | RETIRE AFTER REPLACEMENT PROOF | nooit verwijderen vóór committed forward replacement, catalog parity, caller/data/rollback/auditproof en expliciete goedkeuring | source-to-catalog provenance kan verloren gaan |
| `supabase/migrations/20260720143000_app_connection_write_rpcs.sql` | lokaal sourcebestand; SHA-256 `11131138f43fd0560189609160b824175549d1b9019c7781c4180dba1210b371` | ignored/untracked | 1 helper + 4 RPCs aanwezig | n.v.t. | versie afwezig; totale history 0 | proof en onderlinge calls; geen runtime | signatures en truthownership gebruiken oud model | safe definer search path, scoped idempotency en minimized auditvorm | RETIRE AFTER REPLACEMENT PROOF | nieuwe writeboundary en callerproof, old execute revoked via forward cleanup, rollbackplan | oude callable surface kan replacement omzeilen |
| `scripts/proofs/app-ean-connection-domain-foundation.proof.ts` | lokaal proofbestand; SHA-256 `5b3cb099313aa25a2d908c02123a2e60093100fe0b79180abe844a64f781b7ee` | untracked | geen catalogusobject; verwacht oude catalogus | n.v.t. | geen zelfstandig migration-historybewijs | standalone destructive local proof; geen runtime | exacte inventory, account/dossier, UPDATE en old supersession assertions conflicteren | opt-in gate, isolated fixtures, negative tests, protected counts, cleanup | PROVE AGAIN | herschrijven vanuit goedgekeurd contract; Deno check en volledige nieuwe proof; oude bron niet verwijderen vóór evidence-overdracht | narrative prior PASS is niet reproduceerbaar CURRENT bewijs |
| `scripts/proofs/app-connection-write-rpcs.proof.ts` | lokaal proofbestand; SHA-256 `6d271aa83c236b5336340c83117edf4d8f56bddaee42c86a026284f1a07c6391` | untracked | geen catalogusobject; verwacht oude helper/RPCs | n.v.t. | geen zelfstandig migration-historybewijs | standalone destructive local proof; geen runtime | valideert oude signatures/customer-dossiertruth en geen echte concurrency | opt-in gate, idempotency/audit negative tests, protected counts, cleanup | PROVE AGAIN | contractgedreven proof inclusief party/profile, evidence, supersession en two-transaction concurrency | oude PASS-tekst kan onterecht als targetproof worden gelezen |

## Indexes, policies en grants

- Alle vijftien huidige indexes volgen de drie te vervangen tabellen. De 18-digit syntax en periodquery-intentie zijn logic-only input; `app_connections_ean_active_uidx` is expliciet `REPLACE` omdat `NEA-EAN-004` geen globale active-EAN uniqueness is.
- De drie huidige deny-all policies zijn een bewezen catalogusvorm die als securitypatroon mag worden hergebruikt. Zij blijven op de oude tabellen staan totdat forward-only replacement/cleanup expliciet is goedgekeurd.
- `PUBLIC`, `anon` en `authenticated` hebben geen tabelprivileges.
- `service_role` heeft nu `SELECT`, `INSERT`, `UPDATE` op alle drie tabellen. `UPDATE` is `REPLACE` door `SELECT`/`INSERT` only op toekomstige immutable truth.
- De bestaande connectionfuncties hebben geen browser-executegrants; service role heeft execute. Nieuwe executegrants worden alleen per later bewezen transactionele functie toegekend.

## Forward-only replacementgate

Geen bestaande tabel, functie, trigger, index, policy, grant, migration of proofbron wordt in WP3B verwijderd of gewijzigd. Retirement of cleanup vereist cumulatief:

1. expliciet goedgekeurd WP3B-contract;
2. approved location/evidence/external-source dependencies voor de gekozen batch;
3. committed additive replacement migration;
4. actuele local en, in een afzonderlijk goedgekeurde batch, remote object/data/migration-historyinventaris;
5. rowcount-, export-, retention- en legal-holdbesluit;
6. caller/import- en execute-grantproof;
7. gecontroleerd backfill/cutoverplan wanneer data later niet meer nul is;
8. rollback- en auditplan;
9. groene lokale replacementproof, inclusief echte concurrency en protected truth;
10. afzonderlijke expliciete cleanupgoedkeuring.

Forward-only replacement en cleanup worden afzonderlijk ontworpen. Lege lokale tabellen zijn geen drop-authorisatie. Afwezige migration history is geen bewijs van afwezigheid elders. Remote aanwezigheid blijft UNKNOWN. Bestaande source wordt in deze batch niet verwijderd.

## Eindstatus

- Huidige drie tabellen: `REPLACE`.
- Huidig customer/dossier ownershipmodel: `REPLACE`.
- Globale status-based EAN uniqueness: `REPLACE`.
- Mutable periodrows en service-role UPDATE-grants: `REPLACE`.
- Acht guards, audithelper, vier RPCs en negen triggers: object-level `REPLACE`; alleen benoemde predicates/vormen zijn logic-only input.
- Twee proofs: `PROVE AGAIN`.
- Twee ignored migrations: `RETIRE AFTER REPLACEMENT PROOF`.
- DDL blijft geblokkeerd tot expliciete contractgoedkeuring en de toepasselijke externe/location/evidencebesluiten.
