import { useMemo, useRef, useState } from "react";
import { SignerPanel } from "../signup/signing/SignerPanel.tsx";
import type { SignerInput } from "../signup/signing/signatureMethod.ts";
import {
  isTypedNameOtpFullNameValid,
  normalizeTypedNameOtpFullName,
  typedNameOtpSignerNamesMatch,
} from "../signup/signing/methods/typedNameOtpV1.ts";
import type { DashboardAccountType } from "./dashboardTypes.ts";
import {
  CUSTOMER_CORRECTION_LEGAL_BUNDLE,
  type CustomerCorrectionChallengeReceipt,
  type CustomerCorrectionHandoffItem,
  type CustomerCorrectionReason,
  finalizeCustomerCorrection,
  requestCustomerCorrectionChallenge,
} from "./customerCorrectionHandoffClient.ts";
import {
  buildCustomerCorrectionWorkspace,
  createCustomerCorrectionDraft,
  CUSTOMER_CORRECTION_VALUE_MAX_LENGTH,
  customerCorrectionChallengeBindingKey,
  customerCorrectionCurrentValueText,
  normalizeCustomerCorrectionValue,
} from "./customerCorrectionWorkspace.ts";
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

function CorrectionItem(
  {
    correctedValue,
    index,
    item,
    sameAsCurrentValue,
    supported,
    onChange,
  }: {
    correctedValue: string;
    index: number;
    item: CustomerCorrectionHandoffItem;
    sameAsCurrentValue: boolean;
    supported: boolean;
    onChange: (value: string) => void;
  },
) {
  const currentValue = "currentValue" in item
    ? customerCorrectionCurrentValueText(item.currentValue)
    : "";
  return (
    <article className="portal-evidence-card">
      <h3>{item.documentLabel}</h3>
      <dl className="portal-info-rows">
        <div className="portal-info-row">
          <dt>Onderdeel</dt>
          <dd>{item.factLabel}</dd>
        </div>
        {item.responseRequirement === "VALUE_CORRECTION" && currentValue
          ? (
            <div className="portal-info-row">
              <dt>Huidige waarde</dt>
              <dd>{currentValue}</dd>
            </div>
          )
          : null}
        <div className="portal-info-row">
          <dt>Reden</dt>
          <dd>{customerCorrectionReasonLabel(item.correctionReason)}</dd>
        </div>
        <div className="portal-info-row">
          <dt>Toelichting</dt>
          <dd>{item.correctionInstruction}</dd>
        </div>
      </dl>
      {supported
        ? (
          <label className="field">
            <span>Nieuwe waarde</span>
            <input
              maxLength={CUSTOMER_CORRECTION_VALUE_MAX_LENGTH}
              onBlur={(event) =>
                onChange(normalizeCustomerCorrectionValue(event.target.value))}
              onChange={(event) => onChange(event.target.value)}
              type="text"
              value={correctedValue}
            />
            {sameAsCurrentValue
              ? (
                <small className="field-message" role="alert">
                  Vul een gewijzigde waarde in.
                </small>
              )
              : null}
          </label>
        )
        : null}
      <span className="sr-only">Aanpassing {index + 1}</span>
    </article>
  );
}

function ReadyCustomerCorrectionHandoffPanel({
  accessToken,
  accountType,
  state,
}: {
  accessToken: string;
  accountType: DashboardAccountType;
  state: Extract<CustomerCorrectionHandoffState, { status: "ready" }>;
}) {
  const handoff = state.model.handoff;
  if (!handoff) return null;
  const handoffItems = handoff.items;
  const signerAuthority = handoff.signerAuthority;
  const expectedSignerName = signerAuthority.status === "available"
    ? signerAuthority.expectedSignerDisplayName
    : "";

  const [draft, setDraft] = useState(() =>
    createCustomerCorrectionDraft(handoffItems)
  );
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
  const workspace = useMemo(
    () => buildCustomerCorrectionWorkspace(handoffItems, draft),
    [draft, handoffItems],
  );
  const normalizedFullName = normalizeTypedNameOtpFullName(
    signerInput.fullName,
  );
  const bindingKey = customerCorrectionChallengeBindingKey(
    workspace.responses,
    normalizedFullName,
    signerInput.intentAccepted,
  );
  const currentBindingRef = useRef(bindingKey);
  currentBindingRef.current = bindingKey;
  const signingReady = workspace.ready &&
    isTypedNameOtpFullNameValid(normalizedFullName) &&
    typedNameOtpSignerNamesMatch(normalizedFullName, expectedSignerName) &&
    signerInput.intentAccepted;
  const fullNameInvalid = Boolean(normalizedFullName) &&
    !typedNameOtpSignerNamesMatch(normalizedFullName, expectedSignerName);

  function invalidateChallenge(message = "Vraag een nieuwe code aan.") {
    if (!challenge) return;
    setChallenge(null);
    setOtp("");
    setRuntimeStatus("idle");
    setRuntimeMessage(message);
  }

  function updateDraft(itemRef: string, value: string) {
    invalidateChallenge();
    setRuntimeMessage("");
    setDraft((current) => Object.freeze({ ...current, [itemRef]: value }));
  }

  function updateSignerInput(value: SignerInput) {
    invalidateChallenge();
    setRuntimeMessage("");
    setSignerInput(value);
  }

  function recoverStaleHandoff() {
    setDraft(createCustomerCorrectionDraft(handoffItems));
    setChallenge(null);
    setOtp("");
    setSigningOpen(false);
    setRuntimeStatus("idle");
    setRuntimeMessage("Aanpassing is gewijzigd. Controleer opnieuw.");
    state.retryStale();
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
      setDraft(createCustomerCorrectionDraft(handoffItems));
      setChallenge(null);
      setOtp("");
      setSigningOpen(false);
      setRuntimeStatus("idle");
      setRuntimeMessage("");
      state.retry();
    } finally {
      finalizeRequestInFlightRef.current = false;
    }
  }

  return (
    <section
      className="portal-card-compact"
      aria-labelledby="customer-correction-handoff-title"
    >
      <h2 id="customer-correction-handoff-title">Aanpassing nodig</h2>
      <div className="portal-evidence-grid">
        {workspace.items.map((workspaceItem, index) => (
          <CorrectionItem
            correctedValue={workspaceItem.correctedValue}
            index={index}
            item={workspaceItem.item}
            key={workspaceItem.item.itemRef}
            onChange={(value) => updateDraft(workspaceItem.item.itemRef, value)}
            sameAsCurrentValue={workspaceItem.sameAsCurrentValue}
            supported={workspaceItem.supported}
          />
        ))}
      </div>

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

      {!signingOpen
        ? (
          <div className="section-actions">
            <button
              className="button button-primary"
              disabled={!workspace.ready ||
                signerAuthority.status !== "available"}
              onClick={() => {
                setSigningOpen(true);
                setRuntimeMessage("");
              }}
              type="button"
            >
              Wijzigingen indienen
            </button>
          </div>
        )
        : (
          <div className="signing-primary-action-boundary" aria-live="polite">
            <p>
              <strong>{CUSTOMER_CORRECTION_LEGAL_BUNDLE.title}</strong>
            </p>
            <SignerPanel
              expectedSignerDisplayName={
                signerAuthority.status === "available"
                  ? signerAuthority.expectedSignerDisplayName
                  : undefined
              }
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
        )}
    </section>
  );
}

export function CustomerCorrectionHandoffPanel(
  {
    accessToken,
    accountType,
    state,
  }: {
    accessToken: string | null;
    accountType: DashboardAccountType;
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
      key={`${state.model.caseRef}:${
        state.model.handoff.items.map((item) => item.itemRef).join(":")
      }`}
      state={state}
    />
  );
}
