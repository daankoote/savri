import { resolveAuthRuntimeConfig } from "../auth/authRuntimeConfig.ts";
import { getCurrentAuthSession } from "../auth/authClient.ts";
import { createUploadIdempotencyKey } from "../documents/documentUploadTransport.ts";
import type { CanonicalSigningFact } from "./signing/canonicalSigningFacts.ts";
import { readSignupIntakeSession } from "./signupIntakeCapabilityStore.ts";

type SigningRuntimeConfig = {
  anonKey: string;
  presentationEndpointUrl: string;
  challengeEndpointUrl: string;
  finalizeEndpointUrl: string;
};

export type SigningChallengeReceipt = {
  challengeReference: string;
  expiresAt: string;
  deliveryTargetMasked: string;
};

export type SigningPresentationReceipt = {
  receiptReference: string;
  receiptSha256: string;
  presentedAt: string;
  expiresAt: string;
  legalDocuments: readonly {
    document_type: string;
    version: string;
    language: string;
    title: string;
    canonical_content: string;
    content_sha256: string;
    effective_from: string | null;
  }[];
};

export type SigningFinalizeReceipt = {
  safeReference: string;
  status: "submitted_for_review";
  promotionState: "pending" | "promoted" | "blocked";
  accountHandoff: SignupAccountHandoff;
};

export type SignupAccountHandoff =
  | "existing_account_login_required"
  | "account_activation_available"
  | "already_authenticated"
  | "blocked";

export type SignupSigningStatus =
  | {
    signingState: "collecting";
    locked: false;
    intakeStatus: "collecting";
  }
  | {
    signingState: "finalized";
    locked: true;
    intakeStatus: "submitted_for_review";
    safeReference: string;
    finalizedAt: string;
    promotionState: "pending" | "promoted" | "blocked";
    accountHandoff: SignupAccountHandoff;
  };

export type SigningClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; code?: string };

export function signupSigningFailureRequiresFreshPresentation(
  code: string | undefined,
): boolean {
  return [
    "challenge_unavailable",
    "otp_expired",
    "attempts_exhausted",
    "presentation_receipt_expired",
    "presentation_receipt_unavailable",
    "presentation_binding_invalid",
    "presentation_configuration_superseded",
    "signing_configuration_invalidated",
    "signing_presentation_required",
  ].includes(code || "");
}

function runtimeConfig(): SigningRuntimeConfig | null {
  const auth = resolveAuthRuntimeConfig();
  if (!auth.ok) return null;
  const suffix = "/api-app-dashboard-get";
  if (!auth.dashboardEndpointUrl.endsWith(suffix)) return null;
  const base = auth.dashboardEndpointUrl.slice(0, -suffix.length);
  return {
    anonKey: auth.anonKey,
    presentationEndpointUrl: `${base}/api-app-signup-signing-presentation`,
    challengeEndpointUrl: `${base}/api-app-signup-signing-challenge`,
    finalizeEndpointUrl: `${base}/api-app-signup-signing-finalize`,
  };
}

async function postJson(
  endpointUrl: string,
  anonKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  try {
    const session = await getCurrentAuthSession();
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session?.access_token || anonKey}`,
        "apikey": anonKey,
        "Content-Type": "application/json",
        "Idempotency-Key": createUploadIdempotencyKey(),
      },
      body: JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => null);
    return {
      ok: response.ok && !!parsed && typeof parsed === "object",
      body: parsed && typeof parsed === "object"
        ? parsed as Record<string, unknown>
        : {},
    };
  } catch (_error) {
    return { ok: false, body: {} };
  }
}

function message(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === "string" && body.error.trim()
    ? body.error.trim()
    : fallback;
}

function errorCode(body: Record<string, unknown>): string | undefined {
  return typeof body.code === "string" && body.code.trim()
    ? body.code.trim()
    : undefined;
}

export async function readSignupSigningStatus(): Promise<
  SigningClientResult<SignupSigningStatus>
> {
  const config = runtimeConfig();
  const session = readSignupIntakeSession();
  if (!config || !session) {
    return {
      ok: false,
      message: "Deze aanmelding kan niet veilig worden hersteld.",
    };
  }
  const response = await postJson(config.finalizeEndpointUrl, config.anonKey, {
    operation: "status",
    intake_reference: session.intakeReference,
    management_capability: session.managementCapability,
  });
  const signingState = String(response.body.signing_state || "");
  const locked = response.body.locked;
  const intakeStatus = String(response.body.intake_status || "");
  if (
    response.ok && signingState === "collecting" && locked === false &&
    intakeStatus === "collecting"
  ) {
    return {
      ok: true,
      value: {
        signingState: "collecting",
        locked: false,
        intakeStatus: "collecting",
      },
    };
  }
  const safeReference = String(response.body.safe_reference || "");
  const finalizedAt = String(response.body.finalized_at || "");
  const promotionState = String(response.body.promotion_state || "");
  const accountHandoff = String(response.body.account_handoff || "");
  if (
    response.ok && signingState === "finalized" && locked === true &&
    intakeStatus === "submitted_for_review" &&
    ["pending", "promoted", "blocked"].includes(promotionState) &&
    [
      "existing_account_login_required",
      "account_activation_available",
      "already_authenticated",
      "blocked",
    ].includes(accountHandoff) &&
    /^SIG-[A-F0-9]{12}$/.test(safeReference) &&
    Number.isFinite(new Date(finalizedAt).getTime())
  ) {
    return {
      ok: true,
      value: {
        signingState: "finalized",
        locked: true,
        intakeStatus: "submitted_for_review",
        safeReference,
        finalizedAt,
        promotionState: promotionState as "pending" | "promoted" | "blocked",
        accountHandoff: accountHandoff as SignupAccountHandoff,
      },
    };
  }
  return {
    ok: false,
    message: message(
      response.body,
      "Deze aanmelding kan niet veilig worden hersteld.",
    ),
    code: errorCode(response.body),
  };
}

export async function requestSignupSigningPresentation(): Promise<
  SigningClientResult<SigningPresentationReceipt>
> {
  const config = runtimeConfig();
  const session = readSignupIntakeSession();
  if (!config || !session) {
    return {
      ok: false,
      message: "De juridische documenten konden niet veilig worden geladen.",
    };
  }
  const response = await postJson(
    config.presentationEndpointUrl,
    config.anonKey,
    {
      intake_reference: session.intakeReference,
      management_capability: session.managementCapability,
    },
  );
  const receiptReference = String(response.body.receipt_reference || "");
  const receiptSha256 = String(response.body.receipt_sha256 || "");
  const presentedAt = String(response.body.presented_at || "");
  const expiresAt = String(response.body.expires_at || "");
  const legalDocuments = Array.isArray(response.body.legal_documents)
    ? response.body.legal_documents.filter((document) =>
      document && typeof document === "object" && !Array.isArray(document)
    ) as SigningPresentationReceipt["legalDocuments"]
    : [];
  if (
    !response.ok || !/^SPR-[0-9a-f-]{36}$/.test(receiptReference) ||
    !/^[0-9a-f]{64}$/.test(receiptSha256) ||
    !Number.isFinite(Date.parse(presentedAt)) ||
    !Number.isFinite(Date.parse(expiresAt)) || legalDocuments.length !== 4
  ) {
    return {
      ok: false,
      message: message(
        response.body,
        "De juridische documenten konden niet veilig worden geladen.",
      ),
      code: errorCode(response.body),
    };
  }
  return {
    ok: true,
    value: {
      receiptReference,
      receiptSha256,
      presentedAt,
      expiresAt,
      legalDocuments,
    },
  };
}

export async function requestSignupSigningChallenge(input: {
  presentation: SigningPresentationReceipt;
  legalActions: {
    privacyNoticeRead: boolean;
    serviceTermsAccepted: boolean;
    feeTermsAccepted: boolean;
    mandateSigned: boolean;
  };
}): Promise<
  SigningClientResult<SigningChallengeReceipt>
> {
  const config = runtimeConfig();
  const session = readSignupIntakeSession();
  if (!config || !session) {
    return {
      ok: false,
      message: "Ondertekenen is lokaal nog niet beschikbaar.",
    };
  }
  const response = await postJson(config.challengeEndpointUrl, config.anonKey, {
    intake_reference: session.intakeReference,
    management_capability: session.managementCapability,
    presentation_receipt_reference: input.presentation.receiptReference,
    presentation_receipt_sha256: input.presentation.receiptSha256,
    legal_actions: {
      privacy_notice_read: input.legalActions.privacyNoticeRead,
      service_terms_accepted: input.legalActions.serviceTermsAccepted,
      fee_terms_accepted: input.legalActions.feeTermsAccepted,
      mandate_signed: input.legalActions.mandateSigned,
    },
  });
  const challengeReference = String(response.body.challenge_reference || "");
  const expiresAt = String(response.body.expires_at || "");
  if (!response.ok || !challengeReference || !expiresAt) {
    return {
      ok: false,
      message: message(response.body, "De code kon niet worden verzonden."),
      code: errorCode(response.body),
    };
  }
  return {
    ok: true,
    value: {
      challengeReference,
      expiresAt,
      deliveryTargetMasked: String(
        response.body.delivery_target_masked || "je e-mailadres",
      ),
    },
  };
}

export async function finalizeSignupSigning(input: {
  challengeReference: string;
  otpCode: string;
  accountType: "particulier" | "zakelijk" | "vve";
  typedFullName: string;
  signerRole: string;
  mandateYear: number;
  canonicalFacts: readonly CanonicalSigningFact[];
  requiredFileReferences: readonly string[];
}): Promise<SigningClientResult<SigningFinalizeReceipt>> {
  const config = runtimeConfig();
  const session = readSignupIntakeSession();
  if (!config || !session) {
    return {
      ok: false,
      message: "Ondertekenen is lokaal nog niet beschikbaar.",
    };
  }
  const response = await postJson(config.finalizeEndpointUrl, config.anonKey, {
    intake_reference: session.intakeReference,
    management_capability: session.managementCapability,
    challenge_reference: input.challengeReference,
    otp_code: input.otpCode,
    account_type: input.accountType,
    typed_full_name: input.typedFullName,
    signer_role: input.signerRole,
    mandate_year: input.mandateYear,
    canonical_facts: input.canonicalFacts,
    required_file_references: input.requiredFileReferences,
    legal_actions: {
      privacy_notice_read: true,
      service_terms_accepted: true,
      fee_terms_accepted: true,
      mandate_signed: true,
    },
  });
  const safeReference = String(response.body.safe_reference || "");
  const status = String(response.body.intake_status || "");
  const promotionState = String(response.body.promotion_state || "");
  const accountHandoff = String(response.body.account_handoff || "");
  if (
    !response.ok || !/^SIG-[A-F0-9]{12}$/.test(safeReference) ||
    status !== "submitted_for_review" ||
    !["pending", "promoted", "blocked"].includes(promotionState) ||
    ![
      "existing_account_login_required",
      "account_activation_available",
      "already_authenticated",
      "blocked",
    ].includes(accountHandoff)
  ) {
    return {
      ok: false,
      message: message(
        response.body,
        "De ondertekening kon niet worden afgerond.",
      ),
      code: errorCode(response.body),
    };
  }
  return {
    ok: true,
    value: {
      safeReference,
      status: "submitted_for_review",
      promotionState: promotionState as "pending" | "promoted" | "blocked",
      accountHandoff: accountHandoff as SignupAccountHandoff,
    },
  };
}
