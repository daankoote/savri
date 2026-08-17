import {
  COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION,
  COMPLIANCE_ACTION_SCHEMA_VERSION,
  type ComplianceActionKind,
  type ComplianceActionPlanV1,
  type ComplianceActionSourceV1,
  type ComplianceActionV1,
} from "./compliance_action_plan.ts";

export const COMPLIANCE_WORKLIST_SCHEMA_VERSION =
  "compliance-worklist-v1" as const;
export const COMPLIANCE_WORKLIST_ITEM_SCHEMA_VERSION =
  "compliance-worklist-item-v1" as const;
export const COMPLIANCE_WORKLIST_SCOPE = "DELIVERY_YEAR_TENANT_SCOPED" as const;

export type ComplianceWorklistClassification =
  | "ACTIVE_ATTENTION"
  | "INFORMATIONAL_MILESTONE";

export type ComplianceWorklistItemV1 = Readonly<{
  schemaVersion: typeof COMPLIANCE_WORKLIST_ITEM_SCHEMA_VERSION;
  actionSchemaVersion: typeof COMPLIANCE_ACTION_SCHEMA_VERSION;
  classification: ComplianceWorklistClassification;
  scope: typeof COMPLIANCE_WORKLIST_SCOPE;
  actionKey: ComplianceActionV1["actionKey"];
  actionKind: ComplianceActionV1["actionKind"];
  deliveryYear: ComplianceActionV1["deliveryYear"];
  obligationKind: ComplianceActionV1["obligationKind"];
  responsibleActor: ComplianceActionV1["responsibleActor"];
  coordinationMode: ComplianceActionV1["coordinationMode"];
  temporalStatus: ComplianceActionV1["temporalStatus"];
  boundary: ComplianceActionV1["boundary"];
  boundarySemantics: ComplianceActionV1["boundarySemantics"];
  sourceReference: ComplianceActionV1["sourceReference"];
  sourceResultReference: ComplianceActionV1["sourceResultReference"];
  source: ComplianceActionSourceV1;
}>;

export type ComplianceWorklistV1 = Readonly<{
  schemaVersion: typeof COMPLIANCE_WORKLIST_SCHEMA_VERSION;
  actionPlanSchemaVersion: typeof COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION;
  scope: typeof COMPLIANCE_WORKLIST_SCOPE;
  policyVersion: ComplianceActionPlanV1["policyVersion"];
  cadenceClassification: ComplianceActionPlanV1["cadenceClassification"];
  leadTimeDays: ComplianceActionPlanV1["leadTimeDays"];
  deliveryYear: ComplianceActionPlanV1["deliveryYear"];
  asOf: ComplianceActionPlanV1["asOf"];
  asOfCalendarDate: ComplianceActionPlanV1["asOfCalendarDate"];
  activeAttention: readonly ComplianceWorklistItemV1[];
  milestones: readonly ComplianceWorklistItemV1[];
}>;

export type ComplianceWorklistFailureCode =
  | "invalid_action_plan"
  | "invalid_action"
  | "unknown_action_kind";

export type ComplianceWorklistResult =
  | Readonly<{ ok: true; value: ComplianceWorklistV1 }>
  | Readonly<{ ok: false; code: ComplianceWorklistFailureCode }>;

const PLAN_KEYS = Object.freeze([
  "actions",
  "asOf",
  "asOfCalendarDate",
  "cadenceClassification",
  "deliveryYear",
  "leadTimeDays",
  "policyVersion",
  "schemaVersion",
]);
const ACTION_KEYS = Object.freeze([
  "actionKey",
  "actionKind",
  "boundary",
  "boundarySemantics",
  "coordinationMode",
  "deliveryYear",
  "obligationKind",
  "responsibleActor",
  "schemaVersion",
  "source",
  "sourceReference",
  "sourceResultReference",
  "temporalStatus",
]);
const SOURCE_KEYS = Object.freeze([
  "assessmentSchemaVersion",
  "calendarSchemaVersion",
  "calendarVersion",
  "sourceReferences",
  "stateEventCount",
  "stateLastOccurredAt",
  "stateSchemaVersion",
]);
const OBLIGATION_KINDS = new Set([
  "INBOOKING_CUTOFF",
  "STATEMENT_POSSESSION",
  "YEAR_END_BOUNDARY",
  "STATEMENT_SUBMISSION",
  "VERIFIER_REV_REGISTRATION",
  "FINDINGS_REPORT",
]);
const RESPONSIBLE_ACTORS = new Set([
  "INBOEKER",
  "VERIFIER",
  "SYSTEM_CALENDAR",
]);
const COORDINATION_MODES = new Set([
  "DIRECT_INBOEKER_OPERATION",
  "VERIFIER_COORDINATION",
  "OPERATIONAL_MILESTONE",
  "INTERNAL_COMPLIANCE_ATTENTION",
]);
const TEMPORAL_STATUSES = new Set([
  "UPCOMING",
  "DUE",
  "OVERDUE",
  "BLOCKED",
  "REACHED",
]);
const BOUNDARY_SEMANTICS = new Set([
  "INCLUSIVE_CUTOFF",
  "EXCLUSIVE_BEFORE",
  "CALENDAR_BOUNDARY",
  "IMMEDIATE_ATTENTION",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return Object.keys(value).sort().join("|") ===
    [...expected].sort().join("|");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidSource(value: unknown): value is ComplianceActionSourceV1 {
  if (!isRecord(value) || !hasExactKeys(value, SOURCE_KEYS)) return false;
  return isNonEmptyString(value.stateSchemaVersion) &&
    Number.isInteger(value.stateEventCount) &&
    Number(value.stateEventCount) >= 0 &&
    isNullableString(value.stateLastOccurredAt) &&
    isNonEmptyString(value.calendarSchemaVersion) &&
    isNonEmptyString(value.calendarVersion) &&
    isNonEmptyString(value.assessmentSchemaVersion) &&
    Array.isArray(value.sourceReferences) &&
    value.sourceReferences.every(isNonEmptyString);
}

function isValidAction(
  value: Record<string, unknown>,
  deliveryYear: number,
): value is ComplianceActionV1 {
  return hasExactKeys(value, ACTION_KEYS) &&
    value.schemaVersion === COMPLIANCE_ACTION_SCHEMA_VERSION &&
    isNonEmptyString(value.actionKey) &&
    value.deliveryYear === deliveryYear &&
    OBLIGATION_KINDS.has(String(value.obligationKind)) &&
    RESPONSIBLE_ACTORS.has(String(value.responsibleActor)) &&
    COORDINATION_MODES.has(String(value.coordinationMode)) &&
    TEMPORAL_STATUSES.has(String(value.temporalStatus)) &&
    isNullableString(value.boundary) &&
    BOUNDARY_SEMANTICS.has(String(value.boundarySemantics)) &&
    isNullableString(value.sourceReference) &&
    isNullableString(value.sourceResultReference) &&
    isValidSource(value.source);
}

function classificationFor(
  actionKind: unknown,
): ComplianceWorklistClassification | null {
  switch (actionKind as ComplianceActionKind) {
    case "INBOOKING_CUTOFF_ATTENTION":
    case "STATEMENT_POSSESSION_ATTENTION":
    case "STATEMENT_SUBMISSION_ATTENTION":
    case "VERIFIER_REV_REGISTRATION_ATTENTION":
    case "FINDINGS_REPORT_ATTENTION":
      return "ACTIVE_ATTENTION";
    case "YEAR_END_OPERATIONAL_ATTENTION":
      return "INFORMATIONAL_MILESTONE";
    default:
      return null;
  }
}

function projectItem(
  action: ComplianceActionV1,
  classification: ComplianceWorklistClassification,
): ComplianceWorklistItemV1 {
  const source = Object.freeze({
    ...action.source,
    sourceReferences: Object.freeze([...action.source.sourceReferences]),
  });
  return Object.freeze({
    schemaVersion: COMPLIANCE_WORKLIST_ITEM_SCHEMA_VERSION,
    actionSchemaVersion: action.schemaVersion,
    classification,
    scope: COMPLIANCE_WORKLIST_SCOPE,
    actionKey: action.actionKey,
    actionKind: action.actionKind,
    deliveryYear: action.deliveryYear,
    obligationKind: action.obligationKind,
    responsibleActor: action.responsibleActor,
    coordinationMode: action.coordinationMode,
    temporalStatus: action.temporalStatus,
    boundary: action.boundary,
    boundarySemantics: action.boundarySemantics,
    sourceReference: action.sourceReference,
    sourceResultReference: action.sourceResultReference,
    source,
  });
}

export function projectComplianceWorklist(
  actionPlanInput: unknown,
): ComplianceWorklistResult {
  if (!isRecord(actionPlanInput) || !hasExactKeys(actionPlanInput, PLAN_KEYS)) {
    return { ok: false, code: "invalid_action_plan" };
  }
  if (
    actionPlanInput.schemaVersion !== COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION ||
    !isNonEmptyString(actionPlanInput.policyVersion) ||
    actionPlanInput.cadenceClassification !== "INTERNAL_DEFAULT" ||
    !Number.isInteger(actionPlanInput.leadTimeDays) ||
    Number(actionPlanInput.leadTimeDays) < 0 ||
    !Number.isInteger(actionPlanInput.deliveryYear) ||
    !isNonEmptyString(actionPlanInput.asOf) ||
    !isNonEmptyString(actionPlanInput.asOfCalendarDate) ||
    !Array.isArray(actionPlanInput.actions)
  ) return { ok: false, code: "invalid_action_plan" };

  const activeAttention: ComplianceWorklistItemV1[] = [];
  const milestones: ComplianceWorklistItemV1[] = [];
  const actionKeys = new Set<string>();
  for (const actionInput of actionPlanInput.actions) {
    if (!isRecord(actionInput)) return { ok: false, code: "invalid_action" };
    const classification = classificationFor(actionInput.actionKind);
    if (!classification) return { ok: false, code: "unknown_action_kind" };
    if (!isValidAction(actionInput, Number(actionPlanInput.deliveryYear))) {
      return { ok: false, code: "invalid_action" };
    }
    if (actionKeys.has(actionInput.actionKey)) {
      return { ok: false, code: "invalid_action" };
    }
    actionKeys.add(actionInput.actionKey);
    const item = projectItem(actionInput, classification);
    if (classification === "ACTIVE_ATTENTION") activeAttention.push(item);
    else milestones.push(item);
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: COMPLIANCE_WORKLIST_SCHEMA_VERSION,
      actionPlanSchemaVersion: COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION,
      scope: COMPLIANCE_WORKLIST_SCOPE,
      policyVersion: actionPlanInput.policyVersion,
      cadenceClassification: actionPlanInput.cadenceClassification,
      leadTimeDays: Number(actionPlanInput.leadTimeDays),
      deliveryYear: Number(actionPlanInput.deliveryYear),
      asOf: actionPlanInput.asOf,
      asOfCalendarDate: actionPlanInput.asOfCalendarDate,
      activeAttention: Object.freeze(activeAttention),
      milestones: Object.freeze(milestones),
    }),
  };
}
