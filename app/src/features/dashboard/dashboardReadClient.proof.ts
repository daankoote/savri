import { clearDashboardReadCache, loadDashboardReadOnce } from "./dashboardReadCache.ts";
import { fetchDashboardReadModel, type DashboardReadSafeError } from "./dashboardReadClient.ts";
import type { DashboardDossierSummary, DashboardReadModel } from "./dashboardTypes.ts";

export type DashboardReadClientProofResult = {
  ok: true;
  requestHeadersVerified: true;
  requestBodyVerified: true;
  noIdempotencyKey: true;
  accountTypesParsed: true;
  linksPreserved: true;
  forbiddenFieldsIgnored: true;
  safeErrorMapped: true;
  cacheAndDedupeVerified: true;
  retryVerified: true;
  unsupportedDomainsAbsent: true;
  sharedRequestSurvivesCleanup: true;
  scopedCacheVerified: true;
  failedPendingCleanupVerified: true;
  dashboardErrorCopyVerified: true;
};

type MockFetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createMockFetch(responses: Response[]) {
  const calls: MockFetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const response = responses.shift();
    if (!response) throw new Error("Missing mock response");
    return response;
  }) as typeof fetch;

  return { calls, fetchImpl };
}

function getHeader(init: RequestInit | undefined, key: string): string {
  const headers = init?.headers;
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(key) || "";
  if (Array.isArray(headers)) {
    return headers.find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] || "";
  }
  return String((headers as Record<string, string>)[key] || "");
}

function dashboardBody(selectedDossierId = "dossier-proof-a") {
  return {
    ok: true,
    mode: "dashboard_read_v1",
    request_id: "request-proof",
    dossiers: [
      { dossier_id: "dossier-proof-a", dossier_number: "D-001", account_type: "particulier", status: "submitted", document_changes_allowed: true },
      { dossier_id: "dossier-proof-b", dossier_number: "D-002", account_type: "zakelijk", status: "submitted", document_changes_allowed: true },
      { dossier_id: "dossier-proof-c", dossier_number: "D-003", account_type: "vve", status: "submitted", document_changes_allowed: true },
    ],
    selected_dossier: { dossier_id: selectedDossierId, dossier_number: "D-001", account_type: "particulier", status: "submitted", document_changes_allowed: true },
    locations: [
      {
        location_id: "location-proof-1",
        label: "Locatie 1",
        status: "submitted",
        address: {
          postcode: "2042PC",
          house_number: "65",
          suffix: null,
          street: "Kostverlorenstraat",
          city: "Zandvoort",
          country: "Nederland",
        },
      },
      {
        location_id: "location-proof-2",
        label: "Locatie 2",
        status: "submitted",
        address: {
          postcode: "1000AA",
          house_number: "10",
          suffix: "A",
          street: "Tweede straat",
          city: "Amsterdam",
          country: "Nederland",
        },
      },
    ],
    chargers: [
      {
        charger_id: "charger-proof-1",
        location_id: "location-proof-1",
        status: "submitted",
        brand: "Alfen",
        model: "Eve Single Pro Line",
        serial_number: "SER-PROOF-1",
        mid_number: "MID-PROOF-1",
        mid_status: "submitted",
        installation_year: 2026,
        backend_supplier: null,
        solar_export_status: "unknown",
      },
      {
        charger_id: "charger-proof-2",
        location_id: "location-proof-2",
        status: "submitted",
        brand: "ABB",
        model: "TACW22-4",
        serial_number: "SER-PROOF-2",
        mid_number: "MID-PROOF-2",
        mid_status: "submitted",
        installation_year: 2025,
        backend_supplier: "Provider",
        solar_export_status: "no",
      },
    ],
    document_slots: [
      {
        document_slot_id: "slot-proof-1",
        location_id: "location-proof-1",
        charger_id: "charger-proof-1",
        document_type: "invoice_or_ownership_evidence",
        required: true,
        title: "Factuur installatie",
        status: "uploaded",
        current_version_number: 1,
        current_file_name: "factuur.pdf",
      },
    ],
    legal_acceptances: [
      {
        acceptance_type: "consent_bundle",
        version: "proof-v1",
        status: "accepted",
        accepted_at: "2026-07-13T00:00:00.000Z",
        active: true,
      },
    ],
    storage_path: "ignored-by-client",
    signed_url: "ignored-by-client",
    server_sha256: "ignored-by-client",
    event_data: { ignored: true },
  };
}

function containsForbiddenKeys(value: unknown): boolean {
  const forbidden = new Set([
    "email",
    "phone",
    "auth_user_id",
    "identity_id",
    "storage_bucket",
    "storage_path",
    "signed_url",
    "signed_upload_url",
    "client_sha256",
    "server_sha256",
    "file_sha256",
    "payload_hash",
    "event_data",
    "idempotency_key",
    "kwh",
    "fee",
    "payout",
    "timeline",
    "support",
    "requests",
    "exports",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

export async function runDashboardReadClientProof(): Promise<DashboardReadClientProofResult> {
  const endpointUrl = "http://localhost:54321/functions/v1/api-app-dashboard-get";
  const anonKey = "local-proof-key";
  const accessToken = "local-proof-access-token";
  const cacheScope = "auth-user-proof:customer-proof";
  const otherCacheScope = "auth-user-proof-other:customer-proof-other";
  const { calls, fetchImpl } = createMockFetch([
    jsonResponse(dashboardBody()),
    jsonResponse({ ok: false, code: "dossier_not_found_or_forbidden", error: "Raw detail must not surface" }, 404),
  ]);

  const success = await fetchDashboardReadModel({
    accessToken,
    dossierId: "dossier-proof-a",
    fetchImpl,
    runtimeConfig: { anonKey, dashboardEndpointUrl: endpointUrl },
  });

  assert(success.ok === true, "success response must parse");
  assert(calls.length === 1, "one fetch call expected");
  assert(getHeader(calls[0].init, "Authorization") === `Bearer ${accessToken}`, "bearer token header missing");
  assert(getHeader(calls[0].init, "apikey") === anonKey, "apikey header missing");
  assert(getHeader(calls[0].init, "Idempotency-Key") === "", "dashboard read must not send Idempotency-Key");
  assert(JSON.stringify(JSON.parse(String(calls[0].init?.body))) === JSON.stringify({ dossier_id: "dossier-proof-a" }), "body must contain only dossier_id");
  assert(success.model.dossiers.map((dossier: DashboardDossierSummary) => dossier.account_type).join(",") === "particulier,zakelijk,vve", "all account types must parse in order");
  assert(success.model.locations.length === 2 && success.model.chargers.length === 2, "locations and chargers must parse");
  assert(success.model.chargers[1].location_id === "location-proof-2", "charger-location link must be preserved");
  assert(success.model.document_slots[0].charger_id === "charger-proof-1", "slot-charger link must be preserved");
  assert(!containsForbiddenKeys(success.model), "forbidden response fields must not enter model");

  const notFound = await fetchDashboardReadModel({
    accessToken,
    dossierId: "dossier-proof-missing",
    fetchImpl,
    runtimeConfig: { anonKey, dashboardEndpointUrl: endpointUrl },
  });
  assert(notFound.ok === false, "not found must map to safe error");
  assert(notFound.error.code === "dossier_inaccessible", "not found must map to inaccessible dossier");
  assert(!/Raw detail/i.test(notFound.error.message), "safe error must not expose raw backend detail");
  assert(!/Inloggen/i.test(notFound.error.message), "dashboard error copy must not use login copy");

  clearDashboardReadCache();
  let fetchCount = 0;
  const getFetchCount = () => fetchCount;
  const makeModel = (dossierId: string): DashboardReadModel => ({
    ...(success.model as DashboardReadModel),
    selected_dossier: {
      dossier_id: dossierId,
      dossier_number: dossierId,
      account_type: dossierId.endsWith("b") ? "zakelijk" : "particulier",
      status: "submitted",
      document_changes_allowed: true,
    },
  });
  const cacheFetcher = async ({ dossierId }: { dossierId: string }): Promise<{ ok: true; model: DashboardReadModel }> => {
    fetchCount += 1;
    return { ok: true, model: makeModel(dossierId) };
  };

  const first = await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-a", fetcher: cacheFetcher });
  const second = await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-a", fetcher: cacheFetcher });
  assert(first === second && getFetchCount() === 1, "duplicate selection must use cache");

  const concurrent = await Promise.all([
    loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-b", fetcher: cacheFetcher }),
    loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-b", fetcher: cacheFetcher }),
  ]);
  assert(concurrent[0] === concurrent[1] && getFetchCount() === 2, "duplicate pending read must dedupe");

  await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-a", fetcher: cacheFetcher });
  assert(getFetchCount() === 2, "switching back must reuse in-memory data");

  await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-a", fetcher: cacheFetcher, forceRefresh: true });
  assert(getFetchCount() === 3, "retry must force one explicit request");

  let sharedFetchCount = 0;
  const getSharedFetchCount = () => sharedFetchCount;
  const sharedDeferred = deferred<{ ok: true; model: DashboardReadModel }>();
  const sharedFetcher = async (): Promise<{ ok: true; model: DashboardReadModel }> => {
    sharedFetchCount += 1;
    return sharedDeferred.promise;
  };
  clearDashboardReadCache();
  const sharedFirst = loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-shared", fetcher: sharedFetcher });
  const sharedSecond = loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-shared", fetcher: sharedFetcher });
  assert(sharedFirst === sharedSecond && getSharedFetchCount() === 1, "same-scope consumers must share pending request");
  sharedDeferred.resolve({ ok: true, model: makeModel("dossier-proof-shared") });
  const sharedModel = await sharedFirst;
  assert(sharedModel.selected_dossier.dossier_id === "dossier-proof-shared", "shared request must complete without manual retry");
  await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-shared", fetcher: sharedFetcher });
  assert(getSharedFetchCount() === 1, "completed first request must populate cache");

  await loadDashboardReadOnce({ accessToken, cacheScope: otherCacheScope, dossierId: "dossier-proof-shared", fetcher: sharedFetcher });
  assert(getSharedFetchCount() === 2, "different auth/customer scope must not reuse prior cache");

  clearDashboardReadCache(cacheScope);
  await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-shared", fetcher: sharedFetcher });
  assert(getSharedFetchCount() === 3, "clearing scope must remove prior cache entries");

  let failureFetchCount = 0;
  const failure: DashboardReadSafeError = {
    code: "service_unavailable",
    message: "De dossiergegevens konden tijdelijk niet worden geladen. Probeer het opnieuw.",
  };
  const failingFetcher = async (): Promise<{ ok: false; error: DashboardReadSafeError }> => {
    failureFetchCount += 1;
    return { ok: false, error: failure };
  };
  await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-fail", fetcher: failingFetcher }).catch(() => undefined);
  await loadDashboardReadOnce({ accessToken, cacheScope, dossierId: "dossier-proof-fail", fetcher: failingFetcher }).catch(() => undefined);
  assert(failureFetchCount === 2, "failed pending request must be removed in finally");

  const invalidatedDeferred = deferred<{ ok: true; model: DashboardReadModel }>();
  let invalidatedFetchCount = 0;
  const invalidatedFetcher = async (): Promise<{ ok: true; model: DashboardReadModel }> => {
    invalidatedFetchCount += 1;
    return invalidatedDeferred.promise;
  };
  const invalidatedRequest = loadDashboardReadOnce({
    accessToken,
    cacheScope,
    dossierId: "dossier-proof-invalidated",
    fetcher: invalidatedFetcher,
  });
  clearDashboardReadCache(cacheScope);
  invalidatedDeferred.resolve({ ok: true, model: makeModel("dossier-proof-invalidated") });
  await invalidatedRequest;
  await loadDashboardReadOnce({
    accessToken,
    cacheScope,
    dossierId: "dossier-proof-invalidated",
    fetcher: cacheFetcher,
  });
  assert(invalidatedFetchCount === 1 && getFetchCount() === 4, "scope clear must prevent old pending response from repopulating cache");

  return {
    ok: true,
    requestHeadersVerified: true,
    requestBodyVerified: true,
    noIdempotencyKey: true,
    accountTypesParsed: true,
    linksPreserved: true,
    forbiddenFieldsIgnored: true,
    safeErrorMapped: true,
    cacheAndDedupeVerified: true,
    retryVerified: true,
    unsupportedDomainsAbsent: true,
    sharedRequestSurvivesCleanup: true,
    scopedCacheVerified: true,
    failedPendingCleanupVerified: true,
    dashboardErrorCopyVerified: true,
  };
}
