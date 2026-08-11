import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  assert,
  count,
  createFixture,
  type Fixture,
  localConfig,
} from "./app-signup-promotion-runtime.proof.ts";
import {
  durableDestinationPath,
  handleSignupPromotion,
} from "../../supabase/functions/_shared/signup_promotion.ts";

type Json = Record<string, unknown>;
type HttpResult = { status: number; body: Json; raw: string };
type StorageFixture = { fixture: Fixture; bytes: Uint8Array };

const results: Array<{ id: string; ok: boolean; detail: string }> = [];

function key(label: string): string {
  return `09c1b-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function pdfBytes(label: string): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.4\n% ENVAL local promotion proof ${label}\n1 0 obj\n<<>>\nendobj\n%%EOF`,
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

async function run(id: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ id, ok: true, detail: "ok" });
  } catch (error) {
    results.push({
      id,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function createStorageFixture(
  service: SupabaseClient,
  label: string,
  options: {
    upload?: boolean;
    uploadedBytes?: Uint8Array;
    fileStatus?: "uploaded_pending_confirm" | "confirmed_quarantine";
    mandatePermissions?: string[];
  } = {},
): Promise<StorageFixture> {
  const bytes = pdfBytes(label);
  const fixture = await createFixture(
    service,
    "particulier",
    key(label),
    3,
    {
      fileHash: await sha256Bytes(bytes),
      fileSize: bytes.byteLength,
      storageBucket: "app-documents",
      useCanonicalSourcePath: true,
      fileStatus: options.fileStatus,
      mandatePermissions: options.mandatePermissions,
    },
  );
  if (options.upload !== false) {
    const upload = await service.storage.from(fixture.storageBucket).upload(
      fixture.storagePath,
      pdfBlob(options.uploadedBytes ?? bytes),
      { contentType: "application/pdf", upsert: false },
    );
    assert(!upload.error, `source_upload_failed:${label}`);
  }
  return { fixture, bytes };
}

async function objectBytes(
  service: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Uint8Array | null> {
  const download = await service.storage.from(bucket).download(path);
  if (download.error || !download.data) return null;
  return new Uint8Array(await download.data.arrayBuffer());
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index]);
}

async function promotionRequest(
  endpoint: string,
  body: Json,
  auth: {
    apikey?: string;
    bearer?: string;
    internalSecret?: string;
    idempotencyKey?: string;
  },
): Promise<HttpResult> {
  const headers = new Headers({ "content-type": "application/json" });
  if (auth.apikey) headers.set("apikey", auth.apikey);
  if (auth.bearer) headers.set("authorization", `Bearer ${auth.bearer}`);
  if (auth.internalSecret) {
    headers.set("x-enval-signup-promotion-secret", auth.internalSecret);
  }
  headers.set("idempotency-key", auth.idempotencyKey ?? key("idem"));
  headers.set("x-request-id", key("request"));
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    parsed = {};
  }
  return {
    status: response.status,
    body: parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Json
      : {},
    raw,
  };
}

async function countsForIntake(service: SupabaseClient, intakeId: string) {
  return {
    promotions: await count(
      service,
      "app_signup_promotions",
      "intake_id",
      intakeId,
    ),
    cases: await count(service, "app_cases", "source_ref", intakeId),
    evidenceFiles: await count(
      service,
      "app_evidence_files",
      "source_ref",
      intakeId,
    ),
  };
}

async function main(): Promise<void> {
  const cfg = await localConfig();
  const endpoint = `${cfg.url}/functions/v1/api-app-signup-promote`;
  const service = createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const internalAuth = {
    apikey: cfg.serviceRoleKey,
    bearer: cfg.serviceRoleKey,
    internalSecret: cfg.serviceRoleKey,
  };

  const authFixture = await createStorageFixture(service, "auth");
  const authBody = { intake_reference: authFixture.fixture.intakeId };

  await run("Q02_missing_auth_rejected", async () => {
    const response = await promotionRequest(endpoint, authBody, {
      apikey: cfg.anonKey,
    });
    assert([401, 403].includes(response.status), "missing_auth_allowed");
    assert(
      (await countsForIntake(service, authFixture.fixture.intakeId))
        .promotions ===
        0,
      "missing_auth_promoted",
    );
  });

  await run("Q03_wrong_auth_rejected", async () => {
    const response = await promotionRequest(endpoint, authBody, {
      apikey: cfg.serviceRoleKey,
      bearer: cfg.serviceRoleKey,
      internalSecret: "incorrect-internal-secret",
    });
    assert(response.status === 403, "wrong_auth_allowed");

    const previousUrl = Deno.env.get("SUPABASE_URL");
    const previousRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const previousSecret = Deno.env.get("APP_SIGNUP_PROMOTION_INTERNAL_SECRET");
    try {
      Deno.env.set("SUPABASE_URL", "https://proof-project.supabase.co");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "proof-service-role-key");
      Deno.env.delete("APP_SIGNUP_PROMOTION_INTERNAL_SECRET");
      const productionWithoutSecret = await handleSignupPromotion(
        new Request(
          "https://proof.invalid/functions/v1/api-app-signup-promote",
          {
            method: "POST",
            headers: {
              authorization: "Bearer proof-service-role-key",
              "x-enval-signup-promotion-secret": "proof-service-role-key",
            },
            body: JSON.stringify(authBody),
          },
        ),
      );
      assert(
        productionWithoutSecret.status === 503,
        "production_missing_secret_did_not_fail_closed",
      );
    } finally {
      if (previousUrl === undefined) Deno.env.delete("SUPABASE_URL");
      else Deno.env.set("SUPABASE_URL", previousUrl);
      if (previousRoleKey === undefined) {
        Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      } else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", previousRoleKey);
      if (previousSecret === undefined) {
        Deno.env.delete("APP_SIGNUP_PROMOTION_INTERNAL_SECRET");
      } else {
        Deno.env.set("APP_SIGNUP_PROMOTION_INTERNAL_SECRET", previousSecret);
      }
    }
  });

  await run("Q04_anon_and_customer_auth_denied", async () => {
    const anonResponse = await promotionRequest(endpoint, authBody, {
      apikey: cfg.anonKey,
      bearer: cfg.anonKey,
      internalSecret: cfg.anonKey,
    });
    assert([401, 403].includes(anonResponse.status), "anon_auth_allowed");

    const email = `${key("auth-user")}@example.invalid`;
    const password = `Proof-${crypto.randomUUID()}-Aa1!`;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert(!created.error, "auth_user_fixture_failed");
    const signedIn = await anon.auth.signInWithPassword({ email, password });
    assert(!signedIn.error && signedIn.data.session, "auth_session_failed");
    const customerResponse = await promotionRequest(endpoint, authBody, {
      apikey: cfg.anonKey,
      bearer: signedIn.data.session.access_token,
      internalSecret: cfg.anonKey,
    });
    assert(
      [401, 403].includes(customerResponse.status),
      "customer_auth_allowed",
    );
    await anon.auth.signOut({ scope: "local" });
    assert(
      !(await service.auth.admin.deleteUser(created.data.user.id)).error,
      "auth_user_cleanup_failed",
    );
  });

  await run("Q05_safe_reference_cannot_authorize", async () => {
    const response = await promotionRequest(
      endpoint,
      { safe_reference: "SIG-PROOFSAFE" },
      internalAuth,
    );
    assert(response.status === 400, "safe_reference_authorized");
  });

  await run("Q06_otp_capability_and_paths_cannot_authorize", async () => {
    for (
      const body of [
        { otp: "000000" },
        { capability: "proof-capability" },
        {
          intake_reference: authFixture.fixture.intakeId,
          source_path: authFixture.fixture.storagePath,
        },
      ]
    ) {
      const response = await promotionRequest(endpoint, body, internalAuth);
      assert(response.status === 400, "browser_field_authorized");
    }
  });

  await run("Q07_intake_must_be_submitted_for_review", async () => {
    const fixture = await createStorageFixture(service, "rejected");
    const transition = await service.from("app_signup_intakes").update({
      status: "rejected",
    }).eq("id", fixture.fixture.intakeId);
    assert(!transition.error, "rejected_fixture_transition_failed");
    const response = await promotionRequest(
      endpoint,
      { intake_reference: fixture.fixture.intakeId },
      internalAuth,
    );
    assert(response.status === 409, "rejected_intake_promoted");
  });

  await run("Q08_file_must_be_confirmed_quarantine", async () => {
    const fixture = await createStorageFixture(service, "unconfirmed", {
      fileStatus: "uploaded_pending_confirm",
    });
    const response = await promotionRequest(
      endpoint,
      { intake_reference: fixture.fixture.intakeId },
      internalAuth,
    );
    assert(response.status === 409, "unconfirmed_file_promoted");
  });

  await run("Q09_missing_source_object_rejected", async () => {
    const fixture = await createStorageFixture(service, "missing", {
      upload: false,
    });
    const response = await promotionRequest(
      endpoint,
      { intake_reference: fixture.fixture.intakeId },
      internalAuth,
    );
    assert(
      response.status === 409 && response.body.code === "source_object_missing",
      "missing_source_allowed",
    );
  });

  await run("Q10_source_bytes_hash_mismatch_rejected", async () => {
    const fixture = await createStorageFixture(service, "mismatch", {
      uploadedBytes: pdfBytes("different-bytes"),
    });
    const response = await promotionRequest(
      endpoint,
      { intake_reference: fixture.fixture.intakeId },
      internalAuth,
    );
    assert(
      response.status === 409 &&
        response.body.code === "source_integrity_mismatch",
      "source_mismatch_allowed",
    );
  });

  const durableObjectsBefore = await count(
    service,
    "app_evidence_versions",
  );
  const dossiersBefore = await count(service, "app_customer_dossiers");
  const locationVersionsBefore = await count(service, "app_location_versions");
  const happy = await createStorageFixture(service, "happy");
  const happyDestination = durableDestinationPath(
    happy.fixture.intakeId,
    happy.fixture.fileId,
  );
  const happyIdempotency = key("happy-idem");
  let happyResponse: HttpResult = { status: 0, body: {}, raw: "" };
  let happyCounts: Awaited<ReturnType<typeof countsForIntake>>;

  await run("Q01_valid_internal_endpoint_reachable", async () => {
    happyResponse = await promotionRequest(
      endpoint,
      { intake_reference: happy.fixture.intakeId },
      { ...internalAuth, idempotencyKey: happyIdempotency },
    );
    assert(
      happyResponse.status === 201 && happyResponse.body.ok === true,
      `valid_internal_request_failed:${happyResponse.status}`,
    );
  });

  await run("Q11_fresh_promotion_prepares_deterministic_object", async () => {
    assert(
      happyDestination ===
        `case-evidence/signed-signup/${happy.fixture.intakeId}/${happy.fixture.fileId}/document.pdf`,
      "destination_not_deterministic",
    );
    assert(
      await objectBytes(service, "app-documents", happyDestination) !== null,
      "durable_object_missing",
    );
  });

  await run("Q12_durable_copy_exact_bytes_and_hash", async () => {
    const destination = await objectBytes(
      service,
      "app-documents",
      happyDestination,
    );
    assert(
      destination && equalBytes(destination, happy.bytes),
      "copy_changed_bytes",
    );
    assert(
      await sha256Bytes(destination) === happy.fixture.fileHash,
      "copy_hash_mismatch",
    );
  });

  await run("Q13_rpc_creates_one_promotion_and_case", async () => {
    happyCounts = await countsForIntake(service, happy.fixture.intakeId);
    assert(
      happyCounts.promotions === 1 && happyCounts.cases === 1,
      "promotion_case_cardinality_invalid",
    );
  });

  await run("Q14_source_file_linked_to_evidence", async () => {
    const file = await service.from("app_signup_intake_files").select(
      "status,promoted_evidence_file_id",
    ).eq("id", happy.fixture.fileId).single();
    const evidence = await service.from("app_evidence_versions").select(
      "source_intake_file_id,storage_bucket,storage_path,sha256",
    ).eq("source_intake_file_id", happy.fixture.fileId).single();
    assert(
      !file.error && file.data.status === "promoted" &&
        file.data.promoted_evidence_file_id && !evidence.error &&
        evidence.data.source_intake_file_id === happy.fixture.fileId &&
        evidence.data.storage_bucket === "app-documents" &&
        evidence.data.storage_path === happyDestination &&
        evidence.data.sha256 === happy.fixture.fileHash,
      "promotion_evidence_link_invalid",
    );
  });

  await run("Q15_evidence_awaits_internal_review", async () => {
    const evidence = await service.from("app_evidence_versions").select(
      "status",
    ).eq("source_intake_file_id", happy.fixture.fileId).single();
    assert(
      !evidence.error && evidence.data.status === "confirmed_awaiting_review",
      "evidence_review_bypassed",
    );
  });

  await run("Q16_replay_creates_zero_storage_objects", async () => {
    const before = await objectBytes(
      service,
      "app-documents",
      happyDestination,
    );
    const replay = await promotionRequest(
      endpoint,
      { intake_reference: happy.fixture.intakeId },
      { ...internalAuth, idempotencyKey: happyIdempotency },
    );
    const after = await objectBytes(service, "app-documents", happyDestination);
    assert(
      replay.status === 200 && replay.body.replayed === true && before &&
        after &&
        equalBytes(before, after),
      "storage_replay_changed_object",
    );
  });

  await run("Q17_replay_creates_zero_database_duplicates", async () => {
    const after = await countsForIntake(service, happy.fixture.intakeId);
    assert(
      JSON.stringify(after) === JSON.stringify(happyCounts) &&
        await count(
            service,
            "app_evidence_versions",
            "source_intake_file_id",
            happy.fixture.fileId,
          ) === 1,
      "database_replay_duplicated_records",
    );
  });

  await run("Q18_concurrent_calls_converge", async () => {
    const concurrent = await createStorageFixture(service, "concurrent");
    const idem = key("concurrent-idem");
    const request = () =>
      promotionRequest(
        endpoint,
        { intake_reference: concurrent.fixture.intakeId },
        { ...internalAuth, idempotencyKey: idem },
      );
    const attempts = await Promise.all([request(), request()]);
    const retry = await request();
    const counts = await countsForIntake(service, concurrent.fixture.intakeId);
    const evidenceVersions = await count(
      service,
      "app_evidence_versions",
      "source_intake_file_id",
      concurrent.fixture.fileId,
    );
    if (
      !attempts.every((item) => [200, 201, 409].includes(item.status)) ||
      retry.status !== 200 || retry.body.replayed !== true ||
      counts.promotions !== 1 || counts.cases !== 1 || evidenceVersions !== 1
    ) {
      throw new Error(
        `concurrent_promotion_diverged:attempts=${
          attempts.map((item) =>
            `${item.status}:${String(item.body.code || "ok")}`
          ).join(",")
        }:retry=${retry.status}:${
          String(retry.body.code || "ok")
        }:counts=${counts.promotions},${counts.cases},${evidenceVersions}`,
      );
    }
  });

  await run("Q19_incompatible_existing_destination_fails_closed", async () => {
    const conflict = await createStorageFixture(service, "conflict");
    const destination = durableDestinationPath(
      conflict.fixture.intakeId,
      conflict.fixture.fileId,
    );
    const upload = await service.storage.from("app-documents").upload(
      destination,
      pdfBlob(pdfBytes("wrong-destination")),
      { contentType: "application/pdf", upsert: false },
    );
    assert(!upload.error, "conflict_fixture_upload_failed");
    const response = await promotionRequest(
      endpoint,
      { intake_reference: conflict.fixture.intakeId },
      internalAuth,
    );
    assert(
      response.status === 409 &&
        response.body.code === "durable_object_conflict" &&
        (await countsForIntake(service, conflict.fixture.intakeId))
            .promotions ===
          0,
      "destination_conflict_allowed",
    );
  });

  let failed: StorageFixture;
  let failedDestination = "";
  let failedCountsBefore: {
    customers: number;
    identities: number;
    cases: number;
    evidenceFiles: number;
    evidenceVersions: number;
  };
  let failedCountsAfter: typeof failedCountsBefore;

  await run("Q20_database_failure_cleans_new_destination", async () => {
    failed = await createStorageFixture(service, "db-failure", {
      mandatePermissions: ["nea_dso_connection_data_request"],
    });
    failedDestination = durableDestinationPath(
      failed.fixture.intakeId,
      failed.fixture.fileId,
    );
    failedCountsBefore = {
      customers: await count(service, "app_customers"),
      identities: await count(service, "app_customer_identities"),
      cases: await count(service, "app_cases"),
      evidenceFiles: await count(service, "app_evidence_files"),
      evidenceVersions: await count(service, "app_evidence_versions"),
    };
    const response = await promotionRequest(
      endpoint,
      { intake_reference: failed.fixture.intakeId },
      internalAuth,
    );
    failedCountsAfter = {
      customers: await count(service, "app_customers"),
      identities: await count(service, "app_customer_identities"),
      cases: await count(service, "app_cases"),
      evidenceFiles: await count(service, "app_evidence_files"),
      evidenceVersions: await count(service, "app_evidence_versions"),
    };
    assert(
      response.status === 409 &&
        await objectBytes(service, "app-documents", failedDestination) === null,
      "new_destination_not_cleaned",
    );
  });

  await run("Q21_cleanup_preserves_preexisting_destination", async () => {
    const preexisting = await createStorageFixture(
      service,
      "preexisting-fail",
      {
        mandatePermissions: ["nea_dso_connection_data_request"],
      },
    );
    const destination = durableDestinationPath(
      preexisting.fixture.intakeId,
      preexisting.fixture.fileId,
    );
    const upload = await service.storage.from("app-documents").upload(
      destination,
      pdfBlob(preexisting.bytes),
      { contentType: "application/pdf", upsert: false },
    );
    assert(!upload.error, "preexisting_fixture_upload_failed");
    const response = await promotionRequest(
      endpoint,
      { intake_reference: preexisting.fixture.intakeId },
      internalAuth,
    );
    const after = await objectBytes(service, "app-documents", destination);
    assert(
      response.status === 409 && after && equalBytes(after, preexisting.bytes),
      "preexisting_destination_deleted",
    );
  });

  await run("Q22_failed_promotion_has_no_partial_database_state", async () => {
    assert(
      JSON.stringify(failedCountsAfter) ===
          JSON.stringify(failedCountsBefore) &&
        (await countsForIntake(service, failed.fixture.intakeId)).promotions ===
          0,
      "failed_promotion_left_partial_state",
    );
  });

  await run("Q23_success_source_quarantine_remains_intact", async () => {
    const source = await objectBytes(
      service,
      happy.fixture.storageBucket,
      happy.fixture.storagePath,
    );
    assert(source && equalBytes(source, happy.bytes), "success_source_deleted");
  });

  await run("Q24_failure_source_quarantine_remains_intact", async () => {
    const source = await objectBytes(
      service,
      failed.fixture.storageBucket,
      failed.fixture.storagePath,
    );
    assert(
      source && equalBytes(source, failed.bytes),
      "failure_source_deleted",
    );
  });

  await run("Q25_response_contains_no_sensitive_storage_or_pii", async () => {
    const serialized = happyResponse.raw.toLowerCase();
    for (
      const forbidden of [
        "app-documents",
        "case-evidence/",
        happy.fixture.fileHash,
        happy.fixture.email,
        "otp",
        "capability",
        cfg.serviceRoleKey,
      ]
    ) {
      assert(!serialized.includes(forbidden.toLowerCase()), "response_leak");
    }
  });

  await run("Q26_no_domain_or_authority_truth_fabricated", async () => {
    const lifecycle = await service.from("app_case_lifecycle_events").select(
      "lifecycle_state,event_data",
    ).eq("case_id", String(happyResponse.body.case_reference));
    const evidence = await service.from("app_evidence_versions").select(
      "status",
    ).eq("source_intake_file_id", happy.fixture.fileId).single();
    assert(
      await count(service, "app_location_versions") ===
          locationVersionsBefore &&
        !lifecycle.error && lifecycle.data.length === 1 &&
        lifecycle.data[0].lifecycle_state === "submitted_for_review" &&
        !JSON.stringify(lifecycle.data).match(
          /accepted|verified|eligible|mid/i,
        ) &&
        !evidence.error && evidence.data.status === "confirmed_awaiting_review",
      "domain_truth_fabricated",
    );
  });

  await run("Q27_no_app_customer_dossiers_created", async () => {
    assert(
      await count(service, "app_customer_dossiers") === dossiersBefore,
      "legacy_dossier_created",
    );
  });

  await run("Q28_audit_and_request_provenance_present", async () => {
    const audit = await service.from("app_audit_events").select(
      "event_type,actor_type,actor_ref,request_id,idempotency_key",
    ).eq("scope_id", String(happyResponse.body.case_reference)).single();
    assert(
      !audit.error && audit.data.event_type === "signup_promotion_completed" &&
        audit.data.actor_type === "system" &&
        audit.data.actor_ref === "edge:api-app-signup-promote" &&
        audit.data.request_id &&
        audit.data.idempotency_key === happyIdempotency,
      "promotion_audit_incomplete",
    );
  });

  await run("Q29_orphan_like_destination_is_reused", async () => {
    const orphan = await createStorageFixture(service, "orphan-reuse");
    const destination = durableDestinationPath(
      orphan.fixture.intakeId,
      orphan.fixture.fileId,
    );
    const upload = await service.storage.from("app-documents").upload(
      destination,
      pdfBlob(orphan.bytes),
      { contentType: "application/pdf", upsert: false },
    );
    assert(!upload.error, "orphan_fixture_upload_failed");
    const response = await promotionRequest(
      endpoint,
      { intake_reference: orphan.fixture.intakeId },
      internalAuth,
    );
    const after = await objectBytes(service, "app-documents", destination);
    assert(
      response.status === 201 && response.body.ok === true && after &&
        equalBytes(after, orphan.bytes) &&
        (await countsForIntake(service, orphan.fixture.intakeId)).promotions ===
          1,
      "orphan_like_object_not_reused",
    );
  });

  await run("Q30_sensitive_output_none", async () => {
    assert(
      results.every((result) =>
        !/@example\.invalid|eyj|service_role/i.test(result.detail)
      ) &&
        await count(service, "app_evidence_versions") >=
          durableObjectsBefore + 1,
      "sensitive_proof_output_or_missing_runtime_effect",
    );
  });

  for (
    const result of results.sort((left, right) =>
      left.id.localeCompare(right.id)
    )
  ) {
    console.log(`${result.id}=${result.ok ? "PASS" : `FAIL:${result.detail}`}`);
  }
  assert(
    results.every((result) => result.ok),
    "app_signup_promotion_gateway_proof_failed",
  );
  console.log("app-signup-promotion-gateway-09c1b-proof-ok");
}

if (import.meta.main) {
  await main();
  Deno.exit(0);
}
