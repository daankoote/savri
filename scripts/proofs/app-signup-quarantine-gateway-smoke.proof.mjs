#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const MARKER = "signup-quarantine-gateway-smoke-09b1a-ok";
const ENTITY_TABLES = [
  "app_customers",
  "app_customer_identities",
  "app_cases",
  "app_customer_dossiers",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readLocalConfig() {
  const result = spawnSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert(result.status === 0, "local_supabase_status_unavailable");
  const values = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1], match[2].replace(/"$/, ""));
  }
  const url = values.get("API_URL") || "";
  const hostname = new URL(url).hostname;
  assert(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname),
    "non_local_target_rejected",
  );
  const anonKey = values.get("ANON_KEY") || "";
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") || "";
  assert(anonKey && serviceRoleKey, "local_keys_unavailable");
  return { url, anonKey, serviceRoleKey };
}

async function responseJson(response) {
  const body = await response.json().catch(() => null);
  assert(
    body && typeof body === "object" && !Array.isArray(body),
    `non_json_response:${response.status}`,
  );
  return body;
}

async function entityCounts(config) {
  const counts = new Map();
  for (const table of ENTITY_TABLES) {
    const response = await fetch(`${config.url}/rest/v1/${table}?select=id`, {
      method: "HEAD",
      headers: {
        apikey: config.serviceRoleKey,
        authorization: `Bearer ${config.serviceRoleKey}`,
        prefer: "count=exact",
        range: "0-0",
      },
    });
    assert(response.ok, `entity_count_failed:${table}:${response.status}`);
    const match = (response.headers.get("content-range") || "").match(
      /\/(\d+)$/,
    );
    assert(match, `entity_count_missing:${table}`);
    counts.set(table, Number(match[1]));
  }
  return counts;
}

async function main() {
  assert(
    process.env.ENVAL_ALLOW_LOCAL_SIGNUP_QUARANTINE_PROOF === "YES",
    "local_gateway_proof_not_enabled",
  );
  const config = readLocalConfig();
  const endpoint = `${config.url}/functions/v1/api-app-signup-intake-start`;
  const authHeaders = {
    apikey: config.anonKey,
    authorization: `Bearer ${config.anonKey}`,
    "content-type": "application/json",
    origin: "http://localhost:5174",
  };
  const before = await entityCounts(config);

  const preflight = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:5174",
      "access-control-request-method": "POST",
      "access-control-request-headers":
        "apikey,authorization,content-type,idempotency-key",
    },
  });
  assert(preflight.ok, `preflight_failed:${preflight.status}`);
  assert(
    ![502, 503, 504].includes(preflight.status),
    "preflight_gateway_failure",
  );
  console.log("Q01 options reached function runtime: PASS");

  const incomplete = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...authHeaders,
      "idempotency-key": `09b1a-incomplete-${crypto.randomUUID()}`,
    },
    body: "{}",
  });
  const incompleteBody = await responseJson(incomplete);
  assert(
    incomplete.status >= 400 && incomplete.status < 500,
    `incomplete_not_safe_4xx:${incomplete.status}`,
  );
  assert(
    incompleteBody.code === "invalid_signup_basis",
    "incomplete_not_function_response",
  );
  console.log(
    `Q02 incomplete payload returned safe function 4xx (${incomplete.status}): PASS`,
  );

  const idempotencyKey = `09b1a-start-${crypto.randomUUID()}`;
  const payload = {
    account_type: "particulier",
    email: `proof-${crypto.randomUUID()}@example.invalid`,
  };
  const request = (body) =>
    fetch(endpoint, {
      method: "POST",
      headers: { ...authHeaders, "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
    });

  const first = await request(payload);
  const firstBody = await responseJson(first);
  assert(
    first.status === 200 && firstBody.ok === true,
    `valid_start_failed:${first.status}`,
  );
  assert(
    typeof firstBody.intake_reference === "string",
    "valid_start_missing_reference",
  );
  assert(
    typeof firstBody.management_capability === "string",
    "valid_start_missing_capability",
  );
  console.log("Q03 valid gateway start returned 200: PASS");

  const replay = await request(payload);
  const replayBody = await responseJson(replay);
  assert(
    replay.status === 200 && replayBody.ok === true &&
      replayBody.replayed === true,
    `replay_failed:${replay.status}`,
  );
  assert(
    replayBody.intake_reference === firstBody.intake_reference,
    "replay_changed_intake",
  );
  assert(
    replayBody.management_capability === firstBody.management_capability,
    "replay_changed_capability",
  );
  console.log("Q04 same-key replay returned the same safe references: PASS");

  const conflict = await request({ ...payload, account_type: "zakelijk" });
  const conflictBody = await responseJson(conflict);
  assert(
    conflict.status === 409 && conflictBody.code === "idempotency_conflict",
    `conflict_failed:${conflict.status}`,
  );
  console.log("Q05 same key with different payload returned conflict: PASS");

  const after = await entityCounts(config);
  for (const table of ENTITY_TABLES) {
    assert(after.get(table) === before.get(table), `entity_created:${table}`);
  }
  console.log("Q06 no customer, identity, case, or dossier created: PASS");
  console.log(MARKER);
}

main().catch((error) => {
  console.error(
    `signup-quarantine-gateway-smoke-09b1a-failed:${
      error instanceof Error ? error.message : "unknown"
    }`,
  );
  process.exitCode = 1;
});
