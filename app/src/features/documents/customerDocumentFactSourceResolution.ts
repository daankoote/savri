import {
  normalizeCustomerFactResolutionValue,
  resolveCustomerFactResolutionPolicy,
} from "../../../../platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts";

export {
  normalizeCustomerFactResolutionValue,
  resolveCustomerFactResolutionPolicy,
};
export type {
  CustomerFactBrowserResolution,
  CustomerFactInteractionState,
  CustomerFactProjectedEnvalRoute,
  CustomerFactResolutionPolicy,
  CustomerFactResolutionPolicyInput,
  CustomerFactResolutionSource,
  CustomerFactSourceSetKind,
} from "../../../../platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts";

export type CustomerDocumentFactSourceSetState =
  | "SINGLE_SOURCE_UNRESOLVED"
  | "SOURCE_UNRESOLVED"
  | "SOURCE_CONFLICT_UNRESOLVED"
  | "MISSING_SOURCE_UNRESOLVED";

const SOURCE_TYPE_ORDER: Readonly<Record<string, number>> = Object.freeze({
  organization_extract: 0,
  energy_bill_or_contract: 1,
  installation_invoice: 2,
  user: 3,
});

export function normalizeCustomerDocumentFactSourceValue(
  value: string,
): string {
  return normalizeCustomerFactResolutionValue(value);
}

export function distinctNormalizedCustomerDocumentFactSourceValues(
  sourceValues: readonly (string | null | undefined)[],
): readonly string[] {
  return Object.freeze([
    ...new Set(sourceValues.flatMap((value) => {
      if (!value) return [];
      const normalized = normalizeCustomerDocumentFactSourceValue(value);
      return normalized ? [normalized] : [];
    })),
  ].sort());
}

export function classifyCustomerDocumentFactSourceValues(
  sourceValues: readonly (string | null | undefined)[],
): CustomerDocumentFactSourceSetState {
  return resolveCustomerFactResolutionPolicy({
    canonicalFactKey: "generic",
    scopeRef: "generic",
    comparisonRole: "generic",
    editable: true,
    evidenceReady: true,
    browserResolution: "UNRESOLVED",
    actualReviewTruth: "Correctie nodig",
    sources: sourceValues.map((value, index) => ({
      canonicalFactKey: "generic",
      scopeRef: "generic",
      comparisonRole: "generic",
      evidenceRootRef: `source:${index}`,
      observedValue: value || null,
      usable: true,
    })),
  }).interactionState as CustomerDocumentFactSourceSetState;
}

export type CustomerDocumentFactSourceOrderInput = Readonly<{
  sourceDocumentType: string;
  immutableSourceIdentity: string;
  semanticRole?: string;
  sourceLabel?: string;
  value?: string | null;
}>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareCustomerDocumentFactSourceOrder(
  left: CustomerDocumentFactSourceOrderInput,
  right: CustomerDocumentFactSourceOrderInput,
): number {
  const leftRank = SOURCE_TYPE_ORDER[left.sourceDocumentType] ?? 99;
  const rightRank = SOURCE_TYPE_ORDER[right.sourceDocumentType] ?? 99;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return compareText(
    [
      left.immutableSourceIdentity,
      left.semanticRole || "",
      left.sourceLabel || "",
      normalizeCustomerDocumentFactSourceValue(left.value || ""),
    ].join("\u0000"),
    [
      right.immutableSourceIdentity,
      right.semanticRole || "",
      right.sourceLabel || "",
      normalizeCustomerDocumentFactSourceValue(right.value || ""),
    ].join("\u0000"),
  );
}
