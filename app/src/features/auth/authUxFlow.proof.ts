import { mapSupabaseRecoveryError, safeAuthError } from "./authErrorMapping.ts";
import {
  AUTH_ACCOUNT_COMPATIBILITY_ROUTE,
  AUTH_LOGIN_ROUTE,
  AUTH_PASSWORD_REQUEST_ROUTE,
  AUTH_PASSWORD_UPDATE_ROUTE,
  AUTH_VERIFICATION_RESEND_ROUTE,
  buildFixedAuthCallbackUrl,
  cleanAuthCallbackLocation,
  getResendCooldownSeconds,
  hasPasswordRecoveryCallbackData,
  PASSWORD_RECOVERY_REQUESTED_MESSAGE,
  RESEND_COOLDOWN_MS,
  resolveAuthEventDisposition,
  resolveAuthPageKind,
  VERIFICATION_RESEND_REQUESTED_MESSAGE,
} from "./authUxFlow.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));

assert(
  resolveAuthPageKind(AUTH_LOGIN_ROUTE) === "account" &&
    resolveAuthPageKind(AUTH_PASSWORD_REQUEST_ROUTE) === "password_request" &&
    resolveAuthPageKind(AUTH_PASSWORD_UPDATE_ROUTE) === "password_update" &&
    resolveAuthPageKind(AUTH_VERIFICATION_RESEND_ROUTE) ===
      "verification_resend",
  "Q01_dutch_auth_routes_invalid",
);

assert(
  buildFixedAuthCallbackUrl(
      "account_confirmation",
      "https://app.enval.nl/ignored",
    ) ===
      "https://app.enval.nl/inloggen" &&
    buildFixedAuthCallbackUrl(
        "password_recovery",
        "https://app.enval.nl/ignored",
      ) ===
      "https://app.enval.nl/account/nieuw-wachtwoord",
  "Q02_fixed_callback_routes_invalid",
);

for (const event of ["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"]) {
  assert(
    resolveAuthEventDisposition(event, true, "password_recovery") === "ignore",
    `Q03_non_recovery_event_accepted:${event}`,
  );
}
assert(
  resolveAuthEventDisposition(
        "PASSWORD_RECOVERY",
        true,
        "password_recovery",
      ) ===
      "password_recovery" &&
    resolveAuthEventDisposition(
        "PASSWORD_RECOVERY",
        false,
        "password_recovery",
      ) ===
      "reject_password_recovery" &&
    resolveAuthEventDisposition("PASSWORD_RECOVERY", true, "portal") ===
      "reject_password_recovery" &&
    resolveAuthEventDisposition("SIGNED_IN", true, "portal") ===
      "portal_session" &&
    resolveAuthEventDisposition("SIGNED_IN", true, "public_request") ===
      "ignore",
  "Q04_password_recovery_priority_invalid",
);

assert(
  cleanAuthCallbackLocation(AUTH_PASSWORD_UPDATE_ROUTE) ===
      AUTH_PASSWORD_UPDATE_ROUTE &&
    cleanAuthCallbackLocation("https://attacker.invalid/reset") ===
      AUTH_PASSWORD_UPDATE_ROUTE &&
    cleanAuthCallbackLocation("//attacker.invalid/reset") ===
      AUTH_PASSWORD_UPDATE_ROUTE &&
    cleanAuthCallbackLocation("/account?next=https://attacker.invalid") ===
      AUTH_PASSWORD_UPDATE_ROUTE,
  "Q05_callback_cleanup_or_open_redirect_invalid",
);
assert(
  AUTH_ACCOUNT_COMPATIBILITY_ROUTE === "/account" &&
    AUTH_LOGIN_ROUTE === "/inloggen",
  "Q01b_login_and_compatibility_routes_not_distinct",
);

assert(
  hasPasswordRecoveryCallbackData("#type=recovery&access_token=hidden") &&
    hasPasswordRecoveryCallbackData("type=recovery") &&
    !hasPasswordRecoveryCallbackData("#type=signup") &&
    !hasPasswordRecoveryCallbackData("#type=recovery&type=signup"),
  "Q05b_recovery_callback_guard_invalid",
);

assert(
  getResendCooldownSeconds(RESEND_COOLDOWN_MS, 0) === 60 &&
    getResendCooldownSeconds(60_001, 1_500) === 59 &&
    getResendCooldownSeconds(5_000, 5_000) === 0 &&
    getResendCooldownSeconds(1_000, 5_000) === 0,
  "Q06_resend_cooldown_invalid",
);

const expired = mapSupabaseRecoveryError("OTP expired", "otp_expired");
const manipulated = mapSupabaseRecoveryError(
  "Invalid refresh token",
  "refresh_token_not_found",
);
const unknown = mapSupabaseRecoveryError(
  "upstream detail that must stay hidden",
  "unexpected",
);
assert(
  expired.code === "recovery_link_invalid" &&
    manipulated.code === "recovery_link_invalid" &&
    unknown.code === "password_update_failed" &&
    ![expired.message, manipulated.message, unknown.message].some((message) =>
      /otp|token|upstream|refresh/i.test(message)
    ) &&
    safeAuthError("recovery_link_invalid").message === expired.message,
  "Q07_recovery_error_mapping_leaks_details",
);

assert(
  PASSWORD_RECOVERY_REQUESTED_MESSAGE.includes("Als het e-mailadres") &&
    VERIFICATION_RESEND_REQUESTED_MESSAGE.includes("Als een verificatiemail") &&
    !PASSWORD_RECOVERY_REQUESTED_MESSAGE.includes("bestaat") &&
    !VERIFICATION_RESEND_REQUESTED_MESSAGE.includes("bestaat"),
  "Q08_anti_enumeration_copy_invalid",
);

const [
  appSource,
  accountSource,
  authClientSource,
  emailRequestSource,
  authProviderSource,
  authUxSource,
  passwordRecoverySource,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/features/auth/AccountPage.tsx"),
  source("app/src/features/auth/authClient.ts"),
  source("app/src/features/auth/AuthEmailRequestPage.tsx"),
  source("app/src/features/auth/AuthProvider.tsx"),
  source("app/src/features/auth/authUxFlow.ts"),
  source("app/src/features/auth/PasswordRecoveryPage.tsx"),
]);

assert(
  authClientSource.includes("auth.resetPasswordForEmail") &&
    authClientSource.includes(
      'redirectTo: buildFixedAuthCallbackUrl("password_recovery")',
    ) &&
    authClientSource.includes("auth.updateUser({ password })") &&
    authClientSource.includes("auth.resend({") &&
    authClientSource.includes('type: "signup"') &&
    authClientSource.includes(
      'emailRedirectTo: buildFixedAuthCallbackUrl("account_confirmation")',
    ) &&
    !authClientSource.includes("flowType"),
  "Q09_supabase_auth_methods_or_implicit_flow_changed",
);

const dispositionIndex = authProviderSource.indexOf(
  "resolveAuthEventDisposition(",
);
const callbackBootstrapIndex = authProviderSource.indexOf(
  "void bootstrapSession(nextSession)",
);
assert(
  dispositionIndex >= 0 &&
    callbackBootstrapIndex > dispositionIndex &&
    authProviderSource.includes('disposition === "password_recovery"') &&
    authProviderSource.includes('setStatus("recovery_ready")') &&
    authProviderSource.includes("recoveryCallbackPresentRef.current") &&
    authProviderSource.includes("recoveryEventSeenRef.current = true") &&
    authProviderSource.includes("recoveryValidationStartedRef.current") &&
    authProviderSource.includes("recoveryReadyRef.current") &&
    authProviderSource.includes(
      'event === "PASSWORD_RECOVERY" && !recoveryCallbackPresentRef.current',
    ) &&
    authProviderSource.includes(
      "result.session.access_token !== nextSession.access_token",
    ) &&
    authProviderSource.includes("window.setTimeout(() =>") &&
    authProviderSource.includes("signOutLocalSupabaseSession") &&
    authProviderSource.includes(
      "getCurrentAuthSessionResult().then((result)",
    ) &&
    authClientSource.includes(
      "const { data, error } = await client.auth.getSession()",
    ),
  "Q10_recovery_intent_priority_or_session_error_handling_missing",
);

assert(
  appSource.includes("AUTH_PASSWORD_REQUEST_ROUTE") &&
    appSource.includes("AUTH_PASSWORD_UPDATE_ROUTE") &&
    appSource.includes("AUTH_VERIFICATION_RESEND_ROUTE") &&
    appSource.includes('"password_recovery"') &&
    appSource.includes('"public_request"') &&
    emailRequestSource.includes("requestSupabasePasswordRecovery(email)") &&
    emailRequestSource.includes("resendSupabaseVerificationEmail(email)") &&
    emailRequestSource.includes("catch {") &&
    emailRequestSource.includes(
      'setFeedback({ kind: "info", message: copy.message })',
    ) &&
    emailRequestSource.includes('action: "Geen verificatiemail ontvangen?"') &&
    emailRequestSource.includes("accountregistratie die nog niet is bevestigd") &&
    !emailRequestSource.includes("result.error") &&
    passwordRecoverySource.includes("updateRecoveredPassword(password)") &&
    passwordRecoverySource.includes("passwordConfirmation") &&
    accountSource.includes("Geen verificatiemail ontvangen?") &&
    !authProviderSource.includes("requestSupabasePasswordRecovery") &&
    !authProviderSource.includes("resendSupabaseVerificationEmail") &&
    !authProviderSource.includes("REQUESTED_MESSAGE"),
  "Q11_routes_or_account_actions_missing",
);

assert(
  authUxSource.includes("window.history.replaceState") &&
    authUxSource.includes('window.location.href.endsWith("#")') &&
    !authUxSource.includes("returnTo") &&
    !authUxSource.includes("next") &&
    !authUxSource.includes("localStorage") &&
    !authUxSource.includes("sessionStorage") &&
    ![authUxSource, accountSource, emailRequestSource, passwordRecoverySource]
      .some((value) =>
      /(api-app-auth-bootstrap|app_signup|app_signing|access[_-]?grant|promot)/i
        .test(value)
      ),
  "Q12_callback_data_or_business_authority_leak",
);

console.log("AUTH_UX_RECOVERY_RESEND_Q01_Q12=PASS");
Deno.exit(0);
