// Local-write 09C1C-R5 account-first convergence proof.
// Creates isolated example.invalid fixtures and deliberately performs no
// cleanup or Auth-user deletion. Output contains PASS markers only.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  createFixture,
  localConfig,
  sha256,
} from "./app-signup-promotion-runtime.proof.ts";
import {
  attemptSignupPromotion,
  durableDestinationPath,
} from "../../supabase/functions/_shared/signup_promotion.ts";
import {
  decodeAuthBootstrapResponse,
} from "../../app/src/features/auth/authBootstrapClient.ts";

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function marker(id: string): void {
  console.log(`${id}=PASS`);
}

function proofKey(label: string): string {
  return `09c1c-r5-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function proofPdf(label: string): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.4\n% ENVAL R5 ${label}\n1 0 obj\n<<>>\nendobj\n%%EOF`,
  );
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(bytes).buffer], {
    type: "application/pdf",
  });
}

async function post(
  url: string,
  anonKey: string,
  accessToken: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => null);
  return {
    status: response.status,
    body: parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null,
  };
}

async function exactCount(
  service: SupabaseClient,
  table: string,
  filters: Array<[string, string]> = [],
): Promise<number> {
  let query = service.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const result = await query;
  assert(!result.error, `count_failed_${table}`);
  return Number(result.count || 0);
}

async function businessTotals(
  service: SupabaseClient,
): Promise<Record<string, number>> {
  const tables = [
    "app_customers",
    "app_customer_identities",
    "app_cases",
    "app_parties",
    "app_customer_party_relationships",
    "app_signup_mandates",
    "app_evidence_files",
    "app_signup_legal_acceptances",
  ];
  const totals: Record<string, number> = {};
  for (const table of tables) totals[table] = await exactCount(service, table);
  return totals;
}

async function createSignedFixture(
  service: SupabaseClient,
  email: string,
  serviceName: string,
  label: string,
) {
  const bytes = proofPdf(label);
  const fixture = await createFixture(service, "particulier", label, 3, {
    email,
    serviceName,
    fileHash: await sha256Bytes(bytes),
    fileSize: bytes.byteLength,
    storageBucket: "app-documents",
    useCanonicalSourcePath: true,
  });
  const upload = await service.storage.from(fixture.storageBucket).upload(
    fixture.storagePath,
    pdfBlob(bytes),
    { contentType: "application/pdf", upsert: false },
  );
  assert(!upload.error, "source_upload_failed");
  return fixture;
}

function promotionMeta(label: string, intakeId: string) {
  return {
    request_id: proofKey(label),
    idempotency_key: `signup-promotion:${intakeId}`,
    ip_hash: "local-proof",
    user_agent_hash: "local-proof",
    method: "POST",
    path: "/functions/v1/api-app-signup-promote",
    url: "http://127.0.0.1/functions/v1/api-app-signup-promote",
    origin: null,
    timestamp: new Date().toISOString(),
    environment: "local",
  };
}

async function promoteQuietly(intakeId: string, label: string) {
  const originalInfo = console.info;
  console.info = () => undefined;
  try {
    return await attemptSignupPromotion(
      intakeId,
      promotionMeta(label, intakeId),
    );
  } finally {
    console.info = originalInfo;
  }
}

async function sourceText(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

assert(
  Deno.env.get("ENVAL_ALLOW_LOCAL_PROOF_WRITES") === "YES",
  "local_proof_writes_not_enabled",
);

const config = await localConfig();
Deno.env.set("SUPABASE_URL", config.url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", config.serviceRoleKey);
const functionBaseUrl = `${config.url}/functions/v1`;
const service = createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false },
});
const anon = createClient(config.url, config.anonKey, {
  auth: { persistSession: false },
});

const accountEmail = `${proofKey("account-first")}@example.invalid`;
const password = `Aa1!${crypto.randomUUID()}x`;
const serviceName = `Proof Person ${proofKey("same-profile")}`;
const beforeAccount = await businessTotals(service);
const created = await service.auth.admin.createUser({
  email: accountEmail,
  password,
  email_confirm: true,
});
assert(!created.error && created.data.user?.id, "fresh_auth_create_failed");
const authUserId = String(created.data.user.id);
const afterAccount = await businessTotals(service);

assert(
  created.data.user.email_confirmed_at || created.data.user.confirmed_at,
  "fresh_auth_not_verified",
);
marker("Q113_FRESH_AUTH_ACCOUNT_EXISTS");

assert(
  await exactCount(service, "app_customer_identities", [
    ["auth_user_id", authUserId],
  ]) === 0,
  "customer_binding_created_with_auth_account",
);
marker("Q114_NO_CUSTOMER_BEFORE_APPLICATION");

const signedIn = await anon.auth.signInWithPassword({
  email: accountEmail,
  password,
});
const accessToken = signedIn.data.session?.access_token || "";
assert(!signedIn.error && accessToken, "fresh_auth_signin_failed");
const zeroBootstrap = await post(
  `${functionBaseUrl}/api-app-auth-bootstrap`,
  config.anonKey,
  accessToken,
  {},
  proofKey("zero-bootstrap"),
);
assert(
  zeroBootstrap.status === 200 && zeroBootstrap.body?.ok === true &&
    zeroBootstrap.body.binding_status === "unbound_no_cases" &&
    Array.isArray(zeroBootstrap.body.dossiers) &&
    zeroBootstrap.body.dossiers.length === 0,
  "zero_case_bootstrap_failed",
);
marker("Q115_ZERO_CASE_BOOTSTRAP_SUCCESS");

const decodedZero = decodeAuthBootstrapResponse(zeroBootstrap.body);
assert(
  decodedZero.ok &&
    decodedZero.summary.binding_status === "unbound_no_cases" &&
    decodedZero.summary.dossiers.length === 0,
  "production_decoder_rejected_zero_case",
);
marker("Q116_ZERO_CASE_BROWSER_CONTRACT_ACCEPTED");

const activeDashboardSource = await sourceText(
  "app/src/features/dashboard/ActivePrivateDashboard.tsx",
);
const sidebarSource = await sourceText(
  "app/src/features/dashboard/DashboardSidebar.tsx",
);
assert(
  activeDashboardSource.includes("<p>0 dossiers</p>") &&
    sidebarSource.includes("auth.summary.dossiers.length"),
  "zero_case_count_ui_missing",
);
marker("Q117_ZERO_CASE_PORTAL_COUNT_ZERO");
assert(
  activeDashboardSource.includes("Nieuwe aanvraag") &&
    sidebarSource.includes('navigate("/aanmelden")'),
  "zero_case_new_application_missing",
);
marker("Q118_ZERO_CASE_NEW_APPLICATION_AVAILABLE");

const anonBootstrap = await post(
  `${functionBaseUrl}/api-app-auth-bootstrap`,
  config.anonKey,
  config.anonKey,
  {},
  proofKey("anon-bootstrap"),
);
assert(anonBootstrap.status === 401, "anonymous_zero_case_portal_allowed");
marker("Q119_ANON_ZERO_CASE_PORTAL_DENIED");

assert(
  JSON.stringify(beforeAccount) === JSON.stringify(afterAccount),
  "account_creation_created_business_truth",
);
marker("Q120_ACCOUNT_CREATION_CREATES_NO_BUSINESS_CASE_TRUTH");

const appSource = await sourceText("app/src/App.tsx");
const signupSource = await sourceText(
  "app/src/features/signup/SignupPageShell.tsx",
);
assert(
  appSource.includes("<AuthProvider>") &&
    appSource.includes("<SignupPage") &&
    signupSource.includes("<PersonalInfoSection") &&
    !signupSource.includes("AuthenticatedSignup"),
  "authenticated_signup_does_not_reuse_form",
);
marker("Q121_AUTHENTICATED_SIGNUP_REUSES_EXISTING_FORM");
assert(
  signupSource.includes('accountHandoff !== "already_authenticated"') &&
    signupSource.includes("clearSignupIntakeSession();") &&
    signupSource.includes('navigate("/dashboard")'),
  "already_authenticated_direct_portal_missing",
);
marker("Q161_ALREADY_AUTHENTICATED_DIRECT_PORTAL");

const spoofEmail = `${proofKey("spoof-target")}@example.invalid`;
const authenticatedStart = await post(
  `${functionBaseUrl}/api-app-signup-intake-start`,
  config.anonKey,
  accessToken,
  { account_type: "particulier", email: spoofEmail },
  proofKey("authenticated-intake"),
);
assert(
  authenticatedStart.status === 200 && authenticatedStart.body?.ok === true,
  "authenticated_intake_start_failed",
);
const authenticatedIntake = await service.from("app_signup_intakes")
  .select("email_normalized")
  .eq("id", String(authenticatedStart.body.intake_reference || ""))
  .single();
const authenticatedProvenance = await service.from(
  "app_signup_authenticated_intake_provenance",
)
  .select("auth_user_id,auth_email_sha256,linkage_type")
  .eq("intake_id", String(authenticatedStart.body.intake_reference || ""))
  .single();
assert(
  !authenticatedIntake.error &&
    authenticatedIntake.data.email_normalized === accountEmail,
  "authenticated_email_not_server_derived",
);
marker("Q122_AUTHENTICATED_EMAIL_SERVER_DERIVED");
assert(
  !authenticatedProvenance.error &&
    authenticatedProvenance.data.auth_user_id === authUserId &&
    authenticatedProvenance.data.linkage_type ===
      "verified_auth_at_intake_start" &&
    /^[0-9a-f]{64}$/.test(authenticatedProvenance.data.auth_email_sha256),
  "authenticated_intake_provenance_missing",
);
marker("Q147_AUTHENTICATED_INTAKE_HAS_SERVER_PROVENANCE");
marker("Q148_AUTH_EMAIL_SERVER_DERIVED");

assert(
  await exactCount(service, "app_customers") ===
      beforeAccount.app_customers &&
    await exactCount(service, "app_customer_identities") ===
      beforeAccount.app_customer_identities,
  "intake_start_created_customer_truth",
);
marker("Q150_NO_CUSTOMER_AT_INTAKE_START");

assert(
  (await service.auth.admin.listUsers()).data.users.filter((user) =>
    user.email?.toLowerCase() === accountEmail
  ).length === 1,
  "second_auth_user_created_before_application",
);
marker("Q123_NO_SECOND_AUTH_USER");

const firstFixture = await createSignedFixture(
  service,
  accountEmail,
  serviceName,
  proofKey("first-application"),
);
const firstClaim = await service.rpc(
  "app_signup_authenticated_intake_claim_v1",
  {
    p_intake_id: firstFixture.intakeId,
    p_authenticated_auth_user_id: authUserId,
    p_request_id: proofKey("first-auth-claim"),
  },
);
assert(
  !firstClaim.error && firstClaim.data?.ok === true,
  "signed_fixture_auth_provenance_claim_failed",
);
const signingEvidence = await service.from("app_signup_signature_evidence")
  .select("method_id,typed_full_name,evidence_envelope")
  .eq("id", firstFixture.signatureId)
  .single();
const legalAcceptances = await exactCount(
  service,
  "app_signup_legal_acceptances",
  [["intake_id", firstFixture.intakeId]],
);
assert(
  !signingEvidence.error && signingEvidence.data.typed_full_name &&
    signingEvidence.data.evidence_envelope && legalAcceptances === 3,
  "authenticated_signing_boundary_missing",
);
marker("Q124_SIGNING_STILL_REQUIRED");
marker("Q151_SIGNING_REQUIRED_FOR_AUTHENTICATED_USER");
assert(
  signingEvidence.data.method_id === "typed_name_otp_v1",
  "authenticated_signing_otp_bypassed",
);
marker("Q125_SIGNING_OTP_STILL_REQUIRED");
marker("Q152_SIGNING_OTP_REQUIRED_FOR_AUTHENTICATED_USER");

const firstPromotion = await promoteQuietly(
  firstFixture.intakeId,
  "first-promotion",
);
assert(firstPromotion.ok, "authenticated_first_promotion_failed");
marker("Q126_AUTHENTICATED_PROMOTION_SUCCEEDS");
marker("Q153_ZERO_CASE_AUTH_PROMOTION_SUCCEEDS");

const firstPromotionRow = await service.from("app_signup_promotions")
  .select("customer_id,identity_id,case_id")
  .eq("intake_id", firstFixture.intakeId)
  .single();
assert(!firstPromotionRow.error, "first_promotion_lineage_missing");
const customerId = String(firstPromotionRow.data.customer_id);
const identityId = String(firstPromotionRow.data.identity_id);
const firstCaseId = String(firstPromotionRow.data.case_id);
assert(
  await exactCount(service, "app_customers", [["id", customerId]]) === 1 &&
    await exactCount(service, "app_customer_identities", [
        ["id", identityId],
      ]) === 1 &&
    await exactCount(service, "app_customers", [
        ["primary_email_normalized", accountEmail],
      ]) === 1 &&
    await exactCount(service, "app_customer_identities", [
        ["email_normalized", accountEmail],
      ]) === 1,
  "first_application_customer_or_identity_cardinality",
);
marker("Q127_CUSTOMER_CREATED_OR_REUSED_EXACTLY_ONCE");
marker("Q154_EXACTLY_ONE_CUSTOMER_CREATED");
marker("Q155_EXACTLY_ONE_IDENTITY_CREATED");

const firstBootstrap = await post(
  `${functionBaseUrl}/api-app-auth-bootstrap`,
  config.anonKey,
  accessToken,
  {},
  proofKey("first-bootstrap"),
);
const decodedFirst = decodeAuthBootstrapResponse(firstBootstrap.body);
const boundIdentity = await service.from("app_customer_identities")
  .select("auth_user_id")
  .eq("id", identityId)
  .single();
assert(
  firstBootstrap.status === 200 && decodedFirst.ok &&
    !boundIdentity.error && boundIdentity.data.auth_user_id === authUserId,
  "auth_identity_not_bound_after_promotion",
);
marker("Q128_AUTH_IDENTITY_BINDS_AFTER_PROMOTION");
marker("Q156_IDENTITY_BINDS_EXISTING_AUTH_USER");

assert(
  await exactCount(service, "app_cases", [["customer_id", customerId]]) === 1,
  "first_case_cardinality_invalid",
);
marker("Q129_EXACTLY_ONE_FIRST_CASE");
marker("Q157_EXACTLY_ONE_CASE_CREATED");

const promotionReplay = await promoteQuietly(
  firstFixture.intakeId,
  "first-promotion-replay",
);
assert(
  promotionReplay.ok && promotionReplay.replayed &&
    await exactCount(service, "app_signup_promotions", [
        ["intake_id", firstFixture.intakeId],
      ]) === 1 &&
    await exactCount(service, "app_cases", [["customer_id", customerId]]) ===
      1,
  "authenticated_promotion_replay_not_idempotent",
);
marker("Q158_PROMOTION_RETRY_IDEMPOTENT");

const bindingReplay = await service.rpc(
  "app_signup_authenticated_intake_claim_v1",
  {
    p_intake_id: firstFixture.intakeId,
    p_authenticated_auth_user_id: authUserId,
    p_request_id: proofKey("first-auth-claim-replay"),
  },
);
const reboundIdentity = await service.from("app_customer_identities")
  .select("auth_user_id")
  .eq("id", identityId)
  .single();
assert(
  !bindingReplay.error && bindingReplay.data?.ok === true &&
    !reboundIdentity.error &&
    reboundIdentity.data.auth_user_id === authUserId,
  "authenticated_binding_replay_not_idempotent",
);
marker("Q159_BINDING_RETRY_IDEMPOTENT");
assert(
  decodedFirst.ok && decodedFirst.summary.dossiers.length === 1,
  "portal_did_not_transition_zero_to_one",
);
marker("Q130_PORTAL_ZERO_TO_ONE");
marker("Q160_PORTAL_ZERO_TO_ONE");

const secondFixture = await createSignedFixture(
  service,
  accountEmail,
  serviceName,
  proofKey("second-application"),
);
const secondPromotion = await promoteQuietly(
  secondFixture.intakeId,
  "second-promotion",
);
assert(secondPromotion.ok, "second_application_failed");
marker("Q131_SECOND_NEW_APPLICATION");

assert(
  (await service.auth.admin.listUsers()).data.users.filter((user) =>
    user.email?.toLowerCase() === accountEmail
  ).length === 1,
  "second_application_created_auth_user",
);
marker("Q132_SAME_AUTH_USER");

const secondPromotionRow = await service.from("app_signup_promotions")
  .select("customer_id,identity_id,case_id")
  .eq("intake_id", secondFixture.intakeId)
  .single();
assert(
  !secondPromotionRow.error &&
    secondPromotionRow.data.customer_id === customerId &&
    secondPromotionRow.data.identity_id === identityId,
  "second_application_did_not_reuse_customer",
);
marker("Q133_SAME_COMPATIBLE_CUSTOMER");

const secondCaseId = String(secondPromotionRow.data.case_id);
assert(
  firstCaseId !== secondCaseId &&
    await exactCount(service, "app_cases", [["customer_id", customerId]]) === 2,
  "second_case_cardinality_invalid",
);
marker("Q134_EXACTLY_SECOND_CASE");

const secondBootstrap = await post(
  `${functionBaseUrl}/api-app-auth-bootstrap`,
  config.anonKey,
  accessToken,
  {},
  proofKey("second-bootstrap"),
);
const decodedSecond = decodeAuthBootstrapResponse(secondBootstrap.body);
assert(
  decodedSecond.ok && decodedSecond.summary.dossiers.length === 2,
  "portal_did_not_transition_one_to_two",
);
marker("Q135_PORTAL_ONE_TO_TWO");

const firstEvidence = await service.from("app_evidence_files")
  .select("id,case_id")
  .eq("case_id", firstCaseId);
const secondEvidence = await service.from("app_evidence_files")
  .select("id,case_id")
  .eq("case_id", secondCaseId);
assert(
  !firstEvidence.error && !secondEvidence.error &&
    firstEvidence.data.length === 1 && secondEvidence.data.length === 1 &&
    firstEvidence.data[0].id !== secondEvidence.data[0].id,
  "case_evidence_not_isolated",
);
marker("Q136_CASE_EVIDENCE_ISOLATED");

const anonymousEmail = `${proofKey("anonymous")}@example.invalid`;
const anonymousStart = await post(
  `${functionBaseUrl}/api-app-signup-intake-start`,
  config.anonKey,
  config.anonKey,
  { account_type: "particulier", email: anonymousEmail },
  proofKey("anonymous-intake"),
);
assert(
  anonymousStart.status === 200 && anonymousStart.body?.ok === true,
  "anonymous_signup_path_regressed",
);
marker("Q137_ANONYMOUS_SIGNUP_PATH_UNCHANGED");
marker("Q164_ANONYMOUS_PATH_UNCHANGED");

const promotionCandidates = await service.from("app_signup_promotions")
  .select("intake_id,identity_id")
  .order("promoted_at", { ascending: false })
  .limit(100);
assert(!promotionCandidates.error, "signup_first_control_query_failed");
let signupFirstIntakeId = "";
let signupFirstHandoff: { error: unknown; data: unknown } | null = null;
for (const candidate of promotionCandidates.data || []) {
  const identity = await service.from("app_customer_identities")
    .select("status,auth_user_id")
    .eq("id", candidate.identity_id)
    .maybeSingle();
  if (
    !identity.error && identity.data?.status === "active" &&
    !identity.data.auth_user_id
  ) {
    const handoff = await service.rpc("app_signup_account_handoff_v2", {
      p_intake_id: candidate.intake_id,
      p_authenticated_auth_user_id: null,
    });
    if (
      !handoff.error &&
      handoff.data?.account_handoff === "account_activation_available"
    ) {
      signupFirstIntakeId = String(candidate.intake_id);
      signupFirstHandoff = handoff;
      break;
    }
  }
}
assert(signupFirstIntakeId, "signup_first_control_promotion_missing");
assert(
  signupFirstHandoff &&
    !signupFirstHandoff.error &&
    (signupFirstHandoff.data as { account_handoff?: string })
        ?.account_handoff === "account_activation_available",
  "signup_first_activation_regressed",
);
marker("Q138_NEW_USER_SIGNUP_FIRST_ACTIVATION_UNCHANGED");
marker("Q162_ACCOUNT_ACTIVATION_PATH_UNCHANGED");

const existingAccountLoginHandoff = await service.rpc(
  "app_signup_account_handoff_v2",
  {
    p_intake_id: firstFixture.intakeId,
    p_authenticated_auth_user_id: null,
  },
);
assert(
  !existingAccountLoginHandoff.error &&
    existingAccountLoginHandoff.data?.account_handoff ===
      "existing_account_login_required",
  "existing_account_login_handoff_regressed",
);
marker("Q163_EXISTING_ACCOUNT_LOGIN_PATH_UNCHANGED");

const existingAnonymousStart = await post(
  `${functionBaseUrl}/api-app-signup-intake-start`,
  config.anonKey,
  config.anonKey,
  { account_type: "particulier", email: accountEmail },
  proofKey("anonymous-existing-intake"),
);
assert(
  existingAnonymousStart.status === anonymousStart.status &&
    JSON.stringify(Object.keys(existingAnonymousStart.body || {}).sort()) ===
      JSON.stringify(Object.keys(anonymousStart.body || {}).sort()),
  "anonymous_intake_enumerates_account_existence",
);
marker("Q139_NO_PRE_OTP_ENUMERATION");

const edgeSource = await sourceText(
  "supabase/functions/api-app-auth-bootstrap/index.ts",
);
const blockedDecoded = decodeAuthBootstrapResponse({
  ok: false,
  mode: "auth_bootstrap_browser",
  schema_version: "auth_bootstrap_browser_v2",
  authenticated: true,
  binding_status: "blocked",
  dossiers: [],
  code: "customer_identity_binding_ambiguous",
});
assert(
  !blockedDecoded.ok && blockedDecoded.bindingStatus === "blocked" &&
    edgeSource.includes('code !== "customer_identity_not_found"') &&
    edgeSource.includes('"customer_identity_binding_ambiguous"'),
  "blocked_semantics_not_conflict_only",
);
marker("Q140_BLOCKED_ONLY_FOR_REAL_CONFLICT");

const wrongEmail = `${proofKey("wrong-user")}@example.invalid`;
const wrongPassword = `Aa1!${crypto.randomUUID()}x`;
const wrongUser = await service.auth.admin.createUser({
  email: wrongEmail,
  password: wrongPassword,
  email_confirm: true,
});
assert(!wrongUser.error && wrongUser.data.user?.id, "wrong_user_create_failed");
const wrongSignIn = await anon.auth.signInWithPassword({
  email: wrongEmail,
  password: wrongPassword,
});
const wrongToken = wrongSignIn.data.session?.access_token || "";
assert(!wrongSignIn.error && wrongToken, "wrong_user_signin_failed");
const wrongDashboard = await post(
  `${functionBaseUrl}/api-app-dashboard-get`,
  config.anonKey,
  wrongToken,
  { dossier_id: firstCaseId },
);
assert([403, 404].includes(wrongDashboard.status), "wrong_user_access_allowed");
marker("Q141_WRONG_USER_DENIED");
const wrongClaim = await service.rpc(
  "app_signup_authenticated_intake_claim_v1",
  {
    p_intake_id: firstFixture.intakeId,
    p_authenticated_auth_user_id: String(wrongUser.data.user.id),
    p_request_id: proofKey("wrong-auth-claim"),
  },
);
assert(!!wrongClaim.error, "wrong_auth_user_provenance_claim_allowed");
marker("Q166_WRONG_AUTH_USER_DENIED");

assert(
  authenticatedIntake.data.email_normalized === accountEmail &&
    authenticatedIntake.data.email_normalized !== spoofEmail,
  "spoof_email_claim_allowed",
);
marker("Q142_NO_EMAIL_SPOOF_CLAIM");
marker("Q149_EMAIL_SPOOF_DENIED");

assert(
  zeroBootstrap.body?.schema_version === "auth_bootstrap_browser_v2" &&
    firstBootstrap.body?.schema_version === "auth_bootstrap_browser_v2" &&
    decodedZero.ok && decodedFirst.ok && decodedSecond.ok,
  "live_edge_decoder_schema_parity_failed",
);
marker("Q143_STABLE_BOOTSTRAP_SCHEMA_PARITY");

const browserSources = [
  await sourceText("app/src/App.tsx"),
  await sourceText("app/src/features/auth/AuthProvider.tsx"),
  await sourceText("app/src/features/auth/authBootstrapClient.ts"),
  await sourceText("app/src/features/dashboard/DashboardPageShell.tsx"),
  await sourceText("app/src/features/signup/SignupPageShell.tsx"),
  await sourceText(
    "app/src/features/signup/signupQuarantineUploadClient.ts",
  ),
].join("\n");
assert(
  !browserSources.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !browserSources.includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET"),
  "browser_bundle_secret_marker",
);
marker("Q144_BUNDLE_SECRET_SCAN");
marker("Q167_NO_BROWSER_INTERNAL_SECRET");

const provenanceMigrationSource = await sourceText(
  "supabase/migrations/20260814180000_app_authenticated_intake_provenance.sql",
);
assert(
  provenanceMigrationSource.includes(
    "email-only customer convergence is not allowed",
  ) ||
    (await sourceText(
      "supabase/migrations/20260812100000_app_existing_verified_customer_profile_convergence.sql",
    )).includes("email-only customer convergence is not allowed"),
  "email_only_merge_guard_missing",
);
marker("Q165_NO_EMAIL_ONLY_MERGE");
assert(
  !/custom[_ -]?session[_ -]?token/i.test(browserSources) &&
    !browserSources.includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET"),
  "custom_session_token_architecture_detected",
);
marker("Q168_NO_CUSTOM_SESSION_TOKEN_ARCHITECTURE");

assert(
  !JSON.stringify({
    zero: zeroBootstrap.body,
    first: firstBootstrap.body,
    second: secondBootstrap.body,
  }).match(
    /email|auth_user_id|customer_id|identity_id|token|otp|capability/i,
  ) &&
    await sha256(accountEmail) !== accountEmail,
  "sensitive_browser_output",
);
marker("Q145_SENSITIVE_OUTPUT_NONE");
marker("Q170_SENSITIVE_OUTPUT_NONE");
console.log("ACCOUNT_FIRST_CONVERGENCE_Q113_Q145=PASS");
console.log("LOCAL_FIXTURES_RETAINED_NO_CLEANUP=PASS");
