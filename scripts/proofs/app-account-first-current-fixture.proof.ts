// Local-only recovery proof for the existing account-first browser fixture.
// It creates no Auth user or application. The normal local Supabase magic-link
// flow establishes a real bearer session; fixture identifiers stay in memory.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  deriveCapabilityToken,
} from "../../supabase/functions/_shared/signup_quarantine.ts";
import { localConfig } from "./app-signup-promotion-runtime.proof.ts";

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function marker(id: string): void {
  console.log(`${id}=PASS`);
}

const config = await localConfig();
Deno.env.set("SUPABASE_URL", config.url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", config.serviceRoleKey);
const edgeEnvironment = await new Deno.Command("docker", {
  args: [
    "inspect",
    "supabase_edge_runtime_enval",
    "--format",
    "{{range .Config.Env}}{{println .}}{{end}}",
  ],
  stdout: "piped",
  stderr: "piped",
}).output();
assert(edgeEnvironment.success, "local_edge_environment_unavailable");
const capabilitySecretLine = new TextDecoder().decode(edgeEnvironment.stdout)
  .split("\n")
  .find((line) => line.startsWith("APP_SIGNUP_CAPABILITY_SECRET="));
assert(capabilitySecretLine, "local_capability_secret_unavailable");
Deno.env.set(
  "APP_SIGNUP_CAPABILITY_SECRET",
  capabilitySecretLine.slice("APP_SIGNUP_CAPABILITY_SECRET=".length),
);

const query = String.raw`
with target_user as (
  select u.id, u.email
  from auth.users u
  where u.email_confirmed_at is not null
    and exists (
      select 1
      from public.app_signup_intakes intake
      join public.app_signup_signature_evidence evidence
        on evidence.intake_id = intake.id
      where intake.email_normalized = lower(u.email)
    )
    and not exists (
      select 1
      from public.app_signup_intakes intake
      where intake.email_normalized = lower(u.email)
        and coalesce(intake.request_id, '') like '%09c1c-r5%'
    )
    and exists (
      select 1
      from public.app_signup_intakes intake
      join public.app_idempotency_keys idempotency
        on idempotency.scope like
          'api-app-signup-signing-finalize:v1:%' || intake.id::text || '%'
      where intake.email_normalized = lower(u.email)
        and not (idempotency.response_body ? 'promotion_state')
        and not (idempotency.response_body ? 'account_handoff')
    )
  order by u.created_at desc
  limit 1
), target_intake as (
  select intake.id, intake.submitted_payload_sha256, intake.status,
         idempotency.key as start_idempotency_key
  from public.app_signup_intakes intake
  join target_user on intake.email_normalized = lower(target_user.email)
  join public.app_signup_signature_evidence evidence
    on evidence.intake_id = intake.id
  join public.app_idempotency_keys idempotency
    on idempotency.scope = 'api-app-signup-intake-start:v1'
   and idempotency.response_body ->> 'intake_reference' = intake.id::text
  order by intake.created_at desc
  limit 1
)
select target_user.id, target_user.email, target_intake.id,
       target_intake.start_idempotency_key,
       target_intake.submitted_payload_sha256,
       target_intake.status
from target_user cross join target_intake;
`;

const psql = new Deno.Command("psql", {
  args: [
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-F",
    "\t",
    "-Atc",
    query,
  ],
  stdout: "piped",
  stderr: "piped",
});
const selected = await psql.output();
assert(selected.success, "current_fixture_query_failed");
const fields = new TextDecoder().decode(selected.stdout).trim().split("\t");
assert(fields.length === 6, "current_fixture_not_found");
const [authUserId, email, intakeId, startKey, payloadHash, intakeStatus] =
  fields;
assert(
  ["submitted_for_review", "promoted"].includes(intakeStatus),
  "current_failure_history_unavailable",
);
marker("Q146_CURRENT_ACCOUNT_FIRST_FAILURE_CLASSIFIED");

const service = createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false },
});
const anon = createClient(config.url, config.anonKey, {
  auth: { persistSession: false },
});
const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email,
});
assert(
  !link.error && link.data.user?.id === authUserId &&
    link.data.properties?.hashed_token,
  "current_fixture_auth_link_failed",
);
const verified = await anon.auth.verifyOtp({
  type: "magiclink",
  token_hash: String(link.data.properties.hashed_token),
});
const accessToken = verified.data.session?.access_token || "";
assert(!verified.error && accessToken, "current_fixture_auth_session_failed");

const managementCapability = await deriveCapabilityToken(
  "intake_manage",
  startKey,
  payloadHash,
);
const functionBase = `${config.url}/functions/v1`;
const statusResponse = await fetch(
  `${functionBase}/api-app-signup-signing-finalize`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: config.anonKey,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      operation: "status",
      intake_reference: intakeId,
      management_capability: managementCapability,
    }),
  },
);
const statusBody = await statusResponse.json().catch(() => null);
if (
  !statusResponse.ok || statusBody?.promotion_state !== "promoted" ||
  statusBody?.account_handoff !== "already_authenticated"
) {
  console.log(JSON.stringify({
    http_status: statusResponse.status,
    ok: statusBody?.ok === true,
    code: typeof statusBody?.code === "string" ? statusBody.code : null,
    promotion_state: typeof statusBody?.promotion_state === "string"
      ? statusBody.promotion_state
      : null,
    account_handoff: typeof statusBody?.account_handoff === "string"
      ? statusBody.account_handoff
      : null,
  }));
}
assert(
  statusResponse.ok && statusBody?.promotion_state === "promoted" &&
    statusBody?.account_handoff === "already_authenticated",
  "current_fixture_status_recovery_failed",
);

const bootstrapResponse = await fetch(
  `${functionBase}/api-app-auth-bootstrap`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: config.anonKey,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: "{}",
  },
);
const bootstrapBody = await bootstrapResponse.json().catch(() => null);
assert(
  bootstrapResponse.ok && bootstrapBody?.ok === true &&
    bootstrapBody?.binding_status === "bound" &&
    Array.isArray(bootstrapBody?.dossiers) &&
    bootstrapBody.dossiers.length >= 1,
  "current_fixture_bootstrap_not_visible",
);

const firstDossier = bootstrapBody.dossiers[0];
const dashboardResponse = await fetch(
  `${functionBase}/api-app-dashboard-get`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: config.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dossier_id: firstDossier.dossier_id }),
  },
);
const dashboardBody = await dashboardResponse.json().catch(() => null);
assert(
  dashboardResponse.ok && dashboardBody?.ok === true,
  "current_fixture_dashboard_not_accessible",
);
marker("Q169_CURRENT_FIRST_ATTEMPT_VISIBLE_AFTER_FIX");
marker("Q170_SENSITIVE_OUTPUT_NONE");
