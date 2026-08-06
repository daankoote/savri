import type { DocumentFactKey } from "../documentFactRegistry";
import type {
  FactPresentationRow,
  FactResolutionState,
  UnifiedFactPresentation,
} from "../presentation/factPresentationModel";

export type CanonicalSigningFact = {
  factId: string;
  factKey: DocumentFactKey | null;
  label: string;
  value: string;
  resolutionState: FactResolutionState;
  required: boolean;
  locationId?: string;
  chargerId?: string;
};

export type CanonicalSigningFactModel = {
  schemaVersion: "canonical-signing-facts-v1";
  facts: CanonicalSigningFact[];
};

function signingFact(row: FactPresentationRow): CanonicalSigningFact {
  return {
    factId: row.id,
    factKey: row.reviewRow?.factKey || null,
    label: row.label,
    value: row.canonicalValue,
    resolutionState: row.resolutionState,
    required: row.isRequired,
    locationId: row.locationId,
    chargerId: row.chargerId,
  };
}

export function createCanonicalSigningFactModel(
  presentation: UnifiedFactPresentation,
): CanonicalSigningFactModel {
  const rows = [
    ...presentation.account.rows,
    ...presentation.locations.flatMap((section) => section.rows),
    ...presentation.chargers.flatMap((section) => section.rows),
  ];
  return {
    schemaVersion: "canonical-signing-facts-v1",
    facts: [...new Map(rows.map((row) => [row.id, signingFact(row)])).values()],
  };
}

export function factsByKey(
  model: CanonicalSigningFactModel,
  factKey: DocumentFactKey,
): CanonicalSigningFact[] {
  return model.facts.filter((fact) =>
    fact.factKey === factKey && Boolean(fact.value)
  );
}
