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
import { useAuth } from "../auth/AuthProvider";
import { clearDashboardReadCache } from "../dashboard/dashboardReadCache";
import { parseInvoicePdfInput } from "../invoice-analysis/invoicePdfParserAdapter";
import { DocumentFirstCheckMatrix } from "./DocumentFirstCheckMatrix";
import { DocumentFirstDocumentsStep } from "./DocumentFirstDocumentsStep";
import {
  createSigningCustomerState,
  DocumentFirstSigningSummary,
  type SigningCustomerState,
} from "./DocumentFirstSigningSummary";
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
import {
  clearSignupSubmissionReceipt,
  readSignupSubmissionReceipt,
  type SignupSubmissionReceipt,
  writeSignupSubmissionReceipt,
} from "./signupSubmissionReceiptStore";
import type { AccountDocumentDraft, PersonalInfoDraft } from "./signupTypes";
import {
  clearSignupIntakeSession,
  readSignupIntakeSession,
} from "./signupIntakeCapabilityStore";
import { readSignupSigningStatus } from "./signupSigningClient";
import {
  removeSignupDocument,
  uploadSignupDocument,
} from "./signupQuarantineUploadClient";

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
  const auth = useAuth();
  const [draft, dispatch] = useReducer(
    documentFirstSignupReducer,
    "particulier",
    createFreshDocumentFirstSignupDraft,
  );
  const [signingCustomerState, setSigningCustomerState] = useState<
    SigningCustomerState
  >(() => createSigningCustomerState(draft.accountBasis.accountType));
  const [activeStep, setActiveStep] = useState<DocumentFirstStepId>("account");
  const [submissionReceipt, setSubmissionReceipt] = useState<
    SignupSubmissionReceipt | null
  >(null);
  const [signupLocked, setSignupLocked] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<
    "loading" | "ready" | "error"
  >(() =>
    readSignupIntakeSession() || readSignupSubmissionReceipt()
      ? "loading"
      : "ready"
  );
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [activeLocationId, setActiveLocationId] = useState(
    draft.locationOrder[0],
  );
  const draftGenerationRef = useRef(0);
  const organizationAttemptsRef = useRef(0);
  const organizationAbortRef = useRef<AbortController | null>(null);
  const recoveryBootstrapStartedRef = useRef(false);
  const dashboardHandoffStartedRef = useRef(false);
  const signingCustomerDraftRef = useRef(draft);
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
  const verifiedAccountEmail = useMemo(() => {
    const user = auth.session?.user;
    if (!user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
      return "";
    }
    return user.email.trim().toLowerCase();
  }, [auth.session]);
  const changeActiveStep = useCallback(
    (step: DocumentFirstStepId) => transitionSignupStep(step, setActiveStep),
    [],
  );

  const hydrateSigningState = useCallback(async () => {
    const session = readSignupIntakeSession();
    const cachedReceipt = readSignupSubmissionReceipt();
    if (!session) {
      if (cachedReceipt) {
        setSignupLocked(true);
        setSubmissionReceipt(cachedReceipt);
        setRecoveryStatus("ready");
      } else {
        setSignupLocked(false);
        setRecoveryStatus("ready");
      }
      return;
    }

    setSignupLocked(true);
    setRecoveryMessage("");
    setRecoveryStatus("loading");
    const result = await readSignupSigningStatus();
    if (!result.ok) {
      setRecoveryMessage(result.message);
      setRecoveryStatus("error");
      return;
    }
    if (result.value.signingState === "collecting") {
      clearSignupSubmissionReceipt();
      setSubmissionReceipt(null);
      setSignupLocked(false);
      setRecoveryStatus("ready");
      return;
    }

    const receipt = writeSignupSubmissionReceipt({
      safeReference: result.value.safeReference,
      status: result.value.intakeStatus,
      promotionState: result.value.promotionState,
      accountHandoff: result.value.accountHandoff,
    });
    if (!receipt) {
      setRecoveryMessage("Deze aanmelding kan niet veilig worden hersteld.");
      setRecoveryStatus("error");
      return;
    }
    setSubmissionReceipt(receipt);
    setSignupLocked(true);
    setRecoveryStatus("ready");
  }, []);

  useEffect(() => {
    if (recoveryBootstrapStartedRef.current) return;
    recoveryBootstrapStartedRef.current = true;
    void hydrateSigningState();
  }, [hydrateSigningState]);

  useEffect(() => {
    if (
      submissionReceipt?.promotionState !== "promoted" ||
      submissionReceipt.accountHandoff !== "already_authenticated"
    ) return;
    const authUserId = auth.session?.user.id;
    if (!authUserId || dashboardHandoffStartedRef.current) return;
    dashboardHandoffStartedRef.current = true;
    let active = true;
    clearDashboardReadCache(authUserId);
    void auth.retryBootstrap().then((result) => {
      if (!active) return;
      if (!result.ok || result.status !== "ready") {
        dashboardHandoffStartedRef.current = false;
        setRecoveryMessage("Het klantportaal kon niet worden vernieuwd.");
        setRecoveryStatus("error");
        return;
      }
      clearSignupIntakeSession();
      clearSignupSubmissionReceipt();
      navigate("/dashboard");
    });
    return () => {
      active = false;
    };
  }, [auth.retryBootstrap, auth.session?.user.id, navigate, submissionReceipt]);

  useEffect(() => {
    if (!draft.locationOrder.includes(activeLocationId)) {
      setActiveLocationId(draft.locationOrder[0]);
    }
  }, [activeLocationId, draft.locationOrder]);

  useEffect(() => {
    if (signingCustomerDraftRef.current === draft) return;
    signingCustomerDraftRef.current = draft;
    setSigningCustomerState(
      createSigningCustomerState(draft.accountBasis.accountType),
    );
  }, [draft]);

  useEffect(() => {
    if (!verifiedAccountEmail) return;
    const intakeSession = readSignupIntakeSession();
    if (intakeSession && intakeSession.email !== verifiedAccountEmail) {
      clearSignupIntakeSession();
      clearSignupSubmissionReceipt();
      setSubmissionReceipt(null);
      setSignupLocked(false);
    }
    if (draft.accountBasis.email === verifiedAccountEmail) return;
    dispatch({
      type: "update_account_basis",
      value: {
        accountType: draft.accountBasis.accountType,
        email: verifiedAccountEmail,
      },
    });
  }, [
    draft.accountBasis.accountType,
    draft.accountBasis.email,
    verifiedAccountEmail,
  ]);

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
    organizationAbortRef.current?.abort();
    clearSignupIntakeSession();
    dispatch({ type: "replace_draft", value: fresh });
    setActiveLocationId(fresh.locationOrder[0]);
    changeActiveStep("account");
  };

  const handleOrganizationDocument = async (
    document: AccountDocumentDraft,
  ) => {
    const generation = draftGenerationRef.current;
    organizationAbortRef.current?.abort();
    const controller = new AbortController();
    organizationAbortRef.current = controller;
    const attempt = organizationAttemptsRef.current + 1;
    organizationAttemptsRef.current = attempt;
    const reset: AccountDocumentDraft = {
      ...document,
      parseStatus: document.file ? "parsing" : "idle",
    };
    dispatch({ type: "update_organization_document", document: reset });
    if (!document.file) {
      void removeSignupDocument({
        accountType: draft.accountBasis.accountType,
        email: draft.accountBasis.email,
        clientSlotId: document.clientId,
        signal: controller.signal,
      });
      return;
    }

    const result = await parseInvoicePdfInput(document.file);
    if (
      organizationAttemptsRef.current !== attempt ||
      !isDraftGenerationCurrent(generation)
    ) return;
    const parsed: AccountDocumentDraft = {
      ...reset,
      parseStatus: result.ok ? "parsed" : "error",
    };
    dispatch({
      type: "update_organization_document",
      document: parsed,
    });
    if (result.ok) {
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
    }
    const uploading: AccountDocumentDraft = {
      ...parsed,
      quarantineStatus: "uploading",
      quarantineFileReference: null,
      quarantineRevision: null,
    };
    dispatch({ type: "update_organization_document", document: uploading });
    const upload = await uploadSignupDocument({
      accountType: draft.accountBasis.accountType,
      email: draft.accountBasis.email,
      clientSlotId: document.clientId,
      documentType: document.documentType,
      file: document.file,
      signal: controller.signal,
    });
    if (
      organizationAttemptsRef.current !== attempt ||
      !isDraftGenerationCurrent(generation) || (!upload.ok && upload.aborted)
    ) return;
    dispatch({
      type: "update_organization_document",
      document: upload.ok
        ? {
          ...uploading,
          quarantineStatus: "confirmed_quarantine",
          quarantineFileReference: upload.receipt.fileReference,
          quarantineRevision: upload.receipt.revisionNumber,
        }
        : { ...uploading, quarantineStatus: "error" },
    });
  };

  const updateAccount = (next: PersonalInfoDraft) => {
    const authoritativeNext = verifiedAccountEmail
      ? { ...next, email: verifiedAccountEmail }
      : next;
    if (authoritativeNext.accountType !== draft.accountBasis.accountType) {
      const confirmationRequired = hasMeaningfulSignupDraft(legacyDraft) ||
        Object.keys(draft.customerConfirmations).length > 0 ||
        Object.keys(draft.manualCorrections).length > 0;
      if (confirmationRequired && !confirmSignupAccountTypeReset()) return;
      const transition = transitionSignupAccountType(
        legacyDraft,
        authoritativeNext.accountType,
        true,
      );
      if (transition.changed) {
        replaceWithFreshDraft(
          createDocumentFirstSignupDraftFromLegacy(transition.draft),
        );
      }
      return;
    }
    if (
      authoritativeNext.email.trim().toLowerCase() !==
        draft.accountBasis.email.trim().toLowerCase()
    ) {
      draftGenerationRef.current += 1;
      organizationAttemptsRef.current += 1;
      organizationAbortRef.current?.abort();
      clearSignupIntakeSession();
      dispatch({ type: "invalidate_quarantine_receipts" });
    }
    dispatch({
      type: "update_account_basis",
      value: {
        accountType: authoritativeNext.accountType,
        email: authoritativeNext.email,
      },
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
        void removeSignupDocument({
          accountType: draft.accountBasis.accountType,
          email: draft.accountBasis.email,
          clientSlotId: document.clientId,
        });
        dispatch({
          type: "update_charger_document",
          document: {
            ...document,
            file: null,
            status: "empty",
            quarantineStatus: "idle",
            quarantineFileReference: null,
            quarantineRevision: null,
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
    void removeSignupDocument({
      accountType: draft.accountBasis.accountType,
      email: draft.accountBasis.email,
      clientSlotId: document.clientId,
    });
    dispatch({
      type: "update_energy_document",
      document: {
        ...document,
        file: null,
        status: "empty",
        quarantineStatus: "idle",
        quarantineFileReference: null,
        quarantineRevision: null,
      },
    });
  };

  const activeStepContent = activeStep === "account"
    ? (
      <>
        <PersonalInfoSection
          authoritativeEmail={verifiedAccountEmail || null}
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
        <DocumentFirstSigningSummary
          customerState={signingCustomerState}
          draft={draft}
          intakeSessionAvailable={Boolean(readSignupIntakeSession())}
          onCustomerStateChange={setSigningCustomerState}
          onFinalized={(receipt) => {
            setSignupLocked(true);
            setSubmissionReceipt(receipt);
          }}
        />
      </section>
    );

  const canContinue = activeStep === "account"
    ? completeness.account
    : activeStep === "documents"
    ? completeness.documents
    : false;

  if (recoveryStatus === "loading" || recoveryStatus === "error") {
    return (
      <div className="site-frame">
        <AppHeader currentPath={currentPath} navigate={navigate} />
        <main className="page-shell">
          <section className="section">
            <div className="container">
              <div
                className="review-panel"
                role={recoveryStatus === "loading" ? "status" : "alert"}
              >
                <h2>
                  {recoveryStatus === "loading"
                    ? "Aanmelding laden"
                    : "Aanmelding niet beschikbaar"}
                </h2>
                <p>
                  {recoveryStatus === "loading"
                    ? "Je aanmelding wordt veilig opgehaald."
                    : recoveryMessage}
                </p>
                {recoveryStatus === "error"
                  ? (
                    <div className="section-actions">
                      <button
                        className="button button-secondary"
                        onClick={() => void hydrateSigningState()}
                        type="button"
                      >
                        Opnieuw proberen
                      </button>
                    </div>
                  )
                  : null}
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (submissionReceipt) {
    return (
      <div className="site-frame">
        <AppHeader currentPath={currentPath} navigate={navigate} />
        <main className="page-shell">
          <div className="container">
            <section
              aria-labelledby="signup-submission-receipt-title"
              className="signup-section"
            >
              <article className="signing-document">
                <header className="signing-document__header">
                  <h2 id="signup-submission-receipt-title">
                    Indieningsbevestiging
                  </h2>
                  <p className="status-message status-message-success">
                    Je dossier is ondertekend en ingediend.
                  </p>
                  <p>
                    Referentie:{" "}
                    <strong>{submissionReceipt.safeReference}</strong>
                  </p>
                  {submissionReceipt.promotionState === "pending"
                    ? <p role="status">Je dossier wordt verwerkt.</p>
                    : null}
                  {submissionReceipt.promotionState === "blocked"
                    ? (
                      <p role="alert">
                        De verwerking vraagt aandacht. Je ondertekening blijft
                        geldig.
                      </p>
                    )
                    : null}
                  {submissionReceipt.accountHandoff === "blocked"
                    ? (
                      <p role="alert">
                        We kunnen de accountkoppeling niet automatisch afronden.
                      </p>
                    )
                    : null}
                  <div className="section-actions">
                    {submissionReceipt.promotionState === "promoted" &&
                        submissionReceipt.accountHandoff ===
                          "existing_account_login_required"
                      ? (
                        <button
                          className="button button-primary"
                          onClick={() => navigate("/account#inloggen")}
                          type="button"
                        >
                          Inloggen naar klantportaal
                        </button>
                      )
                      : submissionReceipt.promotionState === "promoted" &&
                          submissionReceipt.accountHandoff ===
                            "account_activation_available"
                      ? (
                        <button
                          className="button button-primary"
                          onClick={() => navigate("/account#activeren")}
                          type="button"
                        >
                          Account aanmaken
                        </button>
                      )
                      : submissionReceipt.promotionState === "promoted" &&
                          submissionReceipt.accountHandoff ===
                            "already_authenticated"
                      ? (
                        <button
                          className="button button-primary"
                          onClick={() => navigate("/dashboard")}
                          type="button"
                        >
                          Naar klantportaal
                        </button>
                      )
                      : submissionReceipt.promotionState === "pending" &&
                          submissionReceipt.accountHandoff !== "blocked" &&
                          readSignupIntakeSession()
                      ? (
                        <button
                          className="button button-secondary"
                          onClick={() => void hydrateSigningState()}
                          type="button"
                        >
                          Status opnieuw ophalen
                        </button>
                      )
                      : null}
                  </div>
                </header>
              </article>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="site-frame">
      <AppHeader currentPath={currentPath} navigate={navigate} />
      <main className="page-shell">
        <div className="container">
          <fieldset className="signup-lock-boundary" disabled={signupLocked}>
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
          </fieldset>
        </div>
      </main>
    </div>
  );
}
