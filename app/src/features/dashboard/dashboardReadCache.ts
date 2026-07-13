import { fetchDashboardReadModel, type DashboardReadResult } from "./dashboardReadClient";
import type { DashboardReadModel } from "./dashboardTypes";

type DashboardReadFetcher = (config: {
  accessToken: string;
  dossierId: string;
}) => Promise<DashboardReadResult>;

const inMemoryDashboardCache = new Map<string, DashboardReadModel>();
const pendingDashboardReads = new Map<string, Promise<DashboardReadModel>>();
const scopeGenerations = new Map<string, number>();

function cacheKey(cacheScope: string, dossierId: string): string {
  return `${cacheScope}:${dossierId}`;
}

function scopePrefix(cacheScope: string): string {
  return `${cacheScope}:`;
}

function scopeGeneration(cacheScope: string): number {
  return scopeGenerations.get(cacheScope) ?? 0;
}

export function clearDashboardReadCache(cacheScope?: string): void {
  if (cacheScope) {
    scopeGenerations.set(cacheScope, scopeGeneration(cacheScope) + 1);
    const prefix = scopePrefix(cacheScope);
    for (const key of inMemoryDashboardCache.keys()) {
      if (key.startsWith(prefix)) inMemoryDashboardCache.delete(key);
    }

    for (const key of pendingDashboardReads.keys()) {
      if (key.startsWith(prefix)) pendingDashboardReads.delete(key);
    }

    return;
  }

  inMemoryDashboardCache.clear();
  pendingDashboardReads.clear();
  scopeGenerations.clear();
}

export function getCachedDashboardRead(cacheScope: string, dossierId: string): DashboardReadModel | null {
  return inMemoryDashboardCache.get(cacheKey(cacheScope, dossierId)) ?? null;
}

export function loadDashboardReadOnce({
  accessToken,
  cacheScope,
  dossierId,
  fetcher = fetchDashboardReadModel,
  forceRefresh = false,
}: {
  accessToken: string;
  cacheScope: string;
  dossierId: string;
  fetcher?: DashboardReadFetcher;
  forceRefresh?: boolean;
}): Promise<DashboardReadModel> {
  const key = cacheKey(cacheScope, dossierId);
  const generation = scopeGeneration(cacheScope);
  if (forceRefresh) {
    inMemoryDashboardCache.delete(key);
    pendingDashboardReads.delete(key);
  }

  const cached = inMemoryDashboardCache.get(key);
  if (cached) return Promise.resolve(cached);

  const existingPending = pendingDashboardReads.get(key);
  if (existingPending) return existingPending;

  const pending = fetcher({ accessToken, dossierId }).then((result) => {
    if (!result.ok) throw result.error;
    if (scopeGeneration(cacheScope) === generation) {
      inMemoryDashboardCache.set(key, result.model);
    }
    return result.model;
  }).finally(() => {
    pendingDashboardReads.delete(key);
  });

  pendingDashboardReads.set(key, pending);
  return pending;
}
