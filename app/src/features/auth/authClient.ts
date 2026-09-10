import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { resolveAuthRuntimeConfig } from "./authRuntimeConfig.ts";
import { mapSupabaseAuthError, mapSupabaseRecoveryError, safeAuthError } from "./authErrorMapping.ts";
import { buildFixedAuthCallbackUrl } from "./authUxFlow.ts";
import type { AuthOperationResult, AuthSafeError } from "./authTypes.ts";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const config = resolveAuthRuntimeConfig();
  if (!config.ok) return null;

  supabaseClient = createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return supabaseClient;
}

export async function getCurrentAuthSessionResult(): Promise<
  { ok: true; session: Session | null } | { ok: false; error: AuthSafeError }
> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: safeAuthError("not_configured") };

  try {
    const { data, error } = await client.auth.getSession();
    if (error) return { ok: false, error: mapSupabaseAuthError(error.message, error.code) };
    return { ok: true, session: data.session ?? null };
  } catch {
    return { ok: false, error: safeAuthError("service_unavailable") };
  }
}

export async function getCurrentAuthSession(): Promise<Session | null> {
  const result = await getCurrentAuthSessionResult();
  return result.ok ? result.session : null;
}

export function subscribeToAuthState(
  onChange: (event: AuthChangeEvent, session: Session | null) => void,
): { unsubscribe: () => void } {
  const client = getSupabaseBrowserClient();
  if (!client) return { unsubscribe: () => undefined };

  const { data } = client.auth.onAuthStateChange(onChange);
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

export async function signUpWithSupabasePassword(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session | null } | { ok: false; error: AuthSafeError }> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: safeAuthError("not_configured") };

  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: buildFixedAuthCallbackUrl("account_confirmation"),
    },
  });

  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error.message, error.code) };
  }

  return { ok: true, session: data.session ?? null };
}

export async function requestSupabasePasswordRecovery(email: string): Promise<AuthOperationResult> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: safeAuthError("not_configured") };

  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: buildFixedAuthCallbackUrl("password_recovery"),
    });
    return error ? { ok: false, error: safeAuthError("service_unavailable") } : { ok: true };
  } catch {
    return { ok: false, error: safeAuthError("service_unavailable") };
  }
}

export async function resendSupabaseVerificationEmail(email: string): Promise<AuthOperationResult> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: safeAuthError("not_configured") };

  try {
    const { error } = await client.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: buildFixedAuthCallbackUrl("account_confirmation"),
      },
    });
    return error ? { ok: false, error: safeAuthError("service_unavailable") } : { ok: true };
  } catch {
    return { ok: false, error: safeAuthError("service_unavailable") };
  }
}

export async function updateSupabaseRecoveryPassword(password: string): Promise<AuthOperationResult> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: safeAuthError("recovery_link_invalid") };

  try {
    const { error } = await client.auth.updateUser({ password });
    return error
      ? { ok: false, error: mapSupabaseRecoveryError(error.message, error.code) }
      : { ok: true };
  } catch {
    return { ok: false, error: safeAuthError("password_update_failed") };
  }
}

export async function signInWithSupabasePassword(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; error: AuthSafeError }> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: safeAuthError("not_configured") };

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.session) {
    return {
      ok: false,
      error: error ? mapSupabaseAuthError(error.message, error.code) : safeAuthError("invalid_credentials"),
    };
  }

  return { ok: true, session: data.session };
}

export async function signOutWithSupabase(): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client) return;

  await client.auth.signOut();
}

export async function signOutLocalSupabaseSession(): Promise<boolean> {
  const client = getSupabaseBrowserClient();
  if (!client) return false;

  const { error } = await client.auth.signOut({ scope: "local" });
  return !error;
}
