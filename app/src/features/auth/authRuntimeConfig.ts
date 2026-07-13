/// <reference types="vite/client" />

export type AuthRuntimeConfig =
  | { ok: true; supabaseUrl: string; anonKey: string; bootstrapEndpointUrl: string; dashboardEndpointUrl: string }
  | { ok: false; message: string };

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function deriveSupabaseUrlFromApiBase(apiBaseUrl: string): string {
  if (!apiBaseUrl.endsWith("/functions/v1")) return "";
  return trimTrailingSlash(apiBaseUrl.slice(0, -"/functions/v1".length));
}

export function resolveAuthRuntimeConfig(): AuthRuntimeConfig {
  const configuredSupabaseUrl = trimTrailingSlash(String(import.meta.env.VITE_SUPABASE_URL || "").trim());
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const apiBaseUrl = trimTrailingSlash(String(import.meta.env.VITE_API_BASE_URL || "").trim());
  const supabaseUrl = configuredSupabaseUrl || deriveSupabaseUrlFromApiBase(apiBaseUrl);
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

  if (!supabaseUrl || !anonKey || !bootstrapEndpointUrl || !dashboardEndpointUrl) {
    return {
      ok: false,
      message: "Inloggen is lokaal nog niet geconfigureerd.",
    };
  }

  return { ok: true, supabaseUrl, anonKey, bootstrapEndpointUrl, dashboardEndpointUrl };
}
