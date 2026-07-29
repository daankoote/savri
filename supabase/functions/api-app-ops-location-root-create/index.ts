import { serve } from "jsr:@std/http@0.224.0/server";
import {
  boundedObject,
  boundedString,
  boundedUuid,
  createWorkforceLocationHandler,
  type JsonObject,
  type NormalizeResult,
  type WorkforceHandlerDependencies,
} from "../_shared/app_workforce_authorization.ts";

export const ACTIONS = Object.freeze({
  execute: "app_ops_location_root_create_v1",
});

function normalize(_action: string, body: JsonObject): NormalizeResult {
  const input = boundedObject(body, ["case_id", "creation_basis"]);
  const caseId = boundedUuid(input?.case_id);
  const creationBasis = boundedString(input?.creation_basis, 40);
  if (
    !input || !caseId ||
    !["customer_declaration", "source_observation", "manual_migration_review"]
      .includes(creationBasis || "")
  ) return { ok: false, code: "invalid_input" };
  return {
    ok: true,
    payload: { case_id: caseId, creation_basis: creationBasis },
  };
}

export const CONFIG = {
  caller: "api-app-ops-location-root-create",
  actions: ACTIONS,
  normalize,
} as const;

export function createHandler(
  dependencies: Partial<WorkforceHandlerDependencies> = {},
) {
  return createWorkforceLocationHandler(CONFIG, dependencies);
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
