import { ChargerCard } from "./ChargerCard";
import type { ChargerDraft } from "./signupTypes";

type ChargerListProps = {
  chargers: ChargerDraft[];
  onChange: (charger: ChargerDraft) => void;
  onRemove: (clientId: string) => void;
};

export function ChargerList({ chargers, onChange, onRemove }: ChargerListProps) {
  return (
    <div className="charger-list">
      {chargers.map((charger, index) => (
        <ChargerCard
          canRemove={chargers.length > 1}
          charger={charger}
          index={index}
          key={charger.clientId}
          onChange={onChange}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
