import type {
  EvidenceReviewCanonicalFactV1,
  EvidenceReviewCaseDetailResponseV1,
  EvidenceReviewEvidenceV1,
  EvidenceReviewFactCategory,
  EvidenceReviewFactTruthClass,
  EvidenceReviewStatus,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import {
  normalizeSignedDownloadUrlForBrowser,
  openBrowserUrlInNewTab,
} from "../documents/documentDownloadClient.ts";
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
  | Readonly<{ ok: true; opened: true; filename: string; expiresAt: string }>
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
    openUrl?: (url: string) => void;
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
  if (
    !isRecord(value) ||
    !hasExactFields(value, ["category", "truthClass", "value"]) ||
    !FACT_CATEGORIES.has(value.category as EvidenceReviewFactCategory) ||
    !FACT_TRUTH_CLASSES.has(value.truthClass as EvidenceReviewFactTruthClass) ||
    !boundedString(value.value, 2_000)
  ) return null;
  return Object.freeze({
    category: value.category as EvidenceReviewFactCategory,
    value: value.value,
    truthClass: value.truthClass as EvidenceReviewFactTruthClass,
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

export function decodeEvidenceReviewCaseDetailResponse(
  body: unknown,
): EvidenceReviewDetailLoadResult {
  if (
    !isRecord(body) ||
    !hasExactFields(body, ["asOf", "case", "evidence", "schemaVersion"]) ||
    body.schemaVersion !== "evidence-review-case-detail-v1" ||
    !isIsoTimestamp(body.asOf) || !isRecord(body.case) ||
    !Array.isArray(body.evidence) || body.evidence.length > 100
  ) return invalidResponse();

  const caseFields = [
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

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: "evidence-review-case-detail-v1",
      asOf: body.asOf,
      case: Object.freeze({
        caseRef: body.case.caseRef,
        lifecycle: body.case.lifecycle,
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

export async function openEvidenceReviewPreview(
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
  (config.openUrl ?? openBrowserUrlInNewTab)(browserUrl);
  return {
    ok: true,
    opened: true,
    filename: body.filename,
    expiresAt: body.expiresAt,
  };
}
