import {
  buildComplianceActionPlan,
  COMPLIANCE_ACTION_PLAN_POLICY_SCHEMA_VERSION,
  COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION,
  COMPLIANCE_ACTION_SCHEMA_VERSION,
  type ComplianceActionPlanPolicyV1,
  type ComplianceActionPlanV1,
  ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
  validateComplianceActionPlanPolicyV1,
} from "../../platform/runtime/compliance/compliance_action_plan.ts";
import {
  applyDeliveryYearComplianceEvent,
  createInitialDeliveryYearComplianceStateV1,
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION,
  type DeliveryYearComplianceCalendarV1,
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

function eventBase(
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

function inbooking(occurredAt = "2027-02-20T10:00:00Z") {
  return eventBase(
    "event:inbooking",
    "INBOOKING_COMPLETED",
    "INBOEKER",
    occurredAt,
  );
}

function statement(occurredAt = "2027-03-20T10:00:00Z") {
  return {
    ...eventBase(
      "event:statement",
      "VERIFICATION_STATEMENT_POSSESSED",
      "INBOEKER",
      occurredAt,
    ),
    verificationResultReference: "verification-result:2026:positive",
    statementReference: "statement:2026:001",
  };
}

function findings(occurredAt = "2027-03-20T10:00:00Z") {
  return {
    ...eventBase(
      "event:findings",
      "VERIFICATION_FINDINGS_REPORT_RECEIVED",
      "INBOEKER",
      occurredAt,
    ),
    verificationResultReference: "verification-result:2026:findings",
    findingsReportReference: "findings-report:2026:001",
  };
}

function submission(occurredAt = "2027-04-20T10:00:00Z") {
  return {
    ...eventBase(
      "event:submission",
      "STATEMENT_SUBMITTED_TO_NEA",
      "INBOEKER",
      occurredAt,
    ),
    statementReference: "statement:2026:001",
  };
}

function revRegistration(occurredAt = "2027-04-21T10:00:00Z") {
  return {
    ...eventBase(
      "event:rev-registration",
      "VERIFICATION_RESULT_REGISTERED_IN_REV",
      "VERIFIER",
      occurredAt,
    ),
    verificationResultReference: "verification-result:2026:positive",
  };
}

function plan(
  state: DeliveryYearComplianceStateV1,
  asOf: string,
  policy: ComplianceActionPlanPolicyV1 = ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
  calendar: DeliveryYearComplianceCalendarV1 =
    DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
): ComplianceActionPlanV1 {
  const result = buildComplianceActionPlan(state, calendar, asOf, policy);
  if (!result.ok) throw new ProofFailure(`action_plan_rejected:${result.code}`);
  return result.value;
}

function action(
  value: ComplianceActionPlanV1,
  actionKind: string,
) {
  return value.actions.find((item) => item.actionKind === actionKind);
}

const defaultPolicy = ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1;
const validatedDefault = validateComplianceActionPlanPolicyV1(defaultPolicy);
assert(
  validatedDefault.ok && validatedDefault.value.leadTimeDays === 14 &&
    validatedDefault.value.cadenceClassification === "INTERNAL_DEFAULT" &&
    Object.isFrozen(defaultPolicy),
  "Q01_canonical_internal_policy_invalid",
);

const invalidPolicies = [
  null,
  { ...defaultPolicy, leadTimeDays: -1 },
  { ...defaultPolicy, leadTimeDays: 1.5 },
  { ...defaultPolicy, leadTimeDays: 367 },
  { ...defaultPolicy, cadenceClassification: "REGULATORY" },
  { ...defaultPolicy, schemaVersion: "compliance-action-plan-policy-v2" },
  { ...defaultPolicy, customCadence: [3, 7, 10] },
];
assert(
  invalidPolicies.every((policy) =>
    !validateComplianceActionPlanPolicyV1(policy).ok
  ),
  "Q02_invalid_or_unknown_policy_not_fail_closed",
);

const beforeLead = plan(initial(), "2027-02-11T12:00:00Z");
assert(
  beforeLead.actions.length === 0,
  "Q03_action_emitted_before_lead_window",
);

const leadEntry = plan(initial(), "2027-02-12T12:00:00Z");
const leadInbooking = action(leadEntry, "INBOOKING_CUTOFF_ATTENTION");
assert(
  leadEntry.actions.length === 1 &&
    leadInbooking?.temporalStatus === "UPCOMING" &&
    leadInbooking.boundary === "2027-02-26" &&
    leadInbooking.responsibleActor === "INBOEKER",
  "Q04_inbooking_lead_window_entry_invalid",
);

const due = plan(initial(), "2027-02-26T12:00:00Z");
const overdue = plan(initial(), "2027-02-27T12:00:00Z");
assert(
  action(due, "INBOOKING_CUTOFF_ATTENTION")?.temporalStatus === "DUE" &&
    action(overdue, "INBOOKING_CUTOFF_ATTENTION")?.temporalStatus ===
      "OVERDUE",
  "Q05_reg02_due_or_overdue_status_not_preserved",
);

const inbookingCompleteState = apply(initial(), inbooking());
const afterInbookingComplete = plan(
  inbookingCompleteState,
  "2027-02-27T12:00:00Z",
);
assert(
  !action(afterInbookingComplete, "INBOOKING_CUTOFF_ATTENTION"),
  "Q06_completed_inbooking_action_not_removed",
);

const possessionLead = plan(initial(), "2027-03-18T12:00:00Z");
const possessionDue = plan(initial(), "2027-03-31T12:00:00Z");
assert(
  action(possessionLead, "STATEMENT_POSSESSION_ATTENTION")
        ?.temporalStatus === "UPCOMING" &&
    action(possessionLead, "STATEMENT_POSSESSION_ATTENTION")?.boundary ===
      "2027-04-01" &&
    action(possessionDue, "STATEMENT_POSSESSION_ATTENTION")?.temporalStatus ===
      "DUE" &&
    action(possessionLead, "STATEMENT_POSSESSION_ATTENTION")
        ?.coordinationMode === "VERIFIER_COORDINATION",
  "Q07_statement_possession_action_invalid",
);

const positiveState = apply(inbookingCompleteState, statement());
const beforeMayActions = plan(positiveState, "2027-04-17T12:00:00Z");
const submissionAction = action(
  beforeMayActions,
  "STATEMENT_SUBMISSION_ATTENTION",
);
const revAction = action(
  beforeMayActions,
  "VERIFIER_REV_REGISTRATION_ATTENTION",
);
assert(
  submissionAction?.temporalStatus === "UPCOMING" &&
    submissionAction.boundary === "2027-05-01" &&
    submissionAction.responsibleActor === "INBOEKER" &&
    revAction?.temporalStatus === "UPCOMING" &&
    revAction.boundary === "2027-05-01" &&
    revAction.responsibleActor === "VERIFIER" &&
    revAction.coordinationMode === "VERIFIER_COORDINATION",
  "Q08_submission_or_rev_coordination_action_invalid",
);

const completedPositiveState = apply(
  apply(positiveState, submission()),
  revRegistration(),
);
const completedPositivePlan = plan(
  completedPositiveState,
  "2027-05-02T12:00:00Z",
);
assert(
  !action(completedPositivePlan, "INBOOKING_CUTOFF_ATTENTION") &&
    !action(completedPositivePlan, "STATEMENT_POSSESSION_ATTENTION") &&
    !action(completedPositivePlan, "STATEMENT_SUBMISSION_ATTENTION") &&
    !action(completedPositivePlan, "VERIFIER_REV_REGISTRATION_ATTENTION") &&
    action(completedPositivePlan, "YEAR_END_OPERATIONAL_ATTENTION")
        ?.temporalStatus === "REACHED",
  "Q09_positive_completion_did_not_remove_reminder_actions",
);

const findingsState = apply(inbookingCompleteState, findings());
const findingsPlan = plan(findingsState, "2027-03-20T12:00:00Z");
const findingsAction = action(findingsPlan, "FINDINGS_REPORT_ATTENTION");
assert(
  findingsPlan.actions.length === 1 &&
    findingsAction?.temporalStatus === "BLOCKED" &&
    findingsAction.coordinationMode === "INTERNAL_COMPLIANCE_ATTENTION" &&
    findingsAction.sourceReference === "findings-report:2026:001" &&
    !action(findingsPlan, "STATEMENT_POSSESSION_ATTENTION") &&
    !action(findingsPlan, "STATEMENT_SUBMISSION_ATTENTION"),
  "Q10_findings_attention_or_positive_path_isolation_invalid",
);

const beforeYearEnd = plan(initial(), "2027-03-31T21:59:59Z");
const atYearEnd = plan(initial(), "2027-03-31T22:00:00Z");
const yearEndAction = action(atYearEnd, "YEAR_END_OPERATIONAL_ATTENTION");
assert(
  !action(beforeYearEnd, "YEAR_END_OPERATIONAL_ATTENTION") &&
    yearEndAction?.temporalStatus === "REACHED" &&
    yearEndAction.boundary === "2027-04-01" &&
    yearEndAction.responsibleActor === "SYSTEM_CALENDAR" &&
    yearEndAction.coordinationMode === "OPERATIONAL_MILESTONE",
  "Q11_year_end_milestone_boundary_invalid",
);

const sevenDayPolicyResult = validateComplianceActionPlanPolicyV1({
  ...defaultPolicy,
  policyVersion: "enval-internal-seven-day-proof-v1",
  leadTimeDays: 7,
});
assert(sevenDayPolicyResult.ok, "seven_day_policy_rejected");
const sevenDayPolicy = sevenDayPolicyResult.value;
const fourteenDayAtFeb18 = plan(initial(), "2027-02-18T12:00:00Z");
const sevenDayAtFeb18 = plan(
  initial(),
  "2027-02-18T12:00:00Z",
  sevenDayPolicy,
);
const sevenDayAtFeb19 = plan(
  initial(),
  "2027-02-19T12:00:00Z",
  sevenDayPolicy,
);
assert(
  Boolean(action(fourteenDayAtFeb18, "INBOOKING_CUTOFF_ATTENTION")) &&
    !action(sevenDayAtFeb18, "INBOOKING_CUTOFF_ATTENTION") &&
    action(sevenDayAtFeb19, "INBOOKING_CUTOFF_ATTENTION")?.boundary ===
      "2027-02-26" &&
    action(sevenDayAtFeb19, "INBOOKING_CUTOFF_ATTENTION")
        ?.responsibleActor === "INBOEKER",
  "Q12_policy_variation_changed_more_than_entry_window",
);

const deterministicA = plan(initial(), "2027-05-02T12:00:00Z");
const deterministicB = plan(initial(), "2027-05-02T12:00:00Z");
const expectedOrder = [
  "INBOOKING_CUTOFF_ATTENTION",
  "STATEMENT_POSSESSION_ATTENTION",
  "YEAR_END_OPERATIONAL_ATTENTION",
  "STATEMENT_SUBMISSION_ATTENTION",
  "VERIFIER_REV_REGISTRATION_ATTENTION",
];
assert(
  JSON.stringify(deterministicA) === JSON.stringify(deterministicB) &&
    deterministicA.actions.map((item) => item.actionKind).join("|") ===
      expectedOrder.join("|") &&
    new Set(deterministicA.actions.map((item) => item.actionKey)).size ===
      deterministicA.actions.length,
  "Q13_action_keys_or_order_not_deterministic",
);

const revisedCalendar = {
  ...DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  calendarVersion: "reg01-delivery-year-2026-v2",
};
const revisedPlan = plan(
  initial(),
  "2027-02-12T12:00:00Z",
  defaultPolicy,
  revisedCalendar,
);
assert(
  leadInbooking?.actionKey !==
      action(revisedPlan, "INBOOKING_CUTOFF_ATTENTION")?.actionKey &&
    leadInbooking?.source.calendarVersion ===
      DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1.calendarVersion &&
    action(revisedPlan, "INBOOKING_CUTOFF_ATTENTION")?.source
        .calendarVersion === "reg01-delivery-year-2026-v2",
  "Q14_changed_calendar_version_collided_or_lost_provenance",
);

const unknownState = {
  ...initial(),
  schemaVersion: "delivery-year-compliance-state-v2",
};
const unknownCalendar = {
  ...DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  schemaVersion: "delivery-year-compliance-calendar-v2",
};
const unknownStateResult = buildComplianceActionPlan(
  unknownState,
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  "2027-02-12T12:00:00Z",
  defaultPolicy,
);
const unknownCalendarResult = buildComplianceActionPlan(
  initial(),
  unknownCalendar,
  "2027-02-12T12:00:00Z",
  defaultPolicy,
);
assert(
  !unknownStateResult.ok && unknownStateResult.code === "invalid_state" &&
    !unknownCalendarResult.ok && unknownCalendarResult.code ===
      "invalid_calendar",
  "Q15_unknown_source_version_not_fail_closed",
);

const mutationState = initial();
const stateBefore = JSON.stringify(mutationState);
const calendarBefore = JSON.stringify(
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
);
const policyBefore = JSON.stringify(defaultPolicy);
const immutablePlan = plan(mutationState, "2027-05-02T12:00:00Z");
assert(
  JSON.stringify(mutationState) === stateBefore &&
    JSON.stringify(DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1) ===
      calendarBefore &&
    JSON.stringify(defaultPolicy) === policyBefore &&
    Object.isFrozen(immutablePlan) && Object.isFrozen(immutablePlan.actions) &&
    immutablePlan.actions.every((item) =>
      Object.isFrozen(item) && Object.isFrozen(item.source) &&
      Object.isFrozen(item.source.sourceReferences)
    ),
  "Q16_inputs_mutated_or_output_not_deeply_immutable",
);

const moduleSource = await Deno.readTextFile(
  "platform/runtime/compliance/compliance_action_plan.ts",
);
assert(
  moduleSource.includes("assessDeliveryYearCompliance(") &&
    !/(inbookingCutoff|statementPossessionBefore|yearEndBoundary|statementSubmissionBefore|verifierResultRegistrationBefore)/
      .test(moduleSource) &&
    !/(2027-02-26|2027-04-01|2027-05-01|weekend|working.day|workday)/i
      .test(moduleSource) &&
    leadInbooking?.boundary ===
      DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1.inbookingCutoff &&
    submissionAction?.boundary ===
      DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1.statementSubmissionBefore &&
    revAction?.boundary ===
      DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1
        .verifierResultRegistrationBefore,
  "Q17_reg02_not_single_deadline_source",
);

assert(
  COMPLIANCE_ACTION_PLAN_POLICY_SCHEMA_VERSION ===
      "compliance-action-plan-policy-v1" &&
    COMPLIANCE_ACTION_SCHEMA_VERSION === "compliance-action-v1" &&
    COMPLIANCE_ACTION_PLAN_SCHEMA_VERSION === "compliance-action-plan-v1" &&
    !/from\s+["'][^"']*(?:workforce|mail|reminder-worker|retention|supabase|react)/i
      .test(moduleSource) &&
    !/(createClient|\.rpc\s*\(|\.from\s*\(|fetch\s*\(|Deno\.|app_audit_events|app_idempotency_keys|locked_unpaid|capability|seniority|approval)/
      .test(moduleSource) &&
    !Object.hasOwn(immutablePlan, "customerId") &&
    immutablePlan.actions.every((item) =>
      !Object.hasOwn(item, "workforceRole") &&
      !Object.hasOwn(item, "presentation") &&
      !Object.hasOwn(item, "customAction")
    ),
  "Q18_authority_persistence_or_legacy_boundary_violated",
);

console.log("COMPLIANCE_ACTION_PLAN_Q01_Q18=PASS");
