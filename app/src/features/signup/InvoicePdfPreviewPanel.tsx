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

const PDF_INVOICE_DOCUMENT_TYPES: DocumentType[] = ["installation_invoice"];

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatYesNo(value: boolean) {
  return value ? "ja" : "nee";
}

export function InvoicePdfPreviewPanel({ documentType, file }: InvoicePdfPreviewPanelProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });
  const isInvoiceSlot = PDF_INVOICE_DOCUMENT_TYPES.includes(documentType);

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
          <dt>Velden</dt>
          <dd>{observedFieldNames.length ? observedFieldNames.join(", ") : "geen"}</dd>
        </div>
        <div>
          <dt>MID</dt>
          <dd>{formatYesNo(Boolean(summary?.has_mid))}</dd>
        </div>
        <div>
          <dt>Serienummer</dt>
          <dd>{formatYesNo(Boolean(summary?.has_serial))}</dd>
        </div>
        <div>
          <dt>Beperkingen</dt>
          <dd>{summary?.limitations_count ?? previewState.result.limitations.length}</dd>
        </div>
      </dl>
    </div>
  );
}
