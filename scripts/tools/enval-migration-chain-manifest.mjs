export const TENANT_ENVAL_MIGRATION_CHAIN = Object.freeze({
  target: "TENANT_ENVAL",
  activeRoot: "supabase/migrations",
  baseline: Object.freeze({
    version: "20260816150000",
    path: "supabase/migrations/20260816150000_app_current_baseline.sql",
    sha256: "26702fefa4bda9887287fe26d64bb3346b96a69f4384c8c157cb3e83315033fa",
  }),
  forwardTail: Object.freeze([
    Object.freeze({
      version: "20260816160000",
      path:
        "supabase/migrations/20260816160000_app_workforce_policy_foundation.sql",
      sha256:
        "85f6f766572907aadd460fead729dc8223567b824a817f326f1728b8d8834bc5",
    }),
    Object.freeze({
      version: "20260817120000",
      path:
        "supabase/migrations/20260817120000_app_compliance_workforce_view.sql",
      sha256:
        "05ff2b8d6aa0198f73dc6165fd44e3e19f9697213cd03f697e045de2a84459f1",
    }),
    Object.freeze({
      version: "20260817160000",
      path:
        "supabase/migrations/20260817160000_app_compliance_source_event_ledger.sql",
      sha256:
        "e2b48c7622689d61d406519223d1405742eab9db5f129d264e36cce044eae5e0",
    }),
    Object.freeze({
      version: "20260817190000",
      path:
        "supabase/migrations/20260817190000_app_compliance_source_event_capture.sql",
      sha256:
        "c2afad298abcb287b3edb1e4ff4493df60ccd1116040d1913202aa97d1952a41",
    }),
    Object.freeze({
      version: "20260817210000",
      path:
        "supabase/migrations/20260817210000_app_compliance_worklist_read.sql",
      sha256:
        "7bb16ad28945b0782e4c6009aa86da17d6d35bede6d87441da38efaf6f33b412",
    }),
    Object.freeze({
      version: "20260817230000",
      path:
        "supabase/migrations/20260817230000_app_evidence_review_foundation.sql",
      sha256:
        "7dbdc65327b6cd4114194bc61dd2d8fbbe10b9503f2277522d4e1acae8144a95",
    }),
    Object.freeze({
      version: "20260818090000",
      path:
        "supabase/migrations/20260818090000_app_evidence_review_worklist_read.sql",
      sha256:
        "6ab145b09027639c737ee8b905738352ff088c63be90726bbdd83550b2a6d995",
    }),
    Object.freeze({
      version: "20260818120000",
      path:
        "supabase/migrations/20260818120000_app_evidence_review_case_detail_read.sql",
      sha256:
        "87c8131ab73f8c7a7fdc321935cb14990248bddae31d4538ececd04c4c900bc0",
    }),
    Object.freeze({
      version: "20260818150000",
      path:
        "supabase/migrations/20260818150000_app_evidence_review_preview_read.sql",
      sha256:
        "3a618254f8f2dc94d52b1c24336bd9e13f1aae5aced2daf556504e39e9f632a9",
    }),
    Object.freeze({
      version: "20260818180000",
      path:
        "supabase/migrations/20260818180000_app_signup_resolution_provenance_projection.sql",
      sha256:
        "b91c757e63ab9dd5c6839d737d79680b9d1e90332f91f4c1de858a4ed906ecd6",
    }),
    Object.freeze({
      version: "20260818210000",
      path:
        "supabase/migrations/20260818210000_app_evidence_review_correction_details.sql",
      sha256:
        "adefe90755df47c5844712a4b5cd4d13a0c9e61b430f850825035c7c9aac5e19",
    }),
    Object.freeze({
      version: "20260818220000",
      path:
        "supabase/migrations/20260818220000_app_evidence_review_case_detail_decide_affordance.sql",
      sha256:
        "604969d6ef9ab041984874ba3fc2bba3a31096a9b7ec7d571457eceba49ffe72",
    }),
    Object.freeze({
      version: "20260818230000",
      path:
        "supabase/migrations/20260818230000_app_evidence_fact_review_rounds.sql",
      sha256:
        "7ad8f52bf992180338dbff5b127d17f77f38f72c142171a1d223b639f5343054",
    }),
    Object.freeze({
      version: "20260819090000",
      path:
        "supabase/migrations/20260819090000_app_evidence_review_current_round_read.sql",
      sha256:
        "cc084cbb1ea1033719153cad9a37462279ab248276e95c8884a7fe86def613d5",
    }),
    Object.freeze({
      version: "20260819120000",
      path:
        "supabase/migrations/20260819120000_app_evidence_review_worklist_fact_cutover.sql",
      sha256:
        "9c2a72b1e95722528fa9ef5d7ef1b328047122f51c549a87d9506cb953ab0a29",
    }),
    Object.freeze({
      version: "20260819123000",
      path:
        "supabase/migrations/20260819123000_app_evidence_review_worklist_activity_fix.sql",
      sha256:
        "35a83cd66eee86174cbdfba6c4b5b80f5ab675a52740b2e4047f054eb50e1cd8",
    }),
    Object.freeze({
      version: "20260819160000",
      path:
        "supabase/migrations/20260819160000_app_evidence_review_overall_status.sql",
      sha256:
        "7676146ab4bcb722d87362adf40ff477a1d63c9934a2872d6fd649eb8e7f595c",
    }),
    Object.freeze({
      version: "20260819190000",
      path:
        "supabase/migrations/20260819190000_app_evidence_review_correction_handoff.sql",
      sha256:
        "79865e5341c013dd254d7c72ec91adae60a1ad772904045f573de58f6337f271",
    }),
    Object.freeze({
      version: "20260819210000",
      path:
        "supabase/migrations/20260819210000_app_evidence_review_correction_publish_affordance.sql",
      sha256:
        "df956774441c8be0f04850e5bd7dd98a4fcab55125c935bc5ba0f39f49e8d106",
    }),
    Object.freeze({
      version: "20260819220000",
      path:
        "supabase/migrations/20260819220000_app_evidence_review_correction_publication_target_fix.sql",
      sha256:
        "60e19c9c9f8d36375e7d321f20a35f75d99320a295e257b40de8da109079b239",
    }),
    Object.freeze({
      version: "20260820090000",
      path:
        "supabase/migrations/20260820090000_app_customer_correction_submissions.sql",
      sha256:
        "ef6d56fe9602979e2f250e7d2cfe4121a6775a7cb1007017b4766151b27b3436",
    }),
    Object.freeze({
      version: "20260820120000",
      path:
        "supabase/migrations/20260820120000_app_customer_correction_handoff_contract_v2.sql",
      sha256:
        "6ac24eb07ec8402b77faf7970f7498e38f6a40d07c07df17e8f4e005cd79a2e7",
    }),
    Object.freeze({
      version: "20260820150000",
      path:
        "supabase/migrations/20260820150000_app_customer_correction_signer_authority.sql",
      sha256:
        "6cf26b1f2e87d3df5e2cce839cbc9c33f2a70e7573849045f34de8f9bce1fa03",
    }),
    Object.freeze({
      version: "20260820180000",
      path:
        "supabase/migrations/20260820180000_app_parser_observation_foundation.sql",
      sha256:
        "974d88c770452ed1a42724e57550bd86994b6c520e2124af3427bb508c2129ef",
    }),
    Object.freeze({
      version: "20260820183000",
      path:
        "supabase/migrations/20260820183000_app_parser_observation_acl_fix.sql",
      sha256:
        "c1e93c68016658e65e1c77d60bfa7d29dee667660bac179b23e4979a6962c77a",
    }),
    Object.freeze({
      version: "20260820210000",
      path:
        "supabase/migrations/20260820210000_app_correction_handoff_supersession.sql",
      sha256:
        "f2e366bef0a4dea425a3928c3716d5104d9baf70e345f2d659442cf504532a98",
    }),
    Object.freeze({
      version: "20260820220000",
      path:
        "supabase/migrations/20260820220000_app_customer_correction_replacement_staging.sql",
      sha256:
        "14773ff6e4dcc59adfd90f44f978447974c0201ce16c37bea6eb31b4d3d77d24",
    }),
    Object.freeze({
      version: "20260821100000",
      path:
        "supabase/migrations/20260821100000_app_customer_correction_document_finalization.sql",
      sha256:
        "425ea994188ea3bc130c48e6f06024246220e7b61184e049ec7a7f3314047aca",
    }),
    Object.freeze({
      version: "20260822120000",
      path:
        "supabase/migrations/20260822120000_app_customer_correction_handoff_fact_projection.sql",
      sha256:
        "13edf3a4aa8e41ce77443da7e050449cf37e6357818f98e19cc3f0b65af6a2df",
    }),
    Object.freeze({
      version: "20260823120000",
      path:
        "supabase/migrations/20260823120000_app_customer_correction_candidate_selection.sql",
      sha256:
        "204566d6fa935fa12005f710d2938c08392d08f506b9a5eb3ee95489bced16bf",
    }),
    Object.freeze({
      version: "20260823123000",
      path:
        "supabase/migrations/20260823123000_app_customer_correction_resolution_null_projection.sql",
      sha256:
        "bc2ea7547b0038cc321f8a64a33c266030722e453ef910435cfab7c067fadb3c",
    }),
    Object.freeze({
      version: "20260823130000",
      path:
        "supabase/migrations/20260823130000_app_customer_correction_withdraw_scope_fix.sql",
      sha256:
        "ed5ced65c837c692668e2f0d01ccf28596e6a48a31d47e4e8e303e98950050af",
    }),
    Object.freeze({
      version: "20260823133000",
      path:
        "supabase/migrations/20260823133000_app_customer_correction_handoff_null_fix.sql",
      sha256:
        "8962aec2045b0ebaf2ce170e2906f8711c6c308f41c9edf2f7a7be8b6871b3e7",
    }),
    Object.freeze({
      version: "20260823134500",
      path:
        "supabase/migrations/20260823134500_app_customer_correction_handoff_preflight_fix.sql",
      sha256:
        "de01dcc55e3e5a34d0c6fad92c1770e980b2177ffb31aa31dbc41467a7bcd156",
    }),
    Object.freeze({
      version: "20260824100000",
      path:
        "supabase/migrations/20260824100000_app_customer_correction_resolution_routing.sql",
      sha256:
        "c767ad5f3fb9e4d67a6562b3156f4f33b1bec90a12327bc58151650e32b79f49",
    }),
    Object.freeze({
      version: "20260901190000",
      path:
        "supabase/migrations/20260901190000_app_tenant_configuration_persistence.sql",
      sha256:
        "df89c35e6f770ab4212d21ed2a565698021949903f0ef94854c37e76f854839b",
    }),
    Object.freeze({
      version: "20260901220000",
      path:
        "supabase/migrations/20260901220000_app_tenant_signing_material.sql",
      sha256:
        "62d7c9640d47334fa6b5d930680d7822016bad7200625618965fef75470366aa",
    }),
    Object.freeze({
      version: "20260901230000",
      path:
        "supabase/migrations/20260901230000_app_signup_signing_presentation_receipt.sql",
      sha256:
        "c105c4808ff078623b3d5de8484ba7fabcf5efb81a8f384f5c2aa7ba316655e9",
    }),
    Object.freeze({
      version: "20260907120000",
      path:
        "supabase/migrations/20260907120000_app_signup_signing_finalize_receipt_bound.sql",
      sha256:
        "28d12b0e47e59bc185b41c129c3ed8cb2e480d808a7a8d350b54271f99514215",
    }),
    Object.freeze({
      version: "20260909115342",
      path:
        "supabase/migrations/20260909115342_app_portal_context_authority.sql",
      sha256:
        "b9bcefbbcb1dac0d4f06c5b613f1829a2c168756a7673edb367385b42a09539b",
    }),
    Object.freeze({
      version: "20260910195608",
      path:
        "supabase/migrations/20260910195608_app_customer_case_timeline_read_v1.sql",
      sha256:
        "6092fc79a6eac4ef79287cb36eee4dede1855f911d8e4724be1c609a5b864304",
    }),
    Object.freeze({
      version: "20260911103144",
      path:
        "supabase/migrations/20260911103144_app_customer_application_index_read_v1.sql",
      sha256:
        "02dbf70b681a1c9d014d9e626a08ef9b23bcc40f53d33d9fdb887378732fa7f0",
    }),
  ]),
  currentPresentAppMigrations: Object.freeze([
    [
      "20260707151801",
      "app_foundation_schema",
      "ce6c77d65a3b12d1254a57345b59716526de2737b7640c0eb22c404c284778c8",
    ],
    [
      "20260708120000",
      "app_locations_chargers_schema",
      "5fd71a98c8beb9e56908f44987ec632592582a0e5ca25ae398225ac5f0bdafcd",
    ],
    [
      "20260708133000",
      "app_document_legal_slots_schema",
      "b401e4d921f378fa85befd566ac8a2c5ab706b312a5bc496f8a75b67f31bb368",
    ],
    [
      "20260711100000",
      "app_document_files_versions_schema",
      "9507cb1d4dbeafb33e4dd98e19d6ebe5448938378529d4d954fdd5ffdba45088",
    ],
    [
      "20260711130000",
      "app_document_upload_confirm_rpc",
      "03ab3ccddaf8265c943ec03e06b0ca85ba1b0a6eb185562ec54ff59a5aa3395e",
    ],
    [
      "20260712100000",
      "app_customer_auth_bootstrap_rpc",
      "c43dc5183a86bc01de4a6e3420f6712eee7c806e9779014da015e7ec0f12e8f0",
    ],
    [
      "20260715100000",
      "app_document_withdraw_current_rpc",
      "869a168a06808818559bc6b81ef5d06cc0c5bfe80868a901dd2535bfc72eab55",
    ],
    [
      "20260716100000",
      "app_signup_intake_quarantine_schema",
      "abb1dd66b0d36d5a7080da7ba3ca23f18a6cb149ccab681bcfe8131c6e3b299f",
    ],
    [
      "20260722100000",
      "app_party_foundation",
      "0356a978ed20b208ca8e3a350b5e80579e0cd186b9f909a761600d1bebf6a9a4",
    ],
    [
      "20260724110000",
      "app_case_party_role_foundation",
      "fb3f9b5d0705d47a5f1be9f934684a25ad474000874daf2ef9e071ab3ddb56a1",
    ],
    [
      "20260728100000",
      "app_location_foundation",
      "c10c3492eda04b2c342200879be7e3b3e98f098269b19b3190d71f61c24c5aa5",
    ],
    [
      "20260728140000",
      "app_location_write_rpcs",
      "171490e672a500d303ca097b8aececda8da7f98ae2411cc5e13cd1cb43a48593",
    ],
    [
      "20260728180000",
      "app_workforce_location_authorization_foundation",
      "e29f0576be4b13cb4250f9e0e931b895e1fa02723b8d8cdac2cffa96006319ac",
    ],
    [
      "20260728220000",
      "app_workforce_location_operation_bridge_rpcs",
      "9b71230ed2b2a91691f763e4cd539e2d923c996c31ca9297ae445cf62807230b",
    ],
    [
      "20260729140000",
      "app_authenticated_dossier_case_activation",
      "66f0a8a494426f70e3673134c2f29664155ff83344385749779aa6d6d26adc30",
    ],
    [
      "20260729180000",
      "app_authenticated_customer_party_activation",
      "3cecb481c0e8182d21454fea47030fb9bb5d3bb100511636d5d22dc4ec8b023d",
    ],
    [
      "20260729220000",
      "app_atomic_signup_submission",
      "6df1ab73b95b3ab13ab2e47869e3c2e7a95baf4d39d310fd552db6609a95add3",
    ],
    [
      "20260730100000",
      "app_declared_profile_asserted_service_recipient",
      "2c54bcebe3244eda856a47559651d87cfc63cffa335a06e14e3641b7351b82d9",
    ],
    [
      "20260730150000",
      "app_signup_connection_declaration_sources",
      "c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8",
    ],
    [
      "20260730170000",
      "app_assisted_connection_capture_correction",
      "561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25",
    ],
    [
      "20260806120000",
      "app_signup_quarantine_upload_runtime",
      "58577e36d3307b4979d893bf7b45cf63909a38156123b22842602927ec42c33b",
    ],
    [
      "20260806160000",
      "app_signup_signing_runtime",
      "7ad49b927af3243a25a42202610b5d623d71a21e3050d34d5afb0f3cf1c53dab",
    ],
    [
      "20260810190000",
      "app_signed_signup_promotion_foundation",
      "7b365a2f79d1c2b3791d01aa520611206837032b57cbe86839917bda5a3d4024",
    ],
    [
      "20260811100000",
      "app_post_signing_customer_convergence",
      "df9f61225aab1d32ab337040fbf78136b13f7fcdc82e5550670526118a9b561c",
    ],
    [
      "20260812100000",
      "app_existing_verified_customer_profile_convergence",
      "ea462e0b492d15ef6bda719f874fd1c3fecc248dae4fb3e309f8e335d9574fd8",
    ],
    [
      "20260814120000",
      "app_signed_signup_declared_asset_parity",
      "447606c8a1d781d471d55be6cad8ab6dafa5ec44c3a949bf6985bce400dfc705",
    ],
    [
      "20260814180000",
      "app_authenticated_intake_provenance",
      "b7628236df48de18695e48226ab83e7c6739723734c22ae0156f43365dc16c6a",
    ],
    [
      "20260814200000",
      "app_authenticated_intake_provenance_security_hardening",
      "dc49dcde5b5e8ccf376d2adc765754d5278ff7c1c3c93ee3707a69a52c52b20d",
    ],
    [
      "20260814220000",
      "app_auth_customer_context_access",
      "acbc746e0b9841d2a847697019da8708b5176956925b244f0e0c7237c7e33ba5",
    ],
  ].map(([version, name, sha256]) =>
    Object.freeze({
      version,
      name,
      sha256,
      originalPath: `supabase/migrations/${version}_${name}.sql`,
      path:
        `supabase/migration-archive/present-app-pre-baseline/${version}_${name}.sql`,
    })
  )),
  absentLegacyMigrations: Object.freeze([
    [
      "20260305",
      "0001_rls_dossier_sessions",
      "74ee516053f10f15eaaf796886a9a02155fcf4f757e5e5cd869d80c17126a111",
    ],
    [
      "20260309",
      "rename_meter_id_to_mid_number",
      "949687d080d932cf8d05777e89ee6c8ac9ea87bf353c470bca31a99376b7c266",
    ],
    [
      "20260317",
      "01_analysis_runs_refactor",
      "b07404f83f40803b9fd9c3545a668c485cf796f90b420a31de8edb9b350a77fa",
    ],
    [
      "20260324",
      "drop_serial_unique_indexes_dossier_chargers",
      "f9aeed5bb9118cdffc92231f7bf2229edec5d0b5969f5f5a04413523630b7256",
    ],
    [
      "20260511",
      "parametrize_retention_cleanup_config",
      "b7ce30c980451e9274845d7f29f25888a4fc8f94e7838ee0080415344b291ebf",
    ],
    [
      "20260513",
      "retention_cleanup_events",
      "86c8c00c96c085c556b811cc88c40bef2eddab241e5070206b9eabf213bf78f7",
    ],
    [
      "20260514",
      "locked_unpaid_reminders",
      "b6f29ef421a0a70fbdc925188f0656d946882ec1492bc6059384947766dd59ba",
    ],
    [
      "20260515",
      "locked_unpaid_reminders_conflict_fix",
      "57bf685ac796ab524f340a57e713a47ddd8a6e132ddf0c40922792b07ed72cad",
    ],
    [
      "20260516",
      "locked_unpaid_reminders_identity_fix",
      "5c427749d996120a2ca45015e3d6054281dd48de5a1e261e2fa0072c1b669396",
    ],
    [
      "20260518",
      "revoke_audit_final_table_client_grants",
      "298f5523f4e07e6feadbcf08d49047dc5ee126662cc50a7bc5f5558893fed732",
    ],
  ].map(([version, name, sha256]) =>
    Object.freeze({
      version,
      name,
      sha256,
      originalPath: `supabase/migrations/${version}_${name}.sql`,
      path: `supabase/migration-archive/absent-legacy/${version}_${name}.sql`,
      classification: "LEGACY_EFFECT_ABSENT",
    })
  )),
  excludedConnectionMigrations: Object.freeze([
    Object.freeze({
      version: "20260720120000",
      name: "app_ean_connection_domain_foundation",
      originalPath:
        "supabase/migrations/20260720120000_app_ean_connection_domain_foundation.sql",
      path:
        "supabase/migration-archive/replaced-connection/20260720120000_app_ean_connection_domain_foundation.sql",
      sha256:
        "83f278d70c239e890d5892102118c20425e167a6a99b4406588521bb6398cbd4",
      materialEffects:
        "3 connection tables; constraints/indexes; 8 guards; 9 triggers; RLS/policies/ACL",
      baselineRepresentation:
        "flattened final connection catalog in 20260816150000_app_current_baseline.sql",
      replayReason:
        "historical source is archived; baseline creates its final material state directly",
    }),
    Object.freeze({
      version: "20260720143000",
      name: "app_connection_write_rpcs",
      originalPath:
        "supabase/migrations/20260720143000_app_connection_write_rpcs.sql",
      path:
        "supabase/migration-archive/replaced-connection/20260720143000_app_connection_write_rpcs.sql",
      sha256:
        "11131138f43fd0560189609160b824175549d1b9019c7781c4180dba1210b371",
      materialEffects:
        "5 service-only connection audit/write RPCs and least-privilege ACL",
      baselineRepresentation:
        "flattened final connection RPC/ACL catalog in 20260816150000_app_current_baseline.sql",
      replayReason:
        "historical source is archived; baseline creates its final material state directly",
    }),
  ]),
  omittedHistoricalDataTransformations: Object.freeze([
    "20260810190000_status_backfill",
    "20260814120000_declared_asset_backfill",
    "20260814220000_customer_access_backfill",
  ]),
});

export function resolveTenantEnvalArchivedMigrationPath(
  originalPath,
  expectedSha256 = null,
) {
  const entry = TENANT_ENVAL_MIGRATION_CHAIN.currentPresentAppMigrations.find(
    (candidate) => candidate.originalPath === originalPath,
  );
  if (!entry) {
    throw new Error(`protected_migration_provenance_missing:${originalPath}`);
  }
  if (expectedSha256 !== null && entry.sha256 !== expectedSha256) {
    throw new Error(
      `protected_migration_manifest_hash_mismatch:${originalPath}`,
    );
  }
  if (
    entry.path.startsWith(`${TENANT_ENVAL_MIGRATION_CHAIN.activeRoot}/`) ||
    !entry.path.startsWith("supabase/migration-archive/")
  ) {
    throw new Error(`protected_migration_not_archived:${originalPath}`);
  }
  return entry.path;
}
