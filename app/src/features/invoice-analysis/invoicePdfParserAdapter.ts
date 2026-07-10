export type InvoiceObservedFields = {
  customer_name: string | null;
  address_line: string | null;
  house_number: string | null;
  postcode_line: string | null;
  city_line: string | null;
  country_line: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  serial_candidate_raw: string | null;
  mid_number: string | null;
  mid_candidate_raw: string | null;
  address_block_ambiguous: boolean | null;
};

export type InvoicePdfParserConfidence = {
  pdf_text_length: number;
  observed_non_null_fields: number;
  expected_customer_name: string | null;
};

export type InvoicePdfParserResult = {
  ok: true;
  parser_kind: "invoice_pdf_parser";
  parser_version: "2026-04-02-app-adapter-v1";
  source_kind: "pdf";
  observed_fields: InvoiceObservedFields;
  confidence: InvoicePdfParserConfidence;
  limitations: string[];
  summary: {
    mode: "invoice_pdf_extract_app_adapter_v1";
    reason: "client_pdf_text_extract_completed";
    byte_length: number;
    pdf_text_length: number;
    observed_non_null_fields: number;
  };
  field_sources: null;
  pages: null;
};

export type InvoicePdfParserError = {
  ok: false;
  parser_kind: "invoice_pdf_parser";
  parser_version: "2026-04-02-app-adapter-v1";
  source_kind: "pdf";
  code: "invalid_input" | "unsupported_runtime" | "parse_failed";
  message: string;
  limitations: string[];
};

export type InvoicePdfParserAdapterResult = InvoicePdfParserResult | InvoicePdfParserError;

export type ParseInvoicePdfOptions = {
  expectedCustomerName?: string | null;
};

type PdfInput = File | Blob | ArrayBuffer | Uint8Array;

const PARSER_KIND = "invoice_pdf_parser" as const;
const PARSER_VERSION = "2026-04-02-app-adapter-v1" as const;
const SOURCE_KIND = "pdf" as const;

function cleanLine(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCompact(value: unknown): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function normalizePostcode(value: unknown): string {
  return normalizeCompact(value);
}

function normalizeSerial(value: unknown): string {
  return normalizeCompact(value);
}

function normalizeMid(value: unknown): string {
  return normalizeCompact(value);
}

function splitLines(text: unknown): string[] {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

function asLatin1String(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  const chunkSize = 0x8000;
  let out = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    out += String.fromCharCode(...chunk);
  }

  return out;
}

function extractPdfStreams(raw: string): Array<{ dict: string; body: string }> {
  const out: Array<{ dict: string; body: string }> = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const dictStart = raw.indexOf("<<", cursor);
    if (dictStart === -1) break;

    const dictEnd = raw.indexOf(">>", dictStart + 2);
    if (dictEnd === -1) break;

    const dict = raw.slice(dictStart + 2, dictEnd);
    const streamPos = raw.indexOf("stream", dictEnd + 2);
    if (streamPos === -1) {
      cursor = dictEnd + 2;
      continue;
    }

    const between = raw.slice(dictEnd + 2, streamPos);
    if (!/^\s*$/.test(between)) {
      cursor = dictEnd + 2;
      continue;
    }

    let bodyStart = streamPos + "stream".length;
    if (raw.slice(bodyStart, bodyStart + 2) === "\r\n") {
      bodyStart += 2;
    } else if (raw.slice(bodyStart, bodyStart + 1) === "\n") {
      bodyStart += 1;
    } else if (raw.slice(bodyStart, bodyStart + 1) === "\r") {
      bodyStart += 1;
    }

    const endstreamPos = raw.indexOf("endstream", bodyStart);
    if (endstreamPos === -1) {
      cursor = dictEnd + 2;
      continue;
    }

    let bodyEnd = endstreamPos;
    if (bodyEnd >= 2 && raw.slice(bodyEnd - 2, bodyEnd) === "\r\n") {
      bodyEnd -= 2;
    } else if (bodyEnd >= 1 && raw.slice(bodyEnd - 1, bodyEnd) === "\n") {
      bodyEnd -= 1;
    } else if (bodyEnd >= 1 && raw.slice(bodyEnd - 1, bodyEnd) === "\r") {
      bodyEnd -= 1;
    }

    out.push({ dict, body: raw.slice(bodyStart, bodyEnd) });
    cursor = endstreamPos + "endstream".length;
  }

  return out;
}

function decodeAscii85Core(inputText: string): Uint8Array {
  const input = inputText.replace(/\s+/g, "");
  if (!input) return new Uint8Array();

  const out: number[] = [];
  let group: number[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (ch === "z") {
      if (group.length !== 0) return new Uint8Array();
      out.push(0, 0, 0, 0);
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code < 33 || code > 117) return new Uint8Array();

    group.push(code - 33);

    if (group.length === 5) {
      let value = 0;
      for (let j = 0; j < 5; j += 1) value = value * 85 + group[j];

      out.push(
        (value >>> 24) & 255,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
      );
      group = [];
    }
  }

  if (group.length > 0) {
    const originalLength = group.length;
    while (group.length < 5) group.push(84);

    let value = 0;
    for (let j = 0; j < 5; j += 1) value = value * 85 + group[j];

    const bytes = [
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255,
    ];

    for (let j = 0; j < originalLength - 1; j += 1) out.push(bytes[j]);
  }

  return new Uint8Array(out);
}

function ascii85Decode(inputRaw: string): Uint8Array {
  const raw = String(inputRaw || "");
  if (!raw.trim()) return new Uint8Array();

  const candidates = [
    raw,
    raw.replace(/\s+/g, ""),
    raw.replace(/^<~/, "").replace(/~>$/, ""),
    raw.replace(/\s+/g, "").replace(/^<~/, "").replace(/~>$/, ""),
  ];

  for (const candidate of candidates) {
    const decoded = decodeAscii85Core(candidate);
    if (decoded.length > 0) return decoded;
  }

  return new Uint8Array();
}

async function tryDecompressionFormat(bytes: Uint8Array, format: CompressionFormat): Promise<Uint8Array | null> {
  try {
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream(format));
    const buffer = await new Response(stream).arrayBuffer();
    const out = new Uint8Array(buffer);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

async function flateDecode(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length === 0) return new Uint8Array();
  if (typeof DecompressionStream !== "function") return new Uint8Array();

  return (
    (await tryDecompressionFormat(bytes, "deflate")) ||
    (await tryDecompressionFormat(bytes, "deflate-raw")) ||
    new Uint8Array()
  );
}

function extractLiteralStrings(pdfContent: string): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < pdfContent.length) {
    if (pdfContent[i] !== "(") {
      i += 1;
      continue;
    }

    i += 1;
    const buffer: string[] = [];
    let depth = 1;

    while (i < pdfContent.length && depth > 0) {
      const ch = pdfContent[i];

      if (ch === "\\") {
        const next = i + 1 < pdfContent.length ? pdfContent[i + 1] : "";

        if (next === "n") { buffer.push("\n"); i += 2; continue; }
        if (next === "r") { buffer.push("\r"); i += 2; continue; }
        if (next === "t") { buffer.push("\t"); i += 2; continue; }
        if (next === "b") { buffer.push("\b"); i += 2; continue; }
        if (next === "f") { buffer.push("\f"); i += 2; continue; }
        if (next === "(" || next === ")" || next === "\\") { buffer.push(next); i += 2; continue; }

        const octalMatch = pdfContent.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
        if (octalMatch) {
          buffer.push(String.fromCharCode(parseInt(octalMatch[0], 8)));
          i += 1 + octalMatch[0].length;
          continue;
        }

        buffer.push(next);
        i += 2;
        continue;
      }

      if (ch === "(") {
        depth += 1;
        buffer.push(ch);
        i += 1;
        continue;
      }

      if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
        buffer.push(ch);
        i += 1;
        continue;
      }

      buffer.push(ch);
      i += 1;
    }

    const cleaned = cleanLine(buffer.join(""));
    if (cleaned) out.push(cleaned);
  }

  return out;
}

function normalizeExtractedPdfText(inputText: string): string {
  return inputText
    .replace(/\r/g, "\n")
    .replace(/\x0c/g, "\n")
    .replace(/\u0000/g, " ")
    .replace(/\u00a0/g, " ");
}

async function extractTextFromPdfBytes(pdfBytes: Uint8Array): Promise<string> {
  const raw = asLatin1String(pdfBytes);
  const streams = extractPdfStreams(raw);
  const textParts: string[] = [];

  for (const stream of streams) {
    const hasAscii85 = stream.dict.includes("/ASCII85Decode");
    const hasFlate = stream.dict.includes("/FlateDecode");
    if (!(hasAscii85 && hasFlate)) continue;

    const ascii85 = ascii85Decode(stream.body);
    if (ascii85.length === 0) continue;

    const inflated = await flateDecode(ascii85);
    if (inflated.length === 0) continue;

    const strings = extractLiteralStrings(asLatin1String(inflated));
    if (strings.length > 0) textParts.push(strings.join("\n"));
  }

  return normalizeExtractedPdfText(textParts.join("\n")).trim();
}

function splitDutchStreetLine(inputText: unknown): { house_number: string | null } {
  const value = cleanLine(inputText);
  if (!value) return { house_number: null };

  const match = value.match(/^(.*?)[\s]+(\d+)(?:[-\s]*([A-Za-z0-9]+))?$/);
  return { house_number: match?.[2] || null };
}

function splitDutchCityLine(inputText: unknown): { postcode: string | null; city: string | null } {
  const value = cleanLine(inputText);
  if (!value) return { postcode: null, city: null };

  const match = value.match(/(\d{4}\s?[A-Za-z]{2})[\s,]+(.+)$/);
  if (!match) return { postcode: null, city: null };

  let city = cleanLine(match[2]);
  city = city.replace(/\b(brand|model|serial|serial number|mid|mid number|device identification|description|qty|rate|vat|amount)\b.*$/i, "");
  city = city.replace(/^[^A-Za-z]+/, "");
  city = city.replace(/[^A-Za-z\s\-]+$/, "");
  city = cleanLine(city);

  return {
    postcode: normalizePostcode(match[1]),
    city: city || null,
  };
}

function isLikelyStreetLine(inputText: unknown): boolean {
  const value = cleanLine(inputText);
  if (!value || value.length < 6 || value.length > 120) return false;
  if (!/\d/.test(value)) return false;

  const lowered = value.toLowerCase();
  const banned = [
    "invoice no",
    "invoice date",
    "customer ref",
    "project ref",
    "serial",
    "mid",
    "vat",
    "total",
    "amount",
    "qty",
    "unit price",
    "rate",
  ];
  if (banned.some((item) => lowered.includes(item))) return false;

  return !!splitDutchStreetLine(value).house_number;
}

function isLikelyCityLine(inputText: unknown): boolean {
  const split = splitDutchCityLine(inputText);
  return !!(split.postcode && split.city);
}

function extractLastAddressLineCandidate(inputText: unknown): string | null {
  const value = cleanLine(inputText);
  if (!value) return null;

  const pattern = /([A-Za-zÀ-ÿ0-9'./\- ]*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'./\- ]*?)\s+(\d+[A-Za-z0-9\-]*)/g;
  const matches = [...value.matchAll(pattern)];
  if (!matches.length) return null;

  const last = matches[matches.length - 1];
  return cleanLine(`${last[1]} ${last[2]}`) || null;
}

function extractLastCityLineCandidate(inputText: unknown): string | null {
  const value = cleanLine(inputText);
  if (!value) return null;

  const pattern = /(\d{4}\s?[A-Za-z]{2})[\s,]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-']*)/g;
  const matches = [...value.matchAll(pattern)];
  if (!matches.length) return null;

  const last = matches[matches.length - 1];
  return cleanLine(`${last[1]} ${last[2]}`) || null;
}

function looksLikeCountryLine(inputText: unknown): boolean {
  const value = cleanLine(inputText).toLowerCase();
  return [
    "netherlands",
    "nederland",
    "the netherlands",
    "belgium",
    "belgie",
    "belgië",
    "germany",
    "deutschland",
  ].includes(value);
}

function looksLikeGenericLabelLine(inputText: unknown): boolean {
  const value = cleanLine(inputText).toLowerCase().replace(/:$/, "");
  if (!value) return false;

  return [
    "customer name",
    "name",
    "address",
    "city",
    "postcode",
    "postcode en plaats",
    "country",
    "land",
    "brand",
    "merk",
    "model",
    "type",
    "serial",
    "serial number",
    "serienummer",
    "mid",
    "mid number",
    "mid nummer",
    "product",
    "amount",
    "invoice",
    "invoice no",
    "invoice date",
    "bill to",
    "charging system details",
  ].includes(value);
}

function looksLikePersonNameCandidate(inputText: unknown): boolean {
  const value = cleanLine(inputText);
  if (!value) return false;
  if (looksLikeGenericLabelLine(value)) return false;
  if (/\d/.test(value)) return false;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;

  const companyMarkers = new Set(["b.v.", "bv", "systems", "services", "chargepoint"]);
  const lowered = new Set(words.map((word) => word.toLowerCase()));
  for (const marker of companyMarkers) {
    if (lowered.has(marker)) return false;
  }

  const capitalizedCount = words.filter((word) => /^[A-ZÀ-Ý]/.test(word)).length;
  return capitalizedCount >= 2;
}

function normalizePersonName(value: unknown): string {
  return cleanLine(String(value || "").toLowerCase())
    .replace(/[^a-zà-ÿ\s\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatchLoose(a: unknown, b: unknown): boolean {
  const first = normalizePersonName(a).split(" ").filter((item) => item.length >= 2);
  const second = normalizePersonName(b).split(" ").filter((item) => item.length >= 2);
  if (first.length < 2 || second.length < 2) return false;

  const firstSet = new Set(first);
  const overlap = second.filter((item) => firstSet.has(item));
  return overlap.length >= 2;
}

function lineContainsExpectedName(line: string | null, expectedCustomerName: string | null): boolean {
  if (!line || !expectedCustomerName) return false;

  const normalizedLine = normalizePersonName(line);
  const normalizedExpected = normalizePersonName(expectedCustomerName);
  if (!normalizedLine || !normalizedExpected) return false;

  if (normalizedLine.includes(normalizedExpected)) return true;
  return namesMatchLoose(line, expectedCustomerName);
}

function extractCustomerName(text: string, expectedCustomerName: string | null): string | null {
  const lines = splitLines(text);

  if (expectedCustomerName) {
    for (const line of lines) {
      if (lineContainsExpectedName(line, expectedCustomerName)) return expectedCustomerName;
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!looksLikePersonNameCandidate(line)) continue;

    const next1 = lines[i + 1] || null;
    const next2 = lines[i + 2] || null;

    if ((next1 && isLikelyStreetLine(next1)) || (next2 && isLikelyStreetLine(next2))) {
      return line;
    }
  }

  return null;
}

function pickBestAddressBlock(
  text: string,
  expectedCustomerName: string | null,
): {
  address_line: string | null;
  city_line: string | null;
  name_line: string | null;
  address_block_ambiguous: boolean | null;
} {
  const lines = splitLines(text);
  const candidates: Array<{
    name_line: string | null;
    address_line: string;
    city_line: string;
    score: number;
    matched_expected_customer_name: boolean;
  }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    let streetCandidate: string | null = null;

    if (isLikelyStreetLine(lines[i])) {
      streetCandidate = lines[i];
    } else {
      const mixedStreet = extractLastAddressLineCandidate(lines[i]);
      if (mixedStreet && isLikelyStreetLine(mixedStreet)) streetCandidate = mixedStreet;
    }

    if (!streetCandidate) continue;

    for (let j = i; j < Math.min(i + 5, lines.length); j += 1) {
      let cityCandidate: string | null = null;

      if (isLikelyCityLine(lines[j])) {
        cityCandidate = lines[j];
      } else {
        const mixedCity = extractLastCityLineCandidate(lines[j]);
        if (mixedCity && isLikelyCityLine(mixedCity)) cityCandidate = mixedCity;
      }

      if (!cityCandidate) continue;

      const prev1 = lines[i - 1] || null;
      const prev2 = lines[i - 2] || null;
      const prev3 = lines[i - 3] || null;
      const next1 = lines[j + 1] || null;
      const next2 = lines[j + 2] || null;
      const contextBefore = [prev3, prev2, prev1].filter(Boolean);
      let score = 5;
      let matchedNameLine: string | null = null;
      let nearbyNameLine: string | null = null;

      if (expectedCustomerName) {
        for (const candidateLine of contextBefore) {
          if (lineContainsExpectedName(candidateLine, expectedCustomerName)) {
            matchedNameLine = candidateLine;
            score += 20;
            break;
          }
        }
      }

      if (!matchedNameLine) {
        for (const candidateLine of [prev1, prev2, prev3]) {
          if (candidateLine && looksLikePersonNameCandidate(candidateLine)) {
            nearbyNameLine = candidateLine;
            score += candidateLine === prev1 ? 4 : 3;
            break;
          }
        }
      }

      if (next1 && looksLikeCountryLine(next1)) score += 2;
      else if (next2 && looksLikeCountryLine(next2)) score += 1;

      candidates.push({
        name_line: matchedNameLine || nearbyNameLine,
        address_line: streetCandidate,
        city_line: cityCandidate,
        score,
        matched_expected_customer_name: !!matchedNameLine,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    return {
      address_line: null,
      city_line: null,
      name_line: null,
      address_block_ambiguous: null,
    };
  }

  const best = candidates[0];
  const second = candidates[1] || null;
  let ambiguous = false;

  if (second && Math.abs(best.score - second.score) <= 2) ambiguous = true;

  if (ambiguous && expectedCustomerName) {
    const bestMatches = !!best.matched_expected_customer_name;
    const secondMatches = !!second?.matched_expected_customer_name;
    if (bestMatches && !secondMatches) ambiguous = false;
  }

  return {
    address_line: best.address_line,
    city_line: best.city_line,
    name_line: best.name_line || null,
    address_block_ambiguous: ambiguous,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchLabeledValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const regex = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:]?\\s*(.+)`, "i");
    const match = text.match(regex);
    if (match?.[1]) return cleanLine(match[1]);
  }

  return null;
}

function extractNearbyValue(
  lines: string[],
  labels: string[],
  validator: (value: string) => boolean,
): string | null {
  const labelPatterns = labels.map((label) => new RegExp(`\\b${escapeRegExp(label)}\\b`, "i"));

  function isLabelLine(line: string): boolean {
    const value = cleanLine(line);
    if (!value) return false;
    return labelPatterns.some((pattern) => pattern.test(value));
  }

  function extractInline(line: string): string | null {
    const value = cleanLine(line);
    for (const label of labels) {
      const regex = new RegExp(`\\b${escapeRegExp(label)}\\b\\s*[:\\-]?\\s*(.+)$`, "i");
      const match = value.match(regex);
      if (!match) continue;

      const candidate = cleanLine(match[1]);
      if (!candidate) continue;
      if (looksLikeGenericLabelLine(candidate)) continue;
      if (validator(candidate)) return candidate;
    }

    return null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const value = cleanLine(lines[index]);
    if (!value) continue;

    const inline = extractInline(value);
    if (inline) return inline;

    if (!isLabelLine(value)) continue;

    for (let lookAhead = 1; lookAhead < 5; lookAhead += 1) {
      const nextIndex = index + lookAhead;
      if (nextIndex >= lines.length) break;

      const candidate = cleanLine(lines[nextIndex]);
      if (!candidate) continue;
      if (isLabelLine(candidate)) continue;
      if (looksLikeGenericLabelLine(candidate)) continue;
      if (validator(candidate)) return candidate;
    }
  }

  return null;
}

function cleanupOcrIdValue(inputText: unknown): string {
  let value = cleanLine(inputText);
  if (!value) return "";

  const replacements: Record<string, string> = {
    "~": " ",
    "—": "-",
    "–": "-",
    ":": " ",
    ";": " ",
    ",": " ",
  };

  for (const [source, target] of Object.entries(replacements)) {
    value = value.split(source).join(target);
  }

  value = cleanLine(value);
  const compactRaw = value.replace(/[^A-Za-z0-9]/g, "");

  if (/^mo\d{6,}$/i.test(compactRaw)) {
    const compact = compactRaw.toUpperCase();
    value = "M0" + compact.slice(2);
  }

  value = value.replace(/[^A-Za-z0-9\-\s]/g, "");
  value = cleanLine(value);
  value = value.replace(/^[^A-Za-z0-9]+/, "");
  value = value.replace(/[^A-Za-z0-9]+$/, "");

  return cleanLine(value);
}

function containsUntrustedIdNoise(inputText: unknown): boolean {
  return /[|!>\]\}\)]/.test(String(inputText || ""));
}

function normalizeMidCandidateValue(inputText: unknown): string {
  const cleaned = cleanupOcrIdValue(inputText);
  const compact = normalizeMid(cleaned);
  if (!compact) return "";

  if (/^\d{6,}$/.test(compact)) return compact;
  if (/^M\d{6,}$/.test(compact)) return compact;
  if (compact.startsWith("MID") && compact.length > 3) return compact.slice(3);

  return compact;
}

function normalizeSerialCandidateValue(inputText: unknown): string {
  const cleaned = cleanupOcrIdValue(inputText);
  const compact = normalizeSerial(cleaned);
  if (!compact) return "";
  if (compact.startsWith("MID")) return "";
  return compact;
}

function assessMidCandidate(inputText: unknown): {
  raw: string | null;
  normalized: string | null;
  approved: string | null;
  reason: string | null;
} {
  const raw = cleanLine(inputText);
  if (!raw) return { raw: null, normalized: null, approved: null, reason: null };

  const normalized = normalizeMidCandidateValue(cleanupOcrIdValue(raw));

  if (containsUntrustedIdNoise(raw)) {
    return { raw, normalized: normalized || null, approved: null, reason: "mid_candidate_rejected_noisy" };
  }

  if (/^\d{6,}$/.test(normalized) || /^M\d{6,}$/.test(normalized) || /^MID\d{6,}$/.test(normalized)) {
    return { raw, normalized, approved: normalized, reason: null };
  }

  return { raw, normalized: normalized || null, approved: null, reason: "mid_candidate_rejected_invalid" };
}

function assessSerialCandidate(
  inputText: unknown,
  rejectMid: string | null,
): {
  raw: string | null;
  normalized: string | null;
  approved: string | null;
  reason: string | null;
} {
  const raw = cleanLine(inputText);
  if (!raw) return { raw: null, normalized: null, approved: null, reason: null };

  const normalized = normalizeSerialCandidateValue(cleanupOcrIdValue(raw));
  const compact = normalizeSerial(normalized);

  if (containsUntrustedIdNoise(raw)) {
    return { raw, normalized: normalized || null, approved: null, reason: "serial_candidate_rejected_noisy" };
  }

  if (rejectMid && compact === normalizeMid(rejectMid)) {
    return { raw, normalized: normalized || null, approved: null, reason: "serial_candidate_rejected_same_as_mid" };
  }

  if (looksLikeSerialValue(normalized)) {
    return { raw, normalized, approved: normalized, reason: null };
  }

  return { raw, normalized: normalized || null, approved: null, reason: "serial_candidate_rejected_invalid" };
}

function looksLikeMidValue(inputText: unknown): boolean {
  const value = cleanLine(inputText);
  if (!value || looksLikeGenericLabelLine(value)) return false;

  const compact = normalizeMidCandidateValue(value);
  if (!compact) return false;

  return /^\d{6,}$/.test(compact) || /^M\d{6,}$/.test(compact) || /^MID\d{6,}$/.test(compact);
}

function looksLikeSerialValue(inputText: unknown): boolean {
  const value = cleanLine(inputText);
  if (!value || looksLikeGenericLabelLine(value)) return false;

  const compact = normalizeSerialCandidateValue(value);
  if (!compact) return false;
  if (compact.length < 6 || compact.length > 40) return false;
  if (!/\d/.test(compact)) return false;

  return true;
}

const MID_LABELS = [
  "MID number",
  "MID Number",
  "MID nummer",
  "MID-nummer",
  "MID nr",
  "MID nr.",
  "MID no",
  "MID no.",
  "MID",
];

const SERIAL_LABELS = [
  "Charger serial number",
  "Serial number",
  "Serial Number",
  "Serial no",
  "Serial no.",
  "Serial nr",
  "Serial nr.",
  "Serienummer",
  "S/N",
  "SN",
  "Serial",
];

const BRAND_LABELS = ["Brand", "Merk"];
const MODEL_LABELS = ["Model", "Type"];

function findMidCandidate(lines: string[]) {
  const candidate = extractNearbyValue(lines, MID_LABELS, looksLikeMidValue);
  if (candidate) return assessMidCandidate(candidate);

  const joined = lines.join("\n");
  const match = joined.match(/\bMID(?:\s*[-]?\s*(?:nummer|nr\.?|no\.?|number))?\b\s*[:#-]?\s*([^\n]{3,60})/i);
  if (match) return assessMidCandidate(match[1]);

  return { raw: null, normalized: null, approved: null, reason: null };
}

function findSerialCandidate(lines: string[], midCandidate: string | null) {
  const candidate = extractNearbyValue(lines, SERIAL_LABELS, looksLikeSerialValue);
  if (candidate) return assessSerialCandidate(candidate, midCandidate);

  const joined = lines.join("\n");
  const match = joined.match(/\b(?:Serial(?:\s+(?:number|no\.?|nr\.?))?|Serienummer|S\/N|SN)\b\s*[:#-]?\s*([^\n]{3,60})/i);
  if (match) return assessSerialCandidate(match[1], midCandidate);

  return { raw: null, normalized: null, approved: null, reason: null };
}

function extractInvoiceObservedFieldsFromText(text: string, expectedCustomerName: string | null): InvoiceObservedFields {
  const sourceText = String(text || "").replace(/\r/g, "");
  const lines = splitLines(sourceText);
  const inferred = pickBestAddressBlock(sourceText, expectedCustomerName);

  const addressLine = inferred.address_line || null;
  const cityLineRaw = inferred.city_line || null;
  const cityParts = splitDutchCityLine(cityLineRaw || "");
  const houseParts = splitDutchStreetLine(addressLine || "");
  const brand = matchLabeledValue(sourceText, BRAND_LABELS) ||
    extractNearbyValue(lines, BRAND_LABELS, (value) => /[A-Za-z]/.test(value)) ||
    null;
  const model = matchLabeledValue(sourceText, MODEL_LABELS) ||
    extractNearbyValue(lines, MODEL_LABELS, (value) => /[A-Za-z0-9]/.test(value)) ||
    null;
  const customerName = extractCustomerName(sourceText, expectedCustomerName);
  const midAssessment = findMidCandidate(lines);
  const midNumber = midAssessment.approved;
  const serialAssessment = findSerialCandidate(lines, midNumber);
  const serialNumber = serialAssessment.approved;

  let ambiguous = inferred.address_block_ambiguous;
  if (
    ambiguous &&
    expectedCustomerName &&
    customerName &&
    namesMatchLoose(customerName, expectedCustomerName) &&
    addressLine &&
    cityParts.postcode &&
    cityParts.city
  ) {
    ambiguous = false;
  }

  return {
    customer_name: customerName,
    address_line: addressLine,
    house_number: houseParts.house_number,
    postcode_line: cityParts.postcode,
    city_line: cityParts.city,
    country_line: null,
    serial_number: serialNumber,
    serial_candidate_raw: serialAssessment.raw,
    mid_number: midNumber,
    mid_candidate_raw: midAssessment.raw,
    address_block_ambiguous: ambiguous,
    brand,
    model,
  };
}

async function bytesFromPdfInput(input: PdfInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());

  return new Uint8Array();
}

function parserError(code: InvoicePdfParserError["code"], message: string, limitations: string[]): InvoicePdfParserError {
  return {
    ok: false,
    parser_kind: PARSER_KIND,
    parser_version: PARSER_VERSION,
    source_kind: SOURCE_KIND,
    code,
    message,
    limitations,
  };
}

export function summarizeInvoicePdfParserResult(result: InvoicePdfParserAdapterResult): {
  ok: boolean;
  parser_kind: string;
  observed_non_null_field_names: string[];
  has_mid: boolean;
  has_serial: boolean;
  limitations_count: number;
} {
  if (!result.ok) {
    return {
      ok: false,
      parser_kind: result.parser_kind,
      observed_non_null_field_names: [],
      has_mid: false,
      has_serial: false,
      limitations_count: result.limitations.length,
    };
  }

  const observedNonNullFieldNames = Object.entries(result.observed_fields)
    .filter(([key, value]) => key !== "address_block_ambiguous" && value !== null && value !== "")
    .map(([key]) => key);

  return {
    ok: true,
    parser_kind: result.parser_kind,
    observed_non_null_field_names: observedNonNullFieldNames,
    has_mid: !!result.observed_fields.mid_number,
    has_serial: !!result.observed_fields.serial_number,
    limitations_count: result.limitations.length,
  };
}

export async function parseInvoicePdfInput(
  input: PdfInput,
  options: ParseInvoicePdfOptions = {},
): Promise<InvoicePdfParserAdapterResult> {
  try {
    if (typeof DecompressionStream !== "function") {
      return parserError("unsupported_runtime", "PDF parser runtime does not support decompression.", [
        "pdf_decompression_unavailable",
      ]);
    }

    const expectedCustomerName = cleanLine(options.expectedCustomerName || "") || null;
    const pdfBytes = await bytesFromPdfInput(input);

    if (pdfBytes.length === 0) {
      return parserError("invalid_input", "PDF input is empty.", ["pdf_input_empty"]);
    }

    const extractedText = await extractTextFromPdfBytes(pdfBytes);
    const limitations: string[] = [];

    if (!extractedText) limitations.push("pdf_text_extraction_empty");

    const observedFields = extractInvoiceObservedFieldsFromText(extractedText, expectedCustomerName);

    if (observedFields.address_block_ambiguous === true) limitations.push("address_block_ambiguous");
    if (observedFields.mid_candidate_raw && observedFields.mid_number == null) limitations.push("mid_candidate_rejected");
    if (observedFields.serial_candidate_raw && observedFields.serial_number == null) limitations.push("serial_candidate_rejected");

    const observedNonNullFields = Object.entries(observedFields)
      .filter(([key, value]) => key !== "address_block_ambiguous" && value !== null && value !== "")
      .length;

    return {
      ok: true,
      parser_kind: PARSER_KIND,
      parser_version: PARSER_VERSION,
      source_kind: SOURCE_KIND,
      observed_fields: observedFields,
      confidence: {
        pdf_text_length: extractedText.length,
        observed_non_null_fields: observedNonNullFields,
        expected_customer_name: expectedCustomerName,
      },
      limitations,
      summary: {
        mode: "invoice_pdf_extract_app_adapter_v1",
        reason: "client_pdf_text_extract_completed",
        byte_length: pdfBytes.length,
        pdf_text_length: extractedText.length,
        observed_non_null_fields: observedNonNullFields,
      },
      field_sources: null,
      pages: null,
    };
  } catch {
    return parserError("parse_failed", "PDF parser failed safely.", ["pdf_parse_failed"]);
  }
}
