// supabase/functions/_shared/analysis.ts

export const ANALYSIS_METHOD_CODE = "analysis_v1";
export const ANALYSIS_METHOD_VERSION = "2026-03-15";

export type SupportedDocType = "factuur" | "foto_laadpunt";
export type AnalysisDocumentStatus = "queued" | "completed" | "failed";
export type AnalysisResultStatus = "pass" | "fail" | "inconclusive" | "not_checked";
export type AnalysisOverallStatus = "not_run" | "partial_pass" | "pass" | "review_required";

export type DossierRow = {
  id: string;
  status?: string | null;
  locked_at?: string | null;
  address_postcode?: string | null;
  address_house_number?: string | null;
  address_suffix?: string | null;
  address_street?: string | null;
  address_city?: string | null;
};

export type ChargerRow = {
  id: string;
  dossier_id?: string;
  serial_number?: string | null;
  mid_number?: string | null;
  brand?: string | null;
  model?: string | null;
  power_kw?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DocumentRow = {
  id: string;
  dossier_id?: string;
  doc_type?: string | null;
  charger_id?: string | null;
  status?: string | null;
  filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_sha256?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DocumentAnalysisRow = {
  dossier_id: string;
  document_id: string;
  charger_id: string | null;
  doc_type: string;
  analysis_kind: string;
  status: AnalysisDocumentStatus;
  method_code: string;
  method_version: string;
  observed_fields: Record<string, unknown>;
  confidence: Record<string, unknown>;
  limitations: unknown[];
  summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ChargerAnalysisRow = {
  dossier_id: string;
  charger_id: string;
  source_document_id: string | null;
  analysis_code: string;
  status: AnalysisResultStatus;
  declared_value: Record<string, unknown>;
  observed_value: Record<string, unknown>;
  evaluation_details: Record<string, unknown>;
  method_code: string;
  method_version: string;
  created_at: string;
  updated_at: string;
};

export type SummaryAnalysisRow = {
  dossier_id: string;
  overall_status: AnalysisOverallStatus;
  method_code: string;
  method_version: string;
  summary: Record<string, unknown>;
  limitations: unknown[];
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function nonEmpty(v: unknown): boolean {
  return norm(v).length > 0;
}

export function isSupportedDocType(docType: unknown): docType is SupportedDocType {
  return docType === "factuur" || docType === "foto_laadpunt";
}

export function analysisKindForDocType(docType: SupportedDocType): string {
  return docType === "factuur" ? "factuur_extract_v1" : "foto_extract_v1";
}

export function buildDeclaredAddressSnapshot(dossier: DossierRow): Record<string, unknown> {
  return {
    postcode: dossier.address_postcode ?? null,
    house_number: dossier.address_house_number ?? null,
    suffix: dossier.address_suffix ?? null,
    street: dossier.address_street ?? null,
    city: dossier.address_city ?? null,
  };
}

export function buildDocumentAnalysisRow(
  dossier: DossierRow,
  doc: DocumentRow,
): DocumentAnalysisRow {
  const ts = nowIso();
  const docType = String(doc.doc_type || "").trim();

  if (!isSupportedDocType(docType)) {
    throw new Error(`Unsupported document type for analysis: ${docType || "(empty)"}`);
  }

  return {
    dossier_id: dossier.id,
    document_id: doc.id,
    charger_id: doc.charger_id ? String(doc.charger_id) : null,
    doc_type: docType,
    analysis_kind: analysisKindForDocType(docType),
    status: "completed",
    method_code: ANALYSIS_METHOD_CODE,
    method_version: ANALYSIS_METHOD_VERSION,
    observed_fields: {},
    confidence: {},
    limitations: [
      "skeleton_phase_only",
      "real_document_extraction_not_implemented_yet",
    ],
    summary: {
      mode: "skeleton",
      doc_type: docType,
      filename: doc.filename ?? null,
      storage_path: doc.storage_path ?? null,
      reason: "no_observed_fields_extracted_yet",
    },
    created_at: ts,
    updated_at: ts,
  };
}

function makeNotCheckedRow(
  dossier: DossierRow,
  charger: ChargerRow,
  sourceDocumentId: string | null,
  analysisCode: string,
  declaredValue: Record<string, unknown>,
  reason: string,
): ChargerAnalysisRow {
  const ts = nowIso();

  return {
    dossier_id: dossier.id,
    charger_id: charger.id,
    source_document_id: sourceDocumentId,
    analysis_code: analysisCode,
    status: "not_checked",
    declared_value: declaredValue,
    observed_value: {},
    evaluation_details: {
      mode: "skeleton",
      reason,
    },
    method_code: ANALYSIS_METHOD_CODE,
    method_version: ANALYSIS_METHOD_VERSION,
    created_at: ts,
    updated_at: ts,
  };
}

function buildInvoiceRows(
  dossier: DossierRow,
  charger: ChargerRow,
  invoiceDoc: DocumentRow | null,
): ChargerAnalysisRow[] {
  const declaredAddress = buildDeclaredAddressSnapshot(dossier);
  const declaredBrand = { brand: charger.brand ?? null };
  const declaredModel = { model: charger.model ?? null };
  const declaredSerial = { serial_number: charger.serial_number ?? null };
  const declaredMid = { mid_number: charger.mid_number ?? null };

  const reason = invoiceDoc
    ? "supported_invoice_present_but_extraction_not_implemented"
    : "missing_invoice_document";

  const sourceDocumentId = invoiceDoc ? invoiceDoc.id : null;

  return [
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "invoice_address_match",
      declaredAddress,
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "invoice_brand_match",
      declaredBrand,
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "invoice_model_match",
      declaredModel,
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "invoice_serial_match",
      declaredSerial,
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "invoice_mid_match",
      declaredMid,
      reason,
    ),
  ];
}

function buildPhotoRows(
  dossier: DossierRow,
  charger: ChargerRow,
  photoDoc: DocumentRow | null,
): ChargerAnalysisRow[] {
  const reason = photoDoc
    ? "supported_photo_present_but_extraction_not_implemented"
    : "missing_photo_document";

  const sourceDocumentId = photoDoc ? photoDoc.id : null;

  return [
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "photo_charger_visible",
      {},
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "photo_brand_match",
      { brand: charger.brand ?? null },
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "photo_model_match",
      { model: charger.model ?? null },
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "photo_serial_match",
      { serial_number: charger.serial_number ?? null },
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      sourceDocumentId,
      "photo_mid_match",
      { mid_number: charger.mid_number ?? null },
      reason,
    ),
  ];
}

export function buildChargerAnalysisRows(
  dossier: DossierRow,
  charger: ChargerRow,
  docsForCharger: DocumentRow[],
): ChargerAnalysisRow[] {
  const invoiceDoc =
    docsForCharger.find((d) => norm(d.doc_type) === "factuur") ?? null;

  const photoDoc =
    docsForCharger.find((d) => norm(d.doc_type) === "foto_laadpunt") ?? null;

  return [
    ...buildInvoiceRows(dossier, charger, invoiceDoc),
    ...buildPhotoRows(dossier, charger, photoDoc),
  ];
}

export function computeOverallStatus(
  documentRows: DocumentAnalysisRow[],
  chargerRows: ChargerAnalysisRow[],
): AnalysisOverallStatus {
  if (documentRows.length === 0 && chargerRows.length === 0) return "not_run";

  if (chargerRows.some((r) => r.status === "fail")) return "review_required";

  const allPass = chargerRows.length > 0 && chargerRows.every((r) => r.status === "pass");
  if (allPass) return "pass";

  return "partial_pass";
}

export function buildSummaryAnalysisRow(
  dossier: DossierRow,
  documentRows: DocumentAnalysisRow[],
  chargerRows: ChargerAnalysisRow[],
): SummaryAnalysisRow {
  const ts = nowIso();

  const overallStatus = computeOverallStatus(documentRows, chargerRows);

  const documentCounts = {
    total: documentRows.length,
    completed: documentRows.filter((r) => r.status === "completed").length,
    failed: documentRows.filter((r) => r.status === "failed").length,
  };

  const chargerCounts = {
    total: chargerRows.length,
    pass: chargerRows.filter((r) => r.status === "pass").length,
    fail: chargerRows.filter((r) => r.status === "fail").length,
    inconclusive: chargerRows.filter((r) => r.status === "inconclusive").length,
    not_checked: chargerRows.filter((r) => r.status === "not_checked").length,
  };

  const chargersSeen = Array.from(new Set(chargerRows.map((r) => r.charger_id))).length;

  return {
    dossier_id: dossier.id,
    overall_status: overallStatus,
    method_code: ANALYSIS_METHOD_CODE,
    method_version: ANALYSIS_METHOD_VERSION,
    summary: {
      chargers_seen: chargersSeen,
      document_analysis: documentCounts,
      charger_analysis: chargerCounts,
      mode: "skeleton",
    },
    limitations: [
      "skeleton_phase_only",
      "real_document_extraction_not_implemented_yet",
      "no_authenticity_claim",
      "no_compliance_claim",
    ],
    created_at: ts,
    updated_at: ts,
  };
}

export function groupConfirmedDocsByCharger(
  documents: DocumentRow[],
): Record<string, DocumentRow[]> {
  const out: Record<string, DocumentRow[]> = {};

  for (const doc of documents) {
    const chargerId = String(doc.charger_id || "").trim();
    if (!chargerId) continue;
    if (!out[chargerId]) out[chargerId] = [];
    out[chargerId].push(doc);
  }

  return out;
}

export function sanitizeMode(input: unknown): "refresh" {
  const mode = norm(input);
  if (!mode || mode === "refresh") return "refresh";
  throw new Error(`Unsupported mode: ${String(input ?? "")}`);
}

export function isLockedOrReviewable(status: unknown, lockedAt: unknown): boolean {
  const st = norm(status);
  return !!lockedAt || st === "in_review" || st === "ready_for_booking";
}

export function assertConfirmedDocumentShape(doc: DocumentRow): void {
  if (!doc.id) throw new Error("Document missing id");
  if (!isSupportedDocType(String(doc.doc_type || "").trim())) {
    // supported-doc filtering gebeurt elders; geen throw nodig
    return;
  }
  if (!nonEmpty(doc.charger_id)) {
    throw new Error(`Supported document ${doc.id} missing charger_id`);
  }
}