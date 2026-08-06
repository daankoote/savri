import type { DocumentFirstFactValue } from "./documentFirstSignupModel";
import type { DocumentReviewRow } from "./documentReviewMatrix";
import { FactTable } from "./presentation/FactTable";
import type { FactPresentationSection } from "./presentation/factPresentationModel";

type DocumentFirstCheckMatrixProps = {
  locations: FactPresentationSection[];
  chargers: FactPresentationSection[];
  onConfirm: (row: DocumentReviewRow) => void;
  onCorrect: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onReplaceDocument: (row: DocumentReviewRow) => void;
};

export function DocumentFirstCheckMatrix({
  chargers,
  locations,
  onConfirm,
  onCorrect,
  onReplaceDocument,
}: DocumentFirstCheckMatrixProps) {
  if (locations.length === 0) return null;
  const sections = locations.flatMap((location) => [
    location,
    ...chargers.filter((charger) => charger.locationId === location.locationId),
  ]);
  return (
    <div className="fact-review-groups">
      {sections.map((section) => (
        <section className="fact-review-section-item" key={section.id}>
          <h3>{section.title}</h3>
          <FactTable
            onConfirm={onConfirm}
            onCorrect={onCorrect}
            onReplaceDocument={onReplaceDocument}
            rows={section.rows}
            variant="review"
          />
        </section>
      ))}
    </div>
  );
}
