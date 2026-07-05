import { getImportPlaceholderText, supportedImportExtensions } from "./signupImport";

export function ChargerImportTab() {
  return (
    <div className="import-panel">
      <div>
        <h3>Importeren</h3>
        <p>{getImportPlaceholderText()}</p>
      </div>

      <label className="upload-dropzone">
        <span>CSV/XLSX later toevoegen</span>
        <input accept=".csv,.xlsx" disabled type="file" />
      </label>

      <p className="fine-print">Ondersteuning gepland: {supportedImportExtensions.join(", ")}.</p>
    </div>
  );
}
