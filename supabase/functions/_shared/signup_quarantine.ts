import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { sha256Hex } from "./app_foundation.ts";

export const SIGNUP_QUARANTINE_BUCKET = "app-documents";
export const SIGNUP_QUARANTINE_PREFIX = "signup-quarantine/";
export const SIGNUP_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SHA256_RE = /^[0-9a-f]{64}$/;

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function stringField(record: UnknownRecord, key: string): string {
  return typeof record[key] === "string" ? String(record[key]).trim() : "";
}

export async function parseRecordBody(req: Request): Promise<UnknownRecord | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch (_error) {
    return null;
  }
}

export function signupServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function deriveCapabilityToken(
  purpose: "intake_manage" | "quarantine_upload",
  idempotencyKey: string,
  normalizedPayloadHash: string,
): Promise<string> {
  const configuredSecret = Deno.env.get("APP_SIGNUP_CAPABILITY_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  let localRuntime = false;
  try {
    localRuntime = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      new URL(supabaseUrl).hostname,
    );
  } catch (_error) {
    localRuntime = false;
  }
  const secret = configuredSecret ||
    (localRuntime ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" : "");
  if (!secret) throw new Error("capability secret unavailable");

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(`${purpose}:${idempotencyKey}:${normalizedPayloadHash}`),
  );
  return `sq_${base64Url(new Uint8Array(signature))}`;
}

export async function capabilityHash(rawToken: string): Promise<string> {
  return await sha256Hex(rawToken);
}

export function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function configuredMinutes(name: string, fallback: number, minimum: number, maximum: number): number {
  const configured = Number(Deno.env.get(name) || fallback);
  if (!Number.isInteger(configured) || configured < minimum || configured > maximum) return fallback;
  return configured;
}

export function publicRpcBody(value: unknown): { status: number; body: UnknownRecord } | null {
  if (!isRecord(value)) return null;
  const status = Number(value.status);
  if (!Number.isInteger(status) || status < 100 || status > 599) return null;
  const { status: _status, ...body } = value;
  return { status, body };
}

export async function createSignupSignedUpload(
  SB: any,
  bucket: string,
  path: string,
): Promise<{ signed_upload_url: string; upload_token: string } | null> {
  if (bucket !== SIGNUP_QUARANTINE_BUCKET || !path.startsWith(SIGNUP_QUARANTINE_PREFIX)) return null;
  const { data, error } = await SB.storage.from(bucket).createSignedUploadUrl(
    path,
    { upsert: false },
  );
  if (error || !data?.signedUrl || !data?.token) return null;
  return {
    signed_upload_url: String(data.signedUrl),
    upload_token: String(data.token),
  };
}

export async function downloadSignupObject(
  SB: any,
  bucket: string,
  path: string,
): Promise<
  | { ok: true; sizeBytes: number; detectedMimeType: string; serverSha256: string }
  | { ok: false; failureCode: "object_missing" | "object_read_failed" }
> {
  if (bucket !== SIGNUP_QUARANTINE_BUCKET || !path.startsWith(SIGNUP_QUARANTINE_PREFIX)) {
    return { ok: false, failureCode: "object_missing" };
  }
  const { data, error } = await SB.storage.from(bucket).download(path);
  if (error || !data) return { ok: false, failureCode: "object_missing" };
  try {
    const bytes = await data.arrayBuffer();
    const view = new Uint8Array(bytes);
    const detectedMimeType = view.length >= 5 &&
        view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 &&
        view[3] === 0x46 && view[4] === 0x2d
      ? "application/pdf"
      : "application/octet-stream";
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const serverSha256 = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return { ok: true, sizeBytes: view.byteLength, detectedMimeType, serverSha256 };
  } catch (_error) {
    return { ok: false, failureCode: "object_read_failed" };
  }
}

export function sanitizeFilename(value: string): string | null {
  const name = value.trim();
  if (!name || name.length > 180 || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
