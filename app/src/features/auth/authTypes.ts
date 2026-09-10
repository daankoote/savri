import type { Session } from "@supabase/supabase-js";

export type AuthMode = "activate" | "signin";
export type AuthAudience = "customer" | "operator";

export type AuthStatus =
  | "initializing"
  | "signed_out"
  | "bootstrapping"
  | "recovery_ready"
  | "ready"
  | "error";

export type AuthDossierSummary = {
  dossier_id: string;
  dossier_number: string | null;
  account_type: "particulier" | "zakelijk" | "vve";
  portal_context: "customer" | "business";
  status: string;
  case_id: string;
  case_reference: string;
};

export type AuthBootstrapSummary = {
  schema_version: "auth_bootstrap_browser_v3";
  authenticated: true;
  binding_status: "bound";
  portal_contexts: Array<"customer" | "business">;
  dossiers: AuthDossierSummary[];
};

export type AuthSafeErrorCode =
  | "not_configured"
  | "invalid_credentials"
  | "password_mismatch"
  | "password_too_short"
  | "recovery_link_invalid"
  | "password_update_failed"
  | "account_already_exists"
  | "auth_email_not_verified"
  | "customer_identity_not_found"
  | "customer_identity_already_bound"
  | "customer_identity_binding_ambiguous"
  | "customer_inactive"
  | "customer_dossier_not_found"
  | "portal_context_not_authorized"
  | "service_unavailable"
  | "invalid_response"
  | "unknown";

export type AuthSafeError = {
  code: AuthSafeErrorCode;
  message: string;
};

export type AuthActionResult =
  | { ok: true; status: "ready"; summary: AuthBootstrapSummary | null }
  | { ok: true; status: "verification_required" }
  | { ok: false; error: AuthSafeError };

export type AuthOperationResult =
  | { ok: true }
  | { ok: false; error: AuthSafeError };

export type AuthContextValue = {
  audience: AuthAudience;
  status: AuthStatus;
  session: Session | null;
  summary: AuthBootstrapSummary | null;
  error: AuthSafeError | null;
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<AuthActionResult>;
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<AuthActionResult>;
  updateRecoveredPassword: (password: string) => Promise<AuthOperationResult>;
  retryBootstrap: () => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
};
