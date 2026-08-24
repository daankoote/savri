import {
  parseInvoicePdfInput,
  UNIFIED_DOCUMENT_PARSER_VERSION,
} from "../../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import type {
  DocumentParserProviderAdapter,
  ParserProviderExtraction,
} from "../../../platform/runtime/document-parsing/document_parser_contract.ts";

export const CURRENT_PDF_PARSER_ADAPTER: DocumentParserProviderAdapter = Object
  .freeze({
    adapterId: "enval_deterministic_pdf_text_v2",
    adapterVersion: UNIFIED_DOCUMENT_PARSER_VERSION,
    configFingerprint:
      "eb36c856f82a6d42fbc7e2d8f2fd55f884ec304652c3440316f944320db3c7c7",
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
