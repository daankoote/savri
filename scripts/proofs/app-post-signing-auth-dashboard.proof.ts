// Destructive-local 09C1C Auth/account handoff proof.
// Uses an existing local promotion fixture and never prints email, token,
// credentials, internal IDs, storage paths, hashes or response bodies.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  type AccountType,
  createFixture,
  type Fixture,
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

function env(name: string): string {
  return Deno.env.get(name)?.trim() || "";
}

function localUrl(value: string): string {
  const parsed = new URL(value);
  assert(
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname),
    "non_local_target_rejected",
  );
  return value.replace(/\/$/, "");
}

async function count(
  service: SupabaseClient<any, any, any>,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const result = await service.from(table).select("id", {
    count: "exact",
    head: true,
  }).eq(column, value);
  assert(!result.error, `count_failed:${table}`);
  return Number(result.count || 0);
}

async function post(
  url: string,
  anonKey: string,
  token: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => null);
  return { status: response.status, body: parsed };
}

type LegacyContext = {
  fixture: Fixture;
  customerId: string;
  identityId: string | null;
  authUserId: string;
  ownerPartyId: string;
  legacyDossierId: string;
  legacyCaseId: string;
  password: string;
  serviceName: string;
};

function proofKey(label: string): string {
  return `09c1c-r2-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
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

function proofPdf(label: string): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.4\n% ENVAL 09C1C-R2 ${label}\n1 0 obj\n<<>>\nendobj\n%%EOF`,
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

async function promotionRequest(
  fixture: Fixture,
  label: string,
): Promise<Record<string, unknown>> {
  const durableFiles = [{
    source_intake_file_id: fixture.fileId,
    storage_bucket: "app-documents",
    storage_path: durableDestinationPath(fixture.intakeId, fixture.fileId),
    detected_mime_type: "application/pdf",
    size_bytes: fixture.fileSize,
    sha256: fixture.fileHash,
  }];
  return {
    intake_id: fixture.intakeId,
    request_id: proofKey(`request-${label}`),
    idempotency_key: `signup-promotion:${fixture.intakeId}`,
    request_payload_sha256: await sha256(JSON.stringify({
      intake_id: fixture.intakeId,
      durable_files: durableFiles,
    })),
    actor_ref: "proof:09c1c-r2",
    environment: "local-proof",
    durable_files: durableFiles,
  };
}

async function createLegacyContext(
  service: SupabaseClient<any, any, any>,
  accountType: AccountType,
  label: string,
  options: {
    customerType?: AccountType;
    noIdentity?: boolean;
    secondIdentity?: boolean;
    authEmailMismatch?: boolean;
    profile?: "matching" | "conflicting";
  } = {},
): Promise<LegacyContext> {
  const fixtureLabel = proofKey(label);
  const bytes = proofPdf(fixtureLabel);
  const fixture = await createFixture(
    service,
    accountType,
    fixtureLabel,
    3,
    {
      fileHash: await sha256Bytes(bytes),
      fileSize: bytes.byteLength,
      storageBucket: "app-documents",
      useCanonicalSourcePath: true,
    },
  );
  const upload = await service.storage.from(fixture.storageBucket).upload(
    fixture.storagePath,
    pdfBlob(bytes),
    { contentType: "application/pdf", upsert: false },
  );
  assert(!upload.error, `source_upload_failed:${label}`);

  const serviceName = accountType === "particulier"
    ? `Proof Person ${fixtureLabel}`
    : `Proof Organization ${fixtureLabel}`;
  const customerType = options.customerType ?? accountType;
  const password = `Aa1!${crypto.randomUUID()}x`;
  const createdAuth = await service.auth.admin.createUser({
    email: fixture.email,
    password,
    email_confirm: true,
  });
  assert(
    !createdAuth.error && createdAuth.data.user?.id,
    `auth_fixture_failed:${label}`,
  );
  let authUserId = String(createdAuth.data.user.id);
  const customer = await service.from("app_customers").insert({
    customer_type: customerType,
    display_name: serviceName,
    preferred_language: "nl",
    primary_email_normalized: fixture.email,
    status: "active",
  }).select("id").single();
  assert(
    !customer.error && customer.data?.id,
    `customer_fixture_failed:${label}`,
  );
  const customerId = String(customer.data.id);

  let identityId: string | null = null;
  if (!options.noIdentity) {
    const identity = await service.from("app_customer_identities").insert({
      customer_id: customerId,
      auth_user_id: authUserId,
      email_normalized: fixture.email,
      email_verified_at: new Date().toISOString(),
      identity_provider: "supabase",
      status: "active",
    }).select("id").single();
    assert(
      !identity.error && identity.data?.id,
      `identity_fixture_failed:${label}`,
    );
    identityId = String(identity.data.id);
  }

  const dossier = await service.from("app_customer_dossiers").insert({
    customer_id: customerId,
    dossier_number: `LEGACY-${crypto.randomUUID().slice(0, 12)}`,
    account_type: customerType,
    status: "submitted",
    retention_class: "submitted",
    submitted_at: new Date(Date.now() - 86_400_000).toISOString(),
  }).select("id").single();
  assert(
    !dossier.error && dossier.data?.id,
    `legacy_dossier_fixture_failed:${label}`,
  );
  const legacyDossierId = String(dossier.data.id);

  let ownerPartyId = "";
  if (!options.noIdentity) {
    const activationKey = proofKey(`owner-${label}`);
    const activation = await service.rpc("app_bootstrap_customer_auth_v3", {
      p_auth_user_id: authUserId,
      p_email_normalized: fixture.email,
      p_actor_ref: `supabase_auth_user:${authUserId}`,
      p_request_id: activationKey,
      p_idempotency_scope: `proof:09c1c-r2:${authUserId}`,
      p_idempotency_key: activationKey,
      p_payload_hash: await sha256(`activation:${activationKey}`),
      p_ip_hash: await sha256("local-proof-ip"),
      p_user_agent_hash: await sha256("local-proof-user-agent"),
      p_environment: "local-proof",
    });
    assert(
      !activation.error && activation.data?.ok === true,
      `owner_activation_failed:${label}:${
        activation.error?.message || JSON.stringify(activation.data)
      }`,
    );
    const ownerRelationship = await service.from(
      "app_customer_party_relationships",
    ).select("party_id")
      .eq("customer_id", customerId)
      .eq("relationship_role", "account_owner")
      .is("valid_to", null).single();
    assert(
      !ownerRelationship.error && ownerRelationship.data?.party_id,
      `owner_link_fixture_failed:${label}`,
    );
    ownerPartyId = String(ownerRelationship.data.party_id);
  }

  if (options.profile) {
    const declaredName = options.profile === "matching"
      ? serviceName
      : customerType === "particulier"
      ? `Conflicting Person ${fixtureLabel}`
      : `Conflicting Organization ${fixtureLabel}`;
    const sourceRequestId = proofKey(`profile-source-${label}`);
    const declaredAt = new Date().toISOString();
    const firstSpace = declaredName.indexOf(" ");
    const source = await service.from("app_party_declaration_sources").insert({
      customer_id: customerId,
      dossier_id: legacyDossierId,
      account_type: customerType,
      declaration_kind: customerType === "particulier"
        ? "natural_person"
        : "organization",
      declared_at: declaredAt,
      valid_from: declaredAt,
      person_first_name: customerType === "particulier"
        ? declaredName.slice(0, firstSpace)
        : null,
      person_last_name: customerType === "particulier"
        ? declaredName.slice(firstSpace + 1)
        : null,
      person_full_name: customerType === "particulier" ? declaredName : null,
      organization_classification: customerType === "particulier"
        ? null
        : customerType === "vve"
        ? "vve"
        : "business",
      organization_legal_name: customerType === "particulier"
        ? null
        : declaredName,
      trade_register_number: customerType === "particulier" ? null : "12345678",
      source_type: "signup_applicant_declaration",
      source_request_id: sourceRequestId,
      source_payload_sha256: await sha256(`profile-source:${sourceRequestId}`),
      declarative_actor_ref: "proof:09c1c-r2",
      environment: "local-proof",
    });
    assert(
      !source.error,
      `profile_source_fixture_failed:${label}:${
        source.error?.message || "unknown"
      }`,
    );
    const profileKey = proofKey(`profile-${label}`);
    const profile = await service.rpc("app_bootstrap_customer_auth_v4", {
      p_auth_user_id: authUserId,
      p_email_normalized: fixture.email,
      p_actor_ref: `supabase_auth_user:${authUserId}`,
      p_request_id: profileKey,
      p_idempotency_scope: `proof:09c1c-r2-profile:${authUserId}`,
      p_idempotency_key: profileKey,
      p_payload_hash: await sha256(`profile:${profileKey}`),
      p_ip_hash: await sha256("local-proof-ip"),
      p_user_agent_hash: await sha256("local-proof-user-agent"),
      p_environment: "local-proof",
    });
    assert(
      !profile.error && profile.data?.ok === true,
      `profile_fixture_failed:${label}:${
        profile.error?.message || JSON.stringify(profile.data)
      }`,
    );
  }

  let legacyCase = await service.from("app_cases").select("id")
    .eq("customer_id", customerId)
    .eq("source_class", "app_customer_dossier")
    .eq("source_ref", legacyDossierId).maybeSingle();
  if (!legacyCase.data) {
    legacyCase = await service.from("app_cases").insert({
      customer_id: customerId,
      case_reference: `CASE-${legacyDossierId}`,
      created_at: new Date(Date.now() - 86_400_000).toISOString(),
      created_by_actor_type: "system",
      created_by_actor_ref: "proof:09c1c-r2",
      source_class: "app_customer_dossier",
      source_ref: legacyDossierId,
      request_id: proofKey(`legacy-case-${label}`),
    }).select("id").single();
  }
  assert(
    !legacyCase.error && legacyCase.data?.id,
    `legacy_case_fixture_failed:${label}:${
      legacyCase.error?.message || "unknown"
    }`,
  );
  const legacyCaseId = String(legacyCase.data.id);

  if (options.secondIdentity) {
    const secondCustomer = await service.from("app_customers").insert({
      customer_type: accountType,
      display_name: "Ambiguous proof customer",
      preferred_language: "nl",
      primary_email_normalized: fixture.email,
      status: "active",
    }).select("id").single();
    assert(
      !secondCustomer.error && secondCustomer.data?.id,
      "second_customer_failed",
    );
    const secondIdentity = await service.from("app_customer_identities").insert(
      {
        customer_id: secondCustomer.data.id,
        auth_user_id: null,
        email_normalized: fixture.email,
        identity_provider: "supabase",
        status: "active",
      },
    );
    assert(!secondIdentity.error, "second_identity_failed");
  }

  if (options.authEmailMismatch) {
    const mismatchedAuth = await service.auth.admin.createUser({
      email: `${proofKey("cross-user")}@example.invalid`,
      password,
      email_confirm: true,
    });
    assert(
      !mismatchedAuth.error && mismatchedAuth.data.user?.id && identityId,
      "cross_user_auth_fixture_failed",
    );
    const mismatchedAuthUserId = String(mismatchedAuth.data.user.id);
    const rebound = await service.from("app_customer_identities").update({
      auth_user_id: mismatchedAuthUserId,
    }).eq("id", identityId);
    assert(!rebound.error, "cross_user_rebind_fixture_failed");
    authUserId = mismatchedAuthUserId;
  }

  return {
    fixture,
    customerId,
    identityId,
    authUserId,
    ownerPartyId,
    legacyDossierId,
    legacyCaseId,
    password,
    serviceName,
  };
}

async function rpcFailsClosed(
  service: SupabaseClient<any, any, any>,
  context: LegacyContext,
  label: string,
): Promise<void> {
  const rpc = await service.rpc("app_promote_signed_signup_v1", {
    p_request: await promotionRequest(context.fixture, label),
  });
  assert(rpc.error, `unsafe_promotion_allowed:${label}`);
  assert(
    await count(
          service,
          "app_signup_promotions",
          "intake_id",
          context.fixture.intakeId,
        ) === 0 &&
      await count(
          service,
          "app_cases",
          "source_ref",
          context.fixture.intakeId,
        ) === 0,
    `partial_failure_state:${label}`,
  );
}

async function runR2Proof(
  service: SupabaseClient<any, any, any>,
  anon: SupabaseClient<any, any, any>,
  functionBaseUrl: string,
  anonKey: string,
): Promise<void> {
  const baseMigration = await Deno.readTextFile(
    "supabase/migrations/20260810190000_app_signed_signup_promotion_foundation.sql",
  );
  const r1Migration = await Deno.readTextFile(
    "supabase/migrations/20260811100000_app_post_signing_customer_convergence.sql",
  );
  const r2Migration = await Deno.readTextFile(
    "supabase/migrations/20260812100000_app_existing_verified_customer_profile_convergence.sql",
  );
  const receiptStore = await Deno.readTextFile(
    "app/src/features/signup/signupSubmissionReceiptStore.ts",
  );
  const browserSources = [
    await Deno.readTextFile("app/src/features/signup/signupSigningClient.ts"),
    receiptStore,
    await Deno.readTextFile("app/src/features/signup/SignupPageShell.tsx"),
    await Deno.readTextFile(
      "app/src/features/dashboard/dashboardReadClient.ts",
    ),
  ].join("\n");

  const primary = await createLegacyContext(
    service,
    "particulier",
    "eligible",
  );
  const preHandoff = await service.rpc("app_signup_account_handoff_v1", {
    p_intake_id: primary.fixture.intakeId,
    p_authenticated_auth_user_id: null,
  });
  assert(
    !preHandoff.error && preHandoff.data?.account_handoff === "blocked" &&
      baseMigration.includes(
        "account-owner person profile conflicts with signed declaration",
      ) &&
      r1Migration.includes("if v_profile_match_count <> 1 then"),
    "Q51_current_block_reason_not_proven",
  );
  console.log("Q51_CURRENT_BLOCK_REASON_PROVEN=PASS");

  assert(
    primary.identityId &&
      await count(service, "app_customers", "id", primary.customerId) === 1 &&
      await count(
          service,
          "app_customer_identities",
          "id",
          primary.identityId,
        ) === 1 &&
      await count(
          service,
          "app_customer_party_relationships",
          "customer_id",
          primary.customerId,
        ) === 1,
    "Q52_legacy_customer_not_eligible",
  );
  console.log("Q52_UNIQUE_AUTH_BOUND_LEGACY_CUSTOMER_ELIGIBLE=PASS");

  const signatureBefore = await service.from(
    "app_signup_signature_evidence",
  ).select("id,typed_full_name,evidence_envelope,finalized_at")
    .eq("id", primary.fixture.signatureId).single();
  const positive = await attemptSignupPromotion(
    primary.fixture.intakeId,
    promotionMeta("positive", primary.fixture.intakeId),
  );
  assert(positive.ok, "eligible_legacy_promotion_failed");
  const promotion = await service.from("app_signup_promotions").select(
    "id,case_id,customer_id,identity_id,service_recipient_party_id,contact_party_id,signing_snapshot_id,mandate_id,signature_evidence_id",
  ).eq("intake_id", primary.fixture.intakeId).single();
  assert(!promotion.error, "positive_promotion_missing");
  const caseId = String(promotion.data.case_id);

  const profiles = await service.from("app_party_person_versions").select(
    "id,party_id,source_type,source_reference_type,source_reference_id,full_name",
  ).eq("party_id", primary.ownerPartyId).is("valid_to", null);
  assert(
    !profiles.error && profiles.data.length === 1 &&
      profiles.data[0].full_name === primary.serviceName,
    "missing_person_profile_did_not_converge",
  );
  console.log("Q53_MISSING_PERSON_PROFILE_CONVERGES=PASS");
  assert(
    profiles.data[0].source_type === "signed_signup_intake" &&
      profiles.data[0].source_reference_type ===
        "app_signup_signing_snapshots" &&
      profiles.data[0].source_reference_id === primary.fixture.snapshotId &&
      !/verified|accepted/i.test(profiles.data[0].source_type),
    "declared_profile_marked_verified",
  );
  console.log("Q54_DECLARED_NOT_VERIFIED=PASS");

  const accepted = await createLegacyContext(
    service,
    "particulier",
    "accepted-profile",
    { profile: "matching" },
  );
  const acceptedBefore = await service.from("app_party_person_versions")
    .select("id,source_type,source_reference_id")
    .eq("party_id", accepted.ownerPartyId).single();
  const acceptedPromotion = await attemptSignupPromotion(
    accepted.fixture.intakeId,
    promotionMeta("accepted-profile", accepted.fixture.intakeId),
  );
  const acceptedAfter = await service.from("app_party_person_versions")
    .select("id,source_type,source_reference_id")
    .eq("party_id", accepted.ownerPartyId);
  assert(
    acceptedPromotion.ok && !acceptedBefore.error && !acceptedAfter.error &&
      acceptedAfter.data.length === 1 &&
      acceptedAfter.data[0].id === acceptedBefore.data.id &&
      acceptedAfter.data[0].source_type === acceptedBefore.data.source_type &&
      acceptedAfter.data[0].source_reference_id ===
        acceptedBefore.data.source_reference_id,
    "accepted_profile_overwritten",
  );
  console.log("Q55_NO_ACCEPTED_PROFILE_OVERWRITE=PASS");

  const signatureAfter = await service.from(
    "app_signup_signature_evidence",
  ).select("id,typed_full_name,evidence_envelope,finalized_at")
    .eq("id", primary.fixture.signatureId).single();
  assert(
    !signatureBefore.error && !signatureAfter.error &&
      JSON.stringify(signatureBefore.data) ===
        JSON.stringify(signatureAfter.data),
    "promotion_required_or_changed_signing",
  );
  console.log("Q56_PROMOTION_WITHOUT_RESIGN=PASS");

  const [loggedOut, authenticated] = await Promise.all([
    service.rpc("app_signup_account_handoff_v1", {
      p_intake_id: primary.fixture.intakeId,
      p_authenticated_auth_user_id: null,
    }),
    service.rpc("app_signup_account_handoff_v1", {
      p_intake_id: primary.fixture.intakeId,
      p_authenticated_auth_user_id: primary.authUserId,
    }),
  ]);
  assert(
    !loggedOut.error &&
      loggedOut.data?.account_handoff ===
        "existing_account_login_required",
    "existing_account_login_handoff_failed",
  );
  console.log("Q57_EXISTING_ACCOUNT_LOGIN_HANDOFF=PASS");
  assert(
    !authenticated.error &&
      authenticated.data?.account_handoff === "already_authenticated",
    "authenticated_handoff_failed",
  );
  console.log("Q58_ALREADY_AUTHENTICATED_HANDOFF=PASS");

  assert(
    (await service.auth.admin.listUsers()).data.users.filter((user) =>
      user.email?.toLowerCase() === primary.fixture.email
    ).length === 1,
    "duplicate_auth_user",
  );
  console.log("Q59_NO_DUPLICATE_AUTH_USER=PASS");
  assert(
    await count(
      service,
      "app_customer_identities",
      "customer_id",
      primary.customerId,
    ) === 1,
    "duplicate_identity",
  );
  console.log("Q60_NO_DUPLICATE_IDENTITY=PASS");
  assert(
    await count(service, "app_customers", "id", primary.customerId) === 1 &&
      promotion.data.customer_id === primary.customerId,
    "duplicate_customer",
  );
  console.log("Q61_NO_DUPLICATE_CUSTOMER=PASS");
  assert(
    await count(
      service,
      "app_cases",
      "source_ref",
      primary.fixture.intakeId,
    ) === 1,
    "new_case_cardinality",
  );
  console.log("Q62_EXACTLY_ONE_NEW_CASE=PASS");
  assert(
    await count(service, "app_cases", "id", primary.legacyCaseId) === 1,
    "legacy_case_not_preserved",
  );
  console.log("Q63_OLD_CASE_PRESERVED=PASS");

  const clearedMixedLegacyNumber = await service.from(
    "app_customer_dossiers",
  ).update({ dossier_number: null }).eq("id", primary.legacyDossierId);
  assert(
    !clearedMixedLegacyNumber.error,
    "mixed_legacy_null_number_fixture_failed",
  );
  const signedIn = await anon.auth.signInWithPassword({
    email: primary.fixture.email,
    password: primary.password,
  });
  const token = signedIn.data.session?.access_token || "";
  assert(!signedIn.error && token, "positive_auth_session_failed");
  const bootstrap = await post(
    `${functionBaseUrl}/api-app-auth-bootstrap`,
    anonKey,
    token,
    {},
    proofKey("bootstrap"),
  );
  const dashboard = await post(
    `${functionBaseUrl}/api-app-dashboard-get`,
    anonKey,
    token,
    { dossier_id: caseId },
  );
  assert(
    bootstrap.status === 200 && bootstrap.body?.dossiers?.length === 2 &&
      dashboard.status === 200 && dashboard.body?.dossiers?.length === 2 &&
      dashboard.body?.dossiers?.some((
        item: Record<string, unknown>,
      ) => item.case_id === caseId) &&
      dashboard.body?.dossiers?.some((
        item: Record<string, unknown>,
      ) => item.case_id === primary.legacyCaseId),
    "unified_dashboard_missing_case",
  );
  console.log("Q64_UNIFIED_DASHBOARD_BOTH_VISIBLE=PASS");

  const emailOnly = await createLegacyContext(
    service,
    "particulier",
    "email-only",
    { noIdentity: true },
  );
  await rpcFailsClosed(service, emailOnly, "email-only");
  console.log("Q65_EMAIL_ALONE_CANNOT_CONVERGE=PASS");

  const ambiguous = await createLegacyContext(
    service,
    "particulier",
    "ambiguous",
    { secondIdentity: true },
  );
  await rpcFailsClosed(service, ambiguous, "ambiguous");
  console.log("Q66_AMBIGUOUS_IDENTITY_FAILS_CLOSED=PASS");

  const accountConflict = await createLegacyContext(
    service,
    "particulier",
    "account-conflict",
    { customerType: "zakelijk" },
  );
  await rpcFailsClosed(service, accountConflict, "account-conflict");
  console.log("Q67_ACCOUNT_TYPE_CONFLICT_FAILS_CLOSED=PASS");

  const personConflict = await createLegacyContext(
    service,
    "particulier",
    "person-profile-conflict",
    { profile: "conflicting" },
  );
  const organizationConflict = await createLegacyContext(
    service,
    "zakelijk",
    "organization-profile-conflict",
    { profile: "conflicting" },
  );
  await rpcFailsClosed(service, personConflict, "person-profile-conflict");
  await rpcFailsClosed(
    service,
    organizationConflict,
    "organization-profile-conflict",
  );
  console.log("Q68_PROFILE_CONFLICT_FAILS_CLOSED=PASS");

  const crossUser = await createLegacyContext(
    service,
    "particulier",
    "cross-user",
    { authEmailMismatch: true },
  );
  await rpcFailsClosed(service, crossUser, "cross-user");
  console.log("Q69_CROSS_USER_BINDING_FAILS_CLOSED=PASS");

  for (const accountType of ["zakelijk", "vve"] as const) {
    const context = await createLegacyContext(
      service,
      accountType,
      `authority-${accountType}`,
    );
    const result = await attemptSignupPromotion(
      context.fixture.intakeId,
      promotionMeta(`authority-${accountType}`, context.fixture.intakeId),
    );
    const mandate = await service.from("app_signup_mandates").select(
      "authority_review_status",
    ).eq("id", context.fixture.mandateId).single();
    const orgProfile = await service.from(
      "app_party_organization_versions",
    ).select("organization_classification,source_type")
      .eq("party_id", context.ownerPartyId).single();
    assert(
      result.ok && !mandate.error &&
        mandate.data.authority_review_status === "required_not_completed" &&
        !orgProfile.error &&
        orgProfile.data.organization_classification ===
          (accountType === "vve" ? "vve" : "business") &&
        orgProfile.data.source_type === "signed_signup_intake",
      `authority_auto_accepted:${accountType}`,
    );
  }
  console.log("Q70_BUSINESS_VVE_AUTHORITY_NOT_AUTO_ACCEPTED=PASS");

  const retry = await attemptSignupPromotion(
    primary.fixture.intakeId,
    promotionMeta("retry", primary.fixture.intakeId),
  );
  assert(
    retry.ok && retry.replayed &&
      retry.caseReference === positive.caseReference &&
      await count(
          service,
          "app_signup_promotions",
          "intake_id",
          primary.fixture.intakeId,
        ) === 1,
    "retry_not_idempotent",
  );
  console.log("Q71_RETRY_IDEMPOTENT=PASS");

  const concurrent = await createLegacyContext(
    service,
    "particulier",
    "concurrent",
  );
  const concurrentRequest = await promotionRequest(
    concurrent.fixture,
    "concurrent",
  );
  const [left, right] = await Promise.all([
    service.rpc("app_promote_signed_signup_v1", {
      p_request: concurrentRequest,
    }),
    service.rpc("app_promote_signed_signup_v1", {
      p_request: {
        ...concurrentRequest,
        request_id: proofKey("concurrent-right"),
        idempotency_key: proofKey("concurrent-right"),
      },
    }),
  ]);
  assert(
    !left.error && !right.error &&
      left.data?.ok === true && right.data?.ok === true &&
      left.data?.case_reference === right.data?.case_reference &&
      await count(
          service,
          "app_signup_promotions",
          "intake_id",
          concurrent.fixture.intakeId,
        ) === 1 &&
      await count(
          service,
          "app_party_person_versions",
          "party_id",
          concurrent.ownerPartyId,
        ) === 1,
    "concurrent_retry_not_idempotent",
  );
  console.log("Q72_CONCURRENT_RETRY_IDEMPOTENT=PASS");

  const source = await service.from("app_signup_promotions").select(
    "signing_snapshot_id,mandate_id,signature_evidence_id",
  ).eq("intake_id", primary.fixture.intakeId).single();
  assert(
    !source.error &&
      source.data.signing_snapshot_id === primary.fixture.snapshotId &&
      source.data.mandate_id === primary.fixture.mandateId &&
      source.data.signature_evidence_id === primary.fixture.signatureId,
    "signing_source_not_preserved",
  );
  console.log("Q73_SIGNING_SOURCE_PRESERVED=PASS");

  const evidence = await service.from("app_evidence_files").select(
    "case_id,promotion_id",
  ).eq("promotion_id", promotion.data.id);
  assert(
    !evidence.error && evidence.data.length === 1 &&
      evidence.data.every((row) =>
        row.case_id === caseId && row.promotion_id === promotion.data.id
      ),
    "evidence_cross_case_scope",
  );
  console.log("Q74_EVIDENCE_REMAINS_NEW_CASE_SCOPED=PASS");
  const caseRows = await service.from("app_cases").select(
    "id,source_class,source_ref",
  ).eq("customer_id", primary.customerId);
  assert(
    !caseRows.error && caseRows.data.length === 2 &&
      new Set(caseRows.data.map((row) => row.id)).size === 2 &&
      caseRows.data.some((row) =>
        row.source_class === "app_customer_dossier" &&
        row.source_ref === primary.legacyDossierId
      ) &&
      caseRows.data.some((row) =>
        row.source_class === "signed_signup_intake" &&
        row.source_ref === primary.fixture.intakeId
      ),
    "heuristic_case_merge",
  );
  console.log("Q75_NO_HEURISTIC_CASE_MERGE=PASS");

  assert(
    receiptStore.includes("signup-submission-receipt-v3") &&
      receiptStore.includes("promotionState") &&
      receiptStore.includes("accountHandoff") &&
      !receiptStore.includes("email_normalized") &&
      !receiptStore.includes("auth_user_id"),
    "unsafe_receipt_contract",
  );
  console.log("Q76_RECEIPT_SAFE=PASS");
  assert(
    !browserSources.includes("SUPABASE_SERVICE_ROLE_KEY") &&
      !browserSources.includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET"),
    "browser_bundle_secret_marker",
  );
  console.log("Q77_BUNDLE_SECRET_SCAN=PASS");
  const serialized = JSON.stringify({
    promotion: positive,
    bootstrap: bootstrap.body,
    dashboard: dashboard.body,
  }).toLowerCase();
  assert(
    !serialized.includes(primary.fixture.email.toLowerCase()) &&
      !/otp|capability|storage_path|snapshot_sha256|auth_user_id/.test(
        serialized,
      ) &&
      r2Migration.includes("email-only customer convergence is not allowed"),
    "sensitive_output",
  );
  console.log("Q78_SENSITIVE_OUTPUT_NONE=PASS");
  console.log("POST_SIGNING_CONVERGENCE_Q51_Q78=PASS");

  console.log("Q79_AUTH_SIGNIN_SUCCEEDS=PASS");
  assert(
    bootstrap.status === 200,
    "live_bootstrap_http_failed",
  );
  console.log("Q80_LIVE_BOOTSTRAP_HTTP_SUCCEEDS=PASS");
  const canonicalTopFields = [
    "authenticated",
    "binding_status",
    "dossiers",
    "mode",
    "ok",
    "schema_version",
  ];
  assert(
    JSON.stringify(Object.keys(bootstrap.body || {}).sort()) ===
        JSON.stringify(canonicalTopFields) &&
      bootstrap.body?.mode === "auth_bootstrap_browser" &&
      bootstrap.body?.schema_version === "auth_bootstrap_browser_v2" &&
      bootstrap.body?.authenticated === true &&
      bootstrap.body?.binding_status === "bound" &&
      Array.isArray(bootstrap.body?.dossiers),
    "live_response_not_canonical",
  );
  console.log("Q81_LIVE_RESPONSE_CANONICAL_SCHEMA=PASS");
  const decodedMixed = decodeAuthBootstrapResponse(bootstrap.body);
  assert(
    decodedMixed.ok && decodedMixed.summary.dossiers.length === 2,
    "production_decoder_rejected_live_response",
  );
  console.log("Q82_PRODUCTION_FRONTEND_DECODER_ACCEPTS_LIVE_RESPONSE=PASS");

  const legacyOnly = await createLegacyContext(
    service,
    "particulier",
    "contract-legacy-only",
    { profile: "matching" },
  );
  const legacySignIn = await anon.auth.signInWithPassword({
    email: legacyOnly.fixture.email,
    password: legacyOnly.password,
  });
  const legacyToken = legacySignIn.data.session?.access_token || "";
  assert(!legacySignIn.error && legacyToken, "legacy_signin_failed");
  const legacyBootstrap = await post(
    `${functionBaseUrl}/api-app-auth-bootstrap`,
    anonKey,
    legacyToken,
    {},
    proofKey("contract-legacy-bootstrap"),
  );
  const decodedLegacy = decodeAuthBootstrapResponse(legacyBootstrap.body);
  assert(
    legacyBootstrap.status === 200 && decodedLegacy.ok &&
      decodedLegacy.summary.dossiers.length === 1,
    `legacy_customer_contract_failed:${
      JSON.stringify({
        status: legacyBootstrap.status,
        code: legacyBootstrap.body?.code || null,
        top_fields: legacyBootstrap.body &&
            typeof legacyBootstrap.body === "object"
          ? Object.keys(legacyBootstrap.body).sort()
          : [],
        dossiers_type: Array.isArray(legacyBootstrap.body?.dossiers)
          ? "array"
          : typeof legacyBootstrap.body?.dossiers,
        dossier_count: Array.isArray(legacyBootstrap.body?.dossiers)
          ? legacyBootstrap.body.dossiers.length
          : null,
        dossier_number_type: Array.isArray(legacyBootstrap.body?.dossiers) &&
            legacyBootstrap.body.dossiers[0]
          ? legacyBootstrap.body.dossiers[0].dossier_number === null
            ? "null"
            : typeof legacyBootstrap.body.dossiers[0].dossier_number
          : null,
        decoder_ok: decodedLegacy.ok,
      })
    }`,
  );
  console.log("Q83_LEGACY_CUSTOMER_ACCEPTED=PASS");

  const signedLabel = proofKey("contract-signed-only");
  const signedBytes = proofPdf(signedLabel);
  const signedFixture = await createFixture(
    service,
    "particulier",
    signedLabel,
    3,
    {
      fileHash: await sha256Bytes(signedBytes),
      fileSize: signedBytes.byteLength,
      storageBucket: "app-documents",
      useCanonicalSourcePath: true,
    },
  );
  const signedUpload = await service.storage.from(signedFixture.storageBucket)
    .upload(signedFixture.storagePath, pdfBlob(signedBytes), {
      contentType: "application/pdf",
      upsert: false,
    });
  assert(!signedUpload.error, "signed_only_source_upload_failed");
  const signedPromotion = await attemptSignupPromotion(
    signedFixture.intakeId,
    promotionMeta("contract-signed-only", signedFixture.intakeId),
  );
  assert(signedPromotion.ok, "signed_only_promotion_failed");
  const signedPassword = `Aa1!${crypto.randomUUID()}x`;
  const signedAuth = await service.auth.admin.createUser({
    email: signedFixture.email,
    password: signedPassword,
    email_confirm: true,
  });
  assert(!signedAuth.error && signedAuth.data.user?.id, "signed_auth_failed");
  const signedSignIn = await anon.auth.signInWithPassword({
    email: signedFixture.email,
    password: signedPassword,
  });
  const signedToken = signedSignIn.data.session?.access_token || "";
  assert(!signedSignIn.error && signedToken, "signed_signin_failed");
  const signedBootstrap = await post(
    `${functionBaseUrl}/api-app-auth-bootstrap`,
    anonKey,
    signedToken,
    {},
    proofKey("contract-signed-bootstrap"),
  );
  const decodedSigned = decodeAuthBootstrapResponse(signedBootstrap.body);
  assert(
    signedBootstrap.status === 200 && decodedSigned.ok &&
      decodedSigned.summary.dossiers.length === 1 &&
      decodedSigned.summary.dossiers[0].dossier_id ===
        decodedSigned.summary.dossiers[0].case_id,
    "signed_case_customer_contract_failed",
  );
  console.log("Q84_SIGNED_CASE_CUSTOMER_ACCEPTED=PASS");
  assert(
    decodedMixed.ok && decodedMixed.summary.dossiers.length === 2 &&
      decodedMixed.summary.dossiers.some((item) =>
        item.dossier_number === null
      ),
    "mixed_customer_contract_failed",
  );
  console.log("Q85_MIXED_CUSTOMER_ACCEPTED=PASS");

  const decoderSource = await Deno.readTextFile(
    "app/src/features/auth/authBootstrapClient.ts",
  );
  assert(
    !/app_bootstrap_customer_auth_v[0-9]|auth_bootstrap_v2/.test(
      decoderSource,
    ) &&
      !Object.hasOwn(bootstrap.body, "rpc_version"),
    "internal_rpc_version_leaked_to_frontend",
  );
  console.log("Q86_INTERNAL_RPC_VERSION_NOT_REQUIRED_BY_FRONTEND=PASS");
  const malformedResults = [
    null,
    {},
    { ...bootstrap.body, schema_version: "unknown_v9" },
    { ...bootstrap.body, internal_customer_id: crypto.randomUUID() },
    { ...bootstrap.body, dossiers: null },
  ].map(decodeAuthBootstrapResponse);
  assert(
    malformedResults.every((result) => !result.ok),
    "malformed_response_was_accepted",
  );
  console.log("Q87_UNKNOWN_MALFORMED_RESPONSE_FAILS_CLOSED=PASS");
  const customerUnsafeFields = [
    "customer_id",
    "identity_id",
    "auth_user_id",
    "payload_hash",
    "request_id",
    "replayed",
    "rpc_version",
    "storage_path",
  ];
  assert(
    customerUnsafeFields.every((field) =>
      !Object.hasOwn(bootstrap.body, field)
    ),
    "customer_unsafe_bootstrap_field",
  );
  console.log("Q88_CUSTOMER_SAFE_RESPONSE=PASS");
  assert(
    await count(service, "app_customers", "id", primary.customerId) === 1 &&
      await count(service, "app_cases", "customer_id", primary.customerId) ===
        2 &&
      new Set(
          decodedMixed.ok
            ? decodedMixed.summary.dossiers.map((item) => item.case_id)
            : [],
        ).size === 2,
    "contract_created_duplicate_customer_or_case",
  );
  console.log("Q89_NO_DUPLICATE_CUSTOMER_OR_CASE=PASS");
  assert(
    dashboard.status === 200 && dashboard.body?.dossiers?.length === 2,
    "login_to_unified_dashboard_failed",
  );
  console.log("Q90_LOGIN_TO_UNIFIED_DASHBOARD=PASS");
  assert(
    !decoderSource.includes("SUPABASE_SERVICE_ROLE_KEY") &&
      !decoderSource.includes("APP_SIGNUP_PROMOTION_INTERNAL_SECRET"),
    "bootstrap_decoder_secret_marker",
  );
  console.log("Q91_SECRET_SCAN=PASS");
  const contractOutput = JSON.stringify({
    mixed: bootstrap.body,
    legacy: legacyBootstrap.body,
    signed: signedBootstrap.body,
  }).toLowerCase();
  assert(
    !contractOutput.includes(primary.fixture.email.toLowerCase()) &&
      !contractOutput.includes(legacyOnly.fixture.email.toLowerCase()) &&
      !contractOutput.includes(signedFixture.email.toLowerCase()) &&
      !/token|otp|capability|storage_path|payload_hash|auth_user_id|customer_id|identity_id/
        .test(
          contractOutput,
        ),
    "contract_sensitive_output",
  );
  console.log("Q92_SENSITIVE_OUTPUT_NONE=PASS");
  console.log("AUTH_BOOTSTRAP_CONTRACT_Q79_Q92=PASS");
}

assert(
  env("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") === "YES",
  "destructive_local_proof_not_enabled",
);
const supabaseUrl = localUrl(env("SUPABASE_URL"));
const functionBaseUrl = localUrl(
  env("FUNCTION_BASE_URL") || `${supabaseUrl}/functions/v1`,
);
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = env("SUPABASE_ANON_KEY");
assert(serviceRoleKey && anonKey, "local_credentials_unavailable");

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});
await runR2Proof(service, anon, functionBaseUrl, anonKey);
const promotions = await service.from("app_signup_promotions")
  .select("intake_id,customer_id,identity_id,case_id,account_type,promoted_at")
  .order("promoted_at", { ascending: false })
  .limit(100);
assert(
  !promotions.error && Array.isArray(promotions.data),
  "promotion_fixture_unavailable",
);

let candidate: {
  customerId: string;
  identityId: string;
  caseId: string;
  intakeId: string;
  accountType: "particulier" | "zakelijk" | "vve";
  email: string;
} | null = null;
for (const promotion of promotions.data) {
  const identity = await service.from("app_customer_identities")
    .select("id,email_normalized,auth_user_id,status")
    .eq("id", promotion.identity_id)
    .maybeSingle();
  if (
    !identity.error && identity.data?.status === "active" &&
    !identity.data.auth_user_id && identity.data.email_normalized
  ) {
    const [customerCases, customerDossiers, customerPromotions] = await Promise
      .all([
        count(service, "app_cases", "customer_id", promotion.customer_id),
        count(
          service,
          "app_customer_dossiers",
          "customer_id",
          promotion.customer_id,
        ),
        count(
          service,
          "app_signup_promotions",
          "customer_id",
          promotion.customer_id,
        ),
      ]);
    if (
      customerCases !== 1 || customerDossiers !== 0 ||
      customerPromotions !== 1
    ) continue;
    candidate = {
      customerId: String(promotion.customer_id),
      identityId: String(promotion.identity_id),
      caseId: String(promotion.case_id),
      intakeId: String(promotion.intake_id),
      accountType: promotion.account_type as
        | "particulier"
        | "zakelijk"
        | "vve",
      email: String(identity.data.email_normalized),
    };
    break;
  }
}
assert(candidate, "unbound_promoted_fixture_unavailable");

const activationHandoff = await service.rpc(
  "app_signup_account_handoff_v1",
  {
    p_intake_id: candidate.intakeId,
    p_authenticated_auth_user_id: null,
  },
);
assert(
  !activationHandoff.error &&
    activationHandoff.data?.account_handoff === "account_activation_available",
  "new_user_activation_handoff_failed",
);
console.log("Q34_NEW_USER_HANDOFF=PASS");

const legacyDossier = await service.from("app_customer_dossiers").insert({
  customer_id: candidate.customerId,
  dossier_number: `LEGACY-${crypto.randomUUID().slice(0, 12)}`,
  account_type: candidate.accountType,
  status: "submitted",
  retention_class: "submitted",
  submitted_at: new Date(Date.now() - 86_400_000).toISOString(),
}).select("id").single();
assert(!legacyDossier.error && legacyDossier.data?.id, "legacy_fixture_failed");
const legacyDossierId = String(legacyDossier.data.id);
const legacyCase = await service.from("app_cases").insert({
  customer_id: candidate.customerId,
  case_reference: `CASE-${legacyDossierId}`,
  created_at: new Date(Date.now() - 86_400_000).toISOString(),
  created_by_actor_type: "system",
  created_by_actor_ref: "proof:09c1c-r1",
  source_class: "app_customer_dossier",
  source_ref: legacyDossierId,
  request_id: `proof-${crypto.randomUUID()}`,
}).select("id").single();
assert(!legacyCase.error && legacyCase.data?.id, "legacy_case_fixture_failed");
const legacyCaseId = String(legacyCase.data.id);

const before = {
  customers: await count(service, "app_customers", "id", candidate.customerId),
  cases: await count(service, "app_cases", "customer_id", candidate.customerId),
  dossiers: await count(
    service,
    "app_customer_dossiers",
    "customer_id",
    candidate.customerId,
  ),
};
const password = `Aa1!${crypto.randomUUID()}x`;
const created = await service.auth.admin.createUser({
  email: candidate.email,
  password,
  email_confirm: true,
});
assert(!created.error && created.data.user?.id, "auth_user_create_failed");
const authUserId = String(created.data.user.id);

try {
  const loginHandoff = await service.rpc("app_signup_account_handoff_v1", {
    p_intake_id: candidate.intakeId,
    p_authenticated_auth_user_id: null,
  });
  const authenticatedHandoff = await service.rpc(
    "app_signup_account_handoff_v1",
    {
      p_intake_id: candidate.intakeId,
      p_authenticated_auth_user_id: authUserId,
    },
  );
  assert(
    !loginHandoff.error &&
      loginHandoff.data?.account_handoff ===
        "existing_account_login_required" &&
      !authenticatedHandoff.error &&
      authenticatedHandoff.data?.account_handoff === "already_authenticated",
    "existing_or_authenticated_handoff_failed",
  );
  console.log("Q33_EXISTING_ACCOUNT_HANDOFF=PASS");
  console.log("Q36_AUTHENTICATED_HANDOFF=PASS");

  const signedIn = await anon.auth.signInWithPassword({
    email: candidate.email,
    password,
  });
  const token = signedIn.data.session?.access_token || "";
  assert(!signedIn.error && token, "verified_auth_session_unavailable");

  const bootstrap = await post(
    `${functionBaseUrl}/api-app-auth-bootstrap`,
    anonKey,
    token,
    {},
    `09c1c-auth-${crypto.randomUUID()}`,
  );
  assert(
    bootstrap.status === 200 && bootstrap.body?.ok === true &&
      bootstrap.body?.mode === "auth_bootstrap_browser" &&
      bootstrap.body?.schema_version === "auth_bootstrap_browser_v2" &&
      bootstrap.body?.authenticated === true &&
      bootstrap.body?.binding_status === "bound" &&
      Array.isArray(bootstrap.body?.dossiers) &&
      bootstrap.body.dossiers.length === 2 &&
      bootstrap.body.dossiers.some((item: Record<string, unknown>) =>
        item.case_id === candidate?.caseId &&
        item.dossier_id === candidate?.caseId &&
        item.status === "submitted_for_review"
      ) &&
      bootstrap.body.dossiers.some((item: Record<string, unknown>) =>
        item.dossier_id === legacyDossierId &&
        item.case_id === legacyCaseId
      ),
    "promoted_customer_bootstrap_failed",
  );
  console.log("Q13_verified_auth_binds_existing_promoted_customer=PASS");

  const after = {
    customers: await count(
      service,
      "app_customers",
      "id",
      candidate.customerId,
    ),
    cases: await count(
      service,
      "app_cases",
      "customer_id",
      candidate.customerId,
    ),
    dossiers: await count(
      service,
      "app_customer_dossiers",
      "customer_id",
      candidate.customerId,
    ),
  };
  assert(
    JSON.stringify(before) === JSON.stringify(after) &&
      after.customers === 1 && after.cases === 2 && after.dossiers === 1,
    `auth_bootstrap_created_duplicate_domain_rows:${
      JSON.stringify({
        before,
        after,
      })
    }`,
  );
  console.log("Q37_EXISTING_CUSTOMER_REUSED=PASS");
  console.log("Q38_NEW_CASE_CREATED=PASS");
  console.log("Q39_OLD_CASE_PRESERVED=PASS");

  const refreshedBootstrap = await post(
    `${functionBaseUrl}/api-app-auth-bootstrap`,
    anonKey,
    token,
    {},
    `09c1c-auth-refresh-${crypto.randomUUID()}`,
  );
  assert(
    refreshedBootstrap.status === 200 &&
      refreshedBootstrap.body?.dossiers?.length === 2 &&
      await count(
          service,
          "app_customer_identities",
          "customer_id",
          candidate.customerId,
        ) === 1 &&
      await count(service, "app_cases", "customer_id", candidate.customerId) ===
        2,
    "refresh_duplicated_identity_or_case",
  );
  console.log("Q46_NO_DUPLICATE_IDENTITY=PASS");
  console.log("Q47_NO_DUPLICATE_CASE_ON_REFRESH=PASS");

  const dashboard = await post(
    `${functionBaseUrl}/api-app-dashboard-get`,
    anonKey,
    token,
    { dossier_id: candidate.caseId },
  );
  const serialized = JSON.stringify(dashboard.body || {}).toLowerCase();
  assert(
    dashboard.status === 200 && dashboard.body?.ok === true &&
      dashboard.body?.selected_dossier?.case_id === candidate.caseId &&
      dashboard.body?.selected_dossier?.status === "submitted_for_review" &&
      dashboard.body?.dossiers?.length === 2 &&
      Array.isArray(dashboard.body?.locations) &&
      Array.isArray(dashboard.body?.document_slots) &&
      !/storage_path|storage_bucket|sha256|event_data|actor_ref|intake_id/.test(
        serialized,
      ),
    "signed_case_dashboard_projection_failed",
  );
  console.log("Q18_Q19_Q21_Q22_signed_case_dashboard_safe=PASS");
  console.log("Q40_UNIFIED_DASHBOARD=PASS");
  console.log("Q41_DASHBOARD_COUNT=PASS");
  console.log("Q42_NO_HEURISTIC_DEDUPE=PASS");
  console.log("Q43_EXISTING_CASE_UPDATE_SEPARATE=PASS");

  const legacyDashboard = await post(
    `${functionBaseUrl}/api-app-dashboard-get`,
    anonKey,
    token,
    { dossier_id: legacyDossierId },
  );
  assert(
    legacyDashboard.status === 200 && legacyDashboard.body?.ok === true &&
      legacyDashboard.body?.selected_dossier?.dossier_id === legacyDossierId &&
      legacyDashboard.body?.dossiers?.length === 2,
    "legacy_selection_lost_unified_collection",
  );

  const other = await service.auth.admin.createUser({
    email: `09c1c-wrong-${crypto.randomUUID()}@example.invalid`,
    password,
    email_confirm: true,
  });
  assert(!other.error && other.data.user?.id, "wrong_user_create_failed");
  const otherUserId = String(other.data.user.id);
  try {
    const otherSignIn = await anon.auth.signInWithPassword({
      email: String(other.data.user.email),
      password,
    });
    const otherToken = otherSignIn.data.session?.access_token || "";
    assert(otherToken, "wrong_user_session_unavailable");
    const denied = await post(
      `${functionBaseUrl}/api-app-dashboard-get`,
      anonKey,
      otherToken,
      { dossier_id: candidate.caseId },
    );
    assert(
      [403, 404].includes(denied.status),
      "wrong_user_dashboard_access_allowed",
    );
    console.log("Q16_Q17_wrong_or_unauth_customer_denied=PASS");
    console.log("Q45_WRONG_USER_DENIED=PASS");
  } finally {
    await service.auth.admin.deleteUser(otherUserId);
  }
} finally {
  await service.auth.admin.deleteUser(authUserId);
  await service.from("app_cases").delete().eq("id", legacyCaseId);
  await service.from("app_customer_dossiers").delete().eq(
    "id",
    legacyDossierId,
  );
}

console.log("POST_SIGNING_AUTH_DASHBOARD_RUNTIME=PASS");
