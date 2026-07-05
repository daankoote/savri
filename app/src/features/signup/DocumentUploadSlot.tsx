import { documentLabel } from "./signupNormalizers";
import type { ChargerDocumentDraft } from "./signupTypes";

type DocumentUploadSlotProps = {
  document: ChargerDocumentDraft;
  onChange: (document: ChargerDocumentDraft) => void;
};

export function DocumentUploadSlot({ document, onChange }: DocumentUploadSlotProps) {
  const handleFileChange = (file: File | null) => {
    onChange({
      ...document,
      file,
      status: file ? "selected" : "empty",
    });
  };

  return (
    <label className="document-slot">
      <span>{documentLabel(document.documentType)}</span>
      <input
        onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
        type="file"
      />
      <small>{document.file ? document.file.name : "Nog geen bestand gekozen"}</small>
    </label>
  );
}
