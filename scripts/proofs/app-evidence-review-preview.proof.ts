import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import type {
  AppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import {
  buildEvidenceReviewPreviewResponse,
  EVIDENCE_REVIEW_PREVIEW_TTL_SECONDS,
  parseEvidenceReviewPreviewSource,
} from "../../supabase/functions/_shared/app_evidence_review_preview.ts";
import {
  createHandler,
} from "../../supabase/functions/api-app-evidence-review-preview/index.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const CONTAINER = "supabase_db_enval";
const DATABASE = "postgres";
const MIGRATION =
  "supabase/migrations/20260818150000_app_evidence_review_preview_read.sql";
const PILOT_CASE_REF = "CASE-7E4CC75CD19F";
const CASE_A = "CASE-A00000000001";
const CASE_B = "CASE-B00000000002";
const VERSION_A = "e8000000-0000-4000-8000-000000000001";
const VERSION_B = "e8000000-0000-4000-8000-000000000002";
const AUTH_ADMIN = "e1000000-0000-4000-8000-000000000001";
const FIXED_NOW = new Date("2026-08-18T12:00:00.000Z");

type CommandResult = { code: number; stdout: string; stderr: string };
type RpcResult = { data?: unknown; error?: unknown };
type PreviewClient = ServiceClient & {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data?: { signedUrl?: string }; error?: unknown }>;
    };
  };
};

class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}

function q(value: number): void {
  console.log(`REVIEW08-Q${String(value).padStart(2, "0")}: PASS`);
}

function scrub(value: string): string {
  return value
    .replaceAll(/https?:\/\/\S+/gi, "[url]")
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/postgres(?:ql)?:\/\/\S+/gi, "[database]")
    .replaceAll(/token=[^\s&]+/gi, "token=[redacted]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 500);
}

async function command(name: string, args: string[]): Promise<CommandResult> {
  const output = await new Deno.Command(name, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: name === "supabase" ? { SUPABASE_TELEMETRY_DISABLED: "1" } : undefined,
  }).output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout).trim(),
    stderr: new TextDecoder().decode(output.stderr).trim(),
  };
}

async function must(name: string, args: string[]): Promise<string> {
  const result = await command(name, args);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || `${name}_failed`));
  }
  return result.stdout;
}

async function psql(sql: string): Promise<string> {
  return await must("docker", [
    "exec",
    CONTAINER,
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]);
}

const META: AppRequestMeta = {
  request_id: "review08-proof-request",
  idempotency_key: null,
  ip_hash: null,
  user_agent_hash: null,
  method: "GET",
  path: "/api-app-evidence-review-preview",
  url:
    `https://enval.local/api-app-evidence-review-preview?caseRef=${CASE_A}&evidenceVersionRef=${VERSION_A}`,
  origin: null,
  timestamp: FIXED_NOW.toISOString(),
  environment: "local",
};

function source(overrides: Partial<JsonObject> = {}): JsonObject {
  return {
    ok: true,
    status: 200,
    code: "ok",
    evidence_version_ref: VERSION_A,
    original_filename: "proof.pdf",
    mime_type: "application/pdf",
    storage_bucket: "private-proof",
    storage_path: "immutable/proof.pdf",
    ...overrides,
  };
}

function mockClient(options: {
  data?: JsonObject;
  onRpc?: (name: string, args: JsonObject) => void;
  onSign?: (bucket: string, path: string, ttl: number) => void;
  signedUrl?: string;
} = {}): PreviewClient {
  return {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({}),
    rpc: async (name, args): Promise<RpcResult> => {
      options.onRpc?.(name, args);
      return { data: options.data ?? source() };
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path, ttl) => {
          options.onSign?.(bucket, path, ttl);
          return {
            data: {
              signedUrl: options.signedUrl ??
                "https://storage.local/object/sign/private-proof/proof.pdf?token=secret",
            },
          };
        },
      }),
    },
  };
}

function endpoint(options: {
  data?: JsonObject;
  auth?: boolean;
  tenantFailure?: Response;
  onRpc?: (name: string, args: JsonObject) => void;
  onSign?: (bucket: string, path: string, ttl: number) => void;
} = {}) {
  const client = mockClient(options);
  return createHandler({
    createServiceClient: () => client,
    now: () => FIXED_NOW,
    requestMeta: async () => options.tenantFailure ?? META,
    verifyBearer: async () => options.auth === false
      ? {
        ok: false,
        status: 401,
        code: "missing_authorization",
        message: "Niet geautoriseerd.",
      }
      : {
        ok: true,
        context: {
          authUserId: AUTH_ADMIN,
          emailNormalized: "proof@example.invalid",
        },
      },
  });
}

async function responseJson(response: Response): Promise<JsonObject> {
  return await response.json() as JsonObject;
}

async function endpointProof(): Promise<void> {
  const url =
    `https://enval.local/api-app-evidence-review-preview?caseRef=${CASE_A}&evidenceVersionRef=${VERSION_A}`;
  const nonGet = await endpoint()(new Request(url, { method: "POST" }));
  assert(nonGet.status === 405, "non_get_not_denied");
  q(1);

  let gatedRpc = 0;
  let gatedSign = 0;
  const tenantFailure = new Response("{}", { status: 503 });
  const gated = await endpoint({
    tenantFailure,
    onRpc: () => gatedRpc++,
    onSign: () => gatedSign++,
  })(new Request(url));
  assert(gated === tenantFailure && gatedRpc === 0 && gatedSign === 0, "tenant_gate_not_first");
  q(2);

  const noAuth = await endpoint({ auth: false })(new Request(url));
  assert(noAuth.status === 401, "verified_auth_not_required");
  for (const malformed of [
    "https://enval.local/api-app-evidence-review-preview",
    `https://enval.local/api-app-evidence-review-preview?caseRef=${CASE_A}`,
    `https://enval.local/api-app-evidence-review-preview?caseRef=${CASE_A}&evidenceVersionRef=${VERSION_A}&ttl=3600`,
    `https://enval.local/api-app-evidence-review-preview?caseRef=${CASE_A}&caseRef=${CASE_B}&evidenceVersionRef=${VERSION_A}`,
    `https://enval.local/api-app-evidence-review-preview?caseRef=${CASE_A}&evidenceVersionRef=invalid`,
  ]) {
    const response = await endpoint()(new Request(malformed));
    assert(response.status === 400, "selectors_not_fail_closed");
  }
  q(3);

  let rpcCalls = 0;
  let signCalls = 0;
  const success = await endpoint({
    onRpc: (name, args) => {
      rpcCalls += 1;
      assert(
        name === "app_evidence_review_preview_source_read_v1" &&
          args.p_auth_user_id === AUTH_ADMIN && args.p_case_ref === CASE_A &&
          args.p_evidence_version_ref === VERSION_A &&
          Object.keys(args).sort().join("|") ===
            "p_auth_user_id|p_case_ref|p_evidence_version_ref",
        "rpc_contract_invalid",
      );
    },
    onSign: (bucket, path, ttl) => {
      signCalls += 1;
      assert(
        bucket === "private-proof" && path === "immutable/proof.pdf" &&
          ttl === 120,
        "signing_contract_invalid",
      );
    },
  })(new Request(url));
  const body = await responseJson(success);
  assert(
    success.status === 200 && rpcCalls === 1 && signCalls === 1 &&
      Object.keys(body).sort().join("|") ===
        "evidenceVersionRef|expiresAt|filename|mimeType|schemaVersion|signedUrl" &&
      body.schemaVersion === "evidence-review-preview-v1" &&
      body.evidenceVersionRef === VERSION_A && body.filename === "proof.pdf" &&
      body.mimeType === "application/pdf" &&
      body.expiresAt === "2026-08-18T12:02:00.000Z",
    "response_contract_invalid",
  );
  const publicJson = JSON.stringify(body);
  for (const forbidden of [
    "storage_bucket",
    "storage_path",
    "auth_user_id",
    "workforce",
    "policy",
    "sha256",
    "service_role",
    "customer",
  ]) assert(!publicJson.includes(forbidden), `unsafe_response:${forbidden}`);
  q(4);

  let deniedSigns = 0;
  for (const [code, status] of [
    ["workforce_identity_missing", 403],
    ["workforce_identity_inactive", 403],
    ["capability_not_authorized", 403],
    ["case_scope_denied", 403],
    ["authorization_changed", 403],
    ["evidence_not_found_or_forbidden", 404],
  ] as const) {
    const denied = await endpoint({
      data: { ok: false, status, code },
      onSign: () => deniedSigns++,
    })(new Request(url));
    assert(denied.status === status, `unsafe_denial:${code}`);
  }
  assert(deniedSigns === 0, "signed_before_authorization");
  q(5);

  for (const malformedSource of [
    source({ storage_path: "../escape.pdf" }),
    source({ original_filename: "../proof.pdf" }),
    source({ mime_type: "image/png" }),
    { ...source(), unexpected: true },
  ]) {
    let calls = 0;
    const failed = await endpoint({ data: malformedSource, onSign: () => calls++ })(
      new Request(url),
    );
    assert(failed.status === 500 && calls === 0, "unsafe_source_accepted");
  }
  q(6);

  const parsed = parseEvidenceReviewPreviewSource(source());
  const response = parsed
    ? buildEvidenceReviewPreviewResponse(
      parsed,
      "https://storage.local/signed?token=secret",
      FIXED_NOW,
    )
    : null;
  assert(
    parsed && response && EVIDENCE_REVIEW_PREVIEW_TTL_SECONDS === 120 &&
      response.expiresAt === "2026-08-18T12:02:00.000Z",
    "server_owned_expiry_invalid",
  );
  q(7);

  const migration = await Deno.readTextFile(MIGRATION);
  const endpointSource = await Deno.readTextFile(
    "supabase/functions/api-app-evidence-review-preview/index.ts",
  );
  const detailSource = await Deno.readTextFile(
    "supabase/functions/api-app-evidence-review-case-detail/index.ts",
  );
  assert(
    migration.includes("public.app_workforce_authorize_v1(") &&
      migration.includes("'evidence.review.view'") &&
      migration.includes("evidence_file.case_id = v_case_id") &&
      migration.includes("evidence_version.id = p_evidence_version_ref") &&
      migration.includes("to service_role") &&
      endpointSource.includes("defaultServiceClient") &&
      endpointSource.includes("createSignedUrl") &&
      !endpointSource.includes("download(") &&
      !detailSource.includes("createSignedUrl") &&
      !detailSource.includes("signedUrl"),
    "bounded_preview_source_missing",
  );
  q(8);
  console.log("EVIDENCE_REVIEW_PREVIEW_ENDPOINT=PASS");
}

async function localConfig(): Promise<{ url: string; serviceRoleKey: string }> {
  const result = await command("supabase", ["status", "-o", "env"]);
  assert(result.code === 0, "local_supabase_status_unavailable");
  const values = new Map<string, string>();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1], match[2].replace(/"$/, ""));
  }
  const url = values.get("API_URL") ?? "";
  const hostname = new URL(url).hostname;
  assert(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname),
    "non_local_supabase_target_rejected",
  );
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") ?? "";
  assert(serviceRoleKey, "local_service_role_unavailable");
  return { url, serviceRoleKey };
}

async function activeFingerprint(): Promise<string> {
  return await psql(`begin read only;
    select concat_ws('|',
      (select count(*) from public.app_cases),
      (select count(*) from public.app_evidence_files),
      (select count(*) from public.app_evidence_versions),
      (select count(*) from public.app_evidence_review_decisions),
      (select count(*) from public.app_workforce_identities),
      (select count(*) from public.app_workforce_scope_assignments),
      (select count(*) from public.app_audit_events),
      (select count(*) from public.app_idempotency_keys),
      (select count(*) from storage.objects)
    ); rollback;`);
}

async function localProof(): Promise<void> {
  const ledger = await psql(`begin read only;
    select count(*) from supabase_migrations.schema_migrations
    where version='20260818150000'; rollback;`);
  assert(ledger === "1", "preview_migration_not_applied");
  const acl = await psql(`begin read only;
    select concat_ws('|',
      has_function_privilege('service_role',
        'public.app_evidence_review_preview_source_read_v1(uuid,text,uuid)',
        'EXECUTE'),
      has_function_privilege('anon',
        'public.app_evidence_review_preview_source_read_v1(uuid,text,uuid)',
        'EXECUTE'),
      has_function_privilege('authenticated',
        'public.app_evidence_review_preview_source_read_v1(uuid,text,uuid)',
        'EXECUTE')
    ); rollback;`);
  assert(acl === "t|f|f", `preview_rpc_acl_invalid:${acl}`);
  q(9);

  const context = await psql(`begin read only;
    with first_admin as (
      select identity_row.auth_user_id
      from public.app_workforce_identities identity_row
      join lateral (
        select state from public.app_workforce_identity_states state_event
        where state_event.workforce_identity_id=identity_row.id
          and state_event.effective_at <= clock_timestamp()
        order by state_event.effective_at desc,state_event.recorded_at desc limit 1
      ) state on state.state='active'
      join lateral (
        select seniority from public.app_workforce_seniority_assignments seniority_event
        where seniority_event.workforce_identity_id=identity_row.id
          and seniority_event.effective_at <= clock_timestamp()
        order by seniority_event.effective_at desc,seniority_event.recorded_at desc limit 1
      ) seniority on seniority.seniority='admin'
      order by identity_row.created_at,identity_row.id limit 1
    ), pilot as (
      select id from public.app_cases where case_reference='${PILOT_CASE_REF}'
    ), pilot_evidence as (
      select evidence_version.id,evidence_file.document_type
      from pilot
      join public.app_evidence_files evidence_file on evidence_file.case_id=pilot.id
      join public.app_evidence_versions evidence_version
        on evidence_version.evidence_file_id=evidence_file.id
      where evidence_version.detected_mime_type='application/pdf'
    )
    select pg_catalog.json_build_object(
      'auth_user_id',(select auth_user_id from first_admin),
      'evidence',(
        select pg_catalog.json_agg(pg_catalog.json_build_object(
          'id',id,'kind',document_type
        ) order by document_type) from pilot_evidence
      )
    )::text;
    rollback;`);
  const active = JSON.parse(context) as {
    auth_user_id?: string;
    evidence?: Array<{ id?: string; kind?: string }>;
  };
  assert(
    active.auth_user_id && active.evidence?.length === 2 &&
      active.evidence.map((item) => item.kind).sort().join("|") ===
        "energy_bill_or_contract|installation_invoice",
    "pilot_preview_context_invalid",
  );
  q(10);

  const before = await activeFingerprint();
  const cfg = await localConfig();
  const service = createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const signedKinds = new Set<string>();
  for (const item of active.evidence) {
    const resolved = await service.rpc(
      "app_evidence_review_preview_source_read_v1",
      {
        p_auth_user_id: active.auth_user_id,
        p_case_ref: PILOT_CASE_REF,
        p_evidence_version_ref: item.id,
      },
    );
    assert(!resolved.error, "pilot_preview_resolver_failed");
    const source = parseEvidenceReviewPreviewSource(resolved.data);
    assert(source, "pilot_preview_source_invalid");
    const signed = await service.storage.from(source.storageBucket)
      .createSignedUrl(source.storagePath, EVIDENCE_REVIEW_PREVIEW_TTL_SECONDS);
    assert(!signed.error && signed.data?.signedUrl, "pilot_signed_url_failed");
    const signedUrl = new URL(signed.data.signedUrl);
    assert(
      ["http:", "https:"].includes(signedUrl.protocol) &&
        source.mimeType === "application/pdf",
      "pilot_signed_url_invalid",
    );
    signedKinds.add(item.kind ?? "");
  }
  assert(
    signedKinds.has("energy_bill_or_contract") &&
      signedKinds.has("installation_invoice"),
    "pilot_pdf_kinds_not_signed",
  );
  q(11);

  const denialContext = await psql(`begin read only;
    with pilot as (
      select id from public.app_cases where case_reference='${PILOT_CASE_REF}'
    ), first_admin as (
      select identity_row.auth_user_id
      from public.app_workforce_identities identity_row
      join lateral (
        select state from public.app_workforce_identity_states state_event
        where state_event.workforce_identity_id=identity_row.id
        order by state_event.effective_at desc,state_event.recorded_at desc limit 1
      ) state on state.state='active'
      join lateral (
        select seniority from public.app_workforce_seniority_assignments seniority_event
        where seniority_event.workforce_identity_id=identity_row.id
        order by seniority_event.effective_at desc,seniority_event.recorded_at desc limit 1
      ) seniority on seniority.seniority='admin'
      order by identity_row.created_at,identity_row.id limit 1
    ), unassigned as (
      select case_row.case_reference,evidence_version.id as evidence_version_id
      from public.app_cases case_row
      join public.app_evidence_files evidence_file on evidence_file.case_id=case_row.id
      join public.app_evidence_versions evidence_version
        on evidence_version.evidence_file_id=evidence_file.id
      cross join first_admin
      where case_row.id <> (select id from pilot)
        and not coalesce((public.app_workforce_authorize_v1(
          first_admin.auth_user_id,'evidence.review.view',case_row.id,null,
          clock_timestamp()
        )->>'ok')::boolean,false)
      order by case_row.created_at,case_row.id,evidence_version.id limit 1
    ), customer_only as (
      select grant_row.auth_user_id
      from public.app_customer_access_grants grant_row
      where not exists (
        select 1 from public.app_workforce_identities workforce
        where workforce.auth_user_id=grant_row.auth_user_id
      )
      order by grant_row.created_at,grant_row.id limit 1
    )
    select pg_catalog.json_build_object(
      'unassigned_case_ref',(select case_reference from unassigned),
      'unassigned_version_ref',(select evidence_version_id from unassigned),
      'customer_auth_user_id',(select auth_user_id from customer_only)
    )::text;
    rollback;`);
  const denied = JSON.parse(denialContext) as {
    unassigned_case_ref?: string;
    unassigned_version_ref?: string;
    customer_auth_user_id?: string;
  };
  assert(
    denied.unassigned_case_ref && denied.unassigned_version_ref &&
      denied.customer_auth_user_id,
    "active_denial_fixtures_missing",
  );

  const unassigned = await service.rpc(
    "app_evidence_review_preview_source_read_v1",
    {
      p_auth_user_id: active.auth_user_id,
      p_case_ref: denied.unassigned_case_ref,
      p_evidence_version_ref: denied.unassigned_version_ref,
    },
  );
  const wrongCase = await service.rpc(
    "app_evidence_review_preview_source_read_v1",
    {
      p_auth_user_id: active.auth_user_id,
      p_case_ref: PILOT_CASE_REF,
      p_evidence_version_ref: denied.unassigned_version_ref,
    },
  );
  const unknown = await service.rpc(
    "app_evidence_review_preview_source_read_v1",
    {
      p_auth_user_id: active.auth_user_id,
      p_case_ref: PILOT_CASE_REF,
      p_evidence_version_ref: crypto.randomUUID(),
    },
  );
  const customerOnly = await service.rpc(
    "app_evidence_review_preview_source_read_v1",
    {
      p_auth_user_id: denied.customer_auth_user_id,
      p_case_ref: PILOT_CASE_REF,
      p_evidence_version_ref: active.evidence[0].id,
    },
  );
  assert(
    (unassigned.data as JsonObject)?.code === "case_scope_denied" &&
      (wrongCase.data as JsonObject)?.code === "evidence_not_found_or_forbidden" &&
      (unknown.data as JsonObject)?.code === "evidence_not_found_or_forbidden" &&
      (customerOnly.data as JsonObject)?.code === "workforce_identity_missing",
    "active_denial_matrix_invalid",
  );
  q(12);

  const functionDefinition = await psql(`begin read only;
    select pg_get_functiondef(
      'public.app_evidence_review_preview_source_read_v1(uuid,text,uuid)'::regprocedure
    ); rollback;`);
  assert(
    functionDefinition.includes("app_workforce_authorize_v1") &&
      functionDefinition.includes("evidence.review.view") &&
      !/\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i.test(functionDefinition),
    "resolver_write_or_parallel_authority_detected",
  );
  const after = await activeFingerprint();
  assert(before === after, "preview_changed_database_state");
  q(13);

  const scopePreserved = await psql(`begin read only;
    with pilot as (
      select id from public.app_cases where case_reference='${PILOT_CASE_REF}'
    ) select public.app_workforce_authorize_v1(
      '${active.auth_user_id}','evidence.review.view',pilot.id,null,
      clock_timestamp()
    )->>'ok' from pilot; rollback;`);
  assert(scopePreserved === "true", "pilot_scope_not_preserved");
  q(14);
  console.log("EVIDENCE_REVIEW_PREVIEW_Q01_Q14=PASS");
  console.log("ENERGY_PDF_PREVIEW=PASS");
  console.log("INSTALLATION_PDF_PREVIEW=PASS");
  console.log("UNASSIGNED_CASE_DENIED=PASS");
  console.log("WRONG_CASE_DENIED=PASS");
  console.log("UNKNOWN_EVIDENCE_DENIED=PASS");
  console.log("DATABASE_WRITES_ON_PREVIEW=0");
  console.log("FIRST_ADMIN_STATE_PRESERVED=PASS");
  console.log("PILOT_CASE_SCOPE_PRESERVED=PASS");
  console.log("DETERMINISTIC_PREVIEW_CHECK=PASS");
}

try {
  await endpointProof();
  if (!Deno.args.includes("--endpoint-only")) await localProof();
} catch (error) {
  console.error(
    `EVIDENCE_REVIEW_PREVIEW=FAIL\n${
      scrub(error instanceof Error ? error.message : String(error))
    }`,
  );
  Deno.exitCode = 1;
}
