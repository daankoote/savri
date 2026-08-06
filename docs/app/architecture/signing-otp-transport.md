# Signing OTP Transport

Status: TARGET — AUTHORIZED FOR 09B2 IMPLEMENTATION

This decision authorizes one new app-scoped OTP transport layer for the active
signature method `typed_name_otp_v1`. It does not implement a transport,
challenge, endpoint, database record, mail template, signature or finalization.

## Decision

- 09B2 may add a dedicated app-scoped signing OTP challenge and transport.
- The legacy `mail-worker`, `outbound_emails`, `api-dossier-*` functions and
  legacy dossier sessions are not used or extended.
- The transport is provider-independent behind `SigningOtpTransportPort`.
- The local adapter uses the existing local Supabase mail-testing environment
  when that environment is available and explicitly configured. The current
  local configuration exposes Supabase's mail-testing/Inbucket boundary; lack
  of a usable local SMTP path must fail closed and must not become console mail
  or a fake-success OTP.
- The production adapter is selected and configured server-side. No provider,
  credential, recipient or transport secret is part of signature core,
  mandate, snapshot, frontend state or customer output.
- Replacing an adapter must not change `SignatureMethodPort`,
  `typed_name_otp_v1`, the mandate template, the canonical signing snapshot,
  legal acceptances, dashboard projection or the finalization transaction.

## Bounded responsibilities

The signing method owns:

- method ID and version;
- required signer fields and intent;
- the requirement for an OTP challenge;
- validation of the completed evidence envelope.

The challenge service owns:

- cryptographically secure OTP generation;
- challenge ID and intake binding;
- method ID/version binding;
- verified-channel reference binding;
- salted or keyed OTP hash only;
- short expiry;
- attempts remaining;
- issue/resend/rate-limit policy;
- one-time consumption and replay rejection;
- request/idempotency/audit correlation;
- safe verification result.

The transport owns only delivery:

- accept one already authorized delivery request from the challenge service;
- send the code using the selected server-side adapter;
- return an opaque delivery reference or safe delivery failure;
- never decide whether an intake, signer, legal bundle or finalization is valid.

The finalization service owns:

- verification that the challenge is consumed for the same intake, method and
  verified channel;
- exact CURRENT legal versions and hashes;
- canonical snapshot and hash;
- immutable acceptances, mandate and signature evidence;
- authority-review linkage;
- atomic idempotency and customer lock.

## Port contract

The following is the approved logical boundary, not implementation code:

```text
SigningOtpTransportPort
  transportId: string
  deliver(request: SigningOtpDeliveryRequest): SigningOtpDeliveryResult

SigningOtpDeliveryRequest
  challengeReference: opaque server reference
  verifiedChannelReference: opaque server reference
  deliveryTarget: server-resolved address, memory-only
  secretCode: raw OTP, memory-only
  expiresAt: server timestamp
  templateVersion: fixed server-selected version
  requestReference: opaque server reference

SigningOtpDeliveryResult
  delivered: boolean
  transportId: string
  providerDeliveryReference: opaque and optional
  safeFailureCode: closed enumeration, optional
```

Port rules:

- `deliveryTarget` and `secretCode` may exist only for the duration of the
  server-side delivery call.
- Neither value may be returned, persisted, audited, placed in a URL or logged.
- The provider delivery reference may not contain an e-mail address or raw
  provider response.
- Customer output is anti-enumeration safe and never confirms whether a given
  address exists independently of the active intake.
- Transport success is not OTP verification and not signature success.

## Adapters

### Local Supabase mail adapter

Logical name: `LocalSupabaseSigningOtpTransportAdapter`.

- Enabled only in an explicitly recognized local environment.
- Uses the existing local Supabase mail-testing/SMTP boundary when reachable.
- Delivers a dedicated app signing template; it does not invoke Supabase Auth
  account confirmation and does not change Auth state.
- Does not invoke the legacy mail worker or write `outbound_emails`.
- Fails closed when the local delivery boundary is absent or misconfigured.
- May expose the message only inside the local mail-testing inbox; application
  logs and proof output remain free of recipient and OTP.

### Configurable production adapter

Logical name: `ConfiguredSigningOtpTransportAdapter`.

- Selected through server-only environment configuration such as a closed
  `SIGNING_OTP_TRANSPORT_DRIVER` value.
- Provider credentials and sender configuration remain server-only.
- Provider-specific request/response mapping stays inside the adapter.
- A production provider choice, data-processing review, sending-domain setup,
  retry policy and deployment proof require a separate explicit decision.
- Unsupported or missing configuration fails closed; there is no automatic
  fallback to legacy mail.

Adapter selection belongs in one server composition root. It must be impossible
for the browser to select a driver or provider parameters.

## Challenge and verification policy

09B2 implementation must define and prove these values centrally:

| Control | Authorized target |
| --- | --- |
| Raw OTP persistence | Forbidden. |
| Stored verifier | Salted/keyed hash only; exact construction documented and tested. |
| Entropy | Cryptographically secure server generation; no `Math.random`. |
| Expiry | Short, server-owned duration; exact duration requires a bounded security decision. |
| Attempts | Small fixed maximum; exact count requires a bounded security decision. |
| Consumption | Exactly once, atomically bound to successful verification. |
| Replay | Rejected for consumed, expired, replaced or wrong-intake challenges. |
| Resend | Creates or rotates under a deterministic policy; old active secrets become unusable. |
| Rate limit | Intake, verified-channel reference and privacy-safe request metadata; no raw e-mail key in audit output. |
| Idempotency | Same key and same normalized issue request replays safely; changed payload conflicts. |
| Logs | No OTP, e-mail address, capability, legal text, snapshot content or raw provider response. |
| URL | No OTP, e-mail address or capability in query/path fragments. |
| Browser writes | Forbidden; challenge persistence and verification are server-owned. |

The exact expiry, attempt and rate-limit values remain 09B2 security decisions.
They are not legal-bundle decisions and do not reopen authorization for legacy
mail infrastructure.

## Verified-channel boundary

`verifiedChannelReference` is an opaque server-side reference to the channel
that belongs to the active intake flow. It is not the e-mail address and does
not itself authorize dashboard or dossier access.

The channel resolver must:

- derive the delivery address server-side from the bounded intake/identity
  context;
- reject a browser-supplied replacement address during challenge issue or
  verification;
- bind issue, verification and finalization to the same intake, method and
  channel reference;
- expose only masked customer copy where needed;
- keep Supabase Auth account verification separate from signing OTP evidence.

The current `requireVerifiedSupabaseAuthUser` helper may be reused only when a
later authenticated flow genuinely has a verified Auth bearer session. It is
not a pre-auth signing-channel resolver and must not be stretched into one.

## Existing reusable modules

| Existing module | Reuse in 09B2 | Boundary |
| --- | --- | --- |
| `app/src/features/signup/signing/signatureMethod.ts` | Keep the stable method port unchanged. | No transport/provider imports. |
| `app/src/features/signup/signing/methods/typedNameOtpV1.ts` | Keep active method ID/version and challenge requirement. | No OTP generation or delivery. |
| `app/src/features/signup/signing/signingEvidence.ts` | Reuse the evidence-envelope boundary and extend only through an explicitly versioned contract if server proof requires it. | Browser does not create trusted evidence. |
| `supabase/functions/_shared/app_foundation.ts` | Reuse request IDs, privacy-safe hashed request metadata, stable JSON/SHA-256, CORS, safe responses and app idempotency patterns. | Do not log raw input through generic metadata. |
| `supabase/functions/_shared/app_customer_auth.ts` | Reuse verified Auth context only in an authenticated route. | Not pre-auth e-mail proof. |
| Current 09B1 intake/capability helpers and RPC patterns | Reuse opaque capability hashing, scoped intake authorization, service-role-only writes and fail-closed atomic patterns. | `intake_manage` is not identity or OTP proof. |
| `supabase/config.toml` local mail-testing boundary | Local delivery environment when explicitly available. | No production claim and no fake fallback. |
| Legacy `_shared/sessions.ts`, `mail-worker` and `api-dossier-*` | Logic may be inspected for cryptographic or operational lessons only. | No runtime import, table reuse or extension. |

## Logically necessary new 09B2 modules

Names may be reconciled to repository conventions during implementation, but
each responsibility must have one owner:

- `SigningOtpTransportPort` and delivery request/result types;
- one server-side transport composition root;
- local Supabase mail adapter;
- configurable production adapter boundary;
- signing OTP challenge policy and cryptographic generator/hasher;
- verified signing-channel resolver;
- challenge repository or service-role-only RPC boundary;
- issue/resend service with idempotency and abuse limits;
- verify/consume service with atomic attempts, expiry and replay handling;
- dedicated versioned signing OTP mail template;
- safe audit-event projector and closed customer error mapping;
- focused proof covering persistence, expiry, attempts, replay, replacement,
  concurrency, redaction and adapter substitution.

No second legal registry, signature method, mandate renderer, snapshot model,
finalization path or mail queue is authorized.

## Audit and privacy

Allowed audit data is limited to opaque challenge/intake/channel references,
method/version, transport ID, delivery outcome code, expiry class, attempts
remaining, consumed/replaced state, request/idempotency references and
privacy-safe hashed request metadata.

Forbidden audit/log/output data includes raw OTP, OTP hash, e-mail address,
capability, provider credential, raw provider response, legal content, document
content, typed signer name and canonical snapshot content. Required signing
evidence references the verified challenge without exposing its secret.

## Implementation gate

The OTP architecture is authorized for 09B2 implementation. Runtime work must
still wait until all four documents in
`docs/app/legal/signing-legal-bundle-approval.md` are explicitly approved,
frozen, versioned, effective and eligible for server-derived hashes. This
document grants no production provider, deployment, remote database or signing
approval.
