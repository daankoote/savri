begin;

revoke all privileges on table
  public.app_customer_information_requests,
  public.app_customer_information_responses
from public, anon, authenticated, service_role;

revoke all privileges on table
  public.app_case_lifecycle_events,
  public.app_case_location_relations,
  public.app_charger_declarations,
  public.app_chargers,
  public.app_customer_access_grants,
  public.app_evidence_declaration_contexts,
  public.app_evidence_files,
  public.app_evidence_versions,
  public.app_signup_authenticated_intake_provenance,
  public.app_signup_promotions,
  public.app_workforce_capability_assignments,
  public.app_workforce_identities,
  public.app_workforce_identity_states,
  public.app_workforce_operation_requests,
  public.app_workforce_operation_reviews,
  public.app_workforce_scope_assignments
from public, anon, authenticated, service_role;

grant select on table
  public.app_case_lifecycle_events,
  public.app_case_location_relations,
  public.app_charger_declarations,
  public.app_chargers,
  public.app_customer_access_grants,
  public.app_evidence_declaration_contexts,
  public.app_evidence_files,
  public.app_evidence_versions,
  public.app_signup_authenticated_intake_provenance,
  public.app_signup_promotions,
  public.app_workforce_capability_assignments,
  public.app_workforce_identities,
  public.app_workforce_identity_states,
  public.app_workforce_operation_requests,
  public.app_workforce_operation_reviews,
  public.app_workforce_scope_assignments
to service_role;

revoke all privileges on table
  public.app_case_party_roles,
  public.app_cases,
  public.app_connection_declaration_sources,
  public.app_customer_party_relationships,
  public.app_location_address_observations,
  public.app_location_versions,
  public.app_locations,
  public.app_parties,
  public.app_party_declaration_sources,
  public.app_party_organization_versions,
  public.app_party_person_versions,
  public.app_signup_legal_acceptances,
  public.app_signup_mandates,
  public.app_signup_signature_evidence,
  public.app_signup_signing_snapshots
from public, anon, authenticated, service_role;

grant select, insert on table
  public.app_case_party_roles,
  public.app_cases,
  public.app_connection_declaration_sources,
  public.app_customer_party_relationships,
  public.app_location_address_observations,
  public.app_location_versions,
  public.app_locations,
  public.app_parties,
  public.app_party_declaration_sources,
  public.app_party_organization_versions,
  public.app_party_person_versions,
  public.app_signup_legal_acceptances,
  public.app_signup_mandates,
  public.app_signup_signature_evidence,
  public.app_signup_signing_snapshots
to service_role;

revoke all privileges on table
  public.app_connection_ownership_periods,
  public.app_connection_periods,
  public.app_connections,
  public.app_dossier_document_files,
  public.app_dossier_document_versions,
  public.app_signup_intake_files,
  public.app_signup_intakes,
  public.app_signup_signing_challenges
from public, anon, authenticated, service_role;

grant select, insert, update on table
  public.app_connection_ownership_periods,
  public.app_connection_periods,
  public.app_connections,
  public.app_dossier_document_files,
  public.app_dossier_document_versions,
  public.app_signup_intake_files,
  public.app_signup_intakes,
  public.app_signup_signing_challenges
to service_role;

revoke all privileges on table
  public.app_customer_dossiers,
  public.app_customer_identities,
  public.app_customers,
  public.app_dossier_chargers,
  public.app_dossier_document_slots,
  public.app_dossier_legal_acceptances,
  public.app_dossier_locations,
  public.app_idempotency_keys,
  public.app_intake_audit_events,
  public.app_signup_intake_capabilities
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.app_customer_dossiers,
  public.app_customer_identities,
  public.app_customers,
  public.app_dossier_chargers,
  public.app_dossier_document_slots,
  public.app_dossier_legal_acceptances,
  public.app_dossier_locations,
  public.app_idempotency_keys,
  public.app_intake_audit_events,
  public.app_signup_intake_capabilities
to service_role;

revoke all privileges on sequence
  public.app_customer_correction_replacement_candidat_event_sequence_seq
from public, anon, authenticated, service_role;

commit;
