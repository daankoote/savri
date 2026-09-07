import {
  parseArgs,
  READ_ONLY_PROBES,
  resolveSupabaseTarget,
  ROOT,
  runReadOnlyProbe,
} from "../tools/enval-supabase-target.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectFailure(action, expected) {
  try {
    action();
  } catch (error) {
    assert(String(error).includes(expected), `unexpected_failure:${expected}`);
    return;
  }
  throw new Error(`expected_failure_missing:${expected}`);
}

async function expectRejection(action, expected) {
  try {
    await action();
  } catch (error) {
    assert(
      String(error).includes(expected),
      `unexpected_rejection:${expected}`,
    );
    return;
  }
  throw new Error(`expected_rejection_missing:${expected}`);
}

for (
  const argv of [
    ["--target", "TENANT_ENVAL", "--target", "TENANT_ENVAL"],
    [
      "--target",
      "TENANT_ENVAL",
      "--probe",
      "db-identity",
      "--probe",
      "db-baseline",
    ],
  ]
) expectFailure(() => parseArgs(argv), "duplicate_argument");
expectFailure(
  () =>
    parseArgs([
      "--target",
      "TENANT_ENVAL",
      "--probe",
      "db-identity",
      "--execute",
    ]),
  "readonly_probe_mixed_with_operation",
);

const resolved = resolveSupabaseTarget({
  target: "TENANT_ENVAL",
  cwd: ROOT,
  root: ROOT,
  env: {},
});

let sqlInvocation = null;
const sqlResult = await runReadOnlyProbe(resolved, "db-identity", {
  sqlExecutor(options) {
    sqlInvocation = options;
    return {
      stdout:
        '{"probe":"db-identity","database":"postgres","user":"postgres","transaction_read_only":"on","marker":"ENVAL_LOCAL_DB_IDENTITY_OK"}\n',
    };
  },
});
assert(sqlInvocation.cwd === ROOT, "sql_probe_wrong_workdir");
assert(
  sqlInvocation.sql === READ_ONLY_PROBES["db-identity"].sql,
  "sql_probe_not_fixed",
);
assert(sqlResult.database === "postgres", "sql_probe_identity_missing");

let httpInvocation = null;
const httpResult = await runReadOnlyProbe(resolved, "api-health", {
  async fetcher(url, options) {
    httpInvocation = { url: String(url), options };
    return {
      status: 200,
      url: String(url),
      body: { async cancel() {} },
    };
  },
});
assert(
  httpInvocation.url === "http://127.0.0.1:54321/auth/v1/health",
  "http_probe_origin_changed",
);
assert(httpInvocation.options.method === "GET", "http_probe_not_get");
assert(httpInvocation.options.redirect === "manual", "http_redirect_allowed");
assert(!("body" in httpInvocation.options), "http_body_allowed");
const headers = JSON.stringify(httpInvocation.options.headers).toLowerCase();
assert(!headers.includes("authorization"), "http_authorization_allowed");
assert(!headers.includes("cookie"), "http_cookie_allowed");
assert(httpResult.status === 200, "http_probe_status_missing");

await expectRejection(
  () =>
    runReadOnlyProbe(resolved, "api-health", {
      async fetcher(url) {
        return {
          status: 302,
          url: String(url),
          body: { async cancel() {} },
        };
      },
    }),
  "readonly_http_health_failed",
);
await expectRejection(
  () =>
    runReadOnlyProbe(resolved, "api-health", {
      async fetcher() {
        return {
          status: 200,
          url: "http://127.0.0.1:54324/api/v1/info",
          body: { async cancel() {} },
        };
      },
    }),
  "readonly_http_health_failed",
);
await expectRejection(
  () => runReadOnlyProbe(resolved, "unknown"),
  "readonly_probe_unknown",
);
await expectRejection(
  () =>
    runReadOnlyProbe(
      { ...resolved, target: "CONTROL_PLANE" },
      "db-identity",
    ),
  "readonly_probe_target_invalid",
);

for (
  const probe of [
    "db-identity",
    "db-baseline",
    "api-health",
    "mailpit-health",
  ]
) {
  const result = await runReadOnlyProbe(resolved, probe);
  const serialized = JSON.stringify(result).toLowerCase();
  assert(result.probe === probe, `live_probe_mismatch:${probe}`);
  assert(
    !/(email|password|token|secret|cookie|authorization|session)/.test(
      serialized,
    ),
    `live_probe_sensitive_output:${probe}`,
  );
}

console.log("ENVAL_LOCAL_READONLY_INSPECTION_PROOF=PASS");
