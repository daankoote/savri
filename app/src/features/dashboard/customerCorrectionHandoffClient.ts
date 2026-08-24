import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";
import {
  type DocumentFactKey,
  isDocumentFactKey,
} from "../../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";

export const CUSTOMER_CORRECTION_REASONS = Object.freeze(
  [
    "MISSING_INFORMATION",
    "INCORRECT_INFORMATION",
    "INCONSISTENT_INFORMATION",
    "OTHER",
  ] as const,
);

export type CustomerCorrectionReason =
  (typeof CUSTOMER_CORRECTION_REASONS)[number];

export const CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS = Object.freeze(
  [
    "VALUE_CORRECTION",
    "MISSING_VALUE",
    "DOCUMENT_REPLACEMENT",
    "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  ] as const,
);

export type CustomerCorrectionResponseRequirement =
  (typeof CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS)[number];

export type CustomerCorrectionHandoffItem = Readonly<{
  itemRef: string;
  factKey: DocumentFactKey;
  documentLabel: "Energiedocument" | "Installatiefactuur";
  factLabel: string;
  correctionReason: CustomerCorrectionReason;
  correctionInstruction: string;
  currentValue?: unknown;
  responseRequirement: CustomerCorrectionResponseRequirement;
  replacementTarget?: Readonly<{
    replacementTargetRef: string;
    documentLabel: "Energiedocument" | "Installatiefactuur";
    acceptedMimeTypes: readonly ["application/pdf"];
    maximumFileSize: number;
  }>;
}>;

export type CustomerCorrectionCurrentReplacementCandidate = Readonly<{
  replacementTargetRef: string;
  candidateRef: string;
  fileName: string;
  contentFingerprint: string | null;
  parserObservation:
    | null
    | Readonly<{
      observedFacts: ReadonlyArray<
        Readonly<{
          factKey: DocumentFactKey;
          observedValue: string | null;
          extractionMethod: string | null;
        }>
      >;
    }>;
}>;

export type CustomerCorrectionHandoffModel = Readonly<{
  caseRef: string;
  handoff:
    | null
    | Readonly<{
      items: readonly CustomerCorrectionHandoffItem[];
      currentReplacementCandidates:
        readonly CustomerCorrectionCurrentReplacementCandidate[];
      signerAuthority:
        | Readonly<{
          status: "available";
          expectedSignerDisplayName: string;
        }>
        | Readonly<{ status: "unavailable" }>;
    }>;
}>;

export type CustomerCorrectionHandoffErrorCode =
  | "not_configured"
  | "inaccessible"
  | "invalid_response"
  | "service_unavailable";

export type CustomerCorrectionHandoffSafeError = Readonly<{
  code: CustomerCorrectionHandoffErrorCode;
  message: string;
}>;

export type CustomerCorrectionHandoffResult =
  | { ok: true; model: CustomerCorrectionHandoffModel }
  | {
    ok: false;
    error: CustomerCorrectionHandoffSafeError;
    status?: number;
  };

export const CUSTOMER_CORRECTION_LEGAL_BUNDLE = Object.freeze({
  bundleVersion: "customer-correction-confirmation-nl-v1",
  title: "Bevestiging correctie dossiergegevens",
  statement:
    "Ik bevestig dat de door mij ingediende correcties juist en volledig zijn en onderdeel worden van mijn ENVAL-dossier.",
});

export type CustomerCorrectionResponse =
  | Readonly<{ itemRef: string; correctedValue: string }>
  | Readonly<{ itemRef: string; replacementCandidateRef: string }>
  | Readonly<{
    itemRef: string;
    correctedValue: string;
    replacementCandidateRef: string;
  }>;

export type CustomerCorrectionFactResolutionSource = Readonly<{
  candidateRef: string;
  relationship: "direct" | "supporting";
  selected: boolean;
}>;

export type CustomerCorrectionFactResolution = Readonly<{
  itemRefs: readonly string[];
  resolutionType:
    | "SOURCE_CONFIRMED"
    | "SOURCE_CONFLICT_SELECTED"
    | "MANUAL";
  sources: readonly CustomerCorrectionFactResolutionSource[];
}>;

export type CustomerCorrectionChallengeReceipt = Readonly<{
  challengeReference: string;
  expiresAt: string;
  deliveryTargetMasked: string;
  legalBundle: typeof CUSTOMER_CORRECTION_LEGAL_BUNDLE;
}>;

export type CustomerCorrectionSigningErrorCode =
  | "not_configured"
  | "inaccessible"
  | "invalid_response"
  | "invalid_otp"
  | "challenge_unavailable"
  | "signer_name_mismatch"
  | "signer_authority_unavailable"
  | "stale_handoff"
  | "service_unavailable";

export type CustomerCorrectionSigningError = Readonly<{
  code: CustomerCorrectionSigningErrorCode;
  message: string;
}>;

export type CustomerCorrectionSigningResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CustomerCorrectionSigningError; status?: number };

type UnknownRecord = Record<string, unknown>;

type CustomerCorrectionHandoffClientConfig = {
  accessToken: string;
  caseRef: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: { apiBaseUrl: string; anonKey: string };
};

type CustomerCorrectionSigningClientConfig = {
  accessToken: string;
  caseRef: string;
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: { apiBaseUrl: string; anonKey: string };
};

const SCHEMA_VERSION = "customer-correction-handoff-v5";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const HANDOFF_REFERENCE_RE = /^CRH-[0-9A-F]{16}$/;
const ITEM_REFERENCE_RE = /^CCI-[A-F0-9]{32}$/;
const REPLACEMENT_TARGET_REFERENCE_RE = /^CRT-[A-F0-9]{32}$/;
const REPLACEMENT_CANDIDATE_REFERENCE_RE = /^CRC-[A-F0-9]{32}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const SERVER_REASON_LABELS: Readonly<Record<CustomerCorrectionReason, string>> =
  Object.freeze({
    MISSING_INFORMATION: "Gegeven ontbreekt",
    INCORRECT_INFORMATION: "Gegeven onjuist",
    INCONSISTENT_INFORMATION: "Gegevens inconsistent",
    OTHER: "Aanpassing nodig",
  });

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actual = Object.keys(value);
  return required.every((key) => actual.includes(key)) &&
    actual.every((key) => required.includes(key) || optional.includes(key));
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  return value.length >= 1 && value.length <= maximum ? value : null;
}

function safeJsonValue(value: unknown): boolean {
  try {
    const encoded = JSON.stringify(value);
    return encoded !== undefined && encoded.length <= 4_000;
  } catch (_error) {
    return false;
  }
}

function parseReplacementTarget(
  value: unknown,
): NonNullable<CustomerCorrectionHandoffItem["replacementTarget"]> | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "acceptedMimeTypes",
      "documentLabel",
      "maximumFileSize",
      "replacementTargetRef",
    ]) ||
    typeof value.replacementTargetRef !== "string" ||
    !REPLACEMENT_TARGET_REFERENCE_RE.test(value.replacementTargetRef) ||
    !["Energiedocument", "Installatiefactuur"].includes(
      String(value.documentLabel),
    ) ||
    !Array.isArray(value.acceptedMimeTypes) ||
    value.acceptedMimeTypes.length !== 1 ||
    value.acceptedMimeTypes[0] !== "application/pdf" ||
    value.maximumFileSize !== 15 * 1024 * 1024
  ) return null;
  return Object.freeze({
    replacementTargetRef: value.replacementTargetRef,
    documentLabel: value.documentLabel as
      | "Energiedocument"
      | "Installatiefactuur",
    acceptedMimeTypes: Object.freeze(["application/pdf"] as const),
    maximumFileSize: value.maximumFileSize,
  });
}

function parseItem(value: unknown): CustomerCorrectionHandoffItem | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "correctionInstruction",
      "correctionReason",
      "correctionReasonLabel",
      "documentLabel",
      "factKey",
      "factLabel",
      "itemRef",
      "responseRequirement",
    ], ["currentValue", "replacementTarget"])
  ) return null;

  const itemRef = value.itemRef;
  const documentLabel = value.documentLabel;
  const factKey = value.factKey;
  const factLabel = boundedString(value.factLabel, 240);
  const correctionReason = value.correctionReason as CustomerCorrectionReason;
  const correctionInstruction = boundedString(
    value.correctionInstruction,
    1_000,
  );
  const responseRequirement = value
    .responseRequirement as CustomerCorrectionResponseRequirement;
  const requiresReplacement = [
    "DOCUMENT_REPLACEMENT",
    "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  ].includes(responseRequirement);
  const replacementTarget = "replacementTarget" in value
    ? parseReplacementTarget(value.replacementTarget)
    : null;
  if (
    typeof itemRef !== "string" || !ITEM_REFERENCE_RE.test(itemRef) ||
    !isDocumentFactKey(factKey) ||
    !["Energiedocument", "Installatiefactuur"].includes(
      String(documentLabel),
    ) ||
    !factLabel || !CUSTOMER_CORRECTION_REASONS.includes(correctionReason) ||
    !CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS.includes(responseRequirement) ||
    value.correctionReasonLabel !== SERVER_REASON_LABELS[correctionReason] ||
    !correctionInstruction || !/[\p{L}\p{N}]/u.test(correctionInstruction) ||
    (requiresReplacement ? !replacementTarget : replacementTarget !== null) ||
    (replacementTarget && replacementTarget.documentLabel !== documentLabel) ||
    ("currentValue" in value &&
      (value.currentValue === null || !safeJsonValue(value.currentValue)))
  ) return null;

  return Object.freeze({
    itemRef,
    factKey,
    documentLabel:
      documentLabel as CustomerCorrectionHandoffItem["documentLabel"],
    factLabel,
    correctionReason,
    correctionInstruction,
    ...(value.currentValue === undefined
      ? {}
      : { currentValue: value.currentValue }),
    responseRequirement,
    ...(replacementTarget ? { replacementTarget } : {}),
  });
}

function parseSignerAuthority(
  value: unknown,
):
  | NonNullable<CustomerCorrectionHandoffModel["handoff"]>["signerAuthority"]
  | null {
  if (!isRecord(value) || typeof value.status !== "string") return null;
  if (value.status === "unavailable" && exactKeys(value, ["status"])) {
    return Object.freeze({ status: "unavailable" as const });
  }
  if (
    value.status !== "available" ||
    !exactKeys(value, ["expectedSignerDisplayName", "status"])
  ) return null;
  const expectedSignerDisplayName = boundedString(
    value.expectedSignerDisplayName,
    200,
  );
  return expectedSignerDisplayName
    ? Object.freeze({
      status: "available" as const,
      expectedSignerDisplayName,
    })
    : null;
}

function parseCurrentReplacementCandidate(
  value: unknown,
): CustomerCorrectionCurrentReplacementCandidate | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "candidateRef",
      "contentFingerprint",
      "fileName",
      "parserObservation",
      "replacementTargetRef",
    ]) ||
    typeof value.replacementTargetRef !== "string" ||
    !REPLACEMENT_TARGET_REFERENCE_RE.test(value.replacementTargetRef) ||
    typeof value.candidateRef !== "string" ||
    !REPLACEMENT_CANDIDATE_REFERENCE_RE.test(value.candidateRef) ||
    !(value.contentFingerprint === null ||
      (typeof value.contentFingerprint === "string" &&
        /^[0-9a-f]{64}$/.test(value.contentFingerprint))) ||
    !boundedString(value.fileName, 180)
  ) return null;
  if (value.parserObservation === null) {
    return Object.freeze({
      replacementTargetRef: value.replacementTargetRef,
      candidateRef: value.candidateRef,
      fileName: value.fileName as string,
      contentFingerprint: value.contentFingerprint as string | null,
      parserObservation: null,
    });
  }
  if (
    !isRecord(value.parserObservation) ||
    !exactKeys(value.parserObservation, [
      "observedFacts",
      "outcome",
      "parserProfile",
      "schemaVersion",
    ]) ||
    value.parserObservation.schemaVersion !==
      "customer-correction-replacement-observation-v1" ||
    ![
      "energy_document_v1",
      "installation_invoice_v1",
      "kvk_extract_v1",
      "generic_charger_evidence_v1",
    ].includes(String(value.parserObservation.parserProfile)) ||
    !["completed", "completed_with_limitations", "failed"].includes(
      String(value.parserObservation.outcome),
    ) ||
    !Array.isArray(value.parserObservation.observedFacts)
  ) return null;
  const observedFacts = value.parserObservation.observedFacts.map((fact) => {
    if (
      !isRecord(fact) ||
      !exactKeys(fact, [
        "extractionMethod",
        "factKey",
        "observedValue",
        "status",
      ]) ||
      !isDocumentFactKey(fact.factKey) ||
      !["observed", "not_observed"].includes(String(fact.status)) ||
      !(fact.observedValue === null ||
        typeof fact.observedValue === "string") ||
      (fact.status === "observed" &&
        (typeof fact.observedValue !== "string" ||
          fact.observedValue.trim().length < 1)) ||
      (fact.status === "not_observed" && fact.observedValue !== null) ||
      !(fact.extractionMethod === null ||
        boundedString(fact.extractionMethod, 120))
    ) return null;
    return Object.freeze({
      factKey: fact.factKey,
      observedValue: fact.observedValue,
      extractionMethod: fact.extractionMethod as string | null,
    });
  });
  if (
    observedFacts.some((fact) => fact === null) ||
    new Set(observedFacts.map((fact) => fact?.factKey)).size !==
      observedFacts.length
  ) return null;
  return Object.freeze({
    replacementTargetRef: value.replacementTargetRef,
    candidateRef: value.candidateRef,
    fileName: value.fileName as string,
    contentFingerprint: typeof value.contentFingerprint === "string" &&
        /^[0-9a-f]{64}$/.test(value.contentFingerprint)
      ? value.contentFingerprint
      : null,
    parserObservation: Object.freeze({
      observedFacts: Object.freeze(
        observedFacts as Array<
          Readonly<{
            factKey: DocumentFactKey;
            observedValue: string | null;
            extractionMethod: string | null;
          }>
        >,
      ),
    }),
  });
}

export function customerCorrectionHandoffSafeError(
  code: CustomerCorrectionHandoffErrorCode,
): CustomerCorrectionHandoffSafeError {
  const message = code === "not_configured"
    ? "Dossieracties zijn lokaal nog niet geconfigureerd."
    : code === "inaccessible"
    ? "De dossieractie is niet beschikbaar voor dit account."
    : "De dossieractie kon tijdelijk niet worden geladen. Probeer het opnieuw.";
  return Object.freeze({ code, message });
}

export function decodeCustomerCorrectionHandoffResponse(
  value: unknown,
  expectedCaseRef: string,
): CustomerCorrectionHandoffResult {
  if (
    !CASE_REFERENCE_RE.test(expectedCaseRef) || !isRecord(value) ||
    !exactKeys(value, ["caseRef", "handoff", "schemaVersion"]) ||
    value.schemaVersion !== SCHEMA_VERSION || value.caseRef !== expectedCaseRef
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }

  if (value.handoff === null) {
    return {
      ok: true,
      model: Object.freeze({ caseRef: expectedCaseRef, handoff: null }),
    };
  }

  if (
    !isRecord(value.handoff) ||
    !exactKeys(value.handoff, [
      "currentReplacementCandidates",
      "handoffRef",
      "items",
      "publishedAt",
      "signerAuthority",
    ]) ||
    typeof value.handoff.handoffRef !== "string" ||
    !HANDOFF_REFERENCE_RE.test(value.handoff.handoffRef) ||
    typeof value.handoff.publishedAt !== "string" ||
    !TIMESTAMP_RE.test(value.handoff.publishedAt) ||
    !Number.isFinite(Date.parse(value.handoff.publishedAt)) ||
    !Array.isArray(value.handoff.items) || value.handoff.items.length < 1 ||
    !Array.isArray(value.handoff.currentReplacementCandidates) ||
    value.handoff.items.length > 100
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }

  const items = value.handoff.items.map(parseItem);
  const currentReplacementCandidates = value.handoff
    .currentReplacementCandidates.map(parseCurrentReplacementCandidate);
  const signerAuthority = parseSignerAuthority(value.handoff.signerAuthority);
  if (
    !signerAuthority || items.some((item) => !item) ||
    new Set(items.map((item) => item?.itemRef)).size !== items.length ||
    currentReplacementCandidates.some((candidate) => candidate === null) ||
    new Set(
        currentReplacementCandidates.map((candidate) =>
          candidate?.replacementTargetRef
        ),
      ).size !== currentReplacementCandidates.length
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }
  const parsedItems = items as CustomerCorrectionHandoffItem[];
  for (const candidate of currentReplacementCandidates) {
    if (!candidate) continue;
    const targetItems = parsedItems.filter((item) =>
      item.replacementTarget?.replacementTargetRef ===
        candidate.replacementTargetRef
    );
    if (
      targetItems.length < 1 ||
      candidate.parserObservation?.observedFacts.some((fact) =>
        !targetItems.some((item) => item.factKey === fact.factKey)
      )
    ) {
      return {
        ok: false,
        error: customerCorrectionHandoffSafeError("invalid_response"),
      };
    }
  }

  return {
    ok: true,
    model: Object.freeze({
      caseRef: expectedCaseRef,
      handoff: Object.freeze({
        items: Object.freeze(parsedItems),
        currentReplacementCandidates: Object.freeze(
          currentReplacementCandidates as CustomerCorrectionCurrentReplacementCandidate[],
        ),
        signerAuthority,
      }),
    }),
  };
}

export async function fetchCustomerCorrectionHandoff({
  accessToken,
  caseRef,
  fetchImpl = fetch,
  runtimeConfig,
}: CustomerCorrectionHandoffClientConfig): Promise<
  CustomerCorrectionHandoffResult
> {
  const runtime = runtimeConfig
    ? { ok: true as const, ...runtimeConfig }
    : resolvePublicApiRuntimeConfig();
  if (!runtime.ok) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("not_configured"),
    };
  }

  const bearerToken = accessToken.trim();
  const selectedCaseRef = caseRef.trim();
  if (
    !bearerToken || selectedCaseRef !== caseRef ||
    !CASE_REFERENCE_RE.test(selectedCaseRef)
  ) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `${runtime.apiBaseUrl}/api-app-customer-correction-handoff?caseRef=${
        encodeURIComponent(selectedCaseRef)
      }`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          apikey: runtime.anonKey,
        },
      },
    );
  } catch (_error) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("service_unavailable"),
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (_error) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError("invalid_response"),
      status: response.status,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: customerCorrectionHandoffSafeError(
        response.status === 401 || response.status === 404
          ? "inaccessible"
          : "service_unavailable",
      ),
      status: response.status,
    };
  }

  const decoded = decodeCustomerCorrectionHandoffResponse(
    body,
    selectedCaseRef,
  );
  return decoded.ok ? decoded : { ...decoded, status: response.status };
}

function customerCorrectionSigningError(
  code: CustomerCorrectionSigningErrorCode,
): CustomerCorrectionSigningError {
  const message = code === "not_configured"
    ? "Ondertekenen is lokaal nog niet beschikbaar."
    : code === "inaccessible"
    ? "De dossieractie is niet beschikbaar voor dit account."
    : code === "invalid_otp"
    ? "Controleer de eenmalige code."
    : code === "challenge_unavailable"
    ? "Vraag een nieuwe code aan."
    : code === "signer_name_mismatch"
    ? "De ingevoerde naam komt niet overeen met de verwachte ondertekenaar."
    : code === "signer_authority_unavailable"
    ? "Ondertekenen is niet beschikbaar voor dit account."
    : code === "stale_handoff"
    ? "Aanpassing is gewijzigd. Controleer opnieuw."
    : "Ondertekenen is tijdelijk niet beschikbaar. Probeer het opnieuw.";
  return Object.freeze({ code, message });
}

function signingErrorCode(
  status: number,
  body: unknown,
): CustomerCorrectionSigningErrorCode {
  const serverCode = isRecord(body) && typeof body.code === "string"
    ? body.code
    : "";
  if (status === 401 || status === 404) return "inaccessible";
  if (serverCode === "invalid_signing_code") return "invalid_otp";
  if (serverCode === "challenge_unavailable") return "challenge_unavailable";
  if (serverCode === "signer_name_mismatch") return "signer_name_mismatch";
  if (
    serverCode === "signer_authority_missing" ||
    serverCode === "signer_authority_ambiguous" ||
    serverCode === "signer_authority_unavailable" ||
    serverCode === "signer_authority_changed" ||
    serverCode === "signer_authority_binding_missing"
  ) return "signer_authority_unavailable";
  if (
    serverCode === "stale_correction_context" ||
    serverCode === "current_unanswered_handoff_missing" ||
    serverCode === "handoff_already_answered" ||
    serverCode === "response_set_mismatch"
  ) return "stale_handoff";
  return "service_unavailable";
}

function validSigningConfig(
  config: CustomerCorrectionSigningClientConfig,
): boolean {
  return config.accessToken === config.accessToken.trim() &&
    config.accessToken.length > 0 && config.caseRef === config.caseRef.trim() &&
    CASE_REFERENCE_RE.test(config.caseRef) &&
    config.idempotencyKey === config.idempotencyKey.trim() &&
    UUID_RE.test(config.idempotencyKey);
}

async function postCustomerCorrectionJson(
  config: CustomerCorrectionSigningClientConfig,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<
  | { ok: true; response: Response; body: unknown }
  | { ok: false; error: CustomerCorrectionSigningError; status?: number }
> {
  const runtime = config.runtimeConfig
    ? { ok: true as const, ...config.runtimeConfig }
    : resolvePublicApiRuntimeConfig();
  if (!runtime.ok) {
    return {
      ok: false,
      error: customerCorrectionSigningError("not_configured"),
    };
  }
  if (!validSigningConfig(config)) {
    return {
      ok: false,
      error: customerCorrectionSigningError("invalid_response"),
    };
  }
  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(
      `${runtime.apiBaseUrl}/${endpoint}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          apikey: runtime.anonKey,
          "Content-Type": "application/json",
          "Idempotency-Key": config.idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
    );
  } catch (_error) {
    return {
      ok: false,
      error: customerCorrectionSigningError("service_unavailable"),
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (_error) {
    return {
      ok: false,
      error: customerCorrectionSigningError("invalid_response"),
      status: response.status,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: customerCorrectionSigningError(
        signingErrorCode(response.status, body),
      ),
      status: response.status,
    };
  }
  return { ok: true, response, body };
}

function validLegalBundle(
  value: unknown,
): value is typeof CUSTOMER_CORRECTION_LEGAL_BUNDLE {
  return isRecord(value) &&
    exactKeys(value, ["bundleVersion", "statement", "title"]) &&
    value.bundleVersion === CUSTOMER_CORRECTION_LEGAL_BUNDLE.bundleVersion &&
    value.title === CUSTOMER_CORRECTION_LEGAL_BUNDLE.title &&
    value.statement === CUSTOMER_CORRECTION_LEGAL_BUNDLE.statement;
}

export async function requestCustomerCorrectionChallenge(
  config: CustomerCorrectionSigningClientConfig & {
    responses: readonly CustomerCorrectionResponse[];
    factResolutions: readonly CustomerCorrectionFactResolution[];
    typedFullName: string;
  },
): Promise<
  CustomerCorrectionSigningResult<CustomerCorrectionChallengeReceipt>
> {
  const response = await postCustomerCorrectionJson(
    config,
    "api-app-customer-correction-signing-challenge",
    {
      caseRef: config.caseRef,
      factResolutions: config.factResolutions,
      responses: config.responses,
      typedFullName: config.typedFullName,
    },
  );
  if (!response.ok) return response;
  const body = response.body;
  if (
    !isRecord(body) || body.ok !== true ||
    typeof body.challenge_reference !== "string" ||
    !UUID_RE.test(body.challenge_reference) ||
    typeof body.expires_at !== "string" ||
    !TIMESTAMP_RE.test(body.expires_at) ||
    !Number.isFinite(Date.parse(body.expires_at)) ||
    body.item_count !== config.responses.length ||
    !boundedString(body.delivery_target_masked, 240) ||
    !validLegalBundle(body.legal_bundle)
  ) {
    return {
      ok: false,
      error: customerCorrectionSigningError("invalid_response"),
      status: response.response.status,
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      challengeReference: body.challenge_reference,
      expiresAt: body.expires_at,
      deliveryTargetMasked: body.delivery_target_masked as string,
      legalBundle: CUSTOMER_CORRECTION_LEGAL_BUNDLE,
    }),
  };
}

export async function finalizeCustomerCorrection(
  config: CustomerCorrectionSigningClientConfig & {
    challengeReference: string;
    otp: string;
    typedFullName: string;
  },
): Promise<CustomerCorrectionSigningResult<Readonly<{ finalized: true }>>> {
  const response = await postCustomerCorrectionJson(
    config,
    "api-app-customer-correction-signing-finalize",
    {
      caseRef: config.caseRef,
      challengeReference: config.challengeReference,
      otp: config.otp,
      typedFullName: config.typedFullName,
    },
  );
  if (!response.ok) return response;
  if (
    !isRecord(response.body) || response.body.ok !== true ||
    !["finalized", "already_finalized"].includes(String(response.body.code))
  ) {
    return {
      ok: false,
      error: customerCorrectionSigningError("invalid_response"),
      status: response.response.status,
    };
  }
  return { ok: true, value: Object.freeze({ finalized: true as const }) };
}
