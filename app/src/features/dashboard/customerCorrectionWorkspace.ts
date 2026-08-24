import type {
  CustomerCorrectionFactResolution,
  CustomerCorrectionHandoffItem,
  CustomerCorrectionResponse,
} from "./customerCorrectionHandoffClient.ts";
import type { DocumentFactKey } from "../../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";
import {
  customerDocumentEvidenceBindingFor,
  type CustomerDocumentFactGroup,
  type CustomerDocumentFactRowDefinition,
  customerDocumentSemanticRoleFor,
  customerDocumentVisibleEvidenceBindingFor,
  selectCustomerDocumentFactRows,
} from "../signup/documentFactRegistry.ts";
import { compareCustomerDocumentFactSourceOrder } from "../documents/customerDocumentFactSourceResolution.ts";
import {
  type CustomerDocumentFactActiveSource,
  projectCustomerDocumentFactActiveSources,
} from "../documents/customerDocumentFactActiveSourceProjector.ts";
import type { CustomerDocumentWorkflowSourceInput } from "../documents/CustomerDocumentWorkflowController.ts";

export const CUSTOMER_CORRECTION_VALUE_MAX_LENGTH = 2_000;

export type CustomerCorrectionDraft = Readonly<Record<string, string>>;

export type CustomerCorrectionCandidateSelection = Readonly<{
  candidateRef: string;
}>;

export type CustomerCorrectionCandidateSelections = Readonly<
  Record<string, CustomerCorrectionCandidateSelection>
>;

export type CustomerCorrectionWorkspaceItem = Readonly<{
  item: CustomerCorrectionHandoffItem;
  correctedValue: string;
  normalizedValue: string;
  requiresValue: boolean;
  requiresReplacement: boolean;
  showCurrentValue: boolean;
  valid: boolean;
  sameAsCurrentValue: boolean;
  parserPrefillNeedsConfirmation: boolean;
}>;

export type CustomerCorrectionReplacementTarget = Readonly<{
  replacementTargetRef: string;
  documentLabel: "Energiedocument" | "Installatiefactuur";
  acceptedMimeTypes: readonly ["application/pdf"];
  maximumFileSize: number;
  itemRefs: readonly string[];
  candidateRef: string | null;
  ready: boolean;
}>;

export type CustomerCorrectionDocumentSection = Readonly<{
  id: string;
  documentLabel: CustomerCorrectionHandoffItem["documentLabel"];
  itemRefs: readonly string[];
  replacementTarget: CustomerCorrectionReplacementTarget | null;
}>;

export type CustomerCorrectionWorkspace = Readonly<{
  items: readonly CustomerCorrectionWorkspaceItem[];
  replacementTargets: readonly CustomerCorrectionReplacementTarget[];
  documentSections: readonly CustomerCorrectionDocumentSection[];
  responses: readonly CustomerCorrectionResponse[];
  hasUnsupportedAction: boolean;
  ready: boolean;
}>;

export type CustomerCorrectionParserFact = Readonly<{
  factKey: DocumentFactKey;
  observedValue: string | null;
  extractionMethod?: string | null;
}>;

export type CustomerCorrectionParserProjection = Readonly<{
  observedValuesByItemRef: Readonly<Record<string, string | null>>;
  extractionMethodsByItemRef: Readonly<Record<string, string | null>>;
  prefills: readonly Readonly<{ itemRef: string; observedValue: string }>[];
}>;

export type CustomerCorrectionFactScope = Readonly<{
  scopeRef: string;
  group: CustomerDocumentFactGroup;
  items: readonly CustomerCorrectionWorkspaceItem[];
}>;

export type CustomerCorrectionTargetReset = Readonly<{
  draft: CustomerCorrectionDraft;
  unconfirmedParserPrefills: ReadonlySet<string>;
  clearedItemRefs: readonly string[];
}>;

export type CustomerCorrectionTargetRebuild =
  & CustomerCorrectionTargetReset
  & Readonly<{
    observedValuesByItemRef: Readonly<Record<string, string | null>>;
  }>;

const REPLACEMENT_CANDIDATE_REFERENCE_RE = /^CRC-[A-F0-9]{32}$/;

export function normalizeCustomerCorrectionValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function customerCorrectionCurrentValueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch (_error) {
    return "";
  }
}

function correctionSourceDocumentType(
  item: CustomerCorrectionWorkspaceItem,
): "energy_bill_or_contract" | "installation_invoice" {
  return item.item.documentLabel === "Energiedocument"
    ? "energy_bill_or_contract"
    : "installation_invoice";
}

type CustomerCorrectionActiveFactSourceParams = Readonly<{
  definition: CustomerDocumentFactRowDefinition;
  items: readonly CustomerCorrectionWorkspaceItem[];
  scopeRef: string;
  sourceFileNameByItemRef: Readonly<Record<string, string>>;
  sourceContentFingerprintByItemRef?: Readonly<
    Record<string, string | null>
  >;
  observedValuesByItemRef: Readonly<Record<string, string | null>>;
  extractionMethodsByItemRef: Readonly<Record<string, string | null>>;
  sourceIdentityByItemRef: Readonly<Record<string, string>>;
}>;

export function selectCustomerCorrectionActiveFactSourceInputs({
  definition,
  items,
  sourceFileNameByItemRef,
  sourceContentFingerprintByItemRef = {},
  observedValuesByItemRef,
  extractionMethodsByItemRef,
  sourceIdentityByItemRef,
}: CustomerCorrectionActiveFactSourceParams): readonly CustomerDocumentWorkflowSourceInput[] {
  const slots = new Map<string, CustomerCorrectionWorkspaceItem[]>();
  for (const item of items) {
    const itemRef = item.item.itemRef;
    const sourceIdentity = sourceIdentityByItemRef[itemRef] || "";
    if (!sourceIdentity) continue;
    const key = `${sourceIdentity}:${correctionSourceDocumentType(item)}`;
    const slotItems = slots.get(key) || [];
    slotItems.push(item);
    slots.set(key, slotItems);
  }
  const inputs = [...slots.values()].flatMap((slotItems) => {
    const slotItem = slotItems[0];
    const sourceDocumentType = correctionSourceDocumentType(slotItem);
    const factItem = slotItems.find((item) =>
      item.item.factKey === definition.factKey
    );
    const factItemRef = factItem?.item.itemRef || "";
    const semanticRole = factItem
      ? customerDocumentSemanticRoleFor(
        definition.factKey,
        extractionMethodsByItemRef[factItemRef],
      )
      : null;
    const observedBinding = semanticRole
      ? customerDocumentEvidenceBindingFor(definition, {
        sourceDocumentType,
        semanticRole,
      })
      : null;
    const displayBinding = observedBinding &&
        observedBinding.relationship !== "provenance_only"
      ? observedBinding
      : customerDocumentVisibleEvidenceBindingFor(
        definition,
        sourceDocumentType,
      );
    if (!displayBinding) return [];
    const slotItemRef = slotItem.item.itemRef;
    const sourceIdentity = sourceIdentityByItemRef[slotItemRef] || "";
    return [Object.freeze({
      sourceRef: `${sourceIdentity}:${definition.id}`,
      evidenceRootRef: sourceIdentity,
      contentFingerprint:
        sourceContentFingerprintByItemRef[slotItemRef] || null,
      fileName: sourceFileNameByItemRef[slotItemRef] || "",
      sourceDocumentType,
      semanticRole: semanticRole || displayBinding.semanticRoles[0],
      relationship: observedBinding?.relationship === "direct" ||
          observedBinding?.relationship === "supporting"
        ? observedBinding.relationship
        : displayBinding.relationship,
      observedValue: factItemRef in observedValuesByItemRef &&
          (observedBinding?.relationship === "direct" ||
            observedBinding?.relationship === "supporting")
        ? observedValuesByItemRef[factItemRef]
        : null,
      current: true,
    })];
  }).sort((left, right) =>
    compareCustomerDocumentFactSourceOrder({
      sourceDocumentType: left.sourceDocumentType,
      immutableSourceIdentity: left.evidenceRootRef,
      semanticRole: left.semanticRole,
      sourceLabel: left.fileName,
      value: left.observedValue,
    }, {
      sourceDocumentType: right.sourceDocumentType,
      immutableSourceIdentity: right.evidenceRootRef,
      semanticRole: right.semanticRole,
      sourceLabel: right.fileName,
      value: right.observedValue,
    })
  );
  return Object.freeze(inputs);
}

export function selectCustomerCorrectionActiveFactSources(
  params: CustomerCorrectionActiveFactSourceParams,
): readonly CustomerDocumentFactActiveSource[] {
  return projectCustomerDocumentFactActiveSources(
    selectCustomerCorrectionActiveFactSourceInputs(params).map((source) =>
      Object.freeze({
        ...source,
        canonicalFactKey: params.definition.factKey,
        scopeRef: params.scopeRef,
        comparisonRole: params.definition.id,
        current: source.current !== false,
      })
    ),
  ).matrixSources;
}

export function createCustomerCorrectionDraft(
  items: readonly CustomerCorrectionHandoffItem[],
): CustomerCorrectionDraft {
  return Object.freeze(
    Object.fromEntries(items.map((item) => [item.itemRef, ""])),
  );
}

export function projectCustomerCorrectionParserFacts(
  items: readonly CustomerCorrectionHandoffItem[],
  target: CustomerCorrectionReplacementTarget,
  observedFacts: readonly CustomerCorrectionParserFact[],
): CustomerCorrectionParserProjection {
  const scopedItems = items.filter((item) =>
    target.itemRefs.includes(item.itemRef) &&
    item.replacementTarget?.replacementTargetRef ===
      target.replacementTargetRef
  );
  const itemByFactKey = new Map<
    DocumentFactKey,
    CustomerCorrectionHandoffItem
  >();
  for (const item of scopedItems) {
    if (!customerCorrectionFactRowDefinition(item)) {
      return Object.freeze({
        observedValuesByItemRef: Object.freeze({}),
        extractionMethodsByItemRef: Object.freeze({}),
        prefills: Object.freeze([]),
      });
    }
    if (itemByFactKey.has(item.factKey)) {
      return Object.freeze({
        observedValuesByItemRef: Object.freeze({}),
        extractionMethodsByItemRef: Object.freeze({}),
        prefills: Object.freeze([]),
      });
    }
    itemByFactKey.set(item.factKey, item);
  }
  const observedValuesByItemRef: Record<string, string | null> = {};
  const extractionMethodsByItemRef: Record<string, string | null> = {};
  const prefills: Array<Readonly<{ itemRef: string; observedValue: string }>> =
    [];
  for (const fact of observedFacts) {
    const item = itemByFactKey.get(fact.factKey);
    if (!item) continue;
    observedValuesByItemRef[item.itemRef] = fact.observedValue;
    extractionMethodsByItemRef[item.itemRef] = fact.extractionMethod || null;
    if (fact.observedValue) {
      prefills.push(Object.freeze({
        itemRef: item.itemRef,
        observedValue: fact.observedValue,
      }));
    }
  }
  return Object.freeze({
    observedValuesByItemRef: Object.freeze(observedValuesByItemRef),
    extractionMethodsByItemRef: Object.freeze(extractionMethodsByItemRef),
    prefills: Object.freeze(prefills),
  });
}

export function customerCorrectionFactRowDefinition(
  item: CustomerCorrectionHandoffItem,
): CustomerDocumentFactRowDefinition | null {
  const sourceDocumentType = item.documentLabel === "Energiedocument"
    ? "energy_bill_or_contract"
    : "installation_invoice";
  const matches = [
    ...selectCustomerDocumentFactRows("location"),
    ...selectCustomerDocumentFactRows("charger"),
  ].filter((row) =>
    row.factKey === item.factKey &&
    row.evidenceBindings.some((binding) =>
      binding.sourceDocumentType === sourceDocumentType
    )
  );
  return matches.length === 1 ? matches[0] : null;
}

export function resetCustomerCorrectionTargetLocalState(
  draft: CustomerCorrectionDraft,
  unconfirmedParserPrefills: ReadonlySet<string>,
  target: CustomerCorrectionReplacementTarget,
): CustomerCorrectionTargetReset {
  const clearedItemRefs = [...target.itemRefs];
  const nextDraft = { ...draft };
  for (const itemRef of clearedItemRefs) nextDraft[itemRef] = "";
  const nextUnconfirmed = new Set(unconfirmedParserPrefills);
  for (const itemRef of clearedItemRefs) nextUnconfirmed.delete(itemRef);
  return Object.freeze({
    draft: Object.freeze(nextDraft),
    unconfirmedParserPrefills: Object.freeze(nextUnconfirmed),
    clearedItemRefs: Object.freeze(clearedItemRefs),
  });
}

export function rebuildCustomerCorrectionTargetLocalState(
  items: readonly CustomerCorrectionHandoffItem[],
  draft: CustomerCorrectionDraft,
  unconfirmedParserPrefills: ReadonlySet<string>,
  target: CustomerCorrectionReplacementTarget,
  observedFacts: readonly CustomerCorrectionParserFact[],
): CustomerCorrectionTargetRebuild {
  const reset = resetCustomerCorrectionTargetLocalState(
    draft,
    unconfirmedParserPrefills,
    target,
  );
  const projection = projectCustomerCorrectionParserFacts(
    items,
    target,
    observedFacts,
  );
  const valueItemRefs = new Set(
    items.filter((item) =>
      target.itemRefs.includes(item.itemRef) &&
      item.responseRequirement !== "DOCUMENT_REPLACEMENT"
    ).map((item) => item.itemRef),
  );
  const nextDraft = { ...reset.draft };
  const nextUnconfirmed = new Set(reset.unconfirmedParserPrefills);
  for (const prefill of projection.prefills) {
    if (!valueItemRefs.has(prefill.itemRef)) continue;
    nextDraft[prefill.itemRef] = prefill.observedValue;
    nextUnconfirmed.add(prefill.itemRef);
  }
  return Object.freeze({
    draft: Object.freeze(nextDraft),
    unconfirmedParserPrefills: Object.freeze(nextUnconfirmed),
    clearedItemRefs: reset.clearedItemRefs,
    observedValuesByItemRef: projection.observedValuesByItemRef,
  });
}

/**
 * Replacement target refs are the correction flow's exact document authority.
 * Value-only items may join that scope only when there is exactly one target of
 * the same document kind; otherwise they remain fail-closed in their own item
 * scope instead of being associated by array position or display label.
 */
export function selectCustomerCorrectionFactScopes(
  items: readonly CustomerCorrectionWorkspaceItem[],
): readonly CustomerCorrectionFactScope[] {
  const byTarget = new Map<string, CustomerCorrectionWorkspaceItem[]>();
  for (const item of items) {
    const targetRef = item.item.replacementTarget?.replacementTargetRef;
    if (!targetRef) continue;
    const targetItems = byTarget.get(targetRef) || [];
    targetItems.push(item);
    byTarget.set(targetRef, targetItems);
  }
  const targetRefsByDocument = new Map<string, string[]>();
  for (const [targetRef, targetItems] of byTarget) {
    const documentLabel = targetItems[0]?.item.documentLabel;
    if (!documentLabel) continue;
    const refs = targetRefsByDocument.get(documentLabel) || [];
    refs.push(targetRef);
    targetRefsByDocument.set(documentLabel, refs);
  }
  const valueOnlyScopes = new Map<string, CustomerCorrectionWorkspaceItem[]>();
  for (const item of items) {
    if (item.item.replacementTarget) continue;
    const refs = targetRefsByDocument.get(item.item.documentLabel) || [];
    if (refs.length === 1) {
      byTarget.get(refs[0])?.push(item);
      continue;
    }
    const scopeRef = refs.length === 0
      ? `value-only:${item.item.documentLabel}`
      : `item:${item.item.itemRef}`;
    const scopedItems = valueOnlyScopes.get(scopeRef) || [];
    scopedItems.push(item);
    valueOnlyScopes.set(scopeRef, scopedItems);
  }
  return Object.freeze(
    [...byTarget, ...valueOnlyScopes].flatMap(([scopeRef, scopedItems]) => {
      const grouped = new Map<
        CustomerDocumentFactGroup,
        CustomerCorrectionWorkspaceItem[]
      >();
      for (const item of scopedItems) {
        const group = customerCorrectionFactRowDefinition(item.item)?.group;
        if (!group) continue;
        const values = grouped.get(group) || [];
        values.push(item);
        grouped.set(group, values);
      }
      return [...grouped].map(([group, values]) =>
        Object.freeze({
          scopeRef,
          group,
          items: Object.freeze(values),
        })
      );
    }),
  );
}

export function customerCorrectionItemSetKey(
  items: readonly CustomerCorrectionHandoffItem[],
): string {
  return items.map((item) => item.itemRef).join(":");
}

export function buildCustomerCorrectionWorkspace(
  items: readonly CustomerCorrectionHandoffItem[],
  draft: CustomerCorrectionDraft,
  candidateSelections: CustomerCorrectionCandidateSelections = {},
  unconfirmedParserPrefills: ReadonlySet<string> = new Set(),
): CustomerCorrectionWorkspace {
  const targetMap = new Map<string, {
    target: NonNullable<CustomerCorrectionHandoffItem["replacementTarget"]>;
    itemRefs: string[];
    contractValid: boolean;
  }>();
  for (const item of items) {
    if (!item.replacementTarget) continue;
    const ref = item.replacementTarget.replacementTargetRef;
    const current = targetMap.get(ref);
    if (!current) {
      targetMap.set(ref, {
        target: item.replacementTarget,
        itemRefs: [item.itemRef],
        contractValid: true,
      });
      continue;
    }
    current.itemRefs.push(item.itemRef);
    current.contractValid = current.contractValid &&
      current.target.documentLabel === item.replacementTarget.documentLabel &&
      current.target.maximumFileSize ===
        item.replacementTarget.maximumFileSize &&
      current.target.acceptedMimeTypes.join("|") ===
        item.replacementTarget.acceptedMimeTypes.join("|");
  }

  const replacementTargets = [...targetMap.entries()].map(
    ([replacementTargetRef, grouped]): CustomerCorrectionReplacementTarget => {
      const selected = candidateSelections[replacementTargetRef];
      const candidateRef = selected &&
          REPLACEMENT_CANDIDATE_REFERENCE_RE.test(selected.candidateRef)
        ? selected.candidateRef
        : null;
      return Object.freeze({
        replacementTargetRef,
        documentLabel: grouped.target.documentLabel,
        acceptedMimeTypes: grouped.target.acceptedMimeTypes,
        maximumFileSize: grouped.target.maximumFileSize,
        itemRefs: Object.freeze([...grouped.itemRefs]),
        candidateRef,
        ready: grouped.contractValid && candidateRef !== null,
      });
    },
  );
  const targetByRef = new Map(
    replacementTargets.map((target) => [target.replacementTargetRef, target]),
  );
  const documentSections: CustomerCorrectionDocumentSection[] = [];
  const sectionIds = new Set<string>();
  for (const item of items) {
    const target = item.replacementTarget
      ? targetByRef.get(item.replacementTarget.replacementTargetRef) ?? null
      : null;
    const id = target
      ? `replacement:${target.replacementTargetRef}`
      : `item:${item.itemRef}`;
    if (sectionIds.has(id)) continue;
    sectionIds.add(id);
    documentSections.push(Object.freeze({
      id,
      documentLabel: item.documentLabel,
      itemRefs: target ? target.itemRefs : Object.freeze([item.itemRef]),
      replacementTarget: target,
    }));
  }

  const workspaceItems = items.map((item): CustomerCorrectionWorkspaceItem => {
    const correctedValue = draft[item.itemRef] ?? "";
    const normalizedValue = normalizeCustomerCorrectionValue(correctedValue);
    const requiresValue = item.responseRequirement !== "DOCUMENT_REPLACEMENT";
    const requiresReplacement = item.responseRequirement ===
        "DOCUMENT_REPLACEMENT" ||
      item.responseRequirement === "VALUE_PLUS_DOCUMENT_REPLACEMENT";
    const comparableCurrentValue = "currentValue" in item
      ? normalizeCustomerCorrectionValue(
        customerCorrectionCurrentValueText(item.currentValue),
      )
      : "";
    const sameAsCurrentValue = requiresValue &&
      item.responseRequirement !== "MISSING_VALUE" &&
      comparableCurrentValue !== "" &&
      normalizedValue === comparableCurrentValue;
    const parserPrefillNeedsConfirmation = requiresValue &&
      unconfirmedParserPrefills.has(item.itemRef);
    const valueValid = !requiresValue || (
      normalizedValue.length >= 1 &&
      normalizedValue.length <= CUSTOMER_CORRECTION_VALUE_MAX_LENGTH &&
      !sameAsCurrentValue && !parserPrefillNeedsConfirmation
    );
    const target = item.replacementTarget
      ? targetByRef.get(item.replacementTarget.replacementTargetRef)
      : null;
    const replacementValid = !requiresReplacement || target?.ready === true;
    return Object.freeze({
      item,
      correctedValue,
      normalizedValue,
      requiresValue,
      requiresReplacement,
      showCurrentValue: requiresValue &&
        item.responseRequirement !== "MISSING_VALUE",
      valid: valueValid && replacementValid,
      sameAsCurrentValue,
      parserPrefillNeedsConfirmation,
    });
  });
  const hasUnsupportedAction =
    workspaceItems.some((item) =>
      item.requiresReplacement && !item.item.replacementTarget
    ) || replacementTargets.some((target) =>
      !targetMap.get(target.replacementTargetRef)?.contractValid
    );
  const ready = workspaceItems.length > 0 && !hasUnsupportedAction &&
    workspaceItems.every((item) => item.valid) &&
    replacementTargets.every((target) => target.ready);
  const responses: readonly CustomerCorrectionResponse[] = ready
    ? workspaceItems.map((workspaceItem) => {
      const target = workspaceItem.item.replacementTarget
        ? targetByRef.get(
          workspaceItem.item.replacementTarget.replacementTargetRef,
        )
        : null;
      return Object.freeze({
        itemRef: workspaceItem.item.itemRef,
        ...(workspaceItem.requiresValue
          ? { correctedValue: workspaceItem.normalizedValue }
          : {}),
        ...(workspaceItem.requiresReplacement && target?.candidateRef
          ? { replacementCandidateRef: target.candidateRef }
          : {}),
      }) as CustomerCorrectionResponse;
    })
    : [];
  return Object.freeze({
    items: Object.freeze(workspaceItems),
    replacementTargets: Object.freeze(replacementTargets),
    documentSections: Object.freeze(documentSections),
    responses: Object.freeze(responses),
    hasUnsupportedAction,
    ready,
  });
}

export function customerCorrectionChallengeBindingKey(
  responses: readonly CustomerCorrectionResponse[],
  factResolutions: readonly CustomerCorrectionFactResolution[],
  typedFullName: string,
  intentAccepted: boolean,
): string {
  return JSON.stringify({
    factResolutions,
    responses,
    typedFullName,
    intentAccepted,
  });
}
