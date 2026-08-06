import {
  type InvoicePdfParserAdapterResult,
  parseInvoicePdfInput,
  summarizeInvoicePdfParserResult,
} from "./invoicePdfParserAdapter";

export type InvoicePdfParserAdapterProofResult = {
  ok: true;
  candidateCount: number;
  parserKind: "invoice_pdf_parser";
  observedNonNullFieldNames: string[];
  hasMid: boolean;
  hasSerial: boolean;
  limitationsCount: number;
  elapsedMs: number;
  sourceTextOmitted: true;
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

  assert(
    result.parser_kind === "invoice_pdf_parser",
    "parser kind must stay stable",
  );
  assert(
    result.parser_version === "2026-08-04-unified-document-v5",
    "parser version must include unified deterministic observations",
  );
  assert(
    summary.parser_kind === "invoice_pdf_parser",
    "summary parser kind must stay stable",
  );
  assert(
    unsafeResult.debug === undefined,
    "adapter must not expose raw extracted PDF text",
  );

  if (result.ok) {
    assert(
      result.observation_envelope.parserVersion === result.parser_version &&
        /^[a-f0-9]{64}$/.test(
          result.observation_envelope.contentFingerprint,
        ) &&
        Number.isInteger(result.observation_envelope.pageCount) &&
        Array.isArray(result.observation_envelope.documentTypeCandidates) &&
        Array.isArray(result.observation_envelope.factCandidates) &&
        Array.isArray(result.observation_envelope.extractionWarnings) &&
        Array.isArray(result.observation_envelope.rejectedCandidates),
      "unified observation envelope must stay bounded and versioned",
    );
    assert(
      Array.isArray(result.ean_candidates),
      "ean_candidates key must exist",
    );
    assert(
      result.ean_candidates.every((candidate) =>
        /^\d{18}$/.test(candidate.normalizedEan) &&
        candidate.context.length <= 140
      ),
      "EAN candidates must stay exact and context-bounded",
    );
    assert(
      result.observed_fields.mid_number !== undefined,
      "mid_number key must exist",
    );
    assert(
      result.observed_fields.serial_number !== undefined,
      "serial_number key must exist",
    );
    assert(
      result.observed_fields.customer_name !== undefined,
      "customer_name key must exist",
    );
    assert(
      result.observed_fields.address_line !== undefined,
      "address_line key must exist",
    );
    assert(
      result.observed_fields.postcode_line !== undefined,
      "postcode_line key must exist",
    );
    assert(
      result.observed_fields.city_line !== undefined,
      "city_line key must exist",
    );
    assert(
      result.observed_fields.country_line !== undefined,
      "country_line key must exist",
    );
    assert(result.observed_fields.brand !== undefined, "brand key must exist");
    assert(result.observed_fields.model !== undefined, "model key must exist");
    assert(
      result.energy_document_observation !== undefined,
      "energy_document_observation key must exist",
    );
    assert(
      Object.keys(result.energy_document_observation).sort().join(",") ===
        [
          "contractHolderName",
          "deliveryAddress",
          "documentDate",
          "electricityConnections",
          "electricityNetworkOperatorCandidate",
          "gasConnections",
          "limitations",
          "supplierName",
        ].sort().join(","),
      "energy document observation must stay bounded",
    );
    const publicObservation = JSON.stringify(
      result.energy_document_observation,
    ).toLocaleLowerCase("nl-NL");
    for (
      const forbiddenKey of [
        "iban",
        "bankaccount",
        "birthdate",
        "phone",
        "email",
        "customernumber",
        "termamount",
        "tariff",
        "paymentmethod",
      ]
    ) {
      assert(
        !publicObservation.includes(`\"${forbiddenKey}\"`),
        `forbidden observation key: ${forbiddenKey}`,
      );
    }
  }

  return {
    ok: true,
    candidateCount: result.ok ? result.ean_candidates.length : 0,
    parserKind: "invoice_pdf_parser",
    observedNonNullFieldNames: summary.observed_non_null_field_names,
    hasMid: summary.has_mid,
    hasSerial: summary.has_serial,
    limitationsCount: summary.limitations_count,
    elapsedMs,
    sourceTextOmitted: true,
  };
}
