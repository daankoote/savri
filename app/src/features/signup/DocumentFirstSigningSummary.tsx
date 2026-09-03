import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentFirstSignupDraft } from "./documentFirstSignupModel";
import { selectSigningFileReadiness } from "./documentFirstSignupSelectors";
import { FactTable } from "./presentation/FactTable";
import { selectUnifiedFactPresentation } from "./presentation/factPresentationModel";
import { createBrowserHtmlLegalBundleV1 } from "./signing/browserHtmlLegalBundleV1";
import { createLegalBundleDocument } from "./signing/legalBundleDocument";
import {
  createReceiptBoundLegalDocuments,
  EMPTY_LEGAL_ACTION_STATE,
  type LegalActionState,
  type LegalDocumentMetadata,
} from "./signing/legalDocumentRegistry";
import { MandateDocument } from "./signing/MandateDocument";
import { getMandateYearOptions } from "./signing/mandateDocumentModel";
import { SignerPanel } from "./signing/SignerPanel";
import { SigningLegalBundle } from "./signing/SigningLegalBundle";
import { SigningEntityGroup } from "./signing/SigningEntityGroup";
import type { SignerInput } from "./signing/signatureMethod";
import {
  createCanonicalSigningSourceRegistry,
} from "./signing/canonicalSigningFacts";
import {
  createSigningIntent,
  selectSigningStartReadiness,
  signingStartReadinessMessage,
} from "./signing/signingIntent";
import { getActiveSignupSignatureMethod } from "./signing/signupSigningComposition";
import {
  finalizeSignupSigning,
  requestSignupSigningChallenge,
  requestSignupSigningPresentation,
  type SigningChallengeReceipt,
  type SigningPresentationReceipt,
} from "./signupSigningClient";
import {
  type SignupSubmissionReceipt,
  writeSignupSubmissionReceipt,
} from "./signupSubmissionReceiptStore";

export type SigningCustomerState = {
  summaryConfirmed: boolean;
  mandateYear: number | null;
  legalActions: LegalActionState;
  signerInput: SignerInput;
};

export function createSigningCustomerState(
  accountType: DocumentFirstSignupDraft["accountBasis"]["accountType"],
): SigningCustomerState {
  return {
    summaryConfirmed: false,
    mandateYear: null,
    legalActions: EMPTY_LEGAL_ACTION_STATE,
    signerInput: {
      accountType,
      fullName: "",
      role: "",
      intentAccepted: false,
    },
  };
}

export function DocumentFirstSigningSummary(
  {
    customerState,
    draft,
    intakeSessionAvailable,
    onCustomerStateChange,
    onFinalized,
  }: {
    customerState: SigningCustomerState;
    draft: DocumentFirstSignupDraft;
    intakeSessionAvailable: boolean;
    onCustomerStateChange: (state: SigningCustomerState) => void;
    onFinalized: (receipt: SignupSubmissionReceipt) => void;
  },
) {
  const { legalActions, mandateYear, signerInput, summaryConfirmed } =
    customerState;
  const presentation = selectUnifiedFactPresentation(draft);
  const method = getActiveSignupSignatureMethod();
  const exporter = useMemo(() => createBrowserHtmlLegalBundleV1(), []);
  const yearOptions = getMandateYearOptions();
  const [challenge, setChallenge] = useState<SigningChallengeReceipt | null>(
    null,
  );
  const [serverPresentation, setServerPresentation] = useState<
    {
      receipt: SigningPresentationReceipt;
      legalDocuments: readonly LegalDocumentMetadata[];
    } | null
  >(null);
  const [presentationStatus, setPresentationStatus] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [presentationMessage, setPresentationMessage] = useState("");
  const [presentationAttempt, setPresentationAttempt] = useState(0);
  const [otpCode, setOtpCode] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<
    "idle" | "requesting" | "awaiting_otp" | "finalizing" | "success" | "error"
  >("idle");
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const challengeRequestInFlightRef = useRef(false);
  useEffect(() => {
    let active = true;
    if (!intakeSessionAvailable) {
      setPresentationStatus("error");
      setPresentationMessage(
        "De veilige aanmeldsessie is niet beschikbaar.",
      );
      setServerPresentation(null);
      return () => {
        active = false;
      };
    }
    setPresentationStatus("loading");
    setPresentationMessage("");
    setServerPresentation(null);
    void requestSignupSigningPresentation().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setPresentationStatus("error");
        setPresentationMessage(result.message);
        return;
      }
      const legalDocuments = createReceiptBoundLegalDocuments(
        result.value.receiptReference,
        result.value.legalDocuments,
      );
      if (!legalDocuments) {
        setPresentationStatus("error");
        setPresentationMessage(
          "De juridische documenten konden niet veilig worden geladen.",
        );
        return;
      }
      setServerPresentation({ receipt: result.value, legalDocuments });
      setPresentationStatus("loaded");
    });
    return () => {
      active = false;
    };
  }, [intakeSessionAvailable, presentationAttempt]);
  const legalDocuments = serverPresentation?.legalDocuments ?? [];
  const effectiveLegalActions = useMemo(() => ({
    ...legalActions,
    mandateSigned: signerInput.intentAccepted,
  }), [legalActions, signerInput.intentAccepted]);
  const signingIntent = useMemo(() =>
    createSigningIntent({
      accountType: draft.accountBasis.accountType,
      presentation,
      signingSourceRegistry: createCanonicalSigningSourceRegistry(draft),
      signerInput,
      summaryConfirmed,
      selectedMethod: method,
      legalDocuments,
      legalActions: effectiveLegalActions,
      mandateYear,
      evidence: null,
    }), [
    draft,
    effectiveLegalActions,
    legalDocuments,
    mandateYear,
    method,
    presentation,
    signerInput,
    summaryConfirmed,
  ]);
  const legalBundle = useMemo(
    () =>
      signingIntent.mandate
        ? createLegalBundleDocument({
          documents: legalDocuments,
          mandate: signingIntent.mandate,
        })
        : null,
    [legalDocuments, signingIntent.mandate],
  );
  const documentRows = presentation.documents.rows.map((row) => {
    const binding = row.sources[0]?.binding;
    return {
      ...row,
      label: binding ? `${row.label} · ${binding}` : row.label,
    };
  });
  const signingFileReadiness = useMemo(
    () => selectSigningFileReadiness(draft),
    [draft],
  );
  const requiredFileReferences = signingFileReadiness.fileReferences;
  const signingStartReadiness = useMemo(() =>
    selectSigningStartReadiness({
      intentReadiness: signingIntent.readiness,
      requiredUploadsConfirmed: signingFileReadiness.ready,
      intakeSessionAvailable,
    }), [
    intakeSessionAvailable,
    signingFileReadiness.ready,
    signingIntent.readiness,
  ]);
  const readinessMessage = signingStartReadiness.reasons[0]
    ? signingStartReadinessMessage(signingStartReadiness.reasons[0])
    : "";

  const requestChallenge = async () => {
    if (challengeRequestInFlightRef.current) return;
    challengeRequestInFlightRef.current = true;
    setRuntimeStatus("requesting");
    setRuntimeMessage("");
    try {
      if (!serverPresentation) {
        setRuntimeStatus("error");
        setRuntimeMessage(
          "De juridische documenten konden niet veilig worden geladen.",
        );
        return;
      }
      const result = await requestSignupSigningChallenge({
        presentation: serverPresentation.receipt,
        legalActions: effectiveLegalActions,
      });
      if (!result.ok) {
        setRuntimeStatus("error");
        setRuntimeMessage(result.message);
        return;
      }
      setChallenge(result.value);
      setRuntimeStatus("awaiting_otp");
      setRuntimeMessage(
        `Code verzonden naar ${result.value.deliveryTargetMasked}.`,
      );
    } finally {
      challengeRequestInFlightRef.current = false;
    }
  };

  const finalizeSigning = async () => {
    if (!challenge || !mandateYear || !/^\d{6}$/.test(otpCode)) return;
    setRuntimeStatus("finalizing");
    setRuntimeMessage("");
    const result = await finalizeSignupSigning({
      challengeReference: challenge.challengeReference,
      otpCode,
      accountType: draft.accountBasis.accountType,
      typedFullName: signerInput.fullName,
      signerRole: signerInput.role,
      mandateYear,
      canonicalFacts: signingIntent.canonicalFacts.facts,
      requiredFileReferences,
    });
    if (!result.ok) {
      setRuntimeStatus("error");
      setRuntimeMessage(result.message);
      return;
    }
    setRuntimeStatus("success");
    setRuntimeMessage(
      `Je dossier is ondertekend en ingediend. Referentie: ${result.value.safeReference}`,
    );
    const receipt = writeSignupSubmissionReceipt(result.value);
    if (receipt) onFinalized(receipt);
  };

  return (
    <article className="signing-document">
      <section className="signing-kiss-section" id="signup-summary">
        <header className="signing-document__header">
          <h3>Samenvatting</h3>
          <p>
            Controleer hieronder de gegevens die uit uw invoer en documenten
            zijn samengebracht.
          </p>
        </header>
        <div className="signing-document__subsection">
          <h4>Account</h4>
          <FactTable
            columns={{ judgment: null, sources: null }}
            rows={presentation.account.rows}
            variant="document"
          />
        </div>
        {presentation.locations.map((location, locationIndex) => (
          <SigningEntityGroup
            chargers={presentation.chargers.filter((charger) =>
              charger.locationId === location.locationId
            )}
            groupTitle={location.title}
            key={location.id}
            location={location}
            locationTitle={`Locatie ${locationIndex + 1}`}
          />
        ))}
        <div className="signing-document__subsection">
          <h4>{presentation.documents.title}</h4>
          <FactTable
            columns={{
              judgment: null,
              label: "Documentsoort",
              sources: null,
              value: "Bestandsnaam",
            }}
            rows={documentRows}
            variant="document"
          />
        </div>
        <label className="consent-check-item">
          <input
            checked={summaryConfirmed}
            onChange={(event) =>
              onCustomerStateChange({
                ...customerState,
                summaryConfirmed: event.currentTarget.checked,
              })}
            type="checkbox"
          />
          <span>
            Ik bevestig dat de bovenstaande gegevens juist en volledig zijn.
          </span>
        </label>
      </section>
      {presentationStatus === "loading"
        ? (
          <p className="status-message" role="status">
            Juridische documenten laden…
          </p>
        )
        : null}
      {presentationStatus === "error"
        ? (
          <div aria-live="polite">
            <p className="status-message">{presentationMessage}</p>
            <button
              className="button button-secondary"
              onClick={() => setPresentationAttempt((attempt) => attempt + 1)}
              type="button"
            >
              Opnieuw proberen
            </button>
          </div>
        )
        : null}
      {serverPresentation && signingIntent.mandate && legalBundle
        ? (
          <div className="signing-blocks">
            <MandateDocument
              model={signingIntent.mandate}
              onPreviewDocuments={() => exporter.preview(legalBundle)}
              onYearChange={(year) =>
                onCustomerStateChange({
                  ...customerState,
                  mandateYear: year,
                })}
              selectedYear={mandateYear}
              yearOptions={yearOptions}
            />
            <SigningLegalBundle
              actions={legalActions}
              bundle={legalBundle}
              exporter={exporter}
              onChange={(actions) =>
                onCustomerStateChange({
                  ...customerState,
                  legalActions: actions,
                })}
            />
            <SignerPanel
              onChange={(input) =>
                onCustomerStateChange({
                  ...customerState,
                  signerInput: input,
                })}
              organizationName={signingIntent.mandate.mandatingParty
                .organizationName}
              value={signerInput}
            />
          </div>
        )
        : null}
      <section className="signing-primary-action-boundary" aria-live="polite">
        {runtimeStatus === "success"
          ? (
            <p className="status-message status-message-success">
              {runtimeMessage}
            </p>
          )
          : (
            <>
              {!challenge
                ? (
                  <button
                    className="button button-primary"
                    disabled={!signingStartReadiness.ready ||
                      presentationStatus !== "loaded" ||
                      runtimeStatus === "requesting"}
                    onClick={() => void requestChallenge()}
                    type="button"
                  >
                    {runtimeStatus === "requesting"
                      ? "Code verzenden…"
                      : "Ondertekenen en indienen"}
                  </button>
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
                          setOtpCode(
                            event.target.value.replace(/\D/g, "").slice(0, 6),
                          )}
                        value={otpCode}
                      />
                    </label>
                    <div className="field-actions">
                      <button
                        className="button button-primary"
                        disabled={!/^\d{6}$/.test(otpCode) ||
                          runtimeStatus === "finalizing"}
                        onClick={() => void finalizeSigning()}
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
              {!challenge && readinessMessage
                ? (
                  <p className="status-message">
                    {readinessMessage}
                  </p>
                )
                : null}
            </>
          )}
      </section>
    </article>
  );
}
