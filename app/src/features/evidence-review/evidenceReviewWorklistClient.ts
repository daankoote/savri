import type {
  EvidenceReviewAttentionReason,
  EvidenceReviewWorklistCaseV1,
  EvidenceReviewWorklistResponseV1,
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
  | Readonly<{ ok: true; value: EvidenceReviewWorklistResponseV1 }>
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
  "attentionReasons",
  "caseRef",
  "evidenceRefs",
  "latestReviewActivityAt",
  "lifecycleState",
  "unresolvedEvidenceCount",
]);
const ATTENTION_REASONS = new Set<EvidenceReviewAttentionReason>([
  "UNREVIEWED_EVIDENCE",
  "CORRECTION_REQUIRED",
  "NEW_EVIDENCE_VERSION_AFTER_REVIEW",
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

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function parseCase(value: unknown): EvidenceReviewWorklistCaseV1 | null {
  if (!isRecord(value) || !hasExactFields(value, CASE_FIELDS)) return null;
  if (
    typeof value.caseRef !== "string" || value.caseRef !== value.caseRef.trim() ||
    value.caseRef.length < 8 || value.caseRef.length > 64 ||
    value.lifecycleState !== "submitted_for_review" ||
    !Number.isInteger(value.unresolvedEvidenceCount) ||
    Number(value.unresolvedEvidenceCount) < 1 ||
    !isIsoTimestamp(value.latestReviewActivityAt) ||
    !Array.isArray(value.attentionReasons) ||
    value.attentionReasons.length === 0 ||
    !value.attentionReasons.every((reason) =>
      ATTENTION_REASONS.has(reason as EvidenceReviewAttentionReason)
    ) ||
    new Set(value.attentionReasons).size !== value.attentionReasons.length ||
    !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0 ||
    !value.evidenceRefs.every(isUuid) ||
    new Set(value.evidenceRefs).size !== value.evidenceRefs.length
  ) return null;

  return Object.freeze({
    caseRef: value.caseRef,
    lifecycleState: "submitted_for_review",
    unresolvedEvidenceCount: Number(value.unresolvedEvidenceCount),
    attentionReasons: Object.freeze(
      [...value.attentionReasons] as EvidenceReviewAttentionReason[],
    ),
    evidenceRefs: Object.freeze([...value.evidenceRefs] as string[]),
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
    body.schemaVersion !== "evidence-review-worklist-v1" ||
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
      schemaVersion: "evidence-review-worklist-v1",
      asOf: body.asOf,
      caseCount: Number(body.caseCount),
      cases: Object.freeze(cases as EvidenceReviewWorklistCaseV1[]),
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
