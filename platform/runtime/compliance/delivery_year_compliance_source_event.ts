import {
  DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION,
  type DeliveryYearComplianceEventV1,
} from "./delivery_year_compliance.ts";

export const DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_CONTRACT_VERSION =
  "delivery-year-compliance-source-event-v1" as const;

export const DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_KINDS = Object.freeze([
  "INBOOKING_COMPLETED",
  "VERIFICATION_STATEMENT_POSSESSED",
  "FINDINGS_REPORT_RECEIVED",
  "STATEMENT_SUBMITTED_TO_NEA",
  "VERIFICATION_RESULT_REGISTERED_IN_REV",
] as const);

type SourceEventKind =
  typeof DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_KINDS[number];

export type PersistedDeliveryYearComplianceSourceEventV1 = Readonly<{
  source_contract_version:
    typeof DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_CONTRACT_VERSION;
  event_schema_version: typeof DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION;
  event_id: string;
  delivery_year: number;
  event_kind: SourceEventKind;
  occurred_at: string;
  regulated_actor_kind: "INBOEKER" | "VERIFIER";
  recorded_at: string;
  recorder_kind: "SYSTEM" | "WORKFORCE";
  recorder_reference: string;
  provenance_kind:
    | "REV_INBOOKING_COMPLETION"
    | "VERIFIER_STATEMENT_ARTIFACT"
    | "VERIFIER_FINDINGS_ARTIFACT"
    | "NEA_SUBMISSION_CONFIRMATION"
    | "VERIFIER_REV_REGISTRATION_CONFIRMATION";
  evidence_reference: string;
  evidence_sha256: string;
  evidence_version_id: string | null;
  verification_result_reference: string | null;
  statement_reference: string | null;
  findings_report_reference: string | null;
}>;

export type SourceEventMappingFailureCode =
  | "invalid_source_event_shape"
  | "unknown_source_event_field"
  | "unsupported_source_contract_version"
  | "unsupported_reg02_event_version"
  | "unknown_source_event_kind"
  | "invalid_source_event_value"
  | "invalid_source_event_provenance"
  | "invalid_source_event_actor"
  | "invalid_source_event_reference_shape";

export type SourceEventMappingResult =
  | Readonly<{ ok: true; value: DeliveryYearComplianceEventV1 }>
  | Readonly<{ ok: false; code: SourceEventMappingFailureCode }>;

const SOURCE_KEYS = Object.freeze([
  "delivery_year",
  "event_id",
  "event_kind",
  "event_schema_version",
  "evidence_reference",
  "evidence_sha256",
  "evidence_version_id",
  "findings_report_reference",
  "occurred_at",
  "provenance_kind",
  "recorded_at",
  "recorder_kind",
  "recorder_reference",
  "regulated_actor_kind",
  "source_contract_version",
  "statement_reference",
  "verification_result_reference",
]);
const EVENT_KINDS = new Set<string>(
  DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_KINDS,
);
const REFERENCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).sort().join("|") ===
    [...SOURCE_KEYS].sort().join("|");
}

function isReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

function isNullableReference(value: unknown): value is string | null {
  return value === null || isReference(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value));
}

function commonValuesAreValid(value: Record<string, unknown>): boolean {
  return Number.isInteger(value.delivery_year) &&
    Number(value.delivery_year) >= 2000 && Number(value.delivery_year) <= 9999 &&
    isReference(value.event_id) && isInstant(value.occurred_at) &&
    isInstant(value.recorded_at) &&
    Date.parse(String(value.recorded_at)) >= Date.parse(String(value.occurred_at)) &&
    (value.recorder_kind === "SYSTEM" || value.recorder_kind === "WORKFORCE") &&
    isReference(value.recorder_reference) &&
    isReference(value.evidence_reference) &&
    typeof value.evidence_sha256 === "string" &&
    HASH_PATTERN.test(value.evidence_sha256) &&
    (value.evidence_version_id === null ||
      (typeof value.evidence_version_id === "string" &&
        UUID_PATTERN.test(value.evidence_version_id))) &&
    isNullableReference(value.verification_result_reference) &&
    isNullableReference(value.statement_reference) &&
    isNullableReference(value.findings_report_reference);
}

function actorAndProvenanceAreValid(value: Record<string, unknown>): boolean {
  switch (value.event_kind) {
    case "INBOOKING_COMPLETED":
      return value.regulated_actor_kind === "INBOEKER" &&
        value.provenance_kind === "REV_INBOOKING_COMPLETION";
    case "VERIFICATION_STATEMENT_POSSESSED":
      return value.regulated_actor_kind === "INBOEKER" &&
        value.provenance_kind === "VERIFIER_STATEMENT_ARTIFACT";
    case "FINDINGS_REPORT_RECEIVED":
      return value.regulated_actor_kind === "INBOEKER" &&
        value.provenance_kind === "VERIFIER_FINDINGS_ARTIFACT";
    case "STATEMENT_SUBMITTED_TO_NEA":
      return value.regulated_actor_kind === "INBOEKER" &&
        value.provenance_kind === "NEA_SUBMISSION_CONFIRMATION";
    case "VERIFICATION_RESULT_REGISTERED_IN_REV":
      return value.regulated_actor_kind === "VERIFIER" &&
        value.provenance_kind ===
          "VERIFIER_REV_REGISTRATION_CONFIRMATION";
    default:
      return false;
  }
}

function referencesMatchKind(value: Record<string, unknown>): boolean {
  switch (value.event_kind) {
    case "INBOOKING_COMPLETED":
      return value.verification_result_reference === null &&
        value.statement_reference === null &&
        value.findings_report_reference === null;
    case "VERIFICATION_STATEMENT_POSSESSED":
      return isReference(value.verification_result_reference) &&
        isReference(value.statement_reference) &&
        value.findings_report_reference === null;
    case "FINDINGS_REPORT_RECEIVED":
      return isReference(value.verification_result_reference) &&
        value.statement_reference === null &&
        isReference(value.findings_report_reference);
    case "STATEMENT_SUBMITTED_TO_NEA":
      return value.verification_result_reference === null &&
        isReference(value.statement_reference) &&
        value.findings_report_reference === null;
    case "VERIFICATION_RESULT_REGISTERED_IN_REV":
      return isReference(value.verification_result_reference) &&
        value.statement_reference === null &&
        value.findings_report_reference === null;
    default:
      return false;
  }
}

export function mapComplianceSourceEventToReg02(
  input: unknown,
): SourceEventMappingResult {
  if (!isRecord(input)) {
    return { ok: false, code: "invalid_source_event_shape" };
  }
  if (Object.keys(input).some((key) => !SOURCE_KEYS.includes(key))) {
    return { ok: false, code: "unknown_source_event_field" };
  }
  if (!hasExactKeys(input)) {
    return { ok: false, code: "invalid_source_event_shape" };
  }
  if (
    input.source_contract_version !==
      DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_CONTRACT_VERSION
  ) {
    return { ok: false, code: "unsupported_source_contract_version" };
  }
  if (input.event_schema_version !== DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION) {
    return { ok: false, code: "unsupported_reg02_event_version" };
  }
  if (typeof input.event_kind !== "string" || !EVENT_KINDS.has(input.event_kind)) {
    return { ok: false, code: "unknown_source_event_kind" };
  }
  if (!commonValuesAreValid(input)) {
    return { ok: false, code: "invalid_source_event_value" };
  }
  const expectedActor = input.event_kind ===
      "VERIFICATION_RESULT_REGISTERED_IN_REV"
    ? "VERIFIER"
    : "INBOEKER";
  if (input.regulated_actor_kind !== expectedActor) {
    return { ok: false, code: "invalid_source_event_actor" };
  }
  if (!actorAndProvenanceAreValid(input)) {
    return { ok: false, code: "invalid_source_event_provenance" };
  }
  if (!referencesMatchKind(input)) {
    return { ok: false, code: "invalid_source_event_reference_shape" };
  }

  const base = {
    schemaVersion: DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION,
    eventId: String(input.event_id),
    deliveryYear: Number(input.delivery_year),
    occurredAt: String(input.occurred_at),
    evidenceReference: String(input.evidence_reference),
  };
  switch (input.event_kind) {
    case "INBOOKING_COMPLETED":
      return {
        ok: true,
        value: Object.freeze({
          ...base,
          eventType: "INBOOKING_COMPLETED",
          actor: "INBOEKER",
        }),
      };
    case "VERIFICATION_STATEMENT_POSSESSED":
      return {
        ok: true,
        value: Object.freeze({
          ...base,
          eventType: "VERIFICATION_STATEMENT_POSSESSED",
          actor: "INBOEKER",
          verificationResultReference: String(
            input.verification_result_reference,
          ),
          statementReference: String(input.statement_reference),
        }),
      };
    case "FINDINGS_REPORT_RECEIVED":
      return {
        ok: true,
        value: Object.freeze({
          ...base,
          eventType: "VERIFICATION_FINDINGS_REPORT_RECEIVED",
          actor: "INBOEKER",
          verificationResultReference: String(
            input.verification_result_reference,
          ),
          findingsReportReference: String(input.findings_report_reference),
        }),
      };
    case "STATEMENT_SUBMITTED_TO_NEA":
      return {
        ok: true,
        value: Object.freeze({
          ...base,
          eventType: "STATEMENT_SUBMITTED_TO_NEA",
          actor: "INBOEKER",
          statementReference: String(input.statement_reference),
        }),
      };
    case "VERIFICATION_RESULT_REGISTERED_IN_REV":
      return {
        ok: true,
        value: Object.freeze({
          ...base,
          eventType: "VERIFICATION_RESULT_REGISTERED_IN_REV",
          actor: "VERIFIER",
          verificationResultReference: String(
            input.verification_result_reference,
          ),
        }),
      };
  }
  return { ok: false, code: "unknown_source_event_kind" };
}
