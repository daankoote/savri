import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
} from "../_shared/app_foundation.ts";
import { authorizeSignupSigningIntakeV1 } from "../_shared/app_signup_signing_authorization.ts";
import { createSignupSigningPresentationReceiptV1 } from "../_shared/app_signup_signing_presentation.ts";
import { DataPlaneTenantConfigurationV1Adapter } from "../_shared/app_tenant_configuration_data_plane_v1.ts";
import {
  resolveTenantSigningMaterialBundleV1,
  type TenantSigningMaterialDataPlaneClient,
} from "../_shared/app_tenant_signing_material_data_plane_v1.ts";
import {
  parseRecordBody,
  signupServiceClient,
  stringField,
} from "../_shared/signup_quarantine.ts";
import {
  resolveSigningLegalDocumentBundle,
} from "../_shared/signing_legal_runtime.ts";
import { validUuid } from "../_shared/signup_signing.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);
  if (req.method !== "POST") {
    return appErrorResponse(
      req,
      405,
      "Methode niet toegestaan.",
      "method_not_allowed",
    );
  }
  const body = await parseRecordBody(req);
  if (
    !body ||
    Object.keys(body).some((key) =>
      !["intake_reference", "management_capability"].includes(key)
    )
  ) {
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      "invalid_json",
    );
  }
  const intakeId = stringField(body, "intake_reference").toLowerCase();
  const capability = stringField(body, "management_capability");
  if (!validUuid(intakeId) || !capability) {
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      "invalid_request",
    );
  }
  const client = signupServiceClient();
  if (!client) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
  const authorization = await authorizeSignupSigningIntakeV1(
    req,
    client,
    intakeId,
    capability,
  );
  if (!authorization.ok) {
    return appErrorResponse(
      req,
      authorization.status,
      authorization.message,
      authorization.code,
    );
  }

  // Authentication and intake authorization intentionally precede TF01/TF02
  // reads so no tenant signing material is resolved for an unbound caller.
  const meta = await getAppRequestMeta(req);
  if (meta instanceof Response) return meta;
  if (!meta.idempotency_key || !meta.tenant_execution) {
    return appErrorResponse(
      req,
      400,
      "Aanvraagcode ontbreekt.",
      "missing_idempotency_key",
    );
  }
  const evaluationTime = meta.timestamp;
  const configuration = await new DataPlaneTenantConfigurationV1Adapter(
    client,
    Object.freeze({ now: () => new Date(evaluationTime) }),
  ).resolveForExecutionContext(meta.tenant_execution);
  if (!configuration.ok) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "signing_configuration_unavailable",
    );
  }
  const materials = await resolveTenantSigningMaterialBundleV1(
    client as unknown as TenantSigningMaterialDataPlaneClient,
    meta.tenant_execution,
    configuration.value,
    evaluationTime,
  );
  if (!materials.ok) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      materials.code === "signing_material_invalidated"
        ? "signing_configuration_invalidated"
        : "signing_material_unavailable",
    );
  }
  const legalDocuments = await resolveSigningLegalDocumentBundle(
    materials.value.legal.content.documents,
    { supabaseUrl: Deno.env.get("SUPABASE_URL") || "" },
  );
  if (!legalDocuments) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "legal_bundle_unavailable",
    );
  }
  const receipt = await createSignupSigningPresentationReceiptV1({
    intakeId,
    authenticatedAuthUserId: authorization.value.authUserId,
    tenantExecution: meta.tenant_execution,
    configuration: configuration.value,
    materials: materials.value,
    legalDocuments,
    presentedAt: evaluationTime,
    requestId: meta.request_id,
  });
  if (!receipt) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "legal_bundle_unavailable",
    );
  }

  const existing = await client.from(
    "app_signup_signing_presentation_receipts",
  ).select("receipt_reference,receipt_sha256").eq("intake_id", intakeId)
    .eq("authenticated_auth_user_id", authorization.value.authUserId)
    .eq("request_id", meta.request_id).maybeSingle();
  if (existing.error) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
  if (existing.data) {
    if (existing.data.receipt_sha256 !== receipt.response.receipt_sha256) {
      return appErrorResponse(
        req,
        409,
        "Aanvraagcode is al gebruikt.",
        "idempotency_conflict",
      );
    }
    return appJsonResponse(req, 200, {
      ...receipt.response,
      receipt_reference: existing.data.receipt_reference,
      receipt_sha256: existing.data.receipt_sha256,
      replayed: true,
    });
  }
  const inserted = await client.from(
    "app_signup_signing_presentation_receipts",
  ).insert(receipt.databaseRow);
  if (inserted.error) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
  return appJsonResponse(req, 201, {
    ...receipt.response,
    replayed: false,
  });
});
