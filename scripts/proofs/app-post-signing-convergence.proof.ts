// ENVAL 09C1C focused source-contract proof.
// Runtime/gateway/database behavior is exercised by the existing focused
// signing, promotion, Auth and dashboard proofs run alongside this gate.

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

async function read(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

const [
  signingEndpoint,
  promotion,
  authEndpoint,
  authHelper,
  dashboardEndpoint,
  signingClient,
  receiptStore,
  signupShell,
  authProvider,
  authClient,
  accountPage,
  authErrors,
  dashboardSidebar,
  dashboardClient,
  dashboardUi,
  documentPresentation,
  promotionMigration,
  migration,
  parityMigration,
  r6Migration,
] = await Promise.all([
  read("supabase/functions/api-app-signup-signing-finalize/index.ts"),
  read("supabase/functions/_shared/signup_promotion.ts"),
  read("supabase/functions/api-app-auth-bootstrap/index.ts"),
  read("supabase/functions/_shared/app_customer_auth.ts"),
  read("supabase/functions/api-app-dashboard-get/index.ts"),
  read("app/src/features/signup/signupSigningClient.ts"),
  read("app/src/features/signup/signupSubmissionReceiptStore.ts"),
  read("app/src/features/signup/SignupPageShell.tsx"),
  read("app/src/features/auth/AuthProvider.tsx"),
  read("app/src/features/auth/authClient.ts"),
  read("app/src/features/auth/AccountPage.tsx"),
  read("app/src/features/auth/authErrorMapping.ts"),
  read("app/src/features/dashboard/DashboardSidebar.tsx"),
  read("app/src/features/dashboard/dashboardReadClient.ts"),
  read("app/src/features/dashboard/ActivePrivateDashboard.tsx"),
  read("app/src/features/documents/documentSlotPresentation.ts"),
  read(
    "supabase/migrations/20260810190000_app_signed_signup_promotion_foundation.sql",
  ),
  read(
    "supabase/migrations/20260811100000_app_post_signing_customer_convergence.sql",
  ),
  read(
    "supabase/migrations/20260814120000_app_signed_signup_declared_asset_parity.sql",
  ),
  read(
    "supabase/migrations/20260814220000_app_auth_customer_context_access.sql",
  ),
]);

const activeFrontendRuntime = [
  signingEndpoint,
  signingClient,
  receiptStore,
  signupShell,
].join("\n");
const v5Start = migration.indexOf(
  "create or replace function public.app_bootstrap_customer_auth_v5",
);
const v5 = migration.slice(v5Start);

const checks: Array<[string, () => void]> = [
  ["Q01", () =>
    assert(
      signingEndpoint.includes('intake_status: "submitted_for_review"') &&
        migration.includes("'intake_status', 'submitted_for_review'"),
      "finalize_status_semantics",
    )],
  ["Q02", () =>
    assert(
      !activeFrontendRuntime.includes("pending_verification"),
      "legacy_frontend_runtime_status",
    )],
  ["Q03", () =>
    assert(
      receiptStore.includes("signup-submission-receipt-v3") &&
        receiptStore.includes("promotionState") &&
        receiptStore.includes("accountHandoff") &&
        !/intakeId|customerId|caseId|capability|email|otp|hash/i.test(
          receiptStore.slice(
            0,
            receiptStore.indexOf("function sessionStorageOrNull"),
          ),
        ),
      "receipt_contract",
    )],
  ["Q04", () =>
    assert(
      signupShell.includes("readSignupSigningStatus()") &&
        signupShell.includes("result.value.intakeStatus"),
      "refresh_hydration",
    )],
  ["Q05", () =>
    assert(
      signingEndpoint.indexOf('SB.rpc("app_signup_signing_finalize_v2"') <
          signingEndpoint.lastIndexOf("postSigningProjection(req, intakeId") &&
        signingEndpoint.includes("promotion_state: attempt.state"),
      "signing_before_promotion",
    )],
  ["Q06", () =>
    assert(
      /Je ondertekening blijft\s+geldig/.test(signupShell) &&
        !signupShell.includes("opnieuw tekenen"),
      "no_resign",
    )],
  ["Q07", () =>
    assert(
      signingEndpoint.includes("`signup-promotion:${intakeId}`") &&
        promotion.includes('SB.rpc("app_promote_signed_signup_v3"'),
      "deterministic_retry",
    )],
  ["Q08", () =>
    assert(
      !signupShell.includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET") &&
        !signingClient.includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET"),
      "secret_in_browser",
    )],
  ["Q09", () =>
    assert(
      !signingClient.includes("api-app-signup-promote") &&
        signingEndpoint.includes("attemptSignupPromotion"),
      "browser_promotion_authority",
    )],
  ["Q10", () =>
    assert(
      !promotion.includes("safe_reference") &&
        promotion.includes("intake_reference"),
      "safe_reference_authority",
    )],
  ["Q11", () =>
    assert(
      authClient.includes("client.auth") &&
        !authClient.includes("otp_code") &&
        !signingClient.includes("setSession"),
      "otp_auth_session",
    )],
  ["Q12", () =>
    assert(
      signupShell.includes('navigate("/account#inloggen")') &&
        signupShell.includes('navigate("/account#activeren")') &&
        authClient.includes("client.auth.signUp") &&
        authClient.includes("client.auth.signInWithPassword"),
      "existing_auth_reuse",
    )],
  ["Q13", () =>
    assert(
      authEndpoint.includes('SB.rpc("app_bootstrap_customer_auth_v6"') &&
        r6Migration.includes("app_sync_auth_customer_access_v1") &&
        v5.includes("set auth_user_id = p_auth_user_id"),
      "verified_auth_binding",
    )],
  ["Q14", () =>
    assert(
      !v5.includes("insert into public.app_customers"),
      "duplicate_customer",
    )],
  ["Q15", () =>
    assert(
      !v5.includes("insert into public.app_cases"),
      "duplicate_case",
    )],
  ["Q16", () =>
    assert(
      v5.includes("v_identity.auth_user_id <> p_auth_user_id") &&
        v5.includes("customer_identity_already_bound"),
      "cross_user_binding",
    )],
  ["Q17", () =>
    assert(
      dashboardEndpoint.includes("requireAppCustomer(req, SB)"),
      "unauth_dashboard",
    )],
  ["Q18", () =>
    assert(
      dashboardEndpoint.includes("loadSignedCaseReadModel") &&
        dashboardEndpoint.includes("caseAccess.appCase.caseId"),
      "promoted_dashboard",
    )],
  ["Q19", () =>
    assert(
      dashboardEndpoint.includes('.from("app_cases")') &&
        dashboardEndpoint.includes('sourceClass === "signed_signup_intake"'),
      "case_owned_truth",
    )],
  ["Q20", () =>
    assert(
      !v5.includes("insert into public.app_customer_dossiers") &&
        !promotion.includes("app_customer_dossiers"),
      "new_dossier_row",
    )],
  ["Q21", () =>
    assert(
      signupShell.includes("ondertekend en ingediend") &&
        migration.includes("submitted_for_review") &&
        !signupShell.toLowerCase().includes("externe verifier"),
      "internal_review_copy",
    )],
  ["Q22", () =>
    assert(
      !dashboardEndpoint.includes("storage_path,") &&
        !dashboardEndpoint.includes("sha256") &&
        !dashboardEndpoint.includes("event_data"),
      "customer_safe_projection",
    )],
  ["Q23", () =>
    assert(
      signupShell.includes("readSignupSubmissionReceipt()") &&
        signupShell.includes("hydrateSigningState") &&
        receiptStore.includes("window.sessionStorage"),
      "durable_navigation_recovery",
    )],
  ["Q24", () =>
    assert(
      signupShell.includes("recoveryBootstrapStartedRef.current") &&
        authProvider.includes("bootstrapAttemptRef.current?.userId"),
      "strict_mode_deduplication",
    )],
  ["Q25", () =>
    assert(
      !signupShell.includes("setInterval") &&
        !signupShell.includes("setTimeout") &&
        signupShell.includes("Status opnieuw ophalen"),
      "bounded_retry",
    )],
  ["Q26", () =>
    assert(
      signingEndpoint.includes("app_signup_signing_finalize_v2") &&
        signingEndpoint.includes("app_signup_signing_status_v2"),
      "signing_regression_hook",
    )],
  ["Q27", () =>
    assert(
      promotion.includes("SIGNUP_PROMOTION_MODE") &&
        promotion.includes("requireInternalAuthorization"),
      "promotion_regression_hook",
    )],
  ["Q28", () =>
    assert(
      authEndpoint.includes("requireVerifiedSupabaseAuthUser") &&
        dashboardEndpoint.includes("requireAppCaseAccess"),
      "auth_dashboard_regression_hook",
    )],
  ["Q29", () =>
    assert(
      ![signingClient, receiptStore, signupShell, dashboardClient].join("\n")
        .includes("SUPABASE_SERVICE_ROLE_KEY"),
      "frontend_secret_marker",
    )],
  ["Q30", () =>
    assert(
      !receiptStore.includes("console.") &&
        !dashboardEndpoint.includes("console."),
      "sensitive_output",
    )],
  ["Q31", () =>
    assert(
      migration.includes("from auth.users") &&
        migration.includes("p_authenticated_auth_user_id"),
      "existing_auth_user_preexists",
    )],
  ["Q32", () =>
    assert(
      promotionMigration.includes("where identity_row.email_normalized =") &&
        !promotion.includes("auth.admin.createUser"),
      "existing_account_new_signup",
    )],
  ["Q33", () =>
    assert(
      signupShell.includes("Inloggen naar klantportaal") &&
        !signupShell.includes("Account maken of inloggen"),
      "existing_account_handoff",
    )],
  ["Q34", () =>
    assert(
      signupShell.includes("account_activation_available") &&
        signupShell.includes("Account aanmaken"),
      "new_user_handoff",
    )],
  ["Q35", () =>
    assert(
      signingEndpoint.indexOf('rpc.body.signing_state !== "finalized"') <
          signingEndpoint.indexOf("postSigningProjection(req, intakeId") &&
        !signingClient.includes("listUsers"),
      "no_pre_otp_enumeration",
    )],
  ["Q36", () =>
    assert(
      signupShell.includes("already_authenticated") &&
        signupShell.includes('navigate("/dashboard")'),
      "authenticated_handoff",
    )],
  ["Q37", () =>
    assert(
      !v5.includes("insert into public.app_customers") &&
        promotionMigration.includes("select * into strict v_identity"),
      "existing_customer_reused",
    )],
  ["Q38", () =>
    assert(
      promotionMigration.includes("insert into public.app_cases") &&
        promotionMigration.includes("signed_signup_intake"),
      "new_case_created",
    )],
  ["Q39", () =>
    assert(
      v5.includes("from public.app_customer_dossiers dossier") &&
        v5.includes("union all"),
      "old_case_preserved",
    )],
  ["Q40", () =>
    assert(
      dashboardEndpoint.includes("loadAccessibleCaseSummaries") &&
        dashboardEndpoint.includes(
          '"app_customer_dossier", "signed_signup_intake"',
        ),
      "unified_dashboard",
    )],
  ["Q41", () =>
    assert(
      dashboardSidebar.includes("auth.summary.dossiers.length") &&
        v5.includes("normalized_cases"),
      "dashboard_count",
    )],
  ["Q42", () =>
    assert(
      dashboardEndpoint.includes("getString(row.source_class)") &&
        dashboardEndpoint.includes("getString(row.source_ref)") &&
        !dashboardEndpoint.includes("dedupeByEmail") &&
        !dashboardEndpoint.includes("dedupeByAddress"),
      "no_heuristic_dedupe",
    )],
  ["Q43", () =>
    assert(
      dashboardSidebar.includes('navigate("/aanmelden")') &&
        !dashboardSidebar.includes("documentupdate"),
      "existing_case_update_separate",
    )],
  ["Q44", () =>
    assert(
      authErrors.includes("user_already_exists") &&
        accountPage.includes('setMode("signin")') &&
        accountPage.includes("Dit account bestaat al"),
      "user_already_exists_recovery",
    )],
  ["Q45", () =>
    assert(
      dashboardEndpoint.includes("requireAppCustomer(req, SB)") &&
        dashboardEndpoint.includes("requireAppCaseAccess"),
      "wrong_user_denied",
    )],
  ["Q46", () =>
    assert(
      v5.includes("v_active_identity_count <> 1") &&
        migration.includes("customer_identity_binding_ambiguous"),
      "no_duplicate_identity",
    )],
  ["Q47", () =>
    assert(
      !v5.includes("insert into public.app_cases") &&
        promotionMigration.includes("v_existing_promotion") &&
        promotionMigration.includes("'replayed', true"),
      "no_duplicate_case_on_refresh",
    )],
  ["Q48", () =>
    assert(
      receiptStore.includes("accountHandoff") &&
        signupShell.includes("readSignupSubmissionReceipt()"),
      "back_forward_preserves_handoff",
    )],
  ["Q49", () =>
    assert(
      ![signingClient, receiptStore, signupShell, dashboardClient].join("\n")
        .includes("SUPABASE_SERVICE_ROLE_KEY"),
      "secret_scan",
    )],
  ["Q50", () =>
    assert(
      !receiptStore.includes("email_normalized") &&
        !receiptStore.includes("auth_user_id") &&
        !receiptStore.includes("snapshot_sha256"),
      "sensitive_output_none",
    )],
];

for (const [id, check] of checks) {
  check();
  console.log(`${id}=PASS`);
}
console.log("POST_SIGNING_CONVERGENCE_Q01_Q50=PASS");

const parityChecks: Array<[string, string, () => void]> = [
  ["Q93", "SOURCE_SIGNED_LOCATION_COUNT_KNOWN", () =>
    assert(
      parityMigration.includes("v_source_location_count") &&
        parityMigration.includes("mandate_content -> 'connection_scope'"),
      "source_signed_location_count_unknown",
    )],
  ["Q94", "SOURCE_SIGNED_CHARGER_COUNT_KNOWN", () =>
    assert(
      parityMigration.includes("v_source_charger_count") &&
        parityMigration.includes("fact ->> 'charger_id'"),
      "source_signed_charger_count_unknown",
    )],
  ["Q95", "DURABLE_LOCATION_COUNT_PARITY", () =>
    assert(
      parityMigration.includes(
        "durable location count does not match signed source",
      ),
      "durable_location_count_parity_missing",
    )],
  ["Q96", "DURABLE_CHARGER_COUNT_PARITY", () =>
    assert(
      parityMigration.includes(
        "durable charger count does not match signed source",
      ) && parityMigration.includes("insert into public.app_chargers"),
      "durable_charger_count_parity_missing",
    )],
  ["Q97", "CHARGER_LOCATION_LINK_PARITY", () =>
    assert(
      parityMigration.includes(
        "v_promotion.request_id || ':case-location:' || v_location_ref",
      ) && parityMigration.includes("location_id = v_location_id"),
      "charger_location_link_parity_missing",
    )],
  ["Q98", "DECLARED_CHARGER_FIELDS_PRESERVED", () =>
    assert(
      [
        "brand",
        "model",
        "serial_number",
        "mid_identifier",
        "installation_year",
        "backend_supplier",
        "solar_export_declaration",
      ].every((field) => parityMigration.includes(field)),
      "declared_charger_fields_missing",
    )],
  ["Q99", "MID_REMAINS_DECLARED_NOT_ACCEPTED", () =>
    assert(
      parityMigration.includes("confirmed_awaiting_review") &&
        parityMigration.includes("mid_identifier") &&
        !parityMigration.includes("insert into public.app_location_versions") &&
        !parityMigration.includes("insert into public.app_evidence_decisions"),
      "mid_became_accepted_truth",
    )],
  ["Q100", "DOCUMENT_COUNT_PARITY", () =>
    assert(
      parityMigration.includes(
        "durable evidence context count does not match evidence",
      ),
      "document_count_parity_missing",
    )],
  ["Q101", "DOCUMENT_TYPE_PROVENANCE_PRESERVED", () =>
    assert(
      promotionMigration.includes("v_source_file.document_type") &&
        parityMigration.includes("v_source_file.document_type"),
      "document_type_provenance_missing",
    )],
  ["Q102", "EVIDENCE_REMAINS_AWAITING_REVIEW", () =>
    assert(
      promotionMigration.includes("'confirmed_awaiting_review'") &&
        documentPresentation.includes(
          'status === "confirmed_awaiting_review"',
        ) &&
        !parityMigration.includes("status = 'accepted'"),
      "evidence_acceptance_boundary_changed",
    )],
  ["Q103", "DASHBOARD_RETURNS_DECLARED_CHARGER", () =>
    assert(
      dashboardEndpoint.includes('.from("app_chargers")') &&
        dashboardEndpoint.includes('.from("app_charger_declarations")') &&
        dashboardEndpoint.includes("chargers,"),
      "dashboard_declared_charger_projection_missing",
    )],
  ["Q104", "DASHBOARD_RETURNS_MEANINGFUL_DOCUMENT_CLASSIFICATION", () =>
    assert(
      dashboardEndpoint.includes("signedDocumentTitle(documentType)") &&
        dashboardEndpoint.includes("Energiecontract of -nota") &&
        dashboardEndpoint.includes("Installatiefactuur laadpaal") &&
        documentPresentation.includes("|| slot.title"),
      "dashboard_document_classification_missing",
    )],
  ["Q105", "EVIDENCE_ITEMS_HAVE_UNIQUE_STABLE_UI_IDENTITIES", () =>
    assert(
      dashboardEndpoint.includes("document_slot_id: evidenceId") &&
        dashboardUi.includes("identity: slot.document_slot_id") &&
        dashboardUi.includes("key={row.identity}"),
      "stable_evidence_ui_identity_missing",
    )],
  ["Q106", "NO_DISPLAY_LABEL_AS_REACT_KEY", () =>
    assert(
      !dashboardUi.includes("key={row.label}") &&
        !dashboardUi.includes("key={slot.title}"),
      "display_label_used_as_react_key",
    )],
  ["Q107", "LEGACY_CASE_UNCHANGED", () =>
    assert(
      !parityMigration.includes("app_dossier_chargers") &&
        !parityMigration.includes("app_customer_dossiers") &&
        dashboardEndpoint.includes("loadDashboardReadModel"),
      "legacy_case_truth_changed",
    )],
  ["Q108", "MIXED_DASHBOARD_STILL_TWO_CASES", () =>
    assert(
      dashboardEndpoint.includes("loadAccessibleCaseSummaries") &&
        dashboardEndpoint.includes(
          '"app_customer_dossier", "signed_signup_intake"',
        ),
      "mixed_dashboard_collection_changed",
    )],
  ["Q109", "NO_NEW_ACCEPTED_DOMAIN_TRUTH", () =>
    assert(
      parityMigration.includes("declared/review-input foundation only") &&
        !parityMigration.includes("insert into public.app_location_versions") &&
        !parityMigration.includes("insert into public.app_connection_versions"),
      "accepted_domain_truth_added",
    )],
  ["Q110", "CUSTOMER_SAFE_PROJECTION", () =>
    assert(
      !dashboardEndpoint.includes("source_slot_ref_sha256") &&
        !dashboardEndpoint.includes("source_ref_sha256") &&
        !dashboardEndpoint.includes("canonical_snapshot_sha256"),
      "unsafe_declared_projection_field",
    )],
  ["Q111", "BUNDLE_SECRET_SCAN", () =>
    assert(
      ![dashboardClient, dashboardUi, documentPresentation].join("\n")
        .includes("SUPABASE_SERVICE_ROLE_KEY") &&
        ![dashboardClient, dashboardUi, documentPresentation].join("\n")
          .includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET"),
      "r4_browser_bundle_secret_marker",
    )],
  ["Q112", "SENSITIVE_OUTPUT_NONE", () =>
    assert(
      !dashboardEndpoint.includes("console.") &&
        !dashboardUi.includes("source_slot_ref_sha256") &&
        !dashboardUi.includes("storage_path"),
      "r4_sensitive_output_marker",
    )],
];

for (const [id, label, check] of parityChecks) {
  check();
  console.log(`${id}_${label}=PASS`);
}
console.log("POST_SIGNING_CONVERGENCE_Q93_Q112=PASS");
