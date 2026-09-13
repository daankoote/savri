# App Workflow Email Foundation

Status: CURRENT / LOCAL PROOF for the App-owned foundation. No business workflow
currently enqueues an e-mail. Hosted provider, scheduler, secrets, deployment
and production delivery remain disabled/unproven.

## Boundary

Workflow e-mail is separate from Supabase Auth mail, signing/correction OTP
delivery, and the frozen legacy `outbound_emails` plus `mail-worker` runtime.
It is not a generic event bus or browser mail API. A future authoritative domain
RPC may call the owner-only enqueue helper inside its business transaction.
Edge code, `service_role`, `anon` and `authenticated` cannot call that helper.

## Persistent contract

- `app_workflow_email_intents` is immutable. It freezes the event, template,
  business-event reference, recipient snapshot, validated variables, subject,
  plain-text body, payload hash, provider idempotency key and dedupe key.
- `app_workflow_email_deliveries` owns mutable operational state, attempt count,
  next-attempt time, one lease and minimized provider classification.
- `app_workflow_email_delivery_attempts` is the immutable attempt ledger. It
  stores no body, recipient address or raw provider response.

All three tables use forced RLS, deny-all browser policies and revoked direct
table privileges. The foundation writes no general `app_audit_events`.

## Closed V1 catalog

The only foundation event/template pair is
`information_request_created_customer` /
`information-request-created-customer-nl-v1`. Its variables are exactly
`organization_name`, `application_label` and `action_url`.

The fixed Dutch subject and body are rendered inside the owner-only database
helper and frozen before claim. Callers cannot provide subject, body, HTML or
extra variables. The action URL must be an HTTPS dossier-detail URL or the
equivalent strict localhost URL; query, fragment and arbitrary return targets
are rejected. The actual question text is not an allowed variable.

This template is proof-only until a later information-request mail batch adds
authoritative recipient and event wiring. Evolution requires a new template
key/version; historical frozen messages never change.

## Delivery contract

`workflow-email-worker` is an internal App worker:

- only `service_role` can execute claim and completion RPCs;
- each claim leases at most one delivery for five minutes;
- expired leases become an ambiguous attempt with bounded back-off;
- retries use the same frozen content and provider idempotency key;
- at most five attempts are permitted;
- delivery states are closed to `queued`, `processing`, `provider_accepted`,
  `retryable_failure`, `permanent_failure`, `ambiguous_failure` and `cancelled`;
- cancellation is owner-only for a later authoritative domain RPC, is
  idempotent when already cancelled, and is rejected during `processing` or
  after `provider_accepted`;
- only safe error classes and a bounded provider reference are persisted.

The worker handles at most five claims per invocation. The local adapter uses
the existing Supabase Mailpit SMTP boundary and is selected only for a strict
local Supabase URL. No hosted adapter or fallback exists, so a hosted runtime
without a future explicit provider fails closed before claiming mail.

## Deferred activation

Later batches must separately establish customer and workforce recipient
resolution, transactionally coupled domain enqueue, approved sender/reply-to/
domain and canonical tenant portal origin, hosted provider secrets, scheduling,
retention and operational monitoring. Rejection and result mail remain blocked
on formal lifecycle authority.
