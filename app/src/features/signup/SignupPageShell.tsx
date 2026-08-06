import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { RoutedPageProps } from "../../routes/types";
import { AppHeader } from "../../shared/components/AppHeader";
import { parseInvoicePdfInput } from "../invoice-analysis/invoicePdfParserAdapter";
import { DocumentFirstCheckMatrix } from "./DocumentFirstCheckMatrix";
import { DocumentFirstDocumentsStep } from "./DocumentFirstDocumentsStep";
import { DocumentFirstSigningSummary } from "./DocumentFirstSigningSummary";
import { DocumentFirstSignupFlow } from "./DocumentFirstSignupFlow";
import {
  createDocumentFirstSignupDraftFromLegacy,
  createFreshDocumentFirstSignupDraft,
  type DocumentFirstFactValue,
  type DocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "./documentFirstSignupModel";
import {
  DOCUMENT_FIRST_STEPS,
  type DocumentFirstStepId,
  selectMapperCompatibleDraft,
  selectMaximumReachableStepIndex,
  selectPersonalInfoAdapter,
  selectStepCompleteness,
} from "./documentFirstSignupSelectors";
import type { DocumentReviewRow } from "./documentReviewMatrix";
import { OrganizationDocumentStepPanel } from "./OrganizationDocumentStepPanel";
import { selectUnifiedFactPresentation } from "./presentation/factPresentationModel";
import { PersonalInfoSection } from "./PersonalInfoSection";
import { SignupFlowNavigation } from "./SignupFlowNavigation";
import {
  hasMeaningfulSignupDraft,
  transitionSignupAccountType,
} from "./signupAccountTypeTransition";
import { transitionSignupStep } from "./signupStepTransition";
import type { AccountDocumentDraft, PersonalInfoDraft } from "./signupTypes";

export const ACCOUNT_TYPE_RESET_CONFIRMATION =
  "Accounttype wijzigen? Alle ingevulde gegevens en geselecteerde documenten worden gewist.";

export function confirmSignupAccountTypeReset(
  confirmChange: (message: string) => boolean = (message) =>
    window.confirm(message),
): boolean {
  return confirmChange(ACCOUNT_TYPE_RESET_CONFIRMATION);
}

function stepIndex(step: DocumentFirstStepId): number {
  return DOCUMENT_FIRST_STEPS.findIndex((candidate) => candidate.id === step);
}

export function SignupPageShell({ currentPath, navigate }: RoutedPageProps) {
  const [draft, dispatch] = useReducer(
    documentFirstSignupReducer,
    "particulier",
    createFreshDocumentFirstSignupDraft,
  );
  const [activeStep, setActiveStep] = useState<DocumentFirstStepId>("account");
  const [activeLocationId, setActiveLocationId] = useState(
    draft.locationOrder[0],
  );
  const draftGenerationRef = useRef(0);
  const organizationAttemptsRef = useRef(0);
  const legacyDraft = useMemo(() => selectMapperCompatibleDraft(draft), [
    draft,
  ]);
  const personalInfo = useMemo(() => selectPersonalInfoAdapter(draft), [draft]);
  const completeness = useMemo(() => selectStepCompleteness(draft), [draft]);
  const maximumReachableStepIndex = useMemo(
    () => selectMaximumReachableStepIndex(draft),
    [draft],
  );
  const presentation = useMemo(
    () => selectUnifiedFactPresentation(draft),
    [draft],
  );
  const changeActiveStep = useCallback(
    (step: DocumentFirstStepId) => transitionSignupStep(step, setActiveStep),
    [],
  );

  useEffect(() => {
    if (!draft.locationOrder.includes(activeLocationId)) {
      setActiveLocationId(draft.locationOrder[0]);
    }
  }, [activeLocationId, draft.locationOrder]);

  useEffect(() => {
    if (stepIndex(activeStep) > maximumReachableStepIndex) {
      changeActiveStep(DOCUMENT_FIRST_STEPS[maximumReachableStepIndex].id);
    }
  }, [activeStep, changeActiveStep, maximumReachableStepIndex]);

  const isDraftGenerationCurrent = useCallback(
    (generation: number) => draftGenerationRef.current === generation,
    [],
  );

  const replaceWithFreshDraft = (fresh: DocumentFirstSignupDraft) => {
    draftGenerationRef.current += 1;
    organizationAttemptsRef.current += 1;
    dispatch({ type: "replace_draft", value: fresh });
    setActiveLocationId(fresh.locationOrder[0]);
    changeActiveStep("account");
  };

  const handleOrganizationDocument = async (
    document: AccountDocumentDraft,
  ) => {
    const generation = draftGenerationRef.current;
    const attempt = organizationAttemptsRef.current + 1;
    organizationAttemptsRef.current = attempt;
    const reset: AccountDocumentDraft = {
      ...document,
      parseStatus: document.file ? "parsing" : "idle",
    };
    dispatch({ type: "update_organization_document", document: reset });
    if (!document.file) return;

    const result = await parseInvoicePdfInput(document.file);
    if (
      organizationAttemptsRef.current !== attempt ||
      !isDraftGenerationCurrent(generation)
    ) return;
    dispatch({
      type: "update_organization_document",
      document: { ...reset, parseStatus: result.ok ? "parsed" : "error" },
    });
    if (!result.ok) return;
    const envelope = result.observation_envelope;
    dispatch({
      type: "set_document_observation",
      documentId: document.clientId,
      value: {
        documentId: document.clientId,
        contentFingerprint: envelope.contentFingerprint,
        parserVersion: envelope.parserVersion,
        envelope,
      },
    });
  };

  const updateAccount = (next: PersonalInfoDraft) => {
    if (next.accountType !== draft.accountBasis.accountType) {
      const confirmationRequired = hasMeaningfulSignupDraft(legacyDraft) ||
        Object.keys(draft.customerConfirmations).length > 0 ||
        Object.keys(draft.manualCorrections).length > 0;
      if (confirmationRequired && !confirmSignupAccountTypeReset()) return;
      const transition = transitionSignupAccountType(
        legacyDraft,
        next.accountType,
        true,
      );
      if (transition.changed) {
        replaceWithFreshDraft(
          createDocumentFirstSignupDraftFromLegacy(transition.draft),
        );
      }
      return;
    }
    dispatch({
      type: "update_account_basis",
      value: { accountType: next.accountType, email: next.email },
    });
  };

  const confirmRow = (row: DocumentReviewRow) => {
    if (
      !row.proposedValue ||
      row.decisionStatus === "blocked" || row.decisionStatus === "ambiguous" ||
      row.decisionStatus === "missing" ||
      row.decisionStatus === "not_applicable"
    ) return;
    dispatch({
      type: "confirm_fact",
      factKey: row.scopeKey,
      canonicalFactKey: row.factKey,
      value: row.proposedValue,
      sourceDocuments: row.sourceDocuments,
      confirmedAt: new Date().toISOString(),
      decisionStatus: row.decisionStatus,
      normalizationApplied: row.normalizationApplied,
      pendingPersistence: false,
    });
  };

  const correctRow = (
    row: DocumentReviewRow,
    value: DocumentFirstFactValue,
  ) => {
    const observedFact =
      row.observations.find((observation) =>
        typeof value === "string" && observation.displayable &&
        observation.value === value
      ) ||
      row.observations.find((observation) =>
        observation.extractionStatus !== "not_applicable"
      ) || null;
    const source = observedFact
      ? {
        documentId: observedFact.sourceDocumentId,
        documentType: observedFact.sourceDocumentType,
      }
      : row.sourceDocuments[0] || (() => {
        const organizationScoped = row.scopeKey.startsWith("account:");
        if (organizationScoped) {
          return {
            documentId: draft.organizationDocument.clientId,
            documentType: "organization_extract" as const,
          };
        }
        const chargerScoped = [
          "installerOrSupplier",
          "chargerBrand",
          "chargerModel",
          "midNumber",
          "serialNumber",
          "invoiceDate",
          "explicitInstallationDate",
        ].includes(row.factKey);
        if (chargerScoped) {
          const scopedChargerId = row.scopeKey.startsWith("charger:")
            ? row.scopeKey.split(":")[1]
            : "";
          const document = draft.chargerDocumentsByChargerId[
            scopedChargerId
          ]?.find((candidate) =>
            candidate.documentType === "installation_invoice"
          );
          return document
            ? {
              documentId: document.clientId,
              documentType: "installation_invoice" as const,
            }
            : undefined;
        }
        const scopedLocationId = row.scopeKey.startsWith("location:")
          ? row.scopeKey.split(":")[1]
          : "";
        const document = draft.energyDocumentsByLocationId[scopedLocationId];
        return document
          ? {
            documentId: document.clientId,
            documentType: "energy_bill_or_contract" as const,
          }
          : undefined;
      })();
    if (!source) return;
    const confirmedAt = new Date().toISOString();
    const correctionType = row.factKey === "structuredAddress" ||
        row.decisionStatus === "review_required"
      ? "customer_declared_difference" as const
      : "parser_correction" as const;
    dispatch({
      type: "set_manual_correction",
      factKey: row.scopeKey,
      canonicalFactKey: row.factKey,
      value,
      sourceDocumentId: source.documentId,
      sourceDocumentType: source.documentType,
      observedFact,
      correctionType,
      confirmedAt,
      pendingPersistence: false,
    });
    dispatch({
      type: "confirm_fact",
      factKey: row.scopeKey,
      canonicalFactKey: row.factKey,
      value,
      sourceDocuments: row.sourceDocuments.length > 0
        ? row.sourceDocuments
        : [source],
      confirmedAt,
      decisionStatus: "review_required",
      normalizationApplied: false,
      pendingPersistence: false,
    });
  };

  const replaceRowDocument = (
    target: Pick<DocumentReviewRow, "sourceDocuments">,
  ) => {
    const chargerSource = target.sourceDocuments.find((source) =>
      source.documentType === "installation_invoice"
    );
    if (chargerSource) {
      const document = Object.values(draft.chargerDocumentsByChargerId)
        .flat().find((candidate) =>
          candidate.clientId === chargerSource.documentId
        );
      if (document) {
        dispatch({
          type: "update_charger_document",
          document: {
            ...document,
            file: null,
            status: "empty",
            observation: null,
            parseStatus: "idle",
          },
        });
        return;
      }
    }
    const energySource = target.sourceDocuments.find((source) =>
      source.documentType === "energy_bill_or_contract"
    );
    if (!energySource) return;
    const document = Object.values(draft.energyDocumentsByLocationId)
      .find((candidate) => candidate.clientId === energySource.documentId);
    if (!document) return;
    dispatch({
      type: "update_energy_document",
      document: { ...document, file: null, status: "empty" },
    });
  };

  const activeStepContent = activeStep === "account"
    ? (
      <>
        <PersonalInfoSection
          fieldErrors={{}}
          onChange={updateAccount}
          value={personalInfo}
        />
        {draft.accountBasis.accountType !== "particulier"
          ? (
            <section className="signup-section">
              <OrganizationDocumentStepPanel
                document={draft.organizationDocument}
                hasObservation={presentation.organizationRows.some((row) =>
                  Boolean(row.canonicalValue)
                )}
                onConfirm={confirmRow}
                onCorrect={correctRow}
                onDocumentChange={(document) =>
                  void handleOrganizationDocument(document)}
                rows={presentation.organizationRows}
              />
            </section>
          )
          : null}
      </>
    )
    : activeStep === "documents"
    ? (
      <>
        <DocumentFirstDocumentsStep
          activeLocationId={activeLocationId}
          dispatch={dispatch}
          draft={draft}
          draftGeneration={draftGenerationRef.current}
          isDraftGenerationCurrent={isDraftGenerationCurrent}
          onSelectLocation={setActiveLocationId}
        />
        <section
          aria-labelledby="document-first-review-title"
          className="signup-section"
          id="signup-document-review"
        >
          <div className="signup-section-header">
            <p className="eyebrow">Upload en controle</p>
            <h2 id="document-first-review-title">
              Controleer de documentgegevens
            </h2>
          </div>
          <DocumentFirstCheckMatrix
            chargers={presentation.chargers}
            locations={presentation.locations}
            onConfirm={confirmRow}
            onCorrect={correctRow}
            onReplaceDocument={replaceRowDocument}
          />
        </section>
      </>
    )
    : (
      <section
        aria-labelledby="document-first-signing-title"
        className="signup-section"
        id="signup-signing"
      >
        <div className="signup-section-header">
          <p className="eyebrow">Stap 3</p>
          <h2 id="document-first-signing-title">Ondertekenen</h2>
        </div>
        <DocumentFirstSigningSummary draft={draft} />
      </section>
    );

  const canContinue = activeStep === "account"
    ? completeness.account
    : activeStep === "documents"
    ? completeness.documents
    : false;

  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <main className="page-shell">
        <div className="container">
          <DocumentFirstSignupFlow
            activeStep={activeStep}
            maximumReachableStepIndex={maximumReachableStepIndex}
            onStepChange={changeActiveStep}
          >
            {activeStepContent}
            <SignupFlowNavigation
              activeStep={activeStep}
              canContinue={canContinue}
              onStepChange={changeActiveStep}
            />
          </DocumentFirstSignupFlow>
        </div>
      </main>
    </div>
  );
}
