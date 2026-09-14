# App Workflow Email Foundation

Status: CURRENT / LOCAL PROOF for the App-owned foundation and the bounded
information-request integration. Hosted provider, scheduler, secrets,
deployment and production delivery remain disabled/unproven.

## Boundary

Workflow e-mail is separate from Supabase Auth mail, signing/correction OTP
delivery, and the frozen legacy `outbound_emails` plus `mail-worker` runtime.
It is not a generic event bus or browser mail API. The information-request
domain RPC calls the owner-only notification/dispatch helper inside its business
transaction. That helper conditionally enqueues, cancels or records no delivery.
Edge code, `service_role`, `anon` and `authenticated` cannot call that helper.

## Persistent contract

- `app_workflow_email_intents` is immutable. It freezes the event, template,
  business-event reference, recipient snapshot, validated variables, subject,
  plain-text body, payload hash, provider idempotency key and dedupe key.
- `app_workflow_email_deliveries` owns mutable operational state, attempt count,
  next-attempt time, one lease and minimized provider classification.
- `app_workflow_email_delivery_attempts` is the immutable attempt ledger. It
  stores no body, recipient address or raw provider response.
- `app_workflow_email_dispatches` stores only the privacy-safe outcome of each
  domain notification decision, including no-recipient and no-context results.

All four tables use forced RLS, deny-all browser policies and revoked direct
table privileges. The foundation writes no general `app_audit_events`.

## Closed V1 catalog

The closed catalog contains exactly these information-request pairs:

- `information_request_created_customer` /
  `information-request-created-customer-nl-v1` for historical renderability and
  `information-request-created-customer-nl-v2` for new intents;
- `information_request_answered_workforce` /
  `information-request-answered-workforce-nl-v1`;
- `information_request_withdrawn_customer` /
  `information-request-withdrawn-customer-nl-v1`.

Create v1 retains exactly `organization_name`, `application_label` and
`action_url`. Create v2, answer v1 and withdraw v1 use exactly those variables
plus `case_reference`. The case reference and fixed dossier route come from the
same server-resolved `app_cases` row.

The fixed Dutch subject and body are rendered inside the owner-only database
helper and frozen before claim. Callers cannot provide subject, body, HTML or
extra variables. The action URL must be an HTTPS dossier-detail URL or the
equivalent strict localhost URL; query, fragment and arbitrary return targets
are rejected. For current templates the route reference must equal the frozen
`case_reference`. Question and answer text are not allowed variables.

The information-request database wrappers resolve recipients and invoke the
catalog transactionally after a successful create, answer or withdraw. Resolve
intentionally creates no mail. Evolution requires a new template key/version;
historical frozen messages never change.

## Information-request recipient contract

- Create resolves each distinct current confirmed R7 Auth actor for the exact
  case. It never falls back to intake, customer or browser-provided addresses.
- Answer resolves only the original workforce creator and only while that Auth
  actor remains active with the named capability and exact active case scope.
- Withdraw cancels certainly unsent originals. Accepted, ambiguous or in-flight
  originals produce one withdrawal intent only when the originally notified
  Auth actor still has exact R7 case authority.
- Missing presentation context or a safe recipient never rolls back the
  business transition; the minimized dispatch outcome records the omission.

Organization presentation uses the existing server-side presentation source.
The portal origin is separate server-only configuration and must also be in the
server allowlist. Browser payloads cannot choose either value. Customer and
workforce links target their fixed exact case routes without a continuation
parameter.

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

The worker handles at most five claims per invocation. The owned local runtime
polls it without overlapping claims. The local adapter uses
the existing Supabase Mailpit SMTP boundary and is selected only for a strict
local Supabase URL. No hosted adapter or fallback exists, so a hosted runtime
without a future explicit provider fails closed before claiming mail.

## Deferred activation

Later batches must separately establish approved hosted sender/reply-to/domain,
hosted provider secrets, scheduling, retention and operational monitoring.
Correction, rejection and result mail are not activated here; rejection and
result mail remain blocked on formal lifecycle authority.
