import {
  type AppPresentationTenantBinding,
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
  sender_display_name: string;
  sender_address: string;
  presentation_config_version: string;
}>;

export type PresentationMailIdentity = Readonly<{
  configVersion: string;
  displayName: string;
  mailDisplayName: string;
  mailAddress: string;
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
  tenantExecution: AppPresentationTenantBinding | undefined,
  providedReader?: PlatformControlPlaneRuntimeReader,
): Promise<WorkflowEmailServerContext | null> {
  if (!tenantExecution) return null;
  const portalOrigin = canonicalPortalOrigin(environment);
  const mailIdentity = await resolvePresentationMailIdentity(
    environment,
    tenantExecution,
    providedReader,
  );
  if (!portalOrigin || !mailIdentity) return null;
  return Object.freeze({
    organization_name: mailIdentity.displayName,
    portal_origin: portalOrigin,
    sender_display_name: mailIdentity.mailDisplayName,
    sender_address: mailIdentity.mailAddress,
    presentation_config_version: mailIdentity.configVersion,
  });
}

export async function resolvePresentationMailIdentity(
  environment: ServerPresentationEnvironmentReader,
  tenantExecution: AppPresentationTenantBinding | undefined,
  providedReader?: PlatformControlPlaneRuntimeReader,
): Promise<PresentationMailIdentity | null> {
  if (!tenantExecution) return null;
  const managedReader = providedReader ??
    createPlatformControlPlaneRuntimeReaderFromEnvironment(environment);
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
    configVersion: presentation.value.presentation.configVersion,
    displayName: presentation.value.presentation.displayName,
    mailDisplayName: presentation.value.presentation.identity.mailDisplayName,
    mailAddress: presentation.value.presentation.identity.mailAddress,
  });
}

export async function resolveDeploymentPresentationMailIdentity(
  environment: ServerPresentationEnvironmentReader,
): Promise<PresentationMailIdentity | null> {
  const tenantId = environmentValue(environment, "ENVAL_TENANT_REFERENCE");
  const runtimeEnvironment = environmentValue(environment, "ENVIRONMENT");
  if (!tenantId || !runtimeEnvironment) return null;
  return await resolvePresentationMailIdentity(environment, {
    tenantId,
    environment: runtimeEnvironment,
  });
}
