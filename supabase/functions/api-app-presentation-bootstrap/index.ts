import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
} from "../_shared/app_foundation.ts";
import { createPlatformControlPlaneRuntimeReaderFromEnvironment } from "../_shared/app_control_plane_runtime_reader.ts";
import {
  buildServerOwnedPresentationSourceComposition,
  resolveAppPresentationBootstrap,
  type ServerPresentationEnvironmentReader,
} from "../_shared/app_presentation_bootstrap.ts";

function serverEnvironment(): ServerPresentationEnvironmentReader {
  return { get: (name) => Deno.env.get(name) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const environment = serverEnvironment();
  const managedReader = createPlatformControlPlaneRuntimeReaderFromEnvironment(
    environment,
  );
  const meta = await getAppRequestMeta(req, { managedReader });
  if (meta instanceof Response) return meta;

  if (req.method !== "GET") {
    return appErrorResponse(
      req,
      405,
      "Methode niet toegestaan.",
      "method_not_allowed",
    );
  }

  try {
    const tenantExecution = meta.tenant_execution;
    if (!tenantExecution) throw new Error("tenant_resolution_unavailable");

    const presentationComposition =
      buildServerOwnedPresentationSourceComposition(
        environment,
        tenantExecution,
        managedReader,
      );
    if (!presentationComposition) {
      throw new Error("presentation_source_unavailable");
    }
    const presentation = await resolveAppPresentationBootstrap(
      tenantExecution,
      presentationComposition,
    );
    if (!presentation.ok) {
      throw new Error("presentation_source_unavailable");
    }
    return appJsonResponse(req, 200, presentation.value);
  } catch {
    return appErrorResponse(
      req,
      503,
      "Deze dienst is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
});
