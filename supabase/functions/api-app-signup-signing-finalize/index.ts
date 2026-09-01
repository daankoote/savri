import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  type AppRequestMeta,
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
import {
  deriveSignupResolutionProvenanceV1,
  type SignupResolutionActionV1,
} from "../_shared/signup_resolution_provenance.ts";

type ResolutionSourceInput = {
  fileReference: string;
  clientSlotId: string;
  documentType:
    | "organization_extract"
    | "energy_bill_or_contract"
    | "installation_invoice";
  contentSha256: string;
  parserVersion: string;
  observedValue: string;
};

type SafeFactInput = {
  factId: string;
  factKey: string | null;
  label: string;
  value: string;
  resolutionState: SafeFact["resolution_state"];
  required: boolean;
  locationId?: string;
  chargerId?: string;
  resolutionInput: {
    action: SignupResolutionActionV1;
    sources: ResolutionSourceInput[];
  };
};

type SafeFact = {
  fact_id: string;
  fact_key: string | null;
  label: string;
  value: string;
  resolution_state: "pending" | "confirmed" | "review_required" | "blocked";
  required: boolean;
  location_id?: string;
  charger_id?: string;
  resolution_provenance: {
    schema_version: "signup-resolution-provenance-v1";
    resolution_authority: "CUSTOMER_SIGNED_RESOLUTION";
    resolution_action: SignupResolutionActionV1;
    source_relation: "none" | "single" | "equal" | "probable" | "conflict";
    review_reason:
      | "USER_OVERRIDE"
      | "USER_SUPPLIED_WITHOUT_DOCUMENT"
      | "DOCUMENT_CONFLICT_RESOLVED"
      | "PROBABLE_IDENTITY_MATCH"
      | "PROBABLE_ADDRESS_MATCH"
      | null;
    sources: Array<{
      file_reference: string;
      document_type: ResolutionSourceInput["documentType"];
      content_sha256: string;
      document_binding_authority: "SERVER_VERIFIED";
      parser_version: string;
      observed_value: string;
      parser_observation_authority: "CUSTOMER_SIGNED_RESOLUTION";
    }>;
  };
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

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function safeFactInputs(value: unknown): SafeFactInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    return null;
  }
  const facts: SafeFactInput[] = [];
  for (const item of value) {
    if (
      !isRecord(item) || !exactKeys(item, [
        "factId",
        "factKey",
        "label",
        "value",
        "resolutionState",
        "required",
        "locationId",
        "chargerId",
        "resolutionInput",
      ]) || !isRecord(item.resolutionInput) ||
      !exactKeys(item.resolutionInput, ["action", "sources"]) ||
      !Array.isArray(item.resolutionInput.sources) ||
      item.resolutionInput.sources.length > 20
    ) return null;
    const factId = safeString(item.factId, 240);
    const label = safeString(item.label, 240);
    const factValue = safeString(item.value, 2000);
    const state = safeString(
      item.resolutionState,
      40,
    ) as SafeFact["resolution_state"];
    const action = safeString(
      item.resolutionInput.action,
      20,
    ) as SignupResolutionActionV1;
    if (
      !factId || !label ||
      !["pending", "confirmed", "review_required", "blocked"].includes(state) ||
      !["confirmed", "corrected", "supplied", "unresolved"].includes(action)
    ) return null;
    const sources: ResolutionSourceInput[] = [];
    for (const source of item.resolutionInput.sources) {
      if (
        !isRecord(source) || !exactKeys(source, [
          "fileReference",
          "clientSlotId",
          "documentType",
          "contentSha256",
          "parserVersion",
          "observedValue",
        ])
      ) return null;
      const fileReference = safeString(source.fileReference, 100).toLowerCase();
      const clientSlotId = safeString(source.clientSlotId, 200);
      const documentType = safeString(
        source.documentType,
        80,
      ) as ResolutionSourceInput["documentType"];
      const contentSha256 = safeString(source.contentSha256, 64).toLowerCase();
      const parserVersion = safeString(source.parserVersion, 120);
      const observedValue = safeString(source.observedValue, 2000);
      if (
        !validUuid(fileReference) || !clientSlotId ||
        ![
          "organization_extract",
          "energy_bill_or_contract",
          "installation_invoice",
        ].includes(documentType) || !/^[0-9a-f]{64}$/.test(contentSha256) ||
        !parserVersion || !observedValue
      ) return null;
      sources.push({
        fileReference,
        clientSlotId,
        documentType,
        contentSha256,
        parserVersion,
        observedValue,
      });
    }
    facts.push({
      factId,
      factKey: safeString(item.factKey, 100) || null,
      label,
      value: factValue,
      resolutionState: state,
      required: item.required === true,
      ...(safeString(item.locationId, 200)
        ? { locationId: safeString(item.locationId, 200) }
        : {}),
      ...(safeString(item.chargerId, 200)
        ? { chargerId: safeString(item.chargerId, 200) }
        : {}),
      resolutionInput: { action, sources },
    });
  }
  return facts;
}

function safeFacts(
  inputs: SafeFactInput[],
  authoritativeFiles: unknown,
  requiredFileIds: string[],
  accountType: string,
): SafeFact[] | null {
  if (!Array.isArray(authoritativeFiles)) return null;
  const files = new Map<string, Record<string, unknown>>();
  for (const value of authoritativeFiles) {
    if (!isRecord(value) || typeof value.id !== "string") return null;
    files.set(value.id, value);
  }
  if (
    files.size !== new Set(requiredFileIds).size ||
    requiredFileIds.some((id) => !files.has(id))
  ) return null;
  const partyKind = accountType === "particulier"
    ? "natural_person" as const
    : "organization" as const;

  const facts: SafeFact[] = [];
  for (const input of inputs) {
    const seen = new Set<string>();
    const sources: SafeFact["resolution_provenance"]["sources"] = [];
    for (const source of input.resolutionInput.sources) {
      const file = files.get(source.fileReference);
      if (
        !file || seen.has(source.fileReference) ||
        file.client_slot_id !== source.clientSlotId ||
        file.document_type !== source.documentType ||
        file.server_sha256 !== source.contentSha256
      ) return null;
      seen.add(source.fileReference);
      sources.push({
        file_reference: source.fileReference,
        document_type: source.documentType,
        content_sha256: source.contentSha256,
        document_binding_authority: "SERVER_VERIFIED",
        parser_version: source.parserVersion,
        observed_value: source.observedValue,
        parser_observation_authority: "CUSTOMER_SIGNED_RESOLUTION",
      });
    }
    const derivation = deriveSignupResolutionProvenanceV1({
      factKey: input.factKey as never,
      partyKind,
      resolutionState: input.resolutionState,
      action: input.resolutionInput.action,
      sources: sources.map((source) => ({
        identity: source.content_sha256,
        observedValue: source.observed_value,
      })),
    });
    if (
      !derivation ||
      (input.resolutionState === "review_required" &&
        derivation.reviewReason === null) ||
      (input.resolutionState !== "review_required" &&
        derivation.reviewReason !== null)
    ) return null;
    facts.push({
      fact_id: input.factId,
      fact_key: input.factKey,
      label: input.label,
      value: input.value,
      resolution_state: input.resolutionState,
      required: input.required,
      ...(input.locationId ? { location_id: input.locationId } : {}),
      ...(input.chargerId ? { charger_id: input.chargerId } : {}),
      resolution_provenance: {
        schema_version: "signup-resolution-provenance-v1",
        resolution_authority: "CUSTOMER_SIGNED_RESOLUTION",
        resolution_action: input.resolutionInput.action,
        source_relation: derivation.sourceRelation,
        review_reason: derivation.reviewReason,
        sources,
      },
    });
  }
  return facts;
}

async function authorizeSigningContext(
  req: Request,
  SB: ReturnType<typeof signupServiceClient> & object,
  intakeId: string,
  authenticatedAuthUserId: string,
  manageHash: string,
  meta: AppRequestMeta,
): Promise<
  | { ok: true }
  | { ok: false; response: Response }
> {
  const statusResult = await SB.rpc("app_signup_signing_status_v2", {
    p_intake_id: intakeId,
    p_manage_token_sha256: manageHash,
  });
  const statusRpc = statusResult.error
    ? null
    : publicRpcBody(statusResult.data);
  if (!statusRpc || statusRpc.body.ok !== true) {
    return {
      ok: false,
      response: appErrorResponse(
        req,
        403,
        "Deze aanmelding is niet beschikbaar.",
        "intake_unavailable",
      ),
    };
  }

  const provenance = await SB.from(
    "app_signup_authenticated_intake_provenance",
  ).select("auth_user_id").eq("intake_id", intakeId).maybeSingle();
  if (
    provenance.error ||
    (provenance.data &&
      provenance.data.auth_user_id !== authenticatedAuthUserId)
  ) {
    return {
      ok: false,
      response: appErrorResponse(
        req,
        403,
        "Deze aanmelding is niet beschikbaar.",
        "intake_unavailable",
      ),
    };
  }

  if (statusRpc.body.signing_state === "finalized") {
    const claim = await SB.rpc("app_signup_authenticated_intake_claim_v1", {
      p_intake_id: intakeId,
      p_authenticated_auth_user_id: authenticatedAuthUserId,
      p_request_id: meta.request_id,
    });
    if (claim.error || !isRecord(claim.data) || claim.data.ok !== true) {
      return {
        ok: false,
        response: appErrorResponse(
          req,
          403,
          "Deze aanmelding is niet beschikbaar.",
          "intake_unavailable",
        ),
      };
    }
  }

  return { ok: true };
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
  meta: AppRequestMeta,
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
  if (meta instanceof Response) return meta;
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
  const factInputs = safeFactInputs(body.canonical_facts);
  const legalActions = isRecord(body.legal_actions) ? body.legal_actions : null;
  if (
    !validUuid(intakeId) || !validUuid(challengeId) || !capability ||
    !/^\d{6}$/.test(otpCode) ||
    !["particulier", "zakelijk", "vve"].includes(accountType) ||
    !typedFullName ||
    (accountType !== "particulier" && !signerRole) ||
    !Number.isInteger(mandateYear) ||
    !requiredFileIds || !requiredFileIds.every(validUuid) || !factInputs ||
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

  const verifiedAuth = await requireVerifiedSupabaseAuthUser(req, SB);
  if (!verifiedAuth.ok) {
    return appErrorResponse(
      req,
      verifiedAuth.status,
      verifiedAuth.message,
      verifiedAuth.code,
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
  if (
    String(intake.data.email_normalized || "") !==
      verifiedAuth.context.emailNormalized
  ) {
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

  const manageHash = await sha256Hex(capability);
  const authorization = await authorizeSigningContext(
    req,
    SB,
    intakeId,
    verifiedAuth.context.authUserId,
    manageHash,
    meta,
  );
  if (!authorization.ok) return authorization.response;

  const intakeFiles = await SB.from("app_signup_intake_files").select(
    "id,client_slot_id,document_type,server_sha256",
  ).eq("intake_id", intakeId).in("id", requiredFileIds);
  const facts = intakeFiles.error
    ? null
    : safeFacts(factInputs, intakeFiles.data, requiredFileIds, accountType);
  if (!facts) {
    return appErrorResponse(
      req,
      422,
      "De herkomst van de ondertekende gegevens kon niet veilig worden vastgesteld.",
      "resolution_provenance_invalid",
    );
  }

  const verifier = await otpVerifier(secret, otpCode);
  const channelHash = await channelReference(
    secret,
    String(intake.data.email_normalized || ""),
  );
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
    legal_actions: {
      privacy_notice_read: true,
      service_terms_accepted: true,
      fee_terms_accepted: true,
      mandate_signed: true,
    },
  });

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
    canonical_facts: { schema_version: "canonical-signing-facts-v2", facts },
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
