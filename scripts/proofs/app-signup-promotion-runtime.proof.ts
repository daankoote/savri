import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;
type AccountType = "particulier" | "zakelijk" | "vve";
type Fixture = {
  intakeId: string;
  fileId: string;
  snapshotId: string;
  mandateId: string;
  signatureId: string;
  email: string;
  accountType: AccountType;
  sourceHash: string;
};

const HASH = "a".repeat(64);
const results: Array<{ id: string; ok: boolean; detail: string }> = [];

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function key(label: string): string {
  return `09c1a-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
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

async function localConfig() {
  assert(
    Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") === "YES",
    "destructive_local_proof_not_enabled",
  );
  const environmentValues = new Map<string, string>([
    ["API_URL", Deno.env.get("API_URL") ?? ""],
    ["ANON_KEY", Deno.env.get("ANON_KEY") ?? ""],
    ["SERVICE_ROLE_KEY", Deno.env.get("SERVICE_ROLE_KEY") ?? ""],
  ]);
  if ([...environmentValues.values()].every(Boolean)) {
    return checkedLocalConfig(environmentValues);
  }
  const command = new Deno.Command("supabase", {
    args: ["status", "-o", "env"],
    stdout: "piped",
    stderr: "null",
  });
  const output = await command.output();
  const values = new Map<string, string>();
  for (const line of new TextDecoder().decode(output.stdout).split("\n")) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1], match[2].replace(/"$/, ""));
  }
  return checkedLocalConfig(values);
}

function checkedLocalConfig(values: Map<string, string>) {
  const url = values.get("API_URL") || "";
  assert(
    url && values.get("ANON_KEY") && values.get("SERVICE_ROLE_KEY"),
    "local_supabase_unavailable",
  );
  assert(
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(
      new URL(url).hostname,
    ),
    "non_local_target_rejected",
  );
  return {
    url,
    anonKey: values.get("ANON_KEY") || "",
    serviceRoleKey: values.get("SERVICE_ROLE_KEY") || "",
  };
}

function legalDocuments() {
  return ["privacy_notice", "service_terms", "fee_terms", "mandate"].map(
    (documentType, index) => ({
      document_type: documentType,
      version: `proof-v${index + 1}`,
      language: "nl",
      status: "validation_candidate",
      content_sha256: String(index + 1).repeat(64),
    }),
  );
}

async function createFixture(
  service: SupabaseClient,
  accountType: AccountType,
  label: string,
  acceptanceCount = 3,
): Promise<Fixture> {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 60 * 60_000).toISOString();
  const challengeFuture = new Date(Date.now() + 9 * 60_000).toISOString();
  const intakeId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();
  const mandateId = crypto.randomUUID();
  const signatureId = crypto.randomUUID();
  const challengeId = crypto.randomUUID();
  const email = `${key(label)}@example.invalid`;
  const serviceName = accountType === "particulier"
    ? `Proof Person ${label}`
    : `Proof Organization ${label}`;
  const contactName = accountType === "particulier"
    ? serviceName
    : `Proof Contact ${label}`;
  const locationRef = `location-${label}`;
  const documents = legalDocuments();
  const facts = [
    {
      fact_id: `service:${label}`,
      fact_key: accountType === "particulier"
        ? "partyName"
        : "organizationName",
      label: "Service recipient",
      value: serviceName,
      resolution_state: "confirmed",
      required: true,
    },
    {
      fact_id: `address:${label}`,
      fact_key: "structuredAddress",
      label: "Adres",
      value: `Proofstraat 1, 1000 AA Proofstad ${label}`,
      resolution_state: "confirmed",
      required: true,
      location_id: locationRef,
    },
    {
      fact_id: `ean:${label}`,
      fact_key: "electricityEan",
      label: "EAN",
      value: "871687400000000001",
      resolution_state: "review_required",
      required: true,
      location_id: locationRef,
    },
  ];
  if (accountType !== "particulier") {
    facts.push({
      fact_id: `kvk:${label}`,
      fact_key: "kvkNumber",
      label: "KvK",
      value: "12345678",
      resolution_state: "review_required",
      required: true,
      location_id: locationRef,
    });
  }
  const mandate = {
    schema_version: "mandate-document-runtime-v1",
    account_type: accountType,
    connection_scope: [{
      location_id: locationRef,
      eans: ["871687400000000001"],
      addresses: [`Proofstraat 1, 1000 AA Proofstad ${label}`],
    }],
    permissions: [
      "nea_dso_connection_data_request",
      "verifier_location_inspection",
    ],
    validity: {
      policy_id: "one_whole_calendar_year_v1",
      calendar_years: [2026],
    },
    issue_date: now,
    authority_review_status: accountType === "particulier"
      ? "not_applicable"
      : "required_not_completed",
  };
  const snapshot = {
    schema_version: "signup-signing-runtime-snapshot-v1",
    intake_reference: intakeId,
    account_type: accountType,
    canonical_facts: { schema_version: "canonical-signing-facts-v1", facts },
    required_file_references: [fileId],
    legal_documents: documents,
    mandate,
    signer: { typed_full_name: contactName },
  };
  const snapshotHash = await sha256(JSON.stringify(snapshot));

  assert(
    !(await service.from("app_signup_intakes").insert({
      id: intakeId,
      status: "collecting",
      submitted_payload: { account_type: accountType },
      submitted_payload_sha256: await sha256(`payload:${label}`),
      accepted_legal_versions: { items: documents },
      email_normalized: email,
      request_id: key("intake"),
      finalized_at: now,
      expires_at: future,
    })).error,
    "fixture_intake_failed",
  );
  assert(
    !(await service.from("app_signup_intake_capabilities").insert({
      intake_id: intakeId,
      capability_type: "intake_manage",
      token_sha256: await sha256(`manage:${label}`),
      issued_at: now,
      expires_at: future,
      consumed_at: now,
    })).error,
    "fixture_manage_failed",
  );
  assert(
    !(await service.from("app_signup_intake_files").insert({
      id: fileId,
      intake_id: intakeId,
      client_slot_id: `slot-${label}`,
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
      status: "confirmed_quarantine",
      confirmed_at: now,
      expires_at: future,
    })).error,
    "fixture_file_failed",
  );
  assert(
    !(await service.from("app_signup_signing_challenges").insert({
      id: challengeId,
      intake_id: intakeId,
      method_id: "typed_name_otp_v1",
      method_version: "1",
      channel_reference_sha256: await sha256(`channel:${label}`),
      otp_verifier_sha256: await sha256(`otp:${label}`),
      expires_at: challengeFuture,
      delivery_status: "delivered",
      transport_id: "local_mailpit_v1",
      provider_delivery_reference: `proof:${challengeId}`,
      delivered_at: now,
      consumed_at: now,
    })).error,
    "fixture_challenge_failed",
  );
  assert(
    !(await service.from("app_signup_signing_snapshots").insert({
      id: snapshotId,
      intake_id: intakeId,
      schema_version: "signup-signing-runtime-snapshot-v1",
      canonical_snapshot: snapshot,
      canonical_snapshot_sha256: snapshotHash,
    })).error,
    "fixture_snapshot_failed",
  );
  const actions = [
    ["privacy_notice_read", "privacy_notice"],
    ["service_terms_accepted", "service_terms"],
    ["fee_terms_accepted", "fee_terms"],
  ].slice(0, acceptanceCount);
  for (const [index, action] of actions.entries()) {
    assert(
      !(await service.from("app_signup_legal_acceptances").insert({
        intake_id: intakeId,
        snapshot_id: snapshotId,
        action_type: action[0],
        document_type: action[1],
        document_version: `proof-v${index + 1}`,
        language: "nl",
        content_sha256: String(index + 1).repeat(64),
        accepted_at: now,
      })).error,
      "fixture_acceptance_failed",
    );
  }
  assert(
    !(await service.from("app_signup_mandates").insert({
      id: mandateId,
      intake_id: intakeId,
      snapshot_id: snapshotId,
      account_type: accountType,
      calendar_year: 2026,
      issued_at: now,
      mandate_content: mandate,
      authority_review_status: mandate.authority_review_status,
    })).error,
    "fixture_mandate_failed",
  );
  assert(
    !(await service.from("app_signup_signature_evidence").insert({
      id: signatureId,
      intake_id: intakeId,
      snapshot_id: snapshotId,
      mandate_id: mandateId,
      challenge_id: challengeId,
      method_id: "typed_name_otp_v1",
      method_version: "1",
      typed_full_name: contactName,
      signer_role: accountType === "particulier" ? "" : "bestuurder verklaard",
      channel_reference_sha256: await sha256(`channel:${label}`),
      evidence_envelope: { snapshot_sha256: snapshotHash },
      finalized_at: now,
    })).error,
    "fixture_signature_failed",
  );
  assert(
    !(await service.from("app_intake_audit_events").insert({
      event_type: "signup_signing_finalized",
      request_id: key("finalized"),
      actor_type: "anonymous",
      event_data: {
        intake_reference: intakeId,
        next_status: "submitted_for_review",
      },
    })).error,
    "fixture_audit_failed",
  );
  assert(
    !(await service.from("app_signup_intakes").update({
      status: "submitted_for_review",
    }).eq("id", intakeId)).error,
    "fixture_finalize_transition_failed",
  );
  return {
    intakeId,
    fileId,
    snapshotId,
    mandateId,
    signatureId,
    email,
    accountType,
    sourceHash: snapshotHash,
  };
}

async function requestFor(
  fixture: Fixture,
  label: string,
  pathOverride?: string,
) {
  const request = {
    intake_id: fixture.intakeId,
    request_id: key(`request-${label}`),
    idempotency_key: key(`idem-${label}`),
    request_payload_sha256: await sha256(
      `request:${fixture.intakeId}:${label}`,
    ),
    actor_ref: "app-signup-promotion-runtime-proof",
    environment: "local-proof",
    durable_files: [{
      source_intake_file_id: fixture.fileId,
      storage_bucket: "app-documents",
      storage_path: pathOverride ||
        `case-evidence/signed-signup/${fixture.intakeId}/${fixture.fileId}/document.pdf`,
      detected_mime_type: "application/pdf",
      size_bytes: 64,
      sha256: HASH,
    }],
  };
  return request;
}

async function count(
  service: SupabaseClient,
  table: string,
  column?: string,
  value?: string,
) {
  let query = service.from(table).select("id", { count: "exact", head: true });
  if (column && value) query = query.eq(column, value);
  const result = await query;
  assert(
    !result.error && typeof result.count === "number",
    `count_failed:${table}`,
  );
  return result.count;
}

async function main() {
  const cfg = await localConfig();
  const service = createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const anon = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false },
  });
  const migration = await Deno.readTextFile(
    "supabase/migrations/20260810190000_app_signed_signup_promotion_foundation.sql",
  );
  const dossiersBefore = await count(service, "app_customer_dossiers");
  const locationVersionsBefore = await count(service, "app_location_versions");
  let particulier: Fixture;
  let particulierRequest: Json;
  let particulierResponse: Json;
  let sharedCollisionPath = "";

  await run("Q01_migration_schema_objects_present", async () => {
    for (
      const fragment of [
        "create table public.app_signup_promotions",
        "create table public.app_case_lifecycle_events",
        "create table public.app_evidence_files",
        "create table public.app_evidence_versions",
        "create or replace function public.app_promote_signed_signup_v1",
      ]
    ) assert(migration.includes(fragment), `missing:${fragment}`);
    assert(
      await count(service, "app_signup_promotions") >= 0,
      "promotion_table_unavailable",
    );
  });

  await run("Q02_submitted_for_review_status_migration", async () => {
    const old = await service.from("app_signup_intakes").select("id", {
      count: "exact",
      head: true,
    })
      .eq("status", "pending_verification");
    assert(!old.error && old.count === 0, "old_signup_status_remains");
    assert(
      migration.includes("where status = 'pending_verification'"),
      "forward_conversion_missing",
    );
  });

  await run("Q03_old_finalized_intake_stays_locked", async () => {
    const rows = await service.from("app_signup_intakes").select(
      "id,finalized_at",
    )
      .eq("status", "submitted_for_review").limit(1);
    assert(
      !rows.error && rows.data.length === 1 && rows.data[0].finalized_at,
      "migrated_finalized_row_missing",
    );
    const mutation = await service.from("app_signup_intakes").update({
      submitted_payload: { changed: true },
    })
      .eq("id", rows.data[0].id);
    assert(mutation.error, "migrated_intake_unlocked");
  });

  await run("Q04_incomplete_intake_rejected", async () => {
    const fixture = await createFixture(
      service,
      "particulier",
      key("incomplete"),
    );
    assert(
      !(await service.from("app_signup_intakes").update({ status: "rejected" })
        .eq("id", fixture.intakeId)).error,
      "fixture_reject_transition_failed",
    );
    const rpc = await service.rpc("app_promote_signed_signup_v1", {
      p_request: await requestFor(fixture, "incomplete"),
    });
    assert(rpc.error, "non_promotable_intake_allowed");
  });

  await run("Q05_invalid_signing_cardinality_rejected", async () => {
    const fixture = await createFixture(
      service,
      "particulier",
      key("bad-cardinality"),
      2,
    );
    const rpc = await service.rpc("app_promote_signed_signup_v1", {
      p_request: await requestFor(fixture, "bad-cardinality"),
    });
    assert(rpc.error, "invalid_cardinality_allowed");
    assert(
      await count(
        service,
        "app_signup_promotions",
        "intake_id",
        fixture.intakeId,
      ) === 0,
      "partial_bad_promotion",
    );
  });

  await run("Q06_fresh_particulier_promotion_succeeds", async () => {
    particulier = await createFixture(
      service,
      "particulier",
      key("particulier"),
    );
    particulierRequest = await requestFor(particulier, "particulier");
    sharedCollisionPath = String(
      (particulierRequest.durable_files as Json[])[0].storage_path,
    );
    const rpc = await service.rpc("app_promote_signed_signup_v1", {
      p_request: particulierRequest,
    });
    assert(
      !rpc.error && (rpc.data as Json).ok === true,
      `particulier_promotion_failed:${
        rpc.error?.message ?? JSON.stringify(rpc.data)
      }`,
    );
    particulierResponse = rpc.data as Json;
  });

  await run("Q07_particulier_case_and_asserted_roles", async () => {
    const caseId = String(particulierResponse.case_reference);
    assert(
      await count(service, "app_cases", "id", caseId) === 1,
      "particulier_case_missing",
    );
    const roles = await service.from("app_case_party_roles").select(
      "role_type,claim_status,party_id",
    )
      .eq("case_id", caseId);
    assert(
      !roles.error && roles.data.length === 2 &&
        roles.data.every((row) => row.claim_status === "asserted"),
      "particulier_roles_invalid",
    );
    assert(
      new Set(roles.data.map((row) => row.party_id)).size === 1,
      "particulier_authority_fiction",
    );
  });

  for (
    const [id, type] of [["Q08_zakelijk_authority_incomplete", "zakelijk"], [
      "Q09_vve_authority_incomplete",
      "vve",
    ]] as const
  ) {
    await run(id, async () => {
      const fixture = await createFixture(service, type, key(type));
      const rpc = await service.rpc("app_promote_signed_signup_v1", {
        p_request: await requestFor(fixture, type),
      });
      assert(
        !rpc.error && (rpc.data as Json).ok === true,
        `${type}_promotion_failed:${
          rpc.error?.message ?? JSON.stringify(rpc.data)
        }`,
      );
      const mandate = await service.from("app_signup_mandates").select(
        "authority_review_status",
      )
        .eq("id", fixture.mandateId).single();
      const promotion = await service.from("app_signup_promotions").select(
        "service_recipient_party_id,contact_party_id",
      )
        .eq("intake_id", fixture.intakeId).single();
      assert(
        !mandate.error &&
          mandate.data.authority_review_status === "required_not_completed",
        "authority_completed",
      );
      assert(
        !promotion.error &&
          promotion.data.service_recipient_party_id !==
            promotion.data.contact_party_id,
        "organization_contact_not_separate",
      );
    });
  }

  await run("Q10_evidence_awaits_review", async () => {
    const versions = await service.from("app_evidence_versions")
      .select("status,source_intake_file_id,sha256").eq(
        "source_intake_file_id",
        particulier.fileId,
      );
    assert(
      !versions.error && versions.data.length === 1 &&
        versions.data[0].status === "confirmed_awaiting_review" &&
        versions.data[0].sha256 === HASH,
      "evidence_was_not_safely_bound",
    );
  });

  await run("Q11_signing_mandate_linkage_preserved", async () => {
    const row = await service.from("app_signup_promotions")
      .select("signing_snapshot_id,mandate_id,signature_evidence_id")
      .eq("intake_id", particulier.intakeId).single();
    assert(
      !row.error && row.data.signing_snapshot_id === particulier.snapshotId &&
        row.data.mandate_id === particulier.mandateId &&
        row.data.signature_evidence_id === particulier.signatureId,
      "signing_links_changed",
    );
  });

  await run("Q12_exact_retry_same_records", async () => {
    const retry = await service.rpc("app_promote_signed_signup_v1", {
      p_request: particulierRequest,
    });
    assert(
      !retry.error && (retry.data as Json).replayed === true &&
        (retry.data as Json).promotion_reference ===
          particulierResponse.promotion_reference &&
        (retry.data as Json).case_reference ===
          particulierResponse.case_reference,
      "retry_changed_promotion",
    );
  });

  await run("Q13_incompatible_retry_rejected", async () => {
    const conflicting = structuredClone(particulierRequest);
    conflicting.request_payload_sha256 = "b".repeat(64);
    const rpc = await service.rpc("app_promote_signed_signup_v1", {
      p_request: conflicting,
    });
    assert(
      !rpc.error && (rpc.data as Json).code === "promotion_conflict",
      "incompatible_retry_allowed",
    );
  });

  await run("Q14_concurrent_attempt_single_promotion", async () => {
    const fixture = await createFixture(
      service,
      "particulier",
      key("concurrent"),
    );
    const request = await requestFor(fixture, "concurrent");
    const alternate = { ...request, idempotency_key: key("concurrent-second") };
    const [left, right] = await Promise.all([
      service.rpc("app_promote_signed_signup_v1", { p_request: request }),
      service.rpc("app_promote_signed_signup_v1", { p_request: alternate }),
    ]);
    assert(
      !left.error && !right.error &&
        await count(
            service,
            "app_signup_promotions",
            "intake_id",
            fixture.intakeId,
          ) === 1,
      "concurrent_duplicate_promotion",
    );
  });

  await run("Q15_mid_transaction_failure_rolls_back", async () => {
    const fixture = await createFixture(
      service,
      "particulier",
      key("rollback"),
    );
    const rpc = await service.rpc("app_promote_signed_signup_v1", {
      p_request: await requestFor(fixture, "rollback", sharedCollisionPath),
    });
    assert(rpc.error, "storage_metadata_collision_allowed");
    assert(
      await count(
        service,
        "app_signup_promotions",
        "intake_id",
        fixture.intakeId,
      ) === 0,
      "rollback_left_promotion",
    );
    assert(
      await count(service, "app_cases", "source_ref", fixture.intakeId) === 0,
      "rollback_left_case",
    );
    const intake = await service.from("app_signup_intakes").select(
      "status,promotion_case_id",
    )
      .eq("id", fixture.intakeId).single();
    assert(
      !intake.error && intake.data.status === "submitted_for_review" &&
        intake.data.promotion_case_id === null,
      "rollback_changed_intake",
    );
  });

  await run("Q16_no_app_customer_dossiers_created", async () => {
    assert(
      await count(service, "app_customer_dossiers") === dossiersBefore,
      "legacy_dossier_created",
    );
  });

  await run("Q17_browser_roles_denied", async () => {
    const tableWrite = await anon.from("app_signup_promotions").insert({
      proof: true,
    });
    const rpc = await anon.rpc("app_promote_signed_signup_v1", {
      p_request: particulierRequest,
    });
    assert(tableWrite.error && rpc.error, "browser_promotion_authorized");
  });

  await run("Q18_service_role_only_rpc", async () => {
    assert(
      migration.includes(
        "grant execute on function public.app_promote_signed_signup_v1(jsonb)",
      ) &&
        migration.includes("to service_role;") &&
        migration.includes("from public, anon, authenticated;"),
      "rpc_grants_invalid",
    );
  });

  await run("Q19_no_secret_response", async () => {
    const serialized = JSON.stringify(particulierResponse).toLowerCase();
    for (
      const forbidden of [
        particulier.email,
        "otp",
        "capability",
        "safe_reference",
        "storage_path",
        "snapshot_sha256",
      ]
    ) {
      assert(
        !serialized.includes(forbidden.toLowerCase()),
        `response_leak:${forbidden}`,
      );
    }
  });

  await run("Q20_parser_values_not_accepted", async () => {
    assert(
      await count(service, "app_location_versions") === locationVersionsBefore,
      "location_acceptance_side_effect",
    );
    const observations = await service.from("app_location_address_observations")
      .select("observation_kind,descriptor_kind").eq(
        "recorded_by_actor_ref",
        "app-signup-promotion-runtime-proof",
      );
    assert(
      !observations.error && observations.data.length > 0 &&
        observations.data.every((row) =>
          row.observation_kind === "customer_declared" &&
          row.descriptor_kind === "unstructured_postal_address"
        ),
      "declared_observation_promoted_as_truth",
    );
  });

  await run("Q21_no_ean_mid_eligibility_verification", async () => {
    const lifecycle = await service.from("app_case_lifecycle_events").select(
      "lifecycle_state,event_data",
    )
      .eq("case_id", String(particulierResponse.case_reference));
    assert(
      !lifecycle.error && lifecycle.data.length === 1 &&
        lifecycle.data[0].lifecycle_state === "submitted_for_review" &&
        !JSON.stringify(lifecycle.data).match(
          /accepted|verified|eligible|mid/i,
        ),
      "promotion_claimed_domain_acceptance",
    );
  });

  await run("Q22_source_truth_intact", async () => {
    const snapshot = await service.from("app_signup_signing_snapshots")
      .select("canonical_snapshot_sha256").eq("id", particulier.snapshotId)
      .single();
    const file = await service.from("app_signup_intake_files")
      .select("server_sha256,confirmed_at,status,promoted_evidence_file_id")
      .eq("id", particulier.fileId).single();
    assert(
      !snapshot.error &&
        snapshot.data.canonical_snapshot_sha256 === particulier.sourceHash &&
        !file.error && file.data.server_sha256 === HASH &&
        file.data.confirmed_at &&
        file.data.status === "promoted" && file.data.promoted_evidence_file_id,
      "source_truth_changed",
    );
  });

  await run("Q23_audit_and_provenance_complete", async () => {
    const audit = await service.from("app_audit_events")
      .select("event_type,actor_type,event_data,request_id,idempotency_key")
      .eq("scope_id", String(particulierResponse.case_reference));
    const promotion = await service.from("app_signup_promotions")
      .select(
        "source_signing_sha256,promotion_payload_sha256,request_payload_sha256",
      )
      .eq("intake_id", particulier.intakeId).single();
    assert(
      !audit.error && audit.data.length === 1 &&
        audit.data[0].event_type === "signup_promotion_completed" &&
        audit.data[0].actor_type === "system" && !promotion.error &&
        Object.values(promotion.data).every((value) =>
          /^[0-9a-f]{64}$/.test(String(value))
        ),
      "promotion_provenance_incomplete",
    );
  });

  await run("Q24_proof_rollback_safe", async () => {
    assert(
      migration.includes("immutable") &&
        migration.includes("on delete restrict") &&
        results.find((result) =>
            result.id === "Q15_mid_transaction_failure_rolls_back"
          )?.ok === true,
      "rollback_or_history_safety_missing",
    );
  });

  for (const result of results) {
    console.log(`${result.id}=${result.ok ? "PASS" : `FAIL:${result.detail}`}`);
  }
  assert(
    results.every((result) => result.ok),
    "app_signup_promotion_runtime_proof_failed",
  );
  console.log("app-signup-promotion-runtime-09c1a-proof-ok");
}

if (import.meta.main) await main();
