export type CustomerFactSourceSetKind =
  | "ZERO_USABLE_SOURCES"
  | "ONE_USABLE_SOURCE"
  | "CORROBORATED_EQUAL_SOURCES"
  | "CONFLICTING_SOURCES";

export type CustomerFactBrowserResolution =
  | "UNRESOLVED"
  | "CLEAN_SOURCE_CONFIRMED"
  | "CONFLICT_SOURCE_SELECTED"
  | "MANUAL_EDIT"
  | "MANUAL_CONFIRMED"
  | "LOCKED";

export type CustomerFactInteractionState =
  | "SINGLE_SOURCE_UNRESOLVED"
  | "SOURCE_UNRESOLVED"
  | "SOURCE_CONFIRMED"
  | "SOURCE_CONFLICT_UNRESOLVED"
  | "MANUAL_EDIT"
  | "MANUAL_CONFIRMED"
  | "MISSING_SOURCE_UNRESOLVED"
  | "LOCKED";

export type CustomerFactProjectedEnvalRoute =
  | "Nog te beoordelen"
  | "Wacht op klant"
  | "Akkoord"
  | "Correctie nodig"
  | "Klant bevestigd"
  | "ENVAL checken";

export type CustomerFactEvidenceRelationship =
  | "direct"
  | "supporting"
  | "provenance_only";

export type CustomerFactResolutionSource = Readonly<{
  canonicalFactKey: string;
  scopeRef: string;
  comparisonRole: string;
  evidenceRootRef: string;
  observedValue: string | null;
  usable: boolean;
  relationship?: CustomerFactEvidenceRelationship | null;
}>;

export type CustomerFactResolutionPolicyInput = Readonly<{
  canonicalFactKey: string;
  scopeRef: string;
  comparisonRole: string;
  sources: readonly CustomerFactResolutionSource[];
  editable: boolean;
  evidenceReady: boolean;
  browserResolution: CustomerFactBrowserResolution;
  actualReviewTruth: "Nog te beoordelen" | "Akkoord" | "Correctie nodig";
}>;

export type CustomerFactResolutionPolicy = Readonly<{
  sourceSetKind: CustomerFactSourceSetKind;
  usableIndependentSourceCount: number;
  distinctNormalizedValues: readonly string[];
  interactionState: CustomerFactInteractionState;
  cleanConfirmAvailable: boolean;
  conflictChoiceAvailable: boolean;
  manualEditAvailable: boolean;
  projectedCustomerState:
    | "UNRESOLVED"
    | "SOURCE_CONFIRMED"
    | "MANUAL_CONFIRMED"
    | "LOCKED";
  projectedEnvalRoute: CustomerFactProjectedEnvalRoute;
}>;

export function normalizeCustomerFactResolutionValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleLowerCase("nl-NL");
}

function sourceSet(
  input: CustomerFactResolutionPolicyInput,
): Readonly<{
  independentSourceCount: number;
  distinctValues: readonly string[];
  hasDirectSource: boolean;
  kind: CustomerFactSourceSetKind;
}> {
  const valuesByEvidenceRoot = new Map<
    string,
    { values: Set<string>; hasDirectSource: boolean }
  >();
  for (const source of input.sources) {
    const hasExplicitRelationship = source.relationship !== undefined;
    const relevantRelationship = source.relationship === "direct" ||
      source.relationship === "supporting";
    if (
      (hasExplicitRelationship ? !relevantRelationship : !source.usable) ||
      source.canonicalFactKey !== input.canonicalFactKey ||
      source.scopeRef !== input.scopeRef ||
      source.comparisonRole !== input.comparisonRole ||
      !source.evidenceRootRef
    ) continue;
    const normalized = normalizeCustomerFactResolutionValue(
      source.observedValue || "",
    );
    if (!normalized) continue;
    const root = valuesByEvidenceRoot.get(source.evidenceRootRef) || {
      values: new Set<string>(),
      hasDirectSource: false,
    };
    root.values.add(normalized);
    root.hasDirectSource ||= !hasExplicitRelationship ||
      source.relationship === "direct";
    valuesByEvidenceRoot.set(source.evidenceRootRef, root);
  }
  const independentRoots = [...valuesByEvidenceRoot.values()].filter(
    (root) => root.values.size === 1,
  );
  const independentValues = independentRoots.map((root) => [...root.values][0]);
  const distinctValues = Object.freeze([...new Set(independentValues)].sort());
  const independentSourceCount = independentValues.length;
  const hasDirectSource = independentRoots.some((root) => root.hasDirectSource);
  const kind = independentSourceCount === 0
    ? "ZERO_USABLE_SOURCES" as const
    : independentSourceCount === 1
    ? "ONE_USABLE_SOURCE" as const
    : distinctValues.length === 1
    ? "CORROBORATED_EQUAL_SOURCES" as const
    : "CONFLICTING_SOURCES" as const;
  return Object.freeze({
    independentSourceCount,
    distinctValues,
    hasDirectSource,
    kind,
  });
}

export function resolveCustomerFactResolutionPolicy(
  input: CustomerFactResolutionPolicyInput,
): CustomerFactResolutionPolicy {
  const resolvedSources = sourceSet(input);
  const cleanConfirmAvailable = input.editable && input.evidenceReady &&
    resolvedSources.kind !== "ZERO_USABLE_SOURCES" &&
    resolvedSources.kind !== "CONFLICTING_SOURCES" &&
    resolvedSources.hasDirectSource;
  const conflictChoiceAvailable = input.editable && input.evidenceReady &&
    resolvedSources.kind === "CONFLICTING_SOURCES";
  const manualEditAvailable = input.editable &&
    input.browserResolution !== "LOCKED";

  const acceptedCleanConfirmation = cleanConfirmAvailable &&
    input.browserResolution === "CLEAN_SOURCE_CONFIRMED";
  const acceptedConflictSelection = conflictChoiceAvailable &&
    input.browserResolution === "CONFLICT_SOURCE_SELECTED";
  const manualConfirmed = input.browserResolution === "MANUAL_CONFIRMED";
  const locked = !input.editable || input.browserResolution === "LOCKED";

  const interactionState: CustomerFactInteractionState = locked
    ? "LOCKED"
    : manualConfirmed
    ? "MANUAL_CONFIRMED"
    : input.browserResolution === "MANUAL_EDIT"
    ? "MANUAL_EDIT"
    : acceptedCleanConfirmation || acceptedConflictSelection
    ? "SOURCE_CONFIRMED"
    : resolvedSources.kind === "ZERO_USABLE_SOURCES"
    ? "MISSING_SOURCE_UNRESOLVED"
    : resolvedSources.kind === "ONE_USABLE_SOURCE"
    ? cleanConfirmAvailable ? "SOURCE_UNRESOLVED" : "SINGLE_SOURCE_UNRESOLVED"
    : resolvedSources.kind === "CORROBORATED_EQUAL_SOURCES"
    ? cleanConfirmAvailable ? "SOURCE_UNRESOLVED" : "SINGLE_SOURCE_UNRESOLVED"
    : "SOURCE_CONFLICT_UNRESOLVED";

  const projectedCustomerState = locked
    ? "LOCKED" as const
    : manualConfirmed
    ? "MANUAL_CONFIRMED" as const
    : acceptedCleanConfirmation || acceptedConflictSelection
    ? "SOURCE_CONFIRMED" as const
    : "UNRESOLVED" as const;
  const projectedEnvalRoute: CustomerFactProjectedEnvalRoute =
    input.actualReviewTruth === "Akkoord"
      ? "Akkoord"
      : locked
      ? input.actualReviewTruth
      : manualConfirmed || acceptedConflictSelection
      ? "ENVAL checken"
      : acceptedCleanConfirmation
      ? "Klant bevestigd"
      : "Wacht op klant";

  return Object.freeze({
    sourceSetKind: resolvedSources.kind,
    usableIndependentSourceCount: resolvedSources.independentSourceCount,
    distinctNormalizedValues: resolvedSources.distinctValues,
    interactionState,
    cleanConfirmAvailable,
    conflictChoiceAvailable,
    manualEditAvailable,
    projectedCustomerState,
    projectedEnvalRoute,
  });
}
