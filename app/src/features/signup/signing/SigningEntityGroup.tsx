import { FactTable } from "../presentation/FactTable";
import type { FactPresentationSection } from "../presentation/factPresentationModel";

type SigningEntityGroupProps = {
  chargers: readonly FactPresentationSection[];
  groupTitle: string;
  location: FactPresentationSection;
  locationTitle: string;
};

function EntityPanel({ section }: { section: FactPresentationSection }) {
  return (
    <article className="signing-entity-group__panel">
      <h5>{section.title}</h5>
      <FactTable
        columns={{ judgment: null, sources: null }}
        rows={section.rows}
        variant="document"
      />
    </article>
  );
}

export function SigningEntityGroup({
  chargers,
  groupTitle,
  location,
  locationTitle,
}: SigningEntityGroupProps) {
  return (
    <section className="signing-entity-group">
      <h4>{groupTitle}</h4>
      <div
        aria-label={`${groupTitle}: locatie en gekoppelde laadpalen`}
        className="signing-entity-group__rail"
        tabIndex={0}
      >
        <EntityPanel section={{ ...location, title: locationTitle }} />
        {chargers.map((charger) => (
          <EntityPanel key={charger.id} section={charger} />
        ))}
      </div>
    </section>
  );
}
