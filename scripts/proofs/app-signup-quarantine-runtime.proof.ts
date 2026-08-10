// Local destructive runtime proof for PILOT-SIGNUP-QUARANTINE-UPLOAD-09B1.
// Refuses non-local targets and prints only case labels plus the exact marker.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  downloadSignupObject,
} from "../../supabase/functions/_shared/signup_quarantine.ts";
import { isLocalSupabaseRuntime } from "../../supabase/functions/_shared/local_supabase_runtime.ts";

type LocalConfig = { url: string; anonKey: string; serviceRoleKey: string };
type Json = Record<string, unknown>;

const results: Array<{ id: string; ok: boolean; detail: string }> = [];
const ZERO_HASH = "0".repeat(64);

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function localConfig(): Promise<LocalConfig> {
  assert(Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") === "YES", "destructive_local_proof_not_enabled");
  const output = await new Deno.Command("supabase", {
    args: ["status", "-o", "env"], stdout: "piped", stderr: "null",
  }).output();
  assert(output.success, "local_supabase_status_unavailable");
  const values = new Map<string, string>();
  for (const line of new TextDecoder().decode(output.stdout).split("\n")) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1], match[2].replace(/"$/, ""));
  }
  const url = values.get("API_URL") || "";
  const hostname = new URL(url).hostname;
  assert(["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname), "non_local_supabase_target_rejected");
  const anonKey = values.get("ANON_KEY") || "";
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") || "";
  assert(anonKey && serviceRoleKey, "local_supabase_keys_unavailable");
  return { url, anonKey, serviceRoleKey };
}

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function key(label: string): string {
  return `09b1-${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function run(id: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ id, ok: true, detail: "ok" });
  } catch (error) {
    results.push({ id, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function main(): Promise<void> {
  await run("Q00_local_capability_runtime_boundary", async () => {
    assert(
      isLocalSupabaseRuntime("http://127.0.0.1:54321") &&
        isLocalSupabaseRuntime("http://kong:8000"),
      "local_runtime_not_recognized",
    );
    assert(
      !isLocalSupabaseRuntime("http://kong:9000") &&
        !isLocalSupabaseRuntime("https://kong:8000") &&
        !isLocalSupabaseRuntime("http://kong:8000/not-the-runtime") &&
        !isLocalSupabaseRuntime("https://example.supabase.co"),
      "non_local_runtime_accepted",
    );
  });

  const cfg = await localConfig();
  const service = createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false } });
  const anon = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
  const accountType = "zakelijk";
  const proofEmail = `${key("mail")}@example.invalid`;
  const startPayloadHash = await sha256(JSON.stringify({ account_type: accountType, email: proofEmail }));
  const manageRaw = `sq_${crypto.randomUUID()}_${crypto.randomUUID()}`;
  const manageHash = await sha256(manageRaw);
  const startKey = key("start");
  const entityTables = ["app_customers", "app_customer_identities", "app_customer_dossiers"];
  const before = new Map<string, number>();
  for (const table of entityTables) {
    const count = await service.from(table).select("id", { count: "exact", head: true });
    assert(!count.error && typeof count.count === "number", `count_before_failed:${table}`);
    before.set(table, count.count);
  }

  const startArgs = {
    p_account_type: accountType,
    p_email_normalized: proofEmail,
    p_payload_hash: startPayloadHash,
    p_manage_token_sha256: manageHash,
    p_intake_expires_at: future(120),
    p_capability_expires_at: future(90),
    p_request_id: key("request"),
    p_idempotency_key: startKey,
    p_ip_hash: null,
    p_user_agent_hash: null,
    p_environment: "local-proof",
  };
  let intakeId = "";

  await run("Q01_collecting_and_replay", async () => {
    const first = await service.rpc("app_signup_quarantine_start_v1", startArgs);
    assert(!first.error && (first.data as Json)?.ok === true, "start_failed");
    intakeId = String((first.data as Json).intake_reference || "");
    const replay = await service.rpc("app_signup_quarantine_start_v1", {
      ...startArgs,
      p_intake_expires_at: future(121),
      p_capability_expires_at: future(91),
    });
    assert(!replay.error && (replay.data as Json)?.replayed === true, "start_replay_failed");
    assert((replay.data as Json).intake_reference === intakeId, "replay_changed_intake");
    const intake = await service.from("app_signup_intakes").select("status").eq("id", intakeId).single();
    assert(!intake.error && intake.data.status === "collecting", "collecting_intake_missing");
  });

  await run("Q02_idempotency_conflict", async () => {
    const conflict = await service.rpc("app_signup_quarantine_start_v1", {
      ...startArgs,
      p_payload_hash: "1".repeat(64),
      p_manage_token_sha256: "2".repeat(64),
    });
    assert(!conflict.error && (conflict.data as Json)?.code === "idempotency_conflict", "conflicting_payload_not_rejected");
  });

  await run("Q03_no_entity_creation_and_hashed_manage_capability", async () => {
    for (const table of entityTables) {
      const count = await service.from(table).select("id", { count: "exact", head: true });
      assert(!count.error && count.count === before.get(table), `entity_count_changed:${table}`);
    }
    const caps = await service.from("app_signup_intake_capabilities")
      .select("token_sha256,expires_at,capability_type").eq("intake_id", intakeId);
    assert(!caps.error && caps.data.length === 1 && caps.data[0].capability_type === "intake_manage", "manage_capability_missing");
    assert(caps.data[0].token_sha256 === manageHash && JSON.stringify(caps.data).includes(manageRaw) === false, "raw_manage_token_persisted");
    assert(new Date(caps.data[0].expires_at).getTime() > Date.now(), "manage_expiry_missing");
  });

  async function issue(slot: string, bytes: Uint8Array, overrides: Partial<{ hash: string; size: number; type: string }> = {}) {
    const clientHash = overrides.hash || await sha256(bytes.slice().buffer as ArrayBuffer);
    const payload = {
      intake_reference: intakeId,
      client_slot_id: slot,
      document_type: overrides.type || "energy_bill_or_contract",
      file_name: "proof.pdf",
      mime_type: "application/pdf",
      size_bytes: overrides.size || bytes.byteLength,
      client_sha256: clientHash,
    };
    const payloadHash = await sha256(JSON.stringify(payload));
    const uploadRaw = `sq_${crypto.randomUUID()}_${crypto.randomUUID()}`;
    const rpc = await service.rpc("app_signup_quarantine_issue_v1", {
      p_intake_id: intakeId,
      p_manage_token_sha256: manageHash,
      p_client_slot_id: slot,
      p_document_type: payload.document_type,
      p_original_filename: payload.file_name,
      p_declared_mime_type: payload.mime_type,
      p_size_bytes: payload.size_bytes,
      p_client_sha256: payload.client_sha256,
      p_payload_hash: payloadHash,
      p_upload_token_sha256: await sha256(uploadRaw),
      p_file_expires_at: future(60),
      p_capability_expires_at: future(30),
      p_request_id: key("issue-request"),
      p_idempotency_key: key("issue"),
      p_ip_hash: null,
      p_user_agent_hash: null,
      p_environment: "local-proof",
    });
    assert(!rpc.error && (rpc.data as Json)?.ok === true, "issue_failed");
    return { response: rpc.data as Json, uploadRaw, bytes };
  }

  async function upload(issued: Awaited<ReturnType<typeof issue>>): Promise<void> {
    const bucket = String(issued.response.storage_bucket);
    const path = String(issued.response.storage_path);
    const signed = await service.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
    assert(!signed.error && signed.data?.token, "signed_upload_issue_failed");
    const stored = await anon.storage.from(bucket).uploadToSignedUrl(
      path,
      signed.data.token,
      new Blob([issued.bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
      { contentType: "application/pdf" },
    );
    assert(!stored.error, "signed_upload_failed");
  }

  async function confirm(
    issued: Awaited<ReturnType<typeof issue>>,
    actual: { size?: number | null; mime?: string | null; hash?: string | null; failure?: string | null } = {},
    idempotencyKey = key("confirm"),
  ) {
    const payloadHash = await sha256(JSON.stringify({
      intake_reference: intakeId,
      file_reference: issued.response.file_reference,
    }));
    return await service.rpc("app_signup_quarantine_confirm_v1", {
      p_intake_id: intakeId,
      p_file_id: issued.response.file_reference,
      p_upload_token_sha256: await sha256(issued.uploadRaw),
      p_actual_size_bytes: actual.size === undefined ? issued.bytes.byteLength : actual.size,
      p_detected_mime_type: actual.mime === undefined ? "application/pdf" : actual.mime,
      p_server_sha256: actual.hash === undefined ? await sha256(issued.bytes.slice().buffer as ArrayBuffer) : actual.hash,
      p_failure_code: actual.failure || null,
      p_payload_hash: payloadHash,
      p_request_id: key("confirm-request"),
      p_idempotency_key: idempotencyKey,
      p_ip_hash: null,
      p_user_agent_hash: null,
      p_environment: "local-proof",
    });
  }

  async function serverObservation(issued: Awaited<ReturnType<typeof issue>>) {
    const observed = await downloadSignupObject(
      service,
      String(issued.response.storage_bucket),
      String(issued.response.storage_path),
    );
    return observed.ok
      ? { size: observed.sizeBytes, mime: observed.detectedMimeType, hash: observed.serverSha256 }
      : { size: null, mime: null, hash: null, failure: observed.failureCode };
  }

  const pdfA = new TextEncoder().encode("%PDF-1.7\n09B1-A\n%%EOF");
  let firstRevision: Awaited<ReturnType<typeof issue>>;
  await run("Q04_private_signed_upload_and_server_confirmation", async () => {
    firstRevision = await issue("location_a_energy", pdfA);
    assert(String(firstRevision.response.storage_path).startsWith(`signup-quarantine/${intakeId}/`), "quarantine_prefix_mismatch");
    await upload(firstRevision);
    const observed = await serverObservation(firstRevision);
    assert(observed.failure === undefined, "server_download_failed");
    const confirmed = await confirm(firstRevision, observed);
    assert(!confirmed.error && (confirmed.data as Json)?.file_status === "confirmed_quarantine", "confirmation_failed");
    const row = await service.from("app_signup_intake_files")
      .select("status,server_size_bytes,server_sha256,detected_mime_type").eq("id", firstRevision.response.file_reference).single();
    assert(!row.error && row.data.status === "confirmed_quarantine" && row.data.server_sha256 === observed.hash,
      "server_observation_not_persisted");
  });

  await run("Q05_one_time_upload_capability_and_replay", async () => {
    const replayKey = key("confirm-replay");
    const revision = await issue("one_time_slot", pdfA);
    await upload(revision);
    const first = await confirm(revision, {}, replayKey);
    const replay = await confirm(revision, {}, replayKey);
    assert(!first.error && !replay.error && (replay.data as Json)?.replayed === true, "confirm_replay_failed");
    const secondLogical = await confirm(revision);
    assert(secondLogical.error, "consumed_capability_reused");
    const cap = await service.from("app_signup_intake_capabilities").select("consumed_at,token_sha256")
      .eq("intake_file_id", revision.response.file_reference).single();
    assert(!cap.error && cap.data.consumed_at && JSON.stringify(cap.data).includes(revision.uploadRaw) === false, "raw_upload_token_or_consumption_invalid");
  });

  await run("Q06_rejection_boundaries", async () => {
    const cases = [
      { slot: "wrong_format", bytes: new TextEncoder().encode("NOT-PDF-CONTENT") },
      { slot: "wrong_size", bytes: pdfA, override: { size: pdfA.byteLength + 1 } },
      { slot: "wrong_hash", bytes: pdfA, override: { hash: ZERO_HASH } },
      { slot: "missing_object", bytes: pdfA },
    ];
    for (const candidate of cases) {
      const revision = await issue(candidate.slot, candidate.bytes, candidate.override);
      if (candidate.slot !== "missing_object") await upload(revision);
      const rejected = await confirm(revision, await serverObservation(revision));
      assert(!rejected.error && (rejected.data as Json)?.code === "upload_rejected", `boundary_not_rejected:${candidate.slot}`);
    }
  });

  await run("Q07_expired_and_wrong_scope", async () => {
    const issuedA = await issue("scope_a", pdfA);
    const issuedB = await issue("scope_b", pdfA);
    const wrong = await service.rpc("app_signup_quarantine_confirm_v1", {
      p_intake_id: intakeId,
      p_file_id: issuedB.response.file_reference,
      p_upload_token_sha256: await sha256(issuedA.uploadRaw),
      p_actual_size_bytes: pdfA.byteLength,
      p_detected_mime_type: "application/pdf",
      p_server_sha256: await sha256(pdfA.slice().buffer as ArrayBuffer),
      p_failure_code: null,
      p_payload_hash: await sha256("wrong-scope"),
      p_request_id: key("wrong-scope"),
      p_idempotency_key: key("wrong-scope"),
      p_ip_hash: null, p_user_agent_hash: null, p_environment: "local-proof",
    });
    assert(wrong.error, "wrong_file_scope_accepted");

    const expiredIntake = crypto.randomUUID();
    const expiredFile = crypto.randomUUID();
    const expiredRaw = `sq_${crypto.randomUUID()}`;
    const created = new Date(Date.now() - 120_000).toISOString();
    const expired = new Date(Date.now() - 60_000).toISOString();
    assert(!(await service.from("app_signup_intakes").insert({
      id: expiredIntake, status: "collecting", submitted_payload: { proof: true },
      submitted_payload_sha256: ZERO_HASH, accepted_legal_versions: { items: [] },
      email_normalized: `${key("expired")}@example.invalid`, created_at: created,
      expires_at: future(30),
    })).error, "expired_fixture_intake_failed");
    assert(!(await service.from("app_signup_intake_files").insert({
      id: expiredFile, intake_id: expiredIntake, client_slot_id: "expired_slot",
      document_type: "energy_bill_or_contract", original_filename: "proof.pdf",
      declared_mime_type: "application/pdf", size_bytes: pdfA.byteLength,
      sha256: await sha256(pdfA.slice().buffer as ArrayBuffer), storage_bucket: "app-documents",
      storage_path: `signup-quarantine/${expiredIntake}/${expiredFile}/document.pdf`,
      status: "upload_issued", issued_at: created, created_at: created, expires_at: future(30),
    })).error, "expired_fixture_file_failed");
    assert(!(await service.from("app_signup_intake_capabilities").insert({
      intake_id: expiredIntake, intake_file_id: expiredFile, capability_type: "quarantine_upload",
      token_sha256: await sha256(expiredRaw), issued_at: created, expires_at: expired, created_at: created,
    })).error, "expired_fixture_capability_failed");
    const expiredResult = await service.rpc("app_signup_quarantine_confirm_v1", {
      p_intake_id: expiredIntake, p_file_id: expiredFile,
      p_upload_token_sha256: await sha256(expiredRaw), p_actual_size_bytes: null,
      p_detected_mime_type: null, p_server_sha256: null, p_failure_code: "object_missing",
      p_payload_hash: await sha256("expired"), p_request_id: key("expired"),
      p_idempotency_key: key("expired"), p_ip_hash: null, p_user_agent_hash: null,
      p_environment: "local-proof",
    });
    assert(!expiredResult.error && (expiredResult.data as Json)?.code === "upload_expired", "expired_capability_not_rejected");
  });

  await run("Q08_immutable_replacement_and_current_revision", async () => {
    const replacement = await issue("location_a_energy", new TextEncoder().encode("%PDF-1.7\n09B1-B\n%%EOF"));
    assert(Number(replacement.response.revision_number) === 2, "replacement_revision_not_incremented");
    const rows = await service.from("app_signup_intake_files")
      .select("id,status,revision_number,superseded_by_intake_file_id,sha256,storage_path")
      .eq("intake_id", intakeId).eq("client_slot_id", "location_a_energy").order("revision_number");
    assert(!rows.error && rows.data.length === 2 && rows.data[0].status === "superseded" &&
      rows.data[0].superseded_by_intake_file_id === replacement.response.file_reference &&
      rows.data[1].status === "upload_issued", "immutable_revision_chain_invalid");
    const active = rows.data.filter((row) => !["superseded", "promoted", "rejected", "expired"].includes(row.status));
    assert(active.length === 1, "multiple_current_revisions");
    const mutation = await service.from("app_signup_intake_files").update({ sha256: ZERO_HASH })
      .eq("id", rows.data[0].id);
    assert(mutation.error, "immutable_file_hash_changed");
  });

  await run("Q09_concurrent_confirmation_single_winner", async () => {
    const revision = await issue("concurrency_slot", pdfA);
    await upload(revision);
    const [a, b] = await Promise.all([confirm(revision), confirm(revision)]);
    const winners = [a, b].filter((value) => !value.error && (value.data as Json)?.ok === true);
    assert(winners.length === 1, "concurrent_confirmation_winner_count_invalid");
    const current = await service.from("app_signup_intake_files").select("id", { count: "exact", head: true })
      .eq("intake_id", intakeId).eq("client_slot_id", "concurrency_slot").eq("status", "confirmed_quarantine");
    assert(!current.error && current.count === 1, "concurrent_current_count_invalid");
  });

  await run("Q10_binding_isolation_and_gating_source", async () => {
    const bindings = [
      ["account_kvk", "organization_extract"],
      ["location_b_energy", "energy_bill_or_contract"],
      ["charger_a_installation", "installation_invoice"],
      ["charger_b_installation", "installation_invoice"],
    ] as const;
    for (const [slot, type] of bindings) await issue(slot, pdfA, { type });
    const rows = await service.from("app_signup_intake_files").select("client_slot_id,revision_number,status")
      .eq("intake_id", intakeId).in("client_slot_id", bindings.map(([slot]) => slot));
    assert(!rows.error && rows.data.length === bindings.length && new Set(rows.data.map((row) => row.client_slot_id)).size === bindings.length,
      "cross_binding_file_leakage");
    const selectors = await Deno.readTextFile("app/src/features/signup/documentFirstSignupSelectors.ts");
    assert(selectors.includes('quarantineStatus !== "confirmed_quarantine"') &&
      selectors.includes('quarantineStatus === "confirmed_quarantine"'), "confirmed_quarantine_gating_missing");
  });

  await run("Q11_rls_private_storage_and_source_boundaries", async () => {
    const anonInsert = await anon.from("app_signup_intakes").insert({ proof: true });
    const anonUpdate = await anon.from("app_signup_intake_files").update({ status: "rejected" }).eq("id", crypto.randomUUID());
    assert(anonInsert.error && anonUpdate.error, "browser_table_write_allowed");
    const bucket = await service.storage.getBucket("app-documents");
    assert(!bucket.error && bucket.data.public === false, "storage_bucket_not_private");
    const endpointSources = await Promise.all([
      Deno.readTextFile("supabase/functions/api-app-signup-intake-start/index.ts"),
      Deno.readTextFile("supabase/functions/api-app-signup-upload-url/index.ts"),
      Deno.readTextFile("supabase/functions/api-app-signup-upload-confirm/index.ts"),
    ]);
    const joined = endpointSources.join("\n");
    for (const forbidden of ["api-app-signup-submit", "api-dossier-", "dossier_audit_events", 'from("idempotency_keys")']) {
      assert(!joined.includes(forbidden), `forbidden_endpoint_reference:${forbidden}`);
    }
    assert(joined.includes("appOptionsResponse") && joined.includes("getAppRequestMeta"), "cors_or_request_metadata_missing");
  });

  for (const table of entityTables) {
    const count = await service.from(table).select("id", { count: "exact", head: true });
    assert(!count.error && count.count === before.get(table), `entity_count_changed_final:${table}`);
  }

  for (const result of results) console.log(`${result.id}: ${result.ok ? "PASS" : "FAIL"}`);
  const failures = results.filter((result) => !result.ok);
  if (failures.length) throw new Error(`runtime_proof_failed:${failures.map((item) => `${item.id}:${item.detail}`).join(",")}`);
  console.log("signup-quarantine-runtime-09b1-proof-ok");
}

if (import.meta.main) await main();
