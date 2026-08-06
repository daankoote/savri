import {
  type EnergyEanCandidate,
  type EnergyEanExtractionPage,
  extractEnergyEanCandidates,
} from "./energyEanCandidateExtractor";
import {
  type EnergyDocumentObservation,
  extractEnergyDocumentObservation,
  type ObservedDeliveryAddress,
  type ObservedValue,
} from "./energyDocumentObservation";
import type {
  DocumentObservationEnvelope,
  GenericDocumentFactCandidate,
  GenericStructuredAddress,
} from "./documentObservationEnvelope";
import { deriveDocumentTypeCandidates } from "./documentTypeClassifier";

export type InvoiceObservedFields = {
  customer_name: string | null;
  supplier_installer_name: string | null;
  address_line: string | null;
  street: string | null;
  house_number: string | null;
  house_number_addition: string | null;
  postcode_line: string | null;
  city_line: string | null;
  country_line: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  serial_candidate_raw: string | null;
  mid_number: string | null;
  mid_candidate_raw: string | null;
  installation_date: string | null;
  installation_year: string | null;
  invoice_date: string | null;
  address_block_ambiguous: boolean | null;
};

export type InvoicePdfParserConfidence = {
  pdf_text_length: number;
  observed_non_null_fields: number;
};

export type InvoicePdfParserResult = {
  ok: true;
  parser_kind: "invoice_pdf_parser";
  parser_version: "2026-08-04-unified-document-v5";
  source_kind: "pdf";
  observed_fields: InvoiceObservedFields;
  ean_candidates: EnergyEanCandidate[];
  energy_document_observation: EnergyDocumentObservation;
  observation_envelope: DocumentObservationEnvelope;
  confidence: InvoicePdfParserConfidence;
  limitations: string[];
  summary: {
    mode: "unified_document_extract_app_adapter_v5";
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
  parser_version: "2026-08-04-unified-document-v5";
  source_kind: "pdf";
  code: "invalid_input" | "unsupported_runtime" | "parse_failed";
  message: string;
  limitations: string[];
};

export type InvoicePdfParserAdapterResult =
  | InvoicePdfParserResult
  | InvoicePdfParserError;

export type ChargerDocumentObservation = {
  customerName: ObservedValue;
  supplierInstallerName: ObservedValue;
  brand: ObservedValue;
  model: ObservedValue;
  serialNumber: ObservedValue;
  midNumber: ObservedValue;
  location: ObservedDeliveryAddress;
  installationDate: ObservedValue;
  installationYear: ObservedValue;
  invoiceDate: ObservedValue;
};

type PdfInput = File | Blob | ArrayBuffer | Uint8Array;

const PARSER_KIND = "invoice_pdf_parser" as const;
export const UNIFIED_DOCUMENT_PARSER_VERSION =
  "2026-08-04-unified-document-v5" as const;
const PARSER_VERSION = UNIFIED_DOCUMENT_PARSER_VERSION;
const SOURCE_KIND = "pdf" as const;

function cleanLine(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function missingChargerObservedValue(reason: string): ObservedValue {
  return {
    value: null,
    sourcePage: null,
    confidence: "unavailable",
    extractionMethod: "not_found",
    displayable: false,
    rejectionReason: reason,
  };
}

function chargerObservedValue(
  value: string | null,
  extractionMethod: ObservedValue["extractionMethod"] = "invoice_labeled_field",
): ObservedValue {
  const displayValue = cleanLine(value);
  return displayValue
    ? {
      value: displayValue,
      sourcePage: null,
      confidence: "medium",
      extractionMethod,
      displayable: true,
      rejectionReason: null,
    }
    : missingChargerObservedValue("charger_invoice_value_not_found");
}

export function chargerDocumentObservationFromParserResult(
  result: InvoicePdfParserAdapterResult,
): ChargerDocumentObservation | null {
  if (!result.ok) return null;
  const fields = result.observed_fields;
  const addressDisplayable = !fields.address_block_ambiguous &&
    Boolean(
      fields.street && fields.house_number && fields.postcode_line &&
        fields.city_line,
    );
  return {
    customerName: chargerObservedValue(fields.customer_name),
    supplierInstallerName: chargerObservedValue(
      fields.supplier_installer_name,
    ),
    brand: chargerObservedValue(fields.brand),
    model: chargerObservedValue(fields.model),
    serialNumber: chargerObservedValue(fields.serial_number),
    midNumber: chargerObservedValue(fields.mid_number),
    location: {
      value: null,
      street: fields.street,
      houseNumber: fields.house_number,
      houseNumberAddition: fields.house_number_addition,
      postalCode: fields.postcode_line,
      city: fields.city_line,
      country: fields.country_line,
      sourcePage: null,
      confidence: addressDisplayable ? "medium" : "unavailable",
      extractionMethod: addressDisplayable
        ? "invoice_address_block"
        : "not_found",
      displayable: addressDisplayable,
      rejectionReason: addressDisplayable
        ? null
        : "charger_invoice_address_unreliable",
    },
    installationDate: chargerObservedValue(
      fields.installation_date,
      "explicit_installation_date",
    ),
    installationYear: chargerObservedValue(
      fields.installation_year,
      "explicit_installation_date",
    ),
    invoiceDate: chargerObservedValue(
      fields.invoice_date,
      "explicit_invoice_date",
    ),
  };
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

async function tryDecompressionFormat(
  bytes: Uint8Array,
  format: CompressionFormat,
): Promise<Uint8Array | null> {
  try {
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const stream = new Blob([arrayBuffer]).stream().pipeThrough(
      new DecompressionStream(format),
    );
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

        if (next === "n") {
          buffer.push("\n");
          i += 2;
          continue;
        }
        if (next === "r") {
          buffer.push("\r");
          i += 2;
          continue;
        }
        if (next === "t") {
          buffer.push("\t");
          i += 2;
          continue;
        }
        if (next === "b") {
          buffer.push("\b");
          i += 2;
          continue;
        }
        if (next === "f") {
          buffer.push("\f");
          i += 2;
          continue;
        }
        if (next === "(" || next === ")" || next === "\\") {
          buffer.push(next);
          i += 2;
          continue;
        }

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

type ParsedPdfObject = {
  id: number;
  body: string;
  dictionary: string;
  streamBody: string | null;
};

type PdfTextToken =
  | { kind: "array"; value: PdfTextToken[] }
  | { kind: "name"; value: string }
  | { kind: "number"; value: number }
  | { kind: "operator"; value: string }
  | { kind: "text"; value: string };

type PositionedPdfText = {
  fontSize: number;
  order: number;
  text: string;
  x: number;
  y: number;
};

type ExtractedPdfText = {
  pages: EnergyEanExtractionPage[];
  text: string;
};

function parsePdfObjects(raw: string): Map<number, ParsedPdfObject> {
  const headers = [...raw.matchAll(/(?:^|[\r\n])(\d+)\s+\d+\s+obj\b/g)];
  const objects = new Map<number, ParsedPdfObject>();

  for (const header of headers) {
    const id = Number(header[1]);
    const bodyStart = (header.index ?? 0) + header[0].length;
    const bodyEnd = raw.indexOf("endobj", bodyStart);
    if (bodyEnd < 0) continue;

    const body = raw.slice(bodyStart, bodyEnd);
    const streamPosition = body.indexOf("stream");
    if (streamPosition < 0) {
      objects.set(id, { id, body, dictionary: body, streamBody: null });
      continue;
    }

    const dictionary = body.slice(0, streamPosition);
    let streamStart = streamPosition + "stream".length;
    if (body.slice(streamStart, streamStart + 2) === "\r\n") {
      streamStart += 2;
    } else if (/^[\r\n]$/.test(body[streamStart] || "")) {
      streamStart += 1;
    }

    const endstreamPosition = body.lastIndexOf("endstream");
    if (endstreamPosition < streamStart) {
      objects.set(id, { id, body, dictionary, streamBody: null });
      continue;
    }

    let streamEnd = endstreamPosition;
    if (body.slice(streamEnd - 2, streamEnd) === "\r\n") {
      streamEnd -= 2;
    } else if (/^[\r\n]$/.test(body[streamEnd - 1] || "")) {
      streamEnd -= 1;
    }

    objects.set(id, {
      id,
      body,
      dictionary,
      streamBody: body.slice(streamStart, streamEnd),
    });
  }

  return objects;
}

function latin1Bytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

async function decodePdfObjectStream(
  object: ParsedPdfObject,
): Promise<string> {
  if (object.streamBody == null) return "";

  const filters = [...object.dictionary.matchAll(
    /\/(ASCII85Decode|FlateDecode)/g,
  )].map((match) => match[1]);
  let bytes = latin1Bytes(object.streamBody);

  for (const filter of filters) {
    if (filter === "ASCII85Decode") {
      bytes = ascii85Decode(asLatin1String(bytes));
    } else if (filter === "FlateDecode") {
      bytes = await flateDecode(bytes);
    }
    if (bytes.length === 0) return "";
  }

  return asLatin1String(bytes);
}

function decodeUtf16Be(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (!clean || clean.length % 2 !== 0) return "";
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16);
  }

  try {
    return new TextDecoder("utf-16be").decode(bytes);
  } catch {
    let output = "";
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      output += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return output;
  }
}

function parseToUnicodeCMap(content: string): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const block of content.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (
      const match of block[1].matchAll(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
      )
    ) {
      mapping.set(match[1].toUpperCase(), decodeUtf16Be(match[2]));
    }
  }

  for (const block of content.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const rangePattern =
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
    for (const match of block[1].matchAll(rangePattern)) {
      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2], 16);
      const sourceWidth = match[1].length;
      const arrayValues = match[4]
        ? [...match[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((entry) => entry[1])
        : [];

      for (let code = start; code <= end; code += 1) {
        const source = code.toString(16).toUpperCase().padStart(
          sourceWidth,
          "0",
        );
        if (match[3]) {
          const destination = (Number.parseInt(match[3], 16) + code - start)
            .toString(16)
            .padStart(match[3].length, "0");
          mapping.set(source, decodeUtf16Be(destination));
        } else {
          const destination = arrayValues[code - start];
          if (destination) mapping.set(source, decodeUtf16Be(destination));
        }
      }
    }
  }

  return mapping;
}

function parsePdfTextTokens(content: string): PdfTextToken[] {
  let cursor = 0;

  const skipWhitespace = () => {
    while (cursor < content.length) {
      if (/\s/.test(content[cursor])) {
        cursor += 1;
        continue;
      }
      if (content[cursor] === "%") {
        const lineEnd = content.indexOf("\n", cursor + 1);
        cursor = lineEnd < 0 ? content.length : lineEnd + 1;
        continue;
      }
      break;
    }
  };

  const readLiteralHex = (): string => {
    cursor += 1;
    const bytes: number[] = [];
    let depth = 1;

    while (cursor < content.length && depth > 0) {
      const character = content[cursor];
      if (character === "\\") {
        const escaped = content[cursor + 1] || "";
        const octal = content.slice(cursor + 1, cursor + 4).match(
          /^[0-7]{1,3}/,
        );
        if (octal) {
          bytes.push(Number.parseInt(octal[0], 8));
          cursor += octal[0].length + 1;
          continue;
        }
        const escapedByte = escaped === "n"
          ? 10
          : escaped === "r"
          ? 13
          : escaped === "t"
          ? 9
          : escaped === "b"
          ? 8
          : escaped === "f"
          ? 12
          : escaped.charCodeAt(0);
        if (Number.isFinite(escapedByte)) bytes.push(escapedByte);
        cursor += 2;
        continue;
      }
      if (character === "(") {
        depth += 1;
        bytes.push(character.charCodeAt(0));
        cursor += 1;
        continue;
      }
      if (character === ")") {
        depth -= 1;
        cursor += 1;
        if (depth === 0) break;
        bytes.push(character.charCodeAt(0));
        continue;
      }
      bytes.push(character.charCodeAt(0));
      cursor += 1;
    }

    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")
      .toUpperCase();
  };

  const readTokens = (untilArrayEnd = false): PdfTextToken[] => {
    const tokens: PdfTextToken[] = [];
    while (cursor < content.length) {
      skipWhitespace();
      if (cursor >= content.length) break;
      const character = content[cursor];
      if (untilArrayEnd && character === "]") {
        cursor += 1;
        break;
      }
      if (character === "[") {
        cursor += 1;
        tokens.push({ kind: "array", value: readTokens(true) });
        continue;
      }
      if (character === "(") {
        tokens.push({ kind: "text", value: readLiteralHex() });
        continue;
      }
      if (character === "<" && content[cursor + 1] !== "<") {
        const end = content.indexOf(">", cursor + 1);
        if (end < 0) break;
        tokens.push({
          kind: "text",
          value: content.slice(cursor + 1, end).replace(/\s+/g, "")
            .toUpperCase(),
        });
        cursor = end + 1;
        continue;
      }
      if (character === "/") {
        const match = content.slice(cursor + 1).match(/^[^\s()[\]<>\/%]+/);
        const value = match?.[0] || "";
        tokens.push({ kind: "name", value });
        cursor += value.length + 1;
        continue;
      }
      if (character === "'" || character === '"') {
        tokens.push({ kind: "operator", value: character });
        cursor += 1;
        continue;
      }
      const number = content.slice(cursor).match(/^[+-]?(?:\d+\.?\d*|\.\d+)/);
      if (number) {
        tokens.push({ kind: "number", value: Number(number[0]) });
        cursor += number[0].length;
        continue;
      }
      if ("<>]}".includes(character)) {
        cursor += character === "<" && content[cursor + 1] === "<" ? 2 : 1;
        continue;
      }
      const operator = content.slice(cursor).match(/^[^\s()[\]<>\/%]+/);
      if (!operator) {
        cursor += 1;
        continue;
      }
      tokens.push({ kind: "operator", value: operator[0] });
      cursor += operator[0].length;
    }
    return tokens;
  };

  return readTokens();
}

function decodePdfTextHex(hex: string, mapping: Map<string, string>): string {
  const clean = hex.replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  const widths = [...new Set([...mapping.keys()].map((key) => key.length))]
    .sort((left, right) => right - left);
  const fallbackWidth = clean.length % 4 === 0 && widths.includes(4) ? 4 : 2;
  let cursor = 0;
  let output = "";

  while (cursor < clean.length) {
    let matched = false;
    for (const width of widths) {
      const source = clean.slice(cursor, cursor + width);
      const decoded = mapping.get(source);
      if (source.length === width && decoded !== undefined) {
        output += decoded;
        cursor += width;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const source = clean.slice(cursor, cursor + fallbackWidth);
    if (source.length < fallbackWidth) break;
    const value = Number.parseInt(source, 16);
    if (fallbackWidth === 2 && value >= 32 && value <= 126) {
      output += String.fromCharCode(value);
    } else if (
      fallbackWidth === 4 && value >= 32 && value <= 0x10ffff &&
      !(value >= 0xd800 && value <= 0xdfff)
    ) {
      output += String.fromCodePoint(value);
    }
    cursor += fallbackWidth;
  }

  return output.replace(/\u0000/g, "");
}

function interpretPdfTextContent(
  content: string,
  fontMappings: Map<string, Map<string, string>>,
): PositionedPdfText[] {
  type Matrix = [number, number, number, number, number, number];
  const items: PositionedPdfText[] = [];
  const operands: PdfTextToken[] = [];
  const graphicsStack: Matrix[] = [];
  let currentTransformation: Matrix = [1, 0, 0, 1, 0, 0];
  let currentFont = "";
  let fontSize = 10;
  let leading = 0;
  let order = 0;
  let x = 0;
  let y = 0;

  const operandAt = (offset: number) =>
    operands[offset < 0 ? operands.length + offset : offset];
  const numberAt = (offset: number) => {
    const token = operandAt(offset);
    return token?.kind === "number" ? token.value : 0;
  };
  const decode = (token: PdfTextToken | undefined) =>
    token?.kind === "text"
      ? decodePdfTextHex(
        token.value,
        fontMappings.get(currentFont) || new Map(),
      )
      : "";
  const multiply = (left: Matrix, right: Matrix): Matrix => [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
  const show = (text: string) => {
    const cleaned = cleanLine(text);
    if (!cleaned) return;
    const pageX = currentTransformation[0] * x +
      currentTransformation[2] * y + currentTransformation[4];
    const pageY = currentTransformation[1] * x +
      currentTransformation[3] * y + currentTransformation[5];
    const scale = Math.max(
      Math.hypot(currentTransformation[0], currentTransformation[1]),
      Math.hypot(currentTransformation[2], currentTransformation[3]),
      0.01,
    );
    items.push({
      fontSize: fontSize * scale,
      order,
      text: cleaned,
      x: pageX,
      y: pageY,
    });
    order += 1;
  };

  for (const token of parsePdfTextTokens(content)) {
    if (token.kind !== "operator") {
      operands.push(token);
      continue;
    }

    if (token.value === "q") {
      graphicsStack.push([...currentTransformation]);
    } else if (token.value === "Q") {
      currentTransformation = graphicsStack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (token.value === "cm") {
      const matrix: Matrix = [
        numberAt(-6),
        numberAt(-5),
        numberAt(-4),
        numberAt(-3),
        numberAt(-2),
        numberAt(-1),
      ];
      currentTransformation = multiply(currentTransformation, matrix);
    } else if (token.value === "Tf") {
      const name = operandAt(-2);
      if (name?.kind === "name") currentFont = name.value;
      fontSize = numberAt(-1) || fontSize;
    } else if (token.value === "Tm") {
      x = numberAt(-2);
      y = numberAt(-1);
    } else if (token.value === "Td" || token.value === "TD") {
      x += numberAt(-2);
      y += numberAt(-1);
      if (token.value === "TD") leading = -numberAt(-1);
    } else if (token.value === "TL") {
      leading = numberAt(-1);
    } else if (token.value === "T*") {
      x = 0;
      y -= leading;
    } else if (token.value === "Tj") {
      show(decode(operandAt(-1)));
    } else if (token.value === "TJ") {
      const array = operandAt(-1);
      if (array?.kind === "array") {
        let text = "";
        for (const part of array.value) {
          if (part.kind === "text") text += decode(part);
          if (part.kind === "number" && part.value < -120) text += " ";
        }
        show(text);
      }
    } else if (token.value === "'") {
      x = 0;
      y -= leading;
      show(decode(operandAt(-1)));
    } else if (token.value === '"') {
      x = 0;
      y -= leading;
      show(decode(operandAt(-1)));
    }

    operands.length = 0;
  }

  return items;
}

function composePdfPageText(items: PositionedPdfText[]): string {
  const rows: Array<{ y: number; items: PositionedPdfText[] }> = [];
  for (const item of items) {
    const tolerance = Math.max(1.5, item.fontSize * 0.18);
    const row = rows.find((candidate) =>
      Math.abs(candidate.y - item.y) <= tolerance
    );
    if (row) {
      row.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => {
      const ordered = row.items.sort((left, right) => left.order - right.order);
      const positiveAdvances = ordered.slice(1)
        .map((item, index) => item.x - ordered[index].x)
        .filter((advance) => advance > 0)
        .sort((left, right) => left - right);
      const baselineIndex = Math.floor(positiveAdvances.length * 0.4);
      const baselineAdvance = positiveAdvances[baselineIndex] || 0;
      let text = "";

      ordered.forEach((item, index) => {
        if (index > 0) {
          const previous = ordered[index - 1];
          const advance = item.x - previous.x;
          const separatorThreshold = Math.max(
            baselineAdvance * 1.65,
            Math.min(item.fontSize, previous.fontSize) * 0.45,
          );
          if (advance <= 0 || advance > separatorThreshold) text += "\t";
        }
        text += item.text;
      });

      return text.replace(/ +/g, " ").replace(/ *\t */g, "\t").trim();
    })
    .filter(Boolean)
    .join("\n");
}

function pageObjectIds(objects: Map<number, ParsedPdfObject>): number[] {
  const catalog = [...objects.values()].find((object) =>
    /\/Type\s*\/Catalog\b/.test(object.dictionary)
  );
  const rootId = Number(
    catalog?.dictionary.match(/\/Pages\s+(\d+)\s+\d+\s+R/)?.[1] || 0,
  );
  const pageIds: number[] = [];
  const visited = new Set<number>();

  const visit = (id: number) => {
    if (!id || visited.has(id)) return;
    visited.add(id);
    const object = objects.get(id);
    if (!object) return;
    if (/\/Type\s*\/Page\b/.test(object.dictionary)) {
      pageIds.push(id);
      return;
    }
    const kids = object.dictionary.match(/\/Kids\s*\[([\s\S]*?)\]/)?.[1] || "";
    for (const reference of kids.matchAll(/(\d+)\s+\d+\s+R/g)) {
      visit(Number(reference[1]));
    }
  };
  visit(rootId);

  if (pageIds.length > 0) return pageIds;
  return [...objects.values()]
    .filter((object) => /\/Type\s*\/Page\b/.test(object.dictionary))
    .map((object) => object.id)
    .sort((left, right) => left - right);
}

function referencedObjectIds(value: string): number[] {
  return [...value.matchAll(/(\d+)\s+\d+\s+R/g)].map((match) =>
    Number(match[1])
  );
}

function inheritedResourceText(
  object: ParsedPdfObject,
  objects: Map<number, ParsedPdfObject>,
): string {
  let current: ParsedPdfObject | undefined = object;
  const visited = new Set<number>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const resourceId = Number(
      current.dictionary.match(/\/Resources\s+(\d+)\s+\d+\s+R/)?.[1] || 0,
    );
    if (resourceId) return objects.get(resourceId)?.dictionary || "";
    if (/\/Resources\s*<</.test(current.dictionary)) {
      return current.dictionary;
    }
    const parentId: number = Number(
      current.dictionary.match(/\/Parent\s+(\d+)\s+\d+\s+R/)?.[1] || 0,
    );
    current = parentId ? objects.get(parentId) : undefined;
  }
  return object.dictionary;
}

function resourceEntryText(
  resources: string,
  entryName: "Font" | "XObject",
  objects: Map<number, ParsedPdfObject>,
): string {
  const referenceId = Number(
    resources.match(new RegExp(`/${entryName}\\s+(\\d+)\\s+\\d+\\s+R`))
      ?.[1] || 0,
  );
  if (referenceId) return objects.get(referenceId)?.dictionary || "";
  return resources.match(new RegExp(`/${entryName}\\s*<<([\\s\\S]*?)>>`))
    ?.[1] || "";
}

async function extractPageTextFromPdfObjects(
  objects: Map<number, ParsedPdfObject>,
): Promise<EnergyEanExtractionPage[]> {
  const cmapByFontObject = new Map<number, Map<string, string>>();
  for (const object of objects.values()) {
    if (!/\/Type\s*\/Font\b/.test(object.dictionary)) continue;
    const cmapId = Number(
      object.dictionary.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)?.[1] || 0,
    );
    if (!cmapId) continue;
    const cmapObject = objects.get(cmapId);
    if (!cmapObject) continue;
    const cmap = parseToUnicodeCMap(await decodePdfObjectStream(cmapObject));
    if (cmap.size > 0) cmapByFontObject.set(object.id, cmap);
  }

  // Page resources may be inherited from a parent Pages node. Resolve all
  // bounded font resource dictionaries once so those pages still use their
  // embedded ToUnicode maps; the content stream font name remains the join.
  const inheritedFonts = new Map<string, Map<string, string>>();
  const inheritedXObjects = new Map<string, number>();
  for (const object of objects.values()) {
    const fontBlock = object.dictionary.match(
      /\/Font\s*<<([\s\S]*?)>>/,
    )?.[1] || "";
    for (const match of fontBlock.matchAll(/\/(\S+)\s+(\d+)\s+\d+\s+R/g)) {
      const mapping = cmapByFontObject.get(Number(match[2]));
      if (mapping && !inheritedFonts.has(match[1])) {
        inheritedFonts.set(match[1], mapping);
      }
    }
    const xObjectBlock = object.dictionary.match(
      /\/XObject\s*<<([\s\S]*?)>>/,
    )?.[1] || "";
    for (
      const match of xObjectBlock.matchAll(/\/(\S+)\s+(\d+)\s+\d+\s+R/g)
    ) {
      const referenced = objects.get(Number(match[2]));
      if (
        referenced && /\/Subtype\s*\/Form\b/.test(referenced.dictionary) &&
        !inheritedXObjects.has(match[1])
      ) inheritedXObjects.set(match[1], referenced.id);
    }
  }

  const pages: EnergyEanExtractionPage[] = [];
  for (const [pageIndex, pageId] of pageObjectIds(objects).entries()) {
    const page = objects.get(pageId);
    if (!page) continue;
    const resourceText = inheritedResourceText(page, objects);
    const fontBlock = resourceEntryText(resourceText, "Font", objects);
    const pageFonts = new Map<string, Map<string, string>>();
    for (const match of fontBlock.matchAll(/\/(\S+)\s+(\d+)\s+\d+\s+R/g)) {
      const mapping = cmapByFontObject.get(Number(match[2]));
      if (mapping) pageFonts.set(match[1], mapping);
    }
    if (pageFonts.size === 0) {
      inheritedFonts.forEach((mapping, name) => pageFonts.set(name, mapping));
    }
    const pageXObjects = new Map<string, number>();
    const xObjectBlock = resourceEntryText(resourceText, "XObject", objects);
    for (
      const match of xObjectBlock.matchAll(/\/(\S+)\s+(\d+)\s+\d+\s+R/g)
    ) pageXObjects.set(match[1], Number(match[2]));
    if (pageXObjects.size === 0) {
      inheritedXObjects.forEach((id, name) => pageXObjects.set(name, id));
    }

    const contentsValue = page.dictionary.match(
      /\/Contents\s*(\[[\s\S]*?\]|\d+\s+\d+\s+R)/,
    )?.[1] || "";
    const positioned: PositionedPdfText[] = [];
    const visitedForms = new Set<number>();
    const includeForm = async (formId: number) => {
      if (visitedForms.has(formId)) return;
      visitedForms.add(formId);
      const form = objects.get(formId);
      if (!form) return;
      const content = await decodePdfObjectStream(form);
      positioned.push(...interpretPdfTextContent(content, pageFonts));
      for (const match of content.matchAll(/\/(\S+)\s+Do\b/g)) {
        const nestedId = pageXObjects.get(match[1]) ||
          inheritedXObjects.get(match[1]);
        if (nestedId) await includeForm(nestedId);
      }
    };
    for (const contentId of referencedObjectIds(contentsValue)) {
      const contentObject = objects.get(contentId);
      if (!contentObject) continue;
      const content = await decodePdfObjectStream(contentObject);
      positioned.push(...interpretPdfTextContent(content, pageFonts));
      for (const match of content.matchAll(/\/(\S+)\s+Do\b/g)) {
        const formId = pageXObjects.get(match[1]) ||
          inheritedXObjects.get(match[1]);
        if (formId) await includeForm(formId);
      }
    }
    const text = composePdfPageText(positioned);
    if (text) pages.push({ page: pageIndex + 1, text });
  }

  return pages;
}

async function extractTextFromPdfBytes(
  pdfBytes: Uint8Array,
): Promise<ExtractedPdfText> {
  const raw = asLatin1String(pdfBytes);
  const pages = await extractPageTextFromPdfObjects(parsePdfObjects(raw));
  if (pages.length > 0) {
    return {
      pages,
      text: normalizeExtractedPdfText(
        pages.map((page) => page.text).join("\n\f\n"),
      ).trim(),
    };
  }

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

  return {
    pages: [],
    text: normalizeExtractedPdfText(textParts.join("\n")).trim(),
  };
}

function splitDutchStreetLine(
  inputText: unknown,
): {
  street: string | null;
  house_number: string | null;
  house_number_addition: string | null;
} {
  const value = cleanLine(inputText);
  if (!value) {
    return {
      street: null,
      house_number: null,
      house_number_addition: null,
    };
  }

  const match = value.match(
    /^(.*?)[\s]+(\d+)(?:\s*[-/]\s*|\s+)?([A-Za-z0-9]{1,6})?$/,
  );
  return {
    street: cleanLine(match?.[1]) || null,
    house_number: match?.[2] || null,
    house_number_addition: match?.[3] || null,
  };
}

function splitDutchCityLine(
  inputText: unknown,
): { postcode: string | null; city: string | null } {
  const value = cleanLine(inputText);
  if (!value) return { postcode: null, city: null };

  const match = value.match(/(\d{4}\s?[A-Za-z]{2})[\s,]+(.+)$/);
  if (!match) return { postcode: null, city: null };

  let city = cleanLine(match[2]);
  city = city.replace(
    /\b(brand|model|serial|serial number|mid|mid number|device identification|description|qty|rate|vat|amount)\b.*$/i,
    "",
  );
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

  const pattern =
    /([A-Za-zÀ-ÿ0-9'./\- ]*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'./\- ]*?)\s+(\d+[A-Za-z0-9\-]*)/g;
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

  const companyMarkers = new Set([
    "b.v.",
    "bv",
    "systems",
    "services",
    "chargepoint",
  ]);
  const lowered = new Set(words.map((word) => word.toLowerCase()));
  for (const marker of companyMarkers) {
    if (lowered.has(marker)) return false;
  }

  const capitalizedCount =
    words.filter((word) => /^[A-ZÀ-Ý]/.test(word)).length;
  return capitalizedCount >= 2;
}

function invoiceCandidateCells(text: string): string[] {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .flatMap((row) => row.split(/\t+/))
    .map(cleanLine)
    .filter(Boolean);
}

function extractCustomerName(text: string): string | null {
  const lines = invoiceCandidateCells(text);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!looksLikePersonNameCandidate(line)) continue;

    const next1 = lines[i + 1] || null;
    const next2 = lines[i + 2] || null;

    if (
      (next1 && isLikelyStreetLine(next1)) ||
      (next2 && isLikelyStreetLine(next2))
    ) {
      return line;
    }
  }

  return null;
}

function pickBestAddressBlock(text: string): {
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
  }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    let streetCandidate: string | null = null;

    if (isLikelyStreetLine(lines[i])) {
      streetCandidate = lines[i];
    } else {
      const mixedStreet = extractLastAddressLineCandidate(lines[i]);
      if (mixedStreet && isLikelyStreetLine(mixedStreet)) {
        streetCandidate = mixedStreet;
      }
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
      let score = 5;
      let nearbyNameLine: string | null = null;

      for (const candidateLine of [prev1, prev2, prev3]) {
        if (candidateLine && looksLikePersonNameCandidate(candidateLine)) {
          nearbyNameLine = candidateLine;
          score += candidateLine === prev1 ? 4 : 3;
          break;
        }
      }

      if (next1 && looksLikeCountryLine(next1)) score += 2;
      else if (next2 && looksLikeCountryLine(next2)) score += 1;

      candidates.push({
        name_line: nearbyNameLine,
        address_line: streetCandidate,
        city_line: cityCandidate,
        score,
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
    const regex = new RegExp(
      `(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:]?\\s*(.+)`,
      "i",
    );
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
  const labelPatterns = labels.map((label) =>
    new RegExp(`\\b${escapeRegExp(label)}\\b`, "i")
  );

  function isLabelLine(line: string): boolean {
    const value = cleanLine(line);
    if (!value) return false;
    return labelPatterns.some((pattern) => pattern.test(value));
  }

  function extractInline(line: string): string | null {
    const value = cleanLine(line);
    for (const label of labels) {
      const regex = new RegExp(
        `\\b${escapeRegExp(label)}\\b\\s*[:\\-]?\\s*(.+)$`,
        "i",
      );
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
  if (!raw) {
    return { raw: null, normalized: null, approved: null, reason: null };
  }

  const normalized = normalizeMidCandidateValue(cleanupOcrIdValue(raw));

  if (containsUntrustedIdNoise(raw)) {
    return {
      raw,
      normalized: normalized || null,
      approved: null,
      reason: "mid_candidate_rejected_noisy",
    };
  }

  if (
    /^\d{6,}$/.test(normalized) || /^M\d{6,}$/.test(normalized) ||
    /^MID\d{6,}$/.test(normalized)
  ) {
    return { raw, normalized, approved: normalized, reason: null };
  }

  return {
    raw,
    normalized: normalized || null,
    approved: null,
    reason: "mid_candidate_rejected_invalid",
  };
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
  if (!raw) {
    return { raw: null, normalized: null, approved: null, reason: null };
  }

  const normalized = normalizeSerialCandidateValue(cleanupOcrIdValue(raw));
  const compact = normalizeSerial(normalized);

  if (containsUntrustedIdNoise(raw)) {
    return {
      raw,
      normalized: normalized || null,
      approved: null,
      reason: "serial_candidate_rejected_noisy",
    };
  }

  if (rejectMid && compact === normalizeMid(rejectMid)) {
    return {
      raw,
      normalized: normalized || null,
      approved: null,
      reason: "serial_candidate_rejected_same_as_mid",
    };
  }

  if (looksLikeSerialValue(normalized)) {
    return { raw, normalized, approved: normalized, reason: null };
  }

  return {
    raw,
    normalized: normalized || null,
    approved: null,
    reason: "serial_candidate_rejected_invalid",
  };
}

function looksLikeMidValue(inputText: unknown): boolean {
  const value = cleanLine(inputText);
  if (!value || looksLikeGenericLabelLine(value)) return false;

  const compact = normalizeMidCandidateValue(value);
  if (!compact) return false;

  return /^\d{6,}$/.test(compact) || /^M\d{6,}$/.test(compact) ||
    /^MID\d{6,}$/.test(compact);
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
const SUPPLIER_INSTALLER_LABELS = [
  "Installer",
  "Installateur",
  "Supplier",
  "Leverancier",
];
const INSTALLATION_DATE_LABELS = [
  "Installation date",
  "Installed on",
  "Installatiedatum",
  "Datum installatie",
];
const INSTALLATION_YEAR_LABELS = [
  "Installation year",
  "Installatiejaar",
  "Jaar van installatie",
];
const INVOICE_DATE_LABELS = ["Invoice date", "Factuurdatum"];

function isoDateFromText(inputText: unknown): string | null {
  const value = cleanLine(inputText);
  const match = value.match(
    /(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})(?!\d)/,
  );
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function extractLabeledDate(text: string, labels: string[]): string | null {
  const raw = matchLabeledValue(text, labels) ||
    extractNearbyValue(
      splitLines(text),
      labels,
      (value) => Boolean(isoDateFromText(value)),
    );
  return isoDateFromText(raw);
}

function extractLabeledYear(text: string, labels: string[]): string | null {
  const raw = matchLabeledValue(text, labels) ||
    extractNearbyValue(
      splitLines(text),
      labels,
      (value) => /\b(?:19|20)\d{2}\b/.test(value),
    );
  return raw?.match(/\b(?:19|20)\d{2}\b/)?.[0] || null;
}

function findMidCandidate(lines: string[]) {
  const candidate = extractNearbyValue(lines, MID_LABELS, looksLikeMidValue);
  if (candidate) return assessMidCandidate(candidate);

  const joined = lines.join("\n");
  const match = joined.match(
    /\bMID(?:\s*[-]?\s*(?:nummer|nr\.?|no\.?|number))?\b\s*[:#-]?\s*([^\n]{3,60})/i,
  );
  if (match) return assessMidCandidate(match[1]);

  return { raw: null, normalized: null, approved: null, reason: null };
}

function findSerialCandidate(lines: string[], midCandidate: string | null) {
  const candidate = extractNearbyValue(
    lines,
    SERIAL_LABELS,
    looksLikeSerialValue,
  );
  if (candidate) return assessSerialCandidate(candidate, midCandidate);

  const joined = lines.join("\n");
  const match = joined.match(
    /\b(?:Serial(?:\s+(?:number|no\.?|nr\.?))?|Serienummer|S\/N|SN)\b\s*[:#-]?\s*([^\n]{3,60})/i,
  );
  if (match) return assessSerialCandidate(match[1], midCandidate);

  return { raw: null, normalized: null, approved: null, reason: null };
}

function extractInvoiceObservedFieldsFromText(
  text: string,
): InvoiceObservedFields {
  const sourceText = String(text || "").replace(/\r/g, "");
  const lines = splitLines(sourceText);
  const inferred = pickBestAddressBlock(sourceText);

  const addressLine = inferred.address_line || null;
  const cityLineRaw = inferred.city_line || null;
  const cityParts = splitDutchCityLine(cityLineRaw || "");
  const houseParts = splitDutchStreetLine(addressLine || "");
  const brand = matchLabeledValue(sourceText, BRAND_LABELS) ||
    extractNearbyValue(
      lines,
      BRAND_LABELS,
      (value) => /[A-Za-z]/.test(value),
    ) ||
    null;
  const model = matchLabeledValue(sourceText, MODEL_LABELS) ||
    extractNearbyValue(
      lines,
      MODEL_LABELS,
      (value) => /[A-Za-z0-9]/.test(value),
    ) ||
    null;
  const supplierInstallerName = matchLabeledValue(
    sourceText,
    SUPPLIER_INSTALLER_LABELS,
  ) || extractNearbyValue(
    lines,
    SUPPLIER_INSTALLER_LABELS,
    (value) => /[A-Za-z]/.test(value),
  ) || null;
  const customerName = extractCustomerName(sourceText);
  const midAssessment = findMidCandidate(lines);
  const midNumber = midAssessment.approved;
  const serialAssessment = findSerialCandidate(lines, midNumber);
  const serialNumber = serialAssessment.approved;
  const installationDate = extractLabeledDate(
    sourceText,
    INSTALLATION_DATE_LABELS,
  );
  const installationYear = installationDate?.slice(0, 4) ||
    extractLabeledYear(sourceText, INSTALLATION_YEAR_LABELS);
  const invoiceDate = extractLabeledDate(sourceText, INVOICE_DATE_LABELS);

  return {
    customer_name: customerName,
    supplier_installer_name: supplierInstallerName,
    address_line: addressLine,
    street: houseParts.street,
    house_number: houseParts.house_number,
    house_number_addition: houseParts.house_number_addition,
    postcode_line: cityParts.postcode,
    city_line: cityParts.city,
    country_line: null,
    serial_number: serialNumber,
    serial_candidate_raw: serialAssessment.raw,
    mid_number: midNumber,
    mid_candidate_raw: midAssessment.raw,
    installation_date: installationDate,
    installation_year: installationYear,
    invoice_date: invoiceDate,
    address_block_ambiguous: inferred.address_block_ambiguous,
    brand,
    model,
  };
}

function genericSignature(value: unknown): string {
  return cleanLine(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL").replace(/[^a-z0-9]/g, "");
}

function genericCandidate(
  factKey: GenericDocumentFactCandidate["factKey"],
  value: string | null,
  extractionMethod: string,
  confidence: GenericDocumentFactCandidate["confidence"],
  sourcePage: number | null,
  structuredAddress?: GenericStructuredAddress,
  rejectionReason: string | null = null,
): GenericDocumentFactCandidate | null {
  const rawValue = String(value ?? "").trim();
  const normalizedValue = cleanLine(rawValue);
  if (!normalizedValue && !rejectionReason) return null;
  const labelOnly = normalizedValue &&
    looksLikeGenericLabelLine(normalizedValue);
  const rejected = rejectionReason || (labelOnly ? "label_only_value" : null);
  return {
    factKey,
    rawValue,
    normalizedValue,
    structuredAddress,
    sourcePage,
    sourceRegion: sourcePage
      ? `page:${sourcePage}:${extractionMethod}`
      : `document:${extractionMethod}`,
    confidence: rejected ? "unavailable" : confidence,
    extractionMethod,
    displayable: Boolean(normalizedValue && !rejected),
    rejectionReason: rejected,
  };
}

function addressText(address: GenericStructuredAddress): string {
  return [
    cleanLine(
      `${address.street || ""} ${address.houseNumber || ""}${
        address.houseNumberAddition ? `-${address.houseNumberAddition}` : ""
      }`,
    ),
    cleanLine(`${address.postalCode || ""} ${address.city || ""}`),
    cleanLine(address.country),
  ].filter(Boolean).join(", ");
}

async function contentFingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type OrganizationExtractFact = {
  factKey:
    | "organizationName"
    | "kvkNumber"
    | "registeredAddress"
    | "legalForm"
    | "tradeName"
    | "directorOrBoardMember"
    | "directorTitle"
    | "representationAuthorityText";
  value: string;
  page: number;
  method: string;
  confidence: "high" | "medium";
};

type OrganizationSection =
  | "onderneming"
  | "vestiging"
  | "enig_aandeelhouder"
  | "bestuurder";

type OrganizationCell = {
  column: number;
  page: number;
  row: number;
  text: string;
  normalized: string;
};

type OrganizationRow = {
  cells: OrganizationCell[];
  page: number;
  row: number;
  section: OrganizationSection | null;
};

const DUTCH_ORGANIZATION_LABELS = [
  "statutaire naam",
  "kvk-nummer",
  "bezoekadres",
  "rechtsvorm",
  "handelsnaam",
  "bestuurder",
  "naam",
  "titel",
  "bevoegdheid",
  "rsin",
  "vestigingsnummer",
  "geplaatst kapitaal",
  "gestort kapitaal",
  "sbi-code",
  "werkzame personen",
  "eerste inschrijving",
  "geboortedatum",
] as const;

const ENGLISH_ORGANIZATION_LABELS = [
  "legal name",
  "company name",
  "trade register number",
  "chamber of commerce number",
  "registered address",
  "legal form",
  "trade name",
  "director",
  "board member",
  "title",
  "authority",
  "signing authority",
] as const;

const ORGANIZATION_SECTION_LABELS: Readonly<Record<
  string,
  OrganizationSection
>> = {
  onderneming: "onderneming",
  vestiging: "vestiging",
  "enig aandeelhouder": "enig_aandeelhouder",
  bestuurder: "bestuurder",
};

function normalizeOrganizationLabel(value: unknown): string {
  return cleanLine(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL");
}

function normalizedOrganizationCellLabel(value: string): string {
  return normalizeOrganizationLabel(value).replace(/[:\-–—]+$/, "").trim();
}

function exactOrganizationLabel(
  cell: OrganizationCell,
  labels: ReadonlyArray<string>,
): string | null {
  return labels.find((label) =>
    cell.normalized === label || cell.normalized.startsWith(`${label}:`) ||
    cell.normalized.startsWith(`${label} `)
  ) || null;
}

function organizationRows(
  pages: ReadonlyArray<EnergyEanExtractionPage>,
): OrganizationRow[] {
  const pageRows = pages.map((page) => ({
    page: page.page,
    rows: String(page.text || "").replace(/\r/g, "\n").split("\n")
      .map((row) => row.split(/\t+/).map(cleanLine).filter(Boolean))
      .filter((cells) => cells.length > 0),
  }));
  const firstPageLabels = pageRows[0]?.rows.map((cells) =>
    cells.map(normalizeOrganizationLabel).join(" ")
  ) || [];
  const kvkIndex = firstPageLabels.findIndex((row) =>
    row === "kvk-nummer" || row.startsWith("kvk-nummer ")
  );
  const firstLaterSectionIndex = firstPageLabels.findIndex((row) =>
    row === "onderneming" || row === "vestiging" || row === "bestuurder"
  );
  const reverseRows = kvkIndex >= 0 && firstLaterSectionIndex >= 0 &&
    kvkIndex > firstLaterSectionIndex;
  const rows: OrganizationRow[] = [];
  let section: OrganizationSection | null = null;

  pageRows.forEach((page) => {
    (reverseRows ? [...page.rows].reverse() : page.rows)
      .forEach((cells) => {
        const rowIndex = rows.length;
        const organizationCells = cells.map((text, column) => ({
          column,
          page: page.page,
          row: rowIndex,
          text,
          normalized: normalizeOrganizationLabel(text),
        }));
        if (organizationCells.length === 1) {
          const sectionLabel = normalizedOrganizationCellLabel(
            organizationCells[0].text,
          );
          section = ORGANIZATION_SECTION_LABELS[sectionLabel] || section;
        }
        rows.push({
          cells: organizationCells,
          page: page.page,
          row: rowIndex,
          section,
        });
      });
  });
  return rows;
}

function isOrganizationBoundary(cell: OrganizationCell): boolean {
  const normalized = normalizedOrganizationCellLabel(cell.text);
  return Boolean(ORGANIZATION_SECTION_LABELS[normalized]) ||
    exactOrganizationLabel(cell, [
        ...DUTCH_ORGANIZATION_LABELS,
        ...ENGLISH_ORGANIZATION_LABELS,
      ]) !== null;
}

function isDateLikeOrganizationValue(value: string): boolean {
  return /\b\d{1,2}\s*(?:[-\/.]|\s)\s*(?:\d{1,2}|januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(?:[-\/.]|\s)\s*\d{2,4}\b/i
    .test(value);
}

function isReliableOrganizationName(value: string): boolean {
  const normalized = normalizeOrganizationLabel(value);
  return Boolean(value && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) &&
    !isDateLikeOrganizationValue(value) &&
    !/\b\d{4}\s?[A-Z]{2}\b/i.test(value) &&
    normalized !== "enig aandeelhouder" &&
    !normalized.startsWith("enig aandeelhouder ");
}

function isReliableRegisteredAddress(value: string, dutch: boolean): boolean {
  if (!value || isDateLikeOrganizationValue(value)) return false;
  if (dutch) {
    const withoutPostcode = value.replace(/\b\d{4}\s?[A-Z]{2}\b/gi, "");
    return /\b\d{4}\s?[A-Z]{2}\b/i.test(value) &&
      /[A-Za-zÀ-ÖØ-öø-ÿ][^,]*\b\d{1,5}\b/.test(withoutPostcode);
  }
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function isReliableLegalForm(value: string): boolean {
  return Boolean(value && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) &&
    !isDateLikeOrganizationValue(value) &&
    !/^\d{8,}$/.test(value.replace(/\D/g, "")) &&
    !/^rsin\b/i.test(value);
}

function isReliableTradeName(value: string): boolean {
  return Boolean(value && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) &&
    !isDateLikeOrganizationValue(value) &&
    !/^\d{8,}$/.test(value.replace(/\D/g, "")) &&
    !/^vestigingsnummer\b/i.test(value);
}

function isReliableDirector(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 8 &&
    /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value) &&
    !/\d/.test(value) && !isDateLikeOrganizationValue(value) &&
    !/^(?:directeur|bestuurder|voorzitter|secretaris|penningmeester)$/i.test(
      value,
    );
}

function isReliableDirectorTitle(value: string): boolean {
  return Boolean(value && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) &&
    !/\d/.test(value) && !isDateLikeOrganizationValue(value);
}

function isReliableAuthority(value: string): boolean {
  return Boolean(value && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) &&
    !isDateLikeOrganizationValue(value) &&
    !/^(?:directeur|bestuurder|voorzitter|secretaris|penningmeester)$/i.test(
      value,
    );
}

function valueCellsAfter(
  row: OrganizationRow,
  column: number,
): OrganizationCell[] {
  const values: OrganizationCell[] = [];
  for (const cell of row.cells.slice(column + 1)) {
    if (isOrganizationBoundary(cell)) break;
    values.push(cell);
  }
  return values;
}

function boundedOrganizationValue(
  rows: ReadonlyArray<OrganizationRow>,
  aliases: ReadonlyArray<string>,
  options: {
    combineCells?: boolean;
    sections?: ReadonlyArray<OrganizationSection | null>;
    transform?: (value: string) => string;
    validate?: (value: string) => boolean;
  } = {},
): { value: string; page: number } | null {
  const validate = options.validate || ((value: string) => Boolean(value));
  const transform = options.transform || cleanLine;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (options.sections && !options.sections.includes(row.section)) continue;
    for (const cell of row.cells) {
      const alias = exactOrganizationLabel(cell, aliases);
      if (!alias) continue;
      const inline = transform(cleanLine(
        cell.text.slice(alias.length).replace(/^\s*[:\-–—]\s*/, ""),
      ));
      if (inline && validate(inline)) return { value: inline, page: row.page };

      const sameRow = valueCellsAfter(row, cell.column).map((value) =>
        value.text
      );
      const sameRowValue = transform(cleanLine(
        options.combineCells ? sameRow.join(", ") : sameRow[0],
      ));
      if (sameRowValue && validate(sameRowValue)) {
        return { value: sameRowValue, page: row.page };
      }

      const continuation: string[] = [...sameRow];
      for (let offset = 1; offset <= 2; offset += 1) {
        const next = rows[rowIndex + offset];
        if (
          !next || next.page !== row.page || next.section !== row.section ||
          next.cells.some(isOrganizationBoundary)
        ) break;
        continuation.push(...next.cells.map((value) => value.text));
        const candidate = transform(cleanLine(
          options.combineCells ? continuation.join(", ") : continuation[0],
        ));
        if (candidate && validate(candidate)) {
          return { value: candidate, page: row.page };
        }
      }
    }
  }
  return null;
}

function boundedKvkNumber(
  rows: ReadonlyArray<OrganizationRow>,
): { value: string; page: number } | null {
  const found = boundedOrganizationValue(rows, [
    "kvk-nummer",
    "trade register number",
    "chamber of commerce number",
  ], {
    validate: (value) => /^(?:\d[\s.\-]*){8}$/.test(value),
  });
  return found ? { ...found, value: found.value.replace(/\D/g, "") } : null;
}

function normalizeOrganizationAddress(value: string): string {
  const parts = value.split(/\s*,\s*/).map(cleanLine).filter(Boolean);
  const postcodeIndex = parts.findIndex((part) =>
    /\b\d{4}\s?[A-Z]{2}\b/i.test(part)
  );
  if (postcodeIndex === 0 && parts.length > 1) {
    return cleanLine(`${parts.slice(1).join(", ")}, ${parts[0]}`);
  }
  return cleanLine(value);
}

function hasExactOrganizationLabel(
  rows: ReadonlyArray<OrganizationRow>,
  label: string,
): boolean {
  return rows.some((row) =>
    row.cells.some((cell) => exactOrganizationLabel(cell, [label]) !== null)
  );
}

function extractOrganizationExtractFacts(
  pages: ReadonlyArray<EnergyEanExtractionPage>,
): OrganizationExtractFact[] {
  const rows = organizationRows(pages);
  const dutchSignals = [
    "handelsregister",
    "rechtsvorm",
    "bezoekadres",
    "statutaire naam",
  ].filter((signal) => hasExactOrganizationLabel(rows, signal)).length;
  const englishSignals = [
    "chamber of commerce",
    "trade register number",
    "legal form",
    "registered address",
    "trade name",
  ].filter((signal) => hasExactOrganizationLabel(rows, signal)).length;
  if (dutchSignals < 2 && englishSignals < 2) return [];

  const facts: OrganizationExtractFact[] = [];
  const add = (
    factKey: OrganizationExtractFact["factKey"],
    found: { value: string; page: number } | null,
    method: string,
    confidence: OrganizationExtractFact["confidence"] = "medium",
  ) => {
    if (found?.value) facts.push({ factKey, ...found, method, confidence });
  };
  add(
    "organizationName",
    boundedOrganizationValue(rows, [
      "statutaire naam",
      "legal name",
      "company name",
    ], { validate: isReliableOrganizationName }),
    hasExactOrganizationLabel(rows, "statutaire naam")
      ? "organization_extract_dutch_statutaire_naam"
      : "organization_extract_english_legal_name",
    "high",
  );
  add(
    "kvkNumber",
    boundedKvkNumber(rows),
    hasExactOrganizationLabel(rows, "kvk-nummer")
      ? "organization_extract_dutch_kvk_nummer"
      : "organization_extract_english_trade_register_number",
    "high",
  );
  add(
    "registeredAddress",
    boundedOrganizationValue(rows, [
      "bezoekadres",
      "registered address",
    ], {
      combineCells: true,
      transform: normalizeOrganizationAddress,
      validate: (value) =>
        isReliableRegisteredAddress(
          value,
          hasExactOrganizationLabel(rows, "bezoekadres"),
        ),
    }),
    hasExactOrganizationLabel(rows, "bezoekadres")
      ? "organization_extract_dutch_bezoekadres"
      : "organization_extract_english_registered_address",
    "high",
  );
  add(
    "legalForm",
    boundedOrganizationValue(rows, ["rechtsvorm", "legal form"], {
      validate: isReliableLegalForm,
    }),
    hasExactOrganizationLabel(rows, "rechtsvorm")
      ? "organization_extract_dutch_rechtsvorm"
      : "organization_extract_english_legal_form",
  );
  add(
    "tradeName",
    boundedOrganizationValue(rows, ["handelsnaam"], {
      sections: ["onderneming", "vestiging"],
      validate: isReliableTradeName,
    }) || boundedOrganizationValue(rows, ["trade name"], {
      validate: isReliableTradeName,
    }),
    hasExactOrganizationLabel(rows, "handelsnaam")
      ? "organization_extract_dutch_handelsnaam"
      : "organization_extract_english_trade_name",
  );
  add(
    "directorOrBoardMember",
    boundedOrganizationValue(rows, ["naam"], {
      sections: ["bestuurder"],
      validate: isReliableDirector,
    }) || boundedOrganizationValue(rows, ["director", "board member"], {
      validate: isReliableDirector,
    }),
    hasExactOrganizationLabel(rows, "bestuurder")
      ? "organization_extract_dutch_bestuurder_naam"
      : "organization_extract_english_director",
  );
  add(
    "directorTitle",
    boundedOrganizationValue(rows, ["titel"], {
      sections: ["bestuurder"],
      validate: isReliableDirectorTitle,
    }) || boundedOrganizationValue(rows, ["title"], {
      validate: isReliableDirectorTitle,
    }),
    hasExactOrganizationLabel(rows, "titel")
      ? "organization_extract_dutch_titel"
      : "organization_extract_english_title",
  );
  add(
    "representationAuthorityText",
    boundedOrganizationValue(rows, ["bevoegdheid"], {
      sections: ["bestuurder"],
      validate: isReliableAuthority,
    }) || boundedOrganizationValue(rows, ["signing authority", "authority"], {
      validate: isReliableAuthority,
    }),
    hasExactOrganizationLabel(rows, "bevoegdheid")
      ? "organization_extract_dutch_bevoegdheid"
      : "organization_extract_english_authority",
  );
  return facts;
}

async function buildObservationEnvelope(
  pdfBytes: Uint8Array,
  pages: EnergyEanExtractionPage[],
  observedFields: InvoiceObservedFields,
  eanCandidates: EnergyEanCandidate[],
  energy: EnergyDocumentObservation,
  limitations: string[],
): Promise<DocumentObservationEnvelope> {
  const allCandidates: GenericDocumentFactCandidate[] = [];
  const add = (candidate: GenericDocumentFactCandidate | null) => {
    if (candidate) allCandidates.push(candidate);
  };

  for (const fact of extractOrganizationExtractFacts(pages)) {
    add(genericCandidate(
      fact.factKey,
      fact.value,
      fact.method,
      fact.confidence,
      fact.page,
    ));
  }

  add(genericCandidate(
    "partyName",
    energy.contractHolderName.value,
    "semantic_contract_holder_block",
    energy.contractHolderName.confidence,
    energy.contractHolderName.sourcePage,
    undefined,
    energy.contractHolderName.displayable
      ? null
      : energy.contractHolderName.rejectionReason,
  ));
  if (
    energy.contractHolderName.value &&
    /\b(?:b\.?\s*v\.?|n\.?\s*v\.?|stichting|vereniging|vve|co[oö]peratie|vof)\b/i
      .test(energy.contractHolderName.value)
  ) {
    add(genericCandidate(
      "organizationName",
      energy.contractHolderName.value,
      "semantic_contract_holder_block",
      energy.contractHolderName.confidence,
      energy.contractHolderName.sourcePage,
    ));
  }

  const energyAddress: GenericStructuredAddress = {
    street: energy.deliveryAddress.street,
    houseNumber: energy.deliveryAddress.houseNumber,
    houseNumberAddition: energy.deliveryAddress.houseNumberAddition,
    postalCode: energy.deliveryAddress.postalCode,
    city: energy.deliveryAddress.city,
    country: energy.deliveryAddress.country,
  };
  add(genericCandidate(
    "structuredAddress",
    energy.deliveryAddress.value || addressText(energyAddress),
    "semantic_delivery_address_block",
    energy.deliveryAddress.confidence,
    energy.deliveryAddress.sourcePage,
    energyAddress,
    energy.deliveryAddress.displayable
      ? null
      : energy.deliveryAddress.rejectionReason,
  ));
  add(genericCandidate(
    "energySupplier",
    energy.supplierName.value,
    "semantic_supplier_block",
    energy.supplierName.confidence,
    energy.supplierName.sourcePage,
    undefined,
    energy.supplierName.displayable
      ? null
      : energy.supplierName.rejectionReason,
  ));
  for (const candidate of eanCandidates) {
    add(genericCandidate(
      candidate.classification === "gas" ? "gasEan" : "electricityEan",
      candidate.normalizedEan,
      "ean_context",
      candidate.classification === "unclassified" ? "low" : "high",
      candidate.page,
      undefined,
      candidate.classification === "unclassified"
        ? "ean_energy_type_ambiguous"
        : null,
    ));
  }
  const connection = energy.electricityConnections[0] || null;
  add(genericCandidate(
    "contractStart",
    connection?.validFrom || null,
    "contract_period",
    connection?.confidence || "unavailable",
    connection?.sourcePage || null,
  ));
  add(genericCandidate(
    "contractEnd",
    connection?.validTo || null,
    "contract_period",
    connection?.confidence || "unavailable",
    connection?.sourcePage || null,
  ));

  const invoiceCustomer = cleanLine(observedFields.customer_name);
  const supplierSignature = genericSignature(energy.supplierName.value);
  const customerSignature = genericSignature(invoiceCustomer);
  const containsSupplierFragment = Boolean(
    supplierSignature && customerSignature.includes(supplierSignature),
  );
  add(genericCandidate(
    "partyName",
    invoiceCustomer || null,
    "invoice_customer_block",
    "medium",
    null,
    undefined,
    containsSupplierFragment
      ? "party_candidate_contains_supplier_fragment"
      : null,
  ));
  if (
    invoiceCustomer &&
    /\b(?:b\.?\s*v\.?|n\.?\s*v\.?|stichting|vereniging|vve|co[oö]peratie|vof)\b/i
      .test(invoiceCustomer)
  ) {
    add(genericCandidate(
      "organizationName",
      invoiceCustomer,
      "invoice_customer_block",
      "medium",
      null,
      undefined,
      containsSupplierFragment
        ? "organization_candidate_contains_supplier_fragment"
        : null,
    ));
  }
  const invoiceAddress: GenericStructuredAddress = {
    street: observedFields.street,
    houseNumber: observedFields.house_number,
    houseNumberAddition: observedFields.house_number_addition,
    postalCode: observedFields.postcode_line,
    city: observedFields.city_line,
    country: observedFields.country_line,
  };
  const invoiceAddressComplete = Boolean(
    invoiceAddress.street && invoiceAddress.houseNumber &&
      invoiceAddress.postalCode && invoiceAddress.city &&
      observedFields.address_block_ambiguous !== true,
  );
  add(genericCandidate(
    "structuredAddress",
    invoiceAddressComplete ? addressText(invoiceAddress) : null,
    "invoice_address_block",
    "medium",
    null,
    invoiceAddress,
    invoiceAddressComplete ? null : "invoice_address_not_reliable",
  ));

  const invoiceFields: Array<[
    GenericDocumentFactCandidate["factKey"],
    string | null,
    string,
  ]> = [
    [
      "installerOrSupplier",
      observedFields.supplier_installer_name,
      "invoice_supplier_field",
    ],
    ["chargerBrand", observedFields.brand, "invoice_labeled_field"],
    ["chargerModel", observedFields.model, "invoice_labeled_field"],
    ["midNumber", observedFields.mid_number, "invoice_labeled_field"],
    ["serialNumber", observedFields.serial_number, "invoice_labeled_field"],
    ["invoiceDate", observedFields.invoice_date, "explicit_invoice_date"],
    [
      "explicitInstallationDate",
      observedFields.installation_date,
      "explicit_installation_date",
    ],
  ];
  for (const [factKey, value, method] of invoiceFields) {
    add(genericCandidate(factKey, value, method, "medium", null));
  }
  if (observedFields.mid_candidate_raw && !observedFields.mid_number) {
    add(genericCandidate(
      "midNumber",
      observedFields.mid_candidate_raw,
      "invoice_labeled_field",
      "unavailable",
      null,
      undefined,
      "mid_candidate_rejected",
    ));
  }
  if (observedFields.serial_candidate_raw && !observedFields.serial_number) {
    add(genericCandidate(
      "serialNumber",
      observedFields.serial_candidate_raw,
      "invoice_labeled_field",
      "unavailable",
      null,
      undefined,
      "serial_candidate_rejected",
    ));
  }

  const factCandidates = allCandidates.filter((candidate) =>
    candidate.displayable
  );
  const rejectedCandidates = allCandidates.filter((candidate) =>
    !candidate.displayable
  );
  return {
    parserVersion: PARSER_VERSION,
    contentFingerprint: await contentFingerprint(pdfBytes),
    pageCount: pages.length,
    documentTypeCandidates: deriveDocumentTypeCandidates(factCandidates),
    factCandidates,
    extractionWarnings: [...new Set(limitations)],
    rejectedCandidates,
  };
}

async function bytesFromPdfInput(input: PdfInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());

  return new Uint8Array();
}

function parserError(
  code: InvoicePdfParserError["code"],
  message: string,
  limitations: string[],
): InvoicePdfParserError {
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

export function summarizeInvoicePdfParserResult(
  result: InvoicePdfParserAdapterResult,
): {
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
    .filter(([key, value]) =>
      key !== "address_block_ambiguous" && value !== null && value !== ""
    )
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
): Promise<InvoicePdfParserAdapterResult> {
  try {
    if (typeof DecompressionStream !== "function") {
      return parserError(
        "unsupported_runtime",
        "PDF parser runtime does not support decompression.",
        [
          "pdf_decompression_unavailable",
        ],
      );
    }

    const pdfBytes = await bytesFromPdfInput(input);

    if (pdfBytes.length === 0) {
      return parserError("invalid_input", "PDF input is empty.", [
        "pdf_input_empty",
      ]);
    }

    const extracted = await extractTextFromPdfBytes(pdfBytes);
    const extractedText = extracted.text;
    const limitations: string[] = [];

    if (!extractedText) limitations.push("pdf_text_extraction_empty");

    const observedFields = extractInvoiceObservedFieldsFromText(extractedText);
    const eanCandidates = extractEnergyEanCandidates(
      extracted.pages.length > 0 ? extracted.pages : extractedText,
    );
    const energyDocumentObservation = extractEnergyDocumentObservation(
      extracted.pages,
      eanCandidates,
    );
    limitations.push(...energyDocumentObservation.limitations);

    if (observedFields.address_block_ambiguous === true) {
      limitations.push("address_block_ambiguous");
    }
    if (observedFields.mid_candidate_raw && observedFields.mid_number == null) {
      limitations.push("mid_candidate_rejected");
    }
    if (
      observedFields.serial_candidate_raw &&
      observedFields.serial_number == null
    ) limitations.push("serial_candidate_rejected");

    const observationEnvelope = await buildObservationEnvelope(
      pdfBytes,
      extracted.pages,
      observedFields,
      eanCandidates,
      energyDocumentObservation,
      limitations,
    );

    const observedNonNullFields = Object.entries(observedFields)
      .filter(([key, value]) =>
        key !== "address_block_ambiguous" && value !== null && value !== ""
      )
      .length;

    return {
      ok: true,
      parser_kind: PARSER_KIND,
      parser_version: PARSER_VERSION,
      source_kind: SOURCE_KIND,
      observed_fields: observedFields,
      ean_candidates: eanCandidates,
      energy_document_observation: energyDocumentObservation,
      observation_envelope: observationEnvelope,
      confidence: {
        pdf_text_length: extractedText.length,
        observed_non_null_fields: observedNonNullFields,
      },
      limitations,
      summary: {
        mode: "unified_document_extract_app_adapter_v5",
        reason: "client_pdf_text_extract_completed",
        byte_length: pdfBytes.length,
        pdf_text_length: extractedText.length,
        observed_non_null_fields: observedNonNullFields,
      },
      field_sources: null,
      pages: null,
    };
  } catch {
    return parserError("parse_failed", "PDF parser failed safely.", [
      "pdf_parse_failed",
    ]);
  }
}
