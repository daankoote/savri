import { ChargerCard } from "./ChargerCard";
import type { ChargerDraft, SignupFieldErrors } from "./signupTypes";

type ChargerListProps = {
  chargers: ChargerDraft[];
  fieldErrors: SignupFieldErrors;
  onChange: (charger: ChargerDraft) => void;
  onRemove: (clientId: string) => void;
  renderAfterCharger?: (charger: ChargerDraft) => ReactNode;
};

export function ChargerList({
  chargers,
  fieldErrors,
  onChange,
  onRemove,
  renderAfterCharger,
}: ChargerListProps) {
  return (
    <div className="charger-list">
      {chargers.map((charger, index) => (
        <ChargerCard
          canRemove={chargers.length > 1}
          charger={charger}
          fieldErrors={fieldErrors}
          index={index}
          key={charger.clientId}
          onChange={onChange}
          onRemove={onRemove}
        >
          {renderAfterCharger?.(charger)}
        </ChargerCard>
      ))}
    </div>
  );
}
import type { ReactNode } from "react";
