# Settlement And Payouts Contract

Status: TARGET — FINANCE/SETTLEMENT CONTRACT

Operating-model status:
`TARGET — PREFERRED OPERATING MODEL, REGULATORY CLASSIFICATION UNKNOWN`

This document defines the provider-independent ENVAL TARGET contract for settlement and payouts. It is product architecture and an ENVAL INTERNAL CONTROL design, not implementation proof, legal advice, a statutory or NEa requirement, or authorization to execute settlement or payments.

## Responsibility And Source Ownership

This contract has one responsibility: preserve the boundary from bruto
verkoopopbrengst through directe externe transactiekosten, netto gerealiseerde
verkoopopbrengst, ENVAL-succesfee, klantaandeel, settlement, payout instruction,
payment result, reconciliation and later settlementrevision.

It reuses, but does not replace:

- `docs/app/legal/fee-model-and-service-terms.md` for the approved commercial F-01 through F-15 formula, closed cost categories and claim boundaries;
- `docs/app/contracts/customer-party-representation-case.md` for legal-party, account, Auth, representation, case, and period ownership;
- `docs/app/06_NEA_REQUIREMENTS.md` and `docs/app/08_NEA_TRACEABILITY_MATRIX.md` for `NEA-FIN`, `NEA-AUD`, `NEA-RET`, `NEA-SEC`, and `NEA-COR` traceability;
- `docs/app/07_NEA_TARGET_ARCHITECTURE.md` for finance, audit, correction, projection, port, and adapter boundaries;
- `docs/app/09_NEA_MVP_PLAN.md` and `docs/app/operations/nea-implementation-roadmap.md` for sequencing and implementation gates.

No new official NEa or legal obligation is created here. The 90/10 split and
closed transaction-cost model are
`APPROVED COMMERCIAL DIRECTION — LEGAL, TAX AND PAYMENT-REGULATORY VALIDATION REQUIRED`.
They are not CURRENT legal text. Contract wording, tax/invoicing treatment,
legal money-flow qualification, bank-account structure, safeguarding,
licensing, withholding and PSD2/Wft obligations remain `UNKNOWN`.

## Commercial Inputs — Approved Direction, Not Legal Approval

The settlement core imports, and does not redefine, the exact commercial
formula from `docs/app/legal/fee-model-and-service-terms.md`:

- bruto verkoopopbrengst = werkelijk door de koper betaalde verkoopwaarde voor
  de aan de klant toegerekende ERE's;
- directe externe transactiekosten = uitsluitend aantoonbare derdenkosten die
  rechtstreeks nodig waren voor de betreffende verkoop;
- netto gerealiseerde verkoopopbrengst = bruto verkoopopbrengst minus directe
  externe transactiekosten;
- ENVAL-succesfee = 10% van de netto gerealiseerde verkoopopbrengst, inclusief
  toepasselijke btw;
- klantaandeel = 90% van de netto gerealiseerde verkoopopbrengst.

Only broker commission, trading-platform/marketplace costs, clearing or
settlement costs, sale-specific bank costs and other pre-described evidenced
external sale costs can qualify as directe externe transactiekosten. They must
be charged by a third party, linked to the sale, itemized and free of ENVAL
markup or hidden margin.

Personnel, software, administration, support, normal dossier handling, normal
compliance/verification work, general bank costs, overhead, internal sales
effort and ENVAL risk margin are not additionally deductible. They are covered
by the 10% ENVAL-succesfee.

## Expected Business Flow — TARGET

The current expected flow is:

1. ENVAL books qualifying customer kWh under a separately controlled booking and REV process.
2. ENVAL receives EREs resulting from the accepted external process.
3. ENVAL sells EREs to an external buyer under a separately approved sale process.
4. Preferred operating hypothesis for pilot: ENVAL receives the realized sale
   proceeds on its own ENVAL bank account, performs reconciliation, retains the
   10% all-in fee and pays the remaining 90% customer entitlement.
5. The bruto verkoopopbrengst is allocated to the underlying legal parties
   using versioned source, quantity, period, case, EAN, booking and sale
   references.
6. Directe externe transactiekosten are validated against the closed category,
   third-party invoice, sale link and no-markup rules.
7. Settlement calculates the netto gerealiseerde verkoopopbrengst, 10% all-in
   ENVAL-succesfee and 90% klantaandeel.
8. No fee arises at intake, dossier acceptance, ERE award alone or sale without
   definitive receipt. Fee calculation becomes actionable only after receipt
   and reconciliation.
9. The ENVAL-succesfee is settled before payout. The klantaandeel is due for
   payout within fourteen calendar days after receipt and reconciliation,
   except for an explicitly documented block.
10. Payment execution is reconciled independently against the instruction,
    settlement and external result.

PSP/split-payment is a possible fallback or risk-reducing route, not the
decided standard architecture. The own-account hypothesis is not proven legally,
fiscally, bankingly or payment-regulatorily compliant. Production requires
financial-legal, tax and banking advice on ownership/entitlement, sale and
representation roles, payment services, account structure and safeguarding.

No step guarantees ERE award, sale, proceeds, entitlement, payout, timing, tax treatment, or acceptance by any external party.

## Strictly Separate Concepts

| concept | target meaning | must not imply |
|---|---|---|
| ERE sale | Commercial disposal of a defined ERE quantity to an external buyer. | Receipt of cash, customer allocation, or payout. |
| bruto verkoopopbrengst | Werkelijk door de koper betaalde verkoopwaarde voor de aan de klant toegerekende ERE's, linked to sale, currency, amount, date and source reference. | Netto gerealiseerde verkoopopbrengst, reconciled funds or payout. |
| allocation | Versioned attribution of bruto verkoopopbrengst to eligible party/case/EAN/period/volume inputs. | A payment or an overwrite of booking truth. |
| directe externe transactiekosten | Closed, evidenced third-party sale costs directly necessary for one sale. | ENVAL internal costs, markup, hidden margin or an open-ended deduction. |
| netto gerealiseerde verkoopopbrengst | Bruto verkoopopbrengst minus validated directe externe transactiekosten. | Payment execution or legal compliance of the money flow. |
| ENVAL-succesfee | Versioned 10% calculation over netto gerealiseerde verkoopopbrengst, inclusive of applicable VAT. | A statutory percentage, approved legal clause or validated tax invoice. |
| klantaandeel | Versioned 90% of netto gerealiseerde verkoopopbrengst before explicit append-only settlement revisions. | Payable approval, payment execution or proof of beneficiary authority. |
| settlementperiode | The defined accounting/service period, normally a settlement month with explicit calendar-year context. | Booking period, mandate period, or bank value date. |
| settlement batch | Reconstructable grouping of allocations, formula inputs, ENVAL-succesfees, klantaandelen, corrections and approvals for one controlled run. | Payout submission or payment. |
| settlementrevision | Append-only successor or compensating settlement record for a correction, reversal or bounded clawback. | Destructive change, silent netting or deletion of the original settlement. |
| payout instruction | Idempotent, approved instruction for a fixed beneficiary, destination version, currency, and amount. | Export, submission, acceptance, payment, or reconciliation. |
| payment execution | Bank, PSP, or controlled manual execution result linked to one instruction and external reference. | Mutation of klantaandeel, ERE, kWh, party, case, or payout destination history. |
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

The customer-safe statement is scoped to one legal party. Every settlement and
settlementrevision shows at least:

- settlementperiode;
- verkochte hoeveelheid ERE's;
- gerealiseerde verkoopprijs;
- bruto verkoopopbrengst;
- iedere directe externe transactiekost;
- netto gerealiseerde verkoopopbrengst;
- 10%-grondslag;
- ENVAL-succesfee inclusief toepasselijke btw;
- btw-specificatie;
- eventuele correctie of reversal;
- 90%-klantaandeel;
- uitbetalingsdatum;
- settlementrevision.

It may additionally show customer-safe case/dossier, EAN, calendar-year,
allocation, payment-status, blocked-reason and reconciliation references where
approved.

It never exposes full account details, raw bank/PSP payloads, internal audit logs, reviewer identity, secret/provider configuration, or unrestricted finance evidence.

### ENVAL finance overview

The restricted ENVAL overview supports the same dimensions plus:

- total bruto verkoopopbrengst;
- total directe externe transactiekosten;
- total netto gerealiseerde verkoopopbrengst;
- total ENVAL-succesfee;
- total klantaandeel;
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
- A bank or PSP result never mutates kWh, ERE, party, case, booking, sale or klantaandeel core truth.
- Corrections reference the original records and create new adjustment, reversal, or clawback records as applicable.
- Recalculation creates a new version or compensating entry; it does not rewrite the original formula result.
- Every final NEa, verifier, quantity or sale correction recalculates the netto
  gerealiseerde verkoopopbrengst and moves the ENVAL-succesfee proportionally.
- A result reversal creates a proportional fee reversal.
- A clawback is capped at evidenced net overpayment and requires a separately
  validated legal basis. Fraud or deliberately false information stays a
  separate legal case.
- No silent or unbounded negative balance exists. Every correction, reversal or
  clawback has its own settlementrevision.
- Partial success and partial payment remain explicit amounts and statuses, never inferred completion.
- Failures, rejects, returns, duplicate callbacks/imports, and reconciliation differences are idempotent and auditable.

## Provider-Independent Architecture

The target module boundaries are:

| module or port | single responsibility |
|---|---|
| settlement core | Validate allocation, formula inputs, ENVAL-succesfee, klantaandeel, settlement, settlementrevision, reversal and bounded-clawback invariants without provider logic. |
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

The preferred controlled pilot hypothesis uses ENVAL's own bank account for
receipt, reconciliation, fee retention and customer payout. If external advice
does not validate that route, PSP/split-payment may be selected as a fallback
or risk-reducing route through a separate decision.

The first controlled pilot may use:

- an append-only settlement ledger;
- monthly customer statements and a restricted ENVAL finance overview;
- manual payout execution under four-eyes control;
- manual reconciliation with immutable source references and explicit differences.

PSP/split-payment is not the standard architecture and bank/PSP automation is
not a pilot prerequisite. Later bank-export, PSP and statement/import adapters
require their own bounded design, legal/privacy/security decisions,
implementation approval, provider contract, tests and proof.

The finance implementation remains late in the roadmap and depends on proven party/case ownership, EAN and kWh truth, booking and ERE calculation, recorded ERE sale and proceeds, finance approvals, and the unresolved legal/fiscal/banking decisions.

## UNKNOWN Decisions And Explicit Non-Claims

The following remain `UNKNOWN` or separately decision-blocked:

- whether and under what legal basis ENVAL may receive, hold, retain a fee from,
  or pay amounts economically attributable to customers under the preferred
  own-account model;
- whether financial-legal, tax and banking advice validates the preferred
  own-account model or requires PSP/split-payment fallback;
- bank-account structure, segregation, safeguarding, licensing, or other regulatory obligations;
- beneficiary and IBAN verification standard;
- supported payout export and statement/import formats;
- tax, VAT, withholding, invoicing, and reporting treatment;
- legal enforceability and final wording of the approved commercial
  receipt/reconciliation moment, formula, correction, reversal, clawback and
  fourteen-day payout direction;
- payout approval roles, thresholds, exception handling, and retention/privacy periods for payment data.

This contract claims none of those matters are legally resolved. It authorizes no code, schema, SQL, migration, database, Auth, Storage, Edge Function, frontend, CSS, provider integration, payment, remote action, production action, commit, push, merge, or deploy.
