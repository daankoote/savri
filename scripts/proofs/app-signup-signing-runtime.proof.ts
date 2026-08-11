// Local destructive runtime proof for PILOT-SIGNUP-SIGNING-RUNTIME-09B2B.
// It refuses non-local targets and prints case labels only: never OTP, capability,
// e-mail, typed name, or other proof PII.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  signingLegalBundleAllowed,
  signingLegalRuntimeProjection,
  signingSha256Hex,
  stableSigningJson,
} from "../../supabase/functions/_shared/signing_legal_runtime.ts";
import { resolveSigningOtpTransport } from "../../supabase/functions/_shared/signing_otp_transport.ts";
import {
  isLocalSupabaseRuntime,
  type ServerRuntimeEnvironment,
} from "../../supabase/functions/_shared/local_supabase_runtime.ts";
import {
  channelReference,
  generateSigningOtp,
  otpVerifier,
  signingVerifierSecret,
} from "../../supabase/functions/_shared/signup_signing.ts";

type Json = Record<string, unknown>;
type LocalConfig = { url: string; serviceRoleKey: string };
type Fixture = {
  intakeId: string;
  manageHash: string;
  email: string;
  fileId: string;
  clientSlotId: string;
};
type Challenge = { id: string; verifier: string; code: string };

const results: Array<{ id: string; ok: boolean }> = [];
const SECRET = "09b2b-local-proof-secret-which-is-never-output-000000000000000";
const HASH = "a".repeat(64);
const ENTITY_TABLES = [
  "app_customers",
  "app_customer_identities",
  "app_customer_dossiers",
  "app_cases",
] as const;

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

async function sha256(value: string): Promise<string> {
  return await signingSha256Hex(value);
}

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function key(label: string): string {
  return `09b2b-${label}-${crypto.randomUUID()}`;
}

function environment(
  values: Record<string, string>,
): ServerRuntimeEnvironment {
  return { get: (name) => values[name] };
}

async function run(id: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ id, ok: true });
  } catch (_error) {
    results.push({ id, ok: false });
  }
}

async function localConfig(): Promise<LocalConfig> {
  assert(
    Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") === "YES",
    "destructive_local_proof_not_enabled",
  );
  const output = await new Deno.Command("supabase", {
    args: ["status", "-o", "env"],
    stdout: "piped",
    stderr: "null",
  }).output();
  assert(output.success, "local_supabase_status_unavailable");
  const values = new Map<string, string>();
  for (const line of new TextDecoder().decode(output.stdout).split("\n")) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1], match[2].replace(/"$/, ""));
  }
  const url = values.get("API_URL") || "";
  const hostname = new URL(url).hostname;
  assert(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname),
    "non_local_supabase_target_rejected",
  );
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") || "";
  assert(serviceRoleKey, "local_service_key_unavailable");
  return { url, serviceRoleKey };
}

async function createFixture(
  service: SupabaseClient,
  label: string,
  fileStatus: "confirmed_quarantine" | "superseded" | "none" =
    "confirmed_quarantine",
): Promise<Fixture> {
  const intakeId = crypto.randomUUID();
  const email = `${key(label)}@example.invalid`;
  const manageHash = await sha256(key(`manage-${label}`));
  const inserted = await service.from("app_signup_intakes").insert({
    id: intakeId,
    status: "collecting",
    submitted_payload: { account_type: "particulier" },
    submitted_payload_sha256: await sha256(key(`payload-${label}`)),
    accepted_legal_versions: { items: [] },
    email_normalized: email,
    request_id: key(`request-${label}`),
    expires_at: future(120),
  });
  assert(!inserted.error, "fixture_intake_insert_failed");
  const capability = await service.from("app_signup_intake_capabilities")
    .insert({
      intake_id: intakeId,
      intake_file_id: null,
      capability_type: "intake_manage",
      token_sha256: manageHash,
      issued_at: new Date().toISOString(),
      expires_at: future(90),
    });
  assert(!capability.error, "fixture_capability_insert_failed");

  let fileId = crypto.randomUUID();
  const clientSlotId = key(`slot-${label}`);
  if (fileStatus !== "none") {
    const now = new Date().toISOString();
    const file = await service.from("app_signup_intake_files").insert({
      id: fileId,
      intake_id: intakeId,
      client_slot_id: clientSlotId,
      document_type: "energy_bill_or_contract",
      original_filename: "proof.pdf",
      declared_mime_type: "application/pdf",
      detected_mime_type: "application/pdf",
      size_bytes: 64,
      sha256: HASH,
      server_size_bytes: 64,
      server_sha256: HASH,
      storage_bucket: "app-signup-quarantine",
      storage_path: `proof/${intakeId}/${fileId}`,
      status: fileStatus,
      confirmed_at: fileStatus === "confirmed_quarantine" ? now : null,
      superseded_at: fileStatus === "superseded" ? now : null,
      expires_at: future(90),
    });
    assert(!file.error, "fixture_file_insert_failed");
  } else {
    fileId = crypto.randomUUID();
  }
  return { intakeId, manageHash, email, fileId, clientSlotId };
}

async function issueChallenge(
  service: SupabaseClient,
  fixture: Fixture,
  label: string,
  markDelivered = true,
): Promise<Challenge & { response: Json }> {
  const code = generateSigningOtp();
  assert(/^\d{6}$/.test(code), "otp_shape_invalid");
  const verifier = await otpVerifier(SECRET, code);
  const channel = await channelReference(SECRET, fixture.email);
  const response = await service.rpc("app_signup_signing_challenge_issue_v1", {
    p_intake_id: fixture.intakeId,
    p_manage_token_sha256: fixture.manageHash,
    p_channel_reference_sha256: channel,
    p_otp_verifier_sha256: verifier,
    p_expires_at: future(9),
    p_payload_hash: await sha256(`challenge:${fixture.intakeId}`),
    p_request_id: key(`challenge-request-${label}`),
    p_idempotency_key: key(`challenge-idem-${label}`),
    p_ip_hash: null,
    p_user_agent_hash: null,
    p_environment: "local-proof",
  });
  assert(
    !response.error && (response.data as Json)?.ok === true,
    "challenge_issue_failed",
  );
  const id = String((response.data as Json).challenge_reference || "");
  assert(id, "challenge_reference_missing");
  if (markDelivered) {
    const delivered = await service.from("app_signup_signing_challenges")
      .update({
        delivery_status: "delivered",
        transport_id: "local_mailpit_v1",
        provider_delivery_reference: `mailpit:${id}`,
        delivered_at: new Date().toISOString(),
      })
      .eq("id", id);
    assert(!delivered.error, "challenge_delivery_mark_failed");
  }
  return { id, verifier, code, response: response.data as Json };
}

function facts(state: "confirmed" | "review_required" | "pending" | "blocked") {
  return [
    {
      fact_id: "party:name",
      fact_key: "partyName",
      label: "Naam",
      value: "Proof signer",
      resolution_state: "confirmed",
      required: true,
    },
    {
      fact_id: "location:proof:ean",
      fact_key: "electricityEan",
      label: "EAN",
      value: "871687400000000001",
      resolution_state: state,
      required: true,
      location_id: "location-proof",
    },
    {
      fact_id: "location:proof:address",
      fact_key: "structuredAddress",
      label: "Adres",
      value: "Proofstraat 1, 1000 AA Proofstad",
      resolution_state: "confirmed",
      required: true,
      location_id: "location-proof",
    },
  ];
}

async function finalizationArgs(
  fixture: Fixture,
  challenge: Challenge,
  label: string,
  factState: "confirmed" | "review_required" | "pending" | "blocked" =
    "review_required",
) {
  const legalProjection = await signingLegalRuntimeProjection();
  const legalDocuments = legalProjection.map(
    ({ canonical_content: _content, ...document }) => document,
  );
  const issuedAt = new Date().toISOString();
  const mandate = {
    schema_version: "mandate-document-runtime-v1",
    account_type: "particulier",
    connection_scope: [{
      location_id: "location-proof",
      eans: ["871687400000000001"],
      addresses: ["Proofstraat 1, 1000 AA Proofstad"],
    }],
    permissions: [
      "nea_dso_connection_data_request",
      "verifier_location_inspection",
    ],
    validity: {
      policy_id: "one_whole_calendar_year_v1",
      calendar_years: [2026],
    },
    issue_date: issuedAt,
    authority_review_status: "not_applicable",
  };
  const canonicalFacts = facts(factState);
  const snapshot = {
    schema_version: "signup-signing-runtime-snapshot-v1",
    intake_reference: fixture.intakeId,
    account_type: "particulier",
    canonical_facts: {
      schema_version: "canonical-signing-facts-v1",
      facts: canonicalFacts,
    },
    required_file_references: [fixture.fileId],
    legal_documents: legalDocuments,
    legal_actions: {
      privacy_notice_read: true,
      service_terms_accepted: true,
      fee_terms_accepted: true,
      mandate_signed: true,
    },
    mandate,
    signature_method: { method_id: "typed_name_otp_v1", method_version: "1" },
    signer: { typed_full_name: "Proof signer", signer_role: "" },
    server_issue_date: issuedAt,
  };
  const snapshotHash = await signingSha256Hex(stableSigningJson(snapshot));
  return {
    p_intake_id: fixture.intakeId,
    p_manage_token_sha256: fixture.manageHash,
    p_challenge_id: challenge.id,
    p_channel_reference_sha256: await channelReference(SECRET, fixture.email),
    p_otp_verifier_sha256: challenge.verifier,
    p_payload_hash: await sha256(`finalize:${fixture.intakeId}:${label}`),
    p_canonical_snapshot: snapshot,
    p_snapshot_sha256: snapshotHash,
    p_legal_documents: legalDocuments,
    p_required_file_ids: [fixture.fileId],
    p_account_type: "particulier",
    p_mandate_year: 2026,
    p_issued_at: issuedAt,
    p_mandate_content: mandate,
    p_typed_full_name: "Proof signer",
    p_signer_role: "",
    p_method_version: "1",
    p_request_id: key(`finalize-request-${label}`),
    p_idempotency_key: key(`finalize-idem-${label}`),
    p_ip_hash: null,
    p_user_agent_hash: null,
    p_environment: "local-proof",
  };
}

async function entityCounts(
  service: SupabaseClient,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const table of ENTITY_TABLES) {
    const result = await service.from(table).select("id", {
      count: "exact",
      head: true,
    });
    assert(
      !result.error && typeof result.count === "number",
      "entity_count_failed",
    );
    counts.set(table, result.count);
  }
  return counts;
}

async function main(): Promise<void> {
  const cfg = await localConfig();
  const service = createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const beforeEntities = await entityCounts(service);

  await run("Q01_local_runtime_and_production_fail_closed", async () => {
    assert(
      isLocalSupabaseRuntime("http://127.0.0.1:54321") &&
        isLocalSupabaseRuntime("http://kong:8000") &&
        signingLegalBundleAllowed({ supabaseUrl: "http://kong:8000" }),
      "local_candidate_rejected",
    );
    assert(
      !isLocalSupabaseRuntime("http://kong:9000") &&
        !isLocalSupabaseRuntime("https://kong:8000") &&
        !isLocalSupabaseRuntime("http://kong.example:8000") &&
        !isLocalSupabaseRuntime("http://user@kong:8000") &&
        !isLocalSupabaseRuntime("http://kong:8000/not-the-runtime") &&
        !isLocalSupabaseRuntime("https://example.supabase.co") &&
        !signingLegalBundleAllowed({
          supabaseUrl: "https://example.supabase.co",
        }),
      "non_local_candidate_allowed",
    );
    const localEnvironment = environment({
      SUPABASE_URL: "http://kong:8000",
      SUPABASE_SERVICE_ROLE_KEY:
        "local-proof-service-secret-not-output-000000000000000000",
    });
    assert(
      resolveSigningOtpTransport(localEnvironment)?.transportId ===
          "local_mailpit_v1" &&
        Boolean(signingVerifierSecret(localEnvironment)),
      "embedded_local_signing_dependencies_unavailable",
    );
    const remoteEnvironment = environment({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY:
        "remote-service-secret-must-not-be-fallback-000000000000000",
    });
    const remoteMailpitEnvironment = environment({
      SUPABASE_URL: "https://example.supabase.co",
      SIGNING_OTP_TRANSPORT_DRIVER: "local_mailpit",
    });
    assert(
      resolveSigningOtpTransport(remoteEnvironment) === null &&
        resolveSigningOtpTransport(remoteMailpitEnvironment) === null &&
        signingVerifierSecret(remoteEnvironment) === null,
      "production_signing_fallback_enabled",
    );
  });

  await run("Q02_otp_hash_expiry_attempts_and_one_time", async () => {
    const fixture = await createFixture(service, "otp");
    const challenge = await issueChallenge(service, fixture, "otp");
    assert(challenge.verifier.length === 64, "otp_verifier_shape_invalid");
    const persisted = await service.from("app_signup_signing_challenges")
      .select("otp_verifier_sha256,attempts_remaining,expires_at")
      .eq("id", challenge.id).single();
    assert(!persisted.error, "challenge_read_failed");
    assert(
      persisted.data.otp_verifier_sha256 === challenge.verifier,
      "otp_verifier_not_persisted",
    );
    assert(
      JSON.stringify(persisted.data).includes(challenge.code) === false,
      "raw_otp_persisted",
    );
    assert(
      JSON.stringify(challenge.response).includes(challenge.code) === false &&
        JSON.stringify(challenge.response).includes(fixture.email) === false,
      "challenge_response_exposed_secret",
    );
    assert(persisted.data.attempts_remaining === 5, "attempt_limit_invalid");
    const ttl = new Date(persisted.data.expires_at).getTime() - Date.now();
    assert(ttl > 0 && ttl <= 10 * 60_000, "otp_expiry_invalid");
    const wrongChannel = await service.rpc(
      "app_signup_signing_finalize_v1",
      {
        ...await finalizationArgs(fixture, challenge, "channel-mismatch"),
        p_channel_reference_sha256: "b".repeat(64),
      },
    );
    assert(
      !wrongChannel.error &&
        (wrongChannel.data as Json).code === "channel_mismatch",
      "challenge_channel_not_bound",
    );
  });

  await run("Q03_wrong_otp_and_attempt_exhaustion", async () => {
    const fixture = await createFixture(service, "wrong-otp");
    const challenge = await issueChallenge(service, fixture, "wrong-otp");
    const args = await finalizationArgs(fixture, challenge, "wrong-otp");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await service.rpc("app_signup_signing_finalize_v1", {
        ...args,
        p_otp_verifier_sha256: await otpVerifier(SECRET, "000000"),
        p_idempotency_key: key(`wrong-${attempt}`),
      });
      assert(
        !result.error && (result.data as Json).code === "otp_invalid",
        "wrong_otp_not_rejected",
      );
    }
    const exhausted = await service.rpc("app_signup_signing_finalize_v1", {
      ...args,
      p_idempotency_key: key("exhausted"),
    });
    assert(
      !exhausted.error &&
        (exhausted.data as Json).code === "attempts_exhausted",
      "attempts_not_exhausted",
    );
  });

  await run("Q04_expired_otp", async () => {
    const fixture = await createFixture(service, "expired");
    const challenge = await issueChallenge(service, fixture, "expired");
    const shifted = await service.from("app_signup_signing_challenges").update({
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      expires_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    }).eq("id", challenge.id);
    assert(!shifted.error, "expiry_shift_failed");
    const result = await service.rpc(
      "app_signup_signing_finalize_v1",
      await finalizationArgs(fixture, challenge, "expired"),
    );
    assert(
      !result.error && (result.data as Json).code === "otp_expired",
      "expired_otp_not_rejected",
    );
  });

  await run("Q05_rate_limit_and_challenge_replay", async () => {
    const fixture = await createFixture(service, "rate");
    for (let count = 0; count < 3; count += 1) {
      await issueChallenge(service, fixture, `rate-${count}`, false);
    }
    const code = generateSigningOtp();
    const idempotencyKey = key("rate-limited");
    const request = {
      p_intake_id: fixture.intakeId,
      p_manage_token_sha256: fixture.manageHash,
      p_channel_reference_sha256: await channelReference(SECRET, fixture.email),
      p_otp_verifier_sha256: await otpVerifier(SECRET, code),
      p_expires_at: future(9),
      p_payload_hash: await sha256(`challenge:${fixture.intakeId}`),
      p_request_id: key("rate-request"),
      p_idempotency_key: idempotencyKey,
      p_ip_hash: null,
      p_user_agent_hash: null,
      p_environment: "local-proof",
    };
    const limited = await service.rpc(
      "app_signup_signing_challenge_issue_v1",
      request,
    );
    const replay = await service.rpc(
      "app_signup_signing_challenge_issue_v1",
      request,
    );
    const wrongCapabilityReplay = await service.rpc(
      "app_signup_signing_challenge_issue_v1",
      { ...request, p_manage_token_sha256: "f".repeat(64) },
    );
    const invalidated = await service.from("app_signup_intake_capabilities")
      .update({ invalidated_at: new Date().toISOString() })
      .eq("intake_id", fixture.intakeId)
      .eq("capability_type", "intake_manage");
    const staleCapabilityReplay = await service.rpc(
      "app_signup_signing_challenge_issue_v1",
      request,
    );
    assert(
      !limited.error && (limited.data as Json).code === "rate_limited",
      "rate_limit_missing",
    );
    assert(
      !replay.error && (replay.data as Json).replayed === true,
      "challenge_replay_missing",
    );
    assert(
      Boolean(wrongCapabilityReplay.error) && !invalidated.error &&
        Boolean(staleCapabilityReplay.error),
      "challenge_replay_capability_auth_missing",
    );
  });

  let successFixture: Fixture;
  let successArgs: Awaited<ReturnType<typeof finalizationArgs>>;
  let successSafeReference = "";
  let pendingFileId = "";
  let pendingUploadHash = "";
  await run("Q06_atomic_finalization_snapshot_and_acceptances", async () => {
    successFixture = await createFixture(service, "success");
    pendingFileId = crypto.randomUUID();
    pendingUploadHash = await sha256(key("pending-upload"));
    const pendingFile = await service.from("app_signup_intake_files").insert({
      id: pendingFileId,
      intake_id: successFixture.intakeId,
      client_slot_id: key("pending-slot"),
      document_type: "installation_invoice",
      original_filename: "pending-proof.pdf",
      declared_mime_type: "application/pdf",
      size_bytes: 64,
      sha256: HASH,
      storage_bucket: "app-signup-quarantine",
      storage_path: `proof/${successFixture.intakeId}/${pendingFileId}`,
      status: "upload_issued",
      issued_at: new Date().toISOString(),
      expires_at: future(90),
    });
    const pendingCapability = await service.from(
      "app_signup_intake_capabilities",
    ).insert({
      intake_id: successFixture.intakeId,
      intake_file_id: pendingFileId,
      capability_type: "quarantine_upload",
      token_sha256: pendingUploadHash,
      issued_at: new Date().toISOString(),
      expires_at: future(90),
    });
    assert(
      !pendingFile.error && !pendingCapability.error,
      "pending_upload_fixture_failed",
    );
    const challenge = await issueChallenge(service, successFixture, "success");
    successArgs = await finalizationArgs(successFixture, challenge, "success");
    const secondHash = await signingSha256Hex(
      stableSigningJson(successArgs.p_canonical_snapshot),
    );
    assert(
      secondHash === successArgs.p_snapshot_sha256,
      "snapshot_hash_not_deterministic",
    );
    const finalized = await service.rpc(
      "app_signup_signing_finalize_v1",
      successArgs,
    );
    assert(
      !finalized.error && (finalized.data as Json).ok === true,
      "finalization_failed",
    );
    successSafeReference = String(
      (finalized.data as Json).safe_reference || "",
    );
    assert(
      /^SIG-[A-F0-9]{12}$/.test(successSafeReference),
      "safe_reference_missing",
    );
    const intake = await service.from("app_signup_intakes").select("status").eq(
      "id",
      successFixture.intakeId,
    ).single();
    const acceptances = await service.from("app_signup_legal_acceptances")
      .select("action_type,content_sha256").eq(
        "intake_id",
        successFixture.intakeId,
      );
    const mandate = await service.from("app_signup_mandates")
      .select("calendar_year,mandate_content").eq(
        "intake_id",
        successFixture.intakeId,
      ).single();
    const evidence = await service.from("app_signup_signature_evidence")
      .select("method_id,method_version,challenge_id").eq(
        "intake_id",
        successFixture.intakeId,
      ).single();
    assert(
      !intake.error && intake.data.status === "submitted_for_review",
      "intake_not_finalized",
    );
    assert(
      !acceptances.error && acceptances.data.length === 3,
      "three_acceptances_missing",
    );
    assert(
      !mandate.error && mandate.data.calendar_year === 2026,
      "single_year_mandate_missing",
    );
    assert(
      !evidence.error && evidence.data.method_id === "typed_name_otp_v1",
      "signature_evidence_missing",
    );
    assert(
      (mandate.data.mandate_content as Json).validity !== undefined,
      "mandate_validity_missing",
    );
  });

  await run("Q07_finalize_idempotency_replay_and_conflict", async () => {
    const replay = await service.rpc(
      "app_signup_signing_finalize_v1",
      successArgs,
    );
    assert(
      !replay.error && (replay.data as Json).replayed === true &&
        (replay.data as Json).safe_reference === successSafeReference,
      "finalize_replay_missing",
    );
    const conflict = await service.rpc("app_signup_signing_finalize_v1", {
      ...successArgs,
      p_payload_hash: "b".repeat(64),
    });
    assert(
      !conflict.error &&
        (conflict.data as Json).code === "idempotency_conflict",
      "finalize_conflict_missing",
    );
    for (
      const table of [
        "app_signup_signing_snapshots",
        "app_signup_mandates",
        "app_signup_signature_evidence",
      ]
    ) {
      const count = await service.from(table).select("id", {
        count: "exact",
        head: true,
      }).eq("intake_id", successFixture.intakeId);
      assert(!count.error && count.count === 1, "idempotent_singleton_missing");
    }
    const acceptances = await service.from("app_signup_legal_acceptances")
      .select("id", { count: "exact", head: true })
      .eq("intake_id", successFixture.intakeId);
    assert(
      !acceptances.error && acceptances.count === 3,
      "idempotent_acceptance_set_missing",
    );
  });

  await run("Q08_missing_and_superseded_files_rejected", async () => {
    for (const status of ["none", "superseded"] as const) {
      const fixture = await createFixture(service, `file-${status}`, status);
      const challenge = await issueChallenge(
        service,
        fixture,
        `file-${status}`,
      );
      const result = await service.rpc(
        "app_signup_signing_finalize_v1",
        await finalizationArgs(fixture, challenge, `file-${status}`),
      );
      assert(
        !result.error &&
          (result.data as Json).code === "required_files_unavailable",
        "invalid_file_allowed",
      );
    }
  });

  await run("Q09_pending_and_blocked_facts_rollback", async () => {
    for (const state of ["pending", "blocked"] as const) {
      const fixture = await createFixture(service, `fact-${state}`);
      const challenge = await issueChallenge(service, fixture, `fact-${state}`);
      const result = await service.rpc(
        "app_signup_signing_finalize_v1",
        await finalizationArgs(fixture, challenge, `fact-${state}`, state),
      );
      assert(
        !result.error && (result.data as Json).code === "facts_not_ready",
        "unready_fact_allowed",
      );
      const records = await service.from("app_signup_signature_evidence")
        .select("id", { count: "exact", head: true }).eq(
          "intake_id",
          fixture.intakeId,
        );
      const intact = await service.from("app_signup_signing_challenges")
        .select("consumed_at").eq("id", challenge.id).single();
      assert(!records.error && records.count === 0, "rollback_left_evidence");
      assert(
        !intact.error && intact.data.consumed_at === null,
        "rollback_consumed_challenge",
      );
    }
  });

  await run("Q10_review_required_allowed", async () => {
    assert(successFixture && successArgs, "success_fixture_missing");
    const snapshot = successArgs.p_canonical_snapshot as Json;
    assert(
      JSON.stringify(snapshot).includes("review_required"),
      "review_marker_missing",
    );
  });

  await run("Q11_concurrency_maximum_one", async () => {
    const fixture = await createFixture(service, "concurrency");
    const challenge = await issueChallenge(service, fixture, "concurrency");
    const args = await finalizationArgs(fixture, challenge, "concurrency");
    const [left, right] = await Promise.all([
      service.rpc("app_signup_signing_finalize_v1", {
        ...args,
        p_idempotency_key: key("concurrency-left"),
        p_payload_hash: await sha256("concurrency-left"),
      }),
      service.rpc("app_signup_signing_finalize_v1", {
        ...args,
        p_idempotency_key: key("concurrency-right"),
        p_payload_hash: await sha256("concurrency-right"),
      }),
    ]);
    const successful = [left, right].filter((value) =>
      !value.error && (value.data as Json)?.ok === true
    );
    const count = await service.from("app_signup_signature_evidence")
      .select("id", { count: "exact", head: true }).eq(
        "intake_id",
        fixture.intakeId,
      );
    assert(
      successful.length === 1 && !count.error && count.count === 1,
      "concurrent_double_finalization",
    );
  });

  await run("Q12_immutable_records_and_mutation_lock", async () => {
    const snapshot = await service.from("app_signup_signing_snapshots")
      .update({ canonical_snapshot_sha256: "c".repeat(64) })
      .eq("intake_id", successFixture.intakeId);
    const deletion = await service.from("app_signup_signature_evidence")
      .delete().eq("intake_id", successFixture.intakeId);
    const intakeMutation = await service.from("app_signup_intakes")
      .update({ submitted_payload: { account_type: "zakelijk" } })
      .eq("id", successFixture.intakeId);
    const challengeAfterLock = await service.rpc(
      "app_signup_signing_challenge_issue_v1",
      {
        p_intake_id: successFixture.intakeId,
        p_manage_token_sha256: successFixture.manageHash,
        p_channel_reference_sha256: await channelReference(
          SECRET,
          successFixture.email,
        ),
        p_otp_verifier_sha256: await otpVerifier(SECRET, generateSigningOtp()),
        p_expires_at: future(9),
        p_payload_hash: await sha256("locked-challenge"),
        p_request_id: key("locked-request"),
        p_idempotency_key: key("locked-idem"),
        p_ip_hash: null,
        p_user_agent_hash: null,
        p_environment: "local-proof",
      },
    );
    assert(
      snapshot.error && deletion.error && intakeMutation.error,
      "immutable_record_mutated",
    );
    assert(challengeAfterLock.error, "locked_intake_accepted_mutation");

    const issueAfterLock = await service.rpc("app_signup_quarantine_issue_v1", {
      p_intake_id: successFixture.intakeId,
      p_manage_token_sha256: successFixture.manageHash,
      p_client_slot_id: key("locked-slot"),
      p_document_type: "energy_bill_or_contract",
      p_original_filename: "locked.pdf",
      p_declared_mime_type: "application/pdf",
      p_size_bytes: 64,
      p_client_sha256: HASH,
      p_payload_hash: await sha256("locked-issue"),
      p_upload_token_sha256: await sha256("locked-upload"),
      p_file_expires_at: future(60),
      p_capability_expires_at: future(50),
      p_request_id: key("locked-issue-request"),
      p_idempotency_key: key("locked-issue-idem"),
      p_ip_hash: null,
      p_user_agent_hash: null,
      p_environment: "local-proof",
    });
    const removeAfterLock = await service.rpc(
      "app_signup_quarantine_remove_v1",
      {
        p_intake_id: successFixture.intakeId,
        p_manage_token_sha256: successFixture.manageHash,
        p_client_slot_id: successFixture.clientSlotId,
        p_payload_hash: await sha256("locked-remove"),
        p_request_id: key("locked-remove-request"),
        p_idempotency_key: key("locked-remove-idem"),
        p_ip_hash: null,
        p_user_agent_hash: null,
        p_environment: "local-proof",
      },
    );
    const confirmAfterLock = await service.rpc(
      "app_signup_quarantine_confirm_v1",
      {
        p_intake_id: successFixture.intakeId,
        p_file_id: pendingFileId,
        p_upload_token_sha256: pendingUploadHash,
        p_actual_size_bytes: 64,
        p_detected_mime_type: "application/pdf",
        p_server_sha256: HASH,
        p_failure_code: null,
        p_payload_hash: await sha256("locked-confirm"),
        p_request_id: key("locked-confirm-request"),
        p_idempotency_key: key("locked-confirm-idem"),
        p_ip_hash: null,
        p_user_agent_hash: null,
        p_environment: "local-proof",
      },
    );
    const resignAfterLock = await service.rpc(
      "app_signup_signing_finalize_v1",
      {
        ...successArgs,
        p_payload_hash: await sha256("locked-resign"),
        p_idempotency_key: key("locked-resign-idem"),
      },
    );
    assert(
      issueAfterLock.error && removeAfterLock.error && confirmAfterLock.error &&
        !resignAfterLock.error &&
        (resignAfterLock.data as Json).code === "intake_locked",
      "finalized_mutation_route_not_locked",
    );
  });

  await run("Q13_server_authoritative_resume", async () => {
    const status = await service.rpc("app_signup_signing_status_v1", {
      p_intake_id: successFixture.intakeId,
      p_manage_token_sha256: successFixture.manageHash,
    });
    assert(!status.error, "signing_status_failed");
    const body = status.data as Json;
    assert(
      body.signing_state === "finalized" && body.locked === true &&
        body.intake_status === "pending_verification" &&
        body.safe_reference === successSafeReference && body.finalized_at,
      "finalized_status_projection_invalid",
    );
    const serialized = JSON.stringify(body).toLowerCase();
    for (
      const forbidden of [
        successFixture.email,
        "typed_full_name",
        "otp",
        "capability",
        "snapshot_sha256",
        "challenge_reference",
      ]
    ) {
      assert(
        !serialized.includes(forbidden.toLowerCase()),
        "status_secret_leak",
      );
    }
    const wrongOwner = await service.rpc("app_signup_signing_status_v1", {
      p_intake_id: successFixture.intakeId,
      p_manage_token_sha256: "d".repeat(64),
    });
    assert(wrongOwner.error, "unowned_status_lookup_allowed");
  });

  await run("Q14_no_customer_case_or_dossier", async () => {
    const afterEntities = await entityCounts(service);
    for (const table of ENTITY_TABLES) {
      assert(
        afterEntities.get(table) === beforeEntities.get(table),
        "entity_created",
      );
    }
  });

  for (const result of results) {
    console.log(`${result.id}=${result.ok ? "PASS" : "FAIL"}`);
  }
  assert(results.every((result) => result.ok), "signing_runtime_proof_failed");
  console.log("signup-signing-runtime-09b2c-proof-ok");
}

await main();
