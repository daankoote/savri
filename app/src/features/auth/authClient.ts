import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { resolveAuthRuntimeConfig } from "./authRuntimeConfig";
import { mapSupabaseAuthError, safeAuthError } from "./authErrorMapping";
import type { AuthActionResult } from "./authTypes";

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

export async function getCurrentAuthSession(): Promise<Session | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  return data.session ?? null;
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
): Promise<{ ok: true; session: Session | null } | { ok: false; result: AuthActionResult }> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, result: { ok: false, error: safeAuthError("not_configured") } };

  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/account`,
    },
  });

  if (error) {
    return { ok: false, result: { ok: false, error: mapSupabaseAuthError(error.message) } };
  }

  return { ok: true, session: data.session ?? null };
}

export async function signInWithSupabasePassword(
  email: string,
  password: string,
): Promise<{ ok: true; session: Session } | { ok: false; result: AuthActionResult }> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, result: { ok: false, error: safeAuthError("not_configured") } };

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.session) {
    return { ok: false, result: { ok: false, error: error ? mapSupabaseAuthError(error.message) : safeAuthError("invalid_credentials") } };
  }

  return { ok: true, session: data.session };
}

export async function signOutWithSupabase(): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client) return;

  await client.auth.signOut();
}
