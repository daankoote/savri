import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
} from "../_shared/app_foundation.ts";
import { createPlatformControlPlaneRuntimeReader } from "../_shared/app_control_plane_runtime_reader.ts";
import {
  buildServerOwnedPresentationSourceComposition,
  resolveAppPresentationBootstrap,
  type ServerPresentationEnvironmentReader,
} from "../_shared/app_presentation_bootstrap.ts";

function serverEnvironment(): ServerPresentationEnvironmentReader {
  return { get: (name) => Deno.env.get(name) };
}

function controlPlaneReader() {
  const url = String(
    Deno.env.get("ENVAL_CONTROL_PLANE_SUPABASE_URL") ?? "",
  ).trim();
  const serviceRoleKey = String(
    Deno.env.get("ENVAL_CONTROL_PLANE_SERVICE_ROLE_KEY") ?? "",
  ).trim();
  if (!url || !serviceRoleKey) return null;
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    db: { schema: "platform" },
  });
  return createPlatformControlPlaneRuntimeReader(client);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const environment = serverEnvironment();
  const managedReader = controlPlaneReader();
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
