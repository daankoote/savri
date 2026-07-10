import { type ChangeEvent, useState } from "react";
import { documentLabel } from "./signupNormalizers";
import {
  INVOICE_PDF_ACCEPT,
  isPdfFile,
  supportsInvoicePdfPreview,
} from "./InvoicePdfPreviewPanel";
import type { ChargerDocumentDraft } from "./signupTypes";

type DocumentUploadSlotProps = {
  document: ChargerDocumentDraft;
  onChange: (document: ChargerDocumentDraft) => void;
};

export function DocumentUploadSlot({ document, onChange }: DocumentUploadSlotProps) {
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const expectsPdfInvoice = supportsInvoicePdfPreview(document.documentType);

  const handleFileChange = (file: File | null) => {
    onChange({
      ...document,
      file,
      status: file ? "selected" : "empty",
    });
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    if (file && expectsPdfInvoice && !isPdfFile(file)) {
      event.target.value = "";
      setFileMessage("Alleen PDF-facturen worden nu ondersteund.");
      handleFileChange(null);
      return;
    }

    setFileMessage(null);
    handleFileChange(file);
  };

  return (
    <div className="document-slot">
      <label className="document-slot-picker">
        <span>{documentLabel(document.documentType)}</span>
        <span className="document-file-native-frame">
          <input
            accept={expectsPdfInvoice ? INVOICE_PDF_ACCEPT : undefined}
            className="document-file-input"
            onChange={handleInputChange}
            type="file"
          />
        </span>
        <small className="document-selected-file">
          {document.file ? document.file.name : "Nog geen bestand gekozen"}
        </small>
      </label>
      {fileMessage ? <small className="field-message">{fileMessage}</small> : null}
    </div>
  );
}
