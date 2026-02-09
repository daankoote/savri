access-save en access-update

Audit matrix update (increment: access endpoints)

Voeg dit toe/merge in je “Audit matrix v1” sectie in DOC1 (bij Customer):

Customer — Access (Stap 1)

access_updated — success

Actor: customer

Waar: api-dossier-access-save en api-dossier-access-update

Data: changes{...}, invalidated_ready_for_review, plus MLS meta via shared helper

access_save_rejected — reject

Actor: customer

Waar: api-dossier-access-save

Stages: auth, validate, db_read, db_write, dossier_locked, business_rule

access_update_rejected — reject

Actor: customer

Waar: api-dossier-access-update

Stages: idem

Belangrijke nuance voor audit consistency

Succes-event is bewust één eventnaam (access_updated) voor beide endpoints.
Dit maakt reporting makkelijker (“wat is er veranderd in stap 1?”), maar betekent ook dat je in analyses het endpoint moet herkennen via request meta (path in request logs / eventueel meta.endpoint als je dat later toevoegt).




api-dossier-address-preview  en. api-dossier-address-verify  


Audit matrix update (increment: address verify)

Voeg toe in DOC1 bij Audit matrix (Customer/System):

Customer — Address (Stap 2 precheck)

address_verify_ok — success (preview)

Actor: customer

Waar: api-dossier-address-verify

address_verify_not_found — reject (404)

Actor: customer

Waar: api-dossier-address-verify

Data: input {postcode, house_number, suffix}

address_verify_rejected — reject (401)

Actor: customer

Waar: api-dossier-address-verify

System — Address verify

address_verify_failed — reject (502 PDOK failure)

Actor: system

Waar: api-dossier-address-verify

NB: address-preview heeft bewust geen audit events.



api-dossier-charger-delete  en api-dossier-charger-save 

Audit matrix delta (Stap 3 toevoegen/aanvullen)

Voeg dit toe aan je Audit matrix (DOC1 sectie 7):

Customer — Chargers (Stap 3)

charger_added — success (create)

charger_updated — success (update)

charger_deleted — success (delete; incl. delete stats)

charger_save_rejected — reject (401/409/400)

charger_save_failed — fail (500)

charger_delete_rejected — reject (400/401/404/409)

charger_delete_failed — fail (500)

charger_delete_storage_failed — partial fail-open (storage deletion failed after DB delete)


doc-delete + upload-url

Audit matrix delta (Stap 4 uitbreiden)

Voeg toe/aanvullen:

Customer — Documenten (Stap 4)

document_upload_url_issued — success

document_upload_url_rejected — reject/fail (400/401/409/500)

document_deleted — success (draft/issued verwijderd)

document_delete_rejected — reject/fail (incl. 200 not_found als “idempotent attempt”)

document_delete_storage_failed — fail-open storage cleanup

(let op: upload-confirm events staan in api-dossier-upload-confirm; die voeg je daar weer bij)



api-dossier-upload-confirm (server-side verify) + Read model (api-dossier-get) + Review checks/lock (api-dossier-evaluate)

Audit matrix delta (nu echt compleet voor deze 3)

Voeg/patch onder System/Customer:

System

email_verified_by_link (assumption expliciet)

Customer — Documenten

document_upload_url_issued

document_upload_url_rejected

document_upload_confirmed ✅ (nieuw expliciet)

document_upload_confirm_rejected

document_deleted

document_delete_rejected

document_delete_storage_failed

Customer — Review

dossier_review_rejected_incomplete

dossier_ready_for_review

dossier_locked_for_review

dossier_evaluate_rejected

dossier_evaluate_failed

Customer — Read/Auth

dossier_get_rejected


export + submit-review + consents-save

Audit Matrix — delta (wat je NU moet toevoegen)

Je eigen matrix-tekst is grotendeels correct. Dit komt erbij (of wordt aangescherpt):

Customer — Export

dossier_export_generated — success
Waar: api-dossier-dossier-export
Data: counts (chargers, confirmed_docs, checks)

dossier_export_rejected — reject/fail
Waar: api-dossier-dossier-export
Stages: dossier_lookup, auth, export_gate, chargers_read, documents_read, checks_read, consents_read, export_integrity

Customer/System — Submit review

dossier_submit_review_requested — attempt marker (customer)
Waar: api-dossier-submit-review
NB: alleen loggen als scope (dossier_id/token) aanwezig is (doe je).

dossier_submit_review_rejected — reject (401)
Waar: api-dossier-submit-review

dossier_submit_review_rejected_incomplete — reject (400)
Actor: system (jij logt actor_type:"system")
Waar: api-dossier-submit-review

dossier_locked_for_review — success
Actor: system
Waar: api-dossier-submit-review (event_data.via aanwezig)

Customer — Consents

consents_saved — success (incl already_saved + invalidated_ready_for_review)
Waar: api-dossier-consents-save

consents_save_rejected — reject/fail
Waar: api-dossier-consents-save
Stages: validate, auth, dossier_locked, db_read, db_write


lead-submit + doc-download-url + address-save

Audit matrix delta — Lead + Download URL + Address save

System — Lead/Dossier creation
- dossier_created — success
  Actor: system
  Waar: api-lead-submit (flows: installer_to_customer, ev_direct)
  Data: lead_id, source, installer_ref (optional)

Customer — Address (Stap 2)
- address_saved_verified — success
  Actor: customer
  Waar: api-dossier-address-save
  Data: input{postcode,house_number,suffix}, resolved{street,city,bag_id,display}, source, invalidated_ready_for_review + req meta

- address_save_rejected — reject/fail (400/401/409/502/500)
  Actor: customer
  Waar: api-dossier-address-save
  Stages: validate, auth, dossier_locked, db_read, external_lookup, db_write

Customer — Documenten (Evidence access)
- document_download_url_issued — success
  Actor: customer
  Waar: api-dossier-doc-download-url
  Data: document_id, doc_type, expires_in_seconds

(NB: api-dossier-doc-download-url mist nog reject audit events; zie DOC2 TODO.)


mail-worker + api-dossier-doc-download-url

4) Matrix (consolidated delta)

Plak in je “Audit matrix v1” sectie:

Customer — Documenten (Stap 4)

document_download_url_issued — success — api-dossier-doc-download-url

document_download_url_rejected — reject/fail — api-dossier-doc-download-url
Stages: validate_input | dossier_lookup | auth | export_gate | doc_lookup | integrity_gate | signed_url

System — Mail

mail_sent / mail_failed / mail_requeued — P1 blocked (geen dossier_id link in outbound_emails)