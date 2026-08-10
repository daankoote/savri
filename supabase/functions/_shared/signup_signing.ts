import { sha256Hex } from "./app_foundation.ts";
import {
  isLocalSupabaseRuntime,
  type ServerRuntimeEnvironment,
} from "./local_supabase_runtime.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function generateSigningOtp(): string {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function signingHmacHex(
  secret: string,
  value: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

export function signingVerifierSecret(
  environment: ServerRuntimeEnvironment = Deno.env,
): string | null {
  const configured = (environment.get("SIGNING_OTP_VERIFIER_SECRET") || "")
    .trim();
  if (configured.length >= 32) return configured;
  if (isLocalSupabaseRuntime(environment.get("SUPABASE_URL") || "")) {
    const localFallback = (environment.get("SUPABASE_SERVICE_ROLE_KEY") || "")
      .trim();
    if (localFallback.length >= 32) return localFallback;
  }
  return null;
}

export async function channelReference(
  secret: string,
  normalizedEmail: string,
): Promise<string> {
  return await signingHmacHex(secret, `signing-channel:${normalizedEmail}`);
}

export async function otpVerifier(
  secret: string,
  otp: string,
): Promise<string> {
  return await signingHmacHex(secret, `signing-otp:${otp}`);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "je e-mailadres";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function safeString(value: unknown, maximum: number): string {
  const text = typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
  return text.length <= maximum ? text : "";
}

export function safeStringArray(
  value: unknown,
  maximumItems = 100,
): string[] | null {
  if (
    !Array.isArray(value) || value.length === 0 || value.length > maximumItems
  ) return null;
  const strings = value.map((item) => safeString(item, 100));
  return strings.every(Boolean) ? [...new Set(strings)] : null;
}

export async function safePayloadHash(value: unknown): Promise<string> {
  return await sha256Hex(JSON.stringify(value));
}
