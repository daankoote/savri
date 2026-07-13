import type { Session } from "@supabase/supabase-js";

export type AuthMode = "activate" | "signin";

export type AuthStatus =
  | "initializing"
  | "signed_out"
  | "authenticated_unbound"
  | "bootstrapping"
  | "ready"
  | "error";

export type AuthDossierSummary = {
  dossier_id: string;
  dossier_number: string;
  account_type: "particulier" | "zakelijk" | "vve";
  status: string;
};

export type AuthBootstrapSummary = {
  customer_id: string;
  identity_id: string;
  identity_status: "active";
  binding_status: "bound";
  dossiers: AuthDossierSummary[];
  payload_hash: string;
  request_id: string;
  replayed: boolean;
};

export type AuthSafeErrorCode =
  | "not_configured"
  | "invalid_credentials"
  | "password_mismatch"
  | "password_too_short"
  | "auth_email_not_verified"
  | "customer_identity_not_found"
  | "customer_identity_already_bound"
  | "customer_identity_binding_ambiguous"
  | "customer_inactive"
  | "service_unavailable"
  | "invalid_response"
  | "unknown";

export type AuthSafeError = {
  code: AuthSafeErrorCode;
  message: string;
};

export type AuthActionResult =
  | { ok: true; status: "ready"; summary: AuthBootstrapSummary }
  | { ok: true; status: "verification_required"; message: string }
  | { ok: false; error: AuthSafeError };

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  summary: AuthBootstrapSummary | null;
  error: AuthSafeError | null;
  signUpWithPassword: (email: string, password: string, passwordConfirmation: string) => Promise<AuthActionResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthActionResult>;
  retryBootstrap: () => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
};
