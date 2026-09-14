import type { AppTenantExecutionContext } from "./app_tenant_resolution_shadow.ts";
import {
  buildServerOwnedPresentationSourceComposition,
  resolveAppPresentationBootstrap,
  type ServerPresentationEnvironmentReader,
} from "./app_presentation_bootstrap.ts";
import {
  createPlatformControlPlaneRuntimeReaderFromEnvironment,
  type PlatformControlPlaneEnvironmentReader,
  type PlatformControlPlaneRuntimeReader,
} from "./app_control_plane_runtime_reader.ts";

export type WorkflowEmailServerContext = Readonly<{
  organization_name: string;
  portal_origin: string;
}>;

const LOCAL_PORTAL_ORIGIN =
  /^http:\/\/(?:127\.0\.0\.1|localhost):(?:5174|5175)$/u;
const HTTPS_PORTAL_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/u;

function environmentValue(
  environment: PlatformControlPlaneEnvironmentReader,
  name: string,
): string {
  return String(environment.get(name) ?? "").trim();
}

function canonicalPortalOrigin(
  environment: PlatformControlPlaneEnvironmentReader,
): string | null {
  const candidate = environmentValue(
    environment,
    "ENVAL_WORKFLOW_EMAIL_PORTAL_ORIGIN",
  );
  if (
    !candidate ||
    (!LOCAL_PORTAL_ORIGIN.test(candidate) &&
      !HTTPS_PORTAL_ORIGIN.test(candidate))
  ) return null;
  const allowedOrigins = environmentValue(environment, "ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowedOrigins.includes(candidate) ? candidate : null;
}

export async function resolveWorkflowEmailServerContext(
  environment: ServerPresentationEnvironmentReader,
  tenantExecution: AppTenantExecutionContext | undefined,
  providedReader?: PlatformControlPlaneRuntimeReader,
): Promise<WorkflowEmailServerContext | null> {
  if (!tenantExecution) return null;
  const portalOrigin = canonicalPortalOrigin(environment);
  const managedReader = providedReader ??
    createPlatformControlPlaneRuntimeReaderFromEnvironment(environment);
  if (!portalOrigin || !managedReader) return null;
  const composition = buildServerOwnedPresentationSourceComposition(
    environment,
    tenantExecution,
    managedReader,
  );
  if (!composition) return null;
  const presentation = await resolveAppPresentationBootstrap(
    tenantExecution,
    composition,
  );
  if (!presentation.ok) return null;
  return Object.freeze({
    organization_name: presentation.value.presentation.displayName,
    portal_origin: portalOrigin,
  });
}
