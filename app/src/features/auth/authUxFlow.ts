export const AUTH_ACCOUNT_COMPATIBILITY_ROUTE = "/account";
export const AUTH_LOGIN_ROUTE = "/inloggen";
export const AUTH_PASSWORD_REQUEST_ROUTE = "/account/wachtwoord-vergeten";
export const AUTH_PASSWORD_UPDATE_ROUTE = "/account/nieuw-wachtwoord";
export const AUTH_VERIFICATION_RESEND_ROUTE =
  "/account/verificatiemail-opnieuw";

export const RESEND_COOLDOWN_MS = 60_000;

export const PASSWORD_RECOVERY_REQUESTED_MESSAGE =
  "Als het e-mailadres bij ons bekend is, ontvangt u een e-mail met verdere instructies.";
export const VERIFICATION_RESEND_REQUESTED_MESSAGE =
  "Als een verificatiemail nodig is, ontvangt u een e-mail met verdere instructies.";

export type AuthProviderIntent =
  | "portal"
  | "password_recovery"
  | "public_request";
export type AuthPageKind =
  | "account"
  | "password_request"
  | "password_update"
  | "verification_resend";
export type AuthEventDisposition =
  | "password_recovery"
  | "reject_password_recovery"
  | "signed_out"
  | "portal_session"
  | "ignore";

type AuthLogoutOptions = Readonly<{
  navigate: (href: string, options?: { replace?: boolean }) => void;
  onSuccess?: () => void;
  signOut: () => Promise<boolean>;
}>;

export async function completeAuthLogout({
  navigate,
  onSuccess,
  signOut,
}: AuthLogoutOptions): Promise<boolean> {
  const signedOut = await signOut().catch(() => false);
  if (!signedOut) return false;
  onSuccess?.();
  navigate(AUTH_LOGIN_ROUTE, { replace: true });
  return true;
}

export function resolveAuthPageKind(pathname: string): AuthPageKind {
  if (pathname === AUTH_PASSWORD_REQUEST_ROUTE) return "password_request";
  if (pathname === AUTH_PASSWORD_UPDATE_ROUTE) return "password_update";
  if (pathname === AUTH_VERIFICATION_RESEND_ROUTE) return "verification_resend";
  return "account";
}

export function buildFixedAuthCallbackUrl(
  purpose: "account_confirmation" | "password_recovery",
  appOrigin = window.location.origin,
): string {
  const canonicalOrigin = new URL(appOrigin).origin;
  const pathname = purpose === "password_recovery"
    ? AUTH_PASSWORD_UPDATE_ROUTE
    : AUTH_LOGIN_ROUTE;

  return new URL(pathname, canonicalOrigin).toString();
}

export function resolveAuthEventDisposition(
  event: string,
  hasSession: boolean,
  intent: AuthProviderIntent,
): AuthEventDisposition {
  if (event === "PASSWORD_RECOVERY") {
    return hasSession && intent === "password_recovery"
      ? "password_recovery"
      : "reject_password_recovery";
  }

  if (!hasSession) return "signed_out";
  if (intent !== "portal") return "ignore";
  return "portal_session";
}

export function hasPasswordRecoveryCallbackData(hash: string): boolean {
  const parameters = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );
  const types = parameters.getAll("type");
  return types.length === 1 && types[0] === "recovery";
}

export function cleanAuthCallbackLocation(pathname: string): string {
  return /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(pathname)
    ? pathname
    : AUTH_PASSWORD_UPDATE_ROUTE;
}

export function clearAuthCallbackUrl(): void {
  if (
    !window.location.search &&
    !window.location.hash &&
    !window.location.href.endsWith("#")
  ) return;
  window.history.replaceState(
    null,
    "",
    cleanAuthCallbackLocation(window.location.pathname),
  );
}

export function getResendCooldownSeconds(
  cooldownUntil: number,
  now: number,
): number {
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
}
