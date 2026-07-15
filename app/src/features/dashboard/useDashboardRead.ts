import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardReadSafeError } from "./dashboardReadClient";
import { clearDashboardReadCache, getCachedDashboardRead, loadDashboardReadOnce } from "./dashboardReadCache";
import type { DashboardReadModel } from "./dashboardTypes";

export type DashboardReadState =
  | { status: "idle"; model: null; error: null; retry: () => void; refreshSelectedDossier: () => Promise<boolean> }
  | { status: "loading"; model: DashboardReadModel | null; error: null; retry: () => void; refreshSelectedDossier: () => Promise<boolean> }
  | { status: "retrying"; model: DashboardReadModel | null; error: null; retry: () => void; refreshSelectedDossier: () => Promise<boolean> }
  | { status: "ready"; model: DashboardReadModel; error: null; retry: () => void; refreshSelectedDossier: () => Promise<boolean> }
  | { status: "empty"; model: DashboardReadModel | null; error: null; retry: () => void; refreshSelectedDossier: () => Promise<boolean> }
  | { status: "error"; model: DashboardReadModel | null; error: DashboardReadSafeError; retry: () => void; refreshSelectedDossier: () => Promise<boolean> };

export function useDashboardRead(accessToken: string | null, cacheScope: string | null, dossierId: string | null): DashboardReadState {
  const [retryNonce, setRetryNonce] = useState(0);
  const retry = useCallback(() => setRetryNonce((current) => current + 1), []);
  const requestKeyRef = useRef<string>("");
  const previousCacheScopeRef = useRef<string | null>(null);
  const refreshSelectedDossier = useCallback(async () => {
    if (!accessToken || !cacheScope || !dossierId) return false;

    const requestKey = `${cacheScope}:${dossierId}`;
    requestKeyRef.current = requestKey;
    setState((current) => ({
      status: "retrying",
      model: current.model,
      error: null,
      retry,
      refreshSelectedDossier,
    }));

    try {
      const model = await loadDashboardReadOnce({
        accessToken,
        cacheScope,
        dossierId,
        forceRefresh: true,
      });
      if (requestKeyRef.current !== requestKey) return false;

      setState({
        status: hasDashboardContent(model) ? "ready" : "empty",
        model,
        error: null,
        retry,
        refreshSelectedDossier,
      });
      return true;
    } catch (error) {
      if (requestKeyRef.current !== requestKey) return false;

      setState({
        status: "error",
        model: null,
        error: isSafeError(error) ? error : {
          code: "service_unavailable",
          message: "De dossiergegevens konden tijdelijk niet worden geladen. Probeer het opnieuw.",
        },
        retry,
        refreshSelectedDossier,
      });
      return false;
    }
  }, [accessToken, cacheScope, dossierId, retry]);
  const [state, setState] = useState<DashboardReadState>({ status: "idle", model: null, error: null, retry, refreshSelectedDossier });

  useEffect(() => {
    const previousCacheScope = previousCacheScopeRef.current;
    if (previousCacheScope && previousCacheScope !== cacheScope) {
      clearDashboardReadCache(previousCacheScope);
    }

    previousCacheScopeRef.current = cacheScope;

    if (!accessToken || !cacheScope || !dossierId) {
      requestKeyRef.current = "";
      setState({ status: "idle", model: null, error: null, retry, refreshSelectedDossier });
      return undefined;
    }

    const requestKey = `${cacheScope}:${dossierId}`;
    requestKeyRef.current = requestKey;
    let isActive = true;
    const isRetry = retryNonce > 0;

    const cached = isRetry ? null : getCachedDashboardRead(cacheScope, dossierId);
    if (cached && hasDashboardContent(cached)) {
      setState({ status: "ready", model: cached, error: null, retry, refreshSelectedDossier });
      return undefined;
    }

    if (cached) {
      setState({ status: "empty", model: cached, error: null, retry, refreshSelectedDossier });
      return undefined;
    }

    setState((current) => ({
      status: isRetry ? "retrying" : "loading",
      model: current.model,
      error: null,
      retry,
      refreshSelectedDossier,
    }));

    loadDashboardReadOnce({
      accessToken,
      cacheScope,
      dossierId,
      forceRefresh: isRetry,
    })
      .then((model) => {
        if (!isActive || requestKeyRef.current !== requestKey) return;
        setState({ status: hasDashboardContent(model) ? "ready" : "empty", model, error: null, retry, refreshSelectedDossier });
      })
      .catch((error) => {
        if (!isActive || requestKeyRef.current !== requestKey) return;
        setState({
          status: "error",
          model: null,
          error: isSafeError(error) ? error : {
            code: "service_unavailable",
            message: "De dossiergegevens konden tijdelijk niet worden geladen. Probeer het opnieuw.",
          },
          retry,
          refreshSelectedDossier,
        });
      });

    return () => {
      isActive = false;
    };
  }, [accessToken, cacheScope, dossierId, retry, retryNonce, refreshSelectedDossier]);

  return state;
}

function isSafeError(value: unknown): value is DashboardReadSafeError {
  return !!value && typeof value === "object" && "code" in value && "message" in value;
}

function hasDashboardContent(model: DashboardReadModel): boolean {
  return model.dossiers.length > 0 || model.locations.length > 0 || model.chargers.length > 0 || model.document_slots.length > 0 || model.legal_acceptances.length > 0;
}
