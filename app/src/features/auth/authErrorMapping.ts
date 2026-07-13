import type { AuthSafeError, AuthSafeErrorCode } from "./authTypes";

const errorMessages: Record<AuthSafeErrorCode, string> = {
  not_configured: "Inloggen is lokaal nog niet geconfigureerd.",
  invalid_credentials: "Controleer uw e-mailadres en wachtwoord.",
  password_mismatch: "De wachtwoorden komen niet overeen.",
  password_too_short: "Gebruik minimaal 8 tekens.",
  auth_email_not_verified: "Controleer eerst uw e-mail om het account te bevestigen.",
  customer_identity_not_found: "We konden geen passende ENVAL-aanmelding koppelen. Neem contact op met ENVAL.",
  customer_identity_already_bound: "Dit account vraagt om ondersteuning. Neem contact op met ENVAL.",
  customer_identity_binding_ambiguous: "Deze koppeling vraagt om handmatige controle. Neem contact op met ENVAL.",
  customer_inactive: "Dit account is niet beschikbaar. Neem contact op met ENVAL.",
  service_unavailable: "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
  invalid_response: "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
  unknown: "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
};

export function safeAuthError(code: AuthSafeErrorCode): AuthSafeError {
  return { code, message: errorMessages[code] };
}

export function mapSupabaseAuthError(message: string): AuthSafeError {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("email not confirmed")
  ) {
    return safeAuthError("invalid_credentials");
  }

  return safeAuthError("service_unavailable");
}

export function mapBootstrapErrorCode(code: string): AuthSafeError {
  if (code === "auth_email_not_verified") return safeAuthError("auth_email_not_verified");
  if (code === "customer_identity_not_found") return safeAuthError("customer_identity_not_found");
  if (code === "customer_identity_already_bound") return safeAuthError("customer_identity_already_bound");
  if (code === "customer_identity_binding_ambiguous") return safeAuthError("customer_identity_binding_ambiguous");
  if (code === "customer_inactive") return safeAuthError("customer_inactive");
  if (code === "service_unavailable") return safeAuthError("service_unavailable");

  return safeAuthError("invalid_response");
}
