import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";
import {
  createUploadIdempotencyKey,
  isJsonRecord,
  jsonNumberField,
  jsonStringField,
  parseJsonResponse,
  postUploadJson,
  putPrivateSignedUploadUrl,
  sha256HexFromBlob,
} from "../documents/documentUploadTransport.ts";
import type { CustomerCorrectionReplacementTarget } from "./customerCorrectionWorkspace.ts";
import {
  type DocumentFactKey,
  isDocumentFactKey,
} from "../../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";

export type CustomerCorrectionReplacementUploadStage =
  | "UPLOADING"
  | "PARSING";

export type CustomerCorrectionReplacementUploadAttempt = Readonly<{
  issueIdempotencyKey: string;
  confirmIdempotencyKey: string;
  uploadRef?: string;
  signedUploadUrl?: string;
  privatePutCompleted?: boolean;
}>;

export type CustomerCorrectionReplacementObservedFact = Readonly<{
  factKey: DocumentFactKey;
  observedValue: string | null;
  extractionMethod: string | null;
}>;

export type CustomerCorrectionReplacementReceipt = Readonly<{
  candidateRef: string;
  replacementTargetRef: string;
  fileName: string;
  contentFingerprint: string | null;
  observedFacts: readonly CustomerCorrectionReplacementObservedFact[];
}>;

export type CustomerCorrectionReplacementError = Readonly<{
  code:
    | "invalid_file"
    | "service_unavailable"
    | "invalid_response"
    | "stale_handoff";
  message: string;
  stage: "precheck" | "issue" | "upload" | "confirm";
}>;

export type CustomerCorrectionReplacementResult =
  | Readonly<{
    ok: true;
    attempt: CustomerCorrectionReplacementUploadAttempt;
    receipt: CustomerCorrectionReplacementReceipt;
  }>
  | Readonly<{
    ok: false;
    attempt: CustomerCorrectionReplacementUploadAttempt;
    error: CustomerCorrectionReplacementError;
  }>;

export type CustomerCorrectionReplacementWithdrawResult =
  | Readonly<{ ok: true; status: "withdrawn" | "already_withdrawn" }>
  | Readonly<{ ok: false; error: CustomerCorrectionReplacementError }>;

type UploadRuntimeConfig = Readonly<{ apiBaseUrl: string; anonKey: string }>;

const UPLOAD_REF_RE = /^CRU-[A-F0-9]{32}$/;
const CANDIDATE_REF_RE = /^CRC-[A-F0-9]{32}$/;
const TARGET_REF_RE = /^CRT-[A-F0-9]{32}$/;

export function createCustomerCorrectionReplacementUploadAttempt(): CustomerCorrectionReplacementUploadAttempt {
  return Object.freeze({
    issueIdempotencyKey: createUploadIdempotencyKey(),
    confirmIdempotencyKey: createUploadIdempotencyKey(),
  });
}

export function isCustomerCorrectionPdf(
  file: File,
  maximumFileSize: number,
): boolean {
  return file.name.trim().toLowerCase().endsWith(".pdf") &&
    (!file.type.trim() ||
      file.type.trim().toLowerCase() === "application/pdf") &&
    file.size > 0 && file.size <= maximumFileSize;
}

function error(
  code: CustomerCorrectionReplacementError["code"],
  stage: CustomerCorrectionReplacementError["stage"],
  message: string,
): CustomerCorrectionReplacementError {
  return Object.freeze({ code, stage, message });
}

function serverError(
  response: Response,
  body: unknown,
  stage: "issue" | "confirm",
): CustomerCorrectionReplacementError {
  const code = isJsonRecord(body) ? jsonStringField(body, "code") : "";
  if (
    response.status === 409 || [
      "correction_handoff_not_current",
      "current_unanswered_handoff_missing",
      "handoff_already_answered",
      "stale_correction_context",
    ].includes(code)
  ) {
    return error(
      "stale_handoff",
      stage,
      "Aanpassing is gewijzigd. Controleer opnieuw.",
    );
  }
  return error(
    "service_unavailable",
    stage,
    stage === "issue"
      ? "Upload is tijdelijk niet beschikbaar. Probeer het opnieuw."
      : "Uploadcontrole is tijdelijk niet beschikbaar. Probeer het opnieuw.",
  );
}

function browserReachableSignedUrl(
  signedUploadUrl: string,
  apiBaseUrl: string,
): string | null {
  try {
    const signed = new URL(signedUploadUrl);
    const api = new URL(apiBaseUrl);
    if (
      !/^https?:$/.test(signed.protocol) || !signed.searchParams.has("token")
    ) {
      return null;
    }
    if (
      signed.hostname === "kong" &&
      ["127.0.0.1", "localhost"].includes(api.hostname)
    ) {
      signed.protocol = api.protocol;
      signed.hostname = api.hostname;
      signed.port = api.port;
    }
    return signed.toString();
  } catch (_error) {
    return null;
  }
}

function parseObservedFacts(
  value: unknown,
): readonly CustomerCorrectionReplacementObservedFact[] | null {
  if (value === null) return Object.freeze([]);
  if (
    !isJsonRecord(value) ||
    value.schemaVersion !== "customer-correction-replacement-observation-v1" ||
    !Array.isArray(value.observedFacts)
  ) return null;
  const observedFacts: CustomerCorrectionReplacementObservedFact[] = [];
  const seen = new Set<DocumentFactKey>();
  for (const fact of value.observedFacts) {
    if (
      !isJsonRecord(fact) ||
      !isDocumentFactKey(fact.factKey) || seen.has(fact.factKey) ||
      !["observed", "not_observed"].includes(String(fact.status)) ||
      !(fact.observedValue === null ||
        typeof fact.observedValue === "string") ||
      !(fact.extractionMethod === null ||
        typeof fact.extractionMethod === "string")
    ) return null;
    seen.add(fact.factKey);
    const observedValue = fact.status === "observed" &&
        typeof fact.observedValue === "string" && fact.observedValue.trim()
      ? fact.observedValue.trim()
      : null;
    observedFacts.push(Object.freeze({
      factKey: fact.factKey,
      observedValue,
      extractionMethod: fact.extractionMethod as string | null,
    }));
  }
  return Object.freeze(observedFacts);
}

function runtimeConfig(
  override?: UploadRuntimeConfig,
): UploadRuntimeConfig | null {
  if (override) return override;
  const resolved = resolvePublicApiRuntimeConfig();
  return resolved.ok
    ? Object.freeze({
      apiBaseUrl: resolved.apiBaseUrl,
      anonKey: resolved.anonKey,
    })
    : null;
}

export async function uploadCustomerCorrectionReplacement(
  input: Readonly<{
    accessToken: string;
    caseRef: string;
    target: CustomerCorrectionReplacementTarget;
    file: File;
    attempt: CustomerCorrectionReplacementUploadAttempt;
    onStage?: (stage: CustomerCorrectionReplacementUploadStage) => void;
  }>,
  dependencies: Readonly<{
    fetchImpl?: typeof fetch;
    runtimeConfig?: UploadRuntimeConfig;
    digestImpl?: (
      algorithm: AlgorithmIdentifier,
      data: BufferSource,
    ) => Promise<ArrayBuffer>;
  }> = {},
): Promise<CustomerCorrectionReplacementResult> {
  let attempt = input.attempt;
  if (
    !input.accessToken.trim() || !TARGET_REF_RE.test(
      input.target.replacementTargetRef,
    ) || !isCustomerCorrectionPdf(input.file, input.target.maximumFileSize)
  ) {
    return Object.freeze({
      ok: false,
      attempt,
      error: error(
        "invalid_file",
        "precheck",
        "Kies een PDF-bestand van maximaal 15 MB.",
      ),
    });
  }
  const runtime = runtimeConfig(dependencies.runtimeConfig);
  if (!runtime) {
    return Object.freeze({
      ok: false,
      attempt,
      error: error(
        "service_unavailable",
        "precheck",
        "Upload is lokaal nog niet beschikbaar.",
      ),
    });
  }
  const contentFingerprint = await sha256HexFromBlob(
    input.file,
    dependencies.digestImpl,
  );
  if (!contentFingerprint) {
    return Object.freeze({
      ok: false,
      attempt,
      error: error(
        "service_unavailable",
        "precheck",
        "Uploadcontrole is tijdelijk niet beschikbaar. Probeer het opnieuw.",
      ),
    });
  }
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  input.onStage?.("UPLOADING");

  if (!attempt.uploadRef || !attempt.signedUploadUrl) {
    let response: Response;
    try {
      response = await postUploadJson({
        endpointUrl:
          `${runtime.apiBaseUrl}/api-app-customer-correction-upload-url`,
        anonKey: runtime.anonKey,
        accessToken: input.accessToken,
        idempotencyKey: attempt.issueIdempotencyKey,
        body: {
          caseRef: input.caseRef,
          replacementTargetRef: input.target.replacementTargetRef,
          fileName: input.file.name,
          mimeType: "application/pdf",
          sizeBytes: input.file.size,
        },
        fetchImpl,
      });
    } catch (_error) {
      return Object.freeze({
        ok: false,
        attempt,
        error: error(
          "service_unavailable",
          "issue",
          "Upload is tijdelijk niet beschikbaar. Probeer het opnieuw.",
        ),
      });
    }
    const parsed = await parseJsonResponse(response);
    if (!parsed.ok) {
      return Object.freeze({
        ok: false,
        attempt,
        error: error(
          "invalid_response",
          "issue",
          "Upload gaf een onverwacht antwoord.",
        ),
      });
    }
    if (!response.ok) {
      return Object.freeze({
        ok: false,
        attempt,
        error: serverError(response, parsed.body, "issue"),
      });
    }
    if (!isJsonRecord(parsed.body)) {
      return Object.freeze({
        ok: false,
        attempt,
        error: error(
          "invalid_response",
          "issue",
          "Upload gaf een onverwacht antwoord.",
        ),
      });
    }
    const uploadRef = jsonStringField(parsed.body, "uploadRef");
    const replacementTargetRef = jsonStringField(
      parsed.body,
      "replacementTargetRef",
    );
    const signedUploadUrl = browserReachableSignedUrl(
      jsonStringField(parsed.body, "signedUploadUrl"),
      runtime.apiBaseUrl,
    );
    const uploadToken = jsonStringField(parsed.body, "uploadToken");
    const maximumFileSize = jsonNumberField(parsed.body, "maximumFileSize");
    if (
      parsed.body.ok !== true || !UPLOAD_REF_RE.test(uploadRef) ||
      replacementTargetRef !== input.target.replacementTargetRef ||
      !signedUploadUrl || !uploadToken ||
      maximumFileSize !== input.target.maximumFileSize ||
      !Array.isArray(parsed.body.acceptedMimeTypes) ||
      parsed.body.acceptedMimeTypes.length !== 1 ||
      parsed.body.acceptedMimeTypes[0] !== "application/pdf"
    ) {
      return Object.freeze({
        ok: false,
        attempt,
        error: error(
          "invalid_response",
          "issue",
          "Upload gaf een onverwacht antwoord.",
        ),
      });
    }
    attempt = Object.freeze({ ...attempt, uploadRef, signedUploadUrl });
  }

  if (!attempt.privatePutCompleted) {
    const put = await putPrivateSignedUploadUrl({
      endpointUrl: attempt.signedUploadUrl as string,
      anonKey: runtime.anonKey,
      accessToken: input.accessToken,
      file: input.file,
      contentType: "application/pdf",
      fetchImpl,
    });
    if (!put.ok) {
      return Object.freeze({
        ok: false,
        attempt,
        error: error(
          "service_unavailable",
          "upload",
          "Bestand kon niet worden geupload. Probeer het opnieuw.",
        ),
      });
    }
    attempt = Object.freeze({ ...attempt, privatePutCompleted: true });
  }

  input.onStage?.("PARSING");
  let confirmResponse: Response;
  try {
    confirmResponse = await postUploadJson({
      endpointUrl:
        `${runtime.apiBaseUrl}/api-app-customer-correction-upload-confirm`,
      anonKey: runtime.anonKey,
      accessToken: input.accessToken,
      idempotencyKey: attempt.confirmIdempotencyKey,
      body: { caseRef: input.caseRef, uploadRef: attempt.uploadRef },
      fetchImpl,
    });
  } catch (_error) {
    return Object.freeze({
      ok: false,
      attempt,
      error: error(
        "service_unavailable",
        "confirm",
        "Uploadcontrole is tijdelijk niet beschikbaar. Probeer het opnieuw.",
      ),
    });
  }
  const confirmed = await parseJsonResponse(confirmResponse);
  if (!confirmed.ok) {
    return Object.freeze({
      ok: false,
      attempt,
      error: error(
        "invalid_response",
        "confirm",
        "Uploadcontrole gaf een onverwacht antwoord.",
      ),
    });
  }
  if (!confirmResponse.ok) {
    return Object.freeze({
      ok: false,
      attempt,
      error: serverError(confirmResponse, confirmed.body, "confirm"),
    });
  }
  if (!isJsonRecord(confirmed.body)) {
    return Object.freeze({
      ok: false,
      attempt,
      error: error(
        "invalid_response",
        "confirm",
        "Uploadcontrole gaf een onverwacht antwoord.",
      ),
    });
  }
  const candidateRef = jsonStringField(confirmed.body, "candidateRef");
  const replacementTargetRef = jsonStringField(
    confirmed.body,
    "replacementTargetRef",
  );
  const observedFacts = parseObservedFacts(confirmed.body.parserObservation);
  const fileName = jsonStringField(confirmed.body, "fileName");
  if (
    confirmed.body.ok !== true ||
    confirmed.body.status !== "confirmed_staged" ||
    !CANDIDATE_REF_RE.test(candidateRef) ||
    replacementTargetRef !== input.target.replacementTargetRef ||
    observedFacts === null ||
    !fileName || fileName.length > 180 ||
    confirmed.body.parserSuccessRequiredForFinalCustomerValue !== false
  ) {
    return Object.freeze({
      ok: false,
      attempt,
      error: error(
        "invalid_response",
        "confirm",
        "Uploadcontrole gaf een onverwacht antwoord.",
      ),
    });
  }
  return Object.freeze({
    ok: true,
    attempt,
    receipt: Object.freeze({
      candidateRef,
      replacementTargetRef,
      fileName,
      contentFingerprint,
      observedFacts,
    }),
  });
}

export async function withdrawCustomerCorrectionReplacement(
  input: Readonly<{
    accessToken: string;
    caseRef: string;
    replacementTargetRef: string;
    candidateRef: string;
    idempotencyKey: string;
  }>,
  dependencies: Readonly<{
    fetchImpl?: typeof fetch;
    runtimeConfig?: UploadRuntimeConfig;
  }> = {},
): Promise<CustomerCorrectionReplacementWithdrawResult> {
  const runtime = runtimeConfig(dependencies.runtimeConfig);
  if (
    !runtime || !input.accessToken.trim() ||
    !TARGET_REF_RE.test(input.replacementTargetRef) ||
    !CANDIDATE_REF_RE.test(input.candidateRef) ||
    !input.idempotencyKey.trim()
  ) {
    return Object.freeze({
      ok: false,
      error: error(
        "invalid_response",
        "confirm",
        "Verwijderen is tijdelijk niet beschikbaar.",
      ),
    });
  }
  let response: Response;
  try {
    response = await postUploadJson({
      endpointUrl:
        `${runtime.apiBaseUrl}/api-app-customer-correction-upload-remove`,
      anonKey: runtime.anonKey,
      accessToken: input.accessToken,
      idempotencyKey: input.idempotencyKey,
      body: {
        caseRef: input.caseRef,
        replacementTargetRef: input.replacementTargetRef,
        candidateRef: input.candidateRef,
      },
      fetchImpl: dependencies.fetchImpl ?? fetch,
    });
  } catch (_error) {
    return Object.freeze({
      ok: false,
      error: error(
        "service_unavailable",
        "confirm",
        "Verwijderen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
      ),
    });
  }
  const parsed = await parseJsonResponse(response);
  if (!parsed.ok || !isJsonRecord(parsed.body)) {
    return Object.freeze({
      ok: false,
      error: error(
        "invalid_response",
        "confirm",
        "Verwijderen gaf een onverwacht antwoord.",
      ),
    });
  }
  if (!response.ok) {
    return Object.freeze({
      ok: false,
      error: serverError(response, parsed.body, "confirm"),
    });
  }
  const status = jsonStringField(parsed.body, "status");
  if (
    parsed.body.ok !== true ||
    !["withdrawn", "already_withdrawn"].includes(status) ||
    jsonStringField(parsed.body, "replacementTargetRef") !==
      input.replacementTargetRef ||
    jsonStringField(parsed.body, "candidateRef") !== input.candidateRef
  ) {
    return Object.freeze({
      ok: false,
      error: error(
        "invalid_response",
        "confirm",
        "Verwijderen gaf een onverwacht antwoord.",
      ),
    });
  }
  return Object.freeze({
    ok: true,
    status: status as "withdrawn" | "already_withdrawn",
  });
}
