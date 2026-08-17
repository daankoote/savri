import {
  applyDeliveryYearComplianceEvent,
  createInitialDeliveryYearComplianceStateV1,
} from "../../../platform/runtime/compliance/delivery_year_compliance.ts";
import {
  resolveDeliveryYearComplianceCalendar,
  SUPPORTED_DELIVERY_YEARS,
} from "../../../platform/runtime/compliance/delivery_year_compliance_calendar_registry.ts";
import {
  mapComplianceSourceEventToReg02,
  type PersistedDeliveryYearComplianceSourceEventV1,
} from "../../../platform/runtime/compliance/delivery_year_compliance_source_event.ts";
import {
  buildComplianceActionPlan,
  ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
} from "../../../platform/runtime/compliance/compliance_action_plan.ts";
import {
  type ComplianceWorklistItemV1,
  projectComplianceWorklist,
} from "../../../platform/runtime/compliance/compliance_worklist.ts";

export const COMPLIANCE_WORKLIST_RESPONSE_SCHEMA_VERSION =
  "compliance-worklist-response-v1" as const;
export { SUPPORTED_DELIVERY_YEARS };

type JsonObject = Record<string, unknown>;

export type SafeComplianceWorklistItemV1 = Readonly<{
  schemaVersion: ComplianceWorklistItemV1["schemaVersion"];
  classification: ComplianceWorklistItemV1["classification"];
  scope: ComplianceWorklistItemV1["scope"];
  actionKind: ComplianceWorklistItemV1["actionKind"];
  deliveryYear: ComplianceWorklistItemV1["deliveryYear"];
  obligationKind: ComplianceWorklistItemV1["obligationKind"];
  responsibleActor: ComplianceWorklistItemV1["responsibleActor"];
  coordinationMode: ComplianceWorklistItemV1["coordinationMode"];
  temporalStatus: ComplianceWorklistItemV1["temporalStatus"];
  boundary: ComplianceWorklistItemV1["boundary"];
  boundarySemantics: ComplianceWorklistItemV1["boundarySemantics"];
}>;

export type ComplianceWorklistResponseV1 = Readonly<{
  schemaVersion: typeof COMPLIANCE_WORKLIST_RESPONSE_SCHEMA_VERSION;
  deliveryYear: number;
  asOf: string;
  calendarVersion: string;
  sourceEventCount: number;
  evidenceStatus:
    | "NO_ACCEPTED_SOURCE_FACTS_RECORDED"
    | "ACCEPTED_SOURCE_FACTS_REPLAYED";
  activeAttention: readonly SafeComplianceWorklistItemV1[];
  milestones: readonly SafeComplianceWorklistItemV1[];
}>;

export type ComplianceWorklistBuildResult =
  | Readonly<{ ok: true; value: ComplianceWorklistResponseV1 }>
  | Readonly<{
    ok: false;
    code:
      | "unsupported_delivery_year"
      | "invalid_source_event"
      | "replay_failed"
      | "action_plan_failed"
      | "worklist_projection_failed";
  }>;

function safeItem(
  item: ComplianceWorklistItemV1,
): SafeComplianceWorklistItemV1 {
  return Object.freeze({
    schemaVersion: item.schemaVersion,
    classification: item.classification,
    scope: item.scope,
    actionKind: item.actionKind,
    deliveryYear: item.deliveryYear,
    obligationKind: item.obligationKind,
    responsibleActor: item.responsibleActor,
    coordinationMode: item.coordinationMode,
    temporalStatus: item.temporalStatus,
    boundary: item.boundary,
    boundarySemantics: item.boundarySemantics,
  });
}

export function parseAuthorizedComplianceSourceEvents(
  input: unknown,
  deliveryYear: number,
): readonly PersistedDeliveryYearComplianceSourceEventV1[] | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as JsonObject;
  if (
    Object.keys(value).sort().join("|") !==
      "code|delivery_year|ok|source_events|status" ||
    value.ok !== true || value.code !== "ok" || value.status !== 200 ||
    value.delivery_year !== deliveryYear || !Array.isArray(value.source_events)
  ) return null;
  return value
    .source_events as readonly PersistedDeliveryYearComplianceSourceEventV1[];
}

export function buildComplianceWorklistResponse(
  deliveryYear: number,
  asOf: string,
  sourceEvents: readonly PersistedDeliveryYearComplianceSourceEventV1[],
): ComplianceWorklistBuildResult {
  const calendar = resolveDeliveryYearComplianceCalendar(deliveryYear);
  if (!calendar.ok) return calendar;

  const initial = createInitialDeliveryYearComplianceStateV1(deliveryYear);
  if (!initial.ok) return { ok: false, code: "replay_failed" };
  let state = initial.value;
  for (const sourceEvent of sourceEvents) {
    const mapped = mapComplianceSourceEventToReg02(sourceEvent);
    if (!mapped.ok) return { ok: false, code: "invalid_source_event" };
    const applied = applyDeliveryYearComplianceEvent(state, mapped.value);
    if (!applied.ok || applied.idempotent) {
      return { ok: false, code: "replay_failed" };
    }
    state = applied.value;
  }

  const actionPlan = buildComplianceActionPlan(
    state,
    calendar.value,
    asOf,
    ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
  );
  if (!actionPlan.ok) return { ok: false, code: "action_plan_failed" };
  const worklist = projectComplianceWorklist(actionPlan.value);
  if (!worklist.ok) {
    return { ok: false, code: "worklist_projection_failed" };
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: COMPLIANCE_WORKLIST_RESPONSE_SCHEMA_VERSION,
      deliveryYear,
      asOf: worklist.value.asOf,
      calendarVersion: calendar.value.calendarVersion,
      sourceEventCount: sourceEvents.length,
      evidenceStatus: sourceEvents.length === 0
        ? "NO_ACCEPTED_SOURCE_FACTS_RECORDED"
        : "ACCEPTED_SOURCE_FACTS_REPLAYED",
      activeAttention: Object.freeze(
        worklist.value.activeAttention.map(safeItem),
      ),
      milestones: Object.freeze(worklist.value.milestones.map(safeItem)),
    }),
  };
}
