import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
} from "../_shared/app_foundation.ts";
import {
  requireVerifiedSupabaseAuthUser,
} from "../_shared/app_customer_auth.ts";
import {
  CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
  parseCustomerCorrectionHandoffSource,
} from "../_shared/app_evidence_review_correction_handoff.ts";
import {
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";

const READ_RPC = "app_customer_correction_handoff_read_v6";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

type RpcResult = { data?: unknown; error?: unknown };
type CandidateFingerprintRow = Readonly<{
  candidate_reference: string;
  server_sha256: string;
}>;

export type CustomerCorrectionHandoffHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: CustomerCorrectionHandoffHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactCaseReference(req: Request): string | null {
  const params = new URL(req.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== "caseRef") ||
    params.getAll("caseRef").length !== 1
  ) return null;
  const value = params.get("caseRef") ?? "";
  return value === value.trim() && CASE_REFERENCE_RE.test(value) ? value : null;
}

async function readCandidateFingerprints(
  serviceClient: ServiceClient,
  candidateRefs: readonly string[],
): Promise<ReadonlyMap<string, string> | null> {
  if (candidateRefs.length === 0) return new Map();
  const table = serviceClient.from(
    "app_customer_correction_replacement_candidates",
  ) as {
    select: (columns: string) => {
      in: (
        column: string,
        values: readonly string[],
      ) => Promise<{ data?: unknown; error?: unknown }>;
    };
  };
  const result = await table.select("candidate_reference,server_sha256").in(
    "candidate_reference",
    candidateRefs,
  );
  if (result.error || !Array.isArray(result.data)) return null;
  const fingerprints = new Map<string, string>();
  for (const value of result.data) {
    if (
      !isObject(value) || typeof value.candidate_reference !== "string" ||
      !candidateRefs.includes(value.candidate_reference) ||
      typeof value.server_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(value.server_sha256) ||
      fingerprints.has(value.candidate_reference)
    ) return null;
    fingerprints.set(value.candidate_reference, value.server_sha256);
  }
  return fingerprints.size === candidateRefs.length ? fingerprints : null;
}

export function createHandler(
  overrides: Partial<CustomerCorrectionHandoffHandlerDependencies> = {},
): (req: Request) => Promise<Response> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return appOptionsResponse(req);
    if (req.method !== "GET") {
      return appErrorResponse(
        req,
        405,
        "Methode niet toegestaan.",
        "invalid_input",
      );
    }
    const metaResult = await deps.requestMeta(req);
    if (metaResult instanceof Response) return metaResult;
    const caseReference = exactCaseReference(req);
    if (!caseReference) {
      return appErrorResponse(req, 400, "Ongeldige aanvraag.", "invalid_input");
    }
    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "De correctieopdracht is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    const verified = await deps.verifyBearer(req, serviceClient);
    if (!verified.ok) {
      return appErrorResponse(
        req,
        401,
        "Authenticatie vereist.",
        "authentication_required",
      );
    }
    const result = await serviceClient.rpc(READ_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: caseReference,
    }) as RpcResult;
    if (result.error || !isObject(result.data)) {
      return appErrorResponse(
        req,
        500,
        "De correctieopdracht is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (result.data.ok !== true) {
      const code = typeof result.data.code === "string"
        ? result.data.code
        : "internal_error";
      const status = code === "authentication_required"
        ? 401
        : code === "invalid_input"
        ? 400
        : code === "customer_case_access_denied"
        ? 404
        : 500;
      return appErrorResponse(
        req,
        status,
        status === 401
          ? "Authenticatie vereist."
          : status === 400
          ? "Ongeldige aanvraag."
          : status === 404
          ? "Dossier niet gevonden."
          : "De correctieopdracht is tijdelijk niet beschikbaar.",
        status === 500 ? "internal_error" : code,
      );
    }
    const response = parseCustomerCorrectionHandoffSource(result.data);
    if (!response || response.caseRef !== caseReference) {
      return appErrorResponse(
        req,
        500,
        "De correctieopdracht is tijdelijk niet beschikbaar.",
        "correction_handoff_reconstruction_failed",
      );
    }
    const candidateRefs = response.handoff?.currentReplacementCandidates.map(
      (candidate) => candidate.candidateRef,
    ) ?? [];
    const fingerprints = await readCandidateFingerprints(
      serviceClient,
      candidateRefs,
    );
    if (!fingerprints) {
      return appErrorResponse(
        req,
        500,
        "De correctieopdracht is tijdelijk niet beschikbaar.",
        "correction_handoff_reconstruction_failed",
      );
    }
    const customerResponse = response.handoff
      ? Object.freeze({
        schemaVersion: CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
        caseRef: response.caseRef,
        handoff: Object.freeze({
          coverMessage: response.handoff.coverMessage,
          handoffRef: response.handoff.handoffRef,
          publishedAt: response.handoff.publishedAt,
          signerAuthority: response.handoff.signerAuthority,
          items: response.handoff.items,
          currentReplacementCandidates: Object.freeze(
            response.handoff.currentReplacementCandidates.map((candidate) =>
              Object.freeze({
                ...candidate,
                contentFingerprint: fingerprints.get(candidate.candidateRef) ||
                  null,
              })
            ),
          ),
        }),
      })
      : Object.freeze({
        schemaVersion: CUSTOMER_CORRECTION_HANDOFF_SCHEMA_VERSION,
        caseRef: response.caseRef,
        handoff: null,
      });
    return appJsonResponse(req, 200, customerResponse);
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
