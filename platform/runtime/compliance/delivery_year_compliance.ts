export const DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION =
  "delivery-year-compliance-calendar-v1" as const;
export const DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION =
  "delivery-year-compliance-event-v1" as const;
export const DELIVERY_YEAR_COMPLIANCE_STATE_SCHEMA_VERSION =
  "delivery-year-compliance-state-v1" as const;
export const DELIVERY_YEAR_COMPLIANCE_ASSESSMENT_SCHEMA_VERSION =
  "delivery-year-compliance-assessment-v1" as const;

export const DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES = Object.freeze(
  [
    "REG-CONFLICT-001",
    "NEA-VER-002",
    "NEA-OPS-001",
  ] as const,
);

export const DELIVERY_YEAR_COMPLIANCE_ACTORS = Object.freeze(
  [
    "INBOEKER",
    "VERIFIER",
    "NEA_REV",
    "SYSTEM_CALENDAR",
  ] as const,
);

export type DeliveryYearComplianceActor =
  typeof DELIVERY_YEAR_COMPLIANCE_ACTORS[number];
export type DeliveryYearComplianceSourceReference =
  typeof DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES[number];

export type DeliveryYearComplianceCalendarV1 = Readonly<{
  schemaVersion: typeof DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION;
  calendarVersion: string;
  deliveryYear: number;
  deliveryYearEnd: string;
  inbookingCutoff: string;
  statementPossessionBefore: string;
  yearEndBoundary: string;
  statementSubmissionBefore: string;
  verifierResultRegistrationBefore: string;
  timeZone: "Europe/Amsterdam";
  sourceReferences: readonly DeliveryYearComplianceSourceReference[];
}>;

export type DeliveryYearComplianceCalendarFailureCode =
  | "invalid_calendar_shape"
  | "unknown_calendar_field"
  | "unsupported_calendar_version"
  | "invalid_calendar_version"
  | "invalid_delivery_year"
  | "invalid_calendar_date"
  | "invalid_calendar_timezone"
  | "invalid_calendar_source_references"
  | "invalid_inbooking_cutoff"
  | "invalid_delivery_year_2026_cutoff"
  | "invalid_statutory_boundary";

export type DeliveryYearComplianceCalendarResult =
  | Readonly<{ ok: true; value: DeliveryYearComplianceCalendarV1 }>
  | Readonly<{
    ok: false;
    code: DeliveryYearComplianceCalendarFailureCode;
  }>;

type DeliveryYearComplianceEventBase = Readonly<{
  schemaVersion: typeof DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION;
  eventId: string;
  deliveryYear: number;
  occurredAt: string;
  evidenceReference: string;
}>;

export type InbookingCompletedEventV1 =
  & DeliveryYearComplianceEventBase
  & Readonly<{
    eventType: "INBOOKING_COMPLETED";
    actor: "INBOEKER";
  }>;

export type VerificationStatementPossessedEventV1 =
  & DeliveryYearComplianceEventBase
  & Readonly<{
    eventType: "VERIFICATION_STATEMENT_POSSESSED";
    actor: "INBOEKER";
    verificationResultReference: string;
    statementReference: string;
  }>;

export type VerificationFindingsReportReceivedEventV1 =
  & DeliveryYearComplianceEventBase
  & Readonly<{
    eventType: "VERIFICATION_FINDINGS_REPORT_RECEIVED";
    actor: "INBOEKER";
    verificationResultReference: string;
    findingsReportReference: string;
  }>;

export type StatementSubmittedToNeaEventV1 =
  & DeliveryYearComplianceEventBase
  & Readonly<{
    eventType: "STATEMENT_SUBMITTED_TO_NEA";
    actor: "INBOEKER";
    statementReference: string;
  }>;

export type VerificationResultRegisteredInRevEventV1 =
  & DeliveryYearComplianceEventBase
  & Readonly<{
    eventType: "VERIFICATION_RESULT_REGISTERED_IN_REV";
    actor: "VERIFIER";
    verificationResultReference: string;
  }>;

export type DeliveryYearComplianceEventV1 =
  | InbookingCompletedEventV1
  | VerificationStatementPossessedEventV1
  | VerificationFindingsReportReceivedEventV1
  | StatementSubmittedToNeaEventV1
  | VerificationResultRegisteredInRevEventV1;

type PendingDimension = Readonly<{ status: "PENDING" }>;

export type DeliveryYearComplianceStateV1 = Readonly<{
  schemaVersion: typeof DELIVERY_YEAR_COMPLIANCE_STATE_SCHEMA_VERSION;
  deliveryYear: number;
  lastOccurredAt: string | null;
  appliedEvents: readonly DeliveryYearComplianceEventV1[];
  inbooking:
    | PendingDimension
    | Readonly<{
      status: "COMPLETED";
      occurredAt: string;
      evidenceReference: string;
    }>;
  verificationOutcome:
    | PendingDimension
    | Readonly<{
      status: "STATEMENT_POSSESSED";
      occurredAt: string;
      evidenceReference: string;
      verificationResultReference: string;
      statementReference: string;
    }>
    | Readonly<{
      status: "FINDINGS_REPORT_RECEIVED";
      occurredAt: string;
      evidenceReference: string;
      verificationResultReference: string;
      findingsReportReference: string;
    }>;
  yearEnd: Readonly<{ basis: "CALENDAR_BOUNDARY" }>;
  statementSubmission:
    | PendingDimension
    | Readonly<{
      status: "SUBMITTED";
      occurredAt: string;
      evidenceReference: string;
      statementReference: string;
    }>;
  verifierRevRegistration:
    | PendingDimension
    | Readonly<{
      status: "REGISTERED";
      occurredAt: string;
      evidenceReference: string;
      verificationResultReference: string;
    }>;
}>;

export type DeliveryYearComplianceTransitionFailureCode =
  | "invalid_state"
  | "invalid_event_shape"
  | "unknown_event_field"
  | "unsupported_event_version"
  | "unknown_event_type"
  | "invalid_event_reference"
  | "invalid_event_timestamp"
  | "wrong_actor"
  | "wrong_delivery_year"
  | "event_chronology_regression"
  | "conflicting_event_replay"
  | "duplicate_consequential_event"
  | "conflicting_verification_outcome"
  | "statement_submission_without_positive_statement"
  | "statement_reference_mismatch"
  | "result_registration_without_verification_outcome"
  | "verification_result_reference_mismatch";

export type DeliveryYearComplianceTransitionResult =
  | Readonly<{
    ok: true;
    value: DeliveryYearComplianceStateV1;
    idempotent: boolean;
  }>
  | Readonly<{
    ok: false;
    code: DeliveryYearComplianceTransitionFailureCode;
  }>;

export type DeliveryYearComplianceObligationStatus =
  | "UPCOMING"
  | "DUE"
  | "COMPLETE"
  | "OVERDUE"
  | "BLOCKED"
  | "NOT_APPLICABLE";

export type DeliveryYearComplianceAssessmentItem = Readonly<{
  status: DeliveryYearComplianceObligationStatus;
  boundary: string;
  boundarySemantics: "INCLUSIVE_CUTOFF" | "EXCLUSIVE_BEFORE";
  occurredAt: string | null;
  reason:
    | "positive_statement_not_possessed"
    | "verification_outcome_pending"
    | "non_positive_verification_outcome"
    | null;
}>;

export type DeliveryYearComplianceAssessmentV1 = Readonly<{
  schemaVersion: typeof DELIVERY_YEAR_COMPLIANCE_ASSESSMENT_SCHEMA_VERSION;
  deliveryYear: number;
  asOf: string;
  asOfCalendarDate: string;
  verificationCondition:
    | "PENDING"
    | "POSITIVE_STATEMENT"
    | "NON_POSITIVE_FINDINGS";
  inbooking: DeliveryYearComplianceAssessmentItem;
  statementPossession: DeliveryYearComplianceAssessmentItem;
  yearEnd: Readonly<{
    status: "UPCOMING" | "REACHED";
    boundary: string;
    boundarySemantics: "CALENDAR_BOUNDARY";
  }>;
  statementSubmission: DeliveryYearComplianceAssessmentItem;
  verifierRevRegistration: DeliveryYearComplianceAssessmentItem;
}>;

export type DeliveryYearComplianceAssessmentFailureCode =
  | "invalid_state"
  | "invalid_calendar"
  | "wrong_delivery_year"
  | "invalid_as_of";

export type DeliveryYearComplianceAssessmentResult =
  | Readonly<{ ok: true; value: DeliveryYearComplianceAssessmentV1 }>
  | Readonly<{
    ok: false;
    code: DeliveryYearComplianceAssessmentFailureCode;
  }>;

const CALENDAR_KEYS = Object.freeze([
  "calendarVersion",
  "deliveryYear",
  "deliveryYearEnd",
  "inbookingCutoff",
  "schemaVersion",
  "sourceReferences",
  "statementPossessionBefore",
  "statementSubmissionBefore",
  "timeZone",
  "verifierResultRegistrationBefore",
  "yearEndBoundary",
]);
const EVENT_BASE_KEYS = Object.freeze([
  "actor",
  "deliveryYear",
  "eventId",
  "eventType",
  "evidenceReference",
  "occurredAt",
  "schemaVersion",
]);
const EVENT_TYPES = new Set([
  "INBOOKING_COMPLETED",
  "VERIFICATION_STATEMENT_POSSESSED",
  "VERIFICATION_FINDINGS_REPORT_RECEIVED",
  "STATEMENT_SUBMITTED_TO_NEA",
  "VERIFICATION_RESULT_REGISTERED_IN_REV",
]);
const ACTORS = new Set<DeliveryYearComplianceActor>(
  DELIVERY_YEAR_COMPLIANCE_ACTORS,
);
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const OPAQUE_REFERENCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" &&
    !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}

function isDeliveryYear(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 2000 &&
    Number(value) <= 9999;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value));
}

function isOpaqueReference(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_REFERENCE_PATTERN.test(value);
}

function sourceReferencesAreExact(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length === DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES.length &&
    value.every((reference, index) =>
      reference === DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES[index]
    );
}

function freezeCalendar(
  value: Record<string, unknown>,
): DeliveryYearComplianceCalendarV1 {
  return Object.freeze({
    schemaVersion: DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION,
    calendarVersion: String(value.calendarVersion),
    deliveryYear: Number(value.deliveryYear),
    deliveryYearEnd: String(value.deliveryYearEnd),
    inbookingCutoff: String(value.inbookingCutoff),
    statementPossessionBefore: String(value.statementPossessionBefore),
    yearEndBoundary: String(value.yearEndBoundary),
    statementSubmissionBefore: String(value.statementSubmissionBefore),
    verifierResultRegistrationBefore: String(
      value.verifierResultRegistrationBefore,
    ),
    timeZone: "Europe/Amsterdam",
    sourceReferences: DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES,
  });
}

export function validateDeliveryYearComplianceCalendarV1(
  input: unknown,
): DeliveryYearComplianceCalendarResult {
  if (!isRecord(input)) return { ok: false, code: "invalid_calendar_shape" };
  if (!hasOnlyKeys(input, CALENDAR_KEYS)) {
    return { ok: false, code: "unknown_calendar_field" };
  }
  if (!hasExactKeys(input, CALENDAR_KEYS)) {
    return { ok: false, code: "invalid_calendar_shape" };
  }
  if (
    input.schemaVersion !== DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION
  ) {
    return { ok: false, code: "unsupported_calendar_version" };
  }
  if (
    typeof input.calendarVersion !== "string" ||
    !VERSION_PATTERN.test(input.calendarVersion)
  ) return { ok: false, code: "invalid_calendar_version" };
  if (!isDeliveryYear(input.deliveryYear)) {
    return { ok: false, code: "invalid_delivery_year" };
  }
  for (
    const key of [
      "deliveryYearEnd",
      "inbookingCutoff",
      "statementPossessionBefore",
      "yearEndBoundary",
      "statementSubmissionBefore",
      "verifierResultRegistrationBefore",
    ]
  ) {
    if (!isCalendarDate(input[key])) {
      return { ok: false, code: "invalid_calendar_date" };
    }
  }
  if (input.timeZone !== "Europe/Amsterdam") {
    return { ok: false, code: "invalid_calendar_timezone" };
  }
  if (!sourceReferencesAreExact(input.sourceReferences)) {
    return { ok: false, code: "invalid_calendar_source_references" };
  }

  const deliveryYear = input.deliveryYear;
  const followingYear = deliveryYear + 1;
  const inbookingCutoff = input.inbookingCutoff;
  if (!isCalendarDate(inbookingCutoff)) {
    return { ok: false, code: "invalid_calendar_date" };
  }
  if (input.deliveryYearEnd !== `${deliveryYear}-12-31`) {
    return { ok: false, code: "invalid_statutory_boundary" };
  }
  if (
    inbookingCutoff < `${followingYear}-01-01` ||
    inbookingCutoff >= `${followingYear}-03-01`
  ) return { ok: false, code: "invalid_inbooking_cutoff" };
  if (deliveryYear === 2026 && inbookingCutoff !== "2027-02-26") {
    return { ok: false, code: "invalid_delivery_year_2026_cutoff" };
  }
  if (
    input.statementPossessionBefore !== `${followingYear}-04-01` ||
    input.yearEndBoundary !== `${followingYear}-04-01` ||
    input.statementSubmissionBefore !== `${followingYear}-05-01` ||
    input.verifierResultRegistrationBefore !== `${followingYear}-05-01`
  ) return { ok: false, code: "invalid_statutory_boundary" };

  return { ok: true, value: freezeCalendar(input) };
}

function pending(): PendingDimension {
  return Object.freeze({ status: "PENDING" });
}

export function createInitialDeliveryYearComplianceStateV1(
  deliveryYear: unknown,
): DeliveryYearComplianceTransitionResult {
  if (!isDeliveryYear(deliveryYear)) {
    return { ok: false, code: "invalid_state" };
  }
  return {
    ok: true,
    idempotent: false,
    value: Object.freeze({
      schemaVersion: DELIVERY_YEAR_COMPLIANCE_STATE_SCHEMA_VERSION,
      deliveryYear,
      lastOccurredAt: null,
      appliedEvents: Object.freeze([]),
      inbooking: pending(),
      verificationOutcome: pending(),
      yearEnd: Object.freeze({ basis: "CALENDAR_BOUNDARY" }),
      statementSubmission: pending(),
      verifierRevRegistration: pending(),
    }),
  };
}

function eventKeys(eventType: string): readonly string[] {
  switch (eventType) {
    case "VERIFICATION_STATEMENT_POSSESSED":
      return [
        ...EVENT_BASE_KEYS,
        "statementReference",
        "verificationResultReference",
      ];
    case "VERIFICATION_FINDINGS_REPORT_RECEIVED":
      return [
        ...EVENT_BASE_KEYS,
        "findingsReportReference",
        "verificationResultReference",
      ];
    case "STATEMENT_SUBMITTED_TO_NEA":
      return [...EVENT_BASE_KEYS, "statementReference"];
    case "VERIFICATION_RESULT_REGISTERED_IN_REV":
      return [...EVENT_BASE_KEYS, "verificationResultReference"];
    default:
      return EVENT_BASE_KEYS;
  }
}

function allowedActor(eventType: string): DeliveryYearComplianceActor {
  return eventType === "VERIFICATION_RESULT_REGISTERED_IN_REV"
    ? "VERIFIER"
    : "INBOEKER";
}

function validateEvent(
  input: unknown,
):
  | Readonly<{ ok: true; value: DeliveryYearComplianceEventV1 }>
  | Readonly<{
    ok: false;
    code: DeliveryYearComplianceTransitionFailureCode;
  }> {
  if (!isRecord(input)) return { ok: false, code: "invalid_event_shape" };
  if (input.schemaVersion !== DELIVERY_YEAR_COMPLIANCE_EVENT_SCHEMA_VERSION) {
    return { ok: false, code: "unsupported_event_version" };
  }
  if (
    typeof input.eventType !== "string" || !EVENT_TYPES.has(input.eventType)
  ) {
    return { ok: false, code: "unknown_event_type" };
  }
  const expectedKeys = eventKeys(input.eventType);
  if (!hasOnlyKeys(input, expectedKeys)) {
    return { ok: false, code: "unknown_event_field" };
  }
  if (!hasExactKeys(input, expectedKeys)) {
    return { ok: false, code: "invalid_event_shape" };
  }
  if (!isDeliveryYear(input.deliveryYear)) {
    return { ok: false, code: "wrong_delivery_year" };
  }
  if (!ACTORS.has(input.actor as DeliveryYearComplianceActor)) {
    return { ok: false, code: "wrong_actor" };
  }
  if (input.actor !== allowedActor(input.eventType)) {
    return { ok: false, code: "wrong_actor" };
  }
  if (!isInstant(input.occurredAt)) {
    return { ok: false, code: "invalid_event_timestamp" };
  }
  for (const key of expectedKeys.filter((key) => key.endsWith("Reference"))) {
    if (!isOpaqueReference(input[key])) {
      return { ok: false, code: "invalid_event_reference" };
    }
  }
  if (!isOpaqueReference(input.eventId)) {
    return { ok: false, code: "invalid_event_reference" };
  }
  return {
    ok: true,
    value: Object.freeze({ ...input }) as DeliveryYearComplianceEventV1,
  };
}

const STATE_KEYS = Object.freeze([
  "appliedEvents",
  "deliveryYear",
  "inbooking",
  "lastOccurredAt",
  "schemaVersion",
  "statementSubmission",
  "verificationOutcome",
  "verifierRevRegistration",
  "yearEnd",
]);

function dimensionMatches(
  actual: unknown,
  expected: Record<string, unknown>,
): boolean {
  return isRecord(actual) && hasExactKeys(actual, Object.keys(expected)) &&
    Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function eventHistoryMatchesState(
  state: Record<string, unknown>,
  deliveryYear: number,
): boolean {
  if (!Array.isArray(state.appliedEvents)) return false;
  const events: DeliveryYearComplianceEventV1[] = [];
  const eventIds = new Set<string>();
  let lastOccurredAt: string | null = null;

  for (const input of state.appliedEvents) {
    const validated = validateEvent(input);
    if (!validated.ok || validated.value.deliveryYear !== deliveryYear) {
      return false;
    }
    const event = validated.value;
    if (eventIds.has(event.eventId)) return false;
    if (
      lastOccurredAt !== null &&
      Date.parse(event.occurredAt) < Date.parse(lastOccurredAt)
    ) return false;
    eventIds.add(event.eventId);
    lastOccurredAt = event.occurredAt;
    events.push(event);
  }
  if (state.lastOccurredAt !== lastOccurredAt) return false;

  const inbookingEvents = events.filter((event) =>
    event.eventType === "INBOOKING_COMPLETED"
  );
  const outcomeEvents = events.filter((event) =>
    event.eventType === "VERIFICATION_STATEMENT_POSSESSED" ||
    event.eventType === "VERIFICATION_FINDINGS_REPORT_RECEIVED"
  );
  const submissionEvents = events.filter((event) =>
    event.eventType === "STATEMENT_SUBMITTED_TO_NEA"
  );
  const revEvents = events.filter((event) =>
    event.eventType === "VERIFICATION_RESULT_REGISTERED_IN_REV"
  );
  if (
    inbookingEvents.length > 1 || outcomeEvents.length > 1 ||
    submissionEvents.length > 1 || revEvents.length > 1
  ) return false;

  const inbooking = inbookingEvents[0];
  if (
    !dimensionMatches(
      state.inbooking,
      inbooking
        ? {
          status: "COMPLETED",
          occurredAt: inbooking.occurredAt,
          evidenceReference: inbooking.evidenceReference,
        }
        : { status: "PENDING" },
    )
  ) return false;

  const outcome = outcomeEvents[0];
  const expectedOutcome = !outcome
    ? { status: "PENDING" }
    : outcome.eventType === "VERIFICATION_STATEMENT_POSSESSED"
    ? {
      status: "STATEMENT_POSSESSED",
      occurredAt: outcome.occurredAt,
      evidenceReference: outcome.evidenceReference,
      verificationResultReference: outcome.verificationResultReference,
      statementReference: outcome.statementReference,
    }
    : {
      status: "FINDINGS_REPORT_RECEIVED",
      occurredAt: outcome.occurredAt,
      evidenceReference: outcome.evidenceReference,
      verificationResultReference: outcome.verificationResultReference,
      findingsReportReference: outcome.findingsReportReference,
    };
  if (!dimensionMatches(state.verificationOutcome, expectedOutcome)) {
    return false;
  }

  const submission = submissionEvents[0];
  if (
    submission &&
    (outcome?.eventType !== "VERIFICATION_STATEMENT_POSSESSED" ||
      submission.statementReference !== outcome.statementReference ||
      events.indexOf(submission) <= events.indexOf(outcome))
  ) return false;
  if (
    !dimensionMatches(
      state.statementSubmission,
      submission
        ? {
          status: "SUBMITTED",
          occurredAt: submission.occurredAt,
          evidenceReference: submission.evidenceReference,
          statementReference: submission.statementReference,
        }
        : { status: "PENDING" },
    )
  ) return false;

  const rev = revEvents[0];
  if (
    rev &&
    (!outcome ||
      rev.verificationResultReference !== outcome.verificationResultReference ||
      events.indexOf(rev) <= events.indexOf(outcome))
  ) return false;
  return dimensionMatches(
    state.verifierRevRegistration,
    rev
      ? {
        status: "REGISTERED",
        occurredAt: rev.occurredAt,
        evidenceReference: rev.evidenceReference,
        verificationResultReference: rev.verificationResultReference,
      }
      : { status: "PENDING" },
  );
}

function isState(value: unknown): value is DeliveryYearComplianceStateV1 {
  if (!isRecord(value) || !hasExactKeys(value, STATE_KEYS)) return false;
  if (
    value.schemaVersion !== DELIVERY_YEAR_COMPLIANCE_STATE_SCHEMA_VERSION ||
    !isDeliveryYear(value.deliveryYear) ||
    (value.lastOccurredAt !== null && !isInstant(value.lastOccurredAt)) ||
    !dimensionMatches(value.yearEnd, { basis: "CALENDAR_BOUNDARY" })
  ) return false;
  return eventHistoryMatchesState(value, value.deliveryYear);
}

function eventsEqual(
  left: DeliveryYearComplianceEventV1,
  right: DeliveryYearComplianceEventV1,
): boolean {
  const sorted = (value: DeliveryYearComplianceEventV1) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
  return sorted(left) === sorted(right);
}

function freezeNextState(
  state: DeliveryYearComplianceStateV1,
  event: DeliveryYearComplianceEventV1,
  updates: Partial<DeliveryYearComplianceStateV1>,
): DeliveryYearComplianceStateV1 {
  return Object.freeze({
    ...state,
    ...updates,
    lastOccurredAt: event.occurredAt,
    appliedEvents: Object.freeze([...state.appliedEvents, event]),
  });
}

export function applyDeliveryYearComplianceEvent(
  stateInput: unknown,
  eventInput: unknown,
): DeliveryYearComplianceTransitionResult {
  if (!isState(stateInput)) return { ok: false, code: "invalid_state" };
  const state = stateInput;
  const validatedEvent = validateEvent(eventInput);
  if (!validatedEvent.ok) return validatedEvent;
  const event = validatedEvent.value;
  if (event.deliveryYear !== state.deliveryYear) {
    return { ok: false, code: "wrong_delivery_year" };
  }

  const prior = state.appliedEvents.find((item) =>
    item.eventId === event.eventId
  );
  if (prior) {
    return eventsEqual(prior, event)
      ? { ok: true, value: state, idempotent: true }
      : { ok: false, code: "conflicting_event_replay" };
  }
  if (
    state.lastOccurredAt !== null &&
    Date.parse(event.occurredAt) < Date.parse(state.lastOccurredAt)
  ) return { ok: false, code: "event_chronology_regression" };

  switch (event.eventType) {
    case "INBOOKING_COMPLETED": {
      if (state.inbooking.status !== "PENDING") {
        return { ok: false, code: "duplicate_consequential_event" };
      }
      return {
        ok: true,
        idempotent: false,
        value: freezeNextState(state, event, {
          inbooking: Object.freeze({
            status: "COMPLETED",
            occurredAt: event.occurredAt,
            evidenceReference: event.evidenceReference,
          }),
        }),
      };
    }
    case "VERIFICATION_STATEMENT_POSSESSED": {
      if (state.verificationOutcome.status !== "PENDING") {
        return {
          ok: false,
          code: state.verificationOutcome.status === "FINDINGS_REPORT_RECEIVED"
            ? "conflicting_verification_outcome"
            : "duplicate_consequential_event",
        };
      }
      return {
        ok: true,
        idempotent: false,
        value: freezeNextState(state, event, {
          verificationOutcome: Object.freeze({
            status: "STATEMENT_POSSESSED",
            occurredAt: event.occurredAt,
            evidenceReference: event.evidenceReference,
            verificationResultReference: event.verificationResultReference,
            statementReference: event.statementReference,
          }),
        }),
      };
    }
    case "VERIFICATION_FINDINGS_REPORT_RECEIVED": {
      if (state.verificationOutcome.status !== "PENDING") {
        return {
          ok: false,
          code: state.verificationOutcome.status === "STATEMENT_POSSESSED"
            ? "conflicting_verification_outcome"
            : "duplicate_consequential_event",
        };
      }
      return {
        ok: true,
        idempotent: false,
        value: freezeNextState(state, event, {
          verificationOutcome: Object.freeze({
            status: "FINDINGS_REPORT_RECEIVED",
            occurredAt: event.occurredAt,
            evidenceReference: event.evidenceReference,
            verificationResultReference: event.verificationResultReference,
            findingsReportReference: event.findingsReportReference,
          }),
        }),
      };
    }
    case "STATEMENT_SUBMITTED_TO_NEA": {
      if (state.statementSubmission.status !== "PENDING") {
        return { ok: false, code: "duplicate_consequential_event" };
      }
      if (state.verificationOutcome.status !== "STATEMENT_POSSESSED") {
        return {
          ok: false,
          code: "statement_submission_without_positive_statement",
        };
      }
      if (
        event.statementReference !==
          state.verificationOutcome.statementReference
      ) {
        return { ok: false, code: "statement_reference_mismatch" };
      }
      return {
        ok: true,
        idempotent: false,
        value: freezeNextState(state, event, {
          statementSubmission: Object.freeze({
            status: "SUBMITTED",
            occurredAt: event.occurredAt,
            evidenceReference: event.evidenceReference,
            statementReference: event.statementReference,
          }),
        }),
      };
    }
    case "VERIFICATION_RESULT_REGISTERED_IN_REV": {
      if (state.verifierRevRegistration.status !== "PENDING") {
        return { ok: false, code: "duplicate_consequential_event" };
      }
      if (state.verificationOutcome.status === "PENDING") {
        return {
          ok: false,
          code: "result_registration_without_verification_outcome",
        };
      }
      if (
        event.verificationResultReference !==
          state.verificationOutcome.verificationResultReference
      ) {
        return {
          ok: false,
          code: "verification_result_reference_mismatch",
        };
      }
      return {
        ok: true,
        idempotent: false,
        value: freezeNextState(state, event, {
          verifierRevRegistration: Object.freeze({
            status: "REGISTERED",
            occurredAt: event.occurredAt,
            evidenceReference: event.evidenceReference,
            verificationResultReference: event.verificationResultReference,
          }),
        }),
      };
    }
  }
}

function calendarDateInTimeZone(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousCalendarDate(boundary: string): string {
  const [year, month, day] = boundary.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString().slice(0, 10);
}

function pendingStatus(
  asOfDate: string,
  boundary: string,
  semantics: "INCLUSIVE_CUTOFF" | "EXCLUSIVE_BEFORE",
): DeliveryYearComplianceObligationStatus {
  const finalValidDate = semantics === "INCLUSIVE_CUTOFF"
    ? boundary
    : previousCalendarDate(boundary);
  if (asOfDate < finalValidDate) return "UPCOMING";
  if (asOfDate === finalValidDate) return "DUE";
  return "OVERDUE";
}

function completionStatus(
  occurredAt: string,
  boundary: string,
  semantics: "INCLUSIVE_CUTOFF" | "EXCLUSIVE_BEFORE",
  timeZone: string,
): DeliveryYearComplianceObligationStatus {
  const occurredOn = calendarDateInTimeZone(occurredAt, timeZone);
  return semantics === "INCLUSIVE_CUTOFF"
    ? (occurredOn <= boundary ? "COMPLETE" : "OVERDUE")
    : (occurredOn < boundary ? "COMPLETE" : "OVERDUE");
}

function assessmentItem(
  status: DeliveryYearComplianceObligationStatus,
  boundary: string,
  boundarySemantics: "INCLUSIVE_CUTOFF" | "EXCLUSIVE_BEFORE",
  occurredAt: string | null = null,
  reason: DeliveryYearComplianceAssessmentItem["reason"] = null,
): DeliveryYearComplianceAssessmentItem {
  return Object.freeze({
    status,
    boundary,
    boundarySemantics,
    occurredAt,
    reason,
  });
}

export function assessDeliveryYearCompliance(
  stateInput: unknown,
  calendarInput: unknown,
  asOf: unknown,
): DeliveryYearComplianceAssessmentResult {
  if (!isState(stateInput)) return { ok: false, code: "invalid_state" };
  const calendar = validateDeliveryYearComplianceCalendarV1(calendarInput);
  if (!calendar.ok) return { ok: false, code: "invalid_calendar" };
  const state = stateInput;
  if (state.deliveryYear !== calendar.value.deliveryYear) {
    return { ok: false, code: "wrong_delivery_year" };
  }
  if (!isInstant(asOf)) return { ok: false, code: "invalid_as_of" };

  const timeZone = calendar.value.timeZone;
  const asOfCalendarDate = calendarDateInTimeZone(asOf, timeZone);
  const inbooking = state.inbooking.status === "COMPLETED"
    ? assessmentItem(
      completionStatus(
        state.inbooking.occurredAt,
        calendar.value.inbookingCutoff,
        "INCLUSIVE_CUTOFF",
        timeZone,
      ),
      calendar.value.inbookingCutoff,
      "INCLUSIVE_CUTOFF",
      state.inbooking.occurredAt,
    )
    : assessmentItem(
      pendingStatus(
        asOfCalendarDate,
        calendar.value.inbookingCutoff,
        "INCLUSIVE_CUTOFF",
      ),
      calendar.value.inbookingCutoff,
      "INCLUSIVE_CUTOFF",
    );

  const verificationCondition = state.verificationOutcome.status ===
      "STATEMENT_POSSESSED"
    ? "POSITIVE_STATEMENT" as const
    : state.verificationOutcome.status === "FINDINGS_REPORT_RECEIVED"
    ? "NON_POSITIVE_FINDINGS" as const
    : "PENDING" as const;
  const statementPossession = state.verificationOutcome.status ===
      "STATEMENT_POSSESSED"
    ? assessmentItem(
      completionStatus(
        state.verificationOutcome.occurredAt,
        calendar.value.statementPossessionBefore,
        "EXCLUSIVE_BEFORE",
        timeZone,
      ),
      calendar.value.statementPossessionBefore,
      "EXCLUSIVE_BEFORE",
      state.verificationOutcome.occurredAt,
    )
    : state.verificationOutcome.status === "FINDINGS_REPORT_RECEIVED"
    ? assessmentItem(
      "BLOCKED",
      calendar.value.statementPossessionBefore,
      "EXCLUSIVE_BEFORE",
      state.verificationOutcome.occurredAt,
      "non_positive_verification_outcome",
    )
    : assessmentItem(
      pendingStatus(
        asOfCalendarDate,
        calendar.value.statementPossessionBefore,
        "EXCLUSIVE_BEFORE",
      ),
      calendar.value.statementPossessionBefore,
      "EXCLUSIVE_BEFORE",
    );

  const statementSubmission = state.verificationOutcome.status ===
      "FINDINGS_REPORT_RECEIVED"
    ? assessmentItem(
      "NOT_APPLICABLE",
      calendar.value.statementSubmissionBefore,
      "EXCLUSIVE_BEFORE",
      null,
      "non_positive_verification_outcome",
    )
    : state.verificationOutcome.status !== "STATEMENT_POSSESSED"
    ? assessmentItem(
      "BLOCKED",
      calendar.value.statementSubmissionBefore,
      "EXCLUSIVE_BEFORE",
      null,
      "positive_statement_not_possessed",
    )
    : state.statementSubmission.status === "SUBMITTED"
    ? assessmentItem(
      completionStatus(
        state.statementSubmission.occurredAt,
        calendar.value.statementSubmissionBefore,
        "EXCLUSIVE_BEFORE",
        timeZone,
      ),
      calendar.value.statementSubmissionBefore,
      "EXCLUSIVE_BEFORE",
      state.statementSubmission.occurredAt,
    )
    : assessmentItem(
      pendingStatus(
        asOfCalendarDate,
        calendar.value.statementSubmissionBefore,
        "EXCLUSIVE_BEFORE",
      ),
      calendar.value.statementSubmissionBefore,
      "EXCLUSIVE_BEFORE",
    );

  const verifierRevRegistration = state.verificationOutcome.status === "PENDING"
    ? assessmentItem(
      "BLOCKED",
      calendar.value.verifierResultRegistrationBefore,
      "EXCLUSIVE_BEFORE",
      null,
      "verification_outcome_pending",
    )
    : state.verifierRevRegistration.status === "REGISTERED"
    ? assessmentItem(
      completionStatus(
        state.verifierRevRegistration.occurredAt,
        calendar.value.verifierResultRegistrationBefore,
        "EXCLUSIVE_BEFORE",
        timeZone,
      ),
      calendar.value.verifierResultRegistrationBefore,
      "EXCLUSIVE_BEFORE",
      state.verifierRevRegistration.occurredAt,
    )
    : assessmentItem(
      pendingStatus(
        asOfCalendarDate,
        calendar.value.verifierResultRegistrationBefore,
        "EXCLUSIVE_BEFORE",
      ),
      calendar.value.verifierResultRegistrationBefore,
      "EXCLUSIVE_BEFORE",
    );

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: DELIVERY_YEAR_COMPLIANCE_ASSESSMENT_SCHEMA_VERSION,
      deliveryYear: state.deliveryYear,
      asOf,
      asOfCalendarDate,
      verificationCondition,
      inbooking,
      statementPossession,
      yearEnd: Object.freeze({
        status: asOfCalendarDate < calendar.value.yearEndBoundary
          ? "UPCOMING"
          : "REACHED",
        boundary: calendar.value.yearEndBoundary,
        boundarySemantics: "CALENDAR_BOUNDARY",
      }),
      statementSubmission,
      verifierRevRegistration,
    }),
  };
}

const canonical2026 = validateDeliveryYearComplianceCalendarV1({
  schemaVersion: DELIVERY_YEAR_COMPLIANCE_CALENDAR_SCHEMA_VERSION,
  calendarVersion: "reg01-delivery-year-2026-v1",
  deliveryYear: 2026,
  deliveryYearEnd: "2026-12-31",
  inbookingCutoff: "2027-02-26",
  statementPossessionBefore: "2027-04-01",
  yearEndBoundary: "2027-04-01",
  statementSubmissionBefore: "2027-05-01",
  verifierResultRegistrationBefore: "2027-05-01",
  timeZone: "Europe/Amsterdam",
  sourceReferences: DELIVERY_YEAR_COMPLIANCE_SOURCE_REFERENCES,
});

if (!canonical2026.ok) {
  throw new TypeError(`invalid_canonical_2026_calendar:${canonical2026.code}`);
}

export const DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1 = canonical2026.value;
