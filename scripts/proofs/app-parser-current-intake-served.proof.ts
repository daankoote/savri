import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { payloadHash } from "../../supabase/functions/_shared/app_foundation.ts";
import { inspectPrivateStorageBytes } from "../../supabase/functions/_shared/signup_quarantine.ts";
import { isParserObservationEnvelopeV1 } from "../../platform/runtime/document-parsing/document_parser_contract.ts";

const CORE_TABLES = [
  "app_customers",
  "app_cases",
  "app_customer_dossiers",
  "app_evidence_review_decisions",
] as const;

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

async function localConfig() {
  const output = await new Deno.Command("supabase", {
    args: ["status", "-o", "env"],
    stdout: "piped",
    stderr: "piped",
    env: { SUPABASE_TELEMETRY_DISABLED: "1" },
  }).output();
  assert(output.code === 0, "local_supabase_status_unavailable");
  const values = new Map<string, string>();
  for (const line of new TextDecoder().decode(output.stdout).split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1], match[2].replace(/"$/, ""));
  }
  const url = values.get("API_URL") || "";
  assert(["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname), "non_local_target");
  const anonKey = values.get("ANON_KEY") || "";
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") || "";
  assert(anonKey && serviceRoleKey, "local_keys_unavailable");
  return { url, anonKey, serviceRoleKey };
}

function energyPdf(): Uint8Array {
  const lines = [
    "Onze gegevens: Pilot Energie Nederland B.V.",
    "Contracthouder Voorbeeld Persoon",
    "Leveradres Bewijsstraat 12",
    "Postcode 1234 AB Proefstad",
    "Elektriciteit 871685900012345678",
  ];
  const hex = (value: string) => Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const stream = ["BT", "/F1 12 Tf", ...lines.flatMap((line, index) => [
    `1 0 0 1 72 ${720 - index * 20} Tm`,
    `<${hex(line)}> Tj`,
  ]), "ET"].join("\n");
  return new TextEncoder().encode([
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "endobj",
    "3 0 obj",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "endobj",
    "4 0 obj",
    `<< /Length ${stream.length} >>`,
    "stream",
    stream,
    "endstream",
    "endobj",
    "5 0 obj",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "endobj",
    "%%EOF",
  ].join("\n"));
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  assert(body && typeof body === "object" && !Array.isArray(body), `non_json:${response.status}`);
  return body as Record<string, unknown>;
}

async function countRows(client: any, table: string): Promise<number> {
  const { count, error } = await client.from(table).select("id", {
    head: true,
    count: "exact",
  });
  assert(!error && typeof count === "number", `count_failed:${table}`);
  return count;
}

const config = await localConfig();
const service = createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false },
});
const before = new Map<string, number>();
for (const table of CORE_TABLES) before.set(table, await countRows(service, table));

const commonHeaders = {
  apikey: config.anonKey,
  authorization: `Bearer ${config.anonKey}`,
  "content-type": "application/json",
  origin: "http://localhost:5175",
};
const post = async (path: string, body: unknown) => {
  const response = await fetch(`${config.url}/functions/v1/${path}`, {
    method: "POST",
    headers: { ...commonHeaders, "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  return { response, body: await json(response) };
};

const start = await post("api-app-signup-intake-start", {
  account_type: "particulier",
  email: `parser-proof-${crypto.randomUUID()}@example.invalid`,
});
assert(start.response.status === 200 && start.body.ok === true, `intake_start_failed:${start.response.status}`);
const intakeReference = String(start.body.intake_reference || "");
const managementCapability = String(start.body.management_capability || "");
assert(intakeReference && managementCapability, "intake_capability_missing");

const pdf = energyPdf();
const byteSha256 = (await inspectPrivateStorageBytes(
  Uint8Array.from(pdf).buffer,
)).serverSha256;
const issue = await post("api-app-signup-upload-url", {
  operation: "issue",
  intake_reference: intakeReference,
  management_capability: managementCapability,
  client_slot_id: `parser-energy-${crypto.randomUUID()}`,
  document_type: "energy_bill_or_contract",
  file_name: "energy-proof.pdf",
  mime_type: "application/pdf",
  size_bytes: pdf.byteLength,
  client_sha256: byteSha256,
});
assert(issue.response.status === 201 && issue.body.ok === true, `upload_issue_failed:${issue.response.status}`);
const bucket = String(issue.body.storage_bucket || "");
const path = String(issue.body.storage_path || "");
const uploadToken = String(issue.body.upload_token || "");
const fileReference = String(issue.body.file_reference || "");
const fileCapability = String(issue.body.quarantine_upload_capability || "");
assert(bucket && path && uploadToken && fileReference && fileCapability, "upload_issue_shape_invalid");
const upload = await service.storage.from(bucket).uploadToSignedUrl(
  path,
  uploadToken,
  new Blob([Uint8Array.from(pdf).buffer], { type: "application/pdf" }),
  { contentType: "application/pdf" },
);
assert(!upload.error, "signed_upload_failed");

const confirm = await post("api-app-signup-upload-confirm", {
  intake_reference: intakeReference,
  file_reference: fileReference,
  quarantine_upload_capability: fileCapability,
});
assert(confirm.response.status === 200 && confirm.body.ok === true, `upload_confirm_failed:${confirm.response.status}`);
const observation = confirm.body.parser_observation;
assert(isParserObservationEnvelopeV1(observation), "served_parser_observation_missing");
const keys = observation.observedFacts.filter((item) => item.status === "observed")
  .map((item) => item.factKey);
assert(
  observation.parserProfile === "energy_document_v1" &&
    keys.includes("energySupplier") && keys.includes("electricityEan") &&
    keys.includes("partyName") && keys.includes("structuredAddress"),
  "served_energy_observations_incomplete",
);
assert(
  observation.observedFacts.some((item) =>
    item.factKey === "energySupplier" &&
    item.normalizedObservedValue === "Pilot Energie Nederland B.V."
  ),
  "pilot_equivalent_supplier_observation_missing",
);
const { envelopeHash: _hash, ...hashInput } = observation;
assert(await payloadHash(hashInput) === observation.envelopeHash, "served_envelope_hash_invalid");
const persisted = await service.from("app_parser_observation_envelopes")
  .select("id,envelope_hash,parser_profile")
  .eq("id", observation.observationRef).maybeSingle();
assert(
  !persisted.error && persisted.data?.envelope_hash === observation.envelopeHash &&
    persisted.data?.parser_profile === "energy_document_v1",
  "served_observation_not_persisted",
);
for (const table of CORE_TABLES) {
  assert(await countRows(service, table) === before.get(table), `core_truth_mutated:${table}`);
}

console.log("SERVED_CURRENT_INTAKE_PARSER_Q01_Q12=PASS");
