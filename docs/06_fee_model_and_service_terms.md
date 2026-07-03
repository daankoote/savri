# Fee Model And Service Terms

Status: working commercial source of truth for the ENVAL rebuild.

This document defines the intended commercial model for the customer-facing ENVAL ERE inboekservice. It is not final legal text. Exact terms must be reviewed before production.

## Commercial Model

- Customer-facing success fee: 10%.
- ENVAL's strategic goal is a lower fee through a low-support digital process and strong audit readiness.
- Do not state competitor percentages as public fact unless sourced and verified later.
- The lower fee depends on clear customer instructions, explicit document requirements, visible status, minimal support overhead, and audit-ready evidence handling.

## Working Definitions

- Success: actual realized value/proceeds for the customer from ENVAL's ERE inboeking service, subject to final terms.
- Fee base: working assumption is actual realized gross value/proceeds, unless final terms define otherwise.
- Fee moment: working assumption is that the fee becomes due when value/proceeds are realized, paid, credited, or otherwise made available to the customer, subject to final terms.
- Partial success: fee applies only to the realized part.
- Reversal/audit correction/clawback: must be defined in terms before production.
- No success/no realized value: no success fee under the intended model, unless final terms add exceptions.

## Claim Boundaries

- No guarantee of ERE award or acceptance.
- No guarantee of payout, revenue, timing, certification, or acceptance of every uploaded document.
- ENVAL may pause, reject, or request more information when evidence is insufficient.
- Legal and commercial responsibility must be clarified before final terms go live.

## Backend Implications

Future backend/API work should support:

- `fee_model_version`
- `success_fee_percentage = 10`
- `accepted_terms_version`
- `accepted_privacy_version`
- `success_event`
- `realized_value_amount`
- `fee_calculation_event`
- partial success handling
- reversal/clawback event
- audit events for all fee-relevant state changes

No Supabase code is changed by this document.
