/// <reference types="vite/client" />

import type { SignupSubmitClientConfig } from "./signupSubmitClient";

export type SignupSubmitRuntimeConfig =
  | { ok: true; endpointUrl: string; anonKey: string }
  | { ok: false; message: string };

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveEndpointUrl(): string {
  const apiBaseUrl = trimTrailingSlash(String(import.meta.env.VITE_API_BASE_URL || "").trim());
  if (apiBaseUrl) return `${apiBaseUrl}/api-app-signup-submit`;

  const supabaseUrl = trimTrailingSlash(String(import.meta.env.VITE_SUPABASE_URL || "").trim());
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/api-app-signup-submit`;

  return "";
}

export function resolveSignupSubmitRuntimeConfig(): SignupSubmitRuntimeConfig {
  const endpointUrl = resolveEndpointUrl();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

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
