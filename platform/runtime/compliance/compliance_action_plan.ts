import {
  assessDeliveryYearCompliance,
  DELIVERY_YEAR_COMPLIANCE_ASSESSMENT_SCHEMA_VERSION,
  DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION,
  DELIVERY_YEAR_COMPLIANCE_STATE_SCHEMA_VERSION,
  type DeliveryYearComplianceAssessmentItem,
  type DeliveryYearComplianceObligationStatus,
  type DeliveryYearComplianceSourceReference,
  type DeliveryYearComplianceStateV1,
  validateDeliveryYearComplianceCalendarV1,
} from "./delivery_year_compliance.ts";

export const COMPLIANCE_ACTION_PLAN_POLICY_SCHEMA_VERSION =
  "compliance-action-plan-policy-v1" as const;
export const COMPLIANCE_ACTION_SCHEMA_VERSION = "compliance-action-v1" as const;
export const COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION =
  "compliance-action-plan-v1" as const;

export type ComplianceActionPlanPolicyV1 = Readonly<{
  schemaVersion: typeof COMPLIANCE_ACTION_PLAN_POLICY_SCHEMA_VERSION;
  policyVersion: string;
  cadenceClassification: "INTERNAL_DEFAULT";
  leadTimeDays: number;
}>;

export type ComplianceActionKind =
  | "INBOOKING_CUTOFF_ATTENTION"
  | "STATEMENT_POSSESSION_ATTENTION"
  | "YEAR_END_OPERATIONAL_ATTENTION"
  | "STATEMENT_SUBMISSION_ATTENTION"
  | "VERIFIER_REV_REGISTRATION_ATTENTION"
  | "FINDINGS_REPORT_ATTENTION";

export type ComplianceObligationKind =
  | "INBOOKING_CUTOFF"
  | "STATEMENT_POSSESSION"
  | "YEAR_END_BOUNDARY"
  | "STATEMENT_SUBMISSION"
  | "VERIFIER_REV_REGISTRATION"
  | "FINDINGS_REPORT";

export type ComplianceActionCoordinationMode =
  | "DIRECT_INBOEKER_OPERATION"
  | "VERIFIER_COORDINATION"
  | "OPERATIONAL_MILESTONE"
  | "INTERNAL_COMPLIANCE_ATTENTION";

export type ComplianceActionTemporalStatus =
  | Extract<
    DeliveryYearComplianceObligationStatus,
    "UPCOMING" | "DUE" | "OVERDUE" | "BLOCKED"
  >
  | "REACHED";

export type ComplianceActionSourceV1 = Readonly<{
  stateSchemaVersion: typeof DELIVERY_YEAR_COMPLIANCE_STATE_SCHEMA_VERSION;
  stateEventCount: number;
  stateLastOccurredAt: string | null;
  calendarSchemaVersion:
    typeof DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION;
  calendarVersion: string;
  assessmentSchemaVersion:
    typeof DELIVERY_YEAR_COMPLIANCE_ASSESSMENT_SCHEMA_VERSION;
  sourceReferences: readonly DeliveryYearComplianceSourceReference[];
}>;

export type ComplianceActionV1 = Readonly<{
  schemaVersion: typeof COMPLIANCE_ACTION_SCHEMA_VERSION;
  actionKey: string;
  actionKind: ComplianceActionKind;
  deliveryYear: number;
  obligationKind: ComplianceObligationKind;
  responsibleActor: "INBOEKER" | "VERIFIER" | "SYSTEM_CALENDAR";
  coordinationMode: ComplianceActionCoordinationMode;
  temporalStatus: ComplianceActionTemporalStatus;
  boundary: string | null;
  boundarySemantics:
    | "INCLUSIVE_CUTOFF"
    | "EXCLUSIVE_BEFORE"
    | "CALENDAR_BOUNDARY"
    | "IMMEDIATE_ATTENTION";
  sourceReference: string | null;
  sourceResultReference: string | null;
  source: ComplianceActionSourceV1;
}>;

export type ComplianceActionPlanV1 = Readonly<{
  schemaVersion: typeof COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION;
  policyVersion: string;
  cadenceClassification: "INTERNAL_DEFAULT";
  leadTimeDays: number;
  deliveryYear: number;
  asOf: string;
  asOfCalendarDate: string;
  actions: readonly ComplianceActionV1[];
}>;

export type ComplianceActionPlanPolicyFailureCode =
  | "invalid_policy_shape"
  | "unknown_policy_field"
  | "unsupported_policy_version"
  | "invalid_policy_version"
  | "invalid_cadence_classification"
  | "invalid_lead_time_days";

export type ComplianceActionPlanPolicyResult =
  | Readonly<{ ok: true; value: ComplianceActionPlanPolicyV1 }>
  | Readonly<{
    ok: false;
    code: ComplianceActionPlanPolicyFailureCode;
  }>;

export type ComplianceActionPlanFailureCode =
  | ComplianceActionPlanPolicyFailureCode
  | "invalid_calendar"
  | "invalid_state"
  | "wrong_delivery_year"
  | "invalid_as_of";

export type ComplianceActionPlanResult =
  | Readonly<{ ok: true; value: ComplianceActionPlanV1 }>
  | Readonly<{ ok: false; code: ComplianceActionPlanFailureCode }>;

const POLICY_KEYS = Object.freeze([
  "cadenceClassification",
  "leadTimeDays",
  "policyVersion",
  "schemaVersion",
]);
const POLICY_VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const MAX_LEAD_TIME_DAYS = 366;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" &&
    !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return Object.keys(value).sort().join("|") ===
    [...expected].sort().join("|");
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

export function validateComplianceActionPlanPolicyV1(
  input: unknown,
): ComplianceActionPlanPolicyResult {
  if (!isRecord(input)) return { ok: false, code: "invalid_policy_shape" };
  if (!hasOnlyKeys(input, POLICY_KEYS)) {
    return { ok: false, code: "unknown_policy_field" };
  }
  if (!hasExactKeys(input, POLICY_KEYS)) {
    return { ok: false, code: "invalid_policy_shape" };
  }
  if (input.schemaVersion !== COMPLIANCE_ACTION_PLAN_POLICY_SCHEMA_VERSION) {
    return { ok: false, code: "unsupported_policy_version" };
  }
  if (
    typeof input.policyVersion !== "string" ||
    !POLICY_VERSION_PATTERN.test(input.policyVersion)
  ) return { ok: false, code: "invalid_policy_version" };
  if (input.cadenceClassification !== "INTERNAL_DEFAULT") {
    return { ok: false, code: "invalid_cadence_classification" };
  }
  if (
    !Number.isInteger(input.leadTimeDays) ||
    Number(input.leadTimeDays) < 0 ||
    Number(input.leadTimeDays) > MAX_LEAD_TIME_DAYS
  ) return { ok: false, code: "invalid_lead_time_days" };
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: COMPLIANCE_ACTION_PLAN_POLICY_SCHEMA_VERSION,
      policyVersion: input.policyVersion,
      cadenceClassification: "INTERNAL_DEFAULT",
      leadTimeDays: Number(input.leadTimeDays),
    }),
  };
}

const canonicalPolicy = validateComplianceActionPlanPolicyV1({
  schemaVersion: COMPLIANCE_ACTION_PLAN_POLICY_SCHEMA_VERSION,
  policyVersion: "enval-internal-default-v1",
  cadenceClassification: "INTERNAL_DEFAULT",
  leadTimeDays: 14,
});

if (!canonicalPolicy.ok) {
  throw new TypeError(
    `invalid_enval_action_plan_policy:${canonicalPolicy.code}`,
  );
}

export const ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1 = canonicalPolicy.value;

function subtractCalendarDays(calendarDate: string, days: number): string {
  const [year, month, day] = calendarDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days))
    .toISOString().slice(0, 10);
}

function reminderIsActionable(
  item: DeliveryYearComplianceAssessmentItem,
  asOfCalendarDate: string,
  leadTimeDays: number,
): boolean {
  if (
    item.status === "COMPLETE" || item.status === "NOT_APPLICABLE" ||
    item.occurredAt !== null
  ) return false;
  if (item.status === "DUE" || item.status === "OVERDUE") return true;
  return asOfCalendarDate >= subtractCalendarDays(item.boundary, leadTimeDays);
}

function actionKey(parts: readonly (string | number)[]): string {
  return parts.map((part) => encodeURIComponent(String(part))).join(":");
}

type ActionInput = Omit<
  ComplianceActionV1,
  "schemaVersion" | "actionKey" | "deliveryYear" | "source"
>;

function createAction(
  input: ActionInput,
  deliveryYear: number,
  policy: ComplianceActionPlanPolicyV1,
  source: ComplianceActionSourceV1,
): ComplianceActionV1 {
  const key = actionKey([
    COMPLIANCE_ACTION_SCHEMA_VERSION,
    deliveryYear,
    input.actionKind,
    input.boundary ?? "no-boundary",
    source.calendarVersion,
    policy.policyVersion,
    policy.leadTimeDays,
    input.sourceReference ?? "no-source-reference",
    input.sourceResultReference ?? "no-result-reference",
  ]);
  return Object.freeze({
    schemaVersion: COMPLIANCE_ACTION_SCHEMA_VERSION,
    actionKey: key,
    deliveryYear,
    source,
    ...input,
  });
}

function assessmentFailureCode(
  code:
    | "invalid_state"
    | "invalid_calendar"
    | "wrong_delivery_year"
    | "invalid_as_of",
): ComplianceActionPlanFailureCode {
  return code;
}

export function buildComplianceActionPlan(
  stateInput: unknown,
  calendarInput: unknown,
  asOf: unknown,
  policyInput: unknown,
): ComplianceActionPlanResult {
  const policy = validateComplianceActionPlanPolicyV1(policyInput);
  if (!policy.ok) return policy;

  const calendar = validateDeliveryYearComplianceCalendarV1(calendarInput);
  if (!calendar.ok) return { ok: false, code: "invalid_calendar" };

  const assessed = assessDeliveryYearCompliance(
    stateInput,
    calendar.value,
    asOf,
  );
  if (!assessed.ok) {
    return { ok: false, code: assessmentFailureCode(assessed.code) };
  }

  const state = stateInput as DeliveryYearComplianceStateV1;
  const assessment = assessed.value;
  const source: ComplianceActionSourceV1 = Object.freeze({
    stateSchemaVersion: DELIVERY_YEAR_COMPLIANCE_STATE_SCHEMA_VERSION,
    stateEventCount: state.appliedEvents.length,
    stateLastOccurredAt: state.lastOccurredAt,
    calendarSchemaVersion: DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION,
    calendarVersion: calendar.value.calendarVersion,
    assessmentSchemaVersion: DELIVERY_YEAR_COMPLIANCE_ASSESSMENT_SCHEMA_VERSION,
    sourceReferences: Object.freeze([...calendar.value.sourceReferences]),
  });
  const actions: ComplianceActionV1[] = [];

  if (
    reminderIsActionable(
      assessment.inbooking,
      assessment.asOfCalendarDate,
      policy.value.leadTimeDays,
    )
  ) {
    actions.push(createAction(
      {
        actionKind: "INBOOKING_CUTOFF_ATTENTION",
        obligationKind: "INBOOKING_CUTOFF",
        responsibleActor: "INBOEKER",
        coordinationMode: "DIRECT_INBOEKER_OPERATION",
        temporalStatus: assessment.inbooking
          .status as ComplianceActionTemporalStatus,
        boundary: assessment.inbooking.boundary,
        boundarySemantics: assessment.inbooking.boundarySemantics,
        sourceReference: null,
        sourceResultReference: null,
      },
      assessment.deliveryYear,
      policy.value,
      source,
    ));
  }

  if (
    reminderIsActionable(
      assessment.statementPossession,
      assessment.asOfCalendarDate,
      policy.value.leadTimeDays,
    )
  ) {
    actions.push(createAction(
      {
        actionKind: "STATEMENT_POSSESSION_ATTENTION",
        obligationKind: "STATEMENT_POSSESSION",
        responsibleActor: "INBOEKER",
        coordinationMode: "VERIFIER_COORDINATION",
        temporalStatus: assessment.statementPossession
          .status as ComplianceActionTemporalStatus,
        boundary: assessment.statementPossession.boundary,
        boundarySemantics: assessment.statementPossession.boundarySemantics,
        sourceReference: null,
        sourceResultReference: null,
      },
      assessment.deliveryYear,
      policy.value,
      source,
    ));
  }

  if (assessment.yearEnd.status === "REACHED") {
    actions.push(createAction(
      {
        actionKind: "YEAR_END_OPERATIONAL_ATTENTION",
        obligationKind: "YEAR_END_BOUNDARY",
        responsibleActor: "SYSTEM_CALENDAR",
        coordinationMode: "OPERATIONAL_MILESTONE",
        temporalStatus: "REACHED",
        boundary: assessment.yearEnd.boundary,
        boundarySemantics: assessment.yearEnd.boundarySemantics,
        sourceReference: null,
        sourceResultReference: null,
      },
      assessment.deliveryYear,
      policy.value,
      source,
    ));
  }

  if (
    reminderIsActionable(
      assessment.statementSubmission,
      assessment.asOfCalendarDate,
      policy.value.leadTimeDays,
    )
  ) {
    actions.push(createAction(
      {
        actionKind: "STATEMENT_SUBMISSION_ATTENTION",
        obligationKind: "STATEMENT_SUBMISSION",
        responsibleActor: "INBOEKER",
        coordinationMode: "DIRECT_INBOEKER_OPERATION",
        temporalStatus: assessment.statementSubmission
          .status as ComplianceActionTemporalStatus,
        boundary: assessment.statementSubmission.boundary,
        boundarySemantics: assessment.statementSubmission.boundarySemantics,
        sourceReference: null,
        sourceResultReference: null,
      },
      assessment.deliveryYear,
      policy.value,
      source,
    ));
  }

  if (
    reminderIsActionable(
      assessment.verifierRevRegistration,
      assessment.asOfCalendarDate,
      policy.value.leadTimeDays,
    )
  ) {
    actions.push(createAction(
      {
        actionKind: "VERIFIER_REV_REGISTRATION_ATTENTION",
        obligationKind: "VERIFIER_REV_REGISTRATION",
        responsibleActor: "VERIFIER",
        coordinationMode: "VERIFIER_COORDINATION",
        temporalStatus: assessment.verifierRevRegistration
          .status as ComplianceActionTemporalStatus,
        boundary: assessment.verifierRevRegistration.boundary,
        boundarySemantics: assessment.verifierRevRegistration.boundarySemantics,
        sourceReference: null,
        sourceResultReference: null,
      },
      assessment.deliveryYear,
      policy.value,
      source,
    ));
  }

  if (
    assessment.verificationCondition === "NON_POSITIVE_FINDINGS" &&
    state.verificationOutcome.status === "FINDINGS_REPORT_RECEIVED"
  ) {
    actions.push(createAction(
      {
        actionKind: "FINDINGS_REPORT_ATTENTION",
        obligationKind: "FINDINGS_REPORT",
        responsibleActor: "INBOEKER",
        coordinationMode: "INTERNAL_COMPLIANCE_ATTENTION",
        temporalStatus: "BLOCKED",
        boundary: null,
        boundarySemantics: "IMMEDIATE_ATTENTION",
        sourceReference: state.verificationOutcome.findingsReportReference,
        sourceResultReference:
          state.verificationOutcome.verificationResultReference,
      },
      assessment.deliveryYear,
      policy.value,
      source,
    ));
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION,
      policyVersion: policy.value.policyVersion,
      cadenceClassification: policy.value.cadenceClassification,
      leadTimeDays: policy.value.leadTimeDays,
      deliveryYear: assessment.deliveryYear,
      asOf: assessment.asOf,
      asOfCalendarDate: assessment.asOfCalendarDate,
      actions: Object.freeze(actions),
    }),
  };
}
