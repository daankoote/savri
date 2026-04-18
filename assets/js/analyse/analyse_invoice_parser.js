// /assets/js/analyse/analyse_invoice_parser.js

// NON-module. Hangt onder window.ENVAL.invoice_parser
//
// Scope CURRENT:
// - text-based PDF invoice parsing in browser
// - conservative observed_fields output
// - geen browser-side image parsing
//
// Geen externe libs.
// Geen fake OCR.
// PDF-only lane.

(function () {
  window.ENVAL = window.ENVAL || {};

  function cleanLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeCompareValue(value) {
    return cleanLine(String(value ?? "")).toLowerCase();
  }

  function normalizeCompact(value) {
    return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  }

  function normalizePostcode(value) {
    return normalizeCompact(value);
  }

  function normalizeSerial(value) {
    return normalizeCompact(value);
  }

  function normalizeMid(value) {
    return normalizeCompact(value);
  }

  function splitLines(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((x) => cleanLine(x))
      .filter(Boolean);
  }

  function asLatin1String(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      return "";
    }

    // Belangrijk:
    // Python gebruikt data.decode("latin-1"), dat is een 1-op-1 byte -> codepoint mapping.
    // TextDecoder("latin1") in browsers volgt de WHATWG aliasing en is niet exact hetzelfde.
    // Voor PDF stream decoding willen we exact de Python-semantiek.
    const CHUNK = 0x8000;
    let out = "";

    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.subarray(i, i + CHUNK);
      out += String.fromCharCode(...chunk);
    }

    return out;
  }

  function extractPdfStreams(raw) {
    const text = String(raw || "");
    const out = [];

    let cursor = 0;

    while (cursor < text.length) {
      const dictStart = text.indexOf("<<", cursor);
      if (dictStart === -1) break;

      const dictEnd = text.indexOf(">>", dictStart + 2);
      if (dictEnd === -1) break;

      const dict = text.slice(dictStart + 2, dictEnd);

      const streamPos = text.indexOf("stream", dictEnd + 2);
      if (streamPos === -1) {
        cursor = dictEnd + 2;
        continue;
      }

      // Alleen accepteren als "stream" direct na de dict komt, op PDF-manier.
      const between = text.slice(dictEnd + 2, streamPos);
      if (!/^\s*$/.test(between)) {
        cursor = dictEnd + 2;
        continue;
      }

      let bodyStart = streamPos + "stream".length;

      // PDF streams hebben normaal CRLF of LF direct na "stream".
      if (text.slice(bodyStart, bodyStart + 2) === "\r\n") {
        bodyStart += 2;
      } else if (text.slice(bodyStart, bodyStart + 1) === "\n") {
        bodyStart += 1;
      } else if (text.slice(bodyStart, bodyStart + 1) === "\r") {
        bodyStart += 1;
      }

      const endstreamPos = text.indexOf("endstream", bodyStart);
      if (endstreamPos === -1) {
        cursor = dictEnd + 2;
        continue;
      }

      let bodyEnd = endstreamPos;

      // Trim alleen de directe line break vóór endstream weg.
      if (bodyEnd >= 2 && text.slice(bodyEnd - 2, bodyEnd) === "\r\n") {
        bodyEnd -= 2;
      } else if (bodyEnd >= 1 && text.slice(bodyEnd - 1, bodyEnd) === "\n") {
        bodyEnd -= 1;
      } else if (bodyEnd >= 1 && text.slice(bodyEnd - 1, bodyEnd) === "\r") {
        bodyEnd -= 1;
      }

      out.push({
        dict: dict || "",
        body: text.slice(bodyStart, bodyEnd) || "",
      });

      cursor = endstreamPos + "endstream".length;
    }

    return out;
  }

  function decodeAscii85Core(inputText) {
    const s = String(inputText || "").replace(/\s+/g, "");
    if (!s) return new Uint8Array();

    const out = [];
    let group = [];

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (ch === "z") {
        if (group.length !== 0) {
          return new Uint8Array();
        }
        out.push(0, 0, 0, 0);
        continue;
      }

      const code = ch.charCodeAt(0);
      if (code < 33 || code > 117) {
        return new Uint8Array();
      }

      group.push(code - 33);

      if (group.length === 5) {
        let value = 0;
        for (let j = 0; j < 5; j++) {
          value = value * 85 + group[j];
        }

        out.push(
          (value >>> 24) & 255,
          (value >>> 16) & 255,
          (value >>> 8) & 255,
          value & 255
        );
        group = [];
      }
    }

    if (group.length > 0) {
      const originalLen = group.length;
      while (group.length < 5) group.push(84);

      let value = 0;
      for (let j = 0; j < 5; j++) {
        value = value * 85 + group[j];
      }

      const bytes = [
        (value >>> 24) & 255,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
      ];

      for (let j = 0; j < originalLen - 1; j++) {
        out.push(bytes[j]);
      }
    }

    return new Uint8Array(out);
  }

  function ascii85Decode(inputRaw) {
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
      if (decoded.length > 0) {
        return decoded;
      }
    }

    return new Uint8Array();
  }

  async function flateDecode(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      return new Uint8Array();
    }

    const pako = window.pako || null;

    // Primair: deterministische zlib/raw inflate via pako.
    if (pako) {
      try {
        const out = pako.inflate(bytes);
        if (out && out.length > 0) {
          return out instanceof Uint8Array ? out : new Uint8Array(out);
        }
      } catch (_) {}

      try {
        const out = pako.inflate(bytes, { raw: true });
        if (out && out.length > 0) {
          return out instanceof Uint8Array ? out : new Uint8Array(out);
        }
      } catch (_) {}
    }

    // Fallback: browser native, alleen als pako niet geladen is of niets gaf.
    if (typeof DecompressionStream !== "function") {
      return new Uint8Array();
    }

    async function tryFormat(format) {
      try {
        const ds = new DecompressionStream(format);
        const stream = new Blob([bytes]).stream().pipeThrough(ds);
        const buf = await new Response(stream).arrayBuffer();
        const out = new Uint8Array(buf);
        return out.length > 0 ? out : null;
      } catch (_) {
        return null;
      }
    }

    return (
      await tryFormat("deflate") ||
      await tryFormat("deflate-raw") ||
      new Uint8Array()
    );
  }

  function extractLiteralStrings(pdfContent) {
    const out = [];
    let i = 0;

    while (i < pdfContent.length) {
      if (pdfContent[i] !== "(") {
        i += 1;
        continue;
      }

      i += 1;
      const buf = [];
      let depth = 1;

      while (i < pdfContent.length && depth > 0) {
        const ch = pdfContent[i];

        if (ch === "\\") {
          const nxt = i + 1 < pdfContent.length ? pdfContent[i + 1] : "";

          if (nxt === "n") { buf.push("\n"); i += 2; continue; }
          if (nxt === "r") { buf.push("\r"); i += 2; continue; }
          if (nxt === "t") { buf.push("\t"); i += 2; continue; }
          if (nxt === "b") { buf.push("\b"); i += 2; continue; }
          if (nxt === "f") { buf.push("\f"); i += 2; continue; }
          if (nxt === "(" || nxt === ")" || nxt === "\\") { buf.push(nxt); i += 2; continue; }

          const octalMatch = pdfContent.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
          if (octalMatch) {
            buf.push(String.fromCharCode(parseInt(octalMatch[0], 8)));
            i += 1 + octalMatch[0].length;
            continue;
          }

          buf.push(nxt);
          i += 2;
          continue;
        }

        if (ch === "(") {
          depth += 1;
          buf.push(ch);
          i += 1;
          continue;
        }

        if (ch === ")") {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
          buf.push(ch);
          i += 1;
          continue;
        }

        buf.push(ch);
        i += 1;
      }

      const cleaned = cleanLine(buf.join(""));
      if (cleaned) out.push(cleaned);
    }

    return out;
  }

  function normalizeExtractedPdfText(inputText) {
    return String(inputText || "")
      .replace(/\r/g, "\n")
      .replace(/\x0c/g, "\n")
      .replace(/\u0000/g, " ")
      .replace(/\u00a0/g, " ");
  }

  async function extractTextFromPdfBytes(pdfBytes) {
    const raw = asLatin1String(pdfBytes);
    const streams = extractPdfStreams(raw);
    const textParts = [];

    const debugStreams = [];

    for (const stream of streams) {
      const dictText = String(stream.dict || "");
      const body = String(stream.body || "");

      const hasAscii85 = dictText.includes("/ASCII85Decode");
      const hasFlate = dictText.includes("/FlateDecode");

      if (!(hasAscii85 && hasFlate)) {
        debugStreams.push({
          hasAscii85,
          hasFlate,
          body_length: body.length,
          ascii85_length: 0,
          inflated_length: 0,
          literal_count: 0,
          skipped: "missing_required_filters",
        });
        continue;
      }

      const ascii85 = ascii85Decode(body);
      if (!ascii85 || ascii85.length === 0) {
        debugStreams.push({
          hasAscii85,
          hasFlate,
          body_length: body.length,
          ascii85_length: 0,
          inflated_length: 0,
          literal_count: 0,
          skipped: "ascii85_decode_empty",
        });
        continue;
      }

      const inflated = await flateDecode(ascii85);
      if (!inflated || inflated.length === 0) {
        debugStreams.push({
          hasAscii85,
          hasFlate,
          body_length: body.length,
          ascii85_length: ascii85.length,
          inflated_length: 0,
          literal_count: 0,
          skipped: "flate_decode_empty",
        });
        continue;
      }

      const content = asLatin1String(inflated);
      const strings = extractLiteralStrings(content);

      debugStreams.push({
        hasAscii85,
        hasFlate,
        body_length: body.length,
        ascii85_length: ascii85.length,
        inflated_length: inflated.length,
        literal_count: strings.length,
        skipped: strings.length > 0 ? null : "no_literal_strings",
      });

      if (strings.length > 0) {
        textParts.push(strings.join("\n"));
      }
    }

    const finalText = normalizeExtractedPdfText(textParts.join("\n")).trim();
    return finalText;
  }

  function splitDutchStreetLine(inputText) {
    const s = cleanLine(inputText);
    if (!s) {
      return { house_number: null };
    }

    const match = s.match(/^(.*?)[\s]+(\d+)(?:[-\s]*([A-Za-z0-9]+))?$/);
    if (!match) {
      return { house_number: null };
    }

    return {
      house_number: match[2] || null,
    };
  }

  function splitDutchCityLine(inputText) {
    const s = cleanLine(inputText);
    if (!s) {
      return { postcode: null, city: null };
    }

    const match = s.match(/(\d{4}\s?[A-Za-z]{2})[\s,]+(.+)$/);
    if (!match) {
      return { postcode: null, city: null };
    }

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

  function isLikelyStreetLine(inputText) {
    const s = cleanLine(inputText);
    if (!s || s.length < 6 || s.length > 120) return false;
    if (!/\d/.test(s)) return false;

    const lowered = s.toLowerCase();
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
    if (banned.some((x) => lowered.includes(x))) return false;

    return !!splitDutchStreetLine(s).house_number;
  }

  function isLikelyCityLine(inputText) {
    const split = splitDutchCityLine(inputText);
    return !!(split.postcode && split.city);
  }

  function extractLastAddressLineCandidate(inputText) {
    const s = cleanLine(inputText);
    if (!s) return null;

    const pattern = /([A-Za-zÀ-ÿ0-9'./\- ]*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'./\- ]*?)\s+(\d+[A-Za-z0-9\-]*)/g;
    const matches = [...s.matchAll(pattern)];
    if (!matches.length) return null;

    const last = matches[matches.length - 1];
    return cleanLine(`${last[1]} ${last[2]}`) || null;
  }

  function extractLastCityLineCandidate(inputText) {
    const s = cleanLine(inputText);
    if (!s) return null;

    const pattern = /(\d{4}\s?[A-Za-z]{2})[\s,]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-']*)/g;
    const matches = [...s.matchAll(pattern)];
    if (!matches.length) return null;

    const last = matches[matches.length - 1];
    return cleanLine(`${last[1]} ${last[2]}`) || null;
  }

  function looksLikeCountryLine(inputText) {
    const s = cleanLine(inputText).toLowerCase();
    return [
      "netherlands",
      "nederland",
      "the netherlands",
      "belgium",
      "belgië",
      "belgie",
      "germany",
      "deutschland",
    ].includes(s);
  }

  function looksLikeGenericLabelLine(inputText) {
    const s = cleanLine(inputText || "").toLowerCase().replace(/:$/, "");
    if (!s) return false;

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
    ].includes(s);
  }

  function looksLikePersonNameCandidate(inputText) {
    const s = cleanLine(inputText || "");
    if (!s) return false;
    if (looksLikeGenericLabelLine(s)) return false;
    if (/\d/.test(s)) return false;

    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return false;

    const companyMarkers = new Set(["b.v.", "bv", "systems", "services", "chargepoint"]);
    const lowered = new Set(words.map((w) => w.toLowerCase()));
    for (const x of companyMarkers) {
      if (lowered.has(x)) return false;
    }

    const capitalizedCount = words.filter((w) => /^[A-ZÀ-Ý]/.test(w)).length;
    return capitalizedCount >= 2;
  }

  function normalizePersonName(value) {
    return cleanLine(String(value || "").toLowerCase())
      .replace(/[^a-zà-ÿ\s\-']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function namesMatchLoose(a, b) {
    const ta = normalizePersonName(a).split(" ").filter((x) => x.length >= 2);
    const tb = normalizePersonName(b).split(" ").filter((x) => x.length >= 2);
    if (ta.length < 2 || tb.length < 2) return false;

    const setA = new Set(ta);
    const overlap = tb.filter((x) => setA.has(x));
    return overlap.length >= 2;
  }

  function lineContainsExpectedName(line, expectedCustomerName) {
    if (!line || !expectedCustomerName) return false;

    const normLine = normalizePersonName(line);
    const normExpected = normalizePersonName(expectedCustomerName);
    if (!normLine || !normExpected) return false;

    if (normLine.includes(normExpected)) return true;
    return namesMatchLoose(line, expectedCustomerName);
  }

  function extractCustomerName(text, expectedCustomerName) {
    const lines = splitLines(text);

    if (expectedCustomerName) {
      for (const line of lines) {
        if (lineContainsExpectedName(line, expectedCustomerName)) {
          return expectedCustomerName;
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
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

  function pickBestAddressBlock(text, expectedCustomerName) {
    const lines = splitLines(text);
    const candidates = [];

    for (let i = 0; i < lines.length; i++) {
      let streetCandidate = null;

      if (isLikelyStreetLine(lines[i])) {
        streetCandidate = lines[i];
      } else {
        const mixedStreet = extractLastAddressLineCandidate(lines[i]);
        if (mixedStreet && isLikelyStreetLine(mixedStreet)) {
          streetCandidate = mixedStreet;
        }
      }

      if (!streetCandidate) continue;

      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        let cityCandidate = null;

        if (isLikelyCityLine(lines[j])) {
          cityCandidate = lines[j];
        } else {
          const mixedCity = extractLastCityLineCandidate(lines[j]);
          if (mixedCity && isLikelyCityLine(mixedCity)) {
            cityCandidate = mixedCity;
          }
        }

        if (!cityCandidate) continue;

        const prev1 = lines[i - 1] || null;
        const prev2 = lines[i - 2] || null;
        const prev3 = lines[i - 3] || null;
        const next1 = lines[j + 1] || null;
        const next2 = lines[j + 2] || null;

        const contextBefore = [prev3, prev2, prev1].filter(Boolean);
        const contextAfter = [next1, next2].filter(Boolean);
        const contextWindow = [...contextBefore, streetCandidate, cityCandidate, ...contextAfter];

        let score = 5;
        let matchedNameLine = null;
        let nearbyNameLine = null;

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
    if (second && Math.abs(best.score - second.score) <= 2) {
      ambiguous = true;
    }

    if (ambiguous && expectedCustomerName) {
      const bestMatches = !!best.matched_expected_customer_name;
      const secondMatches = !!second?.matched_expected_customer_name;
      if (bestMatches && !secondMatches) {
        ambiguous = false;
      }
    }

    return {
      address_line: best.address_line,
      city_line: best.city_line,
      name_line: best.name_line || null,
      address_block_ambiguous: ambiguous,
    };
  }

  function matchLabeledValue(text, labels) {
    for (const label of labels) {
      const regex = new RegExp(`(?:^|\\n)\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:]?\\s*(.+)`, "i");
      const match = text.match(regex);
      if (match && match[1]) {
        return cleanLine(match[1]);
      }
    }
    return null;
  }

  function extractNearbyValue(lines, labels, validator) {
    const labelPatterns = labels.map((label) => new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));

    function isLabelLine(line) {
      const s = cleanLine(line);
      if (!s) return false;
      return labelPatterns.some((p) => p.test(s));
    }

    function extractInline(line) {
      const s = cleanLine(line);
      for (const label of labels) {
        const re = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*[:\\-]?\\s*(.+)$`, "i");
        const m = s.match(re);
        if (m) {
          const candidate = cleanLine(m[1]);
          if (!candidate) continue;
          if (looksLikeGenericLabelLine(candidate)) continue;
          if (validator(candidate)) return candidate;
        }
      }
      return null;
    }

    for (let idx = 0; idx < lines.length; idx++) {
      const s = cleanLine(lines[idx]);
      if (!s) continue;

      const inline = extractInline(s);
      if (inline) return inline;

      if (!isLabelLine(s)) continue;

      for (let lookAhead = 1; lookAhead < 5; lookAhead++) {
        const j = idx + lookAhead;
        if (j >= lines.length) break;

        const candidate = cleanLine(lines[j]);
        if (!candidate) continue;
        if (isLabelLine(candidate)) continue;
        if (looksLikeGenericLabelLine(candidate)) continue;
        if (validator(candidate)) return candidate;
      }
    }

    return null;
  }

  function cleanupOcrIdValue(inputText) {
    let s = cleanLine(inputText);
    if (!s) return "";

    const replacements = {
      "~": " ",
      "—": "-",
      "–": "-",
      ":": " ",
      ";": " ",
      ",": " ",
    };
    for (const [src, dst] of Object.entries(replacements)) {
      s = s.split(src).join(dst);
    }

    s = cleanLine(s);
    const compactRaw = s.replace(/[^A-Za-z0-9]/g, "");

    if (/^mo\d{6,}$/i.test(compactRaw)) {
      const compact = compactRaw.toUpperCase();
      s = "M0" + compact.slice(2);
    }

    s = s.replace(/[^A-Za-z0-9\-\s]/g, "");
    s = cleanLine(s);
    s = s.replace(/^[^A-Za-z0-9]+/, "");
    s = s.replace(/[^A-Za-z0-9]+$/, "");
    s = cleanLine(s);

    return s;
  }

  function containsUntrustedIdNoise(inputText) {
    return /[|!>\]\}\)]/.test(String(inputText || ""));
  }

  function normalizeMidCandidateValue(inputText) {
    const cleaned = cleanupOcrIdValue(inputText);
    const compact = normalizeMid(cleaned);
    if (!compact) return "";

    if (/^\d{6,}$/.test(compact)) return compact;
    if (/^M\d{6,}$/.test(compact)) return compact;
    if (compact.startsWith("MID") && compact.length > 3) return compact.slice(3);

    return compact;
  }

  function normalizeSerialCandidateValue(inputText) {
    const cleaned = cleanupOcrIdValue(inputText);
    const compact = normalizeSerial(cleaned);
    if (!compact) return "";
    if (compact.startsWith("MID")) return "";
    return compact;
  }

  function assessMidCandidate(inputText) {
    const raw = cleanLine(inputText || "");
    if (!raw) {
      return { raw: null, normalized: null, approved: null, reason: null };
    }

    const cleaned = cleanupOcrIdValue(raw);
    const normalized = normalizeMidCandidateValue(cleaned);

    if (containsUntrustedIdNoise(raw)) {
      return { raw, normalized: normalized || null, approved: null, reason: "mid_candidate_rejected_noisy" };
    }

    if (/^\d{6,}$/.test(normalized) || /^M\d{6,}$/.test(normalized) || /^MID\d{6,}$/.test(normalized)) {
      return { raw, normalized, approved: normalized, reason: null };
    }

    return { raw, normalized: normalized || null, approved: null, reason: "mid_candidate_rejected_invalid" };
  }

  function assessSerialCandidate(inputText, rejectMid) {
    const raw = cleanLine(inputText || "");
    if (!raw) {
      return { raw: null, normalized: null, approved: null, reason: null };
    }

    const cleaned = cleanupOcrIdValue(raw);
    const normalized = normalizeSerialCandidateValue(cleaned);
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

  function looksLikeMidValue(inputText) {
    const s = cleanLine(inputText);
    if (!s || looksLikeGenericLabelLine(s)) return false;
    const compact = normalizeMidCandidateValue(s);
    if (!compact) return false;
    return /^\d{6,}$/.test(compact) || /^M\d{6,}$/.test(compact) || /^MID\d{6,}$/.test(compact);
  }

  function looksLikeSerialValue(inputText) {
    const s = cleanLine(inputText);
    if (!s || looksLikeGenericLabelLine(s)) return false;
    const compact = normalizeSerialCandidateValue(s);
    if (!compact) return false;
    if (compact.length < 6 || compact.length > 40) return false;
    if (!/\d/.test(compact)) return false;
    return true;
  }

  const MID_LABELS = [
    "MID number", "MID Number", "MID nummer", "MID-nummer", "MID nr", "MID nr.",
    "MID no", "MID no.", "MID"
  ];
  const SERIAL_LABELS = [
    "Charger serial number", "Serial number", "Serial Number", "Serial no", "Serial no.",
    "Serial nr", "Serial nr.", "Serienummer", "S/N", "SN", "Serial"
  ];
  const BRAND_LABELS = ["Brand", "Merk"];
  const MODEL_LABELS = ["Model", "Type"];

  function findMidCandidate(lines) {
    const candidate = extractNearbyValue(lines, MID_LABELS, looksLikeMidValue);
    if (candidate) return assessMidCandidate(candidate);

    const joined = lines.join("\n");
    const match = joined.match(/\bMID(?:\s*[-]?\s*(?:nummer|nr\.?|no\.?|number))?\b\s*[:#-]?\s*([^\n]{3,60})/i);
    if (match) return assessMidCandidate(match[1]);

    return { raw: null, normalized: null, approved: null, reason: null };
  }

  function findSerialCandidate(lines, midCandidate) {
    const candidate = extractNearbyValue(lines, SERIAL_LABELS, looksLikeSerialValue);
    if (candidate) return assessSerialCandidate(candidate, midCandidate);

    const joined = lines.join("\n");
    const match = joined.match(/\b(?:Serial(?:\s+(?:number|no\.?|nr\.?))?|Serienummer|S\/N|SN)\b\s*[:#-]?\s*([^\n]{3,60})/i);
    if (match) return assessSerialCandidate(match[1], midCandidate);

    return { raw: null, normalized: null, approved: null, reason: null };
  }

  function extractInvoiceObservedFieldsFromText(text, expectedCustomerName) {
    const rawText = String(text || "").replace(/\r/g, "");
    const lines = splitLines(rawText);

    const inferred = pickBestAddressBlock(rawText, expectedCustomerName);

    const addressLine = inferred.address_line || null;
    const cityLineRaw = inferred.city_line || null;
    const cityParts = splitDutchCityLine(cityLineRaw || "");
    const houseParts = splitDutchStreetLine(addressLine || "");

    const brand = matchLabeledValue(rawText, BRAND_LABELS)
      || extractNearbyValue(lines, BRAND_LABELS, (v) => /[A-Za-z]/.test(v))
      || null;

    const model = matchLabeledValue(rawText, MODEL_LABELS)
      || extractNearbyValue(lines, MODEL_LABELS, (v) => /[A-Za-z0-9]/.test(v))
      || null;

    const customerName = extractCustomerName(rawText, expectedCustomerName);

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
      brand: brand || null,
      model: model || null,
    };
  }

  async function parseInvoicePdfFile(file, opts) {
    const expectedCustomerName = cleanLine(opts?.expected_customer_name || "") || null;
    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    const extractedText = await extractTextFromPdfBytes(pdfBytes);

    const limitations = [];
    if (!extractedText) {
      limitations.push("pdf_text_extraction_empty");
    }

    const observedFields = extractInvoiceObservedFieldsFromText(
      extractedText,
      expectedCustomerName
    );

    if (observedFields.address_block_ambiguous === true) {
      limitations.push("address_block_ambiguous");
    }
    if (observedFields.mid_candidate_raw && observedFields.mid_number == null) {
      limitations.push("mid_candidate_rejected");
    }
    if (observedFields.serial_candidate_raw && observedFields.serial_number == null) {
      limitations.push("serial_candidate_rejected");
    }

    const observedNonNullFields = Object.entries(observedFields)
      .filter(([k, v]) => k !== "address_block_ambiguous" && v !== null && v !== "")
      .length;

    return {
      parser_kind: "invoice_pdf_parser",
      parser_version: "2026-04-02-client-v1",
      source_kind: "pdf",
      observed_fields: observedFields,
      confidence: {
        pdf_text_length: extractedText.length,
        observed_non_null_fields: observedNonNullFields,
        expected_customer_name: expectedCustomerName,
      },
      limitations,
      summary: {
        mode: "invoice_pdf_extract_client_v1",
        reason: "client_pdf_text_extract_completed",
        byte_length: pdfBytes.length,
        pdf_text_length: extractedText.length,
        observed_non_null_fields: observedNonNullFields,
        extracted_text_preview: extractedText ? extractedText.slice(0, 400) : "",
      },
      field_sources: null,
      pages: null,
      debug: {
        extracted_text: extractedText,
      },
    };
  }

  window.ENVAL.invoice_parser = {
    parseInvoicePdfFile,
  };
})();