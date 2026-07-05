import { ChargerList } from "./ChargerList";
import type { ChargerDraft } from "./signupTypes";

type ChargerManualTabProps = {
  chargers: ChargerDraft[];
  onAdd: () => void;
  onChange: (charger: ChargerDraft) => void;
  onRemove: (clientId: string) => void;
};

export function ChargerManualTab({ chargers, onAdd, onChange, onRemove }: ChargerManualTabProps) {
  return (
    <div className="tab-panel">
      <ChargerList chargers={chargers} onChange={onChange} onRemove={onRemove} />
      <div className="section-actions">
        <button className="button button-secondary" onClick={onAdd} type="button">
          + Laadpaal toevoegen
        </button>
      </div>
    </div>
  );
}
