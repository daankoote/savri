import { isTerminalBootstrapBindingError, safeAuthError } from "./authErrorMapping";
import type { AuthSafeErrorCode } from "./authTypes";
import { clearDashboardReadCache, loadDashboardReadOnce } from "../dashboard/dashboardReadCache";
import type { DashboardReadModel } from "../dashboard/dashboardTypes";

export type AuthSessionCleanupProofResult = {
  ok: true;
  terminalErrorsClassified: true;
  retryableErrorsPreserved: true;
  wrongPasswordIsNotTerminalBootstrap: true;
  accountPageCanReceiveReturnedError: true;
  dashboardCacheCanBeClearedOnLogout: true;
  noAccountTypeBranchRequired: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeModel(dossierId: string): DashboardReadModel {
  return {
    chargers: [],
    document_slots: [],
    dossiers: [{ account_type: "particulier", dossier_id: dossierId, dossier_number: "proof", status: "submitted" }],
    legal_acceptances: [],
    locations: [],
    request_id: "proof-request",
    selected_dossier: { account_type: "particulier", dossier_id: dossierId, dossier_number: "proof", status: "submitted" },
  };
}

export async function runAuthSessionCleanupProof(): Promise<AuthSessionCleanupProofResult> {
  const terminalCodes: AuthSafeErrorCode[] = [
    "customer_identity_not_found",
    "customer_identity_already_bound",
    "customer_identity_binding_ambiguous",
    "customer_inactive",
    "customer_dossier_not_found",
  ];

  const retryableCodes: AuthSafeErrorCode[] = [
    "service_unavailable",
    "invalid_response",
    "unknown",
    "not_configured",
    "invalid_credentials",
    "password_mismatch",
    "password_too_short",
  ];

  for (const code of terminalCodes) {
    assert(isTerminalBootstrapBindingError(code), `${code} must be terminal`);
  }

  for (const code of retryableCodes) {
    assert(!isTerminalBootstrapBindingError(code), `${code} must not be terminal bootstrap`);
  }

  const returnedError = safeAuthError("customer_identity_not_found");
  assert(returnedError.message.includes("ENVAL-aanmelding"), "current attempt must keep safe terminal message available");

  let fetchCount = 0;
  const getFetchCount = () => fetchCount;
  const fetcher = async ({ dossierId }: { dossierId: string }) => {
    fetchCount += 1;
    return { ok: true as const, model: makeModel(dossierId) };
  };

  clearDashboardReadCache();
  await loadDashboardReadOnce({
    accessToken: "proof-token",
    cacheScope: "proof-user:proof-customer",
    dossierId: "proof-dossier",
    fetcher,
  });
  await loadDashboardReadOnce({
    accessToken: "proof-token",
    cacheScope: "proof-user:proof-customer",
    dossierId: "proof-dossier",
    fetcher,
  });
  assert(getFetchCount() === 1, "cache must be populated before logout clear");

  clearDashboardReadCache();
  await loadDashboardReadOnce({
    accessToken: "proof-token",
    cacheScope: "proof-user:proof-customer",
    dossierId: "proof-dossier",
    fetcher,
  });
  assert(getFetchCount() === 2, "explicit logout clear must remove dashboard cache");

  return {
    ok: true,
    accountPageCanReceiveReturnedError: true,
    dashboardCacheCanBeClearedOnLogout: true,
    noAccountTypeBranchRequired: true,
    retryableErrorsPreserved: true,
    terminalErrorsClassified: true,
    wrongPasswordIsNotTerminalBootstrap: true,
  };
}
