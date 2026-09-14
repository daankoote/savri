import {
  resolveWorkflowEmailServerContext,
} from "../../supabase/functions/_shared/app_workflow_email_context.ts";
import {
  createHandler,
} from "../../supabase/functions/api-app-customer-information-request/index.ts";
import type {
  PlatformControlPlaneRuntimeReader,
} from "../../supabase/functions/_shared/app_control_plane_runtime_reader.ts";

const dashboardDetailSource = await Deno.readTextFile(
  "app/src/features/dashboard/ActivePrivateDashboard.tsx",
);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const values: Record<string, string> = {
  ALLOWED_ORIGINS: "http://127.0.0.1:5174,http://127.0.0.1:5175",
  ENVAL_PRESENTATION_SOURCE_MODE: "platform_control_plane_presentation_v1",
  ENVAL_WORKFLOW_EMAIL_PORTAL_ORIGIN: "http://127.0.0.1:5175",
};
const environment = {
  get(name: string) {
    return values[name];
  },
};
const tenantExecution = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  environment: "local",
  trustedRoutingKey: "enval.localhost",
  routingProvenance: "DEPLOYMENT_FIXED",
  resolutionMode: "static_single_tenant_v1",
  dataPlaneLocatorId: "20000000-0000-4000-8000-000000000001",
  resolvedDataPlaneReference: "enval",
  fixedDataPlaneReference: "enval",
  providerType: "supabase",
  deploymentOwnership: "ENVAL_MANAGED_DEDICATED",
} as const;
const reader = {
  findRoutingIdentities() {
    return Promise.resolve([]);
  },
  findDataPlaneLocators() {
    return Promise.resolve([]);
  },
  findCurrentPresentationConfigs(tenantId: string, environmentName: string) {
    return Promise.resolve([{
      tenantId,
      environment: environmentName,
      versionSequence: 1,
      schemaVersion: "presentation-brand-config-v1",
      configVersion: "proof-presentation-v1",
      displayName: "Voorbeeldorganisatie",
      shortMark: "V",
      productLabel: "Klantportaal",
      tagline: null,
      logoReference: "/assets/img/logo.svg",
      logoInverseReference: null,
      faviconReference: null,
      socialImageReference: null,
      assetAltText: "Voorbeeldorganisatie",
      exportBasename: null,
    }]);
  },
} satisfies PlatformControlPlaneRuntimeReader;

const resolved = await resolveWorkflowEmailServerContext(
  environment,
  tenantExecution,
  reader,
);
assert(
  resolved?.organization_name === "Voorbeeldorganisatie" &&
    resolved.portal_origin === "http://127.0.0.1:5175",
  "server_owned_email_context_not_resolved",
);

values.ENVAL_WORKFLOW_EMAIL_PORTAL_ORIGIN = "https://evil.example";
assert(
  await resolveWorkflowEmailServerContext(
    environment,
    tenantExecution,
    reader,
  ) ===
    null,
  "origin_outside_server_allowlist_accepted",
);
values.ENVAL_WORKFLOW_EMAIL_PORTAL_ORIGIN =
  "http://127.0.0.1:5175/dashboard/aanvragen/CASE-ATTACK";
assert(
  await resolveWorkflowEmailServerContext(
    environment,
    tenantExecution,
    reader,
  ) ===
    null,
  "origin_with_browser_path_accepted",
);
values.ENVAL_WORKFLOW_EMAIL_PORTAL_ORIGIN = "http://127.0.0.1:5175";
assert(
  await resolveWorkflowEmailServerContext(environment, undefined, reader) ===
    null,
  "missing_tenant_execution_not_fail_closed",
);

const rpcCalls: Array<Record<string, unknown>> = [];
const handler = createHandler({
  createServiceClient: () =>
    ({
      rpc(name: string, args: Record<string, unknown>) {
        rpcCalls.push({ name, ...args });
        return Promise.resolve({
          data: {
            ok: true,
            code: "created",
            request: {
              request_ref: "IRQ-0123456789ABCDEF",
              state: "OPEN",
              question: "Kunt u dit toelichten?",
              answer: null,
              asked_at: "2026-09-13T12:00:00.000Z",
              answered_at: null,
            },
          },
          error: null,
        });
      },
    }) as never,
  idempotencyExpiresAt: () => "2030-01-01T00:00:00.000Z",
  requestMeta: (() =>
    Promise.resolve({
      request_id: "email-context-proof",
      idempotency_key: "email-context-proof",
      ip_hash: null,
      user_agent_hash: null,
      method: "POST",
      path: "/api-app-customer-information-request",
      url: "http://127.0.0.1:54321/api-app-customer-information-request",
      origin: "http://127.0.0.1:5175",
      timestamp: "2026-09-13T12:00:00.000Z",
      environment: "local",
      tenant_execution: tenantExecution,
    })) as never,
  hashPayload: (() => Promise.resolve("a".repeat(64))) as never,
  verifyBearer: (() =>
    Promise.resolve({
      ok: true,
      context: { authUserId: "30000000-0000-4000-8000-000000000001" },
    })) as never,
  resolveEmailContext: () =>
    Promise.resolve({
      organization_name: "Voorbeeldorganisatie",
      portal_origin: "http://127.0.0.1:5175",
    }),
});
const edgeResponse = await handler(
  new Request(
    "http://127.0.0.1:54321/functions/v1/api-app-customer-information-request",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        caseRef: "CASE-ABCDEF123456",
        question: "Kunt u dit toelichten?",
      }),
    },
  ),
);
assert(
  edgeResponse.status === 201 && rpcCalls.length === 1,
  "edge_call_failed",
);
assert(
  JSON.stringify(rpcCalls[0].p_email_context) === JSON.stringify({
        organization_name: "Voorbeeldorganisatie",
        portal_origin: "http://127.0.0.1:5175",
      }) && !("recipient" in rpcCalls[0]) && !("template_key" in rpcCalls[0]),
  "edge_did_not_use_server_owned_email_context",
);
const injected = await handler(
  new Request(
    "http://127.0.0.1:54321/functions/v1/api-app-customer-information-request",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        caseRef: "CASE-ABCDEF123456",
        question: "Kunt u dit toelichten?",
        organization_name: "Aanvaller",
      }),
    },
  ),
);
assert(
  injected.status === 400 && rpcCalls.length === 1,
  "browser_email_context_injection_accepted",
);
assert(
  dashboardDetailSource.includes(
    "Dossiernummer: {application.case_reference}",
  ) && !dashboardDetailSource.includes("Dossiernummer: {caseRef}"),
  "customer_detail_case_reference_not_server_projected",
);

console.log("INFORMATION_REQUEST_EMAIL_CONTEXT_Q01_Q07=PASS");
