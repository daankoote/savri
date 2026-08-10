// Local gateway proof for 09B2D. It exercises the real challenge endpoint,
// local database and Mailpit metadata without reading or printing message bodies,
// OTP values, capabilities, recipient addresses or authorization secrets.

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
type Fixture = {
  intakeReference: string;
  managementCapability: string;
  recipient: string;
};
type MailpitMessage = {
  ID?: string;
  MessageID?: string;
  Created?: string;
  Subject?: string;
  To?: Array<{ Address?: string }>;
};
type State = {
  challenges: number;
  delivered: number;
  mailpit: number;
};
type Delta = State & { http: string };
type CaseResult = { id: string; ok: boolean; delta: Delta };

const EXPECTED_SUBJECT = "Je ENVAL ondertekencode";
const results: CaseResult[] = [];
const safeOutput: string[] = [];

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
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
    Deno.env.get("ENVAL_ALLOW_LOCAL_SIGNING_MULTIPLICITY_PROOF") === "YES",
    "local_signing_multiplicity_proof_not_enabled",
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
  idempotencyKey: string,
): Record<string, string> {
  return {
    "Authorization": `Bearer ${anonKey}`,
    "apikey": anonKey,
    "Content-Type": "application/json",
    "Origin": "http://127.0.0.1:5175",
    "Idempotency-Key": idempotencyKey,
  };
}

async function startIntake(
  config: LocalConfig,
  label: string,
): Promise<Fixture> {
  const recipient = `09b2d-${label}-${crypto.randomUUID()}@example.invalid`;
  const response = await jsonRequest(
    `${config.functionsUrl}/api-app-signup-intake-start`,
    {
      method: "POST",
      headers: headers(config.anonKey, `09b2d-start-${crypto.randomUUID()}`),
      body: JSON.stringify({ account_type: "zakelijk", email: recipient }),
    },
  );
  assert(response.status === 200 && response.body.ok === true, "start_failed");
  const intakeReference = String(response.body.intake_reference || "");
  const managementCapability = String(
    response.body.management_capability || "",
  );
  assert(intakeReference && managementCapability, "start_scope_missing");
  return { intakeReference, managementCapability, recipient };
}

async function challenge(
  config: LocalConfig,
  fixture: Fixture,
  idempotencyKey: string,
  managementCapability = fixture.managementCapability,
): Promise<{ status: number; body: Json }> {
  return await jsonRequest(
    `${config.functionsUrl}/api-app-signup-signing-challenge`,
    {
      method: "POST",
      headers: headers(config.anonKey, idempotencyKey),
      body: JSON.stringify({
        intake_reference: fixture.intakeReference,
        management_capability: managementCapability,
      }),
    },
  );
}

async function mailpitMessages(mailpitUrl: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  assert(response.ok, "mailpit_api_unavailable");
  const body = await response.json() as { messages?: MailpitMessage[] };
  return Array.isArray(body.messages) ? body.messages : [];
}

function recipientMessages(
  messages: MailpitMessage[],
  recipient: string,
): MailpitMessage[] {
  return messages.filter((message) =>
    message.Subject === EXPECTED_SUBJECT &&
    message.To?.some((target) => target.Address === recipient)
  );
}

async function state(
  service: SupabaseClient,
  config: LocalConfig,
  fixture: Fixture,
): Promise<State> {
  const rows = await service.from("app_signup_signing_challenges")
    .select("id,delivery_status")
    .eq("intake_id", fixture.intakeReference);
  assert(
    !rows.error && Array.isArray(rows.data),
    "challenge_state_unavailable",
  );
  const messages = recipientMessages(
    await mailpitMessages(config.mailpitUrl),
    fixture.recipient,
  );
  return {
    challenges: rows.data.length,
    delivered: rows.data.filter((row) => row.delivery_status === "delivered")
      .length,
    mailpit: messages.length,
  };
}

function delta(before: State, after: State, http: string): Delta {
  return {
    challenges: after.challenges - before.challenges,
    delivered: after.delivered - before.delivered,
    mailpit: after.mailpit - before.mailpit,
    http,
  };
}

function record(id: string, ok: boolean, measured: Delta): void {
  results.push({ id, ok, delta: measured });
}

function responseIsSafe(response: { status: number; body: Json }): boolean {
  const serialized = JSON.stringify(response.body);
  return !Object.keys(response.body).some((key) =>
    ["otp", "secret", "capability"].some((word) =>
      key.toLowerCase().includes(word)
    )
  ) && !/\b\d{6}\b/.test(serialized);
}

async function assertFrontendSingleFlightSource(): Promise<void> {
  const summary = await Deno.readTextFile(
    "app/src/features/signup/DocumentFirstSigningSummary.tsx",
  );
  const client = await Deno.readTextFile(
    "app/src/features/signup/signupSigningClient.ts",
  );
  const handler = summary.slice(
    summary.indexOf("const requestChallenge = async"),
    summary.indexOf("const finalizeSigning = async"),
  );
  assert(
    handler.includes("if (challengeRequestInFlightRef.current) return") &&
      handler.includes("challengeRequestInFlightRef.current = true") &&
      handler.includes("challengeRequestInFlightRef.current = false") &&
      (handler.match(/requestSignupSigningChallenge\(\)/g) || []).length === 1,
    "frontend_single_flight_changed",
  );
  assert(
    client.includes('"Idempotency-Key": createUploadIdempotencyKey()') &&
      client.includes("requestSignupSigningChallenge"),
    "frontend_request_shape_changed",
  );
}

async function assertDeliveryCorrelation(
  service: SupabaseClient,
  config: LocalConfig,
  issued: Map<string, { fixture: Fixture; deliveredAt: string }>,
): Promise<void> {
  const messages = await mailpitMessages(config.mailpitUrl);
  const claimedMessageIds = new Set<string>();
  for (const [reference, evidence] of issued) {
    const row = await service.from("app_signup_signing_challenges")
      .select(
        "delivery_status,transport_id,provider_delivery_reference,delivered_at",
      )
      .eq("id", reference)
      .eq("intake_id", evidence.fixture.intakeReference)
      .single();
    assert(
      !row.error && row.data.delivery_status === "delivered" &&
        row.data.transport_id === "local_mailpit_v1" &&
        row.data.provider_delivery_reference === `mailpit:${reference}` &&
        typeof row.data.delivered_at === "string",
      "delivery_evidence_invalid",
    );
    const deliveredAt = new Date(row.data.delivered_at).getTime();
    const candidates = recipientMessages(messages, evidence.fixture.recipient)
      .filter((message) => {
        const createdAt = new Date(String(message.Created || "")).getTime();
        return Number.isFinite(createdAt) &&
          Math.abs(createdAt - deliveredAt) <= 5_000;
      })
      .sort((left, right) =>
        Math.abs(new Date(String(left.Created)).getTime() - deliveredAt) -
        Math.abs(new Date(String(right.Created)).getTime() - deliveredAt)
      );
    const correlated = candidates.find((message) =>
      message.ID && !claimedMessageIds.has(message.ID)
    );
    assert(correlated?.ID, "mailpit_delivery_not_correlated");
    claimedMessageIds.add(correlated.ID);
  }
  assert(claimedMessageIds.size === issued.size, "delivery_not_one_to_one");
}

async function main(): Promise<void> {
  const config = await localConfig();
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const issued = new Map<string, { fixture: Fixture; deliveredAt: string }>();
  const sensitiveValues = new Set<string>([
    config.anonKey,
    config.serviceRoleKey,
  ]);

  const fresh = await startIntake(config, "fresh");
  sensitiveValues.add(fresh.managementCapability);
  sensitiveValues.add(fresh.recipient);
  const freshKey = `09b2d-fresh-${crypto.randomUUID()}`;
  const q01Before = await state(service, config, fresh);
  const q01Response = await challenge(config, fresh, freshKey);
  const q01After = await state(service, config, fresh);
  const q01Delta = delta(q01Before, q01After, String(q01Response.status));
  const q01Reference = String(q01Response.body.challenge_reference || "");
  const q01Ok = q01Response.status === 201 && q01Response.body.ok === true &&
    q01Response.body.replayed === false && q01Reference &&
    q01Delta.challenges === 1 && q01Delta.delivered === 1 &&
    q01Delta.mailpit === 1 && responseIsSafe(q01Response);
  record("Q01_fresh_logical_challenge", Boolean(q01Ok), q01Delta);
  if (q01Reference) {
    const row = await service.from("app_signup_signing_challenges")
      .select("delivered_at").eq("id", q01Reference).single();
    if (!row.error && typeof row.data.delivered_at === "string") {
      issued.set(q01Reference, {
        fixture: fresh,
        deliveredAt: row.data.delivered_at,
      });
    }
  }

  const q02Before = await state(service, config, fresh);
  const q02Response = await challenge(config, fresh, freshKey);
  const q02After = await state(service, config, fresh);
  const q02Delta = delta(q02Before, q02After, String(q02Response.status));
  record(
    "Q02_exact_idempotent_replay",
    q02Response.status === 201 && q02Response.body.ok === true &&
      q02Response.body.replayed === true &&
      q02Response.body.challenge_reference === q01Reference &&
      q02Delta.challenges === 0 && q02Delta.delivered === 0 &&
      q02Delta.mailpit === 0 && responseIsSafe(q02Response),
    q02Delta,
  );

  const clickFixture = await startIntake(config, "single-flight");
  sensitiveValues.add(clickFixture.managementCapability);
  sensitiveValues.add(clickFixture.recipient);
  const q03Before = await state(service, config, clickFixture);
  const clickKey = `09b2d-single-flight-${crypto.randomUUID()}`;
  let requestInFlight = false;
  let networkCalls = 0;
  let firstResponse: { status: number; body: Json } | null = null;
  const browserClick = async (): Promise<void> => {
    if (requestInFlight) return;
    requestInFlight = true;
    networkCalls += 1;
    try {
      firstResponse = await challenge(config, clickFixture, clickKey);
    } finally {
      requestInFlight = false;
    }
  };
  let q03SourceOk = true;
  try {
    await assertFrontendSingleFlightSource();
  } catch (_error) {
    q03SourceOk = false;
  }
  await Promise.all([browserClick(), browserClick()]);
  const completedResponse = firstResponse as {
    status: number;
    body: Json;
  } | null;
  const q03After = await state(service, config, clickFixture);
  const q03Delta = delta(
    q03Before,
    q03After,
    completedResponse ? String(completedResponse.status) : "none",
  );
  const q03Reference = String(
    completedResponse?.body.challenge_reference || "",
  );
  record(
    "Q03_browser_single_flight",
    q03SourceOk && networkCalls === 1 && completedResponse?.status === 201 &&
      q03Delta.challenges === 1 && q03Delta.delivered === 1 &&
      q03Delta.mailpit === 1,
    q03Delta,
  );
  if (q03Reference) {
    const row = await service.from("app_signup_signing_challenges")
      .select("delivered_at").eq("id", q03Reference).single();
    if (!row.error && typeof row.data.delivered_at === "string") {
      issued.set(q03Reference, {
        fixture: clickFixture,
        deliveredAt: row.data.delivered_at,
      });
    }
  }

  const q04Before = await state(service, config, fresh);
  const otherOwner = await startIntake(config, "other-owner");
  sensitiveValues.add(otherOwner.managementCapability);
  sensitiveValues.add(otherOwner.recipient);
  const q04Response = await challenge(
    config,
    fresh,
    freshKey,
    otherOwner.managementCapability,
  );
  const q04After = await state(service, config, fresh);
  const q04Delta = delta(q04Before, q04After, String(q04Response.status));
  record(
    "Q04_incompatible_capability_rejected",
    q04Response.status === 403 &&
      q04Response.body.code === "challenge_unavailable" &&
      q04Response.body.ok !== true &&
      !Object.hasOwn(q04Response.body, "challenge_reference") &&
      q04Delta.challenges === 0 && q04Delta.delivered === 0 &&
      q04Delta.mailpit === 0 && responseIsSafe(q04Response),
    q04Delta,
  );

  const q05Before = await state(service, config, fresh);
  const q05Rpc = await service.rpc("app_signup_signing_challenge_issue_v1", {
    p_intake_id: fresh.intakeReference,
    p_manage_token_sha256: await sha256Hex(fresh.managementCapability),
    p_channel_reference_sha256: "a".repeat(64),
    p_otp_verifier_sha256: "b".repeat(64),
    p_expires_at: new Date(Date.now() + 9 * 60_000).toISOString(),
    p_payload_hash: "f".repeat(64),
    p_request_id: `09b2e-conflict-request-${crypto.randomUUID()}`,
    p_idempotency_key: freshKey,
    p_ip_hash: null,
    p_user_agent_hash: null,
    p_environment: "local-proof",
  });
  const q05Body = q05Rpc.data as Json | null;
  const q05After = await state(service, config, fresh);
  const q05Delta = delta(
    q05Before,
    q05After,
    q05Body ? `${String(q05Body.status || "none")}_rpc` : "rpc_error",
  );
  record(
    "Q05_incompatible_payload_conflict",
    !q05Rpc.error && q05Body?.ok === false && q05Body?.status === 409 &&
      q05Body?.code === "idempotency_conflict" &&
      !Object.hasOwn(q05Body, "challenge_reference") &&
      q05Delta.challenges === 0 && q05Delta.delivered === 0 &&
      q05Delta.mailpit === 0,
    q05Delta,
  );

  const limited = await startIntake(config, "rate-limit");
  sensitiveValues.add(limited.managementCapability);
  sensitiveValues.add(limited.recipient);
  const q06Before = await state(service, config, limited);
  const allowedResponses: Array<{ status: number; body: Json }> = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await challenge(
      config,
      limited,
      `09b2d-rate-allowed-${attempt}-${crypto.randomUUID()}`,
    );
    allowedResponses.push(response);
    const reference = String(response.body.challenge_reference || "");
    if (reference) {
      const row = await service.from("app_signup_signing_challenges")
        .select("delivered_at").eq("id", reference).single();
      if (!row.error && typeof row.data.delivered_at === "string") {
        issued.set(reference, {
          fixture: limited,
          deliveredAt: row.data.delivered_at,
        });
      }
    }
  }
  const blockedResponse = await challenge(
    config,
    limited,
    `09b2d-rate-blocked-${crypto.randomUUID()}`,
  );
  const q06After = await state(service, config, limited);
  const q06Delta = delta(
    q06Before,
    q06After,
    `${
      allowedResponses.map((response) => response.status).join(",")
    },${blockedResponse.status}`,
  );
  record(
    "Q06_rate_limit",
    allowedResponses.every((response) =>
      response.status === 201 && response.body.ok === true
    ) && blockedResponse.status === 429 &&
      blockedResponse.body.code === "rate_limited" &&
      q06Delta.challenges === 3 && q06Delta.delivered === 3 &&
      q06Delta.mailpit === 3 && responseIsSafe(blockedResponse),
    q06Delta,
  );

  const legitimate = await startIntake(config, "legitimate-new");
  sensitiveValues.add(legitimate.managementCapability);
  sensitiveValues.add(legitimate.recipient);
  const q07Before = await state(service, config, legitimate);
  const q07Response = await challenge(
    config,
    legitimate,
    `09b2d-legitimate-${crypto.randomUUID()}`,
  );
  const q07After = await state(service, config, legitimate);
  const q07Delta = delta(q07Before, q07After, String(q07Response.status));
  const q07Reference = String(q07Response.body.challenge_reference || "");
  if (q07Reference) {
    const row = await service.from("app_signup_signing_challenges")
      .select("delivered_at").eq("id", q07Reference).single();
    if (!row.error && typeof row.data.delivered_at === "string") {
      issued.set(q07Reference, {
        fixture: legitimate,
        deliveredAt: row.data.delivered_at,
      });
    }
  }

  let q07Ok = true;
  try {
    await assertDeliveryCorrelation(service, config, issued);
  } catch (_error) {
    q07Ok = false;
  }
  record(
    "Q07_new_challenge_and_correlation",
    q07Response.status === 201 && q07Response.body.ok === true &&
      q07Response.body.replayed === false && q07Delta.challenges === 1 &&
      q07Delta.delivered === 1 && q07Delta.mailpit === 1 && q07Ok &&
      issued.size === 6,
    q07Delta,
  );

  for (const result of results) {
    safeOutput.push(
      `${result.id}=${result.ok ? "PASS" : "FAIL"} ` +
        `challenge_delta=${result.delta.challenges} ` +
        `delivery_delta=${result.delta.delivered} ` +
        `mailpit_delta=${result.delta.mailpit} http=${result.delta.http}`,
    );
  }
  const serializedOutput = safeOutput.join("\n");
  const q08Ok =
    [...sensitiveValues].every((value) =>
      value.length === 0 || !serializedOutput.includes(value)
    ) && !/\b\d{6}\b/.test(serializedOutput) &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serializedOutput) &&
    !/authorization|service_role|bearer/i.test(serializedOutput);
  record("Q08_sensitive_output", q08Ok, {
    challenges: 0,
    delivered: 0,
    mailpit: 0,
    http: "not_applicable",
  });
  safeOutput.push(
    `Q08_sensitive_output=${q08Ok ? "PASS" : "FAIL"} ` +
      "challenge_delta=0 delivery_delta=0 mailpit_delta=0 http=not_applicable",
  );

  for (const line of safeOutput) console.log(line);
  const allPassed = results.every((result) => result.ok) && q08Ok;
  if (!allPassed) {
    console.log("signup-signing-delivery-multiplicity-09b2d-proof-failed");
    Deno.exit(1);
  }
  console.log("signup-signing-delivery-multiplicity-09b2d-proof-ok");
}

await main();
