import {
  parseInvoicePdfInput,
  UNIFIED_DOCUMENT_PARSER_VERSION,
} from "../../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import type {
  DocumentParserProviderAdapter,
  ParserProviderExtraction,
} from "../../../platform/runtime/document-parsing/document_parser_contract.ts";

export const CURRENT_PDF_PARSER_ADAPTER: DocumentParserProviderAdapter =
  Object.freeze({
    adapterId: "enval_deterministic_pdf_text_v1",
    adapterVersion: UNIFIED_DOCUMENT_PARSER_VERSION,
    configFingerprint:
      "ca07077746047f46b9bc549c7e28920b5e1acb9e56bc05481f860de10248a302",
    async extract(document: Uint8Array): Promise<ParserProviderExtraction> {
      const result = await parseInvoicePdfInput(document);
      if (!result.ok) {
        return {
          ok: false,
          limitation: result.limitations[0] || "parser_provider_failed",
        };
      }
      return {
        ok: true,
        contentSha256: result.observation_envelope.contentFingerprint,
        pageCount: result.observation_envelope.pageCount,
        documentTypeCandidates:
          result.observation_envelope.documentTypeCandidates,
        factCandidates: result.observation_envelope.factCandidates,
        limitations: result.observation_envelope.extractionWarnings,
      };
    },
  });
