import type {
  DocumentFactKey,
  DocumentSourceType,
} from "../documentFactRegistry";
import type { DocumentFirstSignupDraft } from "../documentFirstSignupModel";
import type {
  FactPresentationRow,
  FactResolutionState,
  UnifiedFactPresentation,
} from "../presentation/factPresentationModel";
import type { SignupResolutionActionV1 } from "../../../../../supabase/functions/_shared/signup_resolution_provenance";

export type CanonicalSigningResolutionSourceInputV1 = Readonly<{
  fileReference: string;
  clientSlotId: string;
  documentType: DocumentSourceType;
  contentSha256: string;
  parserVersion: string;
  observedValue: string;
}>;

export type CanonicalSigningSourceRegistry = Readonly<
  Record<
    string,
    Readonly<{
      fileReference: string;
      clientSlotId: string;
      documentType: DocumentSourceType;
      contentSha256: string;
      parserVersion: string;
    }>
  >
>;

export type CanonicalSigningFact = {
  factId: string;
  factKey: DocumentFactKey | null;
  label: string;
  value: string;
  resolutionState: FactResolutionState;
  required: boolean;
  locationId?: string;
  chargerId?: string;
  resolutionInput: Readonly<{
    action: SignupResolutionActionV1;
    sources: readonly CanonicalSigningResolutionSourceInputV1[];
  }>;
};

export type CanonicalSigningFactModel = {
  schemaVersion: "canonical-signing-facts-v1";
  facts: CanonicalSigningFact[];
};

function signingFact(
  row: FactPresentationRow,
  sourceRegistry: CanonicalSigningSourceRegistry,
): CanonicalSigningFact {
  const sources = row.sources.flatMap((source) => {
    if (
      source.sourceType === "user" || source.extractionStatus !== "found"
    ) return [];
    const observedValue = source.observedValue.trim();
    if (!observedValue) return [];
    const registered = sourceRegistry[source.sourceId];
    if (
      !registered || registered.documentType !== source.sourceType ||
      source.documentIdentity !== registered.contentSha256
    ) return [];
    return [{ ...registered, observedValue }];
  });
  const action: SignupResolutionActionV1 =
    row.resolutionState === "pending" || row.resolutionState === "blocked"
      ? "unresolved"
      : row.resolutionState === "confirmed"
      ? "confirmed"
      : sources.length === 0
      ? "supplied"
      : row.correctionState === "manual"
      ? "corrected"
      : "confirmed";
  return {
    factId: row.id,
    factKey: row.reviewRow?.factKey || null,
    label: row.label,
    value: row.canonicalValue,
    resolutionState: row.resolutionState,
    required: row.isRequired,
    locationId: row.locationId,
    chargerId: row.chargerId,
    resolutionInput: { action, sources },
  };
}

export function createCanonicalSigningSourceRegistry(
  draft: DocumentFirstSignupDraft,
): CanonicalSigningSourceRegistry {
  const documents = [
    draft.organizationDocument,
    ...Object.values(draft.energyDocumentsByLocationId),
    ...Object.values(draft.chargerDocumentsByChargerId).flat(),
  ];
  return Object.freeze(Object.fromEntries(documents.flatMap((document) => {
    const observation =
      draft.parserObservations.byDocumentId[document.clientId];
    const fileReference = document.quarantineFileReference;
    if (
      document.quarantineStatus !== "confirmed_quarantine" ||
      typeof fileReference !== "string" || !fileReference || !observation ||
      observation.documentId !== document.clientId ||
      !/^[0-9a-f]{64}$/i.test(observation.contentFingerprint) ||
      !observation.parserVersion.trim()
    ) return [];
    return [[
      document.clientId,
      Object.freeze({
        fileReference,
        clientSlotId: document.clientId,
        documentType: document.documentType,
        contentSha256: observation.contentFingerprint.toLowerCase(),
        parserVersion: observation.parserVersion.trim(),
      }),
    ]];
  })));
}

export function createCanonicalSigningFactModel(
  presentation: UnifiedFactPresentation,
  sourceRegistry: CanonicalSigningSourceRegistry = {},
): CanonicalSigningFactModel {
  const rows = [
    ...presentation.account.rows,
    ...presentation.locations.flatMap((section) => section.rows),
    ...presentation.chargers.flatMap((section) => section.rows),
  ];
  return {
    schemaVersion: "canonical-signing-facts-v1",
    facts: [
      ...new Map(
        rows.map((row) => [row.id, signingFact(row, sourceRegistry)]),
      ).values(),
    ],
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
