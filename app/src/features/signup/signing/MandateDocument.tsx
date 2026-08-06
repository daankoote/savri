import type { MandateDocumentModel } from "./mandateDocumentModel";

type MandateDocumentProps = {
  model: MandateDocumentModel;
  yearOptions: readonly number[];
  selectedYear: number | null;
  onYearChange: (year: number | null) => void;
  onPreviewDocuments: () => void;
};

export function MandateDocument({
  model,
  onYearChange,
  onPreviewDocuments,
  selectedYear,
  yearOptions,
}: MandateDocumentProps) {
  return (
    <section className="signing-kiss-section" id="signup-mandate">
      <h3>Machtiging</h3>
      <label className="field signing-document__year-field">
        <span>Kalenderjaar</span>
        <select
          onChange={(event) =>
            onYearChange(
              event.target.value ? Number(event.target.value) : null,
            )}
          value={selectedYear || ""}
        >
          <option value="">Kies een kalenderjaar</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </label>
      <div className="signing-document__permissions">
        {model.permissions.map((permission) => (
          <p key={permission.permissionId}>{permission.text}</p>
        ))}
      </div>
      <button
        className="button-link"
        onClick={onPreviewDocuments}
        type="button"
      >
        Volledige documenten bekijken
      </button>
    </section>
  );
}
