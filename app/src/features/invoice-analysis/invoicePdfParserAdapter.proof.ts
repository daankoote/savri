import {
  parseInvoicePdfInput,
  summarizeInvoicePdfParserResult,
  type InvoicePdfParserAdapterResult,
} from "./invoicePdfParserAdapter";

export type InvoicePdfParserAdapterProofResult = {
  ok: true;
  parserKind: "invoice_pdf_parser";
  observedNonNullFieldNames: string[];
  hasMid: boolean;
  hasSerial: boolean;
  limitationsCount: number;
  elapsedMs: number;
  rawTextOmitted: true;
};

type ParserResultWithUnsafeDebug = InvoicePdfParserAdapterResult & {
  debug?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export async function runInvoicePdfParserAdapterProof(
  pdfBytes: Uint8Array,
): Promise<InvoicePdfParserAdapterProofResult> {
  const startedAt = nowMs();
  const result = await parseInvoicePdfInput(pdfBytes);
  const elapsedMs = Math.round(nowMs() - startedAt);
  const summary = summarizeInvoicePdfParserResult(result);
  const unsafeResult = result as ParserResultWithUnsafeDebug;

  assert(result.parser_kind === "invoice_pdf_parser", "parser kind must stay stable");
  assert(summary.parser_kind === "invoice_pdf_parser", "summary parser kind must stay stable");
  assert(unsafeResult.debug === undefined, "adapter must not expose raw extracted PDF text");

  if (result.ok) {
    assert(result.observed_fields.mid_number !== undefined, "mid_number key must exist");
    assert(result.observed_fields.serial_number !== undefined, "serial_number key must exist");
    assert(result.observed_fields.customer_name !== undefined, "customer_name key must exist");
    assert(result.observed_fields.address_line !== undefined, "address_line key must exist");
    assert(result.observed_fields.postcode_line !== undefined, "postcode_line key must exist");
    assert(result.observed_fields.city_line !== undefined, "city_line key must exist");
    assert(result.observed_fields.country_line !== undefined, "country_line key must exist");
    assert(result.observed_fields.brand !== undefined, "brand key must exist");
    assert(result.observed_fields.model !== undefined, "model key must exist");
  }

  return {
    ok: true,
    parserKind: "invoice_pdf_parser",
    observedNonNullFieldNames: summary.observed_non_null_field_names,
    hasMid: summary.has_mid,
    hasSerial: summary.has_serial,
    limitationsCount: summary.limitations_count,
    elapsedMs,
    rawTextOmitted: true,
  };
}
