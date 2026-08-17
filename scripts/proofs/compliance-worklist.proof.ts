import {
  buildComplianceActionPlan,
  type ComplianceActionKind,
  type ComplianceActionPlanV1,
  ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
} from "../../platform/runtime/compliance/compliance_action_plan.ts";
import {
  COMPLIANCE_WORKLIST_ITEM_SCHEMA_VERSION,
  COMPLIANCE_WORKLIST_SCHEMA_VERSION,
  COMPLIANCE_WORKLIST_SCOPE,
  type ComplianceWorklistV1,
  projectComplianceWorklist,
} from "../../platform/runtime/compliance/compliance_worklist.ts";
import {
  applyDeliveryYearComplianceEvent,
  createInitialDeliveryYearComplianceStateV1,
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION,
  type DeliveryYearComplianceStateV1,
} from "../../platform/runtime/compliance/delivery_year_compliance.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

function initial(): DeliveryYearComplianceStateV1 {
  const result = createInitialDeliveryYearComplianceStateV1(2026);
  assert(result.ok, "initial_state_rejected");
  return result.value;
}

function apply(
  state: DeliveryYearComplianceStateV1,
  event: unknown,
): DeliveryYearComplianceStateV1 {
  const result = applyDeliveryYearComplianceEvent(state, event);
  assert(result.ok && !result.idempotent, "valid_event_rejected");
  return result.value;
}

function baseEvent(
  eventId: string,
  eventType: string,
  actor: string,
  occurredAt: string,
) {
  return {
    schemaVersion: DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION,
    eventId,
    eventType,
    actor,
    deliveryYear: 2026,
    occurredAt,
    evidenceReference: `evidence:${eventId}`,
  };
}

function plan(
  state: DeliveryYearComplianceStateV1,
  asOf: string,
): ComplianceActionPlanV1 {
  const result = buildComplianceActionPlan(
    state,
    DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
    asOf,
    ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
  );
  if (!result.ok) {
    throw new ProofFailure(`action_plan_rejected:${result.code}`);
  }
  return result.value;
}

function project(value: unknown): ComplianceWorklistV1 {
  const result = projectComplianceWorklist(value);
  if (!result.ok) throw new ProofFailure(`worklist_rejected:${result.code}`);
  return result.value;
}

let completeState = initial();
completeState = apply(completeState, {
  ...baseEvent(
    "event:complete-inbooking",
    "INBOOKING_COMPLETED",
    "INBOEKER",
    "2027-01-10T10:00:00Z",
  ),
});
completeState = apply(completeState, {
  ...baseEvent(
    "event:complete-statement",
    "VERIFICATION_STATEMENT_POSSESSED",
    "INBOEKER",
    "2027-01-11T10:00:00Z",
  ),
  verificationResultReference: "verification-result:2026:positive",
  statementReference: "statement:2026:001",
});
completeState = apply(completeState, {
  ...baseEvent(
    "event:complete-submission",
    "STATEMENT_SUBMITTED_TO_NEA",
    "INBOEKER",
    "2027-01-12T10:00:00Z",
  ),
  statementReference: "statement:2026:001",
});
completeState = apply(completeState, {
  ...baseEvent(
    "event:complete-registration",
    "VERIFICATION_RESULT_REGISTERED_IN_REV",
    "VERIFIER",
    "2027-01-13T10:00:00Z",
  ),
  verificationResultReference: "verification-result:2026:positive",
});

const emptyPlan = plan(completeState, "2027-02-01T12:00:00Z");
const emptyWorklist = project(emptyPlan);
assert(
  emptyPlan.actions.length === 0 &&
    emptyWorklist.activeAttention.length === 0 &&
    emptyWorklist.milestones.length === 0,
  "Q01_empty_action_plan_not_empty_worklist",
);

const normalPlan = plan(initial(), "2027-05-02T12:00:00Z");
const normalWorklist = project(normalPlan);
const normalActiveKinds = normalWorklist.activeAttention.map((item) =>
  item.actionKind
);
const expectedNormalActiveKinds = [
  "INBOOKING_CUTOFF_ATTENTION",
  "STATEMENT_POSSESSION_ATTENTION",
  "STATEMENT_SUBMISSION_ATTENTION",
  "VERIFIER_REV_REGISTRATION_ATTENTION",
] satisfies readonly ComplianceActionKind[];
assert(
  expectedNormalActiveKinds.every((kind) => normalActiveKinds.includes(kind)),
  "Q02_normal_active_attention_classification_invalid",
);

let findingsState = initial();
findingsState = apply(findingsState, {
  ...baseEvent(
    "event:findings-inbooking",
    "INBOOKING_COMPLETED",
    "INBOEKER",
    "2027-02-20T10:00:00Z",
  ),
});
findingsState = apply(findingsState, {
  ...baseEvent(
    "event:findings",
    "VERIFICATION_FINDINGS_REPORT_RECEIVED",
    "INBOEKER",
    "2027-03-20T10:00:00Z",
  ),
  verificationResultReference: "verification-result:2026:findings",
  findingsReportReference: "findings-report:2026:001",
});
const findingsPlan = plan(findingsState, "2027-05-02T12:00:00Z");
const findingsWorklist = project(findingsPlan);
const findingsItem = findingsWorklist.activeAttention.find((item) =>
  item.actionKind === "FINDINGS_REPORT_ATTENTION"
);
assert(
  findingsItem?.classification === "ACTIVE_ATTENTION" &&
    findingsItem.temporalStatus === "BLOCKED" &&
    findingsItem.sourceReference === "findings-report:2026:001",
  "Q03_findings_not_active_attention",
);

const yearEnd = normalWorklist.milestones.find((item) =>
  item.actionKind === "YEAR_END_OPERATIONAL_ATTENTION"
);
assert(
  normalWorklist.milestones.length === 1 &&
    yearEnd?.classification === "INFORMATIONAL_MILESTONE" &&
    yearEnd.responsibleActor === "SYSTEM_CALENDAR" &&
    !normalWorklist.activeAttention.some((item) =>
      item.actionKind === "YEAR_END_OPERATIONAL_ATTENTION"
    ),
  "Q04_year_end_not_milestone_only",
);

const activeKeys = new Set(
  normalWorklist.activeAttention.map((item) => item.actionKey),
);
assert(
  normalWorklist.milestones.every((item) => !activeKeys.has(item.actionKey)),
  "Q05_action_in_both_collections",
);

const projectedByKey = new Map(
  [...normalWorklist.activeAttention, ...normalWorklist.milestones].map(
    (item) => [item.actionKey, item],
  ),
);
assert(
  normalPlan.actions.every((action) =>
    projectedByKey.get(action.actionKey)?.actionKey === action.actionKey
  ),
  "Q06_action_keys_not_preserved",
);
assert(
  normalPlan.actions.every((action) =>
    projectedByKey.get(action.actionKey)?.responsibleActor ===
      action.responsibleActor &&
    projectedByKey.get(action.actionKey)?.coordinationMode ===
      action.coordinationMode
  ),
  "Q07_actors_not_preserved",
);
assert(
  normalPlan.actions.every((action) =>
    projectedByKey.get(action.actionKey)?.temporalStatus ===
      action.temporalStatus
  ),
  "Q08_temporal_status_not_preserved",
);
assert(
  normalPlan.actions.every((action) => {
    const item = projectedByKey.get(action.actionKey);
    return item?.source.calendarVersion === action.source.calendarVersion &&
      item.source.stateEventCount === action.source.stateEventCount &&
      JSON.stringify(item.source.sourceReferences) ===
        JSON.stringify(action.source.sourceReferences) &&
      item.source !== action.source &&
      item.source.sourceReferences !== action.source.sourceReferences;
  }),
  "Q09_provenance_not_preserved_or_not_copied",
);

const expectedActiveOrder = normalPlan.actions
  .filter((item) => item.actionKind !== "YEAR_END_OPERATIONAL_ATTENTION")
  .map((item) => item.actionKind);
const expectedMilestoneOrder = normalPlan.actions
  .filter((item) => item.actionKind === "YEAR_END_OPERATIONAL_ATTENTION")
  .map((item) => item.actionKind);
assert(
  JSON.stringify(normalActiveKinds) === JSON.stringify(expectedActiveOrder) &&
    JSON.stringify(normalWorklist.milestones.map((item) => item.actionKind)) ===
      JSON.stringify(expectedMilestoneOrder) &&
    JSON.stringify(project(normalPlan)) === JSON.stringify(normalWorklist),
  "Q10_projection_order_or_rebuild_not_deterministic",
);

const unknownPlan = JSON.parse(JSON.stringify(normalPlan));
unknownPlan.actions[0].actionKind = "UNKNOWN_ACTION_KIND";
const unknownResult = projectComplianceWorklist(unknownPlan);
assert(
  !unknownResult.ok && unknownResult.code === "unknown_action_kind",
  "Q11_unknown_action_kind_not_fail_closed",
);

const forbiddenSemanticKeys = new Set([
  "acknowledged",
  "assigned",
  "closed",
  "dismissed",
  "done",
  "owner",
  "resolved",
]);
assert(
  [...normalWorklist.activeAttention, ...normalWorklist.milestones].every(
    (item) => Object.keys(item).every((key) => !forbiddenSemanticKeys.has(key)),
  ),
  "Q12_completion_dismissal_or_assignment_semantics_added",
);

const mutablePlan = JSON.parse(JSON.stringify(normalPlan));
const inputBefore = JSON.stringify(mutablePlan);
const isolatedWorklist = project(mutablePlan);
assert(
  JSON.stringify(mutablePlan) === inputBefore &&
    Object.isFrozen(isolatedWorklist) &&
    Object.isFrozen(isolatedWorklist.activeAttention) &&
    Object.isFrozen(isolatedWorklist.milestones) &&
    isolatedWorklist.activeAttention.every((item) =>
      Object.isFrozen(item) && Object.isFrozen(item.source) &&
      Object.isFrozen(item.source.sourceReferences)
    ),
  "Q13_input_mutated_or_output_not_immutable",
);
const isolatedKey = isolatedWorklist.activeAttention[0].actionKey;
mutablePlan.actions[0].actionKey = "mutated-source-key";
assert(
  isolatedWorklist.activeAttention[0].actionKey === isolatedKey,
  "Q14_source_mutation_changed_projection",
);

assert(
  normalWorklist.schemaVersion === COMPLIANCE_WORKLIST_SCHEMA_VERSION &&
    normalWorklist.scope === COMPLIANCE_WORKLIST_SCOPE &&
    [...normalWorklist.activeAttention, ...normalWorklist.milestones].every(
      (item) =>
        item.schemaVersion === COMPLIANCE_WORKLIST_ITEM_SCHEMA_VERSION &&
        item.scope === COMPLIANCE_WORKLIST_SCOPE &&
        !Object.hasOwn(item, "tenantId") &&
        !Object.hasOwn(item, "customerId") &&
        !Object.hasOwn(item, "caseId") &&
        !Object.hasOwn(item, "locationId"),
    ),
  "Q15_scope_or_identifier_boundary_invalid",
);

const moduleSource = await Deno.readTextFile(
  "platform/runtime/compliance/compliance_worklist.ts",
);
assert(
  moduleSource.includes('from "./compliance_action_plan.ts"') &&
    !moduleSource.includes("delivery_year_compliance") &&
    !/(Date\s*\(|setTimeout|fetch\s*\(|Deno\.|createClient|\.rpc\s*\(|\.from\s*\()/
      .test(moduleSource) &&
    !/(workforce|authorization|supabase|react|mail|notification|scheduler)/i
      .test(moduleSource) &&
    !/20\d{2}-\d{2}-\d{2}/.test(moduleSource),
  "Q16_dependency_purity_or_authority_boundary_violated",
);

console.log("COMPLIANCE_WORKLIST_Q01_Q16=PASS");
