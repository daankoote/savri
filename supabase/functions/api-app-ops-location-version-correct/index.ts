import { serve } from "jsr:@std/http@0.224.0/server";
import {
  boundedObject,
  boundedSha256,
  boundedString,
  boundedTimestamp,
  boundedUuid,
  createWorkforceLocationHandler,
  type JsonObject,
  type NormalizeResult,
  type WorkforceHandlerDependencies,
} from "../_shared/app_workforce_authorization.ts";

export const ACTIONS = Object.freeze({
  prepare: "app_ops_location_correct_prepare_v1",
  review: "app_ops_location_correct_review_v1",
  execute: "app_ops_location_correct_execute_v1",
});

const BUSINESS_KEYS = [
  "case_id",
  "location_id",
  "observation_id",
  "predecessor_version_id",
  "valid_from",
  "valid_to",
  "accepted_at",
  "acceptance_decision_ref",
  "correction_reason",
] as const;

function businessPayload(input: JsonObject): JsonObject | null {
  const caseId = boundedUuid(input.case_id);
  const locationId = boundedUuid(input.location_id);
  const observationId = boundedUuid(input.observation_id);
  const predecessorId = boundedUuid(input.predecessor_version_id);
  const validFrom = boundedTimestamp(input.valid_from);
  const validTo = input.valid_to === null
    ? null
    : boundedTimestamp(input.valid_to);
  const acceptedAt = boundedTimestamp(input.accepted_at);
  const decisionRef = boundedString(input.acceptance_decision_ref, 200);
  const reason = boundedString(input.correction_reason, 500);
  if (
    !caseId || !locationId || !observationId || !predecessorId ||
    !validFrom || !acceptedAt || !decisionRef || !reason ||
    (input.valid_to !== null && !validTo)
  ) return null;
  return {
    case_id: caseId,
    location_id: locationId,
    observation_id: observationId,
    predecessor_version_id: predecessorId,
    valid_from: validFrom,
    valid_to: validTo,
    accepted_at: acceptedAt,
    acceptance_decision_ref: decisionRef,
    correction_reason: reason,
  };
}

function normalize(action: string, body: JsonObject): NormalizeResult {
  if (action === "prepare") {
    const input = boundedObject(body, BUSINESS_KEYS);
    const payload = input && businessPayload(input);
    return payload
      ? { ok: true, payload }
      : { ok: false, code: "invalid_input" };
  }
  if (action === "review") {
    const input = boundedObject(body, [
      "operation_request_id",
      "outcome",
      "reviewed_payload_hash",
      "decision_ref",
      "reason_ref",
    ]);
    const requestId = boundedUuid(input?.operation_request_id);
    const outcome = boundedString(input?.outcome, 20);
    const reviewedHash = boundedSha256(input?.reviewed_payload_hash);
    const decisionRef = boundedString(input?.decision_ref, 200);
    const reasonRef = input?.reason_ref === null
      ? null
      : boundedString(input?.reason_ref, 200);
    if (
      !input || !requestId || !reviewedHash || !decisionRef ||
      !["approved", "rejected"].includes(outcome || "") ||
      (outcome === "approved" && reasonRef !== null) ||
      (outcome === "rejected" && !reasonRef)
    ) return { ok: false, code: "invalid_input" };
    return {
      ok: true,
      payload: {
        operation_request_id: requestId,
        outcome,
        reviewed_payload_hash: reviewedHash,
        decision_ref: decisionRef,
        reason_ref: reasonRef,
      },
    };
  }
  const input = boundedObject(body, [
    "operation_request_id",
    ...BUSINESS_KEYS,
  ]);
  const requestId = boundedUuid(input?.operation_request_id);
  const business = input && businessPayload(input);
  if (!input || !requestId || !business) {
    return { ok: false, code: "invalid_input" };
  }
  return {
    ok: true,
    payload: { operation_request_id: requestId, ...business },
  };
}

export const CONFIG = {
  caller: "api-app-ops-location-version-correct",
  actions: ACTIONS,
  normalize,
  operationPayload(action: string, payload: JsonObject) {
    if (action === "review") return null;
    return businessPayload(payload);
  },
} as const;

export function createHandler(
  dependencies: Partial<WorkforceHandlerDependencies> = {},
) {
  return createWorkforceLocationHandler(CONFIG, dependencies);
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
