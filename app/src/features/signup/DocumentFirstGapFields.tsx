import { AddressFields } from "./AddressFields";
import { ConnectionEanConfirmation } from "./ConnectionEanConfirmation";
import type { DocumentFirstFactValue } from "./documentFirstSignupModel";
import type { DocumentFirstGap } from "./documentFirstSignupSelectors";
import type { ConnectionDeclarationDraft } from "./signupTypes";

type DocumentFirstGapFieldsProps = {
  gaps: DocumentFirstGap[];
  connectionDeclarationsByLocationId: Record<
    string,
    ConnectionDeclarationDraft
  >;
  onConnectionChange: (
    locationId: string,
    value: ConnectionDeclarationDraft,
  ) => void;
  onCorrection: (
    gap: DocumentFirstGap,
    value: DocumentFirstFactValue,
  ) => void;
  onRequireManualEan: (locationId: string) => void;
};

export function DocumentFirstGapFields({
  connectionDeclarationsByLocationId,
  gaps,
  onConnectionChange,
  onCorrection,
  onRequireManualEan,
}: DocumentFirstGapFieldsProps) {
  if (gaps.length === 0) return null;

  return (
    <section
      aria-labelledby="document-first-gaps-title"
      className="signup-section"
      id="signup-gaps"
    >
      <div className="signup-section-header">
        <p className="eyebrow">Stap 4</p>
        <h2 id="document-first-gaps-title">Aanvullen</h2>
      </div>
      <div className="document-groups">
        {gaps.map((gap) => {
          if (gap.kind === "address" && typeof gap.value !== "string") {
            return (
              <div className="location-panel" key={gap.factKey}>
                <h3>{gap.label}</h3>
                <AddressFields
                  fieldErrors={{}}
                  locationId={gap.locationId || gap.factKey}
                  onChange={(value) => onCorrection(gap, value)}
                  value={gap.value}
                />
              </div>
            );
          }

          if (gap.kind === "ean" && gap.locationId) {
            const declaration =
              connectionDeclarationsByLocationId[gap.locationId];
            return declaration
              ? (
                <div className="location-panel" key={gap.factKey}>
                  <h3>{gap.label}</h3>
                  <ConnectionEanConfirmation
                    error={null}
                    onChange={(value) =>
                      onConnectionChange(gap.locationId!, value)}
                    onRequireManualEntry={() =>
                      onRequireManualEan(gap.locationId!)}
                    value={declaration}
                  />
                </div>
              )
              : null;
          }

          return (
            <label className="field" key={gap.factKey}>
              <span>{gap.label}</span>
              <input
                defaultValue={typeof gap.value === "string" ? gap.value : ""}
                onBlur={(event) => onCorrection(gap, event.target.value)}
                type={gap.kind === "date" ? "date" : "text"}
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
