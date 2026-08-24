import type {
  CustomerDocumentEvidenceRelationship,
  DocumentFactKey,
  DocumentSemanticRole,
  DocumentSourceType,
} from "../signup/documentFactRegistry.ts";
import { normalizeCustomerFactResolutionValue } from "../../../../platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts";

export type CustomerDocumentFactActiveSourceInput = Readonly<{
  sourceRef: string;
  evidenceRootRef: string;
  contentFingerprint?: string | null;
  fileName: string;
  canonicalFactKey: DocumentFactKey;
  scopeRef: string;
  comparisonRole: string;
  sourceDocumentType: Exclude<DocumentSourceType, "organization_extract">;
  semanticRole: DocumentSemanticRole;
  relationship: CustomerDocumentEvidenceRelationship | null;
  observedValue: string | null;
  current: boolean;
}>;

export type CustomerDocumentFactActiveSource = Readonly<{
  id: string;
  sourceRef: string;
  evidenceRootRef: string;
  contentFingerprint: string | null;
  sourceIndependenceKey: string;
  fileName: string;
  canonicalFactKey: DocumentFactKey;
  scopeRef: string;
  comparisonRole: string;
  sourceDocumentType: Exclude<DocumentSourceType, "organization_extract">;
  semanticRole: DocumentSemanticRole;
  relationship: CustomerDocumentEvidenceRelationship | null;
  observedValue: string | null;
  value: string | null;
  normalizedValue: string;
  usable: boolean;
  direct: boolean;
  supporting: boolean;
  visible: boolean;
  current: boolean;
}>;

export type CustomerDocumentFactActiveSourceProjection = Readonly<{
  currentSources: readonly CustomerDocumentFactActiveSource[];
  matrixSources: readonly CustomerDocumentFactActiveSource[];
  directSources: readonly CustomerDocumentFactActiveSource[];
  supportingSources: readonly CustomerDocumentFactActiveSource[];
  provenanceSources: readonly CustomerDocumentFactActiveSource[];
}>;

function safeFileName(value: string): string {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
}

function normalizedContentFingerprint(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || "";
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function sourceIndependenceKey(
  input: CustomerDocumentFactActiveSourceInput,
  contentFingerprint: string | null,
) {
  return [
    input.canonicalFactKey,
    input.scopeRef,
    input.comparisonRole,
    contentFingerprint
      ? `sha256:${contentFingerprint}`
      : `root:${input.evidenceRootRef}`,
  ].join("|");
}

/**
 * The one pure boundary between lifecycle-specific current evidence and the
 * customer matrix/policy. Callers must establish `current`; this function owns
 * customer-safe naming, normalization, comparability and byte/root
 * deduplication within the exact canonical fact scope.
 */
export function projectCustomerDocumentFactActiveSources(
  inputs: readonly CustomerDocumentFactActiveSourceInput[],
): CustomerDocumentFactActiveSourceProjection {
  const currentByIndependenceKey = new Map<
    string,
    CustomerDocumentFactActiveSource
  >();
  for (const input of inputs) {
    if (!input.current) continue;
    const fileName = safeFileName(input.fileName);
    if (!fileName || !input.sourceRef.trim() || !input.evidenceRootRef.trim()) {
      continue;
    }
    const observedValue = input.observedValue?.trim() || null;
    const contentFingerprint = normalizedContentFingerprint(
      input.contentFingerprint,
    );
    const independenceKey = sourceIndependenceKey(input, contentFingerprint);
    const direct = input.relationship === "direct";
    const supporting = input.relationship === "supporting";
    const source = Object.freeze({
      id: input.sourceRef,
      sourceRef: input.sourceRef,
      evidenceRootRef: input.evidenceRootRef,
      contentFingerprint,
      sourceIndependenceKey: independenceKey,
      fileName,
      canonicalFactKey: input.canonicalFactKey,
      scopeRef: input.scopeRef,
      comparisonRole: input.comparisonRole,
      sourceDocumentType: input.sourceDocumentType,
      semanticRole: input.semanticRole,
      relationship: input.relationship,
      observedValue,
      value: observedValue,
      normalizedValue: observedValue
        ? normalizeCustomerFactResolutionValue(observedValue)
        : "",
      usable: direct && Boolean(observedValue),
      direct,
      supporting,
      visible: direct || supporting,
      current: true,
    });
    const existing = currentByIndependenceKey.get(independenceKey);
    const sourceRank = source.direct ? 2 : source.supporting ? 1 : 0;
    const existingRank = existing?.direct ? 2 : existing?.supporting ? 1 : 0;
    if (!existing || sourceRank > existingRank) {
      currentByIndependenceKey.set(independenceKey, source);
    }
  }
  const currentSources = Object.freeze([...currentByIndependenceKey.values()].sort(
    (left, right) =>
      left.sourceDocumentType.localeCompare(right.sourceDocumentType) ||
      left.evidenceRootRef.localeCompare(right.evidenceRootRef) ||
      left.sourceRef.localeCompare(right.sourceRef),
  ));
  return Object.freeze({
    currentSources,
    matrixSources: Object.freeze(
      currentSources.filter((source) => source.visible),
    ),
    directSources: Object.freeze(
      currentSources.filter((source) => source.direct),
    ),
    supportingSources: Object.freeze(
      currentSources.filter((source) => source.supporting),
    ),
    provenanceSources: Object.freeze(
      currentSources.filter((source) => !source.visible),
    ),
  });
}
