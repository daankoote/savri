# 02_AUDIT_MATRIX.md (spec, current state)

# ENVAL — Audit Matrix (SPEC)

Statusdatum: 2026-02-09  
Doel: canonical lijst van audit events + waar/wanneer ze ontstaan.  
Regel: als een endpoint behavior wijzigt → update matrix + log change in changelog.

## 0) Meta standaard (MLS)
Elke audit event_data bevat minimaal:
- request_id
- idempotency_key (indien relevant)
- actor_ref
- ip
- ua
- environment
- stage/status/message/reason (bij rejects/fails)

## 1) System events
- dossier_created — success — api-lead-submit (ev_direct / installer_to_customer)
- email_verified_by_link — success (assumption) — api-dossier-get
- dossier_review_rejected_incomplete — reject — api-dossier-evaluate
- dossier_ready_for_review — success — api-dossier-evaluate
- dossier_locked_for_review — success — api-dossier-evaluate (en/of submit-review legacy)
- dossier_export_generated — success — api-dossier-export (locked only)
- dossier_export_rejected — reject/fail — api-dossier-export

## 2) Customer — Step 1 Access
Success
- access_updated — api-dossier-access-save, api-dossier-access-update

Reject/Fail
- access_save_rejected — api-dossier-access-save — stages: auth|validate|db_read|db_write|dossier_locked|business_rule
- access_update_rejected — api-dossier-access-update — stages idem

## 3) Customer — Step 2 Address
Preview (auditwaardig)
- address_verify_ok — success — api-dossier-address-verify
- address_verify_not_found — reject — api-dossier-address-verify
- address_verify_rejected — reject — api-dossier-address-verify

System
- address_verify_failed — fail — api-dossier-address-verify (PDOK failure)

Write
- address_saved_verified — success — api-dossier-address-save
- address_save_rejected — reject/fail — api-dossier-address-save — stages: validate|auth|dossier_locked|db_read|external_lookup|db_write

NB: api-dossier-address-preview = bewust géén audit events.

## 4) Customer — Step 3 Chargers
Success
- charger_added — api-dossier-charger-save
- charger_updated — api-dossier-charger-save
- charger_deleted — api-dossier-charger-delete

Reject/Fail
- charger_save_rejected — api-dossier-charger-save — (401/409/400)
- charger_save_failed — api-dossier-charger-save — (500)
- charger_delete_rejected — api-dossier-charger-delete — (400/401/404/409)
- charger_delete_failed — api-dossier-charger-delete — (500)
- charger_delete_storage_failed — partial fail-open — api-dossier-charger-delete

## 5) Customer — Step 4 Documents
Issue
- document_upload_url_issued — success — api-dossier-upload-url
- document_upload_url_rejected — reject/fail — api-dossier-upload-url

Confirm
- document_upload_confirmed — success — api-dossier-upload-confirm
- document_upload_confirm_rejected — reject/fail — api-dossier-upload-confirm

Delete
- document_deleted — success — api-dossier-doc-delete (draft/issued)
- document_delete_rejected — reject/fail — api-dossier-doc-delete (incl. 200 not_found as idempotent attempt)
- document_delete_storage_failed — partial fail-open — api-dossier-doc-delete

Evidence access (download)
- document_download_url_issued — success — api-dossier-doc-download-url
- document_download_url_rejected — reject/fail — api-dossier-doc-download-url
  stages: validate_input | dossier_lookup | auth | export_gate | doc_lookup | integrity_gate | signed_url

## 6) Customer — Step 5 Consents
- consents_saved — success — api-dossier-consents-save
- consents_save_rejected — reject/fail — api-dossier-consents-save
  stages: validate|auth|dossier_locked|db_read|db_write

## 7) Customer — Step 6 Review
- dossier_ready_for_review — success — api-dossier-evaluate
- dossier_locked_for_review — success — api-dossier-evaluate
- dossier_review_rejected_incomplete — reject — api-dossier-evaluate
- dossier_evaluate_rejected — reject — api-dossier-evaluate
- dossier_evaluate_failed — fail — api-dossier-evaluate

## 8) Customer — Read/Auth
- dossier_get_rejected — reject — api-dossier-get (401)

## 9) System — Mail (dossier-scoped on-chain vanaf 2026-02-09)
Regel: mail audit events worden alleen gelogd wanneer `outbound_emails.dossier_id != null`.

Queue
- mail_queued — success — api-lead-submit (dossier flows) en eventuele andere dossier queue-writers

Delivery (mail-worker)
- mail_sent — success — mail-worker
- mail_requeued — success — mail-worker (retry gepland; next_attempt_at gezet)
- mail_failed — fail — mail-worker (max attempts bereikt)

NB: mails zonder dossier_id blijven off-chain (geen dossier_audit_event).


## 10) System — Mail (dossier-scoped on-chain vanaf 2026-02-09)
Regel: mail audit events alleen wanneer outbound_emails.dossier_id != null.

- mail_queued — success — api-lead-submit (dossier flows) en eventuele andere dossier queue-writers
- mail_sent — success — mail-worker
- mail_requeued — success — mail-worker (retry gepland, next_attempt_at gezet)
- mail_failed — fail — mail-worker (max attempts / non-retryable)

NB: mails zonder dossier_id blijven off-chain (geen dossier_audit_event).
