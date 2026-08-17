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
  defaultServiceClient,
  type JsonObject,
  type ServiceClient,
} from "../_shared/app_workforce_authorization.ts";
import {
  buildEvidenceReviewPreviewResponse,
  EVIDENCE_REVIEW_PREVIEW_TTL_SECONDS,
  parseEvidenceReviewPreviewSource,
} from "../_shared/app_evidence_review_preview.ts";

const READ_RPC = "app_evidence_review_preview_source_read_v1";
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RpcResult = { data?: unknown; error?: unknown };
type SignedUrlResult = {
  data?: { signedUrl?: string | null } | null;
  error?: unknown;
};
type PreviewServiceClient = ServiceClient & {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<SignedUrlResult>;
    };
  };
};

export type EvidenceReviewPreviewHandlerDependencies = {
  createServiceClient: () => PreviewServiceClient | null;
  now: () => Date;
  requestMeta: typeof getAppRequestMeta;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const DEFAULT_DEPENDENCIES: EvidenceReviewPreviewHandlerDependencies = {
  createServiceClient: () => defaultServiceClient() as PreviewServiceClient | null,
  now: () => new Date(),
  requestMeta: getAppRequestMeta,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactSelectors(
  req: Request,
): { caseReference: string; evidenceVersionRef: string } | null {
  const params = new URL(req.url).searchParams;
  if (
    [...params.keys()].some((key) =>
      key !== "caseRef" && key !== "evidenceVersionRef"
    ) || params.getAll("caseRef").length !== 1 ||
    params.getAll("evidenceVersionRef").length !== 1
  ) return null;
  const caseReference = params.get("caseRef") ?? "";
  const evidenceVersionRef = params.get("evidenceVersionRef") ?? "";
  if (
    caseReference !== caseReference.trim() ||
    evidenceVersionRef !== evidenceVersionRef.trim() ||
    !CASE_REFERENCE_RE.test(caseReference) || !UUID_RE.test(evidenceVersionRef)
  ) return null;
  return { caseReference, evidenceVersionRef: evidenceVersionRef.toLowerCase() };
}

function failureStatus(code: string): number {
  if (code === "invalid_input") return 400;
  if (code === "evidence_not_found_or_forbidden") return 404;
  if (
    code === "authenticated_actor_not_verified" ||
    code === "workforce_identity_missing" ||
    code === "workforce_identity_inactive" ||
    code === "seniority_not_authorized" ||
    code === "capability_not_authorized" ||
    code === "case_scope_denied" ||
    code === "authorization_changed"
  ) return 403;
  return 500;
}

export function createHandler(
  overrides: Partial<EvidenceReviewPreviewHandlerDependencies> = {},
): (req: Request) => Promise<Response> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return appOptionsResponse(req);
    if (req.method !== "GET") {
      return appErrorResponse(req, 405, "Methode niet toegestaan.", "invalid_input");
    }

    const metaResult = await deps.requestMeta(req);
    if (metaResult instanceof Response) return metaResult;

    const selectors = exactSelectors(req);
    if (!selectors) {
      return appErrorResponse(req, 400, "Ongeldige aanvraag.", "invalid_input");
    }

    const serviceClient = deps.createServiceClient();
    if (!serviceClient) {
      return appErrorResponse(
        req,
        503,
        "Documentpreview is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    const verified = await deps.verifyBearer(req, serviceClient);
    if (!verified.ok) {
      return appErrorResponse(req, 401, "Authenticatie vereist.", "authentication_required");
    }

    const { data, error } = await serviceClient.rpc(READ_RPC, {
      p_auth_user_id: verified.context.authUserId,
      p_case_ref: selectors.caseReference,
      p_evidence_version_ref: selectors.evidenceVersionRef,
    }) as RpcResult;
    if (error || !isRecord(data)) {
      return appErrorResponse(
        req,
        500,
        "Documentpreview is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    if (data.ok !== true) {
      const code = typeof data.code === "string" ? data.code : "internal_error";
      const status = failureStatus(code);
      return appErrorResponse(
        req,
        status,
        status === 400
          ? "Ongeldige aanvraag."
          : status === 404
          ? "Document niet gevonden."
          : status === 403
          ? "Documentpreview is niet toegestaan."
          : "Documentpreview is tijdelijk niet beschikbaar.",
        status === 500 ? "internal_error" : code,
      );
    }

    const source = parseEvidenceReviewPreviewSource(data);
    if (!source) {
      return appErrorResponse(
        req,
        500,
        "Documentpreview is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    const issuedAt = deps.now();
    const signed = await serviceClient.storage.from(source.storageBucket)
      .createSignedUrl(source.storagePath, EVIDENCE_REVIEW_PREVIEW_TTL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      return appErrorResponse(
        req,
        503,
        "Documentpreview is tijdelijk niet beschikbaar.",
        "service_unavailable",
      );
    }

    const response = buildEvidenceReviewPreviewResponse(
      source,
      signed.data.signedUrl,
      issuedAt,
    );
    if (!response) {
      return appErrorResponse(
        req,
        500,
        "Documentpreview is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }
    return appJsonResponse(req, 200, response);
  };
}

export const handler = createHandler();

if (import.meta.main) serve(handler);
