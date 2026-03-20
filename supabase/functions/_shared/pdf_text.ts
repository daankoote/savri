// supabase/functions/_shared/pdf_text.ts

// supabase/functions/_shared/pdf_text.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";


function bytesToLatin1String(bytes: Uint8Array): string {
  let out = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    out += String.fromCharCode(...chunk);
  }

  return out;
}

type SB = ReturnType<typeof createClient>;

function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function ascii85Decode(inputRaw: string): Uint8Array {
  let input = String(inputRaw || "")
    .replace(/\s+/g, "")
    .replace(/^<~/, "")
    .replace(/~>$/, "");

  const out: number[] = [];
  let group: number[] = [];

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === "z" && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code < 33 || code > 117) continue;

    group.push(code - 33);

    if (group.length === 5) {
      let value = 0;
      for (const n of group) value = value * 85 + n;

      out.push((value >>> 24) & 0xff);
      out.push((value >>> 16) & 0xff);
      out.push((value >>> 8) & 0xff);
      out.push(value & 0xff);
      group = [];
    }
  }

  if (group.length > 0) {
    const padding = 5 - group.length;
    for (let i = 0; i < padding; i++) group.push(84);

    let value = 0;
    for (const n of group) value = value * 85 + n;

    const tmp = [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];

    for (let i = 0; i < 4 - padding; i++) out.push(tmp[i]);
  }

  return new Uint8Array(out);
}

async function flateDecode(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

function extractLiteralStrings(pdfContent: string): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < pdfContent.length) {
    if (pdfContent[i] !== "(") {
      i++;
      continue;
    }

    i++; // skip "("
    let buf = "";
    let depth = 1;

    while (i < pdfContent.length && depth > 0) {
      const ch = pdfContent[i];

      if (ch === "\\") {
        const next = pdfContent[i + 1] ?? "";
        if (next === "n") {
          buf += "\n";
          i += 2;
          continue;
        }
        if (next === "r") {
          buf += "\r";
          i += 2;
          continue;
        }
        if (next === "t") {
          buf += "\t";
          i += 2;
          continue;
        }
        if (next === "b") {
          buf += "\b";
          i += 2;
          continue;
        }
        if (next === "f") {
          buf += "\f";
          i += 2;
          continue;
        }
        if (next === "(" || next === ")" || next === "\\") {
          buf += next;
          i += 2;
          continue;
        }

        // octal escape: \ddd
        const oct = pdfContent.slice(i + 1, i + 4);
        if (/^[0-7]{1,3}$/.test(oct)) {
          buf += String.fromCharCode(parseInt(oct, 8));
          i += 1 + oct.length;
          continue;
        }

        buf += next;
        i += 2;
        continue;
      }

      if (ch === "(") {
        depth++;
        buf += ch;
        i++;
        continue;
      }

      if (ch === ")") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
        buf += ch;
        i++;
        continue;
      }

      buf += ch;
      i++;
    }

    const cleaned = buf.replace(/\s+/g, " ").trim();
    if (cleaned) out.push(cleaned);
  }

  return out;
}

function extractPdfStreams(raw: string): Array<{ dict: string; body: string }> {
  const out: Array<{ dict: string; body: string }> = [];

  const re = /<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/gs;
  let m: RegExpExecArray | null;

  while ((m = re.exec(raw)) !== null) {
    out.push({
      dict: m[1] ?? "",
      body: m[2] ?? "",
    });
  }

  return out;
}

export async function debugPdfStreams(pdfBytes: Uint8Array): Promise<Array<{
  index: number;
  dict: string;
  decoded_preview: string;
  literal_strings: string[];
}>> {
  const raw = bytesToLatin1(pdfBytes);
  const streams = extractPdfStreams(raw);

  const out: Array<{
    index: number;
    dict: string;
    decoded_preview: string;
    literal_strings: string[];
  }> = [];

  for (let i = 0; i < streams.length; i++) {
    const stream = streams[i];
    const dict = stream.dict;

    const hasAscii85 = /\/ASCII85Decode\b/.test(dict);
    const hasFlate = /\/FlateDecode\b/.test(dict);

    if (!hasAscii85 || !hasFlate) continue;

    try {
      const ascii85 = ascii85Decode(stream.body);
      const inflated = await flateDecode(ascii85);
      const content = bytesToLatin1(inflated);
      const literalStrings = extractLiteralStrings(content);

      out.push({
        index: i,
        dict,
        decoded_preview: content.slice(0, 1500),
        literal_strings: literalStrings.slice(0, 20),
      });
    } catch (e) {
      out.push({
        index: i,
        dict,
        decoded_preview: `DECODE_ERROR: ${String((e as Error)?.message || e)}`,
        literal_strings: [],
      });
    }
  }

  return out;
}

function normalizeExtractedPdfText(input: string): string {
  return String(input || "")
    .replace(/\r/g, "\n")
    .replace(/[^\x09\x0A\x0D\x20-\x7E€]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function downloadStorageBytes(
  SB: SB,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await SB.storage.from(bucket).download(path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function extractTextFromPdfBytes(pdfBytes: Uint8Array): Promise<string> {
  const raw = bytesToLatin1(pdfBytes);
  const streams = extractPdfStreams(raw);

  const textParts: string[] = [];

  for (const stream of streams) {
    const dict = stream.dict;

    const hasAscii85 = /\/ASCII85Decode\b/.test(dict);
    const hasFlate = /\/FlateDecode\b/.test(dict);

    if (!hasAscii85 || !hasFlate) continue;

    try {
      const ascii85 = ascii85Decode(stream.body);
      const inflated = await flateDecode(ascii85);
      const content = bytesToLatin1(inflated);

      const strings = extractLiteralStrings(content);
      if (strings.length > 0) {
        textParts.push(strings.join("\n"));
      }
    } catch {
      // fail soft: skip bad stream
    }
  }

  return normalizeExtractedPdfText(textParts.join("\n"));
}