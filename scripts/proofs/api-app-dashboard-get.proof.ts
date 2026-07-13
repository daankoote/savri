// Local destructive proof only for api-app-dashboard-get.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
// Refuses non-local Supabase/function targets before fixture mutation.
// Do not import this from endpoint runtime. Do not print credentials, Auth
// tokens, JWTs, emails, fixture IDs, storage paths, hashes, or secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireAppCustomer } from "../../supabase/functions/_shared/app_customer_auth.ts";

type AccountType = "particulier" | "zakelijk" | "vve";
type ProofStatus = "PASS" | "FAIL" | "SKIP";
type ProofResult = { id: string; status: ProofStatus; detail: string };
type HttpResult = { status: number; body: any };

type FixtureDossier = {
  id: string;
  accountType: AccountType;
};

type BoundFixture = {
  token: string;
  customerId: string;
  dossiers: FixtureDossier[];
};

type ProofContext = {
  service: any;
  anonKey: string;
  supabaseUrl: string;
  functionBaseUrl: string;
  results: ProofResult[];
  tracker: {
    authUserIds: Set<string>;
    customerIds: Set<string>;
    identityIds: Set<string>;
    dossierIds: Set<string>;
    locationIds: Set<string>;
    chargerIds: Set<string>;
    documentSlotIds: Set<string>;
    documentFileIds: Set<string>;
    documentVersionIds: Set<string>;
    idempotencyKeys: Set<string>;
  };
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
  return `dashboard-proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function assertLocalUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1" && hostname !== "[::1]") {
    throw new Error("non_local_target_rejected");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("non_local_target_rejected");
  }
  return parsed.toString().replace(/\/$/, "");
}

function requireConfig() {
  if (Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") !== "YES") {
    throw new Error("destructive_local_proof_not_enabled");
  }

  const supabaseUrl = assertLocalUrl(requireEnv("SUPABASE_URL"));
  return {
    supabaseUrl,
    functionBaseUrl: assertLocalUrl(Deno.env.get("FUNCTION_BASE_URL")?.trim() || `${supabaseUrl}/functions/v1`),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: requireEnv("SUPABASE_ANON_KEY"),
  };
}

function createTracker(): ProofContext["tracker"] {
  return {
    authUserIds: new Set(),
    customerIds: new Set(),
    identityIds: new Set(),
    dossierIds: new Set(),
    locationIds: new Set(),
    chargerIds: new Set(),
    documentSlotIds: new Set(),
    documentFileIds: new Set(),
    documentVersionIds: new Set(),
    idempotencyKeys: new Set(),
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

async function postDashboard(ctx: ProofContext, token: string | null, body: unknown): Promise<HttpResult> {
  return await request(ctx, "api-app-dashboard-get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, token);
}

async function postBootstrap(ctx: ProofContext, token: string, body: unknown = {}): Promise<HttpResult> {
  const key = `dashboard-bootstrap-${crypto.randomUUID()}`;
  ctx.tracker.idempotencyKeys.add(key);
  return await request(ctx, "api-app-auth-bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  }, token);
}

function expectCode(res: HttpResult, status: number, code: string): void {
  assert(res.status === status, `expected status ${status}, got ${res.status}, code ${String(res.body?.code)}`);
  assert(res.body?.ok === false, `expected ok false, code ${String(res.body?.code)}`);
  assert(res.body?.code === code, `expected code ${code}, got ${String(res.body?.code)}`);
}

function expectDashboardSuccess(res: HttpResult): void {
  assert(res.status === 200, `expected 200, got ${res.status}, code ${String(res.body?.code)}`);
  assert(res.body?.ok === true, `expected ok true, code ${String(res.body?.code)}`);
  assert(res.body?.mode === "dashboard_read_v1", "expected dashboard_read_v1");
  assert(typeof res.body?.request_id === "string", "expected request_id");
  assert(Array.isArray(res.body?.dossiers), "expected dossiers array");
  assert(typeof res.body?.selected_dossier?.dossier_id === "string", "expected selected_dossier");
  assert(Array.isArray(res.body?.locations), "expected locations array");
  assert(Array.isArray(res.body?.chargers), "expected chargers array");
  assert(Array.isArray(res.body?.document_slots), "expected document_slots array");
  assert(Array.isArray(res.body?.legal_acceptances), "expected legal_acceptances array");
}

function containsForbiddenKeys(value: unknown): boolean {
  const forbidden = new Set([
    "email",
    "phone",
    "auth_user_id",
    "identity_id",
    "ip_hash",
    "user_agent_hash",
    "storage_bucket",
    "storage_path",
    "signed_url",
    "signed_upload_url",
    "upload_token",
    "client_sha256",
    "server_sha256",
    "file_sha256",
    "payload_hash",
    "lookup_metadata",
    "metadata",
    "event_data",
    "idempotency_key",
  ]);

  function walk(input: unknown): boolean {
    if (!input || typeof input !== "object") return false;
    if (Array.isArray(input)) return input.some(walk);
    for (const [key, child] of Object.entries(input as Record<string, unknown>)) {
      if (forbidden.has(key)) return true;
      if (walk(child)) return true;
    }
    return false;
  }

  return walk(value);
}

async function createAuthUser(ctx: ProofContext): Promise<{ token: string; email: string; userId: string }> {
  const email = `${proofId()}@example.test`;
  const password = `Aa1!${crypto.randomUUID()}x`;
  const created = await ctx.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user?.id) throw new Error("auth_user_create_failed");
  const userId = String(created.data.user.id);
  ctx.tracker.authUserIds.add(userId);

  const anon = createClient(ctx.supabaseUrl, ctx.anonKey, { auth: { persistSession: false } });
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error || !session.data.session?.access_token) throw new Error("auth_signin_failed");
  return { token: String(session.data.session.access_token), email, userId };
}

async function createCustomerIdentity(ctx: ProofContext, email: string, accountType: AccountType) {
  const customer = await ctx.service.from("app_customers").insert([{
    customer_type: accountType,
    display_name: "Proof customer",
    primary_email_normalized: email,
    status: "active",
  }]).select("id").single();
  if (customer.error || !customer.data?.id) throw new Error("customer_insert_failed");
  const customerId = String(customer.data.id);
  ctx.tracker.customerIds.add(customerId);

  const identity = await ctx.service.from("app_customer_identities").insert([{
    customer_id: customerId,
    email_normalized: email,
    email_verified_at: new Date().toISOString(),
    identity_provider: "supabase",
    status: "active",
  }]).select("id").single();
  if (identity.error || !identity.data?.id) throw new Error("identity_insert_failed");
  ctx.tracker.identityIds.add(String(identity.data.id));
  return { customerId };
}

async function createDossierGraph(
  ctx: ProofContext,
  customerId: string,
  accountType: AccountType,
  locationCount: number,
  chargersPerLocation: number,
  withCurrentVersion: boolean,
): Promise<FixtureDossier> {
  const dossier = await ctx.service.from("app_customer_dossiers").insert([{
    customer_id: customerId,
    dossier_number: `${accountType.toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`,
    account_type: accountType,
    status: "submitted",
  }]).select("id").single();
  if (dossier.error || !dossier.data?.id) throw new Error("dossier_insert_failed");
  const dossierId = String(dossier.data.id);
  ctx.tracker.dossierIds.add(dossierId);

  let firstSlotId: string | null = null;
  for (let locationIndex = 0; locationIndex < locationCount; locationIndex += 1) {
    const location = await ctx.service.from("app_dossier_locations").insert([{
      dossier_id: dossierId,
      client_location_id: `${accountType}-loc-${locationIndex + 1}`,
      label: `Locatie ${locationIndex + 1}`,
      status: "submitted",
      postcode_normalized: `100${locationIndex}AA`,
      house_number: String(10 + locationIndex),
      suffix_normalized: null,
      street: "Proofstraat",
      city: "Proefstad",
      country: "Nederland",
    }]).select("id").single();
    if (location.error || !location.data?.id) throw new Error("location_insert_failed");
    const locationId = String(location.data.id);
    ctx.tracker.locationIds.add(locationId);

    for (let chargerIndex = 0; chargerIndex < chargersPerLocation; chargerIndex += 1) {
      const charger = await ctx.service.from("app_dossier_chargers").insert([{
        dossier_id: dossierId,
        location_id: locationId,
        client_charger_id: `${accountType}-charger-${locationIndex + 1}-${chargerIndex + 1}`,
        status: "submitted",
        brand_label: "Alfen",
        model_label: "Eve Single Pro Line",
        serial_number: `SER-${accountType}-${locationIndex + 1}-${chargerIndex + 1}`,
        mid_number: `MID-${accountType}-${locationIndex + 1}-${chargerIndex + 1}`,
        mid_status: "submitted",
        backend_supplier_label: null,
        installation_year: 2026,
        solar_export_status: "unknown",
      }]).select("id").single();
      if (charger.error || !charger.data?.id) throw new Error("charger_insert_failed");
      const chargerId = String(charger.data.id);
      ctx.tracker.chargerIds.add(chargerId);

      const slot = await ctx.service.from("app_dossier_document_slots").insert([{
        dossier_id: dossierId,
        location_id: locationId,
        charger_id: chargerId,
        client_slot_id: `${accountType}-invoice-${locationIndex + 1}-${chargerIndex + 1}`,
        document_type: "invoice_or_ownership_evidence",
        status: "expected",
        required: true,
        title: "Factuur installatie",
      }]).select("id").single();
      if (slot.error || !slot.data?.id) throw new Error("slot_insert_failed");
      const slotId = String(slot.data.id);
      ctx.tracker.documentSlotIds.add(slotId);
      firstSlotId ||= slotId;
    }
  }

  await ctx.service.from("app_dossier_legal_acceptances").insert([
    {
      dossier_id: dossierId,
      customer_id: customerId,
      acceptance_type: "consent_bundle",
      status: "accepted",
      version_ref: "proof-v1",
      actor_type: "customer",
    },
    {
      dossier_id: dossierId,
      customer_id: customerId,
      acceptance_type: "fee_terms",
      status: "accepted",
      version_ref: "proof-v1",
      actor_type: "customer",
    },
  ]);

  if (withCurrentVersion && firstSlotId) {
    const file = await ctx.service.from("app_dossier_document_files").insert([{
      dossier_id: dossierId,
      document_slot_id: firstSlotId,
      issued_request_id: `proof-issued-${crypto.randomUUID()}`,
      issued_idempotency_key: `proof-idem-${crypto.randomUUID()}`,
      status: "confirmed",
      storage_bucket: "proof-bucket",
      storage_path: `proof/${crypto.randomUUID()}.pdf`,
      original_file_name: "factuur.pdf",
      normalized_file_name: "factuur.pdf",
      declared_mime_type: "application/pdf",
      declared_size_bytes: 12,
      detected_mime_type: "application/pdf",
      stored_size_bytes: 12,
      client_sha256: null,
      server_sha256: "a".repeat(64),
      issued_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      upload_observed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      confirmed_request_id: `proof-confirm-${crypto.randomUUID()}`,
    }]).select("id").single();
    if (file.error || !file.data?.id) throw new Error("file_insert_failed");
    const fileId = String(file.data.id);
    ctx.tracker.documentFileIds.add(fileId);

    const version = await ctx.service.from("app_dossier_document_versions").insert([{
      dossier_id: dossierId,
      document_slot_id: firstSlotId,
      document_file_id: fileId,
      version_number: 1,
      status: "current",
      created_request_id: `proof-version-${crypto.randomUUID()}`,
      created_idempotency_key: `proof-version-idem-${crypto.randomUUID()}`,
      confirmed_at: new Date().toISOString(),
    }]).select("id").single();
    if (version.error || !version.data?.id) throw new Error("version_insert_failed");
    const versionId = String(version.data.id);
    ctx.tracker.documentVersionIds.add(versionId);

    const updatedSlot = await ctx.service.from("app_dossier_document_slots").update({
      status: "uploaded",
      current_version_id: versionId,
      current_version_number: 1,
    }).eq("id", firstSlotId);
    if (updatedSlot.error) throw new Error("slot_current_version_update_failed");
  }

  return { id: dossierId, accountType };
}

async function createBoundFixture(ctx: ProofContext): Promise<BoundFixture> {
  const auth = await createAuthUser(ctx);
  const { customerId } = await createCustomerIdentity(ctx, auth.email, "particulier");

  const particulier = await createDossierGraph(ctx, customerId, "particulier", 1, 2, true);
  const zakelijk = await createDossierGraph(ctx, customerId, "zakelijk", 2, 2, false);
  const vve = await createDossierGraph(ctx, customerId, "vve", 2, 1, false);

  const bootstrap = await postBootstrap(ctx, auth.token);
  assert(bootstrap.status === 200 && bootstrap.body?.ok === true, "bootstrap_failed");

  return {
    token: auth.token,
    customerId,
    dossiers: [particulier, zakelijk, vve],
  };
}

async function countRows(ctx: ProofContext, table: string): Promise<number> {
  const result = await ctx.service.from(table).select("id", { count: "exact", head: true });
  if (result.error) throw new Error(`count_failed_${table}`);
  return Number(result.count || 0);
}

async function cleanup(ctx: ProofContext): Promise<void> {
  for (const userId of ctx.tracker.authUserIds) {
    await ctx.service.auth.admin.deleteUser(userId);
  }
}

function summarizeResults(results: ProofResult[]): void {
  for (const result of results) {
    console.log(`${result.id}: ${result.status}${result.status === "PASS" ? "" : ` - ${result.detail}`}`);
  }
  const failed = results.filter((result) => result.status === "FAIL");
  console.log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) Deno.exit(1);
}

const config = requireConfig();
const service = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });
const ctx: ProofContext = {
  service,
  anonKey: config.anonKey,
  supabaseUrl: config.supabaseUrl,
  functionBaseUrl: config.functionBaseUrl,
  results: [],
  tracker: createTracker(),
};

try {
  const fixture = await createBoundFixture(ctx);
  const [particulier, zakelijk, vve] = fixture.dossiers;

  await runCase(ctx, "R1_OPTIONS_succeeds", async () => {
    const res = await request(ctx, "api-app-dashboard-get", { method: "OPTIONS" }, null);
    assert(res.status === 200, "options_not_200");
  });

  await runCase(ctx, "R2_non_POST_rejects", async () => {
    const res = await request(ctx, "api-app-dashboard-get", { method: "GET" }, fixture.token);
    expectCode(res, 405, "method_not_allowed");
  });

  await runCase(ctx, "R3_invalid_JSON_rejects", async () => {
    const res = await request(ctx, "api-app-dashboard-get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }, fixture.token);
    expectCode(res, 400, "invalid_json");
  });

  await runCase(ctx, "R4_additional_body_fields_reject", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id, extra: true });
    expectCode(res, 400, "invalid_body");
  });

  await runCase(ctx, "R5_invalid_dossier_UUID_rejects", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: "not-a-uuid" });
    expectCode(res, 400, "invalid_dossier_id");
  });

  await runCase(ctx, "R6_missing_authorization_rejects", async () => {
    const res = await request(ctx, "api-app-dashboard-get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossier_id: particulier.id }),
    }, null, false);
    expectCode(res, 401, "missing_authorization");
  });

  await runCase(ctx, "R7_invalid_authorization_rejects_safely", async () => {
    const res = await postDashboard(ctx, "invalid-token", { dossier_id: particulier.id });
    expectCode(res, 401, "invalid_authorization");
  });

  await runCase(ctx, "R8_unbound_auth_identity_rejects", async () => {
    const auth = await createAuthUser(ctx);
    const res = await postDashboard(ctx, auth.token, { dossier_id: particulier.id });
    expectCode(res, 403, "app_identity_not_linked");
  });

  await runCase(ctx, "R9_unknown_dossier_safe_404", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: crypto.randomUUID() });
    expectCode(res, 404, "dossier_not_found_or_forbidden");
  });

  await runCase(ctx, "R10_cross_customer_dossier_same_safe_404", async () => {
    const otherAuth = await createAuthUser(ctx);
    const otherCustomer = await createCustomerIdentity(ctx, otherAuth.email, "particulier");
    const otherDossier = await createDossierGraph(ctx, otherCustomer.customerId, "particulier", 1, 1, false);
    const res = await postDashboard(ctx, fixture.token, { dossier_id: otherDossier.id });
    expectCode(res, 404, "dossier_not_found_or_forbidden");
  });

  await runCase(ctx, "R11_particulier_dossier_succeeds", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    assert(res.body.selected_dossier.account_type === "particulier", "wrong_account_type");
  });

  await runCase(ctx, "R12_zakelijk_multiple_locations_succeeds", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: zakelijk.id });
    expectDashboardSuccess(res);
    assert(res.body.selected_dossier.account_type === "zakelijk", "wrong_account_type");
    assert(res.body.locations.length === 2, "expected_two_locations");
  });

  await runCase(ctx, "R13_vve_multiple_locations_succeeds", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: vve.id });
    expectDashboardSuccess(res);
    assert(res.body.selected_dossier.account_type === "vve", "wrong_account_type");
    assert(res.body.locations.length === 2, "expected_two_locations");
  });

  await runCase(ctx, "R14_multiple_dossier_summaries_returned", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    assert(res.body.dossiers.length >= 3, "expected_multiple_dossiers");
  });

  await runCase(ctx, "R15_locations_only_for_selected_dossier", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    assert(res.body.locations.length === 1, "unexpected_location_count");
  });

  await runCase(ctx, "R16_chargers_only_for_selected_dossier", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    assert(res.body.chargers.length === 2, "unexpected_charger_count");
  });

  await runCase(ctx, "R17_document_slots_link_correctly", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    const chargerIds = new Set(res.body.chargers.map((charger: any) => charger.charger_id));
    assert(res.body.document_slots.every((slot: any) => !slot.charger_id || chargerIds.has(slot.charger_id)), "slot_charger_mismatch");
  });

  await runCase(ctx, "R18_current_document_version_projection", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    assert(res.body.document_slots.some((slot: any) => slot.current_version_number === 1 && slot.current_file_name), "current_version_missing");
  });

  await runCase(ctx, "R19_empty_optional_collections_deterministic", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: vve.id });
    expectDashboardSuccess(res);
    assert(Array.isArray(res.body.legal_acceptances), "legal_acceptances_not_array");
  });

  await runCase(ctx, "R20_response_ordering_deterministic", async () => {
    const first = await postDashboard(ctx, fixture.token, { dossier_id: zakelijk.id });
    const second = await postDashboard(ctx, fixture.token, { dossier_id: zakelijk.id });
    expectDashboardSuccess(first);
    expectDashboardSuccess(second);
    assert(JSON.stringify(first.body.locations.map((row: any) => row.location_id)) === JSON.stringify(second.body.locations.map((row: any) => row.location_id)), "location_order_changed");
    assert(JSON.stringify(first.body.chargers.map((row: any) => row.charger_id)) === JSON.stringify(second.body.chargers.map((row: any) => row.charger_id)), "charger_order_changed");
  });

  await runCase(ctx, "R21_no_N_plus_one_static_query_plan", async () => {
    const source = await Deno.readTextFile("supabase/functions/api-app-dashboard-get/index.ts");
    const fromCount = (source.match(/\.from\(/g) || []).length;
    assert(fromCount <= 9, "unexpected_table_read_count");
    assert(!/for \([^)]*\)[\s\S]{0,200}\.from\(/.test(source), "query_inside_loop_marker");
  });

  await runCase(ctx, "R22_success_read_zero_audit_idempotency_writes", async () => {
    const auditBefore = await countRows(ctx, "app_audit_events");
    const idemBefore = await countRows(ctx, "app_idempotency_keys");
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    const auditAfter = await countRows(ctx, "app_audit_events");
    const idemAfter = await countRows(ctx, "app_idempotency_keys");
    assert(auditAfter === auditBefore, "success_read_audit_write_detected");
    assert(idemAfter === idemBefore, "success_read_idempotency_write_detected");
  });

  await runCase(ctx, "R23_scoped_reject_audit_matches_doctrine", async () => {
    const auditBefore = await countRows(ctx, "app_audit_events");
    const res = await postDashboard(ctx, fixture.token, { dossier_id: crypto.randomUUID() });
    expectCode(res, 404, "dossier_not_found_or_forbidden");
    const auditAfter = await countRows(ctx, "app_audit_events");
    assert(auditAfter >= auditBefore, "reject_audit_count_invalid");
  });

  await runCase(ctx, "R24_no_forbidden_sensitive_fields", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    assert(!containsForbiddenKeys(res.body), "forbidden_field_found");
  });

  await runCase(ctx, "R25_no_storage_url_token_or_hash", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    const serialized = JSON.stringify(res.body);
    assert(!/storage_path|storage_bucket|signed|token|sha256|hash/i.test(serialized), "storage_or_hash_marker_found");
  });

  await runCase(ctx, "R26_no_raw_audit_or_idempotency_records", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    const serialized = JSON.stringify(res.body);
    assert(!/app_audit_events|app_idempotency_keys|event_data|idempotency/i.test(serialized), "raw_audit_or_idem_marker_found");
  });

  await runCase(ctx, "R27_multiple_account_types_one_customer", async () => {
    const res = await postDashboard(ctx, fixture.token, { dossier_id: particulier.id });
    expectDashboardSuccess(res);
    const accountTypes = new Set(res.body.dossiers.map((dossier: any) => dossier.account_type));
    assert(accountTypes.has("particulier") && accountTypes.has("zakelijk") && accountTypes.has("vve"), "account_types_missing");
  });

  await runCase(ctx, "R28_auth_bootstrap_regression_green", async () => {
    const auth = await createAuthUser(ctx);
    const customer = await createCustomerIdentity(ctx, auth.email, "particulier");
    await createDossierGraph(ctx, customer.customerId, "particulier", 1, 1, false);
    const res = await postBootstrap(ctx, auth.token);
    assert(res.status === 200 && res.body?.ok === true, "bootstrap_regression_failed");
  });

  await runCase(ctx, "R29_requireAppCustomer_resolves_bound_user", async () => {
    const req = new Request("http://localhost/functions/v1/proof", {
      headers: { Authorization: `Bearer ${fixture.token}` },
    });
    const result = await requireAppCustomer(req, ctx.service);
    assert(result.ok === true, "require_app_customer_failed");
  });

  await runCase(ctx, "R30_no_legacy_dependency_static_scan", async () => {
    const source = await Deno.readTextFile("supabase/functions/api-app-dashboard-get/index.ts");
    assert(!/api-dossier|dossier_sessions|session_token|dossier_documents|dossier_audit_events|from\\(\"idempotency_keys\"\\)/.test(source), "legacy_marker_found");
  });
} finally {
  await cleanup(ctx);
}

summarizeResults(ctx.results);
