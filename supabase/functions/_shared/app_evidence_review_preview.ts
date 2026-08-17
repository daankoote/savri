export const EVIDENCE_REVIEW_PREVIEW_SCHEMA_VERSION =
  "evidence-review-preview-v1" as const;
export const EVIDENCE_REVIEW_PREVIEW_TTL_SECONDS = 120;

type JsonObject = Record<string, unknown>;

export type EvidenceReviewPreviewSource = Readonly<{
  evidenceVersionRef: string;
  filename: string;
  mimeType: "application/pdf";
  storageBucket: string;
  storagePath: string;
}>;

export type EvidenceReviewPreviewResponseV1 = Readonly<{
  schemaVersion: typeof EVIDENCE_REVIEW_PREVIEW_SCHEMA_VERSION;
  evidenceVersionRef: string;
  filename: string;
  mimeType: "application/pdf";
  signedUrl: string;
  expiresAt: string;
}>;

const SOURCE_KEYS = [
  "code",
  "evidence_version_ref",
  "mime_type",
  "ok",
  "original_filename",
  "status",
  "storage_bucket",
  "storage_path",
].join("|");

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function boundedServerString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value === value.trim() &&
      value.length > 0 && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function safeFilename(value: unknown): string | null {
  const filename = boundedServerString(value, 180);
  return filename && !filename.includes("/") && !filename.includes("\\") &&
      !filename.includes("..")
    ? filename
    : null;
}

export function parseEvidenceReviewPreviewSource(
  input: unknown,
): EvidenceReviewPreviewSource | null {
  if (
    !isObject(input) || Object.keys(input).sort().join("|") !== SOURCE_KEYS ||
    input.ok !== true || input.status !== 200 || input.code !== "ok" ||
    !isUuid(input.evidence_version_ref) || input.mime_type !== "application/pdf"
  ) return null;

  const filename = safeFilename(input.original_filename);
  const storageBucket = boundedServerString(input.storage_bucket, 100);
  const storagePath = boundedServerString(input.storage_path, 1_024);
  if (!filename || !storageBucket || !storagePath || storagePath.includes("..")) {
    return null;
  }

  return Object.freeze({
    evidenceVersionRef: input.evidence_version_ref,
    filename,
    mimeType: "application/pdf" as const,
    storageBucket,
    storagePath,
  });
}

function safeSignedUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8_192) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? value
      : null;
  } catch (_error) {
    return null;
  }
}

export function buildEvidenceReviewPreviewResponse(
  source: EvidenceReviewPreviewSource,
  signedUrlInput: unknown,
  now: Date,
): EvidenceReviewPreviewResponseV1 | null {
  const signedUrl = safeSignedUrl(signedUrlInput);
  if (!signedUrl || !Number.isFinite(now.getTime())) return null;
  return Object.freeze({
    schemaVersion: EVIDENCE_REVIEW_PREVIEW_SCHEMA_VERSION,
    evidenceVersionRef: source.evidenceVersionRef,
    filename: source.filename,
    mimeType: source.mimeType,
    signedUrl,
    expiresAt: new Date(
      now.getTime() + EVIDENCE_REVIEW_PREVIEW_TTL_SECONDS * 1_000,
    ).toISOString(),
  });
}
