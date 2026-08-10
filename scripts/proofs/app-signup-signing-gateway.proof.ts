// Local gateway proof for 09B2C-R2. It issues signing challenges but never
// finalizes. Output is limited to case labels: no OTP, capability or PII.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;
type LocalConfig = {
  apiUrl: string;
  functionsUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailpitUrl: string;
};
type MailpitMessage = {
  ID?: string;
  To?: Array<{ Address?: string }>;
};

const ENTITY_TABLES = [
  "app_customers",
  "app_customer_identities",
  "app_customer_dossiers",
  "app_cases",
] as const;
const results: Array<{ id: string; ok: boolean }> = [];

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

async function run(id: string, proof: () => Promise<void>): Promise<void> {
  try {
    await proof();
    results.push({ id, ok: true });
  } catch (_error) {
    results.push({ id, ok: false });
  }
}

function localUrl(value: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      new URL(value).hostname,
    );
  } catch (_error) {
    return false;
  }
}

async function localConfig(): Promise<LocalConfig> {
  assert(
    Deno.env.get("ENVAL_ALLOW_LOCAL_SIGNING_GATEWAY_PROOF") === "YES",
    "local_signing_gateway_proof_not_enabled",
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
  const apiUrl = values.get("API_URL") || "";
  const functionsUrl = values.get("FUNCTIONS_URL") ||
    `${apiUrl}/functions/v1`;
  const mailpitUrl = values.get("MAILPIT_URL") ||
    values.get("INBUCKET_URL") || "";
  assert(
    localUrl(apiUrl) && localUrl(functionsUrl) && localUrl(mailpitUrl),
    "non_local_runtime_rejected",
  );
  const anonKey = values.get("ANON_KEY") || "";
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") || "";
  assert(anonKey && serviceRoleKey, "local_keys_unavailable");
  return { apiUrl, functionsUrl, anonKey, serviceRoleKey, mailpitUrl };
}

async function jsonRequest(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: Json }> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  assert(body && typeof body === "object" && !Array.isArray(body), "non_json");
  return { status: response.status, body: body as Json };
}

function headers(
  anonKey: string,
  idempotencyKey?: string,
): Record<string, string> {
  return {
    "Authorization": `Bearer ${anonKey}`,
    "apikey": anonKey,
    "Content-Type": "application/json",
    "Origin": "http://127.0.0.1:5175",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

async function startIntake(config: LocalConfig, email: string) {
  const request = { account_type: "zakelijk", email };
  assert(
    Object.keys(request).sort().join("|") === "account_type|email",
    "frontend_start_shape_changed",
  );
  const response = await jsonRequest(
    `${config.functionsUrl}/api-app-signup-intake-start`,
    {
      method: "POST",
      headers: headers(config.anonKey, `09b2c-r2-start-${crypto.randomUUID()}`),
      body: JSON.stringify(request),
    },
  );
  assert(response.status === 200 && response.body.ok === true, "start_failed");
  const intakeReference = String(response.body.intake_reference || "");
  const managementCapability = String(
    response.body.management_capability || "",
  );
  assert(intakeReference && managementCapability, "start_scope_missing");
  return { intakeReference, managementCapability };
}

async function challenge(
  config: LocalConfig,
  intakeReference: string,
  managementCapability: string,
  idempotencyKey: string,
) {
  return await jsonRequest(
    `${config.functionsUrl}/api-app-signup-signing-challenge`,
    {
      method: "POST",
      headers: headers(config.anonKey, idempotencyKey),
      body: JSON.stringify({
        intake_reference: intakeReference,
        management_capability: managementCapability,
      }),
    },
  );
}

async function mailpitMessages(
  mailpitUrl: string,
): Promise<{ total: number; messages: MailpitMessage[] }> {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  assert(response.ok, "mailpit_api_unavailable");
  const body = await response.json() as {
    total?: number;
    messages?: MailpitMessage[];
  };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return {
    total: Number.isInteger(body.total) ? Number(body.total) : messages.length,
    messages,
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
  const config = await localConfig();
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const entitiesBefore = await entityCounts(service);
  const email = `09b2c-r2-${crypto.randomUUID()}@example.invalid`;
  const owner = await startIntake(config, email);
  const otherOwner = await startIntake(
    config,
    `09b2c-r2-other-${crypto.randomUUID()}@example.invalid`,
  );
  let challengeReference = "";
  let firstMailpitTotal = 0;
  let challengeIdempotencyKey = "";

  await run("Q01_local_gateway_options", async () => {
    const response = await fetch(
      `${config.functionsUrl}/api-app-signup-signing-challenge`,
      {
        method: "OPTIONS",
        headers: { "Origin": "http://127.0.0.1:5175" },
      },
    );
    assert(response.status === 200, "challenge_options_failed");
  });

  await run("Q02_local_challenge_and_mailpit_delivery", async () => {
    const before = await mailpitMessages(config.mailpitUrl);
    challengeIdempotencyKey = `09b2c-r2-challenge-${crypto.randomUUID()}`;
    const response = await challenge(
      config,
      owner.intakeReference,
      owner.managementCapability,
      challengeIdempotencyKey,
    );
    assert(
      response.status === 201 && response.body.ok === true,
      "challenge_failed",
    );
    assert(
      Object.keys(response.body).sort().join("|") ===
        "attempts_remaining|challenge_reference|delivery_target_masked|expires_at|legal_bundle_mode|legal_documents|mode|ok|replayed",
      "challenge_response_shape_changed",
    );
    const serialized = JSON.stringify(response.body);
    assert(
      !serialized.includes(email) &&
        !serialized.includes(owner.managementCapability) &&
        !Object.keys(response.body).some((key) =>
          ["otp", "secret", "capability"].some((word) =>
            key.toLowerCase().includes(word)
          )
        ),
      "challenge_response_leaked_secret",
    );
    challengeReference = String(response.body.challenge_reference || "");
    assert(challengeReference, "challenge_reference_missing");
    const row = await service.from("app_signup_signing_challenges")
      .select(
        "delivery_status,transport_id,provider_delivery_reference,otp_verifier_sha256,attempts_remaining",
      )
      .eq("id", challengeReference)
      .eq("intake_id", owner.intakeReference)
      .single();
    assert(
      !row.error && row.data.delivery_status === "delivered" &&
        row.data.transport_id === "local_mailpit_v1" &&
        String(row.data.provider_delivery_reference || "").startsWith(
          "mailpit:",
        ) &&
        /^[0-9a-f]{64}$/.test(row.data.otp_verifier_sha256) &&
        row.data.attempts_remaining === 5,
      "delivered_challenge_evidence_invalid",
    );
    const after = await mailpitMessages(config.mailpitUrl);
    assert(
      after.total === before.total + 1 &&
        after.messages.some((message) =>
          message.To?.some((recipient) => recipient.Address === email)
        ),
      "mailpit_delivery_missing",
    );
    firstMailpitTotal = after.total;
  });

  await run("Q03_idempotent_replay_does_not_redeliver", async () => {
    const response = await challenge(
      config,
      owner.intakeReference,
      owner.managementCapability,
      challengeIdempotencyKey,
    );
    const messages = await mailpitMessages(config.mailpitUrl);
    assert(
      response.status === 201 && response.body.ok === true &&
        response.body.replayed === true &&
        response.body.challenge_reference === challengeReference &&
        messages.total === firstMailpitTotal,
      "challenge_replay_invalid",
    );
  });

  await run("Q04_capability_scope_rejected", async () => {
    const response = await challenge(
      config,
      owner.intakeReference,
      otherOwner.managementCapability,
      `09b2c-r2-wrong-owner-${crypto.randomUUID()}`,
    );
    const messages = await mailpitMessages(config.mailpitUrl);
    assert(
      response.status === 403 &&
        response.body.code === "challenge_unavailable" &&
        messages.total === firstMailpitTotal,
      "cross_intake_capability_accepted",
    );
  });

  await run("Q05_rate_limit_remains_server_authoritative", async () => {
    for (let count = 0; count < 2; count += 1) {
      const response = await challenge(
        config,
        owner.intakeReference,
        owner.managementCapability,
        `09b2c-r2-resend-${count}-${crypto.randomUUID()}`,
      );
      assert(
        response.status === 201 && response.body.ok === true,
        "resend_failed",
      );
    }
    const beforeLimited = await mailpitMessages(config.mailpitUrl);
    const limited = await challenge(
      config,
      owner.intakeReference,
      owner.managementCapability,
      `09b2c-r2-limited-${crypto.randomUUID()}`,
    );
    const afterLimited = await mailpitMessages(config.mailpitUrl);
    assert(
      limited.status === 429 && limited.body.code === "rate_limited" &&
        afterLimited.total === beforeLimited.total,
      "challenge_rate_limit_invalid",
    );
  });

  await run("Q06_no_entity_promotion", async () => {
    const entitiesAfter = await entityCounts(service);
    for (const table of ENTITY_TABLES) {
      assert(
        entitiesAfter.get(table) === entitiesBefore.get(table),
        "entity_promoted",
      );
    }
  });

  for (const result of results) {
    console.log(`${result.id}=${result.ok ? "PASS" : "FAIL"}`);
  }
  assert(results.every((result) => result.ok), "signing_gateway_proof_failed");
  console.log("signup-signing-gateway-09b2c-r2-proof-ok");
}

await main();
