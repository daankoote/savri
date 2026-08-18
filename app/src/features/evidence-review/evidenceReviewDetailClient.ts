import type {
  EvidenceFactReviewCorrectionReason,
  EvidenceFactReviewCurrentRoundV1,
  EvidenceFactReviewFinalizedDecisionV1,
  EvidenceFactReviewSubjectV1,
  EvidenceReviewCanonicalFactV1,
  EvidenceReviewCaseDetailResponseV1,
  EvidenceReviewEvidenceV1,
  EvidenceReviewFactCategory,
  EvidenceReviewFactTruthClass,
  EvidenceReviewReason,
  EvidenceReviewStatus,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import {
  EVIDENCE_FACT_REVIEW_CORRECTION_REASONS,
  EVIDENCE_FACT_REVIEW_MANIFEST_VERSION,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import { normalizeSignedDownloadUrlForBrowser } from "../documents/documentDownloadClient.ts";
import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";
import { isEvidenceReviewCaseRef } from "./evidenceReviewRoutes.ts";

export type EvidenceReviewDetailErrorCode =
  | "invalid_case"
  | "not_configured"
  | "unauthorized"
  | "not_found_or_forbidden"
  | "service_unavailable"
  | "invalid_response";

export type EvidenceReviewDetailSafeError = Readonly<{
  code: EvidenceReviewDetailErrorCode;
  message: string;
}>;

export type EvidenceReviewDetailLoadResult =
  | Readonly<{ ok: true; value: EvidenceReviewCaseDetailResponseV1 }>
  | Readonly<{
    ok: false;
    error: EvidenceReviewDetailSafeError;
    status?: number;
  }>;

export type EvidenceReviewPreviewResult =
  | Readonly<{
    ok: true;
    blob: Blob;
    filename: string;
    expiresAt: string;
  }>
  | Readonly<
    { ok: false; error: EvidenceReviewDetailSafeError; status?: number }
  >;

type ClientRuntimeConfig = Readonly<{ anonKey: string; apiBaseUrl: string }>;
export type EvidenceReviewDetailClientConfig = Readonly<{
  accessToken: string;
  caseRef: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: ClientRuntimeConfig;
  signal?: AbortSignal;
}>;
type PreviewClientConfig =
  & EvidenceReviewDetailClientConfig
  & Readonly<{
    evidenceVersionRef: string;
  }>;
type JsonRecord = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FACT_CATEGORIES = new Set<EvidenceReviewFactCategory>([
  "PARTY_NAME",
  "ADDRESS",
  "EAN",
  "ENERGY_SUPPLIER",
  "CHARGER_BRAND",
  "CHARGER_MODEL",
  "MID",
  "SERIAL",
]);
const FACT_TRUTH_CLASSES = new Set<EvidenceReviewFactTruthClass>([
  "CUSTOMER_CONFIRMED",
  "REVIEW_REQUIRED",
]);
const REVIEW_STATUSES = new Set<EvidenceReviewStatus>([
  "PENDING",
  "ACCEPTED",
  "CORRECTION_REQUIRED",
]);
const REVIEW_REASONS = new Set<EvidenceReviewReason>([
  "GENERIC_REVIEW_REQUIRED",
  "USER_OVERRIDE",
  "USER_SUPPLIED_WITHOUT_DOCUMENT",
  "DOCUMENT_CONFLICT_RESOLVED",
  "PROBABLE_IDENTITY_MATCH",
  "PROBABLE_ADDRESS_MATCH",
]);
const REVIEW_FACT_KEYS = new Set([
  "partyName",
  "structuredAddress",
  "electricityEan",
  "energySupplier",
  "chargerBrand",
  "chargerModel",
  "midNumber",
  "serialNumber",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: JsonRecord, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length &&
    actual.every((field, index) => field === expected[index]);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value === value.trim() &&
    value.length > 0 && value.length <= maxLength;
}

function parseFact(value: unknown): EvidenceReviewCanonicalFactV1 | null {
  if (!isRecord(value)) return null;
  const truthClass = value.truthClass as EvidenceReviewFactTruthClass;
  const reviewReason = value.reviewReason as EvidenceReviewReason;
  const isHistoricalFallback = reviewReason === "GENERIC_REVIEW_REQUIRED";
  const fields = [
    "category",
    "truthClass",
    "value",
    ...(truthClass === "REVIEW_REQUIRED" ? ["reviewReason"] : []),
    ...(truthClass === "REVIEW_REQUIRED" && !isHistoricalFallback
      ? ["reviewReasonAuthority"]
      : []),
  ];
  if (
    !hasExactFields(value, fields) ||
    !FACT_CATEGORIES.has(value.category as EvidenceReviewFactCategory) ||
    !FACT_TRUTH_CLASSES.has(truthClass) ||
    !boundedString(value.value, 2_000) ||
    (truthClass === "REVIEW_REQUIRED" && !REVIEW_REASONS.has(reviewReason)) ||
    (truthClass === "REVIEW_REQUIRED" && !isHistoricalFallback &&
      value.reviewReasonAuthority !== "CUSTOMER_SIGNED_RESOLUTION")
  ) return null;
  return Object.freeze({
    category: value.category as EvidenceReviewFactCategory,
    value: value.value,
    truthClass,
    ...(truthClass === "REVIEW_REQUIRED"
      ? {
        reviewReason,
        ...(isHistoricalFallback
          ? {}
          : {
            reviewReasonAuthority:
              "CUSTOMER_SIGNED_RESOLUTION" as const,
          }),
      }
      : {}),
  });
}

function parseEvidence(value: unknown): EvidenceReviewEvidenceV1 | null {
  if (!isRecord(value)) return null;
  const hasDecision = "decidedAt" in value;
  const fields = [
    "canonicalFacts",
    "evidenceRef",
    "evidenceVersionRef",
    "integrityAvailable",
    "kind",
    "mime",
    "reviewStatus",
    "uploadedAt",
    ...(hasDecision ? ["decidedAt"] : []),
  ];
  if (
    !hasExactFields(value, fields) ||
    !UUID_RE.test(String(value.evidenceRef)) ||
    !UUID_RE.test(String(value.evidenceVersionRef)) ||
    !boundedString(value.kind, 100) || !boundedString(value.mime, 200) ||
    !isIsoTimestamp(value.uploadedAt) || value.integrityAvailable !== true ||
    !REVIEW_STATUSES.has(value.reviewStatus as EvidenceReviewStatus) ||
    !Array.isArray(value.canonicalFacts) || value.canonicalFacts.length > 100 ||
    (value.reviewStatus === "PENDING" && hasDecision) ||
    (value.reviewStatus !== "PENDING" && !isIsoTimestamp(value.decidedAt))
  ) return null;
  const facts = value.canonicalFacts.map(parseFact);
  if (facts.some((fact) => !fact)) return null;
  return Object.freeze({
    evidenceRef: String(value.evidenceRef),
    evidenceVersionRef: String(value.evidenceVersionRef),
    kind: value.kind,
    mime: value.mime,
    uploadedAt: value.uploadedAt,
    integrityAvailable: true,
    reviewStatus: value.reviewStatus as EvidenceReviewStatus,
    ...(hasDecision ? { decidedAt: value.decidedAt as string } : {}),
    canonicalFacts: Object.freeze(facts as EvidenceReviewCanonicalFactV1[]),
  });
}

function parseReviewSubject(value: unknown): EvidenceFactReviewSubjectV1 | null {
  if (
    !isRecord(value) ||
    !hasExactFields(value, [
      "evidenceKind",
      "evidenceVersionRef",
      "factCategory",
      "factKey",
      "factLabel",
      "required",
      "reviewerSuggestion",
      "scopeRef",
      "subjectKind",
      "subjectRef",
      "truthClass",
      "value",
      "valueStatus",
      ...(value.reviewReason === undefined ? [] : ["reviewReason"]),
      ...(value.reviewReasonAuthority === undefined
        ? []
        : ["reviewReasonAuthority"]),
    ])
  ) return null;
  const truthClass = value.truthClass as EvidenceReviewFactTruthClass;
  const valueStatus = String(value.valueStatus);
  const reviewReason = value.reviewReason;
  const reviewReasonAuthority = value.reviewReasonAuthority;
  if (
    typeof value.subjectRef !== "string" ||
    !/^FRS-[0-9a-f]{64}$/.test(value.subjectRef) ||
    value.subjectKind !== "FACT" ||
    typeof value.evidenceVersionRef !== "string" ||
    !UUID_RE.test(value.evidenceVersionRef) ||
    !boundedString(value.evidenceKind, 100) ||
    typeof value.factKey !== "string" || !REVIEW_FACT_KEYS.has(value.factKey) ||
    !FACT_CATEGORIES.has(value.factCategory as EvidenceReviewFactCategory) ||
    !boundedString(value.factLabel, 240) ||
    typeof value.scopeRef !== "string" ||
    !/^FRSCOPE-[0-9a-f]{64}$/.test(value.scopeRef) ||
    !["PRESENT", "REQUIRED_MISSING"].includes(valueStatus) ||
    typeof value.required !== "boolean" || !FACT_TRUTH_CLASSES.has(truthClass) ||
    !["ACCEPT", "NONE"].includes(String(value.reviewerSuggestion)) ||
    (valueStatus === "PRESENT" && !boundedString(value.value, 2_000)) ||
    (valueStatus === "REQUIRED_MISSING" &&
      (value.value !== null || value.required !== true))
  ) return null;
  if (
    truthClass === "CUSTOMER_CONFIRMED" &&
    (valueStatus !== "PRESENT" || value.reviewerSuggestion !== "ACCEPT" ||
      reviewReason !== undefined || reviewReasonAuthority !== undefined)
  ) return null;
  if (truthClass === "REVIEW_REQUIRED") {
    if (value.reviewerSuggestion !== "NONE") return null;
    if (valueStatus === "REQUIRED_MISSING") {
      if (
        reviewReason !== "REQUIRED_INFORMATION_MISSING" ||
        reviewReasonAuthority !== "SERVER_REQUIRED_SLOT"
      ) return null;
    } else {
      const historical = reviewReason === "GENERIC_REVIEW_REQUIRED";
      if (
        !REVIEW_REASONS.has(reviewReason as EvidenceReviewReason) ||
        (historical && reviewReasonAuthority !== undefined) ||
        (!historical &&
          reviewReasonAuthority !== "CUSTOMER_SIGNED_RESOLUTION")
      ) return null;
    }
  }
  return Object.freeze({
    subjectRef: value.subjectRef,
    subjectKind: "FACT",
    evidenceVersionRef: value.evidenceVersionRef,
    evidenceKind: value.evidenceKind,
    factKey: value.factKey,
    factCategory: value.factCategory as EvidenceReviewFactCategory,
    factLabel: value.factLabel,
    scopeRef: value.scopeRef,
    value: value.value as string | null,
    valueStatus: valueStatus as "PRESENT" | "REQUIRED_MISSING",
    required: value.required,
    truthClass,
    ...(truthClass === "REVIEW_REQUIRED"
      ? {
        reviewReason: reviewReason as
          | EvidenceReviewReason
          | "REQUIRED_INFORMATION_MISSING",
        ...(reviewReasonAuthority === undefined
          ? {}
          : {
            reviewReasonAuthority: reviewReasonAuthority as
              | "CUSTOMER_SIGNED_RESOLUTION"
              | "SERVER_REQUIRED_SLOT",
          }),
      }
      : {}),
    reviewerSuggestion: value.reviewerSuggestion as "ACCEPT" | "NONE",
  });
}

function parseCurrentReviewRound(
  value: unknown,
  manifestHash: string,
  subjectRefs: ReadonlySet<string>,
): EvidenceFactReviewCurrentRoundV1 | null | false {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !hasExactFields(value, [
      "decisions",
      "finalizedAt",
      "manifestHash",
      "manifestVersion",
      "outcome",
      "roundRef",
    ]) || !UUID_RE.test(String(value.roundRef)) ||
    value.manifestVersion !== EVIDENCE_FACT_REVIEW_MANIFEST_VERSION ||
    value.manifestHash !== manifestHash ||
    !["ALL_FACTS_ACCEPTED", "CORRECTIONS_REQUIRED"].includes(
      String(value.outcome),
    ) || !isIsoTimestamp(value.finalizedAt) ||
    !Array.isArray(value.decisions) || value.decisions.length !== subjectRefs.size
  ) return false;

  const decisions: EvidenceFactReviewFinalizedDecisionV1[] = [];
  const seen = new Set<string>();
  for (const rawDecision of value.decisions) {
    if (!isRecord(rawDecision)) return false;
    const subjectRef = String(rawDecision.subjectRef ?? "");
    const disposition = rawDecision.disposition;
    if (
      !/^FRS-[0-9a-f]{64}$/.test(subjectRef) ||
      !subjectRefs.has(subjectRef) || seen.has(subjectRef)
    ) return false;
    seen.add(subjectRef);
    if (disposition === "ACCEPTED") {
      if (!hasExactFields(rawDecision, ["disposition", "subjectRef"])) {
        return false;
      }
      decisions.push(Object.freeze({ subjectRef, disposition }));
      continue;
    }
    if (
      disposition !== "CORRECTION_REQUIRED" ||
      !hasExactFields(rawDecision, [
        "correctionInstruction",
        "correctionReason",
        "disposition",
        "subjectRef",
      ]) || !EVIDENCE_FACT_REVIEW_CORRECTION_REASONS.includes(
        rawDecision.correctionReason as never,
      ) || !boundedString(rawDecision.correctionInstruction, 1_000) ||
      !/[\p{L}\p{N}]/u.test(rawDecision.correctionInstruction)
    ) return false;
    decisions.push(Object.freeze({
      subjectRef,
      disposition,
      correctionReason:
        rawDecision.correctionReason as EvidenceFactReviewCorrectionReason,
      correctionInstruction: rawDecision.correctionInstruction,
    }));
  }
  const hasCorrection = decisions.some((decision) =>
    decision.disposition === "CORRECTION_REQUIRED"
  );
  if (
    seen.size !== subjectRefs.size ||
    (value.outcome === "ALL_FACTS_ACCEPTED" && hasCorrection) ||
    (value.outcome === "CORRECTIONS_REQUIRED" && !hasCorrection)
  ) return false;
  return Object.freeze({
    roundRef: String(value.roundRef),
    manifestVersion: EVIDENCE_FACT_REVIEW_MANIFEST_VERSION,
    manifestHash,
    outcome: value.outcome as
      | "ALL_FACTS_ACCEPTED"
      | "CORRECTIONS_REQUIRED",
    finalizedAt: value.finalizedAt,
    decisions: Object.freeze(decisions),
  });
}

export function decodeEvidenceReviewCaseDetailResponse(
  body: unknown,
): EvidenceReviewDetailLoadResult {
  if (
    !isRecord(body) ||
    !hasExactFields(body, [
      "asOf",
      "case",
      "currentReviewRound",
      "evidence",
      "reviewManifestHash",
      "reviewManifestVersion",
      "reviewSubjects",
      "schemaVersion",
    ]) ||
    body.schemaVersion !== "evidence-review-case-detail-v3" ||
    !isIsoTimestamp(body.asOf) || !isRecord(body.case) ||
    !Array.isArray(body.evidence) || body.evidence.length > 100 ||
    body.reviewManifestVersion !== EVIDENCE_FACT_REVIEW_MANIFEST_VERSION ||
    typeof body.reviewManifestHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.reviewManifestHash) ||
    !Array.isArray(body.reviewSubjects) || body.reviewSubjects.length > 100
  ) return invalidResponse();

  const caseFields = [
    "canDecide",
    "caseRef",
    "lifecycle",
    ...(body.case.partyDisplayName === undefined
      ? []
      : ["partyDisplayName", "partyDisplayNameTruth"]),
    ...(body.case.deliveryAddress === undefined
      ? []
      : ["deliveryAddress", "deliveryAddressTruth"]),
  ];
  if (
    !hasExactFields(body.case, caseFields) ||
    !boundedString(body.case.caseRef, 64) ||
    !isEvidenceReviewCaseRef(body.case.caseRef) ||
    !boundedString(body.case.lifecycle, 80) ||
    typeof body.case.canDecide !== "boolean" ||
    (body.case.partyDisplayName !== undefined &&
      (!boundedString(body.case.partyDisplayName, 500) ||
        body.case.partyDisplayNameTruth !== "DECLARED")) ||
    (body.case.deliveryAddress !== undefined &&
      (!boundedString(body.case.deliveryAddress, 500) ||
        body.case.deliveryAddressTruth !== "DECLARED"))
  ) return invalidResponse();

  const evidence = body.evidence.map(parseEvidence);
  if (
    evidence.some((item) => !item) ||
    new Set(evidence.map((item) => item?.evidenceVersionRef)).size !==
      evidence.length
  ) return invalidResponse();

  const reviewSubjects = body.reviewSubjects.map(parseReviewSubject);
  const evidenceVersionRefs = new Set(
    evidence.map((item) => item?.evidenceVersionRef),
  );
  if (
    reviewSubjects.length === 0 || reviewSubjects.some((subject) => !subject) ||
    new Set(reviewSubjects.map((subject) => subject?.subjectRef)).size !==
      reviewSubjects.length ||
    reviewSubjects.some((subject) =>
      !subject || !evidenceVersionRefs.has(subject.evidenceVersionRef)
    )
  ) return invalidResponse();

  const subjectRefs = new Set(
    reviewSubjects.flatMap((subject) => subject ? [subject.subjectRef] : []),
  );
  const currentReviewRound = parseCurrentReviewRound(
    body.currentReviewRound,
    body.reviewManifestHash,
    subjectRefs,
  );
  if (currentReviewRound === false) return invalidResponse();

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: "evidence-review-case-detail-v3",
      asOf: body.asOf,
      case: Object.freeze({
        caseRef: body.case.caseRef,
        lifecycle: body.case.lifecycle,
        canDecide: body.case.canDecide,
        ...(body.case.partyDisplayName === undefined ? {} : {
          partyDisplayName: body.case.partyDisplayName,
          partyDisplayNameTruth: "DECLARED" as const,
        }),
        ...(body.case.deliveryAddress === undefined ? {} : {
          deliveryAddress: body.case.deliveryAddress,
          deliveryAddressTruth: "DECLARED" as const,
        }),
      }),
      evidence: Object.freeze(evidence as EvidenceReviewEvidenceV1[]),
      reviewManifestVersion: EVIDENCE_FACT_REVIEW_MANIFEST_VERSION,
      reviewManifestHash: body.reviewManifestHash,
      reviewSubjects: Object.freeze(
        reviewSubjects as EvidenceFactReviewSubjectV1[],
      ),
      currentReviewRound,
    }),
  };
}

function safeError(
  code: EvidenceReviewDetailErrorCode,
): EvidenceReviewDetailSafeError {
  const messages: Record<EvidenceReviewDetailErrorCode, string> = {
    invalid_case: "De dossierroute is ongeldig.",
    invalid_response:
      "Het dossier kon niet veilig worden gelezen. Probeer het opnieuw.",
    not_configured:
      "De dossierdetailweergave is lokaal nog niet geconfigureerd.",
    not_found_or_forbidden:
      "Dit dossier is niet beschikbaar binnen uw toegewezen dossierscope.",
    service_unavailable:
      "Het dossier is tijdelijk niet beschikbaar. Probeer het opnieuw.",
    unauthorized: "Log opnieuw in om dit dossier te bekijken.",
  };
  return Object.freeze({ code, message: messages[code] });
}

function invalidResponse(): EvidenceReviewDetailLoadResult {
  return { ok: false, error: safeError("invalid_response") };
}

function errorForStatus(status: number): EvidenceReviewDetailSafeError {
  if (status === 401) return safeError("unauthorized");
  if (status === 400) return safeError("invalid_case");
  if (status === 403 || status === 404) {
    return safeError("not_found_or_forbidden");
  }
  return safeError("service_unavailable");
}

function runtimeConfig(
  config?: ClientRuntimeConfig,
): ClientRuntimeConfig | null {
  if (config) return config;
  const resolved = resolvePublicApiRuntimeConfig();
  return resolved.ok ? resolved : null;
}

async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

export async function loadEvidenceReviewCaseDetail(
  config: EvidenceReviewDetailClientConfig,
): Promise<EvidenceReviewDetailLoadResult> {
  const accessToken = config.accessToken.trim();
  const caseRef = config.caseRef.trim();
  if (!accessToken) return { ok: false, error: safeError("unauthorized") };
  if (!isEvidenceReviewCaseRef(caseRef)) {
    return { ok: false, error: safeError("invalid_case") };
  }
  const runtime = runtimeConfig(config.runtimeConfig);
  if (!runtime) return { ok: false, error: safeError("not_configured") };

  let response: Response;
  try {
    const query = new URLSearchParams({ caseRef });
    response = await (config.fetchImpl ?? fetch)(
      `${runtime.apiBaseUrl}/api-app-evidence-review-case-detail?${query}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: runtime.anonKey,
        },
        signal: config.signal,
      },
    );
  } catch (_error) {
    return { ok: false, error: safeError("service_unavailable") };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: errorForStatus(response.status),
      status: response.status,
    };
  }
  const body = await readJson(response);
  const decoded = decodeEvidenceReviewCaseDetailResponse(body);
  if (!decoded.ok) return decoded;
  if (decoded.value.case.caseRef.toUpperCase() !== caseRef.toUpperCase()) {
    return invalidResponse();
  }
  return decoded;
}

export async function loadEvidenceReviewPreview(
  config: PreviewClientConfig,
): Promise<EvidenceReviewPreviewResult> {
  const accessToken = config.accessToken.trim();
  const caseRef = config.caseRef.trim();
  const evidenceVersionRef = config.evidenceVersionRef.trim().toLowerCase();
  if (!accessToken) return { ok: false, error: safeError("unauthorized") };
  if (!isEvidenceReviewCaseRef(caseRef) || !UUID_RE.test(evidenceVersionRef)) {
    return { ok: false, error: safeError("invalid_case") };
  }
  const runtime = runtimeConfig(config.runtimeConfig);
  if (!runtime) return { ok: false, error: safeError("not_configured") };

  let response: Response;
  try {
    const query = new URLSearchParams({ caseRef, evidenceVersionRef });
    response = await (config.fetchImpl ?? fetch)(
      `${runtime.apiBaseUrl}/api-app-evidence-review-preview?${query}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: runtime.anonKey,
        },
        signal: config.signal,
      },
    );
  } catch (_error) {
    return { ok: false, error: safeError("service_unavailable") };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: errorForStatus(response.status),
      status: response.status,
    };
  }
  const body = await readJson(response);
  if (
    !isRecord(body) ||
    !hasExactFields(body, [
      "evidenceVersionRef",
      "expiresAt",
      "filename",
      "mimeType",
      "schemaVersion",
      "signedUrl",
    ]) ||
    body.schemaVersion !== "evidence-review-preview-v1" ||
    body.evidenceVersionRef !== evidenceVersionRef ||
    !boundedString(body.filename, 180) || body.filename.includes("/") ||
    body.filename.includes("\\") || body.filename.includes("..") ||
    body.mimeType !== "application/pdf" ||
    !boundedString(body.signedUrl, 8_192) ||
    !isIsoTimestamp(body.expiresAt)
  ) return { ok: false, error: safeError("invalid_response") };

  let signedUrl: URL;
  try {
    signedUrl = new URL(body.signedUrl);
  } catch (_error) {
    return { ok: false, error: safeError("invalid_response") };
  }
  if (signedUrl.protocol !== "http:" && signedUrl.protocol !== "https:") {
    return { ok: false, error: safeError("invalid_response") };
  }
  const browserUrl = normalizeSignedDownloadUrlForBrowser(
    signedUrl.toString(),
    new URL(runtime.apiBaseUrl).origin,
  );
  let documentResponse: Response;
  try {
    documentResponse = await (config.fetchImpl ?? fetch)(browserUrl, {
      method: "GET",
      cache: "no-store",
      signal: config.signal,
    });
  } catch (_error) {
    return { ok: false, error: safeError("service_unavailable") };
  }
  const contentType = documentResponse.headers.get("content-type")
    ?.split(";", 1)[0].trim().toLowerCase();
  if (!documentResponse.ok || contentType !== "application/pdf") {
    return { ok: false, error: safeError("invalid_response") };
  }
  let blob: Blob;
  try {
    blob = await documentResponse.blob();
  } catch (_error) {
    return { ok: false, error: safeError("invalid_response") };
  }
  if (blob.size === 0 || blob.type.toLowerCase() !== "application/pdf") {
    return { ok: false, error: safeError("invalid_response") };
  }
  return {
    ok: true,
    blob,
    filename: body.filename,
    expiresAt: body.expiresAt,
  };
}
