import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CustomerCorrectionHandoffErrorCode,
  type CustomerCorrectionHandoffModel,
  type CustomerCorrectionHandoffResult,
  type CustomerCorrectionHandoffSafeError,
  customerCorrectionHandoffSafeError,
  fetchCustomerCorrectionHandoff,
} from "./customerCorrectionHandoffClient.ts";

type HandoffFetcher = (config: {
  accessToken: string;
  caseRef: string;
}) => Promise<CustomerCorrectionHandoffResult>;

export type CustomerCorrectionHandoffState =
  | { status: "idle" | "loading"; model: null; error: null; retry: () => void }
  | {
    status: "ready";
    model: CustomerCorrectionHandoffModel;
    error: null;
    retry: () => void;
  }
  | {
    status: "error";
    model: null;
    error: CustomerCorrectionHandoffSafeError;
    retry: () => void;
  };

const cachedHandoffs = new Map<string, CustomerCorrectionHandoffModel>();
const pendingHandoffs = new Map<
  string,
  Promise<CustomerCorrectionHandoffModel>
>();
const SAFE_ERROR_CODES = new Set<CustomerCorrectionHandoffErrorCode>([
  "not_configured",
  "inaccessible",
  "invalid_response",
  "service_unavailable",
]);

function cacheKey(cacheScope: string, caseRef: string): string {
  return `${cacheScope}:${caseRef}`;
}

function scopePrefix(cacheScope: string): string {
  return `${cacheScope}:`;
}

export function clearCustomerCorrectionHandoffCache(
  cacheScope?: string,
  caseRef?: string,
): void {
  if (!cacheScope) {
    cachedHandoffs.clear();
    pendingHandoffs.clear();
    return;
  }

  if (caseRef) {
    const key = cacheKey(cacheScope, caseRef);
    cachedHandoffs.delete(key);
    pendingHandoffs.delete(key);
    return;
  }

  const prefix = scopePrefix(cacheScope);
  for (const key of cachedHandoffs.keys()) {
    if (key.startsWith(prefix)) cachedHandoffs.delete(key);
  }
  for (const key of pendingHandoffs.keys()) {
    if (key.startsWith(prefix)) pendingHandoffs.delete(key);
  }
}

export function loadCustomerCorrectionHandoffOnce({
  accessToken,
  cacheScope,
  caseRef,
  fetcher = fetchCustomerCorrectionHandoff,
}: {
  accessToken: string;
  cacheScope: string;
  caseRef: string;
  fetcher?: HandoffFetcher;
}): Promise<CustomerCorrectionHandoffModel> {
  const key = cacheKey(cacheScope, caseRef);
  const cached = cachedHandoffs.get(key);
  if (cached) return Promise.resolve(cached);

  const existingPending = pendingHandoffs.get(key);
  if (existingPending) return existingPending;

  const pending = fetcher({ accessToken, caseRef }).then((result) => {
    if (!result.ok) throw result.error;
    cachedHandoffs.set(key, result.model);
    return result.model;
  }).finally(() => {
    pendingHandoffs.delete(key);
  });
  pendingHandoffs.set(key, pending);
  return pending;
}

export function useCustomerCorrectionHandoff(
  accessToken: string | null,
  cacheScope: string | null,
  caseRef: string | null,
): CustomerCorrectionHandoffState {
  const [retryNonce, setRetryNonce] = useState(0);
  const requestKeyRef = useRef("");
  const previousCacheScopeRef = useRef<string | null>(null);
  const retry = useCallback(() => {
    if (cacheScope && caseRef) {
      clearCustomerCorrectionHandoffCache(cacheScope, caseRef);
    }
    setRetryNonce((current) => current + 1);
  }, [cacheScope, caseRef]);
  const [state, setState] = useState<CustomerCorrectionHandoffState>({
    status: "idle",
    model: null,
    error: null,
    retry,
  });

  useEffect(() => {
    const previousCacheScope = previousCacheScopeRef.current;
    if (previousCacheScope && previousCacheScope !== cacheScope) {
      clearCustomerCorrectionHandoffCache(previousCacheScope);
    }
    previousCacheScopeRef.current = cacheScope;

    if (!accessToken || !cacheScope || !caseRef) {
      requestKeyRef.current = "";
      setState({ status: "idle", model: null, error: null, retry });
      return undefined;
    }

    const requestKey = cacheKey(cacheScope, caseRef);
    requestKeyRef.current = requestKey;
    let isActive = true;
    setState({ status: "loading", model: null, error: null, retry });

    loadCustomerCorrectionHandoffOnce({ accessToken, cacheScope, caseRef })
      .then((model) => {
        if (!isActive || requestKeyRef.current !== requestKey) return;
        setState({ status: "ready", model, error: null, retry });
      })
      .catch((error) => {
        if (!isActive || requestKeyRef.current !== requestKey) return;
        const candidateCode = error && typeof error === "object" &&
            "code" in error
          ? String(error.code)
          : "";
        const code = SAFE_ERROR_CODES.has(
            candidateCode as CustomerCorrectionHandoffErrorCode,
          )
          ? candidateCode as CustomerCorrectionHandoffErrorCode
          : "service_unavailable";
        const safeError = customerCorrectionHandoffSafeError(code);
        setState({ status: "error", model: null, error: safeError, retry });
      });

    return () => {
      isActive = false;
    };
  }, [accessToken, cacheScope, caseRef, retry, retryNonce]);

  return state;
}
