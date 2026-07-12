# Backend Supabase Architecture

## Location

Supabase backend assets remain in `/supabase`.

This includes:

- Edge Functions
- shared function helpers
- migrations
- local Supabase configuration

## Current Role

Supabase is the shared backend for both the current static production site and the active `/app` frontend.

The target product is now a customer-facing commercial ERE inboekservice. The backend must therefore be treated as the audit-worthy operational system behind customer binding, eligibility, document intake, consent, customer dossier management, and ENVAL's inboeking service execution.

## Rebuild Boundary

The Vite scaffold does not change Supabase functions, migrations, storage policies, or database behavior.

Backend work must continue through explicit tasks with contract review, migration review, and validation checks.

## API Direction

The new frontend should consume Supabase Edge Functions through typed, documented API boundaries rather than duplicating ad hoc legacy browser logic.

## Target Backend Capabilities

Current proven foundations include app schema foundations, signup submit write v3, app customer auth helper, document file/version schema, upload URL, upload confirm, app audit, and app idempotency.

Future backend/API review should explicitly cover:

- customer records and contact identity
- direct signups
- `fee_model_version`
- `success_fee_percentage`
- `accepted_terms_version`
- `accepted_privacy_version`
- eligibility answers and eligibility decision history
- document metadata, upload lifecycle, and evidence versions
- consent records and legal-copy version references
- customer status lifecycle
- status transitions for eligibility, missing information, evidence review, inboeking execution, success, rejection, pause, and requested follow-up
- payout/value realization event
- fee calculation event
- audit events for fee-relevant changes
- audit events for successful and rejected actions
- export artifacts
- retention, privacy, and deletion/tombstone behavior
- document/evidence status that customers can understand without support contact
- support-reducing customer messaging and status visibility
- NL/EN language awareness where legal or product copy affects consent or claims
- commercial source-of-truth alignment with `docs/app/legal/fee-model-and-service-terms.md`
- signup/intake source-of-truth alignment with `docs/app/architecture/signup-intake.md`
- how later document upload frontend wiring should consume the proven upload-url and upload-confirm endpoints
- how customer-facing Auth/bootstrap/login should bind submitted dossiers to dashboard sessions
- how charger-linked documents preserve stable charger identity across manual and import intake paths

No Supabase functions, migrations, storage policies, or database behavior are changed by this document update.
