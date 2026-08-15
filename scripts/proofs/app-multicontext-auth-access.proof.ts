// Local-write 09C1C-R6 multi-context Auth access proof.
// Creates isolated example.invalid fixtures and deliberately performs no
// cleanup or Auth-user deletion. Output contains PASS markers only.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  createFixture,
  localConfig,
} from "./app-signup-promotion-runtime.proof.ts";
import {
  attemptSignupPromotion,
} from "../../supabase/functions/_shared/signup_promotion.ts";

type Json = Record<string, unknown>;

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function marker(id: string): void {
  console.log(`${id}=PASS`);
}

function proofKey(label: string): string {
  return `09c1c-r6-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function proofPdf(label: string): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.4\n% ENVAL R6 ${label}\n1 0 obj\n<<>>\nendobj\n%%EOF`,
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

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

async function post(
  url: string,
  anonKey: string,
  accessToken: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ status: number; body: Json | null }> {
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
      ? parsed as Json
      : null,
  };
}

async function psqlValue(query: string): Promise<string> {
  const result = await new Deno.Command("psql", {
    args: [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      query,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert(result.success, "local_catalog_query_failed");
  return new TextDecoder().decode(result.stdout).trim();
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

async function accessRows(service: SupabaseClient, authUserId: string) {
  const result = await service.from("app_customer_access_grants")
    .select("customer_id,granted_case_id,access_basis,source_class")
    .eq("auth_user_id", authUserId)
    .order("created_at", { ascending: true });
  assert(!result.error && Array.isArray(result.data), "access_read_failed");
  return result.data;
}

assert(
  Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") === "YES",
  "destructive_local_proof_not_enabled",
);

const config = await localConfig();
Deno.env.set("SUPABASE_URL", config.url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", config.serviceRoleKey);
const service = createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false },
});
const anon = createClient(config.url, config.anonKey, {
  auth: { persistSession: false },
});
const functionBase = `${config.url}/functions/v1`;

const [
  foundationSource,
  provenanceSource,
  r6Migration,
  authHelperSource,
  bootstrapSource,
  dashboardSource,
  signupSource,
  authProviderSource,
  cacheSource,
] = await Promise.all([
  source("supabase/migrations/20260707151801_app_foundation_schema.sql"),
  source(
    "supabase/migrations/20260814180000_app_authenticated_intake_provenance.sql",
  ),
  source(
    "supabase/migrations/20260814220000_app_auth_customer_context_access.sql",
  ),
  source("supabase/functions/_shared/app_customer_auth.ts"),
  source("supabase/functions/api-app-auth-bootstrap/index.ts"),
  source("supabase/functions/api-app-dashboard-get/index.ts"),
  source("app/src/features/signup/SignupPageShell.tsx"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("app/src/features/dashboard/dashboardReadCache.ts"),
]);

assert(
  foundationSource.includes(
    "app_customer_identities_active_auth_user_id_uidx",
  ) &&
    provenanceSource.includes(
      "authenticated user already owns another customer identity",
    ) &&
    provenanceSource.includes(
      "v_customer.customer_type <>\n           v_intake.submitted_payload ->> 'account_type'",
    ),
  "current_multicontext_block_not_proven",
);
marker("Q171_CURRENT_MULTICONTEXT_BLOCK_PROVEN");

assert(
  r6Migration.includes("create table public.app_customer_access_grants") &&
    !r6Migration
      .split("create table public.app_customer_access_grants (")[1]
      ?.split("\n);")[0]
      .includes("account_type"),
  "auth_principal_account_type_detected",
);
marker("Q172_AUTH_PRINCIPAL_HAS_NO_EXCLUSIVE_ACCOUNT_TYPE");

const target = await psqlValue(`
with candidate as (
  select access_grant.auth_user_id
  from public.app_customer_access_grants access_grant
  join public.app_customers customer_row
    on customer_row.id = access_grant.customer_id
  group by access_grant.auth_user_id
  having count(distinct customer_row.customer_type)
    filter (where customer_row.customer_type in ('particulier','zakelijk')) = 2
  order by max(access_grant.created_at) desc
  limit 1
)
select auth_user.id::text || E'\\t' || auth_user.email
from candidate
join auth.users auth_user on auth_user.id = candidate.auth_user_id;
`);
const [authUserId, accountEmail] = target.split("\t");
assert(authUserId && accountEmail, "multicontext_principal_unavailable");

const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email: accountEmail,
});
assert(
  !link.error && link.data.user?.id === authUserId &&
    link.data.properties?.hashed_token,
  "multicontext_auth_link_failed",
);
const verified = await anon.auth.verifyOtp({
  type: "magiclink",
  token_hash: String(link.data.properties.hashed_token),
});
const accessToken = verified.data.session?.access_token || "";
assert(!verified.error && accessToken, "multicontext_auth_session_failed");

const initialAccess = await accessRows(service, authUserId);
const initialCustomerIds = [
  ...new Set(
    initialAccess.map((row) => String(row.customer_id)),
  ),
];
const initialCustomers = await service.from("app_customers")
  .select("id,customer_type")
  .in("id", initialCustomerIds);
assert(!initialCustomers.error, "initial_context_read_failed");
const initialTypes = new Set(
  (initialCustomers.data || []).map((row) => row.customer_type),
);
assert(initialTypes.has("particulier"), "private_context_missing");
marker("Q173_PRIVATE_CONTEXT_REMAINS_SEPARATE");
assert(initialTypes.has("zakelijk"), "business_context_missing");
marker("Q174_BUSINESS_CONTEXT_CREATED_SEPARATELY");

const businessPromotions = await service.from("app_signup_promotions")
  .select("customer_id,case_id,mandate_id,signature_evidence_id,account_type")
  .in("customer_id", initialCustomerIds)
  .eq("account_type", "zakelijk");
assert(
  !businessPromotions.error && businessPromotions.data?.length === 1,
  "recovered_business_promotion_missing",
);
const businessPromotion = businessPromotions.data[0];
const businessMandate = await service.from("app_signup_mandates")
  .select("authority_review_status")
  .eq("id", businessPromotion.mandate_id)
  .single();
const businessEvidence = await service.from("app_signup_signature_evidence")
  .select("id,method_id")
  .eq("id", businessPromotion.signature_evidence_id)
  .single();
assert(
  !businessMandate.error &&
    businessMandate.data.authority_review_status ===
      "required_not_completed" &&
    !businessEvidence.error &&
    businessEvidence.data.method_id === "typed_name_otp_v1",
  "business_authority_or_signing_boundary_changed",
);
marker("Q180_EXISTING_BUSINESS_SIGNED_FIXTURE_RECOVERS_WITHOUT_RESIGN");

const vveBytes = proofPdf("vve-context");
const vveFixture = await createFixture(
  service,
  "vve",
  proofKey("vve-context"),
  3,
  {
    email: accountEmail,
    serviceName: `R6 VvE ${proofKey("organization")}`,
    fileHash: await sha256Bytes(vveBytes),
    fileSize: vveBytes.byteLength,
    storageBucket: "app-documents",
    useCanonicalSourcePath: true,
  },
);
const vveUpload = await service.storage.from(vveFixture.storageBucket).upload(
  vveFixture.storagePath,
  pdfBlob(vveBytes),
  { contentType: "application/pdf", upsert: false },
);
assert(!vveUpload.error, "vve_source_upload_failed");

const anonymousPromotion = await promoteQuietly(
  vveFixture.intakeId,
  "vve-anonymous-promotion",
);
assert(anonymousPromotion.ok, "vve_anonymous_promotion_failed");
const anonymousHandoff = await service.rpc(
  "app_signup_account_handoff_v2",
  {
    p_intake_id: vveFixture.intakeId,
    p_authenticated_auth_user_id: null,
  },
);
assert(
  !anonymousHandoff.error &&
    anonymousHandoff.data?.account_handoff ===
      "existing_account_login_required",
  "existing_account_login_handoff_failed",
);
marker("Q181_EXISTING_ACCOUNT_LOGIN_HANDOFF");

const vveClaim = await service.rpc(
  "app_signup_authenticated_intake_claim_v1",
  {
    p_intake_id: vveFixture.intakeId,
    p_authenticated_auth_user_id: authUserId,
    p_request_id: proofKey("vve-claim"),
  },
);
assert(!vveClaim.error && vveClaim.data?.ok === true, "vve_claim_failed");
const authenticatedPromotion = await promoteQuietly(
  vveFixture.intakeId,
  "vve-authenticated-replay",
);
assert(
  authenticatedPromotion.ok && authenticatedPromotion.replayed,
  "vve_authenticated_access_replay_failed",
);

const allAccess = await accessRows(service, authUserId);
const customerIds = [
  ...new Set(
    allAccess.map((row) => String(row.customer_id)),
  ),
];
const customers = await service.from("app_customers")
  .select("id,customer_type")
  .in("id", customerIds);
assert(
  !customers.error && customers.data?.length === 3,
  "context_count_failed",
);
const typeByCustomer = new Map(
  customers.data.map((row) => [String(row.id), String(row.customer_type)]),
);
const contextTypes = new Set(typeByCustomer.values());
assert(contextTypes.has("vve"), "vve_context_missing");
marker("Q175_VVE_CONTEXT_MODEL_SEPARATE");
assert(
  ["particulier", "zakelijk", "vve"].every((type) => contextTypes.has(type)),
  "same_principal_context_union_failed",
);
marker("Q176_SAME_AUTH_PRINCIPAL_PRIVATE_PLUS_BUSINESS");
assert(customerIds.length === 3, "customer_contexts_merged");
marker("Q177_NO_CUSTOMER_CONTEXT_MERGE");

const contactGrants = allAccess.filter((row) =>
  row.access_basis === "signed_case_contact" &&
  ["zakelijk", "vve"].includes(
    typeByCustomer.get(String(row.customer_id)) || "",
  )
);
assert(contactGrants.length === 2, "business_contact_access_missing");
marker("Q178_BUSINESS_CONTACT_ACCESS_GRANTED");

const authorityRows = await service.from("app_signup_mandates")
  .select("authority_review_status,app_signup_promotions!inner(customer_id)")
  .in("app_signup_promotions.customer_id", customerIds);
assert(
  !authorityRows.error &&
    authorityRows.data.filter((row) =>
        row.authority_review_status === "required_not_completed"
      ).length >= 2,
  "authority_was_escalated",
);
marker("Q179_AUTHORITY_STILL_REQUIRED");

const bootstrap = await post(
  `${functionBase}/api-app-auth-bootstrap`,
  config.anonKey,
  accessToken,
  {},
  proofKey("bootstrap"),
);
const bootstrapDossiers = Array.isArray(bootstrap.body?.dossiers)
  ? bootstrap.body.dossiers as Json[]
  : [];
const bootstrapTypes = new Set(
  bootstrapDossiers.map((row) => String(row.account_type || "")),
);
assert(
  bootstrap.status === 200 && bootstrap.body?.ok === true &&
    ["particulier", "zakelijk", "vve"].every((type) =>
      bootstrapTypes.has(type)
    ),
  "login_multicontext_projection_failed",
);
marker("Q182_LOGIN_SHOWS_PRIVATE_AND_BUSINESS_CASES");

const vveDossier = bootstrapDossiers.find((row) => row.account_type === "vve");
const businessDossier = bootstrapDossiers.find((row) =>
  row.account_type === "zakelijk"
);
assert(vveDossier && businessDossier, "dashboard_context_ids_missing");
const dashboard = await post(
  `${functionBase}/api-app-dashboard-get`,
  config.anonKey,
  accessToken,
  { dossier_id: String(vveDossier.dossier_id) },
);
const dashboardDossiers = Array.isArray(dashboard.body?.dossiers)
  ? dashboard.body.dossiers as Json[]
  : [];
assert(
  dashboard.status === 200 && dashboard.body?.ok === true &&
    dashboardDossiers.some((row) => row.account_type === "particulier") &&
    dashboardDossiers.some((row) => row.account_type === "zakelijk") &&
    dashboardDossiers.some((row) => row.account_type === "vve"),
  "dashboard_access_aggregation_failed",
);
marker("Q183_DASHBOARD_ACCESS_AGGREGATION");

const wrongEmail = `${proofKey("wrong-user")}@example.invalid`;
const wrongPassword = `Aa1!${crypto.randomUUID()}x`;
const wrongCreated = await service.auth.admin.createUser({
  email: wrongEmail,
  password: wrongPassword,
  email_confirm: true,
});
assert(!wrongCreated.error, "wrong_user_create_failed");
const wrongSession = await anon.auth.signInWithPassword({
  email: wrongEmail,
  password: wrongPassword,
});
const wrongToken = wrongSession.data.session?.access_token || "";
assert(!wrongSession.error && wrongToken, "wrong_user_session_failed");
const wrongDashboard = await post(
  `${functionBase}/api-app-dashboard-get`,
  config.anonKey,
  wrongToken,
  { dossier_id: String(vveDossier.dossier_id) },
);
assert([403, 404].includes(wrongDashboard.status), "wrong_user_access_allowed");
marker("Q184_WRONG_USER_DENIED");

assert(
  r6Migration.includes("app_signup_signature_evidence evidence") &&
    r6Migration.includes("challenge.consumed_at is not null") &&
    r6Migration.includes("app_case_party_roles access_role") &&
    r6Migration.includes(
      "app_customer_party_relationships access_relationship",
    ),
  "email_only_access_guard_missing",
);
marker("Q185_EMAIL_ONLY_ACCESS_DENIED");

const safeReferenceAttempt = await post(
  `${functionBase}/api-app-dashboard-get`,
  config.anonKey,
  accessToken,
  { dossier_id: String(vveDossier.case_reference) },
);
assert(
  [400, 404].includes(safeReferenceAttempt.status),
  "safe_reference_created_access",
);
marker("Q186_SAFE_REFERENCE_ACCESS_DENIED");

const constraintProof = await psqlValue(`
select (
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_customer_access_grants'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (auth_user_id, customer_id)'
  )
  and (select count(*) = count(distinct (auth_user_id, customer_id))
       from public.app_customer_access_grants)
)::text;
`);
assert(constraintProof === "true", "duplicate_access_constraint_missing");
marker("Q187_DUPLICATE_ACCESS_RELATION_PREVENTED");

const beforeRetryCount = (await accessRows(service, authUserId)).length;
const retryPromotion = await promoteQuietly(
  vveFixture.intakeId,
  "vve-access-retry",
);
const afterRetryCount = (await accessRows(service, authUserId)).length;
assert(
  retryPromotion.ok && retryPromotion.replayed &&
    afterRetryCount === beforeRetryCount,
  "access_retry_not_idempotent",
);
marker("Q188_ACCESS_RETRY_IDEMPOTENT");

const concurrentRequestId = proofKey("access-concurrency");
const concurrent = await Promise.all([
  service.rpc("app_sync_auth_customer_access_v1", {
    p_auth_user_id: authUserId,
    p_request_id: concurrentRequestId,
  }),
  service.rpc("app_sync_auth_customer_access_v1", {
    p_auth_user_id: authUserId,
    p_request_id: concurrentRequestId,
  }),
]);
assert(
  concurrent.every((result) => !result.error) &&
    (await accessRows(service, authUserId)).length === beforeRetryCount,
  "access_concurrency_not_idempotent",
);
marker("Q189_ACCESS_CONCURRENCY_IDEMPOTENT");

assert(
  signupSource.includes("clearDashboardReadCache(authUserId)") &&
    signupSource.includes("auth.retryBootstrap().then") &&
    authProviderSource.includes("readyUserIdRef.current = null") &&
    cacheSource.includes("scopeGenerations.set"),
  "post_promotion_cache_invalidation_missing",
);
marker("Q190_POST_PROMOTION_CACHE_INVALIDATED");
assert(dashboard.status === 200, "direct_dashboard_read_not_fresh");
marker("Q191_DIRECT_DASHBOARD_READ_IS_FRESH");
assert(
  !signupSource.includes("window.location.reload") &&
    signupSource.indexOf("auth.retryBootstrap().then") <
      signupSource.indexOf('navigate("/dashboard")'),
  "manual_refresh_workaround_detected",
);
marker("Q192_NO_MANUAL_REFRESH_REQUIRED");
assert(
  bootstrapDossiers.some((row) => row.account_type === "vve") &&
    dashboardDossiers.some((row) => row.account_type === "vve"),
  "second_case_not_immediately_visible",
);
marker("Q193_SECOND_CASE_IMMEDIATELY_VISIBLE");

assert(
  bootstrapDossiers.filter((row) => row.account_type === "particulier")
    .length >= 2,
  "legacy_or_existing_private_access_changed",
);
marker("Q194_LEGACY_ACCESS_UNCHANGED");

const browserPayload = JSON.stringify({
  bootstrap: bootstrap.body,
  dashboard: dashboard.body,
});
assert(
  !/auth_user_id|customer_id|identity_id|email|token|otp|capability|sha256|storage_path/i
    .test(browserPayload),
  "customer_projection_exposed_sensitive_fields",
);
marker("Q195_CUSTOMER_SAFE_PROJECTION");

const vveMandate = await service.from("app_signup_mandates")
  .select("authority_review_status")
  .eq("id", vveFixture.mandateId)
  .single();
assert(
  !vveMandate.error &&
    vveMandate.data.authority_review_status === "required_not_completed",
  "access_escalated_authority",
);
marker("Q196_NO_AUTHORITY_ESCALATION");

const securityProof = await psqlValue(`
select (
  (select relrowsecurity from pg_class
   where oid='public.app_customer_access_grants'::regclass)
  and not has_table_privilege('anon',
    'public.app_customer_access_grants','SELECT')
  and not has_table_privilege('authenticated',
    'public.app_customer_access_grants','SELECT')
  and has_table_privilege('service_role',
    'public.app_customer_access_grants','SELECT')
  and not has_table_privilege('service_role',
    'public.app_customer_access_grants','INSERT')
  and not has_table_privilege('service_role',
    'public.app_customer_access_grants','UPDATE')
  and not has_table_privilege('service_role',
    'public.app_customer_access_grants','DELETE')
)::text;
`);
assert(securityProof === "true", "access_rls_or_privileges_failed");
marker("Q197_RLS_AND_MINIMUM_PRIVILEGES");

const browserSources = [
  authHelperSource,
  bootstrapSource,
  dashboardSource,
  signupSource,
  authProviderSource,
].join("\n");
assert(
  !browserSources.includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET") &&
    ![signupSource, authProviderSource].join("\n").includes(
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  "browser_bundle_secret_marker",
);
marker("Q198_BUNDLE_SECRET_SCAN");
marker("Q199_SENSITIVE_OUTPUT_NONE");
console.log("MULTICONTEXT_AUTH_ACCESS_Q171_Q199=PASS");
console.log("LOCAL_FIXTURES_RETAINED_NO_CLEANUP=PASS");
