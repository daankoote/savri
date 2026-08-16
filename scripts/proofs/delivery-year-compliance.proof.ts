import {
  applyDeliveryYearComplianceEvent,
  assessDeliveryYearCompliance,
  createInitialDeliveryYearComplianceStateV1,
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  DELIVERY_YEAR_COMPLIANCE_ACTORS,
  DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION,
  DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION,
  DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES,
  type DeliveryYearComplianceEventV1,
  type DeliveryYearComplianceStateV1,
  validateDeliveryYearComplianceCalendarV1,
} from "../../platform/runtime/compliance/delivery_year_compliance.ts";

class ProofFailure extends Error {}

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

function initial(deliveryYear = 2026): DeliveryYearComplianceStateV1 {
  const result = createInitialDeliveryYearComplianceStateV1(deliveryYear);
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
  deliveryYear = 2026,
) {
  return {
    schemaVersion: DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION,
    eventId,
    eventType,
    actor,
    deliveryYear,
    occurredAt,
    evidenceReference: `evidence:${eventId}`,
  };
}

function inbooking(
  occurredAt = "2027-02-26T10:00:00Z",
  eventId = "event:inbooking",
) {
  return eventBase(
    eventId,
    "INBOOKING_COMPLETED",
    "INBOEKER",
    occurredAt,
  );
}

function statement(
  occurredAt = "2027-03-20T10:00:00Z",
  eventId = "event:statement",
) {
  return {
    ...eventBase(
      eventId,
      "VERIFICATION_STATEMENT_POSSESSED",
      "INBOEKER",
      occurredAt,
    ),
    verificationResultReference: "verification-result:2026:positive",
    statementReference: "statement:2026:001",
  };
}

function findings(
  occurredAt = "2027-03-20T10:00:00Z",
  eventId = "event:findings",
) {
  return {
    ...eventBase(
      eventId,
      "VERIFICATION_FINDINGS_REPORT_RECEIVED",
      "INBOEKER",
      occurredAt,
    ),
    verificationResultReference: "verification-result:2026:findings",
    findingsReportReference: "findings-report:2026:001",
  };
}

function submission(
  occurredAt = "2027-04-15T10:00:00Z",
  eventId = "event:submission",
) {
  return {
    ...eventBase(
      eventId,
      "STATEMENT_SUBMITTED_TO_NEA",
      "INBOEKER",
      occurredAt,
    ),
    statementReference: "statement:2026:001",
  };
}

function revRegistration(
  verificationResultReference = "verification-result:2026:positive",
  occurredAt = "2027-04-20T10:00:00Z",
  eventId = "event:rev-registration",
) {
  return {
    ...eventBase(
      eventId,
      "VERIFICATION_RESULT_REGISTERED_IN_REV",
      "VERIFIER",
      occurredAt,
    ),
    verificationResultReference,
  };
}

function replay(events: readonly unknown[]): DeliveryYearComplianceStateV1 {
  return events.reduce<DeliveryYearComplianceStateV1>(apply, initial());
}

const calendar = DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1;
assert(
  calendar.deliveryYear === 2026 &&
    calendar.deliveryYearEnd === "2026-12-31" &&
    calendar.inbookingCutoff === "2027-02-26" &&
    calendar.statementPossessionBefore === "2027-04-01" &&
    calendar.yearEndBoundary === "2027-04-01" &&
    calendar.statementSubmissionBefore === "2027-05-01" &&
    calendar.verifierResultRegistrationBefore === "2027-05-01" &&
    calendar.timeZone === "Europe/Amsterdam" &&
    Object.isFrozen(calendar) && Object.isFrozen(calendar.sourceReferences),
  "Q01_canonical_2026_calendar_invalid",
);

const futureCalendar = validateDeliveryYearComplianceCalendarV1({
  ...calendar,
  calendarVersion: "authoritative-delivery-year-2027-v1",
  deliveryYear: 2027,
  deliveryYearEnd: "2027-12-31",
  inbookingCutoff: "2028-02-25",
  statementPossessionBefore: "2028-04-01",
  yearEndBoundary: "2028-04-01",
  statementSubmissionBefore: "2028-05-01",
  verifierResultRegistrationBefore: "2028-05-01",
});
const guessed2026Cutoff = validateDeliveryYearComplianceCalendarV1({
  ...calendar,
  inbookingCutoff: "2027-02-28",
});
const missingCutoff = { ...calendar } as Record<string, unknown>;
delete missingCutoff.inbookingCutoff;
assert(
  futureCalendar.ok && !guessed2026Cutoff.ok &&
    guessed2026Cutoff.code === "invalid_delivery_year_2026_cutoff" &&
    !validateDeliveryYearComplianceCalendarV1(missingCutoff).ok,
  "Q02_authoritative_cutoff_contract_not_fail_closed",
);

assert(
  DELIVERY_YEAR_COMPLIANCE_ACTORS.join("|") ===
    "INBOEKER|VERIFIER|NEA_REV|SYSTEM_CALENDAR",
  "Q03_actor_model_not_closed",
);

const eventWithTruthBag = {
  ...inbooking(),
  businessTruth: { mutable: true },
};
const truthBagResult = applyDeliveryYearComplianceEvent(
  initial(),
  eventWithTruthBag,
);
assert(
  !truthBagResult.ok && truthBagResult.code === "unknown_event_field",
  "Q04_event_contract_accepted_free_form_truth",
);

const positiveEvents = [
  inbooking(),
  statement(),
  submission(),
  revRegistration(),
] as const;
const positiveState = replay(positiveEvents);
const positiveAssessment = assessDeliveryYearCompliance(
  positiveState,
  calendar,
  "2027-04-20T12:00:00Z",
);
assert(
  positiveAssessment.ok &&
    positiveAssessment.value.verificationCondition === "POSITIVE_STATEMENT" &&
    positiveAssessment.value.inbooking.status === "COMPLETE" &&
    positiveAssessment.value.statementPossession.status === "COMPLETE" &&
    positiveAssessment.value.statementSubmission.status === "COMPLETE" &&
    positiveAssessment.value.verifierRevRegistration.status === "COMPLETE" &&
    positiveAssessment.value.yearEnd.status === "REACHED" &&
    !Object.hasOwn(positiveAssessment.value, "status"),
  "Q05_positive_statement_path_invalid",
);

const findingsState = replay([
  inbooking(),
  findings(),
  revRegistration(
    "verification-result:2026:findings",
    "2027-04-20T10:00:00Z",
  ),
]);
const findingsAssessment = assessDeliveryYearCompliance(
  findingsState,
  calendar,
  "2027-04-25T12:00:00Z",
);
assert(
  findingsAssessment.ok &&
    findingsAssessment.value.verificationCondition ===
      "NON_POSITIVE_FINDINGS" &&
    findingsAssessment.value.statementPossession.status === "BLOCKED" &&
    findingsAssessment.value.statementSubmission.status === "NOT_APPLICABLE" &&
    findingsAssessment.value.verifierRevRegistration.status === "COMPLETE" &&
    findingsState.verificationOutcome.status === "FINDINGS_REPORT_RECEIVED" &&
    !JSON.stringify(findingsState).includes("statementReference"),
  "Q06_findings_report_path_invalid",
);

const wrongActor = applyDeliveryYearComplianceEvent(initial(), {
  ...statement(),
  actor: "VERIFIER",
});
const wrongSubmissionActor = applyDeliveryYearComplianceEvent(
  apply(initial(), statement()),
  { ...submission(), actor: "NEA_REV" },
);
const wrongRevActor = applyDeliveryYearComplianceEvent(
  apply(initial(), statement()),
  { ...revRegistration(), actor: "INBOEKER" },
);
assert(
  !wrongActor.ok && wrongActor.code === "wrong_actor" &&
    !wrongSubmissionActor.ok && wrongSubmissionActor.code === "wrong_actor" &&
    !wrongRevActor.ok && wrongRevActor.code === "wrong_actor",
  "Q07_wrong_actor_not_rejected",
);

const wrongYear = applyDeliveryYearComplianceEvent(initial(), {
  ...inbooking(),
  deliveryYear: 2027,
});
assert(
  !wrongYear.ok && wrongYear.code === "wrong_delivery_year",
  "Q08_wrong_delivery_year_not_rejected",
);

const statementState = apply(initial(), statement());
const conflictingOutcome = applyDeliveryYearComplianceEvent(
  statementState,
  findings("2027-03-21T10:00:00Z"),
);
assert(
  !conflictingOutcome.ok &&
    conflictingOutcome.code === "conflicting_verification_outcome",
  "Q09_conflicting_verification_outcome_not_rejected",
);

const submissionWithoutStatement = applyDeliveryYearComplianceEvent(
  initial(),
  submission(),
);
const submissionAfterFindings = applyDeliveryYearComplianceEvent(
  apply(initial(), findings()),
  submission(),
);
assert(
  !submissionWithoutStatement.ok &&
    submissionWithoutStatement.code ===
      "statement_submission_without_positive_statement" &&
    !submissionAfterFindings.ok &&
    submissionAfterFindings.code ===
      "statement_submission_without_positive_statement",
  "Q10_submission_without_statement_not_rejected",
);

const unknownVersion = applyDeliveryYearComplianceEvent(initial(), {
  ...inbooking(),
  schemaVersion: "delivery-year-compliance-event-v2",
});
const unknownType = applyDeliveryYearComplianceEvent(initial(), {
  ...inbooking(),
  eventType: "CALENDAR_BOUNDARY_REACHED",
});
assert(
  !unknownVersion.ok && unknownVersion.code === "unsupported_event_version" &&
    !unknownType.ok && unknownType.code === "unknown_event_type",
  "Q11_unknown_event_or_version_not_rejected",
);

const oneEventState = apply(initial(), inbooking());
const identicalReplay = applyDeliveryYearComplianceEvent(
  oneEventState,
  inbooking(),
);
const conflictingReplay = applyDeliveryYearComplianceEvent(oneEventState, {
  ...inbooking(),
  evidenceReference: "evidence:event:inbooking:changed",
});
const duplicateEvent = applyDeliveryYearComplianceEvent(
  oneEventState,
  inbooking("2027-02-26T11:00:00Z", "event:inbooking:duplicate"),
);
assert(
  identicalReplay.ok && identicalReplay.idempotent &&
    identicalReplay.value === oneEventState &&
    !conflictingReplay.ok &&
    conflictingReplay.code === "conflicting_event_replay" &&
    !duplicateEvent.ok &&
    duplicateEvent.code === "duplicate_consequential_event",
  "Q12_duplicate_or_replay_semantics_invalid",
);

const chronologyRegression = applyDeliveryYearComplianceEvent(
  oneEventState,
  statement("2027-02-25T10:00:00Z"),
);
assert(
  !chronologyRegression.ok &&
    chronologyRegression.code === "event_chronology_regression",
  "Q13_event_chronology_regression_not_rejected",
);

function statementAssessment(occurredAt: string) {
  const state = replay([inbooking(), statement(occurredAt)]);
  return assessDeliveryYearCompliance(
    state,
    calendar,
    "2027-04-02T12:00:00Z",
  );
}
const possessionLastValid = statementAssessment("2027-03-31T21:59:59Z");
const possessionAtBoundary = statementAssessment("2027-03-31T22:00:00Z");
assert(
  possessionLastValid.ok &&
    possessionLastValid.value.statementPossession.status === "COMPLETE" &&
    possessionAtBoundary.ok &&
    possessionAtBoundary.value.statementPossession.status === "OVERDUE",
  "Q14_statement_possession_boundary_invalid",
);

function submissionAssessment(occurredAt: string) {
  const state = replay([inbooking(), statement(), submission(occurredAt)]);
  return assessDeliveryYearCompliance(
    state,
    calendar,
    "2027-05-02T12:00:00Z",
  );
}
const submissionLastValid = submissionAssessment("2027-04-30T21:59:59Z");
const submissionAtBoundary = submissionAssessment("2027-04-30T22:00:00Z");
assert(
  submissionLastValid.ok &&
    submissionLastValid.value.statementSubmission.status === "COMPLETE" &&
    submissionAtBoundary.ok &&
    submissionAtBoundary.value.statementSubmission.status === "OVERDUE",
  "Q15_statement_submission_boundary_invalid",
);

function revAssessment(occurredAt: string) {
  const state = replay([
    inbooking(),
    statement(),
    revRegistration(
      "verification-result:2026:positive",
      occurredAt,
    ),
  ]);
  return assessDeliveryYearCompliance(
    state,
    calendar,
    "2027-05-02T12:00:00Z",
  );
}
const revLastValid = revAssessment("2027-04-30T21:59:59Z");
const revAtBoundary = revAssessment("2027-04-30T22:00:00Z");
assert(
  revLastValid.ok &&
    revLastValid.value.verifierRevRegistration.status === "COMPLETE" &&
    revAtBoundary.ok &&
    revAtBoundary.value.verifierRevRegistration.status === "OVERDUE",
  "Q16_rev_registration_boundary_invalid",
);

const inbookingLastValid = assessDeliveryYearCompliance(
  apply(initial(), inbooking("2027-02-26T22:59:59Z")),
  calendar,
  "2027-02-27T12:00:00Z",
);
const inbookingAfterCutoff = assessDeliveryYearCompliance(
  apply(
    initial(),
    inbooking("2027-02-26T23:00:00Z", "event:inbooking:late"),
  ),
  calendar,
  "2027-02-27T12:00:00Z",
);
assert(
  inbookingLastValid.ok &&
    inbookingLastValid.value.inbooking.status === "COMPLETE" &&
    inbookingAfterCutoff.ok &&
    inbookingAfterCutoff.value.inbooking.status === "OVERDUE",
  "Q17_inbooking_cutoff_or_weekend_inference_invalid",
);

const overdue = assessDeliveryYearCompliance(
  initial(),
  calendar,
  "2027-05-02T12:00:00Z",
);
assert(
  overdue.ok && overdue.value.inbooking.status === "OVERDUE" &&
    overdue.value.statementPossession.status === "OVERDUE" &&
    overdue.value.statementSubmission.status === "BLOCKED" &&
    overdue.value.verifierRevRegistration.status === "BLOCKED" &&
    overdue.value.yearEnd.status === "REACHED" &&
    !Object.hasOwn(overdue.value, "overallStatus"),
  "Q18_non_linear_overdue_assessment_invalid",
);

const initialA = initial();
const initialBefore = JSON.stringify(initialA);
const replayA = positiveEvents.reduce<DeliveryYearComplianceStateV1>(
  apply,
  initialA,
);
const replayB = replay(positiveEvents);
assert(
  JSON.stringify(replayA) === JSON.stringify(replayB) &&
    JSON.stringify(initialA) === initialBefore &&
    initialA.appliedEvents.length === 0 &&
    Object.isFrozen(replayA) && Object.isFrozen(replayA.appliedEvents) &&
    replayA.appliedEvents.every(Object.isFrozen),
  "Q19_replay_not_deterministic_or_input_mutated",
);

const moduleSource = await Deno.readTextFile(
  "platform/runtime/compliance/delivery_year_compliance.ts",
);
const forgedAuthorityEvent = applyDeliveryYearComplianceEvent(initial(), {
  ...inbooking(),
  workforceRole: "admin",
});
const forgedCustomerEvent = applyDeliveryYearComplianceEvent(initial(), {
  ...inbooking(),
  customerAccess: "granted",
});
const brandedCalendar = validateDeliveryYearComplianceCalendarV1({
  ...calendar,
  presentationBrand: "alternate",
});
assert(
  DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES.join("|") ===
      "REG-CONFLICT-001|NEA-VER-002|NEA-OPS-001" &&
    !/from\s+["'][^"']*(?:workforce|presentation|tenant|customer|auth)/i.test(
      moduleSource,
    ) &&
    !/(workforcePermission|workforceReviewer|representationAuthority|customerAccess|presentationBrand)/
      .test(JSON.stringify(replayA)) &&
    !forgedAuthorityEvent.ok &&
    forgedAuthorityEvent.code === "unknown_event_field" &&
    !forgedCustomerEvent.ok &&
    forgedCustomerEvent.code === "unknown_event_field" &&
    !brandedCalendar.ok && brandedCalendar.code === "unknown_calendar_field",
  "Q20_traceability_or_authority_boundary_invalid",
);

console.log("DELIVERY_YEAR_COMPLIANCE_Q01_Q20=PASS");
