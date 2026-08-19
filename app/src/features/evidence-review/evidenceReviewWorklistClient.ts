import type {
  EvidenceReviewAttentionReason,
  EvidenceReviewWorklistCaseV2,
  EvidenceReviewWorklistResponseV2,
} from "../../../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";

export type EvidenceReviewWorklistErrorCode =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "service_unavailable"
  | "invalid_response";

export type EvidenceReviewWorklistSafeError = Readonly<{
  code: EvidenceReviewWorklistErrorCode;
  message: string;
}>;

export type EvidenceReviewWorklistLoadResult =
  | Readonly<{ ok: true; value: EvidenceReviewWorklistResponseV2 }>
  | Readonly<{
    ok: false;
    error: EvidenceReviewWorklistSafeError;
    status?: number;
  }>;

type EvidenceReviewWorklistClientConfig = Readonly<{
  accessToken: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: Readonly<{ anonKey: string; apiBaseUrl: string }>;
  signal?: AbortSignal;
}>;

type JsonRecord = Record<string, unknown>;

const RESPONSE_FIELDS = Object.freeze([
  "asOf",
  "caseCount",
  "cases",
  "schemaVersion",
]);
const CASE_FIELDS = Object.freeze([
  "caseRef",
  "latestReviewActivityAt",
  "lifecycleState",
  "queueState",
  "reviewAttentionReasons",
  "unresolvedFactCount",
]);
const ATTENTION_REASONS = new Set<EvidenceReviewAttentionReason>([
  "FACT_REVIEW_REQUIRED",
  "REVIEW_MODEL_UNAVAILABLE",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: JsonRecord, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === fields.length &&
    actual.every((field, index) => field === fields[index]);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function parseCase(value: unknown): EvidenceReviewWorklistCaseV2 | null {
  if (!isRecord(value) || !hasExactFields(value, CASE_FIELDS)) return null;
  if (
    typeof value.caseRef !== "string" ||
    value.caseRef !== value.caseRef.trim() ||
    value.caseRef.length < 8 || value.caseRef.length > 64 ||
    value.lifecycleState !== "submitted_for_review" ||
    !["ACTIVE_REVIEW", "REVIEW_MODEL_UNAVAILABLE"].includes(
      value.queueState as string,
    ) ||
    !Number.isInteger(value.unresolvedFactCount) ||
    Number(value.unresolvedFactCount) < 0 ||
    !isIsoTimestamp(value.latestReviewActivityAt) ||
    !Array.isArray(value.reviewAttentionReasons) ||
    value.reviewAttentionReasons.length !== 1 ||
    !value.reviewAttentionReasons.every((reason) =>
      ATTENTION_REASONS.has(reason as EvidenceReviewAttentionReason)
    ) ||
    (value.queueState === "ACTIVE_REVIEW" &&
      (Number(value.unresolvedFactCount) < 1 ||
        value.reviewAttentionReasons[0] !== "FACT_REVIEW_REQUIRED")) ||
    (value.queueState === "REVIEW_MODEL_UNAVAILABLE" &&
      (Number(value.unresolvedFactCount) !== 0 ||
        value.reviewAttentionReasons[0] !== "REVIEW_MODEL_UNAVAILABLE"))
  ) return null;

  return Object.freeze({
    caseRef: value.caseRef,
    lifecycleState: "submitted_for_review",
    queueState: value.queueState as
      | "ACTIVE_REVIEW"
      | "REVIEW_MODEL_UNAVAILABLE",
    unresolvedFactCount: Number(value.unresolvedFactCount),
    reviewAttentionReasons: Object.freeze(
      [...value.reviewAttentionReasons] as EvidenceReviewAttentionReason[],
    ),
    latestReviewActivityAt: value.latestReviewActivityAt,
  });
}

function safeError(
  code: EvidenceReviewWorklistErrorCode,
): EvidenceReviewWorklistSafeError {
  const messages: Record<EvidenceReviewWorklistErrorCode, string> = {
    forbidden: "U heeft geen toegang tot de dossierwerklijst.",
    invalid_response:
      "De dossierwerklijst kon niet veilig worden gelezen. Probeer het opnieuw.",
    not_configured: "De dossierwerklijst is lokaal nog niet geconfigureerd.",
    service_unavailable:
      "De dossierwerklijst is tijdelijk niet beschikbaar. Probeer het opnieuw.",
    unauthorized: "Log opnieuw in om de dossierwerklijst te bekijken.",
  };
  return Object.freeze({ code, message: messages[code] });
}

export function decodeEvidenceReviewWorklistResponse(
  body: unknown,
): EvidenceReviewWorklistLoadResult {
  if (!isRecord(body) || !hasExactFields(body, RESPONSE_FIELDS)) {
    return { ok: false, error: safeError("invalid_response") };
  }
  if (
    body.schemaVersion !== "evidence-review-worklist-v2" ||
    !isIsoTimestamp(body.asOf) || !Number.isInteger(body.caseCount) ||
    Number(body.caseCount) < 0 || !Array.isArray(body.cases) ||
    Number(body.caseCount) !== body.cases.length
  ) return { ok: false, error: safeError("invalid_response") };

  const cases = body.cases.map(parseCase);
  if (
    cases.some((item) => !item) ||
    new Set(cases.map((item) => item?.caseRef)).size !== cases.length
  ) return { ok: false, error: safeError("invalid_response") };

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: "evidence-review-worklist-v2",
      asOf: body.asOf,
      caseCount: Number(body.caseCount),
      cases: Object.freeze(cases as EvidenceReviewWorklistCaseV2[]),
    }),
  };
}

function errorForStatus(status: number): EvidenceReviewWorklistSafeError {
  if (status === 401) return safeError("unauthorized");
  if (status === 403) return safeError("forbidden");
  return safeError("service_unavailable");
}

export async function loadEvidenceReviewWorklist(
  config: EvidenceReviewWorklistClientConfig,
): Promise<EvidenceReviewWorklistLoadResult> {
  const accessToken = config.accessToken.trim();
  if (!accessToken) return { ok: false, error: safeError("unauthorized") };
  let runtime = config.runtimeConfig;
  if (!runtime) {
    const resolved = resolvePublicApiRuntimeConfig();
    if (!resolved.ok) return { ok: false, error: safeError("not_configured") };
    runtime = resolved;
  }

  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(
      `${runtime.apiBaseUrl}/api-app-evidence-review-worklist`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: runtime.anonKey,
        },
        signal: config.signal,
      },
    );
  } catch {
    return { ok: false, error: safeError("service_unavailable") };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: errorForStatus(response.status),
      status: response.status,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: safeError("invalid_response") };
  }
  return decodeEvidenceReviewWorklistResponse(body);
}
