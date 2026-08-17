import type {
  ComplianceWorklistResponseV1,
  SafeComplianceWorklistItemV1,
} from "../../../../supabase/functions/_shared/app_compliance_worklist.ts";
import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";

export const COMPLIANCE_WORKLIST_DELIVERY_YEAR = 2026 as const;

export type ComplianceWorklistErrorCode =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "unsupported_delivery_year"
  | "service_unavailable"
  | "invalid_response";

export type ComplianceWorklistSafeError = Readonly<{
  code: ComplianceWorklistErrorCode;
  message: string;
}>;

export type ComplianceWorklistLoadResult =
  | Readonly<{ ok: true; value: ComplianceWorklistResponseV1 }>
  | Readonly<{
    ok: false;
    error: ComplianceWorklistSafeError;
    status?: number;
  }>;

type ComplianceWorklistClientConfig = Readonly<{
  accessToken: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: Readonly<{ anonKey: string; apiBaseUrl: string }>;
  signal?: AbortSignal;
}>;

type JsonRecord = Record<string, unknown>;

const RESPONSE_FIELDS = Object.freeze([
  "activeAttention",
  "asOf",
  "calendarVersion",
  "deliveryYear",
  "evidenceStatus",
  "milestones",
  "schemaVersion",
  "sourceEventCount",
]);
const ITEM_FIELDS = Object.freeze([
  "actionKind",
  "boundary",
  "boundarySemantics",
  "classification",
  "coordinationMode",
  "deliveryYear",
  "obligationKind",
  "responsibleActor",
  "schemaVersion",
  "scope",
  "temporalStatus",
]);
const ACTION_KINDS = new Set([
  "INBOOKING_CUTOFF_ATTENTION",
  "STATEMENT_POSSESSION_ATTENTION",
  "STATEMENT_SUBMISSION_ATTENTION",
  "VERIFIER_REV_REGISTRATION_ATTENTION",
  "FINDINGS_REPORT_ATTENTION",
  "YEAR_END_OPERATIONAL_ATTENTION",
]);
const OBLIGATION_KINDS = new Set([
  "INBOOKING_CUTOFF",
  "STATEMENT_POSSESSION",
  "STATEMENT_SUBMISSION",
  "VERIFIER_REV_REGISTRATION",
  "FINDINGS_REPORT",
  "YEAR_END_BOUNDARY",
]);
const RESPONSIBLE_ACTORS = new Set(["INBOEKER", "VERIFIER", "SYSTEM_CALENDAR"]);
const COORDINATION_MODES = new Set([
  "DIRECT_INBOEKER_OPERATION",
  "VERIFIER_COORDINATION",
  "OPERATIONAL_MILESTONE",
  "INTERNAL_COMPLIANCE_ATTENTION",
]);
const TEMPORAL_STATUSES = new Set(["UPCOMING", "DUE", "OVERDUE", "BLOCKED", "REACHED"]);
const BOUNDARY_SEMANTICS = new Set([
  "INCLUSIVE_CUTOFF",
  "EXCLUSIVE_BEFORE",
  "CALENDAR_BOUNDARY",
  "IMMEDIATE_ATTENTION",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: JsonRecord, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === fields.length &&
    actual.every((field, index) => field === fields[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function classificationFor(actionKind: unknown): SafeComplianceWorklistItemV1["classification"] | null {
  if (actionKind === "YEAR_END_OPERATIONAL_ATTENTION") return "INFORMATIONAL_MILESTONE";
  return ACTION_KINDS.has(String(actionKind)) ? "ACTIVE_ATTENTION" : null;
}

function parseItem(
  value: unknown,
  deliveryYear: number,
): SafeComplianceWorklistItemV1 | null {
  if (!isRecord(value) || !hasExactFields(value, ITEM_FIELDS)) return null;
  const classification = classificationFor(value.actionKind);
  if (
    value.schemaVersion !== "compliance-worklist-item-v1" ||
    value.scope !== "DELIVERY_YEAR_TENANT_SCOPED" ||
    value.deliveryYear !== deliveryYear ||
    !classification || value.classification !== classification ||
    !OBLIGATION_KINDS.has(String(value.obligationKind)) ||
    !RESPONSIBLE_ACTORS.has(String(value.responsibleActor)) ||
    !COORDINATION_MODES.has(String(value.coordinationMode)) ||
    !TEMPORAL_STATUSES.has(String(value.temporalStatus)) ||
    !BOUNDARY_SEMANTICS.has(String(value.boundarySemantics)) ||
    !(value.boundary === null || isNonEmptyString(value.boundary))
  ) return null;
  return value as SafeComplianceWorklistItemV1;
}

function parseItems(
  value: unknown,
  deliveryYear: number,
  classification: SafeComplianceWorklistItemV1["classification"],
): readonly SafeComplianceWorklistItemV1[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((item) => parseItem(item, deliveryYear));
  if (parsed.some((item) => !item || item.classification !== classification)) return null;
  return parsed as readonly SafeComplianceWorklistItemV1[];
}

function safeError(code: ComplianceWorklistErrorCode): ComplianceWorklistSafeError {
  const messages: Record<ComplianceWorklistErrorCode, string> = {
    forbidden: "U heeft geen toegang tot de compliancewerklijst.",
    invalid_response: "De compliancewerklijst kon niet veilig worden gelezen. Probeer het opnieuw.",
    not_configured: "De compliancewerklijst is lokaal nog niet geconfigureerd.",
    service_unavailable: "De compliancewerklijst is tijdelijk niet beschikbaar. Probeer het opnieuw.",
    unauthorized: "Log opnieuw in om de compliancewerklijst te bekijken.",
    unsupported_delivery_year: "Dit leveringsjaar wordt niet ondersteund.",
  };
  return Object.freeze({ code, message: messages[code] });
}

export function decodeComplianceWorklistResponse(body: unknown): ComplianceWorklistLoadResult {
  if (!isRecord(body) || !hasExactFields(body, RESPONSE_FIELDS)) {
    return { ok: false, error: safeError("invalid_response") };
  }
  if (
    body.schemaVersion !== "compliance-worklist-response-v1" ||
    body.deliveryYear !== COMPLIANCE_WORKLIST_DELIVERY_YEAR ||
    !isNonEmptyString(body.asOf) || !isNonEmptyString(body.calendarVersion) ||
    !Number.isInteger(body.sourceEventCount) || Number(body.sourceEventCount) < 0 ||
    (body.evidenceStatus !== "NO_ACCEPTED_SOURCE_FACTS_RECORDED" &&
      body.evidenceStatus !== "ACCEPTED_SOURCE_FACTS_REPLAYED")
  ) return { ok: false, error: safeError("invalid_response") };

  const activeAttention = parseItems(
    body.activeAttention,
    COMPLIANCE_WORKLIST_DELIVERY_YEAR,
    "ACTIVE_ATTENTION",
  );
  const milestones = parseItems(
    body.milestones,
    COMPLIANCE_WORKLIST_DELIVERY_YEAR,
    "INFORMATIONAL_MILESTONE",
  );
  if (!activeAttention || !milestones) {
    return { ok: false, error: safeError("invalid_response") };
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: "compliance-worklist-response-v1",
      deliveryYear: COMPLIANCE_WORKLIST_DELIVERY_YEAR,
      asOf: body.asOf,
      calendarVersion: body.calendarVersion,
      sourceEventCount: Number(body.sourceEventCount),
      evidenceStatus: body.evidenceStatus,
      activeAttention: Object.freeze(activeAttention),
      milestones: Object.freeze(milestones),
    }),
  };
}

function errorForStatus(status: number): ComplianceWorklistSafeError {
  if (status === 401) return safeError("unauthorized");
  if (status === 403) return safeError("forbidden");
  if (status === 422) return safeError("unsupported_delivery_year");
  return safeError("service_unavailable");
}

export async function loadComplianceWorklist(
  config: ComplianceWorklistClientConfig,
): Promise<ComplianceWorklistLoadResult> {
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
      `${runtime.apiBaseUrl}/api-app-compliance-worklist?deliveryYear=${COMPLIANCE_WORKLIST_DELIVERY_YEAR}`,
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
    return { ok: false, error: errorForStatus(response.status), status: response.status };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: safeError("invalid_response") };
  }
  return decodeComplianceWorklistResponse(body);
}
