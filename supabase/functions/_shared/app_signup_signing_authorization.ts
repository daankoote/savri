import { requireVerifiedSupabaseAuthUser } from "./app_customer_auth.ts";
import {
  capabilityHash,
  isRecord,
  publicRpcBody,
  signupServiceClient,
} from "./signup_quarantine.ts";

type SignupServiceClient = NonNullable<ReturnType<typeof signupServiceClient>>;

export type AuthorizedSignupSigningIntakeV1 = Readonly<{
  intakeId: string;
  authUserId: string;
  emailNormalized: string;
  manageCapabilitySha256: string;
}>;

export type SignupSigningAuthorizationResult =
  | Readonly<{ ok: true; value: AuthorizedSignupSigningIntakeV1 }>
  | Readonly<{
    ok: false;
    status: number;
    code: string;
    message: string;
  }>;

export async function authorizeSignupSigningIntakeV1(
  req: Request,
  client: SignupServiceClient,
  intakeId: string,
  managementCapability: string,
): Promise<SignupSigningAuthorizationResult> {
  const verified = await requireVerifiedSupabaseAuthUser(req, client);
  if (!verified.ok) return verified;
  const intake = await client.from("app_signup_intakes").select(
    "email_normalized,status,expires_at",
  ).eq("id", intakeId).maybeSingle();
  if (
    intake.error || !intake.data || intake.data.status !== "collecting" ||
    Date.parse(String(intake.data.expires_at || "")) <= Date.now() ||
    String(intake.data.email_normalized || "") !==
      verified.context.emailNormalized
  ) {
    return {
      ok: false,
      status: 403,
      code: "intake_unavailable",
      message: "Deze aanmelding is niet beschikbaar.",
    };
  }
  const manageCapabilitySha256 = await capabilityHash(managementCapability);
  const status = await client.rpc("app_signup_signing_status_v2", {
    p_intake_id: intakeId,
    p_manage_token_sha256: manageCapabilitySha256,
  });
  const statusRpc = status.error ? null : publicRpcBody(status.data);
  if (
    !statusRpc || statusRpc.body.ok !== true ||
    statusRpc.body.signing_state !== "collecting"
  ) {
    return {
      ok: false,
      status: 403,
      code: "intake_unavailable",
      message: "Deze aanmelding is niet beschikbaar.",
    };
  }
  const provenance = await client.from(
    "app_signup_authenticated_intake_provenance",
  ).select("auth_user_id").eq("intake_id", intakeId).maybeSingle();
  if (
    provenance.error || !provenance.data ||
    !isRecord(provenance.data) ||
    provenance.data.auth_user_id !== verified.context.authUserId
  ) {
    return {
      ok: false,
      status: 403,
      code: "intake_unavailable",
      message: "Deze aanmelding is niet beschikbaar.",
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      intakeId,
      authUserId: verified.context.authUserId,
      emailNormalized: verified.context.emailNormalized,
      manageCapabilitySha256,
    }),
  };
}
