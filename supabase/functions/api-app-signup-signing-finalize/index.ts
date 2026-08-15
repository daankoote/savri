import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  isRecord,
  parseRecordBody,
  publicRpcBody,
  signupServiceClient,
  stringField,
} from "../_shared/signup_quarantine.ts";
import {
  signingLegalBundleAllowed,
  signingLegalRuntimeProjection,
  signingSha256Hex,
  stableSigningJson,
} from "../_shared/signing_legal_runtime.ts";
import {
  channelReference,
  otpVerifier,
  safeString,
  safeStringArray,
  signingVerifierSecret,
  validUuid,
} from "../_shared/signup_signing.ts";
import { attemptSignupPromotion } from "../_shared/signup_promotion.ts";
import {
  requireVerifiedSupabaseAuthUser,
} from "../_shared/app_customer_auth.ts";

type SafeFact = {
  fact_id: string;
  fact_key: string | null;
  label: string;
  value: string;
  resolution_state: "pending" | "confirmed" | "review_required" | "blocked";
  required: boolean;
  location_id?: string;
  charger_id?: string;
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function safeFacts(value: unknown): SafeFact[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    return null;
  }
  const facts: SafeFact[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const factId = safeString(item.factId, 240);
    const label = safeString(item.label, 240);
    const factValue = safeString(item.value, 2000);
    const state = safeString(
      item.resolutionState,
      40,
    ) as SafeFact["resolution_state"];
    if (
      !factId || !label ||
      !["pending", "confirmed", "review_required", "blocked"].includes(state)
    ) return null;
    facts.push({
      fact_id: factId,
      fact_key: safeString(item.factKey, 100) || null,
      label,
      value: factValue,
      resolution_state: state,
      required: item.required === true,
      ...(safeString(item.locationId, 200)
        ? { location_id: safeString(item.locationId, 200) }
        : {}),
      ...(safeString(item.chargerId, 200)
        ? { charger_id: safeString(item.chargerId, 200) }
        : {}),
    });
  }
  return facts;
}

function connectionScope(facts: SafeFact[]) {
  const locationIds = [
    ...new Set(facts.map((fact) => fact.location_id).filter(Boolean)),
  ] as string[];
  return locationIds.map((locationId) => ({
    location_id: locationId,
    eans: [
      ...new Set(
        facts.filter((fact) =>
          fact.location_id === locationId && fact.fact_key === "electricityEan"
        ).map((fact) => fact.value).filter(Boolean),
      ),
    ],
    addresses: [
      ...new Set(
        facts.filter((fact) =>
          fact.location_id === locationId &&
          fact.fact_key === "structuredAddress"
        ).map((fact) => fact.value).filter(Boolean),
      ),
    ],
  })).filter((scope) => scope.eans.length > 0);
}

async function postSigningProjection(
  req: Request,
  intakeId: string,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const SB = signupServiceClient();
  let authenticatedAuthUserId: string | null = null;
  const bearer = req.headers.get("authorization")?.trim().match(
    /^Bearer\s+([^\s]+)$/i,
  )?.[1];
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || "";
  if (SB && bearer && bearer !== anonKey) {
    const verifiedAuth = await requireVerifiedSupabaseAuthUser(req, SB);
    if (!verifiedAuth.ok) {
      return {
        ...body,
        intake_status: "submitted_for_review",
        promotion_state: "blocked",
        account_handoff: "blocked",
      };
    }
    authenticatedAuthUserId = verifiedAuth.context.authUserId;
    const provenance = await SB.rpc(
      "app_signup_authenticated_intake_claim_v1",
      {
        p_intake_id: intakeId,
        p_authenticated_auth_user_id: authenticatedAuthUserId,
        p_request_id: meta.request_id,
      },
    );
    if (
      provenance.error || !isRecord(provenance.data) ||
      provenance.data.ok !== true
    ) {
      return {
        ...body,
        intake_status: "submitted_for_review",
        promotion_state: "blocked",
        account_handoff: "blocked",
      };
    }
  }

  const promotionMeta = {
    ...meta,
    idempotency_key: `signup-promotion:${intakeId}`,
  };
  let attempt = await attemptSignupPromotion(intakeId, promotionMeta);
  for (const delayMs of [100, 300]) {
    if (attempt.ok || attempt.state !== "pending") break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    attempt = await attemptSignupPromotion(intakeId, promotionMeta);
  }
  const handoffResult = SB
    ? await SB.rpc("app_signup_account_handoff_v2", {
      p_intake_id: intakeId,
      p_authenticated_auth_user_id: authenticatedAuthUserId,
    })
    : { data: null, error: true };
  const handoff = isRecord(handoffResult.data) &&
      [
        "existing_account_login_required",
        "account_activation_available",
        "already_authenticated",
        "blocked",
      ].includes(stringField(handoffResult.data, "account_handoff"))
    ? stringField(handoffResult.data, "account_handoff")
    : "blocked";
  return {
    ...body,
    intake_status: "submitted_for_review",
    promotion_state: attempt.state,
    account_handoff: handoff,
  };
}

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
  const meta = await getAppRequestMeta(req);
  const body = await parseRecordBody(req);
  if (!body) {
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      "invalid_json",
    );
  }
  const intakeId = stringField(body, "intake_reference").toLowerCase();
  const capability = stringField(body, "management_capability");
  const operation = stringField(body, "operation").toLowerCase();
  if (!validUuid(intakeId) || !capability) {
    return appErrorResponse(
      req,
      400,
      "Controleer de ondertekening.",
      "invalid_signing_request",
    );
  }

  if (operation === "status") {
    const SB = signupServiceClient();
    if (!SB) {
      return appErrorResponse(
        req,
        503,
        "Ondertekenen is tijdelijk niet beschikbaar.",
        "service_unavailable",
      );
    }
    const result = await SB.rpc("app_signup_signing_status_v2", {
      p_intake_id: intakeId,
      p_manage_token_sha256: await sha256Hex(capability),
    });
    if (result.error) {
      return appErrorResponse(
        req,
        403,
        "Deze aanmelding kan niet veilig worden hersteld.",
        "signing_status_unavailable",
      );
    }
    const rpc = publicRpcBody(result.data);
    if (!rpc) {
      return appErrorResponse(
        req,
        503,
        "Ondertekenen is tijdelijk niet beschikbaar.",
        "service_unavailable",
      );
    }
    if (rpc.body.signing_state !== "finalized") {
      return appJsonResponse(req, rpc.status, rpc.body);
    }
    return appJsonResponse(
      req,
      rpc.status,
      await postSigningProjection(req, intakeId, meta, rpc.body),
    );
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(
      req,
      400,
      "Aanvraagcode ontbreekt.",
      "missing_idempotency_key",
    );
  }
  const challengeId = stringField(body, "challenge_reference").toLowerCase();
  const otpCode = stringField(body, "otp_code");
  const accountType = stringField(body, "account_type").toLowerCase();
  const typedFullName = safeString(body.typed_full_name, 200);
  const signerRole = safeString(body.signer_role, 200);
  const mandateYear = Number(body.mandate_year);
  const requiredFileIds = safeStringArray(body.required_file_references, 100);
  const facts = safeFacts(body.canonical_facts);
  const legalActions = isRecord(body.legal_actions) ? body.legal_actions : null;
  if (
    !validUuid(intakeId) || !validUuid(challengeId) || !capability ||
    !/^\d{6}$/.test(otpCode) ||
    !["particulier", "zakelijk", "vve"].includes(accountType) ||
    !typedFullName ||
    (accountType !== "particulier" && !signerRole) ||
    !Number.isInteger(mandateYear) ||
    !requiredFileIds || !requiredFileIds.every(validUuid) || !facts ||
    !legalActions ||
    legalActions.privacy_notice_read !== true ||
    legalActions.service_terms_accepted !== true ||
    legalActions.fee_terms_accepted !== true ||
    legalActions.mandate_signed !== true
  ) {
    return appErrorResponse(
      req,
      400,
      "Controleer de ondertekening.",
      "invalid_signing_request",
    );
  }

  const environment = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
  };
  if (!signingLegalBundleAllowed(environment)) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is nog niet beschikbaar.",
      "legal_bundle_not_current",
    );
  }
  const secret = signingVerifierSecret();
  const SB = signupServiceClient();
  if (!secret || !SB) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  const intake = await SB.from("app_signup_intakes").select(
    "email_normalized,status,submitted_payload",
  )
    .eq("id", intakeId).maybeSingle();
  if (intake.error || !intake.data) {
    return appErrorResponse(
      req,
      403,
      "Deze aanmelding is niet beschikbaar.",
      "intake_unavailable",
    );
  }
  const submittedAccountType = isRecord(intake.data.submitted_payload)
    ? safeString(intake.data.submitted_payload.account_type, 40)
    : "";
  if (submittedAccountType !== accountType) {
    return appErrorResponse(
      req,
      422,
      "Accounttype komt niet overeen.",
      "account_type_mismatch",
    );
  }

  const legalProjection = await signingLegalRuntimeProjection();
  const legalDocuments = legalProjection.map((
    { canonical_content: _content, ...document },
  ) => document);
  const issuedAt = new Date().toISOString();
  const scopes = connectionScope(facts);
  if (
    scopes.length === 0 ||
    scopes.some((scope) =>
      scope.eans.length === 0 || scope.addresses.length === 0
    )
  ) {
    return appErrorResponse(
      req,
      422,
      "Controleer EAN en locatie.",
      "mandate_scope_incomplete",
    );
  }
  const mandate = {
    schema_version: "mandate-document-runtime-v1",
    account_type: accountType,
    party_facts: facts.filter((fact) =>
      ["partyName", "organizationName", "kvkNumber", "registeredAddress"]
        .includes(fact.fact_key || "")
    ),
    connection_scope: scopes,
    permissions: [
      "nea_dso_connection_data_request",
      "verifier_location_inspection",
    ],
    validity: {
      policy_id: "one_whole_calendar_year_v1",
      calendar_years: [mandateYear],
    },
    issue_date: issuedAt,
    authority_review_status: accountType === "particulier"
      ? "not_applicable"
      : "required_not_completed",
  };
  const snapshot = {
    schema_version: "signup-signing-runtime-snapshot-v1",
    intake_reference: intakeId,
    account_type: accountType,
    canonical_facts: { schema_version: "canonical-signing-facts-v1", facts },
    required_file_references: [...requiredFileIds].sort(),
    legal_documents: legalDocuments.map((document) => ({
      document_type: document.document_type,
      version: document.version,
      language: document.language,
      status: document.status,
      effective_from: document.effective_from,
      content_sha256: document.content_sha256,
    })),
    legal_actions: {
      privacy_notice_read: true,
      service_terms_accepted: true,
      fee_terms_accepted: true,
      mandate_signed: true,
    },
    mandate,
    signature_method: { method_id: "typed_name_otp_v1", method_version: "1" },
    signer: { typed_full_name: typedFullName, signer_role: signerRole },
    server_issue_date: issuedAt,
  };
  const snapshotSha256 = await signingSha256Hex(stableSigningJson(snapshot));
  const verifier = await otpVerifier(secret, otpCode);
  const channelHash = await channelReference(
    secret,
    String(intake.data.email_normalized || ""),
  );
  const manageHash = await sha256Hex(capability);
  const normalizedPayloadHash = await payloadHash({
    intake_reference: intakeId,
    challenge_reference: challengeId,
    otp_verifier_sha256: verifier,
    account_type: accountType,
    typed_full_name: typedFullName,
    signer_role: signerRole,
    mandate_year: mandateYear,
    canonical_facts: facts,
    required_file_references: [...requiredFileIds].sort(),
    legal_actions: snapshot.legal_actions,
  });
  const result = await SB.rpc("app_signup_signing_finalize_v2", {
    p_intake_id: intakeId,
    p_manage_token_sha256: manageHash,
    p_challenge_id: challengeId,
    p_channel_reference_sha256: channelHash,
    p_otp_verifier_sha256: verifier,
    p_payload_hash: normalizedPayloadHash,
    p_canonical_snapshot: snapshot,
    p_snapshot_sha256: snapshotSha256,
    p_legal_documents: legalDocuments,
    p_required_file_ids: requiredFileIds,
    p_account_type: accountType,
    p_mandate_year: mandateYear,
    p_issued_at: issuedAt,
    p_mandate_content: mandate,
    p_typed_full_name: typedFullName,
    p_signer_role: signerRole,
    p_method_version: "1",
    p_request_id: meta.request_id,
    p_idempotency_key: meta.idempotency_key,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
  });
  if (result.error) {
    return appErrorResponse(
      req,
      403,
      "Ondertekening kon niet worden afgerond.",
      "finalization_failed",
    );
  }
  const rpc = publicRpcBody(result.data);
  if (!rpc) {
    return appErrorResponse(
      req,
      503,
      "Ondertekenen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }
  if (rpc.body.ok !== true) {
    return appJsonResponse(req, rpc.status, rpc.body);
  }
  return appJsonResponse(
    req,
    rpc.status,
    await postSigningProjection(req, intakeId, meta, rpc.body),
  );
});
