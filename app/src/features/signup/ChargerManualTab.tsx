import { ChargerList } from "./ChargerList";
import type { ChargerDraft, SignupFieldErrors } from "./signupTypes";

type ChargerManualTabProps = {
  chargers: ChargerDraft[];
  fieldErrors: SignupFieldErrors;
  onAdd: () => void;
  onChange: (charger: ChargerDraft) => void;
  onRemove: (clientId: string) => void;
};

export function ChargerManualTab({
  chargers,
  fieldErrors,
  onAdd,
  onChange,
  onRemove,
}: ChargerManualTabProps) {
  return (
    <div className="tab-panel">
      <ChargerList
        chargers={chargers}
        fieldErrors={fieldErrors}
        onChange={onChange}
        onRemove={onRemove}
      />
      <div className="section-actions">
        <button
          className="button button-secondary"
          onClick={onAdd}
          type="button"
        >
          + Laadpaal toevoegen
        </button>
      </div>
    </div>
  );
}
