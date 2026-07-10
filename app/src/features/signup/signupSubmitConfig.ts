import type { SignupSubmitClientConfig } from "./signupSubmitClient";

export type SignupSubmitRuntimeConfig =
  | { ok: true; endpointUrl: string; anonKey: string }
  | { ok: false; message: string };

function getEnvValue(key: string): string {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  return String(meta.env?.[key] || "").trim();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveEndpointUrl(): string {
  const apiBaseUrl = trimTrailingSlash(getEnvValue("VITE_API_BASE_URL"));
  if (apiBaseUrl) return `${apiBaseUrl}/api-app-signup-submit`;

  const supabaseUrl = trimTrailingSlash(getEnvValue("VITE_SUPABASE_URL"));
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/api-app-signup-submit`;

  return "";
}

export function resolveSignupSubmitRuntimeConfig(): SignupSubmitRuntimeConfig {
  const endpointUrl = resolveEndpointUrl();
  const anonKey = getEnvValue("VITE_SUPABASE_ANON_KEY");

  if (!endpointUrl || !anonKey) {
    return {
      ok: false,
      message: "Aanmelden is lokaal nog niet geconfigureerd.",
    };
  }

  return { ok: true, endpointUrl, anonKey };
}

export function buildSignupSubmitClientConfig(
  idempotencyKey: string,
): { ok: true; config: SignupSubmitClientConfig } | { ok: false; message: string } {
  const runtime = resolveSignupSubmitRuntimeConfig();
  if (!runtime.ok) return runtime;

  return {
    ok: true,
    config: {
      endpointUrl: runtime.endpointUrl,
      anonKey: runtime.anonKey,
      idempotencyKey,
    },
  };
}
