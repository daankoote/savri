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
  run_id: string;
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
  run_id: string;
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
  run_id: string;
  overall_status: AnalysisOverallStatus;
  method_code: string;
  method_version: string;
  summary: Record<string, unknown>;
  limitations: unknown[];
  created_at: string;
  updated_at: string;
};

export type InvoiceObservedFields = {
  address_line: string | null;
  city_line: string | null;
  street: string | null;
  house_number: string | null;
  suffix: string | null;
  postcode: string | null;
  city: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  mid_number: string | null;
};

const HARD_REQUIRED_INVOICE_CODES = new Set<string>([
  "invoice_address_match",
  "invoice_serial_match",
  "invoice_mid_match",
]);

const OPTIONAL_INVOICE_CODES = new Set<string>([
  "invoice_brand_match",
  "invoice_model_match",
]);

function cleanLine(s: string): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeCompareValue(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function normalizePostcode(v: unknown): string {
  return normalizeCompact(v);
}

function normalizeSerial(v: unknown): string {
  return normalizeCompact(v);
}

function normalizeMid(v: unknown): string {
  return normalizeCompact(v);
}

function splitDutchStreetLine(input: string): {
  street: string | null;
  house_number: string | null;
  suffix: string | null;
} {
  const s = cleanLine(input);
  if (!s) return { street: null, house_number: null, suffix: null };

  const m = s.match(/^(.*?)[\s]+(\d+)(?:[-\s]*([A-Za-z0-9]+))?$/);
  if (!m) {
    return { street: s || null, house_number: null, suffix: null };
  }

  return {
    street: cleanLine(m[1]) || null,
    house_number: m[2] || null,
    suffix: m[3] ? cleanLine(m[3]) : null,
  };
}

function splitDutchCityLine(input: string): {
  postcode: string | null;
  city: string | null;
} {
  const s = cleanLine(input);
  if (!s) return { postcode: null, city: null };

  const m = s.match(/(\d{4}\s?[A-Za-z]{2})\s+(.+)$/);
  if (!m) return { postcode: null, city: s || null };

  return {
    postcode: normalizePostcode(m[1]),
    city: cleanLine(m[2]) || null,
  };
}

function matchLabeledValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:]?\\s*(.+)`, "i");
    const m = text.match(re);
    if (m?.[1]) return cleanLine(m[1]);
  }
  return null;
}

function isLikelyNameLine(input: string): boolean {
  const s = cleanLine(input);
  if (!s) return false;
  if (s.length < 4 || s.length > 120) return false;
  if (/\d/.test(s)) return false;

  const lowered = s.toLowerCase();
  const banned = [
    "invoice",
    "factuur",
    "bill to",
    "customer",
    "customer name",
    "address",
    "city",
    "brand",
    "model",
    "serial",
    "mid",
    "product",
    "amount",
    "description",
    "subtotal",
    "total",
    "vat",
    "invoice no",
    "invoice date",
    "payment terms",
    "charger details",
  ];

  if (banned.some((x) => lowered.includes(x))) return false;

  return /[a-z]/i.test(s);
}

function isLikelyStreetLine(input: string): boolean {
  const s = cleanLine(input);
  if (!s) return false;
  if (!/\d/.test(s)) return false;
  if (s.length < 6 || s.length > 120) return false;

  const lowered = s.toLowerCase();
  const banned = [
    "invoice no",
    "invoice date",
    "customer ref",
    "serial",
    "mid",
    "vat",
    "total",
    "amount",
    "qty",
    "unit price",
  ];
  if (banned.some((x) => lowered.includes(x))) return false;

  const split = splitDutchStreetLine(s);
  return !!(split.street && split.house_number);
}

function isLikelyCityLine(input: string): boolean {
  const s = cleanLine(input);
  if (!s) return false;
  const split = splitDutchCityLine(s);
  return !!(split.postcode && split.city);
}

function isLikelyCountryLine(input: string): boolean {
  const s = cleanLine(input).toLowerCase();
  if (!s) return false;

  return [
    "netherlands",
    "nederland",
    "the netherlands",
    "belgië",
    "belgie",
    "belgium",
    "deutschland",
    "germany",
  ].includes(s);
}

function collectAddressBlockCandidates(text: string): Array<{
  name_line: string | null;
  address_line: string;
  city_line: string;
  score: number;
}> {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const candidates: Array<{
    name_line: string | null;
    address_line: string;
    city_line: string;
    score: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!isLikelyStreetLine(line)) continue;

    for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
      const maybeCity = lines[j];
      if (!isLikelyCityLine(maybeCity)) continue;

      const prev1 = i - 1 >= 0 ? lines[i - 1] : null;
      const prev2 = i - 2 >= 0 ? lines[i - 2] : null;
      const next1 = j + 1 < lines.length ? lines[j + 1] : null;

      let score = 0;
      let nameLine: string | null = null;

      score += 5;

      if (prev1 && isLikelyNameLine(prev1)) {
        nameLine = prev1;
        score += 3;
      } else if (prev2 && isLikelyNameLine(prev2)) {
        nameLine = prev2;
        score += 2;
      }

      if (next1 && isLikelyCountryLine(next1)) {
        score += 1;
      }

      candidates.push({
        name_line: nameLine,
        address_line: line,
        city_line: maybeCity,
        score,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function pickBestAddressBlock(text: string): {
  address_line: string | null;
  city_line: string | null;
} {
  const candidates = collectAddressBlockCandidates(text);
  const best = candidates[0];

  if (!best) {
    return {
      address_line: null,
      city_line: null,
    };
  }

  return {
    address_line: best.address_line,
    city_line: best.city_line,
  };
}

function splitLinesForExtraction(text: string): string[] {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

function looksLikeNoiseLine(input: string): boolean {
  const s = cleanLine(input).toLowerCase();
  if (!s) return true;

  const banned = [
    "invoice",
    "factuur",
    "invoice no",
    "invoice number",
    "invoice date",
    "customer",
    "bill to",
    "subtotal",
    "total",
    "vat",
    "btw",
    "qty",
    "quantity",
    "unit price",
    "amount",
    "description",
    "payment",
    "iban",
    "kvk",
    "coc",
    "www.",
    "http://",
    "https://",
    "@",
  ];

  return banned.some((x) => s.includes(x));
}

function looksLikeBrandValue(input: string): boolean {
  const s = cleanLine(input);
  if (!s) return false;
  if (s.length < 2 || s.length > 60) return false;
  if (/\d{4,}/.test(s)) return false;
  if (looksLikeNoiseLine(s)) return false;
  return /[a-z]/i.test(s);
}

function looksLikeModelValue(input: string): boolean {
  const s = cleanLine(input);
  if (!s) return false;
  if (s.length < 2 || s.length > 80) return false;
  if (looksLikeNoiseLine(s)) return false;
  return /[a-z0-9]/i.test(s);
}

function looksLikeMidValue(input: string): boolean {
  const compact = normalizeMid(input);
  if (!compact) return false;
  if (compact.length < 6 || compact.length > 30) return false;
  return compact.startsWith("MID") || /^M\d{6,}$/.test(compact) || /^\d{6,}$/.test(compact);
}

function looksLikeSerialValue(input: string): boolean {
  const compact = normalizeSerial(input);
  if (!compact) return false;
  if (compact.length < 6 || compact.length > 40) return false;
  if (/^MID[A-Z0-9]+$/.test(compact)) return false;
  return true;
}

function extractValueAfterLabelInLine(line: string, labels: string[]): string | null {
  const s = cleanLine(line);
  if (!s) return null;

  for (const label of labels) {
    const re = new RegExp(`^${label}\\s*[:#-]?\\s*(.+)$`, "i");
    const m = s.match(re);
    if (!m?.[1]) continue;

    let value = cleanLine(m[1]);
    value = value.replace(/^(nummer|nr\\.?|no\\.?|number)\\s*[:#-]?\\s*/i, "").trim();

    if (value) return value;
  }

  return null;
}

function extractFieldFromNearbyLines(
  lines: string[],
  labels: string[],
  validator: (input: string) => boolean,
): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const inlineValue = extractValueAfterLabelInLine(line, labels);
    if (inlineValue && validator(inlineValue)) {
      return inlineValue;
    }

    const isBareLabel = labels.some((label) => {
      const re = new RegExp(`^${label}\\s*[:#-]?$`, "i");
      return re.test(line);
    });

    if (!isBareLabel) continue;

    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const candidate = cleanLine(lines[j]);
      if (candidate && validator(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function findCompactCandidatesFromLines(
  lines: string[],
  labels: string[],
  validator: (input: string) => boolean,
): string[] {
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const inlineValue = extractValueAfterLabelInLine(line, labels);
    if (inlineValue && validator(inlineValue)) {
      out.push(inlineValue);
    }

    const isBareLabel = labels.some((label) => {
      const re = new RegExp(`^${label}\\s*[:#-]?$`, "i");
      return re.test(line);
    });

    if (!isBareLabel) continue;

    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const candidate = cleanLine(lines[j]);
      if (candidate && validator(candidate)) {
        out.push(candidate);
      }
    }
  }

  return Array.from(new Set(out.map((x) => cleanLine(x)).filter(Boolean)));
}

function findMidCandidate(lines: string[]): string | null {
  const labeled = findCompactCandidatesFromLines(
    lines,
    [
      "MID number",
      "MID Number",
      "MID nummer",
      "MID-nummer",
      "MID nr",
      "MID nr\\.",
      "MID no",
      "MID no\\.",
      "MID",
    ],
    looksLikeMidValue,
  );

  for (const candidate of labeled) {
    const cleaned = cleanLine(candidate)
      .replace(/^(nummer|nr\\.?|no\\.?|number)\\s*[:#-]?\\s*/i, "")
      .trim();

    if (cleaned && looksLikeMidValue(cleaned)) {
      return cleaned;
    }
  }

  for (const line of lines) {
    const cleanedLine = cleanLine(line);

    const labelValueMatch = cleanedLine.match(
      /\bMID(?:\s*[-]?\s*(?:nummer|nr\.?|no\.?|number))?\b\s*[:#-]?\s*(M\d{6,}|MID[A-Z0-9]{4,}|\d{6,})\b/i,
    );
    if (labelValueMatch?.[1] && looksLikeMidValue(labelValueMatch[1])) {
      return cleanLine(labelValueMatch[1]);
    }
  }

  for (const line of lines) {
    const m = line.match(/\b(MID[A-Z0-9]{4,}|M\d{6,}|\d{6,})\b/i);
    if (m?.[1] && looksLikeMidValue(m[1])) {
      return cleanLine(m[1]);
    }
  }

  return null;
}

function findSerialCandidate(lines: string[], midCandidate: string | null): string | null {
  const labeled = findCompactCandidatesFromLines(
    lines,
    ["Serial number", "Serial Number", "Serial", "Serienummer", "S/N", "SN"],
    looksLikeSerialValue,
  );

  for (const candidate of labeled) {
    if (normalizeSerial(candidate) !== normalizeSerial(midCandidate)) {
      return candidate;
    }
  }

  for (const line of lines) {
    const m = line.match(/\b(SN[\s:-]*[A-Z0-9]{4,}|[A-Z]*\d[A-Z0-9]{5,})\b/i);
    if (m?.[1] && looksLikeSerialValue(m[1])) {
      if (normalizeSerial(m[1]) !== normalizeSerial(midCandidate)) {
        return cleanLine(m[1]);
      }
    }
  }

  return null;
}

function findBrandCandidate(lines: string[]): string | null {
  return extractFieldFromNearbyLines(lines, ["Brand", "Merk"], looksLikeBrandValue);
}

function findModelCandidate(lines: string[]): string | null {
  return extractFieldFromNearbyLines(lines, ["Model", "Type"], looksLikeModelValue);
}

export function extractInvoiceObservedFieldsFromText(textRaw: string): InvoiceObservedFields {
  const text = String(textRaw || "").replace(/\r/g, "");
  const lines = splitLinesForExtraction(text);

  const labeledAddress =
    matchLabeledValue(text, ["Address", "Adres"]) ||
    null;

  const labeledCity =
    matchLabeledValue(text, ["City", "Plaats", "Postcode en plaats"]) ||
    null;

  const inferredBlock = pickBestAddressBlock(text);

  const address_line = labeledAddress || inferredBlock.address_line || null;
  const city_line = labeledCity || inferredBlock.city_line || null;

  const brand =
    matchLabeledValue(text, ["Brand", "Merk"]) ||
    findBrandCandidate(lines) ||
    null;

  const model =
    matchLabeledValue(text, ["Model", "Type"]) ||
    findModelCandidate(lines) ||
    null;

  const mid_number =
    findMidCandidate(lines) ||
    matchLabeledValue(text, ["MID number", "MID Number", "MID nummer", "MID-nummer", "MID nr", "MID nr.", "MID"]) ||
    null;

  const serial_number =
    matchLabeledValue(text, ["Serial number", "Serial Number", "Serial", "Serienummer", "S/N", "SN"]) ||
    findSerialCandidate(lines, mid_number) ||
    null;

  const streetParts = splitDutchStreetLine(address_line || "");
  const cityParts = splitDutchCityLine(city_line || "");

  return {
    address_line,
    city_line,
    street: streetParts.street,
    house_number: streetParts.house_number,
    suffix: streetParts.suffix,
    postcode: cityParts.postcode,
    city: cityParts.city,
    brand,
    model,
    serial_number,
    mid_number,
  };
}

function evaluateStringMatch(
  declaredRaw: unknown,
  observedRaw: unknown,
): {
  status: AnalysisResultStatus;
  declared_normalized: string | null;
  observed_normalized: string | null;
  reason: string;
} {
  const declared = normalizeCompareValue(declaredRaw);
  const observed = normalizeCompareValue(observedRaw);

  if (!declared || !observed) {
    return {
      status: "inconclusive",
      declared_normalized: declared || null,
      observed_normalized: observed || null,
      reason: "missing_declared_or_observed",
    };
  }

  if (declared === observed) {
    return {
      status: "pass",
      declared_normalized: declared,
      observed_normalized: observed,
      reason: "exact_normalized_match",
    };
  }

  return {
    status: "fail",
    declared_normalized: declared,
    observed_normalized: observed,
    reason: "normalized_mismatch",
  };
}

function evaluateCompactMatch(
  declaredRaw: unknown,
  observedRaw: unknown,
  normalizer: (v: unknown) => string,
): {
  status: AnalysisResultStatus;
  declared_normalized: string | null;
  observed_normalized: string | null;
  reason: string;
} {
  const declared = normalizer(declaredRaw);
  const observed = normalizer(observedRaw);

  if (!declared || !observed) {
    return {
      status: "inconclusive",
      declared_normalized: declared || null,
      observed_normalized: observed || null,
      reason: "missing_declared_or_observed",
    };
  }

  if (declared === observed) {
    return {
      status: "pass",
      declared_normalized: declared,
      observed_normalized: observed,
      reason: "exact_normalized_match",
    };
  }

  return {
    status: "fail",
    declared_normalized: declared,
    observed_normalized: observed,
    reason: "normalized_mismatch",
  };
}

function evaluateOptionalCompactMatch(
  declaredRaw: unknown,
  observedRaw: unknown,
  normalizer: (v: unknown) => string,
): {
  status: AnalysisResultStatus;
  declared_normalized: string | null;
  observed_normalized: string | null;
  reason: string;
} {
  const declared = normalizer(declaredRaw);
  const observed = normalizer(observedRaw);

  if (!declared && !observed) {
    return {
      status: "pass",
      declared_normalized: null,
      observed_normalized: null,
      reason: "both_missing_not_applicable",
    };
  }

  if (!declared || !observed) {
    return {
      status: "inconclusive",
      declared_normalized: declared || null,
      observed_normalized: observed || null,
      reason: "missing_declared_or_observed",
    };
  }

  if (declared === observed) {
    return {
      status: "pass",
      declared_normalized: declared,
      observed_normalized: observed,
      reason: "exact_normalized_match",
    };
  }

  return {
    status: "fail",
    declared_normalized: declared,
    observed_normalized: observed,
    reason: "normalized_mismatch",
  };
}

function evaluateInvoiceAddress(
  dossier: DossierRow,
  observed: InvoiceObservedFields,
): {
  status: AnalysisResultStatus;
  declared_value: Record<string, unknown>;
  observed_value: Record<string, unknown>;
  evaluation_details: Record<string, unknown>;
} {
  const declared = {
    street: dossier.address_street ?? null,
    house_number: dossier.address_house_number ?? null,
    suffix: dossier.address_suffix ?? null,
    postcode: dossier.address_postcode ?? null,
    city: dossier.address_city ?? null,
  };

  const observedValue = {
    street: observed.street,
    house_number: observed.house_number,
    suffix: observed.suffix,
    postcode: observed.postcode,
    city: observed.city,
  };

  const parts = [
    evaluateStringMatch(declared.street, observed.street),
    evaluateCompactMatch(declared.house_number, observed.house_number, normalizeCompact),
    evaluateOptionalCompactMatch(declared.suffix, observed.suffix, normalizeCompact),
    evaluateCompactMatch(declared.postcode, observed.postcode, normalizePostcode),
    evaluateStringMatch(declared.city, observed.city),
  ];

  if (parts.some((p) => p.status === "fail")) {
    return {
      status: "fail",
      declared_value: declared,
      observed_value: observedValue,
      evaluation_details: {
        reason: "one_or_more_address_parts_mismatch",
        parts,
      },
    };
  }

  if (parts.some((p) => p.status === "inconclusive")) {
    return {
      status: "inconclusive",
      declared_value: declared,
      observed_value: observedValue,
      evaluation_details: {
        reason: "one_or_more_address_parts_missing",
        parts,
      },
    };
  }

  return {
    status: "pass",
    declared_value: declared,
    observed_value: observedValue,
    evaluation_details: {
      reason: "all_address_parts_match",
      parts,
    },
  };
}

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
  runId: string,
  opts?: {
    invoice_observed_fields?: InvoiceObservedFields | null;
    limitations?: string[];
    summary_extra?: Record<string, unknown>;
  },
): DocumentAnalysisRow {
  const ts = nowIso();
  const docType = String(doc.doc_type || "").trim();

  if (!isSupportedDocType(docType)) {
    throw new Error(`Unsupported document type for analysis: ${docType || "(empty)"}`);
  }

  const observed = opts?.invoice_observed_fields ?? null;
  const limitations = opts?.limitations ?? [];
  const summaryExtra = opts?.summary_extra ?? {};

  return {
    dossier_id: dossier.id,
    run_id: runId,
    document_id: doc.id,
    charger_id: doc.charger_id ? String(doc.charger_id) : null,
    doc_type: docType,
    analysis_kind: analysisKindForDocType(docType),
    status: "completed",
    method_code: ANALYSIS_METHOD_CODE,
    method_version: ANALYSIS_METHOD_VERSION,
    observed_fields: observed ? observed as Record<string, unknown> : {},
    confidence: {},
    limitations,
    summary: {
      doc_type: docType,
      filename: doc.filename ?? null,
      storage_path: doc.storage_path ?? null,
      ...summaryExtra,
    },
    created_at: ts,
    updated_at: ts,
  };
}

function makeNotCheckedRow(
  dossier: DossierRow,
  charger: ChargerRow,
  runId: string,
  sourceDocumentId: string | null,
  analysisCode: string,
  declaredValue: Record<string, unknown>,
  reason: string,
): ChargerAnalysisRow {
  const ts = nowIso();

  return {
    dossier_id: dossier.id,
    run_id: runId,
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

function buildPhotoRows(
  dossier: DossierRow,
  charger: ChargerRow,
  runId: string,
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
      runId,
      sourceDocumentId,
      "photo_charger_visible",
      {},
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      runId,
      sourceDocumentId,
      "photo_brand_match",
      { brand: charger.brand ?? null },
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      runId,
      sourceDocumentId,
      "photo_model_match",
      { model: charger.model ?? null },
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      runId,
      sourceDocumentId,
      "photo_serial_match",
      { serial_number: charger.serial_number ?? null },
      reason,
    ),
    makeNotCheckedRow(
      dossier,
      charger,
      runId,
      sourceDocumentId,
      "photo_mid_match",
      { mid_number: charger.mid_number ?? null },
      reason,
    ),
  ];
}

export function buildInvoiceRowsFromObserved(
  dossier: DossierRow,
  charger: ChargerRow,
  runId: string,
  invoiceDoc: DocumentRow | null,
  observed: InvoiceObservedFields | null,
): ChargerAnalysisRow[] {
  const ts = nowIso();
  const sourceDocumentId = invoiceDoc ? invoiceDoc.id : null;

  if (!invoiceDoc) {
    return [
      makeNotCheckedRow(dossier, charger, runId, null, "invoice_address_match", buildDeclaredAddressSnapshot(dossier), "missing_invoice_document"),
      makeNotCheckedRow(dossier, charger, runId, null, "invoice_brand_match", { brand: charger.brand ?? null }, "missing_invoice_document"),
      makeNotCheckedRow(dossier, charger, runId, null, "invoice_model_match", { model: charger.model ?? null }, "missing_invoice_document"),
      makeNotCheckedRow(dossier, charger, runId, null, "invoice_serial_match", { serial_number: charger.serial_number ?? null }, "missing_invoice_document"),
      makeNotCheckedRow(dossier, charger, runId, null, "invoice_mid_match", { mid_number: charger.mid_number ?? null }, "missing_invoice_document"),
    ];
  }

  if (!observed) {
    const mk = (
      analysis_code: string,
      declared_value: Record<string, unknown>,
    ): ChargerAnalysisRow => ({
      dossier_id: dossier.id,
      run_id: runId,
      charger_id: charger.id,
      source_document_id: sourceDocumentId,
      analysis_code,
      status: "inconclusive",
      declared_value,
      observed_value: {},
      evaluation_details: {
        reason: "invoice_present_but_no_observed_fields_available",
      },
      method_code: ANALYSIS_METHOD_CODE,
      method_version: ANALYSIS_METHOD_VERSION,
      created_at: ts,
      updated_at: ts,
    });

    return [
      mk("invoice_address_match", buildDeclaredAddressSnapshot(dossier)),
      mk("invoice_brand_match", { brand: charger.brand ?? null }),
      mk("invoice_model_match", { model: charger.model ?? null }),
      mk("invoice_serial_match", { serial_number: charger.serial_number ?? null }),
      mk("invoice_mid_match", { mid_number: charger.mid_number ?? null }),
    ];
  }

  const addrEval = evaluateInvoiceAddress(dossier, observed);
  const brandEval = evaluateStringMatch(charger.brand, observed.brand);
  const modelEval = evaluateStringMatch(charger.model, observed.model);
  const serialEval = evaluateCompactMatch(charger.serial_number, observed.serial_number, normalizeSerial);
  const midEval = evaluateCompactMatch(charger.mid_number, observed.mid_number, normalizeMid);

  return [
    {
      dossier_id: dossier.id,
      run_id: runId,
      charger_id: charger.id,
      source_document_id: sourceDocumentId,
      analysis_code: "invoice_address_match",
      status: addrEval.status,
      declared_value: addrEval.declared_value,
      observed_value: addrEval.observed_value,
      evaluation_details: addrEval.evaluation_details,
      method_code: ANALYSIS_METHOD_CODE,
      method_version: ANALYSIS_METHOD_VERSION,
      created_at: ts,
      updated_at: ts,
    },
    {
      dossier_id: dossier.id,
      run_id: runId,
      charger_id: charger.id,
      source_document_id: sourceDocumentId,
      analysis_code: "invoice_brand_match",
      status: brandEval.status,
      declared_value: { brand: charger.brand ?? null },
      observed_value: { brand: observed.brand ?? null },
      evaluation_details: brandEval,
      method_code: ANALYSIS_METHOD_CODE,
      method_version: ANALYSIS_METHOD_VERSION,
      created_at: ts,
      updated_at: ts,
    },
    {
      dossier_id: dossier.id,
      run_id: runId,
      charger_id: charger.id,
      source_document_id: sourceDocumentId,
      analysis_code: "invoice_model_match",
      status: modelEval.status,
      declared_value: { model: charger.model ?? null },
      observed_value: { model: observed.model ?? null },
      evaluation_details: modelEval,
      method_code: ANALYSIS_METHOD_CODE,
      method_version: ANALYSIS_METHOD_VERSION,
      created_at: ts,
      updated_at: ts,
    },
    {
      dossier_id: dossier.id,
      run_id: runId,
      charger_id: charger.id,
      source_document_id: sourceDocumentId,
      analysis_code: "invoice_serial_match",
      status: serialEval.status,
      declared_value: { serial_number: charger.serial_number ?? null },
      observed_value: { serial_number: observed.serial_number ?? null },
      evaluation_details: serialEval,
      method_code: ANALYSIS_METHOD_CODE,
      method_version: ANALYSIS_METHOD_VERSION,
      created_at: ts,
      updated_at: ts,
    },
    {
      dossier_id: dossier.id,
      run_id: runId,
      charger_id: charger.id,
      source_document_id: sourceDocumentId,
      analysis_code: "invoice_mid_match",
      status: midEval.status,
      declared_value: { mid_number: charger.mid_number ?? null },
      observed_value: { mid_number: observed.mid_number ?? null },
      evaluation_details: midEval,
      method_code: ANALYSIS_METHOD_CODE,
      method_version: ANALYSIS_METHOD_VERSION,
      created_at: ts,
      updated_at: ts,
    },
  ];
}

export function buildPhotoAnalysisRows(
  dossier: DossierRow,
  charger: ChargerRow,
  runId: string,
  docsForCharger: DocumentRow[],
): ChargerAnalysisRow[] {
  const photoDoc =
    docsForCharger.find((d) => norm(d.doc_type) === "foto_laadpunt") ?? null;

  return buildPhotoRows(dossier, charger, runId, photoDoc);
}

export type AnalysisGateDecision = {
  submit_allowed: boolean;
  blocking_reasons: string[];
  warnings: string[];
  summary: {
    run_id: string | null;
    overall_status: AnalysisOverallStatus | "not_run";
    invoice_required_total: number;
    invoice_required_pass: number;
    invoice_required_fail: number;
    invoice_required_inconclusive: number;
    photo_not_checked: number;
  };
};

export function evaluateAnalysisGate(args: {
  run_id: string | null;
  summary_row?: SummaryAnalysisRow | null;
  document_rows?: DocumentAnalysisRow[] | null;
  charger_rows?: ChargerAnalysisRow[] | null;
}): AnalysisGateDecision {
  const summaryRow = args.summary_row || null;
  const documentRows = Array.isArray(args.document_rows) ? args.document_rows : [];
  const chargerRows = Array.isArray(args.charger_rows) ? args.charger_rows : [];

  const blocking_reasons: string[] = [];
  const warnings: string[] = [];

  if (!args.run_id || !summaryRow) {
    blocking_reasons.push("Analyse ontbreekt of is nog niet uitgevoerd.");
    return {
      submit_allowed: false,
      blocking_reasons,
      warnings,
      summary: {
        run_id: args.run_id || null,
        overall_status: "not_run",
        invoice_required_total: 0,
        invoice_required_pass: 0,
        invoice_required_fail: 0,
        invoice_required_inconclusive: 0,
        photo_not_checked: 0,
      },
    };
  }

  const invoiceDocs = documentRows.filter((r) => norm(r.doc_type) === "factuur");
  const completedInvoiceDocs = invoiceDocs.filter((r) => r.status === "completed");
  const failedInvoiceDocs = invoiceDocs.filter((r) => r.status === "failed");

  if (invoiceDocs.length === 0) {
    blocking_reasons.push("Geen factuur-analyse gevonden.");
  }

  if (completedInvoiceDocs.length === 0) {
    blocking_reasons.push("Geen bruikbare factuur-analyse beschikbaar.");
  }

  if (failedInvoiceDocs.length > 0) {
    blocking_reasons.push("Minimaal één factuur-analyse is technisch mislukt.");
  }

  const requiredRows = chargerRows.filter((r) =>
    HARD_REQUIRED_INVOICE_CODES.has(String(r.analysis_code || ""))
  );

  const requiredPass = requiredRows.filter((r) => r.status === "pass");
  const requiredFail = requiredRows.filter((r) => r.status === "fail");
  const requiredInconclusive = requiredRows.filter((r) => r.status === "inconclusive");
  const requiredNotChecked = requiredRows.filter((r) => r.status === "not_checked");

  if (requiredRows.length === 0) {
    blocking_reasons.push("Verplichte factuurchecks ontbreken.");
  }

  const chargerIdsWithInvoiceAnalysis = Array.from(new Set(
    chargerRows
      .filter((r) => String(r.analysis_code || "").startsWith("invoice_"))
      .map((r) => String(r.charger_id || "").trim())
      .filter(Boolean),
  ));

  for (const chargerId of chargerIdsWithInvoiceAnalysis) {
    for (const code of HARD_REQUIRED_INVOICE_CODES) {
      const exists = requiredRows.some((r) =>
        String(r.charger_id || "").trim() === chargerId &&
        String(r.analysis_code || "") === code
      );

      if (!exists) {
        blocking_reasons.push(`${code}: ontbreekt voor charger ${chargerId}`);
      }
    }
  }

  for (const row of requiredFail) {
    blocking_reasons.push(
      `${row.analysis_code}: mismatch (${String(row.evaluation_details?.reason || "fail")})`,
    );
  }

  for (const row of requiredInconclusive) {
    blocking_reasons.push(
      `${row.analysis_code}: onvoldoende zeker (${String(row.evaluation_details?.reason || "inconclusive")})`,
    );
  }

  for (const row of requiredNotChecked) {
    blocking_reasons.push(
      `${row.analysis_code}: niet uitgevoerd (${String(row.evaluation_details?.reason || "not_checked")})`,
    );
  }

  const optionalInvoiceRows = chargerRows.filter((r) =>
    OPTIONAL_INVOICE_CODES.has(String(r.analysis_code || ""))
  );

  for (const row of optionalInvoiceRows) {
    if (row.status === "fail" || row.status === "inconclusive") {
      warnings.push(
        `${row.analysis_code}: ${String(row.evaluation_details?.reason || row.status)}`,
      );
    }
  }

  const photoRows = chargerRows.filter((r) => String(r.analysis_code || "").startsWith("photo_"));
  const photoNotChecked = photoRows.filter((r) => r.status === "not_checked");

  if (photoNotChecked.length > 0) {
    warnings.push("Foto-analyse is nog niet geïmplementeerd en blokkeert deze precheck niet.");
  }

  return {
    submit_allowed: blocking_reasons.length === 0,
    blocking_reasons,
    warnings,
    summary: {
      run_id: args.run_id,
      overall_status: summaryRow.overall_status || "not_run",
      invoice_required_total: requiredRows.length,
      invoice_required_pass: requiredPass.length,
      invoice_required_fail: requiredFail.length,
      invoice_required_inconclusive: requiredInconclusive.length + requiredNotChecked.length,
      photo_not_checked: photoNotChecked.length,
    },
  };
}

export function computeOverallStatus(
  documentRows: DocumentAnalysisRow[],
  chargerRows: ChargerAnalysisRow[],
): AnalysisOverallStatus {
  if (documentRows.length === 0 && chargerRows.length === 0) return "not_run";

  const hardRequiredRows = chargerRows.filter((r) =>
    HARD_REQUIRED_INVOICE_CODES.has(String(r.analysis_code || ""))
  );

  if (hardRequiredRows.some((r) => r.status === "fail")) {
    return "review_required";
  }

  if (
    hardRequiredRows.some((r) => r.status === "inconclusive") ||
    hardRequiredRows.some((r) => r.status === "not_checked")
  ) {
    return "partial_pass";
  }

  if (chargerRows.length > 0 && chargerRows.every((r) => r.status === "pass")) {
    return "pass";
  }

  if (
    chargerRows.some((r) => r.status === "inconclusive") ||
    chargerRows.some((r) => r.status === "not_checked") ||
    chargerRows.some((r) =>
      OPTIONAL_INVOICE_CODES.has(String(r.analysis_code || "")) && r.status === "fail"
    )
  ) {
    return "partial_pass";
  }

  return "partial_pass";
}

export function buildSummaryAnalysisRow(
  dossier: DossierRow,
  runId: string,
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
    run_id: runId,
    overall_status: overallStatus,
    method_code: ANALYSIS_METHOD_CODE,
    method_version: ANALYSIS_METHOD_VERSION,
    summary: {
      chargers_seen: chargersSeen,
      document_analysis: documentCounts,
      charger_analysis: chargerCounts,
      mode: "invoice_pdf_v1",
    },
    limitations: [
      "invoice_pdf_only",
      "photo_extraction_not_implemented_yet",
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

export function isAnalysisAllowedForPrecheck(status: unknown, lockedAt: unknown): boolean {
  const st = norm(status);

  if (!!lockedAt) return true;

  return (
    st === "incomplete" ||
    st === "ready_for_review" ||
    st === "in_review" ||
    st === "ready_for_booking"
  );
}

export function assertConfirmedDocumentShape(doc: DocumentRow): void {
  if (!doc.id) throw new Error("Document missing id");
  if (!isSupportedDocType(String(doc.doc_type || "").trim())) {
    return;
  }
  if (!nonEmpty(doc.charger_id)) {
    throw new Error(`Supported document ${doc.id} missing charger_id`);
  }
}