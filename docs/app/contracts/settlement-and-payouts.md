# Settlement And Payouts Contract

Status: TARGET — FINANCE/SETTLEMENT CONTRACT

This document defines the provider-independent ENVAL TARGET contract for settlement and payouts. It is product architecture and an ENVAL INTERNAL CONTROL design, not implementation proof, legal advice, a statutory or NEa requirement, or authorization to execute settlement or payments.

## Responsibility And Source Ownership

This contract has one responsibility: preserve the boundary from realized ERE sale proceeds through customer entitlement, settlement, payout instruction, payment result, reconciliation, and later correction.

It reuses, but does not replace:

- `docs/app/legal/fee-model-and-service-terms.md` for the working commercial 10% success-fee model and claim boundaries;
- `docs/app/contracts/customer-party-representation-case.md` for legal-party, account, Auth, representation, case, and period ownership;
- `docs/app/06_NEA_REQUIREMENTS.md` and `docs/app/08_NEA_TRACEABILITY_MATRIX.md` for `NEA-FIN`, `NEA-AUD`, `NEA-RET`, `NEA-SEC`, and `NEA-COR` traceability;
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md` for finance, audit, correction, projection, port, and adapter boundaries;
- `docs/app/09_NEA_MVP_PLAN.md` and `docs/app/operations/nea-implementation-roadmap.md` for sequencing and implementation gates.

No new official NEa or legal obligation is created here. The 90/10 split is an ENVAL TARGET commercial assumption. Its contract wording, tax treatment, legal money-flow route, bank-account structure, safeguarding, licensing, withholding, VAT, and PSP obligations remain `UNKNOWN`.

## Expected Business Flow — TARGET

The current expected flow is:

1. ENVAL books qualifying customer kWh under a separately controlled booking and REV process.
2. ENVAL receives EREs resulting from the accepted external process.
3. ENVAL sells EREs to an external buyer under a separately approved sale process.
4. Sale proceeds are currently expected to be received by ENVAL; the lawful, fiscal, banking, and safeguarding structure is `UNKNOWN`.
5. Realized proceeds are allocated to the underlying legal parties using versioned source, quantity, period, case, EAN, booking, sale, and formula references.
6. A gross customer entitlement is calculated per legal party.
7. The current commercial TARGET assumption applies a 10% ENVAL fee to the approved fee base.
8. The net customer entitlement is therefore 90% in principle, subject to final commercial, legal, fiscal, and correction rules.
9. A separately approved payout instruction may later be executed through a bank, PSP, or controlled manual route.
10. Payment execution is reconciled independently against the instruction, settlement, and external result.

No step guarantees ERE award, sale, proceeds, entitlement, payout, timing, tax treatment, or acceptance by any external party.

## Strictly Separate Concepts

| concept | target meaning | must not imply |
|---|---|---|
| ERE sale | Commercial disposal of a defined ERE quantity to an external buyer. | Receipt of cash, customer allocation, or payout. |
| sale proceeds | Realized external value linked to a sale, currency, amount, date, and source reference. | Final customer entitlement or reconciled funds. |
| allocation | Versioned attribution of realized proceeds to eligible party/case/EAN/period/volume inputs. | A payment or an overwrite of booking truth. |
| gross customer entitlement | Party-owned amount before ENVAL fee and later finance corrections. | Cash held, instructed, paid, or reconciled. |
| ENVAL fee | Versioned fee calculation against an approved fee base and fee-model version. | A statutory percentage or final tax treatment. |
| net entitlement | Gross entitlement minus fee and applicable append-only corrections. | Payable approval or payment execution. |
| settlement period | The defined accounting/service period, normally a settlement month with explicit calendar-year context. | Booking period, mandate period, or bank value date. |
| settlement batch | Reconstructable grouping of allocations, entitlements, fees, corrections, and approvals for one controlled run. | Payout submission or payment. |
| payout instruction | Idempotent, approved instruction for a fixed beneficiary, destination version, currency, and amount. | Export, submission, acceptance, payment, or reconciliation. |
| payment execution | Bank, PSP, or controlled manual execution result linked to one instruction and external reference. | Mutation of entitlement, ERE, kWh, party, case, or payout destination history. |
| reconciliation | Comparison of instructions, execution results, statements/imports, and ledger expectations with explicit differences. | Payment merely because an export or submission exists. |
| correction | Append-only adjustment referencing the original finance record and reason. | Destructive edit of prior core truth. |
| reversal | Compensating finance entry that reverses a prior amount while preserving both records. | Deletion of the original entry. |
| clawback | Separately authorized recovery claim after a defined adverse correction or contractual event. | Automatic debit, silent netting, or proven legal enforceability. |

## Financial Beneficiary Boundary

- The legal party (`juridische partij`) is the financial beneficiary in this contract; both terms refer to the same party domain. A payout destination belongs to that legal party. An Auth account, account owner, representative, or contact person is not automatically the financial beneficiary.
- One legal party may be related to multiple customer accounts or contact persons.
- One legal party may have multiple cases, EANs, delivery periods, booking items, allocations, and settlements.
- Customer/account access and representation authority do not by themselves prove payout authority or beneficiary ownership.
- A payout destination is versioned, time-bound, source-traceable, restricted, and separately reviewed before use.
- Every payout instruction pins the exact beneficiary and payout-destination version used. A later bank-account change never changes an earlier instruction or payment record.
- Duplicate, overlapping, withdrawn, unverified, or ambiguous payout destinations fail closed.

## Required Projections

### Customer statement

The customer-safe monthly statement is scoped to one legal party and may aggregate or itemize:

- cases/dossiers;
- EANs and applicable periods;
- calendar year and settlement month;
- qualifying kWh;
- ERE allocation;
- realized sale proceeds;
- gross customer entitlement;
- ENVAL fee and fee-model version;
- corrections, reversals, or clawback status where customer disclosure is approved;
- net customer entitlement;
- payout status and paid date;
- safe bank/PSP reference;
- reconciliation status.

It never exposes full account details, raw bank/PSP payloads, internal audit logs, reviewer identity, secret/provider configuration, or unrestricted finance evidence.

### ENVAL finance overview

The restricted ENVAL overview supports the same dimensions plus:

- total realized sale proceeds;
- total gross customer liabilities;
- total ENVAL fee;
- total payable;
- total paid;
- total open, rejected, failed, or returned;
- reconciliation differences and unresolved corrections.

Customer statements and auditor/finance packs are separate projections over the same versioned finance truth. Neither is the core ledger.

## Audit, Approval, And Correction Rules

- Finance events and ledger effects are append-only; material history is never overwritten.
- Every calculation records formula version, factor version, source version, input references, rounding rule, currency, and result.
- Actor, request, source, evidence, decision, reason, timestamp, correlation, and idempotency references remain reconstructable.
- Critical payable approval requires four-eyes with distinct authorized actors before a payout instruction becomes executable.
- `exported != submitted`.
- `submitted != paid`.
- `paid != reconciled`.
- A bank or PSP result never mutates kWh, ERE, party, case, booking, sale, or entitlement core truth.
- Corrections reference the original records and create new adjustment, reversal, or clawback records as applicable.
- Recalculation creates a new version or compensating entry; it does not rewrite the original formula result.
- Partial success and partial payment remain explicit amounts and statuses, never inferred completion.
- Failures, rejects, returns, duplicate callbacks/imports, and reconciliation differences are idempotent and auditable.

## Provider-Independent Architecture

The target module boundaries are:

| module or port | single responsibility |
|---|---|
| settlement core | Validate allocation, entitlement, fee, settlement, correction, reversal, and clawback invariants without provider logic. |
| payout port | Accept an approved provider-independent payout instruction and return an external-attempt/result reference. |
| bank-export adapter | Render an approved instruction batch into one configured bank export format. |
| PSP adapter | Map approved instructions and provider results without owning settlement truth. |
| bank-statement/import adapter | Normalize external statement/import rows into immutable reconciliation observations. |
| manual fallback | Record controlled human export, execution, result intake, and reconciliation with the same approvals and provenance. |
| provider templates/configuration | Own provider-specific fields, formats, mappings, and validation outside the core. |

Core rules contain no bank- or PSP-specific status, payload, callback, account format, or transport logic. Payout instructions and reconciliation imports use scoped idempotency keys and immutable payload/input hashes. Provider observations cannot become paid or reconciled truth without the owning transition and controls.

## Security And Privacy

- Payout destinations, beneficiary verification material, account identifiers, statement rows, and provider results are sensitive finance data.
- No bank or PSP data is stored before purpose, legal basis, controller/processor roles, retention, access model, provider route, and required verification are decided.
- Full payout destinations and raw external data never enter broad customer projections.
- Finance access is minimum-privilege and separated from customer, support, engineering, compliance, and payout-approval duties where applicable.
- Destination creation, verification, activation, withdrawal, supersession, and use are versioned and auditable.
- General audit logs contain only minimized references and safe metadata, never raw bank statements, full account details, secrets, access tokens, or provider payloads.
- Exports and finance packs use explicit scope, redaction, access logging, expiry, and retention controls.

## Pilot Boundary And Sequencing

The first controlled pilot may use:

- an append-only settlement ledger;
- monthly customer statements and a restricted ENVAL finance overview;
- manual payout execution under four-eyes control;
- manual reconciliation with immutable source references and explicit differences.

Bank/PSP automation is not a pilot prerequisite. Later bank-export, PSP, and statement/import adapters require their own bounded design, legal/privacy/security decisions, implementation approval, provider contract, tests, and proof.

The finance implementation remains late in the roadmap and depends on proven party/case ownership, EAN and kWh truth, booking and ERE calculation, recorded ERE sale and proceeds, finance approvals, and the unresolved legal/fiscal/banking decisions.

## UNKNOWN Decisions And Explicit Non-Claims

The following remain `UNKNOWN` or separately decision-blocked:

- whether and under what legal basis ENVAL may receive or hold amounts economically attributable to customers;
- bank versus PSP versus controlled manual route;
- bank-account structure, segregation, safeguarding, licensing, or other regulatory obligations;
- beneficiary and IBAN verification standard;
- supported payout export and statement/import formats;
- tax, VAT, withholding, invoicing, and reporting treatment;
- fee trigger, fee base, partial-success, reversal, correction, and clawback wording in final terms;
- payout approval roles, thresholds, exception handling, and retention/privacy periods for payment data.

This contract claims none of those matters are legally resolved. It authorizes no code, schema, SQL, migration, database, Auth, Storage, Edge Function, frontend, CSS, provider integration, payment, remote action, production action, commit, push, merge, or deploy.
