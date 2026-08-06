# Intake Verification Promotion Contract

Status: MIXED — 09B1 collecting intake/private quarantine is CURRENT PROVEN LOCALLY; finalization, email verification, evidence promotion, and dossier promotion remain TARGET / NOT IMPLEMENTED.

The bounded current 09B1 behavior is defined in `signup-quarantine-upload.md`. It creates only a collecting pre-auth intake and immutable private file revisions. Everything from finalization through verification and promotion remains target behavior and must not be inferred from transport confirmation.

## 1. Status And Scope

Scope:

- public `/aanmelden` intake
- client parser/precheck boundaries
- pre-auth quarantine upload target
- email verification
- server-side promotion into app customer/dossier state
- targeted correction/revision lifecycle

Out of scope for this promotion contract:

- production deployment
- exact retention duration

Current document-first signup uses the separate 09B1 quarantine transport and does not call `api-app-signup-submit`. The older write-v3 endpoint remains protected source but is outside the active 09B1 journey. Authenticated dashboard document upload/download/withdrawal remains separate.

## 2. Product Decision

There is exactly one normal full customer submission:

```text
Start dossier
```

The customer must not always submit the same complete dossier again in the dashboard.

Email verification:

- verifies identity and email control;
- triggers server-side intake promotion;
- is not a second manual confirmation of all submitted fields.

The initial `Start dossier` action must include clear confirmation copy explaining that submitted information becomes fixed after successful email verification and server processing.

## 3. Current Versus Target

CURRENT / LOCAL PROOF:

- public signup form and browser preview/parser journey;
- collecting intake plus `intake_manage` capability;
- private immutable quarantine revisions and server-side PDF byte/hash confirmation;
- Supabase Auth/bootstrap;
- authenticated customer dashboard;
- authenticated reusable document module;
- upload, download, and withdrawal lifecycle;
- server-derived `document_changes_allowed`.

TARGET / NOT IMPLEMENTED:

- `pending_verification` intake state;
- single-use verification promotion;
- quarantine-to-dossier evidence promotion;
- initial immutable intake/submission snapshot;
- section-level capabilities;
- targeted edit flows;
- `Correcties indienen`;
- review-driven email notification;
- parser reuse contract across public intake and authenticated correction cards;
- quarantine expiry/cleanup automation.

## 4. Public Intake

Customer supplies:

- email;
- name;
- NAW/location;
- chargers;
- MID presence/value;
- documents;
- required consents.

The public intake may guide, prefill, parse, and warn before `Start dossier`, but backend promotion remains the authority.

## 5. Client Parser Boundary

Client parser/precheck may perform:

- field validation;
- regex checks;
- PDF/document parsing;
- document-type indication;
- readability indication;
- MID extraction;
- serial-number extraction;
- address extraction;
- consistency warnings.

Parser/precheck may produce:

- blocking client error;
- warning;
- extracted or prefilled values.

Parser/precheck may not:

- approve evidence authoritatively;
- create dossier lifecycle status;
- lock customer data;
- replace server validation;
- create final eligibility, evidence, fee, result, or acceptance truth.

## 6. Start Dossier

`Start dossier` is the explicit customer finalization action for the public intake.

Target behavior:

1. Create a pre-dossier intake in `pending_verification` state.
2. Upload documents to private quarantine through a dedicated pre-auth intake capability.
3. Confirm that expected quarantine files exist.
4. Close public mutation capability.
5. Remove public read capability.
6. Store the explicit customer confirmation moment and accepted legal versions.
7. Send one-time email verification link.
8. Return only a safe receipt/status to the browser.

Hard boundaries:

- Do not reuse authenticated `api-app-document-*` endpoints for pre-auth uploads.
- Do not create an app customer dossier before verification.
- Do not treat frontend hiding as authorization.
- Do not expose quarantine storage paths.
- Do not make quarantine storage public.
- Do not use email address alone as an upload/read capability.

## 7. Pre-Auth Capability And Quarantine

Target intake capability requirements:

- opaque;
- narrow intake scope;
- short-lived;
- upload-only where possible;
- invalidated after intake finalization;
- rate-limited;
- file-size and file-type limited;
- no customer-dossier access.

Private quarantine rules:

- storage remains private;
- server owns bucket/path decisions;
- public browser cannot read back quarantine files after finalization;
- quarantine paths are never exposed as durable customer state;
- upload metadata remains untrusted until server promotion checks pass.

OPEN: exact capability expiry, unverified intake expiry, and quarantine cleanup period.

## 8. Email Verification

Clicking the verification link triggers server-side promotion.

The link must be:

- one-time use;
- scoped to the intake;
- time-limited;
- anti-enumeration safe;
- invalid after promotion, expiry, or explicit restart where applicable.

Email verification proves control of the verified email identity. It does not mean documents are approved.

## 9. Atomic Promotion

Promotion must:

1. validate the one-time link;
2. lock the intake;
3. confirm intake has not expired or already been promoted;
4. revalidate required scalar fields;
5. revalidate file metadata, MIME, size, and hashes;
6. validate current consent versions;
7. create/link authenticated customer identity;
8. create the app dossier;
9. copy/promote evidence without exposing storage internals;
10. invalidate remaining pre-auth capabilities;
11. write audit;
12. finalize idempotency.

Promotion must be deterministic and replay-safe.

## 10. Complete-Intake Outcome

When all mandatory technical checks pass:

- create immutable initial intake/submission snapshot;
- set dossier to `submitted` or `under_review`;
- lock all submitted sections;
- documents may remain orange/in review;
- open customer dashboard;
- do not show a second generic `Dossier indienen` button.

Document upload confirmation proves file integrity. Substantive document acceptance remains a later review state.

## 11. Customer-Action Outcome

When server-side processing identifies a correctable issue:

- create/link customer;
- create dossier in `needs_customer_action`;
- preserve the original intake snapshot;
- lock all valid unaffected sections;
- unlock only affected sections or records;
- show exact safe correction reasons;
- expose only a `Correcties indienen` action.

The customer must not reconfirm all unaffected information.

## 12. Later Review Correction

When ENVAL or later automated review rejects evidence:

- notify customer by email;
- transition the relevant section to action-needed status;
- unlock only the affected record or slot;
- preserve all previous evidence and snapshots;
- show `Correcties indienen`;
- audit unlock, reason, replacement, and correction submission.

## 13. Section Status Versus Mutation Capability

Readiness/status and mutation capability are independent concepts.

Examples:

- valid location: green + fixed;
- uploaded document under review: orange + fixed;
- rejected document: orange/red + targeted editable;
- current consent: green + fixed;
- future kWh: neutral + not applicable.

UI does not need a visible padlock icon.

Preferred presentation:

- editable: active `Wijzigen` or `Aanpassen` action;
- fixed: muted `Vastgelegd` label or non-interactive state;
- reopened: `Actie nodig` plus active `Aanpassen` action.

Accessibility requirements:

- do not communicate lock state only through disabled visual styling;
- include readable status text;
- frontend must use server-derived capabilities;
- frontend must not infer editability from stoplight text.

## 14. Button Contract

Normal customer flow:

- public intake: `Start dossier`;
- dashboard after successful promotion: no generic full-submit button.

Dashboard with correction requirement:

- `Correcties indienen`.

Future kWh action:

- separate kWh-specific action.

Do not define a permanent generic dashboard `Dossier indienen` button.

## 15. Audit Boundaries

Audit-required:

- intake finalization / `Start dossier`;
- legal acceptance;
- verification-link consumption;
- intake promotion;
- dossier creation;
- immutable snapshot creation;
- document evidence promotion;
- promotion reject/failure;
- targeted unlock;
- replacement evidence;
- correction submission;
- ENVAL lifecycle changes.

Not immutable compliance revisions by default:

- local client validation attempts;
- unsubmitted public form edits;
- ordinary editable correction-field changes before `Correcties indienen`.

## 16. Retention And Cleanup OPEN Decisions

TARGET with OPEN parameters:

- unverified intake expiry;
- quarantine cleanup;
- expired-link behavior;
- customer restart behavior;
- audit-minimum retained after cleanup.

Do not invent a retention duration until legal/product requirements are accepted.

## 17. Security And Abuse Controls

Target controls:

- rate limiting for intake, quarantine upload, and verification attempts;
- narrow opaque pre-auth capabilities;
- no email-only authorization;
- anti-enumeration responses;
- private quarantine storage;
- server-generated paths;
- server-side MIME, size, hash, and consent-version validation;
- idempotent promotion;
- no browser DB access;
- no legacy dossier-session dependency.

Frontend hiding is never an authorization boundary.

## 18. Implementation Order

1. Define intake/quarantine schema and expiry boundary.
2. Define pre-auth capability and anti-abuse contract.
3. Define atomic email-verification promotion RPC/endpoint.
4. Define initial intake/submission snapshot schema.
5. Define server-derived section capabilities.
6. Build public `Start dossier` quarantine flow.
7. Build verification-link promotion flow.
8. Build targeted charger/location correction forms using shared signup form modules.
9. Reuse parser/precheck for authenticated document corrections.
10. Build `Correcties indienen` revision flow.
11. Define review email notification contract.
12. Define kWh periodic lifecycle.
13. Define consent renewal/version-expiry lifecycle.

## 19. Proof Requirements

Before marking any target behavior CURRENT, prove:

- pre-auth upload capability cannot read customer/dossier data;
- quarantine storage is private;
- email verification link is one-time and replay-safe;
- promotion is atomic and idempotent;
- complete intake creates the expected customer/dossier/snapshot/evidence records;
- correctable failure creates only targeted editable sections;
- unaffected sections remain fixed;
- `Correcties indienen` submits only allowed corrections;
- parser/precheck output cannot approve evidence;
- frontend uses server-derived capabilities for editability;
- no generic dashboard `Dossier indienen` appears after successful promotion;
- expired unverified intakes clean up according to the accepted retention policy;
- no secrets, storage paths, raw hashes, or internal audit payloads are exposed to customers.
