/// <reference types="vite/client" />

export type AuthRuntimeConfig =
  | {
    ok: true;
    supabaseUrl: string;
    anonKey: string;
    bootstrapEndpointUrl: string;
    dashboardEndpointUrl: string;
  }
  | { ok: false; message: string };

export type PublicApiRuntimeConfig =
  | { ok: true; supabaseUrl: string; anonKey: string; apiBaseUrl: string }
  | { ok: false; message: string };

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function deriveSupabaseUrlFromApiBase(apiBaseUrl: string): string {
  if (!apiBaseUrl.endsWith("/functions/v1")) return "";
  return trimTrailingSlash(apiBaseUrl.slice(0, -"/functions/v1".length));
}

export function resolvePublicApiRuntimeConfig(): PublicApiRuntimeConfig {
  const configuredSupabaseUrl = trimTrailingSlash(
    String(import.meta.env.VITE_SUPABASE_URL || "").trim(),
  );
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const configuredApiBaseUrl = trimTrailingSlash(
    String(import.meta.env.VITE_API_BASE_URL || "").trim(),
  );
  const supabaseUrl = configuredSupabaseUrl ||
    deriveSupabaseUrlFromApiBase(configuredApiBaseUrl);
  const apiBaseUrl = configuredApiBaseUrl ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1` : "");

  if (!supabaseUrl || !anonKey || !apiBaseUrl) {
    return {
      ok: false,
      message: "De app is lokaal nog niet geconfigureerd.",
    };
  }

  return { ok: true, supabaseUrl, anonKey, apiBaseUrl };
}

export function resolveAuthRuntimeConfig(): AuthRuntimeConfig {
  const publicRuntime = resolvePublicApiRuntimeConfig();
  if (!publicRuntime.ok) {
    return {
      ok: false,
      message: "Inloggen is lokaal nog niet geconfigureerd.",
    };
  }
  const { anonKey, apiBaseUrl, supabaseUrl } = publicRuntime;
  const bootstrapEndpointUrl = apiBaseUrl
    ? `${apiBaseUrl}/api-app-auth-bootstrap`
    : supabaseUrl
    ? `${supabaseUrl}/functions/v1/api-app-auth-bootstrap`
    : "";
  const dashboardEndpointUrl = apiBaseUrl
    ? `${apiBaseUrl}/api-app-dashboard-get`
    : supabaseUrl
    ? `${supabaseUrl}/functions/v1/api-app-dashboard-get`
    : "";

  return {
    ok: true,
    supabaseUrl,
    anonKey,
    bootstrapEndpointUrl,
    dashboardEndpointUrl,
  };
}
