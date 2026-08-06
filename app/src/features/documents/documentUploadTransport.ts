import type { SupabaseClient } from "@supabase/supabase-js";

export type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function jsonStringField(record: JsonRecord, key: string): string {
  return typeof record[key] === "string" ? String(record[key]).trim() : "";
}

export function jsonNumberField(record: JsonRecord, key: string): number | null {
  return typeof record[key] === "number" && Number.isFinite(record[key]) ? Number(record[key]) : null;
}

export async function sha256HexFromBlob(
  file: Blob,
  digestImpl: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer> =
    crypto.subtle.digest.bind(crypto.subtle),
): Promise<string | null> {
  try {
    const bytes = await file.arrayBuffer();
    const hash = await digestImpl("SHA-256", bytes);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch (_error) {
    return null;
  }
}

export async function parseJsonResponse(response: Response): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await response.json() };
  } catch (_error) {
    return { ok: false };
  }
}

export async function postUploadJson(input: {
  endpointUrl: string;
  anonKey: string;
  idempotencyKey: string;
  body: unknown;
  accessToken?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: input.anonKey,
    "Content-Type": "application/json",
    "Idempotency-Key": input.idempotencyKey,
  };
  if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`;
  return await (input.fetchImpl ?? fetch)(input.endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
    signal: input.signal,
  });
}

export async function putSignedUpload(input: {
  supabaseClient: Pick<SupabaseClient, "storage">;
  bucket: string;
  path: string;
  uploadToken: string;
  file: Blob;
  contentType: string;
}): Promise<{ ok: true } | { ok: false }> {
  const result = await input.supabaseClient.storage
    .from(input.bucket)
    .uploadToSignedUrl(input.path, input.uploadToken, input.file, {
      contentType: input.contentType,
    });
  return result.error ? { ok: false } : { ok: true };
}

export function createUploadIdempotencyKey(): string {
  return crypto.randomUUID();
}
