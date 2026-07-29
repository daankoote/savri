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
  execute: "app_ops_location_observation_record_v1",
});

function optionalString(value: unknown, max: number): string | null {
  return value === null ? null : boundedString(value, max, true);
}

function normalize(_action: string, body: JsonObject): NormalizeResult {
  const keys = [
    "case_id",
    "location_id",
    "observation_kind",
    "descriptor_kind",
    "observed_at",
    "source_ref_sha256",
    "source_payload_sha256",
    "source_retrieved_at",
    "fresh_until",
    "country_code",
    "postal_code",
    "house_number",
    "house_number_addition",
    "street",
    "city",
    "site_reference",
  ] as const;
  const input = boundedObject(body, keys);
  if (!input) return { ok: false, code: "invalid_input" };

  const caseId = boundedUuid(input.case_id);
  const locationId = boundedUuid(input.location_id);
  const kind = boundedString(input.observation_kind, 40);
  const descriptor = boundedString(input.descriptor_kind, 40);
  const observedAt = boundedTimestamp(input.observed_at);
  const countryCode = boundedString(input.country_code, 2)?.toUpperCase() ??
    null;
  const houseNumber = input.house_number === null
    ? null
    : Number(input.house_number);
  if (
    !caseId || !locationId || !observedAt ||
    ![
      "customer_declared",
      "document_parsed",
      "pdok_observed",
      "bag_observed",
      "provider_observed",
      "manual_observed",
      "migration_snapshot",
    ].includes(kind || "") ||
    !["postal_address", "site_reference"].includes(descriptor || "") ||
    !countryCode || !/^[A-Z]{2}$/.test(countryCode) ||
    (houseNumber !== null &&
      (!Number.isInteger(houseNumber) || houseNumber < 1))
  ) return { ok: false, code: "invalid_input" };

  const refHash = input.source_ref_sha256 === null
    ? null
    : boundedSha256(input.source_ref_sha256);
  const payloadHash = input.source_payload_sha256 === null
    ? null
    : boundedSha256(input.source_payload_sha256);
  if (
    (input.source_ref_sha256 !== null && !refHash) ||
    (input.source_payload_sha256 !== null && !payloadHash)
  ) return { ok: false, code: "invalid_input" };

  return {
    ok: true,
    payload: {
      case_id: caseId,
      location_id: locationId,
      observation_kind: kind,
      descriptor_kind: descriptor,
      observed_at: observedAt,
      source_ref_sha256: refHash,
      source_payload_sha256: payloadHash,
      source_retrieved_at: input.source_retrieved_at === null
        ? null
        : boundedTimestamp(input.source_retrieved_at),
      fresh_until: input.fresh_until === null
        ? null
        : boundedTimestamp(input.fresh_until),
      country_code: countryCode,
      postal_code: optionalString(input.postal_code, 20)?.toUpperCase() ?? null,
      house_number: houseNumber,
      house_number_addition: optionalString(
        input.house_number_addition,
        40,
      ),
      street: optionalString(input.street, 200),
      city: optionalString(input.city, 120),
      site_reference: optionalString(input.site_reference, 200),
    },
  };
}

export const CONFIG = {
  caller: "api-app-ops-location-observation-record",
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
