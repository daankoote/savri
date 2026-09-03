BEGIN TRANSACTION READ ONLY;

WITH
expected_relations(migration_version, relation_name, selected_columns, signature) AS (
  VALUES
    ('220000', 'app_tenant_signing_material_revisions', NULL::text[],
      $sig$id:uuid:true:gen_random_uuid(),tenant_id:uuid:true:,environment:text:true:,material_kind:text:true:,material_revision_id:text:true:,component_revision_id:uuid:true:,canonical_content_sha256:text:true:,binding_authority:text:true:,binding_verified_at:timestamptz:true:now(),created_at:timestamptz:true:now()$sig$),
    ('220000', 'app_tenant_signing_operational_material', NULL::text[],
      $sig$signing_material_revision_id:uuid:true:,material_kind:text:true:'operational'::text,operator_legal_entity_reference:text:true:,operator_identity_sha256:text:true:,regulated_operator_legal_entity_reference:text:true:,contracting_party_legal_entity_reference:text:true:,controller_legal_entity_reference:text:false:,mandate_grantee_legal_entity_reference:text:true:,created_at:timestamptz:true:now()$sig$),
    ('220000', 'app_tenant_signing_legal_material', NULL::text[],
      $sig$signing_material_revision_id:uuid:true:,material_kind:text:true:'legal'::text,bundle_revision:text:true:,bundle_canonical_sha256:text:true:,privacy_notice_document_reference:text:true:,privacy_notice_version:text:true:,privacy_notice_language:text:true:,privacy_notice_content_sha256:text:true:,service_terms_document_reference:text:true:,service_terms_version:text:true:,service_terms_language:text:true:,service_terms_content_sha256:text:true:,fee_terms_document_reference:text:true:,fee_terms_version:text:true:,fee_terms_language:text:true:,fee_terms_content_sha256:text:true:,mandate_document_reference:text:true:,mandate_version:text:true:,mandate_language:text:true:,mandate_content_sha256:text:true:,created_at:timestamptz:true:now()$sig$),
    ('220000', 'app_tenant_signing_fee_material', NULL::text[],
      $sig$signing_material_revision_id:uuid:true:,material_kind:text:true:'fee_commercial'::text,document_type:text:true:,document_reference:text:true:,version:text:true:,language:text:true:,content_sha256:text:true:,created_at:timestamptz:true:now()$sig$),
    ('220000', 'app_tenant_signing_configuration_invalidations', NULL::text[],
      $sig$id:uuid:true:gen_random_uuid(),tenant_id:uuid:true:,environment:text:true:,subject_type:text:true:,subject_reference:uuid:true:,effective_at:timestamptz:true:,reason_code:text:true:,authorized_actor_ref:text:true:,evidence_reference:text:true:,created_at:timestamptz:true:now()$sig$),
    ('230000', 'app_signup_signing_presentation_receipts', NULL::text[],
      $sig$id:uuid:true:gen_random_uuid(),receipt_reference:text:true:,receipt_sha256:text:true:,receipt_schema_version:text:true:,intake_id:uuid:true:,authenticated_auth_user_id:uuid:true:,tenant_id:uuid:true:,environment:text:true:,data_plane_locator_id:text:true:,resolved_data_plane_reference:text:true:,manifest_revision_id:uuid:true:,manifest_canonical_sha256:text:true:,operational_component_revision_id:uuid:true:,legal_component_revision_id:uuid:true:,fee_component_revision_id:uuid:true:,operational_signing_material_revision_id:uuid:true:,operational_signing_material_sha256:text:true:,legal_signing_material_revision_id:uuid:true:,legal_signing_material_sha256:text:true:,fee_signing_material_revision_id:uuid:true:,fee_signing_material_sha256:text:true:,legal_bundle_revision:text:true:,legal_bundle_sha256:text:true:,privacy_notice_document_reference:text:true:,privacy_notice_version:text:true:,privacy_notice_language:text:true:,privacy_notice_content_sha256:text:true:,service_terms_document_reference:text:true:,service_terms_version:text:true:,service_terms_language:text:true:,service_terms_content_sha256:text:true:,fee_terms_document_reference:text:true:,fee_terms_version:text:true:,fee_terms_language:text:true:,fee_terms_content_sha256:text:true:,mandate_document_reference:text:true:,mandate_version:text:true:,mandate_language:text:true:,mandate_content_sha256:text:true:,presented_at:timestamptz:true:,expires_at:timestamptz:true:,request_id:text:true:,created_at:timestamptz:true:now()$sig$),
    ('230000', 'app_signup_signing_presentation_acceptances', NULL::text[],
      $sig$id:uuid:true:gen_random_uuid(),presentation_receipt_id:uuid:true:,intake_id:uuid:true:,authenticated_actor_user_id:uuid:true:,privacy_notice_read:bool:true:,service_terms_accepted:bool:true:,fee_terms_accepted:bool:true:,mandate_signed:bool:true:,accepted_at:timestamptz:true:,acceptance_sha256:text:true:,request_id:text:true:,created_at:timestamptz:true:now()$sig$),
    ('230000', 'app_signup_signing_challenges', ARRAY[
      'presentation_receipt_id', 'presentation_receipt_reference',
      'presentation_receipt_sha256', 'presentation_acceptance_id',
      'presentation_acceptance_sha256'
    ],
      $sig$presentation_receipt_id:uuid:false:,presentation_receipt_reference:text:false:,presentation_receipt_sha256:text:false:,presentation_acceptance_id:uuid:false:,presentation_acceptance_sha256:text:false:$sig$)
),
relation_actual AS (
  SELECT
    expected.*,
    relation.oid AS relation_oid,
    (
      SELECT string_agg(
        attribute.attname || ':' || type.typname || ':' ||
        attribute.attnotnull::text || ':' ||
        coalesce(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), ''),
        ',' ORDER BY attribute.attnum
      )
      FROM pg_catalog.pg_attribute attribute
      JOIN pg_catalog.pg_type type ON type.oid = attribute.atttypid
      LEFT JOIN pg_catalog.pg_attrdef default_value
        ON default_value.adrelid = attribute.attrelid
       AND default_value.adnum = attribute.attnum
      WHERE attribute.attrelid = relation.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND (
          expected.selected_columns IS NULL
          OR attribute.attname = ANY(expected.selected_columns)
        )
    ) AS actual_signature,
    CASE
      WHEN expected.selected_columns IS NULL THEN relation.oid IS NOT NULL
      ELSE EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND attribute.attname = ANY(expected.selected_columns)
      )
    END AS anchor
  FROM expected_relations expected
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.relation_name
   AND relation.relkind = 'r'
),
relation_checks AS (
  SELECT
    migration_version,
    'relations_columns_defaults'::text AS mismatch_code,
    anchor,
    relation_oid IS NOT NULL AND actual_signature = signature AS complete,
    anchor AND actual_signature IS DISTINCT FROM signature AS conflict
  FROM relation_actual
),
expected_constraints(
  migration_version, relation_name, constraint_name, constraint_type,
  key_columns, referenced_relation, required_fragments
) AS (
  VALUES
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_revisions_pkey','p','id',NULL::text,ARRAY[]::text[]),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_revisions_component_revision_id_key','u','component_revision_id',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_context_revision_unique','u','tenant_id,environment,material_kind,material_revision_id',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_id_kind_unique','u','id,material_kind',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_revisions_component_revision_id_fkey','f','component_revision_id','app_tenant_configuration_component_revisions',ARRAY[]::text[]),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_environment_valid','c',NULL,NULL,ARRAY['environment','^[a-z][a-z0-9_-]{1,63}$']),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_kind_valid','c',NULL,NULL,ARRAY['material_kind','operational','legal','fee_commercial']),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_revision_valid','c',NULL,NULL,ARRAY['material_revision_id','{2,127}']),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_sha_valid','c',NULL,NULL,ARRAY['canonical_content_sha256','{64}']),
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_binding_authority_valid','c',NULL,NULL,ARRAY['binding_authority','server_canonical_signing_material_v1']),
    ('220000','app_tenant_signing_material_revisions','trg_app_tenant_signing_material_complete','t',NULL,NULL,ARRAY[]::text[]),

    ('220000','app_tenant_signing_operational_material','app_tenant_signing_operational_material_pkey','p','signing_material_revision_id',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_operational_material','app_tenant_signing_operational_material_root_fk','f','signing_material_revision_id,material_kind','app_tenant_signing_material_revisions',ARRAY[]::text[]),
    ('220000','app_tenant_signing_operational_material','app_tenant_signing_operational_material_kind_valid','c',NULL,NULL,ARRAY['material_kind','operational']),
    ('220000','app_tenant_signing_operational_material','app_tenant_signing_operational_material_operator_ref_valid','c',NULL,NULL,ARRAY['operator_legal_entity_reference','{1,199}']),
    ('220000','app_tenant_signing_operational_material','app_tenant_signing_operational_material_identity_sha_valid','c',NULL,NULL,ARRAY['operator_identity_sha256','{64}']),
    ('220000','app_tenant_signing_operational_material','app_tenant_signing_operational_material_roles_valid','c',NULL,NULL,ARRAY['regulated_operator_legal_entity_reference','contracting_party_legal_entity_reference','controller_legal_entity_reference','mandate_grantee_legal_entity_reference']),

    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_pkey','p','signing_material_revision_id',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_root_fk','f','signing_material_revision_id,material_kind','app_tenant_signing_material_revisions',ARRAY[]::text[]),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_kind_valid','c',NULL,NULL,ARRAY['material_kind','legal']),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_bundle_revision_valid','c',NULL,NULL,ARRAY['bundle_revision','{2,127}']),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_bundle_sha_valid','c',NULL,NULL,ARRAY['bundle_canonical_sha256','{64}']),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_languages_valid','c',NULL,NULL,ARRAY['privacy_notice_language','service_terms_language','fee_terms_language','mandate_language','nl']),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_references_valid','c',NULL,NULL,ARRAY['privacy_notice_document_reference','service_terms_document_reference','fee_terms_document_reference','mandate_document_reference','{1,199}']),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_versions_valid','c',NULL,NULL,ARRAY['privacy_notice_version','service_terms_version','fee_terms_version','mandate_version','{2,127}']),
    ('220000','app_tenant_signing_legal_material','app_tenant_signing_legal_material_hashes_valid','c',NULL,NULL,ARRAY['privacy_notice_content_sha256','service_terms_content_sha256','fee_terms_content_sha256','mandate_content_sha256','{64}']),

    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_pkey','p','signing_material_revision_id',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_root_fk','f','signing_material_revision_id,material_kind','app_tenant_signing_material_revisions',ARRAY[]::text[]),
    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_kind_valid','c',NULL,NULL,ARRAY['material_kind','fee_commercial']),
    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_document_type_valid','c',NULL,NULL,ARRAY['document_type','fee_terms']),
    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_document_reference_valid','c',NULL,NULL,ARRAY['document_reference','{1,199}']),
    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_version_valid','c',NULL,NULL,ARRAY['version','{2,127}']),
    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_language_valid','c',NULL,NULL,ARRAY['language','nl']),
    ('220000','app_tenant_signing_fee_material','app_tenant_signing_fee_material_sha_valid','c',NULL,NULL,ARRAY['content_sha256','{64}']),

    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_configuration_invalidations_pkey','p','id',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_invalidation_subject_unique','u','tenant_id,environment,subject_type,subject_reference',NULL,ARRAY[]::text[]),
    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_invalidation_environment_valid','c',NULL,NULL,ARRAY['environment','^[a-z][a-z0-9_-]{1,63}$']),
    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_invalidation_subject_type_valid','c',NULL,NULL,ARRAY['subject_type','manifest','component_revision','signing_material_revision']),
    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_invalidation_reason_valid','c',NULL,NULL,ARRAY['reason_code','explicit_invalidation']),
    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_invalidation_actor_valid','c',NULL,NULL,ARRAY['authorized_actor_ref','{1,199}']),
    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_invalidation_evidence_valid','c',NULL,NULL,ARRAY['evidence_reference','{1,199}']),

    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_pkey','p','id',NULL,ARRAY[]::text[]),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_receipt_reference_key','u','receipt_reference',NULL,ARRAY[]::text[]),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_request_unique','u','intake_id,authenticated_auth_user_id,request_id',NULL,ARRAY[]::text[]),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_intake_id_fkey','f','intake_id','app_signup_intakes',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_manifest_revision_id_fkey','f','manifest_revision_id','app_tenant_configuration_manifests',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_operational_component_revision_id_fkey','f','operational_component_revision_id','app_tenant_configuration_component_revisions',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_legal_component_revision_id_fkey','f','legal_component_revision_id','app_tenant_configuration_component_revisions',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_fee_component_revision_id_fkey','f','fee_component_revision_id','app_tenant_configuration_component_revisions',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_operational_signing_material_revision_id_fkey','f','operational_signing_material_revision_id','app_tenant_signing_material_revisions',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_legal_signing_material_revision_id_fkey','f','legal_signing_material_revision_id','app_tenant_signing_material_revisions',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipts_fee_signing_material_revision_id_fkey','f','fee_signing_material_revision_id','app_tenant_signing_material_revisions',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_reference_valid','c',NULL,NULL,ARRAY['receipt_reference','^spr-','{12}$']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_hashes_valid','c',NULL,NULL,ARRAY['receipt_sha256','manifest_canonical_sha256','operational_signing_material_sha256','legal_signing_material_sha256','fee_signing_material_sha256','legal_bundle_sha256','privacy_notice_content_sha256','service_terms_content_sha256','fee_terms_content_sha256','mandate_content_sha256','{64}']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_schema_valid','c',NULL,NULL,ARRAY['receipt_schema_version','signup-signing-presentation-receipt-v1']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_environment_valid','c',NULL,NULL,ARRAY['environment','^[a-z][a-z0-9_-]{1,63}$']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_languages_valid','c',NULL,NULL,ARRAY['privacy_notice_language','service_terms_language','fee_terms_language','mandate_language','nl']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_window_valid','c',NULL,NULL,ARRAY['expires_at','presented_at','01:00:00']),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_request_valid','c',NULL,NULL,ARRAY['btrim(request_id)','<>']),

    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptances_pkey','p','id',NULL,ARRAY[]::text[]),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptances_presentation_receipt_id_key','u','presentation_receipt_id',NULL,ARRAY[]::text[]),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptances_acceptance_sha256_key','u','acceptance_sha256',NULL,ARRAY[]::text[]),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptances_presentation_receipt_id_fkey','f','presentation_receipt_id','app_signup_signing_presentation_receipts',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptances_intake_id_fkey','f','intake_id','app_signup_intakes',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptance_actions_true','c',NULL,NULL,ARRAY['privacy_notice_read','service_terms_accepted','fee_terms_accepted','mandate_signed']),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptance_hash_valid','c',NULL,NULL,ARRAY['acceptance_sha256','{64}']),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptance_request_valid','c',NULL,NULL,ARRAY['btrim(request_id)','<>']),

    ('230000','app_signup_signing_challenges','app_signup_signing_challenges_presentation_receipt_id_fkey','f','presentation_receipt_id','app_signup_signing_presentation_receipts',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_challenges','app_signup_signing_challenges_presentation_acceptance_id_fkey','f','presentation_acceptance_id','app_signup_signing_presentation_acceptances',ARRAY['on delete restrict']),
    ('230000','app_signup_signing_challenges','app_signup_signing_challenge_presentation_binding_complete','c',NULL,NULL,ARRAY['presentation_receipt_id','presentation_receipt_reference','presentation_receipt_sha256','presentation_acceptance_id','presentation_acceptance_sha256','{64}'])
),
constraint_expected AS (
  SELECT
    expected.*,
    coalesce(constraint_name = relation_name || '_pkey'
      OR constraint_name = relation_name || '_' || replace(key_columns, ',', '_') || '_key'
      OR (
        constraint_type = 'f' AND position(',' IN key_columns) = 0
        AND constraint_name = relation_name || '_' || key_columns || '_fkey'
      ), false) AS generated_name
  FROM expected_constraints expected
),
actual_constraints AS (
  SELECT
    relation.relname AS relation_name,
    constraint_row.oid AS constraint_oid,
    constraint_row.conname,
    constraint_row.contype,
    referenced.relname AS actual_referenced_relation,
    (
      SELECT string_agg(attribute.attname, ',' ORDER BY key_column.ordinality)
      FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = constraint_row.conrelid
       AND attribute.attnum = key_column.attnum
    ) AS actual_key_columns,
    lower(pg_catalog.pg_get_constraintdef(constraint_row.oid, true)) AS definition
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class referenced
    ON referenced.oid = constraint_row.confrelid
),
constraint_actual AS (
  SELECT
    expected.*,
    actual.constraint_oid,
    actual.contype,
    actual.actual_referenced_relation,
    actual.actual_key_columns,
    actual.definition
  FROM constraint_expected expected
  LEFT JOIN actual_constraints actual
    ON actual.relation_name = expected.relation_name
   AND (
     (
       expected.generated_name
       AND actual.contype = expected.constraint_type::"char"
       AND actual.actual_key_columns = expected.key_columns
       AND (
         expected.referenced_relation IS NULL
         OR actual.actual_referenced_relation = expected.referenced_relation
       )
     )
     OR (
       NOT expected.generated_name
       AND actual.conname = left(expected.constraint_name, 63)
     )
   )
),
constraint_checks AS (
  SELECT
    migration_version,
    ('constraint_' || right(constraint_name, 52))::text AS mismatch_code,
    constraint_oid IS NOT NULL AS anchor,
    constraint_oid IS NOT NULL
      AND contype = constraint_type::"char"
      AND (key_columns IS NULL OR actual_key_columns = key_columns)
      AND (referenced_relation IS NULL OR actual_referenced_relation = referenced_relation)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(required_fragments) fragment
        WHERE position(fragment IN definition) = 0
      ) AS complete,
    constraint_oid IS NOT NULL AND NOT (
      contype = constraint_type::"char"
      AND (key_columns IS NULL OR actual_key_columns = key_columns)
      AND (referenced_relation IS NULL OR actual_referenced_relation = referenced_relation)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(required_fragments) fragment
        WHERE position(fragment IN definition) = 0
      )
    ) AS conflict
  FROM constraint_actual
),
unexpected_constraint_checks AS (
  SELECT
    relation_expected.migration_version,
    ('unexpected_constraint_' || right(actual.conname, 42))::text AS mismatch_code,
    true AS anchor,
    false AS complete,
    true AS conflict
  FROM expected_relations relation_expected
  JOIN actual_constraints actual
    ON actual.relation_name = relation_expected.relation_name
  WHERE relation_expected.selected_columns IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM constraint_expected expected
      WHERE expected.migration_version = relation_expected.migration_version
        AND expected.relation_name = relation_expected.relation_name
        AND (
          (
            expected.generated_name
            AND actual.contype = expected.constraint_type::"char"
            AND actual.actual_key_columns = expected.key_columns
            AND (
              expected.referenced_relation IS NULL
              OR actual.actual_referenced_relation = expected.referenced_relation
            )
          )
          OR (
            NOT expected.generated_name
            AND actual.conname = left(expected.constraint_name, 63)
          )
        )
    )
),
expected_indexes(
  migration_version, relation_name, index_name, key_columns,
  predicate_fragment, definition_fragment
) AS (
  VALUES
    ('220000','app_tenant_signing_material_revisions','app_tenant_signing_material_context_idx','tenant_id,environment,material_kind,created_at',NULL::text,NULL::text),
    ('220000','app_tenant_signing_configuration_invalidations','app_tenant_signing_invalidations_context_idx','tenant_id,environment,subject_type,effective_at',NULL,NULL),
    ('230000','app_signup_signing_presentation_receipts','app_signup_signing_presentation_receipt_context_idx','tenant_id,environment,intake_id,presented_at',NULL,'presented_at desc'),
    ('230000','app_signup_signing_presentation_acceptances','app_signup_signing_presentation_acceptance_intake_idx','intake_id,accepted_at',NULL,'accepted_at desc'),
    ('230000','app_signup_signing_challenges','app_signup_signing_challenge_presentation_idx','presentation_receipt_id','presentation_receipt_id is not null',NULL)
),
index_actual AS (
  SELECT
    expected.*,
    index_relation.oid AS index_oid,
    index_data.indisunique,
    lower(pg_catalog.pg_get_expr(index_data.indpred, index_data.indrelid)) AS predicate,
    lower(pg_catalog.pg_get_indexdef(index_relation.oid)) AS definition,
    (
      SELECT string_agg(attribute.attname, ',' ORDER BY key_column.ordinality)
      FROM unnest(index_data.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = index_data.indrelid
       AND attribute.attnum = key_column.attnum
    ) AS actual_key_columns
  FROM expected_indexes expected
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class table_relation
    ON table_relation.relnamespace = namespace.oid
   AND table_relation.relname = expected.relation_name
  LEFT JOIN pg_catalog.pg_class index_relation
    ON index_relation.relnamespace = namespace.oid
   AND index_relation.relname = left(expected.index_name, 63)
   AND index_relation.relkind = 'i'
  LEFT JOIN pg_catalog.pg_index index_data
    ON index_data.indexrelid = index_relation.oid
   AND index_data.indrelid = table_relation.oid
),
index_checks AS (
  SELECT
    migration_version,
    'indexes'::text AS mismatch_code,
    index_oid IS NOT NULL AS anchor,
    index_oid IS NOT NULL AND NOT indisunique
      AND actual_key_columns = key_columns
      AND (predicate_fragment IS NULL OR position(predicate_fragment IN predicate) > 0)
      AND (definition_fragment IS NULL OR position(definition_fragment IN definition) > 0) AS complete,
    index_oid IS NOT NULL AND NOT (
      NOT indisunique AND actual_key_columns = key_columns
      AND (predicate_fragment IS NULL OR position(predicate_fragment IN predicate) > 0)
      AND (definition_fragment IS NULL OR position(definition_fragment IN definition) > 0)
    ) AS conflict
  FROM index_actual
),
expected_routines(
  migration_version, routine_name, identity_arguments, return_type,
  body_md5, service_role_execute
) AS (
  VALUES
    ('220000','app_tenant_signing_material_insert_integrity_v1','','trigger','49bb369950a1b7924910b4cd4b6f0345',false),
    ('220000','app_tenant_signing_material_complete_v1','','trigger','3cf46cc0b0622689793fef975eddca85',false),
    ('220000','app_tenant_signing_legal_material_integrity_v1','','trigger','7dc3b51b53acd74c9f5ee30daa829853',false),
    ('220000','app_tenant_signing_invalidation_integrity_v1','','trigger','42d0b0f458001568509690bf5e9e064e',false),
    ('230000','app_signup_signing_presentation_receipt_integrity_v1','','trigger','7d54d3e5b1efde444cfd0ad9d6564838',false),
    ('230000','app_signup_signing_challenge_binding_immutable_v1','','trigger','d3b5e56167326c5910c91a1846e64fcc',false),
    ('230000','app_signup_signing_challenge_presentation_integrity_v1','','trigger','62b09efdead462f07ade4977e1c0ebfa',false),
    ('230000','app_signup_signing_challenge_issue_v2','uuid, text, uuid, uuid, text, text, text, uuid, text, boolean, boolean, boolean, boolean, timestamp with time zone, text, text, text, timestamp with time zone, text, text, text, text, text','jsonb','b11ab0431d8ef0e6b755e154a6a947bf',true)
),
routine_actual AS (
  SELECT
    expected.*,
    routine.oid AS routine_oid,
    routine.prosecdef,
    routine.proconfig,
    routine.prorettype::regtype::text AS actual_return_type,
    language.lanname,
    md5(routine.prosrc) AS actual_body_md5,
    coalesce((
      SELECT string_agg(
        coalesce(role.rolname, 'PUBLIC') || ':' || acl.privilege_type || ':' ||
        acl.is_grantable::text,
        ',' ORDER BY coalesce(role.rolname, 'PUBLIC'), acl.privilege_type
      )
      FROM pg_catalog.aclexplode(
        coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
      ) acl
      LEFT JOIN pg_catalog.pg_roles role ON role.oid = acl.grantee
      WHERE acl.grantee <> routine.proowner
    ), '') AS actual_acl
  FROM expected_routines expected
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_proc routine
    ON routine.pronamespace = namespace.oid
   AND routine.proname = expected.routine_name
   AND pg_catalog.oidvectortypes(routine.proargtypes) = expected.identity_arguments
  LEFT JOIN pg_catalog.pg_language language ON language.oid = routine.prolang
),
routine_checks AS (
  SELECT
    migration_version,
    ('function_' || right(routine_name, 55))::text AS mismatch_code,
    routine_oid IS NOT NULL AS anchor,
    routine_oid IS NOT NULL AND prosecdef AND proconfig = ARRAY['search_path=""']
      AND actual_return_type = return_type AND lanname = 'plpgsql'
      AND actual_body_md5 = body_md5
      AND actual_acl = CASE WHEN service_role_execute
        THEN 'service_role:EXECUTE:false' ELSE '' END AS complete,
    routine_oid IS NOT NULL AND NOT (
      prosecdef AND proconfig = ARRAY['search_path=""']
      AND actual_return_type = return_type AND lanname = 'plpgsql'
      AND actual_body_md5 = body_md5
      AND actual_acl = CASE WHEN service_role_execute
        THEN 'service_role:EXECUTE:false' ELSE '' END
    ) AS conflict
  FROM routine_actual
),
expected_triggers(
  migration_version, relation_name, trigger_name, function_name,
  trigger_type, is_deferrable, initially_deferred
) AS (
  VALUES
    ('220000','app_tenant_signing_material_revisions','trg_app_tenant_signing_material_insert_integrity','app_tenant_signing_material_insert_integrity_v1',7,false,false),
    ('220000','app_tenant_signing_material_revisions','trg_app_tenant_signing_material_complete','app_tenant_signing_material_complete_v1',5,true,true),
    ('220000','app_tenant_signing_legal_material','trg_app_tenant_signing_legal_material_integrity','app_tenant_signing_legal_material_integrity_v1',7,false,false),
    ('220000','app_tenant_signing_configuration_invalidations','trg_app_tenant_signing_invalidation_integrity','app_tenant_signing_invalidation_integrity_v1',7,false,false),
    ('220000','app_tenant_signing_material_revisions','trg_app_tenant_signing_material_immutable','app_wp2b_i_immutable_guard',27,false,false),
    ('220000','app_tenant_signing_operational_material','trg_app_tenant_signing_operational_material_immutable','app_wp2b_i_immutable_guard',27,false,false),
    ('220000','app_tenant_signing_legal_material','trg_app_tenant_signing_legal_material_immutable','app_wp2b_i_immutable_guard',27,false,false),
    ('220000','app_tenant_signing_fee_material','trg_app_tenant_signing_fee_material_immutable','app_wp2b_i_immutable_guard',27,false,false),
    ('220000','app_tenant_signing_configuration_invalidations','trg_app_tenant_signing_invalidations_immutable','app_wp2b_i_immutable_guard',27,false,false),
    ('220000','app_tenant_signing_material_revisions','trg_app_tenant_signing_material_truncate_guard','app_wp2b_i_immutable_guard',34,false,false),
    ('220000','app_tenant_signing_operational_material','trg_app_tenant_signing_operational_material_truncate_guard','app_wp2b_i_immutable_guard',34,false,false),
    ('220000','app_tenant_signing_legal_material','trg_app_tenant_signing_legal_material_truncate_guard','app_wp2b_i_immutable_guard',34,false,false),
    ('220000','app_tenant_signing_fee_material','trg_app_tenant_signing_fee_material_truncate_guard','app_wp2b_i_immutable_guard',34,false,false),
    ('220000','app_tenant_signing_configuration_invalidations','trg_app_tenant_signing_invalidations_truncate_guard','app_wp2b_i_immutable_guard',34,false,false),
    ('230000','app_signup_signing_presentation_receipts','trg_app_signup_signing_presentation_receipt_immutable','app_wp2b_i_immutable_guard',27,false,false),
    ('230000','app_signup_signing_presentation_receipts','trg_app_signup_signing_presentation_receipt_integrity','app_signup_signing_presentation_receipt_integrity_v1',7,false,false),
    ('230000','app_signup_signing_presentation_acceptances','trg_app_signup_signing_presentation_acceptance_immutable','app_wp2b_i_immutable_guard',27,false,false),
    ('230000','app_signup_signing_presentation_receipts','trg_app_signup_signing_presentation_receipt_truncate_guard','app_wp2b_i_immutable_guard',34,false,false),
    ('230000','app_signup_signing_presentation_acceptances','trg_app_signup_signing_presentation_acceptance_truncate_guard','app_wp2b_i_immutable_guard',34,false,false),
    ('230000','app_signup_signing_challenges','trg_app_signup_signing_challenge_binding_immutable','app_signup_signing_challenge_binding_immutable_v1',19,false,false),
    ('230000','app_signup_signing_challenges','trg_app_signup_signing_challenge_presentation_integrity','app_signup_signing_challenge_presentation_integrity_v1',7,false,false)
),
trigger_actual AS (
  SELECT
    expected.*,
    trigger_row.oid AS trigger_oid,
    trigger_row.tgtype::integer AS actual_trigger_type,
    trigger_row.tgdeferrable,
    trigger_row.tginitdeferred,
    trigger_function.proname AS actual_function_name
  FROM expected_triggers expected
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.relation_name
  LEFT JOIN pg_catalog.pg_trigger trigger_row
    ON trigger_row.tgrelid = relation.oid
   AND trigger_row.tgname = left(expected.trigger_name, 63)
   AND NOT trigger_row.tgisinternal
  LEFT JOIN pg_catalog.pg_proc trigger_function
    ON trigger_function.oid = trigger_row.tgfoid
),
trigger_checks AS (
  SELECT
    migration_version,
    'triggers'::text AS mismatch_code,
    trigger_oid IS NOT NULL AS anchor,
    trigger_oid IS NOT NULL AND actual_function_name = function_name
      AND actual_trigger_type = trigger_type
      AND tgdeferrable = is_deferrable
      AND tginitdeferred = initially_deferred AS complete,
    trigger_oid IS NOT NULL AND NOT (
      actual_function_name = function_name AND actual_trigger_type = trigger_type
      AND tgdeferrable = is_deferrable
      AND tginitdeferred = initially_deferred
    ) AS conflict
  FROM trigger_actual
),
expected_secured_tables(
  migration_version, relation_name, service_acl, table_comment
) AS (
  VALUES
    ('220000','app_tenant_signing_material_revisions','service_role:INSERT:false,service_role:SELECT:false',$comment$Immutable tenant-local signing-material binding root. The trusted server canonical material authority verifies that canonical_content_sha256 covers the typed relational child and exactly equals the approved TF02 component content hash.$comment$),
    ('220000','app_tenant_signing_operational_material','service_role:INSERT:false,service_role:SELECT:false',$comment$Strict signing-specific operator identity digest and operator-role bindings. No customer party, support identity, branding or generic business profile.$comment$),
    ('220000','app_tenant_signing_legal_material','service_role:INSERT:false,service_role:SELECT:false',$comment$Strict four-slot references into the canonical signing legal-document authority. Stores no legal text and no generic configuration payload.$comment$),
    ('220000','app_tenant_signing_fee_material','service_role:INSERT:false,service_role:SELECT:false',$comment$Governing fee_terms document provenance only. Stores no numeric fee, calculator or settlement configuration.$comment$),
    ('220000','app_tenant_signing_configuration_invalidations','service_role:INSERT:false,service_role:SELECT:false',$comment$Append-only explicit signing-configuration invalidation evidence. Supersession does not insert invalidation and no real-world invalidation policy is inferred.$comment$),
    ('230000','app_signup_signing_presentation_receipts','service_role:INSERT:false,service_role:SELECT:false',$comment$Immutable server-issued SL01-C legal-presentation receipt. Stores exact tenant/config/material/document provenance but no duplicate legal text.$comment$),
    ('230000','app_signup_signing_presentation_acceptances','service_role:SELECT:false',$comment$Immutable explicit customer legal-action acceptance of exactly one presentation receipt; page rendering is not acceptance.$comment$)
),
secured_table_actual AS (
  SELECT
    expected.*,
    relation.oid AS relation_oid,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.obj_description(relation.oid, 'pg_class') AS actual_comment,
    coalesce((
      SELECT string_agg(
        coalesce(role.rolname, 'PUBLIC') || ':' || acl.privilege_type || ':' ||
        acl.is_grantable::text,
        ',' ORDER BY coalesce(role.rolname, 'PUBLIC'), acl.privilege_type
      )
      FROM pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) acl
      LEFT JOIN pg_catalog.pg_roles role ON role.oid = acl.grantee
      WHERE acl.grantee <> relation.relowner
    ), '') AS actual_acl,
    policy.oid AS policy_oid,
    policy.polpermissive,
    policy.polcmd,
    (
      SELECT array_agg(role.rolname::text ORDER BY role.rolname)
      FROM unnest(policy.polroles) role_oid
      JOIN pg_catalog.pg_roles role ON role.oid = role_oid
    ) AS policy_roles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) AS policy_using,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) AS policy_check
  FROM expected_secured_tables expected
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.relation_name
   AND relation.relkind = 'r'
  LEFT JOIN pg_catalog.pg_policy policy
    ON policy.polrelid = relation.oid
   AND policy.polname = 'deny_all'
),
security_checks AS (
  SELECT migration_version, 'rls_policies'::text AS mismatch_code,
    policy_oid IS NOT NULL AS anchor,
    policy_oid IS NOT NULL AND relrowsecurity AND NOT relforcerowsecurity
      AND polpermissive AND polcmd = '*'
      AND policy_roles = ARRAY['anon','authenticated']
      AND policy_using = 'false' AND policy_check = 'false' AS complete,
    policy_oid IS NOT NULL AND NOT (
      relrowsecurity AND NOT relforcerowsecurity AND polpermissive
      AND polcmd = '*' AND policy_roles = ARRAY['anon','authenticated']
      AND policy_using = 'false' AND policy_check = 'false'
    ) AS conflict
  FROM secured_table_actual
),
acl_checks AS (
  SELECT migration_version, 'acls'::text AS mismatch_code,
    relation_oid IS NOT NULL AS anchor,
    relation_oid IS NOT NULL AND actual_acl = service_acl AS complete,
    relation_oid IS NOT NULL AND actual_acl <> service_acl
      AND actual_acl <> '' AS conflict
  FROM secured_table_actual
),
comment_checks AS (
  SELECT migration_version, 'comments'::text AS mismatch_code,
    actual_comment IS NOT NULL AS anchor,
    actual_comment = table_comment AS complete,
    actual_comment IS NOT NULL AND actual_comment <> table_comment AS conflict
  FROM secured_table_actual
),
expected_routine_comment AS (
  SELECT $comment$Atomically persists first explicit receipt acceptance and issues an existing-semantics OTP challenge bound to that receipt and acceptance.$comment$::text AS body
),
routine_comment_checks AS (
  SELECT
    '230000'::text AS migration_version,
    'comments'::text AS mismatch_code,
    pg_catalog.obj_description(routine.oid, 'pg_proc') IS NOT NULL AS anchor,
    pg_catalog.obj_description(routine.oid, 'pg_proc') = expected.body AS complete,
    pg_catalog.obj_description(routine.oid, 'pg_proc') IS NOT NULL
      AND pg_catalog.obj_description(routine.oid, 'pg_proc') <> expected.body AS conflict
  FROM expected_routine_comment expected
  LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_proc routine
    ON routine.pronamespace = namespace.oid
   AND routine.proname = 'app_signup_signing_challenge_issue_v2'
   AND pg_catalog.oidvectortypes(routine.proargtypes) =
     'uuid, text, uuid, uuid, text, text, text, uuid, text, boolean, boolean, boolean, boolean, timestamp with time zone, text, text, text, timestamp with time zone, text, text, text, text, text'
),
checks AS (
  SELECT * FROM relation_checks
  UNION ALL SELECT * FROM constraint_checks
  UNION ALL SELECT * FROM unexpected_constraint_checks
  UNION ALL SELECT * FROM index_checks
  UNION ALL SELECT * FROM routine_checks
  UNION ALL SELECT * FROM trigger_checks
  UNION ALL SELECT * FROM security_checks
  UNION ALL SELECT * FROM acl_checks
  UNION ALL SELECT * FROM comment_checks
  UNION ALL SELECT * FROM routine_comment_checks
),
parity AS (
  SELECT
    migration_version,
    CASE
      WHEN bool_and(complete) THEN 'FULL_PARITY'
      WHEN NOT bool_or(anchor) THEN 'NOT_PRESENT'
      WHEN bool_or(conflict) THEN 'DIVERGENT'
      ELSE 'PARTIAL_PARITY'
    END AS parity,
    coalesce(
      array_agg(DISTINCT mismatch_code ORDER BY mismatch_code)
        FILTER (WHERE NOT complete),
      ARRAY[]::text[]
    ) AS mismatches
  FROM checks
  GROUP BY migration_version
),
ledger AS (
  SELECT
    EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260901220000'
    ) AS ledger_220000_applied,
    EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260901230000'
    ) AS ledger_230000_applied
)
SELECT pg_catalog.jsonb_build_object(
  'proof', 'LOCAL_RUNTIME04',
  'migration_220000_parity', parity_220000.parity,
  'migration_220000_mismatches', parity_220000.mismatches,
  'migration_230000_parity', parity_230000.parity,
  'migration_230000_mismatches', parity_230000.mismatches,
  'ledger_220000_applied', ledger.ledger_220000_applied,
  'ledger_230000_applied', ledger.ledger_230000_applied,
  'marker', 'ENVAL_LOCAL_RUNTIME04_MIGRATION_PARITY_OK'
)
FROM parity parity_220000
CROSS JOIN parity parity_230000
CROSS JOIN ledger
WHERE parity_220000.migration_version = '220000'
  AND parity_230000.migration_version = '230000';

ROLLBACK;
