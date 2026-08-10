import { resolveAuthRuntimeConfig } from "../auth/authRuntimeConfig.ts";
import { createUploadIdempotencyKey } from "../documents/documentUploadTransport.ts";
import type { CanonicalSigningFact } from "./signing/canonicalSigningFacts.ts";
import { readSignupIntakeSession } from "./signupIntakeCapabilityStore.ts";

type SigningRuntimeConfig = {
  anonKey: string;
  challengeEndpointUrl: string;
  finalizeEndpointUrl: string;
};

export type SigningChallengeReceipt = {
  challengeReference: string;
  expiresAt: string;
  deliveryTargetMasked: string;
};

export type SigningFinalizeReceipt = {
  safeReference: string;
  status: "pending_verification";
};

export type SignupSigningStatus =
  | {
    signingState: "collecting";
    locked: false;
    intakeStatus: "collecting";
  }
  | {
    signingState: "finalized";
    locked: true;
    intakeStatus: "pending_verification";
    safeReference: string;
    finalizedAt: string;
  };

export type SigningClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function runtimeConfig(): SigningRuntimeConfig | null {
  const auth = resolveAuthRuntimeConfig();
  if (!auth.ok) return null;
  const suffix = "/api-app-dashboard-get";
  if (!auth.dashboardEndpointUrl.endsWith(suffix)) return null;
  const base = auth.dashboardEndpointUrl.slice(0, -suffix.length);
  return {
    anonKey: auth.anonKey,
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
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${anonKey}`,
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
  if (
    response.ok && signingState === "finalized" && locked === true &&
    intakeStatus === "pending_verification" &&
    /^SIG-[A-F0-9]{12}$/.test(safeReference) &&
    Number.isFinite(new Date(finalizedAt).getTime())
  ) {
    return {
      ok: true,
      value: {
        signingState: "finalized",
        locked: true,
        intakeStatus: "pending_verification",
        safeReference,
        finalizedAt,
      },
    };
  }
  return {
    ok: false,
    message: message(
      response.body,
      "Deze aanmelding kan niet veilig worden hersteld.",
    ),
  };
}

export async function requestSignupSigningChallenge(): Promise<
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
  });
  const challengeReference = String(response.body.challenge_reference || "");
  const expiresAt = String(response.body.expires_at || "");
  if (!response.ok || !challengeReference || !expiresAt) {
    return {
      ok: false,
      message: message(response.body, "De code kon niet worden verzonden."),
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
  if (
    !response.ok || !/^SIG-[A-F0-9]{12}$/.test(safeReference) ||
    status !== "pending_verification"
  ) {
    return {
      ok: false,
      message: message(
        response.body,
        "De ondertekening kon niet worden afgerond.",
      ),
    };
  }
  return {
    ok: true,
    value: { safeReference, status: "pending_verification" },
  };
}
