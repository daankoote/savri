import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import {
  createCustomerDocumentWorkflowGroup,
  type CustomerDocumentWorkflowFactInput,
  type CustomerDocumentWorkflowSourceInput,
} from "../../app/src/features/documents/CustomerDocumentWorkflowController.ts";
import { isParserObservationEnvelopeV1 } from "../../platform/runtime/document-parsing/document_parser_contract.ts";

type Json = Record<string, unknown>;
type Runtime = Readonly<{
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailpitUrl: string;
}>;

const ROOT = new URL("../../", import.meta.url);
const PILOT_CASE_REF = "CASE-7E4CC75CD19F";

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function marker(value: string): void {
  console.log(`${value}=PASS`);
}

function localHost(value: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(
      new URL(value).hostname,
    );
  } catch {
    return false;
  }
}

async function runtime(): Promise<Runtime> {
  const result = await new Deno.Command("supabase", {
    args: ["status", "-o", "env"],
    cwd: ROOT,
    stdout: "piped",
    stderr: "null",
    env: { SUPABASE_TELEMETRY_DISABLED: "1" },
  }).output();
  assert(result.success, "local_runtime_unavailable");
  const values = new Map<string, string>();
  for (const line of new TextDecoder().decode(result.stdout).split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1], match[2].replace(/"$/, ""));
  }
  const apiUrl = values.get("API_URL") || "";
  const dbUrl = values.get("DB_URL") || "";
  const mailpitUrl = values.get("MAILPIT_URL") || values.get("INBUCKET_URL") || "";
  assert(
    localHost(apiUrl) && localHost(dbUrl) && localHost(mailpitUrl) &&
      new URL(apiUrl).port === "54321" && new URL(dbUrl).port === "54322",
    "non_local_runtime_rejected",
  );
  const anonKey = values.get("ANON_KEY") || "";
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") || "";
  assert(anonKey && serviceRoleKey, "local_runtime_keys_missing");
  return { apiUrl, dbUrl, anonKey, serviceRoleKey, mailpitUrl };
}

async function psql(config: Runtime, sql: string): Promise<string> {
  const child = new Deno.Command("psql", {
    args: [config.dbUrl, "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
    cwd: ROOT,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();
  const result = await child.output();
  if (!result.success) {
    const diagnostic = new TextDecoder().decode(result.stderr).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`local_sql_failed:${diagnostic}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

async function request(
  config: Runtime,
  path: string,
  init: RequestInit,
): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  assert(body && typeof body === "object" && !Array.isArray(body), `non_json:${path}:${response.status}`);
  return { status: response.status, body: body as Json };
}

function apiHeaders(config: Runtime, token: string, key?: string): Record<string, string> {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    Origin: "http://127.0.0.1:5175",
    "Content-Type": "application/json",
    ...(key ? { "Idempotency-Key": key } : {}),
  };
}

async function post(
  config: Runtime,
  endpoint: string,
  token: string,
  key: string,
  body: Json,
) {
  return await request(config, `/functions/v1/${endpoint}`, {
    method: "POST",
    headers: apiHeaders(config, token, key),
    body: JSON.stringify(body),
  });
}

function pdf(lines: readonly string[]): Uint8Array {
  const hex = (value: string) => Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const stream = ["BT", "/F1 12 Tf", ...lines.flatMap((line, index) => [
    `1 0 0 1 72 ${720 - index * 20} Tm`,
    `<${hex(line)}> Tj`,
  ]), "ET"].join("\n");
  return new TextEncoder().encode([
    "%PDF-1.4", "1 0 obj", "<< /Type /Catalog /Pages 2 0 R >>", "endobj",
    "2 0 obj", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "endobj",
    "3 0 obj", "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", "endobj",
    "4 0 obj", `<< /Length ${stream.length} >>`, "stream", stream, "endstream", "endobj",
    "5 0 obj", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "endobj", "%%EOF",
  ].join("\n"));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function pilotState(config: Runtime): Promise<string> {
  return await psql(config, `begin read only;
    with pilot as (select id from public.app_cases where case_reference=${quote(PILOT_CASE_REF)})
    select jsonb_build_object(
      'case',coalesce((select row_to_json(x) from (
        select c.id,c.case_reference,
          (select lifecycle_state from public.app_case_lifecycle_events e where e.case_id=c.id order by e.event_at desc,e.id desc limit 1) lifecycle_state
        from public.app_cases c join pilot on pilot.id=c.id) x),'null'::json),
      'rounds',(select count(*) from public.app_evidence_review_rounds r join pilot on pilot.id=r.case_id),
      'handoffs',(select count(*) from public.app_evidence_review_correction_handoffs h join pilot on pilot.id=h.case_id),
      'uploads',(select count(*) from public.app_customer_correction_replacement_uploads u join pilot on pilot.id=u.case_id),
      'submissions',(select count(*) from public.app_evidence_review_customer_submissions s join pilot on pilot.id=s.case_id),
      'otp',(select count(*) from public.app_signup_signing_challenges ch join public.app_evidence_review_correction_handoffs h on h.id=ch.correction_handoff_id join pilot on pilot.id=h.case_id)
    )::text; rollback;`);
}

async function createAuth(
  config: Runtime,
  service: SupabaseClient,
  prefix: string,
) {
  const email = `${prefix}@example.test`;
  const password = `Aa1!${crypto.randomUUID()}x`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user?.id, "auth_create_failed");
  const signed = await createClient(config.apiUrl, config.anonKey, {
    auth: { persistSession: false },
  }).auth.signInWithPassword({ email, password });
  assert(!signed.error && signed.data.session?.access_token, "auth_signin_failed");
  return { email, userId: created.data.user.id, token: signed.data.session.access_token };
}

async function uploadDocument(
  config: Runtime,
  service: SupabaseClient,
  token: string,
  prefix: string,
  intakeReference: string,
  managementCapability: string,
  clientSlotId: string,
  documentType: "energy_bill_or_contract" | "installation_invoice",
  filename: string,
  bytes: Uint8Array,
) {
  const contentSha256 = await sha256(bytes);
  const issue = await post(config, "api-app-signup-upload-url", token, `${prefix}-issue-${clientSlotId}`, {
    operation: "issue",
    intake_reference: intakeReference,
    management_capability: managementCapability,
    client_slot_id: clientSlotId,
    document_type: documentType,
    file_name: filename,
    mime_type: "application/pdf",
    size_bytes: bytes.byteLength,
    client_sha256: contentSha256,
  });
  assert(issue.status === 201 && issue.body.ok === true, `upload_issue_failed:${documentType}:${issue.status}`);
  const bucket = String(issue.body.storage_bucket || "");
  const path = String(issue.body.storage_path || "");
  const uploadToken = String(issue.body.upload_token || "");
  const fileReference = String(issue.body.file_reference || "");
  const capability = String(issue.body.quarantine_upload_capability || "");
  assert(bucket && path && uploadToken && fileReference && capability, "upload_issue_shape_invalid");
  const uploaded = await service.storage.from(bucket).uploadToSignedUrl(
    path,
    uploadToken,
    new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }),
    { contentType: "application/pdf" },
  );
  assert(!uploaded.error, `signed_upload_failed:${documentType}`);
  const confirmed = await post(config, "api-app-signup-upload-confirm", token, `${prefix}-confirm-${clientSlotId}`, {
    intake_reference: intakeReference,
    file_reference: fileReference,
    quarantine_upload_capability: capability,
  });
  assert(confirmed.status === 200 && confirmed.body.ok === true, `upload_confirm_failed:${documentType}:${confirmed.status}`);
  return { bucket, path, fileReference, clientSlotId, documentType, filename, contentSha256, confirm: confirmed.body };
}

function observedMap(value: unknown): Map<string, string> {
  assert(isParserObservationEnvelopeV1(value), "served_parser_observation_invalid");
  return new Map(value.observedFacts.flatMap((fact) =>
    fact.status === "observed" && fact.normalizedObservedValue
      ? [[fact.factKey, fact.normalizedObservedValue] as const]
      : []
  ));
}

async function otp(config: Runtime, email: string, challengeReference: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await fetch(`${config.mailpitUrl}/api/v1/messages`).then((response) => response.json());
    const message = Array.isArray(list?.messages)
      ? list.messages.find((candidate: Json) =>
        Array.isArray(candidate.To) && candidate.To.some((recipient: Json) => recipient.Address === email) &&
        String(candidate.Subject || "").includes("ondertekencode")
      )
      : null;
    if (message?.ID) {
      const detail = await fetch(`${config.mailpitUrl}/api/v1/message/${message.ID}`).then((response) => response.json());
      const text = String(detail?.Text || detail?.HTML || "");
      const code = text.match(/(?:^|\D)(\d{6})(?:\D|$)/)?.[1];
      if (code && text.includes(challengeReference)) return { code, messageId: String(message.ID) };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("signup_otp_not_delivered");
}

async function grantReviewer(config: Runtime, prefix: string, authUserId: string, caseId: string) {
  const adminId = await psql(config, `begin read only;
    select identity_row.auth_user_id::text
    from public.app_workforce_identities identity_row
    join lateral (select state from public.app_workforce_identity_states s where s.workforce_identity_id=identity_row.id and s.effective_at<=clock_timestamp() order by s.effective_at desc,s.recorded_at desc limit 1) state on state.state='active'
    join lateral (select seniority from public.app_workforce_seniority_assignments s where s.workforce_identity_id=identity_row.id and s.effective_at<=clock_timestamp() order by s.effective_at desc,s.recorded_at desc limit 1) seniority on seniority.seniority='admin'
    order by identity_row.created_at,identity_row.id limit 1; rollback;`);
  assert(/^[0-9a-f-]{36}$/i.test(adminId), "active_admin_missing");
  const hash = await sha256(new TextEncoder().encode(prefix));
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  const created = await psql(config, `select public.app_workforce_member_manage_v1(
    ${quote(adminId)},${quote(`${prefix}-member`)},${quote(`${prefix}-member`)},${quote(hash)},${quote(expires)},
    'create',${quote(authUserId)},null,'reviewer',clock_timestamp(),${quote(`decision:${prefix}:member`)},null
  )->>'ok';`);
  assert(created === "true", "reviewer_create_failed");
  const workforceId = await psql(config, `select id::text from public.app_workforce_identities where auth_user_id=${quote(authUserId)};`);
  assert(/^[0-9a-f-]{36}$/i.test(workforceId), "reviewer_identity_missing");
  for (const capability of ["evidence.review.view", "evidence.review.decide"]) {
    const suffix = capability.endsWith("view") ? "view" : "decide";
    const granted = await psql(config, `select public.app_workforce_case_assignment_manage_v1(
      ${quote(adminId)},${quote(`${prefix}-${suffix}`)},${quote(`${prefix}-${suffix}`)},${quote(hash)},${quote(expires)},
      'grant',${quote(workforceId)},${quote(capability)},${quote(caseId)},null,null,null,clock_timestamp(),null,
      ${quote(`decision:${prefix}:${suffix}`)},null
    )->>'ok';`);
    assert(granted === "true", `reviewer_scope_${suffix}_failed`);
  }
  return workforceId;
}

async function reviewDetail(config: Runtime, token: string, caseRef: string): Promise<Json> {
  const result = await request(config, `/functions/v1/api-app-evidence-review-case-detail?caseRef=${caseRef}`, {
    method: "GET",
    headers: apiHeaders(config, token),
  });
  assert(result.status === 200 && Array.isArray(result.body.reviewSubjects), `review_detail_failed:${result.status}`);
  return result.body;
}

async function cleanup(
  config: Runtime,
  service: SupabaseClient,
  prefix: string,
  ids: Set<string>,
  storage: Set<string>,
  authUsers: Set<string>,
  mailpitMessageId: string | null,
) {
  for (const locator of storage) {
    const split = locator.indexOf("/");
    if (split > 0) await service.storage.from(locator.slice(0, split)).remove([locator.slice(split + 1)]);
  }
  const uuidIds = [...ids].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (uuidIds.length > 0) {
    const values = uuidIds.map((id) => `(${quote(id)}::uuid)`).join(",");
    await psql(config, `begin;
      set local session_replication_role=replica;
      create temp table wave_a1_fixture_ids(id uuid primary key) on commit drop;
      insert into wave_a1_fixture_ids values ${values} on conflict do nothing;
      do $cleanup$
      declare item record; expression text; pass integer;
      begin
        for pass in 1..8 loop
          for item in
            select n.nspname schema_name,c.relname table_name,
              string_agg(format('%I',a.attname),',') filter (where a.atttypid='uuid'::regtype) uuid_columns
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
            join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
            where n.nspname='public' and c.relkind in ('r','p')
            group by n.nspname,c.relname
            having bool_or(a.attname='id' and a.atttypid='uuid'::regtype)
               and bool_or(a.atttypid='uuid'::regtype)
          loop
            select string_agg(format('%I in (select id from wave_a1_fixture_ids)',column_name),' or ')
              into expression from unnest(string_to_array(item.uuid_columns,',')) column_name;
            execute format('insert into wave_a1_fixture_ids select id from %I.%I where %s on conflict do nothing',item.schema_name,item.table_name,expression);
          end loop;
        end loop;
        for item in
          select n.nspname schema_name,c.relname table_name,
            string_agg(format('%I in (select id from wave_a1_fixture_ids)',a.attname),' or ') filter (where a.atttypid='uuid'::regtype) expression
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
          where n.nspname='public' and c.relkind in ('r','p')
          group by n.nspname,c.relname
          having bool_or(a.atttypid='uuid'::regtype)
        loop execute format('delete from %I.%I where %s',item.schema_name,item.table_name,item.expression); end loop;
      end $cleanup$;
      delete from public.app_audit_events where request_id like ${quote(`${prefix}%`)} or actor_ref like ${quote(`%${prefix}%`)};
      delete from public.app_idempotency_keys where key like ${quote(`${prefix}%`)} or scope like ${quote(`%${prefix}%`)};
      commit;`);
  }
  for (const userId of authUsers) await service.auth.admin.deleteUser(userId);
  if (mailpitMessageId) {
    await fetch(`${config.mailpitUrl}/api/v1/messages/${mailpitMessageId}`, { method: "DELETE" }).catch(() => undefined);
  }
}

assert(Deno.env.get("ENVAL_ALLOW_LOCAL_QUALIFICATION_WRITES") === "YES", "local_qualification_writes_not_enabled");

const config = await runtime();
const service = createClient(config.apiUrl, config.serviceRoleKey, { auth: { persistSession: false } });
const prefix = `wave-a1-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const ids = new Set<string>();
const storage = new Set<string>();
const authUsers = new Set<string>();
let mailpitMessageId: string | null = null;
let pilotBefore = "";
let pilotAfter = "";
let summary: Json = {};

try {
  pilotBefore = await pilotState(config);
  const customer = await createAuth(config, service, `${prefix}-customer`);
  ids.add(customer.userId);
  authUsers.add(customer.userId);
  const zeroBootstrap = await post(config, "api-app-auth-bootstrap", customer.token, `${prefix}-zero-bootstrap`, {});
  assert(zeroBootstrap.status === 200 && zeroBootstrap.body.binding_status === "unbound_no_cases", "private_account_zero_case_failed");

  const start = await post(config, "api-app-signup-intake-start", customer.token, `${prefix}-start`, {
    account_type: "particulier",
    email: `${prefix}-spoof@example.test`,
  });
  assert(start.status === 200 && start.body.ok === true, `intake_start_failed:${start.status}`);
  const intakeReference = String(start.body.intake_reference || "");
  const managementCapability = String(start.body.management_capability || "");
  assert(/^[0-9a-f-]{36}$/i.test(intakeReference) && managementCapability, "intake_start_shape_invalid");
  ids.add(intakeReference);
  const intakeTruth = await psql(config, `select concat_ws('|',email_normalized,submitted_payload->>'account_type',status) from public.app_signup_intakes where id=${quote(intakeReference)};`);
  assert(intakeTruth === `${customer.email}|particulier|collecting`, "authenticated_private_context_not_server_owned");

  const energyBytes = pdf([
    "Onze gegevens: Pilot Energie Nederland B.V.",
    "Contracthouder Voorbeeld Persoon",
    "Leveradres Bewijsstraat 12",
    "Postcode 1234 AB Proefstad",
    "Elektriciteit 871685900012345678",
  ]);
  const installationBytes = pdf([
    "Installateur:Wave A1 Installatie B.V.",
    "Klant:Voorbeeld Persoon",
    "Factuuradres:Bewijsstraat 12",
    "Postcode:1234AB Proefstad",
    "Merk:Wave A1 Charger",
    "Model:Clean One",
    "MID:123456789",
    "Serienummer:WAVEA1SERIAL2026",
  ]);
  const localEnergy = await parseInvoicePdfInput(energyBytes);
  const localInstallation = await parseInvoicePdfInput(installationBytes);
  assert(localEnergy.ok && localInstallation.ok, "current_browser_parser_failed");

  const energySlot = `${prefix}-energy`;
  const installationSlot = `${prefix}-installation`;
  const energy = await uploadDocument(config, service, customer.token, prefix, intakeReference, managementCapability, energySlot, "energy_bill_or_contract", "wave-a1-energy.pdf", energyBytes);
  const installation = await uploadDocument(config, service, customer.token, prefix, intakeReference, managementCapability, installationSlot, "installation_invoice", "wave-a1-installation.pdf", installationBytes);
  ids.add(energy.fileReference);
  ids.add(installation.fileReference);
  storage.add(`${energy.bucket}/${energy.path}`);
  storage.add(`${installation.bucket}/${installation.path}`);
  const servedEnergy = energy.confirm.parser_observation;
  const energyFacts = observedMap(servedEnergy);
  const installationFacts = new Map<string, string>(
    localInstallation.observation_envelope.factCandidates
      .filter((fact) => fact.displayable && fact.normalizedValue)
      .map((fact) => [fact.factKey, fact.normalizedValue]),
  );
  assert(
    installation.confirm.parser_observation == null &&
      localInstallation.observation_envelope.contentFingerprint === installation.contentSha256,
    "installation_browser_observation_invalid",
  );
  for (const key of ["partyName", "structuredAddress", "energySupplier", "electricityEan"]) assert(energyFacts.get(key), `energy_fact_missing:${key}`);
  for (const key of ["chargerBrand", "chargerModel", "midNumber", "serialNumber"]) assert(installationFacts.get(key), `installation_fact_missing:${key}`);
  const serverBindings = await psql(config, `select string_agg(concat_ws('|',client_slot_id,status,detected_mime_type,server_sha256,size_bytes),E'\n' order by client_slot_id) from public.app_signup_intake_files where intake_id=${quote(intakeReference)};`);
  assert(serverBindings.includes(energy.contentSha256) && serverBindings.includes(installation.contentSha256) && (serverBindings.match(/confirmed_quarantine/g) || []).length === 2, "server_upload_binding_invalid");

  const source = (
    upload: typeof energy,
    role: CustomerDocumentWorkflowSourceInput["semanticRole"],
    value: string,
  ): CustomerDocumentWorkflowSourceInput => ({
    sourceRef: upload.fileReference,
    evidenceRootRef: upload.fileReference,
    contentFingerprint: upload.contentSha256,
    fileName: upload.filename,
    sourceDocumentType: upload.documentType,
    semanticRole: role,
    relationship: "direct",
    observedValue: value,
    current: true,
  });
  const fact = (
    factKey: CustomerDocumentWorkflowFactInput["factKey"],
    inputSource: CustomerDocumentWorkflowSourceInput,
  ): CustomerDocumentWorkflowFactInput => ({
    factKey,
    sources: [inputSource],
    editable: true,
    browserResolution: "UNRESOLVED",
    actualReviewTruth: "Nog te beoordelen",
    emptyValue: "",
    editor: "text",
    isValid: (value) => typeof value === "string" && value.trim().length > 0,
  });
  const locationGroup = createCustomerDocumentWorkflowGroup({
    group: "location", scopeRef: "location:wave-a1", title: "Wave A1", evidenceReady: true,
    facts: [
      fact("partyName", source(energy, "contract_holder", energyFacts.get("partyName")!)),
      fact("structuredAddress", source(energy, "delivery_address", energyFacts.get("structuredAddress")!)),
      fact("energySupplier", source(energy, "energy_supplier", energyFacts.get("energySupplier")!)),
      fact("electricityEan", source(energy, "electricity_connection", energyFacts.get("electricityEan")!)),
    ],
  });
  const chargerGroup = createCustomerDocumentWorkflowGroup({
    group: "charger", scopeRef: "charger:wave-a1", title: "Wave A1 charger", evidenceReady: true,
    facts: [
      fact("chargerBrand", source(installation, "charger_asset", installationFacts.get("chargerBrand")!)),
      fact("chargerModel", source(installation, "charger_asset", installationFacts.get("chargerModel")!)),
      fact("midNumber", source(installation, "charger_asset", installationFacts.get("midNumber")!)),
      fact("serialNumber", source(installation, "charger_asset", installationFacts.get("serialNumber")!)),
    ],
  });
  const workflowRows = [...locationGroup.group.rows, ...chargerGroup.group.rows];
  assert(workflowRows.length === 8 && workflowRows.every((row) => row.customer.state === "SOURCE_UNRESOLVED" && row.customer.sourceValue), "shared_workflow_clean_confirm_unavailable");
  const signupSource = await Deno.readTextFile(new URL("app/src/features/signup/DocumentFirstDocumentsStep.tsx", ROOT));
  const correctionSource = await Deno.readTextFile(new URL("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx", ROOT));
  assert(signupSource.includes("createCustomerDocumentWorkflowModel") && correctionSource.includes("createCustomerDocumentWorkflowModel") && signupSource.includes("<DocumentEvidenceWorkflow {...workflowModel} />") && correctionSource.includes("<DocumentEvidenceWorkflow {...workflowModel} />"), "shared_workflow_live_path_missing");

  const label: Record<string, string> = {
    partyName: "Naam", structuredAddress: "Adres", energySupplier: "Energieleverancier", electricityEan: "EAN",
    chargerBrand: "Merk", chargerModel: "Model", midNumber: "MID", serialNumber: "Serienummer",
  };
  const canonicalFacts = [
    ["partyName", energy, energyFacts, "location", undefined],
    ["structuredAddress", energy, energyFacts, "location", undefined],
    ["energySupplier", energy, energyFacts, "location", undefined],
    ["electricityEan", energy, energyFacts, "location", undefined],
    ["chargerBrand", installation, installationFacts, "location", "charger"],
    ["chargerModel", installation, installationFacts, "location", "charger"],
    ["midNumber", installation, installationFacts, "location", "charger"],
    ["serialNumber", installation, installationFacts, "location", "charger"],
  ].map(([factKey, upload, values, locationId, chargerId]) => {
    const typedUpload = upload as typeof energy;
    const value = (values as Map<string, string>).get(String(factKey))!;
    return {
      factId: `${prefix}-${factKey}`,
      factKey,
      label: label[String(factKey)],
      value,
      resolutionState: "confirmed",
      required: true,
      locationId,
      ...(chargerId ? { chargerId } : {}),
      resolutionInput: {
        action: "confirmed",
        sources: [{
          fileReference: typedUpload.fileReference,
          clientSlotId: typedUpload.clientSlotId,
          documentType: typedUpload.documentType,
          contentSha256: typedUpload.contentSha256,
          parserVersion: typedUpload === energy
            ? String((servedEnergy as Json).parserCoreVersion || "energy_document_v1")
            : localInstallation.parser_version,
          observedValue: value,
        }],
      },
    };
  });

  const challengeKey = `${prefix}-signing-challenge`;
  const challenge = await post(config, "api-app-signup-signing-challenge", customer.token, challengeKey, {
    intake_reference: intakeReference,
    management_capability: managementCapability,
  });
  assert(challenge.status === 201 && challenge.body.ok === true && challenge.body.challenge_reference, `signing_challenge_failed:${challenge.status}`);
  const challengeReplay = await post(config, "api-app-signup-signing-challenge", customer.token, challengeKey, {
    intake_reference: intakeReference,
    management_capability: managementCapability,
  });
  assert(challengeReplay.status === 201 && challengeReplay.body.replayed === true && challengeReplay.body.challenge_reference === challenge.body.challenge_reference, "signing_challenge_not_idempotent");
  const challengeReference = String(challenge.body.challenge_reference);
  ids.add(challengeReference);
  const delivered = await otp(config, customer.email, challengeReference);
  mailpitMessageId = delivered.messageId;
  const finalizeKey = `${prefix}-signing-finalize`;
  const finalizeBody = {
    intake_reference: intakeReference,
    management_capability: managementCapability,
    challenge_reference: challengeReference,
    otp_code: delivered.code,
    account_type: "particulier",
    typed_full_name: "Voorbeeld Persoon",
    signer_role: "",
    mandate_year: new Date().getUTCFullYear(),
    canonical_facts: canonicalFacts,
    required_file_references: [energy.fileReference, installation.fileReference],
    legal_actions: { privacy_notice_read: true, service_terms_accepted: true, fee_terms_accepted: true, mandate_signed: true },
  };
  const finalized = await post(config, "api-app-signup-signing-finalize", customer.token, finalizeKey, finalizeBody);
  assert(finalized.status === 201 && finalized.body.ok === true && finalized.body.promotion_state === "promoted" && finalized.body.account_handoff === "already_authenticated", `signing_finalize_failed:${finalized.status}:${String(finalized.body.promotion_state)}`);
  const signingStateBeforeReplay = await psql(config, `select jsonb_build_object(
    'snapshot_count',(select count(*) from public.app_signup_signing_snapshots where intake_id=${quote(intakeReference)}),
    'snapshot',(select jsonb_build_object('id',id,'hash',canonical_snapshot_sha256,'body',canonical_snapshot,'created_at',created_at) from public.app_signup_signing_snapshots where intake_id=${quote(intakeReference)}),
    'signature_count',(select count(*) from public.app_signup_signature_evidence where intake_id=${quote(intakeReference)}),
    'signature',(select jsonb_build_object('id',id,'snapshot_id',snapshot_id,'mandate_id',mandate_id,'challenge_id',challenge_id,'envelope',evidence_envelope,'finalized_at',finalized_at) from public.app_signup_signature_evidence where intake_id=${quote(intakeReference)}),
    'mandate_count',(select count(*) from public.app_signup_mandates where intake_id=${quote(intakeReference)}),
    'acceptance_count',(select count(*) from public.app_signup_legal_acceptances where intake_id=${quote(intakeReference)}),
    'otp_consumed_at',(select consumed_at from public.app_signup_signing_challenges where id=${quote(challengeReference)}),
    'intake_finalized_at',(select finalized_at from public.app_signup_intakes where id=${quote(intakeReference)}),
    'finalization_audit_count',(select count(*) from public.app_intake_audit_events where event_type='signup_signing_finalized' and event_data->>'intake_reference'=${quote(intakeReference)}),
    'promotion_count',(select count(*) from public.app_signup_promotions where intake_id=${quote(intakeReference)}),
    'customer_count',(select count(*) from public.app_customers c join public.app_signup_promotions p on p.customer_id=c.id where p.intake_id=${quote(intakeReference)}),
    'case_count',(select count(*) from public.app_cases where source_ref=${quote(intakeReference)})
  )::text;`);
  const finalizeReplay = await post(config, "api-app-signup-signing-finalize", customer.token, finalizeKey, finalizeBody);
  assert(
    [200, 201].includes(finalizeReplay.status) &&
      finalizeReplay.body.replayed === true &&
      finalizeReplay.body.safe_reference === finalized.body.safe_reference,
    `signing_finalize_not_idempotent:${finalizeReplay.status}:` +
      `${String(finalizeReplay.body.code || "NONE")}:` +
      `${String(finalizeReplay.body.replayed || false)}:` +
      `${finalizeReplay.body.safe_reference === finalized.body.safe_reference}`,
  );
  const signingStateAfterReplay = await psql(config, `select jsonb_build_object(
    'snapshot_count',(select count(*) from public.app_signup_signing_snapshots where intake_id=${quote(intakeReference)}),
    'snapshot',(select jsonb_build_object('id',id,'hash',canonical_snapshot_sha256,'body',canonical_snapshot,'created_at',created_at) from public.app_signup_signing_snapshots where intake_id=${quote(intakeReference)}),
    'signature_count',(select count(*) from public.app_signup_signature_evidence where intake_id=${quote(intakeReference)}),
    'signature',(select jsonb_build_object('id',id,'snapshot_id',snapshot_id,'mandate_id',mandate_id,'challenge_id',challenge_id,'envelope',evidence_envelope,'finalized_at',finalized_at) from public.app_signup_signature_evidence where intake_id=${quote(intakeReference)}),
    'mandate_count',(select count(*) from public.app_signup_mandates where intake_id=${quote(intakeReference)}),
    'acceptance_count',(select count(*) from public.app_signup_legal_acceptances where intake_id=${quote(intakeReference)}),
    'otp_consumed_at',(select consumed_at from public.app_signup_signing_challenges where id=${quote(challengeReference)}),
    'intake_finalized_at',(select finalized_at from public.app_signup_intakes where id=${quote(intakeReference)}),
    'finalization_audit_count',(select count(*) from public.app_intake_audit_events where event_type='signup_signing_finalized' and event_data->>'intake_reference'=${quote(intakeReference)}),
    'promotion_count',(select count(*) from public.app_signup_promotions where intake_id=${quote(intakeReference)}),
    'customer_count',(select count(*) from public.app_customers c join public.app_signup_promotions p on p.customer_id=c.id where p.intake_id=${quote(intakeReference)}),
    'case_count',(select count(*) from public.app_cases where source_ref=${quote(intakeReference)})
  )::text;`);
  assert(signingStateAfterReplay === signingStateBeforeReplay, "signing_replay_mutated_persisted_truth");
  const changedReplay = await post(config, "api-app-signup-signing-finalize", customer.token, finalizeKey, {
    ...finalizeBody,
    typed_full_name: "Andere Ondertekenaar",
  });
  assert(
    changedReplay.status === 409 && changedReplay.body.code === "idempotency_conflict",
    `changed_signing_payload_not_denied:${changedReplay.status}:${String(changedReplay.body.code || "NONE")}`,
  );
  const unauthorized = await createAuth(config, service, `${prefix}-unauthorized`);
  ids.add(unauthorized.userId);
  authUsers.add(unauthorized.userId);
  const unauthorizedReplay = await post(
    config,
    "api-app-signup-signing-finalize",
    unauthorized.token,
    finalizeKey,
    finalizeBody,
  );
  assert(
    [401, 403].includes(unauthorizedReplay.status),
    `unauthorized_signing_replay_allowed:${unauthorizedReplay.status}`,
  );
  marker("WAVE_A1_FIX01_AUTHORIZED_IDEMPOTENT_REPLAY");

  const promotionRaw = await psql(config, `select jsonb_build_object(
    'promotion_id',p.id,'customer_id',p.customer_id,'identity_id',p.identity_id,'party_id',p.service_recipient_party_id,
    'case_id',p.case_id,'snapshot_id',p.signing_snapshot_id,'mandate_id',p.mandate_id,'signature_id',p.signature_evidence_id,
    'case_ref',c.case_reference)::text from public.app_signup_promotions p join public.app_cases c on c.id=p.case_id where p.intake_id=${quote(intakeReference)};`);
  const promotion = JSON.parse(promotionRaw) as Record<string, string>;
  for (const value of Object.values(promotion)) if (/^[0-9a-f-]{36}$/i.test(value)) ids.add(value);
  const caseId = promotion.case_id;
  const caseRef = promotion.case_ref;
  assert(caseId && /^CASE-/.test(caseRef), "promotion_case_missing");
  const linkedIds = await psql(config, `select string_agg(value,E'\n') from (
    select id::text value from public.app_locations where id in (select location_id from public.app_case_location_relations where case_id=${quote(caseId)})
    union select id::text from public.app_chargers where case_id=${quote(caseId)}
    union select id::text from public.app_evidence_files where case_id=${quote(caseId)}
    union select id::text from public.app_customer_dossiers where customer_id=${quote(promotion.customer_id)}
  ) ids;`);
  for (const value of linkedIds.split(/\s+/).filter(Boolean)) ids.add(value);
  const promotedStorage = await psql(config, `select concat_ws('/',storage_bucket,storage_path) from public.app_evidence_versions v join public.app_evidence_files f on f.id=v.evidence_file_id where f.case_id=${quote(caseId)};`);
  for (const value of promotedStorage.split(/\r?\n/).filter(Boolean)) storage.add(value);
  const immutableSnapshotBefore = await psql(config, `select canonical_snapshot_sha256 from public.app_signup_signing_snapshots where id=${quote(promotion.snapshot_id)};`);
  const preReview = await psql(config, `select concat_ws('|',
    (select count(*) from public.app_evidence_review_round_subject_decisions d join public.app_evidence_review_rounds r on r.id=d.round_id where r.case_id=${quote(caseId)} and d.disposition='ACCEPTED'),
    (select count(*) from public.app_evidence_review_correction_handoffs where case_id=${quote(caseId)}));`);
  assert(preReview === "0|0", "pre_review_truth_not_clean");

  const reviewer = await createAuth(config, service, `${prefix}-reviewer`);
  ids.add(reviewer.userId);
  authUsers.add(reviewer.userId);
  const workforceId = await grantReviewer(config, prefix, reviewer.userId, caseId);
  ids.add(workforceId);
  const detail = await reviewDetail(config, reviewer.token, caseRef);
  const expectedReviewFactKeys = new Set(
    canonicalFacts.map((fact) => String(fact.factKey)),
  );
  assert(
    detail.overallReviewStatus === "TO_REVIEW" &&
      Array.isArray(detail.reviewSubjects) &&
      detail.reviewSubjects.length === 10 &&
      detail.reviewSubjects.every((subject: Json) =>
        expectedReviewFactKeys.has(String(subject.factKey))
      ) &&
      new Set(
          detail.reviewSubjects.map((subject: Json) => String(subject.factKey)),
        ).size === expectedReviewFactKeys.size,
    `review_subject_manifest_invalid:${String(detail.overallReviewStatus)}:` +
      `${Array.isArray(detail.reviewSubjects) ? detail.reviewSubjects.length : "NOT_ARRAY"}:` +
      `${expectedReviewFactKeys.size}`,
  );
  const subjects = detail.reviewSubjects as Json[];
  const reviewBody = {
    caseRef,
    manifestVersion: detail.reviewManifestVersion,
    manifestHash: detail.reviewManifestHash,
    decisions: subjects.map((subject) => ({ subjectRef: subject.subjectRef, disposition: "ACCEPTED" })),
  };
  const reviewKey = `${prefix}-review-finalize`;
  const review = await post(config, "api-app-evidence-review-round-finalize", reviewer.token, reviewKey, reviewBody);
  assert(review.status === 201 && review.body.result === "FINALIZED" && review.body.outcome === "ALL_FACTS_ACCEPTED", `review_finalize_failed:${review.status}:${String(review.body.outcome)}`);
  const reviewReplay = await post(config, "api-app-evidence-review-round-finalize", reviewer.token, reviewKey, reviewBody);
  assert([200, 201].includes(reviewReplay.status) && reviewReplay.body.roundRef === review.body.roundRef, "review_finalize_not_idempotent");
  const finalDetail = await reviewDetail(config, reviewer.token, caseRef);
  assert(finalDetail.overallReviewStatus === "REVIEW_COMPLETE" && finalDetail.case && (finalDetail.case as Json).canPublishCorrection === false, "clean_review_status_invalid");
  const finalCounts = await psql(config, `select concat_ws('|',
    (select count(*) from public.app_evidence_review_rounds where case_id=${quote(caseId)}),
    (select count(*) from public.app_evidence_review_round_subject_decisions d join public.app_evidence_review_rounds r on r.id=d.round_id where r.case_id=${quote(caseId)}),
    (select count(*) from public.app_evidence_review_round_subject_decisions d join public.app_evidence_review_rounds r on r.id=d.round_id where r.case_id=${quote(caseId)} and d.disposition='ACCEPTED'),
    (select count(*) from public.app_evidence_review_correction_handoffs where case_id=${quote(caseId)}));`);
  assert(finalCounts === `1|${subjects.length}|${subjects.length}|0`, "clean_review_cardinality_invalid");
  const immutableSnapshotAfter = await psql(config, `select canonical_snapshot_sha256 from public.app_signup_signing_snapshots where id=${quote(promotion.snapshot_id)};`);
  assert(immutableSnapshotAfter === immutableSnapshotBefore, "signed_snapshot_changed_during_review");

  const bootstrapA = await post(config, "api-app-auth-bootstrap", customer.token, `${prefix}-bootstrap-a`, {});
  const bootstrapB = await post(config, "api-app-auth-bootstrap", customer.token, `${prefix}-bootstrap-b`, {});
  assert(bootstrapA.status === 200 && bootstrapB.status === 200 && JSON.stringify(bootstrapA.body.dossiers) === JSON.stringify(bootstrapB.body.dossiers) && Array.isArray(bootstrapA.body.dossiers) && bootstrapA.body.dossiers.some((item: Json) => item.case_id === caseId), "refresh_resume_failed");
  const correction = await request(config, `/functions/v1/api-app-customer-correction-handoff?caseRef=${caseRef}`, {
    method: "GET", headers: apiHeaders(config, customer.token),
  });
  assert(correction.status === 200 && correction.body.handoff === null, `clean_case_exposed_correction:${correction.status}`);
  const duplicateCounts = await psql(config, `select concat_ws('|',
    (select count(*) from public.app_customers where id=${quote(promotion.customer_id)}),
    (select count(*) from public.app_cases where source_ref=${quote(intakeReference)}),
    (select count(*) from public.app_signup_signing_snapshots where intake_id=${quote(intakeReference)}),
    (select count(*) from public.app_evidence_review_rounds where case_id=${quote(caseId)}));`);
  assert(duplicateCounts === "1|1|1|1", "refresh_or_retry_created_duplicate_truth");
  const auditCount = Number(await psql(config, `select count(*) from public.app_audit_events where customer_id=${quote(promotion.customer_id)} or scope_id=${quote(caseId)};`));
  assert(auditCount > 0, "audit_lineage_missing");
  const thirdPartyTables = await psql(config, `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and (c.relname like '%check_execution%' or c.relname like '%verifier_result%');`);
  assert(thirdPartyTables === "0", "unexpected_third_party_runtime_authority_present");

  summary = {
    customerRef: promotion.customer_id,
    caseRef,
    signingRef: String(finalized.body.safe_reference || promotion.signature_id),
    reviewRoundRef: String(review.body.roundRef || ""),
    reviewFactCount: subjects.length,
    auditCount,
  };
  marker("WAVE_A1_Q01_PRIVATE_ACCOUNT_CONTEXT");
  marker("WAVE_A1_Q02_SERVER_BOUND_READY_EVIDENCE");
  marker("WAVE_A1_Q03_SHARED_WORKFLOW_CONFIRMATION");
  marker("WAVE_A1_Q04_TYPED_NAME_OTP_SIGNING");
  marker("WAVE_A1_Q05_SIGNING_IDEMPOTENCY_IMMUTABILITY");
  marker("WAVE_A1_Q06_EXACT_CASE_REVIEW_AUTH");
  marker("WAVE_A1_Q07_ALL_FACTS_ACCEPTED_REVIEW_COMPLETE");
  marker("WAVE_A1_Q08_REFRESH_NO_CORRECTION_NO_DUPLICATES");
  marker("WAVE_A1_Q09_NO_EXTERNAL_VERIFICATION_FABRICATION");
} finally {
  await cleanup(config, service, prefix, ids, storage, authUsers, mailpitMessageId);
  pilotAfter = await pilotState(config);
  assert(pilotAfter === pilotBefore, "real_pilot_changed");
  const residue = await psql(config, `select
    (select count(*) from public.app_signup_intakes where id in (${[...ids].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).map(quote).join(",") || "null"})) +
    (select count(*) from public.app_cases where case_reference=${quote(String(summary.caseRef || "CASE-000000000000"))}) +
    (select count(*) from auth.users where id in (${[...authUsers].map(quote).join(",") || "null"}));`);
  assert(residue === "0", `fixture_cleanup_incomplete:${residue}`);
}

console.log(`WAVE_A1_FIXTURE=${JSON.stringify(summary)}`);
marker("WAVE_A1_FIXTURE_CLEANUP");
marker("WAVE_A1_REAL_PILOT_UNCHANGED");
console.log("QUALIFICATION_WAVE_A1_PRIVATE_CLEAN_END_TO_END=PASS");
