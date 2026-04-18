// supabase/functions/_shared/image_text.ts

export type ImageTextStage = "light";

export type ImagePreflightInfo = {
  mime_type: string | null;
  byte_length: number;
  image_kind: "jpeg" | "png" | "unknown";
  width: number | null;
  height: number | null;
};

export type ImageTextExtractionResult = {
  ok: true;
  stage: ImageTextStage;
  extraction_method: "image_text_light_v1";
  extracted_text: string;
  limitations: string[];
  summary: Record<string, unknown>;
  debug: Record<string, unknown>;
};

function cleanMime(input: unknown): string | null {
  const s = String(input || "").trim().toLowerCase();
  return s || null;
}

function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 1 >= bytes.length) return null;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 3 >= bytes.length) return null;
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function detectPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function detectJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function getPngDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  if (!detectPng(bytes)) return { width: null, height: null };
  if (bytes.length < 24) return { width: null, height: null };

  const ihdr = String.fromCharCode(
    bytes[12] || 0,
    bytes[13] || 0,
    bytes[14] || 0,
    bytes[15] || 0,
  );

  if (ihdr !== "IHDR") return { width: null, height: null };

  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);

  return {
    width: width ?? null,
    height: height ?? null,
  };
}

function getJpegDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  if (!detectJpeg(bytes)) return { width: null, height: null };

  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    const segmentLength = readUint16BE(bytes, offset);
    if (!segmentLength || segmentLength < 2) return { width: null, height: null };

    const isSOF =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;

    if (isSOF) {
      const height = readUint16BE(bytes, offset + 3);
      const width = readUint16BE(bytes, offset + 5);

      return {
        width: width ?? null,
        height: height ?? null,
      };
    }

    offset += segmentLength;
  }

  return { width: null, height: null };
}

export function extractImagePreflightInfo(
  imageBytes: Uint8Array,
  contentType?: string | null,
): ImagePreflightInfo {
  const mime = cleanMime(contentType);
  const isPng = detectPng(imageBytes);
  const isJpeg = detectJpeg(imageBytes);

  if (isPng) {
    const dims = getPngDimensions(imageBytes);
    return {
      mime_type: mime,
      byte_length: imageBytes.length,
      image_kind: "png",
      width: dims.width,
      height: dims.height,
    };
  }

  if (isJpeg) {
    const dims = getJpegDimensions(imageBytes);
    return {
      mime_type: mime,
      byte_length: imageBytes.length,
      image_kind: "jpeg",
      width: dims.width,
      height: dims.height,
    };
  }

  return {
    mime_type: mime,
    byte_length: imageBytes.length,
    image_kind: "unknown",
    width: null,
    height: null,
  };
}

export function estimateImageOcrConfidence(
  _extractedText: string,
  _observed: Record<string, unknown> | null,
) {
  return {
    ocr_text_quality: "low" as const,
    field_quality: "low" as const,
    has_address: false,
    has_brand: false,
    has_model: false,
    has_serial: false,
    has_mid: false,
  };
}

export async function extractTextFromImageBytes(
  imageBytes: Uint8Array,
  opts?: {
    content_type?: string | null;
    filename?: string | null;
    doc_type?: string | null;
  },
): Promise<ImageTextExtractionResult> {
  const preflight = extractImagePreflightInfo(imageBytes, opts?.content_type || null);

  if (preflight.image_kind === "unknown") {
    return {
      ok: true,
      stage: "light",
      extraction_method: "image_text_light_v1",
      extracted_text: "",
      limitations: [
        "image_format_not_recognized",
        "image_text_extraction_not_performed",
      ],
      summary: {
        mode: "invoice_image_extract_preflight_only",
        reason: "image_format_not_recognized",
        extraction_source: "image_preflight_only",
        filename: opts?.filename || null,
        doc_type: opts?.doc_type || null,
        content_type: preflight.mime_type,
        image_kind: preflight.image_kind,
        width: preflight.width,
        height: preflight.height,
        byte_length: preflight.byte_length,
      },
      debug: { preflight },
    };
  }

  return {
    ok: true,
    stage: "light",
    extraction_method: "image_text_light_v1",
    extracted_text: "",
    limitations: [
      "image_text_local_ocr_not_available_in_edge_runtime",
      "image_text_extraction_not_performed",
    ],
    summary: {
      mode: "invoice_image_extract_preflight_only",
      reason: "local_image_ocr_not_available_in_edge_runtime",
      extraction_source: "image_preflight_only",
      filename: opts?.filename || null,
      doc_type: opts?.doc_type || null,
      content_type: preflight.mime_type,
      image_kind: preflight.image_kind,
      width: preflight.width,
      height: preflight.height,
      byte_length: preflight.byte_length,
    },
    debug: {
      preflight,
      runtime: "supabase_edge",
      ocr_runtime_available: false,
    },
  };
}