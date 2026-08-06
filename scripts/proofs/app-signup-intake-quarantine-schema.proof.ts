// Local destructive proof for the pre-dossier signup intake/quarantine schema.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
// Refuses non-local Supabase targets before fixture mutation.
// Do not print payloads, emails, IDs, hashes, tokens, storage paths, or secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ProofStatus = "PASS" | "FAIL";
type ProofResult = { id: string; status: ProofStatus; detail: string };

type ProofContext = {
  service: any;
  anon: any;
  authed: any;
  migrationSql: string;
  results: ProofResult[];
  intakeIds: Set<string>;
  fileIds: Set<string>;
  capabilityIds: Set<string>;
  authUserId: string | null;
};

const MIGRATION_PATH = "supabase/migrations/20260716100000_app_signup_intake_quarantine_schema.sql";
const ZERO_HASH = "0".repeat(64);
const ONE_HASH = "1".repeat(64);
const TWO_HASH = "2".repeat(64);
const THREE_HASH = "3".repeat(64);
const FOUR_HASH = "4".repeat(64);
const FIVE_HASH = "5".repeat(64);

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function assert(condition: unknown, label: string): void {
  if (!condition) throw new Error(label);
}

function assertLocalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    throw new Error("non_local_supabase_target_rejected");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1" && hostname !== "[::1]") {
    throw new Error("non_local_supabase_target_rejected");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("non_local_supabase_target_rejected");
  }

  return parsed.toString().replace(/\/$/, "");
}

function requireDestructiveLocalProofConfig(): {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
} {
  if (Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") !== "YES") {
    throw new Error("destructive_local_proof_not_enabled");
  }

  return {
    supabaseUrl: assertLocalUrl(requireEnv("SUPABASE_URL")),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: requireEnv("SUPABASE_ANON_KEY"),
  };
}

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function past(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function proofKey(): string {
  return `proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function legalVersions() {
  return {
    items: [
      { type: "consent_bundle", version_ref: "proof-consent-v1" },
      { type: "fee_terms", version_ref: "proof-fee-v1" },
    ],
  };
}

function safePayload() {
  return {
    proof: true,
    shape: "redacted",
  };
}

function intakeInsert(overrides: Record<string, unknown> = {}) {
  return {
    status: "collecting",
    submitted_payload: safePayload(),
    submitted_payload_sha256: ZERO_HASH,
    client_precheck: { parser: "proof", authoritative: false },
    accepted_legal_versions: legalVersions(),
    email_normalized: `${proofKey()}@example.invalid`,
    request_id: proofKey(),
    expires_at: future(60),
    ...overrides,
  };
}

function fileInsert(intakeId: string, overrides: Record<string, unknown> = {}) {
  return {
    intake_id: intakeId,
    client_slot_id: proofKey(),
    document_type: "invoice_or_ownership_evidence",
    original_filename: "proof.pdf",
    declared_mime_type: "application/pdf",
    detected_mime_type: null,
    size_bytes: 128,
    sha256: ONE_HASH,
    storage_bucket: "proof-bucket",
    storage_path: `redacted/${proofKey()}.pdf`,
    status: "expected",
    expires_at: future(60),
    ...overrides,
  };
}

function capabilityInsert(intakeId: string, overrides: Record<string, unknown> = {}) {
  return {
    intake_id: intakeId,
    intake_file_id: null,
    capability_type: "email_verification",
    token_sha256: TWO_HASH,
    issued_at: new Date().toISOString(),
    expires_at: future(60),
    ...overrides,
  };
}

function addResult(ctx: ProofContext, id: string, status: ProofStatus, detail = "ok"): void {
  ctx.results.push({ id, status, detail });
}

async function runCase(ctx: ProofContext, id: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    addResult(ctx, id, "PASS");
  } catch (error) {
    addResult(ctx, id, "FAIL", error instanceof Error ? error.message : String(error));
  }
}

async function expectDbError(label: string, fn: () => Promise<{ error: unknown }>): Promise<void> {
  const result = await fn();
  assert(result.error, label);
}

async function createIntake(ctx: ProofContext, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await ctx.service.from("app_signup_intakes").insert([intakeInsert(overrides)]).select("id").single();
  if (res.error || !res.data?.id) throw new Error("intake_insert_failed");
  const id = String(res.data.id);
  ctx.intakeIds.add(id);
  return id;
}

async function createFile(
  ctx: ProofContext,
  intakeId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await ctx.service.from("app_signup_intake_files").insert([fileInsert(intakeId, overrides)]).select("id")
    .single();
  if (res.error || !res.data?.id) throw new Error("file_insert_failed");
  const id = String(res.data.id);
  ctx.fileIds.add(id);
  return id;
}

async function createCapability(
  ctx: ProofContext,
  intakeId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await ctx.service.from("app_signup_intake_capabilities").insert([capabilityInsert(intakeId, overrides)])
    .select("id")
    .single();
  if (res.error || !res.data?.id) throw new Error("capability_insert_failed");
  const id = String(res.data.id);
  ctx.capabilityIds.add(id);
  return id;
}

async function countTable(ctx: ProofContext, table: string): Promise<number> {
  const res = await ctx.service.from(table).select("id", { count: "exact", head: true });
  if (res.error || typeof res.count !== "number") throw new Error(`count_failed_${table}`);
  return res.count;
}

async function assertNoRoleCrud(client: any, table: string): Promise<void> {
  const select = await client.from(table).select("id").limit(1);
  assert(select.error, `${table}_select_allowed`);

  const insert = await client.from(table).insert([intakeInsert()]);
  assert(insert.error, `${table}_insert_allowed`);

  const update = await client.from(table).update({ status: "expired" }).eq("id", crypto.randomUUID());
  assert(update.error, `${table}_update_allowed`);

  const del = await client.from(table).delete().eq("id", crypto.randomUUID());
  assert(del.error, `${table}_delete_allowed`);
}

async function setupAuthenticatedClient(supabaseUrl: string, anonKey: string, service: any): Promise<{
  authed: any;
  userId: string;
}> {
  const email = `${proofKey()}@example.invalid`;
  const password = `Aa1!${crypto.randomUUID()}x`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user?.id) throw new Error("auth_user_create_failed");

  const authed = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const session = await authed.auth.signInWithPassword({ email, password });
  if (session.error || !session.data.session?.access_token) throw new Error("auth_session_create_failed");

  return { authed, userId: String(created.data.user.id) };
}

async function cleanup(ctx: ProofContext): Promise<void> {
  if (ctx.capabilityIds.size) {
    await ctx.service.from("app_signup_intake_capabilities").delete().in("id", Array.from(ctx.capabilityIds));
  }
  if (ctx.fileIds.size) {
    await ctx.service.from("app_signup_intake_files").delete().in("id", Array.from(ctx.fileIds));
  }
  if (ctx.intakeIds.size) {
    await ctx.service.from("app_signup_intakes").delete().in("id", Array.from(ctx.intakeIds));
  }
  if (ctx.authUserId) {
    await ctx.service.auth.admin.deleteUser(ctx.authUserId);
  }
}

function assertMigrationContains(ctx: ProofContext, needle: string): void {
  assert(ctx.migrationSql.includes(needle), `missing_sql_marker:${needle}`);
}

function assertNoLegacyReferences(ctx: ProofContext): void {
  const forbidden = [
    "public." + "dossiers",
    "public." + "dossier_",
    "dossier" + "_sessions",
    "dossier" + "_audit_events",
    "idempotency" + "_keys",
  ];
  for (const marker of forbidden) {
    assert(!ctx.migrationSql.includes(marker), `legacy_marker_found:${marker}`);
  }
}

export async function runAppSignupIntakeQuarantineSchemaProof(): Promise<void> {
  const cfg = requireDestructiveLocalProofConfig();
  const service = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, { auth: { persistSession: false } });
  const anon = createClient(cfg.supabaseUrl, cfg.anonKey, { auth: { persistSession: false } });
  const auth = await setupAuthenticatedClient(cfg.supabaseUrl, cfg.anonKey, service);
  const migrationSql = await Deno.readTextFile(MIGRATION_PATH);

  const ctx: ProofContext = {
    service,
    anon,
    authed: auth.authed,
    migrationSql,
    results: [],
    intakeIds: new Set(),
    fileIds: new Set(),
    capabilityIds: new Set(),
    authUserId: auth.userId,
  };

  const beforeCustomers = await countTable(ctx, "app_customers");
  const beforeIdentities = await countTable(ctx, "app_customer_identities");
  const beforeDossiers = await countTable(ctx, "app_customer_dossiers");
  const beforeDocumentFiles = await countTable(ctx, "app_dossier_document_files");
  const beforeDocumentVersions = await countTable(ctx, "app_dossier_document_versions");

  try {
    await runCase(ctx, "Q1", async () => {
      await countTable(ctx, "app_signup_intakes");
      await countTable(ctx, "app_signup_intake_files");
      await countTable(ctx, "app_signup_intake_capabilities");
    });

    await runCase(ctx, "Q2", async () => {
      assertMigrationContains(ctx, "constraint app_signup_intakes_status_chk");
      assertMigrationContains(ctx, "constraint app_signup_intake_files_status_chk");
      assertMigrationContains(ctx, "constraint app_signup_intake_capabilities_token_sha256_key");
      assertMigrationContains(ctx, "trg_app_signup_intakes_transition_guard");
      assertMigrationContains(ctx, "trg_app_signup_intake_files_transition_guard");
    });

    await runCase(ctx, "Q3", async () => {
      await assertNoRoleCrud(ctx.anon, "app_signup_intakes");
      await assertNoRoleCrud(ctx.anon, "app_signup_intake_files");
      await assertNoRoleCrud(ctx.anon, "app_signup_intake_capabilities");
    });

    await runCase(ctx, "Q4", async () => {
      await assertNoRoleCrud(ctx.authed, "app_signup_intakes");
      await assertNoRoleCrud(ctx.authed, "app_signup_intake_files");
      await assertNoRoleCrud(ctx.authed, "app_signup_intake_capabilities");
    });

    let mainIntakeId = "";
    await runCase(ctx, "Q5", async () => {
      mainIntakeId = await createIntake(ctx);
      assert(mainIntakeId, "collecting_intake_missing");
    });

    await runCase(ctx, "Q6", async () => {
      assert(await countTable(ctx, "app_customers") === beforeCustomers, "customer_count_changed");
      assert(await countTable(ctx, "app_customer_identities") === beforeIdentities, "identity_count_changed");
      assert(await countTable(ctx, "app_customer_dossiers") === beforeDossiers, "dossier_count_changed");
    });

    await runCase(ctx, "Q7", async () => {
      const res = await ctx.service.from("app_signup_intakes").update({
        status: "pending_verification",
        finalized_at: new Date().toISOString(),
        verification_sent_at: new Date().toISOString(),
      }).eq("id", mainIntakeId);
      if (res.error) throw new Error("collecting_to_pending_failed");
    });

    await runCase(ctx, "Q8", async () => {
      await expectDbError("submitted_payload_changed", () =>
        ctx.service.from("app_signup_intakes").update({ submitted_payload: { changed: true } }).eq("id", mainIntakeId)
      );
    });

    await runCase(ctx, "Q9", async () => {
      await expectDbError("accepted_legal_versions_changed", () =>
        ctx.service.from("app_signup_intakes").update({ accepted_legal_versions: { items: [] } }).eq("id", mainIntakeId)
      );
    });

    await runCase(ctx, "Q10", async () => {
      const res = await ctx.service.from("app_signup_intakes").update({
        status: "promoting",
        verified_at: new Date().toISOString(),
        promotion_started_at: new Date().toISOString(),
      }).eq("id", mainIntakeId);
      if (res.error) throw new Error("pending_to_promoting_failed");
    });

    await runCase(ctx, "Q11", async () => {
      const res = await ctx.service.from("app_signup_intakes").update({
        status: "promoted",
        promoted_at: new Date().toISOString(),
        promotion_dossier_id: crypto.randomUUID(),
      }).eq("id", mainIntakeId);
      if (res.error) throw new Error("promoting_to_promoted_failed");
    });

    await runCase(ctx, "Q12", async () => {
      await expectDbError("promoted_not_terminal", () =>
        ctx.service.from("app_signup_intakes").update({ verification_sent_at: new Date().toISOString() }).eq(
          "id",
          mainIntakeId,
        )
      );
    });

    await runCase(ctx, "Q13", async () => {
      const expiredId = await createIntake(ctx);
      const pending = await ctx.service.from("app_signup_intakes").update({
        status: "pending_verification",
        finalized_at: new Date().toISOString(),
      }).eq("id", expiredId);
      if (pending.error) throw new Error("prepare_expired_failed");
      const expired = await ctx.service.from("app_signup_intakes").update({
        status: "expired",
        expired_at: new Date().toISOString(),
      }).eq("id", expiredId);
      if (expired.error) throw new Error("expire_failed");
      await expectDbError("expired_not_terminal", () =>
        ctx.service.from("app_signup_intakes").update({ verification_sent_at: new Date().toISOString() }).eq(
          "id",
          expiredId,
        )
      );
    });

    await runCase(ctx, "Q14", async () => {
      const invalidId = await createIntake(ctx);
      await expectDbError("invalid_transition_allowed", () =>
        ctx.service.from("app_signup_intakes").update({ status: "promoted" }).eq("id", invalidId)
      );
    });

    await runCase(ctx, "Q15", async () => {
      await expectDbError("expiry_not_required_after_created", () =>
        ctx.service.from("app_signup_intakes").insert([intakeInsert({ expires_at: past(5) })])
      );
    });

    let fileIntakeId = "";
    let fileId = "";
    await runCase(ctx, "Q16", async () => {
      fileIntakeId = await createIntake(ctx);
      fileId = await createFile(ctx, fileIntakeId, { client_slot_id: "duplicate-proof-slot" });
      await expectDbError("duplicate_client_slot_allowed", () =>
        ctx.service.from("app_signup_intake_files").insert([
          fileInsert(fileIntakeId, { client_slot_id: "duplicate-proof-slot", sha256: THREE_HASH }),
        ])
      );
    });

    await runCase(ctx, "Q17", async () => {
      const issued = await ctx.service.from("app_signup_intake_files").update({
        status: "upload_issued",
        issued_at: new Date().toISOString(),
      }).eq("id", fileId);
      if (issued.error) throw new Error("file_issue_failed");
      const confirmed = await ctx.service.from("app_signup_intake_files").update({
        status: "confirmed_quarantine",
        uploaded_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        detected_mime_type: "application/pdf",
      }).eq("id", fileId);
      if (confirmed.error) throw new Error("file_confirm_failed");
      await expectDbError("confirmed_metadata_rewritten", () =>
        ctx.service.from("app_signup_intake_files").update({ detected_mime_type: "text/plain" }).eq("id", fileId)
      );
    });

    await runCase(ctx, "Q18", async () => {
      const promoted = await ctx.service.from("app_signup_intake_files").update({
        status: "promoted",
        promoted_at: new Date().toISOString(),
        promoted_document_file_id: crypto.randomUUID(),
      }).eq("id", fileId);
      if (promoted.error) throw new Error("file_promote_failed");
    });

    await runCase(ctx, "Q19", async () => {
      const capIntake = await createIntake(ctx);
      await createCapability(ctx, capIntake, { token_sha256: FOUR_HASH });
    });

    await runCase(ctx, "Q20", async () => {
      const capIntake = await createIntake(ctx);
      await createCapability(ctx, capIntake, { token_sha256: FIVE_HASH });
      await expectDbError("duplicate_token_hash_allowed", () =>
        ctx.service.from("app_signup_intake_capabilities").insert([
          capabilityInsert(capIntake, { token_sha256: FIVE_HASH }),
        ])
      );
    });

    await runCase(ctx, "Q21", async () => {
      const capIntake = await createIntake(ctx);
      await expectDbError("upload_capability_without_file_allowed", () =>
        ctx.service.from("app_signup_intake_capabilities").insert([
          capabilityInsert(capIntake, { capability_type: "quarantine_upload", token_sha256: "6".repeat(64) }),
        ])
      );
    });

    await runCase(ctx, "Q22", async () => {
      const capIntake = await createIntake(ctx);
      const capFile = await createFile(ctx, capIntake, { client_slot_id: "cap-file-proof", sha256: "7".repeat(64) });
      await expectDbError("email_capability_with_file_allowed", () =>
        ctx.service.from("app_signup_intake_capabilities").insert([
          capabilityInsert(capIntake, {
            intake_file_id: capFile,
            capability_type: "email_verification",
            token_sha256: "8".repeat(64),
          }),
        ])
      );
    });

    await runCase(ctx, "Q23", async () => {
      const capIntake = await createIntake(ctx);
      await expectDbError("expired_capability_consumed_allowed", () =>
        ctx.service.from("app_signup_intake_capabilities").insert([
          capabilityInsert(capIntake, {
            token_sha256: "9".repeat(64),
            issued_at: past(60),
            expires_at: past(30),
            consumed_at: past(10),
          }),
        ])
      );
    });

    await runCase(ctx, "Q24", () => {
      assert(!ctx.migrationSql.includes("raw_token"), "raw_token_column_found");
      assert(!ctx.migrationSql.includes("token text"), "token_text_column_found");
    });

    await runCase(ctx, "Q25", () => {
      assertMigrationContains(ctx, "create policy deny_all");
      assertMigrationContains(ctx, "revoke all on table public.app_signup_intakes from anon");
      assertMigrationContains(ctx, "revoke all on table public.app_signup_intake_files from authenticated");
      assert(!ctx.migrationSql.includes("create policy") || !ctx.migrationSql.includes("using (true)"), "open_policy_found");
    });

    await runCase(ctx, "Q26", async () => {
      assert(await countTable(ctx, "app_dossier_document_files") === beforeDocumentFiles, "document_file_count_changed");
      assert(
        await countTable(ctx, "app_dossier_document_versions") === beforeDocumentVersions,
        "document_version_count_changed",
      );
    });

    await runCase(ctx, "Q27", () => {
      assert(!ctx.migrationSql.includes("interval '7 days'"), "seven_day_ttl_found");
      assert(!ctx.migrationSql.includes("interval '14 days'"), "fourteen_day_ttl_found");
      assert(!ctx.migrationSql.includes("interval '30 days'"), "thirty_day_ttl_found");
      assert(!ctx.migrationSql.includes("default now() +"), "hardcoded_expiry_default_found");
    });

    await runCase(ctx, "Q28", () => {
      assertMigrationContains(ctx, "Exact TTL and minimization intervals are still an operational decision");
      assertMigrationContains(ctx, "remain an operational decision");
    });

    await runCase(ctx, "Q29", async () => {
      assert(await countTable(ctx, "app_dossier_document_files") === beforeDocumentFiles, "document_file_count_changed");
      assert(
        await countTable(ctx, "app_dossier_document_versions") === beforeDocumentVersions,
        "document_version_count_changed",
      );
    });

    await runCase(ctx, "Q30", () => {
      assertNoLegacyReferences(ctx);
    });
  } finally {
    await cleanup(ctx);
  }

  const failed = ctx.results.filter((result) => result.status === "FAIL");
  for (const result of ctx.results) {
    console.log(`${result.id}: ${result.status}`);
  }
  if (failed.length) {
    throw new Error(`schema_proof_failed:${failed.map((result) => `${result.id}:${result.detail}`).join(",")}`);
  }
}

if (import.meta.main) {
  await runAppSignupIntakeQuarantineSchemaProof();
  console.log("app-signup-intake-quarantine-schema-proof-ok");
}
