import {
  loadOperatorContext,
  type OperatorContextLoadResult,
} from "../operator/operatorContextClient";
import {
  type EvidenceReviewWorklistLoadResult,
  loadEvidenceReviewWorklistOnce,
} from "../evidence-review/evidenceReviewWorklistClient";
import {
  type AuthBootstrapResult,
  bootstrapAppCustomerAuth,
} from "./authBootstrapClient";
import { safeAuthError } from "./authErrorMapping";
import type {
  AuthorizedPortal,
  AuthorizedPortalNavigation,
  AuthSafeError,
} from "./authTypes";

const CUSTOMER_ACCESS_DENIALS = new Set([
  "customer_identity_not_found",
  "customer_identity_already_bound",
  "customer_identity_binding_ambiguous",
  "customer_inactive",
  "customer_dossier_not_found",
  "portal_context_not_authorized",
]);

const WORKFORCE_ACCESS_DENIALS = new Set([
  "forbidden",
  "not_workforce",
  "workforce_inactive",
]);

export type AuthorizedPortalAccessResult =
  | Readonly<{ ok: true; navigation: AuthorizedPortalNavigation }>
  | Readonly<{ ok: false; error: AuthSafeError }>;

type PortalAuthorityLoaders = Readonly<{
  loadCustomer?: (
    input: Readonly<{
      accessToken: string;
      idempotencyKey: string;
    }>,
  ) => Promise<AuthBootstrapResult>;
  loadWorkforce?: (
    input: Readonly<{
      accessToken: string;
    }>,
  ) => Promise<OperatorContextLoadResult>;
  loadEvidenceWorklist?: (
    input: Readonly<{
      accessToken: string;
    }>,
  ) => Promise<EvidenceReviewWorklistLoadResult>;
}>;

type AuthorizedPortalAccessInput =
  & Readonly<{
    accessToken: string;
    idempotencyKey: string;
  }>
  & PortalAuthorityLoaders;

let cachedAccessToken: string | null = null;
let cachedPortalAccess: Promise<AuthorizedPortalAccessResult> | null = null;

export function clearAuthorizedPortalAccessSessionCache(): void {
  cachedAccessToken = null;
  cachedPortalAccess = null;
}

export function resolveAuthorizedPortalAccessOnce(
  input: AuthorizedPortalAccessInput,
): Promise<AuthorizedPortalAccessResult> {
  if (cachedAccessToken === input.accessToken && cachedPortalAccess) {
    return cachedPortalAccess;
  }

  const promise = resolveAuthorizedPortalAccess(input);
  cachedAccessToken = input.accessToken;
  cachedPortalAccess = promise;
  void promise.then(
    (result) => {
      if (!result.ok && cachedPortalAccess === promise) {
        clearAuthorizedPortalAccessSessionCache();
      }
    },
    () => {
      if (cachedPortalAccess === promise) {
        clearAuthorizedPortalAccessSessionCache();
      }
    },
  );
  return promise;
}

export async function resolveAuthorizedPortalAccess(
  input: AuthorizedPortalAccessInput,
): Promise<AuthorizedPortalAccessResult> {
  const loadCustomer = input.loadCustomer ?? bootstrapAppCustomerAuth;
  const loadWorkforce = input.loadWorkforce ?? loadOperatorContext;
  const [customer, workforce] = await Promise.all([
    loadCustomer({
      accessToken: input.accessToken,
      idempotencyKey: input.idempotencyKey,
    }),
    loadWorkforce({ accessToken: input.accessToken }),
  ]);

  const portals: AuthorizedPortal[] = [];
  if (customer.ok) portals.push("customer");
  if (workforce.ok) portals.push("workforce");
  if (portals.length > 0) {
    const workforceEvidenceReview = workforce.ok &&
      workforce.value.effectiveCapabilities.includes("evidence.review.view");
    const workforceCompliance = workforce.ok &&
      workforce.value.effectiveCapabilities.includes(
        "compliance.delivery_year.view",
      );
    const workforceCaseReferences = workforceEvidenceReview
      ? await (input.loadEvidenceWorklist ?? loadEvidenceReviewWorklistOnce)({
        accessToken: input.accessToken,
      }).then((result) =>
        result.ok ? result.value.cases.map((item) => item.caseRef) : []
      )
      : [];
    return {
      ok: true,
      navigation: Object.freeze({
        portals: Object.freeze(portals),
        customerCaseReferences: Object.freeze(
          customer.ok
            ? customer.summary.dossiers.map((dossier) => dossier.case_reference)
            : [],
        ),
        workforceCaseReferences: Object.freeze(workforceCaseReferences),
        workforceDefaultDestination: workforceEvidenceReview
          ? "/beheer"
          : workforceCompliance
          ? "/intern/compliance"
          : null,
        workforceEvidenceReview,
        workforceCompliance,
      }),
    };
  }
  if (!customer.ok && !CUSTOMER_ACCESS_DENIALS.has(customer.error.code)) {
    return { ok: false, error: customer.error };
  }
  if (!workforce.ok && !WORKFORCE_ACCESS_DENIALS.has(workforce.error.code)) {
    return { ok: false, error: safeAuthError("service_unavailable") };
  }
  return {
    ok: true,
    navigation: Object.freeze({
      portals: Object.freeze(portals),
      customerCaseReferences: Object.freeze([]),
      workforceCaseReferences: Object.freeze([]),
      workforceDefaultDestination: null,
      workforceEvidenceReview: false,
      workforceCompliance: false,
    }),
  };
}
