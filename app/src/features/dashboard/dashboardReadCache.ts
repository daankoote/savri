import {
  type DashboardApplicationsResult,
  type DashboardReadResult,
  fetchDashboardApplications,
  fetchDashboardReadModel,
} from "./dashboardReadClient.ts";
import type {
  DashboardApplicationIndex,
  DashboardReadModel,
} from "./dashboardTypes.ts";

type DashboardReadFetcher = (config: {
  accessToken: string;
  dossierId: string;
}) => Promise<DashboardReadResult>;

type DashboardApplicationsFetcher = (config: {
  accessToken: string;
}) => Promise<DashboardApplicationsResult>;

const inMemoryDashboardCache = new Map<string, DashboardReadModel>();
const pendingDashboardReads = new Map<string, Promise<DashboardReadModel>>();
const inMemoryApplicationIndexes = new Map<string, DashboardApplicationIndex>();
const pendingApplicationIndexes = new Map<
  string,
  Promise<DashboardApplicationIndex>
>();
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

function advanceScopeGeneration(cacheScope: string): number {
  const generation = scopeGeneration(cacheScope) + 1;
  scopeGenerations.set(cacheScope, generation);
  return generation;
}

export function clearDashboardReadCache(cacheScope?: string): void {
  if (cacheScope) {
    advanceScopeGeneration(cacheScope);
    const prefix = scopePrefix(cacheScope);
    for (const key of inMemoryDashboardCache.keys()) {
      if (key.startsWith(prefix)) inMemoryDashboardCache.delete(key);
    }

    for (const key of pendingDashboardReads.keys()) {
      if (key.startsWith(prefix)) pendingDashboardReads.delete(key);
    }
    inMemoryApplicationIndexes.delete(cacheScope);
    pendingApplicationIndexes.delete(cacheScope);

    return;
  }

  inMemoryDashboardCache.clear();
  pendingDashboardReads.clear();
  inMemoryApplicationIndexes.clear();
  pendingApplicationIndexes.clear();
  scopeGenerations.clear();
}

export function getCachedDashboardApplications(
  cacheScope: string,
): DashboardApplicationIndex | null {
  return inMemoryApplicationIndexes.get(cacheScope) ?? null;
}

export function loadDashboardApplicationsOnce({
  accessToken,
  cacheScope,
  fetcher = fetchDashboardApplications,
  forceRefresh = false,
}: {
  accessToken: string;
  cacheScope: string;
  fetcher?: DashboardApplicationsFetcher;
  forceRefresh?: boolean;
}): Promise<DashboardApplicationIndex> {
  if (forceRefresh) {
    advanceScopeGeneration(cacheScope);
    inMemoryApplicationIndexes.delete(cacheScope);
    pendingApplicationIndexes.delete(cacheScope);
  }
  const generation = scopeGeneration(cacheScope);

  const cached = inMemoryApplicationIndexes.get(cacheScope);
  if (cached) return Promise.resolve(cached);
  const existingPending = pendingApplicationIndexes.get(cacheScope);
  if (existingPending) return existingPending;

  let pending: Promise<DashboardApplicationIndex>;
  pending = fetcher({ accessToken }).then((result) => {
    if (!result.ok) throw result.error;
    if (scopeGeneration(cacheScope) === generation) {
      inMemoryApplicationIndexes.set(cacheScope, result.model);
    }
    return result.model;
  }).finally(() => {
    if (pendingApplicationIndexes.get(cacheScope) === pending) {
      pendingApplicationIndexes.delete(cacheScope);
    }
  });
  pendingApplicationIndexes.set(cacheScope, pending);
  return pending;
}

export function getCachedDashboardRead(
  cacheScope: string,
  dossierId: string,
): DashboardReadModel | null {
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
  if (forceRefresh) {
    advanceScopeGeneration(cacheScope);
    inMemoryDashboardCache.delete(key);
    pendingDashboardReads.delete(key);
  }
  const generation = scopeGeneration(cacheScope);

  const cached = inMemoryDashboardCache.get(key);
  if (cached) return Promise.resolve(cached);

  const existingPending = pendingDashboardReads.get(key);
  if (existingPending) return existingPending;

  let pending: Promise<DashboardReadModel>;
  pending = fetcher({ accessToken, dossierId }).then((result) => {
    if (!result.ok) throw result.error;
    if (scopeGeneration(cacheScope) === generation) {
      inMemoryDashboardCache.set(key, result.model);
    }
    return result.model;
  }).finally(() => {
    if (pendingDashboardReads.get(key) === pending) {
      pendingDashboardReads.delete(key);
    }
  });

  pendingDashboardReads.set(key, pending);
  return pending;
}
