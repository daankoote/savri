import type {
  DocumentParserProfileKey,
  ParserObservationEnvelopeV1,
} from "../../../platform/runtime/document-parsing/document_parser_contract.ts";
import type { DocumentFactKey } from "../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";
import {
  createPrivateSignedUpload,
  downloadPrivateStorageObject,
  isRecord,
  sanitizeFilename,
  SIGNUP_MAX_UPLOAD_BYTES,
  stringField,
} from "./signup_quarantine.ts";

export const CORRECTION_REPLACEMENT_BUCKET = "app-documents";
export const CORRECTION_REPLACEMENT_PREFIX = "customer-corrections/";
export const CORRECTION_REPLACEMENT_MAX_UPLOAD_BYTES = SIGNUP_MAX_UPLOAD_BYTES;
export const CORRECTION_REPLACEMENT_ACCEPTED_MIME_TYPES = Object.freeze(
  [
    "application/pdf",
  ] as const,
);

export const REPLACEMENT_TARGET_REF_RE = /^CRT-[A-F0-9]{32}$/;
export const REPLACEMENT_UPLOAD_REF_RE = /^CRU-[A-F0-9]{32}$/;
export const REPLACEMENT_CANDIDATE_REF_RE = /^CRC-[A-F0-9]{32}$/;
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type CorrectionReplacementIssueRequest = Readonly<{
  caseRef: string;
  replacementTargetRef: string;
  fileName: string;
  mimeType: "application/pdf";
  sizeBytes: number;
}>;

export type CorrectionReplacementConfirmRequest = Readonly<{
  caseRef: string;
  uploadRef: string;
}>;

export type CorrectionReplacementWithdrawRequest = Readonly<{
  caseRef: string;
  replacementTargetRef: string;
  candidateRef: string;
}>;

type NormalizationFailure = Readonly<{
  ok: false;
  code: "invalid_input" | "unsupported_mime_type" | "file_too_large";
}>;

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === required.length &&
    required.every((key) => keys.includes(key));
}

export function normalizeCorrectionReplacementIssueRequest(
  value: unknown,
):
  | { ok: true; value: CorrectionReplacementIssueRequest }
  | NormalizationFailure {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "caseRef",
      "fileName",
      "mimeType",
      "replacementTargetRef",
      "sizeBytes",
    ])
  ) return { ok: false, code: "invalid_input" };
  const caseRef = stringField(value, "caseRef");
  const replacementTargetRef = stringField(value, "replacementTargetRef");
  const fileName = sanitizeFilename(stringField(value, "fileName"));
  const mimeType = stringField(value, "mimeType").toLowerCase();
  const sizeBytes = Number(value.sizeBytes);
  if (
    !CASE_REFERENCE_RE.test(caseRef) ||
    !REPLACEMENT_TARGET_REF_RE.test(replacementTargetRef) || !fileName
  ) return { ok: false, code: "invalid_input" };
  if (
    mimeType !== "application/pdf" || !fileName.toLowerCase().endsWith(".pdf")
  ) {
    return { ok: false, code: "unsupported_mime_type" };
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, code: "invalid_input" };
  }
  if (sizeBytes > CORRECTION_REPLACEMENT_MAX_UPLOAD_BYTES) {
    return { ok: false, code: "file_too_large" };
  }
  return {
    ok: true,
    value: {
      caseRef,
      replacementTargetRef,
      fileName,
      mimeType: "application/pdf",
      sizeBytes,
    },
  };
}

export function normalizeCorrectionReplacementConfirmRequest(
  value: unknown,
):
  | { ok: true; value: CorrectionReplacementConfirmRequest }
  | NormalizationFailure {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["caseRef", "uploadRef"])
  ) return { ok: false, code: "invalid_input" };
  const caseRef = stringField(value, "caseRef");
  const uploadRef = stringField(value, "uploadRef");
  if (
    !CASE_REFERENCE_RE.test(caseRef) ||
    !REPLACEMENT_UPLOAD_REF_RE.test(uploadRef)
  ) {
    return { ok: false, code: "invalid_input" };
  }
  return { ok: true, value: { caseRef, uploadRef } };
}

export function normalizeCorrectionReplacementWithdrawRequest(
  value: unknown,
):
  | { ok: true; value: CorrectionReplacementWithdrawRequest }
  | NormalizationFailure {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "candidateRef",
      "caseRef",
      "replacementTargetRef",
    ])
  ) return { ok: false, code: "invalid_input" };
  const caseRef = stringField(value, "caseRef");
  const replacementTargetRef = stringField(value, "replacementTargetRef");
  const candidateRef = stringField(value, "candidateRef");
  if (
    !CASE_REFERENCE_RE.test(caseRef) ||
    !REPLACEMENT_TARGET_REF_RE.test(replacementTargetRef) ||
    !REPLACEMENT_CANDIDATE_REF_RE.test(candidateRef)
  ) return { ok: false, code: "invalid_input" };
  return {
    ok: true,
    value: { caseRef, replacementTargetRef, candidateRef },
  };
}

export async function createCorrectionReplacementSignedUpload(
  client: any,
  bucket: string,
  path: string,
) {
  if (
    bucket !== CORRECTION_REPLACEMENT_BUCKET ||
    !path.startsWith(CORRECTION_REPLACEMENT_PREFIX)
  ) return null;
  return await createPrivateSignedUpload(client, bucket, path);
}

export async function downloadCorrectionReplacementObject(
  client: any,
  bucket: string,
  path: string,
) {
  if (
    bucket !== CORRECTION_REPLACEMENT_BUCKET ||
    !path.startsWith(CORRECTION_REPLACEMENT_PREFIX)
  ) return { ok: false as const, failureCode: "object_missing" as const };
  return await downloadPrivateStorageObject(client, bucket, path);
}

export type CustomerSafeReplacementObservation = Readonly<{
  schemaVersion: "customer-correction-replacement-observation-v1";
  parserProfile: DocumentParserProfileKey;
  outcome: ParserObservationEnvelopeV1["outcome"];
  observedFacts: ReadonlyArray<
    Readonly<{
      factKey: DocumentFactKey;
      status: "observed" | "not_observed";
      observedValue: string | null;
      normalizedObservedValue: string | null;
      extractionMethod: string | null;
      confidence: "high" | "medium" | "low" | "unavailable";
      limitation: string | null;
    }>
  >;
  limitations: ReadonlyArray<string>;
}>;

export function projectCustomerSafeReplacementObservation(
  envelope: ParserObservationEnvelopeV1,
  exactFactKeys: readonly DocumentFactKey[],
): CustomerSafeReplacementObservation {
  const allowed = new Set(exactFactKeys);
  return Object.freeze({
    schemaVersion: "customer-correction-replacement-observation-v1",
    parserProfile: envelope.parserProfile,
    outcome: envelope.outcome,
    observedFacts: Object.freeze(
      envelope.observedFacts.filter((fact) => allowed.has(fact.factKey)).map(
        (fact) =>
          Object.freeze({
            factKey: fact.factKey,
            status: fact.status,
            observedValue: fact.observedValue,
            normalizedObservedValue: fact.normalizedObservedValue,
            extractionMethod: fact.sourceLocator?.extractionMethod || null,
            confidence: fact.confidence,
            limitation: fact.limitation,
          }),
      ),
    ),
    limitations: Object.freeze([...envelope.limitations]),
  });
}
