import { useEffect, useMemo, useState } from "react";
import {
  parseInvoicePdfInput,
  summarizeInvoicePdfParserResult,
  type InvoicePdfParserAdapterResult,
} from "../invoice-analysis/invoicePdfParserAdapter";
import type { DocumentType } from "./signupTypes";

type InvoicePdfPreviewPanelProps = {
  documentType: DocumentType;
  file: File | null;
};

type PreviewState =
  | { status: "idle" }
  | { status: "skipped"; message: string }
  | { status: "parsing" }
  | { status: "parsed"; result: InvoicePdfParserAdapterResult; elapsedMs: number };

export const INVOICE_PDF_ACCEPT = "application/pdf,.pdf";

const PDF_INVOICE_DOCUMENT_TYPES: DocumentType[] = ["installation_invoice"];

export function supportsInvoicePdfPreview(documentType: DocumentType) {
  return PDF_INVOICE_DOCUMENT_TYPES.includes(documentType);
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatParsedValue(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || "niet gevonden";
}

function formatAddressParts(result: InvoicePdfParserAdapterResult) {
  if (!result.ok) return "niet gevonden";

  const fields = result.observed_fields;
  const addressParts = [
    fields.address_line,
    [fields.postcode_line, fields.city_line].filter(Boolean).join(" "),
    fields.country_line,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return addressParts.length ? addressParts.join(" — ") : "niet gevonden";
}

export function InvoicePdfPreviewPanel({ documentType, file }: InvoicePdfPreviewPanelProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const isInvoiceSlot = supportsInvoicePdfPreview(documentType);

  useEffect(() => {
    let cancelled = false;

    async function parseSelectedPdf(selectedFile: File) {
      const startedAt = performance.now();
      const result = await parseInvoicePdfInput(selectedFile);
      const elapsedMs = Math.round(performance.now() - startedAt);

      if (!cancelled) {
        setPreviewState({ status: "parsed", result, elapsedMs });
      }
    }

    if (!file) {
      setPreviewState({ status: "idle" });
      return () => {
        cancelled = true;
      };
    }

    if (!isInvoiceSlot) {
      setPreviewState({
        status: "skipped",
        message: "Voorbeeldanalyse alleen voor PDF-facturen.",
      });
      return () => {
        cancelled = true;
      };
    }

    if (!isPdfFile(file)) {
      setPreviewState({
        status: "skipped",
        message: "Voorbeeldanalyse alleen voor PDF-facturen.",
      });
      return () => {
        cancelled = true;
      };
    }

    setPreviewState({ status: "parsing" });
    void parseSelectedPdf(file);

    return () => {
      cancelled = true;
    };
  }, [documentType, file, isInvoiceSlot]);

  const summary = useMemo(() => {
    if (previewState.status !== "parsed") return null;
    return summarizeInvoicePdfParserResult(previewState.result);
  }, [previewState]);

  if (previewState.status === "idle") return null;

  if (previewState.status === "skipped") {
    return <p className="invoice-preview-note">{previewState.message}</p>;
  }

  if (previewState.status === "parsing") {
    return (
      <div className="invoice-preview-panel" aria-live="polite">
        <span className="status-pill status-pill-warning">PDF-analyse loopt</span>
        <p>Factuur wordt lokaal bekeken.</p>
      </div>
    );
  }

  const parserStatus = previewState.result.ok ? "parsed" : previewState.result.code;
  const observedFieldNames = summary?.observed_non_null_field_names ?? [];
  const fields = previewState.result.ok ? previewState.result.observed_fields : null;
  const limitationCodes = previewState.result.limitations;

  return (
    <div className="invoice-preview-panel" aria-live="polite">
      <div className="invoice-preview-header">
        <span className={previewState.result.ok ? "status-pill status-pill-ok" : "status-pill status-pill-warning"}>
          PDF-preview
        </span>
        <small>{previewState.elapsedMs} ms</small>
      </div>

      <dl className="invoice-preview-list">
        <div>
          <dt>Status</dt>
          <dd>{parserStatus}</dd>
        </div>
        <div>
          <dt>MID</dt>
          <dd>{formatParsedValue(fields?.mid_number)}</dd>
        </div>
        <div>
          <dt>Serienummer</dt>
          <dd>{formatParsedValue(fields?.serial_number)}</dd>
        </div>
        <div>
          <dt>Adres</dt>
          <dd>{formatAddressParts(previewState.result)}</dd>
        </div>
        <div>
          <dt>Gevonden velden</dt>
          <dd>
            {observedFieldNames.length ? (
              <span className="invoice-preview-chip-list">
                {observedFieldNames.map((fieldName) => (
                  <span className="invoice-preview-chip" key={fieldName}>
                    {fieldName}
                  </span>
                ))}
              </span>
            ) : (
              "geen"
            )}
          </dd>
        </div>
        <div>
          <dt>Aandachtspunten</dt>
          <dd>
            {limitationCodes.length ? (
              <span className="invoice-preview-chip-list">
                {limitationCodes.map((limitation) => (
                  <span className="invoice-preview-chip invoice-preview-chip-warning" key={limitation}>
                    {limitation}
                  </span>
                ))}
              </span>
            ) : (
              "geen"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
