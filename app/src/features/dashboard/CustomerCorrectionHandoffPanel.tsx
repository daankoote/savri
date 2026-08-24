import { useMemo, useRef, useState } from "react";
import type { DocumentEvidenceUploadCardProps } from "../documents/DocumentEvidenceUploadCard.tsx";
import {
  allRequiredDocumentEvidenceReady,
  DocumentEvidenceWorkflow,
  type DocumentEvidenceWorkflowGroup,
} from "../documents/DocumentEvidenceWorkflow.tsx";
import {
  createCustomerDocumentWorkflowGroup,
  createCustomerDocumentWorkflowModel,
  createCustomerDocumentUploadCardModel,
  type CustomerDocumentWorkflowFactInput,
  type CustomerDocumentWorkflowSourceInput,
} from "../documents/CustomerDocumentWorkflowController.ts";
import { SignerPanel } from "../signup/signing/SignerPanel.tsx";
import { selectDocumentFactApplicability } from "../signup/documentFactApplicability.ts";
import {
  type CustomerDocumentFactRowDefinition,
  selectCustomerDocumentFactRows,
} from "../signup/documentFactRegistry.ts";
import type { SignerInput } from "../signup/signing/signatureMethod.ts";
import {
  isTypedNameOtpFullNameValid,
  normalizeTypedNameOtpFullName,
  typedNameOtpSignerNamesMatch,
} from "../signup/signing/methods/typedNameOtpV1.ts";
import type {
  DashboardAccountType,
  DashboardCharger,
  DashboardLocation,
  DashboardReadModel,
} from "./dashboardTypes.ts";
import {
  CUSTOMER_CORRECTION_LEGAL_BUNDLE,
  type CustomerCorrectionChallengeReceipt,
  type CustomerCorrectionCurrentReplacementCandidate,
  type CustomerCorrectionFactResolution,
  type CustomerCorrectionHandoffItem,
  type CustomerCorrectionReason,
  finalizeCustomerCorrection,
  requestCustomerCorrectionChallenge,
} from "./customerCorrectionHandoffClient.ts";
import {
  buildCustomerCorrectionWorkspace,
  createCustomerCorrectionDraft,
  CUSTOMER_CORRECTION_VALUE_MAX_LENGTH,
  type CustomerCorrectionCandidateSelections,
  customerCorrectionChallengeBindingKey,
  customerCorrectionCurrentValueText,
  type CustomerCorrectionReplacementTarget,
  type CustomerCorrectionWorkspaceItem,
  normalizeCustomerCorrectionValue,
  projectCustomerCorrectionParserFacts,
  rebuildCustomerCorrectionTargetLocalState,
  resetCustomerCorrectionTargetLocalState,
  selectCustomerCorrectionActiveFactSourceInputs,
  selectCustomerCorrectionFactScopes,
} from "./customerCorrectionWorkspace.ts";
import {
  createCustomerCorrectionReplacementUploadAttempt,
  type CustomerCorrectionReplacementError,
  type CustomerCorrectionReplacementReceipt,
  type CustomerCorrectionReplacementUploadAttempt,
  isCustomerCorrectionPdf,
  uploadCustomerCorrectionReplacement,
  withdrawCustomerCorrectionReplacement,
} from "./customerCorrectionReplacementUpload.ts";
import type { CustomerCorrectionHandoffState } from "./useCustomerCorrectionHandoff.ts";

const CUSTOMER_REASON_LABELS: Readonly<
  Record<CustomerCorrectionReason, string>
> = Object.freeze({
  MISSING_INFORMATION: "Gegeven ontbreekt",
  INCORRECT_INFORMATION: "Gegeven onjuist",
  INCONSISTENT_INFORMATION: "Gegevens komen niet overeen",
  OTHER: "Anders",
});

export function customerCorrectionReasonLabel(
  reason: CustomerCorrectionReason,
): string {
  return CUSTOMER_REASON_LABELS[reason];
}

export function customerCorrectionRowStatusLabel(
  workspaceItem: CustomerCorrectionWorkspaceItem,
): "Handmatig aangepast" | "Nog invullen" {
  return workspaceItem.valid ? "Handmatig aangepast" : "Nog invullen";
}

export type ReplacementUploadUiState =
  | Readonly<{ status: "EMPTY" }>
  | Readonly<{
    status: "RETAINED";
    receipt: CustomerCorrectionReplacementReceipt;
  }>
  | Readonly<{
    status: "WITHDRAWING";
    receipt: CustomerCorrectionReplacementReceipt;
  }>
  | Readonly<{
    status: "UPLOADING";
    file: File;
    attempt: CustomerCorrectionReplacementUploadAttempt;
  }>
  | Readonly<{
    status: "PARSING";
    file: File;
    attempt: CustomerCorrectionReplacementUploadAttempt;
  }>
  | Readonly<{
    status: "READY";
    file: File;
    attempt: CustomerCorrectionReplacementUploadAttempt;
    receipt: CustomerCorrectionReplacementReceipt;
  }>
  | Readonly<{
    status: "ERROR";
    file: File;
    attempt: CustomerCorrectionReplacementUploadAttempt;
    error: CustomerCorrectionReplacementError;
  }>;

type CustomerCorrectionSourceSelection = Readonly<{
  sourceId: string;
  value: string;
}>;

export function createCustomerCorrectionReplacementUploadCardModel({
  onFileChange,
  onRemove,
  onRetry,
  retainedFileName,
  state,
  target,
  scope = target.documentLabel === "Energiedocument"
    ? "Locatie 1"
    : "Laadpaal 1",
}: {
  onFileChange: (file: File | null) => void;
  onRemove?: () => void;
  onRetry: () => void;
  retainedFileName?: string | null;
  state: ReplacementUploadUiState;
  target: CustomerCorrectionReplacementTarget;
  scope?: string;
}): DocumentEvidenceUploadCardProps {
  const busy = state.status === "UPLOADING" || state.status === "PARSING" ||
    state.status === "WITHDRAWING";
  const sharedStatus = state.status === "RETAINED"
    ? "READY" as const
    : state.status === "WITHDRAWING"
    ? "PARSING" as const
    : state.status;

  return createCustomerDocumentUploadCardModel({
    state: sharedStatus,
    disabled: busy,
    errorMessage: state.status === "ERROR" ? state.error.message : undefined,
    fileName: "file" in state
      ? state.file.name
      : state.status === "RETAINED" || state.status === "WITHDRAWING"
      ? state.receipt.fileName || retainedFileName || undefined
      : undefined,
    onFileChange,
    onRemove: onRemove &&
        (state.status === "READY" || state.status === "RETAINED")
      ? onRemove
      : undefined,
    onRetry: state.status === "ERROR" && state.error.stage !== "precheck"
      ? onRetry
      : undefined,
    scope,
    statusLabel: state.status === "WITHDRAWING" ? "Verwijderen…" : undefined,
    title: target.documentLabel === "Energiedocument"
      ? "Energienota of energiecontract"
      : "Installatiefactuur",
  });
}

function retainedReplacementUploads(
  candidates: readonly CustomerCorrectionCurrentReplacementCandidate[],
): Readonly<Record<string, ReplacementUploadUiState>> {
  return Object.freeze(Object.fromEntries(candidates.map((candidate) => [
    candidate.replacementTargetRef,
    Object.freeze({
      status: "RETAINED" as const,
      receipt: Object.freeze({
        candidateRef: candidate.candidateRef,
        replacementTargetRef: candidate.replacementTargetRef,
        fileName: candidate.fileName,
        contentFingerprint: candidate.contentFingerprint,
        observedFacts: candidate.parserObservation?.observedFacts ??
          Object.freeze([]),
      }),
    }),
  ])));
}

function initialCorrectionInputs(
  items: readonly CustomerCorrectionHandoffItem[],
  candidates: readonly CustomerCorrectionCurrentReplacementCandidate[],
): Readonly<{
  draft: Readonly<Record<string, string>>;
  unconfirmed: ReadonlySet<string>;
}> {
  const draft = { ...createCustomerCorrectionDraft(items) };
  const unconfirmed = new Set<string>();
  const targets = buildCustomerCorrectionWorkspace(items, draft)
    .replacementTargets;
  for (const candidate of candidates) {
    const target = targets.find((entry) =>
      entry.replacementTargetRef === candidate.replacementTargetRef
    );
    if (!target || !candidate.parserObservation) continue;
    const projection = projectCustomerCorrectionParserFacts(
      items,
      target,
      candidate.parserObservation.observedFacts,
    );
    for (const prefill of projection.prefills) {
      const item = items.find((entry) => entry.itemRef === prefill.itemRef);
      if (
        !item || item.responseRequirement === "DOCUMENT_REPLACEMENT" ||
        draft[prefill.itemRef]?.trim()
      ) continue;
      draft[prefill.itemRef] = prefill.observedValue;
      unconfirmed.add(prefill.itemRef);
    }
  }
  return Object.freeze({
    draft: Object.freeze(draft),
    unconfirmed: Object.freeze(unconfirmed),
  });
}

function locationCurrentValue(
  location: DashboardLocation | null,
  factKey: string,
): string {
  if (!location || factKey !== "structuredAddress") return "";
  if (location.declared_address) return location.declared_address;
  const houseNumber = `${location.address.house_number}${
    location.address.suffix || ""
  }`;
  return [
    [location.address.street, houseNumber].filter(Boolean).join(" "),
    [location.address.postcode, location.address.city].filter(Boolean).join(
      " ",
    ),
    location.address.country,
  ].filter(Boolean).join(", ");
}

function chargerCurrentValue(
  charger: DashboardCharger | null,
  location: DashboardLocation | null,
  factKey: string,
): string {
  if (factKey === "structuredAddress") {
    return locationCurrentValue(location, factKey);
  }
  if (!charger) return "";
  if (factKey === "chargerBrand") return charger.brand || "";
  if (factKey === "chargerModel") return charger.model || "";
  if (factKey === "midNumber") return charger.mid_number || "";
  if (factKey === "serialNumber") return charger.serial_number || "";
  return "";
}


function createCorrectionCustomerWorkflowGroup({
  group,
  title,
  definitions,
  evidenceReady,
  items,
  currentValue,
  observedValuesByItemRef,
  extractionMethodsByItemRef,
  manualResolutionItemRefs,
  sourceFileNameByItemRef,
  sourceContentFingerprintByItemRef,
  sourceIdentityByItemRef,
  sourceSelections,
  factResolutions,
  lockedSources,
  onConfirmValue,
  onRestoreSource,
  onSelectSource,
  scopeRef,
}: {
  group: "location" | "charger";
  title: string;
  definitions: readonly CustomerDocumentFactRowDefinition[];
  evidenceReady: boolean;
  items: readonly CustomerCorrectionWorkspaceItem[];
  currentValue: (factKey: string) => string;
  observedValuesByItemRef: Readonly<Record<string, string | null>>;
  extractionMethodsByItemRef: Readonly<Record<string, string | null>>;
  manualResolutionItemRefs: ReadonlySet<string>;
  sourceFileNameByItemRef: Readonly<Record<string, string>>;
  sourceContentFingerprintByItemRef: Readonly<Record<string, string | null>>;
  sourceIdentityByItemRef: Readonly<Record<string, string>>;
  sourceSelections: Readonly<Record<string, CustomerCorrectionSourceSelection>>;
  factResolutions: CustomerCorrectionFactResolution[];
  lockedSources: (
    definition: CustomerDocumentFactRowDefinition,
  ) => readonly Readonly<{
    fileName: string;
    sourceDocumentType:
      | "energy_bill_or_contract"
      | "installation_invoice";
  }>[];
  onConfirmValue: (
    itemRefs: readonly string[],
    value: string,
    resolution: "source" | "manual",
  ) => void;
  onRestoreSource: (itemRefs: readonly string[], value: string) => void;
  onSelectSource: (
    itemRefs: readonly string[],
    sourceId: string,
    value: string,
  ) => void;
  scopeRef: string;
}) {
  const itemByFactKey = new Map<string, CustomerCorrectionWorkspaceItem[]>();
  for (const item of items) {
    const factItems = itemByFactKey.get(item.item.factKey) || [];
    factItems.push(item);
    itemByFactKey.set(item.item.factKey, factItems);
  }
  const replacedSourceTypes = new Set(
    items.flatMap((item) =>
      item.requiresReplacement
        ? [item.item.documentLabel === "Energiedocument"
          ? "energy_bill_or_contract" as const
          : "installation_invoice" as const]
        : []
    ),
  );
  const valueItemsByFactKey = new Map<
    string,
    readonly CustomerCorrectionWorkspaceItem[]
  >();
  const facts = definitions.map((definition): CustomerDocumentWorkflowFactInput => {
    const workspaceItems = itemByFactKey.get(definition.factKey) || [];
    const valueItems = workspaceItems.filter((item) => item.requiresValue);
    valueItemsByFactKey.set(definition.factKey, valueItems);
    const current = currentValue(definition.factKey);
    if (workspaceItems.length === 0) {
      const sources: CustomerDocumentWorkflowSourceInput[] = lockedSources(
        definition,
      ).flatMap((source, index) => {
        const binding = definition.evidenceBindings.find((candidate) =>
          candidate.sourceDocumentType === source.sourceDocumentType &&
          candidate.relationship === "direct"
        ) || definition.evidenceBindings.find((candidate) =>
          candidate.sourceDocumentType === source.sourceDocumentType
        );
        if (!binding) return [];
        return [Object.freeze({
          sourceRef: scopeRef + ":" + definition.id + ":locked:" + index,
          evidenceRootRef: scopeRef + ":locked:" + source.fileName,
          contentFingerprint: null,
          fileName: source.fileName,
          sourceDocumentType: source.sourceDocumentType,
          semanticRole: binding.semanticRoles[0],
          relationship: binding.relationship,
          observedValue: current || null,
          current: true,
        })];
      });
      return Object.freeze({
        factKey: definition.factKey,
        sources,
        editable: false,
        browserResolution: "LOCKED",
        actualReviewTruth: definition.evidenceBindings.some((binding) =>
            replacedSourceTypes.has(binding.sourceDocumentType)
          )
          ? "Nog te beoordelen"
          : "Akkoord",
        customerValue: current || undefined,
        currentValue: current,
        emptyValue: "",
        editor: "text",
        isValid: () => false,
      });
    }
    const sources = selectCustomerCorrectionActiveFactSourceInputs({
      definition,
      items,
      scopeRef,
      sourceFileNameByItemRef,
      sourceContentFingerprintByItemRef,
      observedValuesByItemRef,
      extractionMethodsByItemRef,
      sourceIdentityByItemRef,
    });
    const valueConfirmed = valueItems.length > 0 &&
      valueItems.every((item) =>
        Boolean(item.normalizedValue) && !item.sameAsCurrentValue &&
        !item.parserPrefillNeedsConfirmation
      );
    const selectedSource = valueItems.map((item) =>
      sourceSelections[item.item.itemRef]
    ).find((selection) => selection !== undefined);
    const manuallyAdjusted = valueConfirmed &&
      valueItems.every((item) =>
        manualResolutionItemRefs.has(item.item.itemRef)
      );
    const browserResolution = valueItems.length === 0
      ? "LOCKED" as const
      : !valueConfirmed
      ? "UNRESOLVED" as const
      : manuallyAdjusted
      ? "MANUAL_CONFIRMED" as const
      : selectedSource
      ? "CONFLICT_SOURCE_SELECTED" as const
      : "CLEAN_SOURCE_CONFIRMED" as const;
    const itemRefs = valueItems.map((item) => item.item.itemRef);
    return Object.freeze({
      factKey: definition.factKey,
      sources,
      editable: valueItems.length > 0,
      browserResolution,
      actualReviewTruth: valueItems.length === 0
        ? "Nog te beoordelen"
        : "Correctie nodig",
      customerValue: valueItems[0]?.normalizedValue || undefined,
      currentValue: current,
      selectedSourceRef: selectedSource?.sourceId,
      emptyValue: "",
      editor: "text",
      maxLength: CUSTOMER_CORRECTION_VALUE_MAX_LENGTH,
      isValid: (next) => {
        if (typeof next !== "string") return false;
        const normalized = normalizeCustomerCorrectionValue(next);
        return normalized.length >= 1 &&
          normalized.length <= CUSTOMER_CORRECTION_VALUE_MAX_LENGTH &&
          valueItems.every((item) =>
            !("currentValue" in item.item) ||
            normalized !== normalizeCustomerCorrectionValue(
              customerCorrectionCurrentValueText(item.item.currentValue),
            )
          );
      },
      normalize: (next) =>
        typeof next === "string"
          ? normalizeCustomerCorrectionValue(next)
          : next,
      onConfirm: valueItems.length > 0
        ? (next, resolution) => {
          if (typeof next === "string") {
            onConfirmValue(itemRefs, next, resolution);
          }
        }
        : undefined,
      onCancel: valueItems.length > 0
        ? (sourceValue) =>
          onRestoreSource(
            itemRefs,
            typeof sourceValue === "string" ? sourceValue : "",
          )
        : undefined,
      onRestoreSource: valueItems.length > 0
        ? (sourceValue) =>
          onRestoreSource(
            itemRefs,
            typeof sourceValue === "string" ? sourceValue : "",
          )
        : undefined,
      onSelectSource: valueItems.length > 0
        ? (source) => {
          if (source.value !== null) {
            onSelectSource(itemRefs, source.id, source.value);
          }
        }
        : undefined,
    });
  });
  const controlled = createCustomerDocumentWorkflowGroup({
    group,
    scopeRef,
    title,
    evidenceReady,
    facts,
  });
  for (const resolved of controlled.facts) {
    if (!resolved.resolutionType) continue;
    const valueItems = valueItemsByFactKey.get(resolved.factKey) || [];
    const selectedSource = valueItems.map((item) =>
      sourceSelections[item.item.itemRef]
    ).find((selection) => selection !== undefined);
    factResolutions.push(Object.freeze({
      itemRefs: Object.freeze(valueItems.map((item) => item.item.itemRef)),
      resolutionType: resolved.resolutionType,
      sources: Object.freeze(resolved.sources.flatMap((source) =>
        (source.relationship === "direct" ||
            source.relationship === "supporting") &&
            source.value !== null
          ? [Object.freeze({
            candidateRef: source.evidenceRootRef,
            relationship: source.relationship,
            selected: selectedSource?.sourceId === source.id,
          })]
          : []
      )),
    }));
  }
  return controlled.group;
}

function ReadyCustomerCorrectionHandoffPanel({
  accessToken,
  accountType,
  dashboardModel,
  state,
}: {
  accessToken: string;
  accountType: DashboardAccountType;
  dashboardModel: DashboardReadModel;
  state: Extract<CustomerCorrectionHandoffState, { status: "ready" }>;
}) {
  const handoff = state.model.handoff;
  if (!handoff) return null;
  const handoffItems = handoff.items;
  const signerAuthority = handoff.signerAuthority;
  const expectedSignerName = signerAuthority.status === "available"
    ? signerAuthority.expectedSignerDisplayName
    : "";
  const initialInputs = useMemo(
    () =>
      initialCorrectionInputs(
        handoffItems,
        handoff.currentReplacementCandidates,
      ),
    [handoff.currentReplacementCandidates, handoffItems],
  );

  const [draft, setDraft] = useState(() => initialInputs.draft);
  const [replacementUploads, setReplacementUploads] = useState<
    Readonly<Record<string, ReplacementUploadUiState>>
  >(() => retainedReplacementUploads(handoff.currentReplacementCandidates));
  const [unconfirmedParserPrefills, setUnconfirmedParserPrefills] = useState<
    ReadonlySet<string>
  >(() => initialInputs.unconfirmed);
  const [sourceSelections, setSourceSelections] = useState<
    Readonly<Record<string, CustomerCorrectionSourceSelection>>
  >({});
  const [manualResolutionItemRefs, setManualResolutionItemRefs] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [signingOpen, setSigningOpen] = useState(false);
  const [signerInput, setSignerInput] = useState<SignerInput>({
    accountType,
    fullName: "",
    role: "",
    intentAccepted: false,
  });
  const [challenge, setChallenge] = useState<
    | null
    | Readonly<{
      bindingKey: string;
      receipt: CustomerCorrectionChallengeReceipt;
    }>
  >(null);
  const [otp, setOtp] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<
    "idle" | "requesting" | "awaiting_otp" | "finalizing" | "error"
  >("idle");
  const [runtimeMessage, setRuntimeMessage] = useState(state.notice ?? "");
  const challengeRequestInFlightRef = useRef(false);
  const finalizeRequestInFlightRef = useRef(false);
  const uploadInFlightRefs = useRef(new Set<string>());
  const staleRecoveryHandledRef = useRef(false);
  const candidateSelections = useMemo<CustomerCorrectionCandidateSelections>(
    () =>
      Object.freeze(Object.fromEntries(
        Object.entries(replacementUploads).flatMap(([targetRef, upload]) =>
          upload.status === "READY" || upload.status === "RETAINED"
            ? [[
              targetRef,
              Object.freeze({
                candidateRef: upload.receipt.candidateRef,
              }),
            ]]
            : []
        ),
      )),
    [replacementUploads],
  );
  const workspace = useMemo(
    () =>
      buildCustomerCorrectionWorkspace(
        handoffItems,
        draft,
        candidateSelections,
        unconfirmedParserPrefills,
      ),
    [candidateSelections, draft, handoffItems, unconfirmedParserPrefills],
  );
  function invalidateChallenge(message = "Vraag een nieuwe code aan.") {
    if (!challenge) return;
    setChallenge(null);
    setOtp("");
    setRuntimeStatus("idle");
    setRuntimeMessage(message);
  }

  function confirmValues(
    itemRefs: readonly string[],
    value: string,
    resolution: "source" | "manual",
  ) {
    staleRecoveryHandledRef.current = false;
    invalidateChallenge();
    setRuntimeMessage("");
    setSourceSelections((current) => {
      const next = { ...current };
      itemRefs.forEach((itemRef) => delete next[itemRef]);
      return Object.freeze(next);
    });
    setManualResolutionItemRefs((current) => {
      const next = new Set(current);
      itemRefs.forEach((itemRef) =>
        resolution === "manual" ? next.add(itemRef) : next.delete(itemRef)
      );
      return next;
    });
    const normalized = normalizeCustomerCorrectionValue(value);
    setDraft((current) =>
      Object.freeze({
        ...current,
        ...Object.fromEntries(itemRefs.map((itemRef) => [itemRef, normalized])),
      })
    );
    setUnconfirmedParserPrefills((current) => {
      const next = new Set(current);
      itemRefs.forEach((itemRef) => next.delete(itemRef));
      return next;
    });
  }

  function restoreSourceValues(
    itemRefs: readonly string[],
    sourceValue: string,
  ) {
    staleRecoveryHandledRef.current = false;
    invalidateChallenge();
    setRuntimeMessage("");
    setSourceSelections((current) => {
      const next = { ...current };
      itemRefs.forEach((itemRef) => delete next[itemRef]);
      return Object.freeze(next);
    });
    setManualResolutionItemRefs((current) => {
      const next = new Set(current);
      itemRefs.forEach((itemRef) => next.delete(itemRef));
      return next;
    });
    const normalized = normalizeCustomerCorrectionValue(sourceValue);
    setDraft((current) =>
      Object.freeze({
        ...current,
        ...Object.fromEntries(itemRefs.map((itemRef) => [itemRef, normalized])),
      })
    );
    setUnconfirmedParserPrefills((current) => {
      const next = new Set(current);
      itemRefs.forEach((itemRef) => next.add(itemRef));
      return next;
    });
  }

  function selectSourceValue(
    itemRefs: readonly string[],
    sourceId: string,
    value: string,
  ) {
    staleRecoveryHandledRef.current = false;
    invalidateChallenge();
    setRuntimeMessage("");
    const normalized = normalizeCustomerCorrectionValue(value);
    setDraft((current) =>
      Object.freeze({
        ...current,
        ...Object.fromEntries(itemRefs.map((itemRef) => [itemRef, normalized])),
      })
    );
    setSourceSelections((current) =>
      Object.freeze({
        ...current,
        ...Object.fromEntries(itemRefs.map((itemRef) => [
          itemRef,
          Object.freeze({ sourceId, value: normalized }),
        ])),
      })
    );
    setManualResolutionItemRefs((current) => {
      const next = new Set(current);
      itemRefs.forEach((itemRef) => next.delete(itemRef));
      return next;
    });
    setUnconfirmedParserPrefills((current) => {
      const next = new Set(current);
      itemRefs.forEach((itemRef) => next.delete(itemRef));
      return next;
    });
  }

  function updateSignerInput(value: SignerInput) {
    staleRecoveryHandledRef.current = false;
    invalidateChallenge();
    setRuntimeMessage("");
    setSignerInput(value);
  }

  function recoverStaleHandoff() {
    if (staleRecoveryHandledRef.current) return;
    staleRecoveryHandledRef.current = true;
    setDraft(createCustomerCorrectionDraft(handoffItems));
    setReplacementUploads({});
    setUnconfirmedParserPrefills(new Set());
    setSourceSelections({});
    setManualResolutionItemRefs(new Set());
    setChallenge(null);
    setOtp("");
    setSigningOpen(false);
    setRuntimeStatus("idle");
    setRuntimeMessage("Aanpassing is gewijzigd. Controleer opnieuw.");
    state.retryStale();
  }

  async function runReplacementUpload(
    target: CustomerCorrectionReplacementTarget,
    file: File,
    attempt: CustomerCorrectionReplacementUploadAttempt,
  ) {
    const targetRef = target.replacementTargetRef;
    if (uploadInFlightRefs.current.has(targetRef)) return;
    uploadInFlightRefs.current.add(targetRef);
    invalidateChallenge();
    setSigningOpen(false);
    setRuntimeMessage("");
    setReplacementUploads((current) =>
      Object.freeze({
        ...current,
        [targetRef]: Object.freeze({
          status: "UPLOADING",
          file,
          attempt,
        }),
      })
    );
    try {
      const result = await uploadCustomerCorrectionReplacement({
        accessToken,
        caseRef: state.model.caseRef,
        target,
        file,
        attempt,
        onStage: (stage) => {
          setReplacementUploads((current) =>
            Object.freeze({
              ...current,
              [targetRef]: Object.freeze({
                status: stage,
                file,
                attempt,
              }),
            })
          );
        },
      });
      if (!result.ok) {
        if (result.error.code === "stale_handoff") {
          recoverStaleHandoff();
          return;
        }
        setReplacementUploads((current) =>
          Object.freeze({
            ...current,
            [targetRef]: Object.freeze({
              status: "ERROR",
              file,
              attempt: result.attempt,
              error: result.error,
            }),
          })
        );
        return;
      }
      setReplacementUploads((current) =>
        Object.freeze({
          ...current,
          [targetRef]: Object.freeze({
            status: "READY",
            file,
            attempt: result.attempt,
            receipt: result.receipt,
          }),
        })
      );
      setDraft((current) =>
        rebuildCustomerCorrectionTargetLocalState(
          handoffItems,
          current,
          new Set(),
          target,
          result.receipt.observedFacts,
        ).draft
      );
      setUnconfirmedParserPrefills((current) =>
        rebuildCustomerCorrectionTargetLocalState(
          handoffItems,
          {},
          current,
          target,
          result.receipt.observedFacts,
        ).unconfirmedParserPrefills
      );
      setSourceSelections((current) => {
        const next = { ...current };
        target.itemRefs.forEach((itemRef) => delete next[itemRef]);
        return Object.freeze(next);
      });
      setManualResolutionItemRefs((current) => {
        const next = new Set(current);
        target.itemRefs.forEach((itemRef) => next.delete(itemRef));
        return next;
      });
    } finally {
      uploadInFlightRefs.current.delete(targetRef);
    }
  }

  function selectReplacementFile(
    target: CustomerCorrectionReplacementTarget,
    file: File | null,
  ) {
    if (!file) return;
    staleRecoveryHandledRef.current = false;
    const attempt = createCustomerCorrectionReplacementUploadAttempt();
    invalidateChallenge();
    setSigningOpen(false);
    setRuntimeMessage("");
    const reset = resetCustomerCorrectionTargetLocalState(
      draft,
      unconfirmedParserPrefills,
      target,
    );
    setDraft(reset.draft);
    setUnconfirmedParserPrefills(reset.unconfirmedParserPrefills);
    setSourceSelections((current) => {
      const next = { ...current };
      target.itemRefs.forEach((itemRef) => delete next[itemRef]);
      return Object.freeze(next);
    });
    setManualResolutionItemRefs((current) => {
      const next = new Set(current);
      target.itemRefs.forEach((itemRef) => next.delete(itemRef));
      return next;
    });
    if (!isCustomerCorrectionPdf(file, target.maximumFileSize)) {
      setReplacementUploads((current) =>
        Object.freeze({
          ...current,
          [target.replacementTargetRef]: Object.freeze({
            status: "ERROR",
            file,
            attempt,
            error: Object.freeze({
              code: "invalid_file" as const,
              stage: "precheck" as const,
              message: "Kies een PDF-bestand van maximaal 15 MB.",
            }),
          }),
        })
      );
      return;
    }
    void runReplacementUpload(target, file, attempt);
  }

  function retryReplacementUpload(target: CustomerCorrectionReplacementTarget) {
    const current = replacementUploads[target.replacementTargetRef];
    if (current?.status !== "ERROR") return;
    void runReplacementUpload(
      target,
      current.file,
      current.attempt,
    );
  }

  async function removeReplacementCandidate(
    target: CustomerCorrectionReplacementTarget,
  ) {
    const targetRef = target.replacementTargetRef;
    const current = replacementUploads[targetRef];
    if (
      !current ||
      (current.status !== "READY" && current.status !== "RETAINED") ||
      uploadInFlightRefs.current.has(targetRef)
    ) return;
    uploadInFlightRefs.current.add(targetRef);
    staleRecoveryHandledRef.current = false;
    invalidateChallenge();
    setSigningOpen(false);
    setRuntimeMessage("");
    setReplacementUploads((uploads) =>
      Object.freeze({
        ...uploads,
        [targetRef]: Object.freeze({
          status: "WITHDRAWING" as const,
          receipt: current.receipt,
        }),
      })
    );
    try {
      const result = await withdrawCustomerCorrectionReplacement({
        accessToken,
        caseRef: state.model.caseRef,
        replacementTargetRef: targetRef,
        candidateRef: current.receipt.candidateRef,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        if (result.error.code === "stale_handoff") {
          recoverStaleHandoff();
          return;
        }
        setReplacementUploads((uploads) =>
          Object.freeze({ ...uploads, [targetRef]: current })
        );
        setRuntimeStatus("error");
        setRuntimeMessage(result.error.message);
        return;
      }
      setDraft((currentDraft) =>
        resetCustomerCorrectionTargetLocalState(
          currentDraft,
          new Set(),
          target,
        ).draft
      );
      setUnconfirmedParserPrefills((currentPrefills) =>
        resetCustomerCorrectionTargetLocalState(
          {},
          currentPrefills,
          target,
        ).unconfirmedParserPrefills
      );
      setSourceSelections((selections) => {
        const next = { ...selections };
        target.itemRefs.forEach((itemRef) => delete next[itemRef]);
        return Object.freeze(next);
      });
      setManualResolutionItemRefs((itemRefs) => {
        const next = new Set(itemRefs);
        target.itemRefs.forEach((itemRef) => next.delete(itemRef));
        return next;
      });
      setReplacementUploads((uploads) =>
        Object.freeze({
          ...uploads,
          [targetRef]: Object.freeze({ status: "EMPTY" as const }),
        })
      );
      setRuntimeStatus("idle");
      setRuntimeMessage("Document verwijderd. Upload een nieuw document.");
    } finally {
      uploadInFlightRefs.current.delete(targetRef);
    }
  }

  async function requestChallenge() {
    if (
      !signingReady || challengeRequestInFlightRef.current ||
      runtimeStatus === "requesting"
    ) return;
    challengeRequestInFlightRef.current = true;
    const issuedBindingKey = bindingKey;
    setRuntimeStatus("requesting");
    setRuntimeMessage("");
    try {
      const result = await requestCustomerCorrectionChallenge({
        accessToken,
        caseRef: state.model.caseRef,
        idempotencyKey: crypto.randomUUID(),
        factResolutions,
        responses: workspace.responses,
        typedFullName: normalizedFullName,
      });
      if (!result.ok) {
        if (result.error.code === "stale_handoff") {
          recoverStaleHandoff();
          return;
        }
        setRuntimeStatus("error");
        setRuntimeMessage(result.error.message);
        return;
      }
      if (currentBindingRef.current !== issuedBindingKey) {
        setRuntimeStatus("idle");
        setRuntimeMessage("Wijzigingen aangepast. Vraag een nieuwe code aan.");
        return;
      }
      setChallenge(Object.freeze({
        bindingKey: issuedBindingKey,
        receipt: result.value,
      }));
      setRuntimeStatus("awaiting_otp");
      setRuntimeMessage(
        `Code verzonden naar ${result.value.deliveryTargetMasked}.`,
      );
    } finally {
      challengeRequestInFlightRef.current = false;
    }
  }

  async function finalizeCorrection() {
    if (
      !challenge || challenge.bindingKey !== bindingKey ||
      !/^\d{6}$/.test(otp) || finalizeRequestInFlightRef.current ||
      runtimeStatus === "finalizing"
    ) return;
    finalizeRequestInFlightRef.current = true;
    setRuntimeStatus("finalizing");
    setRuntimeMessage("");
    try {
      const result = await finalizeCustomerCorrection({
        accessToken,
        caseRef: state.model.caseRef,
        challengeReference: challenge.receipt.challengeReference,
        idempotencyKey: crypto.randomUUID(),
        otp,
        typedFullName: normalizedFullName,
      });
      if (!result.ok) {
        if (result.error.code === "stale_handoff") {
          recoverStaleHandoff();
          return;
        }
        if (result.error.code === "challenge_unavailable") {
          setChallenge(null);
          setOtp("");
        }
        setRuntimeStatus("error");
        setRuntimeMessage(result.error.message);
        return;
      }
      state.retry();
    } finally {
      finalizeRequestInFlightRef.current = false;
    }
  }

  const observedValuesByItemRef: Record<string, string | null> = {};
  const extractionMethodsByItemRef: Record<string, string | null> = {};
  const sourceFileNameByItemRef: Record<string, string> = {};
  const sourceContentFingerprintByItemRef: Record<string, string | null> = {};
  const sourceIdentityByItemRef: Record<string, string> = {};
  for (const target of workspace.replacementTargets) {
    const upload = replacementUploads[target.replacementTargetRef];
    if (
      upload?.status !== "READY" && upload?.status !== "RETAINED"
    ) continue;
    for (const itemRef of target.itemRefs) {
      sourceIdentityByItemRef[itemRef] = upload.receipt.candidateRef;
      sourceFileNameByItemRef[itemRef] = upload.receipt.fileName;
      sourceContentFingerprintByItemRef[itemRef] =
        upload.receipt.contentFingerprint;
    }
    const projection = projectCustomerCorrectionParserFacts(
      handoffItems,
      target,
      upload.receipt.observedFacts,
    );
    Object.assign(observedValuesByItemRef, projection.observedValuesByItemRef);
    Object.assign(
      extractionMethodsByItemRef,
      projection.extractionMethodsByItemRef,
    );
  }

  const correctionFactScopes = selectCustomerCorrectionFactScopes(
    workspace.items,
  );
  const locationScopes = correctionFactScopes.filter((scope) =>
    scope.group === "location"
  );
  const chargerScopes = correctionFactScopes.filter((scope) =>
    scope.group === "charger"
  );
  const locationDefinitions = selectCustomerDocumentFactRows("location")
    .filter((row) =>
      selectDocumentFactApplicability(accountType, row.factKey) !==
        "not_applicable"
    );
  const chargerDefinitions = selectCustomerDocumentFactRows("charger")
    .filter((row) =>
      selectDocumentFactApplicability(accountType, row.factKey) !==
        "not_applicable"
    );
  const exactSingleLocation = dashboardModel.locations.length === 1
    ? dashboardModel.locations[0]
    : null;
  const exactSingleCharger = dashboardModel.chargers.length === 1
    ? dashboardModel.chargers[0]
    : null;
  const locationGroupScopes = exactSingleLocation && locationScopes.length > 0
    ? [{
      scopeRef: `dashboard-location:${exactSingleLocation.location_id}`,
      group: "location" as const,
      items: Object.freeze(locationScopes.flatMap((scope) => scope.items)),
    }]
    : locationScopes.length === 0
    ? dashboardModel.locations.map((location) => ({
      scopeRef: `dashboard-location:${location.location_id}`,
      group: "location" as const,
      items: Object.freeze([] as CustomerCorrectionWorkspaceItem[]),
    }))
    : locationScopes;
  const chargerGroupScopes = exactSingleCharger && chargerScopes.length > 0
    ? [{
      scopeRef: `dashboard-charger:${exactSingleCharger.charger_id}`,
      group: "charger" as const,
      items: Object.freeze(chargerScopes.flatMap((scope) => scope.items)),
    }]
    : chargerScopes.length === 0
    ? dashboardModel.chargers.map((charger) => ({
      scopeRef: `dashboard-charger:${charger.charger_id}`,
      group: "charger" as const,
      items: Object.freeze([] as CustomerCorrectionWorkspaceItem[]),
    }))
    : chargerScopes;
  const displayedSingleLocation = exactSingleLocation;
  const displayedSingleCharger = exactSingleCharger;
  const currentLocationFileName = (location: DashboardLocation | null) =>
    dashboardModel.document_slots.find((slot) =>
      slot.location_id === location?.location_id && !slot.charger_id
    )?.current_file_name || null;
  const currentChargerFileName = (charger: DashboardCharger | null) =>
    dashboardModel.document_slots.find((slot) =>
      slot.charger_id === charger?.charger_id
    )?.current_file_name || null;
  const evidenceSlots = [
    ...workspace.replacementTargets.map((target) => {
      const upload = replacementUploads[target.replacementTargetRef];
      return {
        id: target.replacementTargetRef,
        required: true,
        replacementRequired: true,
        usableEvidenceReady: upload?.status === "READY" ||
          upload?.status === "RETAINED",
      };
    }),
    ...dashboardModel.document_slots.filter((slot) =>
      slot.required &&
      (slot.document_type === "energy_bill_or_contract" ||
        slot.document_type === "installation_invoice") &&
      !workspace.replacementTargets.some((target) =>
        target.documentLabel === (slot.document_type ===
            "energy_bill_or_contract"
          ? "Energiedocument"
          : "Installatiefactuur")
      )
    ).map((slot) => ({
      id: `existing:${slot.document_slot_id}`,
      required: true,
      replacementRequired: false,
      usableEvidenceReady: Boolean(slot.current_file_name) &&
        Boolean(slot.current_version_number),
    })),
  ];
  const evidenceReady = allRequiredDocumentEvidenceReady(evidenceSlots);
  const factResolutionDrafts: CustomerCorrectionFactResolution[] = [];
  const workflowGroups: DocumentEvidenceWorkflowGroup[] = [
    ...locationGroupScopes.map((scope, index) =>
      createCorrectionCustomerWorkflowGroup({
        group: "location",
        title: displayedSingleLocation?.label || `Locatie ${index + 1}`,
        definitions: locationDefinitions,
        evidenceReady,
        items: scope.items,
        currentValue: (factKey) =>
          locationCurrentValue(displayedSingleLocation, factKey),
        observedValuesByItemRef,
        extractionMethodsByItemRef,
        manualResolutionItemRefs,
        sourceFileNameByItemRef,
        sourceContentFingerprintByItemRef,
        sourceIdentityByItemRef,
        sourceSelections,
        factResolutions: factResolutionDrafts,
        lockedSources: (definition) => {
          const sourceTypes = new Set(
            definition.evidenceBindings.filter(
              (binding) => binding.relationship === "direct",
            ).map((binding) => binding.sourceDocumentType),
          );
          const energySources = sourceTypes.has("energy_bill_or_contract")
            ? [currentLocationFileName(displayedSingleLocation)].flatMap(
              (fileName) => fileName
                ? [{
                  fileName,
                  sourceDocumentType: "energy_bill_or_contract" as const,
                }]
                : [],
            )
            : [];
          const currentInstallationSources =
            sourceTypes.has("installation_invoice")
              ? dashboardModel.document_slots.filter((slot) =>
                slot.location_id === displayedSingleLocation?.location_id &&
                Boolean(slot.charger_id)
              ).flatMap((slot) => slot.current_file_name
                ? [{
                  fileName: slot.current_file_name,
                  sourceDocumentType: "installation_invoice" as const,
                }]
                : [])
              : [];
          return [...new Map(
            [...energySources, ...currentInstallationSources].map((source) => [
              source.sourceDocumentType + ":" + source.fileName,
              source,
            ]),
          ).values()];
        },
        onConfirmValue: confirmValues,
        onRestoreSource: restoreSourceValues,
        onSelectSource: selectSourceValue,
        scopeRef: scope.scopeRef,
      })
    ),
    ...chargerGroupScopes.map((scope, index) => {
      const location = displayedSingleCharger
        ? dashboardModel.locations.find((entry) =>
          entry.location_id === displayedSingleCharger.location_id
        ) || null
        : null;
      return createCorrectionCustomerWorkflowGroup({
        group: "charger",
        title: `Laadpaal ${index + 1} · Locatie ${
          location
            ? dashboardModel.locations.findIndex((entry) =>
              entry.location_id === location.location_id
            ) + 1
            : index + 1
        }`,
        definitions: chargerDefinitions,
          evidenceReady,
          items: scope.items,
          currentValue: (factKey) =>
            chargerCurrentValue(displayedSingleCharger, location, factKey),
          observedValuesByItemRef,
          extractionMethodsByItemRef,
          manualResolutionItemRefs,
          sourceFileNameByItemRef,
          sourceContentFingerprintByItemRef,
          sourceIdentityByItemRef,
          sourceSelections,
          factResolutions: factResolutionDrafts,
          lockedSources: () =>
            [currentChargerFileName(displayedSingleCharger)].flatMap(
              (fileName) => fileName
                ? [{
                  fileName,
                  sourceDocumentType: "installation_invoice" as const,
                }]
                : [],
            ),
          onConfirmValue: confirmValues,
          onRestoreSource: restoreSourceValues,
          onSelectSource: selectSourceValue,
          scopeRef: scope.scopeRef,
        });
    }),
  ];
  const factResolutions = workspace.ready
    ? Object.freeze(factResolutionDrafts)
    : Object.freeze([] as CustomerCorrectionFactResolution[]);
  const normalizedFullName = normalizeTypedNameOtpFullName(
    signerInput.fullName,
  );
  const bindingKey = customerCorrectionChallengeBindingKey(
    workspace.responses,
    factResolutions,
    normalizedFullName,
    signerInput.intentAccepted,
  );
  const currentBindingRef = useRef(bindingKey);
  currentBindingRef.current = bindingKey;
  const signingReady = workspace.ready &&
    factResolutions.flatMap((resolution) => resolution.itemRefs).length ===
      workspace.responses.filter((response) => "correctedValue" in response)
        .length &&
    isTypedNameOtpFullNameValid(normalizedFullName) &&
    typedNameOtpSignerNamesMatch(normalizedFullName, expectedSignerName) &&
    signerInput.intentAccepted;
  const fullNameInvalid = Boolean(normalizedFullName) &&
    !typedNameOtpSignerNamesMatch(normalizedFullName, expectedSignerName);
  const targetsByDocument = {
    Energiedocument: workspace.replacementTargets.filter((target) =>
      target.documentLabel === "Energiedocument"
    ),
    Installatiefactuur: workspace.replacementTargets.filter((target) =>
      target.documentLabel === "Installatiefactuur"
    ),
  } as const;
  const uploads = [
    ...targetsByDocument.Energiedocument.map((target, index) => ({
      target,
      scope: displayedSingleLocation?.label || `Locatie ${index + 1}`,
    })),
    ...targetsByDocument.Installatiefactuur.map((target, index) => ({
      target,
      scope: `Laadpaal ${index + 1}`,
    })),
  ].map(({ target, scope }) => {
    const uploadState = replacementUploads[target.replacementTargetRef] ?? {
      status: "EMPTY" as const,
    };
    const retainedFileName = uploadState.status === "RETAINED"
      ? uploadState.receipt.fileName
      : null;
    return {
      id: target.replacementTargetRef,
      card: createCustomerCorrectionReplacementUploadCardModel({
        onFileChange: (file) => selectReplacementFile(target, file),
        onRemove: () => void removeReplacementCandidate(target),
        onRetry: () => retryReplacementUpload(target),
        retainedFileName,
        scope,
        state: uploadState,
        target,
      }),
    };
  });
  const workflowModel = createCustomerDocumentWorkflowModel({
    eyebrow: "Aanpassing nodig",
    evidenceSlots,
    groups: workflowGroups,
    id: "customer-correction-document-workflow",
    primaryAction: !signingOpen
      ? {
        disabled: !workspace.ready || signerAuthority.status !== "available",
        label: "Wijzigingen indienen",
        onClick: () => {
          setSigningOpen(true);
          setRuntimeMessage("");
        },
      }
      : undefined,
    uploads,
  });

  return (
    <>
      <DocumentEvidenceWorkflow {...workflowModel} />

      {workspace.hasUnsupportedAction
        ? (
          <p className="status-message" role="alert">
            Deze aanpassing kan nog niet online worden ingediend.
          </p>
        )
        : null}

      {signerAuthority.status !== "available"
        ? (
          <p className="status-message" role="alert">
            Ondertekenen is niet beschikbaar voor dit account.
          </p>
        )
        : null}

      {signingOpen
        ? (
          <div className="signing-primary-action-boundary" aria-live="polite">
            <p>
              <strong>{CUSTOMER_CORRECTION_LEGAL_BUNDLE.title}</strong>
            </p>
            <SignerPanel
              expectedSignerDisplayName={signerAuthority.status === "available"
                ? signerAuthority.expectedSignerDisplayName
                : undefined}
              fullNameAutoComplete="off"
              fullNameInvalid={fullNameInvalid}
              intentStatement={CUSTOMER_CORRECTION_LEGAL_BUNDLE.statement}
              onChange={updateSignerInput}
              organizationName=""
              sectionId="customer-correction-signer"
              showRole={false}
              value={signerInput}
            />
            {!challenge
              ? (
                <div className="section-actions">
                  <button
                    className="button button-primary"
                    disabled={!signingReady || runtimeStatus === "requesting"}
                    onClick={() => void requestChallenge()}
                    type="button"
                  >
                    {runtimeStatus === "requesting"
                      ? "Code verzenden…"
                      : "Code verzenden"}
                  </button>
                </div>
              )
              : (
                <div className="form-grid form-grid-two">
                  <label className="field">
                    <span>Eenmalige code</span>
                    <input
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setOtp(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )}
                      value={otp}
                    />
                  </label>
                  <div className="field-actions">
                    <button
                      className="button button-primary"
                      disabled={!/^\d{6}$/.test(otp) ||
                        runtimeStatus === "finalizing"}
                      onClick={() => void finalizeCorrection()}
                      type="button"
                    >
                      {runtimeStatus === "finalizing"
                        ? "Ondertekenen…"
                        : "Ondertekening bevestigen"}
                    </button>
                  </div>
                </div>
              )}
            {runtimeMessage
              ? <p className="status-message">{runtimeMessage}</p>
              : null}
          </div>
        )
        : null}
    </>
  );
}

export function CustomerCorrectionHandoffPanel(
  {
    accessToken,
    accountType,
    dashboardModel,
    state,
  }: {
    accessToken: string | null;
    accountType: DashboardAccountType;
    dashboardModel: DashboardReadModel;
    state: CustomerCorrectionHandoffState;
  },
) {
  if (state.status !== "ready") {
    if (state.status !== "error") return null;
    return (
      <section
        className="portal-card-compact"
        aria-label="Dossieractie"
        role="alert"
      >
        <h2>Dossieractie niet beschikbaar</h2>
        <p>{state.error.message}</p>
        <div className="section-actions">
          <button
            className="button button-secondary button-compact"
            onClick={state.retry}
            type="button"
          >
            Opnieuw proberen
          </button>
        </div>
      </section>
    );
  }

  if (!state.model.handoff || !accessToken) return null;
  return (
    <ReadyCustomerCorrectionHandoffPanel
      accessToken={accessToken}
      accountType={accountType}
      dashboardModel={dashboardModel}
      key={`${state.model.caseRef}:${
        state.model.handoff.items.map((item) => item.itemRef).join(":")
      }`}
      state={state}
    />
  );
}
