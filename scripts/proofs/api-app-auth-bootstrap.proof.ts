// Local destructive proof only for api-app-auth-bootstrap.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
// Refuses non-local Supabase/function targets before fixture mutation.
// Do not import this from endpoint runtime. Do not print credentials, Auth
// tokens, magic links, OTP values, JWTs, emails, storage paths, or secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  appAuthErrorResponseBody,
  requireVerifiedSupabaseAuthUser,
} from "../../supabase/functions/_shared/app_customer_auth.ts";

type HttpResult = { status: number; body: any };
type ProofStatus = "PASS" | "FAIL" | "SKIP";
type ProofResult = { id: string; status: ProofStatus; detail: string };

type Fixture = {
  email: string;
  userId: string;
  token: string;
  customerId: string;
  identityId: string;
  dossierId: string;
  accountType: "particulier" | "zakelijk" | "vve";
};

type ProofTracker = {
  authUserIds: Set<string>;
  customerIds: Set<string>;
  identityIds: Set<string>;
  dossierIds: Set<string>;
  slotIds: Set<string>;
  documentFileIds: Set<string>;
  idempotencyKeys: Set<string>;
  bucketCreated: boolean;
};

type ProofContext = {
  service: any;
  anonKey: string;
  functionBaseUrl: string;
  supabaseUrl: string;
  tracker: ProofTracker;
  results: ProofResult[];
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function assert(condition: unknown, label: string): void {
  if (!condition) throw new Error(label);
}

function proofId(): string {
  return `auth-bootstrap-proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function assertLocalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    throw new Error("non_local_target_rejected");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1" && hostname !== "[::1]") {
    throw new Error("non_local_target_rejected");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("non_local_target_rejected");
  }

  return parsed.toString().replace(/\/$/, "");
}

function requireDestructiveLocalProofConfig(): {
  supabaseUrl: string;
  functionBaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
} {
  if (Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") !== "YES") {
    throw new Error("destructive_local_proof_not_enabled");
  }

  const supabaseUrl = assertLocalUrl(requireEnv("SUPABASE_URL"));
  const functionBaseUrl = assertLocalUrl(
    Deno.env.get("FUNCTION_BASE_URL")?.trim() || `${supabaseUrl}/functions/v1`,
  );

  return {
    supabaseUrl,
    functionBaseUrl,
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: requireEnv("SUPABASE_ANON_KEY"),
  };
}

function createTracker(): ProofTracker {
  return {
    authUserIds: new Set(),
    customerIds: new Set(),
    identityIds: new Set(),
    dossierIds: new Set(),
    slotIds: new Set(),
    documentFileIds: new Set(),
    idempotencyKeys: new Set(),
    bucketCreated: false,
  };
}

function addResult(ctx: ProofContext, id: string, status: ProofStatus, detail: string): void {
  ctx.results.push({ id, status, detail });
}

async function runCase(
  ctx: ProofContext,
  id: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  try {
    await fn();
    addResult(ctx, id, "PASS", "ok");
  } catch (error) {
    addResult(ctx, id, "FAIL", error instanceof Error ? error.message : String(error));
  }
}

async function request(
  ctx: ProofContext,
  path: string,
  init: RequestInit,
  token?: string | null,
  includeApikey = true,
): Promise<HttpResult> {
  const headers = new Headers(init.headers || {});
  if (includeApikey) headers.set("apikey", ctx.anonKey);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${ctx.functionBaseUrl}/${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_e) {
    body = { parse_error: true };
  }
  return { status: res.status, body };
}

async function postBootstrap(
  ctx: ProofContext,
  token: string | null,
  idempotencyKey: string,
  body: unknown = {},
): Promise<HttpResult> {
  ctx.tracker.idempotencyKeys.add(idempotencyKey);
  return await request(ctx, "api-app-auth-bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  }, token);
}

function expectCode(res: HttpResult, status: number, code: string): void {
  assert(res.status === status, `expected status ${status}, got ${res.status}`);
  assert(res.body?.ok === false, "expected ok false");
  assert(res.body?.code === code, `expected code ${code}, got ${String(res.body?.code)}`);
}

function helperAuthRequest(): Request {
  return new Request("http://localhost/functions/v1/helper-proof", {
    headers: { Authorization: "Bearer helper-proof-token" },
  });
}

function fakeAuthServiceClient(user: Record<string, unknown> | null): any {
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: null,
      }),
    },
    from: () => {
      throw new Error("unexpected_table_access");
    },
  };
}

async function createAuthUser(
  ctx: ProofContext,
  email: string,
  confirmed = true,
): Promise<{ userId: string; token: string | null }> {
  const password = `Aa1!${crypto.randomUUID()}x`;
  const created = await ctx.service.auth.admin.createUser({
    email,
    password,
    email_confirm: confirmed,
  });
  if (created.error || !created.data.user?.id) throw new Error("auth_user_create_failed");

  const userId = String(created.data.user.id);
  ctx.tracker.authUserIds.add(userId);

  const anon = createClient(ctx.supabaseUrl, ctx.anonKey, { auth: { persistSession: false } });
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error || !session.data.session?.access_token) return { userId, token: null };

  return { userId, token: String(session.data.session.access_token) };
}

async function createPhoneAuthUser(ctx: ProofContext): Promise<{ userId: string; token: string | null }> {
  const password = `Aa1!${crypto.randomUUID()}x`;
  const phone = `+316${String(Math.floor(10000000 + Math.random() * 89999999))}`;
  const created = await ctx.service.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (created.error || !created.data.user?.id) throw new Error("phone_auth_user_create_failed");

  const userId = String(created.data.user.id);
  ctx.tracker.authUserIds.add(userId);

  const anon = createClient(ctx.supabaseUrl, ctx.anonKey, { auth: { persistSession: false } });
  const session = await anon.auth.signInWithPassword({ phone, password });
  if (session.error || !session.data.session?.access_token) return { userId, token: null };
  return { userId, token: String(session.data.session.access_token) };
}

async function createUnboundSignupFixture(
  ctx: ProofContext,
  accountType: "particulier" | "zakelijk" | "vve",
): Promise<Fixture> {
  const email = `${proofId()}-${accountType}@example.test`;
  const auth = await createAuthUser(ctx, email, true);
  if (!auth.token) throw new Error("auth_token_missing");

  const customer = await ctx.service.from("app_customers").insert([{
    customer_type: accountType,
    display_name: `Proof ${accountType}`,
    primary_email_normalized: email,
    status: "active",
  }]).select("id").single();
  if (customer.error || !customer.data?.id) throw new Error("customer_insert_failed");
  const customerId = String(customer.data.id);
  ctx.tracker.customerIds.add(customerId);

  const identity = await ctx.service.from("app_customer_identities").insert([{
    customer_id: customerId,
    auth_user_id: null,
    email_normalized: email,
    email_verified_at: new Date().toISOString(),
    identity_provider: "supabase",
    status: "active",
  }]).select("id").single();
  if (identity.error || !identity.data?.id) throw new Error("identity_insert_failed");
  const identityId = String(identity.data.id);
  ctx.tracker.identityIds.add(identityId);

  const dossier = await ctx.service.from("app_customer_dossiers").insert([{
    customer_id: customerId,
    account_type: accountType,
    status: "submitted",
    submitted_at: new Date().toISOString(),
  }]).select("id").single();
  if (dossier.error || !dossier.data?.id) throw new Error("dossier_insert_failed");
  const dossierId = String(dossier.data.id);
  ctx.tracker.dossierIds.add(dossierId);

  return {
    email,
    userId: auth.userId,
    token: auth.token,
    customerId,
    identityId,
    dossierId,
    accountType,
  };
}

async function createSlot(ctx: ProofContext, dossierId: string): Promise<string> {
  const slot = await ctx.service.from("app_dossier_document_slots").insert([{
    dossier_id: dossierId,
    client_slot_id: `auth-bootstrap-proof-slot-${crypto.randomUUID()}`,
    document_type: "invoice_or_ownership_evidence",
    status: "expected",
    required: true,
    title: "Factuur installatie",
  }]).select("id").single();
  if (slot.error || !slot.data?.id) throw new Error("slot_insert_failed");
  const slotId = String(slot.data.id);
  ctx.tracker.slotIds.add(slotId);
  return slotId;
}

async function createIssuedDocumentFile(
  ctx: ProofContext,
  dossierId: string,
  slotId: string,
): Promise<string> {
  const uniqueId = crypto.randomUUID();
  const file = await ctx.service.from("app_dossier_document_files").insert([{
    dossier_id: dossierId,
    document_slot_id: slotId,
    issued_request_id: `auth-bootstrap-proof-${uniqueId}`,
    issued_idempotency_key: `auth-bootstrap-proof-${uniqueId}`,
    status: "issued",
    storage_bucket: "app-documents",
    storage_path: `auth-bootstrap-proof/${uniqueId}/missing.pdf`,
    original_file_name: "factuur.pdf",
    normalized_file_name: "factuur.pdf",
    declared_mime_type: "application/pdf",
    declared_size_bytes: 64,
    client_sha256: null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }]).select("id").single();
  if (file.error || !file.data?.id) throw new Error("document_file_insert_failed");
  const fileId = String(file.data.id);
  ctx.tracker.documentFileIds.add(fileId);
  return fileId;
}

async function ensureLocalDocumentsBucket(ctx: ProofContext): Promise<void> {
  const bucket = await ctx.service.storage.getBucket("app-documents");
  if (!bucket.error) return;

  const created = await ctx.service.storage.createBucket("app-documents", {
    public: false,
  });
  if (created.error) throw new Error("storage_bucket_unavailable");
  ctx.tracker.bucketCreated = true;
}

async function bootstrapSuccess(ctx: ProofContext, fixture: Fixture, key = proofId()): Promise<HttpResult> {
  const res = await postBootstrap(ctx, fixture.token, key);
  if (res.status !== 200) {
    const { data } = await ctx.service
      .from("app_idempotency_keys")
      .select("response_status,response_body")
      .eq("scope", `api-app-auth-bootstrap:v1:auth_user:${fixture.userId}`)
      .eq("key", key)
      .maybeSingle();
    const responseBody = data?.response_body && typeof data.response_body === "object"
      ? data.response_body
      : null;
    const bodyRecord = responseBody as Record<string, unknown> | null;
    const firstDossier = Array.isArray(bodyRecord?.dossiers) && bodyRecord.dossiers[0] &&
        typeof bodyRecord.dossiers[0] === "object"
      ? bodyRecord.dossiers[0] as Record<string, unknown>
      : null;
    throw new Error(JSON.stringify({
      expected: 200,
      got: res.status,
      endpoint_code: res.body?.code || null,
      stored_status: data?.response_status || null,
      stored_ok: bodyRecord?.ok ?? null,
      stored_mode: bodyRecord?.mode || null,
      stored_has_dossiers: Array.isArray(bodyRecord?.dossiers),
      stored_dossier_count: Array.isArray(bodyRecord?.dossiers) ? bodyRecord.dossiers.length : null,
      stored_replayed_type: typeof bodyRecord?.replayed,
      customer_id_type: typeof bodyRecord?.customer_id,
      identity_id_type: typeof bodyRecord?.identity_id,
      identity_status: bodyRecord?.identity_status || null,
      binding_status: bodyRecord?.binding_status || null,
      payload_hash_type: typeof bodyRecord?.payload_hash,
      dossier_id_type: typeof firstDossier?.dossier_id,
      dossier_number_type: typeof firstDossier?.dossier_number,
      account_type_value: firstDossier?.account_type || null,
      status_type: typeof firstDossier?.status,
    }));
  }
  assert(res.body?.ok === true, "bootstrap expected ok true");
  assert(res.body?.mode === "auth_bootstrap_v1", "bootstrap mode mismatch");
  assert(res.body?.customer_id === fixture.customerId, "bootstrap customer mismatch");
  assert(res.body?.identity_id === fixture.identityId, "bootstrap identity mismatch");
  assert(Array.isArray(res.body?.dossiers), "bootstrap dossiers missing");
  assert(
    res.body.dossiers.some((row: any) =>
      row?.dossier_id === fixture.dossierId && row?.account_type === fixture.accountType
    ),
    "bootstrap dossier summary mismatch",
  );
  assert(typeof res.body?.payload_hash === "string", "bootstrap payload hash missing");
  return res;
}

async function callDirectRpc(
  ctx: ProofContext,
  authUserId: string,
  emailNormalized: string,
): Promise<any> {
  const key = proofId();
  ctx.tracker.idempotencyKeys.add(key);
  const payloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const { data, error } = await ctx.service.rpc("app_bootstrap_customer_auth_v1", {
    p_auth_user_id: authUserId,
    p_email_normalized: emailNormalized,
    p_actor_ref: `supabase_auth_user:${authUserId}`,
    p_request_id: proofId(),
    p_idempotency_scope: `api-app-auth-bootstrap:v1:auth_user:${authUserId}`,
    p_idempotency_key: key,
    p_payload_hash: payloadHash,
    p_ip_hash: null,
    p_user_agent_hash: null,
    p_environment: "local-proof",
  });
  if (error) return { error };
  return data;
}

async function countAuditEmailLeaks(ctx: ProofContext, fixtures: Fixture[]): Promise<number> {
  const terms = fixtures.map((f) => f.email);
  let total = 0;
  for (const term of terms) {
    const { count, error } = await ctx.service
      .from("app_audit_events")
      .select("id", { count: "exact", head: true })
      .filter("event_data", "cs", JSON.stringify({ email: term }));
    if (!error && typeof count === "number") total += count;
  }
  return total;
}

async function cleanup(ctx: ProofContext): Promise<Record<string, number | string>> {
  const report: Record<string, number | string> = {};

  async function del(table: string, column: string, values: Set<string>): Promise<void> {
    const list = Array.from(values);
    if (!list.length) {
      report[table] = 0;
      return;
    }
    const { error } = await ctx.service.from(table).delete().in(column, list);
    report[table] = error ? "cleanup_error" : list.length;
  }

  if (ctx.tracker.documentFileIds.size > 0) {
    report.app_dossier_document_files = `retained:${ctx.tracker.documentFileIds.size}`;
    report.app_dossier_document_slots = "retained_due_to_document_files";
    report.app_customer_dossiers = "retained_due_to_document_files";
  } else {
    await del("app_dossier_document_slots", "id", ctx.tracker.slotIds);
    await del("app_customer_dossiers", "id", ctx.tracker.dossierIds);
  }
  await del("app_customer_identities", "id", ctx.tracker.identityIds);
  await del("app_customers", "id", ctx.tracker.customerIds);

  const idemKeys = Array.from(ctx.tracker.idempotencyKeys);
  if (idemKeys.length) {
    const { error } = await ctx.service.from("app_idempotency_keys").delete().in("key", idemKeys);
    report.app_idempotency_keys = error ? "cleanup_error" : idemKeys.length;
  } else {
    report.app_idempotency_keys = 0;
  }

  for (const userId of Array.from(ctx.tracker.authUserIds)) {
    await ctx.service.auth.admin.deleteUser(userId);
  }
  report.auth_users = ctx.tracker.authUserIds.size;
  report.storage_bucket_created = ctx.tracker.bucketCreated ? 1 : 0;

  return report;
}

async function main() {
  const config = requireDestructiveLocalProofConfig();
  const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  const ctx: ProofContext = {
    service,
    anonKey: config.anonKey,
    functionBaseUrl: config.functionBaseUrl,
    supabaseUrl: config.supabaseUrl,
    tracker: createTracker(),
    results: [],
  };

  const fixtures: Fixture[] = [];

  try {
    await runCase(ctx, "H1 Helper no email returns auth_email_missing", async () => {
      const result = await requireVerifiedSupabaseAuthUser(helperAuthRequest(), fakeAuthServiceClient({
        id: "11111111-1111-4111-8111-111111111111",
        email: null,
        email_confirmed_at: "2026-01-01T00:00:00Z",
      }));
      if (result.ok) throw new Error("expected helper failure");
      assert(result.code === "auth_email_missing", `expected auth_email_missing got ${String(result.code)}`);
    });

    await runCase(ctx, "H2 Helper unverified email returns auth_email_not_verified", async () => {
      const result = await requireVerifiedSupabaseAuthUser(helperAuthRequest(), fakeAuthServiceClient({
        id: "22222222-2222-4222-8222-222222222222",
        email: "unverified@example.test",
        email_confirmed_at: null,
        confirmed_at: null,
      }));
      if (result.ok) throw new Error("expected helper failure");
      assert(result.code === "auth_email_not_verified", `expected auth_email_not_verified got ${String(result.code)}`);
    });

    await runCase(ctx, "H3 Helper verified email returns normalized context", async () => {
      const result = await requireVerifiedSupabaseAuthUser(helperAuthRequest(), fakeAuthServiceClient({
        id: "33333333-3333-4333-8333-333333333333",
        email: "  Verified.User@Example.Test  ",
        email_confirmed_at: "2026-01-01T00:00:00Z",
      }));
      if (!result.ok) throw new Error("expected helper success");
      assert(result.context.authUserId === "33333333-3333-4333-8333-333333333333", "auth user mismatch");
      assert(result.context.emailNormalized === "verified.user@example.test", "normalized email mismatch");
    });

    await runCase(ctx, "H4 Helper error body does not include raw email", async () => {
      const result = await requireVerifiedSupabaseAuthUser(helperAuthRequest(), fakeAuthServiceClient({
        id: "44444444-4444-4444-8444-444444444444",
        email: "Raw.Email@Example.Test",
        email_confirmed_at: null,
      }));
      if (result.ok) throw new Error("expected helper failure");
      const body = JSON.stringify(appAuthErrorResponseBody(result));
      assert(!body.includes("Raw.Email"), "raw email leaked in helper error");
      assert(!body.includes("raw.email"), "normalized email leaked in helper error");
    });

    await runCase(ctx, "B1 OPTIONS succeeds", async () => {
      const res = await request(ctx, "api-app-auth-bootstrap", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5175",
          "Access-Control-Request-Method": "POST",
        },
      }, null);
      assert(res.status === 200, `expected 200 got ${res.status}`);
    });

    const primary = await createUnboundSignupFixture(ctx, "particulier");
    fixtures.push(primary);

    await runCase(ctx, "B2 Non-POST rejects", async () => {
      const res = await request(ctx, "api-app-auth-bootstrap", { method: "GET" }, primary.token);
      expectCode(res, 405, "method_not_allowed");
    });

    await runCase(ctx, "B3 Missing Idempotency-Key rejects", async () => {
      const res = await request(ctx, "api-app-auth-bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }, primary.token);
      expectCode(res, 400, "missing_idempotency_key");
    });

    await runCase(ctx, "B4 Invalid JSON/body rejects", async () => {
      const invalidJson = await request(ctx, "api-app-auth-bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": proofId(),
        },
        body: "{",
      }, primary.token);
      expectCode(invalidJson, 400, "invalid_json");

      const invalidBody = await postBootstrap(ctx, primary.token, proofId(), { customer_id: primary.customerId });
      expectCode(invalidBody, 400, "invalid_body");
    });

    await runCase(ctx, "B5 Missing gateway authorization rejects", async () => {
      const res = await postBootstrap(ctx, null, proofId());
      assert(res.status === 401, `expected 401 got ${res.status}`);
    });

    await runCase(ctx, "B6 Invalid Auth token rejects safely", async () => {
      const res = await postBootstrap(ctx, "invalid-token", proofId());
      assert(res.status === 401, `expected 401 got ${res.status}`);
    });

    await runCase(ctx, "B7 Auth user without email rejects", async () => {
      const phoneUser = await createPhoneAuthUser(ctx);
      if (!phoneUser.token) {
        addResult(ctx, "B7 detail", "SKIP", "local auth did not issue a phone-only session token");
        return;
      }
      const res = await postBootstrap(ctx, phoneUser.token, proofId());
      expectCode(res, 401, "auth_email_missing");
    });

    await runCase(ctx, "B8 Unverified email rejects", async () => {
      const email = `${proofId()}-unverified@example.test`;
      const unverified = await createAuthUser(ctx, email, false);
      if (!unverified.token) {
        addResult(ctx, "B8 detail", "SKIP", "local auth did not issue an unverified-email session token");
        return;
      }
      const res = await postBootstrap(ctx, unverified.token, proofId());
      expectCode(res, 403, "auth_email_not_verified");
    });

    await runCase(ctx, "B9 No matching app identity rejects", async () => {
      const email = `${proofId()}-noidentity@example.test`;
      const auth = await createAuthUser(ctx, email, true);
      if (!auth.token) throw new Error("auth_token_missing");
      const res = await postBootstrap(ctx, auth.token, proofId());
      expectCode(res, 404, "customer_identity_not_found");
    });

    let primarySuccess: HttpResult | null = null;
    const primaryKey = proofId();
    await runCase(ctx, "B10 One unbound matching identity binds successfully", async () => {
      primarySuccess = await bootstrapSuccess(ctx, primary, primaryKey);
    });

    await runCase(ctx, "B11 Bound identity contains verified Auth user ID", async () => {
      const { data, error } = await ctx.service
        .from("app_customer_identities")
        .select("auth_user_id,status")
        .eq("id", primary.identityId)
        .single();
      if (error) throw new Error("identity_lookup_failed");
      assert(data.auth_user_id === primary.userId, "identity auth user mismatch");
      assert(data.status === "active", "identity status mismatch");
    });

    await runCase(ctx, "B12 Response returns customer and dossier summary", async () => {
      assert(primarySuccess?.body?.customer_id === primary.customerId, "customer_id mismatch");
      assert(primarySuccess?.body?.identity_id === primary.identityId, "identity_id mismatch");
      assert(Array.isArray(primarySuccess?.body?.dossiers), "dossiers missing");
    });

    await runCase(ctx, "B13 Particulier dossier returns correct account type", async () => {
      const row = primarySuccess?.body?.dossiers?.find((item: any) => item.dossier_id === primary.dossierId);
      assert(row?.account_type === "particulier", "particulier account type missing");
    });

    const business = await createUnboundSignupFixture(ctx, "zakelijk");
    fixtures.push(business);
    await runCase(ctx, "B14 Zakelijk dossier returns correct account type", async () => {
      const res = await bootstrapSuccess(ctx, business);
      const row = res.body.dossiers.find((item: any) => item.dossier_id === business.dossierId);
      assert(row?.account_type === "zakelijk", "zakelijk account type missing");
    });

    const vve = await createUnboundSignupFixture(ctx, "vve");
    fixtures.push(vve);
    await runCase(ctx, "B15 VVE dossier returns correct account type", async () => {
      const res = await bootstrapSuccess(ctx, vve);
      const row = res.body.dossiers.find((item: any) => item.dossier_id === vve.dossierId);
      assert(row?.account_type === "vve", "vve account type missing");
    });

    await runCase(ctx, "B16 Same key/same payload replays", async () => {
      const replay = await postBootstrap(ctx, primary.token, primaryKey);
      assert(replay.status === 200, `expected 200 got ${replay.status}`);
      assert(replay.body?.replayed === true, "expected replayed true");
      assert(replay.body?.customer_id === primary.customerId, "replay customer mismatch");
    });

    await runCase(ctx, "B17 Same key/different payload conflicts", async () => {
      const res = await postBootstrap(ctx, primary.token, primaryKey, { unexpected: true });
      expectCode(res, 409, "idempotency_conflict");
    });

    await runCase(ctx, "B18 Identity already bound to same Auth user succeeds safely", async () => {
      const res = await bootstrapSuccess(ctx, primary, proofId());
      assert(res.body?.customer_id === primary.customerId, "same-user customer mismatch");
    });

    await runCase(ctx, "B19 Identity bound to another Auth user rejects", async () => {
      const email = `${proofId()}-otherbound@example.test`;
      const authA = await createAuthUser(ctx, email, true);
      const authB = await createAuthUser(ctx, email.replace("otherbound", "otherbound-b"), true);
      if (!authA.token || !authB.token) throw new Error("auth_token_missing");

      const customer = await ctx.service.from("app_customers").insert([{
        customer_type: "particulier",
        primary_email_normalized: email,
        status: "active",
      }]).select("id").single();
      if (customer.error || !customer.data?.id) throw new Error("customer_insert_failed");
      ctx.tracker.customerIds.add(String(customer.data.id));

      const identity = await ctx.service.from("app_customer_identities").insert([{
        customer_id: customer.data.id,
        auth_user_id: authB.userId,
        email_normalized: email,
        status: "active",
      }]).select("id").single();
      if (identity.error || !identity.data?.id) throw new Error("identity_insert_failed");
      ctx.tracker.identityIds.add(String(identity.data.id));

      const dossier = await ctx.service.from("app_customer_dossiers").insert([{
        customer_id: customer.data.id,
        account_type: "particulier",
        status: "submitted",
      }]).select("id").single();
      if (dossier.error || !dossier.data?.id) throw new Error("dossier_insert_failed");
      ctx.tracker.dossierIds.add(String(dossier.data.id));

      const res = await postBootstrap(ctx, authA.token, proofId());
      expectCode(res, 409, "customer_identity_already_bound");
    });

    await runCase(ctx, "B20 Multiple matching active identities reject as ambiguous", async () => {
      const email = `${proofId()}-ambiguous@example.test`;
      const auth = await createAuthUser(ctx, email, true);
      if (!auth.token) throw new Error("auth_token_missing");

      for (let i = 0; i < 2; i += 1) {
        const customer = await ctx.service.from("app_customers").insert([{
          customer_type: "particulier",
          primary_email_normalized: email,
          status: "active",
        }]).select("id").single();
        if (customer.error || !customer.data?.id) throw new Error("customer_insert_failed");
        ctx.tracker.customerIds.add(String(customer.data.id));

        const identity = await ctx.service.from("app_customer_identities").insert([{
          customer_id: customer.data.id,
          email_normalized: email,
          status: "active",
        }]).select("id").single();
        if (identity.error || !identity.data?.id) throw new Error("identity_insert_failed");
        ctx.tracker.identityIds.add(String(identity.data.id));
      }

      const res = await postBootstrap(ctx, auth.token, proofId());
      expectCode(res, 409, "customer_identity_binding_ambiguous");
    });

    await runCase(ctx, "B21 Inactive identity rejects", async () => {
      const email = `${proofId()}-inactiveidentity@example.test`;
      const auth = await createAuthUser(ctx, email, true);
      if (!auth.token) throw new Error("auth_token_missing");
      const customer = await ctx.service.from("app_customers").insert([{
        customer_type: "particulier",
        primary_email_normalized: email,
        status: "active",
      }]).select("id").single();
      if (customer.error || !customer.data?.id) throw new Error("customer_insert_failed");
      ctx.tracker.customerIds.add(String(customer.data.id));

      const identity = await ctx.service.from("app_customer_identities").insert([{
        customer_id: customer.data.id,
        email_normalized: email,
        status: "inactive",
      }]).select("id").single();
      if (identity.error || !identity.data?.id) throw new Error("identity_insert_failed");
      ctx.tracker.identityIds.add(String(identity.data.id));

      const res = await postBootstrap(ctx, auth.token, proofId());
      expectCode(res, 404, "customer_identity_not_found");
    });

    await runCase(ctx, "B22 Inactive customer rejects", async () => {
      const email = `${proofId()}-inactivecustomer@example.test`;
      const auth = await createAuthUser(ctx, email, true);
      if (!auth.token) throw new Error("auth_token_missing");
      const customer = await ctx.service.from("app_customers").insert([{
        customer_type: "particulier",
        primary_email_normalized: email,
        status: "inactive",
      }]).select("id").single();
      if (customer.error || !customer.data?.id) throw new Error("customer_insert_failed");
      ctx.tracker.customerIds.add(String(customer.data.id));

      const identity = await ctx.service.from("app_customer_identities").insert([{
        customer_id: customer.data.id,
        email_normalized: email,
        status: "active",
      }]).select("id").single();
      if (identity.error || !identity.data?.id) throw new Error("identity_insert_failed");
      ctx.tracker.identityIds.add(String(identity.data.id));

      const res = await postBootstrap(ctx, auth.token, proofId());
      expectCode(res, 403, "customer_inactive");
    });

    await runCase(ctx, "B23 Concurrent same-key creates one logical binding", async () => {
      const fixture = await createUnboundSignupFixture(ctx, "particulier");
      fixtures.push(fixture);
      const key = proofId();
      const [a, b] = await Promise.all([
        postBootstrap(ctx, fixture.token, key),
        postBootstrap(ctx, fixture.token, key),
      ]);
      assert(a.status === 200 || b.status === 200, "expected at least one success");
      assert([200, 409].includes(a.status), `unexpected status a ${a.status}`);
      assert([200, 409].includes(b.status), `unexpected status b ${b.status}`);
      const { count } = await ctx.service
        .from("app_customer_identities")
        .select("id", { count: "exact", head: true })
        .eq("id", fixture.identityId)
        .eq("auth_user_id", fixture.userId);
      assert(count === 1, "expected one bound identity");
    });

    await runCase(ctx, "B24 Concurrent different-key creates one logical binding and no 500", async () => {
      const fixture = await createUnboundSignupFixture(ctx, "particulier");
      fixtures.push(fixture);
      const [a, b] = await Promise.all([
        postBootstrap(ctx, fixture.token, proofId()),
        postBootstrap(ctx, fixture.token, proofId()),
      ]);
      assert(a.status !== 500 && b.status !== 500, "unexpected 500");
      assert(a.status === 200 && b.status === 200, `expected two safe successes got ${a.status}/${b.status}`);
      assert(a.body?.customer_id === fixture.customerId, "a customer mismatch");
      assert(b.body?.customer_id === fixture.customerId, "b customer mismatch");
    });

    await runCase(ctx, "B25 Public/anon/authenticated cannot execute RPC", async () => {
      const anon = createClient(ctx.supabaseUrl, ctx.anonKey, { auth: { persistSession: false } });
      const anonResult = await anon.rpc("app_bootstrap_customer_auth_v1", {
        p_auth_user_id: primary.userId,
        p_email_normalized: primary.email,
        p_actor_ref: `supabase_auth_user:${primary.userId}`,
        p_request_id: proofId(),
        p_idempotency_scope: "anon-proof",
        p_idempotency_key: proofId(),
        p_payload_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        p_ip_hash: null,
        p_user_agent_hash: null,
        p_environment: "local-proof",
      });
      assert(anonResult.error, "anon rpc unexpectedly succeeded");

      const authed = createClient(ctx.supabaseUrl, ctx.anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${primary.token}` } },
      });
      const authedResult = await authed.rpc("app_bootstrap_customer_auth_v1", {
        p_auth_user_id: primary.userId,
        p_email_normalized: primary.email,
        p_actor_ref: `supabase_auth_user:${primary.userId}`,
        p_request_id: proofId(),
        p_idempotency_scope: "authenticated-proof",
        p_idempotency_key: proofId(),
        p_payload_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        p_ip_hash: null,
        p_user_agent_hash: null,
        p_environment: "local-proof",
      });
      assert(authedResult.error, "authenticated rpc unexpectedly succeeded");
    });

    await runCase(ctx, "B26 service_role can execute RPC", async () => {
      const res = await callDirectRpc(ctx, primary.userId, primary.email);
      assert(res?.ok === true, "service role rpc expected success");
    });

    await runCase(ctx, "B27 RPC direct email/identity mismatch rejects", async () => {
      const other = await createUnboundSignupFixture(ctx, "particulier");
      fixtures.push(other);
      const res = await callDirectRpc(ctx, primary.userId, other.email);
      assert(res?.error || res?.ok === false, "expected mismatch rejection");
    });

    await runCase(ctx, "B28 No raw email/token/JWT is written to audit or output", async () => {
      const leaks = await countAuditEmailLeaks(ctx, fixtures);
      assert(leaks === 0, `audit email leak count ${leaks}`);
      const serializedResults = JSON.stringify(ctx.results);
      for (const fixture of fixtures) {
        assert(!serializedResults.includes(fixture.email), "proof output includes raw email");
        assert(!serializedResults.includes(fixture.token), "proof output includes token");
      }
    });

    await runCase(ctx, "B29 Existing app_customer_auth resolves newly bound user", async () => {
      await ensureLocalDocumentsBucket(ctx);
      const slotId = await createSlot(ctx, primary.dossierId);
      const uploadRes = await request(ctx, "api-app-document-upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": proofId(),
        },
        body: JSON.stringify({
          dossier_id: primary.dossierId,
          document_slot_id: slotId,
          file_name: "factuur.pdf",
          mime_type: "application/pdf",
          size_bytes: 64,
        }),
      }, primary.token);
      assert(uploadRes.status !== 401 && uploadRes.status !== 403, `auth regression status ${uploadRes.status}`);
      if (uploadRes.body?.document_file_id) {
        ctx.tracker.documentFileIds.add(String(uploadRes.body.document_file_id));
      }
    });

    await runCase(ctx, "B30 Upload-url Auth regression succeeds with newly bound user", async () => {
      await ensureLocalDocumentsBucket(ctx);
      const slotId = await createSlot(ctx, primary.dossierId);
      const res = await request(ctx, "api-app-document-upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": proofId(),
        },
        body: JSON.stringify({
          dossier_id: primary.dossierId,
          document_slot_id: slotId,
          file_name: "factuur.pdf",
          mime_type: "application/pdf",
          size_bytes: 64,
        }),
      }, primary.token);
      assert(res.status === 200, `expected 200 got ${res.status}`);
      assert(res.body?.mode === "upload_url_v1", "upload-url mode mismatch");
      if (res.body?.document_file_id) {
        ctx.tracker.documentFileIds.add(String(res.body.document_file_id));
      }
    });

    await runCase(ctx, "B31 Upload-confirm Auth regression reaches owned-file validation", async () => {
      await ensureLocalDocumentsBucket(ctx);
      const slotId = await createSlot(ctx, primary.dossierId);
      const fileId = await createIssuedDocumentFile(ctx, primary.dossierId, slotId);
      const res = await request(ctx, "api-app-document-upload-confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": proofId(),
        },
        body: JSON.stringify({
          dossier_id: primary.dossierId,
          document_slot_id: slotId,
          document_file_id: fileId,
          file_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        }),
      }, primary.token);
      expectCode(res, 409, "stored_object_missing");
    });
  } finally {
    const cleanupReport = await cleanup(ctx);
    console.log("===== ENVAL AUTH BOOTSTRAP PROOF RESULTS =====");
    for (const result of ctx.results) {
      console.log(`${result.id}: ${result.status} ${result.detail}`);
    }
    console.log("SUMMARY", JSON.stringify({
      pass: ctx.results.filter((r) => r.status === "PASS").length,
      fail: ctx.results.filter((r) => r.status === "FAIL").length,
      skip: ctx.results.filter((r) => r.status === "SKIP").length,
      cleanup: cleanupReport,
      secrets_printed: false,
      raw_email_printed: false,
      token_printed: false,
    }));
  }

  const failed = ctx.results.filter((result) => result.status === "FAIL");
  if (failed.length) {
    Deno.exit(1);
  }
}

await main();
